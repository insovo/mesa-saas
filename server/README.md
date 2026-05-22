# MESA Server (Stage ①)

Fastify + Prisma + PostgreSQL + Redis 后端骨架,对应 demo.md 阶段①「本地全栈闭环」。

## 启动

```bash
# 1. 起 DB(在仓库根目录)
docker compose -f docker-compose.dev.yml up -d

# 2. 安装依赖
cd server
npm install

# 3. 配置 .env
cp .env.example .env
# 重要: 把 JWT_SECRET 改成真实随机串,严禁使用示例占位:
#   openssl rand -hex 32

# 4. 初始化 DB schema + 种子数据
npx prisma migrate dev --name init
npm run prisma:seed

# 5. 启动
npm run dev
# → http://127.0.0.1:3001
```

## 默认账号(本地开发)

| email | password |
|-------|----------|
| `admin@mesa.local` | `mesa-dev-2026` |

⚠️ 仅本地。生产环境用阶段⑥ 的管理员创建流程。

## 已实现接口

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/health` | 健康检查(无需鉴权) |
| POST | `/api/auth/login` | 邮箱密码登录,签发 JWT |
| GET | `/api/auth/me` | 获取当前用户(需 Bearer) |
| GET | `/api/candidates` | 候选人列表(q/status/appliedFor 过滤,skip/take 分页) |
| GET | `/api/candidates/:id` | 详情(支持 UUID 或 externalId) |
| POST | `/api/candidates` | 新建 |
| PATCH | `/api/candidates/:id` | 更新 |
| DELETE | `/api/candidates/:id` | 删除 |
