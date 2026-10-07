# CLAUDE.md — MESA Recruit

> AI 协作守则与项目级指令(对 **Claude Code / Codex CLI / Cursor** 共同生效)。
> 用户的全局偏好(沟通语言、称呼、Priority Order 等)以 `~/.claude/CLAUDE.md` 为准,本文件不重复。
> 完整架构 / API / 部署 / 运维手册见 [`delivery-docs/`](./delivery-docs)(`src/*.md` 源 + 正式 `.docx` 交付件,索引见根 [`README.md`](./README.md#交付文档索引))。

---

## 1. 项目现状(一句话)

**MESA Recruit · 已上线 SaaS**:
- 站点 **https://insovo.top** + 监控 **https://monitor.insovo.top**
- 海外 VPS `103.106.190.191` (4 核 8G,Ubuntu 22.04,sshd **10526**;2026-09-20 自旧机 114.134.188.7 迁移) · Docker Compose 编排 6 容器
- 前后端 + 数据库 + 缓存 + 监控全栈生产化
- GitHub Actions 自动 build → GHCR → SSH 滚动部署(1-2 分钟)
- 每日 03:00 UTC `systemd timer` 自动 PG 全量备份 → Cloudflare R2

### 1.1 已实现核心子系统

各子系统能力与设计细节见 skill `mesa-subsystems`(`.claude/skills/mesa-subsystems/SKILL.md`);改模块时同步更新那里。

---

## 4. 永不入 Git 清单(重要)

下列任何文件 / 路径 **绝对不允许 push 到 GitHub**,也不允许在 commit message / 注释 / mock 数据里出现真实值:

| 类别 | 文件 / 字段 | 现存位置 |
|------|------|---------|
| 环境变量 | `.env` / `.env.local` / `.env.*.local` | 仅 VPS `/opt/mesa/.env` + 本地开发机临时 |
| 数据库密码 | `POSTGRES_PASSWORD` (URL 安全 hex 24 字符) | 仅在 VPS `.env`,只能用 `openssl rand -hex` 生成 |
| JWT 密钥 | `JWT_SECRET` (64 字符 hex) | 仅在 VPS `.env`,泄露后所有 token + AES 加密的 SystemSetting 都失效 |
| Cloudflare Origin Cert | `web/certs/*.pem` + `web/certs/*.key` | 仅 VPS `/opt/mesa/web/certs/`(chmod 600) |
| R2 凭证 | `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | 业务凭证在 VPS `.env`;备份凭证独立在 VPS `~/.aws/credentials` (profile: r2-backup) |
| **Kimi API Key** | `KIMI_API_KEY` (`sk-...` 51 字符) | 仅在 VPS `.env` · admin 也可在 UI 改写到 DB(AES-256-GCM 加密,密钥从 JWT_SECRET HKDF 派生) |
| **TextIn 凭证** | `TEXTIN_APP_ID` / `TEXTIN_SECRET_CODE`(32 位 hex) | 仅 VPS `.env` 或 admin UI 写 DB(AES)· 本地开发机 `server/.env` 临时 |
| **Jev API Key** | `JEV_API_KEY`(`apikey_…` 前缀) | 同上;探活/评估日志永不打印 state(含简历文本) |
| **ShareLink token** | `share_links.token` (32 字符 URL-safe random) | 仅 DB · 公开访问凭证,泄露 = 候选人简报可被任意人看 |
| **绩效访问密钥明文 / enc** | create·bulk·ensure·preview·export 返回的明文;`self/managerAccessKeyEnc` | 仅内存/管理员会话 · DB 仅 hash+enc · Excel 导出物高敏勿入库 |
| **绩效公开 token** | `performance_evaluations.self_token` / `manager_token` | 仅 DB · 泄露=可尝试访问评价页(仍需访问密钥) |
| **绩效签字 R2** | `performance-signatures/**` | key 不可猜,分享时注意 |
| **Review attachments** | R2 key `reviews/public/<uuid>.*` | 公开访客上传的图片/文件路径,key 不可猜,但分享给三方时注意 |
| 备份产物 | `*.sql` / `*.sql.gz` / `/var/backups/mesa/` | 仅 VPS,7 天本地保留 + R2 远端 |
| LLM API Key | Kimi / DeepSeek API Key 字面值 | **永远不写示例值**(注释里也不行)— Upload.jsx UI 占位为空字符串 |
| 截图 / 临时 | `*.png` / `.playwright-mcp/` / `screenshots/` | 已在 .gitignore,本地随用随删 |
| 构建产物 | `node_modules/` / `dist/` / `.cache/` | 已在 .gitignore |
| 系统 | `.DS_Store` / `Thumbs.db` | 已在 .gitignore |

**安全规则**:
1. AI 修改 `.env.example` 时,所有真实值用 `__SET_BY_OPS__` 占位
2. 用户提供凭证后,**直接 ssh 落地到 VPS**,不在 mac 本地 / git 中转(用 stdin pipe 避免命令行参数被 ps aux 看到)
3. `git diff --cached` 在 commit 前都要检查,若发现敏感字符串(密码 / token / `cfat_` / `sk-` / `-----BEGIN PRIVATE KEY-----`)立即终止
4. 已经误推过的密钥,**必须**立刻在 Cloudflare / Moonshot / GitHub 后台轮换,光删 commit 不够(GitHub history 仍可恢复)
5. **AES 派生**:加密 SystemSetting.value **与**绩效 `*AccessKeyEnc` 用同一 `HKDF(JWT_SECRET, salt="mesa.settings.v1") → AES-256-GCM`。轮换 `JWT_SECRET` 后 setting 与密钥回显均解不开(公开 bcrypt 校验仍可用)— 轮换前备份/导出,改后重写 Kimi key 并刷新绩效密钥。详见 `delivery-docs/src/04_ops.md` §9.6。
6. **改 .env 不会自动重启**:`docker compose restart` 不重读 .env,必须 `docker compose up -d --force-recreate backend`

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

### 6.3 UI / Tailwind 风格
- 品牌色 `#422AFB`(primary) / `#3311DB`(hover) / `#2111A5`(active)
- 文本主色 `#1B254B`(navy-700),次级 `#707EAE`,占位 `#A0AEC0`
- 圆角:卡片 `rounded-card`(20px),按钮/输入 `rounded-xl`
- 阴影:卡片统一 `shadow-card`
- 中文 UI 文案,技术术语保留英文(JD / API / CLI / MCP)
- **必填项 `*` 统一红色**:所有必填 label 用 `<RequiredMark />`(`Primitives.jsx`)渲染红 `*`,或在 `Input` 组件传 `required` prop 自动渲染。**禁止**手写 `" *"` 字符串(无颜色控制 + 易遗漏)
- **多选/多标签输入**:当前 `PublicInterviewEval.jsx` 内 `Combobox` 局部组件实现 chip-style 多选(已选项作 chip 显示在 input 内 + × 移除 + 自由输入 + 分组下拉 + Enter 加自定义 + Backspace 删最后)。若其他页面要复用(多 tag / 多技能 / 多语言),上抽到 `Primitives.jsx`
- **图表**:统一用 **shadcn/ui charts**(<https://ui.shadcn.com/charts>,底层即 `recharts`,与现有 Reports 页一致)。**不引入其他图表库**(echarts / chart.js / d3 直绘等),保持依赖单一 + 主题统一
- **动画**:统一用 **GSAP**(`gsap` + `@gsap/react` 的 `useGSAP`,现有 Sidebar / Reports / OrgChartTree 已用),并遵守 `prefers-reduced-motion`(参照 `Reports.jsx` 的 `ensureMotionPref`)。**不引入其他动画库**(framer-motion 等)
- **评分拖条 / Codex 填充气泡**:面试评价与绩效评价公开页共用模式(细步进拖动 + 整数落盘 + 拇指内缩对齐 + `ScoreFillBubbles`)。完整配方、踩坑与跨项目迁移清单见 [`delivery-docs/dev-plans/评分拖条与填充气泡交互规范.md`](./delivery-docs/dev-plans/评分拖条与填充气泡交互规范.md)；实现入口 `web/src/components/ScoreFillBubbles.jsx`

---

## 7. 工作流与触发器

### 7.0 Worktree 隔离工作区(硬约定)

- 隔离工作区只允许放 `.worktrees/<feature|fix|hotfix|chore|docs>/<任务名>`,**禁止** `.claude/worktrees/`
- 一律基于 `origin/main` 新建(`-b <name> origin/main`),合并后立即 `git worktree remove` + `git branch -d`
- 每个 worktree 必须在 `.worktree-ports.json` 登记独立端口 slot(禁止跳过登记或共用 slot)
- 完整 8 步新建流程 / 删除流程 / 端口公式见 skill `worktree`

### 7.1 改完代码自动上线 — **必须走 PR 流程**(main 已加 branch protection)
```bash
# 1) 在 feature/<task> worktree 内 commit + push 分支
git add . && git commit -m "feat(scope): xxx"
git push -u origin feature/<task>

# 2) 创建 PR(CI 必须过 3 个 status check: server install / web build / docker smoke)
gh pr create --base main --head feature/<task> --title "..." --body "..."
gh pr checks <pr-num> --watch        # 等 CI 通过 (~30-90s)

# 3) merge → 自动触发 deploy.yml
gh pr merge <pr-num> --merge --admin  # admin 跳过 review 要求,适合单人项目
# 1-2 分钟后访问 https://insovo.top 看效果

# 直接 push origin main 会被拒:
#   remote: error: GH013: 3 of 3 required status checks are expected
```

### 7.2 CI/CD 流水线
- `.github/workflows/ci.yml`:任意 push / PR → install + prisma generate + web build + 镜像 smoke build(3 个 status check 即来自这里)
- `.github/workflows/deploy.yml`:仅 main push 触发 → GHCR build/push → SSH 滚动部署
- SSH 进 VPS 后会 `git reset --hard origin/main`(保留 untracked `.env` 与 `web/certs/`),`docker login ghcr.io`,`docker compose pull backend frontend || true`(只拉 GHCR 镜像,docker.io 抖动不 abort),`docker compose up -d --remove-orphans --pull missing`(本地有缓存的 redis/postgres/uptime-kuma 不重拉),健康检查

### 7.3 关键密钥与开关
| 类型 | 位置 | 值 |
|------|------|----|
| GitHub Secret | `VPS_HOST` | `103.106.190.191`(2026-09-20 起;旧 114.134.188.7 已下线)|
| GitHub Secret | `VPS_USER` | `deploy` |
| GitHub Secret | `VPS_SSH_PORT` | `10526`(**VPS 厂商默认非 22**;旧机为 36724)|
| GitHub Secret | `VPS_SSH_KEY` | mac `~/.ssh/id_ed25519` 私钥 |
| GitHub Secret | `VPS_DEPLOY_DIR` | `/opt/mesa` |
| GitHub Variable | `DEPLOY_ENABLED` | `true`(关掉变 CI-only) |

---

## 8. 实际部署经验教训(踩坑记录)

| # | 坑 | 现象 | 修复 |
|---|---|------|------|
| 1 | `openssl rand -base64` 含 `/+=` 破坏 DATABASE_URL | Prisma 报 P1000 `mesa:945` 端口解析错 | 改用 `openssl rand -hex` 生成 URL 安全密码 |
| 2 | VPS sshd 监听 36724 而非 22 | `Connection timed out during banner exchange` | UFW 必须放行 36724;mac `~/.ssh/config` 设 `Port 36724` |
| 3 | docker volume 名跨 compose 共享 | dev 与 prod compose 共享 `mesa_pg_data` 卷,密码冲突 | prod 卷改名 `mesa_pg_prod_data` |
| 4 | GHCR 私有镜像 deploy job 无法 pull | `pull access denied for ...` | deploy.yml SSH 时透传 `GITHUB_TOKEN` 临时 `docker login ghcr.io` |
| 5 | VPS 上 docker-compose.yml 滞后 | 改了 compose 后部署,VPS 仍跑旧版 | deploy 脚本前置 `git reset --hard origin/main` |
| 6 | Cloudflare Full(非 strict) + 源站无 TLS | HTTP 521 web server is down | 源站装 Cloudflare Origin Cert,Nginx 监听 443 |
| 7 | crontab 在 docker 环境下踩 PATH 问题 | cron job 启动时 docker 命令找不到 | 改用 systemd timer + service,自带 PATH + journal |
| 8 | `docker compose restart` 不重读 .env | 改了 .env 里 key,容器内 env 还是旧的 | 必须 `docker compose up -d --force-recreate <service>` |
| 9 | axios 全局 `timeout: 15000` 误杀 Kimi 解析 | 简历上传"看起来失败",候选人字段空 | 长任务用 `{ timeout: LONG_TIMEOUT(120s) }` 单独覆盖;后端 Kimi 解析实测 10-30s |
| 10 | Tailwind `Card` 默认 `flex flex-col` | 在外层加 `flex items-center` 居然变成"垂直堆叠居中" | 用 `!flex-row` 强制覆盖 |
| 11 | LLM 输出空泛"可能具备/可能有助于" | 亮点看着没意义 | prompt 加硬性"禁用推测词、找不到强匹配点就写未发现",温度调低 0.1-0.2 |
| 12 | Prisma `update` 中只在 `||` 时回填 | 切 JD 后 `appliedFor` 没改 → 头部和 risks/highlights 不一致 | 强制覆盖,不要 `value \|\| oldValue` |
| 13 | Modal 用 IIFE 包了 derived 表达式 | 编译报 unclosed JSX | 闭合 `})()` 别漏 |
| 14 | mac 配 `~/.ssh/config` 但用户名命令行覆盖 | `ssh deploy@host` 找不到 user-config 里的 port | mac config 写 `User deploy` 后直接 `ssh host` |
| 15 | UFW enable 前没放当前 SSH 端口 | enable 一瞬间被锁出 | 顺序:`ufw allow <ssh-port>` → `ufw enable` |
| 16 | 注释里的"示例 API key"误推 | Push Protection 没拦 `sk-` | 任何示例都用 `sk-XXX...`,grep 命中**立即终止**(不判断是否注释) |
| 17 | localStorage 存的 token 不是后端最新 | admin 改了密码后客户端还能用旧 token 一段时间 | JWT 过期才会真失效(7d);敏感操作做 server-side 当前用户校验 |
| 18 | 浏览器 `Notification.requestPermission()` 必须用户交互后调 | 自动调被 silently 拒 | 在用户进入候选人详情后被动调用,初始 `Notification.permission === "default"` 时才 request |
| 19 | kimi-k2.5 等推理模型只接受 `temperature=1` | `chat/completions 400: invalid temperature` | 全部删 temperature 参数,用 model 默认值,兼容推理/非推理模型 |
| 20 | Cloudflare Free/Pro plan origin response **100s 硬上限** | LLM 慢请求 >100s → CF 替换 origin 5xx 为自己的 HTML 错误页 | reparse 这种长任务**异步化**(立即返回 taskId,前端 2s 轮询);backend 错误码 5xx → 4xx(422/408/424)让 CF 透传 JSON body |
| 21 | LLM 输出 JSON 不稳定(中文全角 `，：` / unescaped newline / trailing comma) | `JSON.parse Expected ',' or ']' at position N` | 4 层 fallback:直接 parse → 手写 sanitize(全角符号 / fence)→ `jsonrepair` 库 → throw 带 snippet。parseResume 失败再 retry 1 次整 Kimi 调用 |
| 22 | Kimi `engine_overloaded` 429 间歇失败 | reparse 偶尔失败,实际是 Kimi 服务侧过载 | `kimiRequest` 内 429/5xx 自动指数 backoff retry(1.5s → 3.6s → 8.6s,最多 3 次) |
| 23 | 简历解析推理模型(k2.5)长上下文 >90s 必超时 | 简历解析这种「长输入抽取式」根本不需要 reasoning | `pickParseModel` fallback:admin 若选 kimi-k* / *-thinking / *-reasoner,parseResume 强制改 moonshot-v1-32k(non-reasoning,10-20s) |
| 24 | Node `fetch` 默认无 timeout | Kimi 卡死时 backend 一直挂等 nginx 180s 超时 | `kimiRequest` 加 `AbortController`:chat 90s / files 60s,backend 抢先 abort 返回结构化 4xx error |
| 25 | CDN/浏览器缓存 `index.html` 导致用户长时间看旧 bundle | 部署完后前端仍引用过期 chunk hash | nginx `location = /index.html { Cache-Control: no-cache, no-store, must-revalidate }`;静态 chunk 因有 contenthash 仍可长缓存 |
| 26 | error toast 3.5s 自动消失 | 用户来不及复制错误信息发开发 | error 类型不自动 dismiss + 加 ✕ 关闭按钮 + 完整 task.error 自动 `navigator.clipboard.writeText` + `console.error` 完整对象 |
| 27 | nginx `proxy_read_timeout 60s` 短于后端长任务 | Kimi 慢请求被 nginx 先掐 502 | `/api/` location 改 `proxy_read_timeout 180s` + `proxy_send_timeout 180s`(给 backend `LONG_TIMEOUT=120s` 留缓冲) |
| 28 | schema 字段类型变更后 SharedCandidate 没同步兼容 | `c.skills.map is not a function` → 公开页**整页白屏** | 共享页面 + admin 页面同时改 + 抽公共渲染组件(MarkdownBullets);schema 改 array→text 时 e2e 必须覆盖两套渲染入口 |
| 29 | VPS 到 docker.io 网络抖动 | `Image redis:7-alpine ... dial tcp 199.59.150.49:443: i/o timeout` 整个 deploy abort | deploy 脚本 `docker compose pull backend frontend \|\| true`(只拉 GHCR 镜像);`docker compose up -d --pull missing` 让 redis/pg/uptime-kuma 已缓存就不重拉 |
| 30 | Prisma `ALTER COLUMN TYPE` 不能跨 jsonb/text[] → text 自动转 | `prisma migrate dev --create-only` 生成 ALTER 没 USING 子句直接跑会失败 | 手写 migration.sql:加临时列 + 用 `string_agg(jsonb_array_elements(...))` 转 markdown + DROP 老列 + RENAME 新列;放在 BEGIN/COMMIT 事务内可回滚 |
| 31 | main 加了 branch protection (3 status check 必过) | `git push origin main` 直接被拒 GH013 | 必须走 `gh pr create` → CI pass → `gh pr merge --admin`。本地 main ahead origin 也 push 不动,先 push feature 分支再 PR |
| 32 | docs.io 等基础镜像 tag 固定时无需重拉 | 之前 `docker compose pull` 把所有 service 镜像都拉一遍,放大网络抖动影响面 | compose 用 `image: postgres:16-alpine` 这种固定 minor 的不会变,只对 GHCR 项目镜像必须重拉。see #29 修复 |
| 33 | `.doc`(老 Word 二进制)Kimi 解析常 >90s,backend AbortController 抢先 abort 返回 408 `kimi_timeout` | 同步 POST /resumes/parse 受 chat 90s + nginx 180s + Cloudflare 100s 三重时间约束,`.doc` 简历内容多时极易触顶 | **新建上传也异步任务化**(reparse 同款模式):POST /parse 收 key 立即创建 task → setImmediate(runParseAndCreate) → 202 返回 taskId;前端 2s 轮询 `/parse-tasks/:taskId` 直到 done/failed。Kimi 跑多久都不阻塞 HTTP。详见 `server/src/routes/resumes.js` runParseAndCreate + `web/src/pages/Upload.jsx` pollParseTask |
| 34 | reparse 触发后切走页面,切回来按钮显示"解析"(状态丢失,用户以为没解析) | reparsingIds Set 是 component-local state,unmount 丢失;setTimeout 在 unmounted 后 setState 是 noop | **sessionStorage 持久化** `mesa.upload.reparsing.v1` 形如 `{[candidateId]:{taskId,startedAt}}`;mount 时对每个未超时(<5min)的 entry 调 `pollReparseTask` 恢复轮询;done/failed → 清条目 + refetch。同时"我接收到的简历"列表用 `mesa.upload.parsed.v1` 持久化 |
| 35 | 列表 li 内 LiquidLoader + AiBadge + StatusPill 重叠 / 不对齐 | flex-col + 限宽 w-20 包 Badge → 130px AiBadge 溢出叠到 LiquidLoader;flex-wrap lg:flex-nowrap 在某些场景仍 wrap | 三页(Upload/Candidates/Dashboard)li 改 flat 水平布局:checkbox/avatar/info/select-JD/select-Dept/解析按钮/LiquidLoader/Badge/StatusPill/time 全部 inline,统一 items-center,去掉 flex-wrap,去掉限宽 stack,所有右侧元素 shrink-0 自然宽度 |
| 36 | `.doc` 等格式 Kimi 解析失败时,公开链接收到的简历 candidate 进不来 admin 列表 | 公开 candidate.ownerId 必须 = link.createdBy(归属链接创建者)+ `candidates list` 没有 owner filter,前端 Upload 拉所有候选人会污染数据 | candidates list 加 `ownerId=me` filter(`/api/candidates?ownerId=me&orderBy=createdAt`);后端 `where.ownerId = req.user.sub` 解析"me";前端 Upload 页 mount + 上传完成 + 手动点"刷新" 调 refetchOwned |
| 37 | deploy.yml 用 `docker compose pull backend frontend \|\| true` + `docker compose up --pull missing`,GHCR token 偶发 unauthorized 时 pull 被 silently 吞,up 看到本地 image 存在又不重拉 → 容器跑着上一版镜像 | 看似部署成功但前端老代码,Topbar 没新菜单 / 登录页没"忘记密码"等。frontend 容器 `Up 2 hours` 露馅,本地 build 后才更新 | deploy 脚本改成**逐个 pull,失败显式 fallback 到 `docker compose build`**,慢 2-3min 但保证一定是当前 commit 的源码。see `.github/workflows/deploy.yml` need_build 块 |
| 38 | 新增非 `src/` 静态资源目录(如 `server/assets/templates/*.xlsx`)忘了在 Dockerfile 多阶段 runtime stage `COPY`,本地 dev 跑通但容器内文件缺失 → backend boot fatal | PR #33 合 main 触发 deploy 后 mesa-server `Error: interview eval template missing: /app/assets/templates/interview-evaluation-v1.xlsx`,`is unhealthy` 整个 stack 起不来。本地 `npm run dev` 直接读源码所以无感知 | Dockerfile runtime stage 加 `COPY assets ./assets`(see hotfix PR #34)。**通用约定**:新增 `server/<dir>/` 顶层目录若被运行时读取,必须同步 `COPY <dir> ./<dir>`;只在 build 期读取的不算。CI 应该 catch — `docker · multi-stage smoke build` 当前只验证镜像能 build,不验证容器启动后访问关键路径。可在 CI 加 `docker run --rm <image> node -e "..."` 做静态资源存在性检查 |
| 39 | 候选人/员工详情三列布局只给中列加 `space-y-4` 没 sticky,中列内容比左右长很多时跟 body 一起滚 → "三列各自独立"假象碎掉 | 用户向下滚到底部,左右列因 sticky 停在 viewport top:4,中列继续往下滚出去,体验不一致 | 三列**都**加同款 `xl:sticky xl:top-4 xl:self-start xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pr-1 xl:-mr-1`(grid 容器里必须 `self-start` 否则被 stretch 满高度,sticky 无效);手机端 xl/lg 以下断点全部失效,自动恢复单列堆叠 + body 滚动。Sidebar 同理:`h-screen + md:overflow-y-auto` 让左侧导航不跟主区滚 |
| 40 | 改 candidate.status 改了 candidate 表却没动 employee 表,NewHire 列表(读 employees)看不到那些候选人 → 数据脱钩 | 用户在 Candidates 改状态到「待入职」,以为人员自动进入入职流程,但 NewHire 一直空空。生产数据已有 N 个候选人卡这种状态 | (1) `candidates.js` PATCH 拦截 status 切到「待入职」/「已入职」时自动 upsert employee(`lib/candidateToEmployee.js`),映射 待入职→stage='待入职' / 已入职→stage='入职准备'。(2) **保守策略**:employee 已存在不动 stage(避免回退 HR 推进的进度)。(3) 历史脱钩数据用 `prisma/backfill-candidate-employee.js` 一次性补,**容器名是 `mesa-server`** 不是 mesa-backend:`docker exec mesa-server node prisma/backfill-candidate-employee.js`。(4) reparse 换 JD 时 candidate.status 回退「待筛选」+ 清未推进的 employee,保持双侧一致 |
| 41 | 想做权限系统时**没先 `git fetch origin && git log origin/main`**, 基于落后 49 commit 的 feature/candidates 工作,等 merge 时大冲突。最终发现 main 已经有完整权限系统 (`user_access_policies` + `permissionKeys.PAGE_KEYS` + `RequirePermission`),我重做的简易版彻底废弃 | PR 提了 CI 通过 merge 失败 conflict (schema/routes/users.js add+add 重名)。reset 到 main 抛弃 PR,关掉。浪费 ~1h | **开始任何"骨架级"功能 (权限/计费/审计 等) 前必须先 fetch 主线检查重复**。一旦发现 main 已经实现,我做的"接通最后一里"才是正确粒度(see PR #42:把 main 现成的 system.llm pageKey 接到 Sidebar UI + 后端 system.js 校验,改 2 个文件 30 行) |
| 42 | localStorage 多账号切换不能存密码,但 saved token 7d 过期后用户点切换会被 401 | 用户期望"无感切换",但被 401 跳回 Login 没解释,容易困惑 | `lib/auth.js` 设计:saved entry 只存 `{ token, user:{id,email,name,role,avatar}, savedAt }`,**永不存密码**。switchToSavedAccount 失败时 axios 401 拦截器自然跳 Login,但更友好的做法是切换前 `api.get('/auth/me')` 探活,过期时显式 toast「该账号已失效,需重新登录」。max 8 条按 email 去重避免 localStorage 爆 |
| 43 | `@larksuite/cli` 的 postinstall 用 `curl` 下载 Go 二进制,`node:20-slim` 不含 curl → `npm error Failed to install lark-cli: spawnSync curl ENOENT`,镜像构建失败 | lark-ingest Dockerfile 本地无 docker daemon 测不出,CI 原本也不构建该镜像 → 差点合并后部署时才炸还阻塞整条 deploy | Dockerfile 装 lark-cli 前先 `apt-get install -y --no-install-recommends curl ca-certificates`;**并把 lark-ingest 纳入 `ci.yml` 的 docker smoke build**,PR 阶段就验证 Dockerfile(本次正是它逮到 curl 缺失)。另:event consume 把 **stdin EOF 当退出信号**,容器/脚本 spawn 时 stdin 必须保持打开(`stdio:["pipe",...]` 不 end),否则秒退;停止用 SIGTERM(勿 kill -9,会泄漏服务端订阅) |
| 44 | 飞书卡片 schema 2.0 不支持 `{tag:"action"}` 容器 → 发卡片报 `ErrCode 200861: unsupported tag action`,按钮发不出 | 2.0 把按钮当作 body.elements 的直接元素,不再包 action 容器;回调按钮用 `behaviors:[{type:"callback",value}]`,value 原样回到 `event.action.value`;`lark-cli` 长连接**不支持** `card.action.trigger`(`unknown EventKey`),卡片按钮回调只能走公开回调 URL(`/api/feishu/card-callback`) | 卡片按钮直接作 element;回调走 backend 公开端点(Verification Token 校验);`im messages` 无 patch 命令,更新卡片靠回调同步返回 `{toast,card}` 或 cardkit API |
| 45 | Kimi prompt 写 `name(必填)` → 简历名字读不准时被逼**编造占位名「张三」**(实际叫刘颢),与「不编造」规则冲突 | 公开/详情页显示错误姓名;其它字段(电话/邮箱/学校/经历)经核对均真实,仅姓名被「必填」逼出幻觉 | prompt 改「读不到填 null,严禁编造/占位」(code `DEFAULT_PROMPT` + 生产 DB `kimi.prompt` 都改);`resumes.js` `deriveName`/`pickPhone`/`pickEmail` 从简报兜底(姓名取首行,电话/邮箱标签行,国际格式兼容,非占位) |
| 46 | 飞书卡片新建 JD **输入表单**点提交报 `code: 200673`(卡片结构非法) | 用了 `action_type:"form_submit"`(错)。schema 2.0 内嵌 form 的提交按钮正确写法:`name`(必填)+ `form_action_type:"submit"` + `behaviors:[{type:"callback",value}]`;回调取 `event.action.form_value`(键=各 input 的 `name`)与 `event.action.value` 共存。`input` 多行用 `input_type:"multiline_text"` + `rows` | `routes/feishu.js` `cardNewJd` 提交按钮改 `form_action_type:"submit"` + `name`;form 容器与各 input 均需 `name`。教训:飞书卡片组件属性以「卡片搭建工具导出 JSON」或 v2 组件文档为准,不同文档页对 form 提交写法描述不一致 |
| 47 | 改 VPS `.env` 凭证类值踩双坑:① 值加引号(`KEY="v"`)→ docker compose 读 `.env` **不剥引号**,引号被当成值的一部分注入容器 → 凭证失配;② 容器内环境变量名 ≠ `.env` key:`docker-compose.yml` 写 `UPLOAD_TOKEN: ${LARK_UPLOAD_TOKEN:-}`,即 `.env` 的 `LARK_UPLOAD_TOKEN` 插值后注入容器内的 `UPLOAD_TOKEN` | 飞书 bot 换永久 token 后端到端验证一直 404:`.env` 值带引号 + 验证 curl 误用 `.env` 的 key 名(容器内实为 `UPLOAD_TOKEN`,取到空值) | `.env` token 类值**不加引号**(base64url 无特殊字符无需引号);验证容器内凭证用 compose 映射的**容器侧变量名**(`docker exec <c> sh -c 'echo $UPLOAD_TOKEN'`),别想当然用 `.env` 的 key 名;改 `.env` 后 `docker compose up -d --force-recreate <svc>`(坑#8) |
| 48 | `lucide-react` 1.x 的 `package.json` **无 `exports` 字段、主入口是 barrel**(`module: dist/esm/lucide-react.mjs`),rolldown(Vite 8)无法从中 tree-shake → 任何 `import {X} from "lucide-react"` 或 `import * as Lucide` 都把**全部 ~3900 个图标**打进包(icons chunk 618KB / gzip 153KB,白压首屏) | 首屏 bundle 巨大;改成具名导入也无效(barrel 裁不掉);hash 不变会误以为没生效 | 走**深度导入单图标文件** `lucide-react/dist/esm/icons/<kebab>.mjs`(文件名即 kebab name,`export default` 图标)。用生成器 `web/scripts/gen-icon-map.mjs` 扫描全部 `<I name>`/`icon:`/分享数组 字面量 → 生成 `web/src/lib/iconMap.js`(显式深度 import)。`Primitives.jsx` 的 `I` 与 `CandidateDetail.jsx` 本地 `I` 都查 `ICON_MAP`,miss 回退 `HelpCircle` + dev `console.warn`。**新增图标后必须重跑** `node scripts/gen-icon-map.mjs`。效果:icons 618KB→31KB。注意深度路径耦合 lucide 内部结构,大版本升级路径变需同步生成器 |
| 49 | 自定义 `range` 评分条用 `left/width: r%` 对齐拇指;气泡用 `dragging && fillRatio` 显隐;拖动只 `onChange(round)` 喂总分 | 进度条冒出白圆 / 光晕偏右;同页多条满分只有正在拖的有泡;总分球小数跳档 | fill/分数/光晕共用拇指内缩公式 `calc(r*(100%-thumb)+thumb/2)`;气泡按「有填充即显示」;拖动 `onScrub(float)` 仅 UI、落盘仍整数。完整规范 [`delivery-docs/dev-plans/评分拖条与填充气泡交互规范.md`](./delivery-docs/dev-plans/评分拖条与填充气泡交互规范.md) |
| 50 | Moonshot 已下线 `moonshot-v1-*` 系列,`/v1/models` 只剩 `kimi-k2.6 / kimi-k2.7-code(-highspeed) / kimi-k3`;旧 `pickParseModel` 把所有 `kimi-k*` 当推理模型硬回退到 `moonshot-v1-32k` → 全部简历解析 404 `Not found the model` | 本地/生产 `kimi.model=moonshot-v1-32k`(DB 或 env)时 parse / match / JD 抽取全部失败 | `kimi.js` `resolveModel`:配置或请求的模型必须在账号实时列表里,否则按偏好回退(highspeed > k2.6 > k2.7-code > moonshot-v1 > 其它非 thinking);simple `kimi-k2.7-code-highspeed` 结构化一份简历约 40s、报告约 30s。**上线后请在 LLM 配置里把系统默认模型改成列表里实际存在的模型** |
| 51 | 用 python 改 `schema.prisma` 的脚本 assert 失败退出,但同一条命令后半段的 `prisma migrate deploy` 照样跑了 → 迁移 SQL 已应用到 DB,schema 文件却没改 | `prisma migrate status` 显示 up to date,`prisma generate` 出的 client 没有新表,代码引用 `prisma.resumeParse` 报 undefined | 多步命令用 `&&` 串联而不是 `;`;改 schema 后先 `prisma validate` 再 migrate;本次靠重跑 schema 补丁 + `prisma generate` 对齐 |
| 52 | 词表 tag 含点号(`quality.overseas`),硬筛规则字段 `derived.domainYears.quality.overseas` 被按点号整体拆路径 → 永远 UNKNOWN | 海外质量年限明明 5.6 年却判「未提及」 | `hardFilter.js` `getPath`:前两段是对象路径,其后整体当作一个 tag 键 |
| 53 | Jev 题目 id 由 requirement key 派生,词表 tag 直接做 key 会出现 `soft_soft_cross_team` / `cert_cert_pmp`;`code_then_jev` 且 `unknownPolicy=ignore` 的项在硬筛阶段被标 IGNORED 后不再问 Jev → 新能源项目经历明明在简历里也判「未提及」 | 报告里出现「新能源汽车经验:未提及」误导 HR | slug 去掉 `soft./cert./tool.` 前缀;硬筛只产 PASS/FAIL/UNKNOWN,UNKNOWN 一律交 Jev 再判,`ignore` 只影响 composite 计分分母 |
| 54 | TextIn 返回的 Markdown 偶带 `\u0000`(NUL)字节,Postgres text / jsonb 一律拒收 → `resumeParse.upsert` 报 22021 `invalid byte sequence for encoding "UTF8": 0x00`,整笔事务回滚 | 生产首份简历三层全部跑通(TextIn → Kimi → Jev 14 题)却在最后落库失败,候选人没创建 | `textin.cleanMarkdown` 剥 NUL;`pipeline.deepStripNul` 在写 ResumeParse / Candidate / CandidateEvaluation / Job.jdFacts 前对字符串与 JSON 深层统一剥离;喂 LLM 前也剥。**任何来自外部解析器 / LLM 的文本入 Postgres 前都要过 NUL 剥离** |
| 55 | Upload 页「降级入库」旧 payload 传 `skills: [] / experience: [] / educationHistory: []`,但这三列自 `resume_fields_to_markdown` 起已是 text,Fastify schema 却仍声明 array → Prisma 报 `Argument skills: Invalid value provided. Expected String or Null` | 解析任务失败后前端走降级路径,第二个 500 把候选人也丢了(截图里两个红 toast) | `candidates.js` schema 改 `["string","array","null"]` + handler `normalizeMarkdownFields` 数组转 bullet 字符串(兼容任何旧客户端);Upload 降级 payload 改发 `""`。教训同坑 #28:列类型改了要把所有写入口(含前端兜底路径)一起改 |
| 56 | 生产 DB `kimi.prompt` 仍是 2026-05-24 的旧自定义版本,优先级高于代码内置 v2 prompt → Kimi 按旧 schema 输出(`task.stages.structure.shape="legacy"`),旧形状没有 campus / courses / certificates,项目键也对不上 → 郑凯戈简历项目经历、志愿者协会主席、两次全国竞赛全部丢失;本地无自定义 prompt 时同一份 Markdown 抽取完整 | 用户看到「项目经历没解析出来」,而 TextIn Markdown 明明有「# 项目经历」段 | `kimi.js` `isPromptV2`:自定义 prompt 必须含 `resume.v1` + campus + projects 才生效,否则忽略并 warn;`/resumes/llm-status.promptStatus=legacy_ignored` → LLM 配置页红字提示「回退默认」;`legacyToProfile` 项目映射兼容 name/title/role/description/achievements 等旧键;`str()` 把「未提供/未解析到/无/N/A」占位串归 null。**教训:prompt 与输出 schema 必须一起版本化,admin 覆盖项要做兼容性校验** |
| 57 | 三层上线后 Kimi 额度消耗明显上升:`resolveModel` 回退优先选了 `kimi-k2.7-code-highspeed`,它是推理模型且**不允许关闭思考**,一份简历 5.2K 输出 token 里 3.9K 是 reasoning(按输出计费);输入侧其实已被 Moonshot 前缀缓存命中(4608/4744) | 用户反馈"比没有三层架构时更耗额度" | 实测 `kimi-k2.6` + `thinking:{type:"disabled"}`:1.0K 输出 / 25s,抽取结果一致(开着思考则 8.6K / 235s)。`kimiRequest` 对 chat 调用自动注入 thinking=disabled(仅 `kimi-k2.\d` 素模型),被 400 `invalid thinking` 拒绝则记入 `noThinkingParam` 去参重试并视为推理模型;`preferFromList` 改为素 k2.x > moonshot-v1 > highspeed > -code。**抽取 / 结构化 / 报告类任务永远不要用推理模式;选模型先看能否关思考** |
| 58 | `prisma migrate dev` 在 dev 库生成迁移时,把「历史手写迁移 vs schema」的既有漂移(audit_logs / password_history 的 DESC 索引、employees.drop_reason 类型)一并写进了新迁移:头部 DropIndex + 尾部 CreateIndex。手工剔除时只删了头部,尾部 3 条 CreateIndex 残留 → 生产干净库报 42P07「索引已存在」→ 迁移失败 → 后端容器退出 → 全站 521;且 Prisma 把该迁移记为 failed,之后任何镜像(含回滚旧镜像)的 `migrate deploy` 都被 P3009 挡住,**回滚代码救不了** | PR #221 合并后 deploy 失败,`mesa-server is unhealthy`,CF 521 | (1) 新迁移 SQL 必须整文件通读,`grep -v campus_` 之类检查**不含任何无关表名**;(2) 更稳的做法是对**干净库**跑一遍 `migrate deploy`(本地 `docker build` 生产镜像 + 新建空库)再提 PR,CI 的 smoke build 不覆盖这一步;(3) 生产出现 P3009 时需 `prisma migrate resolve --rolled-back <name>` 后再部署 —— 本次通过 deploy.yml 临时加一步 `docker compose run --rm --no-deps backend npx prisma migrate resolve --rolled-back …`(PR #222)完成,成功后删除(PR #223);(4) 不要再用 `migrate dev` 对带漂移的 dev 库生成迁移,直接手写 SQL 或先 `prisma migrate diff --from-migrations --to-schema-datamodel` 看清差异 |

---

## 9. 沟通风格

- 默认中文,专业术语保留英文
- 改动结束输出「**改动文件 + 摘要 + 验证结果 + 风险**」四件套
- 大改动跨阶段前先在回复里写明影响范围 + 回滚路径,等用户「继续」再动手

### 9.1 文档形式约定(2026-09-20 起)

- 项目内新写的**设计 / 方案 / 评估 / 交付类文档**统一交付为**自包含单文件 HTML**(内联 CSS,无外链字体 / 脚本 / 图片,自动深色模式,可离线打开、可打印、手机可读)。README、CLAUDE.md、代码注释、`delivery-docs/src/*.md`(.docx 源)不受此约束。
- **Markdown 作源,HTML 是产物**:源放在文档目录的 `src/` 下,HTML 与源同名放目录顶层;用 `node tools/md2html/build.mjs <src.md> <out.html>` 生成(依赖 pandoc + `~/.claude/skills/pretty-mermaid`),不要手写 HTML。
- 源文件顶部用 YAML 元数据 `title / date / status / base / description`;图表写 ```` ```mermaid ```` 块,构建时渲染成内联 SVG(节点标签不要用 `<br/>`,边标签用 `-->|文字|`,见 `tools/md2html/README.md`)。
- 用户提供的原始想法 / 参考资料文件(如 `textin+kimi+jev架构/*.md` 顶层的 3 份)保持原样不转换。
- 改了源必须重新生成 HTML,两者一起提交。

---

## 10. 数据模型

以 `server/prisma/schema.prisma` 为准(字段注释即语义说明);ShareLink / UploadShareLink / 评价 / 面试评价的设计见 skill `mesa-subsystems`。

## 13. AI 代理协作差异

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
