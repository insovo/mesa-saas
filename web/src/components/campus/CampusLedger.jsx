// 校招台账:专场选择 + KPI + 筛选 + 表格 + 学生抽屉 + 登记 / 导出
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { gsap } from "gsap";
import { resources } from "../../lib/api.js";
import { useHasModule } from "../../lib/authContext.jsx";
import { CAMPUS_APP_STATUS, CAMPUS_APP_STATUS_LABEL } from "../../lib/constants.js";
import { Card, Button, Input, I, Empty, LoadingBlock, Avatar, toast } from "../Primitives.jsx";
import { Select, KindTag, SessionStatusPill, fmtDateTime, errMsg } from "./ui.jsx";
import CampusScoreBalls from "./CampusScoreBalls.jsx";
import ApplicantDrawer, { InterviewModal } from "./ApplicantDrawer.jsx";
import ApplicantCreateModal from "./ApplicantCreateModal.jsx";
import ResumeDownloadButton from "../ResumeDownloadButton.jsx";

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
  const [selected, setSelected] = useState({});
  const [skip, setSkip] = useState(0);
  const [selectingAll, setSelectingAll] = useState(false);
  const selectionGeneration = useRef(0);
  const requestGeneration = useRef(0);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkIv, setBulkIv] = useState(false);
  const canExport = useHasModule("campus.export");
  const canDownload = useHasModule("candidate.attachments");
  const session = sessions.find((s) => s.id === sessionId) || null;

  useEffect(() => {
    if (!sessionId && sessions.length) setSessionId((sessions.find((s) => s.status === "live") || sessions[0]).id);
  }, [sessions, sessionId]);

  const load = useCallback(async () => {
    if (!sessionId) return;
    const generation = ++requestGeneration.current;
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== ""));
      const [ledger, jobs] = await Promise.all([resources.campus.ledger(sessionId, { ...params, skip, take: 100 }), resources.campus.listSessionJobs(sessionId)]);
      if (generation !== requestGeneration.current) return;
      setData(ledger); setSessionJobs(jobs);
    } catch (e) { if (generation === requestGeneration.current) toast(errMsg(e, "加载概览失败"), "error"); }
    finally { if (generation === requestGeneration.current) setLoading(false); }
  }, [sessionId, filter, skip]);
  useEffect(() => { selectionGeneration.current++; setSelected({}); setSkip(0); }, [sessionId, filter]);
  useEffect(() => { load(); }, [load]);

  const items = data?.items || [];
  const stats = data?.stats || {};
  const matchJobs = sessionJobs.filter((job) => job.matchEnabled).slice(0, 4);
  const scoresFor = (applicant) => {
    const byJob = new Map((applicant.matchScores || []).map((score) => [score.jobId, score.scoreShown]));
    return matchJobs.map((sessionJob) => ({ jobId: sessionJob.jobId, title: sessionJob.job?.title || "岗位", scoreShown: byJob.get(sessionJob.jobId) ?? null }));
  };
  const selectedItems = Object.values(selected);
  const selectedApps = useMemo(() => selectedItems.flatMap((it) => it.applications.filter((a) => a.status !== "withdrawn")), [selected]);
  const allAppIds = selectedApps.map((a) => a.id);
  const pageSelected = items.length > 0 && items.every((it) => selected[it.id]);

  function toggleRow(it) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[it.id]) delete next[it.id]; else next[it.id] = it;
      return next;
    });
  }
  function togglePage() {
    setSelected((current) => { const next = { ...current }; items.forEach((it) => { if (pageSelected) delete next[it.id]; else next[it.id] = it; }); return next; });
  }
  async function selectAllFiltered() {
    const generation = selectionGeneration.current;
    setSelectingAll(true);
    try {
      const result = await resources.campus.ledger(sessionId, { ...Object.fromEntries(Object.entries(filter).filter(([, value]) => value)), selection: "all" });
      if (generation === selectionGeneration.current) setSelected(Object.fromEntries(result.selection.map((it) => [it.id, it])));
    } catch (error) { toast(errMsg(error, "全选失败"), "error"); }
    finally { setSelectingAll(false); }
  }
  async function applyBulk() {
    if (!bulkStatus || allAppIds.length === 0) return;
    if (!confirm(`将选中的 ${allAppIds.length} 条投递状态改为「${CAMPUS_APP_STATUS_LABEL[bulkStatus]}」?`)) return;
    const advance = bulkStatus === "passed" ? confirm("是否同时把这些候选人状态改为「待入职」并进入入职管理?\n确定 = 是   取消 = 只改投递状态") : false;
    try { const r = await resources.campus.bulkStatus(allAppIds, bulkStatus, advance); toast(`已更新 ${r.updated} 条`, "success"); setBulkStatus(""); setSelected({}); load(); }
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
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3 text-xs text-navy-700">
          <label className="inline-flex items-center gap-2"><input type="checkbox" aria-label="全选当前页学生" className="accent-brand" checked={pageSelected} disabled={loading || !items.length} onChange={togglePage} />全选当前页</label>
          {data?.total > items.length && <button type="button" disabled={loading || selectingAll} className="text-brand" onClick={selectAllFiltered}>{selectingAll ? "选择中…" : `全选筛选结果（${data.total} 人）`}</button>}
        </div>
        {selectedItems.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-brand-50/60 text-xs text-navy-700">
            <span className="font-bold">已选 {selectedItems.length} 人 · {allAppIds.length} 条投递</span>
            {canDownload && <ResumeDownloadButton campus ids={selectedItems.map(({ id }) => id)} disabled={loading || selectingAll} />}
            <Select small value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}><option value="">批量改状态…</option>{CAMPUS_APP_STATUS.map((s) => <option key={s} value={s}>{CAMPUS_APP_STATUS_LABEL[s]}</option>)}</Select>
            <Button size="sm" disabled={!bulkStatus || !allAppIds.length || allAppIds.length > 500 || loading || selectingAll} onClick={applyBulk}>应用</Button>
            <Button size="sm" variant="secondary" disabled={!allAppIds.length || allAppIds.length > 200 || loading || selectingAll} icon={<I name="calendar-plus" size={14} />} onClick={() => setBulkIv(true)}>批量安排现场面试</Button>
            <button type="button" className="ml-auto text-gray-500 hover:text-navy-700" onClick={() => { selectionGeneration.current++; setSelected({}); }}>取消选择</button>
            {selectedItems.length > 1000 && <span className="text-amber-700">每次最多下载 1000 人，请缩小筛选范围</span>}
          </div>
        )}
      </Card>

      {/* 表格 */}
      <Card className="overflow-hidden">
        {loading && !data ? <LoadingBlock height="h-48" /> : items.length === 0 ? (
          <Empty icon="inbox" title="没有符合条件的学生" desc={Object.values(filter).some(Boolean) ? "试试清除筛选" : "点右上「登记学生」录入第一位学生"} />
        ) : (
          <div className="overflow-x-auto">
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-gray-600 border-b border-gray-100">
                  <th className="px-4 py-3 w-8"><input type="checkbox" aria-label="选择当前页全部学生" className="accent-brand" checked={pageSelected} disabled={loading} onChange={togglePage} /></th>
                  <th className="px-3 py-3">学生</th><th className="px-3 py-3">学校 / 专业</th><th className="px-3 py-3">联系方式</th><th className="px-3 py-3">投递岗位</th><th className="px-3 py-3">岗位匹配度</th><th className="px-3 py-3">登记时间</th><th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const apps = it.applications.filter((a) => a.status !== "withdrawn");
                  const checked = Boolean(selected[it.id]);
                  return (
                    <tr key={it.id} className="border-b border-gray-50 hover:bg-lightPrimary/40">
                      <td className="px-4 py-3"><input type="checkbox" aria-label={`选择${it.name || "学生"}`} className="accent-brand" checked={checked} disabled={loading} onChange={() => toggleRow(it)} /></td>
                      <td className="px-3 py-3"><Link to={`/candidates/${it.candidateId}`} className="flex items-center gap-2 min-w-[140px] rounded-lg hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" title="打开候选人详情"><Avatar name={it.name || "?"} size={32} /><div className="min-w-0"><p className="font-bold text-navy-700 truncate hover:text-brand">{it.name || <span className="text-gray-400 font-normal">未填姓名</span>}</p><p className="text-[11px] text-gray-500">{it.degree || ""}{it.gradYear ? ` · ${it.gradYear} 届` : ""}</p></div></Link></td>
                      <td className="px-3 py-3 text-xs text-navy-700 min-w-[140px]"><p className="truncate">{it.school || <span className="text-gray-400">—</span>}</p><p className="text-gray-500 truncate">{it.major || ""}</p></td>
                      <td className="px-3 py-3 text-xs text-navy-700 min-w-[130px]"><p className="inline-flex items-center gap-1">{it.phone}{it.contactConfirmedAt && <I name="check" size={11} className="text-green-600" />}</p><p className="text-gray-500 truncate max-w-[180px]">{it.email || ""}</p></td>
                      <td className="px-3 py-3 min-w-[200px]">
                        {apps.length === 0 ? <span className="text-xs text-gray-400">未投递</span> : (
                          <div className="flex flex-col gap-1">{apps.map((a) => <span key={a.id} className="inline-flex items-center gap-1.5 text-xs text-navy-700"><KindTag kind={a.kind} /><span className="truncate max-w-[180px]">{a.job?.title}</span><span className="text-[10px] text-gray-400">{a.source === "hr" ? "HR" : a.source === "match" ? "匹配" : "直投"}</span></span>)}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 min-w-[290px]">{matchJobs.length ? <CampusScoreBalls matches={scoresFor(it)} /> : <span className="text-xs text-gray-400">—</span>}</td>
                      <td className="px-3 py-3 text-[11px] text-gray-500 whitespace-nowrap">{fmtDateTime(it.createdAt)}</td>
                      <td className="px-3 py-3"><button type="button" onClick={() => { setDrawerId(it.id); setDrawerInitialEdit(true); }} className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline whitespace-nowrap" aria-label={`编辑${it.name || "学生"}信息`}><I name="pencil" size={12} />编辑</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="md:hidden divide-y divide-gray-100">
              {items.map((it) => {
                const apps = it.applications.filter((a) => a.status !== "withdrawn");
                return (
                  <div key={it.id} className="p-4 space-y-3 min-w-0">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" aria-label={`选择${it.name || "学生"}`} className="accent-brand shrink-0" checked={Boolean(selected[it.id])} disabled={loading} onChange={() => toggleRow(it)} />
                      <Link to={`/candidates/${it.candidateId}`} className="flex items-center gap-2 min-w-0 flex-1"><Avatar name={it.name || "?"} size={32} /><span className="min-w-0"><span className="block truncate text-sm font-bold text-navy-700">{it.name || "未填姓名"}</span><span className="block truncate text-[11px] text-gray-500">{it.school || "—"}{it.major ? ` · ${it.major}` : ""}</span></span></Link>
                      <button type="button" onClick={() => { setDrawerId(it.id); setDrawerInitialEdit(true); }} className="shrink-0 text-xs font-bold text-brand">编辑</button>
                    </div>
                    <p className="text-xs text-gray-600">{it.phone || "—"}{it.contactConfirmedAt ? " · 已确认" : ""} · {apps.length ? apps.map((a) => a.job?.title).filter(Boolean).join(" / ") : "未投递"}</p>
                    {matchJobs.length ? <CampusScoreBalls matches={scoresFor(it)} /> : <span className="text-xs text-gray-400">暂无匹配岗位</span>}
                  </div>
                );
              })}
            </div>
            <p className="px-4 py-2 text-[11px] text-gray-500">共 {data?.total ?? items.length} 位学生{data && !data.showContact ? " · 无联系方式权限,已打码" : ""}</p>
            <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 text-xs text-gray-700"><span>{skip + 1}–{Math.min(skip + 100, data.total)} / {data.total}</span><div className="flex gap-2"><Button size="sm" variant="ghost" disabled={loading || !skip} onClick={() => setSkip(skip - 100)}>上一页</Button><Button size="sm" variant="ghost" disabled={loading || skip + 100 >= data.total} onClick={() => setSkip(skip + 100)}>下一页</Button></div></div>
          </div>
        )}
      </Card>

      {bulkIv && <InterviewModal apps={selectedApps} session={session} onClose={() => setBulkIv(false)} onDone={() => { setBulkIv(false); setSelected({}); load(); }} />}
      <ApplicantDrawer key={drawerId || "closed"} applicantId={drawerId} open={!!drawerId} initialEdit={drawerInitialEdit} onClose={() => { setDrawerId(null); setDrawerInitialEdit(false); }} sessionJobs={sessionJobs} onChanged={() => { load(); onSessionsChanged?.(); }} />
      {session && <ApplicantCreateModal open={createOpen} onClose={() => setCreateOpen(false)} session={session} sessionJobs={sessionJobs} onCreated={() => { load(); onSessionsChanged?.(); }} />}
    </div>
  );
}
