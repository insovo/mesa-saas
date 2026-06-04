# MESA Recruit

AI 原生招聘 SaaS — 简历自动解析、候选人全生命周期管理、岗位/部门/员工组织视图、AI 标签与 JD 匹配度评分。

> 详细架构、API、部署与运维手册见 [`delivery-docs/`](./delivery-docs)。

## 一分钟跑起来(本地开发)

```bash
# 1) 启 PostgreSQL + Redis(127.0.0.1 only,不映射公网)
docker compose -f docker-compose.dev.yml up -d

# 2) 后端
cd server
npm install
cp .env.example .env
# 用 openssl rand -hex 32 生成 JWT_SECRET 替换占位
nano .env
npx prisma migrate dev
npm run prisma:seed
npm run dev
#   ► http://127.0.0.1:3001 (API)

# 3) 前端(新终端)
cd web
npm install
npm run dev
#   ► http://127.0.0.1:5173 (Vite dev,自动 proxy /api)
```

默认账号:`admin@mesa.local / mesa-dev-2026`

## 多任务并行开发(git worktree)

需要同时修多个问题又不想互相污染 working tree 时,**统一**用 git worktree:

```bash
# 命名规则: .worktrees/<分类>/<任务>,分类 = feature / fix / hotfix / chore / docs
git worktree add .worktrees/feature/upload  -b feature/upload  origin/main
git worktree add .worktrees/fix/jwt-renew   -b fix/jwt-renew   origin/main

# 进 worktree 开发(各自独立 node_modules / .env / web/.env 含 VITE_DEV_PORT)
cd .worktrees/feature/upload
npm install   # 首次需要装

# 改代码 → commit → push feature 分支 → PR → merge → 自动部署
# main 已加 branch protection (3 status check 必过), 不能直接 push origin main
git push -u origin feature/upload
gh pr create --base main --head feature/upload --title "..." --body "..."
gh pr checks <num> --watch
gh pr merge <num> --merge --admin

# 清理
git worktree remove .worktrees/feature/upload
git branch -d feature/upload
```

端口分配登记表见项目根 [`.worktree-ports.json`](./.worktree-ports.json) — 多 worktree 并行时各占 slot,避免 3001/5173 冲突。

完整流程(含 CI/CD 衔接 + 多 AI 协作约束 + 踩坑速查)见 [`delivery-docs/src/03_deploy.md` §5.5](./delivery-docs/src/03_deploy.md)。

> `.worktrees/` 和 `.claude/` 都已在 `.gitignore`,零误推风险。**禁止**把 worktree 放在 `.claude/worktrees/`(Claude Code 工具默认路径,不符合本项目约定)。

## 一键拉起完整生产栈(本地验证)

```bash
cp .env.example .env
# 至少填: POSTGRES_PASSWORD, JWT_SECRET, WEB_ORIGIN
docker compose up --build -d
docker exec mesa-server node prisma/seed.js
#   ► http://localhost (Nginx → Fastify → PostgreSQL + Redis)
```

## 项目结构

```
mesa/
├── server/                  # Fastify + Prisma 后端 (含 lib/{kimi,derived,parseTaskStore}.js)
├── web/                     # Vite + React + Tailwind 生产前端 (V2 三列布局候选人详情)
├── docker-compose.dev.yml   # 本地 PG + Redis
├── docker-compose.yml       # 生产 5 容器编排
├── .github/workflows/       # CI(build) + Deploy(GHCR + SSH)
├── ops/
│   ├── backup.sh            # pg_dump → R2
│   ├── restore.sh           # R2 → pg_restore
│   ├── crontab.example      # 每日 03:00 备份
│   └── runbook_cloudflare_vps.md   # 阶段④ 生产硬化 SOP
└── delivery-docs/           # 4 份交付文档(.docx + src/*.md)
    ├── 01_系统架构与网络拓扑设计说明书.docx
    ├── 02_后端标准API接口参考手册.docx
    ├── 03_生产环境云端部署与CI-CD配置手册.docx
    └── 04_系统日常运维与数据灾备恢复手册.docx
```

## 演进路线(对照 `demo.md`)

| 阶段 | 状态 |
|------|------|
| ① 本地全栈闭环(server + web + dev compose) | ✅ |
| ② Cloudflare R2 对象存储 | ✅ |
| ③ Docker + Nginx 容器化(生产 compose) | ✅ |
| ④ Cloudflare DNS/WAF + VPS 加固 | ✅ |
| ⑤ CI/CD(GitHub Actions)+ 容灾备份 | ✅ |
| ⑥ 交付文档 4 件套(`delivery-docs/*.docx`) | ✅ |
| ⑦ V2 设计稿合入(候选人详情三列布局 + 15 新组件 + LiquidLoader 全站) | ✅ |
| ⑧ 后端 DTO 扩展(Candidate/Job/Interview 共 23 V2 字段 + LLM 写新字段) | ✅ |
| ⑨ Reparse 异步任务化(POST 立即 202 + 前端轮询,绕 Cloudflare 100s 上限) | ✅ |
| ⑩ Kimi 鲁棒性(4 层 JSON fallback + jsonrepair + 429/5xx 指数 backoff retry) | ✅ |
| ⑪ 简历解析流水线(PDF 优先本地 layout 抽取 + Kimi fallback;parseResume 产简历事实字段;matchAgainstJob 只产 JD 评估) | ✅ |
| ⑫ ShareLink 可见性 toggle(showContact / showAttachments) + 面试 modal 动态字段 + ReparseConfirmModal 前置 JD 确认 | ✅ |

## License

私有项目,未授权请勿分发。
