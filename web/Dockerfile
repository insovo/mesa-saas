# MESA Web — Vite + React 静态前端 + Nginx
# 多阶段构建: 1) Node 构建出 dist  2) Nginx alpine 托管静态资源 + /api 反向代理

# ──────────── Stage 1: build ────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ──────────── Stage 2: nginx runtime ────────────
FROM nginx:1.27-alpine AS runtime

# 删默认配置,使用本仓库提供的 nginx.conf
RUN rm /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/mesa.conf

# Nginx 监听 80
EXPOSE 80

HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
