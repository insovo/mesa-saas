// MESA Recruit · 受保护的主框架
// 桌面: Sidebar (可收起) + Topbar + 内容
// 移动: 汉堡按钮 + 抽屉 Sidebar

import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar, { COLLAPSED_KEY } from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";
import { I, ToastHost } from "./Primitives.jsx";
import { getUser } from "../lib/auth.js";

export default function Layout() {
  const user = getUser();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === "1");

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
  }

  // 路由切换时关闭移动抽屉
  useEffect(() => {
    setMobileOpen(false);
  }, [/* TODO: location pathname 触发,react-router 内部处理 */]);

  return (
    <div className="flex min-h-screen bg-lightPrimary">
      <Sidebar
        user={user}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        {/* 移动端汉堡 */}
        <button
          onClick={() => setMobileOpen(true)}
          className="md:hidden fixed top-4 left-4 z-30 w-10 h-10 rounded-full bg-white shadow-card flex items-center justify-center text-navy-700"
          aria-label="打开菜单"
        >
          <I name="menu" size={20} />
        </button>

        <Topbar />
        <main className="flex-1 px-4 md:px-8 pb-10">
          <Outlet />
        </main>
      </div>
      <ToastHost />
    </div>
  );
}
