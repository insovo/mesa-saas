import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { resources } from "../lib/api.js";
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
} from "../components/Primitives.jsx";
import { URGENCY_TONE } from "../lib/constants.js";

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    resources.dashboard
      .overview()
      .then(setData)
      .catch((e) => setErr(e.response?.data?.message || e.message));
  }, []);

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
              {data.recentCandidates.map((c) => (
                <li key={c.id} className="py-3 flex items-center gap-4">
                  <Avatar name={c.name} size={44} />
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/candidates/${c.externalId || c.id}`}
                      className="text-sm font-bold text-navy-700 hover:text-brand truncate block"
                    >
                      {c.name}
                    </Link>
                    <p className="text-xs text-gray-700 truncate mt-0.5">
                      {c.school || "—"} · {c.appliedFor || "未指派岗位"}
                    </p>
                    <div className="mt-1.5 flex gap-1.5 flex-wrap">
                      {(c.tags || []).slice(0, 3).map((t) => (
                        <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-lightPrimary text-gray-700">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <LiquidLoader size={48} level={c.jdMatch || 0} label={c.jdMatch || 0} />
                  <div className="hidden md:block w-32 text-right">
                    <StatusPill status={c.status} />
                    {c.parser && (
                      <div className="mt-1.5">
                        <AiBadge parser={c.parser} confidence={c.parserConfidence} />
                      </div>
                    )}
                  </div>
                </li>
              ))}
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
