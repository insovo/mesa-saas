import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, resources } from "../lib/api.js";
import {
  Card,
  Button,
  Input,
  StatusPill,
  Avatar,
  I,
  Empty,
  LoadingBlock,
  Tag,
  Modal,
  toast,
} from "../components/Primitives.jsx";
import { STATUS_ORDER, candidateExpText, hasWorkExperience } from "../lib/constants.js";
import { useMe } from "../lib/authContext.jsx";
import CampusScoreBalls from "../components/campus/CampusScoreBalls.jsx";
import DeleteCandidateModal from "../components/DeleteCandidateModal.jsx";

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

function CandidateMatchScores({ candidate }) {
  const matches = candidate.campusMatches?.length
    ? candidate.campusMatches
    : candidate.jobId && candidate.jdMatch != null
      ? [{ jobId: candidate.jobId, title: candidate.job?.title || candidate.appliedFor || "岗位", scoreShown: candidate.jdMatch }]
      : [];
  return <CampusScoreBalls matches={matches} />;
}

// 批量评估任务持久化(切页/刷新后继续轮询),形状 { jobId, jobTitle, startedAt, tasks:[{candidateId,taskId}], results:{[candidateId]: "A"|"B"|"C"|"D"|"failed"} }
const BATCH_EVAL_SS_KEY = "mesa.candidates.batcheval.v1";
const BATCH_EVAL_TTL_MS = 30 * 60 * 1000;
function loadBatchEvalFromSession() {
  try {
    const raw = sessionStorage.getItem(BATCH_EVAL_SS_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !Array.isArray(obj.tasks) || Date.now() - (obj.startedAt || 0) > BATCH_EVAL_TTL_MS) return null;
    return obj;
  } catch { return null; }
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
  const campusInterviewer = useMe()?.role === "CAMPUS_INTERVIEWER";
  const [items, setItems] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingCandidate, setDeletingCandidate] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [err, setErr] = useState("");
  // 批量操作
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [llmStatus, setLlmStatus] = useState(null);
  // 三层评估:分类 / 优先级筛选 + 批量评估到 JD
  const [classFilter, setClassFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [batchEvalOpen, setBatchEvalOpen] = useState(false);
  const [batchEvalJobId, setBatchEvalJobId] = useState("");
  const [batchEval, setBatchEval] = useState(loadBatchEvalFromSession);
  const batchEvalRef = useRef(null);

  async function load() {
    setLoading(true);
    try {
      const params = {};
      if (q) params.q = q;
      if (statusFilter) params.status = statusFilter;
      if (classFilter) params.classification = classFilter;
      if (priorityFilter) params.reviewPriority = priorityFilter;
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
  }, [statusFilter, classFilter, priorityFilter]);

  // ─── 批量评估:POST /resumes/evaluate-batch → 每个 task 轮询,进度持久化到 sessionStorage ───
  useEffect(() => { batchEvalRef.current = batchEval; try { if (batchEval) sessionStorage.setItem(BATCH_EVAL_SS_KEY, JSON.stringify(batchEval)); else sessionStorage.removeItem(BATCH_EVAL_SS_KEY); } catch {} }, [batchEval]);
  useEffect(() => {
    const b = loadBatchEvalFromSession();
    if (b) for (const t of b.tasks) if (!b.results?.[t.candidateId]) pollBatchTask(t.candidateId, t.taskId);
    // eslint-disable-next-line
  }, []);
  function recordBatchResult(candidateId, result) {
    setBatchEval((prev) => {
      if (!prev) return prev;
      const results = { ...(prev.results || {}), [candidateId]: result };
      const next = { ...prev, results };
      const done = Object.keys(results).length;
      if (done >= prev.tasks.length) {
        const counts = { A: 0, B: 0, C: 0, D: 0, failed: 0 };
        for (const v of Object.values(results)) counts[v in counts ? v : "failed"]++;
        toast(`批量评估完成 · A ${counts.A} / B ${counts.B} / C ${counts.C} / D ${counts.D}${counts.failed ? ` / 失败 ${counts.failed}` : ""}`, counts.failed ? "error" : "success");
        setTimeout(() => { load(); setBatchEval(null); }, 800);
      }
      return next;
    });
  }
  function pollBatchTask(candidateId, taskId) {
    const tick = async () => {
      const b = batchEvalRef.current;
      if (!b || b.results?.[candidateId]) return;
      if (Date.now() - (b.startedAt || 0) > BATCH_EVAL_TTL_MS) { recordBatchResult(candidateId, "failed"); return; }
      try {
        const { data: { task } } = await api.get(`/resumes/parse-tasks/${taskId}`);
        if (task.status === "done") recordBatchResult(candidateId, task.evaluation?.classification || task.candidate?.classification || "C");
        else if (task.status === "failed") recordBatchResult(candidateId, "failed");
        else setTimeout(tick, 2000);
      } catch (e) {
        if (e.response?.status === 404) recordBatchResult(candidateId, "failed");
        else setTimeout(tick, 5000);
      }
    };
    tick();
  }
  async function onBatchEvaluate() {
    if (!batchEvalJobId || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    try {
      const { data } = await api.post("/resumes/evaluate-batch", { jobId: batchEvalJobId, candidateIds: ids });
      const job = jobs.find((j) => j.id === batchEvalJobId);
      const b = { jobId: batchEvalJobId, jobTitle: job?.title || "", startedAt: Date.now(), tasks: data.tasks || [], results: {} };
      setBatchEval(b);
      batchEvalRef.current = b;
      setBatchEvalOpen(false);
      setSelectedIds(new Set());
      toast(`已提交 ${data.count} 份到「${job?.title || "JD"}」评估${data.skipped ? `,${data.skipped} 份无权限跳过` : ""}`, "success");
      for (const t of b.tasks) pollBatchTask(t.candidateId, t.taskId);
      if (!b.tasks.length) setBatchEval(null);
    } catch (e) {
      toast(e.response?.data?.message || "批量评估提交失败", "error");
    }
  }

  // jobs 列表只 load 一次,给关联 JD 下拉用
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
    try {
      await Promise.all(ids.map((id) => {
        const c = items.find((x) => x.id === id);
        return api.post("/resumes/parse", { candidateId: id, jobId: c?.jobId || null });
      }));
      toast(`已触发 ${ids.length} 份简历重新解析(后台 5-60 秒,会自动刷新)`, "success");
      setSelectedIds(new Set());
      setTimeout(() => load(), 5000);
      setTimeout(() => load(), 30000);
    } catch (e) {
      toast(e.response?.data?.message || "触发批量解析失败", "error");
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
          className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-200
            ${statusFilter === "" ? "bg-brand-gradient text-white shadow-button" : "text-gray-700 hover:bg-lightPrimary"}`}
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
          <div className="flex-1 min-w-[160px] md:min-w-[240px] flex items-center bg-lightPrimary rounded-xl pl-4 h-11 transition-all duration-200 focus-within:bg-white focus-within:ring-4 focus-within:ring-brand/10">
            <I name="search" size={16} className="text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="搜索姓名 / 学校 / 应聘岗位"
              className="flex-1 ml-3 bg-transparent outline-none text-sm text-navy-700 placeholder:text-gray-400"
            />
          </div>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="h-11 rounded-xl border border-gray-200 px-3 text-sm text-navy-700 outline-none focus:border-brand bg-white"
            title="AI 评估分类"
          >
            <option value="">分类:全部</option>
            <option value="A">A 高匹配</option>
            <option value="B">B 较匹配</option>
            <option value="C">C 待复核</option>
            <option value="D">D 低匹配</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="h-11 rounded-xl border border-gray-200 px-3 text-sm text-navy-700 outline-none focus:border-brand bg-white"
            title="查看优先级"
          >
            <option value="">优先级:全部</option>
            <option value="HIGH">HIGH 优先</option>
            <option value="REVIEW">REVIEW 待复核</option>
            <option value="LOW">LOW</option>
          </select>
          <Button variant="ghost" onClick={load} icon={<I name="refresh-cw" size={14} />}>
            <span className="hidden sm:inline">刷新</span>
          </Button>
          {!campusInterviewer && <Button onClick={() => setCreateOpen(true)} icon={<I name="user-plus" size={16} />}>
            <span className="hidden sm:inline">新建候选人</span>
            <span className="sm:hidden">新建</span>
          </Button>}
        </div>

        {err && <div className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3 mb-4">{err}</div>}

        {loading ? (
          <LoadingBlock label="加载候选人..." height="h-40" />
        ) : items.length === 0 ? (
          <Empty title="还没有候选人" desc={campusInterviewer ? "暂无校招候选人" : "点上方「新建候选人」开始"} />
        ) : (
          <>
            {/* 批量操作浮条 */}
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
              {!campusInterviewer && <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = !allSelected && selectedIds.size > 0; }}
                onChange={toggleSelectAll}
                className="w-4 h-4 accent-brand cursor-pointer"
                title={allSelected ? "取消全选" : "全选"}
              />}
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
                    className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-brand-gradient text-white text-xs font-bold shadow-button hover:shadow-button-hover active:scale-95 transition-all disabled:opacity-50"
                    title={!llmStatus?.configured ? "LLM 未配置" : "批量重新解析选中的简历"}
                  >
                    <I name="sparkles" size={11} /> 批量解析 ({selectedIds.size})
                  </button>
                  <button
                    onClick={() => { setBatchEvalJobId(""); setBatchEvalOpen(true); }}
                    disabled={bulkAssigning || !!batchEval || !(llmStatus?.providers?.jev?.enabled || llmStatus?.configured)}
                    className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-brand text-brand text-xs font-bold hover:bg-brand/5 active:scale-95 transition-all disabled:opacity-50"
                    title={batchEval ? "上一批评估仍在进行" : "把选中的候选人批量评估到同一个 JD"}
                  >
                    <I name="scale" size={11} /> 批量评估 ({selectedIds.size})
                  </button>
                  <button onClick={() => setSelectedIds(new Set())} className="text-[11px] text-gray-500 hover:text-navy-700">取消</button>
                </div>
              )}
            </div>
            {/* 批量评估进度条 */}
            {batchEval && (() => {
              const done = Object.keys(batchEval.results || {}).length;
              const total = batchEval.tasks.length || 1;
              return (
                <div className="mb-3 p-3 rounded-xl bg-lightPrimary flex items-center gap-3">
                  <I name="loader" size={12} className="animate-spin text-brand shrink-0" />
                  <span className="text-[11px] text-navy-700 font-bold whitespace-nowrap">评估到「{batchEval.jobTitle}」 · 已完成 {done} / {total}</span>
                  <div className="flex-1 h-2 rounded-full bg-white overflow-hidden">
                    <div className="h-full bg-brand-gradient transition-all duration-500" style={{ width: `${Math.round((done / total) * 100)}%` }} />
                  </div>
                  <button onClick={() => setBatchEval(null)} className="text-[11px] text-gray-500 hover:text-navy-700 shrink-0" title="隐藏进度(后台仍会继续)">隐藏</button>
                </div>
              );
            })()}

          <ul className="divide-y divide-gray-200">
            {items.map((c) => {
              const isSelected = selectedIds.has(c.id);
              return (
              <li key={c.id} className={`py-4 group rounded-xl transition-colors duration-200 -mx-2 px-2 ${isSelected ? "bg-brand/5" : "hover:bg-lightPrimary/70"}`}>
                {/* === 桌面端: 响应式单行列式(宽屏一行,中小屏 flex-wrap 自动换行) === */}
                <div className="hidden md:flex md:flex-wrap items-center gap-x-3 gap-y-2.5 md:gap-x-4">
                  {/* 身份组:checkbox + 头像 + 姓名块,flex-1 + min-width 防压成 0 */}
                  <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                    {!campusInterviewer && <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(c.id)}
                      className="w-4 h-4 accent-brand cursor-pointer shrink-0"
                    />}
                    <Avatar name={c.name} animal={c.animal} size={48} className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link to={`/candidates/${c.externalId || c.id}`} className="text-sm font-bold text-navy-700 hover:text-brand truncate">
                          {c.name}
                        </Link>
                        <StatusPill status={c.status || "待筛选"} />
                      </div>
                      <p className="text-[11px] text-gray-600 mt-0.5 truncate">
                        {[c.education, c.school, c.major, c.location, candidateExpText(c.yearsExp, hasWorkExperience(c.experience))].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                  {/* 来源列 — 中小屏隐藏 */}
                  <div className="hidden lg:block w-[150px] shrink-0">
                    <p className="text-[10px] text-gray-400 mb-1">来源</p>
                    <p className="text-[11px] text-gray-700 truncate">
                      {fmtSource(c.source)}
                      <span className="text-gray-300 mx-1">·</span>
                      <span className="font-mono text-gray-500">{fmtDateTime(c.createdAt)}</span>
                    </p>
                  </div>
                  {/* 右操作区:ml-auto 推到行尾 */}
                  <div className="flex min-w-0 max-w-full items-center gap-2 ml-auto">
                    <CandidateMatchScores candidate={c} />
                    <div className="opacity-0 group-hover:opacity-100 transition flex flex-col gap-1 shrink-0">
                      <button onClick={() => navigate(`/candidates/${c.externalId || c.id}`)} className="w-7 h-7 rounded-full bg-lightPrimary text-gray-700 hover:text-brand flex items-center justify-center" title="查看详情">
                        <I name="arrow-right" size={12} />
                      </button>
                      <button onClick={() => setDeletingCandidate(c)} className="w-7 h-7 rounded-full bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center" title="删除">
                        <I name="trash-2" size={12} />
                      </button>
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
                  </div>
                  {/* tags row */}
                  {((c.tags || []).length > 0) && (
                    <div className="flex gap-1.5 mt-2.5 flex-wrap pl-[56px]">
                      {(c.tags || []).slice(0, 4).map((t) => <Tag key={t}>{t}</Tag>)}
                      {(c.tags || []).length > 4 && <span className="text-[10px] text-gray-600">+{c.tags.length - 4}</span>}
                    </div>
                  )}
                  {(c.campusMatches?.length > 0 || (c.jobId && c.jdMatch != null)) && (
                    <div className="mt-2 max-w-full pl-[56px]">
                      <CandidateMatchScores candidate={c} />
                    </div>
                  )}
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
      <Modal open={batchEvalOpen} onClose={() => setBatchEvalOpen(false)} maxWidth="max-w-md">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-navy-700 flex items-center gap-2"><I name="scale" size={18} className="text-brand" /> 批量评估到 JD</h3>
            <button onClick={() => setBatchEvalOpen(false)} className="text-gray-400 hover:text-navy-700"><I name="x" size={20} /></button>
          </div>
          <p className="text-sm text-gray-700 mb-4">已选 <span className="font-bold text-navy-700">{selectedIds.size}</span> 位候选人,将按所选 JD 的评估标准做硬筛 + AI 逐项判定,生成 A/B/C/D 分类(秒级,报告按策略生成)。</p>
          <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5 block">目标岗位</label>
          <select
            value={batchEvalJobId}
            onChange={(e) => setBatchEvalJobId(e.target.value)}
            className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm text-navy-700 bg-white outline-none focus:border-brand"
          >
            <option value="">— 请选择 JD —</option>
            {jobs.map((j) => (<option key={j.id} value={j.id}>{j.title}{j.dept ? ` · ${j.dept}` : ""}</option>))}
          </select>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="ghost" onClick={() => setBatchEvalOpen(false)}>取消</Button>
            <Button onClick={onBatchEvaluate} disabled={!batchEvalJobId} icon={<I name="zap" size={12} />}>开始评估</Button>
          </div>
        </div>
      </Modal>
      {deletingCandidate && <DeleteCandidateModal candidate={deletingCandidate} onClose={() => setDeletingCandidate(null)} onDeleted={() => { setDeletingCandidate(null); load(); }} />}
    </div>
  );
}
