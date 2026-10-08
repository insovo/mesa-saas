// 校招台账:专场选择 + KPI + 筛选 + 表格 + 学生抽屉 + 登记 / 导出
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { gsap } from "gsap";
import { resources } from "../../lib/api.js";
import { useHasModule } from "../../lib/authContext.jsx";
import { CAMPUS_APP_STATUS, CAMPUS_APP_STATUS_LABEL } from "../../lib/constants.js";
import { Card, Button, Input, I, Empty, LoadingBlock, Avatar, LiquidLoader, toast } from "../Primitives.jsx";
import { Select, KindTag, AppStatusPill, ParseTag, SessionStatusPill, fmtDateTime, errMsg } from "./ui.jsx";
import ApplicantDrawer, { InterviewModal } from "./ApplicantDrawer.jsx";
import ApplicantCreateModal from "./ApplicantCreateModal.jsx";

function Kpi({ icon, label, value, accent = "#422AFB", active, onClick }) {
  const ref = useRef(null); const prev = useRef(0);
  useEffect(() => {
    if (!ref.current) return;
    const o = { v: prev.current };
    gsap.to(o, { v: value || 0, duration: 0.6, ease: "power2.out", onUpdate: () => { if (ref.current) ref.current.textContent = Math.round(o.v); } });
    prev.current = value || 0;
  }, [value]);
  return (
    <button type="button" onClick={onClick} className={`text-left p-4 rounded-card bg-white shadow-card transition-all hover:-translate-y-0.5 ${active ? "ring-2 ring-brand" : ""} ${onClick ? "" : "cursor-default"}`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${accent}1a`, color: accent }}><I name={icon} size={18} /></div>
        <div className="min-w-0"><p className="text-xs text-gray-700 truncate">{label}</p><p ref={ref} className="text-2xl font-bold text-navy-700 leading-none mt-1 tabular-nums">0</p></div>
      </div>
    </button>
  );
}

const EMPTY_FILTER = { q: "", jobId: "", kind: "", source: "", status: "", parse: "", contact: "" };
// KPI 卡配置(icon 字面量供 scripts/gen-icon-map.mjs 扫描);filter = [字段, 值] 点击切换筛选
const KPIS = [
  { key: "applicants", icon: "users", label: "学生", accent: "#422AFB" },
  { key: "applications", icon: "send", label: "投递", accent: "#422AFB" },
  { key: "withResume", icon: "file-text", label: "已上传简历", accent: "#3B82F6", filter: ["parse", "done"] },
  { key: "confirmed", icon: "phone-call", label: "联系方式已确认", accent: "#22C55E", filter: ["contact", "confirmed"] },
  { key: "onsiteInterview", icon: "mic", label: "现场面试中", accent: "#EAB308", filter: ["status", "onsite_interview"] },
  { key: "passed", icon: "badge-check", label: "已通过", accent: "#15803D", filter: ["status", "passed"] },
];

export default function CampusLedger({ sessions, onSessionsChanged }) {
  const [sessionId, setSessionId] = useState("");
  const [sessionJobs, setSessionJobs] = useState([]);
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [drawerId, setDrawerId] = useState(null);
  const [drawerInitialEdit, setDrawerInitialEdit] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkIv, setBulkIv] = useState(false);
  const canExport = useHasModule("campus.export");
  const session = sessions.find((s) => s.id === sessionId) || null;

  useEffect(() => {
    if (!sessionId && sessions.length) setSessionId((sessions.find((s) => s.status === "live") || sessions[0]).id);
  }, [sessions, sessionId]);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== ""));
      const [ledger, jobs] = await Promise.all([resources.campus.ledger(sessionId, { ...params, take: 300 }), resources.campus.listSessionJobs(sessionId)]);
      setData(ledger); setSessionJobs(jobs); setSelected(new Set());
    } catch (e) { toast(errMsg(e, "加载台账失败"), "error"); }
    finally { setLoading(false); }
  }, [sessionId, filter]);
  useEffect(() => { load(); }, [load]);

  // 有解析中的学生 → 5s 轮询刷新
  const anyRunning = !!data?.items?.some((it) => it.currentVersion?.parseStatus === "running");
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [anyRunning, load]);

  const items = data?.items || [];
  const stats = data?.stats || {};
  const allAppIds = useMemo(() => items.flatMap((it) => it.applications.filter((a) => a.status !== "withdrawn").map((a) => a.id)), [items]);

  function toggleRow(it) {
    setSelected((prev) => {
      const next = new Set(prev); const ids = it.applications.filter((a) => a.status !== "withdrawn").map((a) => a.id);
      const all = ids.every((id) => next.has(id));
      ids.forEach((id) => (all ? next.delete(id) : next.add(id)));
      return next;
    });
  }
  async function applyBulk() {
    if (!bulkStatus || selected.size === 0) return;
    if (!confirm(`将选中的 ${selected.size} 条投递状态改为「${CAMPUS_APP_STATUS_LABEL[bulkStatus]}」?`)) return;
    const advance = bulkStatus === "passed" ? confirm("是否同时把这些候选人状态改为「待入职」并进入入职管理?\n确定 = 是   取消 = 只改投递状态") : false;
    try { const r = await resources.campus.bulkStatus(Array.from(selected), bulkStatus, advance); toast(`已更新 ${r.updated} 条`, "success"); setBulkStatus(""); load(); }
    catch (e) { toast(errMsg(e), "error"); }
  }
  async function exportXlsx() {
    try {
      const params = Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== ""));
      const res = await resources.campus.exportLedger(sessionId, params);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a"); a.href = url; a.download = `校招台账_${session?.name || ""}.xlsx`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { toast(errMsg(e, "导出失败"), "error"); }
  }

  if (!sessions.length) {
    return <Card className="p-6"><Empty icon="graduation-cap" title="还没有校招专场" desc="先到「专场」tab 新建一个专场并配置岗位" /></Card>;
  }

  return (
    <div className="space-y-5">
      {/* 专场选择 + 操作 */}
      <Card className="p-4 !flex-row items-center gap-3 flex-wrap">
        <I name="graduation-cap" size={18} className="text-brand" />
        <Select small value={sessionId} onChange={(e) => { setSessionId(e.target.value); setFilter(EMPTY_FILTER); }} className="min-w-[240px]">
          {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}{s.status === "live" ? "(上线中)" : s.status === "closed" ? "(已结束)" : "(草稿)"}</option>)}
        </Select>
        {session && <SessionStatusPill status={session.status} />}
        {session?.school && <span className="text-xs text-gray-600">{session.school}</span>}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" icon={<I name="refresh-cw" size={14} className={loading ? "animate-spin" : ""} />} onClick={load}>刷新</Button>
          {canExport && <Button size="sm" variant="secondary" icon={<I name="download" size={14} />} onClick={exportXlsx}>导出 xlsx</Button>}
          <Button size="sm" icon={<I name="user-plus" size={14} />} onClick={() => setCreateOpen(true)}>登记学生</Button>
        </div>
      </Card>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {KPIS.map((k) => (
          <Kpi key={k.key} icon={k.icon} label={k.label} value={stats[k.key]} accent={k.accent}
            active={k.filter ? filter[k.filter[0]] === k.filter[1] : false}
            onClick={k.filter ? () => setFilter((f) => ({ ...f, [k.filter[0]]: f[k.filter[0]] === k.filter[1] ? "" : k.filter[1] })) : undefined} />
        ))}
      </div>

      {/* 筛选 */}
      <Card className="p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-[220px]"><Input icon={<I name="search" size={16} />} value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="姓名 / 手机 / 邮箱 / 学校 / 专业" className="!h-9" /></div>
          <Select small value={filter.jobId} onChange={(e) => setFilter({ ...filter, jobId: e.target.value })}><option value="">全部岗位</option>{sessionJobs.map((sj) => <option key={sj.id} value={sj.jobId}>{sj.job?.title}</option>)}</Select>
          <Select small value={filter.kind} onChange={(e) => setFilter({ ...filter, kind: e.target.value })}><option value="">全部类型</option><option value="onsite">现场面试</option><option value="referral">内推</option></Select>
          <Select small value={filter.source} onChange={(e) => setFilter({ ...filter, source: e.target.value })}><option value="">全部来源</option><option value="direct">直投</option><option value="match">智能匹配</option><option value="hr">HR 登记</option></Select>
          <Select small value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}><option value="">全部状态</option>{CAMPUS_APP_STATUS.map((s) => <option key={s} value={s}>{CAMPUS_APP_STATUS_LABEL[s]}</option>)}</Select>
          <Select small value={filter.parse} onChange={(e) => setFilter({ ...filter, parse: e.target.value })}><option value="">解析状态</option><option value="done">已解析</option><option value="running">解析中</option><option value="failed">解析失败</option><option value="none">无简历</option></Select>
          <Select small value={filter.contact} onChange={(e) => setFilter({ ...filter, contact: e.target.value })}><option value="">联系方式</option><option value="confirmed">已确认</option><option value="unconfirmed">未确认</option></Select>
          {Object.values(filter).some(Boolean) && <Button size="sm" variant="ghost" onClick={() => setFilter(EMPTY_FILTER)} icon={<I name="x" size={14} />}>清除</Button>}
        </div>
        {selected.size > 0 && (
          <div className="mt-3 flex items-center gap-2 p-2.5 rounded-xl bg-brand-50/60 text-xs text-navy-700">
            <span className="font-bold">已选 {selected.size} 条投递</span>
            <Select small value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}><option value="">批量改状态…</option>{CAMPUS_APP_STATUS.map((s) => <option key={s} value={s}>{CAMPUS_APP_STATUS_LABEL[s]}</option>)}</Select>
            <Button size="sm" disabled={!bulkStatus} onClick={applyBulk}>应用</Button>
            <Button size="sm" variant="secondary" icon={<I name="calendar-plus" size={14} />} onClick={() => setBulkIv(true)}>批量安排现场面试</Button>
            <button type="button" className="ml-auto text-gray-500 hover:text-navy-700" onClick={() => setSelected(new Set())}>取消选择</button>
          </div>
        )}
      </Card>

      {/* 表格 */}
      <Card className="overflow-hidden">
        {loading && !data ? <LoadingBlock height="h-48" /> : items.length === 0 ? (
          <Empty icon="inbox" title="没有符合条件的学生" desc={Object.values(filter).some(Boolean) ? "试试清除筛选" : "点右上「登记学生」录入第一位学生"} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-gray-600 border-b border-gray-100">
                  <th className="px-4 py-3 w-8"><input type="checkbox" className="accent-brand" checked={allAppIds.length > 0 && allAppIds.every((id) => selected.has(id))} onChange={(e) => setSelected(e.target.checked ? new Set(allAppIds) : new Set())} /></th>
                  <th className="px-3 py-3">学生</th><th className="px-3 py-3">学校 / 专业</th><th className="px-3 py-3">联系方式</th><th className="px-3 py-3">投递岗位</th><th className="px-3 py-3" title="当前简历最近一次有效匹配中，各岗位的最高分">匹配分</th><th className="px-3 py-3">简历</th><th className="px-3 py-3">状态</th><th className="px-3 py-3">登记时间</th><th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const apps = it.applications.filter((a) => a.status !== "withdrawn");
                  const ids = apps.map((a) => a.id);
                  const checked = ids.length > 0 && ids.every((id) => selected.has(id));
                  return (
                    <tr key={it.id} className="border-b border-gray-50 hover:bg-lightPrimary/40">
                      <td className="px-4 py-3"><input type="checkbox" className="accent-brand" checked={checked} disabled={ids.length === 0} onChange={() => toggleRow(it)} /></td>
                      <td className="px-3 py-3"><Link to={`/candidates/${it.candidateId}`} className="flex items-center gap-2 min-w-[140px] rounded-lg hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" title="打开候选人详情"><Avatar name={it.name || "?"} size={32} /><div className="min-w-0"><p className="font-bold text-navy-700 truncate hover:text-brand">{it.name || <span className="text-gray-400 font-normal">未填姓名</span>}</p><p className="text-[11px] text-gray-500">{it.degree || ""}{it.gradYear ? ` · ${it.gradYear} 届` : ""}</p></div></Link></td>
                      <td className="px-3 py-3 text-xs text-navy-700 min-w-[140px]"><p className="truncate">{it.school || <span className="text-gray-400">—</span>}</p><p className="text-gray-500 truncate">{it.major || ""}</p></td>
                      <td className="px-3 py-3 text-xs text-navy-700 min-w-[130px]"><p className="inline-flex items-center gap-1">{it.phone}{it.contactConfirmedAt && <I name="check" size={11} className="text-green-600" />}</p><p className="text-gray-500 truncate max-w-[180px]">{it.email || ""}</p></td>
                      <td className="px-3 py-3 min-w-[200px]">
                        {apps.length === 0 ? <span className="text-xs text-gray-400">未投递</span> : (
                          <div className="flex flex-col gap-1">{apps.map((a) => <span key={a.id} className="inline-flex items-center gap-1.5 text-xs text-navy-700"><KindTag kind={a.kind} /><span className="truncate max-w-[180px]">{a.job?.title}</span><span className="text-[10px] text-gray-400">{a.source === "hr" ? "HR" : a.source === "match" ? "匹配" : "直投"}</span></span>)}</div>
                        )}
                      </td>
                      <td className="px-3 py-3">{it.bestMatchScore != null ? <LiquidLoader size={40} level={it.bestMatchScore} label={it.bestMatchScore} instant /> : <span className="text-xs text-gray-400">—</span>}</td>
                      <td className="px-3 py-3"><div className="flex flex-col gap-1 items-start"><ParseTag status={it.currentVersion?.parseStatus} />{it.currentVersion && <span className="text-[10px] text-gray-500">v{it.currentVersion.version} / {it.uploadsAllowed}</span>}</div></td>
                      <td className="px-3 py-3"><div className="flex flex-col gap-1 items-start">{apps.length === 0 ? <span className="text-xs text-gray-400">—</span> : apps.map((a) => <AppStatusPill key={a.id} status={a.status} />)}</div></td>
                      <td className="px-3 py-3 text-[11px] text-gray-500 whitespace-nowrap">{fmtDateTime(it.createdAt)}</td>
                      <td className="px-3 py-3"><button type="button" onClick={() => { setDrawerId(it.id); setDrawerInitialEdit(true); }} className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline whitespace-nowrap" aria-label={`编辑${it.name || "学生"}信息`}><I name="pencil" size={12} />编辑</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-4 py-2 text-[11px] text-gray-500">共 {data?.total ?? items.length} 位学生{data && !data.showContact ? " · 无联系方式权限,已打码" : ""}</p>
          </div>
        )}
      </Card>

      {bulkIv && <InterviewModal apps={items.flatMap((it) => it.applications).filter((a) => selected.has(a.id))} session={session} onClose={() => setBulkIv(false)} onDone={() => { setBulkIv(false); load(); }} />}
      <ApplicantDrawer key={drawerId || "closed"} applicantId={drawerId} open={!!drawerId} initialEdit={drawerInitialEdit} onClose={() => { setDrawerId(null); setDrawerInitialEdit(false); }} sessionJobs={sessionJobs} onChanged={() => { load(); onSessionsChanged?.(); }} />
      {session && <ApplicantCreateModal open={createOpen} onClose={() => setCreateOpen(false)} session={session} sessionJobs={sessionJobs} onCreated={() => { load(); onSessionsChanged?.(); }} />}
    </div>
  );
}
