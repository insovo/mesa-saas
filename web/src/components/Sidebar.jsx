// MESA Recruit · 左侧导航
// 迁自 ui_kits/mesa-recruit/Sidebar.jsx,改用 react-router 的 NavLink。

import { NavLink, useLocation } from "react-router-dom";
import { I } from "./Primitives.jsx";

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

export default function Sidebar({ user }) {
  const location = useLocation();
  const isAdmin = user?.role === "ADMIN";
  const items = ITEMS.filter((it) => !it.adminOnly || isAdmin);
  return (
    <aside className="w-[268px] bg-white shrink-0 min-h-screen flex flex-col pb-8 shadow-sidebar">
      <div className="mx-[40px] mt-[44px] flex items-center">
        <span
          className="text-[24px] uppercase text-navy-700 tracking-tight"
          style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700 }}
        >
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
                <NavLink
                  to={it.to}
                  className="my-[3px] flex w-full items-center px-9 py-2 text-left"
                >
                  <span
                    className="flex items-center justify-center"
                    style={{ width: 22, height: 22, color: isActive ? "#422AFB" : "#A3AED0" }}
                  >
                    <I name={it.icon} size={20} strokeWidth={isActive ? 2.4 : 2} />
                  </span>
                  <span
                    className={`ml-4 text-sm ${isActive ? "font-bold text-navy-700" : "font-medium text-gray-700"}`}
                  >
                    {it.label}
                  </span>
                </NavLink>
                {isActive && (
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 h-9 w-1 rounded-l-lg bg-brand"></div>
                )}
                {it.adminOnly && (
                  <span
                    className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-5 h-5 rounded-md bg-brand-50 text-brand"
                    title="仅管理员可见"
                  >
                    <I name="shield-check" size={10} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-7 mx-9 h-px bg-gray-200"></div>
        <div className="px-9 mt-5 mb-3 text-[11px] tracking-wide font-bold text-gray-600">AI 配置</div>
        <div className="mx-7 px-3 py-2 rounded-xl bg-lightPrimary flex items-center gap-2">
          <I name="key-round" size={16} className="text-brand" />
          <span className="text-sm font-bold text-navy-700">自带 Key</span>
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">
            待配置
          </span>
        </div>
      </nav>
    </aside>
  );
}
