# 🚀 完整 SaaS 项目开发、演进与工程交付规范指南

本指南专为本项目的 **Claude Code AI 协作环境**定制，作为项目从“前端就绪”到“全栈容器化”，再到“云端自动化运维”的最高标准 Checklist。

项目技术栈：**React + Tailwind CSS + Vanilla JS + Nginx + Docker + PostgreSQL + Redis + Cloudflare (DNS/CDN/R2)**。

---

## 📅 阶段一：本地全栈闭环与数据打通
*目标：在开发环境实现前后端、数据库的本地连通，完成首个全栈功能闭环。*

- [ ] **1.1 前端 UI 冻结与路由守卫**
  - [ ] 检查并收尾所有 React 页面及 Tailwind CSS 的响应式断点（`sm`, `md`, `lg`, `xl`），确保移动端与桌面端完美适配。
  - [ ] 统一封装 Axios / Fetch 实例，配置全局请求拦截器（自动携带 `Authorization` Header）与响应拦截器（统一处理 `401`、`403`、`500` 错误）。
  - [ ] 实现 React Router（或当前使用的路由库）的路由守卫（Auth Guards），确保未登录用户访问 `/dashboard` 等私有路由时强制重定向至 `/login`。
- [ ] **1.2 后端骨架初始化与数据库迁移 (Migration) 规范**
  - [ ] 初始化后端应用框架，配置 PostgreSQL（关系型数据）与 Redis（缓存/状态）的本地驱动连接。
  - [ ] 编写第一版数据库迁移脚本（Migrations），显式定义核心表结构：
    - `users` 表：包含 `id (UUID)`, `email`, `password_hash`, `role`, `created_at`, `updated_at`。
    - 核心业务数据表：配置好外键约束（Foreign Keys）与索引（Indexes）优化。
  - [ ] 严禁在代码中硬编码数据库连接字符串，必须统一读取 `.env` 环境变量。
- [ ] **1.3 前后端本地联调 (CORS 解决)**
  - [ ] 实现基础的本地 JWT（JSON Web Token）签发与验签逻辑（或 Session 机制）。
  - [ ] 在前端构建工具（如 `vite.config.js` 或 `next.config.js`）中配置 `proxy`（开发服务器代理），将所有 `/api/*` 请求代理到后端本地端口，彻底解决本地开发环境的跨域问题。
  - [ ] 跑通首个业务模块的完整 CRUD（增删改查）流程，确保数据在前端 -> 后端 -> PostgreSQL 之间准确流转。

---

## 🌐 阶段二：分布式对象存储接入 (Cloudflare R2)
*目标：打通云端高可用存储，确保媒体资产与大文件不占用应用服务器磁盘与带宽。*

- [ ] **2.1 Cloudflare R2 存储桶整备**
  - [ ] 登录 Cloudflare 控制台，创建用于本项目的 R2 Bucket（如 `my-saas-media`）。
  - [ ] 在 R2 存储桶的设置中，配置严格的 CORS 策略（Allowed Origins 仅允许本地开发域名及未来的生产域名）。
  - [ ] 生成具备 R2 读写权限的 Cloudflare API 凭证（Access Key ID 与 Secret Access Key），并将其写入后端的 `.env` 中。
- [ ] **2.2 后端 S3 兼容层对接与预签名实现**
  - [ ] 后端引入 AWS SDK（或其他兼容 S3 协议的 SDK），对接 Cloudflare R2。
  - [ ] **大文件上传优化（安全直传）**：后端实现 `/api/storage/presigned-url` 接口。当前端需要上传文件时，先向后端申请一个有时效性（如 15 分钟有效）的预签名 URL（Presigned URL）。
- [ ] **2.3 前端直传与资产引用**
  - [ ] 前端获取到预签名 URL 后，使用 `PUT` 请求直接将文件流推送到 Cloudflare R2。
  - [ ] 上传成功后，前端将文件的存储 Key（或公共访问 URL）提交给后端写入 PostgreSQL 数据库，实现资产的持久化关联。

---

## 📦 阶段三：标准容器化生产打包 (Docker & Nginx 编排)
*目标：消除环境差异，利用 Nginx 解决 SPA 路由问题，实现生产级的一键拉起。*

- [ ] **3.1 编写前端 Dockerfile（多阶段构建优化）**
  - [ ] **阶段一（构建）**：引入 `node:alpine` 镜像，复制前端源码，执行 `npm install` 与 `npm run build`，在 `/app/dist` 目录生成高度压缩的静态资源。
  - [ ] **阶段二（运行）**：引入 `nginx:alpine` 镜像，将阶段一生成的 `dist` 文件夹复制到 Nginx 的默认静态资源目录（`/usr/share/nginx/html`）。
- [ ] **3.2 编写生产级 Nginx 配置文件 (`nginx.conf`)**
  - [ ] 静态资源响应优化：开启 Gzip 压缩，配置合理的浏览器缓存（Cache-Control）。
  - [ ] **前端路由兜底**：必须配置 `try_files $uri $uri/ /index.html;`，防止用户在前端刷新诸如 `/dashboard/settings` 等页面时触发 Nginx 的 404 错误。
  - [ ] **反向代理配置**：配置 `location /api/` 块，将所有 API 请求精准、透明地转发到后端容器的对应端口（保持 HTTP 请求头中的真实 IP 和 Protocol）。
- [ ] **3.3 编写后端 Dockerfile 与服务多容器编排**
  - [ ] 编写后端精简生产镜像的 `Dockerfile`（清理构建依赖，仅保留运行时环境）。
  - [ ] 编写标准的 **`docker-compose.yml`**，统一编排以下 4 个容器服务：
    1. `frontend` (包含内置的 Nginx 代理)
    2. `backend` (应用核心业务逻辑)
    3. `postgres` (数据持久化，映射外部 Volume 确保数据不丢失)
    4. `redis` (缓存与队列状态，映射 Volume 开启 AOF/RDB 持久化)
  - [ ] 在本地执行 `docker-compose up --build -d`，验证通过 `http://localhost` 即可无缝访问全套系统。

---

## ☁️ 阶段四：网络架构演进与生产服务器安全加固
*目标：利用 Cloudflare 建立外围防线，构建铜墙铁壁般的 VPS 运行环境。*

- [ ] **4.1 Cloudflare DNS 边界与 SSL/TLS 部署**
  - [ ] 将项目的官方域名解析完全托管至 Cloudflare。
  - [ ] 配置 DNS 解析记录（A 记录或 CNAME 记录），指向生产服务器 IP，并**务必开启“小黄蜂”（Proxied，即通过 Cloudflare CDN 代理）**。
  - [ ] 在 Cloudflare 控制台将 SSL/TLS 加密模式设置为 **Full（灵活）或 Strict（严格）**，强制开启 HSTS 与全站 HTTPS。
  - [ ] 配置 Web 应用程序防火墙（WAF）规则：阻断恶意爬虫、限制 API 接口的异常频次。
- [ ] **4.2 生产服务器 (Linux VPS) 安全硬化**
  - [ ] 在生产服务器上安装最新的稳定版 Docker 与 Docker Compose。
  - [ ] **网络隔离核心步骤**：启用服务器防火墙（如 UFW），**严格仅对外开放 `80`、`443` 以及自定义的 `SSH` 端口**。
  - [ ] **绝对禁止**将 PostgreSQL 的 `5432` 端口和 Redis 的 `6379` 端口映射或暴露给宿主机公网。确保数据库与缓存服务的端口仅在 Docker Compose 创建的隔离虚拟网络（Bridge Network）内部相互通信。

---

## 🤖 阶段五：CI/CD 自动化构建与数据防丢运维
*目标：实现全自动的代码发布，并为独立开发者建立最稳固的容灾备份机制。*

- [ ] **5.1 生产环境敏感变量（Secrets）隔离**
  - [ ] 在生产服务器的指定部署目录下，手动创建 `.env` 生产环境配置文件。
  - [ ] 写入生产环境特有的高强度随机密码、R2 生产凭证、JWT 加密私钥等。该文件绝对禁止进入任何 Git 仓库。
- [ ] **5.2 配置 CI/CD 自动化流水线（如 GitHub Actions）**
  - [ ] 编写流水线配置文件，定义当代码合并或 Push 到 `main` 分支时触发：
    - 步骤 1：代码安全审计与自动化 Lint 检查。
    - 步骤 2：并行构建前端、后端 Docker 镜像，并打上版本 Tag 推送到私有镜像仓库（如 GitHub Container Registry）。
    - 步骤 3：通过 SSH 远程连接生产服务器，拉取最新镜像，执行 `docker-compose up -d --remove-orphans` 实现无缝容器升级。
- [ ] **5.3 自动化容灾备份策略（数据生命线）**
  - [ ] 编写一个自动化运维 Shell 脚本：
    1. 调用 `docker exec` 利用 `pg_dump` 导出 PostgreSQL 全量结构与数据，生成 `.sql` 文件。
    2. 将 `.sql` 文件进行 `gzip` 高比例压缩，文件名追加时间戳。
    3. 利用 Cloudflare Wrangler CLI 或 AWS CLI，**将压缩包自动同步上传到 Cloudflare R2 专门设立的“独立备份存储桶（Backup Bucket）”中**。
  - [ ] 设置服务器 `crontab` 计划任务，配置该脚本在每天凌晨 3:00 自动执行，确保任何极端情况下数据皆可无损恢复。

---

## 🎁 阶段六：最终项目交付物打包规范 (非代码类资产)
*目标：严格执行项目交付标准。除本地项目的 README.md 外，其余所有衍生工程文档、架构文档、运维指南必须以独立的 `.docx` 格式文件进行封装和交付。*

- [ ] **6.1 初始化生产数据库审计**
  - [ ] 在执行最终发布前，彻底清空开发阶段残留的测试用户、日志脏数据以及临时表。
  - [ ] 执行最终版数据库 Seed 脚本，向 PostgreSQL 注入系统必需的初始全局配置参数，以及创建你自己的主管理员账号。
- [ ] **6.2 交付物资产打包清单核对**
  - [ ] 📂 **代码资产库**：提交结构干净、依赖申明完整、已剥离任何真实凭证的前后端全套 Git 源码。
  - [ ] 📂 **容器配置文件**：交付开箱即用的 `docker-compose.yml`、生产环境 `nginx.conf` 以及配置完整的 `.env.example`。
  - [ ] 📄 **本地根目录文档**：仅包含一个引导性质的 `README.md`（简述本地用 Docker 快速拉起开发环境的命令）。
  - [ ] 🗂️ **标准交付文档集（必须为 `.docx` 格式，放置于单独的 `/delivery-docs` 目录中）**：
    - [ ] 📄 `01_系统架构与网络拓扑设计说明书.docx`：详细记录 Cloudflare CDN ➔ 宿主机防火墙 ➔ Nginx 反向代理 ➔ App 容器 ➔ 隔离层数据库/Redis 的整体流量走向与数据流向图。
    - [ ] 📄 `02_后端标准 API 接口参考手册.docx`：由后端代码（如 Swagger/Postman）导出整理的、格式严谨的、包含完整请求体、返回体示例及状态码说明的系统 API 字典。
    - [ ] 📄 `03_生产环境云端部署与 CI-CD 配置手册.docx`：针对 VPS 购买、UFW 防火墙配置、Cloudflare 域名解析、GitHub Actions 密钥绑定的手把手实操指南。
    - [ ] 📄 `04_系统日常运维与数据灾备恢复手册.docx`：包含如何手动执行数据库升降级、如何利用 R2 里的备份包在全新服务器上进行数据分钟级恢复（Disaster Recovery）的详细 SOP 操作步骤。