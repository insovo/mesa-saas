import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, resources, LONG_TIMEOUT } from "../lib/api.js";
import {
  Card,
  Button,
  Input,
  StatusPill,
  AiBadge,
  LiquidLoader,
  Avatar,
  I,
  Empty,
  LoadingBlock,
  Tag,
  Modal,
  toast,
} from "../components/Primitives.jsx";
import { STATUS_ORDER, candidateExpText, hasWorkExperience } from "../lib/constants.js";
import ReparseConfirmModal from "../components/ReparseConfirmModal.jsx";

// Helpers — Upload.jsx 已经有相同函数,后续可抽 lib/format.js 复用
function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function fmtSource(s) {
  const t = (s || "").trim();
  return t || "未提供";
}

const EMPTY_FORM = {
  name: "",
  appliedFor: "",
  status: "待筛选",
  jdMatch: 0,
  school: "",
  source: "手动录入",
  tags: "",
};

export default function Candidates() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [err, setErr] = useState("");
  const [reparseTarget, setReparseTarget] = useState(null); // 弹 modal 用的候选人(单条)
  // 批量操作
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [reparsingIds, setReparsingIds] = useState(() => new Set()); // 批量解析进行中
  const [llmStatus, setLlmStatus] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const params = {};
      if (q) params.q = q;
      if (statusFilter) params.status = statusFilter;
      const { items } = await resources.candidates.list(params);
      setItems(items);
    } catch (e) {
      setErr(e.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [statusFilter]);

  // jobs 列表只 load 一次,给 ReparseConfirmModal 的 select 用 + inline 关联 JD 下拉用
  useEffect(() => {
    resources.jobs.list({ take: 200 }).then((d) => setJobs(d.items || [])).catch(() => {});
    api.get("/departments", { params: { take: 200 } }).then((r) => setDepartments(r.data.items || [])).catch(() => {});
    api.get("/resumes/llm-status").then((r) => setLlmStatus(r.data)).catch(() => setLlmStatus({ configured: false }));
  }, []);

  // ─── 批量操作 helpers ─────────────────────────────
  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  const allSelected = items.length > 0 && items.every((c) => selectedIds.has(c.id));
  function toggleSelectAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map((c) => c.id)));
  }

  // 单条 inline 关联:直接 PATCH /candidates/:id
  async function onSingleAssign(id, patch) {
    const actualPatch = { ...patch };
    if ("jobId" in actualPatch) {
      const job = actualPatch.jobId ? jobs.find((j) => j.id === actualPatch.jobId) : null;
      actualPatch.appliedFor = job?.title || null;
    }
    try {
      await api.patch(`/candidates/${id}`, actualPatch);
      toast("关联已更新", "success");
      load();
    } catch (e) {
      toast(e.response?.data?.message || "关联失败", "error");
    }
  }

  // 批量关联 JD / 部门
  async function onBulkAssign(patch) {
    if (selectedIds.size === 0) return;
    setBulkAssigning(true);
    const ids = Array.from(selectedIds);
    const actualPatch = { ...patch };
    if ("jobId" in actualPatch) {
      const job = actualPatch.jobId ? jobs.find((j) => j.id === actualPatch.jobId) : null;
      actualPatch.appliedFor = job?.title || null;
    }
    try {
      await Promise.all(ids.map((id) => api.patch(`/candidates/${id}`, actualPatch)));
      const dept = "departmentId" in patch ? departments.find((d) => d.id === patch.departmentId) : null;
      const job = "jobId" in patch ? jobs.find((j) => j.id === patch.jobId) : null;
      toast(`${ids.length} 份已关联到 ${job ? `JD「${job.title}」` : dept ? `部门「${dept.name}」` : "(清除)"}`, "success");
      await load();
      setSelectedIds(new Set());
    } catch (e) {
      toast(e.response?.data?.message || "批量关联失败", "error");
    } finally {
      setBulkAssigning(false);
    }
  }

  // 批量解析(走异步任务路径,不弹 modal 避免 N 次确认 — 用 candidate 的当前 jobId)
  async function onBulkReparse() {
    const ids = Array.from(selectedIds).filter((id) => {
      const c = items.find((x) => x.id === id);
      return c?.attachment;  // 没附件的不能解析
    });
    if (ids.length === 0) return toast("选中的简历都没有附件,无法解析", "error");
    setReparsingIds((prev) => new Set([...prev, ...ids]));
    try {
      await Promise.all(ids.map((id) => {
        const c = items.find((x) => x.id === id);
        return api.post("/resumes/parse", { candidateId: id, jobId: c?.jobId || null });
      }));
      toast(`已触发 ${ids.length} 份简历重新解析(后台 5-60 秒,会自动刷新)`, "success");
      setSelectedIds(new Set());
      setTimeout(() => load(), 5000);
      setTimeout(() => {
        load();
        setReparsingIds((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        });
      }, 30000);
    } catch (e) {
      toast(e.response?.data?.message || "触发批量解析失败", "error");
      setReparsingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  }

  // 重新解析(异步): POST /resumes/parse {candidateId, jobId} 立即拿 taskId,轮询 GET /parse-tasks/:taskId 直到 done/failed
  // 入口走 ReparseConfirmModal,让用户先确认/修改投递岗位再开跑(与详情页同行为)。
  const [reparsingId, setReparsingId] = useState(null);

  function openReparse(c) {
    if (!c?.id) return;
    if (!c.attachment) return toast("无简历附件,无法重新解析", "error");
    setReparseTarget(c);
  }

  async function onReparse(jobId) {
    const c = reparseTarget;
    if (!c?.id) return;
    setReparsingId(c.id);
    try {
      const { data: { task: initialTask } } = await api.post("/resumes/parse", { candidateId: c.id, jobId });
      const taskId = initialTask.id;
      const startedAt = Date.now();
      const MAX_WAIT_MS = 5 * 60 * 1000;
      let finalTask = null;
      while (Date.now() - startedAt < MAX_WAIT_MS) {
        await new Promise((r) => setTimeout(r, 2000));
        const { data: { task } } = await api.get(`/resumes/parse-tasks/${taskId}`);
        if (task.status === "done" || task.status === "failed") { finalTask = task; break; }
      }
      if (!finalTask) {
        toast(`${c.name} 重新解析超时(>5 分钟)`, "error");
        return;
      }
      if (finalTask.status === "done") {
        setItems((prev) => prev.map((x) => (x.id === c.id ? finalTask.candidate : x)));
        setReparseTarget(null);
        toast(`✓ ${finalTask.candidate.name} 已重新解析`, "success");
      } else {
        // failed — 全完整错误塞剪贴板 + console.error 完整 task
        const err = finalTask.error || {};
        const full = JSON.stringify({
          candidate: c.name,
          taskId: finalTask.id,
          startedAt: finalTask.startedAt,
          finishedAt: finalTask.finishedAt,
          statusCode: err.statusCode,
          errorCode: err.code,
          message: err.message,
        }, null, 2);
        console.error("[reparse] task failed", finalTask);
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(full).catch(() => {});
        toast(`${c.name} · ${err.code || "error"} · 完整错误已复制到剪贴板`, "error");
      }
    } catch (e) {
      console.error("[reparse] axios failed", c.name, e);
      const r = e.response;
      const full = JSON.stringify({
        candidate: c.name,
        status: r?.status,
        url: r?.config?.url,
        data: r?.data,
        message: e.message,
      }, null, 2);
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(full).catch(() => {});
      toast(`重新解析失败 · ${c.name} · 完整错误已复制到剪贴板`, "error");
    } finally {
      setReparsingId(null);
    }
  }

  async function onCreate(e) {
    e.preventDefault();
    if (!form.name) return;
    try {
      const payload = {
        name: form.name,
        appliedFor: form.appliedFor || null,
        status: form.status || "待筛选",
        jdMatch: Number(form.jdMatch) || 0,
        school: form.school || null,
        source: form.source || null,
        tags: form.tags ? form.tags.split(/[,，\s]+/).filter(Boolean) : [],
      };
      await resources.candidates.create(payload);
      setForm(EMPTY_FORM);
      setCreateOpen(false);
      toast("候选人已创建", "success");
      load();
    } catch (e) {
      toast(e.response?.data?.message || "创建失败", "error");
    }
  }

  async function onDelete(id, name) {
    if (!confirm(`确定删除 ${name} 吗?`)) return;
    try {
      await resources.candidates.remove(id);
      toast("已删除", "success");
      load();
    } catch (e) {
      toast(e.response?.data?.message || "删除失败", "error");
    }
  }

  const summary = useMemo(() => {
    const buckets = {};
    items.forEach((c) => {
      const k = c.status || "待筛选";
      buckets[k] = (buckets[k] || 0) + 1;
    });
    return STATUS_ORDER.map((s) => ({ status: s, count: buckets[s] || 0 }));
  }, [items]);

  return (
    <div className="space-y-6">
      {/* 状态分布快查 */}
      <Card className="p-4 !flex-row items-center justify-start gap-2 overflow-x-auto">
        <button
          onClick={() => setStatusFilter("")}
          className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition
            ${statusFilter === "" ? "bg-brand text-white" : "text-gray-700 hover:bg-lightPrimary"}`}
        >
          全部 · {items.length}
        </button>
        {summary.map((s) => (
          <button
            key={s.status}
            onClick={() => setStatusFilter(statusFilter === s.status ? "" : s.status)}
            className={`px-3 py-1.5 rounded-full whitespace-nowrap transition flex items-center gap-2
              ${statusFilter === s.status ? "bg-lightPrimary ring-2 ring-brand/40" : "hover:bg-lightPrimary"}`}
          >
            <StatusPill status={s.status} />
            <span className="text-xs font-bold text-navy-700">{s.count}</span>
          </button>
        ))}
      </Card>

      {/* 工具栏 */}
      <Card className="p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-4 md:mb-5">
          <div className="flex-1 min-w-[160px] md:min-w-[240px] flex items-center bg-lightPrimary rounded-xl pl-4 h-11">
            <I name="search" size={16} className="text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="搜索姓名 / 学校 / 应聘岗位"
              className="flex-1 ml-3 bg-transparent outline-none text-sm text-navy-700 placeholder:text-gray-400"
            />
          </div>
          <Button variant="ghost" onClick={load} icon={<I name="refresh-cw" size={14} />}>
            <span className="hidden sm:inline">刷新</span>
          </Button>
          <Button onClick={() => setCreateOpen(true)} icon={<I name="user-plus" size={16} />}>
            <span className="hidden sm:inline">新建候选人</span>
            <span className="sm:hidden">新建</span>
          </Button>
        </div>

        {err && <div className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3 mb-4">{err}</div>}

        {loading ? (
          <LoadingBlock label="加载候选人..." height="h-40" />
        ) : items.length === 0 ? (
          <Empty title="还没有候选人" desc="点上方「新建候选人」开始" />
        ) : (
          <>
            {/* 批量操作浮条 */}
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = !allSelected && selectedIds.size > 0; }}
                onChange={toggleSelectAll}
                className="w-4 h-4 accent-brand cursor-pointer"
                title={allSelected ? "取消全选" : "全选"}
              />
              <span className="text-[11px] text-gray-600">
                {selectedIds.size > 0 ? `已选 ${selectedIds.size} / ${items.length}` : `共 ${items.length} 个`}
              </span>
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 ml-auto flex-wrap">
                  <select
                    value=""
                    disabled={bulkAssigning}
                    onChange={(e) => { if (e.target.value !== "") onBulkAssign({ jobId: e.target.value || null }); }}
                    className="h-8 rounded-lg border border-gray-200 px-2 text-xs text-navy-700 outline-none focus:border-brand bg-white max-w-[180px]"
                  >
                    <option value="">批量关联 JD</option>
                    <option value={null}>清除 JD 关联</option>
                    {jobs.map((j) => (<option key={j.id} value={j.id}>{j.title}</option>))}
                  </select>
                  <select
                    value=""
                    disabled={bulkAssigning}
                    onChange={(e) => { if (e.target.value !== "") onBulkAssign({ departmentId: e.target.value || null }); }}
                    className="h-8 rounded-lg border border-gray-200 px-2 text-xs text-navy-700 outline-none focus:border-brand bg-white max-w-[160px]"
                  >
                    <option value="">批量关联部门</option>
                    <option value={null}>清除部门关联</option>
                    {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
                  </select>
                  <button
                    onClick={onBulkReparse}
                    disabled={bulkAssigning || !llmStatus?.configured}
                    className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-brand text-white text-xs font-bold hover:bg-brand-hover disabled:opacity-50"
                    title={!llmStatus?.configured ? "LLM 未配置" : "批量重新解析选中的简历"}
                  >
                    <I name="sparkles" size={11} /> 批量解析 ({selectedIds.size})
                  </button>
                  <button onClick={() => setSelectedIds(new Set())} className="text-[11px] text-gray-500 hover:text-navy-700">取消</button>
                </div>
              )}
            </div>

          <ul className="divide-y divide-gray-200">
            {items.map((c) => {
              const isSelected = selectedIds.has(c.id);
              const isReparsing = reparsingIds.has(c.id) || reparsingId === c.id || c.parsing;
              return (
              <li key={c.id} className={`py-4 group ${isSelected ? "bg-brand/5 -mx-2 px-2 rounded-lg" : ""}`}>
                {/* === 桌面端: 两行卡片(上=身份+匹配球锚点+hover操作,下=控件) === */}
                <div className="hidden md:flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(c.id)}
                    className="w-4 h-4 accent-brand cursor-pointer shrink-0 mt-1"
                  />
                  <Avatar name={c.name} animal={c.animal} size={44} className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    {/* 上行:身份信息(左,可压缩)+ 匹配球锚点 + hover 操作 */}
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link to={`/candidates/${c.externalId || c.id}`} className="text-sm font-bold text-navy-700 hover:text-brand">
                            {c.name}
                          </Link>
                          {c.parser && <AiBadge parser={c.parser} confidence={c.parserConfidence} />}
                        </div>
                        <p className="text-[11px] text-gray-700 mt-0.5 truncate">
                          {[c.education, c.school, c.major, c.location, candidateExpText(c.yearsExp, hasWorkExperience(c.experience))].filter(Boolean).join(" · ")}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500 flex-wrap">
                          <span><span className="text-gray-400">来源:</span> {fmtSource(c.source)}</span>
                          <span className="text-gray-300">·</span>
                          <span className="font-mono whitespace-nowrap">{fmtDateTime(c.createdAt)}</span>
                        </div>
                      </div>
                      {c.jdMatch != null ? (
                        <div className="shrink-0 pr-0.5">
                          <LiquidLoader size={40} level={c.jdMatch} label={c.jdMatch} />
                        </div>
                      ) : (
                        <div className="w-10 text-[9px] text-gray-400 text-center shrink-0 pt-1">
                          <I name="link-2-off" size={12} />
                        </div>
                      )}
                      <div className="opacity-0 group-hover:opacity-100 transition flex flex-col gap-1 shrink-0">
                        <button onClick={() => navigate(`/candidates/${c.externalId || c.id}`)} className="w-7 h-7 rounded-full bg-lightPrimary text-gray-700 hover:text-brand flex items-center justify-center" title="查看详情">
                          <I name="arrow-right" size={12} />
                        </button>
                        <button onClick={() => onDelete(c.id, c.name)} className="w-7 h-7 rounded-full bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center" title="删除">
                          <I name="trash-2" size={12} />
                        </button>
                      </div>
                    </div>
                    {/* 下行:控件一字排开,不再与匹配球抢位 */}
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      <select
                        value={c.jobId || ""}
                        onChange={(e) => onSingleAssign(c.id, { jobId: e.target.value || null })}
                        className="h-7 rounded-lg border border-gray-200 px-2 text-[11px] text-navy-700 outline-none focus:border-brand bg-white max-w-[130px] shrink-0"
                        title={c.job?.title ? `关联 JD: ${c.job.title}` : "点击关联 JD"}
                      >
                        <option value="">— 未关联 JD —</option>
                        {jobs.map((j) => (<option key={j.id} value={j.id}>{j.title}</option>))}
                      </select>
                      <select
                        value={c.departmentId || ""}
                        onChange={(e) => onSingleAssign(c.id, { departmentId: e.target.value || null })}
                        className="h-7 rounded-lg border border-gray-200 px-2 text-[11px] text-navy-700 outline-none focus:border-brand bg-white max-w-[110px] shrink-0"
                        title={c.department?.name ? `关联部门: ${c.department.name}` : "点击关联部门"}
                      >
                        <option value="">— 未关联部门 —</option>
                        {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
                      </select>
                      {/* 解析按钮 — LLM 已配且有附件时始终显示;已解析显示"重新解析" */}
                      {llmStatus?.configured && c.attachment && (
                        <button
                          onClick={() => openReparse(c)}
                          disabled={isReparsing}
                          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-brand text-white text-[11px] font-bold hover:bg-brand-hover disabled:opacity-60 shrink-0"
                          title={c.parser ? "用 Kimi 重新解析" : "用 Kimi 解析这份简历"}
                        >
                          <I name={isReparsing ? "loader" : (c.parser ? "refresh-cw" : "sparkles")} size={10} className={isReparsing ? "animate-spin" : ""} />
                          {isReparsing ? "解析中" : (c.parser ? "重新解析" : "解析")}
                        </button>
                      )}
                      <StatusPill status={c.status || "待筛选"} />
                    </div>
                  </div>
                </div>

                {/* === 移动端: 卡片式 stack === */}
                <Link to={`/candidates/${c.externalId || c.id}`} className="md:hidden block active:bg-lightPrimary -mx-2 px-2 py-1 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Avatar name={c.name} animal={c.animal} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-bold text-navy-700">{c.name}</span>
                        <StatusPill status={c.status || "待筛选"} />
                      </div>
                      <p className="text-[11px] text-gray-700 mt-1 line-clamp-2">
                        {[c.education, c.school, c.major].filter(Boolean).join(" · ")}
                      </p>
                      <p className="text-[11px] text-gray-700 mt-0.5">
                        {[c.location, candidateExpText(c.yearsExp, hasWorkExperience(c.experience)), c.source].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    {c.jdMatch != null ? (
                      <LiquidLoader size={48} level={c.jdMatch} label={c.jdMatch} />
                    ) : (
                      <div className="w-12 shrink-0 text-center text-[10px] text-gray-400">
                        <I name="link-2-off" size={14} className="inline" />
                        <p className="mt-0.5">未关联</p>
                      </div>
                    )}
                  </div>
                  {/* tags row */}
                  {((c.tags || []).length > 0) && (
                    <div className="flex gap-1.5 mt-2.5 flex-wrap pl-[56px]">
                      {(c.tags || []).slice(0, 4).map((t) => <Tag key={t}>{t}</Tag>)}
                      {(c.tags || []).length > 4 && <span className="text-[10px] text-gray-600">+{c.tags.length - 4}</span>}
                    </div>
                  )}
                  {/* 应聘岗位 + AI badge */}
                  <div className="flex items-center gap-2 mt-2 pl-[56px] flex-wrap">
                    {c.appliedFor && (
                      <span className="text-[11px] text-gray-700 inline-flex items-center gap-1">
                        <I name="briefcase" size={10} /> {c.appliedFor}
                      </span>
                    )}
                    {c.parser && <AiBadge parser={c.parser} confidence={c.parserConfidence} />}
                  </div>
                </Link>
              </li>
            );})}
          </ul>
          </>
        )}
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)}>
        <form onSubmit={onCreate} className="p-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-navy-700">新建候选人</h3>
            <button type="button" onClick={() => setCreateOpen(false)} className="text-gray-400 hover:text-navy-700">
              <I name="x" size={20} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="姓名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="学校" value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} />
            <Input label="应聘岗位" value={form.appliedFor} onChange={(e) => setForm({ ...form, appliedFor: e.target.value })} />
            <Input
              label="JD 匹配度 (0-100)"
              type="number"
              min="0"
              max="100"
              value={form.jdMatch}
              onChange={(e) => setForm({ ...form, jdMatch: e.target.value })}
            />
            <div>
              <label className="text-sm text-navy-700 font-bold ml-3 block mb-2">状态</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full h-12 rounded-xl border border-gray-200 px-3 text-sm text-navy-700 outline-none focus:border-brand"
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <Input label="来源" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
            <Input
              label="标签 (逗号分隔)"
              containerClassName="col-span-2"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="如: 海外项目, PMP, 8D"
            />
          </div>
          <div className="flex justify-end gap-3 mt-8">
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button type="submit" icon={<I name="check" size={14} />}>
              创建
            </Button>
          </div>
        </form>
      </Modal>
      <ReparseConfirmModal
        open={!!reparseTarget}
        onClose={() => setReparseTarget(null)}
        onConfirm={onReparse}
        currentJob={jobs.find((j) => j.id === reparseTarget?.jobId)}
        jobs={jobs}
        candidateName={reparseTarget?.name}
        reparsing={!!reparsingId && reparsingId === reparseTarget?.id}
      />
    </div>
  );
}
