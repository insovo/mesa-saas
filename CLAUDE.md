# CLAUDE.md — MESA Recruit

> AI 协作守则与项目级指令(对 **Claude Code / Codex CLI / Cursor** 共同生效)。
> 用户的全局偏好(沟通语言、称呼、Priority Order 等)以 `~/.claude/CLAUDE.md` 为准,本文件不重复。
> 完整架构 / API / 部署 / 运维手册见 [`delivery-docs/`](./delivery-docs)(`src/*.md` 源 + 正式 `.docx` 交付件,索引见根 [`README.md`](./README.md#交付文档索引))。

---

## 1. 项目现状(一句话)

**MESA Recruit · 已上线 SaaS**:
- 站点 **https://insovo.top** + 监控 **https://monitor.insovo.top**
- 香港 VPS `114.134.188.7` (4 核 8G,Ubuntu 22.04) · Docker Compose 编排 6 容器
- 前后端 + 数据库 + 缓存 + 监控全栈生产化
- GitHub Actions 自动 build → GHCR → SSH 滚动部署(1-2 分钟)
- 每日 03:00 UTC `systemd timer` 自动 PG 全量备份 → Cloudflare R2

### 1.1 已实现核心子系统

| 子系统 | 关键能力 |
|--------|---------|
| 招聘工作台 | 候选人 / 岗位 / 部门 / 员工 / 面试 / 概览统计 全套 CRUD |
| 候选人详情页(V2)| 三列布局(profile sticky · 中间 · 评价+洞察 sticky)· 15+ 新组件:DocsModule / TagsModule / InlineSource / PeopleChips / JdSwitchConfirmModal / JdDescModal / FeedbackHistoryCard / OverviewTile / **ReparseConfirmModal** / **MarkdownBullets** / **NeedJobPlaceholder** 等。**阶段进度条**:7 tab 等宽两端对齐 + 填充对齐 active tab 中心。**附件区**勾选式列表 + 「下载选中(N)」+「下载全部」,LLM 解析的原始简历自动同步到「简历」分类 |
| LLM 简历解析流水线 | 文件抽取/清洗(PDF 优先 `pdftotext -layout`,扫描件与 DOC/DOCX fallback Kimi Files API) → **parseResume**(**方案 B**,2026-06-05):LLM 只产**结构化 JSON**(姓名/多值联系方式/语言/技能/奖项/教育/工作含核心职责-关键成果/项目),后端 **assembleSummary** 按固定模板**确定性拼装** HR 简报 txt(格式 100% 由代码控制、与结构字段恒一致,根治 LLM 格式漂移)+ 确定性闸门 `normalizeDegree`(外文学历归一枚举)/`periodText`(日期残片净化)/`anyFilled`(过滤空条目)+ 派生 tags/languages + skills/experience/educationHistory markdown 事实字段 |
| JD 匹配评估 | **matchAgainstJob** 只基于 summary + JD 二次评估,产出 jdMatch + risks/highlights/insights + matchedFor/againstFor/aiSuggestedTags,不再改写核心技能/工作经历/教育背景 |
| 候选人重新解析 | 详情页 amber banner / 列表 hover icon 触发 → 弹 **ReparseConfirmModal** 让用户先选/确认投递 JD → 确认后才发请求。**异步任务化**:POST 立即 202 + taskId,前端 2s 一次轮询 GET /parse-tasks/:taskId,绕 Cloudflare 100s 上限,Kimi 跑多久都行 |
| **简历上传(V3)** | Upload 页全面改造:文件上传 → 来源(≤500 字符)→ 投递岗位/新建 JD(支持上传 JD 文件 AI 解析)→ 异步任务化解析(parse-and-create,根治 .doc Kimi 90s+);列表展示三页统一(Upload/Candidates/Dashboard):checkbox 单/批量选 + inline JD/部门 select + 解析按钮(已解析显"重新解析")+ 完整时间 yyyy-MM-dd HH:mm:ss + 来源(未填"未提供")+ sessionStorage 持久化(切页/刷新仍显示"解析中" + "本次已入库") |
| **公开上传(扫码 / 链接)** | UploadShareLink 镜像 ShareLink 反向流向 — 招聘官生成 token → QRCodeSVG 二维码 + 短链 `/upload/:token`(AuthGuard 外)→ 候选人本人 / 同事 / 猎头无登录上传 → 后端事务化 create candidate (ownerId=link.createdBy, jobId/dept 继承) + 写 CandidateNote(备注同步候选人详情备注卡)+ uploadCount++;maxUploads + expiresAt 双重限流 |
| LiquidLoader | 候选人匹配度全站液体进度球(替换原 MatchRing)· 三档调色板(red ≤60 / blue 60-80 / violet >80)· 数字白色描边 · 波浪 + 气泡 + 高光 · loading=true 外圈呼吸光晕 |
| 分享给招聘官 | ShareLink 公开链接,可设有效期(60s-30d/无限期)+ 访问次数上限(10/50/100/自定义/无限) + **7 项可见性 toggle**(统一手动分享 & 飞书 Bot 自动分享两面板):展示联系方式(默认开,**开=完整不打码**)/ 查看原始简历(默认开,经 `/resume/view` 后端 302 跳转 R2,微信兼容)/ 允许查看备注(默认**关**,公开页展示备注;洞察始终展示无开关)/ 显示评论评价(经 allowedModules 控 candidate.reviews)/ 允许上传评论附件 / 支持填写面试评价 / 展示已有面试评价。公开页还有**「JD 描述」按钮**(关联了 JD 时显示,复用 `JdDescModal` 组件**只读**展示岗位名称/职责/要求/福利等,不传 `onSwitch` → 无切换 JD;后端公开 API 返回 `job` 详情)。**飞书 Bot 分享设置**(`/share-settings` 独立页 + 弹窗 tab,pageKey `share.settings` 默认仅 admin)= admin 全局策略(默认+上限/锁)+ 招聘官单人偏好,**取更严**(单人不能突破 admin 上限/关停) |
| 评价对话系统 | 1 级嵌套回复 + 多选批量回复 + 赞同/否决投票 + 投票名单 popover + 可见范围(public/internal/admin) + soft-delete + admin 审核删除/隐藏 + 实时通知(Notification+音效) + 公开访客上传附件受 ShareLink.showAttachments 控制 |
| 安排面试 modal | 方式 select(线下/视频/电话) → 下方动态字段切换 label/placeholder/icon (面试地点 / 视频链接 / 联系电话,写入 `Interview.link`)。面试官输入下方「从评价人快选」chip,从 reviews 抽 unique authorName 自动追加。**面试安排列表(/interviews)支持删除记录**(默认仅 admin,可在 /users 授予模块权限 `interview.delete`) |
| **面试评价(V1)** | InterviewEvaluation 模型 + 公开页 `/interview-eval/:token`(AuthGuard 外)。候选人详情页右侧 aside「面试安排」与「附件」之间嵌入面试评价 Card:列表展示评价(LiquidLoader 显总分 + 推荐结论 chip + 状态)。招聘官「+ 新建评价」→ 自动从 candidate 预填 9 字段(姓名/岗位/部门/城市等)+ 生成 token + 弹 QR 二维码。面试官扫码无登录填表(7 维度评分 + 4 段纪要)→ 30s 自动保存草稿 + 评分标准抽屉 + 实时总分气泡。提交后一键导出与原 Excel 模板**完全一致版式**的 xlsx(13 处合并 / 9 个公式 / 数据校验 / 列宽行高 freeze pane 全保留)。模板 SHA-256 启动时校验,公式注入防护(`= + - @` 开头前缀 `'`),文件名 RFC 5987 中文编码 |
| **员工绩效评价** | `/performance`(pageKey `performance`)+ 公开页 `/performance-eval/:token`。Employee 锚定 · 自评/主管双 token · **访问密钥第二因子**(bcrypt hash + AES enc 回显 · 失败 5 次锁 10 分钟 · Header `X-Perf-Access-Key`)· 7 维评分(v2 中英双语金样)· 双方手写签字必填 · HR 电子章挂 User · 批量发起/密钥预览导出 Excel。详 `delivery-docs/src/06_performance_evaluation.md` + API §18。**≠** 报表「HR 绩效看板」 |
| **入职管理 (NewHire 表格视图)** | `/newhire` 看板 → 表格列表。顶部 6 个 stage KPI 卡(GSAP CountUp 数字滚动: 待入职/入职准备/入职当天/试用期/已转正/延期试用)+ 搜索/部门/横向 chip 三件套筛选 + 表格 7 列(员工 / 投递岗位部门 / 阶段 / 入职试用期 D 天数 + 渐变进度条 / 入职清单进度 N/7 / 风险 / 查看)。员工姓名 Link 跳 `/staff/:id`。员工档案 3 列布局:左 sticky 员工卡 + LiquidLoader 招聘期 JD 匹配 + 学历专业;中 5 步入职生涯 stepper (待入职→入职准备→入职当天→试用期→已转正) + 入职清单 7 项(标记完成/撤销/一键全部完成,直接 PATCH employees);右 sticky tab(生涯时间轴 / HRBP 风险) + 4 chip 筛选(全部/入职后/入职前工作/教育)+ 彩色 dot 时间轴。**列表/档案支持删除入职员工记录**(默认仅 admin,可在 /users 授予模块权限 `employee.delete`) |
| **候选人 → 员工自动转化** | candidate.status PATCH 到「待入职」/「已入职」时,后端 `lib/candidateToEmployee.js` 自动 upsert 关联 employee。映射: 待入职→stage='待入职' / 已入职→stage='入职准备'。**保守策略** — 若 employee 已存在且 stage 已被 HR 推进过(入职准备/入职当天/试用期/已转正/延期试用),**不动 stage** 避免回退已操作进度。reparse 换 JD 时联动: candidate.status 回退「待筛选」+ 删除未推进的 employee(仅 stage='待入职' 的)。`prisma/backfill-candidate-employee.js` 一次性脚本补存量数据,生产跑法 `docker exec mesa-server node prisma/backfill-candidate-employee.js` |
| **登录多账号记忆 + 一键切换** | Login「记住账号」checkbox(默认不勾)勾后登录(含 MFA 第二步)调 `addSavedAccount`,localStorage `mesa.saved_accounts = [{ token, user:{id,email,name,role,avatar}, savedAt }]` 按 email 去重,**永不存密码**,最多 8 个。Topbar 头像下拉「切换账号」展开内嵌子菜单列出已保存账号(头像/姓名/邮箱)+ 「用其他账号登录」入口;hover 出 X 删除单条;点击 setAuth(saved.token) → `window.location.assign('/dashboard')` 让所有 hook 用新 token 重拉。token 过期 → 拦截器 401 自动跳 Login |
| **三列独立滚动 (候选人/员工详情)** | 候选人详情 `xl` 三列 sticky;员工详情(`/staff/:id`·`EmployeeDetail`)同理在 `xl` 三列,以下上下堆叠(左档案→中入职生涯→右时间轴)。桌面进候选人/员工详情自动收起侧栏。Sidebar:`h-screen + md:overflow-y-auto` |
| **system.llm 权限接通** | 配合 main 已有的权限系统(`user_access_policies` + `PAGE_KEYS`),把 LLM 配置入口接通最后一里。Sidebar `canLlmAccess = isAdmin \|\| hasPage(me, 'system.llm')` 决定 LLM Key 按钮显示;后端 `routes/system.js` 原 adminOnly hook → `requireLlmAccess` (admin OR pageKey + isActive);**新增** `adminOnlyForApiKey` 给 PUT/DELETE `/settings/:key` 加额外门 — `key === kimi.api_key` 时拒非 admin(API Key 仍 admin 独占,防被授权用户改高敏感凭证)。admin 在 `/users` 给某用户勾「LLM 配置 (system.llm)」后,该用户重登 Sidebar 出现 LLM 按钮,可改 model/prompt 但不能动 API Key |
| **组织架构图 (部门管理)** | Departments 页顶部支持**「树视图 / 架构图」切换**(默认树视图)。**树视图 OrgTreeList**:纵向缩进折叠树 + chevron 展开折叠 + 展开/折叠全部单按钮智能切换 + 搜索(部门/负责人/代码,命中含祖先路径)+ 顶级楼/子级文件夹图标 + 右侧已关联候选人数 + 行内 hover 加子部门/编辑/删除 + 拖拽改层级(复用 OrgChartTree 的 buildTree/computeMoves)。**架构图 OrgChartTree**:flat→tree 布局 + SVG 贝塞尔连线 + @dnd-kit 三档 dropzone(before/child/after) + 顶部根 dropzone(拖回顶级)+ GSAP Flip 重排 + stagger 进场 + DragOverlay。两视图数据与拖拽语义完全等价。后端 `POST /api/departments/reorder` 批量事务化 update (parentId, sortOrder),三重环检测 422 拒绝(self / 后代 / 整图链式)。**人员统计 xlsx 导出** `GET /api/departments/:id/export.xlsx` 用 exceljs 仿模板「海外研究院人员统计」三级合并表头 + 末列/末行合计公式 + 下半部分分子分母双视图 |
| **飞书简历自动入库 (lark-ingest)** | 第 6 容器 `tools/lark-ingest`(零依赖 Node + 官方 `@larksuite/cli`)。用 `lark-cli event consume im.message.receive_v1 --as bot` **长连接**(出站,无需公网回调/不开端口)监听飞书消息 → 过滤 `message_type=file` + 后缀白名单(pdf/doc/docx)→ `api GET /open-apis/im/v1/messages/:id` 取 `file_key` → `lark-cli im +messages-resources-download` 下载 → 喂进 backend **现有公开上传通道** `/api/public/upload/:token`(presigned→PUT R2→submit,内网直连 `backend:3001` 规避 CF 100s)→ 候选人入「待解析」池。覆盖**内部群 / 外部群 / 私聊转发**(chat_type p2p+group;外部群需企业飞书认证 + 应用开对外共享)。幂等(event_id)+ 文件 sha256 去重(挂卷持久化)+ 断线指数退避重连 + 临时文件即删 + fail-soft。凭证(LARK_APP_ID/SECRET、LARK_UPLOAD_TOKEN)经 VPS `.env` + entrypoint stdin 注入 lark-cli,绝不入镜像;compose 用 `:-` 默认空,缺凭证只重启本容器不拖垮主站。**交互助手(4 阶段)**:① 入库后机器人回执**交互卡片**(`lark-cli im +messages-reply --msg-type interactive`);② 卡片「关联 JD」按钮 → 飞书 `card.action.trigger` 回调 backend `/api/feishu/card-callback`(`routes/feishu.js`,Verification Token 校验 + 可选 Encrypt Key AES 解密,3s 内返回 `{toast,card}` 原地更新)→ 列 JD(点选进 `view_jd` **JD 详情卡片**:岗位名称 + 薪资/职级/经验/学历/职责/要求/加分项/福利,带「投递此岗位」`set_jd` + 「返回列表」;列表/空列表均带「➕ 新建 JD」`new_jd` → schema 2.0 **输入表单卡片**(form 容器 + 岗位名称 input 必填 + 详细描述 multiline_text;提交按钮 `name` + `form_action_type:"submit"` + `behaviors:[{type:"callback",value:{a:"create_jd"}}]`(见坑 #46),回调取 `event.action.form_value` 创建 Job 并自动关联当前候选人))→ 关联(关联成功卡片也带「查看 JD 详情」入口);③「🤖 解析」按钮 → 回调直接起异步 `runReparse`(`resumes.js` 导出)→ 卡片「解析中」;④ 解析完成 → backend 以 bot 身份(`lib/feishuNotify.js` 换 tenant_access_token)生成候选人 ShareLink + 把详情卡片发回原群。卡片须 **schema 2.0**(不支持 `{tag:action}` 容器,按钮直接作 element)。**不立即跑 LLM**,沿用降级入库 + admin 后续点「解析」 |

---

## 2. 技术栈与运行形态

| 维度 | 当前生产形态 |
|------|-------------|
| 前端(生产) | `web/` — Vite 6 + React 18 + Tailwind 3 + react-router 6 |
| 后端 | `server/` — Node 20 + Fastify 5 + @fastify/jwt 10 (fast-jwt 6.x) + Prisma 5 · jsonrepair(LLM JSON 兜底)|
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
│   ├── assets/templates/      # interview-evaluation-v1.xlsx + performance-evaluation-zh-en-v2.xlsx(启动 SHA-256)
│   ├── scripts/               # 维护脚本(verify-interview-eval-template.js 等)
│   ├── prisma/                # schema + migrations + seed
│   │   └── migrations/        # 含 add_v2_fields(23 新字段) / resume_fields_to_markdown(skills/experience/education 转 text) / share_link_visibility_toggles / add_interview_evaluations
│   └── src/
│       ├── plugins/           # prisma / jwt / cors / redis / r2
│       ├── routes/            # … / interview-evals / performance / feishu(卡片回调,公开)/ feishu-config(bot 分享策略,登录态)
│       └── lib/               # api / kimi(文件抽取清洗 + parseResume 简历事实抽取 + matchAgainstJob JD 联评) / derived(profileCompletion) / parseTaskStore(reparse + parse-and-create 异步任务) / idLookup / settings / interviewEvalTemplate… / performanceEvalTemplate + perfAccessKey + performanceEvalExport
├── web/                       # Vite 生产前端
│   ├── src/components/        # Primitives(LiquidLoader / Card / I / ToastHost 等) / Sidebar / Topbar / Layout / AuthGuard / ReparseConfirmModal(reparse 前 JD 确认) / MarkdownBullets(渲染 markdown bullet 字符串) / InterviewEvalCard(候选人详情页评价模块)
│   ├── src/pages/             # 14 个业务页面(候选人详情 = V2 三列布局, PublicInterviewEval 公开评价填写页)
│   ├── src/lib/               # api / auth / constants
│   ├── nginx.conf             # 容器内 Nginx(80→443 / 主服务 / monitor / /api proxy_read_timeout 180s / index.html no-cache)
│   └── Dockerfile             # 多阶段 build
├── ops/
│   ├── backup.sh              # pg_dump → R2(由 systemd timer 每日跑)
│   ├── restore.sh             # R2 → pg_restore(灾备恢复)
│   └── runbook_cloudflare_vps.md  # 阶段④ 生产硬化 SOP(checkbox)
├── tools/
│   └── lark-ingest/           # 飞书简历自动入库容器(lark-cli 长连接 → 公开上传通道)
├── delivery-docs/             # 5 份 markdown 源(含 05 飞书入库方案)+ 正式交付 .docx
├── docker-compose.yml         # 生产 6 容器编排
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

---

## 7. 工作流与触发器

### 7.0 Worktree 隔离工作区(多任务并行硬约定)

需要同时修多个问题、又不想互相污染 working tree 时,**统一**用 git worktree:

```bash
# 命名规则: .worktrees/<分类>/<任务名>,分类只允许 feature / fix / hotfix / chore / docs
git worktree add .worktrees/feature/upload   -b feature/upload   origin/main
git worktree add .worktrees/fix/jwt-renew    -b fix/jwt-renew    origin/main
git worktree add .worktrees/hotfix/cf-502    -b hotfix/cf-502    origin/main

# 任务完成 → 在该 worktree 内 commit → push → PR/merge 到 main → 触发自动部署
# 清理:
git worktree remove .worktrees/feature/upload
git branch -d       feature/upload
```

**硬约束**:
1. **位置**:只允许 `.worktrees/<分类>/<任务>`,**禁止**放 `.claude/worktrees/`(那是 Claude Code 工具默认路径,在本项目里被 AI 自动迁移过来)
2. **gitignore**:`.worktrees/` 和 `.claude/` 都已排除,理论上零误推风险;但仍要在 commit 前 `git status` 检查
3. **基于 `origin/main`**:新建 worktree 一律 `-b <name> origin/main`(不要基于本地 main,可能滞后)
4. **AI 协作**:Claude Code / Codex / Cursor 进来时若需要隔离环境,使用项目本地路径而不是各自工具默认目录(`.claude/worktrees/` 等)
5. **生命周期**:任务合并后立即 `git worktree remove`,避免堆积;同名残留分支用 `git branch -d`(小 d 自带保护)
6. **多 worktree 并行**:每个 worktree 内的 `.env` / `node_modules` / `web/certs/` 需各自准备,git 不会同步
7. **端口分配**:每个 worktree 必须独立端口段,详见 §7.0.1

### 7.0.1 多 worktree 端口分配硬约定

多 worktree 并行时,后端默认 `3001` + 前端默认 `5173` 会冲突。统一通过**端口登记表 `.worktree-ports.json`**(项目根,入库)管理。

**分配规则**:
- 主 repo (main) 固定占 **slot 0** = `3001 / 5173`
- 其它 worktree 从 **slot 1** 起,公式:`backend = 3001 + N*10`,`frontend = 5173 + N*10`
- 步进 10 = 单台机器最多 100 个并行 worktree(实际远用不到)

**AI 新建 worktree 必走流程**(8 步):
1. 读项目根 `.worktree-ports.json`,看 `slots[].slot` 已用值
2. 算下一个空闲 slot N(一般 = max + 1,删除后留空也可复用)
3. 算端口:`backend = 3001 + N*10`,`frontend = 5173 + N*10`
4. `git worktree add .worktrees/<分类>/<名> -b <分类>/<名> origin/main`
5. 复制 env:`cp .env <worktree>/.env && cp server/.env <worktree>/server/.env`
6. 改后端 env:`<worktree>/server/.env` 里 `PORT="<backend>"` + `WEB_ORIGIN="http://localhost:<frontend>"`
7. 写前端 env:`<worktree>/web/.env`(新建)内容:
   ```
   VITE_DEV_PORT=<frontend>
   VITE_API_PORT=<backend>
   ```
8. 把新条目追加到 `.worktree-ports.json` 的 `slots[]`(含 `slot/name/path/branch/backend/frontend/since`)

**AI 删除 worktree 必走流程**:
1. `git worktree remove <path>`
2. `git branch -d <branch>`(已合并)或 `-D`(强制,仅在用户确认后)
3. 从 `.worktree-ports.json` 删除对应 slot 条目(slot 序号可空,后续新 worktree 可复用)

**禁止**:
- 跳过 `.worktree-ports.json` 直接 `git worktree add`(会导致登记漂移,其他 AI 算不出空闲 slot)
- 多个 worktree 共用同一 slot(端口冲突,服务起不来)
- 手改 `web/vite.config.js` 硬编码端口(它已改造成读 `VITE_DEV_PORT` / `VITE_API_PORT`)

**vite.config.js 端口机制**(已实现,向后兼容):
- 读 `web/.env` 里的 `VITE_DEV_PORT` 与 `VITE_API_PORT`
- 不设这两个变量时,默认 `5173` 和 `3001`(等同改造前行为)
- 主 repo 不需要 `web/.env`(走默认值即可)

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

---

## 9. 沟通风格

- 默认中文,专业术语保留英文
- 改动结束输出「**改动文件 + 摘要 + 验证结果 + 风险**」四件套
- 大改动跨阶段前先在回复里写明影响范围 + 回滚路径,等用户「继续」再动手

---

## 10. 数据模型清单(Prisma)

20 个 Prisma model(核心业务表 + 权限/审计等);关系简图:

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
| `User` | email/passwordHash/role/avatar/jobTitle + **hrSignatureKey/UpdatedAt**(绩效 HR 电子章) | Role: ADMIN/RECRUITER/VIEWER |
| `Candidate` | name/tags/risks/highlights/aiSummary/jobId/jdMatch + **V2** documents/insights/aiSuggestedTags/matchedFor/againstFor/profileCompletion(derived)/languages + **简历事实**字段 skills/experience/educationHistory (`String?` markdown bullet 字符串) + **V3** departmentId(2026-05-26 加,独立于 jobId 的部门关联,FK→Department SetNull) + **parsingStartedAt**(2026-06-02 加,`DateTime?`,非空且距今 <10min 即视为「正在解析」,`withDerivedCandidate` 据此派生 `parsing` 布尔让所有列表/详情/概览统一显示「解析中」,reparse 开始打标记、完成/失败置 null,backend 重启残留由 `PARSING_TTL_MS`=10min 兜底过期) | aiSummary = 后端 `assembleSummary` 从 LLM 结构化 JSON **确定性拼装**的 HR 简报纯文本(方案 B,固定模板:姓名→当前职位→所在地区→联系电话/邮箱(多值)→语言能力→关键技能→奖项证书→教育背景→工作经历→项目经验;占位符统一「未提供或未解析到」,与结构字段恒一致);skills/experience/educationHistory 由 parseResume 写入并忠于简历原文(无内容时 UI 显示「重新解析简历后自动生成」引导);V2 JD 评估字段由 `/api/resumes/match` 写入,profileCompletion 后端 read 时算(`lib/derived.js`)不存 DB;departmentId 让"先归部门后定 JD"工作流成立 |
| `Job` | title/description/urgency/openings/_count + **V2** employment/salary/levelRange/yearsExpRange/educationRequirement/languageRequirement/publishedAt/deadline/responsibilities/requirements/nice/benefits | V2 字段供 JdDescModal + 岗位概览 OverviewTile 渲染;暂由 admin 手动填,无 LLM 产 |
| `Department` | name/code/head/headcount/openHc/parentId | 自关联树 |
| `Employee` | candidateId/jobId/stage/checklist json/probation json/events json/riskItems json | candidate → employee 转化 |
| `Interview` | candidateId/jobId/round/mode/scheduledAt/status + **V2** category/link/managers(JSON)/interviewers(JSON) | managers/interviewers 是多人 JSON 数组,旧 interviewer single string 保留向后兼容;link 字段用作面试地点/视频链接/联系电话(由前端 mode 切换 placeholder) |
| `CandidateNote` | candidateId/content/authorId/authorName | admin 内部备注 |
| `Review` | candidateId/authorName/content/attachments json/parentId/referencedIds json/stance/upvotes/downvotes/visibility/hidden/deletedAt | 评价对话(详见 §12) |
| `ReviewVote` | reviewId/userId/value(+1/-1) | unique(reviewId,userId) 登录用户去重 |
| `ShareLink` | token/candidateId/expiresAt/maxViews/viewCount + 可见性:**showContact**(默认 true,开=完整展示)/ **showResume**(默认 true,查看原始简历)/ **showAttachments**(默认 false)/ **showInterviewEval**(默认 true)/ **showInterviewEvalList**(默认 false)/ **showNotes**(默认 false,公开页展示内部备注;洞察不受控始终展示)+ **allowedModules**(快照 ∩ 创建者权限;空=全开;关评论=排除 candidate.reviews)| 公开访问凭证 + 可见性 toggle(详见 §11)。飞书 bot 自动分享按 `feishu.share_defaults`(全局)/ `feishu.share_defaults.u.<uid>`(单人)生效配置建链接 |
| `UploadShareLink` | token/defaultJobId/defaultSource/note/expiresAt/maxUploads/uploadCount/createdBy | **V3** 公开上传镜像 — 招聘官生成 → 候选人本人 / 同事 / 猎头通过短链 `/upload/:token` 上传简历(详见 §11 末尾 11.5)。**飞书 Bot 永久链接**(2026-06-02):/upload 页「更多上传方式」卡片可一键创建永不过期·无上限链接(`duration:"forever"` + `maxUploads:null` + `defaultSource:"飞书自动入库"`),复制 token 填 VPS `.env` 的 `LARK_UPLOAD_TOKEN` 供 lark-ingest 长期使用;前端按 `expiresAt==null && maxUploads==null` 识别为飞书专用,与候选人临时链接(30d/200)分区展示 |
| `InterviewEvaluation` | token/candidateId/interviewId?/jobId?/status/expiresAt + 候选人信息快照 9 字段 + scores(JSON 7 维度) + 纪要 4 段 + totalScore/recommendation + templateVersion/templateFileHash + createdBy/submittedAt/exportedAt/viewCount | **面试评价(2026-05-27)** — 招聘官生成 token → 面试官无登录通过 `/interview-eval/:token` 填表 → 提交后可导出与原 Excel 模板完全一致的 xlsx。状态机:link_sent → draft → submitted → revoked。模板 SHA-256 启动校验。详见 §12.5 与 [`delivery-docs/dev-plans/面试评价模块设计规划.md`](./delivery-docs/dev-plans/面试评价模块设计规划.md) |
| `PerformanceEvaluation` | employeeId · self/managerToken · accessKey hash/enc/fail/lock · scores(7) · areasForImprovement/developmentPlan · signatures · edit quotas · templateVersion=v2 | **员工绩效评价**(2026-07)· 公开 `/performance-eval/:token` + `X-Perf-Access-Key` · 详见 `delivery-docs/src/06_performance_evaluation.md` |
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
| **可见性 toggle** | **showContact** (默认 true): true 时 phone/email **完整展示**(招聘官需真号码联系,简报里的电话/邮箱同步保留);false 时完全不返回 + 简报里联系方式行抹成「[已隐藏]」(标签行内号码/邮箱),前端渲染「分享方已隐藏联系方式」。**showResume** (默认 true): 公开页「查看原始简历」用真实 `<a target=_blank>` 打 `GET /api/public/share/:token/resume/view` → 后端 302 跳转 R2 短时 GET URL(规避微信内置浏览器对异步 `window.open` 的拦截;另保留 `/resume` JSON 端点)。**showAttachments** (默认 false): false 时公开评价表单不显示附件 input,**presigned-url 后端二道防线**也返回 403 `attachments_disabled`。**showNotes** (默认 false): 公开页教育经历后展示**备注**模块(`CandidateNote`,authorName 按 authorId 回溯真实姓名不暴露邮箱),双闸 `link.showNotes && creatorModules.includes("candidate.notes")`。**洞察**(`candidate.insights`)同位置展示但**不设开关、始终可见**。**showReviews**(经 allowedModules 排除 candidate.reviews)/ **showInterviewEval** / **showInterviewEvalList** 同理叠加 effective |

### 11.5 UploadShareLink 公开上传系统(V3, 2026-05-26 上线)

ShareLink 是「候选人简报对外」,UploadShareLink 是镜像反向 — 「外部对内上传简历」。完全独立模型,避免字段语义混用。

公开页 `/upload/:token` **在 AuthGuard 外**, 不依赖 JWT。

| 维度 | 设计 |
|------|------|
| Token 形式 | 24 字节 URL-safe random(`crypto.randomBytes(24).toString("base64url")`)= 32 字符 |
| 有效期 | 默认 30 天 · 复用 share.js 的 `computeExpiresAt`(支持 60s-30d / forever) |
| 上传次数限制 | 默认 200 份 · null=不限 · 达上限返回 410 `link_quota_exceeded` |
| 预填字段 | defaultJobId(关联到 JD,影响新建 candidate.jobId)+ defaultSource(预填的来源,如"罗卡推荐")+ note(给上传者的提示文案,显示在公开页头部 amber 提示卡) |
| 公开页表单 | 文件(必填,≤20MB)+ 姓名(可选)+ 联系方式(可选)+ 来源(可选,覆盖 defaultSource)+ 备注(可选,任意自由文本) |
| 公开 presigned | `/api/public/upload/:token/presigned-url` token-gated 签发,R2 凭证不暴露;key 限定 `resumes/public-uploads/<月度分桶>/<uuid>.<ext>` |
| 公开 submit | `/api/public/upload/:token/submit` 事务内:create candidate(ownerId=link.createdBy,jobId=defaultJobId,source 拼接)→ note 非空时 create CandidateNote(content=备注 + authorName=用户填的姓名 / "公开上传访客")→ uploadCount++ |
| 备注同步 | 公开页"备注"字段写入 CandidateNote 表 → 候选人详情页"洞察+备注"模块的备注卡片直接显示 |
| 二维码生成 | 前端 `qrcode.react` SVG 生成,"保存图片" Canvas toDataURL → PNG download;"重生成" delete + create 新 token |

**安全要点**:
1. token 不可猜(24 字节随机)
2. expiresAt + maxUploads 双重限流,任一上限即 410
3. 公开端点不返回 candidate 详细,只返回 ack { uploadCount, maxUploads }
4. 上传文件强制 `resumes/public-uploads/` 前缀,跟 admin 主桶分离,便于审计
5. candidate.source 自动加 `[公开上传]` 前缀(默认值,defaultSource 不空时不加),让 admin 一眼识别公开上传来源
6. 简化策略:**公开上传不立即跑 LLM 解析**(降级入库 + tags=["待解析","公开上传"]),admin 后续在 Upload 列表点"解析"按钮触发 reparse 异步任务

## 12. 评价对话系统

**1 级嵌套 + 完整审议流**,详细见 [02 API 手册] 的 `/api/candidates/:id/reviews` 与 `/api/public/share/:token/reviews` 端点。

| 能力 | 实现 |
|------|------|
| 提交评价 | 登录(auto authorName)+ 公开(必填 authorName) |
| 附件 | image/file/link · 单条 ≤30MB(后端 422)· R2 直传(presigned)。**公开访客上传受 ShareLink.showAttachments 控制**(默认关) |
| 回复 | 1 级嵌套(`parentId`),禁止 nested-of-nested |
| 批量回复 | 多选 checkbox → 一条评价,`referencedIds[]` 记录所有被引用 |
| 投票 | thumbs-up/down + count + 我的投票高亮 · 登录走 `ReviewVote unique(reviewId,userId)` · 公开走 localStorage + `prevValue` 算 delta |
| 回复 stance | approve/reject/null · 头部 chip 显示 |
| 排序 | 最新/最旧/最赞同/最否决(前端 sort) |
| 可见范围 | public(默认)/internal(仅登录)/admin(仅 ADMIN)· 后端 `internalShape/publicShape` filter |
| 删除流 | 作者请求 → admin 批准 = soft-delete · admin 可直接 soft-delete · admin hide/unhide |
| 实时通知 | 详情页打开后 15s 轮询 · Notification API + Web Audio 双音(A5→E6)|

## 12.5 面试评价系统(V1, 2026-05-27)

公开页 `/interview-eval/:token` **在 AuthGuard 外**, 不依赖 JWT。设计规划见 [`delivery-docs/dev-plans/面试评价模块设计规划.md`](./delivery-docs/dev-plans/面试评价模块设计规划.md); as-built API 见 [`delivery-docs/src/02_api.md`](./delivery-docs/src/02_api.md) §17。

| 能力 | 实现 |
|------|------|
| Token | 24 字节 URL-safe base64 (32 字符), 沿用 ShareLink 设计;`expiresAt` 软过期 + admin 可撤销 |
| 创建邀请 | 候选人详情页右侧 aside「面试安排」与「附件」之间 InterviewEvalCard;招聘官填面试官姓名 + 关联 Interview(可选) + 有效期 → 自动从 candidate 预填 9 字段 |
| 公开填表 | 7 维度评分(1-10) + 4 段纪要 + 实时总分气泡(LiquidLoader)+ 推荐结论;评分标准抽屉;30s 自动保存草稿;移动端响应式。**属地/语言用 chip-style `Combobox`** — 属地 3 组 20 项分组下拉(欧洲/右舵/其他,源自海外研究院人员统计.xlsx),语言 14 项快捷输入,两者均支持自由输入 + Enter 加自定义。**最终意见用 brand 渐变精美卡片**(sparkles icon + ring-2 + 副标题),视觉等级高于其他 3 段。**提交按钮点击前做前端镜像校验**(候选人信息 4 必填 + 7 项评分 1-10 + 最终意见非空)→ 不通过 toast + `scrollIntoView` 滚到错误区,**不弹**确认 Modal |
| 状态机 | `link_sent`(初建) → `draft`(面试官保存过) → `submitted`(已提交,锁定) → `revoked`(撤销);`expired` 由 expiresAt 懒判定 |
| 提交锁定 | 提交后默认锁定,admin PATCH `status=draft` 可退回编辑;二次提交幂等 |
| 模板锁定 | `server/assets/templates/interview-evaluation-v1.xlsx` (SHA-256 `02bf31db…e645c534`),启动时校验,不一致 boot fatal |
| 导出 xlsx | ExcelJS 模板复制 + 精准单元格填充:13 处合并 / 9 个公式 / 数据校验 / 列宽行高 freeze pane 全保留;文件名 RFC 5987 中文编码;DB 兜底存 totalScore/recommendation 不依赖打开端 |
| 公式注入防护 | 所有文本字段开头 `= + - @ \t` 时前缀 `'` 写入 Excel(让 Excel 视为纯文本) |
| 计算逻辑 | `weighted = round(weight * score / 10, 1)`;`total = round(sum(weighted), 1)`;recommendation: `>=85`录用 / `>=75`复试 / `>=60`谨慎 / `<60`不建议 — 前后端公式镜像一致 |
| 权限矩阵 | ADMIN 全权;RECRUITER 自己创建的可查看/撤销/导出;面试官 token 提交后可下载本次评价 xlsx |

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
