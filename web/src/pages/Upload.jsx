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
  const [parsed, setParsed] = useState([]);
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

  useEffect(() => {
    api.get("/resumes/llm-status").then((r) => setLlmStatus(r.data)).catch(() => setLlmStatus({ configured: false }));
    resources.jobs.list({ take: 200 }).then((d) => setJobs(d.items || [])).catch(() => setJobs([]));
    api.get("/upload-links")
      .then((r) => setUploadLinks(r.data.links || []))
      .catch(() => setUploadLinks([]))
      .finally(() => setLinksLoading(false));
  }, []);

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
  }

  async function uploadOne(file) {
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

    // ── 2) 调 Kimi 解析(仅当 R2 上传成功 + Kimi 已配置)─
    // ⚠️ timeout 120s — Kimi 解析 PDF/Word 实测 10-30s,Word/扫描件偶尔 60s+
    let parsedFields = null;
    if (r2Key && llmStatus?.configured) {
      try {
        const model = localStorage.getItem("mesa.llm.model") || llmStatus.model;
        const body = {
          key: r2Key,
          contentType: file.type || "application/octet-stream",
          model,
        };
        if (selectedJobId) body.jobId = selectedJobId;  // 关联 JD → 后端二次评估
        const { data } = await api.post("/resumes/parse", body, { timeout: LONG_TIMEOUT });
        parsedFields = data.candidate;
      } catch (e) {
        const msg = e.response?.data?.message || e.message;
        toast(`${file.name}: ${msg}`, "error");
        // 解析失败不阻塞 — 仍按元数据降级入库
      }
    }

    // ── 3) 创建 Candidate ────────────────────────────
    const payload = parsedFields
      ? parsedFields
      : {
          name: file.name.replace(/\.[^/.]+$/, ""),
          status: "待筛选",
          source: "自动上传",
          attachment: r2Key || file.name,
          // 占位 — 等用户在 UI 编辑或事后触发再解析
          tags: ["待解析"],
          skills: [],
          risks: [],
          highlights: [],
          experience: [],
          educationHistory: [],
        };

    // 用户填了来源就覆盖(parseResume 默认填 "自动上传",降级路径默认也 "自动上传")
    const trimmedSource = source.trim().slice(0, 500);
    if (trimmedSource) payload.source = trimmedSource;

    return resources.candidates.create(payload);
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

      {/* 来源 + JD 关联(投递岗位),可选 */}
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

            <div className="flex justify-end gap-3 mt-5">
              <Button variant="ghost" onClick={() => setFiles([])} disabled={parsing}>清空</Button>
              <Button onClick={onParse} disabled={parsing} icon={<I name={parsing ? "loader" : "sparkles"} size={14} className={parsing ? "animate-spin" : ""} />}>
                {parsing ? "解析中(每份约 10-30 秒)..." : `${llmReady ? "AI 解析" : "上传入库"} (${files.length})`}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {parsing && <LoadingBlock label="Kimi 正在阅读简历,请稍候..." height="h-16" />}

      {parsed.length > 0 && (
        <Card className="p-6">
          <h3 className="title-card mb-4">本次已入库</h3>
          <ul className="divide-y divide-gray-200">
            {parsed.map((c) => (
              <li key={c.id} className="py-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-gradient text-white flex items-center justify-center font-bold">
                  {(c.name || "?").slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <Link to={`/candidates/${c.externalId || c.id}`} className="text-sm font-bold text-navy-700 hover:text-brand block truncate">
                    {c.name || "—"}
                  </Link>
                  <p className="text-xs text-gray-700 truncate">
                    {[c.education, c.school, c.major].filter(Boolean).join(" · ") || c.attachment}
                  </p>
                </div>
                <div className="hidden md:flex gap-1.5 max-w-[280px] flex-wrap">
                  {(c.tags || []).slice(0, 3).map((t) => <Tag key={t}>{t}</Tag>)}
                </div>
                {c.jdMatch != null && <LiquidLoader size={40} level={c.jdMatch} label={c.jdMatch} />}
                {c.parser ? (
                  <AiBadge parser={c.parser} confidence={c.parserConfidence} />
                ) : (
                  <StatusPill status={c.status || "待筛选"} />
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {parsed.length === 0 && files.length === 0 && (
        <Card className="p-6">
          <Empty icon="inbox" title="收件箱为空" desc="上传简历后会自动出现在候选人列表里" />
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
            label="岗位名称 *"
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
