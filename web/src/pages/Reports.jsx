import { useEffect, useState } from "react";
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
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

// ╔══════════════════════════════════════════════════════════════╗
// ║  小组件:Sparkline(shadcn AreaChart mini) / KPI 卡 / 漏斗段 / 横条
// ╚══════════════════════════════════════════════════════════════╝

function Sparkline({ data, color = "var(--chart-1)", colorKey = "chart-1" }) {
  if (!data || data.length === 0) {
    return <div className="h-10 w-full" />;
  }
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

function DeltaBadge({ delta }) {
  if (delta == null) {
    return <span className="text-[11px] text-gray-400 font-bold">—</span>;
  }
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

// 五卡色对齐 index.css 的 --chart-1 ~ --chart-5,sparkline 直接吃 CSS 变量
const KPI_META = {
  newResumes:   { icon: "file-text",     color: "#422AFB", chartVar: "--chart-1", key: "chart-1" },
  candidates:   { icon: "users",         color: "#22C55E", chartVar: "--chart-2", key: "chart-2" },
  activeJobs:   { icon: "briefcase",     color: "#F59E0B", chartVar: "--chart-3", key: "chart-3" },
  interviewing: { icon: "calendar-check", color: "#3B82F6", chartVar: "--chart-4", key: "chart-4" },
  onboarded:    { icon: "user-check",    color: "#8B5CF6", chartVar: "--chart-5", key: "chart-5" },
};

function KpiCard({ kpi }) {
  const meta = KPI_META[kpi.key] || KPI_META.candidates;
  return (
    <Card className="p-5 relative overflow-hidden">
      <div
        className="absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-10"
        style={{ background: meta.color }}
      ></div>
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
          {(kpi.value ?? 0).toLocaleString()}
        </p>
        <p className="text-[11px] text-gray-500 mt-1.5">
          {kpi.prev == null ? "无对比数据" : `上月同期 ${kpi.prev.toLocaleString()}`}
        </p>
        <Sparkline data={kpi.sparkline} color={`var(${meta.chartVar})`} colorKey={meta.key} />
      </div>
    </Card>
  );
}

function FunnelStage({ stage, maxCount, isLast }) {
  const tone = STATUS_TONE[stage.status] || STATUS_TONE["待筛选"];
  const pct = maxCount ? (stage.count / maxCount) * 100 : 0;
  return (
    <div className="group">
      <div className="flex items-center gap-3 mb-1.5">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
          style={{ background: tone.bg, color: tone.fg }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone.dot }}></span>
          {stage.status}
        </span>
        <div className="flex-1 h-6 rounded-md bg-gray-100 overflow-hidden relative">
          <div
            className="h-full transition-all"
            style={{
              width: `${Math.max(pct, 2)}%`,
              background: tone.dot,
              opacity: 0.85,
            }}
          ></div>
        </div>
        <span className="text-sm font-bold text-navy-700 w-12 text-right">{stage.count}</span>
        {stage.conversion != null && (
          <span
            className="text-[10px] font-bold text-brand bg-brand/10 rounded-full px-2 py-0.5 w-16 text-center shrink-0"
            title="本阶段 / 上一阶段"
          >
            {(stage.conversion * 100).toFixed(0)}%
          </span>
        )}
        {stage.conversion == null && (
          <span className="w-16 shrink-0" />
        )}
      </div>
      {!isLast && (
        <div className="ml-3 -mt-0.5 mb-1.5 h-2 border-l-2 border-dashed border-gray-200"></div>
      )}
    </div>
  );
}

function FunnelBypass({ stage }) {
  const tone = STATUS_TONE[stage.status] || STATUS_TONE["已淘汰"];
  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
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
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color || "#422AFB" }}></div>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  主页面
// ╚══════════════════════════════════════════════════════════════╝

export default function Reports() {
  const [report, setReport] = useState(null);

  useEffect(() => {
    resources.reports.overview().then(setReport).catch((e) => toast(e.message, "error"));
  }, []);

  if (!report) return <LoadingBlock height="h-64" />;

  const funnelMax = Math.max(...report.funnel.main.map((s) => s.count), 1);
  const stageMax = Math.max(...report.employeesByStage.map((r) => r.count), 1);
  const urgMax = Math.max(...report.jobsByUrgency.map((r) => r.count), 1);

  // 主趋势图数据 — 合并 newResumes + candidates 的 sparkline,按 day 对齐
  const newSp = report.kpis.find((k) => k.key === "newResumes")?.sparkline || [];
  const candSp = report.kpis.find((k) => k.key === "candidates")?.sparkline || [];
  const trendData = newSp.map((d, i) => ({
    day: d.day,
    dayLabel: d.day.slice(5).replace("-", "/"),  // "05/13"
    newResumes: d.value,
    candidates: candSp[i]?.value || 0,
  }));
  const trendConfig = {
    newResumes: { label: "新增简历", color: "var(--chart-1)" },
    candidates: { label: "候选人总量", color: "var(--chart-2)" },
  };
  const trendTotal = trendData.reduce(
    (acc, d) => ({
      newResumes: acc.newResumes + d.newResumes,
      candidates: acc.candidates + d.candidates,
    }),
    { newResumes: 0, candidates: 0 },
  );

  return (
    <div className="space-y-6">
      {/* 时间维度提示(后续阶段会换成筛选 Tab)*/}
      <div className="flex items-center justify-between text-xs text-gray-700">
        <div className="flex items-center gap-2">
          <I name="calendar" size={14} className="text-brand" />
          <span className="font-bold">本月</span>
          <span className="text-gray-500">
            {new Date(report.range.start).toLocaleDateString()} ~ {new Date(report.range.end).toLocaleDateString()}
          </span>
        </div>
        <span className="text-gray-400">环比上月同期 · sparkline 近 14 天</span>
      </div>

      {/* 5 KPI 卡 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5">
        {report.kpis.map((kpi) => (
          <KpiCard key={kpi.key} kpi={kpi} />
        ))}
      </div>

      {/* 近 14 天趋势(shadcn AreaChart 叠加双线)*/}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="title-card flex items-center gap-2">
              <I name="line-chart" size={18} className="text-brand" />
              近 14 天趋势
            </h3>
            <p className="text-[11px] text-gray-500 mt-1">新增简历(有附件) vs 候选人总量(含手动录入)</p>
          </div>
          <div className="flex items-center gap-5 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: "var(--chart-1)" }}></span>
              <span className="text-gray-700">新增简历</span>
              <span className="text-navy-700 font-bold tabular-nums">{trendTotal.newResumes}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: "var(--chart-2)" }}></span>
              <span className="text-gray-700">候选人总量</span>
              <span className="text-navy-700 font-bold tabular-nums">{trendTotal.candidates}</span>
            </div>
          </div>
        </div>
        {trendTotal.newResumes === 0 && trendTotal.candidates === 0 ? (
          <Empty title="近 14 天无新增" icon="line-chart" />
        ) : (
          <ChartContainer config={trendConfig} className="!aspect-auto h-64 w-full">
            <AreaChart data={trendData} margin={{ top: 10, right: 12, left: 12, bottom: 0 }}>
              <defs>
                <linearGradient id="trend-grad-newResumes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="trend-grad-candidates" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.7} />
                  <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0.1} />
                </linearGradient>
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
                content={
                  <ChartTooltipContent
                    indicator="dot"
                    labelFormatter={(label) => label}
                  />
                }
              />
              <Area
                dataKey="candidates"
                type="natural"
                fill="url(#trend-grad-candidates)"
                stroke="var(--chart-2)"
                strokeWidth={2}
                stackId="a"
                isAnimationActive={true}
                animationDuration={650}
              />
              <Area
                dataKey="newResumes"
                type="natural"
                fill="url(#trend-grad-newResumes)"
                stroke="var(--chart-1)"
                strokeWidth={2}
                stackId="b"
                isAnimationActive={true}
                animationDuration={650}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </Card>

      {/* 招聘漏斗(主漏斗 + 旁路)*/}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="title-card flex items-center gap-2">
              <I name="filter" size={18} className="text-brand" />
              招聘漏斗
            </h3>
            <span className="text-[11px] text-gray-500">右侧百分比 = 本阶段 / 上一阶段转化率</span>
          </div>
          {report.funnel.main.every((s) => s.count === 0) ? (
            <Empty title="暂无候选人" desc="还没有候选人进入流程,先去导入或上传简历吧" icon="users" />
          ) : (
            <div>
              {report.funnel.main.map((s, i) => (
                <FunnelStage
                  key={s.status}
                  stage={s}
                  maxCount={funnelMax}
                  isLast={i === report.funnel.main.length - 1}
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
              <FunnelBypass key={s.status} stage={s} />
            ))}
          </div>
          <p className="text-[11px] text-gray-500 mt-4 leading-relaxed">
            "已淘汰"不计入漏斗主流转化率,但占用候选人总量统计。
          </p>
        </Card>
      </div>

      {/* 员工阶段 + 岗位优先级(原有分布块保留)*/}
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
              {report.employeesByStage.map((r, i) => {
                const colors = ["#422AFB", "#22C55E", "#F59E0B", "#3B82F6", "#F53939", "#A0AEC0"];
                return (
                  <li key={r.stage || `s-${i}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <StagePill stage={r.stage || "待入职"} />
                      <span className="text-sm font-bold text-navy-700">{r.count}</span>
                    </div>
                    <Bar value={r.count} max={stageMax} color={colors[i % colors.length]} />
                  </li>
                );
              })}
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
    </div>
  );
}
