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
├── server/                  # Fastify + Prisma 后端
├── web/                     # Vite + React + Tailwind 生产前端
├── ui_kits/mesa-recruit/    # 「无构建」UI Kit 设计参考(不参与生产)
├── docker-compose.dev.yml   # 本地 PG + Redis
├── docker-compose.yml       # 生产 4 容器编排
├── .github/workflows/       # CI(build) + Deploy(GHCR + SSH)
├── ops/
│   ├── backup.sh            # pg_dump → R2
│   ├── restore.sh           # R2 → pg_restore
│   ├── crontab.example      # 每日 03:00 备份
│   └── runbook_cloudflare_vps.md   # 阶段④ 生产硬化 SOP
└── delivery-docs/           # 4 份交付文档(.docx)
    ├── 01_系统架构与网络拓扑设计说明书.docx
    ├── 02_后端标准API接口参考手册.docx
    ├── 03_生产环境云端部署与CI-CD配置手册.docx
    └── 04_系统日常运维与数据灾备恢复手册.docx
```

## 演进路线(对照 `demo.md`)

| 阶段 | 状态 |
|------|------|
| ① 本地全栈闭环(server + web + dev compose) | ✅ |
| ② Cloudflare R2 对象存储 | ✅ 代码就绪,等运维填凭证 |
| ③ Docker + Nginx 容器化(生产 compose) | ✅ |
| ④ Cloudflare DNS/WAF + VPS 加固 | ✅ runbook 就绪 |
| ⑤ CI/CD(GitHub Actions)+ 容灾备份 | ✅ |
| ⑥ 交付文档 4 件套(`delivery-docs/*.docx`) | ✅ |

## License

私有项目,未授权请勿分发。
