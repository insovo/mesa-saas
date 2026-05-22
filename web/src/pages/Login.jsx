import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../lib/api.js";
import { setAuth } from "../lib/auth.js";
import { Card, Button, Input, I } from "../components/Primitives.jsx";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/dashboard";

  const [email, setEmail] = useState("admin@mesa.local");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setAuth(data.token, data.user);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.response?.status === 401 ? "邮箱或密码不正确" : err.message || "登录失败,请重试");
    } finally {
      setSubmitting(false);
    }
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
    </div>
  );
}
