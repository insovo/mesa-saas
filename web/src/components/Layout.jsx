// MESA Recruit · 受保护的主框架
// 左侧导航 = StaggeredMenu 覆盖式菜单(GSAP staggered 面板,汉堡按钮固定左上角)
// 内容区全宽:Topbar + Outlet

import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import StaggeredMenu, { MENU_PANEL_WIDTH } from "./StaggeredMenu.jsx";
import LlmConfig from "./LlmConfig.jsx";
import Topbar from "./Topbar.jsx";
import { ToastHost } from "./Primitives.jsx";
import { getUser } from "../lib/auth.js";
import { useMe } from "../lib/authContext.jsx";
import { hasPage as canSeePage, isAdmin as checkIsAdmin } from "../lib/permissions.js";
import { NAV_ITEMS } from "../lib/navItems.js";

export default function Layout() {
  const user = getUser();
  const location = useLocation();
  const me = useMe();
  const isAdmin = checkIsAdmin(me) || user?.role === "ADMIN";
  const [menuOpen, setMenuOpen] = useState(false);
  // ≥sm 断点菜单展开时把内容区推开(面板宽度);<sm 面板全屏,推开无意义,保持 overlay
  const isDesktop = typeof window === "undefined" || window.innerWidth > 640;

  const items = NAV_ITEMS.filter((it) => {
    if (it.adminOnly && !isAdmin) return false;
    if (it.pageKey && me) return canSeePage(me, it.pageKey);
    // me 还在加载时,先展示非 adminOnly 项,避免菜单闪烁
    return true;
  });

  return (
    <div className="flex min-h-screen bg-lightPrimary">
      <StaggeredMenu
        items={items}
        footer={<LlmConfig className="w-full" />}
        onMenuOpen={() => setMenuOpen(true)}
        onMenuClose={() => setMenuOpen(false)}
      />

      <div
        className="flex-1 min-w-0 flex flex-col"
        style={{
          paddingLeft: menuOpen && isDesktop ? MENU_PANEL_WIDTH : 0,
          transition: "padding-left 0.65s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <Topbar />
        <main className="flex-1 px-4 md:px-8 pb-10">
          {/* 路由切换时 key 变化 → 重挂载触发淡入,全站统一丝滑入场 */}
          <div key={location.pathname} className="animate-fade-up">
            <Outlet />
          </div>
        </main>
      </div>
      <ToastHost />
    </div>
  );
}
