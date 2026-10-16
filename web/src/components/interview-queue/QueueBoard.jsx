import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, I, Input, Modal, LoadingBlock, toast } from "../Primitives.jsx";
import SummaryColumnFilter from "../campus/SummaryColumnFilter.jsx";
import QueueTimer from "./QueueTimer.jsx";
import QueueDirectionModal from "./QueueDirectionModal.jsx";
import { QUEUE_STAGE_LABELS, QUEUE_ROLE_LABELS, queueResult, queueErrorMessage } from "../../lib/interviewQueueApi.js";

const identityColumns = [
  ["name", "姓名"], ["school", "学校"], ["major", "专业"], ["degree", "学历"],
  ["languageAbility", "语言能力"], ["phone", "联系电话"], ["jobDirection", "岗位方向"],
];
function columnsFor(stage, role) {
  const columns = [...identityColumns];
  if (["salary", "pending"].includes(stage)) columns.splice(4, 0, ["gradYear", "毕业时间"]);
  if (stage === "professional") columns.push(["professionalResult", "专业面试结果"]);
  if (stage === "culture") columns.push(["cultureResult", "文化面试结果"]);
  if (stage === "salary") columns.push(["salaryBase", "基础薪资"], ["salaryFactor", "基数"], ["salaryStatus", "是否接受薪资"], ["email", "邮箱"]);
  if (stage === "pending") columns.push(["pendingFrom", "待定环节"], ["professionalResult", "专业面试结果"], ["cultureResult", "文化面试结果"], ["salaryStatus", "是否接受薪资"], ["email", "邮箱"]);
  return columns.filter(([key]) => !["professional", "culture"].includes(role) || !["salaryBase", "salaryFactor", "salaryStatus", "email"].includes(key)).map(([key, label]) => ({ key, label }));
}
function valueOf(row, key) {
  if (key === "pendingFrom") return QUEUE_STAGE_LABELS[row.pendingFrom] || "";
  if (["professionalResult", "cultureResult", "salaryStatus"].includes(key)) return row[key] ? queueResult(row[key]) : "";
  return row[key] == null ? "" : String(row[key]);
}
const snapshots = (rows) => rows.map(({ id, updatedAt }) => ({ id, updatedAt }));

export default function QueueBoard({ read, write, remove, loadJob, role = "staff", canWrite = true, screen = false, onFatal }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState(role === "hr" ? "salary" : role === "staff" ? "professional" : role);
  const [selected, setSelected] = useState(new Set());
  const [filters, setFilters] = useState({});
  const [filterColumn, setFilterColumn] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [deletionRow, setDeletionRow] = useState(null);
  const [deletionKey, setDeletionKey] = useState("");
  const [deletionError, setDeletionError] = useState("");
  const [suggestionRow, setSuggestionRow] = useState(null);
  const [suggestion, setSuggestion] = useState("");
  const [directionRow, setDirectionRow] = useState(null);
  const [requeueRow, setRequeueRow] = useState(null);
  const [assignRows, setAssignRows] = useState(null);
  const [targetStation, setTargetStation] = useState("");
  const [salaryRows, setSalaryRows] = useState(null);
  const [salaryFields, setSalaryFields] = useState({});
  const [salaryValues, setSalaryValues] = useState({ salaryBase: 8700, salaryFactor: 13.5, salaryStatus: "accepted" });
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(new Date());
  const revision = useRef(undefined);
  const pendingRead = useRef(false);
  const alive = useRef(true);
  const refresh = useCallback(async (force = false) => {
    if (pendingRead.current) return;
    pendingRead.current = true;
    try {
      const result = await read(force ? undefined : revision.current);
      if (!alive.current) return;
      if (!result.unchanged) { setData(result); revision.current = result.revision; }
      setError("");
    } catch (err) {
      if (!alive.current) return;
      setError(queueErrorMessage(err));
      if ([401, 403, 410].includes(err.response?.status)) onFatal?.(err);
    } finally { pendingRead.current = false; }
  }, [read, onFatal]);
  useEffect(() => {
    alive.current = true; revision.current = undefined; refresh(true);
    return () => { alive.current = false; };
  }, [refresh]);
  useEffect(() => { const timer = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(timer); }, []);
  const stations = data?.queue.setup?.stations || [];
  const routing = stations.length > 0;
  const allocation = routing && ["staff", "hr"].includes(role) && ["professional", "culture"].includes(tab) && canWrite && !screen && !error;
  const entries = (data?.entries || []).map((row) => ({ ...row, stationName: stations.find((s) => s.id === row.stationId)?.name || "待 HR 分配" }));
  const stageRows = entries.filter((entry) => entry.stage === tab);
  useEffect(() => {
    setSelected((current) => new Set([...current].filter((id) => entries.some((entry) => entry.id === id && entry.stage === tab))));
  }, [data, tab]);
  const activeFilters = filters[tab] || {};
  const visible = stageRows.filter((row) => Object.entries(activeFilters).every(([key, values]) => values.includes(valueOf(row, key))));
  const selectedRows = stageRows.filter((row) => selected.has(row.id));
  const permitted = canWrite && !screen && !error && (role === "staff" || tab === (role === "hr" ? "salary" : role));
  const hrPending = canWrite && !screen && !error && ["hr", "staff"].includes(role) && tab === "pending";
  const canDelete = canWrite && !screen && !error && ["hr", "staff"].includes(role) && Boolean(remove);
  const directionEditable = (permitted && ["professional", "salary"].includes(tab)) || hrPending;
  const selectable = allocation || (permitted && ["culture", "salary"].includes(tab));
  const currentSuggestionRow = entries.find((row) => row.id === suggestionRow?.id) || suggestionRow;
  const suggestionWritable = permitted && entries.some((row) => row.id === suggestionRow?.id);
  const singleInterview = !allocation && !screen && (tab === "professional" || (tab === "culture" && !selectedRows.length));
  const currentInterview = singleInterview ? stageRows[0] : null;
  const columns = [...columnsFor(tab, role), ...(routing && ["professional", "culture"].includes(tab) ? [{ key: "stationName", label: "分配面试官" }] : [])].filter(({ key }) => !singleInterview || key !== `${tab}Result`);
  const tableRows = visible.filter((row) => row.id !== currentInterview?.id);
  const activeGroups = tab === "culture" ? [...new Set(stageRows.map((row) => row.cultureGroupId).filter(Boolean))].filter((group) => stageRows.filter((row) => row.cultureGroupId === group).length > 1) : [];
  const groupStartedAt = selectedRows.length && selectedRows.every((row) => row.cultureStartedAt === selectedRows[0].cultureStartedAt && row.cultureGroupId === selectedRows[0].cultureGroupId) ? selectedRows[0].cultureStartedAt : null;
  async function submit(body) {
    setBusy(true);
    try { await write(body); setConfirmation(null); setAssignRows(null); setDirectionRow(null); setSalaryRows(null); if (body.action === "suggestion") { setSuggestionRow(null); setSuggestion(""); } if (!body.action.endsWith("timer") && body.action !== "suggestion") setSelected(new Set()); await refresh(true); toast(body.action === "suggestion" ? "建议已保存" : body.action.endsWith("timer") ? "计时已开始，刷新后继续" : "已保存，排队阶段已同步", "success"); }
    catch (err) { toast(queueErrorMessage(err), "error"); if (err.response?.status === 409) { setConfirmation(null); setSalaryRows(null); setDirectionRow(null); setSelected(new Set()); } await refresh(true); }
    finally { setBusy(false); }
  }
  function confirmResult(rows, result) {
    setConfirmation({ rows, title: `${QUEUE_STAGE_LABELS[tab]} · 确认${queueResult(result)}`, description: result === "passed" ? `确认后转入${tab === "professional" ? data.queue.setup?.cultureOnsite === false ? "待 HR 联系线上文化面试" : "文化面试" : "定薪"}。${routing && tab === "professional" ? data.queue.setup?.cultureOnsite === false ? "由 HR 线上联系安排后续面试。" : "由 HR 重新分配文化面试官。" : ""}` : "确认后转入待定。", body: { items: snapshots(rows), action: `${tab}-result`, result, confirmed: true } });
  }
  function toggle(id) { setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  function selectAll() {
    const all = visible.length > 0 && visible.every((row) => selected.has(row.id));
    setSelected((current) => { const next = new Set(current); visible.forEach((row) => all ? next.delete(row.id) : next.add(row.id)); return next; });
  }
  function openSalary(rows) { setSalaryRows(rows); setSalaryFields({}); setSalaryValues({ salaryBase: rows.length === 1 ? rows[0].salaryBase : 8700, salaryFactor: rows.length === 1 ? rows[0].salaryFactor : 13.5, salaryStatus: rows.length === 1 && rows[0].salaryStatus ? rows[0].salaryStatus : "accepted" }); }
  function salaryConfirm(event) {
    event.preventDefault();
    const body = { action: "salary", items: snapshots(salaryRows), confirmed: true };
    Object.keys(salaryFields).filter((key) => salaryFields[key]).forEach((key) => { body[key] = key === "salaryStatus" ? salaryValues[key] : Number(salaryValues[key]); });
    setConfirmation({ rows: salaryRows, title: "确认定薪修改", description: Object.keys(body).filter((key) => key.startsWith("salary")).map((key) => `${{ salaryBase: "基础薪资", salaryFactor: "基数", salaryStatus: "是否接受薪资" }[key]}：${key === "salaryStatus" ? queueResult(body[key]) : body[key]}`).join(" · ") + (body.salaryStatus === "abandoned" ? "；放弃后转入待定。" : ""), body });
    setSalaryRows(null);
  }
  function suggestionButton(row) {
    return <Button size="sm" variant="secondary" disabled={busy} aria-label={`${permitted ? "添加" : "查看"}${row.name}的建议`} onClick={() => { setSuggestionRow(row); setSuggestion(""); }}>{permitted ? "添加建议" : "查看建议"}{row.suggestions?.length > 0 ? ` · ${row.suggestions.length} 条` : ""}</Button>;
  }
  function resultButtons(row) {
    return <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => confirmResult([row], "passed")}>通过</Button><Button size="sm" variant="secondary" disabled={busy} onClick={() => confirmResult([row], "pending")}>待定</Button></div>;
  }
  function deletionButton(row) {
    return canDelete && <Button size="sm" variant="danger" disabled={busy || !data.queue.deletionEnabled} aria-label={`删除${row.name}的排队记录`} onClick={() => { setDeletionRow(row); setDeletionKey(""); setDeletionError(""); }}>删除人员</Button>;
  }
  async function confirmDeletion(event) {
    event.preventDefault(); setBusy(true); setDeletionError("");
    try {
      await remove(deletionRow.id, { updatedAt: deletionRow.updatedAt, deletionKey, confirmed: true });
      setDeletionRow(null); setSelected((current) => new Set([...current].filter((id) => id !== deletionRow.id)));
      toast("已删除该人员的本专场排队记录", "success");
    } catch (err) { setDeletionError(err.response?.status === 409 ? "人员已更新或已删除，请关闭确认框后重新选择人员。" : queueErrorMessage(err)); }
    finally { setDeletionKey(""); setBusy(false); await refresh(true); }
  }
  if (!data) return error ? <Card className="p-6"><p className="text-red-500">{error}</p><Button className="mt-3" onClick={() => refresh(true)}>重试</Button></Card> : <LoadingBlock height="h-64" label="加载面试排队…" />;
  const shell = screen ? "min-h-screen bg-[#081326] text-slate-100 p-4 md:p-8" : "space-y-5 text-navy-700";
  return <div className={shell}>
    <header className={`flex flex-wrap items-start justify-between gap-3 ${screen ? "mb-6" : ""}`}><div><p className={`text-xs ${screen ? "text-cyan-300" : "text-gray-600"}`}>MESA · 大学专场面试排队{role !== "staff" ? ` · ${{ professional: "专业面试官", culture: "文化面试官", hr: "HR" }[role]}` : ""}</p><h1 className={`${screen ? "text-3xl md:text-4xl" : "text-2xl"} font-bold mt-1`}>{data.queue.session.name}{data.queue.station ? ` · ${data.queue.station.name}` : ""}</h1><p className={`text-sm mt-2 ${error ? "text-red-400" : screen ? "text-gray-300" : "text-gray-600"}`}>{error || "手动刷新查看最新排队状态"}</p></div><div className="flex items-center gap-3"><time className="font-mono tabular-nums">{clock.toLocaleTimeString("zh-CN", { hour12: false })}</time>{screen && <Button size="sm" variant="secondary" onClick={() => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => toast("当前浏览器不支持全屏", "error"))}>全屏</Button>}<Button size="sm" variant="secondary" onClick={() => refresh(true)}>刷新</Button></div></header>
    <div className={`flex flex-wrap gap-2 ${screen ? "mb-5" : ""}`}>
      {Object.entries(QUEUE_STAGE_LABELS).filter(([key]) => (["staff", "hr"].includes(role)) || key === "pending" || key === (role === "hr" ? "salary" : role)).map(([key, label]) => <button key={key} onClick={() => { setTab(key); setSelected(new Set()); setFilterColumn(null); }} className={`rounded-xl px-4 py-3 font-bold ${tab === key ? screen ? "bg-cyan-500 text-slate-950" : "bg-brand text-white shadow-button" : screen ? "bg-slate-800 text-slate-300" : "bg-white text-gray-700"}`}>{label} <span className="ml-2 opacity-75">{entries.filter((row) => row.stage === key).length}</span></button>)}
    </div>
    {data.queue.setup?.cultureOnsite === false && <p className="rounded-xl bg-amber-50 text-amber-800 p-4 text-sm">本专场无现场文化面试：专业面通过后，等待 HR 联系线上文化面试，后续定薪等流程由 HR 线上通知。</p>}
    {routing && !screen && <p className="text-sm text-gray-600">{["professional", "culture"].includes(role) ? "仅展示 HR 分配给本席位的人员；按顺序叫号，点击刷新查看最新状态。未收到人员时请联系 HR。" : "专业／文化 Tab 可多选或全选分配、转派面试官；各席位独立排队，进入下一阶段后等待 HR 重新分配。"}</p>}
    {canDelete && !data.queue.deletionEnabled && <p className="rounded-xl bg-lightPrimary p-3 text-sm text-gray-600">尚未设置删除密钥，暂不能删除人员。请由分享人在大学专场的「分享给 HR」中设置，再点击刷新。</p>}
    {currentInterview && <Card className="p-5 gap-4"><div className="flex flex-col sm:flex-row sm:flex-wrap justify-between gap-5"><div className="min-w-0 flex-1"><div className="flex flex-wrap justify-between items-center gap-3 mb-2"><p className="text-sm text-gray-600">当前待面试人员</p>{tab === "culture" && permitted && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand" checked={selected.has(currentInterview.id)} onChange={() => toggle(currentInterview.id)} aria-label={`选择${currentInterview.name}`} />选择此人参加群面</label>}</div><h2 className="text-2xl font-bold">{currentInterview.name}</h2><div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm mt-3">{identityColumns.slice(1).map(([key, label]) => <p key={key} className="break-words"><span className="text-gray-600">{label}：</span>{currentInterview[key]}{key === "jobDirection" && tab === "professional" && permitted && <button className="text-brand ml-2" onClick={() => { setDirectionRow(currentInterview); }}>修改</button>}</p>)}</div></div><QueueTimer startedAt={currentInterview[`${tab}StartedAt`]} disabled={!permitted || busy} onStart={() => submit({ action: `${tab}-timer`, items: snapshots([currentInterview]) })} /></div><div className="border-t border-gray-100 pt-4 flex flex-wrap items-center gap-4">{permitted && <><strong className="text-sm">{QUEUE_STAGE_LABELS[tab]}结果</strong>{resultButtons(currentInterview)}</>}{suggestionButton(currentInterview)}{deletionButton(currentInterview)}</div></Card>}
    {!screen && !allocation && tab === "culture" && selectedRows.length > 0 && <Card className="p-5 gap-4"><div className="flex flex-wrap items-center justify-between gap-5"><div><h2 className="font-bold">当前群面 · 已选 {selectedRows.length} 人</h2><p className="text-sm text-gray-600 mt-2">{selectedRows.map((row) => row.name).join("、")}</p></div><QueueTimer culture startedAt={groupStartedAt} disabled={!permitted || busy || selectedRows.some((row) => row.cultureStartedAt)} onStart={() => submit({ action: "culture-timer", items: snapshots(selectedRows) })} /></div>{permitted && <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-4"><Button size="sm" disabled={busy} onClick={() => confirmResult(selectedRows, "passed")}>所选人员通过</Button><Button size="sm" variant="secondary" disabled={busy} onClick={() => confirmResult(selectedRows, "pending")}>所选人员待定</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => setSelected(new Set())}>取消选择</Button></div>}</Card>}
    {!screen && !allocation && tab === "culture" && activeGroups.length > 0 && <div className="flex flex-wrap gap-2">{activeGroups.map((group, index) => <button key={group} className="rounded-lg px-3 py-2 bg-white text-xs text-brand" onClick={() => setSelected(new Set(stageRows.filter((row) => row.cultureGroupId === group).map((row) => row.id)))}>进入计时组 {index + 1} · {stageRows.filter((row) => row.cultureGroupId === group).length} 人</button>)}</div>}
    <section className={`${screen ? "rounded-xl border border-slate-700 bg-slate-900/80" : "bg-white rounded-card shadow-card"} min-w-0 overflow-hidden`}>
      <div className="p-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">{singleInterview ? "后续待面试人员" : tab === "salary" ? "当前待定薪人员（全量）" : QUEUE_STAGE_LABELS[tab]} <span className="text-sm font-normal opacity-70">{tableRows.length} 人{Object.keys(activeFilters).length ? " · 已筛选" : ""}</span></h2><p className="text-xs opacity-60 mt-1">点击表头按列内容筛选</p></div><div className="flex flex-wrap gap-3 items-center">{Object.keys(activeFilters).length > 0 && <button className={screen ? "text-cyan-300 text-sm" : "text-brand text-sm"} onClick={() => setFilters((current) => ({ ...current, [tab]: {} }))}>清除筛选</button>}{selectable && <><label className="flex gap-2 items-center text-sm"><input type="checkbox" className="accent-brand" checked={visible.length > 0 && visible.every((row) => selected.has(row.id))} onChange={selectAll} />全选筛选结果</label><span className="text-sm">已选 {selectedRows.length}</span>{allocation && <Button size="sm" disabled={busy || !selectedRows.length} onClick={() => { setAssignRows(selectedRows); setTargetStation(""); }}>分配给面试官</Button>}{tab === "salary" && <Button size="sm" disabled={busy || !selectedRows.length} onClick={() => openSalary(selectedRows)}>批量修改定薪</Button>}</>}</div></div>
      <div className="overflow-x-auto"><table className={`w-full text-left whitespace-nowrap ${screen ? "text-lg" : "text-sm"}`}><thead className={screen ? "bg-slate-800 text-slate-300" : "bg-lightPrimary text-gray-700"}><tr>{selectable && <th className="px-4 py-4">选择</th>}{columns.map((column) => <th key={column.key} className="px-4 py-4"><button className="inline-flex items-center gap-2" onClick={() => setFilterColumn(column)} aria-label={`筛选${column.label}`}>{column.label}<I name="filter" size={14} className={activeFilters[column.key] ? screen ? "text-cyan-300" : "text-brand" : "opacity-40"} /></button></th>)}{!screen && <th className="px-4 py-4">建议</th>}{canDelete && <th className="px-4 py-4">删除</th>}{((permitted && tab === "salary") || hrPending || allocation) && <th className="px-4 py-4">操作</th>}</tr></thead><tbody>
        {tableRows.map((row) => <tr key={row.id} className={`border-t ${screen ? "border-slate-700" : selected.has(row.id) ? "border-gray-100 bg-lightPrimary/60" : "border-gray-100 hover:bg-lightPrimary/30"}`}>{selectable && <td className="p-4"><input type="checkbox" className="accent-brand" checked={selected.has(row.id)} onChange={() => toggle(row.id)} aria-label={`选择${row.name}`} /></td>}{columns.map(({ key }) => <td key={key} className={`p-4 ${key === "name" ? "font-bold" : ""}`}>{permitted && key === "cultureResult" && selected.has(row.id) ? resultButtons(row) : directionEditable && key === "jobDirection" ? <button className="text-brand" onClick={() => { setDirectionRow(row); }} aria-label={`修改${row.name}的岗位方向`}>{row.jobDirection || "选择岗位"}</button> : valueOf(row, key) || "—"}</td>)}{!screen && <td className="p-4">{suggestionButton(row)}</td>}{canDelete && <td className="p-4">{deletionButton(row)}</td>}{((permitted && tab === "salary") || hrPending || allocation) && <td className="p-4">{allocation ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => { setAssignRows([row]); setTargetStation(row.stationId || ""); }}>分配／转派</Button> : hrPending ? <Button size="sm" variant="secondary" disabled={busy} aria-label={`将${row.name}重新排队`} onClick={() => setRequeueRow(row)}>重新排队</Button> : <button className="text-brand" disabled={busy} onClick={() => openSalary([row])}>修改定薪</button>}</td>}</tr>)}
      </tbody></table></div>{tableRows.length === 0 ? <p className="text-center py-12 opacity-60">{stageRows.length && !visible.length ? "没有符合筛选条件的人员" : currentInterview ? "暂无后续待面试人员" : "暂无人员"}</p> : null}
    </section>
    {filterColumn && <SummaryColumnFilter key={`${tab}-${filterColumn.key}`} column={filterColumn} options={[...new Set(stageRows.map((row) => valueOf(row, filterColumn.key)))].sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true })).map((value) => ({ value, count: stageRows.filter((row) => valueOf(row, filterColumn.key) === value).length }))} values={activeFilters[filterColumn.key]} onClose={() => setFilterColumn(null)} onApply={(values) => { setFilters((current) => { const next = { ...(current[tab] || {}) }; values === null ? delete next[filterColumn.key] : next[filterColumn.key] = values; return { ...current, [tab]: next }; }); setFilterColumn(null); }} />}
    {currentSuggestionRow && <Modal open onClose={() => !busy && setSuggestionRow(null)} maxWidth="max-w-xl"><div className="p-5 md:p-6 space-y-5 text-navy-700"><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-xl break-words">面试建议 · {currentSuggestionRow.name}</h2><p className="text-xs text-gray-600 mt-2">建议保存在该人员记录中，后续面试阶段可继续查看。</p></div><button type="button" aria-label="关闭建议" disabled={busy} className="p-1 text-gray-600" onClick={() => setSuggestionRow(null)}>✕</button></div><div className="space-y-3 max-h-64 overflow-y-auto">{currentSuggestionRow.suggestions?.length ? currentSuggestionRow.suggestions.map((item) => <article key={item.id} className="rounded-xl bg-lightPrimary p-3 space-y-2"><div className="text-xs text-gray-600 flex flex-wrap justify-between gap-2"><strong>{item.authorRole === "staff" ? "招聘工作台" : QUEUE_ROLE_LABELS[item.authorRole] || "面试官"}</strong><time>{new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })}</time></div><p className="text-sm whitespace-pre-wrap break-words">{item.content}</p></article>) : <p className="text-sm text-gray-600">暂无建议</p>}</div>{permitted && <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (suggestionWritable) submit({ action: "suggestion", items: snapshots([currentSuggestionRow]), content: suggestion.trim() }); }}><label className="block text-sm font-bold" htmlFor="queue-suggestion">添加建议</label><textarea id="queue-suggestion" className="w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" rows={4} maxLength={5000} required disabled={busy} placeholder="填写对该候选人的面试建议" value={suggestion} onChange={(event) => setSuggestion(event.target.value)} />{!suggestionWritable && <p className="text-sm text-gray-600">该人员已流转，请查看最新排队记录。</p>}<div className="flex justify-end gap-3"><Button type="button" variant="ghost" disabled={busy} onClick={() => setSuggestionRow(null)}>取消</Button><Button type="submit" disabled={busy || !suggestionWritable || !suggestion.trim()}>{busy ? "保存中…" : "保存建议"}</Button></div></form>}</div></Modal>}
    {directionRow && <QueueDirectionModal row={directionRow} jobs={data.jobs} loadJob={loadJob} onClose={() => setDirectionRow(null)} onConfirm={(jobDirection) => { setConfirmation({ rows: [directionRow], title: "确认修改岗位方向", description: `${directionRow.jobDirection} → ${jobDirection}`, body: { action: "direction", jobDirection, items: snapshots([directionRow]), confirmed: true } }); setDirectionRow(null); }} />}
    {requeueRow && <Modal open onClose={() => setRequeueRow(null)} maxWidth="max-w-md"><div className="p-6 space-y-4"><h2 className="font-bold text-xl">重新排队 · {requeueRow.name}</h2><p className="text-sm text-gray-600">选择重新加入的队列，将排在该队列最后。登记资料、薪资金额和历史建议保留；需要重做的面试结果、计时和薪资接受状态会清除。</p><div className="flex flex-col gap-3">{["professional", "culture"].map((targetStage) => <Button key={targetStage} variant="secondary" onClick={() => { setConfirmation({ rows: [requeueRow], title: "确认重新排队", description: `加入${QUEUE_STAGE_LABELS[targetStage]}队尾，清除该阶段及后续结果、计时和薪资接受状态。${targetStage === "culture" ? "未通过的专业面试结果会清除，不会标记为通过。" : ""}`, body: { action: "requeue", targetStage, items: snapshots([requeueRow]), confirmed: true } }); setRequeueRow(null); }}>加入{QUEUE_STAGE_LABELS[targetStage]}队尾</Button>)}</div><div className="flex justify-end"><Button variant="ghost" onClick={() => setRequeueRow(null)}>取消</Button></div></div></Modal>}
    {assignRows && <Modal open onClose={() => setAssignRows(null)} maxWidth="max-w-md"><form className="p-6 space-y-4" onSubmit={(event) => { event.preventDefault(); const station = stations.find((s) => s.id === targetStation); setConfirmation({ rows: assignRows, title: "确认分配面试官", description: `${station ? `分配给 ${station.name}，加入该席位队尾` : "撤回分配，等待 HR 重新安排"}。转派会清除本阶段计时，历史结果与建议保留。`, body: { action: "assign", items: snapshots(assignRows), targetStationId: targetStation || null, confirmed: true } }); setAssignRows(null); }}><h2 className="font-bold text-xl">分配面试官 · {assignRows.length} 人</h2><p className="text-sm break-words">{assignRows.map((r) => r.name).join("、")}</p><label className="block text-sm font-bold">{QUEUE_STAGE_LABELS[tab]}席位<select aria-label="分配面试官" className="block mt-2 w-full p-3 rounded-xl border border-gray-200 font-normal" value={targetStation} onChange={(e) => setTargetStation(e.target.value)}><option value="">撤回分配／等待 HR 安排</option>{stations.filter((s) => s.role === tab).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>{!stations.some((s) => s.role === tab) && <p className="text-sm text-amber-700">尚未配置该阶段面试官，请在大学专场的「面试官与流程设置」中添加。</p>}<div className="flex justify-end gap-3"><Button type="button" variant="ghost" onClick={() => setAssignRows(null)}>取消</Button><Button type="submit">下一步确认</Button></div></form></Modal>}
    {salaryRows && <Modal open onClose={() => setSalaryRows(null)} maxWidth="max-w-md"><form onSubmit={salaryConfirm} className="p-6 space-y-4"><h2 className="font-bold text-xl">修改定薪 · {salaryRows.length} 人</h2><p className="text-sm text-gray-600">勾选要修改的字段，统一应用到所选人员。</p>{[["salaryBase", "基础薪资"], ["salaryFactor", "基数"], ["salaryStatus", "是否接受薪资"]].map(([key, label]) => <div key={key} className="space-y-2"><label className="text-sm flex gap-2 items-center"><input type="checkbox" className="accent-brand" checked={Boolean(salaryFields[key])} onChange={(e) => setSalaryFields((current) => ({ ...current, [key]: e.target.checked }))} />{label}</label>{key === "salaryStatus" ? <select aria-label={label} disabled={!salaryFields[key]} className="border border-gray-200 rounded-xl p-3 w-full text-navy-700" value={salaryValues[key]} onChange={(e) => setSalaryValues((current) => ({ ...current, [key]: e.target.value }))}><option value="accepted">接受</option><option value="abandoned">放弃</option></select> : <Input type="number" step="0.01" min={0} max={key === "salaryBase" ? 10000000 : 1000} required aria-label={label} disabled={!salaryFields[key]} value={salaryValues[key]} onChange={(e) => setSalaryValues((current) => ({ ...current, [key]: e.target.value }))} />}</div>)}<div className="flex justify-end gap-3"><Button variant="ghost" type="button" onClick={() => setSalaryRows(null)}>取消</Button><Button type="submit" disabled={!Object.values(salaryFields).some(Boolean)}>下一步确认</Button></div></form></Modal>}
    {deletionRow && <Modal open onClose={() => !busy && setDeletionRow(null)} maxWidth="max-w-md"><form onSubmit={confirmDeletion} className="p-6 space-y-4 text-navy-700"><h2 className="font-bold text-xl">确认删除排队人员</h2><p className="font-bold break-words">{deletionRow.name} · {deletionRow.school}</p><p className="text-sm text-gray-600">将永久删除此人在「{data.queue.session.name}」的排队记录、面试结果及建议，无法在页面恢复；校招候选人资料和其他专场记录保留。</p><Input id="queue-delete-key" label="删除密钥" type="password" autoComplete="off" required minLength={6} maxLength={64} pattern="[A-Za-z0-9]{6,64}" disabled={busy} value={deletionKey} onChange={(event) => setDeletionKey(event.target.value)} placeholder="请输入分享人设置的删除密钥" />{deletionError && <p role="alert" className="text-sm text-red-500">{deletionError}</p>}<div className="flex justify-end gap-3"><Button type="button" variant="ghost" disabled={busy} onClick={() => { setDeletionRow(null); setDeletionKey(""); }}>取消</Button><Button type="submit" variant="danger" disabled={busy || deletionKey.length < 6}>{busy ? "删除中…" : "确认删除"}</Button></div></form></Modal>}
    {confirmation && <Modal open onClose={() => !busy && setConfirmation(null)} maxWidth="max-w-md"><div className="p-6 space-y-4 text-navy-700"><h2 className="font-bold text-xl">{confirmation.title}</h2><p className="text-sm break-words">{confirmation.rows.map((row) => row.name).join("、")}（{confirmation.rows.length} 人）</p><p className="text-sm text-gray-600">{confirmation.description}</p><div className="flex justify-end gap-3"><Button variant="ghost" disabled={busy} onClick={() => setConfirmation(null)}>取消</Button><Button disabled={busy} onClick={() => submit(confirmation.body)}>{busy ? "保存中…" : "确认提交"}</Button></div></div></Modal>}
  </div>;
}
