---
title: "MESA Recruit · 生产环境云端部署与 CI-CD 配置手册"
author: "MESA Recruit 交付组"
date: "2026-05-22"
---

# 1. 前置准备

## 1.1 资源清单

| 资源 | 规格 / 说明 |
|------|-------------|
| VPS | 香港 D 型,4 核 8G,免 ICP 备案,Ubuntu 22.04 LTS |
| 域名 | 一个或多个,已转入 Cloudflare 托管 |
| Cloudflare 账号 | 含 R2 启用 + API Token 权限 |
| GitHub 仓库 | 含本项目源码,启用 Actions |

## 1.2 域名 Cloudflare 接入

1. 登录 Cloudflare → 添加站点 → 选择 **Free 套餐**(对个人 SaaS 足够)
2. 在域名注册商处把 NS 改为 Cloudflare 给出的两个 NS
3. 待 DNS 切换完成(可在 https://www.whatsmydns.net/ 检查)

## 1.3 Cloudflare DNS 配置

| 类型 | 名称 | 内容 | 代理状态 | TTL |
|------|------|------|----------|------|
| A | `recruit` | `<VPS 公网 IP>` | 已代理(橙色小黄云) | Auto |
| A | `@` | `<VPS 公网 IP>` | 已代理 | Auto |
| CNAME | `www` | `recruit.<your-domain>` | 已代理 | Auto |

## 1.4 SSL/TLS 模式 — Cloudflare Origin Certificate(实际方案)

本项目用 **Cloudflare Origin Certificate**(免费签发,15 年有效),而不是 Let's Encrypt。优点:
- 签发到 `*.insovo.top` 通配符,所有子域名(monitor / api / ...)复用同张证书
- 浏览器看到的是 Cloudflare 边缘证书,源站证书只需被 Cloudflare 验证 —— Cloudflare Full(strict) 自然信任
- 15 年到期,无需 ACME 续期机器人

操作步骤:

1. `SSL/TLS → Origin Server → Create Certificate` → Key Type `ECC` → Hostnames `*.insovo.top, insovo.top` → Validity `15 years`
2. 复制 Origin Certificate 和 Private Key(**页面只显示一次**),保存到 VPS `/opt/mesa/web/certs/insovo.top.pem` + `insovo.top.key`,`chmod 600`
3. nginx.conf 监听 443 + `ssl_certificate /etc/nginx/certs/insovo.top.pem`
4. Cloudflare `SSL/TLS → Overview` 选 **Full (strict)** 端到端加密
5. `Edge Certificates → Always Use HTTPS = ON`,`HSTS → Enable` (`max-age=31536000; includeSubDomains; preload`)

# 2. VPS 安全硬化

## 2.1 创建非 root 用户

```bash
adduser deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
# 把本地的 ~/.ssh/id_rsa.pub 内容贴到 authorized_keys
nano /home/deploy/.ssh/authorized_keys
chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
```

## 2.2 SSH 加固

`/etc/ssh/sshd_config`:

```
# Port 保留 VPS 厂商出厂默认(如 36724);若改记得同步改 UFW
PermitRootLogin no
PasswordAuthentication no
AllowUsers deploy
```

`sudo systemctl restart ssh`,然后 **新开终端验证** `ssh deploy@vps` 通过后再关旧连接。

> ⚠️ **本项目 VPS 出厂 sshd 监听 36724**(不是 22)。本机 `~/.ssh/config` 已配:
> ```
> Host 114.134.188.7
>   User deploy
>   Port 36724
>   IdentityFile ~/.ssh/id_ed25519
> ```

## 2.3 UFW 防火墙

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 36724/tcp comment 'sshd'   # 改成你实际的 sshd 端口
sudo ufw allow 80/tcp    comment 'http'
sudo ufw allow 443/tcp   comment 'https'
sudo ufw enable
sudo ufw status verbose
```

**严禁**放行 `5432`(PostgreSQL)`6379`(Redis)。

⚠️ **常见踩坑**:如果 sshd 不在 22 而 UFW 只放行了 22,SSH 会立即被锁出 —— 这是部署初期最大的风险点。务必先确认 `ss -tlnp \| grep sshd` 看 sshd 真实监听端口,UFW 放行对应端口后再 `ufw enable`。

## 2.4 自动更新

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

# 3. 安装 Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
# 验证: 重新登录后
docker ps
docker compose version
```

# 4. 部署代码到 VPS

## 4.1 克隆与配置

```bash
sudo mkdir -p /opt/mesa
sudo chown deploy:deploy /opt/mesa
cd /opt
git clone https://github.com/<owner>/<repo>.git mesa
cd mesa
cp .env.example .env
nano .env
```

填入 `.env`:

```
POSTGRES_DB=mesa
POSTGRES_USER=mesa
# ⚠️ 必须用 hex 字符集,base64 含 / + = 会破坏 DATABASE_URL 解析(Prisma P1000)
POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)
WEB_ORIGIN=https://insovo.top
WEB_HTTP_PORT=80
LOG_LEVEL=info
# R2 凭证(业务桶 mesa-resumes)
R2_ACCOUNT_ID=<cloudflare account id>
R2_ACCESS_KEY_ID=<r2 access key>
R2_SECRET_ACCESS_KEY=<r2 secret>
R2_BUCKET=mesa-resumes
R2_BACKUP_BUCKET=mesa-backups
```

> 💡 **R2 备份桶凭证不放 `.env`** —— 用独立 token 写到 `~/.aws/credentials` 的 `[r2-backup]` profile,
> backup.sh 通过 `aws --profile r2-backup ...` 调用,保证业务凭证泄露不会影响备份桶。

## 4.2 首次启动

```bash
docker compose pull               # 阶段⑤ CI 已推到 GHCR 时
# 或本地构建:
docker compose up --build -d
docker compose ps                 # 4 容器应全 healthy
docker exec mesa-server node prisma/seed.js   # 初始化默认管理员账号
```

## 4.3 验证

```bash
curl -fsSL https://recruit.your-domain.com/api/health
# 应返回 {"status":"ok","service":"mesa-server",...}
```

# 5. CI/CD 配置

## 5.1 GitHub Repo Secrets

在 `Settings → Secrets and variables → Actions → New repository secret`:

| Secret | 值 |
|--------|----|
| `VPS_HOST` | 生产 VPS 公网 IP 或域名(如 `114.134.188.7`) |
| `VPS_USER` | `deploy` |
| `VPS_SSH_PORT` | **必填** · VPS 实际 sshd 端口(本项目 `36724`) |
| `VPS_SSH_KEY` | 私钥 PEM 内容(对应 authorized_keys 里的公钥) |
| `VPS_DEPLOY_DIR` | `/opt/mesa` |
| `GHCR_TOKEN` | (可选)默认用 `secrets.GITHUB_TOKEN`(workflow 内置),无需再设 |

在 `Settings → Secrets and variables → Actions → Variables` 添加:

| Variable | 值 |
|----------|----|
| `DEPLOY_ENABLED` | `true` 表示开启自动部署;`false` 仅构建不部署 |

## 5.2 流水线行为

- 任意分支 `push` → 触发 **CI** 工作流(`.github/workflows/ci.yml`):安装依赖、生成 Prisma client、构建前端、构建 Docker 镜像(不推送)
- `main` 分支 `push` → 触发 **Deploy** 工作流(`.github/workflows/deploy.yml`):构建并推送镜像到 `ghcr.io/<owner>/mesa-{server,web}:latest` + `:<git sha>`,然后 SSH 到 VPS 拉取镜像 + `docker compose up -d`

## 5.3 手动触发

```bash
gh workflow run deploy.yml --ref main
```

## 5.4 回滚

```bash
ssh deploy@vps
cd /opt/mesa
docker compose pull mesa-server:<old-sha-tag>
docker compose up -d
```

或在 GHCR 上 tag 一个旧版本为 latest,然后 `docker compose pull && docker compose up -d`。

# 6. Cloudflare WAF 配置(推荐)

`Security → WAF → Custom rules → Create rule`:

| 规则名 | 表达式 | 动作 |
|--------|--------|------|
| 防 API 暴力 | `(http.request.uri.path eq "/api/auth/login") and (cf.threat_score gt 30)` | Challenge |
| 限速 | `(starts_with(http.request.uri.path, "/api/"))` | Rate Limit 60/min/IP |
| 阻断已知坏 UA | `(http.user_agent contains "bot" or http.user_agent contains "crawler")` | Block |

# 7. 域名上线 Checklist

- [ ] Cloudflare DNS 已切换(代理状态:小黄云)
- [ ] SSL/TLS 模式 = Strict
- [ ] Always Use HTTPS = ON
- [ ] HSTS 启用
- [ ] WAF 至少 3 条基本规则
- [ ] VPS UFW 仅放行 80/443/2222
- [ ] SSH 已禁用 root + 密码登录
- [ ] `.env` 真实凭证已填,且 `chmod 600`
- [ ] `docker compose ps` 4 容器全 healthy
- [ ] `curl https://<域名>/api/health` 返回 ok
- [ ] `curl https://<域名>/login` 返回 200 + 含 `<div id="root">`
- [ ] 浏览器访问能登录 + Dashboard 数据正常
- [ ] crontab 已配置每日 03:00 备份(见交付文档 04)
