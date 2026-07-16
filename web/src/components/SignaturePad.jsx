import { useEffect, useRef, useState } from "react";
import { Button, I } from "./Primitives.jsx";

/**
 * 手写 / 上传签名 → PNG Blob（透明底）
 * 上传路径：近白像素透明化 + 包围盒裁切，无云端 AI。
 */
export default function SignaturePad({
  existingUrl,
  existingSignedAt,
  disabled,
  busy,
  onConfirm,
  onClearPreview,
  label = "签名",
}) {
  const [mode, setMode] = useState("draw"); // draw | upload
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const previewUrl = cleared ? null : (existingUrl || null);

  useEffect(() => {
    setCleared(false);
  }, [existingUrl]);

  useEffect(() => {
    if (mode !== "draw" || previewUrl) return;
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
  }, [mode, previewUrl]);

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

  async function confirmDraw() {
    if (!hasInk || !canvasRef.current) return;
    setLocalBusy(true);
    try {
      const blob = await trimCanvasToPng(canvasRef.current);
      if (!blob) return;
      await onConfirm?.(blob);
    } finally {
      setLocalBusy(false);
    }
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || disabled) return;
    setLocalBusy(true);
    try {
      const blob = await processUploadToPng(file);
      if (!blob) return;
      await onConfirm?.(blob);
    } finally {
      setLocalBusy(false);
    }
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
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setMode("draw")}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
            mode === "draw" ? "bg-brand/10 text-brand" : "text-[#707EAE] hover:bg-gray-50"
          }`}
        >
          手写
        </button>
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
            mode === "upload" ? "bg-brand/10 text-brand" : "text-[#707EAE] hover:bg-gray-50"
          }`}
        >
          上传图片
        </button>
      </div>

      {mode === "draw" ? (
        <>
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
        </>
      ) : (
        <label className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#E9ECEF] bg-white p-6 cursor-pointer hover:border-brand/40 min-h-[120px]">
          <I name="upload" size={18} className="text-[#A0AEC0]" />
          <span className="text-xs text-[#707EAE]">拍照或选择签名图（自动去白底裁切）</span>
          <input type="file" accept="image/*" className="hidden" disabled={isBusy} onChange={onFile} />
        </label>
      )}
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

/** 上传图：近白透明 + 包围盒裁切 → PNG */
function processUploadToPng(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const maxSide = 1200;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        const scale = Math.min(1, maxSide / Math.max(w, h));
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);

        const imageData = ctx.getImageData(0, 0, w, h);
        const d = imageData.data;
        const threshold = 240;
        let minX = w;
        let minY = h;
        let maxX = -1;
        let maxY = -1;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (lum >= threshold) {
            d[i + 3] = 0;
          } else {
            const x = (i / 4) % w;
            const y = Math.floor(i / 4 / w);
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
        ctx.putImageData(imageData, 0, 0);
        if (maxX < 0) {
          resolve(null);
          return;
        }
        const pad = 6;
        minX = Math.max(0, minX - pad);
        minY = Math.max(0, minY - pad);
        maxX = Math.min(w - 1, maxX + pad);
        maxY = Math.min(h - 1, maxY + pad);
        const tw = maxX - minX + 1;
        const th = maxY - minY + 1;
        const out = document.createElement("canvas");
        out.width = tw;
        out.height = th;
        out.getContext("2d").drawImage(canvas, minX, minY, tw, th, 0, 0, tw, th);
        out.toBlob((blob) => resolve(blob), "image/png");
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片加载失败"));
    };
    img.src = url;
  });
}
