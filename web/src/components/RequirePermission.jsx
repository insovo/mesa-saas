// 路由级权限守卫 — 包在 RouteElement 外,登录 + 权限校验
//
// 用法:
//   <Route element={<RequirePermission pageKey="users" />}>
//     <Route path="/users" element={<Users />} />
//   </Route>
//
// me === undefined → 显示 loading
// me === null      → 通常已被 AuthGuard 接住,这里再兜底跳 /login
// me 没权限         → 渲染 <Forbidden />

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useMe } from "../lib/authContext.jsx";
import { hasPage, isAdmin } from "../lib/permissions.js";
import Forbidden from "../pages/Forbidden.jsx";

export default function RequirePermission({ pageKey, adminOnly = false, children }) {
  const me = useMe();
  const location = useLocation();

  // 加载中
  if (me === undefined) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-gray-700 text-sm">
        加载权限中…
      </div>
    );
  }

  if (!me) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (adminOnly && !isAdmin(me)) {
    return <Forbidden />;
  }

  if (pageKey && !hasPage(me, pageKey)) {
    return <Forbidden />;
  }

  return children ?? <Outlet />;
}
