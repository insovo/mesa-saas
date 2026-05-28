---
title: "Overseas R&D · 系统架构与网络拓扑设计说明书"
author: "Overseas R&D 交付组"
date: "2026-05-22"
---

# 1. 文档信息

| 项目 | 内容 |
|------|------|
| 文档名称 | 系统架构与网络拓扑设计说明书 |
| 版本 | v1.0 |
| 适用范围 | Overseas R&D 全栈 SaaS 应用 |
| 部署形态 | 香港 D 型 VPS (4 核 8G,免备案) + Cloudflare 边缘网络 |
| 配套文档 | 02 API 手册 · 03 部署手册 · 04 运维灾备手册 |

# 2. 项目概述

Overseas R&D 是面向 AI 原生招聘场景的 SaaS 产品,核心能力包括:

- **简历自动解析**:接入 Kimi / DeepSeek 等大模型,从 PDF / DOCX 中抽取结构化字段
- **候选人全生命周期管理**:从简历收件箱 → 沟通 → 面试 → Offer → 入职 → 转正
- **岗位 / 部门 / 员工组织视图**:岗位优先级、部门编制与缺员、员工试用期评估
- **AI 标签与匹配度**:基于解析结果对候选人技能 / 风险 / 亮点打标,与 JD 计算匹配度

# 3. 技术栈

| 层级 | 技术选型 | 备注 |
|------|----------|------|
| 接入层 | Cloudflare DNS + CDN + WAF | DNS 解析、HTTPS 边缘卸载、防 DDoS |
| 反向代理 | Nginx 1.27 (alpine) | TLS 终止、SPA 路由兜底、/api 反代后端 |
| 前端 | React 18 + Vite 6 + Tailwind 3 + react-router 6 | 静态构建产物,无 SSR |
| 后端 | Node.js 20 + Fastify 5 + @fastify/jwt 10 (fast-jwt 6.x) + Prisma 5 | JWT 鉴权、ESM、Pino 日志 |
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
| `frontend` | `ghcr.io/insovo/mesa-web:latest` | **暴露 80/443**(80 跳 443, 443 终止 TLS) | TLS 证书 bind mount `web/certs/` |
| `backend` | `ghcr.io/insovo/mesa-server:latest` | 仅 `expose: 3001`(不映射宿主) | 无(无状态) |
| `postgres` | `postgres:16-alpine` | 仅 `expose: 5432`(**严禁映射宿主**) | `mesa_pg_prod_data` |
| `redis` | `redis:7-alpine` | 仅 `expose: 6379`(**严禁映射宿主**) | `mesa_redis_prod_data` |
| `uptime-kuma` | `louislam/uptime-kuma:1` | 仅 `expose: 3001`(通过 nginx `monitor.insovo.top` 反代) | `mesa_uptime_data` |

## 4.3 流量走向

1. 用户 HTTPS 请求 → Cloudflare 边缘节点(就近 CDN)
2. Cloudflare 通过 Strict TLS 回源到 VPS:443(可由外层 Nginx 终止 TLS,或在 VPS 容器 frontend:80 之外再加一层 Nginx)
3. 容器内 Nginx 收到请求后分流:
   - `/api/*` → 反向代理到 `backend:3001`
   - 静态资源 → 直接返回 dist 目录
   - SPA 路由(如 `/candidates/c-001`) → `try_files` 兜底到 `index.html`
4. backend 通过 Docker bridge 网络访问 `postgres:5432` / `redis:6379`(无 NAT、无加密,因为在隔离网内)
5. 简历上传时,backend 签发预签名 URL,前端直接 `PUT` 到 R2(零出口流量费)

# 5. 数据模型

当前共 **11 张表**,关系如下:

```
User ─owns──> Candidate ─has─> CandidateNote / Review / ShareLink / Employee
                    │           ↑
                    └──> Interview                     Job
                                                       ↑
                                       Department      │
                                                       │
                                Review ─votes─> ReviewVote ─by─> User
                                Review ─replies─> Review (self, 1 level)

SystemSetting (KV, admin only · AES-256-GCM 加密敏感 value)
```

| 表 | 用途 |
|----|------|
| `User` | 系统账号(ADMIN/RECRUITER/VIEWER 三角色) |
| `Candidate` | 候选人,阶段一字段(aiSummary/tags/基础信息)+ 阶段二字段(skills/experience/educationHistory markdown · risks/highlights/insights · jdMatch/matchedFor/againstFor/aiSuggestedTags)+ jobId 关联 JD |
| `Job` | 岗位,`description` 字段给 LLM 二次评估用 |
| `Department` | 部门(自关联树) |
| `Employee` | 已入职员工(候选人 → 员工转化) |
| `Interview` | 面试安排 |
| `CandidateNote` | 内部备注(详情页时间线) |
| `Review` | 评价对话(回复/投票/可见范围/审核删除) |
| `ReviewVote` | 登录用户对评价的投票去重 |
| `ShareLink` | 公开分享凭证(token/有效期/访问次数上限) |
| `SystemSetting` | admin 配置(Kimi API Key 等,AES-256-GCM 加密) |

完整 schema 见 `server/prisma/schema.prisma`,字段级说明参考 CLAUDE.md §10。

# 5A. 新增子系统说明

以下为 demo.md 六阶段之外、上线后扩展实现的子系统:

## 5A.1 LLM 两阶段简历解析(Kimi · Moonshot AI)

**阶段一 parseResume — 只产简报 + tags + 基础字段**:
```
[ Upload UI ] -> [ POST /api/storage/presigned-url ] -> R2 mesa-resumes
        ↓
[ POST /api/resumes/parse ] -> [ Kimi Files API 上传 ] -> [ /v1/chat/completions JSON mode ]
        ↓
[ summary 纯文本简报 + name/phone/email/school/major/yearsExp/tags/languages ]
        ↓
[ 写入 Candidate (skills/experience/educationHistory 留空, 等阶段二) ]
```

- 系统级配置:`SystemSetting (kimi.api_key/model/prompt)` · `api_key` AES-256-GCM 加密(密钥从 `JWT_SECRET` HKDF 派生)
- admin 在 UI(Sidebar 弹 Modal)可改 key/model(从 `/v1/models` 动态拉)/prompt(20000 字符)
- summary 是模板化纯文本(HR 可读),包含教育/工作/项目/技能 section,作为阶段二的唯一上下文

## 5A.2 JD 二次匹配评估 — 阶段二 matchAgainstJob

**只在关联 JD 时跑**(reparse 前 ReparseConfirmModal 让用户先选/确认 JD):
```
[ candidate.aiSummary + job.description ] -> [ Kimi /v1/chat/completions ]
        ↓
[ jdMatch + risks/highlights + insights(up/down) ]
[ + matchedFor / againstFor / aiSuggestedTags ]
[ + skills / experience / educationHistory (markdown bullet 字符串) ]
        ↓
[ 写入 Candidate (覆盖阶段二字段) ]
```

设计要点:
- skills/experience/educationHistory **针对 JD** 输出:核心技能选支持得起 JD 要求的、工作经历按相关度排序、教育按时间倒序
- 前端 `MarkdownBullets` 组件渲染(split "\n" + 去 `- ` 前缀 → li)
- 未关联 JD 候选人这三个 section 显示「关联 JD 后自动生成」引导,点击触发 JD picker
- 强 prompt:禁用"可能/或许"含糊词,无强匹配点必须写"未发现"
- 触发时机:Upload 时关联 JD 自动跑;或 ReparseConfirmModal 用户切 JD 时跑;或 `POST /api/resumes/match` 显式 sync 调用

## 5A.3 分享给招聘官(公开页 `/share/<token>`)

```
[ admin 创建 ShareLink ] -> [ 32 字符 URL-safe token ]
        ↓
[ 公开页 /share/:token ] -> [ GET /api/public/share/:token ]
        ↓ (按 ShareLink.showContact/showAttachments 应用可见性)
[ 只读 候选人视图 + 评价 ]
```

- 有效期:60s ~ 30d / 无限期
- 访问次数上限:可选 10/50/100/自定义 1-9999/不限
- 可见性 toggle(2026-05 加):
  - `showContact` 默认 true → phone/email mask 后显示;false → 完全 null,前端渲染「分享方已隐藏联系方式」
  - `showAttachments` 默认 false → 评价表单不显示附件 input,**后端 presigned-url 二道防线**也返回 403
- 公开页不在 AuthGuard 内,**不含 Sidebar/Topbar**(防泄漏其他页面信息)

## 5A.4 评价对话系统

完整功能:
- 写评价 / 1 级嵌套回复 / 多选批量回复(`referencedIds[]`)
- 附件(image/file/link,单条 ≤30MB,R2 直传)
- 赞同/否决投票 + 投票名单 popover
- 可见范围(public/internal/admin)
- 软删除审核(作者请求 → admin 批准)
- admin 隐藏 / 取消隐藏
- 实时新评价 Notification + Web Audio 音效(15s 轮询)
- 排序:最新/最旧/最赞同/最否决

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

# 10. 演进路线(实际落地状态)

| 阶段 | 状态 | 说明 |
|------|------|------|
| ① 本地全栈闭环 | ✅ 已上线 | server + web + dev compose,本地 vite + node 联调 |
| ② R2 对象存储 | ✅ 已上线 | `mesa-resumes`(业务) + `mesa-backups`(备份)双桶,凭证最小权限隔离 |
| ③ Docker + Nginx | ✅ 已上线 | 5 容器(含 Uptime Kuma 监控),Cloudflare Origin Cert 端到端 HTTPS |
| ④ Cloudflare + VPS 加固 | ✅ 已上线 | UFW 36724/80/443、SSH 禁 root + 禁密码、fail2ban、unattended-upgrades |
| ⑤ CI/CD + 容灾 | ✅ 已上线 | GitHub Actions + GHCR + SSH 部署;systemd timer 每日 03:00 UTC 自动备份 R2 |
| ⑥ 交付物打包 | ✅ 已交付 | 本套 4 份 .docx + ops/runbook + README + CLAUDE.md |
| ⑦ LLM 解析 + JD 匹配 | ✅ 已上线(5A.1/5A.2) | Kimi 单 chat JSON 输出 · admin 在 UI 改 key/model/prompt · 二次评估 |
| ⑧ 分享给招聘官 | ✅ 已上线(5A.3) | ShareLink token · 公开页 · 有效期 + 次数上限 |
| ⑨ 评价对话系统 | ✅ 已上线(5A.4) | 11 表中 Review/ReviewVote 双表 · 浏览器通知 |

# 11. 实际部署关键参数(已生效)

| 参数 | 值 |
|------|----|
| 主域名 | https://insovo.top |
| 监控面板 | https://monitor.insovo.top |
| VPS | 114.134.188.7 · Ubuntu 22.04 LTS · 4C8G |
| SSH 端口 | **36724**(VPS 厂商出厂默认,非 22) |
| 部署用户 | `deploy`(`/etc/sudoers.d/90-deploy` 免密 sudo) |
| 容器编排 | docker compose v2(5 服务) · 卷 `mesa_pg_prod_data` + `mesa_redis_prod_data` + `mesa_uptime_data` |
| Cloudflare TLS | Origin Certificate(ECC, *.insovo.top, 15 年, 到期 2041-05-18) |
| 备份触发 | systemd `mesa-backup.timer` · `OnCalendar=*-*-* 03:00:00` UTC |
| 备份保留 | 本地 7 天 · R2 远端(可加 lifecycle 转 IA) |
