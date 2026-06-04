# MESA Server — Fastify + Prisma 生产镜像
# 多阶段构建: 1) 依赖安装与 Prisma client 生成  2) 运行时精简镜像
# 镜像最终 ~150MB,仅包含 production deps + Prisma client。

# ──────────── Stage 1: deps ────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Alpine 上 Prisma 需要 openssl
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && \
    npx prisma generate

# ──────────── Stage 2: runtime ────────────
FROM node:20-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache openssl poppler-utils tini && \
    addgroup -S mesa && adduser -S mesa -G mesa

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

# 拷贝依赖与代码(不包含 dev deps)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY package*.json ./
COPY src ./src
COPY assets ./assets

# 健康检查 — docker-compose 也会依赖
HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health || exit 1

USER mesa
EXPOSE 3001

# 入口启动前自动跑 migrate deploy(不会破坏现有数据)
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
