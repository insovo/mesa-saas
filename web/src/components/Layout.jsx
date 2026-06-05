// MESA Recruit · 受保护的主框架
// 桌面: Sidebar (可收起) + Topbar + 内容
// 移动: 汉堡按钮 + 抽屉 Sidebar

import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar, { COLLAPSED_KEY } from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";
import { I, ToastHost } from "./Primitives.jsx";
import { getUser } from "../lib/auth.js";

export default function Layout() {
  const user = getUser();
  const location = useLocation();
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
  }, [location.pathname]);

  // 候选人详情页 /candidates/<id>(列表页 /candidates 不算)
  const isCandidateDetail = /^\/candidates\/[^/]+/.test(location.pathname);
  // collapsed 的实时镜像 — 让自动收起 effect 只依赖路由、不因 collapsed 变化重跑(否则在详情页手动展开会被立刻又收起)
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;
  // 标记「这次收起是自动触发的」,离开详情页时才据此恢复
  const autoCollapsedRef = useRef(false);

  // 桌面端进候选人详情自动收起左侧导航(给三列详情腾空间),离开时恢复;
  // 用 setCollapsed(不走 toggleCollapsed)→ 不写 localStorage、不污染用户持久化偏好。
  // 移动端侧栏是抽屉(collapsed 不影响),此逻辑只在桌面产生视觉效果。
  useEffect(() => {
    if (isCandidateDetail) {
      if (!collapsedRef.current) {
        autoCollapsedRef.current = true;
        setCollapsed(true);
      }
    } else if (autoCollapsedRef.current) {
      autoCollapsedRef.current = false;
      setCollapsed(false);
    }
  }, [isCandidateDetail]);

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
