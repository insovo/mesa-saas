// MESA Recruit · 顶栏
// 面包屑路径标题 + 全局搜索 + 用户下拉

import { useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { I, Avatar } from "./Primitives.jsx";
import { clearAuth, getUser } from "../lib/auth.js";

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
};

function pageTitleFor(pathname) {
  for (const [prefix, title] of Object.entries(PAGE_TITLES)) {
    if (pathname.startsWith(prefix)) return title;
  }
  return "MESA Recruit";
}

export default function Topbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = getUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function onLogout() {
    clearAuth();
    navigate("/login", { replace: true });
  }

  const title = pageTitleFor(location.pathname);

  return (
    <header className="sticky top-0 z-30 bg-lightPrimary/80 backdrop-blur-sm">
      <div className="flex items-center gap-4 px-8 pt-7 pb-5">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-700">MESA Recruit · 招聘工作台</p>
          <h1 className="title-page mt-1">{title}</h1>
        </div>

        <div className="hidden md:flex items-center bg-white rounded-full shadow-card pl-5 pr-2 h-[60px] w-[420px]">
          <I name="search" size={18} className="text-gray-400 shrink-0" />
          <input
            placeholder="搜索候选人 / 岗位 / 部门..."
            className="flex-1 ml-3 bg-transparent outline-none text-sm text-navy-700 placeholder:text-gray-400"
          />
        </div>

        <div className="flex items-center gap-3">
          <button className="w-11 h-11 rounded-full bg-white shadow-card flex items-center justify-center text-gray-700 hover:text-brand transition">
            <I name="bell" size={18} />
          </button>
          <button className="w-11 h-11 rounded-full bg-white shadow-card flex items-center justify-center text-gray-700 hover:text-brand transition">
            <I name="moon" size={18} />
          </button>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-3 pl-1 pr-3 h-11 rounded-full bg-white shadow-card hover:shadow-md transition"
            >
              <Avatar name={user?.name || user?.email || "U"} size={36} />
              <div className="text-left hidden sm:block">
                <p className="text-xs font-medium text-gray-700 leading-tight">已登录</p>
                <p className="text-sm font-bold text-navy-700 leading-tight">{user?.name || user?.email}</p>
              </div>
              <I name="chevron-down" size={14} className="text-gray-400" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-12 w-64 rounded-card bg-white shadow-card overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200">
                  <p className="text-sm font-bold text-navy-700 truncate">{user?.name || "MESA 用户"}</p>
                  <p className="text-xs text-gray-700 truncate mt-0.5">{user?.email}</p>
                  <span className="inline-block mt-2 px-2 py-0.5 rounded-full bg-brand-50 text-brand text-[10px] font-bold">
                    {user?.role}
                  </span>
                </div>
                <button
                  onClick={onLogout}
                  className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2"
                >
                  <I name="log-out" size={16} />
                  退出登录
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
