import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button, Card, Input, LoadingBlock, Modal, ToastHost, toast } from "../components/Primitives.jsx";
import { publicCampusJobShareApi, jobShareError } from "../lib/campusJobShareApi.js";

function JdSection({ title, items, text }) {
  if (!items?.length && !text) return null;
  return <section className="space-y-2"><h3 className="font-bold text-sm">{title}</h3>{items?.length ? <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700 break-words">{items.map((line, index) => <li key={index}>{line}</li>)}</ul> : <p className="whitespace-pre-wrap break-words text-sm text-gray-700">{text}</p>}</section>;
}

function NewJobModal({ defaults, busy, onSave, onClose }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("referral");
  const [responsibilities, setResponsibilities] = useState("");
  const [requirements, setRequirements] = useState("");
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault(); setError("");
    const lines = (text) => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const body = { title: title.trim(), kind, responsibilities: lines(responsibilities), requirements: lines(requirements) };
    if (!body.title || !body.responsibilities.length || !body.requirements.length) { setError("请填写岗位名称、岗位职责和任职要求"); return; }
    try { await onSave(body); } catch (err) { setError(jobShareError(err)); }
  }
  return <Modal open onClose={busy ? undefined : onClose}><form className="p-5 md:p-6 space-y-5" onSubmit={submit}>
    <div className="flex justify-between gap-3"><h2 className="font-bold text-xl">新建岗位 JD</h2><button type="button" disabled={busy} aria-label="关闭新建岗位" onClick={onClose} className="p-2">✕</button></div>
    <Input label="岗位名称" aria-label="岗位名称" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
    <label className="block text-sm font-bold">岗位类型<select aria-label="岗位类型" required disabled={busy} value={kind} onChange={(event) => setKind(event.target.value)} className="mt-2 w-full rounded-xl border border-gray-200 bg-white p-3 font-normal"><option value="onsite">现场面试</option><option value="referral">内推（非现场面试）</option></select></label>
    <label className="block text-sm">岗位职责<textarea aria-label="岗位职责" required rows={5} maxLength={100000} placeholder="每行一条职责" value={responsibilities} onChange={(e) => setResponsibilities(e.target.value)} className="mt-2 w-full border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-brand/30" /></label>
    <label className="block text-sm">任职要求<textarea aria-label="任职要求" required rows={5} maxLength={100000} placeholder="每行一条要求" value={requirements} onChange={(e) => setRequirements(e.target.value)} className="mt-2 w-full border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-brand/30" /></label>
    <div className="rounded-xl bg-lightPrimary p-4 text-sm space-y-2"><p className="font-bold">自动填写</p><p>{defaults.location} · {defaults.employment} · {defaults.educationRequirement} · 名额不限</p><p className="text-xs text-gray-600">部门、薪资、语言要求和投递截止日期留空。岗位类型按上方选择保存，同步至所有专场。</p><details><summary className="cursor-pointer text-brand">查看完整福利待遇</summary><ul className="list-disc pl-5 mt-3 space-y-1 text-xs">{defaults.benefits.map((line, index) => <li key={index}>{line}</li>)}</ul></details></div>
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    <Button type="submit" disabled={busy} className="w-full">{busy ? "保存中…" : "保存并同步所有专场"}</Button>
  </form></Modal>;
}

function Review({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [viewId, setViewId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [confirmKind, setConfirmKind] = useState(null);
  const load = useCallback(async () => {
    try {
      const result = await publicCampusJobShareApi.data(token); setData(result); setError("");
      setSelected((current) => new Set([...current].filter((id) => result.jobs.some((job) => job.id === id))));
    } catch (err) {
      setError(jobShareError(err));
      if ([403, 404, 410].includes(err.response?.status)) { setData(null); setUnavailable(true); setCreating(false); setViewId(null); }
    } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { load(); const timer = setInterval(load, 15000); return () => clearInterval(timer); }, [load]);
  const jobs = data?.jobs || [];
  const visible = jobs.filter((job) => job.title.toLowerCase().includes(search.trim().toLowerCase()));
  const allSelected = visible.length > 0 && visible.every((job) => selected.has(job.id));
  const viewing = jobs.find((job) => job.id === viewId);
  function toggle(id) { setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  function selectAll() { setSelected((current) => { const next = new Set(current); visible.forEach((job) => allSelected ? next.delete(job.id) : next.add(job.id)); return next; }); }
  async function changeKind({ kind, jobs: selectedJobs }) {
    setConfirmKind(null);
    setBusy(true);
    try { await publicCampusJobShareApi.kind(token, selectedJobs.map((job) => job.id), kind); await load(); toast("岗位类型已同步所有专场", "success"); }
    catch (err) { toast(jobShareError(err), "error"); await load(); } finally { setBusy(false); }
  }
  async function create(body) {
    setBusy(true);
    try { await publicCampusJobShareApi.create(token, body); setCreating(false); await load(); toast("岗位已新建并同步所有专场", "success"); }
    catch (err) { if ([403, 404, 410].includes(err.response?.status)) await load(); throw err; } finally { setBusy(false); }
  }
  return <div className="min-h-screen bg-gradient-to-b from-[#F5F7FF] to-white text-navy-700"><main className="max-w-5xl mx-auto p-4 md:p-8 space-y-5">
    <Card className="p-5 md:p-6"><div className="flex justify-between gap-4 flex-wrap"><div><p className="text-xs text-brand mb-2">MESA · 校招岗位协作</p><h1 className="font-bold text-2xl">HR 岗位确认</h1><p className="text-sm text-gray-600 mt-2">查看 JD，确认现场面试岗位，或补充新岗位。</p>{data && <p className="text-xs text-gray-600 mt-2">{jobs.length} 个岗位 · 链接有效至 {new Date(data.expiresAt).toLocaleString("zh-CN")}</p>}</div>{data && <div className="flex items-start gap-2 flex-wrap"><Button size="sm" variant="ghost" disabled={busy} onClick={load}>刷新</Button><Button size="sm" disabled={busy} onClick={() => setCreating(true)}>新建岗位 JD</Button></div>}</div></Card>
    {error && <Card className="p-5"><p role="alert" className="text-sm text-red-500">{error}</p>{!unavailable && <Button className="mt-3 self-start" size="sm" onClick={load}>重新加载</Button>}</Card>}
    {loading ? <LoadingBlock height="h-48" /> : data && <>
      <Card className="p-4 space-y-4"><Input aria-label="搜索分享岗位" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索岗位名称" /><div className="flex gap-3 items-center flex-wrap"><label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" aria-label="全选分享岗位" className="accent-brand" disabled={busy || !visible.length} checked={allSelected} onChange={selectAll} />{search ? "全选搜索结果" : "全选全部岗位"}</label><span className="text-xs text-gray-600">已选 {selected.size} / {jobs.length}</span><div className="flex gap-2 flex-wrap sm:ml-auto"><Button size="sm" disabled={busy || !selected.size} onClick={() => setConfirmKind({ kind: "onsite", jobs: jobs.filter((job) => selected.has(job.id)) })}>标记现场面试</Button><Button size="sm" variant="secondary" disabled={busy || !selected.size} onClick={() => setConfirmKind({ kind: "referral", jobs: jobs.filter((job) => selected.has(job.id)) })}>标记内推</Button></div></div></Card>
      {visible.map((job) => <Card key={job.id} className="p-5"><div className="flex gap-3 items-start"><input type="checkbox" aria-label={`选择分享岗位${job.title}`} className="accent-brand mt-1" checked={selected.has(job.id)} disabled={busy} onChange={() => toggle(job.id)} /><div className="flex-1 min-w-0 space-y-2"><div className="flex flex-wrap gap-2 items-center"><button type="button" className="font-bold text-left break-words text-brand" onClick={() => setViewId(job.id)}>{job.title}</button><span className={`text-xs rounded-lg px-2 py-1 ${job.kind === "onsite" ? "bg-lightPrimary text-brand" : "bg-amber-50 text-amber-700"}`}>{job.kind === "onsite" ? "现场面试" : "内推，非现场面试"}</span></div><p className="text-xs text-gray-600">{[job.location, job.employment, job.educationRequirement].filter(Boolean).join(" · ")}</p><Button size="sm" variant="ghost" aria-label={`查看${job.title}JD详情`} onClick={() => setViewId(job.id)}>查看 JD 详细要求</Button></div></div></Card>)}
      {!visible.length && <Card className="p-6 text-center text-sm text-gray-600">{jobs.length ? "没有符合搜索条件的岗位" : "当前没有可用岗位，可点击新建岗位 JD。"}</Card>}
    </>}
  </main><ToastHost />
    {viewing && <Modal open onClose={() => setViewId(null)}><div className="p-5 md:p-6 space-y-5"><div className="flex justify-between gap-3"><h2 className="font-bold text-xl break-words">{viewing.title}</h2><button type="button" aria-label="关闭 JD 详情" className="p-2 shrink-0" onClick={() => setViewId(null)}>✕</button></div><p className="text-sm text-brand">{viewing.kind === "onsite" ? "现场面试" : "内推，非现场面试"}</p><p className="text-sm text-gray-600">{[viewing.dept, viewing.location, viewing.employment, viewing.educationRequirement, viewing.languageRequirement, viewing.salary].filter(Boolean).join(" · ")} · {viewing.openings === 0 ? "名额不限" : `${viewing.openings} 人`}</p><JdSection title="岗位职责" items={viewing.responsibilities} /><JdSection title="任职要求" items={viewing.requirements} /><JdSection title="加分项" items={viewing.nice} /><JdSection title="福利待遇" items={viewing.benefits} /><JdSection title="JD 全文 / 补充描述" text={viewing.description} /></div></Modal>}
    {creating && data && <NewJobModal defaults={data.defaults} busy={busy} onSave={create} onClose={() => setCreating(false)} />}
    {confirmKind && data && <Modal open onClose={() => setConfirmKind(null)} maxWidth="max-w-md"><div className="p-6 space-y-5"><h2 className="font-bold text-xl">确认岗位类型</h2><p className="text-sm">将已选 {confirmKind.jobs.length} 个岗位统一标记为{confirmKind.kind === "onsite" ? "现场面试" : "内推（非现场面试）"}，所有大学专场将同步更新。</p><ol aria-label="所选岗位名称" className="max-h-60 overflow-y-auto list-decimal list-inside space-y-2 rounded-xl bg-lightPrimary p-4 text-sm">{confirmKind.jobs.map((job) => <li key={job.id} className="break-words">{job.title}</li>)}</ol><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setConfirmKind(null)}>取消</Button><Button onClick={() => changeKind(confirmKind)}>确认修改岗位类型</Button></div></div></Modal>}
  </div>;
}

export default function PublicCampusJobReview() {
  const { token } = useParams();
  return <Review key={token} token={token} />;
}
