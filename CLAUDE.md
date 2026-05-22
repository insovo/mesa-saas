# CLAUDE.md — MESA Recruit

> 这是 **Claude Code 在本项目下的项目级指令**。
> 通用工程约定、目录结构、代码规范、运行方式 **以 [`AGENTS.md`](./AGENTS.md) 为准**，本文件只补充 Claude 特有的工作流偏好。
> 用户的全局偏好（沟通语言、称呼、Priority Order 等）以 `~/.claude/CLAUDE.md` 为准，本项目不重复列出。
> SaaS 演进的分阶段 checklist **以 [`demo.md`](./demo.md) 为权威**，本文件第 §8 节只做 AI 协作守则的索引化补充。

> ℹ️ **关于 Codex CLI**：Codex 默认读取 `AGENTS.md`，**不会**自动读取本文件。本文件里的 Claude 特有偏好仅供 Claude Code 使用；任何对 Codex 也成立的约束，请改写进 `AGENTS.md`。Claude Code 与 Codex 的协作差异速查见 §9。

---

## 1. 一句话项目摘要

MESA Recruit 是一个**无构建**的纯前端 React UI Kit（CDN + Babel Standalone + Tailwind Play CDN），演示 AI 原生招聘产品的点击通流程。所有组件挂在 `window.*`，所有数据挂在 `window.MESA_*`。

详情见 [AGENTS.md §2–§4](./AGENTS.md#2-技术栈与无构建约定重要)。

### 1.1 最终架构（仅作目标，不影响当前改动）

最终形态是部署在香港 D 型 VPS（4 核 8G，免备案）上的 SaaS 应用：

| 层 | 组件 |
|----|------|
| 前端栈 | **Tailwind CSS + React + JS** |
| 接入层 | Cloudflare DNS + CDN → Nginx 反向代理（TLS 终止） |
| 应用 | Docker 容器化的 SaaS 应用 |
| 数据 | PostgreSQL（业务）+ Redis（缓存/队列） |
| 文件 | Cloudflare R2 对象存储 |

> ⚠️ 这只是**最终目标**。当前阶段所有改动仍走 [AGENTS.md §2 「无构建」约束](./AGENTS.md#2-技术栈与无构建约定重要)；
> 任何向最终架构迁移的动作（引入构建工具 / 后端 / 容器化 / DB 等）**必须先得到用户确认**，不要顺手做。
> 完整图与说明见 [AGENTS.md §1.2](./AGENTS.md#12-目标部署架构最终形态)。

---

## 2. 上手动作（开始任何任务前）

1. 读 `AGENTS.md`（架构 / 约定 / 边界）；
2. 读 `ui_kits/mesa-recruit/README.md`（点击通契约与组件清单）；
3. 用 `Read` / `Grep` 摸清相关组件 —— 不要凭印象动手。

---

## 3. 工具与技能使用建议

| 场景 | 优先使用 |
|------|---------|
| 渲染架构图 / 流程图 / 时序图 | `pretty-mermaid` 技能（用户偏好） |
| 浏览器里点击通验证 UI | `webapp-testing` / `dev-browser` / Playwright MCP |
| 查阅 React / Tailwind / Lucide 等第三方文档 | Context7 MCP（`mcp__claude_ai_Context7__*`） |
| 跨文件结构性探索 | `smart-explore` 或 `Grep`；超过 3 次搜索再考虑 `Agent(Explore)` |
| 实施前规划 | `make-plan` / `writing-plans`（仅当任务是多步实施时） |

**不要**：
- 主动启动 ultrareview / 创建 PR / 提交 commit —— 这些动作要等用户明确指令。
- 启 dev server 之外的长驻进程；如确需，请用 `run_in_background`。

---

## 4. UI 改动的验证流程（Claude 必跑）

前端改动**不能只靠静态检查就声称完成**。Claude 改完 UI 必须：

1. 启一个静态服务器：`python3 -m http.server 5173 -d ui_kits/mesa-recruit`（后台运行）；
2. 用浏览器 MCP（Playwright 或 dev-browser）打开 `http://localhost:5173`；
3. 至少跑通 [AGENTS.md §5 自检清单](./AGENTS.md#5-怎么运行--怎么验证) 的 5 步；
4. 如有视觉变化，截图给用户看；
5. 检查 Console 是否有红色报错（Babel 编译错误最常见）。

**无法在浏览器里验证时**：在交付说明里**显式写出**「未在浏览器验证 + 原因 + 风险」，不要含糊带过。

---

## 5. 改动边界回顾（与 AGENTS.md §7 一致）

默认不做（除非用户明确要求）：
- 引入 npm / vite / 任何构建工具；
- 把组件改成 ESM `import/export`；
- 替换 CDN / 升级 React 主版本；
- 改 `uploads/` 里的原始素材；
- 自创 README/Docs / 在仓库根新建 markdown。

---

## 6. 数据与隐私

- `data.js` 是 mock；未来会被 LLM 解析结果替换。改字段前请确认所有消费方（参考 [AGENTS.md §6](./AGENTS.md#6-数据-schema-与变更原则)）。
- API Key（Kimi / DeepSeek）相关 UI 仅保留占位，**永不**写入示例 key。

---

## 7. 沟通风格

- 默认中文，专业术语保留英文（JD、API、CLI、MCP）。
- 简洁直接；交付时输出「改动文件 + 摘要 + 验证结果 + 风险」四件套。
- 不擅自做超出请求范围的「顺手优化」。

---

## 8. SaaS 演进路线图（基于 `demo.md` 6 阶段）

> **权威来源**：`demo.md` 是从「前端 UI Kit demo」到「云端容器化 SaaS」的完整 6 阶段 checklist。本节只补充 **Claude Code 在每个阶段的协作守则**，不复制 demo.md 的具体勾选项。

### 8.1 阶段总览与当前状态

| 阶段 | demo.md 目标 | 当前状态 | Claude 默认动作 |
|------|--------------|----------|------------------|
| ① 本地全栈闭环 | React 路由守卫 + 后端骨架 + PostgreSQL/Redis + 本地联调 | **✅ 已完成**（2026-05-21）：`server/` Fastify+Prisma + `web/` Vite + `docker-compose.dev.yml` PG+Redis，端到端 CRUD 已 Playwright 验证 | 维护 server/ 与 web/ 代码；UI Kit 仍按无构建约束 |
| ② R2 对象存储接入 | Cloudflare R2 + 预签名直传 | **未开始** | 不主动；涉及凭证操作必须先确认 |
| ③ Docker & Nginx 容器化 | 多阶段 Dockerfile + `docker-compose.yml` | **未开始** | 不主动；引入构建工具/容器需用户确认 |
| ④ Cloudflare 边界 + VPS 加固 | DNS/CDN/WAF + UFW 隔离 + 端口不外暴 | **未开始** | 涉及生产服务器，**全部需用户授权后再执行** |
| ⑤ CI/CD + 数据灾备 | GitHub Actions + `pg_dump` + R2 备份 | **未开始** | 不主动；密钥/Secret 永不写入代码 |
| ⑥ 交付物打包 | `delivery-docs/*.docx` 4 件套 | **未开始** | 文档生成走 `docx` 技能，不要手撸 Markdown 充数 |

### 8.2 阶段触发与边界（重要）

**Claude 在每个阶段触发前，必须先确认两件事**：

1. **「我们要进入阶段 X 吗？」**——任何跨越阶段（如从①引入后端、从③引入 Docker）的动作，都要**先在回复里写明影响范围 + 回滚路径**，得到用户「继续」之后再动手。这条覆盖 `CLAUDE.md §5` 和 `AGENTS.md §7` 的「默认不做」清单。
2. **「这个阶段对应 demo.md 的哪几条勾选项？」**——交付时必须按 demo.md 原条目列出本次完成 / 未完成 / 跳过的项，不要凭印象写「都做完了」。

### 8.3 各阶段的额外守则

- **阶段 ①**：后端框架与 ORM 选型属于架构决策，**必须由用户决定**；Claude 只能在用户给出选型后落实。`.env` 文件**绝对不入 Git**，Claude 不要把示例值写成真实凭证。
- **阶段 ②**：R2 凭证、Access Key、Secret 不写入任何文件（包括示例、注释、commit message）；上传逻辑统一走「后端签发预签名 URL → 前端 PUT 直传」，不要让前端持有长期凭证。
- **阶段 ③**：Dockerfile / `nginx.conf` / `docker-compose.yml` 是高风险配置，改完必须本地 `docker-compose up --build -d` 跑通；端口映射只暴露 `80/443`，**PostgreSQL 5432 与 Redis 6379 严禁映射到宿主机公网**。
- **阶段 ④**：VPS 防火墙 / Cloudflare 配置 / SSL 模式属于**生产环境改动**，Claude 在没有用户明确授权前**不执行任何 SSH 命令、不调用 Cloudflare API**。
- **阶段 ⑤**：CI/CD 的 secrets 一律走 GitHub Actions Secrets / 服务器 `.env`；Claude 不要把任何凭证占位符写成可猜测的真实值；备份脚本提交前必须本地 `bash -n` 至少做语法检查。
- **阶段 ⑥**：4 份 `.docx` 文档（架构 / API / 部署 / 运维灾备）的生成**优先调用 `docx` 技能**；目录固定为仓库根 `/delivery-docs/`；交付前与用户确认每份的覆盖范围，避免重复或漏项。

### 8.4 演进过程中的「无构建 UI Kit」约束

阶段 ①~⑥ **不取代**本文件 §5 的边界。在阶段 ① 真正落地之前，`ui_kits/mesa-recruit/` 仍然按「无构建」约束改动；任何打算把 UI Kit 改成 ESM/构建产物的动作，都必须**显式声明这是阶段 ① 或阶段 ③ 的一部分**，并取得用户确认。

---

## 9. Claude Code vs Codex CLI 差异速查

本仓库同时被 Claude Code 与 Codex CLI 使用。两者在能力、协议与默认行为上有差异，AI 自身要清楚自己「能做什么、不能做什么」：

| 维度 | Claude Code | Codex CLI |
|------|-------------|-----------|
| 默认读取的项目指令 | `CLAUDE.md` + `AGENTS.md` | **只读 `AGENTS.md`** |
| 浏览器自动化 | Playwright MCP / `dev-browser` / `webapp-testing` 技能 | 通常没有浏览器 MCP，需用户在终端配合截图 |
| 文档/库查询 | Context7 MCP (`mcp__claude_ai_Context7__*`) | 一般无 Context7，依赖搜索引擎或 `WebSearch` |
| 长任务后台跑 | `run_in_background` + Monitor 通知 | 通过 shell `&` 自管，无事件流回灌 |
| 技能生态 (Skills) | 丰富（`pretty-mermaid` / `docx` / `pdf` / `webapp-testing` 等） | 无 Skills 概念，等价能力需脚本化 |
| 子代理 (Subagents) | 支持 `Agent` 工具拆分调研/实现 | 不支持，要靠多轮对话或本地分支 |

**对 AI 自己的行动指导**：
- **Claude Code**：UI 改动必须按 §4 在浏览器里点一遍（用 Playwright/dev-browser）。多步任务优先用 `make-plan` / TaskCreate 跟踪。
- **Codex CLI**：UI 改动如果**无法**在浏览器里验证，必须在交付说明里**显式写出**「未在浏览器验证 + 原因 + 风险」，由用户人工补验。任何「我以为」的视觉效果都要打折汇报。
- **两者共同遵守**：`AGENTS.md` 的全部约束；不主动 `git commit` / `git push` / 创建 PR；涉及生产环境的改动一律先取得用户授权。
