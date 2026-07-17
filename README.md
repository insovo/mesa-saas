# MESA Recruit

AI 原生招聘 SaaS — 简历自动解析、候选人全生命周期、岗位/部门/员工组织视图、面试评价、**员工绩效评价**、飞书自动入库、AI 标签与 JD 匹配。

> 详细架构、API、部署与运维手册见 [`delivery-docs/`](./delivery-docs)。  
> **权威源**为 `delivery-docs/src/*.md`;正式 `.docx` 由 Markdown 生成交付。规划稿在 `delivery-docs/dev-plans/`(根目录同名 `.md` 为历史副本,以 `dev-plans/` 为准)。

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

完整流程见 [`delivery-docs/src/03_deploy.md` §5.5](./delivery-docs/src/03_deploy.md)。

> `.worktrees/` 和 `.claude/` 都已在 `.gitignore`。**禁止**把 worktree 放在 `.claude/worktrees/`。

## 一键拉起完整生产栈(本地验证)

```bash
cp .env.example .env
# 至少填: POSTGRES_PASSWORD, JWT_SECRET, WEB_ORIGIN
docker compose up --build -d
docker exec mesa-server node prisma/seed.js
#   ► http://localhost (Nginx → Fastify → PostgreSQL + Redis + …)
```

## 项目结构

```
mesa/
├── server/                  # Fastify + Prisma 后端
├── web/                     # Vite + React + Tailwind 生产前端
├── tools/lark-ingest/       # 飞书简历自动入库(第 6 容器)
├── docker-compose.dev.yml   # 本地 PG + Redis
├── docker-compose.yml       # 生产 6 服务编排
├── .github/workflows/       # CI + Deploy
├── ops/                     # backup / restore / Cloudflare runbook
└── delivery-docs/
    ├── src/                 # Markdown 权威源(01–06)
    ├── dev-plans/           # 设计规划稿
    └── *.docx               # 由 src 生成的正式交付件
```

## 交付文档索引

| 文档 | 内容 |
|------|------|
| [`src/01_architecture.md`](./delivery-docs/src/01_architecture.md) | 架构与网络拓扑 |
| [`src/02_api.md`](./delivery-docs/src/02_api.md) | API 手册(含 §18 绩效评价) |
| [`src/03_deploy.md`](./delivery-docs/src/03_deploy.md) | 部署与 CI/CD · worktree |
| [`src/04_ops.md`](./delivery-docs/src/04_ops.md) | 运维与灾备 |
| [`src/05_feishu_resume_ingest.md`](./delivery-docs/src/05_feishu_resume_ingest.md) | 飞书入库(**已生产化**) |
| [`src/06_performance_evaluation.md`](./delivery-docs/src/06_performance_evaluation.md) | **员工绩效评价** as-built |

设计规划稿(迭代前)见 [`delivery-docs/dev-plans/`](./delivery-docs/dev-plans/README.md)。

重新生成 Word(需本机 `pandoc`):

```bash
pandoc delivery-docs/src/01_architecture.md -o "delivery-docs/01_系统架构与网络拓扑设计说明书.docx"
pandoc delivery-docs/src/02_api.md -o "delivery-docs/02_后端标准API接口参考手册.docx"
pandoc delivery-docs/src/03_deploy.md -o "delivery-docs/03_生产环境云端部署与CI-CD配置手册.docx"
pandoc delivery-docs/src/04_ops.md -o "delivery-docs/04_系统日常运维与数据灾备恢复手册.docx"
pandoc delivery-docs/src/06_performance_evaluation.md -o "delivery-docs/06_员工绩效评价模块说明书.docx"
```

## 演进路线(摘要)

| 阶段 | 状态 |
|------|------|
| ①–⑤ 本地闭环 → R2 → Docker → Cloudflare → CI/CD+备份 | ✅ |
| ⑥ 交付文档 Markdown + docx | ✅ 持续维护 |
| ⑦–⑨ LLM / ShareLink / 评价对话 | ✅ |
| ⑩ 面试评价 | ✅ |
| ⑪ 员工绩效评价(双链接+访问密钥+v2 Excel) | ✅ |
| ⑫ 飞书 lark-ingest 第 6 容器 | ✅ |

## License

私有项目,未授权请勿分发。
