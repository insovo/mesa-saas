import { useEffect, useState } from "react";
import { resources } from "../lib/api.js";
import { getUser } from "../lib/auth.js";
import { signerKeyHr } from "../lib/perfSignatureCache.js";
import { Button, I, toast } from "./Primitives.jsx";
import SignaturePad from "./SignaturePad.jsx";

/** 管理员 HR 电子章：手写 → 存当前账号，供导出嵌入 */
export default function HrSignatureManager({ compact = false, onChange }) {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const hrSignerKey = signerKeyHr(getUser()?.id);

  async function load() {
    try {
      const data = await resources.performance.getHrSignature();
      setInfo(data);
      if (data?.hasSignature) setEditing(false);
      onChange?.(data);
    } catch (err) {
      toast(err.response?.data?.message || err.message, "error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onConfirm(blob) {
    if (!blob) return;
    setBusy(true);
    try {
      const presign = await resources.performance.hrSignaturePresign({
        contentType: "image/png",
        expectedSize: blob.size,
      });
      const putRes = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: blob,
      });
      if (!putRes.ok) throw new Error(`上传失败 (${putRes.status})`);
      const saved = await resources.performance.saveHrSignature({ key: presign.key });
      setInfo(saved);
      setEditing(false);
      onChange?.(saved);
      toast("HR 电子章已保存", "success");
    } catch (err) {
      toast(err.response?.data?.message || err.message || "保存失败", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onClear() {
    if (!confirm("确定清除本人 HR 电子章？")) return;
    setBusy(true);
    try {
      const data = await resources.performance.clearHrSignature();
      setInfo(data);
      setEditing(true);
      onChange?.(data);
      toast("已清除", "success");
    } catch (err) {
      toast(err.response?.data?.message || err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  const showPad = editing || !info?.hasSignature;

  return (
    <div className={`rounded-xl border border-[#E9ECEF] bg-white ${compact ? "p-3 space-y-2" : "p-4 space-y-3"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-navy-700 flex items-center gap-1.5">
            <I name="file-signature" size={16} className="text-brand" />
            HR 电子章
          </div>
          <p className="text-[11px] text-[#707EAE] mt-0.5">
            存于当前账号；导出勾选「嵌入 HR 签名」时批量套用
          </p>
        </div>
        {info?.hasSignature && !editing && (
          <div className="flex gap-1 shrink-0">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(true)}>
              更换
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={onClear}>
              清除
            </Button>
          </div>
        )}
      </div>

      {showPad ? (
        <SignaturePad
          label="HR 电子章"
          disabled={false}
          busy={busy}
          signerKey={hrSignerKey}
          onConfirm={onConfirm}
        />
      ) : (
        <div className="rounded-xl border border-[#E9ECEF] bg-lightPrimary/40 p-3 flex flex-col items-center gap-2">
          {info?.url && (
            <img src={info.url} alt="HR 电子章" className="max-h-16 object-contain" />
          )}
          {info?.updatedAt && (
            <div className="text-[10px] text-[#A0AEC0]">
              更新于 {String(info.updatedAt).slice(0, 10)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export async function blobErrorMessage(err) {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      const j = JSON.parse(text);
      return j.message || j.error || err.message;
    } catch {
      /* fallthrough */
    }
  }
  return err?.response?.data?.message || err?.message || "操作失败";
}
