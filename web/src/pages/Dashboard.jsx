import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { api, resources } from "../lib/api.js";
import {
  Card,
  Widget,
  Avatar,
  StatusPill,
  AiBadge,
  LiquidLoader,
  I,
  LoadingBlock,
  Empty,
  StagePill,
  toast,
} from "../components/Primitives.jsx";
import { URGENCY_TONE, STATUS_TONE, HIRE_STAGE_TONE } from "../lib/constants.js";

// 分布列表行 — pill + 数值 + 比例迷你条(占满 maxCount 时满格),给纯列表加数据可视化感
function DistRow({ pill, count, max, color }) {
  const pct = max > 0 ? Math.max(4, Math.round((count / max) * 100)) : 0;
  return (
    <li className="space-y-1.5">
      <div className="flex items-center justify-between">
        {pill}
        <span className="text-sm font-bold text-navy-700 tabular-nums">{count}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-lightPrimary overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out-expo"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}99, ${color})` }}
        />
      </div>
    </li>
  );
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtFullDateTime(iso) {
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

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [jobs, setJobs] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [llmStatus, setLlmStatus] = useState(null);
  const [reparsingIds, setReparsingIds] = useState(() => new Set());

  function reload() {
    resources.dashboard.overview()
      .then(setData)
      .catch((e) => setErr(e.response?.data?.message || e.message));
  }

  useEffect(() => {
    reload();
    resources.jobs.list({ take: 200 }).then((d) => setJobs(d.items || [])).catch(() => {});
    api.get("/departments", { params: { take: 200 } }).then((r) => setDepartments(r.data.items || [])).catch(() => {});
    api.get("/resumes/llm-status").then((r) => setLlmStatus(r.data)).catch(() => setLlmStatus({ configured: false }));
  }, []);

  // 单条 inline 关联(直接 PATCH /candidates/:id,完后 reload dashboard)
  async function onAssign(id, patch) {
    const actualPatch = { ...patch };
    if ("jobId" in actualPatch) {
      const job = actualPatch.jobId ? jobs.find((j) => j.id === actualPatch.jobId) : null;
      actualPatch.appliedFor = job?.title || null;
    }
    try {
      await api.patch(`/candidates/${id}`, actualPatch);
      toast("关联已更新", "success");
      reload();
    } catch (e) {
      toast(e.response?.data?.message || "关联失败", "error");
    }
  }

  // 单条解析(走异步任务,带 candidate 当前 jobId)
  async function onReparse(c) {
    if (!c.attachment) return toast("无简历附件,无法解析", "error");
    setReparsingIds((prev) => new Set([...prev, c.id]));
    try {
      await api.post("/resumes/parse", { candidateId: c.id, jobId: c.jobId || null });
      toast(`已触发「${c.name}」重新解析,5-60 秒后自动刷新`, "success");
      setTimeout(() => reload(), 5000);
      setTimeout(() => {
        reload();
        setReparsingIds((prev) => { const next = new Set(prev); next.delete(c.id); return next; });
      }, 30000);
    } catch (e) {
      toast(e.response?.data?.message || "触发解析失败", "error");
      setReparsingIds((prev) => { const next = new Set(prev); next.delete(c.id); return next; });
    }
  }

  if (err) return <Card className="p-6 text-red-500 text-sm">{err}</Card>;
  if (!data) return <LoadingBlock label="加载概览..." height="h-64" />;

  const tilePalette = ["#422AFB", "#22C55E", "#F59E0B", "#3B82F6"];

  return <DashboardView {...{ data, tilePalette, jobs, departments, llmStatus, reparsingIds, onAssign, onReparse }} />;
}

function DashboardView({ data, tilePalette, jobs, departments, llmStatus, reparsingIds, onAssign, onReparse }) {
  const rootRef = useRef(null);
  useEffect(() => {
    if (!rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from(".dash-rise", {
        y: 18,
        opacity: 0,
        duration: 0.55,
        ease: "power3.out",
        stagger: 0.08,
        clearProps: "transform,opacity",
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={rootRef} className="space-y-6">
      {/* === KPI 卡片 === */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <div className="dash-rise"><Widget icon="users" label="候选人总数" value={data.counts.candidates} accent={tilePalette[0]} subtitle="覆盖全岗位" to="/candidates" /></div>
        <div className="dash-rise"><Widget icon="briefcase" label="在招岗位" value={data.counts.jobs} accent={tilePalette[1]} subtitle="持续招聘中" to="/jobs" /></div>
        <div className="dash-rise"><Widget icon="user-plus" label="入职员工" value={data.counts.employees} accent={tilePalette[2]} subtitle="试用 / 已转正" to="/newhire" /></div>
        <div className="dash-rise"><Widget icon="calendar-check" label="已排面试" value={data.counts.interviewsScheduled} accent={tilePalette[3]} subtitle="本周/近期" to="/interviews" /></div>
      </div>

      {/* === 最新候选人(全宽,容纳单行列式)=== */}
      <Card className="dash-rise p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="title-card">最新候选人</h2>
              <p className="text-xs text-gray-700 mt-1">最近 6 条已解析简历</p>
            </div>
            <Link to="/candidates" className="text-sm text-brand hover:underline flex items-center gap-1">
              查看全部 <I name="arrow-right" size={14} />
            </Link>
          </div>
          {data.recentCandidates.length === 0 ? (
            <Empty title="还没有候选人" desc="先去「简历收件箱」上传一份简历" />
          ) : (
            <ul className="divide-y divide-gray-200">
              {data.recentCandidates.map((c) => {
                const isReparsing = reparsingIds.has(c.id) || c.parsing;
                return (
                <li key={c.id} className="py-3">
                  {/* 响应式单行列式:宽屏一行(身份/岗位/来源/操作区),窄屏与手机 flex-wrap 自动换行堆叠 */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 md:gap-x-4">
                    {/* 身份组:flex-1 + min-width 防压成 0;窄屏占满后其余列换行 */}
                    <div className="flex items-center gap-3 flex-1 min-w-[180px]">
                      <Avatar name={c.name} size={44} className="shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            to={`/candidates/${c.externalId || c.id}`}
                            className="text-sm font-bold text-navy-700 hover:text-brand truncate"
                          >
                            {c.name}
                          </Link>
                          <StatusPill status={c.status} />
                        </div>
                        <p className="text-[11px] text-gray-600 truncate mt-0.5">
                          {[c.school, ...((c.tags || []).slice(0, 2))].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                    </div>
                    {/* 岗位列 */}
                    <div className="w-[130px] shrink-0">
                      <p className="text-[10px] text-gray-400 mb-1">岗位</p>
                      <select
                        value={c.jobId || ""}
                        onChange={(e) => onAssign(c.id, { jobId: e.target.value || null })}
                        className="h-7 w-full rounded-lg border border-gray-200 px-2 text-[11px] text-navy-700 outline-none focus:border-brand bg-white"
                        title={c.job?.title || "关联 JD"}
                      >
                        <option value="">— 未关联 JD —</option>
                        {jobs.map((j) => (<option key={j.id} value={j.id}>{j.title}</option>))}
                      </select>
                    </div>
                    {/* 来源列 — 手机隐藏 */}
                    <div className="hidden md:block w-[140px] shrink-0">
                      <p className="text-[10px] text-gray-400 mb-1">来源</p>
                      <p className="text-[11px] text-gray-700 truncate">
                        {fmtSource(c.source)}
                        <span className="mx-1 text-gray-300">·</span>
                        <span className="font-mono text-gray-500">{fmtFullDateTime(c.createdAt)}</span>
                      </p>
                    </div>
                    {/* 操作区:ml-auto 推到行尾;窄屏换行后整组靠右 */}
                    <div className="flex items-center gap-2 shrink-0 ml-auto">
                      <select
                        value={c.departmentId || ""}
                        onChange={(e) => onAssign(c.id, { departmentId: e.target.value || null })}
                        className="hidden sm:block h-7 rounded-lg border border-gray-200 px-2 text-[11px] text-navy-700 outline-none focus:border-brand bg-white max-w-[110px]"
                        title={c.department?.name || "关联部门"}
                      >
                        <option value="">— 未关联部门 —</option>
                        {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
                      </select>
                      {c.parser && <AiBadge parser={c.parser} confidence={c.parserConfidence} />}
                      {llmStatus?.configured && c.attachment && (
                        <button
                          onClick={() => onReparse(c)}
                          disabled={isReparsing}
                          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-brand-gradient text-white text-[11px] font-bold shadow-button hover:shadow-button-hover active:scale-95 transition-all disabled:opacity-60 shrink-0"
                        >
                          <I name={isReparsing ? "loader" : (c.parser ? "refresh-cw" : "sparkles")} size={10} className={isReparsing ? "animate-spin" : ""} />
                          {isReparsing ? "解析中" : (c.parser ? "重新解析" : "解析")}
                        </button>
                      )}
                      {c.jdMatch != null && (
                        <div className="shrink-0">
                          <LiquidLoader size={40} level={c.jdMatch} label={c.jdMatch} />
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );})}
            </ul>
          )}
      </Card>

      {/* === 面试 + 分布统计(4 列)=== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {/* 即将到来的面试 */}
        <Card className="dash-rise p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="title-card">即将到来的面试</h2>
            <Link to="/interviews" className="text-xs text-brand hover:underline">
              全部
            </Link>
          </div>
          {data.upcomingInterviews.length === 0 ? (
            <Empty icon="calendar" title="近期无安排" />
          ) : (
            <ul className="space-y-3">
              {data.upcomingInterviews.map((iv) => (
                <li key={iv.id} className="p-3 rounded-xl bg-lightPrimary hover:bg-brand-50/60 transition-colors duration-200">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-navy-700">{iv.candidateName}</p>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-50 text-brand font-bold">
                      {iv.round}
                    </span>
                  </div>
                  <p className="text-xs text-gray-700 mt-1">{iv.jobTitle}</p>
                  <div className="flex items-center justify-between mt-2 text-xs text-gray-700">
                    <span className="flex items-center gap-1">
                      <I name="clock" size={12} /> {formatDateTime(iv.scheduledAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <I name="user" size={12} /> {iv.interviewer || "—"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* === 分布统计(并入上面 4 列网格)=== */}
        <Card className="dash-rise p-6">
          <h2 className="title-card">候选人状态分布</h2>
          <ul className="mt-4 space-y-3">
            {(() => {
              const max = Math.max(1, ...data.candidatesByStatus.map((r) => r.count));
              return data.candidatesByStatus.map((r) => {
                const tone = STATUS_TONE[r.status] || STATUS_TONE["待筛选"];
                return (
                  <DistRow key={r.status} count={r.count} max={max} color={tone.dot}
                    pill={<StatusPill status={r.status || "待筛选"} />} />
                );
              });
            })()}
          </ul>
        </Card>

        <Card className="dash-rise p-6">
          <h2 className="title-card">入职员工阶段分布</h2>
          <ul className="mt-4 space-y-3">
            {(() => {
              const max = Math.max(1, ...data.employeesByStage.map((r) => r.count));
              return data.employeesByStage.map((r) => {
                const tone = HIRE_STAGE_TONE[r.stage] || HIRE_STAGE_TONE["待入职"];
                return (
                  <DistRow key={r.stage} count={r.count} max={max} color={tone.dot}
                    pill={<StagePill stage={r.stage || "待入职"} />} />
                );
              });
            })()}
          </ul>
        </Card>

        <Card className="dash-rise p-6">
          <h2 className="title-card">岗位优先级</h2>
          <ul className="mt-4 space-y-3">
            {(() => {
              const max = Math.max(1, ...data.jobsByUrgency.map((r) => r.count));
              return data.jobsByUrgency.map((r) => {
                const tone = URGENCY_TONE[r.urgency] || URGENCY_TONE.mid;
                return (
                  <DistRow key={r.urgency} count={r.count} max={max} color={tone.fg}
                    pill={
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold"
                        style={{ background: tone.bg, color: tone.fg }}>
                        {tone.label}
                      </span>
                    } />
                );
              });
            })()}
          </ul>
        </Card>
      </div>
    </div>
  );
}
