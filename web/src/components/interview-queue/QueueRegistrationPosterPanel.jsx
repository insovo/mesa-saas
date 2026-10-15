import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, toast } from "../Primitives.jsx";
import QueueRegistrationPoster from "./QueueRegistrationPoster.jsx";
import { QUEUE_POSTER_SIZES, queuePosterFilename, queuePosterPng } from "../../lib/queuePosterExport.js";

export default function QueueRegistrationPosterPanel({ session, link, url, expanded, onExpandedChange }) {
  const [format, setFormat] = useState("portrait");
  const [busy, setBusy] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [toolsHidden, setToolsHidden] = useState(false);
  const previewRef = useRef(null); const stageSvgRef = useRef(null); const stageRef = useRef(null);
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);
  useEffect(() => { setImageUrl(""); }, [url, format]);
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
    if (link.expiresAt && new Date(link.expiresAt) <= new Date()) { toast("登记链接已过期，请重新生成链接后下载海报", "error"); return; }
    setBusy(true);
    try {
      const blob = await queuePosterPng(expanded ? stageSvgRef.current : previewRef.current, QUEUE_POSTER_SIZES[format]);
      const pngUrl = URL.createObjectURL(blob); setImageUrl(pngUrl);
      const anchor = document.createElement("a"); anchor.href = pngUrl; anchor.download = queuePosterFilename(session.name, format); document.body.appendChild(anchor); anchor.click(); anchor.remove();
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
    <div><h3 className="font-bold">排队登记海报</h3><p className="mt-1 text-xs text-gray-600">竖版适合群聊转发；横版适合 iPad mini，完整缩放、不裁剪。</p></div>
    {selector}
    <button type="button" onClick={() => { setToolsHidden(false); onExpandedChange(true); }} className="block h-[420px] w-full bg-lightPrimary rounded-xl p-2 focus-visible:ring-2 focus-visible:ring-brand" aria-label="放大登记海报预览"><QueueRegistrationPoster ref={previewRef} sessionName={session.name} url={url} expiresAt={link.expiresAt} format={format} className="w-full h-full" /></button>
    <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={download}>{busy ? "生成图片中…" : `下载${format === "landscape" ? "iPad 横屏" : "群聊竖版"} PNG`}</Button><Button size="sm" variant="secondary" onClick={display}>iPad 横屏展示</Button></div>
    {saveImage}
    <p className="text-xs text-gray-600">二维码使用当前登记链接。更新链接后，请重新下载海报；旧海报会随原链接失效。</p>
    {expanded && createPortal(<div ref={stageRef} role="dialog" aria-modal="true" aria-label="排队登记海报展示" tabIndex={-1} onKeyDown={trapFocus} className="fixed inset-0 z-[180] flex flex-col bg-[#EBEAF3] h-screen outline-none" style={{ height: "100dvh", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      {toolsHidden ? <div className="absolute top-3 right-3 z-10 flex gap-2"><Button size="sm" variant="secondary" onClick={() => setToolsHidden(false)}>显示工具栏</Button><Button size="sm" variant="ghost" aria-label="退出海报展示" onClick={() => onExpandedChange(false)}>✕</Button></div> : <div className="shrink-0 bg-white/95 p-3 flex flex-wrap items-center gap-2 border-b border-gray-200">{selector}<Button size="sm" disabled={busy} onClick={download}>{busy ? "生成图片中…" : "下载当前海报 PNG"}</Button><Button size="sm" variant="secondary" onClick={fullScreen}>全屏展示</Button><Button size="sm" variant="ghost" onClick={() => setToolsHidden(true)}>隐藏工具栏</Button><Button size="sm" variant="ghost" onClick={() => onExpandedChange(false)}>退出展示</Button>{saveImage}</div>}
      <div className="flex-1 min-h-0 min-w-0 p-2 sm:p-3"><QueueRegistrationPoster ref={stageSvgRef} sessionName={session.name} url={url} expiresAt={link.expiresAt} format={format} className="block w-full h-full" /></div>
    </div>, document.body)}
  </section>;
}
