# CLAUDE.md — MESA Recruit

> AI 协作守则与项目级指令(对 **Claude Code / Codex CLI / Cursor** 共同生效)。
> 用户的全局偏好(沟通语言、称呼、Priority Order 等)以 `~/.claude/CLAUDE.md` 为准,本文件不重复。
> 完整架构 / API / 部署 / 运维手册在 [`delivery-docs/`](./delivery-docs) 的 4 份 .docx 里。

---

## 1. 项目现状(一句话)

**MESA Recruit · 已上线 SaaS**:
- 站点 **https://insovo.top** + 监控 **https://monitor.insovo.top**
- 香港 VPS `114.134.188.7` (4 核 8G,Ubuntu 22.04) · Docker Compose 编排 5 容器
- 前后端 + 数据库 + 缓存 + 监控全栈生产化
- GitHub Actions 自动 build → GHCR → SSH 滚动部署(1-2 分钟)
- 每日 03:00 UTC `systemd timer` 自动 PG 全量备份 → Cloudflare R2

---

## 2. 技术栈与运行形态

| 维度 | 当前生产形态 |
|------|-------------|
| 前端(生产) | `web/` — Vite 5 + React 18 + Tailwind 3 + react-router 6 |
| 前端(设计沙箱) | `ui_kits/mesa-recruit/` — React UMD + Babel Standalone + Tailwind Play CDN(**无构建**) |
| 后端 | `server/` — Node 20 + Fastify 4 + Prisma 5 + JWT |
| 数据 | PostgreSQL 16 + Redis 7(均 docker bridge 网内,公网零暴露) |
| 对象存储 | Cloudflare R2(`mesa-resumes` 业务桶 + `mesa-backups` 备份桶,凭证独立) |
| 反向代理 / TLS | 容器内 Nginx 1.27 + Cloudflare Origin Cert(`*.insovo.top` 15 年) |
| 接入层 | Cloudflare DNS + CDN + WAF(SSL Strict + HSTS + 限流) |
| 监控 | Uptime Kuma 容器 → monitor.insovo.top |

---

## 3. 目录结构

```
mesa/
├── server/                    # Fastify + Prisma 后端
│   ├── prisma/                # schema + migrations + seed
│   └── src/                   # plugins/ + routes/ + lib/
├── web/                       # Vite 生产前端
│   ├── src/components/        # Primitives / Sidebar / Topbar / Layout / AuthGuard
│   ├── src/pages/             # 11 个业务页面
│   ├── src/lib/               # api / auth / constants
│   ├── nginx.conf             # 容器内 Nginx 配置(80 跳 443 + 443 主服务 + monitor 子域)
│   └── Dockerfile             # 多阶段 build
├── ui_kits/mesa-recruit/      # 无构建设计沙箱(组件 prototype → 移植到 web/)
├── ops/
│   ├── backup.sh              # pg_dump → R2(由 systemd timer 每日跑)
│   ├── restore.sh             # R2 → pg_restore(灾备恢复)
│   └── runbook_cloudflare_vps.md  # 阶段④ 生产硬化 SOP(checkbox)
├── delivery-docs/             # 4 份正式交付 .docx + src/ markdown 源
├── docker-compose.yml         # 生产 5 容器编排
├── docker-compose.dev.yml     # 本地开发 PG + Redis(仅 127.0.0.1)
├── .github/workflows/         # CI + Deploy 流水线
├── colors_and_type.css        # 设计令牌源(被 ui_kits 引用,web/ 已抽到 index.css + tailwind.config)
├── assets/ + fonts/           # UI Kit 素材
├── .env.example               # 生产环境变量模板(占位 __SET_BY_OPS__)
├── CLAUDE.md                  # 本文件
└── README.md                  # 引导性 README
```

---

## 4. 永不入 Git 清单(重要)

下列任何文件 / 路径 **绝对不允许 push 到 GitHub**,也不允许在 commit message / 注释 / mock 数据里出现真实值:

| 类别 | 文件 | 现存位置 |
|------|------|---------|
| 环境变量 | `.env` / `.env.local` / `.env.*.local` | 仅 VPS `/opt/mesa/.env` + 本地开发机临时 |
| 数据库密码 | `POSTGRES_PASSWORD` (URL 安全 hex 32 字符) | 仅在 VPS `.env`,只能用 `openssl rand -hex` 生成 |
| JWT 密钥 | `JWT_SECRET` (64 字符 hex) | 仅在 VPS `.env`,泄露后所有 token 失效 |
| Cloudflare Origin Cert | `web/certs/*.pem` + `web/certs/*.key` | 仅 VPS `/opt/mesa/web/certs/`(chmod 600) |
| R2 凭证 | `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | 业务凭证在 VPS `.env`;备份凭证在 VPS `~/.aws/credentials` |
| 备份产物 | `*.sql` / `*.sql.gz` / `/var/backups/mesa/` | 仅 VPS,7 天本地保留 + R2 远端 |
| LLM API Key | Kimi / DeepSeek API Key(`Upload.jsx` 自带 Key 入口) | 永远不写示例值,UI 占位为空字符串 |
| 截图 / 临时 | `*.png` / `.playwright-mcp/` / `screenshots/` | 已在 .gitignore,本地随用随删 |
| 构建产物 | `node_modules/` / `dist/` / `.cache/` | 已在 .gitignore |
| 系统 | `.DS_Store` / `Thumbs.db` | 已在 .gitignore |

**安全规则**:
1. AI 修改 `.env.example` 时,所有真实值用 `__SET_BY_OPS__` 占位
2. 用户提供凭证后,**直接 ssh 落地到 VPS**,不在 mac 本地 / git 中转
3. `git diff --cached` 在 commit 前都要检查,若发现敏感字符串(密码 / token / `cfat_` / `-----BEGIN PRIVATE KEY-----`)立即终止
4. 已经误推过的密钥,**必须**立刻在 Cloudflare / GitHub 后台轮换,光删 commit 不够(GitHub history 仍可恢复)

---

## 5. 上手动作(开始任何任务前)

1. 读本文件(CLAUDE.md);
2. 看 `delivery-docs/01_系统架构与网络拓扑设计说明书.docx` 了解整体拓扑;
3. 用 `Read` / `Grep` 摸清相关文件 —— 不要凭印象动手。

---

## 6. 代码约定

### 6.1 后端(`server/`)
- ESM 模块化(`"type": "module"`),路由按资源拆 `src/routes/{auth,candidates,jobs,...}.js`
- 所有路由都用 Fastify schema 校验入参(`body` / `querystring`)
- `:id` 路由支持 UUID 或 externalId,统一走 `src/lib/idLookup.js` 的 `whereByIdOrExternal`
- Prisma 字段命名:数据库列 snake_case,客户端属性 camelCase(已在 schema 用 `@map` 处理)

### 6.2 生产前端(`web/`)
- 设计令牌已固化到 `web/tailwind.config.js` + `src/index.css`
- 业务常量(StatusTone / HireStageToken / etc)在 `src/lib/constants.js`
- 资源 CRUD 走 `src/lib/api.js` 的 `resources.{candidates,jobs,...}.list/detail/create/update/remove`
- 认证拦截器在 `src/lib/api.js`: 401 → 自动 clearAuth + `navigate('/login')`
- Routing: `AuthGuard` 包裹 `Layout`(Sidebar+Topbar+Outlet),所有业务页 lazy mount

### 6.3 UI Kit(`ui_kits/mesa-recruit/`,无构建沙箱)
- ⛔ **不要**引入 npm / vite / 打包器
- ⛔ **不要**把 `.jsx` 改成 ESM `import/export`(挂 `window` 全局命名空间)
- 跨文件通讯只走 `window.{Comp}` 与 `window.MESA_*`
- 修改 `index.html` 时严格按依赖序加 `<script>`:`data.js → Primitives → Sidebar/Topbar → 页面 → App`

### 6.4 UI / Tailwind 风格
- 品牌色 `#422AFB`(primary) / `#3311DB`(hover) / `#2111A5`(active)
- 文本主色 `#1B254B`(navy-700),次级 `#707EAE`,占位 `#A0AEC0`
- 圆角:卡片 `rounded-card`(20px),按钮/输入 `rounded-xl`
- 阴影:卡片统一 `shadow-card`
- 中文 UI 文案,技术术语保留英文(JD / API / CLI / MCP)

---

## 7. 工作流与触发器

### 7.1 改完代码自动上线
```bash
git add . && git commit -m "feat: xxx"
git push origin main
# 1-2 分钟后访问 https://insovo.top 看效果
gh run watch  # 想盯过程的话
```

### 7.2 CI/CD 流水线
- `.github/workflows/ci.yml`:任意 push → install + prisma generate + web build + 镜像 smoke build
- `.github/workflows/deploy.yml`:仅 main push 触发 → GHCR build/push → SSH 滚动部署
- SSH 进 VPS 后会 `git reset --hard origin/main`(保留 untracked `.env` 与 `web/certs/`),`docker login ghcr.io`,`docker compose pull && up -d`,健康检查

### 7.3 关键密钥与开关
| 类型 | 位置 | 值 |
|------|------|----|
| GitHub Secret | `VPS_HOST` | `114.134.188.7` |
| GitHub Secret | `VPS_USER` | `deploy` |
| GitHub Secret | `VPS_SSH_PORT` | `36724`(**VPS 厂商默认非 22**) |
| GitHub Secret | `VPS_SSH_KEY` | mac `~/.ssh/id_ed25519` 私钥 |
| GitHub Secret | `VPS_DEPLOY_DIR` | `/opt/mesa` |
| GitHub Variable | `DEPLOY_ENABLED` | `true`(关掉变 CI-only) |

---

## 8. 实际部署经验教训(踩坑记录)

| 坑 | 现象 | 修复 |
|---|------|------|
| `openssl rand -base64` 含 `/+=` 破坏 DATABASE_URL | Prisma 报 P1000 `mesa:945` 端口解析错 | 改用 `openssl rand -hex` 生成 URL 安全密码 |
| VPS sshd 监听 36724 而非 22 | `Connection timed out during banner exchange` | UFW 必须放行 36724;mac `~/.ssh/config` 设 `Port 36724` |
| docker volume 名跨 compose 共享 | dev 与 prod compose 共享 `mesa_pg_data` 卷,密码冲突 | prod 卷改名 `mesa_pg_prod_data` |
| GHCR 私有镜像 deploy job 无法 pull | `pull access denied for ...` | deploy.yml SSH 时透传 `GITHUB_TOKEN` 临时 `docker login ghcr.io` |
| VPS 上 docker-compose.yml 滞后 | 改了 compose 后部署,VPS 仍跑旧版 | deploy 脚本前置 `git reset --hard origin/main` |
| Cloudflare Full(非 strict) + 源站无 TLS | HTTP 521 web server is down | 源站装 Cloudflare Origin Cert,Nginx 监听 443 |
| crontab 在 docker 环境下踩 PATH 问题 | cron job 启动时 docker 命令找不到 | 改用 systemd timer + service,自带 PATH + journal |

---

## 9. 沟通风格

- 默认中文,专业术语保留英文
- 改动结束输出「**改动文件 + 摘要 + 验证结果 + 风险**」四件套
- 大改动跨阶段前先在回复里写明影响范围 + 回滚路径,等用户「继续」再动手

---

## 10. AI 代理协作差异

| 维度 | Claude Code | Codex CLI | Cursor |
|------|-------------|-----------|--------|
| 浏览器自动化 | Playwright MCP / dev-browser | 通常需用户终端配合 | 取决于配置 |
| 文档查询 | Context7 MCP | WebSearch | 自带 |
| 长任务后台 | `run_in_background` + 事件回灌 | shell `&` + tmux | 受限 |
| 技能 (Skills) | 丰富(`docx` / `pdf` / `pretty-mermaid` / `webapp-testing`) | 无 | 无 |
| 子代理 (Subagents) | `Agent` 工具支持 | 不支持 | 不支持 |

**所有 AI 共同硬约束**:
1. UI 改完必须在浏览器里走一遍点击通(Claude Code 用 Playwright;其他无浏览器时**显式写出**「未验证 + 原因 + 风险」)
2. **不主动** `git commit` / `git push` / 创建 PR / 启动 ultrareview / SSH 到生产 / 改 Cloudflare 配置 —— 全部需用户明确指令
3. 长驻进程后台跑并在交付时说明如何停止
4. 任何凭证 / Token / 密码 / API Key 永远不写入代码 / 注释 / commit message / mock 数据 / 聊天记录持久层
