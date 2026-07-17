# MESA Web

Vite + React 18 + Tailwind 生产前端。设计令牌见 `tailwind.config.js` / `src/index.css`。完整页面与权限见 `delivery-docs` 与 `CLAUDE.md`。

## 启动

```bash
# 先确保后端在跑(参见 ../server/README.md)

cd web
npm install
npm run dev
# → http://localhost:5173
```

Vite 默认 proxy:`/api/*` → `http://127.0.0.1:3001`。多 worktree 用 `web/.env` 的 `VITE_DEV_PORT` / `VITE_API_PORT`。

## 主要路由

| Path | 功能 |
|------|------|
| `/login` | 登录(记住账号 / MFA 等) |
| `/dashboard` | 概览 |
| `/candidates` `/candidates/:id` | 候选人列表 / V2 三列详情 |
| `/upload` | 简历上传 V3 + 公开上传链接 |
| `/jobs` `/departments` | 岗位 / 组织架构 |
| `/staff` `/staff/:id` | 现有人员 · 详情三列响应式 |
| `/newhire` `/newhire/:id` | 入职管理(共用 EmployeeDetail) |
| `/interviews` | 面试安排 |
| `/performance` | **员工绩效评价**管理 |
| `/reports` | 数据报表 |
| `/share-settings` `/users` `/audit` | 分享策略 / 用户权限 / 审计 |
| `/share/:token` | 公开候选人简报(AuthGuard 外) |
| `/upload/:token` | 公开上传(AuthGuard 外) |
| `/interview-eval/:token` | 公开面试评价(AuthGuard 外) |
| `/performance-eval/:token` | 公开绩效评价 + 访问密钥门禁(AuthGuard 外) |

## 认证

- `AuthGuard` + `RequirePermission`(pageKey)
- Axios:`src/lib/api.js` — 401 清登录跳 `/login`;**绩效公开**的 `access_key_*` 401 **不**触发跳登录
