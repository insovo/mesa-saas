import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import gsap from "gsap";
import { api } from "../lib/api.js";
import { setAuth, addSavedAccount } from "../lib/auth.js";
import { Button, Input, I, Modal, toast } from "../components/Primitives.jsx";
import { useAuth } from "../lib/authContext.jsx";
import PasswordStrengthMeter from "../components/PasswordStrengthMeter.jsx";
// 登录页 v2(2026-07):Hyperspeed 全屏暗色背景 + 玻璃拟态卡片,弃用原烘焙设计图素材
import sphereWhite from "../assets/logo-sphere.mp4"; // logo 循环球(圆角磁贴呈现)

// Hyperspeed 光速公路背景(three.js,lazy → 单独 chunk,仅登录页拉取)
const Hyperspeed = lazy(() => import("../components/Hyperspeed.jsx"));
// reduced-motion 用户不跑 WebGL 动画,退回静态深色底
const REDUCE_MOTION =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// 背景效果的暗色底(与 Hyperspeed fog 黑色衔接)
const HYPER_BG = "#050510";

// 品牌渐变(与站内 brand-logo 流光同族)
const BRAND_GRADIENT = "linear-gradient(90deg,#5B6CF0,#7C3AED,#C026D3,#7C3AED,#5B6CF0)";

// 桌面左侧特性卡(暗色玻璃 chip;icon 色对应 Hyperspeed 车灯配色)
const FEATURES = [
  { icon: "users", title: "多渠道人才聚合", desc: "汇聚全球优质研发人才", iconBg: "rgba(216,86,191,0.18)", iconFg: "#E58BD4" },
  { icon: "sparkles", title: "智能筛选与匹配", desc: "AI 驱动,提升招聘效率", iconBg: "rgba(124,58,237,0.22)", iconFg: "#B39AF7" },
  { icon: "users-round", title: "协同招聘管理", desc: "团队协作,流程透明高效", iconBg: "rgba(3,179,195,0.16)", iconFg: "#5BD6E2" },
];

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refetch } = useAuth();
  const from = location.state?.from || "/dashboard";

  const [email, setEmail] = useState("admin@mesa.local");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [deactivated, setDeactivated] = useState(null); // { reason }
  const [forgotOpen, setForgotOpen] = useState(false);
  const [mfaToken, setMfaToken] = useState(null); // 进入 MFA 第二步时持有
  const [remember, setRemember] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const stageRef = useRef(null);

  useEffect(() => {
    if (!stageRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from(".login-rise", {
        y: 22,
        opacity: 0,
        duration: 0.7,
        ease: "power3.out",
        stagger: 0.1,
        clearProps: "transform,opacity",
      });
    }, stageRef);
    return () => ctx.revert();
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setDeactivated(null);
    setSubmitting(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      if (data.mfaRequired && data.mfaToken) {
        // 进入 MFA 第二步
        setMfaToken(data.mfaToken);
        return;
      }
      setAuth(data.token, data.user);
      if (remember) addSavedAccount(data.token, data.user);
      await refetch();
      navigate(from, { replace: true });
    } catch (err) {
      const status = err.response?.status;
      if (status === 401) {
        setError("邮箱或密码不正确");
      } else if (status === 403 && err.response?.data?.error === "user_inactive") {
        setDeactivated({ reason: err.response.data.deactivatedReason || "" });
      } else {
        setError(err.response?.data?.message || err.message || "登录失败,请重试");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onMfaSuccess(data) {
    setAuth(data.token, data.user);
    if (remember) addSavedAccount(data.token, data.user);
    await refetch();
    if (data.recoveryCodeUsed) {
      toast(`已用 1 个备份码登录,剩余 ${data.remainingRecoveryCodes} 个`, "info");
    }
    navigate(from, { replace: true });
  }

  return (
    <div ref={stageRef} className="min-h-screen relative overflow-hidden" style={{ background: HYPER_BG }}>
      {/* Hyperspeed 光速公路全屏背景(空白处按住鼠标/触摸可加速) */}
      {!REDUCE_MOTION && (
        <Suspense fallback={null}>
          <Hyperspeed />
        </Suspense>
      )}
      {/* 品牌区氛围柔光(不挡交互) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{ background: "radial-gradient(ellipse 68% 52% at 28% 24%, rgba(124,58,237,0.16), transparent 62%)" }}
      />

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-10 lg:px-14">
        {/* pointer-events-none 让列间空白透给背景 canvas(可按住加速);卡片单独恢复交互 */}
        <div className="w-full max-w-6xl flex flex-col lg:flex-row items-center justify-center lg:justify-between gap-10 lg:gap-20 pointer-events-none">
          {/* ── 左:品牌 + 主张(桌面完整版;移动端只保留 logo 行) ── */}
          <div className="login-rise w-full max-w-md lg:max-w-[540px] lg:flex-1 select-none">
            <div className="flex items-center justify-center lg:justify-start gap-3">
              <video src={sphereWhite} autoPlay loop muted playsInline aria-hidden="true"
                className="w-11 h-11 lg:w-12 lg:h-12 shrink-0 object-cover rounded-2xl shadow-card pointer-events-none" />
              {/* 亮色光带扫过时渐变字易糊,用 filter drop-shadow 垫暗保持可读(text-shadow 对 clip 文字无效) */}
              <span className="text-[26px] lg:text-[30px] font-bold animate-gradient-x"
                style={{
                  fontFamily: "Poppins, sans-serif",
                  background: BRAND_GRADIENT, backgroundSize: "200% auto",
                  WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 2px 10px rgba(5,5,16,0.9)) drop-shadow(0 0 2px rgba(5,5,16,0.8))",
                }}>
                Overseas R&D
              </span>
            </div>

            <div className="hidden lg:block">
              <h1 className="mt-9 text-[42px] font-bold leading-tight whitespace-nowrap" style={{ letterSpacing: "3px" }}>
                <span className="text-white">全球人才</span>
                <span className="text-white/60 mx-2.5">·</span>
                <span style={{ background: "linear-gradient(90deg,#E0639B,#D53872)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>精准招聘</span>
              </h1>
              <p className="mt-4 text-[15px] text-white/55 tracking-wider">智能化招聘管理,助力企业全球研发人才战略</p>

              <div className="mt-10 space-y-3.5">
                {FEATURES.map((f) => (
                  <div key={f.title}
                    className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-md px-5 py-4">
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: f.iconBg, color: f.iconFg }}>
                      <I name={f.icon} size={19} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold text-white">{f.title}</p>
                      <p className="text-[12.5px] text-white/50 mt-0.5">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── 右:玻璃拟态登录卡(桌面/移动共用同一表单) ── */}
          <div className="login-rise w-full max-w-md lg:w-[440px] lg:shrink-0 pointer-events-auto">
            <div className="rounded-[28px] bg-white/90 backdrop-blur-xl border border-white/60 shadow-glow-lg p-8">
              <h1 className="text-3xl font-bold text-navy-800 tracking-tight">欢迎登录</h1>
              <p className="text-sm text-gray-600 mt-2 mb-8">海外研发招聘管理系统</p>
              <form onSubmit={onSubmit} className="space-y-5">
                <div>
                  <label htmlFor="email" className="text-xs font-bold text-gray-700 ml-1 mb-2 block">email</label>
                  <div className="relative">
                    <I name="mail" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="请输入邮箱" autoComplete="email" required
                      className="w-full h-[52px] rounded-2xl border border-gray-200 bg-white/60 pl-11 pr-4 text-sm text-navy-700 placeholder:text-gray-400 outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/10 transition-all" />
                  </div>
                </div>
                <div>
                  <label htmlFor="password" className="text-xs font-bold text-gray-700 ml-1 mb-2 block">密码</label>
                  <div className="relative">
                    <I name="lock" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input id="password" type={showPwd ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="请输入密码" autoComplete="current-password" required
                      className="w-full h-[52px] rounded-2xl border border-gray-200 bg-white/60 pl-11 pr-11 text-sm text-navy-700 placeholder:text-gray-400 outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/10 transition-all" />
                    <button type="button" onClick={() => setShowPwd((v) => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-brand transition" aria-label="切换密码可见">
                      <I name={showPwd ? "eye" : "eye-off"} size={18} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-brand w-4 h-4" />
                    <span className="text-xs text-gray-600">记住账号</span>
                  </label>
                  <button type="button" onClick={() => setForgotOpen(true)} className="text-xs font-medium text-brand hover:underline">忘记密码?</button>
                </div>
                {error && <div className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3 flex items-center gap-2"><I name="alert-circle" size={16} />{error}</div>}
                {deactivated && <div className="text-sm text-amber-700 bg-amber-50 rounded-xl px-4 py-3">账号已被停用 · {deactivated.reason || "请联系系统管理员开通"}</div>}
                <button type="submit" disabled={submitting} className="w-full h-[54px] rounded-2xl text-white text-[15px] font-bold inline-flex items-center justify-center gap-2 shadow-[0_12px_28px_rgba(213,56,114,0.42)] active:scale-[0.98] transition-all disabled:opacity-70" style={{ background: "linear-gradient(90deg,#D53872 0%,#DF6395 100%)" }}>
                  {submitting ? (<><I name="loader" size={16} className="animate-spin" /> 登录中...</>) : (<>登录</>)}
                </button>
              </form>
              <p className="text-center text-sm text-gray-600 mt-6">还没有账号? <span className="text-brand font-medium">联系管理员开通</span></p>
            </div>
            <div className="flex items-center justify-center gap-1.5 mt-5 text-xs text-gray-300"><I name="shield-check" size={13} className="text-emerald-400" /> 数据安全保障 · 隐私严格保护</div>
          </div>
        </div>
      </div>

      {forgotOpen && (
        <ForgotPasswordModal onClose={() => setForgotOpen(false)} initialEmail={email} />
      )}

      {mfaToken && (
        <MfaModal
          mfaToken={mfaToken}
          email={email}
          onCancel={() => setMfaToken(null)}
          onSuccess={onMfaSuccess}
        />
      )}
    </div>
  );
}

// MFA 第二步:输入 6 位 TOTP 或备份码
function MfaModal({ mfaToken, email, onCancel, onSuccess }) {
  const [mode, setMode] = useState("code"); // code | recovery
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef(null);

  useEffect(() => {
    if (!rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from(".mfa-row", { y: 8, opacity: 0, duration: 0.3, stagger: 0.05, ease: "power3.out", clearProps: "transform,opacity" });
    }, rootRef);
    return () => ctx.revert();
  }, [mode]);

  async function submit() {
    setError("");
    const body = mode === "code" ? { code: code.trim() } : { recoveryCode: recoveryCode.trim() };
    if ((mode === "code" && !body.code) || (mode === "recovery" && !body.recoveryCode)) {
      setError(mode === "code" ? "请输入 6 位验证码" : "请输入备份码");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post("/auth/mfa-verify", body, {
        headers: { Authorization: `Bearer ${mfaToken}` },
      });
      onSuccess(data);
    } catch (e) {
      setError(e.response?.data?.message || "验证失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={true} onClose={onCancel} maxWidth="max-w-sm">
      <div ref={rootRef} className="p-6 space-y-4">
        <h3 className="mfa-row text-lg font-bold text-navy-700 flex items-center gap-2">
          <I name="shield-check" size={18} className="text-brand" /> 两步验证
        </h3>
        <p className="mfa-row text-xs text-gray-700">
          账号 <strong className="text-navy-700">{email}</strong> 已启用两步验证,
          请输入身份验证器中的 6 位动态码。
        </p>

        <div className="mfa-row flex gap-1 bg-lightPrimary rounded-xl p-1 text-xs font-bold">
          <button
            onClick={() => setMode("code")}
            className={`flex-1 py-1.5 rounded-lg ${mode === "code" ? "bg-white shadow text-brand" : "text-gray-700"}`}
          >
            验证器 6 位码
          </button>
          <button
            onClick={() => setMode("recovery")}
            className={`flex-1 py-1.5 rounded-lg ${mode === "recovery" ? "bg-white shadow text-brand" : "text-gray-700"}`}
          >
            备份码
          </button>
        </div>

        {mode === "code" ? (
          <div className="mfa-row">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              maxLength={6}
              autoFocus
              className="text-center text-lg tracking-[0.4em] font-mono"
            />
          </div>
        ) : (
          <div className="mfa-row">
            <Input
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX"
              maxLength={10}
              autoFocus
              className="text-center text-lg tracking-[0.2em] font-mono"
            />
            <p className="text-[11px] text-gray-600 mt-1">
              备份码使用一次后即作废,启用 2FA 时一次性生成 10 个。
            </p>
          </div>
        )}

        {error && (
          <p className="mfa-row text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg flex items-center gap-2">
            <I name="alert-circle" size={12} />
            {error}
          </p>
        )}

        <div className="mfa-row flex justify-between pt-2 border-t border-gray-200">
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>返回登录</Button>
          <Button onClick={submit} disabled={submitting} icon={<I name={submitting ? "loader" : "check"} size={12} className={submitting ? "animate-spin" : ""} />}>
            {submitting ? "验证中" : "确认"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// 忘记密码两步流程:输邮箱 → 输验证码 + 新密码
function ForgotPasswordModal({ onClose, initialEmail = "" }) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [sending, setSending] = useState(false);
  const [resending, setResending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [devCode, setDevCode] = useState(null); // dev 模式下后端返回的验证码
  const [cooldown, setCooldown] = useState(0);
  const cardRef = useRef(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  useEffect(() => {
    if (!cardRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from(".fp-step", {
        y: 14,
        opacity: 0,
        duration: 0.35,
        ease: "power3.out",
        stagger: 0.06,
        clearProps: "transform,opacity",
      });
    }, cardRef);
    return () => ctx.revert();
  }, [step]);

  async function sendCode() {
    if (!email.includes("@")) return toast("请输入正确的邮箱", "error");
    setSending(true);
    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      if (data.devCode) setDevCode(data.devCode);
      setStep(2);
      setCooldown(60);
      toast(data.devCode ? "开发模式:验证码见提示" : "验证码已发到邮箱(如该邮箱存在)", "success");
    } catch (e) {
      if (e.response?.data?.error === "resend_too_soon") {
        setCooldown(e.response.data.retryAfter || 60);
        toast(`请稍后再试,剩余 ${e.response.data.retryAfter || 60}s`, "error");
      } else {
        toast(e.response?.data?.message || "发送失败", "error");
      }
    } finally {
      setSending(false);
    }
  }

  async function resend() {
    if (cooldown > 0) return;
    setResending(true);
    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      if (data.devCode) setDevCode(data.devCode);
      setCooldown(60);
      toast("已重新发送", "success");
    } catch (e) {
      if (e.response?.data?.error === "resend_too_soon") {
        setCooldown(e.response.data.retryAfter || 60);
      }
      toast(e.response?.data?.message || "重发失败", "error");
    } finally {
      setResending(false);
    }
  }

  async function submit() {
    if (newPassword.length < 8) return toast("新密码至少 8 位", "error");
    if (newPassword !== confirm) return toast("两次密码不一致", "error");
    setResetting(true);
    try {
      await api.post("/auth/reset-password", { email, code, newPassword });
      toast("密码已重置,请用新密码登录", "success");
      onClose();
    } catch (e) {
      toast(e.response?.data?.message || "重置失败", "error");
    } finally {
      setResetting(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} maxWidth="max-w-md">
      <div ref={cardRef} className="p-6 space-y-4">
        <h3 className="fp-step text-lg font-bold text-navy-700 flex items-center gap-2">
          <I name="key-round" size={18} className="text-brand" /> 忘记密码
        </h3>
        {step === 1 && (
          <>
            <p className="fp-step text-xs text-gray-700">
              输入注册邮箱,我们会发一个 6 位验证码到该邮箱。
            </p>
            <div className="fp-step">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                type="email"
              />
            </div>
            <div className="fp-step flex justify-end gap-2 pt-2 border-t border-gray-200">
              <Button variant="ghost" onClick={onClose} disabled={sending}>取消</Button>
              <Button onClick={sendCode} disabled={sending} icon={<I name={sending ? "loader" : "send"} size={12} className={sending ? "animate-spin" : ""} />}>
                {sending ? "发送中" : "发送验证码"}
              </Button>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <div className="fp-step text-xs text-gray-700">
              验证码已发送到 <strong className="text-navy-700">{email}</strong>(5 分钟内有效)
            </div>
            {devCode && (
              <div className="fp-step text-xs bg-amber-50 border-2 border-amber-200 rounded-lg p-3 font-mono">
                ⚠ 开发模式(未配置 Resend API Key)— 验证码: <strong className="text-amber-800 select-all">{devCode}</strong>
              </div>
            )}
            <div className="fp-step">
              <label className="block text-[11px] text-gray-600 mb-1">验证码</label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6 位数字" maxLength={6} />
            </div>
            <div className="fp-step">
              <label className="block text-[11px] text-gray-600 mb-1">新密码(至少 10 位,需含字母+数字)</label>
              <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" />
              <div className="mt-2">
                <PasswordStrengthMeter password={newPassword} context={{ email }} />
              </div>
            </div>
            <div className="fp-step">
              <label className="block text-[11px] text-gray-600 mb-1">确认新密码</label>
              <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" />
            </div>
            <div className="fp-step flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={resend}
                disabled={cooldown > 0 || resending}
                className="text-brand hover:underline disabled:text-gray-400 disabled:no-underline"
              >
                {cooldown > 0 ? `${cooldown}s 后可重新发送` : (resending ? "重发中..." : "重新发送验证码")}
              </button>
              <button onClick={() => setStep(1)} className="text-gray-600 hover:text-brand">改邮箱</button>
            </div>
            <div className="fp-step flex justify-end gap-2 pt-2 border-t border-gray-200">
              <Button variant="ghost" onClick={onClose} disabled={resetting}>取消</Button>
              <Button onClick={submit} disabled={resetting} icon={<I name={resetting ? "loader" : "check"} size={12} className={resetting ? "animate-spin" : ""} />}>
                {resetting ? "重置中" : "确认重置"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
