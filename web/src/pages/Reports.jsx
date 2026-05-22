import { useEffect, useState } from "react";
import { resources } from "../lib/api.js";
import {
  Card,
  StatusPill,
  StagePill,
  I,
  LoadingBlock,
  Empty,
  toast,
} from "../components/Primitives.jsx";
import { URGENCY_TONE } from "../lib/constants.js";

function Bar({ value, max, color }) {
  const pct = max ? (value / max) * 100 : 0;
  return (
    <div className="h-2.5 rounded-full bg-gray-200 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color || "#422AFB" }}></div>
    </div>
  );
}

export default function Reports() {
  const [overview, setOverview] = useState(null);

  useEffect(() => {
    resources.dashboard.overview().then(setOverview).catch((e) => toast(e.message, "error"));
  }, []);

  if (!overview) return <LoadingBlock height="h-64" />;

  const candMax = Math.max(...overview.candidatesByStatus.map((r) => r.count), 1);
  const stageMax = Math.max(...overview.employeesByStage.map((r) => r.count), 1);
  const urgMax = Math.max(...overview.jobsByUrgency.map((r) => r.count), 1);

  const TONES = ["#422AFB", "#22C55E", "#F59E0B", "#3B82F6", "#F53939", "#A0AEC0"];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {[
          { l: "候选人总量", v: overview.counts.candidates, c: "#422AFB", i: "users" },
          { l: "在招岗位", v: overview.counts.jobs, c: "#22C55E", i: "briefcase" },
          { l: "员工总数", v: overview.counts.employees, c: "#F59E0B", i: "users-round" },
          { l: "排期面试", v: overview.counts.interviewsScheduled, c: "#3B82F6", i: "calendar-check" },
        ].map((s) => (
          <Card key={s.l} className="p-5 relative overflow-hidden">
            <div
              className="absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-10"
              style={{ background: s.c }}
            ></div>
            <div className="flex items-center gap-3 relative">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: `${s.c}15`, color: s.c }}>
                <I name={s.i} size={24} />
              </div>
              <div>
                <p className="text-xs text-gray-700">{s.l}</p>
                <p className="text-2xl font-bold text-navy-700 mt-0.5">{s.v}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-6">
          <h3 className="title-card">候选人状态分布</h3>
          {overview.candidatesByStatus.length === 0 ? (
            <Empty title="暂无候选人" />
          ) : (
            <ul className="mt-4 space-y-3">
              {overview.candidatesByStatus.map((r, i) => (
                <li key={r.status}>
                  <div className="flex items-center justify-between mb-1.5">
                    <StatusPill status={r.status || "待筛选"} />
                    <span className="text-sm font-bold text-navy-700">{r.count}</span>
                  </div>
                  <Bar value={r.count} max={candMax} color={TONES[i % TONES.length]} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="title-card">员工阶段分布</h3>
          {overview.employeesByStage.length === 0 ? (
            <Empty title="还没有员工" />
          ) : (
            <ul className="mt-4 space-y-3">
              {overview.employeesByStage.map((r, i) => (
                <li key={r.stage}>
                  <div className="flex items-center justify-between mb-1.5">
                    <StagePill stage={r.stage || "待入职"} />
                    <span className="text-sm font-bold text-navy-700">{r.count}</span>
                  </div>
                  <Bar value={r.count} max={stageMax} color={TONES[i % TONES.length]} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="title-card">岗位优先级分布</h3>
        {overview.jobsByUrgency.length === 0 ? (
          <Empty title="暂无岗位" />
        ) : (
          <ul className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            {overview.jobsByUrgency.map((r) => {
              const tone = URGENCY_TONE[r.urgency] || URGENCY_TONE.mid;
              return (
                <li key={r.urgency} className="p-4 rounded-xl bg-lightPrimary">
                  <div className="flex items-center justify-between">
                    <span
                      className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold"
                      style={{ background: tone.bg, color: tone.fg }}
                    >
                      {tone.label}
                    </span>
                    <span className="text-xl font-bold text-navy-700">{r.count}</span>
                  </div>
                  <div className="mt-2.5">
                    <Bar value={r.count} max={urgMax} color={tone.fg} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
