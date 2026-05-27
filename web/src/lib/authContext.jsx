// 全局 AuthContext — 用 /api/auth/me 加载完整用户信息(含权限)
// 提供 hooks: useMe / useHasPage / useHasModule / useIsAdmin
//
// 设计:
//   - mount 时调一次 fetch();没 token 直接 setMe(null) 不发请求
//   - me === undefined  表示加载中(初始)
//   - me === null       表示未登录 / 加载失败 → 上层 AuthGuard 跳 /login
//   - me === object     表示加载成功
//   - 自助修改头像/昵称后调 refetch() 同步 UI

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api.js";
import { getToken, setAuth, getUser, clearAuth } from "./auth.js";
import { hasPage, hasModule, isAdmin } from "./permissions.js";

const AuthContext = createContext({
  me: undefined,
  refetch: async () => {},
  patchMe: () => {},
  logout: () => {},
});

export function AuthProvider({ children }) {
  const [me, setMe] = useState(undefined);

  const refetch = useCallback(async () => {
    if (!getToken()) {
      setMe(null);
      return null;
    }
    try {
      const { data } = await api.get("/auth/me");
      setMe(data.user || null);
      if (data.user) {
        // 同步 localStorage 缓存(被 Topbar 等同步组件使用)
        setAuth(getToken(), {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: data.user.role,
          avatar: data.user.avatar,
          jobTitle: data.user.jobTitle,
        });
      }
      return data.user || null;
    } catch (err) {
      // 401/403 → 视为未登录(api 拦截器会自动 clearAuth + 跳 /login)
      setMe(null);
      return null;
    }
  }, []);

  // 局部 merge,不发请求(用于自助 PATCH /me 后立即反映 UI)
  const patchMe = useCallback((patch) => {
    setMe((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setMe(null);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return (
    <AuthContext.Provider value={{ me, refetch, patchMe, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useMe() {
  return useContext(AuthContext).me;
}

export function useHasPage(key) {
  const me = useMe();
  return hasPage(me, key);
}

export function useHasModule(key) {
  const me = useMe();
  return hasModule(me, key);
}

export function useIsAdmin() {
  const me = useMe();
  return isAdmin(me);
}
