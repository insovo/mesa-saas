// MESA Recruit · 左侧导航 + LLM Key 状态

import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { I, Modal, Button } from "./Primitives.jsx";
import { api } from "../lib/api.js";

const ITEMS = [
  { to: "/dashboard", label: "概览", icon: "layout-dashboard" },
  { to: "/candidates", label: "候选人", icon: "users" },
  { to: "/jobs", label: "岗位", icon: "briefcase" },
  { to: "/upload", label: "简历收件箱", icon: "upload-cloud" },
  { to: "/staff", label: "现有人员", icon: "users-round" },
  { to: "/newhire", label: "入职管理", icon: "user-plus" },
  { to: "/departments", label: "部门管理", icon: "building-2", adminOnly: true },
  { to: "/interviews", label: "面试安排", icon: "calendar" },
  { to: "/reports", label: "数据报表", icon: "bar-chart-3" },
];

const PROVIDER_LABELS = {
  kimi: "Kimi (Moonshot AI)",
  deepseek: "DeepSeek",
};

export default function Sidebar({ user }) {
  const location = useLocation();
  const isAdmin = user?.role === "ADMIN";
  const items = ITEMS.filter((it) => !it.adminOnly || isAdmin);
  const [llm, setLlm] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    api.get("/resumes/llm-status").then((r) => setLlm(r.data)).catch(() => setLlm({ configured: false }));
  }, []);

  const ready = !!llm?.configured;
  const chipClass = ready
    ? "bg-green-100 text-green-700"
    : "bg-amber-100 text-amber-700";
  const chipLabel = ready ? "已就绪" : "待配置";

  return (
    <>
      <aside className="w-[268px] bg-white shrink-0 min-h-screen flex flex-col pb-8 shadow-sidebar">
        <div className="mx-[40px] mt-[44px] flex items-center">
          <span className="text-[24px] uppercase text-navy-700 tracking-tight"
                style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700 }}>
            MESA <span style={{ fontWeight: 500 }}>RECRUIT</span>
          </span>
        </div>
        <div className="mt-[42px] mb-6 h-px bg-gray-200"></div>

        <nav className="flex-1">
          <ul>
            {items.map((it) => {
              const isActive =
                it.to === "/dashboard"
                  ? location.pathname === "/" || location.pathname.startsWith("/dashboard")
                  : location.pathname.startsWith(it.to);
              return (
                <li key={it.to} className="relative">
                  <NavLink to={it.to} className="my-[3px] flex w-full items-center px-9 py-2 text-left">
                    <span className="flex items-center justify-center"
                          style={{ width: 22, height: 22, color: isActive ? "#422AFB" : "#A3AED0" }}>
                      <I name={it.icon} size={20} strokeWidth={isActive ? 2.4 : 2} />
                    </span>
                    <span className={`ml-4 text-sm ${isActive ? "font-bold text-navy-700" : "font-medium text-gray-700"}`}>
                      {it.label}
                    </span>
                  </NavLink>
                  {isActive && <div className="absolute right-0 top-1/2 -translate-y-1/2 h-9 w-1 rounded-l-lg bg-brand"></div>}
                  {it.adminOnly && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-5 h-5 rounded-md bg-brand-50 text-brand"
                          title="仅管理员可见">
                      <I name="shield-check" size={10} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-7 mx-9 h-px bg-gray-200"></div>
          <div className="px-9 mt-5 mb-3 text-[11px] tracking-wide font-bold text-gray-600">AI 配置</div>
          <button
            onClick={() => setModalOpen(true)}
            className="mx-7 px-3 py-2 rounded-xl bg-lightPrimary flex items-center gap-2 w-[calc(100%-3.5rem)] hover:ring-2 hover:ring-brand/20 transition"
          >
            <I name="key-round" size={16} className="text-brand" />
            <span className="text-sm font-bold text-navy-700">LLM Key</span>
            <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-bold ${chipClass}`}>{chipLabel}</span>
          </button>
        </nav>
      </aside>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="max-w-md">
        <div className="p-7">
          <div className="flex items-center justify-between mb-5">
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
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-lightPrimary rounded-xl">
                  <p className="text-xs text-gray-700">服务商</p>
                  <p className="font-bold text-navy-700 mt-1">{PROVIDER_LABELS[llm.provider] || llm.provider || "—"}</p>
                </div>
                <div className="p-3 bg-lightPrimary rounded-xl">
                  <p className="text-xs text-gray-700">模型</p>
                  <p className="font-bold text-navy-700 mt-1 text-xs">{llm.model || "—"}</p>
                </div>
                <div className="p-3 bg-lightPrimary rounded-xl">
                  <p className="text-xs text-gray-700">模式</p>
                  <p className="font-bold text-navy-700 mt-1">{llm.mode === "system" ? "系统统一" : "用户自带"}</p>
                </div>
                <div className="p-3 bg-lightPrimary rounded-xl">
                  <p className="text-xs text-gray-700">状态</p>
                  <p className={`font-bold mt-1 ${ready ? "text-green-600" : "text-amber-600"}`}>
                    {ready ? "✓ 已就绪" : "○ 待配置"}
                  </p>
                </div>
              </div>

              {ready ? (
                <div className="p-3 rounded-xl bg-green-50 border border-green-100 text-xs text-green-800">
                  <p className="font-bold mb-1 flex items-center gap-1.5">
                    <I name="check-circle-2" size={14} /> 系统已配置 Kimi API Key
                  </p>
                  <p>所有用户共享 — 在「简历收件箱」上传即可触发 AI 解析。Key 由运维持有,本 UI 不显示具体值。</p>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-800">
                  <p className="font-bold mb-1 flex items-center gap-1.5">
                    <I name="alert-triangle" size={14} /> Key 未配置
                  </p>
                  <p>简历上传仍可入库,但不会触发 AI 字段抽取。请联系运维在 VPS <code className="font-mono">.env</code> 写入 <code className="font-mono">KIMI_API_KEY</code> 后重启 backend。</p>
                </div>
              )}

              <div className="text-xs text-gray-600 pt-2 border-t border-gray-200">
                <p className="mb-1.5"><strong>未来扩展</strong> — 多租户场景下,每个用户可在此处填自己的 Key 覆盖系统 Key:</p>
                <ul className="list-disc list-inside space-y-0.5 text-gray-500">
                  <li>用户级 Key 加密存于 DB,前端不回显明文</li>
                  <li>解析请求按当前用户路由到对应 Key</li>
                  <li>系统 Key 始终作为 fallback</li>
                </ul>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => setModalOpen(false)}>关闭</Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
