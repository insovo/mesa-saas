---
title: "MESA Recruit · 系统架构与网络拓扑设计说明书"
author: "MESA Recruit 交付组"
date: "2026-05-22"
---

# 1. 文档信息

| 项目 | 内容 |
|------|------|
| 文档名称 | 系统架构与网络拓扑设计说明书 |
| 版本 | v1.0 |
| 适用范围 | MESA Recruit 全栈 SaaS 应用 |
| 部署形态 | 香港 D 型 VPS (4 核 8G,免备案) + Cloudflare 边缘网络 |
| 配套文档 | 02 API 手册 · 03 部署手册 · 04 运维灾备手册 |

# 2. 项目概述

MESA Recruit 是面向 AI 原生招聘场景的 SaaS 产品,核心能力包括:

- **简历自动解析**:接入 Kimi / DeepSeek 等大模型,从 PDF / DOCX 中抽取结构化字段
- **候选人全生命周期管理**:从简历收件箱 → 沟通 → 面试 → Offer → 入职 → 转正
- **岗位 / 部门 / 员工组织视图**:岗位优先级、部门编制与缺员、员工试用期评估
- **AI 标签与匹配度**:基于解析结果对候选人技能 / 风险 / 亮点打标,与 JD 计算匹配度

# 3. 技术栈

| 层级 | 技术选型 | 备注 |
|------|----------|------|
| 接入层 | Cloudflare DNS + CDN + WAF | DNS 解析、HTTPS 边缘卸载、防 DDoS |
| 反向代理 | Nginx 1.27 (alpine) | TLS 终止、SPA 路由兜底、/api 反代后端 |
| 前端 | React 18 + Vite 5 + Tailwind 3 + react-router 6 | 静态构建产物,无 SSR |
| 后端 | Node.js 20 + Fastify 4 + Prisma 5 | JWT 鉴权、ESM、Pino 日志 |
| 数据库 | PostgreSQL 16 (alpine) | 业务核心数据 |
| 缓存 / 队列 | Redis 7 (alpine) | 会话、限流、解析任务队列 |
| 对象存储 | Cloudflare R2 | 简历附件 + 数据库备份 |
| 容器编排 | Docker + docker compose v2 | 4 容器单机编排 |
| CI/CD | GitHub Actions + GHCR | 自动构建镜像 + SSH 滚动部署 |

# 4. 部署架构

## 4.1 整体拓扑

```
┌───────────────────────────────────────────────────────────────┐
│                        境内 + 境外用户                          │
└────────────────────────────┬──────────────────────────────────┘
                             │ HTTPS
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                       Cloudflare 边缘                          │
│   ・DNS 解析(域名 → VPS IP, 代理状态:小黄云开启)               │
│   ・CDN 缓存静态资源                                           │
│   ・WAF 规则(防爬虫、限流、SQL/XSS 注入防御)                   │
│   ・SSL 模式: Strict(端到端 HTTPS)                             │
└────────────────────────────┬──────────────────────────────────┘
                             │ HTTPS (back-to-origin)
                             ▼
┌──────────────────────────────────────────────────────────────┐
│        香港 D 型 VPS · 4 核 8G · 免 ICP 备案                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  UFW 防火墙: 仅放行 80 / 443 / 22(自定义端口)             │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │            Docker Bridge 网络: mesa-net                  │  │
│  │                                                         │  │
│  │   ┌─────────┐    ┌─────────┐    ┌──────────┐            │  │
│  │   │frontend │───▶│ backend │───▶│ postgres │            │  │
│  │   │ Nginx   │    │ Fastify │    │   16     │            │  │
│  │   │  :80    │    │  :3001  │    └──────────┘            │  │
│  │   └────┬────┘    │         │    ┌──────────┐            │  │
│  │        │         │         │───▶│  redis 7 │            │  │
│  │   宿主 80 ←──────┘         │    └──────────┘            │  │
│  │                  └────┬────┘                            │  │
│  └─────────────────────────────────────────────────────────┘  │
│                          │ 上传 / 备份 (S3 兼容协议)            │
└──────────────────────────┼─────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│            Cloudflare R2 (S3 兼容对象存储)                    │
│   bucket: mesa-resumes      ← 业务简历/附件                    │
│   bucket: mesa-backups      ← 数据库每日全量备份               │
└──────────────────────────────────────────────────────────────┘
```

## 4.2 容器编排

| 服务 | 镜像 | 端口策略 | 数据卷 |
|------|------|----------|--------|
| `frontend` | `mesa-web:latest` | **仅暴露 80 到宿主机** | 无(静态资源在镜像里) |
| `backend` | `mesa-server:latest` | 仅 `expose: 3001`(不映射宿主) | 无(无状态) |
| `postgres` | `postgres:16-alpine` | 仅 `expose: 5432`(**严禁映射宿主**) | `mesa_pg_prod_data` |
| `redis` | `redis:7-alpine` | 仅 `expose: 6379`(**严禁映射宿主**) | `mesa_redis_prod_data` |

## 4.3 流量走向

1. 用户 HTTPS 请求 → Cloudflare 边缘节点(就近 CDN)
2. Cloudflare 通过 Strict TLS 回源到 VPS:443(可由外层 Nginx 终止 TLS,或在 VPS 容器 frontend:80 之外再加一层 Nginx)
3. 容器内 Nginx 收到请求后分流:
   - `/api/*` → 反向代理到 `backend:3001`
   - 静态资源 → 直接返回 dist 目录
   - SPA 路由(如 `/candidates/c-001`) → `try_files` 兜底到 `index.html`
4. backend 通过 Docker bridge 网络访问 `postgres:5432` / `redis:6379`(无 NAT、无加密,因为在隔离网内)
5. 简历上传时,backend 签发预签名 URL,前端直接 `PUT` 到 R2(零出口流量费)

# 5. 数据模型(简版)

主要表与关系:

```
User (uuid pk, email unique, password_hash, role)
  └─owns─ Candidate (uuid pk, external_id, name, ..., owner_id fk)

Job (uuid pk, external_id, title, dept, urgency)
  └─has─ Interview (candidate_id, job_id, round, scheduled_at)
  └─has─ Employee  (candidate_id, job_id, stage, ...)

Department (uuid pk, name, code, parent_id self-fk)

Candidate ────► Interview ◄──── Job
   │
   └────────── Employee (转化) ── checklist json / probation json / events json
```

完整 schema 见 `server/prisma/schema.prisma`。

# 6. 安全设计

| 层 | 措施 |
|----|------|
| 接入 | Cloudflare WAF + 限流规则、HSTS、强制 HTTPS |
| TLS | 全链路 Strict 模式,Cloudflare ↔ Origin 端到端加密 |
| 主机 | UFW 仅放行 80/443 + 自定义 SSH 端口,禁用 root 远程登录,SSH 仅密钥 |
| 容器 | DB / Redis 端口不映射宿主,Docker Bridge 隔离,镜像非 root 用户 |
| 应用 | JWT(HS256,7d 过期)、bcryptjs 哈希密码、Fastify schema 校验所有入参 |
| 凭证 | `.env` 严格不入 Git,生产 secrets 在 VPS 本地 / GitHub Actions Secrets |
| 数据 | R2 备份桶独立 IAM,业务桶 CORS 限制到生产域名 |

# 7. 容量规划(VPS 4C8G 参考)

| 资源 | 预算 | 备注 |
|------|------|------|
| Nginx + 静态 | <100MB RAM | 几乎无消耗 |
| Fastify backend | 200-500MB RAM | 高峰可能 1G |
| PostgreSQL | 1-2G RAM | 取决于连接数 |
| Redis | 100-300MB RAM | LRU 限制 256MB |
| 系统预留 | 1G RAM | OS + 监控 |
| **总计** | ~4-5G | 4C8G VPS 富余 50%+ |

# 8. 备份与灾备

- **每日 03:00 自动备份**:`ops/backup.sh` 通过 cron 触发,`pg_dump` → `gzip -9` → 上传 R2 备份桶
- **备份键名规范**:`postgres/YYYY/MM/mesa-pg-YYYYMMDDTHHMMSSZ.sql.gz`
- **本地保留**:7 天,远端按 R2 生命周期策略(如 90 天冷存储)
- **恢复 SOP**:`ops/restore.sh r2://...sql.gz` 自动化恢复,见交付文档 04
- **RTO / RPO**:RTO ≤ 30 分钟,RPO ≤ 24 小时(由备份频率决定)

# 9. 监控与日志

- 容器健康检查:`docker compose ps` 显示每个容器 healthy/unhealthy
- 应用日志:Fastify 用 Pino,`docker logs mesa-server` 查看
- Nginx access log:`docker exec mesa-web tail -f /var/log/nginx/access.log`
- (可选)接入 Cloudflare Analytics 看接入层数据

# 10. 演进路线

| 阶段 | 状态 | 说明 |
|------|------|------|
| ① 本地全栈闭环 | ✅ 已完成 | server + web + dev compose |
| ② R2 对象存储 | 🔜 代码就绪,等凭证 | `/api/storage/presigned-url` 接口预留 |
| ③ Docker + Nginx | ✅ 已完成 | 本文件覆盖范围 |
| ④ Cloudflare + VPS 加固 | 📋 runbook 就绪 | 见交付文档 03 |
| ⑤ CI/CD + 容灾 | ✅ workflow + 脚本就绪 | 见 .github/workflows/ + ops/ |
| ⑥ 交付物打包 | ✅ 即本套 .docx 4 件套 | |
