// MESA Recruit · 左侧导航
//   - 桌面端: 268px 宽全展开 / 80px 仅图标收起态
//   - 移动端 (<md): 抽屉模式,默认隐藏,汉堡按钮唤起
//   - 含 LLM 状态卡 (点开 modal 切换模型 + admin 改 key)

import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { I, Modal, Button, toast } from "./Primitives.jsx";
import { api } from "../lib/api.js";
import { useMe } from "../lib/authContext.jsx";
import { hasPage as canSeePage, isAdmin as checkIsAdmin } from "../lib/permissions.js";

const ITEMS = [
  { to: "/dashboard",    label: "概览",       icon: "layout-dashboard", pageKey: "dashboard" },
  { to: "/candidates",   label: "候选人",     icon: "users",            pageKey: "candidates" },
  { to: "/jobs",         label: "岗位",       icon: "briefcase",        pageKey: "jobs" },
  { to: "/upload",       label: "简历收件箱", icon: "upload-cloud",     pageKey: "upload" },
  { to: "/staff",        label: "现有人员",   icon: "users-round",      pageKey: "staff" },
  { to: "/newhire",      label: "入职管理",   icon: "user-plus",        pageKey: "newhire" },
  { to: "/departments",  label: "部门管理",   icon: "building-2",       pageKey: "departments" },
  { to: "/interviews",   label: "面试安排",   icon: "calendar",         pageKey: "interviews" },
  { to: "/reports",      label: "数据报表",   icon: "bar-chart-3",      pageKey: "reports" },
  { to: "/users",        label: "用户管理",   icon: "shield-check",     pageKey: "users", adminOnly: true },
  { to: "/audit",        label: "审计日志",   icon: "scroll-text",      pageKey: "audit", adminOnly: true },
];

const PROVIDER_LABELS = {
  kimi: "Kimi (Moonshot AI)",
  deepseek: "DeepSeek",
};

const COLLAPSED_KEY = "mesa.sidebar.collapsed";

export default function Sidebar({ user, mobileOpen = false, onMobileClose, collapsed, onToggleCollapsed }) {
  const location = useLocation();
  const me = useMe();
  // 兼容旧调用方:user prop 仍用,但 page 过滤优先看 me(权限策略)
  const isAdmin = checkIsAdmin(me) || user?.role === "ADMIN";
  // LLM 配置入口:admin 或被授权 system.llm pageKey 的用户都能看见
  const canLlmAccess = isAdmin || (me ? canSeePage(me, "system.llm") : false);
  const items = ITEMS.filter((it) => {
    if (it.adminOnly && !isAdmin) return false;
    if (it.pageKey && me) return canSeePage(me, it.pageKey);
    // me 还在加载时,先展示非 adminOnly 项,避免菜单闪烁
    return true;
  });
  const [llm, setLlm] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem("mesa.llm.model") || "");
  const [adminSettings, setAdminSettings] = useState(null);
  const [editingKey, setEditingKey] = useState(false);
  const [pendingKey, setPendingKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);

  // prompt 编辑(admin)
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [promptLoading, setPromptLoading] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);

  useEffect(() => {
    api.get("/resumes/llm-status").then((r) => {
      setLlm(r.data);
      if (!selectedModel && r.data?.model) setSelectedModel(r.data.model);
    }).catch(() => setLlm({ configured: false }));
    // eslint-disable-next-line
  }, []);

  // admin 或被授权 system.llm 的用户打开 modal 时拉 settings
  useEffect(() => {
    if (!modalOpen || !canLlmAccess) return;
    api.get("/system/settings").then((r) => setAdminSettings(r.data.items)).catch(() => setAdminSettings([]));
  }, [modalOpen, canLlmAccess]);

  function onPickModel(modelId) {
    setSelectedModel(modelId);
    localStorage.setItem("mesa.llm.model", modelId);
  }

  async function refreshLlmStatus() {
    const r = await api.get("/resumes/llm-status");
    setLlm(r.data);
    const r2 = await api.get("/system/settings");
    setAdminSettings(r2.data.items);
  }

  async function saveKimiKey() {
    if (!pendingKey || pendingKey.length < 10) {
      toast("Key 至少 10 字符", "error");
      return;
    }
    setSavingKey(true);
    try {
      await api.put("/system/settings/kimi.api_key", { value: pendingKey });
      toast("Kimi API Key 已加密保存", "success");
      setPendingKey("");
      setEditingKey(false);
      await refreshLlmStatus();
    } catch (e) {
      toast(e.response?.data?.message || "保存失败", "error");
    } finally {
      setSavingKey(false);
    }
  }

  async function deleteKimiKey() {
    if (!confirm("回退到 .env 的 KIMI_API_KEY 配置?")) return;
    try {
      await api.delete("/system/settings/kimi.api_key");
      toast("已删除 DB 中的 key,回退到 env fallback", "success");
      await refreshLlmStatus();
    } catch (e) {
      toast(e.response?.data?.message || "删除失败", "error");
    }
  }

  async function saveSystemModel(modelId) {
    try {
      await api.put("/system/settings/kimi.model", { value: modelId });
      toast(`系统默认模型已改为 ${modelId}`, "success");
      await refreshLlmStatus();
    } catch (e) {
      toast(e.response?.data?.message || "保存失败", "error");
    }
  }

  async function testKey() {
    try {
      const { data } = await api.post("/system/settings/kimi.api_key/test");
      toast(`✓ Key 可用 · ${data.modelsCount} 个模型可访问`, "success");
    } catch (e) {
      toast(e.response?.data?.message || "探活失败", "error");
    }
  }

  async function openPromptEditor() {
    setPromptOpen(true);
    setPromptLoading(true);
    try {
      const { data } = await api.get("/system/settings/kimi.prompt/full");
      setPromptText(data.value || "");
    } catch (e) {
      toast(e.response?.data?.message || "拉取 prompt 失败", "error");
    } finally {
      setPromptLoading(false);
    }
  }

  async function savePrompt() {
    if (!promptText || promptText.length < 50) {
      toast("Prompt 至少 50 字符", "error");
      return;
    }
    setSavingPrompt(true);
    try {
      await api.put("/system/settings/kimi.prompt", { value: promptText });
      toast("Prompt 已保存,下次解析生效", "success");
      setPromptOpen(false);
      await refreshLlmStatus();
    } catch (e) {
      toast(e.response?.data?.message || "保存失败", "error");
    } finally {
      setSavingPrompt(false);
    }
  }

  async function resetPrompt() {
    if (!confirm("回退到内置默认 prompt(删除 DB 中的自定义)?")) return;
    try {
      await api.delete("/system/settings/kimi.prompt");
      toast("已回退到内置 prompt", "success");
      // 重拉默认值
      const { data } = await api.get("/system/settings/kimi.prompt/full");
      setPromptText(data.value || "");
      await refreshLlmStatus();
    } catch (e) {
      toast(e.response?.data?.message || "回退失败", "error");
    }
  }

  const ready = !!llm?.configured;
  const chipClass = ready ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700";
  const chipLabel = ready ? "已就绪" : "待配置";

  const keyRow = adminSettings?.find((s) => s.key === "kimi.api_key");
  const modelRow = adminSettings?.find((s) => s.key === "kimi.model");

  // === 渲染 ===
  return (
    <>
      {/* 移动端遮罩 */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-navy-900/40 backdrop-blur-sm"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={`
          bg-white shrink-0 flex flex-col pb-8 shadow-sidebar transition-all duration-200
          fixed md:sticky top-0 z-50 md:z-30
          h-screen md:h-screen md:overflow-y-auto
          ${collapsed ? "md:w-[80px]" : "md:w-[268px]"}
          ${mobileOpen ? "translate-x-0 w-[268px]" : "-translate-x-full md:translate-x-0 w-[268px]"}
        `}
      >
        {/* 头部 · logo + 收起按钮 */}
        <div className="flex items-center justify-between px-6 pt-9 md:pt-11">
          {!collapsed ? (
            <span
              className="brand-logo text-[22px] md:text-[24px] tracking-tight"
              style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700 }}
            >
              Overseas <span style={{ fontWeight: 500 }}>R&amp;D</span>
            </span>
          ) : (
            <span className="brand-logo text-[22px] font-bold mx-auto" style={{ fontFamily: "Poppins" }}>O</span>
          )}
          {/* 桌面端收起按钮 */}
          <button
            onClick={onToggleCollapsed}
            className="hidden md:inline-flex w-8 h-8 rounded-full bg-lightPrimary hover:bg-gray-200 items-center justify-center text-gray-700 hover:text-brand transition"
            title={collapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            <I name={collapsed ? "chevron-right" : "chevron-left"} size={16} />
          </button>
          {/* 移动端关闭按钮 */}
          <button
            onClick={onMobileClose}
            className="md:hidden w-8 h-8 rounded-full bg-lightPrimary flex items-center justify-center text-gray-700"
          >
            <I name="x" size={16} />
          </button>
        </div>
        <div className="mt-9 mb-5 h-px bg-gray-200 mx-6"></div>

        <nav className="flex-1">
          <ul>
            {items.map((it) => {
              const isActive =
                it.to === "/dashboard"
                  ? location.pathname === "/" || location.pathname.startsWith("/dashboard")
                  : location.pathname.startsWith(it.to);
              return (
                <li key={it.to} className="relative">
                  <NavLink
                    to={it.to}
                    onClick={onMobileClose}
                    className={`my-[3px] flex w-full items-center text-left ${collapsed ? "md:justify-center md:px-0 px-9 py-2" : "px-9 py-2"}`}
                    title={collapsed ? it.label : undefined}
                  >
                    <span className="flex items-center justify-center"
                          style={{ width: 22, height: 22, color: isActive ? "#422AFB" : "#A3AED0" }}>
                      <I name={it.icon} size={20} strokeWidth={isActive ? 2.4 : 2} />
                    </span>
                    {!collapsed && (
                      <span className={`ml-4 text-sm whitespace-nowrap ${isActive ? "font-bold text-navy-700" : "font-medium text-gray-700"}`}>
                        {it.label}
                      </span>
                    )}
                  </NavLink>
                  {isActive && <div className="absolute right-0 top-1/2 -translate-y-1/2 h-9 w-1 rounded-l-lg bg-brand"></div>}
                  {!collapsed && it.adminOnly && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-5 h-5 rounded-md bg-brand-50 text-brand"
                          title="仅管理员可见">
                      <I name="shield-check" size={10} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          {canLlmAccess && (
            <>
              {!collapsed && (
                <>
                  <div className="mt-7 mx-9 h-px bg-gray-200"></div>
                  <div className="px-9 mt-5 mb-3 text-[11px] tracking-wide font-bold text-gray-600">AI 配置</div>
                </>
              )}
              <button
                onClick={() => setModalOpen(true)}
                className={`
                  ${collapsed ? "md:mx-3 md:px-2 md:py-2 md:justify-center" : "mx-7 px-3 py-2"}
                  rounded-xl bg-lightPrimary flex items-center gap-2 hover:ring-2 hover:ring-brand/20 transition
                `}
                title={collapsed ? "LLM 配置" : undefined}
                style={collapsed ? {} : { width: "calc(100% - 3.5rem)" }}
              >
                <I name="key-round" size={16} className="text-brand" />
                {!collapsed && (
                  <>
                    <span className="text-sm font-bold text-navy-700">LLM Key</span>
                    <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-bold ${chipClass}`}>{chipLabel}</span>
                  </>
                )}
              </button>
            </>
          )}
        </nav>
      </aside>

      {/* === LLM 配置 Modal === */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="max-w-lg">
        <div className="p-7 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-navy-700 flex items-center gap-2">
              <I name="key-round" size={20} className="text-brand" />
              LLM 配置
            </h3>
            <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-navy-700">
              <I name="x" size={20} />
            </button>
          </div>

          {!llm ? (
            <div className="text-sm text-gray-700 py-6 text-center">
              <I name="loader" size={16} className="animate-spin inline mr-2" />加载中...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-lightPrimary rounded-xl">
                  <p className="text-xs text-gray-700">服务商</p>
                  <p className="font-bold text-navy-700 mt-1">{PROVIDER_LABELS[llm.provider] || llm.provider}</p>
                </div>
                <div className="p-3 bg-lightPrimary rounded-xl">
                  <p className="text-xs text-gray-700">系统默认模型</p>
                  <p className="font-bold text-navy-700 mt-1 text-xs">{llm.model}</p>
                </div>
                <div className="p-3 bg-lightPrimary rounded-xl">
                  <p className="text-xs text-gray-700">模式</p>
                  <p className="font-bold text-navy-700 mt-1">系统统一</p>
                </div>
                <div className="p-3 bg-lightPrimary rounded-xl">
                  <p className="text-xs text-gray-700">状态</p>
                  <p className={`font-bold mt-1 ${ready ? "text-green-600" : "text-amber-600"}`}>
                    {ready ? "✓ 已就绪" : "○ 待配置"}
                  </p>
                </div>
              </div>

              {/* === Admin only · 系统 Key 编辑 === */}
              {isAdmin && (
                <div className="border-2 border-amber-100 bg-amber-50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <I name="shield-check" size={16} className="text-amber-700" />
                    <p className="text-sm font-bold text-amber-900">管理员设置 (仅 ADMIN 角色可见)</p>
                  </div>

                  {/* Kimi API Key */}
                  <div>
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">Kimi API Key</p>
                    {!editingKey ? (
                      <div className="flex items-center gap-2 p-3 bg-white rounded-lg">
                        <code className="font-mono text-xs text-gray-700 flex-1 truncate">
                          {keyRow?.maskedValue || "(未配置)"}
                        </code>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-lightPrimary text-gray-700 font-bold">
                          {keyRow?.source === "db" ? "DB" : keyRow?.source === "env" ? "env" : "无"}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => setEditingKey(true)} icon={<I name="pencil" size={12} />}>
                          编辑
                        </Button>
                        <Button size="sm" variant="ghost" onClick={testKey} icon={<I name="activity" size={12} />}>
                          测试
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <input
                          type="password"
                          autoFocus
                          placeholder="sk-... (写入 DB 时 AES-256-GCM 加密)"
                          value={pendingKey}
                          onChange={(e) => setPendingKey(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-amber-300 text-sm font-mono outline-none focus:border-amber-500 bg-white"
                          disabled={savingKey}
                        />
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => { setEditingKey(false); setPendingKey(""); }} disabled={savingKey}>
                            取消
                          </Button>
                          <Button size="sm" onClick={saveKimiKey} disabled={savingKey} icon={<I name={savingKey ? "loader" : "check"} size={12} className={savingKey ? "animate-spin" : ""} />}>
                            {savingKey ? "保存中" : "加密保存"}
                          </Button>
                        </div>
                      </div>
                    )}
                    {keyRow?.source === "db" && (
                      <button onClick={deleteKimiKey} className="text-[11px] text-gray-600 hover:text-red-500 mt-1.5 inline-flex items-center gap-1">
                        <I name="trash-2" size={11} /> 删除 DB 中的 key,回退到 .env 配置
                      </button>
                    )}
                  </div>

                  {/* 系统默认模型 (admin 改) */}
                  <div>
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">系统默认模型</p>
                    <div className="flex items-center gap-2 p-3 bg-white rounded-lg">
                      <select
                        value={modelRow?.maskedValue || llm.model}
                        onChange={(e) => saveSystemModel(e.target.value)}
                        className="flex-1 bg-transparent text-sm text-navy-700 outline-none cursor-pointer"
                      >
                        {(llm.availableModels || []).map((m) => (
                          <option key={m.id} value={m.id}>{m.label}</option>
                        ))}
                      </select>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-lightPrimary text-gray-700 font-bold">
                        {modelRow?.source === "db" ? "DB" : "env"}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-600 mt-1">
                      影响所有未在下方设置个人偏好的用户 · 共 {llm.availableModels?.length || 0} 个可用
                    </p>
                  </div>

                  {/* 解析 Prompt (admin 改) */}
                  <div>
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">解析 Prompt</p>
                    <div className="flex items-center gap-2 p-3 bg-white rounded-lg">
                      <I name="file-text" size={16} className="text-gray-400" />
                      <span className="text-xs text-gray-700 flex-1">
                        {adminSettings?.find(s => s.key === "kimi.prompt")?.source === "db" ? "已自定义" : "内置默认"}
                      </span>
                      <Button size="sm" variant="ghost" onClick={openPromptEditor} icon={<I name="pencil" size={12} />}>
                        查看 / 编辑
                      </Button>
                    </div>
                    <p className="text-[11px] text-gray-600 mt-1">
                      系统级 · 影响所有用户的简历解析
                    </p>
                  </div>
                </div>
              )}

              {/* 个人偏好(任何用户) */}
              {ready && llm.availableModels?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">个人解析模型偏好</p>
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                    {llm.availableModels.map((m) => {
                      const checked = selectedModel === m.id;
                      const isSysDefault = m.id === llm.model;
                      return (
                        <button
                          key={m.id}
                          onClick={() => onPickModel(m.id)}
                          className={`w-full text-left p-2.5 rounded-xl border-2 transition flex items-start gap-3
                            ${checked ? "border-brand bg-brand-50" : "border-gray-200 hover:border-gray-300 bg-white"}`}
                        >
                          <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0
                            ${checked ? "border-brand bg-brand" : "border-gray-300"}`}>
                            {checked && <span className="w-1.5 h-1.5 rounded-full bg-white"></span>}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-navy-700 flex items-center gap-2">
                              {m.label}
                              {isSysDefault && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-lightPrimary text-gray-700">系统默认</span>}
                            </p>
                            <p className="text-[11px] text-gray-700 mt-0.5">{m.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-gray-600 mt-2">
                    选择仅对你本人下次上传生效 · 存浏览器 localStorage
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2 border-t border-gray-200">
                <Button variant="ghost" onClick={() => setModalOpen(false)}>关闭</Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* === Prompt 编辑 Modal (admin only) === */}
      <Modal open={promptOpen} onClose={() => setPromptOpen(false)} maxWidth="max-w-4xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-navy-700 flex items-center gap-2">
              <I name="file-text" size={18} className="text-brand" />
              简历解析 Prompt 编辑器
            </h3>
            <button onClick={() => setPromptOpen(false)} className="text-gray-400 hover:text-navy-700">
              <I name="x" size={20} />
            </button>
          </div>
          <p className="text-xs text-gray-700">
            修改 Kimi 系统提示词。系统会让 Kimi 输出 JSON,其中 <code>summary</code> 字段是 HR 友好的纯文本简报,其余字段填入 Candidate 列(用于列表/检索/匹配度)。<strong className="text-amber-700">保存后下次上传立即生效。</strong>
          </p>
          {promptLoading ? (
            <div className="text-sm text-gray-700 py-12 text-center">
              <I name="loader" size={16} className="animate-spin inline mr-2" />加载中...
            </div>
          ) : (
            <>
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                className="w-full h-[480px] p-3 rounded-xl border-2 border-gray-200 font-mono text-xs leading-relaxed outline-none focus:border-brand resize-none"
                disabled={savingPrompt}
                spellCheck={false}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-600">
                  {promptText.length} 字符 · 上限 20,000
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={resetPrompt} icon={<I name="rotate-ccw" size={12} />}>
                    回退默认
                  </Button>
                  <Button variant="ghost" onClick={() => setPromptOpen(false)} disabled={savingPrompt}>
                    取消
                  </Button>
                  <Button onClick={savePrompt} disabled={savingPrompt} icon={<I name={savingPrompt ? "loader" : "check"} size={12} className={savingPrompt ? "animate-spin" : ""} />}>
                    {savingPrompt ? "保存中" : "保存"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}

export { COLLAPSED_KEY };
