import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import gsap from "gsap";
import { api } from "../lib/api.js";
import { setAuth, addSavedAccount } from "../lib/auth.js";
import { Button, Input, I, Modal, toast } from "../components/Primitives.jsx";
import { useAuth } from "../lib/authContext.jsx";
import PasswordStrengthMeter from "../components/PasswordStrengthMeter.jsx";
// 登录页:背景图形 + 透明人像用素材;所有文字用真实 HTML 文本(清晰/可选中/不裁切)
import bgImg from "../assets/login/bg.png";
import portraitImg from "../assets/login/portrait.png";

// 文字层(1920×1080 设计空间坐标)。grad=渐变文字,否则用 color。
const TX_NAVY = "#1B2A4E", TX_SUB = "#8893B0", TX_FSUB = "#8E99B8", TX_LABEL = "#586187";
const LOGIN_TEXTS = [
  { c: "Overseas R&D", l: 234, t: 156, size: 32, weight: 700, ff: "Poppins, sans-serif", grad: "linear-gradient(90deg,#5B6CF0,#7C3AED 45%,#C026D3)", ls: "0.3px" },
  { c: "智能化招聘管理,助力企业全球研发人才战略", l: 138, t: 346, size: 15.5, weight: 400, color: "#7E8AAC", ls: "0.4px" },
  { c: "多渠道人才聚合", l: 234, t: 437, size: 16, weight: 700, color: TX_NAVY, ls: "1px" },
  { c: "汇聚全球优质研发人才", l: 234, t: 472, size: 12.5, weight: 400, color: TX_FSUB, ls: "0.4px" },
  { c: "智能筛选与匹配", l: 234, t: 549, size: 16, weight: 700, color: TX_NAVY, ls: "1px" },
  { c: "AI 驱动,提升招聘效率", l: 234, t: 584, size: 12.5, weight: 400, color: TX_FSUB, ls: "0.4px" },
  { c: "协同招聘管理", l: 234, t: 663, size: 16, weight: 700, color: TX_NAVY, ls: "1px" },
  { c: "团队协作,流程透明高效", l: 234, t: 698, size: 12.5, weight: 400, color: TX_FSUB, ls: "0.4px" },
  { c: "欢迎登录", l: 1326, t: 210, size: 33, weight: 700, color: TX_NAVY, ls: "4px" },
  { c: "海外研发招聘管理系统", l: 1309, t: 285, size: 15.5, weight: 400, color: TX_SUB, ls: "1px" },
  { c: "email", l: 1172, t: 344, size: 15, weight: 700, color: TX_LABEL, ls: "0.4px" },
  { c: "密码", l: 1172, t: 490, size: 15, weight: 700, color: TX_LABEL, ls: "1px" },
  { c: "数据安全保障 · 隐私严格保护", l: 1336, t: 980, size: 12.5, weight: 400, color: "#A2ABC6", ls: "0.4px" },
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
  const scaleRef = useRef(null);

  // 桌面设计稿等比缩放:JS 按实际视口取 contain 缩放并直接设舞台尺寸
  // (不用 CSS 100vh:浏览器工具栏会让 100vh 大于可见高度 → 舞台过高底部被裁)
  useEffect(() => {
    const el = scaleRef.current;
    if (!el) return;
    const stage = el.parentElement; // 16:9 舞台
    const apply = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const s = Math.min(vw / 1920, vh / 1080);
      el.style.transform = `scale(${s})`;
      stage.style.width = `${Math.round(1920 * s)}px`;
      stage.style.height = `${Math.round(1080 * s)}px`;
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

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
    <div ref={stageRef} className="min-h-screen relative overflow-hidden">
      {/* ===== 桌面(lg+):按设计稿原件 1:1 拼装,等比缩放铺满视口 ===== */}
      <div className="hidden lg:flex fixed inset-0 items-center justify-center overflow-hidden" style={{ background: "#ECEAF6" }}>
        <div className="relative" style={{ width: "1px", height: "1px" }}>
          <div ref={scaleRef} className="absolute top-0 left-0 origin-top-left animate-fade-up"
            style={{ width: "1920px", height: "1080px" }}>
            {/* 背景设计图(色块/地球/药卡/卡片/输入框/按钮/logo 图标全在此) */}
            <img src={bgImg} alt="" draggable={false}
              className="absolute top-0 left-0 select-none pointer-events-none" style={{ width: 1920, height: 1080 }} />
            {/* 透明人像 */}
            <img src={portraitImg} alt="" aria-hidden="true" draggable={false}
              className="absolute select-none pointer-events-none" style={{ left: 2, top: 112, width: 1768, height: 961 }} />
            {/* 文字层(真实 HTML 文本,非素材) */}
            {LOGIN_TEXTS.map((x, i) => (
              <div key={i} className="absolute pointer-events-none select-none" style={{
                left: x.l, top: x.t, fontSize: x.size, fontWeight: x.weight,
                letterSpacing: x.ls, lineHeight: 1, whiteSpace: "nowrap", fontFamily: x.ff,
                ...(x.grad
                  ? { background: x.grad, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }
                  : { color: x.color }),
              }}>{x.c}</div>
            ))}
            {/* 主标题(混色:navy + 粉渐变) */}
            <div className="absolute pointer-events-none select-none font-bold"
              style={{ left: 138, top: 234, fontSize: 38, letterSpacing: "4px", lineHeight: 1, whiteSpace: "nowrap" }}>
              <span style={{ color: "#1B2A4E" }}>全球人才</span>
              <span style={{ color: "#1B2A4E", margin: "0 9px" }}>·</span>
              <span style={{ background: "linear-gradient(90deg,#D53872,#E0639B)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>精准招聘</span>
            </div>

            {/* 透明可交互控件,覆盖在烘焙好的输入框/按钮上 */}
            <form onSubmit={onSubmit}>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="请输入邮箱" autoComplete="email" required
                className="absolute bg-transparent outline-none text-navy-700 placeholder:text-gray-400"
                style={{ left: 1172, top: 377, width: 500, height: 52, paddingLeft: 72, fontSize: 19 }} />
              <input id="password" type={showPwd ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码" autoComplete="current-password" required
                className="absolute bg-transparent outline-none text-navy-700 placeholder:text-gray-400"
                style={{ left: 1172, top: 523, width: 440, height: 52, paddingLeft: 72, fontSize: 19 }} />
              {/* 眼睛切换(盖住烘焙的眼睛图标) */}
              <button type="button" onClick={() => setShowPwd((v) => !v)} aria-label="切换密码可见"
                className="absolute flex items-center justify-center text-gray-400 hover:text-brand transition-colors"
                style={{ left: 1616, top: 523, width: 54, height: 52 }}>
                <I name={showPwd ? "eye" : "eye-off"} size={22} />
              </button>
              {/* 忘记密码(真实文本) */}
              <button type="button" onClick={() => setForgotOpen(true)}
                className="absolute text-right hover:underline" style={{ left: 1470, top: 612, width: 200, fontSize: 14, fontWeight: 500, color: "#5B6CF0", letterSpacing: "0.4px" }}>
                忘记密码?
              </button>
              {/* 登录 提交(透明覆盖烘焙粉色按钮,真实文本) */}
              <button type="submit" disabled={submitting} aria-label="登录"
                className="absolute rounded-[16px] flex items-center justify-center gap-2 text-white active:scale-[0.99] transition-transform"
                style={{ left: 1170, top: 694, width: 500, height: 82, fontSize: 21, fontWeight: 700, letterSpacing: "3px" }}>
                {submitting
                  ? (<span className="absolute inset-0 flex items-center justify-center rounded-[16px] gap-2" style={{ background: "#D53872", fontSize: 18, letterSpacing: "1px" }}><I name="loader" size={18} className="animate-spin" /> 登录中...</span>)
                  : "登录"}
              </button>
              {/* 还没有账号 + 联系管理员开通(真实文本) */}
              <div className="absolute select-none" style={{ left: 1300, top: 840, fontSize: 13.5, color: "#8893B0", letterSpacing: "0.4px", whiteSpace: "nowrap" }}>
                还没有账号?
              </div>
              <button type="button"
                className="absolute hover:underline" style={{ left: 1414, top: 840, fontSize: 13.5, fontWeight: 700, color: "#4A56C4", letterSpacing: "0.4px", whiteSpace: "nowrap" }}>
                联系管理员开通
              </button>
              {/* 错误提示 */}
              {(error || deactivated) && (
                <div className="absolute text-center" style={{ left: 1170, top: 788, width: 500 }}>
                  {error && <p className="text-sm text-red-600 bg-red-50/95 rounded-lg px-3 py-2 shadow-card-soft">{error}</p>}
                  {deactivated && <p className="text-sm text-amber-700 bg-amber-50/95 rounded-lg px-3 py-2 shadow-card-soft">账号已被停用 · {deactivated.reason || "请联系系统管理员开通"}</p>}
                </div>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* ===== 移动端(<lg):简洁卡片(桌面设计稿等比缩放在窄屏不适用) ===== */}
      <div className="lg:hidden min-h-screen flex items-center justify-center px-4 py-8"
        style={{ background: "linear-gradient(155deg,#F3F5FC 0%,#F5F2FB 48%,#FCF4F8 100%)" }}>
        <div className="login-rise w-full max-w-md">
          <div className="flex items-center justify-center gap-2.5 mb-6">
            <span className="flex items-center justify-center w-10 h-10 rounded-xl shadow-button shrink-0" style={{ background: "linear-gradient(135deg,#6E8BFF 0%,#7C3AED 100%)" }}>
              <I name="users" size={20} className="text-white" strokeWidth={2.2} />
            </span>
            <span className="text-[26px] font-bold" style={{ fontFamily: "Poppins, sans-serif", background: "linear-gradient(90deg,#5B6CF0,#7C3AED 45%,#C026D3)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>Overseas R&D</span>
          </div>
          <div className="rounded-[28px] bg-white/90 backdrop-blur-xl border border-white/80 shadow-glow-lg p-8">
            <h1 className="text-3xl font-bold text-navy-800 tracking-tight">欢迎登录</h1>
            <p className="text-sm text-gray-600 mt-2 mb-8">海外研发招聘管理系统</p>
            <form onSubmit={onSubmit} className="space-y-5">
              <div>
                <label htmlFor="email-m" className="text-xs font-bold text-gray-700 ml-1 mb-2 block">email</label>
                <div className="relative">
                  <I name="mail" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input id="email-m" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="请输入邮箱" autoComplete="email" required
                    className="w-full h-[52px] rounded-2xl border border-gray-200 bg-white/60 pl-11 pr-4 text-sm text-navy-700 placeholder:text-gray-400 outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/10 transition-all" />
                </div>
              </div>
              <div>
                <label htmlFor="password-m" className="text-xs font-bold text-gray-700 ml-1 mb-2 block">密码</label>
                <div className="relative">
                  <I name="lock" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input id="password-m" type={showPwd ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="请输入密码" autoComplete="current-password" required
                    className="w-full h-[52px] rounded-2xl border border-gray-200 bg-white/60 pl-11 pr-11 text-sm text-navy-700 placeholder:text-gray-400 outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/10 transition-all" />
                  <button type="button" onClick={() => setShowPwd((v) => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-brand transition" aria-label="切换密码可见">
                    <I name={showPwd ? "eye" : "eye-off"} size={18} />
                  </button>
                </div>
              </div>
              <div className="flex justify-end">
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
          <div className="flex items-center justify-center gap-1.5 mt-5 text-xs text-gray-500"><I name="shield-check" size={13} className="text-emerald-500" /> 数据安全保障 · 隐私严格保护</div>
          <p className="text-center text-[11px] text-gray-400 mt-2.5">本地默认账号 <code className="font-mono text-gray-500">admin@mesa.local / mesa-dev-2026</code></p>
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
