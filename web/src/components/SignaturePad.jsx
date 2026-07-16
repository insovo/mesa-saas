import { useEffect, useMemo, useRef, useState } from "react";
import { Button, I } from "./Primitives.jsx";
import { cachedSignatureToBlob, loadCachedSignature, saveCachedSignature } from "../lib/perfSignatureCache.js";

/** 手写签名 → PNG Blob（透明底）；可选 signerKey 本机缓存复用 */
export default function SignaturePad({
  existingUrl,
  existingSignedAt,
  disabled,
  busy,
  onConfirm,
  onClearPreview,
  label = "签名",
  signerKey = null,
}) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const previewUrl = cleared ? null : (existingUrl || null);

  const cached = useMemo(() => {
    if (!signerKey || previewUrl || disabled) return null;
    return loadCachedSignature(signerKey);
  }, [signerKey, previewUrl, disabled]);

  useEffect(() => {
    setCleared(false);
  }, [existingUrl]);

  useEffect(() => {
    if (previewUrl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1B254B";
    ctx.lineWidth = 2.2;
    ctx.clearRect(0, 0, rect.width, rect.height);
    setHasInk(false);
  }, [previewUrl, cleared]);

  function pos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  function start(e) {
    if (disabled) return;
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function move(e) {
    if (!drawing.current || disabled) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasInk(true);
  }

  function end() {
    drawing.current = false;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    setHasInk(false);
  }

  async function persistAndConfirm(blob) {
    if (!blob) return;
    setLocalBusy(true);
    try {
      if (signerKey) await saveCachedSignature(signerKey, blob);
      await onConfirm?.(blob);
    } finally {
      setLocalBusy(false);
    }
  }

  async function confirmDraw() {
    if (!hasInk || !canvasRef.current) return;
    const blob = await trimCanvasToPng(canvasRef.current);
    if (!blob) return;
    await persistAndConfirm(blob);
  }

  async function applyCached() {
    if (!signerKey) return;
    const blob = await cachedSignatureToBlob(signerKey);
    if (!blob) return;
    await persistAndConfirm(blob);
  }

  const isBusy = busy || localBusy;

  if (previewUrl && !disabled) {
    return (
      <div className="space-y-2">
        <div className="rounded-xl border border-[#E9ECEF] bg-white p-3 flex flex-col items-center gap-2 min-h-[120px]">
          <img src={previewUrl} alt={label} className="max-h-20 object-contain" />
          {existingSignedAt && (
            <div className="text-[10px] text-[#A0AEC0]">
              日期 Date: {String(existingSignedAt).slice(0, 10)}
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={isBusy}
          onClick={() => {
            setCleared(true);
            onClearPreview?.();
          }}
        >
          <I name="pen-line" size={14} /> 重新签名
        </Button>
      </div>
    );
  }

  if (previewUrl && disabled) {
    return (
      <div className="rounded-xl border border-[#E9ECEF] bg-gray-50 p-3 flex flex-col items-center gap-2 min-h-[120px]">
        <img src={previewUrl} alt={label} className="max-h-20 object-contain" />
        {existingSignedAt && (
          <div className="text-[10px] text-[#A0AEC0]">
            日期 Date: {String(existingSignedAt).slice(0, 10)}
          </div>
        )}
      </div>
    );
  }

  if (disabled) {
    return (
      <div className="rounded-xl border border-dashed border-[#E9ECEF] bg-gray-50 p-4 text-center text-xs text-[#A0AEC0] min-h-[120px] flex items-center justify-center">
        待签署
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {cached && (
        <div className="rounded-xl border border-brand/20 bg-brand/5 p-2 flex items-center gap-2">
          <img src={cached.dataUrl} alt="上次签名" className="h-10 object-contain shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold text-navy-700">本机已保存签名</div>
            <div className="text-[10px] text-[#A0AEC0] truncate">
              {cached.savedAt ? `保存于 ${new Date(cached.savedAt).toLocaleDateString()}` : ""}
            </div>
          </div>
          <Button size="sm" disabled={isBusy} onClick={applyCached}>
            一键使用
          </Button>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="w-full h-28 rounded-xl border border-[#E9ECEF] bg-white touch-none cursor-crosshair"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" disabled={isBusy || !hasInk} onClick={clearCanvas}>
          清除
        </Button>
        <Button size="sm" disabled={isBusy || !hasInk} onClick={confirmDraw}>
          {isBusy ? "保存中…" : "确认签名"}
        </Button>
      </div>
    </div>
  );
}

/** 将 canvas 非空像素裁切后输出透明 PNG */
function trimCanvasToPng(sourceCanvas) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const ctx = sourceCanvas.getContext("2d");
  const { data } = ctx.getImageData(0, 0, w, h);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      if (a > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return Promise.resolve(null);
  const pad = 4;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  const tw = maxX - minX + 1;
  const th = maxY - minY + 1;
  const out = document.createElement("canvas");
  out.width = tw;
  out.height = th;
  out.getContext("2d").drawImage(sourceCanvas, minX, minY, tw, th, 0, 0, tw, th);
  return new Promise((resolve) => out.toBlob((b) => resolve(b), "image/png"));
}
