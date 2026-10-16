import { useState } from "react";
import { Button, Input, Modal, toast } from "../Primitives.jsx";
import { queueApi, QUEUE_ROLE_LABELS, queueErrorMessage } from "../../lib/interviewQueueApi.js";
import QueueRegistrationPosterPanel from "./QueueRegistrationPosterPanel.jsx";

export default function QueueShareModal({ session, kind, existing, onClose, onSaved }) {
  const stations = (session.setup?.stations || []).filter((s) => s.role === kind);
  const needsStation = (session.setup?.stations || []).length > 0 && ["professional", "culture"].includes(kind);
  const [stationId, setStationId] = useState(stations[0]?.id || "");
  const station = stations.find((s) => s.id === stationId);
  const [requireKey, setRequireKey] = useState(existing?.requireKey || false);
  const [accessKey, setAccessKey] = useState(existing?.accessKey || "");
  const [useExpiry, setUseExpiry] = useState(existing?.expiresAt !== null);
  const [amount, setAmount] = useState(kind === "registration" ? 1 : 3);
  const [unit, setUnit] = useState(86400);
  const [link, setLink] = useState(existing?.active && (!existing.expiresAt || new Date(existing.expiresAt) > new Date()) ? existing : null);
  const [busy, setBusy] = useState(false);
  const [deletionKey, setDeletionKey] = useState("");
  const [deletionEnabled, setDeletionEnabled] = useState(Boolean(session.deletionEnabled));
  const [savingDeletionKey, setSavingDeletionKey] = useState(false);
  const [posterExpanded, setPosterExpanded] = useState(false);
  const url = link ? new URL(`${link.path}${station ? `?station=${station.id}` : ""}`, window.location.origin).href : "";
  async function save(event) {
    event.preventDefault(); setBusy(true);
    try {
      await queueApi.ensure(session.id);
      const body = { requireKey: kind !== "registration" && requireKey, expirySeconds: useExpiry ? Math.round(Number(amount) * Number(unit)) : null };
      if (requireKey && accessKey) body.accessKey = accessKey;
      const result = await queueApi.share(session.id, kind, body);
      setLink(result.link); setAccessKey(result.link.accessKey || ""); onSaved();
      toast("链接已生成", "success");
    } catch (err) { toast(queueErrorMessage(err), "error"); } finally { setBusy(false); }
  }
  async function copy(value) { try { await navigator.clipboard.writeText(value); toast("已复制", "success"); } catch { toast("复制失败，请手动选择链接", "error"); } }
  async function saveDeletionKey(event) {
    event.preventDefault(); setSavingDeletionKey(true);
    try {
      await queueApi.ensure(session.id);
      await queueApi.deletionKey(session.id, deletionKey);
      setDeletionKey(""); setDeletionEnabled(true); onSaved();
      toast("删除密钥已保存，请单独告知有删除权限的 HR", "success");
    } catch (err) { toast(queueErrorMessage(err), "error"); } finally { setSavingDeletionKey(false); }
  }
  return <Modal open onClose={() => posterExpanded ? setPosterExpanded(false) : onClose()} maxWidth="max-w-lg"><div className="p-6 space-y-5">
    <div className="flex justify-between items-start gap-3"><div><h2 className="font-bold text-xl">{kind === "registration" ? "排队登记" : `分享给${QUEUE_ROLE_LABELS[kind]}`}</h2><p className="text-sm text-gray-600 mt-1">{session.name} · 无需登录</p></div><button onClick={onClose} className="p-2 text-gray-600" aria-label="关闭分享">✕</button></div>
    {needsStation && <label className="block text-sm font-bold">海报对应的面试官席位<select aria-label="海报面试官席位" className="block w-full mt-2 border border-gray-200 rounded-xl p-3" value={stationId} onChange={(e) => setStationId(e.target.value)}><option value="">请选择席位</option>{stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><span className="block text-xs text-gray-600 font-normal mt-2">为每位面试官分别选择席位并下载海报。席位共用当前角色的分享有效期与密钥；更新链接会使该角色全部旧席位海报失效。</span>{!stations.length && <span className="block text-sm text-amber-700 mt-2">请先在面试官与流程设置中添加该阶段的席位。</span>}</label>}
    {kind === "hr" && <form onSubmit={saveDeletionKey} className="space-y-3 rounded-xl bg-lightPrimary p-4"><h3 className="font-bold">人员删除密钥 · {deletionEnabled ? "已设置" : "未设置"}</h3><p className="text-xs text-gray-600">与访问密钥独立，每次删除都需输入；未设置时禁止删除。只删除本专场排队记录及其面试建议，校招候选人资料保留。密钥不会出现在链接或海报上。</p><Input id="queue-share-deletion-key" label={deletionEnabled ? "新的删除密钥" : "删除密钥"} type="password" autoComplete="new-password" required pattern="[A-Za-z0-9]{6,64}" minLength={6} maxLength={64} value={deletionKey} disabled={savingDeletionKey} onChange={(event) => setDeletionKey(event.target.value)} placeholder="6–64 位字母或数字" /><Button type="submit" size="sm" disabled={savingDeletionKey || deletionKey.length < 6}>{savingDeletionKey ? "保存中…" : deletionEnabled ? "更新删除密钥" : "保存删除密钥"}</Button><p className="text-xs text-gray-600">更新立即生效，原删除密钥失效；分享链接和访问密钥不变。保存后不回显，忘记时可重新设置。</p></form>}
    <form onSubmit={save} className="space-y-4">
      {kind !== "registration" && <><label className="flex gap-2 items-center text-sm"><input type="checkbox" className="accent-brand" checked={requireKey} onChange={(e) => setRequireKey(e.target.checked)} />添加访问密钥</label>{requireKey && <Input label="访问密钥" aria-label="访问密钥" value={accessKey} onChange={(e) => setAccessKey(e.target.value)} placeholder="留空随机生成 6 位字母和数字" pattern="[A-Za-z0-9]{6,64}" maxLength={64} />}</>}
      <label className="flex gap-2 items-center text-sm"><input type="checkbox" className="accent-brand" checked={useExpiry} disabled={kind === "registration"} onChange={(e) => setUseExpiry(e.target.checked)} />设置有效期</label>
      {useExpiry && <div className="flex gap-2"><Input type="number" aria-label="有效期数量" value={amount} min={1} max={525600} required onChange={(e) => setAmount(e.target.value)} containerClassName="flex-1" /><select className="rounded-xl border border-gray-200 px-4" aria-label="有效期单位" value={unit} onChange={(e) => setUnit(e.target.value)}><option value={60}>分钟</option><option value={3600}>小时</option><option value={86400}>天</option></select></div>}
      {!useExpiry && <p className="text-xs text-gray-600">仅使用密钥限制访问；停止分享后立即失效。</p>}
      <Button type="submit" disabled={busy || (!useExpiry && !requireKey) || (needsStation && !station)} className="w-full">{busy ? "生成中…" : link ? "更新并生成新链接" : "生成二维码和链接"}</Button>
      {link && <p className="text-xs text-gray-600">更新设置会让旧链接失效。</p>}
    </form>
    {link && (!needsStation || station) && <div className="border-t border-gray-100 pt-5 space-y-3 text-center"><QueueRegistrationPosterPanel session={session} link={link} url={url} kind={kind} stationName={station?.name || ""} expanded={posterExpanded} onExpandedChange={setPosterExpanded} onLocationSaved={onSaved} /><p className="text-xs text-gray-600">{link.expiresAt ? `有效至 ${new Date(link.expiresAt).toLocaleString("zh-CN")}` : "仅密钥限制 · 无到期时间"}</p><input aria-label="分享链接" readOnly value={url} className="w-full rounded-xl border border-gray-200 p-3 text-xs" onFocus={(e) => e.target.select()} />{link.requireKey && <p className="text-sm">访问密钥：<strong className="font-mono">{link.accessKey || "请重新生成"}</strong></p>}<div className="flex justify-center gap-2"><Button size="sm" onClick={() => copy(url)}>复制链接</Button>{link.requireKey && <Button variant="secondary" size="sm" onClick={() => copy(link.accessKey)}>复制密钥</Button>}<Button as="a" href={url} target="_blank" rel="noopener noreferrer" size="sm" variant="ghost">打开页面</Button></div></div>}
  </div></Modal>;
}
