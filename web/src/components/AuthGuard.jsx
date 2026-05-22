import { Navigate, useLocation } from "react-router-dom";
import { isAuthenticated } from "../lib/auth.js";

// 路由守卫 — demo.md 1.1.3
// 未登录访问受保护路由 → 强制重定向到 /login,记录原 path,登录后跳回
export default function AuthGuard({ children }) {
  const location = useLocation();
  if (!isAuthenticated()) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return children;
}
