import { useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useGSAP } from "@gsap/react";
import { resources } from "../lib/api.js";
import {
  Card,
  StagePill,
  I,
  LoadingBlock,
  Empty,
  toast,
} from "../components/Primitives.jsx";
import { STATUS_TONE, URGENCY_TONE } from "../lib/constants.js";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "../components/ui/chart.jsx";
import {
  Area,
  AreaChart,
  Bar as RBar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { gsap, ScrollTrigger, D, E, ensureMotionPref } from "../anim/gsap.js";

// ╔══════════════════════════════════════════════════════════════╗
// ║  共享小组件
// ╚══════════════════════════════════════════════════════════════╝

function Sparkline({ data, color = "var(--chart-1)", colorKey = "chart-1" }) {
  if (!data || data.length === 0) return <div className="h-10 w-full" />;
  const config = { value: { label: "数量", color } };
  return (
    <ChartContainer config={config} className="!aspect-auto h-10 w-full mt-2">
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`spark-grad-${colorKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#spark-grad-${colorKey})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}

// 数字滚动 0 → target (GSAP duration D.slow, ease expo.out)
function AnimatedNumber({ value, className }) {
  const ref = useRef(null);
  const prev = useRef(0);
  useGSAP(() => {
    if (!ref.current) return;
    const obj = { v: prev.current };
    const target = Number(value) || 0;
    gsap.to(obj, {
      v: target,
      duration: D.slow,
      ease: E.expo,
      onUpdate: () => {
        if (ref.current) ref.current.textContent = Math.round(obj.v).toLocaleString();
      },
      onComplete: () => { prev.current = target; },
    });
  }, { dependencies: [value] });
  return <span ref={ref} className={className}>{value.toLocaleString()}</span>;
}

function DeltaBadge({ delta }) {
  if (delta == null) return <span className="text-[11px] text-gray-400 font-bold">—</span>;
  const pct = (delta * 100).toFixed(1);
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-600">
        <I name="trending-up" size={11} />▲ {pct}%
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-red-500">
        <I name="trending-down" size={11} />▼ {Math.abs(pct)}%
      </span>
    );
  }
  return <span className="text-[11px] font-bold text-gray-500">0.0%</span>;
}

const KPI_META = {
  newResumes:   { icon: "file-text",     color: "#422AFB", chartVar: "--chart-1", key: "chart-1" },
  candidates:   { icon: "users",         color: "#22C55E", chartVar: "--chart-2", key: "chart-2" },
  activeJobs:   { icon: "briefcase",     color: "#F59E0B", chartVar: "--chart-3", key: "chart-3" },
  interviewing: { icon: "calendar-check", color: "#3B82F6", chartVar: "--chart-4", key: "chart-4" },
  onboarded:    { icon: "user-check",    color: "#8B5CF6", chartVar: "--chart-5", key: "chart-5" },
};

function KpiCard({ kpi, onClick, index }) {
  const meta = KPI_META[kpi.key] || KPI_META.candidates;
  const cardRef = useRef(null);
  // 入场: y 24 → 0, opacity 0 → 1, stagger by index, 涨/跌脉冲
  useGSAP(() => {
    if (!cardRef.current) return;
    gsap.fromTo(
      cardRef.current,
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, duration: D.base, ease: E.out, delay: index * 0.08 },
    );
    // 涨跌脉冲
    if (kpi.delta != null && Math.abs(kpi.delta) > 0.001) {
      const color = kpi.delta > 0 ? "rgba(34,197,94,0.22)" : "rgba(245,57,57,0.22)";
      gsap.fromTo(
        cardRef.current,
        { boxShadow: `0 0 0 0 ${color}` },
        { boxShadow: `0 0 0 0 ${color.replace(/0\.22/, "0")}`, duration: 1.4, ease: "power1.out", delay: index * 0.08 + 0.3 },
      );
    }
  }, { scope: cardRef, dependencies: [kpi.value, index] });

  return (
    <Card
      ref={cardRef}
      className="p-5 relative overflow-hidden cursor-pointer hover:shadow-lg transition group"
      onClick={onClick}
    >
      <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-10" style={{ background: meta.color }} />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: `${meta.color}15`, color: meta.color }}
            >
              <I name={meta.icon} size={18} />
            </div>
            <p className="text-xs text-gray-700 font-bold">{kpi.label}</p>
          </div>
          <DeltaBadge delta={kpi.delta} />
        </div>
        <p className="text-3xl font-bold text-navy-700 mt-3 leading-none">
          <AnimatedNumber value={kpi.value ?? 0} />
        </p>
        <p className="text-[11px] text-gray-500 mt-1.5">
          {kpi.prev == null ? "无对比数据" : `对比期 ${kpi.prev.toLocaleString()}`}
        </p>
        <Sparkline data={kpi.sparkline} color={`var(${meta.chartVar})`} colorKey={meta.key} />
        <span className="absolute right-3 bottom-3 text-[10px] text-gray-300 group-hover:text-brand transition">
          点击下钻 →
        </span>
      </div>
    </Card>
  );
}

function FunnelStage({ stage, maxCount, isLast, onClick, index, onEnter, onLeave }) {
  const tone = STATUS_TONE[stage.status] || STATUS_TONE["待筛选"];
  const pct = maxCount ? (stage.count / maxCount) * 100 : 0;
  const wrapRef = useRef(null);
  const barRef = useRef(null);

  useGSAP(() => {
    if (!wrapRef.current || !barRef.current) return;
    gsap.fromTo(
      wrapRef.current,
      { opacity: 0, x: -16 },
      { opacity: 1, x: 0, duration: D.base, ease: E.out, delay: (index || 0) * 0.06 },
    );
    gsap.fromTo(
      barRef.current,
      { width: "0%" },
      { width: `${Math.max(pct, 2)}%`, duration: D.slow, ease: E.expo, delay: (index || 0) * 0.06 + 0.1 },
    );
  }, { scope: wrapRef, dependencies: [pct, index] });

  return (
    <div
      ref={wrapRef}
      data-funnel-stage
      className="group cursor-pointer transition"
      onClick={onClick}
      onMouseEnter={() => onEnter?.(index)}
      onMouseLeave={() => onLeave?.()}
    >
      <div className="flex items-center gap-3 mb-1.5">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
          style={{ background: tone.bg, color: tone.fg }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone.dot }}></span>
          {stage.status}
        </span>
        <div className="flex-1 h-6 rounded-md bg-gray-100 overflow-hidden relative group-hover:ring-2 group-hover:ring-brand/30 transition">
          <div
            ref={barRef}
            className="h-full"
            style={{ width: "0%", background: tone.dot, opacity: 0.85 }}
          />
        </div>
        <span className="text-sm font-bold text-navy-700 w-12 text-right">{stage.count}</span>
        {stage.conversion != null ? (
          <span
            className="text-[10px] font-bold text-brand bg-brand/10 rounded-full px-2 py-0.5 w-16 text-center shrink-0"
            title="本阶段 / 上一阶段"
          >
            {(stage.conversion * 100).toFixed(0)}%
          </span>
        ) : (
          <span className="w-16 shrink-0" />
        )}
      </div>
      {!isLast && <div className="ml-3 -mt-0.5 mb-1.5 h-2 border-l-2 border-dashed border-gray-200" />}
    </div>
  );
}

function FunnelBypass({ stage, onClick }) {
  const tone = STATUS_TONE[stage.status] || STATUS_TONE["已淘汰"];
  return (
    <div
      className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100 cursor-pointer hover:bg-gray-100 transition"
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <I name="x-circle" size={14} className="text-gray-400" />
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
          style={{ background: tone.bg, color: tone.fg }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone.dot }}></span>
          {stage.status}
        </span>
      </div>
      <span className="text-sm font-bold text-navy-700">{stage.count}</span>
    </div>
  );
}

function Bar({ value, max, color }) {
  const pct = max ? (value / max) * 100 : 0;
  return (
    <div className="h-2.5 rounded-full bg-gray-200 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color || "#422AFB" }} />
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  顶部筛选区 — 时间 Tab + JD 多选 + 部门多选 + URL Query
// ╚══════════════════════════════════════════════════════════════╝

const RANGE_PRESETS = [
  { key: "today",   label: "今日" },
  { key: "week",    label: "本周" },
  { key: "month",   label: "本月" },
  { key: "quarter", label: "本季度" },
  { key: "year",    label: "本年" },
];

function FilterBar({ params, setParams, jobs, depts, onRefresh, onExport }) {
  const range = params.get("range") || "month";
  const selectedJobs = (params.get("jobIds") || "").split(",").filter(Boolean);
  const selectedDepts = (params.get("deptIds") || "").split(",").filter(Boolean);
  const [showJobs, setShowJobs] = useState(false);
  const [showDepts, setShowDepts] = useState(false);
  const [jobSearch, setJobSearch] = useState("");

  function setRange(r) {
    const p = new URLSearchParams(params);
    p.set("range", r);
    setParams(p, { replace: true });
  }
  function toggleId(field, id) {
    const current = (params.get(field) || "").split(",").filter(Boolean);
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    const p = new URLSearchParams(params);
    if (next.length) p.set(field, next.join(","));
    else p.delete(field);
    setParams(p, { replace: true });
  }
  function clearField(field) {
    const p = new URLSearchParams(params);
    p.delete(field);
    setParams(p, { replace: true });
  }

  const filteredJobs = useMemo(
    () => jobs.filter((j) => !jobSearch || (j.title || "").toLowerCase().includes(jobSearch.toLowerCase())),
    [jobs, jobSearch],
  );

  return (
    <Card className="p-3 sticky top-0 z-30 bg-white/95 backdrop-blur">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {RANGE_PRESETS.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                range === r.key
                  ? "bg-white text-brand shadow-sm"
                  : "text-gray-700 hover:text-navy-700"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <button
              onClick={() => { setShowJobs(!showJobs); setShowDepts(false); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition flex items-center gap-1.5 ${
                selectedJobs.length > 0
                  ? "border-brand text-brand bg-brand/5"
                  : "border-gray-200 text-gray-700 hover:border-gray-300"
              }`}
            >
              <I name="briefcase" size={12} />
              JD
              {selectedJobs.length > 0 && (
                <span className="ml-1 px-1.5 py-0 rounded-full bg-brand text-white text-[10px]">{selectedJobs.length}</span>
              )}
              <I name={showJobs ? "chevron-up" : "chevron-down"} size={12} />
            </button>
            {showJobs && (
              <div className="absolute right-0 mt-1 w-72 bg-white rounded-xl border border-gray-200 shadow-xl z-50 p-3">
                <input
                  type="text"
                  placeholder="搜索岗位..."
                  value={jobSearch}
                  onChange={(e) => setJobSearch(e.target.value)}
                  className="w-full h-8 px-2 rounded-md border border-gray-200 text-xs outline-none focus:border-brand mb-2"
                />
                <div className="flex items-center justify-between text-[10px] text-gray-500 mb-2 px-1">
                  <span>{filteredJobs.length} 条</span>
                  <button onClick={() => clearField("jobIds")} className="text-brand hover:underline">清空</button>
                </div>
                <ul className="max-h-64 overflow-y-auto space-y-0.5">
                  {filteredJobs.map((j) => (
                    <li
                      key={j.id}
                      onClick={() => toggleId("jobIds", j.id)}
                      className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-lightPrimary cursor-pointer text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={selectedJobs.includes(j.id)}
                        readOnly
                        className="rounded"
                      />
                      <span className="text-navy-700 truncate flex-1">{j.title}</span>
                      {j.dept && <span className="text-[10px] text-gray-500 shrink-0">{j.dept}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => { setShowDepts(!showDepts); setShowJobs(false); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition flex items-center gap-1.5 ${
                selectedDepts.length > 0
                  ? "border-brand text-brand bg-brand/5"
                  : "border-gray-200 text-gray-700 hover:border-gray-300"
              }`}
            >
              <I name="users-round" size={12} />
              部门
              {selectedDepts.length > 0 && (
                <span className="ml-1 px-1.5 py-0 rounded-full bg-brand text-white text-[10px]">{selectedDepts.length}</span>
              )}
              <I name={showDepts ? "chevron-up" : "chevron-down"} size={12} />
            </button>
            {showDepts && (
              <div className="absolute right-0 mt-1 w-72 bg-white rounded-xl border border-gray-200 shadow-xl z-50 p-3">
                <div className="flex items-center justify-between text-[10px] text-gray-500 mb-2 px-1">
                  <span>{depts.length} 个部门</span>
                  <button onClick={() => clearField("deptIds")} className="text-brand hover:underline">清空</button>
                </div>
                <ul className="max-h-64 overflow-y-auto space-y-0.5">
                  {depts.map((d) => (
                    <li
                      key={d.id}
                      onClick={() => toggleId("deptIds", d.id)}
                      className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-lightPrimary cursor-pointer text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={selectedDepts.includes(d.id)}
                        readOnly
                        className="rounded"
                      />
                      <span className="text-navy-700 truncate flex-1">{d.name}</span>
                      {d.code && <span className="text-[10px] text-gray-500 shrink-0">{d.code}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <button
            onClick={onRefresh}
            title="刷新"
            className="w-8 h-8 rounded-lg border border-gray-200 hover:border-brand hover:text-brand transition flex items-center justify-center"
          >
            <I name="refresh-cw" size={13} />
          </button>
          <button
            onClick={onExport}
            title="导出 CSV"
            className="w-8 h-8 rounded-lg border border-gray-200 hover:border-brand hover:text-brand transition flex items-center justify-center"
          >
            <I name="download" size={13} />
          </button>
        </div>
      </div>
    </Card>
  );
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  JD 维度表格
// ╚══════════════════════════════════════════════════════════════╝

const STAGE_COLORS = ["#A3AED0", "#3B82F6", "#422AFB", "#EAB308", "#F97316", "#22C55E"];

function ByJobTable({ items, onRowClick }) {
  if (!items || items.length === 0) {
    return <Empty title="暂无 JD 数据" icon="briefcase" />;
  }
  const maxTotal = Math.max(...items.map((i) => i.total), 1);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-100">
            <th className="py-2.5 px-2 font-bold">JD</th>
            <th className="py-2.5 px-2 font-bold">部门</th>
            <th className="py-2.5 px-2 font-bold text-right">总数</th>
            <th className="py-2.5 px-2 font-bold">阶段分布</th>
            <th className="py-2.5 px-2 font-bold text-right">平均处理 (天)</th>
            <th className="py-2.5 px-2 font-bold text-right">较上期</th>
          </tr>
        </thead>
        <tbody>
          {items.map((j) => (
            <tr
              key={j.id}
              onClick={() => onRowClick(j)}
              className="border-b border-gray-50 hover:bg-lightPrimary/40 cursor-pointer transition"
            >
              <td className="py-2.5 px-2 text-navy-700 font-bold max-w-[200px] truncate">{j.title}</td>
              <td className="py-2.5 px-2 text-gray-700">{j.dept}</td>
              <td className="py-2.5 px-2 text-right font-bold text-navy-700">
                <div className="inline-block w-12">{j.total}</div>
                <div className="inline-block w-16 ml-2 align-middle">
                  <Bar value={j.total} max={maxTotal} color="#422AFB" />
                </div>
              </td>
              <td className="py-2.5 px-2">
                <div className="flex items-center gap-0.5 h-3 w-[120px] rounded-sm overflow-hidden bg-gray-50">
                  {Object.entries(j.byStatus || {}).map(([s, c]) => {
                    if (!c) return null;
                    const w = j.total ? (c / j.total) * 100 : 0;
                    const tone = STATUS_TONE[s] || STATUS_TONE["待筛选"];
                    return (
                      <div
                        key={s}
                        title={`${s}: ${c}`}
                        style={{ width: `${w}%`, background: tone.dot }}
                        className="h-full"
                      />
                    );
                  })}
                </div>
              </td>
              <td className="py-2.5 px-2 text-right text-gray-700">{j.avgDays ?? "—"}</td>
              <td className="py-2.5 px-2 text-right">
                <DeltaBadge delta={j.delta} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  部门维度卡片矩阵 + 对比柱状图
// ╚══════════════════════════════════════════════════════════════╝

function ByDeptGrid({ items, onCardClick }) {
  if (!items || items.length === 0) {
    return <Empty title="暂无部门数据" icon="users-round" />;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {items.map((d) => (
        <Card
          key={d.id}
          className="p-4 cursor-pointer hover:shadow-lg transition relative overflow-hidden"
          onClick={() => onCardClick(d)}
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-bold text-navy-700">{d.name}</h4>
            <DeltaBadge delta={d.delta} />
          </div>
          <p className="text-[10px] text-gray-500 mb-3">{d.head ? `负责人 · ${d.head}` : "未指定负责人"}</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xl font-bold text-navy-700 leading-none">{d.total}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">候选人</p>
            </div>
            <div>
              <p className="text-xl font-bold text-amber-600 leading-none">{d.activeJobs}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">在招 JD</p>
            </div>
            <div>
              <p className="text-xl font-bold text-emerald-600 leading-none">{d.onboarded}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">入职</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function DeptCompareBar({ items }) {
  if (!items || items.length === 0) return null;
  const data = items.slice(0, 10).map((d) => ({
    name: d.name.length > 6 ? d.name.slice(0, 6) + "…" : d.name,
    候选人: d.total,
    入职: d.onboarded,
  }));
  const config = {
    候选人: { label: "候选人", color: "var(--chart-1)" },
    入职: { label: "入职", color: "var(--chart-2)" },
  };
  return (
    <ChartContainer config={config} className="!aspect-auto h-56 w-full">
      <BarChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#E9ECEF" />
        <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "#A0AEC0", fontSize: 11 }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: "#A0AEC0", fontSize: 10 }} width={28} />
        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
        <RBar dataKey="候选人" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
        <RBar dataKey="入职" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  下钻抽屉
// ╚══════════════════════════════════════════════════════════════╝

function exportCsv(drilldown) {
  if (!drilldown || !drilldown.items.length) return;
  const header = ["姓名", "电话", "邮箱", "关联JD", "部门", "阶段", "更新时间"];
  const rows = drilldown.items.map((c) => [
    c.name, c.phone || "", c.email || "", c.jobTitle, c.deptName, c.status || "", c.enteredAt || ""
  ]);
  const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mesa-drilldown-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function DrilldownDrawer({ open, onClose, drilldown, loading }) {
  const maskRef = useRef(null);
  const panelRef = useRef(null);
  useGSAP(() => {
    if (!open) return;
    const tl = gsap.timeline();
    if (maskRef.current) tl.fromTo(maskRef.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: D.fast });
    if (panelRef.current)
      tl.fromTo(panelRef.current, { xPercent: 100 }, { xPercent: 0, duration: D.base, ease: E.out }, "<");
    tl.fromTo(
      "[data-drawer-row]",
      { opacity: 0, x: 16 },
      { opacity: 1, x: 0, duration: D.fast, ease: E.out, stagger: 0.03 },
      "-=0.1",
    );
  }, { dependencies: [open, drilldown] });
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <div ref={maskRef} className="flex-1 bg-black/30" onClick={onClose} />
      <div ref={panelRef} className="w-full max-w-[60vw] bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <p className="text-[11px] text-gray-500">数据报表 / 下钻</p>
            <h3 className="text-lg font-bold text-navy-700">{drilldown?.label || "—"}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportCsv(drilldown)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:border-brand hover:text-brand transition text-xs font-bold flex items-center gap-1.5"
            >
              <I name="download" size={12} /> 导出 CSV
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 transition flex items-center justify-center">
              <I name="x" size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <LoadingBlock height="h-32" />
          ) : !drilldown || drilldown.items.length === 0 ? (
            <Empty title="此维度暂无候选人" />
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="py-2 px-2 font-bold">姓名</th>
                  <th className="py-2 px-2 font-bold">联系方式</th>
                  <th className="py-2 px-2 font-bold">关联 JD</th>
                  <th className="py-2 px-2 font-bold">所属部门</th>
                  <th className="py-2 px-2 font-bold">阶段</th>
                  <th className="py-2 px-2 font-bold">更新时间</th>
                </tr>
              </thead>
              <tbody>
                {drilldown.items.map((c) => {
                  const tone = STATUS_TONE[c.status] || STATUS_TONE["待筛选"];
                  return (
                    <tr key={c.id} data-drawer-row className="border-b border-gray-50 hover:bg-lightPrimary/40">
                      <td className="py-2 px-2 text-navy-700 font-bold">
                        <a href={`/candidates/${c.id}`} target="_blank" rel="noreferrer" className="hover:text-brand">
                          {c.name}
                        </a>
                      </td>
                      <td className="py-2 px-2 text-gray-700">
                        <div>{c.phone || "—"}</div>
                        <div className="text-[10px] text-gray-500">{c.email || ""}</div>
                      </td>
                      <td className="py-2 px-2 text-gray-700 max-w-[180px] truncate">{c.jobTitle}</td>
                      <td className="py-2 px-2 text-gray-700">{c.deptName}</td>
                      <td className="py-2 px-2">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ background: tone.bg, color: tone.fg }}
                        >
                          {c.status || "待筛选"}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-gray-700">
                        {c.enteredAt ? new Date(c.enteredAt).toLocaleString() : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  趋势图(chip 多选 + 对比模式占位)
// ╚══════════════════════════════════════════════════════════════╝

function TrendCard({ report }) {
  const [selected, setSelected] = useState(["newResumes", "candidates"]);
  const [compare, setCompare] = useState(false);

  function toggleSeries(k) {
    if (selected.includes(k)) {
      setSelected(selected.filter((x) => x !== k));
    } else if (selected.length < 3) {
      setSelected([...selected, k]);
    } else {
      toast("最多选 3 条曲线", "info");
    }
  }

  const baseSpark = report.kpis.find((k) => k.sparkline && k.sparkline.length > 0)?.sparkline || [];
  const trendData = baseSpark.map((_, i) => {
    const row = { dayLabel: baseSpark[i].label, key: baseSpark[i].key };
    for (const k of report.kpis) {
      row[k.key] = k.sparkline[i]?.value ?? 0;
    }
    return row;
  });
  const config = Object.fromEntries(
    report.kpis.map((k) => [k.key, { label: k.label, color: `var(${KPI_META[k.key].chartVar})` }]),
  );

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 className="title-card flex items-center gap-2">
            <I name="line-chart" size={18} className="text-brand" />
            趋势分析
          </h3>
          <p className="text-[11px] text-gray-500 mt-1">{report.range.label} · 粒度 {report.range.sparkUnit}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {report.kpis.map((k) => {
            const meta = KPI_META[k.key];
            const on = selected.includes(k.key);
            return (
              <button
                key={k.key}
                onClick={() => toggleSeries(k.key)}
                className="px-2.5 py-1 rounded-full text-[11px] font-bold border transition flex items-center gap-1"
                style={{
                  background: on ? meta.color : "white",
                  color: on ? "white" : meta.color,
                  borderColor: meta.color,
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: on ? "white" : meta.color }} />
                {k.label}
              </button>
            );
          })}
          <button
            onClick={() => setCompare(!compare)}
            className={`ml-2 px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
              compare
                ? "bg-brand text-white border-brand"
                : "border-gray-200 text-gray-500 hover:text-brand"
            }`}
            title="对比上一周期(浅色虚线叠加)"
          >
            对比模式
          </button>
        </div>
      </div>
      {trendData.length === 0 || selected.length === 0 ? (
        <Empty title={selected.length === 0 ? "请至少选一条曲线" : "无趋势数据"} icon="line-chart" />
      ) : (
        <ChartContainer config={config} className="!aspect-auto h-72 w-full">
          <AreaChart data={trendData} margin={{ top: 10, right: 12, left: 12, bottom: 0 }}>
            <defs>
              {Object.entries(KPI_META).map(([key, meta]) => (
                <linearGradient key={key} id={`trend-grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={`var(${meta.chartVar})`} stopOpacity={0.7} />
                  <stop offset="95%" stopColor={`var(${meta.chartVar})`} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#E9ECEF" />
            <XAxis
              dataKey="dayLabel"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fill: "#A0AEC0", fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <ChartTooltip
              cursor={{ stroke: "#A3AED0", strokeWidth: 1, strokeDasharray: "3 3" }}
              content={<ChartTooltipContent indicator="dot" labelFormatter={(label) => label} />}
            />
            {selected.map((k) => (
              <Area
                key={k}
                dataKey={k}
                type="natural"
                fill={`url(#trend-grad-${k})`}
                stroke={`var(${KPI_META[k].chartVar})`}
                strokeWidth={2}
                isAnimationActive={true}
                animationDuration={650}
              />
            ))}
          </AreaChart>
        </ChartContainer>
      )}
      {compare && (
        <p className="text-[11px] text-amber-700 mt-3 flex items-center gap-1">
          <I name="info" size={11} /> 对比模式数据加载中… (二期完善)
        </p>
      )}
    </Card>
  );
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  主页面
// ╚══════════════════════════════════════════════════════════════╝

export default function Reports() {
  const [params, setParams] = useSearchParams();
  const [report, setReport] = useState(null);
  const [byJob, setByJob] = useState(null);
  const [byDept, setByDept] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [depts, setDepts] = useState([]);
  const [drillOpen, setDrillOpen] = useState(false);
  const [drilldown, setDrilldown] = useState(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const pageRef = useRef(null);

  // GSAP: prefers-reduced-motion 适配 + JD/部门区 ScrollTrigger 进入视口入场
  useGSAP(() => {
    ensureMotionPref();
    // 等数据 + DOM 都 ready 后启 ScrollTrigger
    if (!report || !byJob || !byDept) return;
    const triggers = [];
    document.querySelectorAll("[data-scroll-reveal]").forEach((el) => {
      gsap.set(el, { opacity: 0, y: 32 });
      const tr = ScrollTrigger.create({
        trigger: el,
        start: "top 85%",
        once: true,
        onEnter: () => gsap.to(el, { opacity: 1, y: 0, duration: D.base, ease: E.out }),
      });
      triggers.push(tr);
    });
    return () => { triggers.forEach((t) => t.kill()); };
  }, { dependencies: [report, byJob, byDept] });

  const queryParams = useMemo(() => {
    const q = {};
    const r = params.get("range");
    if (r) q.range = r;
    const f = params.get("from");
    const t = params.get("to");
    if (f) q.from = f;
    if (t) q.to = t;
    const j = params.get("jobIds");
    const d = params.get("deptIds");
    if (j) q.jobIds = j;
    if (d) q.deptIds = d;
    return q;
  }, [params]);

  async function loadAll() {
    try {
      const [overview, jobsData, deptsData] = await Promise.all([
        resources.reports.overview(queryParams),
        resources.reports.byJob(queryParams),
        resources.reports.byDepartment(queryParams),
      ]);
      setReport(overview);
      setByJob(jobsData);
      setByDept(deptsData);
    } catch (e) {
      toast(e.message || "加载失败", "error");
    }
  }

  useEffect(() => {
    Promise.all([
      resources.jobs.list({ take: 200 }).then((d) => d.items || []),
      resources.departments.list().then((d) => d.items || []),
    ])
      .then(([js, ds]) => {
        setJobs(js);
        setDepts(ds);
      })
      .catch((e) => toast(e.message, "error"));
  }, []);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParams.range, queryParams.from, queryParams.to, queryParams.jobIds, queryParams.deptIds]);

  async function openDrill(dimension, key) {
    setDrillOpen(true);
    setDrillLoading(true);
    setDrilldown(null);
    try {
      const data = await resources.reports.drilldown({ ...queryParams, dimension, key });
      setDrilldown(data);
    } catch (e) {
      toast(e.message || "下钻失败", "error");
    } finally {
      setDrillLoading(false);
    }
  }

  if (!report) return <LoadingBlock height="h-64" />;

  const funnelMax = Math.max(...report.funnel.main.map((s) => s.count), 1);
  const stageMax = Math.max(...report.employeesByStage.map((r) => r.count), 1);
  const urgMax = Math.max(...report.jobsByUrgency.map((r) => r.count), 1);

  function onExport() {
    if (!report) return;
    const header = ["指标", "本期", "对比期", "环比%"];
    const rows = report.kpis.map((k) => [k.label, k.value, k.prev ?? "—", k.delta == null ? "—" : (k.delta * 100).toFixed(1)]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v)}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mesa-reports-${report.range.label}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <FilterBar
        params={params}
        setParams={setParams}
        jobs={jobs}
        depts={depts}
        onRefresh={loadAll}
        onExport={onExport}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5">
        {report.kpis.map((kpi, i) => (
          <KpiCard key={kpi.key} kpi={kpi} onClick={() => openDrill("kpi", kpi.key)} index={i} />
        ))}
      </div>

      <TrendCard report={report} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="title-card flex items-center gap-2">
              <I name="filter" size={18} className="text-brand" />
              招聘漏斗
            </h3>
            <span className="text-[11px] text-gray-500">点击阶段下钻</span>
          </div>
          {report.funnel.main.every((s) => s.count === 0) ? (
            <Empty title="暂无候选人" icon="users" />
          ) : (
            <div>
              {report.funnel.main.map((s, i) => (
                <FunnelStage
                  key={s.status}
                  stage={s}
                  maxCount={funnelMax}
                  isLast={i === report.funnel.main.length - 1}
                  onClick={() => openDrill("funnel", s.status)}
                  index={i}
                  onEnter={(idx) => gsap.to("[data-funnel-stage]", {
                    opacity: (i) => i === idx ? 1 : 0.35,
                    duration: D.fast,
                  })}
                  onLeave={() => gsap.to("[data-funnel-stage]", { opacity: 1, duration: D.fast })}
                />
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="title-card flex items-center gap-2 mb-4">
            <I name="alert-octagon" size={18} className="text-red-400" />
            旁路阶段
          </h3>
          <div className="space-y-2">
            {report.funnel.bypass.map((s) => (
              <FunnelBypass key={s.status} stage={s} onClick={() => openDrill("funnel", s.status)} />
            ))}
          </div>
          <p className="text-[11px] text-gray-500 mt-4 leading-relaxed">
            "已淘汰"不计入漏斗主流转化率,但占用候选人总量统计。
          </p>
        </Card>
      </div>

      <Card className="p-6" data-scroll-reveal>
        <div className="flex items-center justify-between mb-4">
          <h3 className="title-card flex items-center gap-2">
            <I name="briefcase" size={18} className="text-brand" />
            JD 维度分析
          </h3>
          <span className="text-[11px] text-gray-500">点击行下钻</span>
        </div>
        <ByJobTable items={byJob?.items || []} onRowClick={(j) => openDrill("job", j.id)} />
      </Card>

      <Card className="p-6" data-scroll-reveal>
        <div className="flex items-center justify-between mb-4">
          <h3 className="title-card flex items-center gap-2">
            <I name="users-round" size={18} className="text-brand" />
            部门维度分析
          </h3>
          <span className="text-[11px] text-gray-500">点击卡片下钻</span>
        </div>
        <ByDeptGrid items={byDept?.items || []} onCardClick={(d) => openDrill("dept", d.id)} />
        {byDept?.items && byDept.items.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <h4 className="text-sm font-bold text-navy-700 mb-3">部门对比 (Top 10)</h4>
            <DeptCompareBar items={byDept.items} />
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-6">
          <h3 className="title-card flex items-center gap-2">
            <I name="badge-check" size={18} className="text-brand" />
            员工阶段分布
          </h3>
          {report.employeesByStage.length === 0 ? (
            <Empty title="还没有员工" />
          ) : (
            <ul className="mt-4 space-y-3">
              {report.employeesByStage.map((r, i) => (
                <li key={r.stage || `s-${i}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <StagePill stage={r.stage || "待入职"} />
                    <span className="text-sm font-bold text-navy-700">{r.count}</span>
                  </div>
                  <Bar value={r.count} max={stageMax} color={STAGE_COLORS[i % STAGE_COLORS.length]} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="title-card flex items-center gap-2">
            <I name="flame" size={18} className="text-brand" />
            岗位优先级分布
          </h3>
          {report.jobsByUrgency.length === 0 ? (
            <Empty title="暂无岗位" />
          ) : (
            <ul className="mt-4 space-y-3">
              {report.jobsByUrgency.map((r) => {
                const tone = URGENCY_TONE[r.urgency] || URGENCY_TONE.mid;
                return (
                  <li key={r.urgency}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold"
                        style={{ background: tone.bg, color: tone.fg }}
                      >
                        {tone.label}
                      </span>
                      <span className="text-sm font-bold text-navy-700">{r.count}</span>
                    </div>
                    <Bar value={r.count} max={urgMax} color={tone.fg} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <DrilldownDrawer
        open={drillOpen}
        onClose={() => setDrillOpen(false)}
        drilldown={drilldown}
        loading={drillLoading}
      />
    </div>
  );
}
