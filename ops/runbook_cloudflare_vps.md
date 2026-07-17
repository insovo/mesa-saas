# MESA Recruit · Cloudflare + VPS 加固 Runbook(阶段④)

> ⚠️ **本 runbook 操作的是生产环境**。AI 助手不要自动执行任何 SSH / Cloudflare API 调用,
> 必须由人在键盘前逐条 echo 命令 → 确认 → 执行。每完成一步勾选 checkbox。

## 0. 凭证收集(把以下值放进密码管理器)

- [ ] VPS 公网 IP:`______________________`
- [ ] VPS root 临时密码(开通后第一次登录):`______________________`(用完即弃,下文会改密钥登录)
- [ ] 域名:`______________________`(已在 Cloudflare 托管)
- [ ] Cloudflare Account ID:`______________________`(`https://dash.cloudflare.com/<account-id>/...`)
- [ ] Cloudflare Zone ID:`______________________`(域名首页右下角)
- [ ] Cloudflare API Token(权限:Zone DNS Edit + Zone Settings Edit):`__SET_BY_OPS__`
- [ ] R2 Account API Token(权限:Object Read & Write):
  - Access Key ID:`__SET_BY_OPS__`
  - Secret Access Key:`__SET_BY_OPS__`

---

## 1. Cloudflare DNS 与 SSL/TLS

- [ ] 登录 Cloudflare → 选定域名 → DNS → Records
- [ ] 添加 A 记录:`recruit` → `<VPS IP>`,**Proxied(橙云)**
- [ ] 添加 A 记录:`@` → `<VPS IP>`,Proxied
- [ ] 添加 CNAME:`www` → `recruit.<domain>`,Proxied
- [ ] SSL/TLS → 概览 → 选择 **Strict**
- [ ] Edge Certificates → Always Use HTTPS = ON
- [ ] HSTS → Enable Max-Age 12 个月 + includeSubDomains
- [ ] 验证:`dig @1.1.1.1 recruit.<domain> +short` 返回 Cloudflare 边缘 IP(不是 VPS IP)

## 2. VPS 安全硬化

```bash
# 2.1 第一次以 root 登录 — 立即创建 deploy 用户
ssh root@<VPS-IP>
adduser deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
# 把本地 ~/.ssh/id_ed25519.pub 内容贴进去
nano /home/deploy/.ssh/authorized_keys
chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh

# 2.2 SSH 加固
nano /etc/ssh/sshd_config
#   Port 2222
#   PermitRootLogin no
#   PasswordAuthentication no
#   AllowUsers deploy
systemctl restart sshd

# 2.3 ⚠️ 在「另一个终端窗口」验证 SSH key 能登录后,关闭旧 root 会话
# ssh -p 2222 deploy@<VPS-IP>

# 2.4 UFW 防火墙(deploy 用户 sudo)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 2222/tcp comment 'ssh'
sudo ufw allow 80/tcp   comment 'http'
sudo ufw allow 443/tcp  comment 'https'
sudo ufw enable
sudo ufw status verbose
# ⚠️ 严禁放行 5432 / 6379(数据库 / Redis 端口),它们仅在 docker bridge 网络内通信

# 2.5 自动安全更新
sudo apt update && sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades

# 2.6 Fail2ban(可选,但推荐)
sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban
```

- [ ] `ssh -p 2222 deploy@<VPS>` 通,`ssh root@<VPS>` 不通
- [ ] `sudo ufw status` 显示 80/443/2222 ACCEPT,5432/6379 不在列表
- [ ] `sudo apt list --upgradable 2>/dev/null | wc -l` 输出小

## 3. Docker 与代码部署

```bash
# 3.1 装 Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
# 重新登录使 group 生效
exit
ssh -p 2222 deploy@<VPS>
docker ps  # 应无错误

# 3.2 克隆仓库
sudo mkdir -p /opt/mesa && sudo chown deploy:deploy /opt/mesa
cd /opt
git clone https://github.com/<owner>/<repo>.git mesa
cd mesa

# 3.3 填 .env(永远不入 Git)
cp .env.example .env
chmod 600 .env
nano .env
# 必填:
#   POSTGRES_PASSWORD=$(openssl rand -base64 24)
#   JWT_SECRET=$(openssl rand -hex 32)
#   WEB_ORIGIN=https://recruit.<domain>
#   WEB_HTTP_PORT=80
# R2 凭证(阶段② 启用后填):
#   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_BACKUP_BUCKET

# 3.4 启动
docker compose pull        # 等 CI 把镜像推到 GHCR 后执行
docker compose up -d       # 或本地构建: docker compose up --build -d
docker compose ps          # 4 容器应全部 healthy

# 3.5 初始化管理员
docker exec mesa-server node prisma/seed.js
```

- [ ] `docker compose ps` 4 容器都是 `Up (healthy)`
- [ ] `docker exec mesa-postgres pg_isready -U mesa -d mesa` 成功
- [ ] `curl -fsSL https://recruit.<domain>/api/health` 返回 ok
- [ ] 浏览器打开 `https://recruit.<domain>/login` 显示登录页
- [ ] 用 `admin@mesa.local / mesa-dev-2026` 登录成功,看到 Dashboard

## 4. Cloudflare WAF 规则

`Security → WAF → Custom rules → Create rule`:

- [ ] **Rule 1: API 限速**
  - 表达式:`(starts_with(http.request.uri.path, "/api/"))`
  - 动作:Rate limit → Per IP, 60 requests / 60 seconds
- [ ] **Rule 2: 防登录暴力**
  - 表达式:`(http.request.uri.path eq "/api/auth/login") and (http.request.method eq "POST")`
  - 动作:Rate limit → Per IP, 5 requests / 60 seconds
- [ ] **Rule 3: 屏蔽常见扫描器**
  - 表达式:`(http.user_agent contains "sqlmap") or (http.user_agent contains "nikto") or (http.user_agent contains "masscan")`
  - 动作:Block

## 5. Cloudflare R2(阶段② 启用)

- [ ] R2 → Create bucket:
  - 名称:`mesa-resumes`(业务桶)
  - Location Hint:Auto
- [ ] R2 → Create bucket:
  - 名称:`mesa-backups`(备份桶)
- [ ] R2 → Manage API Tokens → Create API Token:
  - 名称:`mesa-app`
  - 权限:`Object Read & Write` 仅 `mesa-resumes`
  - 复制 Access Key ID / Secret Access Key 到 VPS 的 `.env`
- [ ] R2 → Create API Token(独立 token):
  - 名称:`mesa-backup`
  - 权限:`Object Read & Write` 仅 `mesa-backups`
  - 这一对凭证由 backup.sh 在服务器上用 aws CLI 使用
- [ ] mesa-resumes 桶 → Settings → CORS Policy(让前端能直接 PUT):

```json
[
  {
    "AllowedOrigins": ["https://recruit.<domain>"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

- [ ] 修改 VPS 上 `/opt/mesa/.env`,填入 R2 凭证,`docker compose up -d backend` 重启
- [ ] 验证:浏览器登录 → 简历收件箱 → 上传一个 PDF,看 R2 桶里有新对象

## 6. 备份与 systemd timer

```bash
# 6.1 在 VPS 上为 backup.sh 配置 aws CLI
sudo apt install -y awscli
aws configure --profile r2-backup
# Access Key ID: <mesa-backup token 的 AK>
# Secret Access Key: <mesa-backup token 的 SK>
# Default region: auto
# Output format:  json

# 6.2 手动跑一次验证
sudo /opt/mesa/ops/backup.sh
# 应看到 [backup] uploaded ok

# 6.3 安装 systemd timer(不用 crontab — 见 delivery-docs/src/04_ops.md §2.1)
# 在 /etc/systemd/system/ 创建 mesa-backup.service + mesa-backup.timer 后:
sudo systemctl daemon-reload
sudo systemctl enable --now mesa-backup.timer
systemctl list-timers mesa-backup.timer   # 验证下次触发时间
```

- [ ] `sudo /opt/mesa/ops/backup.sh` 成功,远端能看到对象
- [ ] `systemctl is-enabled mesa-backup.timer` 为 enabled
- [ ] `journalctl -u mesa-backup.service -n 20` 无持续失败

## 7. 上线 Checklist

- [ ] 浏览器登录正常,Dashboard 数据加载
- [ ] 切到 Candidates / Jobs / Staff / Departments / Interviews / Reports 都 OK
- [ ] 候选人详情、员工详情显示完整
- [ ] 创建/删除候选人 CRUD 工作
- [ ] 上传简历(R2)成功
- [ ] Cloudflare Analytics 显示流量进来
- [ ] Cloudflare 移动 SSL/TLS → Edge Certificate 显示已颁发
- [ ] `docker compose ps` 全 healthy 维持 24h
- [ ] 备份脚本至少跑过 1 次(可手动触发验证)
- [ ] 把当前 git commit SHA 记下来作为 v1.0 baseline:`____________`

## 8. 异常时的 emergency 操作

- 流量异常 → Cloudflare → Security → 切 "I'm under attack" 模式
- 想紧急回滚 → `docker compose pull mesa-server:<旧 SHA> && docker compose up -d backend`
- 想完全停服 → `docker compose down`(不会丢数据,卷保留)
- 想直连 VPS 排查 → Cloudflare DNS 临时切灰云(不代理),5 分钟后还原

## 9. 退出 checklist(每次 SSH 完成)

- [ ] `~/.bash_history` 不包含敏感凭证(已 export 过 `HISTIGNORE='*PASSWORD*:*SECRET*:*KEY*'`)
- [ ] 当前已知 root cause 已记录到 `ops/incidents/YYYY-MM-DD.md`(如有)
- [ ] 不留过期 screen / tmux session
