# MESA Server

Fastify 5 + Prisma 5 + PostgreSQL 16 + Redis 7 后端。生产形态与完整 API 见仓库根 `README.md` 与 `delivery-docs/src/02_api.md`。

## 启动

```bash
# 1. 起 DB(在仓库根目录)
docker compose -f docker-compose.dev.yml up -d

# 2. 安装依赖
cd server
npm install

# 3. 配置 .env
cp .env.example .env
# 重要: 把 JWT_SECRET 改成真实随机串:
#   openssl rand -hex 32

# 4. 初始化 DB schema + 种子数据
npx prisma migrate dev
npm run prisma:seed

# 5. 启动
npm run dev
# → http://127.0.0.1:3001
```

多 worktree 时改 `PORT` / `WEB_ORIGIN`,并登记 `.worktree-ports.json`。

## 默认账号(本地开发)

| email | password |
|-------|----------|
| `admin@mesa.local` | `mesa-dev-2026` |

⚠️ 仅本地。

## 路由模块(摘要)

| 前缀 | 说明 |
|------|------|
| `/api/auth` | 登录 / me / 验证码等 |
| `/api/candidates` … | 候选人 CRUD + notes |
| `/api/jobs` `/api/departments` `/api/employees` `/api/interviews` | 组织与面试 |
| `/api/resumes` | 解析任务 / JD 匹配 |
| `/api/share` `/api/public/share` | 分享 |
| `/api/upload-links` `/api/public/upload` | 公开上传 |
| `/api/interview-evals` `/api/public/interview-eval` | 面试评价 |
| `/api/performance` `/api/public/performance-eval` | **员工绩效评价**(含访问密钥) |
| `/api/system` `/api/users` `/api/audit` | 系统配置 / 用户权限 / 审计 |
| `/api/feishu` | 飞书卡片回调(公开) |

健康检查:`GET /api/health`(无鉴权)。

模板资源:`assets/templates/`(面试评价 + 绩效评价 v2)· 启动 SHA-256 校验 · Docker runtime 须 `COPY assets`。
