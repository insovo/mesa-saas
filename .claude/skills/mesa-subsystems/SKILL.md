---
name: mesa-subsystems
description: MESA Recruit 各子系统的实现速查(候选人详情 / 解析流水线 / 上传与公开上传 / 分享 ShareLink / 评价对话 / 面试评价 / 绩效评价 / 入职 / 飞书入库 / TextIn+Kimi+Jev 三层评估等)与 ShareLink、UploadShareLink、评价、面试评价的设计细节。改动这些模块、排查其行为或需要知道某能力是否已存在时读取。
---

# MESA Recruit 子系统速查

> 由根 CLAUDE.md §1.1 / §11 / §11.5 / §12 / §12.5 迁出(2026-10-07),内容原样;改模块时同步更新这里。

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
| **TextIn + Kimi + Jev 三层解析评估(2026-09-20)** | 文档层 `lib/textin.js`(xParse,任意格式 → Markdown,`textin.enabled` 开关,失败回退 pdftotext → Kimi Files;`ResumeParse` 表按 sha256 幂等,reparse 复用不重复计费)→ 理解层 `lib/kimi.js` prompt v2 输出 **profile(resume.v1)**(教育含专业课程/GPA、工作/实习分列、项目、分层技能、语言等级、证书、**校园经历:学生干部/社团/竞赛/奖学金**、科研、奖项,tag 只取 `lib/taxonomy/*.json` 词表 id)→ `lib/profile/normalize.js` 闸门(PII 白名单/词表归一/日期反幻觉/占位名)+ `profileToLegacy` 映射旧 16 键(assembleSummary / 旧列零改动)→ `lib/profile/derive.js` 代码派生(总年限/行业年限/领域年限/海外/管理/跳槽/时间线/语言阶梯/资料质量)→ 规则层 `lib/evaluation/hardFilter.js`(MUST 三态 PASS/FAIL/UNKNOWN,缺信息不判死,年龄性别 INFO 不评估)→ 评估层 `lib/jev.js`(直连 api.typesafe.ai,noul/score 题,退避/缓存/并发/脱敏,`lib/evaluation/questions.js` 由 `Job.evaluationModel` 生成题目 + 固定题稳定性/信息充分/夸大)→ `composite.js` 代码加权 + A/B/C/D + 置信门控 → 报告层 Kimi 只解释不改分,引文校验(`report.js`)→ `CandidateEvaluation` 逐次快照 + Candidate 旧列快照。编排 `lib/evaluation/pipeline.js`(mode create/full/reextract/reevaluate/report,task.stages 进度);Jev 失败自动回退 legacy `matchAgainstJob`;`jev.mode=shadow` 双写不切 UI。JD 侧 `Job.jdFacts`(jd.v1,`lib/jd/normalize.js`)+ `Job.evaluationModel`(HR 模板 `lib/evaluation/templates.js` 定 tier/权重,Kimi 只补题目措辞),首次评估懒生成。端点:`/resumes/parse{mode}` `/resumes/match`(改异步 202)`/resumes/evaluate-batch` `/resumes/candidates/:id/report` `/candidates/:id/profile|evaluations|evaluations/current/override` `/jobs/:id/extract-facts|evaluation-model/suggest` `/jobs/evaluation/templates` `/jobs/taxonomy/:kind` `/system/settings/textin|jev/test` `/system/providers`。设计文档:`textin+kimi+jev架构/*.html`(00 方案 / 02 Jev / 03 抽取 / 04 实施记录) |
| **校招模块(Phase 0–3,2026-10-08)** | 后台 `/campus`(pageKey `campus`)包含**台账**(专场选择 + 6 KPI + 服务端筛选 + 表格 + 学生抽屉 + 登记学生 + 批量改投递状态 + xlsx 导出)· **专场**(新建 / 编辑 / 上线互斥 / 结束 / 草稿 / 删除 + 岗位配置 onsite/referral + 参与匹配 + 排序 + 一键生成校招评价模型 `tpl.campus.general` + 学生端二维码 `/campus/:slug`)· **设置**(admin:并发闸 / 学生 JWT TTL / 验证码限流 / 确认页提示语 / 电脑上传兜底)。数据:`campus_sessions / campus_session_jobs / campus_applicants / campus_resume_versions / campus_applications / campus_match_runs` 六表(`schema.prisma` 末尾),Candidate / Job 不加列;学生 ↔ Candidate 一对一(`source=校招·<专场>`,tags 含「校招」,ownerId=专场创建者),同手机号跨专场复用同一 Candidate。**上传即抽取**:`lib/campus/extract.js` 用 `runPipeline(mode=reextract, skipEvaluate=true)` 只跑 TextIn+Kimi 不评估,进程内并发闸 `campus.match.concurrency`,完成回填 Candidate 与学生档案(只补空);`CampusResumeVersion.parseStatus` pending/running/done/failed/skipped 驱动台账「解析中」轮询。规则:每专场投 ≤`maxApplyJobs`(撤回/未通过不占额)、传 ≤`maxResumeUploads`+学生级 `extraUploads`、`scoreFloor` 为学生端展示下限(内部保留原始分)。权限模块键 `campus.manage`(专场/岗位/设置)、`campus.export`(含联系方式导出),联系方式打码受 `candidate.contact`。路由 `routes/campus.js`;前端 `pages/Campus.jsx` + `components/campus/*`;常量 `constants.js` CAMPUS_*。**学生端(Phase 1,免登录)**:`routes/campus-public.js` `/api/campus/public/*`(首次上传勾选告知 → `POST /auth/start` 匿名建档,学生 JWT `aud=campus-public` 30d,`plugins/jwt.js` 后台 authenticate 拒绝该 aud;限流档 90/min;手机 / 邮箱在 `contact-confirm` 采集,`CampusApplicant.phone` 可空且非唯一;换设备「找回记录」`/auth/recover/send-code|verify` 用 手机号 + 邮箱验证码(`verificationCodes` purpose `CAMPUS_RECOVER`)接回会话,不是登录);入口三链接 首页 / `jobs` / `match`(后台专场二维码弹窗三入口 + 下载 PNG);页面 `pages/campus/public/*`(路由 `/campus/:slug/*` 在 AuthGuard 外,`lib/campusApi.js` 独立 axios,token `mesa.campus.token.v1`,Provider `ready` 标志防 me 未加载误跳);门禁 `gatePath`:有简历(无会话 → 上传页)→ 已确认联系方式,JD 页 `?apply=1` 回跳自动投递;上传 presigned 直传 + 浏览器 sha256 去重;确认页 2s 轮询 `parse-status` 预填学校 / 专业。**后台任务与取消**:抽取 / 匹配任务与页面无关,关页不中断;`TaskBanner` 提示条 + 协作式取消(`parseTaskStore.requestCancel` → pipeline 四个 `assertNotCancelled` 检查点 → `status=cancelled` 不落库;`extract.cancelExtraction` 版本立即标 `cancelled`;学生 `POST /resumes/:id/cancel-parse|reparse`,HR `POST /applicants/:id/resumes/:vid/cancel`)。**智能匹配(Phase 2)**:`lib/campus/match.js` `startMatchRun` → 并发闸 → 版本未解析先 `executeExtraction` → 逐岗位 `runPipeline(mode=reevaluate, detached, skipReport)`(pipeline 新开关:只写 `CandidateEvaluation(isCurrent=false)`,不动候选人主投递)→ `buildReasons` 代码生成理由 → 现场优先 / 原始分降序 → `CampusMatchRun.results` 快照;`progressOf` 进度映射;学生端 `/match-runs*`、HR `/applicants/:id/match-runs*`;`CampusMatch.jsx` 进度球 + 结果页,投递 `source=match` 带分。**联动(Phase 3)**:候选人详情 `CampusCandidateCard`(`/campus/by-candidate/:id`);现场面试单条 / 批量(`/applications/:id/interview`、`/applications/bulk-interview` → Interview 线下 + 投递现场面试 + 候选人面试中);通过 `advance` → 待入职 + employee;数据看板 `CampusStats`(`/sessions/:id/stats`);电脑端上传链接 `pcUploadToken`(`/sessions/:id/pc-upload-link`,二维码第四入口,学生首页复制)+ 抽屉「合并电脑端上传」(`/applicants/:id/merge`)。设计:`校招模块/校招模块设计规划.html` |
| **校招岗位 tab(2026-10-08)** | `/campus` 新增「岗位」tab,按专场新建 / 编辑共享 JD、加入已有岗位、类型 / 匹配 / 排序 / 移除与学生端预览。校招 JD 与模型生成走 `campus.manage`;新建给创建者补岗位数据范围,已有岗位加入遵循原数据范围。模型每次抽取最新 JD,乐观锁防止生成期间的旧模型覆盖;JD 编辑后手动重新生成。详见 API §19.2 与校招设计 §6.4 |
| **校招面试官角色(2026-10-08)** | `Role.CAMPUS_INTERVIEWER` 用管理员设置的唯一 `username` 和密码登录。默认仅有 `candidates` / `candidate.detail`,候选人范围由后端固定为 `campusApplicant isNot null`;可删除范围内候选人(级联删除关联校招登记和投递)。管理员在 `/users` 勾选 `campusTabs` 授予 `ledger / sessions / jobs / stats / settings`,页面和 `/api/campus/*` 路由双重限制。其他业务 API 由 `plugins/jwt.js` 的角色白名单拒绝;专场/岗位 tab 对应可管理,设置只读;台账导出不开放。详见 API §2.3。 |



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
| 公开填表 | 7 维度评分用 **拖动进度条**(细步进 + 1–10 整数落盘)+ Codex 填充气泡 + 4 段纪要 + 实时总分球(LiquidLoader,拖动中 float scrub 连续更新)+ 推荐结论;评分标准抽屉;30s 自动保存草稿;移动端响应式。交互规范见 [`delivery-docs/dev-plans/评分拖条与填充气泡交互规范.md`](./delivery-docs/dev-plans/评分拖条与填充气泡交互规范.md)。**属地/语言用 chip-style `Combobox`** — 属地 3 组 20 项分组下拉(欧洲/右舵/其他,源自海外研究院人员统计.xlsx),语言 14 项快捷输入,两者均支持自由输入 + Enter 加自定义。**最终意见用 brand 渐变精美卡片**(sparkles icon + ring-2 + 副标题),视觉等级高于其他 3 段。**提交按钮点击前做前端镜像校验**(候选人信息 4 必填 + 7 项评分 1-10 + 最终意见非空)→ 不通过 toast + `scrollIntoView` 滚到错误区,**不弹**确认 Modal |
| 状态机 | `link_sent`(初建) → `draft`(面试官保存过) → `submitted`(已提交,锁定) → `revoked`(撤销);`expired` 由 expiresAt 懒判定 |
| 提交锁定 | 提交后默认锁定,admin PATCH `status=draft` 可退回编辑;二次提交幂等 |
| 模板锁定 | `server/assets/templates/interview-evaluation-v1.xlsx` (SHA-256 `02bf31db…e645c534`),启动时校验,不一致 boot fatal |
| 导出 xlsx | ExcelJS 模板复制 + 精准单元格填充:13 处合并 / 9 个公式 / 数据校验 / 列宽行高 freeze pane 全保留;文件名 RFC 5987 中文编码;DB 兜底存 totalScore/recommendation 不依赖打开端 |
| 公式注入防护 | 所有文本字段开头 `= + - @ \t` 时前缀 `'` 写入 Excel(让 Excel 视为纯文本) |
| 计算逻辑 | `weighted = round(weight * score / 10, 1)`;`total = round(sum(weighted), 1)`;recommendation: `>=85`录用 / `>=75`复试 / `>=60`谨慎 / `<60`不建议 — 前后端公式镜像一致 |
| 权限矩阵 | ADMIN 全权;RECRUITER 自己创建的可查看/撤销/导出;面试官 token 提交后可下载本次评价 xlsx |
