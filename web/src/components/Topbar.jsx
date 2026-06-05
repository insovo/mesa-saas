// MESA Recruit · 顶栏
// 面包屑路径标题 + 全局搜索 + 用户下拉菜单
// 下拉菜单包含:个人资料编辑、修改密码、切换账号、退出登录
// GSAP fly-in:菜单从右上角缩放 + 渐隐出现

import { useLocation, useNavigate, Link } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import gsap from "gsap";
import { I, Avatar, Modal, Input, Button, toast } from "./Primitives.jsx";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../lib/api.js";
import {
  clearAuth,
  getSavedAccounts,
  switchToSavedAccount,
  removeSavedAccount,
  addSavedAccount,
  normEmail,
} from "../lib/auth.js";
import { useAuth } from "../lib/authContext.jsx";
import PasswordStrengthMeter from "./PasswordStrengthMeter.jsx";

const PAGE_TITLES = {
  "/dashboard": "概览",
  "/candidates": "候选人",
  "/jobs": "岗位",
  "/upload": "简历收件箱",
  "/staff": "现有人员",
  "/newhire": "入职管理",
  "/departments": "部门管理",
  "/interviews": "面试安排",
  "/reports": "数据报表",
  "/users": "用户与权限管理",
};

const ROLE_LABEL = { ADMIN: "管理员", RECRUITER: "招聘官", VIEWER: "只读" };

function pageTitleFor(pathname) {
  for (const [prefix, title] of Object.entries(PAGE_TITLES)) {
    if (pathname.startsWith(prefix)) return title;
  }
  return "Overseas R&D";
}

export default function Topbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { me, patchMe, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [totpOpen, setTotpOpen] = useState(false);
  const menuRef = useRef(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // GSAP fly-in:菜单出现时缩放 + 渐隐
  useEffect(() => {
    if (!menuOpen || !popoverRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        popoverRef.current,
        { opacity: 0, y: -8, scale: 0.92 },
        { opacity: 1, y: 0, scale: 1, duration: 0.22, ease: "back.out(1.6)", transformOrigin: "top right" },
      );
      gsap.from(".tb-menu-item", {
        x: 6,
        opacity: 0,
        duration: 0.22,
        stagger: 0.045,
        ease: "power3.out",
        clearProps: "transform,opacity",
      });
    }, popoverRef);
    return () => ctx.revert();
  }, [menuOpen]);

  function onLogout() {
    logout();
    clearAuth();
    navigate("/login", { replace: true });
  }

  // 「切换账号」展开子菜单(在主菜单内 inline 显示)
  const [switchOpen, setSwitchOpen] = useState(false);
  // saved 账号读自 localStorage 不是 state,删除后用 bump 触发 re-render
  const [savedTick, setSavedTick] = useState(0);

  function onPickSaved(email) {
    if (normEmail(email) === normEmail(me?.email)) {
      setMenuOpen(false);
      setSwitchOpen(false);
      return;
    }
    if (switchToSavedAccount(email)) {
      // 整页 reload — 让 AuthProvider 用新 token 重拉 /auth/me 拿权限
      // 若当前已在 /dashboard,assign 同 URL 不会触发 reload,必须显式 reload()
      if (window.location.pathname === "/dashboard") {
        window.location.reload();
      } else {
        window.location.assign("/dashboard");
      }
    } else {
      toast("该账号已失效,请重新登录", "error");
      logout();
      clearAuth();
      navigate("/login", { replace: true });
    }
  }

  function onAddNewAccount() {
    // 跳 Login 但不清当前 token — 当前账号若已 saved 会保留;登入新账号后两边都能切
    setMenuOpen(false);
    setSwitchOpen(false);
    navigate("/login", { replace: true });
  }

  function onRemoveSaved(email, ev) {
    ev.stopPropagation();
    removeSavedAccount(email);
    // bump 计数器触发 re-render 让 dropdown 重新读 getSavedAccounts()
    // (原写法 setSwitchOpen 设同值会被 React Object.is bail out 不 re-render)
    setSavedTick((v) => v + 1);
  }

  const title = pageTitleFor(location.pathname);
  const user = me;

  return (
    <header className="sticky top-0 z-20 bg-lightPrimary/70 backdrop-blur-md border-b border-white/40">
      <div className="flex items-center gap-4 px-4 md:px-8 pt-7 pb-5 pl-16 md:pl-8">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-700">Overseas R&amp;D · 招聘工作台</p>
          <h1 className="title-page mt-1 text-[22px] md:text-page-title">{title}</h1>
        </div>

        <div className="hidden md:flex items-center bg-white rounded-full shadow-card pl-5 pr-2 h-[60px] w-[420px] transition-all duration-200 focus-within:ring-4 focus-within:ring-brand/10 focus-within:shadow-glow">
          <I name="search" size={18} className="text-gray-400 shrink-0" />
          <input
            placeholder="搜索候选人 / 岗位 / 部门..."
            className="flex-1 ml-3 bg-transparent outline-none text-sm text-navy-700 placeholder:text-gray-400"
          />
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <button className="hidden sm:flex w-11 h-11 rounded-full bg-white shadow-card items-center justify-center text-gray-700 hover:text-brand hover:-translate-y-0.5 hover:shadow-glow transition-all duration-200">
            <I name="bell" size={18} />
          </button>
          <button className="hidden sm:flex w-11 h-11 rounded-full bg-white shadow-card items-center justify-center text-gray-700 hover:text-brand hover:-translate-y-0.5 hover:shadow-glow transition-all duration-200">
            <I name="moon" size={18} />
          </button>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-3 pl-1 pr-3 h-11 rounded-full bg-white shadow-card hover:shadow-glow hover:-translate-y-0.5 transition-all duration-200"
            >
              <Avatar name={user?.name || user?.email || "U"} src={user?.avatar} size={36} />
              <div className="text-left hidden sm:block">
                <p className="text-xs font-medium text-gray-700 leading-tight">已登录</p>
                <p className="text-sm font-bold text-navy-700 leading-tight">{user?.name || user?.email}</p>
              </div>
              <I name="chevron-down" size={14} className="text-gray-400" />
            </button>
            {menuOpen && (
              <div ref={popoverRef} className="absolute right-0 top-12 w-64 rounded-card bg-white shadow-glow-lg border border-white/60 overflow-hidden z-30">
                <div className="px-4 py-3 border-b border-gray-200 tb-menu-item">
                  <div className="flex items-center gap-3">
                    <Avatar name={user?.name || user?.email || "U"} src={user?.avatar} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-navy-700 truncate">{user?.name || "Overseas R&D 用户"}</p>
                      <p className="text-xs text-gray-700 truncate mt-0.5">{user?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand text-[10px] font-bold">
                      {ROLE_LABEL[user?.role] || user?.role}
                    </span>
                    {user?.jobTitle && (
                      <span className="px-2 py-0.5 rounded-full bg-lightPrimary text-gray-700 text-[10px]">
                        {user.jobTitle}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => { setMenuOpen(false); setProfileOpen(true); }}
                  className="tb-menu-item w-full text-left px-4 py-2.5 text-sm text-navy-700 hover:bg-lightPrimary flex items-center gap-2"
                >
                  <I name="user-circle" size={16} className="text-brand" />
                  修改头像 / 昵称
                </button>
                <button
                  onClick={() => { setMenuOpen(false); setEmailOpen(true); }}
                  className="tb-menu-item w-full text-left px-4 py-2.5 text-sm text-navy-700 hover:bg-lightPrimary flex items-center gap-2"
                >
                  <I name="mail" size={16} className="text-brand" />
                  修改邮箱
                </button>
                <button
                  onClick={() => { setMenuOpen(false); setPasswordOpen(true); }}
                  className="tb-menu-item w-full text-left px-4 py-2.5 text-sm text-navy-700 hover:bg-lightPrimary flex items-center gap-2"
                >
                  <I name="key-round" size={16} className="text-brand" />
                  修改密码
                </button>
                <button
                  onClick={() => { setMenuOpen(false); setTotpOpen(true); }}
                  className="tb-menu-item w-full text-left px-4 py-2.5 text-sm text-navy-700 hover:bg-lightPrimary flex items-center justify-between gap-2"
                >
                  <span className="flex items-center gap-2">
                    <I name="shield-check" size={16} className="text-brand" />
                    两步验证
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${user?.totpEnabled ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-700"}`}>
                    {user?.totpEnabled ? "已启用" : "未启用"}
                  </span>
                </button>
                {user?.isAdmin && (
                  <Link
                    to="/users"
                    onClick={() => setMenuOpen(false)}
                    className="tb-menu-item w-full text-left px-4 py-2.5 text-sm text-navy-700 hover:bg-lightPrimary flex items-center gap-2"
                  >
                    <I name="shield-check" size={16} className="text-brand" />
                    用户与权限管理
                  </Link>
                )}
                <button
                  onClick={() => setSwitchOpen((v) => !v)}
                  className="tb-menu-item w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-lightPrimary flex items-center gap-2 border-t border-gray-200"
                >
                  <I name="refresh-cw" size={16} />
                  切换账号
                  <I name={switchOpen ? "chevron-up" : "chevron-down"} size={14} className="ml-auto text-gray-400" />
                </button>
                {switchOpen && (
                  <div className="bg-lightPrimary/60 border-y border-gray-100 max-h-[260px] overflow-y-auto">
                    {(() => {
                      const meEmail = normEmail(me?.email);
                      const accounts = getSavedAccounts().filter((a) => normEmail(a.email) !== meEmail);
                      if (accounts.length === 0) {
                        return (
                          <p className="px-4 py-3 text-[11px] text-gray-700">
                            还没保存其他账号。在 Login 页勾「记住账号」即可。
                          </p>
                        );
                      }
                      return accounts.map((a) => (
                        // 外层用 div 而非 button — HTML 禁止 button 嵌套 button,
                        // 否则浏览器自动重塑 DOM,内层 X 的 onClick 被 onPickSaved 截胡
                        <div
                          key={a.email}
                          role="button"
                          tabIndex={0}
                          onClick={() => onPickSaved(a.email)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPickSaved(a.email); } }}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-white flex items-center gap-2 group cursor-pointer focus:outline-none focus:bg-white"
                        >
                          <Avatar name={a.user?.name || a.email} src={a.user?.avatar} size={28} />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm text-navy-700 truncate">{a.email}</span>
                            {a.user?.name && (
                              <span className="block text-[11px] text-gray-700 truncate">{a.user.name}</span>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={(ev) => onRemoveSaved(a.email, ev)}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-1 rounded transition"
                            title="移除"
                          >
                            <I name="x" size={12} />
                          </button>
                        </div>
                      ));
                    })()}
                    <button
                      onClick={onAddNewAccount}
                      className="w-full text-left px-4 py-2.5 text-[12px] text-brand hover:bg-white flex items-center gap-2 border-t border-gray-200"
                    >
                      <I name="plus" size={14} />
                      用其他账号登录
                    </button>
                  </div>
                )}
                <button
                  onClick={onLogout}
                  className="tb-menu-item w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2"
                >
                  <I name="log-out" size={16} />
                  退出登录
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {profileOpen && (
        <ProfileEditModal me={user} onClose={() => setProfileOpen(false)} onSaved={patchMe} />
      )}
      {passwordOpen && (
        <PasswordChangeModal me={user} onClose={() => setPasswordOpen(false)} />
      )}
      {emailOpen && (
        <EmailChangeModal me={user} onClose={() => setEmailOpen(false)} onChanged={patchMe} />
      )}
      {totpOpen && (
        <TotpManageModal me={user} onClose={() => setTotpOpen(false)} onChanged={patchMe} />
      )}
    </header>
  );
}

// modal 内联反馈 banner — 操作后 modal 还开着时(发验证码 / 校验失败 / 请求出错 / 复制成功),
// 提示就显示在用户视线内,不甩到右下角 toast(modal 居中时角落 toast 看不到,error toast 还会堆叠)
function ModalNotice({ notice }) {
  if (!notice?.msg) return null;
  const ok = notice.type === "success";
  return (
    <div
      className={`flex items-start gap-2 text-sm rounded-xl px-3 py-2 border ${
        ok ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-red-600 bg-red-50 border-red-200"
      }`}
    >
      <I name={ok ? "check-circle" : "alert-circle"} size={16} className="shrink-0 mt-0.5" />
      <span className="flex-1 break-words whitespace-pre-wrap">{notice.msg}</span>
    </div>
  );
}

function ProfileEditModal({ me, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: me?.name || "",
    avatar: me?.avatar || "",
    jobTitle: me?.jobTitle || "",
  });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  async function submit() {
    setSaving(true);
    setNotice(null);
    try {
      const { data } = await api.patch("/auth/me", {
        name: form.name || undefined,
        avatar: form.avatar || null,
        jobTitle: form.jobTitle || null,
      });
      onSaved(data.user);
      toast("已更新", "success");
      onClose();
    } catch (e) {
      setNotice({ type: "error", msg: e.response?.data?.message || "保存失败,请重试" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} maxWidth="max-w-md">
      <div className="p-6 space-y-4">
        <h3 className="text-lg font-bold text-navy-700 flex items-center gap-2">
          <I name="user-circle" size={18} className="text-brand" /> 修改个人资料
        </h3>
        <div className="flex justify-center mb-2">
          <Avatar name={form.name || me?.email || "U"} src={form.avatar} size={64} />
        </div>
        <label className="block">
          <p className="text-[11px] text-gray-600 mb-1">头像 URL</p>
          <Input value={form.avatar} onChange={(e) => setForm({ ...form, avatar: e.target.value })} placeholder="https://... 留空使用首字母" />
        </label>
        <label className="block">
          <p className="text-[11px] text-gray-600 mb-1">昵称</p>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="block">
          <p className="text-[11px] text-gray-600 mb-1">内部职位(如 HR · 负责人)</p>
          <Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
        </label>
        <div className="text-xs text-gray-600 bg-amber-50 px-3 py-2 rounded-lg">
          修改邮箱需邮箱验证码,该功能将在下一阶段上线。
        </div>
        <ModalNotice notice={notice} />
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
          <Button variant="ghost" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={submit} disabled={saving} icon={<I name={saving ? "loader" : "check"} size={12} className={saving ? "animate-spin" : ""} />}>
            {saving ? "保存中" : "保存"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// 修改密码 — 两种方式可切:旧密码模式 / 邮箱验证码模式
function PasswordChangeModal({ me, onClose }) {
  const [mode, setMode] = useState("code"); // "code" | "current"
  const [currentPassword, setCurrentPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [devCode, setDevCode] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  // 反馈内联显示在 modal 内,而不是甩到右下角 toast(modal 居中时角落 toast 看不到 / error toast 堆叠)
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function sendCode() {
    setSending(true);
    setNotice(null);
    try {
      const { data } = await api.post("/auth/me/request-password-code", {});
      if (data.devCode) setDevCode(data.devCode);
      setCooldown(60);
      setNotice({ type: "success", msg: data.devCode ? "开发模式:验证码见上方提示" : "验证码已发到邮箱,请查收" });
    } catch (e) {
      if (e.response?.data?.error === "resend_too_soon") setCooldown(e.response.data.retryAfter || 60);
      setNotice({ type: "error", msg: e.response?.data?.message || "验证码发送失败,请稍后重试" });
    } finally {
      setSending(false);
    }
  }

  async function submit() {
    setNotice(null);
    if (newPassword.length < 8) return setNotice({ type: "error", msg: "新密码至少 8 位" });
    if (newPassword !== confirm) return setNotice({ type: "error", msg: "两次输入的新密码不一致" });
    setSaving(true);
    try {
      if (mode === "current") {
        await api.post("/auth/me/change-password", { currentPassword, newPassword });
      } else {
        await api.post("/auth/me/change-password-verify", { code, newPassword });
      }
      toast("密码已修改", "success");
      onClose();
    } catch (e) {
      setNotice({ type: "error", msg: e.response?.data?.message || "修改失败,请检查输入后重试" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} maxWidth="max-w-md">
      <div className="p-6 space-y-4">
        <h3 className="text-lg font-bold text-navy-700 flex items-center gap-2">
          <I name="key-round" size={18} className="text-brand" /> 修改密码
        </h3>
        {/* 切换 mode */}
        <div className="flex gap-1 bg-lightPrimary rounded-xl p-1 text-xs font-bold">
          <button
            onClick={() => setMode("code")}
            className={`flex-1 py-1.5 rounded-lg ${mode === "code" ? "bg-white shadow text-brand" : "text-gray-700"}`}
          >
            邮箱验证码(推荐)
          </button>
          <button
            onClick={() => setMode("current")}
            className={`flex-1 py-1.5 rounded-lg ${mode === "current" ? "bg-white shadow text-brand" : "text-gray-700"}`}
          >
            当前密码验证
          </button>
        </div>

        {mode === "code" ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-600">
              验证码将发到您当前邮箱:<strong className="text-navy-700">{me?.email}</strong>
            </p>
            {devCode && (
              <div className="text-xs bg-amber-50 border-2 border-amber-200 rounded-lg p-3 font-mono">
                ⚠ 开发模式 — 验证码: <strong className="text-amber-800 select-all">{devCode}</strong>
              </div>
            )}
            <div className="flex gap-2">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6 位验证码" maxLength={6} />
              <Button
                variant="ghost"
                onClick={sendCode}
                disabled={sending || cooldown > 0}
                size="sm"
              >
                {sending ? "发送中" : cooldown > 0 ? `${cooldown}s` : "获取验证码"}
              </Button>
            </div>
          </div>
        ) : (
          <label className="block">
            <p className="text-[11px] text-gray-600 mb-1">当前密码</p>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </label>
        )}

        <label className="block">
          <p className="text-[11px] text-gray-600 mb-1">新密码(至少 10 位,需含字母+数字)</p>
          <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <div className="mt-2">
            <PasswordStrengthMeter password={newPassword} context={{ email: me?.email, name: me?.name }} />
          </div>
        </label>
        <label className="block">
          <p className="text-[11px] text-gray-600 mb-1">确认新密码</p>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <ModalNotice notice={notice} />
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
          <Button variant="ghost" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={submit} disabled={saving} icon={<I name={saving ? "loader" : "check"} size={12} className={saving ? "animate-spin" : ""} />}>
            {saving ? "保存中" : "修改密码"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// 修改邮箱 — 双重验证:当前邮箱 + 新邮箱各发一个验证码
function EmailChangeModal({ me, onClose, onChanged }) {
  const [step, setStep] = useState(1);
  const [newEmail, setNewEmail] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [devCodes, setDevCodes] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function sendCodes() {
    setNotice(null);
    if (!newEmail.includes("@")) return setNotice({ type: "error", msg: "请输入合法新邮箱" });
    setSending(true);
    try {
      const { data } = await api.post("/auth/me/request-email-change-code", { newEmail });
      if (data.devCodes) setDevCodes(data.devCodes);
      setCooldown(60);
      setStep(2);
      setNotice({ type: "success", msg: "已分别向当前邮箱和新邮箱发送验证码,请查收" });
    } catch (e) {
      if (e.response?.data?.error === "email_taken") return setNotice({ type: "error", msg: "该新邮箱已被其它账号注册" });
      setNotice({ type: "error", msg: e.response?.data?.message || "验证码发送失败,请稍后重试" });
    } finally {
      setSending(false);
    }
  }

  async function submit() {
    setNotice(null);
    if (!currentCode || !newCode) return setNotice({ type: "error", msg: "两个验证码都要填" });
    setSaving(true);
    try {
      const { data } = await api.post("/auth/me/change-email-verify", { newEmail, currentCode, newCode });
      onChanged(data.user);
      toast("邮箱已更新", "success");
      onClose();
    } catch (e) {
      setNotice({ type: "error", msg: e.response?.data?.message || "更新失败,请检查验证码后重试" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} maxWidth="max-w-md">
      <div className="p-6 space-y-4">
        <h3 className="text-lg font-bold text-navy-700 flex items-center gap-2">
          <I name="mail" size={18} className="text-brand" /> 修改邮箱
        </h3>
        {step === 1 && (
          <>
            <p className="text-xs text-gray-600">
              当前邮箱:<strong className="text-navy-700">{me?.email}</strong>。改邮箱需当前邮箱 + 新邮箱两个验证码都对。
            </p>
            <label className="block">
              <p className="text-[11px] text-gray-600 mb-1">新邮箱</p>
              <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new@example.com" type="email" />
            </label>
            <ModalNotice notice={notice} />
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
              <Button variant="ghost" onClick={onClose} disabled={sending}>取消</Button>
              <Button onClick={sendCodes} disabled={sending} icon={<I name={sending ? "loader" : "send"} size={12} className={sending ? "animate-spin" : ""} />}>
                {sending ? "发送中" : "发送验证码"}
              </Button>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <p className="text-xs text-gray-600">
              已分别向 <strong className="text-navy-700">{me?.email}</strong>(当前)和 <strong className="text-navy-700">{newEmail}</strong>(新)发送验证码,各 5 分钟有效。
            </p>
            {devCodes && (
              <div className="text-xs bg-amber-50 border-2 border-amber-200 rounded-lg p-3 font-mono space-y-1">
                <p>⚠ 开发模式 — 验证码:</p>
                <p>当前邮箱: <strong className="text-amber-800 select-all">{devCodes.current}</strong></p>
                <p>新邮箱: <strong className="text-amber-800 select-all">{devCodes.next}</strong></p>
              </div>
            )}
            <label className="block">
              <p className="text-[11px] text-gray-600 mb-1">当前邮箱收到的验证码</p>
              <Input value={currentCode} onChange={(e) => setCurrentCode(e.target.value)} maxLength={6} placeholder="6 位数字" />
            </label>
            <label className="block">
              <p className="text-[11px] text-gray-600 mb-1">新邮箱收到的验证码</p>
              <Input value={newCode} onChange={(e) => setNewCode(e.target.value)} maxLength={6} placeholder="6 位数字" />
            </label>
            <div className="flex items-center justify-between text-xs">
              <button onClick={sendCodes} disabled={cooldown > 0 || sending} className="text-brand hover:underline disabled:text-gray-400 disabled:no-underline">
                {cooldown > 0 ? `${cooldown}s 后可重发` : "重新发送"}
              </button>
              <button onClick={() => setStep(1)} className="text-gray-600 hover:text-brand">改新邮箱</button>
            </div>
            <ModalNotice notice={notice} />
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
              <Button variant="ghost" onClick={onClose} disabled={saving}>取消</Button>
              <Button onClick={submit} disabled={saving} icon={<I name={saving ? "loader" : "check"} size={12} className={saving ? "animate-spin" : ""} />}>
                {saving ? "提交中" : "确认修改"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// 两步验证管理 — 未启用走 setup 流;已启用显示状态 + 提供关闭
function TotpManageModal({ me, onClose, onChanged }) {
  if (!me) return null;
  if (me.totpEnabled) {
    return <TotpDisableModal me={me} onClose={onClose} onChanged={onChanged} />;
  }
  return <TotpSetupModal me={me} onClose={onClose} onChanged={onChanged} />;
}

function TotpSetupModal({ me, onClose, onChanged }) {
  const [step, setStep] = useState(1); // 1=qr  2=verify  3=recovery
  const [secret, setSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (step !== 1) return;
    setLoading(true);
    api.post("/auth/me/totp-setup", {})
      .then(({ data }) => {
        setSecret(data.secret);
        setOtpauthUrl(data.otpauthUrl);
      })
      .catch((e) => {
        toast(e.response?.data?.message || "初始化失败", "error");
        onClose();
      })
      .finally(() => setLoading(false));
  }, [step, onClose]);

  async function verify() {
    setNotice(null);
    if (!/^\d{6}$/.test(code)) return setNotice({ type: "error", msg: "请输入 6 位数字" });
    setVerifying(true);
    try {
      const { data } = await api.post("/auth/me/totp-verify-setup", { secret, code });
      setRecoveryCodes(data.recoveryCodes || []);
      setStep(3);
      onChanged?.({ totpEnabled: true });
      setNotice({ type: "success", msg: "两步验证已启用,请保存下方备份码" });
    } catch (e) {
      setNotice({ type: "error", msg: e.response?.data?.message || "验证码不正确,请重试" });
    } finally {
      setVerifying(false);
    }
  }

  function copyRecovery() {
    navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setNotice({ type: "success", msg: "已复制全部备份码到剪贴板" });
  }

  return (
    <Modal open={true} onClose={onClose} maxWidth="max-w-md">
      <div className="p-6 space-y-4">
        <h3 className="text-lg font-bold text-navy-700 flex items-center gap-2">
          <I name="shield-check" size={18} className="text-brand" /> 启用两步验证(TOTP)
        </h3>

        {step === 1 && (
          <>
            <p className="text-xs text-gray-700">
              用 1Password / Google Authenticator / Microsoft Authenticator / Authy 任意一款,扫码下方二维码添加账号。
              扫码完成后点「下一步」输入授权器生成的 6 位动态码完成验证。
            </p>
            <div className="flex justify-center bg-white p-4 rounded-xl border border-gray-200">
              {loading || !otpauthUrl ? (
                <div className="w-44 h-44 flex items-center justify-center text-gray-500">
                  <I name="loader" size={20} className="animate-spin" />
                </div>
              ) : (
                <QRCodeSVG value={otpauthUrl} size={180} level="M" />
              )}
            </div>
            <div className="text-[11px] text-gray-600 bg-lightPrimary rounded-lg p-2">
              <p className="font-bold mb-1">无法扫码? 复制密钥手动添加:</p>
              <code className="font-mono text-xs text-navy-700 select-all break-all">{secret || "—"}</code>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
              <Button variant="ghost" onClick={onClose}>取消</Button>
              <Button onClick={() => setStep(2)} disabled={!secret} icon={<I name="arrow-right" size={12} />}>下一步</Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-xs text-gray-700">输入授权器当前显示的 6 位动态码以完成验证:</p>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              maxLength={6}
              autoFocus
              className="text-center text-lg tracking-[0.4em] font-mono"
            />
            <ModalNotice notice={notice} />
            <div className="flex justify-between pt-2 border-t border-gray-200">
              <Button variant="ghost" onClick={() => setStep(1)}>返回</Button>
              <Button onClick={verify} disabled={verifying} icon={<I name={verifying ? "loader" : "check"} size={12} className={verifying ? "animate-spin" : ""} />}>
                {verifying ? "验证中" : "确认启用"}
              </Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 space-y-2">
              <p className="text-xs font-bold text-amber-900">⚠ 备份码仅此一次显示。请打印 / 保存到密码管理器,丢失授权器时用于登录(每个只能用一次)。</p>
              <div className="grid grid-cols-2 gap-1.5 font-mono text-sm text-navy-700">
                {recoveryCodes.map((c) => (
                  <code key={c} className="bg-white rounded p-1.5 text-center select-all">{c}</code>
                ))}
              </div>
            </div>
            <ModalNotice notice={notice} />
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
              <Button variant="ghost" onClick={copyRecovery} icon={<I name="copy" size={12} />}>复制全部</Button>
              <Button onClick={onClose}>我已保存,完成</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function TotpDisableModal({ me, onClose, onChanged }) {
  const [mode, setMode] = useState("code");
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  async function disable() {
    setSaving(true);
    setNotice(null);
    try {
      const body = mode === "code" ? { code } : mode === "recovery" ? { recoveryCode } : { currentPassword };
      await api.post("/auth/me/totp-disable", body);
      onChanged?.({ totpEnabled: false });
      toast("已关闭两步验证", "success");
      onClose();
    } catch (e) {
      setNotice({ type: "error", msg: e.response?.data?.message || "关闭失败,请检查凭证后重试" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} maxWidth="max-w-md">
      <div className="p-6 space-y-4">
        <h3 className="text-lg font-bold text-navy-700 flex items-center gap-2">
          <I name="shield-off" size={18} className="text-red-500" /> 关闭两步验证
        </h3>
        <p className="text-xs text-gray-700">
          两步验证目前 <strong className="text-emerald-700">已启用</strong>。关闭后账号安全等级会降低。需提供以下任一凭证确认:
        </p>
        <div className="flex gap-1 bg-lightPrimary rounded-xl p-1 text-xs font-bold">
          <button
            onClick={() => setMode("code")}
            className={`flex-1 py-1.5 rounded-lg ${mode === "code" ? "bg-white shadow text-brand" : "text-gray-700"}`}
          >
            6 位 TOTP
          </button>
          <button
            onClick={() => setMode("recovery")}
            className={`flex-1 py-1.5 rounded-lg ${mode === "recovery" ? "bg-white shadow text-brand" : "text-gray-700"}`}
          >
            备份码
          </button>
          <button
            onClick={() => setMode("password")}
            className={`flex-1 py-1.5 rounded-lg ${mode === "password" ? "bg-white shadow text-brand" : "text-gray-700"}`}
          >
            当前密码
          </button>
        </div>
        {mode === "code" && (
          <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} maxLength={6} placeholder="000000" className="text-center font-mono tracking-[0.4em] text-lg" />
        )}
        {mode === "recovery" && (
          <Input value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())} maxLength={10} placeholder="XXXX-XXXX" className="text-center font-mono tracking-[0.2em] text-lg" />
        )}
        {mode === "password" && (
          <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="当前登录密码" />
        )}
        <ModalNotice notice={notice} />
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
          <Button variant="ghost" onClick={onClose} disabled={saving}>取消</Button>
          <Button variant="danger" onClick={disable} disabled={saving} icon={<I name={saving ? "loader" : "shield-off"} size={12} className={saving ? "animate-spin" : ""} />}>
            {saving ? "处理中" : "确认关闭"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
