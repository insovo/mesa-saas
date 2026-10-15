import { useEffect, useState } from "react";
import { Button, Input, Modal, toast } from "../Primitives.jsx";
import { campusJobShareApi, jobShareError } from "../../lib/campusJobShareApi.js";
import QueueRegistrationPosterPanel from "../interview-queue/QueueRegistrationPosterPanel.jsx";

export default function CampusJobShareModal({ ids, onClose }) {
  const [amount, setAmount] = useState(3);
  const [unit, setUnit] = useState(86400);
  const [links, setLinks] = useState([]);
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stopping, setStopping] = useState(null);
  const [posterExpanded, setPosterExpanded] = useState(false);
  const url = link ? new URL(link.path, window.location.origin).href : "";
  useEffect(() => { let active = true; campusJobShareApi.list().then((items) => { if (active) setLinks(items); }).catch((err) => { if (active) setError(jobShareError(err)); }); return () => { active = false; }; }, []);
  async function create(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await campusJobShareApi.create({ ids, expirySeconds: Math.round(Number(amount) * Number(unit)) });
      setLink(result); setLinks((current) => [result, ...current]); toast("岗位分享已生成", "success");
    } catch (err) { setError(jobShareError(err)); } finally { setBusy(false); }
  }
  async function stop(item) {
    setStopping(null);
    setBusy(true); setError("");
    try { await campusJobShareApi.stop(item.id); setLinks((current) => current.filter((row) => row.id !== item.id)); if (link?.id === item.id) setLink(null); toast("已停止分享", "success"); }
    catch (err) { setError(jobShareError(err)); } finally { setBusy(false); }
  }
  async function copy() { try { await navigator.clipboard.writeText(url); toast("已复制链接", "success"); } catch { toast("请手动复制链接", "error"); } }
  return <Modal open onClose={() => posterExpanded ? setPosterExpanded(false) : onClose()} maxWidth="max-w-lg"><div className="p-5 md:p-6 space-y-5">
    <div className="flex justify-between gap-3"><div><h2 className="text-xl font-bold">分享岗位给 HR</h2><p className="text-sm text-gray-600 mt-2">已选 {ids.length} 个岗位 · 无需登录</p></div><button type="button" aria-label="关闭岗位分享" className="p-2 text-gray-600" onClick={onClose}>✕</button></div>
    <p className="text-sm text-gray-600">HR 可查看这些岗位的 JD，批量标记现场面试／内推，并新建校招岗位。</p>
    {ids.length > 0 && <form onSubmit={create} className="space-y-3"><p className="text-sm font-medium">链接有效期</p><div className="flex gap-2"><Input type="number" aria-label="岗位分享有效期数量" required min={1} max={525600} value={amount} onChange={(e) => setAmount(e.target.value)} containerClassName="flex-1" /><select aria-label="岗位分享有效期单位" className="border border-gray-200 rounded-xl px-4" value={unit} onChange={(e) => setUnit(e.target.value)}><option value={60}>分钟</option><option value={3600}>小时</option><option value={86400}>天</option></select></div><p className="text-xs text-gray-600">最长 365 天；到期后自动停止访问。</p><Button type="submit" className="w-full" disabled={busy}>{busy ? "处理中…" : "生成二维码和链接"}</Button></form>}
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    {link && <section className="space-y-3 border-t border-gray-100 pt-4 text-center"><QueueRegistrationPosterPanel key={link.id} session={{ name: `校招岗位 · ${link.jobsCount ?? ids.length} 个共享岗位` }} link={link} url={url} kind="job-review" expanded={posterExpanded} onExpandedChange={setPosterExpanded} /><p className="text-xs text-gray-600">有效至 {new Date(link.expiresAt).toLocaleString("zh-CN")}</p><input aria-label="岗位分享链接" readOnly value={url} onFocus={(e) => e.target.select()} className="w-full border border-gray-200 rounded-xl p-3 text-xs" /><div className="flex gap-2 justify-center flex-wrap"><Button size="sm" onClick={copy}>复制链接</Button><Button size="sm" variant="ghost" as="a" href={url} target="_blank" rel="noopener noreferrer">打开 HR 页面</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => setStopping(link)}>停止分享</Button></div></section>}
    {links.length > 0 && <section className="border-t border-gray-100 pt-4 space-y-3"><h3 className="font-bold text-sm">我的有效分享</h3>{links.map((item) => <div key={item.id} className="flex items-center gap-3 text-xs"><button type="button" className="text-left flex-1 text-brand" onClick={() => setLink(item)}>{item.jobsCount} 个岗位 · {new Date(item.expiresAt).toLocaleString("zh-CN")} 到期</button><button type="button" className="text-red-500 shrink-0" disabled={busy} onClick={() => setStopping(item)}>停止</button></div>)}</section>}
    {stopping && <div className="p-4 rounded-xl bg-amber-50 space-y-3"><p className="text-sm">确认停止此岗位分享？HR 将无法继续查看或修改岗位。</p><div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setStopping(null)}>取消停止</Button><Button size="sm" onClick={() => stop(stopping)}>确认停止分享</Button></div></div>}
  </div></Modal>;
}
