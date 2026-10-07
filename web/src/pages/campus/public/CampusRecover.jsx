// 找回记录(免登录):换设备 / 清缓存后,用 手机号 + 邮箱验证码 把会话接回原记录。没有账号密码,不是登录。
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { campus, setCampusToken } from "../../../lib/campusApi.js";
import { Button, I, toast } from "../../../components/Primitives.jsx";
import { Shell, useCampus, base, toastErr } from "./shell.jsx";

const inputCls = "h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-base outline-none focus:border-brand focus:ring-4 focus:ring-brand/10";

export default function CampusRecover() {
  const { slug, info, setMe, reload } = useCampus();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get("next") || `${base(slug)}/mine`;
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState(null);
  const [sent, setSent] = useState(false);
  useEffect(() => { if (cooldown <= 0) return; const t = setTimeout(() => setCooldown((c) => c - 1), 1000); return () => clearTimeout(t); }, [cooldown]);

  const validPhone = /^\+?\d{6,15}$/.test(phone.replace(/[\s-]/g, ""));
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function send() {
    if (!validPhone) return toast("请填写正确的手机号", "error");
    if (!validEmail) return toast("请填写正确的邮箱", "error");
    setSending(true);
    try {
      const r = await campus.recoverSend({ slug, phone: phone.trim(), email: email.trim() });
      setSent(true); setCooldown(r.cooldownS || 60);
      if (r.devCode) setDevCode(r.devCode);
      toast("验证码已发送到邮箱,请查收(含垃圾箱)", "success");
    } catch (e) {
      const ra = e.response?.data?.retryAfter; if (ra) setCooldown(ra);
      toastErr(e, "发送失败");
    } finally { setSending(false); }
  }
  async function submit(e) {
    e.preventDefault();
    if (!code.trim()) return toast("请填写验证码", "error");
    setBusy(true);
    try {
      const r = await campus.recoverVerify({ slug, phone: phone.trim(), email: email.trim(), code: code.trim() });
      setCampusToken(r.token); setMe(r.me); await reload();
      toast(`已找回 ${r.me.name || ""} 的记录`, "success");
      nav(next, { replace: true });
    } catch (err) { toastErr(err, "找回失败"); }
    finally { setBusy(false); }
  }

  return (
    <Shell title="找回投递记录" back>
      <div className="bg-white rounded-card shadow-card p-5">
        <h2 className="text-lg font-bold">换了设备?找回之前的记录</h2>
        <p className="text-xs text-gray-600 mt-1">填写当时确认过的手机号和邮箱,验证码会发到该邮箱。验证后这台设备就能看到并继续之前的投递。</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label className="text-xs font-bold ml-1">手机号<span className="text-red-500 ml-0.5">*</span></label>
            <input className={`${inputCls} mt-1.5`} inputMode="tel" autoComplete="tel" placeholder="13800000000" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold ml-1">邮箱<span className="text-red-500 ml-0.5">*</span></label>
            <div className="mt-1.5 flex gap-2">
              <input className={`${inputCls} flex-1`} type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button type="button" disabled={sending || cooldown > 0} onClick={send} className="h-12 px-3 rounded-xl bg-lightPrimary text-brand text-sm font-bold whitespace-nowrap disabled:opacity-50">{cooldown > 0 ? `${cooldown}s` : sending ? "发送中" : "发验证码"}</button>
            </div>
            {info?.emailConfigured === false && devCode && <p className="text-[11px] text-amber-700 mt-1 ml-1">开发环境未配置邮件,验证码:<b>{devCode}</b></p>}
          </div>
          {sent && (
            <div>
              <label className="text-xs font-bold ml-1">邮箱验证码<span className="text-red-500 ml-0.5">*</span></label>
              <input className={`${inputCls} mt-1.5 tracking-[0.3em] font-bold`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6 位数字" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            </div>
          )}
          <Button type="submit" className="w-full !h-12" disabled={busy || !sent} icon={busy ? <I name="loader" size={16} className="animate-spin" /> : <I name="key-round" size={16} />}>{busy ? "验证中…" : "验证并找回"}</Button>
        </form>
        <p className="text-[11px] text-gray-400 mt-4 text-center leading-relaxed">只有当时「确认联系方式」时填的手机号 + 邮箱组合才能找回<br />收不到验证码请检查垃圾邮件,或联系现场 HR</p>
      </div>
    </Shell>
  );
}
