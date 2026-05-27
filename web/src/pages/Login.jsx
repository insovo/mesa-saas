import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import gsap from "gsap";
import { api } from "../lib/api.js";
import { setAuth } from "../lib/auth.js";
import { Card, Button, Input, I, Modal, toast } from "../components/Primitives.jsx";
import { useAuth } from "../lib/authContext.jsx";
import PasswordStrengthMeter from "../components/PasswordStrengthMeter.jsx";

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
    await refetch();
    if (data.recoveryCodeUsed) {
      toast(`已用 1 个备份码登录,剩余 ${data.remainingRecoveryCodes} 个`, "info");
    }
    navigate(from, { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-lightPrimary">
      {/* Brand gradient backdrop */}
      <div
        className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full opacity-50"
        style={{ background: "radial-gradient(circle, rgba(134,140,255,0.45) 0%, rgba(66,42,251,0) 70%)" }}
      ></div>
      <div
        className="absolute -bottom-32 -left-32 w-[500px] h-[500px] rounded-full opacity-40"
        style={{ background: "radial-gradient(circle, rgba(33,17,165,0.4) 0%, rgba(66,42,251,0) 70%)" }}
      ></div>

      <div className="relative w-full max-w-md">
        <div className="flex items-center justify-center mb-6">
          <span
            className="text-[32px] uppercase text-navy-700"
            style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, letterSpacing: "-0.3px" }}
          >
            MESA <span style={{ fontWeight: 500 }}>RECRUIT</span>
          </span>
        </div>

        <Card className="p-10">
          <h1 className="text-2xl font-bold text-navy-700">登录工作台</h1>
          <p className="text-sm text-gray-700 mt-2 mb-8">
            <span className="font-accent">AI-native recruiting,</span> rebuilt around clarity.
          </p>

          <form onSubmit={onSubmit} className="space-y-5">
            <Input
              label="邮箱"
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@mesa.local"
              autoComplete="email"
              required
            />
            <Input
              label="密码"
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />

            {error && (
              <div className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3 flex items-center gap-2">
                <I name="alert-circle" size={16} />
                {error}
              </div>
            )}
            {deactivated && (
              <div className="text-sm text-amber-700 bg-amber-50 rounded-xl px-4 py-3 space-y-1">
                <div className="flex items-center gap-2 font-bold">
                  <I name="shield-alert" size={16} />
                  账号已被停用
                </div>
                <p className="text-xs text-amber-800">
                  {deactivated.reason ? `原因:${deactivated.reason}` : "请联系系统管理员开通"}
                </p>
              </div>
            )}

            <Button type="submit" size="lg" disabled={submitting} className="w-full">
              {submitting ? (
                <>
                  <I name="loader" size={16} className="animate-spin" />
                  登录中...
                </>
              ) : (
                <>
                  登录
                  <I name="arrow-right" size={16} />
                </>
              )}
            </Button>

            <div className="text-right">
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="text-xs text-brand hover:underline"
              >
                忘记密码?
              </button>
            </div>
          </form>

          <div className="mt-7 text-xs text-gray-600 bg-lightPrimary rounded-xl p-3 flex items-start gap-2">
            <I name="info" size={14} className="text-brand mt-0.5 shrink-0" />
            <span>
              本地默认账号: <code className="font-mono text-navy-700">admin@mesa.local / mesa-dev-2026</code>
            </span>
          </div>
        </Card>

        <p className="text-center text-xs text-gray-600 mt-6">
          © 2026 MESA Recruit · 由 LLM 解析驱动的招聘工作台
        </p>
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
