import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { api, resources, LONG_TIMEOUT } from "../lib/api.js";
import {
  Card, Button, Input, Modal, I, Tag, AiBadge, toast, Empty, LoadingBlock, LiquidLoader, StatusPill,
} from "../components/Primitives.jsx";

const SOURCE_PLACEHOLDER = "如 xxx 推荐、英国猎头、罗卡等(≤500 字符,可选)";
const DAY_MS = 24 * 60 * 60 * 1000;
function fmtExpiresLabel(expiresAt) {
  if (!expiresAt) return "无限期";
  const days = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / DAY_MS));
  return `${days} 天后失效`;
}

// 简历卡片显示完整时间 yyyy-MM-dd HH:mm:ss(招聘官需要精确知道每份简历的上传时刻)
function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function fmtSource(s) {
  const trimmed = (s || "").trim();
  return trimmed || "未提供";
}

// 本次已入库列表用 sessionStorage 持久化(切页/刷新都保留,关 tab 自动清,tab 间隔离防多用户串数据)
const PARSED_SS_KEY = "mesa.upload.parsed.v1";
const PARSED_MAX = 20;
function loadParsedFromSession() {
  try {
    const raw = sessionStorage.getItem(PARSED_SS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, PARSED_MAX) : [];
  } catch { return []; }
}

// 重新解析任务(reparsing)也持久化:切页/刷新后仍能显示"解析中"+继续轮询
// key 形如 { [candidateId]: { taskId: string, startedAt: number } }
// parseTaskStore TTL 1 小时,5 分钟外的任务我们当超时不再轮询
const REPARSING_SS_KEY = "mesa.upload.reparsing.v1";
const REPARSE_TTL_MS = 5 * 60 * 1000;
function loadReparsingFromSession() {
  try {
    const raw = sessionStorage.getItem(REPARSING_SS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return {};
    const now = Date.now();
    const fresh = {};
    for (const [cid, info] of Object.entries(obj)) {
      if (info && info.taskId && now - (info.startedAt || 0) < REPARSE_TTL_MS) fresh[cid] = info;
    }
    return fresh;
  } catch { return {}; }
}
function saveReparsingToSession(map) {
  try { sessionStorage.setItem(REPARSING_SS_KEY, JSON.stringify(map)); } catch {}
}
const NEW_JOB_DEFAULT = { title: "", description: "", responsibilities: [], requirements: [], nice: [], benefits: [], employment: null, salary: null, levelRange: null, yearsExpRange: null, educationRequirement: null, languageRequirement: null };

// 简历收件箱 · 真实流程
// 1) 前端拿到文件 → POST /api/storage/presigned-url 拿短时效 PUT URL
// 2) 浏览器 PUT 文件流到 R2(零后端流量)
// 3) POST /api/storage/confirm 让后端关联 key
// 4) POST /api/resumes/parse {key} → 后端从 R2 拉文件 → Kimi files API → JSON
// 5) 用解析结果 POST /api/candidates 创建候选人
//
// 任一环节失败:
//   - R2 未配置(503) → 自动降级为「只入库元数据 + 仅文件名」,候选人仍可创建
//   - Kimi 未配置(503) → 同上,Kimi 报错前端 toast 提示但已入库的不删

export default function Upload() {
  const [files, setFiles] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(loadParsedFromSession);
  const [llmStatus, setLlmStatus] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");  // 空字符串 = 不关联 JD
  const [source, setSource] = useState("");                // 来源,可选,提交时覆盖候选人默认 "自动上传"
  // 新建 JD 弹窗
  const [showNewJob, setShowNewJob] = useState(false);
  const [newJob, setNewJob] = useState(NEW_JOB_DEFAULT);
  const [newJobFile, setNewJobFile] = useState(null);      // 用户选的 JD 文件(可选,选了则上传 R2 + AI 解析)
  const [newJobParsing, setNewJobParsing] = useState(false); // AI 正在解析 JD 文件
  const [newJobSaving, setNewJobSaving] = useState(false);   // POST /jobs 落库中

  // 上传链接 / 二维码(更多上传方式)
  const [uploadLinks, setUploadLinks] = useState([]);
  const [linksLoading, setLinksLoading] = useState(true);
  const [creatingLink, setCreatingLink] = useState(false);
  const qrRef = useRef(null);  // 用于保存二维码图片

  // 列表批量操作 — 候选人多选 + 关联 JD / 部门 / 解析
  const [departments, setDepartments] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkAssigning, setBulkAssigning] = useState(false);     // 批量改 JD/部门 loading
  // reparsing 状态持久化在 sessionStorage,初始 mount 时从存储恢复 → 切页/刷新仍显示"解析中"
  // 形状:{ [candidateId]: { taskId, startedAt } }
  const [reparsingMap, setReparsingMap] = useState(loadReparsingFromSession);
  const reparsingIds = new Set(Object.keys(reparsingMap));  // 给 UI 用的 set 视图

  // 拉当前用户最近的候选人(含本地手动上传 + 公开链接收到的)
  // remote 优先,失败时保留 sessionStorage 兜底
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  async function refetchOwned(silent = false) {
    if (!silent) setRefreshing(true);
    try {
      const { data } = await api.get("/candidates", {
        params: { ownerId: "me", orderBy: "createdAt", take: PARSED_MAX },
      });
      setParsed(data.items || []);
    } catch (e) {
      if (!silent) toast(e.response?.data?.message || "刷新失败,请稍后再试", "error");
    } finally {
      setInitialLoaded(true);
      if (!silent) setRefreshing(false);
    }
  }

  useEffect(() => {
    api.get("/resumes/llm-status").then((r) => setLlmStatus(r.data)).catch(() => setLlmStatus({ configured: false }));
    resources.jobs.list({ take: 200 }).then((d) => setJobs(d.items || [])).catch(() => setJobs([]));
    api.get("/upload-links")
      .then((r) => setUploadLinks(r.data.links || []))
      .catch(() => setUploadLinks([]))
      .finally(() => setLinksLoading(false));
    // mount 时拉一次远程(silent=true 不显示 loading,sessionStorage 已经秒级显示了)
    refetchOwned(true);
    // 部门列表给"批量关联部门"下拉用(api.js resources.departments.list 不接 params,直接 api.get)
    api.get("/departments", { params: { take: 200 } }).then((r) => setDepartments(r.data.items || [])).catch(() => setDepartments([]));
  }, []);

  // parsed 改动同步写回 sessionStorage(切页/刷新后恢复)
  useEffect(() => {
    try {
      const trimmed = parsed.slice(0, PARSED_MAX);
      sessionStorage.setItem(PARSED_SS_KEY, JSON.stringify(trimmed));
    } catch { /* sessionStorage full / disabled,忽略 */ }
  }, [parsed]);

  // reparsingMap 改动同步写回 sessionStorage
  useEffect(() => { saveReparsingToSession(reparsingMap); }, [reparsingMap]);

  // mount 时对每个已持久化的 reparsing 任务启动轮询(切页/刷新后继续等结果)
  useEffect(() => {
    for (const [candidateId, info] of Object.entries(reparsingMap)) {
      pollReparseTask(candidateId, info.taskId, info.startedAt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // 只在 mount 跑一次

  // ─── 批量操作 helpers ────────────────────────────────────
  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  const allSelected = parsed.length > 0 && parsed.every((c) => selectedIds.has(c.id));
  function toggleSelectAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(parsed.map((c) => c.id)));
  }

  // 单条关联 JD / 部门:直接 PATCH 一个 candidate,失败 toast,成功 refetch
  // patch 字段:jobId 或 departmentId(null = 清除关联)
  async function onSingleAssign(id, patch) {
    const actualPatch = { ...patch };
    if ("jobId" in actualPatch) {
      const job = actualPatch.jobId ? jobs.find((j) => j.id === actualPatch.jobId) : null;
      actualPatch.appliedFor = job?.title || null;
    }
    try {
      await api.patch(`/candidates/${id}`, actualPatch);
      toast("关联已更新", "success");
      await refetchOwned(true);
    } catch (e) {
      toast(e.response?.data?.message || "关联失败", "error");
    }
  }

  // 批量关联 JD / 部门:对每个选中 candidate 调 PATCH(并行)
  async function onBulkAssign({ jobId, departmentId }) {
    if (selectedIds.size === 0) return;
    setBulkAssigning(true);
    const ids = Array.from(selectedIds);
    const job = jobId ? jobs.find((j) => j.id === jobId) : null;
    const dept = departmentId ? departments.find((d) => d.id === departmentId) : null;
    const patch = {};
    if (jobId !== undefined) {
      patch.jobId = jobId || null;
      patch.appliedFor = job?.title || null;
    }
    if (departmentId !== undefined) {
      patch.departmentId = departmentId || null;
    }
    try {
      await Promise.all(ids.map((id) => api.patch(`/candidates/${id}`, patch)));
      const targetLabel = job ? `岗位「${job.title}」` : dept ? `部门「${dept.name}」` : "已清除关联";
      toast(`${ids.length} 份简历已关联到 ${targetLabel}`, "success");
      await refetchOwned(true);
      setSelectedIds(new Set());
    } catch (e) {
      toast(e.response?.data?.message || "批量关联失败", "error");
    } finally {
      setBulkAssigning(false);
    }
  }

  // 单个 reparsing 任务轮询(直到 done/failed/超时,自动清状态 + refetch 拿最新 candidate)
  function pollReparseTask(candidateId, taskId, startedAt) {
    const tick = async () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed > REPARSE_TTL_MS) {
        setReparsingMap((prev) => { const { [candidateId]: _, ...rest } = prev; return rest; });
        refetchOwned(true);
        return;
      }
      try {
        const { data } = await api.get(`/resumes/parse-tasks/${taskId}`);
        const task = data.task;
        if (task.status === "done" || task.status === "failed") {
          setReparsingMap((prev) => { const { [candidateId]: _, ...rest } = prev; return rest; });
          await refetchOwned(true);
          if (task.status === "failed") toast(`解析失败: ${task.error?.message || ""}`.slice(0, 200), "error");
        } else {
          setTimeout(tick, 2000);
        }
      } catch (e) {
        if (e.response?.status === 404) {
          setReparsingMap((prev) => { const { [candidateId]: _, ...rest } = prev; return rest; });
          refetchOwned(true);
        } else {
          setTimeout(tick, 5000);
        }
      }
    };
    tick();
  }

  // 批量 / 单个解析:复用 reparse 异步任务模式(POST /resumes/parse { candidateId } → 后台跑)
  // 2026-05-26 改造: 拿 taskId 写入 sessionStorage,即使用户切页/刷新也能继续轮询 task 直到完成
  async function onReparse(ids) {
    const toReparse = Array.from(ids);
    if (toReparse.length === 0) return;
    try {
      // 串行触发(并行触发可能让 Kimi 一次性炸 5+ 请求,稳一点)— 拿到每个的 taskId
      const tasks = await Promise.all(toReparse.map((id) =>
        api.post("/resumes/parse", { candidateId: id }).then((r) => ({ candidateId: id, taskId: r.data.task.id, startedAt: Date.now() }))
      ));
      // 一次性写入 reparsingMap
      setReparsingMap((prev) => {
        const next = { ...prev };
        for (const t of tasks) next[t.candidateId] = { taskId: t.taskId, startedAt: t.startedAt };
        return next;
      });
      toast(`已触发 ${tasks.length} 份简历重新解析(后台处理中,会自动刷新)`, "success");
      if (toReparse.length > 1) setSelectedIds(new Set());
      // 立刻给每个任务启动轮询
      for (const t of tasks) pollReparseTask(t.candidateId, t.taskId, t.startedAt);
    } catch (e) {
      toast(e.response?.data?.message || "触发解析失败", "error");
    }
  }

  // 打开新建 JD 弹窗时重置表单(避免上次留下的脏数据)
  useEffect(() => {
    if (showNewJob) {
      setNewJob(NEW_JOB_DEFAULT);
      setNewJobFile(null);
      setNewJobParsing(false);
      setNewJobSaving(false);
    }
  }, [showNewJob]);

  function onPick(e) {
    const fs = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...fs]);
    e.target.value = "";
  }

  // 2s 一次轮询 parse-task,直到 done/failed,或超过 maxAttempts(180 次 = 6 分钟,够 Kimi 任何慢 case)
  async function pollParseTask(taskId, maxAttempts = 180) {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const { data } = await api.get(`/resumes/parse-tasks/${taskId}`);
      const task = data.task;
      if (task.status === "done") return task;
      if (task.status === "failed") {
        const err = new Error(task.error?.message || "解析失败");
        err.taskError = task.error;
        throw err;
      }
      // pending / running → 继续轮询
    }
    throw new Error("解析超时(已等 6 分钟,请稍后到候选人列表查看)");
  }

  async function uploadOne(file) {
    const trimmedSource = source.trim().slice(0, 500);

    // ── 1) 预签名 + R2 直传 ─────────────────────────
    let r2Key = null;
    try {
      const { data } = await api.post("/storage/presigned-url", {
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        expectedSize: file.size,
      });
      await axios.put(data.uploadUrl, file, {
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      r2Key = data.key;
      await api.post("/storage/confirm", { key: r2Key });
    } catch (e) {
      if (e.response?.status !== 503) console.warn("R2 upload failed:", e);
    }

    // ── 2) 调 Kimi 异步解析(R2 + Kimi 都 OK 时,走 parse-and-create 异步任务)
    //    工作机制:POST /resumes/parse 立即拿 taskId(<200ms),前端 2s 一次轮询直到 done/failed
    //    后端任务完成时 task.candidate 已经写入 DB,前端拿到的就是最终快照
    if (r2Key && llmStatus?.configured) {
      try {
        const model = localStorage.getItem("mesa.llm.model") || llmStatus.model;
        const body = {
          key: r2Key,
          contentType: file.type || "application/octet-stream",
          filename: file.name,
          model,
        };
        if (selectedJobId) body.jobId = selectedJobId;
        if (trimmedSource) body.source = trimmedSource;
        const { data: createData } = await api.post("/resumes/parse", body);
        const finalTask = await pollParseTask(createData.task.id);
        return finalTask.candidate;  // 后端已 create,直接返回 DB 快照
      } catch (e) {
        const msg = e.taskError?.message || e.response?.data?.message || e.message;
        toast(`${file.name}: ${msg}`, "error");
        // 解析失败不阻塞 — fall through 到降级路径(只入元数据)
      }
    }

    // ── 3) 降级路径:R2 失败 / Kimi 未配置 / 异步任务失败 → 直接 POST /candidates 入库
    const fallbackPayload = {
      name: file.name.replace(/\.[^/.]+$/, ""),
      status: "待筛选",
      source: trimmedSource || "自动上传",
      attachment: r2Key || file.name,
      tags: ["待解析"],
      skills: [],
      risks: [],
      highlights: [],
      experience: [],
      educationHistory: [],
    };
    return resources.candidates.create(fallbackPayload);
  }

  // ─── 新建 JD 弹窗:可选先上传 JD 文件 → AI 解析回填,再 POST /jobs 落库 ───
  async function onUploadJdFile(file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return toast("JD 文件超过 20MB", "error");
    if (!llmStatus?.configured) return toast("LLM 未配置,无法 AI 解析 JD 文件;请直接手填", "error");
    setNewJobFile(file);
    setNewJobParsing(true);
    try {
      // 1) R2 预签名直传(复用简历上传同款机制)
      const { data: presigned } = await api.post("/storage/presigned-url", {
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        expectedSize: file.size,
      });
      await axios.put(presigned.uploadUrl, file, {
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      await api.post("/storage/confirm", { key: presigned.key });
      // 2) 调 /resumes/parse-jd → AI 抽取
      const { data } = await api.post("/resumes/parse-jd", {
        key: presigned.key,
        contentType: file.type || "application/octet-stream",
      }, { timeout: LONG_TIMEOUT });
      // 3) 回填到 newJob 表单(用户可继续编辑)
      setNewJob((prev) => ({
        ...prev,
        title: data.job.title || prev.title,
        description: data.job.description || prev.description,
        responsibilities: data.job.responsibilities || [],
        requirements: data.job.requirements || [],
        nice: data.job.nice || [],
        benefits: data.job.benefits || [],
        employment: data.job.employment,
        salary: data.job.salary,
        levelRange: data.job.levelRange,
        yearsExpRange: data.job.yearsExpRange,
        educationRequirement: data.job.educationRequirement,
        languageRequirement: data.job.languageRequirement,
      }));
      toast("AI 已抽取 JD 字段,请核对", "success");
    } catch (e) {
      toast(e.response?.data?.message || "JD 解析失败,可手动填写", "error");
    } finally {
      setNewJobParsing(false);
    }
  }

  // ─── 上传分享链接(扫码 + 链接)───────────────────────────────
  // 配置: 30 天有效 + 200 份上限 + 关联当前选中的 JD + 把"来源"作 defaultSource 预填给外部上传者
  async function onCreateUploadLink() {
    setCreatingLink(true);
    try {
      const { data } = await api.post("/upload-links", {
        duration: "30d",
        maxUploads: 200,
        defaultJobId: selectedJobId || null,
        defaultSource: source.trim().slice(0, 500) || null,
      });
      setUploadLinks((prev) => [data.link, ...prev]);
      toast("已生成新的上传链接", "success");
    } catch (e) {
      toast(e.response?.data?.message || "生成失败", "error");
    } finally {
      setCreatingLink(false);
    }
  }

  async function onDeleteUploadLink(id) {
    if (!confirm("确认删除此链接?已分享出去的二维码 / URL 将立即失效")) return;
    try {
      await api.delete(`/upload-links/${id}`);
      setUploadLinks((prev) => prev.filter((l) => l.id !== id));
      toast("已删除", "success");
    } catch (e) {
      toast(e.response?.data?.message || "删除失败", "error");
    }
  }

  function onCopyLink(url) {
    navigator.clipboard.writeText(url).then(
      () => toast("链接已复制", "success"),
      () => toast("复制失败,请手动选中复制", "error"),
    );
  }

  // 保存二维码为 PNG (从 SVG 转 canvas → toDataURL → 触发下载)
  function onSaveQR(svgEl, filename) {
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      const size = 512;  // 输出高清 PNG
      canvas.width = size;
      canvas.height = size;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = filename;
      a.click();
    };
    img.onerror = () => toast("保存失败", "error");
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  }

  async function onSubmitNewJob() {
    const title = newJob.title.trim();
    const description = newJob.description.trim();
    if (!title) return toast("岗位名称必填", "error");
    if (!description) return toast("岗位描述必填(或上传 JD 文件让 AI 抽取)", "error");
    if (description.length > 10000) return toast("岗位描述超过 10000 字符", "error");
    setNewJobSaving(true);
    try {
      const created = await resources.jobs.create({
        title,
        description,
        responsibilities: newJob.responsibilities,
        requirements: newJob.requirements,
        nice: newJob.nice,
        benefits: newJob.benefits,
        employment: newJob.employment,
        salary: newJob.salary,
        levelRange: newJob.levelRange,
        yearsExpRange: newJob.yearsExpRange,
        educationRequirement: newJob.educationRequirement,
        languageRequirement: newJob.languageRequirement,
      });
      setJobs((prev) => [created, ...prev]);
      setSelectedJobId(created.id);
      setShowNewJob(false);
      toast(`已创建岗位「${created.title}」并自动关联`, "success");
    } catch (e) {
      toast(e.response?.data?.message || "创建岗位失败", "error");
    } finally {
      setNewJobSaving(false);
    }
  }

  async function onParse() {
    if (files.length === 0) return toast("先选择简历", "error");
    setParsing(true);
    try {
      const results = [];
      for (const f of files) results.push(await uploadOne(f));
      setParsed((prev) => [...results, ...prev]);
      setFiles([]);
      const real = results.filter((r) => r.parser).length;
      toast(
        real > 0 ? `已 AI 解析 ${real}/${results.length} 份简历` : `已入库 ${results.length} 份(LLM 未启用)`,
        "success",
      );
      // 上传完成后从后端 refetch 一次,确保 list 跟 DB 真实状态对齐(去重 + 拿到公开链接收到的)
      await refetchOwned(true);
    } catch (e) {
      toast(e.response?.data?.message || "解析失败", "error");
    } finally {
      setParsing(false);
    }
  }

  const llmReady = llmStatus?.configured;

  return (
    <div className="space-y-6">
      <Card className="p-8 relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-brand-gradient opacity-10 blur-3xl"></div>
        <div className="relative flex items-start gap-5 flex-wrap">
          <div className="w-14 h-14 rounded-full bg-brand-gradient flex items-center justify-center text-white shrink-0">
            <I name="upload-cloud" size={26} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-navy-700">简历收件箱</h2>
            <p className="text-sm text-gray-700 mt-1">
              支持 PDF / DOCX / DOC,通过 {llmStatus?.provider === "kimi" ? "Kimi (Moonshot AI)" : "LLM"} 自动解析为候选人结构化字段。
            </p>
          </div>
          {llmReady ? (
            <AiBadge parser="Kimi" confidence={null} />
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold bg-amber-100 text-amber-700">
              <I name="alert-triangle" size={11} />
              LLM 未配置 · 降级入库
            </span>
          )}
        </div>
      </Card>

      {/* 1) 文件上传 — 用户流程第一步:先选简历 */}
      <Card className="p-8">
        <label
          htmlFor="resume-upload"
          className="block border-2 border-dashed border-gray-200 rounded-card p-10 text-center cursor-pointer hover:border-brand hover:bg-lightPrimary transition"
        >
          <I name="file-up" size={36} className="text-brand mx-auto" />
          <p className="mt-3 text-sm font-bold text-navy-700">点击或拖拽文件到这里</p>
          <p className="text-xs text-gray-700 mt-1">单次最多 10 份 · 单文件 ≤ 20MB · PDF / DOCX / DOC</p>
          <input
            id="resume-upload"
            type="file"
            multiple
            accept=".pdf,.docx,.doc,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={onPick}
          />
        </label>

        {files.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-bold text-gray-700 uppercase mb-3">待解析 ({files.length})</p>
            <ul className="space-y-2">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3 bg-lightPrimary rounded-xl">
                  <I name="file-text" size={18} className="text-brand" />
                  <span className="flex-1 text-sm text-navy-700 truncate">{f.name}</span>
                  <span className="text-xs text-gray-700">{(f.size / 1024).toFixed(1)} KB</span>
                  <button
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    className="text-gray-400 hover:text-red-500"
                    disabled={parsing}
                  >
                    <I name="x" size={16} />
                  </button>
                </li>
              ))}
            </ul>

          </div>
        )}
      </Card>

      {/* 2) 来源 + 投递岗位 — 选好文件后填写,关联到本批简历 */}
      <Card className="p-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* 来源 */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <I name="user-plus" size={16} className="text-brand" />
              <p className="text-sm font-bold text-navy-700">来源 (可选)</p>
              <span className="text-[11px] text-gray-700">候选人是从哪来的</span>
            </div>
            <input
              type="text"
              maxLength={500}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder={SOURCE_PLACEHOLDER}
              className="w-full h-11 rounded-xl border border-gray-200 px-3 text-sm text-navy-700 outline-none focus:border-brand bg-white"
            />
            <p className="text-[11px] text-gray-500 mt-1.5 text-right">{source.length} / 500</p>
          </div>
          {/* JD 关联 */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <I name="link" size={16} className="text-brand" />
              <p className="text-sm font-bold text-navy-700">投递岗位 (可选)</p>
              <span className="text-[11px] text-gray-700">关联 → AI 会基于 JD 评估匹配度</span>
              <button
                type="button"
                onClick={() => setShowNewJob(true)}
                className="ml-auto text-[11px] font-bold text-brand hover:text-brand-hover flex items-center gap-1"
              >
                <I name="plus-circle" size={12} /> 新建 JD
              </button>
            </div>
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="w-full h-11 rounded-xl border border-gray-200 px-3 text-sm text-navy-700 outline-none focus:border-brand bg-white"
            >
              <option value="">— 不关联,只做信息抽取 —</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}{j.dept ? ` · ${j.dept}` : ""}{j.location ? ` · ${j.location}` : ""}{!j.description ? " ⚠️ 无 JD 描述,评估会不准" : ""}
                </option>
              ))}
            </select>
            {selectedJobId && !jobs.find(j => j.id === selectedJobId)?.description && (
              <p className="text-[11px] text-amber-700 mt-1.5 flex items-center gap-1">
                <I name="alert-triangle" size={11} /> 此岗位无 JD 描述,评估准确度会受影响
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* 3) 选好文件 + 关联后的提交按钮(单独 Card 以保持简洁) */}
      {files.length > 0 && (
        <Card className="p-5">
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setFiles([])} disabled={parsing}>清空选择</Button>
            <Button onClick={onParse} disabled={parsing} icon={<I name={parsing ? "loader" : "sparkles"} size={14} className={parsing ? "animate-spin" : ""} />}>
              {parsing ? "解析中(每份约 10-30 秒)..." : `${llmReady ? "AI 解析" : "上传入库"} (${files.length})`}
            </Button>
          </div>
        </Card>
      )}

      {parsing && <LoadingBlock label="Kimi 正在阅读简历,请稍候..." height="h-16" />}

      {parsed.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = !allSelected && selectedIds.size > 0; }}
                onChange={toggleSelectAll}
                className="w-4 h-4 accent-brand cursor-pointer"
                title={allSelected ? "取消全选" : "全选"}
              />
              <h3 className="title-card">我接收到的简历 ({parsed.length})</h3>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => refetchOwned(false)}
                disabled={refreshing}
                className="text-[11px] text-brand hover:text-brand-hover inline-flex items-center gap-1 disabled:opacity-50"
                title="从服务器拉最新(含公开链接收到的)"
              >
                <I name="refresh-cw" size={11} className={refreshing ? "animate-spin" : ""} /> {refreshing ? "刷新中" : "刷新"}
              </button>
              <button
                onClick={() => setParsed([])}
                className="text-[11px] text-gray-500 hover:text-red-500 inline-flex items-center gap-1"
                title="清空显示(候选人不会从数据库删除)"
              >
                <I name="x-circle" size={11} /> 清空显示
              </button>
            </div>
          </div>

          {/* 批量操作浮条 — 选中时显示 */}
          {selectedIds.size > 0 && (
            <div className="mb-4 p-3 rounded-xl bg-brand/5 border border-brand/20 flex items-center gap-3 flex-wrap">
              <span className="text-sm font-bold text-brand">已选 {selectedIds.size}</span>
              <span className="text-gray-300">|</span>
              <span className="text-xs text-gray-700">批量关联:</span>
              <select
                value=""
                disabled={bulkAssigning}
                onChange={(e) => { if (e.target.value !== "") onBulkAssign({ jobId: e.target.value || null }); }}
                className="h-8 rounded-lg border border-gray-200 px-2 text-xs text-navy-700 outline-none focus:border-brand bg-white max-w-[200px]"
              >
                <option value="">— 关联到 JD —</option>
                <option value="__CLEAR__" disabled>—</option>
                <option value={null}>清除 JD 关联</option>
                {jobs.map((j) => (<option key={j.id} value={j.id}>{j.title}{j.dept ? ` · ${j.dept}` : ""}</option>))}
              </select>
              <select
                value=""
                disabled={bulkAssigning}
                onChange={(e) => { if (e.target.value !== "") onBulkAssign({ departmentId: e.target.value || null }); }}
                className="h-8 rounded-lg border border-gray-200 px-2 text-xs text-navy-700 outline-none focus:border-brand bg-white max-w-[200px]"
              >
                <option value="">— 关联到部门 —</option>
                <option value={null}>清除部门关联</option>
                {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}{d.code ? ` (${d.code})` : ""}</option>))}
              </select>
              <button
                onClick={() => onReparse(selectedIds)}
                disabled={bulkAssigning || !llmStatus?.configured}
                className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-brand text-white text-xs font-bold hover:bg-brand-hover disabled:opacity-50"
                title={!llmStatus?.configured ? "LLM 未配置,无法解析" : "用 Kimi 重新解析选中的简历"}
              >
                <I name="sparkles" size={11} /> 批量解析 ({selectedIds.size})
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="ml-auto text-[11px] text-gray-500 hover:text-navy-700"
              >
                取消选择
              </button>
            </div>
          )}

          <ul className="divide-y divide-gray-200">
            {parsed.map((c) => {
              const isSelected = selectedIds.has(c.id);
              const isReparsing = reparsingIds.has(c.id) || c.parsing;
              return (
              <li key={c.id} className={`py-3 ${isSelected ? "bg-brand/5 -mx-2 px-2 rounded-lg" : ""}`}>
                {/* 两行卡片:checkbox + 头像 + 右侧(上=身份信息+匹配球锚点,下=控件) */}
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(c.id)}
                    className="w-4 h-4 accent-brand cursor-pointer shrink-0 mt-1"
                  />
                  <div className="w-10 h-10 rounded-full bg-brand-gradient text-white flex items-center justify-center font-bold shrink-0">
                    {(c.name || "?").slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* 上行:身份信息(左,可压缩)+ 匹配度球(右上角锚点,独立留白不被裁) */}
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <Link to={`/candidates/${c.externalId || c.id}`} className="text-sm font-bold text-navy-700 hover:text-brand truncate block">
                          {c.name || "—"}
                        </Link>
                        <p className="text-xs text-gray-700 truncate">
                          {[c.education, c.school, c.major].filter(Boolean).join(" · ") || c.attachment}
                        </p>
                        <p className="text-[11px] text-gray-500 truncate">
                          <span className="text-gray-400">来源:</span> {fmtSource(c.source)}
                          <span className="text-gray-300 mx-1">·</span>
                          <span className="font-mono text-gray-400">{fmtDateTime(c.createdAt)}</span>
                        </p>
                      </div>
                      {c.jdMatch != null && (
                        <div className="shrink-0 pr-0.5">
                          <LiquidLoader size={36} level={c.jdMatch} label={c.jdMatch} />
                        </div>
                      )}
                    </div>
                    {/* 下行:控件一字排开,不再与匹配球抢位 */}
                    <div className="flex items-center gap-2 flex-wrap mt-2">
                      <select
                        value={c.jobId || ""}
                        onChange={(e) => onSingleAssign(c.id, { jobId: e.target.value || null })}
                        className="h-7 rounded-lg border border-gray-200 px-2 text-[11px] text-navy-700 outline-none focus:border-brand bg-white max-w-[140px] shrink-0"
                        title={c.job?.title ? `关联到 JD: ${c.job.title}` : "未关联 JD,点击选择"}
                      >
                        <option value="">— 未关联 JD —</option>
                        {jobs.map((j) => (<option key={j.id} value={j.id}>{j.title}</option>))}
                      </select>
                      <select
                        value={c.departmentId || ""}
                        onChange={(e) => onSingleAssign(c.id, { departmentId: e.target.value || null })}
                        className="h-7 rounded-lg border border-gray-200 px-2 text-[11px] text-navy-700 outline-none focus:border-brand bg-white max-w-[120px] shrink-0"
                        title={c.department?.name ? `关联到部门: ${c.department.name}` : "未关联部门,点击选择"}
                      >
                        <option value="">— 未关联部门 —</option>
                        {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
                      </select>
                      {llmStatus?.configured && (
                        <button
                          onClick={() => onReparse([c.id])}
                          disabled={isReparsing}
                          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-brand text-white text-[11px] font-bold hover:bg-brand-hover disabled:opacity-60 shrink-0"
                          title={isReparsing ? "正在解析中" : (c.parser ? "用 Kimi 重新解析这份简历" : "用 Kimi 解析这份简历")}
                        >
                          <I name={isReparsing ? "loader" : (c.parser ? "refresh-cw" : "sparkles")} size={10} className={isReparsing ? "animate-spin" : ""} />
                          {isReparsing ? "解析中" : (c.parser ? "重新解析" : "解析")}
                        </button>
                      )}
                      {c.parser ? (
                        <AiBadge parser={c.parser} confidence={c.parserConfidence} />
                      ) : (
                        <StatusPill status={c.status || "待筛选"} />
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );})}
          </ul>
        </Card>
      )}

      {parsed.length === 0 && files.length === 0 && initialLoaded && (
        <Card className="p-6">
          <Empty
            icon="inbox"
            title="还没有接收到简历"
            desc="本地手动上传 或 通过你的分享链接 / 扫码上传收到的简历都会出现在这里"
          />
        </Card>
      )}

      {/* === 更多上传方式(扫码 + 分享链接)============================== */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            <I name="smartphone" size={18} className="text-brand" />
            <h3 className="text-base font-bold text-navy-700">更多上传方式</h3>
          </div>
          <p className="text-[11px] text-gray-500 text-right">向候选人本人或同事分享,可远程上传简历</p>
        </div>

        {linksLoading ? (
          <LoadingBlock label="加载链接..." height="h-20" />
        ) : uploadLinks.length === 0 ? (
          /* 还没生成链接 */
          <div className="text-center py-10 px-5 rounded-xl border-2 border-dashed border-gray-200">
            <div className="w-14 h-14 rounded-full bg-lightPrimary text-brand mx-auto flex items-center justify-center">
              <I name="qr-code" size={24} />
            </div>
            <p className="text-sm font-bold text-navy-700 mt-3">尚未生成上传链接</p>
            <p className="text-xs text-gray-700 mt-1">生成后,候选人本人 / 同事可扫码或通过链接上传简历(默认 30 天有效 · 最多 200 份)</p>
            <Button
              onClick={onCreateUploadLink}
              disabled={creatingLink}
              icon={<I name={creatingLink ? "loader" : "qr-code"} size={14} className={creatingLink ? "animate-spin" : ""} />}
              className="mt-4"
            >
              {creatingLink ? "生成中..." : "生成上传链接"}
            </Button>
            {(source.trim() || selectedJobId) && (
              <p className="text-[11px] text-amber-700 mt-3">
                将自动绑定当前配置:
                {selectedJobId && jobs.find((j) => j.id === selectedJobId) && <b className="mx-1">「{jobs.find((j) => j.id === selectedJobId).title}」</b>}
                {source.trim() && <span className="mx-1">来源「{source.trim().slice(0, 30)}{source.length > 30 ? "..." : ""}」</span>}
              </p>
            )}
          </div>
        ) : (
          /* 显示最新的一个 link */
          (() => {
            const link = uploadLinks[0];
            const url = `${window.location.origin}/upload/${link.token}`;
            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* 左:扫码上传 */}
                <div className="p-5 rounded-card border-2 border-brand/20 bg-gradient-to-br from-white to-lightPrimary">
                  <div className="flex items-center gap-2 mb-3">
                    <I name="qr-code" size={14} className="text-brand" />
                    <p className="text-sm font-bold text-navy-700">扫码上传</p>
                  </div>
                  <p className="text-[11px] text-gray-700 mb-4">用手机扫描二维码,可上传简历,然后选择关联 JD 或上传填写并关联新 JD 信息</p>
                  <div className="flex gap-4 items-start">
                    <div ref={qrRef} className="p-2 bg-white rounded-xl border border-brand/20 shrink-0">
                      <QRCodeSVG value={url} size={120} fgColor="#1B254B" bgColor="#FFFFFF" includeMargin={false} imageSettings={{ src: "", height: 0, width: 0, excavate: false }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          onClick={() => onSaveQR(qrRef.current?.querySelector("svg"), `mesa-upload-${link.token.slice(0, 8)}.png`)}
                          icon={<I name="download" size={12} />}
                        >
                          保存图片
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => onDeleteUploadLink(link.id).then(() => onCreateUploadLink())}
                          icon={<I name="refresh-cw" size={12} />}
                        >
                          重生成
                        </Button>
                      </div>
                      <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-brand px-2 py-1 rounded-full bg-white border border-brand/30">
                        <I name="clock" size={11} />
                        <span>{fmtExpiresLabel(link.expiresAt)}</span>
                        {link.maxUploads != null && (
                          <>
                            <span className="mx-1 text-gray-300">·</span>
                            <I name="users" size={11} />
                            <span>最多 {link.maxUploads} 份</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 右:分享上传链接 */}
                <div className="p-5 rounded-card border border-gray-200">
                  <div className="flex items-center gap-2 mb-3">
                    <I name="link-2" size={14} className="text-brand" />
                    <p className="text-sm font-bold text-navy-700">分享上传链接</p>
                  </div>
                  <p className="text-[11px] text-gray-700 mb-4">把链接发给候选人本人或同事,对方点开即可上传简历并选择关联 JD 或上传填写并关联新 JD</p>

                  <div className="flex gap-2 items-stretch">
                    <input
                      readOnly
                      value={url}
                      onFocus={(e) => e.target.select()}
                      className="flex-1 min-w-0 h-10 rounded-xl border border-gray-200 px-3 text-sm text-navy-700 outline-none focus:border-brand bg-gray-50 font-mono"
                    />
                    <Button onClick={() => onCopyLink(url)} icon={<I name="copy" size={12} />}>复制</Button>
                  </div>

                  {/* 渠道图标 — 视觉装饰,提示可分享到这些平台(系统层面不集成 SDK,只是引导用户去分享) */}
                  <div className="flex gap-2 mt-4 items-center">
                    {[
                      { name: "message-circle", bg: "#07C160", title: "微信" },
                      { name: "message-square", bg: "#1AAD19", title: "企业微信" },
                      { name: "send", bg: "#0088CC", title: "Telegram" },
                      { name: "bell", bg: "#1B254B", title: "钉钉" },
                      { name: "mail", bg: "#707EAE", title: "邮件" },
                    ].map((c, i) => (
                      <button
                        key={i}
                        title={c.title}
                        onClick={() => onCopyLink(url)}
                        className="w-8 h-8 rounded-full text-white flex items-center justify-center hover:opacity-80 transition"
                        style={{ background: c.bg }}
                      >
                        <I name={c.name} size={13} />
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center gap-3 text-[11px] text-gray-700 flex-wrap">
                    <span className="inline-flex items-center gap-1"><I name="clock" size={11} /> {fmtExpiresLabel(link.expiresAt)}</span>
                    <span className="text-gray-300">·</span>
                    <span className="inline-flex items-center gap-1"><I name="shield-check" size={11} /> 无需登录</span>
                    <span className="text-gray-300">·</span>
                    <span className="inline-flex items-center gap-1"><I name="inbox" size={11} /> {link.uploadCount} / {link.maxUploads ?? "∞"} 已收</span>
                    <button
                      onClick={() => onDeleteUploadLink(link.id)}
                      className="ml-auto text-[11px] text-red-500 hover:text-red-700 inline-flex items-center gap-1"
                    >
                      <I name="trash-2" size={11} /> 删除
                    </button>
                  </div>
                </div>
              </div>
            );
          })()
        )}
      </Card>

      {/* === 新建 JD 弹窗 ============================================ */}
      <Modal open={showNewJob} onClose={() => !newJobSaving && setShowNewJob(false)} maxWidth="max-w-3xl">
        <div className="p-7">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-brand-gradient text-white flex items-center justify-center">
              <I name="briefcase" size={18} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-navy-700">新建岗位 JD</h3>
              <p className="text-xs text-gray-700">填写或上传 JD 文件由 AI 自动抽取,创建后会自动关联本次上传</p>
            </div>
          </div>

          {/* 岗位名称 */}
          <Input
            label="岗位名称"
            required
            value={newJob.title}
            onChange={(e) => setNewJob((p) => ({ ...p, title: e.target.value }))}
            placeholder="如:高级前端工程师"
            disabled={newJobSaving}
            containerClassName="mb-4"
            maxLength={100}
          />

          {/* JD 文件上传 - AI 解析 */}
          <div className="mb-4">
            <label className="text-sm text-navy-700 font-bold ml-3 block mb-2">
              上传 JD 文件 (可选,AI 自动抽取下方字段)
            </label>
            <label
              htmlFor="jd-file-upload"
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed transition cursor-pointer ${
                newJobParsing ? "border-brand bg-lightPrimary" : "border-gray-200 hover:border-brand hover:bg-lightPrimary"
              }`}
            >
              <I name={newJobParsing ? "loader" : "file-up"} size={18} className={`text-brand ${newJobParsing ? "animate-spin" : ""}`} />
              <span className="flex-1 text-sm text-navy-700 truncate">
                {newJobParsing ? "AI 解析中,10-30 秒..." : newJobFile ? newJobFile.name : "选择 JD 文件 (PDF/DOCX/DOC,≤20MB)"}
              </span>
              {!newJobParsing && newJobFile && (
                <span className="text-[11px] text-gray-700">{(newJobFile.size / 1024).toFixed(1)} KB</span>
              )}
              <input
                id="jd-file-upload"
                type="file"
                accept=".pdf,.docx,.doc,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                disabled={newJobParsing || newJobSaving}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadJdFile(f);
                  e.target.value = "";
                }}
              />
            </label>
            {!llmStatus?.configured && (
              <p className="text-[11px] text-amber-700 mt-1.5 flex items-center gap-1">
                <I name="alert-triangle" size={11} /> LLM 未配置,不能 AI 抽取,请手填岗位描述
              </p>
            )}
          </div>

          {/* 岗位描述 */}
          <div className="mb-4">
            <div className="flex items-center justify-between ml-3 mb-2">
              <label className="text-sm text-navy-700 font-bold">岗位描述 *</label>
              <span className={`text-[11px] ${newJob.description.length > 10000 ? "text-red-500" : "text-gray-500"}`}>
                {newJob.description.length} / 10000
              </span>
            </div>
            <textarea
              value={newJob.description}
              onChange={(e) => setNewJob((p) => ({ ...p, description: e.target.value }))}
              placeholder="岗位介绍 / 职责 / 要求 / 福利 / 加分项等(可粘贴整段 JD)"
              disabled={newJobSaving}
              rows={10}
              maxLength={10000}
              className="w-full rounded-xl border border-gray-200 p-3 text-sm text-navy-700 outline-none focus:border-brand bg-white resize-y"
            />
          </div>

          {/* AI 抽取的结构化字段预览(只读,创建时一起带到后端)*/}
          {(newJob.responsibilities.length > 0 || newJob.requirements.length > 0 || newJob.employment || newJob.salary) && (
            <div className="mb-4 p-4 rounded-xl bg-lightPrimary border border-brand/20">
              <p className="text-[11px] font-bold text-brand uppercase mb-2 flex items-center gap-1.5">
                <I name="sparkles" size={11} /> AI 抽取的结构化字段(创建时一起保存到岗位)
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs text-navy-700">
                {newJob.employment && <div><b>类型:</b> {newJob.employment}</div>}
                {newJob.salary && <div><b>薪资:</b> {newJob.salary}</div>}
                {newJob.levelRange && <div><b>职级:</b> {newJob.levelRange}</div>}
                {newJob.yearsExpRange && <div><b>年限:</b> {newJob.yearsExpRange}</div>}
                {newJob.educationRequirement && <div><b>学历:</b> {newJob.educationRequirement}</div>}
                {newJob.languageRequirement && <div className="col-span-2"><b>语言:</b> {newJob.languageRequirement}</div>}
                {newJob.responsibilities.length > 0 && <div className="col-span-full mt-1"><b>职责 ({newJob.responsibilities.length}):</b> {newJob.responsibilities.slice(0, 3).join(" · ")}{newJob.responsibilities.length > 3 ? " ..." : ""}</div>}
                {newJob.requirements.length > 0 && <div className="col-span-full"><b>要求 ({newJob.requirements.length}):</b> {newJob.requirements.slice(0, 3).join(" · ")}{newJob.requirements.length > 3 ? " ..." : ""}</div>}
                {newJob.nice.length > 0 && <div className="col-span-full"><b>加分 ({newJob.nice.length}):</b> {newJob.nice.slice(0, 3).join(" · ")}{newJob.nice.length > 3 ? " ..." : ""}</div>}
                {newJob.benefits.length > 0 && <div className="col-span-full"><b>福利 ({newJob.benefits.length}):</b> {newJob.benefits.slice(0, 3).join(" · ")}{newJob.benefits.length > 3 ? " ..." : ""}</div>}
              </div>
            </div>
          )}

          {/* 操作 */}
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" onClick={() => setShowNewJob(false)} disabled={newJobSaving}>取消</Button>
            <Button
              onClick={onSubmitNewJob}
              disabled={newJobSaving || newJobParsing || !newJob.title.trim() || !newJob.description.trim()}
              icon={<I name={newJobSaving ? "loader" : "check"} size={14} className={newJobSaving ? "animate-spin" : ""} />}
            >
              {newJobSaving ? "创建中..." : "创建并关联"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
