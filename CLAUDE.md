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

### 1.1 已实现核心子系统

| 子系统 | 关键能力 |
|--------|---------|
| 招聘工作台 | 候选人 / 岗位 / 部门 / 员工 / 面试 / 概览统计 全套 CRUD |
| 候选人详情页(V2)| 三列布局(profile sticky · 中间 · 评价+洞察 sticky)· 15+ 新组件:DocsModule / TagsModule / InlineSource / PeopleChips / JdSwitchConfirmModal / JdDescModal / FeedbackHistoryCard / OverviewTile 等 |
| LLM 简历解析 | Kimi (Moonshot AI) · 一次 chat 输出 JSON(含 HR 友好简报 + 结构化字段)· admin 在 UI 编辑 API Key/模型/Prompt |
| JD 匹配评估 | 二次 LLM 调用,基于候选人简报 + JD 描述输出 jdMatch + risks/highlights + V2 新字段(matchedFor / againstFor / aiSuggestedTags / insights[kind=up/down]) |
| 候选人重新解析 | 「待解析」候选人(LLM 上传时降级)详情页 amber banner / 列表 hover icon 触发,**异步任务化**:POST 立即 202 + taskId,前端 2s 一次轮询 GET /parse-tasks/:taskId,绕 Cloudflare 100s 上限,Kimi 跑多久都行 |
| LiquidLoader | 候选人匹配度全站液体进度球(替换原 MatchRing)· 三档调色板(red ≤60 / blue 60-80 / violet >80)· 数字白色描边 · 波浪 + 气泡 + 高光 · loading=true 外圈呼吸光晕 |
| 分享给招聘官 | ShareLink 公开链接,可设有效期(60s-30d/无限期)+ 访问次数上限(10/50/100/自定义/无限) |
| 评价对话系统 | 1 级嵌套回复 + 多选批量回复 + 赞同/否决投票 + 投票名单 popover + 可见范围(public/internal/admin) + soft-delete + admin 审核删除/隐藏 + 实时通知(Notification+音效) |

---

## 2. 技术栈与运行形态

| 维度 | 当前生产形态 |
|------|-------------|
| 前端(生产) | `web/` — Vite 5 + React 18 + Tailwind 3 + react-router 6 |
| 后端 | `server/` — Node 20 + Fastify 4 + Prisma 5 + JWT · jsonrepair(LLM JSON 兜底)|
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
│   │   └── migrations/        # 含 add_v2_fields(Candidate/Job/Interview 共 23 新字段)
│   └── src/
│       ├── plugins/           # prisma / jwt / cors / redis / r2
│       ├── routes/            # candidates / jobs / departments / employees / interviews / dashboard / storage / resumes / system / share / reviews / auth
│       └── lib/               # api / kimi(LLM + 4 层 JSON fallback + 429 retry)/ derived(profileCompletion)/ parseTaskStore(reparse 异步任务)/ idLookup / settings
├── web/                       # Vite 生产前端
│   ├── src/components/        # Primitives(LiquidLoader / MatchRing / Card / I / ToastHost 等)/ Sidebar / Topbar / Layout / AuthGuard
│   ├── src/pages/             # 13 个业务页面(候选人详情 = V2 三列布局)
│   ├── src/lib/               # api / auth / constants
│   ├── nginx.conf             # 容器内 Nginx(80→443 / 主服务 / monitor / /api proxy_read_timeout 180s / index.html no-cache)
│   └── Dockerfile             # 多阶段 build
├── ops/
│   ├── backup.sh              # pg_dump → R2(由 systemd timer 每日跑)
│   ├── restore.sh             # R2 → pg_restore(灾备恢复)
│   └── runbook_cloudflare_vps.md  # 阶段④ 生产硬化 SOP(checkbox)
├── delivery-docs/             # 4 份正式交付 .docx + src/ markdown 源
├── docker-compose.yml         # 生产 5 容器编排
├── docker-compose.dev.yml     # 本地开发 PG + Redis(仅 127.0.0.1)
├── .github/workflows/         # CI + Deploy 流水线
├── .env.example               # 生产环境变量模板(占位 __SET_BY_OPS__)
├── CLAUDE.md                  # 本文件
└── README.md                  # 引导性 README
```

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
| **ShareLink token** | `share_links.token` (32 字符 URL-safe random) | 仅 DB · 公开访问凭证,泄露 = 候选人简报可被任意人看 |
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
5. **AES 派生**:加密 SystemSetting.value 用 `HKDF(JWT_SECRET, salt="mesa.settings.v1") → AES-256-GCM`。轮换 `JWT_SECRET` 等于让 DB 里加密的 key 全部解不开 — 轮换前必须先 admin UI 解密 → 改 secret → 重新写入。
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
| 18 | 浏览器 `Notification.requestPermission()` 必须用户交互后调 | 自动调被 silently 拒 | 在用户进入候选人详情后被动调用,初始 `Notification.permission === "default"` 时才 request |

---

## 9. 沟通风格

- 默认中文,专业术语保留英文
- 改动结束输出「**改动文件 + 摘要 + 验证结果 + 风险**」四件套
- 大改动跨阶段前先在回复里写明影响范围 + 回滚路径,等用户「继续」再动手

---

## 10. 数据模型清单(Prisma)

11 张表,关系图如下:

```
User ─owns──> Candidate ─has─> Note / Review / ShareLink / Employee
                    │           ↑                          │
                    └──> Interview                          └──> Job
                                                                  ↑
                                                    Department    │
                                                                  │
                              Review ─votes─> ReviewVote ─by─> User
                              Review ─replies─> Review (self, 1 level)

SystemSetting  独立 KV (kimi.api_key / kimi.model / kimi.prompt 等)
```

| 表 | 关键字段 | 备注 |
|----|---------|------|
| `User` | email/passwordHash/role/avatar/jobTitle | Role: ADMIN/RECRUITER/VIEWER |
| `Candidate` | name/skills/tags/risks/highlights/aiSummary/jobId/jdMatch + **V2** documents/insights/aiSuggestedTags/matchedFor/againstFor/profileCompletion(derived)/languages | aiSummary = LLM 输出的 HR 简报纯文本;V2 字段由 `/api/resumes/match` 写入,profileCompletion 后端 read 时算(`lib/derived.js`)不存 DB |
| `Job` | title/description/urgency/openings/_count + **V2** employment/salary/levelRange/yearsExpRange/educationRequirement/languageRequirement/publishedAt/deadline/responsibilities/requirements/nice/benefits | V2 字段供 JdDescModal + 岗位概览 OverviewTile 渲染;暂由 admin 手动填,无 LLM 产 |
| `Department` | name/code/head/headcount/openHc/parentId | 自关联树 |
| `Employee` | candidateId/jobId/stage/checklist json/probation json/events json/riskItems json | candidate → employee 转化 |
| `Interview` | candidateId/jobId/round/mode/scheduledAt/status + **V2** category/link/managers(JSON)/interviewers(JSON) | managers/interviewers 是多人 JSON 数组,旧 interviewer single string 保留向后兼容 |
| `CandidateNote` | candidateId/content/authorId/authorName | admin 内部备注 |
| `Review` | candidateId/authorName/content/attachments json/parentId/referencedIds json/stance/upvotes/downvotes/visibility/hidden/deletedAt | 评价对话(详见 §12) |
| `ReviewVote` | reviewId/userId/value(+1/-1) | unique(reviewId,userId) 登录用户去重 |
| `ShareLink` | token/candidateId/expiresAt/maxViews/viewCount | 公开访问凭证(详见 §11) |
| `SystemSetting` | key/value(AES-256-GCM)/encrypted/updatedBy | admin 系统配置(KIMI key/model/prompt) |

## 11. ShareLink 分享系统

公开页 `/share/:token` **在 AuthGuard 外**, 不依赖 JWT。

| 维度 | 设计 |
|------|------|
| Token 形式 | 24 字节 URL-safe random(`crypto.randomBytes(24).toString("base64url")`)= 32 字符 |
| 有效期 | 默认 3 天 · 预设 1d/3d/7d/30d/forever · 自定义 60s-30d |
| 访问次数限制 | 默认 null=不限 · 预设 10/50/100 · 自定义 1-9999 · 达上限返回 410 `share_quota_exceeded` |
| 关系 | 1 个 candidate 同时只允许 1 个 active ShareLink(POST 会先删旧建新) |
| 公开 API mask | `/api/public/share/:token` 返回的 phone/email 自动 mask(`138****5678` / `ab***@x.com`) |
| 公开附件上传 | `/api/public/share/:token/presigned-url` 需 token 校验后才签发,key 限定 `reviews/public/` 前缀 |

## 12. 评价对话系统

**1 级嵌套 + 完整审议流**,详细见 [02 API 手册] 的 `/api/candidates/:id/reviews` 与 `/api/public/share/:token/reviews` 端点。

| 能力 | 实现 |
|------|------|
| 提交评价 | 登录(auto authorName)+ 公开(必填 authorName) |
| 附件 | image/file/link · 单条 ≤30MB(后端 422)· R2 直传(presigned) |
| 回复 | 1 级嵌套(`parentId`),禁止 nested-of-nested |
| 批量回复 | 多选 checkbox → 一条评价,`referencedIds[]` 记录所有被引用 |
| 投票 | thumbs-up/down + count + 我的投票高亮 · 登录走 `ReviewVote unique(reviewId,userId)` · 公开走 localStorage + `prevValue` 算 delta |
| 回复 stance | approve/reject/null · 头部 chip 显示 |
| 排序 | 最新/最旧/最赞同/最否决(前端 sort) |
| 可见范围 | public(默认)/internal(仅登录)/admin(仅 ADMIN)· 后端 `internalShape/publicShape` filter |
| 删除流 | 作者请求 → admin 批准 = soft-delete · admin 可直接 soft-delete · admin hide/unhide |
| 实时通知 | 详情页打开后 15s 轮询 · Notification API + Web Audio 双音(A5→E6)|

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
