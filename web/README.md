# MESA Web (Stage ①)

Vite + React 18 + Tailwind 生产前端骨架,对应 demo.md 阶段①「本地全栈闭环」。

> ⚠️ 这是「**生产前端**」目录,与 `ui_kits/mesa-recruit/`(无构建 UI Kit demo)是**两套独立的代码**。
> - `ui_kits/mesa-recruit/` 继续作为设计参考与点击通 demo,保持「无构建」(AGENTS.md §2)。
> - `web/` 用 Vite 构建,承接 SaaS 演进路径,逐步把 UI Kit 里的组件移植过来。

## 启动

```bash
# 先确保后端在跑(参见 ../server/README.md)

cd web
npm install
npm run dev
# → http://localhost:5173
```

Vite dev server 默认配置 proxy:`/api/*` 自动转发到 `http://127.0.0.1:3001`(避开 CORS,生产由 Nginx location /api/ 接管,语义一致)。

## 当前页面

| Path | 功能 |
|------|------|
| `/login` | 邮箱密码登录,签发 JWT 存 localStorage |
| `/candidates` | 候选人列表 / 搜索 / 新建 / 删除(端到端 CRUD 闭环) |
| `/` 或其他 | 自动重定向到 `/candidates`(经 AuthGuard 检查) |

## 路由守卫(demo.md 1.1.3)

`src/components/AuthGuard.jsx` 在每次进入受保护路由时检查 localStorage 里的 token;无 token 一律 `<Navigate to="/login" />` 并记下原路径,登录后跳回。

## Axios 拦截器(demo.md 1.1.2)

`src/lib/api.js`:
- **请求拦截器**:有 token 时自动附 `Authorization: Bearer <token>`。
- **响应拦截器**:`401` 自动 `clearAuth()` 并触发全局重定向到 `/login`(由 `App.jsx` 注册的 `setUnauthorizedHandler` 实现)。
