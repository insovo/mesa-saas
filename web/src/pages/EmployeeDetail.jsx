import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { resources } from "../lib/api.js";
import {
  Card,
  Avatar,
  StagePill,
  TaskStatusPill,
  AiBadge,
  Tag,
  I,
  Empty,
  LoadingBlock,
  Button,
} from "../components/Primitives.jsx";
import { HIRE_CHECKLIST_KEYS } from "../lib/constants.js";

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function EmployeeDetail() {
  const { id } = useParams();
  const [emp, setEmp] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    resources.employees
      .detail(id)
      .then(setEmp)
      .catch((e) => setErr(e.response?.data?.message || e.message));
  }, [id]);

  if (err) return <Card className="p-6 text-red-500 text-sm">{err}</Card>;
  if (!emp) return <LoadingBlock label="加载员工档案..." height="h-64" />;

  const cl = emp.checklist || {};
  const prob = emp.probation || {};
  const events = emp.events || [];
  const risks = emp.riskItems || [];

  return (
    <div className="space-y-6">
      <Card className="p-7">
        <div className="flex items-start gap-6 flex-wrap">
          <Avatar name={emp.name} animal={emp.animal} src={emp.avatar} size={88} />
          <div className="flex-1 min-w-[260px]">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold text-navy-700">{emp.name}</h1>
              <StagePill stage={emp.stage || "待入职"} size="md" />
              {emp.parser && <AiBadge parser={emp.parser} confidence={emp.parserConfidence} />}
            </div>
            <p className="text-sm text-gray-700 mt-2">
              {[emp.appliedFor, emp.dept, emp.level, emp.workLocation].filter(Boolean).join(" · ")}
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-xs text-gray-700">
              <span className="flex items-center gap-1"><I name="user-check" size={12} /> 主管 {emp.directManager || "—"}</span>
              <span className="flex items-center gap-1"><I name="user-cog" size={12} /> HRBP {emp.hrbp || "—"}</span>
              <span className="flex items-center gap-1"><I name="calendar-plus" size={12} /> 计划入职 {fmtDate(emp.plannedHireDate)}</span>
              <span className="flex items-center gap-1"><I name="calendar-check" size={12} /> 实际入职 {fmtDate(emp.actualHireDate)}</span>
              <span className="flex items-center gap-1"><I name="calendar-x" size={12} /> 试用截止 {fmtDate(emp.probationEndDate)}</span>
            </div>
            <div className="flex gap-1.5 mt-3 flex-wrap">
              {(emp.tags || []).map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* === Onboarding Checklist === */}
      <Card className="p-6">
        <h3 className="title-card flex items-center gap-2">
          <I name="list-checks" size={18} className="text-brand" />
          入职清单
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
          {HIRE_CHECKLIST_KEYS.map((k) => {
            const item = cl[k.key] || {};
            return (
              <div key={k.key} className="p-4 rounded-xl bg-lightPrimary">
                <div className="flex items-center gap-2">
                  <I name={k.icon} size={16} className="text-brand" />
                  <span className="text-sm font-bold text-navy-700">{k.label}</span>
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <TaskStatusPill status={item.status || "待开始"} />
                  <span className="text-[11px] text-gray-700">{item.date || "—"}</span>
                </div>
                {item.note && <p className="text-[11px] text-gray-700 mt-2 line-clamp-2">{item.note}</p>}
                {item.owner && <p className="text-[11px] text-gray-600 mt-1">负责人 · {item.owner}</p>}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* === 试用期 === */}
        <Card className="p-6">
          <h3 className="title-card">试用期评估</h3>
          <ul className="mt-4 space-y-3">
            {["day30", "day60", "day90"].map((k) => {
              const p = prob[k] || {};
              const labels = { day30: "30 天", day60: "60 天", day90: "90 天" };
              return (
                <li key={k} className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-lightPrimary flex items-center justify-center text-xs font-bold text-brand">
                    {labels[k]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-navy-700">{fmtDate(p.date)}</span>
                      <TaskStatusPill status={p.status || "待开始"} />
                    </div>
                    {p.notes && <p className="text-xs text-gray-700 mt-1">{p.notes}</p>}
                    {p.completion != null && (
                      <div className="mt-1.5 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                        <div className="h-full bg-brand" style={{ width: `${Math.round(p.completion * 100)}%` }}></div>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* === 风险跟进 === */}
        <Card className="p-6">
          <h3 className="title-card flex items-center gap-2">
            <I name="alert-triangle" size={18} className="text-amber-500" />
            风险与跟进
          </h3>
          {risks.length === 0 ? (
            <Empty title="暂无风险项" desc="自动转正前会再次评估" />
          ) : (
            <ul className="mt-4 space-y-3">
              {risks.map((r, i) => (
                <li key={i} className="p-3 rounded-xl border border-gray-200">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-navy-700">{r.item}</p>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">
                      {r.level || "—"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-gray-700">
                    <span>负责人 · {r.owner || "—"}</span>
                    <span>截止 · {r.dueDate || "—"}</span>
                    <TaskStatusPill status={r.status || "待开始"} />
                  </div>
                  {r.action && <p className="text-[11px] text-gray-700 mt-1">行动 · {r.action}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* === 关键事件 === */}
      <Card className="p-6">
        <h3 className="title-card">关键事件</h3>
        {events.length === 0 ? (
          <Empty title="尚无事件" />
        ) : (
          <ul className="mt-4 space-y-3">
            {events.map((ev, i) => (
              <li key={i} className="flex gap-4">
                <div className="w-1 rounded-full bg-brand-gradient-v shrink-0"></div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-navy-700">{ev.title}</p>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-50 text-brand font-bold">
                      {ev.type}
                    </span>
                  </div>
                  <p className="text-xs text-gray-700 mt-1">{ev.desc || "—"}</p>
                  <div className="flex gap-4 mt-1 text-[11px] text-gray-600">
                    <span>{ev.date}</span>
                    <span>负责人 · {ev.owner || "—"}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Link to="/staff" className="text-sm text-brand hover:underline inline-flex items-center gap-1">
        <I name="arrow-left" size={14} />
        返回员工列表
      </Link>
    </div>
  );
}
