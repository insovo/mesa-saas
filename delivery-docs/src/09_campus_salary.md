# 飞书校招自动定薪：实现与本地验证

更新：2026-10-23。状态：**实现及本地验证完成**。政策来源为用户提供的《奇瑞汽车2027届定薪政策执行版》五页PDF；解密口令不持久化。

## 1. 使用结果

管理员配置启用的飞书群后，将单人简历文件发到群里即可自动处理。每份结果回复到原消息，依次列出：

1. 简历中可追溯的候选人姓名、教育链、学校、专业、毕业年份、排名原文，以及录用合同签署地、组织/岗位来源。
2. 当前事实和已核对字典支持的固定月薪、政策区间或一人一议，附政策页码、命中规则和原文证据。
3. 附条件情景：确认城市/专业分类后的月薪，或达到排名/竞赛/科研条件时的专项奖金标准；每项带条件及证明材料。简历自述与条件相符时提示对照，仍需证明范围与时效。
4. 尚缺资料与不明确的执行口径。未知不填零，不猜金额。

飞书群卡片采用精简的两段结构：先给姓名、定薪结果、安家费和简明依据，再列教育链、专业类别、Base地及汇总/本人详情链接；本科等历史经历明确标注不参与本次专业及成绩判断。完整条件情景、原文证据、材料和历史在网页详情保留，群里不再逐项展开或转发简历原文/联系方式。

具体金额由服务器私有政策配置计算，公开仓库及本文不包含真实薪资表或政策金额示例。固定月薪与附条件的专项奖金分开展示，简历排名自述仍需对应证明。定薪结果展示“政策月薪 × 已确认薪数”；薪数来自HR确认的群配置或本次补充，不从PDF推导。缺薪数保留待补充，但不隐藏已确定的月薪。

## 2. 一次发送10份与重复上传

- 接收进程使用3个并行下载/提交槽位，其余文件等待。后台复用BullMQ队列和 `AI_WORKER_CONCURRENCY`；每份简历独立执行、记录状态并回复原消息。不能承诺10份同时完成或固定完成时长，实际受文件、OCR与模型耗时影响。
- 一份失败不阻塞其余文件；处理最多3次尝试，最终失败生成待补充结果。回显失败独立重试，不重新抽取或计费。
- 同一群+message_id唯一，事件重投不重复创建任务。
- 同群内姓名与原文完整手机号/邮箱可靠匹配，或同姓名且文件指纹一致时，以**飞书消息发送时间**最新文件为准。相同时间按接收时间及ID确定稳定顺序；消息无发送时间时回退首次接收时间。
- 短事务内使用同群数据库锁，防止较慢的旧任务覆盖新简历。旧文件、原文事实和测算历史保留；未发送的旧任务回显停止，旧卡片的补充操作拒绝继续修改。已发出的旧卡片仍在聊天中，后续新结果及详情中的最新版本为准。
- 新简历重新抽取，不将旧版事实或人工修正自动带入新文件。每份文件内的人工作业产生新的测算revision，旧revision保留。
- 仅同名、掩码联系方式、姓名或联系方式冲突不自动合并，单独标记待核实。不同群有独立录用上下文，不跨群合并。
- 联系方式索引为基于现有应用密钥的HMAC，不作为Jev输入。轮换应用密钥后，历史联系方式索引需重新识别才可继续匹配；同文件指纹匹配不受影响。
- 10份指10个独立file消息。ZIP、合并转发、多候选人混在一个文件、原生图片消息不在本轮支持范围；JPG/PNG以文件发送可处理。
- 已接收进数据库的任务由持久化记录与Redis恢复；尚未提交后端的监听器内存队列如遇强制终止，需事件重投或重新发送。

## 3. 汇总表与详情

菜单「候选人」→「校招定薪」→「面试排队」，页面 `/campus-salary`。

表格列：候选人/文件、学历院校、专业薪资档、合同签署地、当前定薪建议（月薪×薪数）、专项奖金状态、处理与身份核对状态、来源群与发送时间。每页30条，默认显示当前有效文件，可勾选「包含历史简历」。尚未完成识别的记录可能暂时并列，身份匹配后只留最新有效版。

点击行或候选人姓名打开详情弹窗，可查看四段结果、原文证据、测算revision与同人多文件上传历史。历史简历标注「已有更新」并可打开最新文件。补充/更正需要填写依据，采用revision乐观锁，过期修改返回409。群配置变化只用于后续新文件；旧结果保留输入快照。

权限沿用campus页面入口，后端再按群负责人或成员限制列表/详情/修改；管理员可维护群与院校字典。飞书操作人必须映射到有效且已授权的MESA账号，并匹配群及租户；旧回调不能越权读取或更正资料。

## 4. 定薪判断

`server/src/lib/campusSalary/policy.js`从服务器私有配置读取薪资表、博士区间及特定院校规则，SHA256指纹绑定配置版本。公开仓库和镜像仅包含通用逻辑与明确标注的虚构测试政策。规则引擎 `engine.js` 是纯函数，不调用模型、数据库或网络。

院校内置字典使用教育部211/985名单精确学校名称及C9覆盖，共112条；来源URL与版本保存在 `schools.json`。更名、分校、一本/二本、QS学校及榜单年份由管理员在「院校依据」填写来源，未匹配不靠模型记忆归类。

学校、学历、专业、成绩及排名统一取当前最高学历对应经历；其他教育经历只保留为历史，海外本硕组合依政策单独核对。成绩原文与排名分开，不能把绩点或百分制成绩换算成排名；同校本硕也按学历分段，不跨经历借用排名。旧版事实可从保存的原文证据恢复成绩，无需再次OCR。控制工程、控制科学与工程、自动化等明确对应专业按P1特殊专业范围归入稀缺/热门，研究方向出现AI不改变最高学历专业列。学科对应依据：[教育部专业领域调整表](https://www.moe.gov.cn/srcsite/A22/s7065/202506/t20250611_1193766.html)。

群配置和逐人补充支持 `context.salaryFactor`（大于0的数值或null）；结果 `compensation` 保存薪数及计算年额，区间保留上下限，奖金单列。输入快照保存HR口径来源和引擎版本，更新群薪数不会覆盖旧结果，已有记录须生成新revision重算。

下列情况明确保留待补充：学校或学历/年份未知、多个最高学历、合同地不明/冲突、专业薪资列不明、海外本硕组合或QS版本缺失、海外2026毕业但仅有2027金额、C9起薪仅作为上限、博士QS500重叠端点、特定院校与一线表衔接不明、指定组织/专业认证未确认等。博士区间不插值选点，C9稀缺竞争方向按一人一议。

实习标准与安家费单列，不能充当固定月薪组成。专项奖金只提供当前政策所支持的条件情景，不凭简历成绩自述直接承诺已获得，也不在多个标准之间猜档。

## 5. 复用与停用边界

复用现有lark-cli长连接/下载、自建机器人与公开卡片回调、TextIn/文档抽取、Kimi结构化事实、R2、Redis、AI worker和MESA认证。新增内部签名接口，不新增第三方依赖或密钥。

新机器人链路不创建Candidate、Job、ShareLink，不跑旧JD评分。旧JD/解析卡片按钮返回停用提示；旧解析完成通知不再创建自动分享。网站招聘上传、JD评估、人工分享与历史数据保留。

Jev复用现有TypeSafe客户端，但仅对有证据的专业/博士方向输出结构化分类建议。要求固定版本，校验选项、概率与置信度；浮动别名、不可用和证据不足均保留未知。**中文业务样本尚未校准，建议不自动驱动金额**，金额来自明确规则或人工确认的类别；无JD分数降级路径。

## 6. 数据与API

新增四表：`salary_groups`、`salary_schools`、`salary_submissions`、`salary_evaluations`。第二个新增迁移补充文件发送时间、HMAC身份索引、旧版指向与去重状态。没有改历史迁移文件。

- `GET /api/campus-salary/metadata|groups|schools|submissions`
- `POST /api/campus-salary/groups|schools`（管理员）
- `PUT /api/campus-salary/groups/:id`（管理员、revision）
- `GET /api/campus-salary/submissions/:id`（含文件和测算历史）
- `PATCH /api/campus-salary/submissions/:id`（理由、revision、context及confirmed，202异步）
- `GET /api/internal/campus-salary/groups`、`POST /api/internal/campus-salary/submissions`（现有LARK_APP_SECRET做HMAC，绑定时间/方法/路径/完整正文）
- `POST /api/feishu/card-callback`（现有Verification Token及可选Encrypt Key）

内部简历最大20MB，验证扩展名、MIME、文件头及hash；附件存独立R2前缀 `salary-resumes/`。服务端校验群启用状态，入队失败由数据库记录补偿。worker启动及每30秒恢复排队任务、未入队文件和回显待投递记录；回显采用lease与飞书请求UUID防止普通重投重复发送。历史输入保留原始事实、人工补充、字典、政策指纹、群版本及录用上下文。

## 7. 本地验证与复现

本轮验证使用专用本地PostgreSQL16、Redis7、真实Prisma迁移、真实BullMQ、Fastify/JWT及浏览器；OCR、Kimi、Jev、R2和飞书回显使用合成数据/替身，不读取生产数据库，不向真实群发消息。

通过项：

- 53个迁移在专用数据库成功执行；Prisma validate/generate成功。
- 9项规则测试（内含80个本硕单元格、博士/海外/特定院校、空值与冲突、条件奖金、原文证据、Jev固定版本等）。
- 1项真实数据库/队列集成测试：自动回显、补充重算、版本冲突、权限、重复消息、旧链路无副作用、回显独立重试、任务恢复；其中一次并发提交10份，全部进入终态，3份同人乱序版本选中最新，其余独立保留，同名不同身份不合并。
- 5项监听器测试，其中12条接收事件限并发3，一份失败后其余11份继续完成；刚启用的群无需等待旧缓存过期。另有7项现有Jev/文档清洗回归测试通过，合计22项通过。
- 前端生产构建成功；Chrome实点汇总表→详情→更正→历史文件/测算切换→当前版，群配置和院校依据保存、手机390px表格横向滚动/详情、Esc关闭，无页面异常。

运行规则与监听测试：

```bash
cd server
node --test src/lib/campusSalary/engine.test.js
cd ../tools/lark-ingest
npm test
```

完整联调只在已迁移的独立本地测试库运行（测试会检查库名及本机地址）：

```bash
cd server
SALARY_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/salary_test \
SALARY_TEST_REDIS_URL=redis://127.0.0.1:56389 \
node --test src/lib/campusSalary/engine.test.js src/lib/campusSalary/integration.test.js
```

测试使用的专用容器与页面夹具在交付前清理，复现时需自行启动专用PG/Redis并执行 `prisma migrate deploy`。不要将测试URL指向现有业务库。

## 8. 上线与回退

2026-10-23已通过既有PR流程上线，数据库迁移、两节点应用健康、真实TextIn/Kimi解析及R2往返完成验证，指定群已启用。薪数、合同城市等录用口径通过群配置保存；飞书操作人映射须由管理员配置，网站补充重算可独立使用。

回退可先停用定薪群及监听器，再回退对应应用镜像；新增表及历史revision保留。修改群配置前保留原值，错误配置可恢复并为受影响记录生成新revision。

真实多人批量上传仍受飞书、OCR和模型限流影响，任务保留在队列并逐份完成；外部服务失败时保留待补充/失败，不以模型分数推算金额。

## 9. 本轮改动文件清单

| 范围 | 文件 |
|---|---|
| 规则与处理 | `server/src/lib/campusSalary/policy.js`、`schools.json`、`engine.js`、`facts.js`、`semantic.js`、`versions.js`、`service.js`、`cards.js` |
| 自动化验证 | `server/src/lib/campusSalary/engine.test.js`、`integration.test.js`；`tools/lark-ingest/salary-client.test.mjs` |
| 数据库 | `server/prisma/schema.prisma`；新增 `20261023090000_campus_salary/migration.sql`、`20261023100000_salary_resume_versions/migration.sql` |
| 接口及worker | `server/src/routes/campus-salary.js`、`routes/feishu.js`、`src/index.js`、`src/worker.js`、`lib/campusInterviewerApi.js`、`lib/feishuNotify.js`、`plugins/r2.js` |
| 接收机器人 | `tools/lark-ingest/ingest.mjs`、`salary-client.mjs`、`Dockerfile`、`package.json`、`.env.example`、`README.md` |
| 页面 | `web/src/pages/CampusSalary.jsx`、`ShareSettings.jsx`、`web/src/components/ShareDefaultsPanel.jsx`；复用已有菜单和路由 |
| 配置及说明 | 根 `.env.example`、`docker-compose.yml`、`README.md`、项目 `AGENTS.md`、`CLAUDE.md`、`.claude/skills/mesa-subsystems/SKILL.md`、交付文档05/09、`校招定薪规划/02_本地实现与验证.html`及源文件 |

实现经PR #262合并并上线；后续修复沿用PR、CI及自动部署流程。仓库原有的其他工作保留，临时验证文件与容器在交付前清理。

## 10. 内部政策私有配置

仓库为公开仓库，真实政策和原始规划不提交。生产通过服务器 `.env` 中的 `SALARY_POLICY_B64` 加载内部JSON，backend与worker共享同一份配置，第二节点沿用安全环境同步。该值只在服务器落地，不进入提交、CI变量、镜像或日志。本地政策保存在已忽略的 `server/.salary-private/`；`SALARY_POLICY_FILE` 可指向该目录中的政策JSON。没有有效政策时，定薪返回待补充，不使用测试金额。

公开测试使用 `fixtures/synthetic-policy.json` 的虚构数字与虚构特定院校，不代表任何真实薪资。原80个政策单元格的独立回归样本仅在本地私有目录运行。修改配置前保存服务器0600备份，使用stdin传入政策，按既有流程重建应用使新环境生效。
