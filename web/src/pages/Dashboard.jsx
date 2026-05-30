import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
import { URGENCY_TONE } from "../lib/constants.js";

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

  return (
    <div className="space-y-6">
      {/* === KPI 卡片 === */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <Widget icon="users" label="候选人总数" value={data.counts.candidates} accent={tilePalette[0]} subtitle="覆盖全岗位" />
        <Widget icon="briefcase" label="在招岗位" value={data.counts.jobs} accent={tilePalette[1]} subtitle="持续招聘中" />
        <Widget icon="user-plus" label="入职员工" value={data.counts.employees} accent={tilePalette[2]} subtitle="试用 / 已转正" />
        <Widget icon="calendar-check" label="已排面试" value={data.counts.interviewsScheduled} accent={tilePalette[3]} subtitle="本周/近期" />
      </div>

      {/* === 两列布局 === */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* 最近候选人 */}
        <Card className="p-6 xl:col-span-2">
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
                const isReparsing = reparsingIds.has(c.id);
                return (
                <li key={c.id} className="py-3 flex flex-col 2xl:flex-row 2xl:items-center gap-x-2.5 gap-y-2">
                  {/* 身份组:默认独占一行(控件换到下方),保证姓名/学校不被挤没;超宽屏 2xl 才并回一行 */}
                  <div className="flex items-center gap-2.5 min-w-0 2xl:flex-1">
                    <Avatar name={c.name} size={40} className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/candidates/${c.externalId || c.id}`}
                        className="text-sm font-bold text-navy-700 hover:text-brand truncate block"
                      >
                        {c.name}
                      </Link>
                      <p className="text-[11px] text-gray-700 truncate mt-0.5">
                        {c.school || "—"} · {c.appliedFor || "未指派岗位"}
                      </p>
                      <p className="text-[10px] text-gray-500 truncate mt-0.5">
                        <span className="text-gray-400">来源:</span> {fmtSource(c.source)}
                        <span className="mx-1.5 text-gray-300">·</span>
                        <span className="font-mono">{fmtFullDateTime(c.createdAt)}</span>
                      </p>
                    </div>
                  </div>
                  {/* 控件组:堆叠时缩进到姓名下方,组内按卡片宽度自适应 wrap;2xl 时并回右侧一行 */}
                  <div className="flex items-center gap-2 flex-wrap pl-[50px] 2xl:pl-0 2xl:flex-nowrap 2xl:shrink-0">
                    <select
                      value={c.jobId || ""}
                      onChange={(e) => onAssign(c.id, { jobId: e.target.value || null })}
                      className="h-7 rounded-lg border border-gray-200 px-2 text-[11px] text-navy-700 outline-none focus:border-brand bg-white max-w-[120px] shrink-0"
                      title={c.job?.title || "关联 JD"}
                    >
                      <option value="">— 未关联 JD —</option>
                      {jobs.map((j) => (<option key={j.id} value={j.id}>{j.title}</option>))}
                    </select>
                    <select
                      value={c.departmentId || ""}
                      onChange={(e) => onAssign(c.id, { departmentId: e.target.value || null })}
                      className="h-7 rounded-lg border border-gray-200 px-2 text-[11px] text-navy-700 outline-none focus:border-brand bg-white max-w-[100px] shrink-0"
                      title={c.department?.name || "关联部门"}
                    >
                      <option value="">— 未关联部门 —</option>
                      {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
                    </select>
                    {llmStatus?.configured && c.attachment && (
                      <button
                        onClick={() => onReparse(c)}
                        disabled={isReparsing}
                        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-brand text-white text-[11px] font-bold hover:bg-brand-hover disabled:opacity-60 shrink-0"
                      >
                        <I name={isReparsing ? "loader" : (c.parser ? "refresh-cw" : "sparkles")} size={10} className={isReparsing ? "animate-spin" : ""} />
                        {isReparsing ? "解析中" : (c.parser ? "重新解析" : "解析")}
                      </button>
                    )}
                    {c.jdMatch != null && <LiquidLoader size={36} level={c.jdMatch} label={c.jdMatch} />}
                    {c.parser && <AiBadge parser={c.parser} confidence={c.parserConfidence} />}
                    <StatusPill status={c.status} />
                  </div>
                </li>
              );})}
            </ul>
          )}
        </Card>

        {/* 即将到来的面试 */}
        <Card className="p-6">
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
                <li key={iv.id} className="p-3 rounded-xl bg-lightPrimary">
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
      </div>

      {/* === 分布统计 === */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="p-6">
          <h2 className="title-card">候选人状态分布</h2>
          <ul className="mt-4 space-y-2">
            {data.candidatesByStatus.map((r) => (
              <li key={r.status} className="flex items-center justify-between">
                <StatusPill status={r.status || "待筛选"} />
                <span className="text-sm font-bold text-navy-700">{r.count}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          <h2 className="title-card">入职员工阶段分布</h2>
          <ul className="mt-4 space-y-2">
            {data.employeesByStage.map((r) => (
              <li key={r.stage} className="flex items-center justify-between">
                <StagePill stage={r.stage || "待入职"} />
                <span className="text-sm font-bold text-navy-700">{r.count}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          <h2 className="title-card">岗位优先级</h2>
          <ul className="mt-4 space-y-2">
            {data.jobsByUrgency.map((r) => {
              const tone = URGENCY_TONE[r.urgency] || URGENCY_TONE.mid;
              return (
                <li key={r.urgency} className="flex items-center justify-between">
                  <span
                    className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold"
                    style={{ background: tone.bg, color: tone.fg }}
                  >
                    {tone.label}
                  </span>
                  <span className="text-sm font-bold text-navy-700">{r.count}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
