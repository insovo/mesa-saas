// MESA Recruit · 受保护的主框架
// 在 AuthGuard 内,提供 Sidebar + Topbar + 内容区。

import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";
import { ToastHost } from "./Primitives.jsx";
import { getUser } from "../lib/auth.js";

export default function Layout() {
  const user = getUser();
  return (
    <div className="flex min-h-screen bg-lightPrimary">
      <Sidebar user={user} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar />
        <main className="flex-1 px-8 pb-10">
          <Outlet />
        </main>
      </div>
      <ToastHost />
    </div>
  );
}
