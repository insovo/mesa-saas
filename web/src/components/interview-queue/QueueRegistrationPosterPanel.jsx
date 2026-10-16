import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Input, toast } from "../Primitives.jsx";
import { queueApi, queueErrorMessage } from "../../lib/interviewQueueApi.js";
import QueueRegistrationPoster from "./QueueRegistrationPoster.jsx";
import { QUEUE_POSTER_SIZES, QUEUE_POSTER_LABELS, queuePosterFilename, queuePosterPng, readQueueGroupQr } from "../../lib/queuePosterExport.js";

export default function QueueRegistrationPosterPanel({ session, link, url, kind = "registration", stationName = "", expanded, onExpandedChange, onLocationSaved }) {
  const label = QUEUE_POSTER_LABELS[kind];
  const [format, setFormat] = useState("portrait");
  const [busy, setBusy] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [toolsHidden, setToolsHidden] = useState(false);
  const [location, setLocation] = useState(session.location || "");
  const [savedLocation, setSavedLocation] = useState(session.location || "");
  const [savingLocation, setSavingLocation] = useState(false);
  const [includeGroupQr, setIncludeGroupQr] = useState(false);
  const [groupQr, setGroupQr] = useState("");
  const [readingQr, setReadingQr] = useState(false);
  const groupQrRead = useRef(0);
  const registration = kind === "registration";
  const ready = !readingQr && (!registration || !includeGroupQr || Boolean(groupQr));
  const posterProps = { cultureOnsite: session.setup?.cultureOnsite !== false, routingEnabled: Boolean(session.setup?.stations?.length), stationName, location: location.trim(), groupQr: registration && includeGroupQr ? groupQr : "" };
  const previewRef = useRef(null); const stageSvgRef = useRef(null); const stageRef = useRef(null);
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);
  useEffect(() => { setImageUrl(""); }, [url, format, kind, location, groupQr, includeGroupQr, stationName, session.setup]);
  async function updateLocation() {
    setSavingLocation(true);
    try { const result = await queueApi.location(session.id, location.trim()); setLocation(result.location); setSavedLocation(result.location); onLocationSaved?.(); toast("现场面试地址已更新到校招专场，请重新下载海报", "success"); }
    catch (err) { toast(queueErrorMessage(err), "error"); } finally { setSavingLocation(false); }
  }
  async function uploadGroupQr(event) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    const read = ++groupQrRead.current; setReadingQr(true); setGroupQr("");
    try { const source = await readQueueGroupQr(file); if (read === groupQrRead.current) setGroupQr(source); }
    catch (err) { if (read === groupQrRead.current) toast(err.message, "error"); } finally { if (read === groupQrRead.current) setReadingQr(false); }
  }
  useEffect(() => {
    if (!expanded) return;
    const active = document.activeElement; const previousOverflow = document.body.style.overflow; const stage = stageRef.current;
    document.body.style.overflow = "hidden"; stage?.focus();
    return () => {
      document.body.style.overflow = previousOverflow; active?.focus?.();
      if (document.fullscreenElement === stage) document.exitFullscreen?.().catch(() => {});
      else if (document.webkitFullscreenElement === stage) document.webkitExitFullscreen?.();
    };
  }, [expanded]);
  async function download() {
    if (!ready) { toast("请先上传校招群二维码，或取消附加选项", "error"); return; }
    if (link.expiresAt && new Date(link.expiresAt) <= new Date()) { toast(`${kind === "registration" ? "登记" : "分享"}链接已过期，请重新生成链接后下载海报`, "error"); return; }
    setBusy(true);
    try {
      const blob = await queuePosterPng(expanded ? stageSvgRef.current : previewRef.current, QUEUE_POSTER_SIZES[format]);
      const pngUrl = URL.createObjectURL(blob); setImageUrl(pngUrl);
      const anchor = document.createElement("a"); anchor.href = pngUrl; anchor.download = queuePosterFilename(stationName ? `${session.name}-${stationName}` : session.name, format, kind); document.body.appendChild(anchor); anchor.click(); anchor.remove();
      toast("海报已生成，可下载转发或在 iPad 相册中展示", "success");
    } catch (err) { toast(err.message || "海报生成失败，请重试", "error"); } finally { setBusy(false); }
  }
  function display() { setFormat("landscape"); setToolsHidden(false); onExpandedChange(true); }
  async function fullScreen() {
    try {
      const stage = stageRef.current;
      if (stage.requestFullscreen) await stage.requestFullscreen();
      else if (stage.webkitRequestFullscreen) stage.webkitRequestFullscreen();
      setToolsHidden(true);
    } catch { toast("可直接横屏展示，或下载海报在相册中全屏打开", "error"); }
  }
  function trapFocus(event) {
    if (event.key !== "Tab") return;
    const controls = [...stageRef.current.querySelectorAll("button, a[href]")].filter((node) => !node.disabled);
    const first = controls[0]; const last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === stageRef.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === stageRef.current)) { event.preventDefault(); first?.focus(); }
  }
  const selector = <div className="flex flex-wrap gap-2" aria-label="海报版式"><Button size="sm" variant={format === "portrait" ? "primary" : "secondary"} disabled={busy} aria-pressed={format === "portrait"} onClick={() => setFormat("portrait")}>群聊竖版</Button><Button size="sm" variant={format === "landscape" ? "primary" : "secondary"} disabled={busy} aria-pressed={format === "landscape"} onClick={() => setFormat("landscape")}>iPad 横屏版</Button></div>;
  const saveImage = imageUrl && <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-brand underline">打开生成的图片，长按保存</a>;
  return <section className="space-y-4 text-left">
    <div><h3 className="font-bold">{label}海报</h3><p className="mt-1 text-xs text-gray-600">竖版适合群聊转发；横版适合 iPad mini，完整缩放、不裁剪。</p></div>
    {registration && <div className="space-y-4 rounded-xl border border-gray-100 p-3"><Input id="queue-poster-location" label="现场面试地址" maxLength={200} value={location} disabled={busy || savingLocation} onChange={(event) => setLocation(event.target.value)} placeholder="从校招专场读取，可在此更新" /><div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="secondary" disabled={busy || savingLocation || !location.trim() || location.trim() === savedLocation} onClick={updateLocation}>{savingLocation ? "更新中…" : "更新地址"}</Button><p className="text-xs text-gray-600">更新后保存到该校招专场；海报预览即时显示输入地址。</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand" disabled={busy} checked={includeGroupQr} onChange={(event) => setIncludeGroupQr(event.target.checked)} />附加校招群二维码</label>{includeGroupQr && <div className="space-y-2"><label className="block text-sm font-medium" htmlFor="queue-poster-group-qr">上传校招群二维码</label><input id="queue-poster-group-qr" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || readingQr} onChange={uploadGroupQr} className="w-full text-sm" /><p className="text-xs text-gray-600">正方形 PNG／JPG／WebP，5MB 以内、边长不超过 4096px；海报上与登记码等大。图片仅用于当前窗口的海报，关闭后需重新上传。</p>{readingQr ? <p className="text-xs text-gray-600">正在读取二维码…</p> : groupQr ? <img src={groupQr} alt="已上传的校招群二维码" className="w-24 h-24 object-contain bg-white" /> : <p className="text-xs text-amber-700">请上传二维码后生成海报。</p>}</div>}</div>}
    {registration && session.setup?.cultureOnsite === false && <p className="rounded-xl bg-amber-50 text-amber-800 p-3 text-sm">海报将提示：本专场无现场文化面试官，专业面通过后，由 HR 线上联系后续流程。</p>}
    {selector}
    <button type="button" disabled={!ready} onClick={() => { setToolsHidden(false); onExpandedChange(true); }} className="block h-[420px] w-full bg-lightPrimary rounded-xl p-2 focus-visible:ring-2 focus-visible:ring-brand" aria-label={`放大${label}海报预览`}><QueueRegistrationPoster ref={previewRef} sessionName={session.name} url={url} expiresAt={link.expiresAt} kind={kind} requireKey={link.requireKey} format={format} {...posterProps} className="w-full h-full" /></button>
    <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy || !ready} onClick={download}>{busy ? "生成图片中…" : `下载${format === "landscape" ? "iPad 横屏" : "群聊竖版"} PNG`}</Button><Button size="sm" variant="secondary" disabled={!ready} onClick={display}>iPad 横屏展示</Button></div>
    {saveImage}
    <p className="text-xs text-gray-600">{kind.startsWith("campus-") ? "海报使用当前专场入口；开放状态与匹配功能以学生页面为准。更新入口或指南后请重新下载海报。" : "文案、地址、流程或席位名称变更后，旧 PNG 不会自动更新。链接仍有效时可直接重新下载海报，无需重新生成链接；更新或停止分享会使原链接失效。"}</p>
    {expanded && createPortal(<div ref={stageRef} role="dialog" aria-modal="true" aria-label={`${label}海报展示`} tabIndex={-1} onKeyDown={trapFocus} className="fixed inset-0 z-[180] flex flex-col bg-[#EBEAF3] h-screen outline-none" style={{ height: "100dvh", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      {toolsHidden ? <div className="absolute top-3 right-3 z-10 flex gap-2"><Button size="sm" variant="secondary" onClick={() => setToolsHidden(false)}>显示工具栏</Button><Button size="sm" variant="ghost" aria-label="退出海报展示" onClick={() => onExpandedChange(false)}>✕</Button></div> : <div className="shrink-0 bg-white/95 p-3 flex flex-wrap items-center gap-2 border-b border-gray-200">{selector}<Button size="sm" disabled={busy} onClick={download}>{busy ? "生成图片中…" : "下载当前海报 PNG"}</Button><Button size="sm" variant="secondary" onClick={fullScreen}>全屏展示</Button><Button size="sm" variant="ghost" onClick={() => setToolsHidden(true)}>隐藏工具栏</Button><Button size="sm" variant="ghost" onClick={() => onExpandedChange(false)}>退出展示</Button>{saveImage}</div>}
      <div className="flex-1 min-h-0 min-w-0 p-2 sm:p-3"><QueueRegistrationPoster ref={stageSvgRef} sessionName={session.name} url={url} expiresAt={link.expiresAt} kind={kind} requireKey={link.requireKey} format={format} {...posterProps} className="block w-full h-full" /></div>
    </div>, document.body)}
  </section>;
}
