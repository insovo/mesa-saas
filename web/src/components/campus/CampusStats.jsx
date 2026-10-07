// 校招数据看板:投递漏斗 / 学校分布 / 岗位热度 / 每日登记(shadcn charts,与 Reports 页同栈)
import { useEffect, useState } from "react";
import { resources } from "../../lib/api.js";
import { Card, I, LoadingBlock, Empty, toast } from "../Primitives.jsx";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "../ui/chart.jsx";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { CAMPUS_APP_STATUS_LABEL, CAMPUS_JOB_KIND_LABEL } from "../../lib/constants.js";
import { Select, errMsg } from "./ui.jsx";

const AXIS = { fill: "#A0AEC0", fontSize: 11 };

function Block({ title, desc, children }) {
  return <Card className="p-5"><div className="mb-3"><h3 className="text-sm font-bold text-navy-700">{title}</h3>{desc && <p className="text-[11px] text-gray-500">{desc}</p>}</div>{children}</Card>;
}

export default function CampusStats({ sessions }) {
  const [sessionId, setSessionId] = useState("");
  const [data, setData] = useState(null);
  useEffect(() => { if (!sessionId && sessions.length) setSessionId((sessions.find((s) => s.status === "live") || sessions[0]).id); }, [sessions, sessionId]);
  useEffect(() => { if (!sessionId) return; setData(null); resources.campus.stats(sessionId).then(setData).catch((e) => toast(errMsg(e, "加载统计失败"), "error")); }, [sessionId]);
  if (!sessions.length) return <Card className="p-6"><Empty icon="bar-chart-3" title="还没有专场" /></Card>;
  const funnel = (data?.funnel || []).map((f) => ({ name: CAMPUS_APP_STATUS_LABEL[f.status] || f.status, 投递: f.count }));
  const school = (data?.bySchool || []).map((s) => ({ name: s.name.length > 8 ? s.name.slice(0, 8) + "…" : s.name, 学生: s.count }));
  const jobs = (data?.byJob || []).map((j) => ({ name: `${j.title.length > 8 ? j.title.slice(0, 8) + "…" : j.title}`, 投递: j.applications, 通过: j.passed, kind: j.kind }));
  const daily = (data?.daily || []).map((d) => ({ name: d.date, 登记: d.count }));
  const cfg = (k, color) => ({ [k]: { label: k, color } });
  return (
    <div className="space-y-4">
      <Card className="p-4 !flex-row items-center gap-3 flex-wrap">
        <I name="bar-chart-3" size={18} className="text-brand" />
        <Select small value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="min-w-[240px]">{sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        {data && <span className="text-xs text-gray-600 ml-auto">学生 {data.totals.applicants} · 有简历 {data.totals.withResume} · 已确认联系 {data.totals.confirmed} · 投递 {data.totals.applications} · 完成匹配 {data.totals.matchRunsDone}</span>}
      </Card>
      {!data ? <LoadingBlock height="h-48" /> : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Block title="投递漏斗" desc="按投递状态统计(撤回 / 未通过单列)">
            <ChartContainer config={cfg("投递", "var(--chart-1)")} className="!aspect-auto h-56 w-full">
              <BarChart data={funnel} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#E9ECEF" /><XAxis dataKey="name" tickLine={false} axisLine={false} tick={AXIS} /><YAxis tickLine={false} axisLine={false} tick={{ ...AXIS, fontSize: 10 }} width={28} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent indicator="dot" />} /><Bar dataKey="投递" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
            <p className="text-[11px] text-gray-500 mt-2">来源:直投 {data.bySource.direct || 0} · 智能匹配 {data.bySource.match || 0} · HR 登记 {data.bySource.hr || 0}</p>
          </Block>
          <Block title="每日登记" desc="近 14 天新登记学生数">
            <ChartContainer config={cfg("登记", "var(--chart-2)")} className="!aspect-auto h-56 w-full">
              <AreaChart data={daily} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#E9ECEF" /><XAxis dataKey="name" tickLine={false} axisLine={false} tick={AXIS} /><YAxis tickLine={false} axisLine={false} tick={{ ...AXIS, fontSize: 10 }} width={28} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent indicator="dot" />} /><Area dataKey="登记" type="monotone" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.15} />
              </AreaChart>
            </ChartContainer>
          </Block>
          <Block title="学校分布" desc="登记学生数 Top 10">
            {school.length === 0 ? <Empty icon="graduation-cap" title="暂无数据" /> : (
              <ChartContainer config={cfg("学生", "var(--chart-3)")} className="!aspect-auto h-56 w-full">
                <BarChart data={school} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#E9ECEF" /><XAxis type="number" tickLine={false} axisLine={false} tick={{ ...AXIS, fontSize: 10 }} allowDecimals={false} /><YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={AXIS} width={90} />
                  <ChartTooltip content={<ChartTooltipContent indicator="dot" />} /><Bar dataKey="学生" fill="var(--chart-3)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            )}
            <p className="text-[11px] text-gray-500 mt-2">学历:{(data.byDegree || []).map((d) => `${d.name} ${d.count}`).join(" · ") || "—"}</p>
          </Block>
          <Block title="岗位热度" desc="各岗位投递 / 通过数">
            {jobs.length === 0 ? <Empty icon="briefcase" title="暂无岗位" /> : (
              <ChartContainer config={{ 投递: { label: "投递", color: "var(--chart-1)" }, 通过: { label: "通过", color: "var(--chart-2)" } }} className="!aspect-auto h-56 w-full">
                <BarChart data={jobs} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#E9ECEF" /><XAxis dataKey="name" tickLine={false} axisLine={false} tick={AXIS} /><YAxis tickLine={false} axisLine={false} tick={{ ...AXIS, fontSize: 10 }} width={28} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent indicator="dot" />} /><Bar dataKey="投递" fill="var(--chart-1)" radius={[4, 4, 0, 0]} /><Bar dataKey="通过" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
            <div className="mt-2 space-y-1">
              {(data.byJob || []).slice(0, 8).map((j) => <div key={j.jobId} className="flex items-center gap-2 text-[11px] text-gray-600"><span className="px-1.5 rounded bg-lightPrimary text-navy-700">{CAMPUS_JOB_KIND_LABEL[j.kind]}</span><span className="flex-1 truncate">{j.title}</span><span>投递 {j.applications} · 匹配来源 {j.fromMatch} · 通过 {j.passed}{j.avgScoreRaw != null ? ` · 均分 ${j.avgScoreRaw}` : ""}</span></div>)}
            </div>
          </Block>
        </div>
      )}
      <p className="text-[11px] text-gray-500">解析状态:{Object.entries(data?.parse || {}).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"} · 匹配任务:{Object.entries(data?.matchRuns || {}).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"}</p>
    </div>
  );
}
