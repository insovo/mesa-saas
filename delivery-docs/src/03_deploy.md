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

## 5.5 多 worktree 并行开发流程(开发侧硬约定)

当需要同时修多个问题(候选人 V2 / Kimi 鲁棒性 / Cloudflare 502 等)而不互相污染 working tree 时,**统一**使用 git worktree。本项目使用的标准结构是:

```
mesa/
└── .worktrees/              # ✅ 已在 .gitignore,不入库
    ├── feature/             # 新功能
    │   └── upload/          # = 一个独立 working tree,分支 feature/upload
    ├── fix/                 # bug 修复
    │   └── jwt-renew/
    ├── hotfix/              # 生产紧急
    │   └── cf-502/
    ├── chore/               # 杂活
    └── docs/                # 文档
```

### 5.5.1 命名规则

- **位置**:`.worktrees/<分类>/<任务名>` 两级目录
- **分类**白名单:`feature` / `fix` / `hotfix` / `chore` / `docs`
- **分支名**与目录同名:`<分类>/<任务名>`(如 `feature/upload`、`hotfix/cf-502`)
- ❌ **禁止**放 `.claude/worktrees/`(Claude Code 工具默认路径,不符合本项目约定;且 `.claude/` 已加入 gitignore 防误推)

### 5.5.2 标准命令

```bash
# === 在主 repo (/Users/mysaria/Project/mesa 或 /opt/mesa) 跑 ===

# 1) 创建 worktree(一律基于 origin/main,不要基于本地 main,可能滞后)
git worktree add .worktrees/feature/upload   -b feature/upload   origin/main
git worktree add .worktrees/fix/jwt-renew    -b fix/jwt-renew    origin/main
git worktree add .worktrees/hotfix/cf-502    -b hotfix/cf-502    origin/main

# 2) 进入 worktree 开发
cd .worktrees/feature/upload
#   各自的 .env / node_modules / web/certs/ 需独立准备,git 不会自动同步
#   建议: cp /opt/mesa/.env .env  或链接 ln -s ../../../.env .env

# 3) 完事提交并推送 feature 分支
git add <files>
git commit -m "feat(upload): xxx"
git push -u origin feature/upload

# 4) 合并到 main — **必须走 PR**(main 已加 branch protection: 3 status check 必过)
#    A. 推荐: GitHub PR + admin merge
gh pr create --base main --head feature/upload --title "..." --body "..."
gh pr checks <num> --watch              # 等 CI 通过 (~30-90s)
gh pr merge <num> --merge --admin       # admin 跳过 review 要求,适合单人项目
#                                        # 自动触发 deploy.yml
#
# 直接 push origin main 会被拒:
#   remote: error: GH013: Repository rule violations found for refs/heads/main
#   remote: - 3 of 3 required status checks are expected

# 5) 清理
git worktree remove .worktrees/feature/upload
git branch -d feature/upload          # 已合并的用 -d,git 自带保护
#                                     # 未合并的强制删用 -D,慎用
```

### 5.5.3 与 CI/CD 的衔接

| 触发点 | 链路 |
|---|---|
| `git push origin feature/<x>` | 触发 **CI** (build + smoke),**不会** deploy |
| `gh pr create` + `gh pr merge --admin` | 合到 main 后自动触发 **Deploy**(GHCR build/push + SSH 滚动部署),1-2 分钟生产生效 |
| `gh workflow run deploy.yml --ref main` | 手动触发,无需 push(适合 deploy 失败 retry) |

**已知 deploy 失败模式**:
- VPS 到 docker.io 网络抖动 → `Image redis:7-alpine ... i/o timeout`。修复已在 deploy.yml:
  `docker compose pull backend frontend || true` (只拉 GHCR 镜像不 abort) +
  `docker compose up -d --pull missing` (本地缓存的基础镜像不重拉)。
  本节遇过的根因 + 修复见 `CLAUDE.md §8 踩坑 #29 / #32`。

### 5.5.4 多 AI 协作约束

本项目至少有 Claude Code / Codex CLI / Cursor 三家 AI 介入。Worktree 约定对所有 AI 等效:

1. **AI 创建 worktree 时**:必须用 `.worktrees/<分类>/<任务>`,**不允许**用工具自带的默认路径(如 Claude Code 的 `EnterWorktree` 默认 `.claude/worktrees/`)
2. **AI 退出 worktree 时**:已合并的分支必须 `git worktree remove + git branch -d` 清理,避免堆积
3. **AI 不主动 commit/push**:按 `CLAUDE.md §13` 全局硬约束,任何 commit / push / merge 到 main 都必须用户明确指令

### 5.5.5 踩坑速查

| 现象 | 原因 | 修复 |
|------|------|------|
| `fatal: 'feature/xxx' already exists` | 旧分支残留 | `git branch -d feature/xxx`(小 d 保护,有未合并 commit 会拒绝) |
| worktree 里 `npm run dev` 报 module not found | 每个 worktree 独立 `node_modules`,需各自 `npm install` | `cd .worktrees/feature/upload/server && npm install` |
| worktree 里 `.env` 缺失 | git 不会同步 untracked 文件 | 从主 repo 复制或软链:`cp ../../../.env .env` |
| `git worktree list` 显示残留路径 | `rm -rf` 删了目录但没 `git worktree remove` | `git worktree prune` 清理元数据 |
| 前端 dev `Port 5173 is in use` | 主 repo 已占,worktree 没分配新端口 | 见 §5.5.6 |
| 浏览器登录后请求 `/api/*` CORS 报错 | `server/.env` 的 `WEB_ORIGIN` 没跟着前端端口改 | 与 `VITE_DEV_PORT` 对齐(如 `WEB_ORIGIN="http://localhost:5183"`) |

### 5.5.6 多 worktree 端口分配(防冲突)

后端默认 `3001` + 前端默认 `5173`,多 worktree 并行启动 dev server 会冲突。通过**端口登记表 `.worktree-ports.json`**(项目根,入库)管理。

**端口分配公式**:

| slot | 用途 | 后端 PORT | 前端 VITE_DEV_PORT |
|------|------|-----------|----|
| 0 | 主 repo (main) | 3001 | 5173 |
| 1 | 第 1 个 worktree | 3011 | 5183 |
| 2 | 第 2 个 worktree | 3021 | 5193 |
| N | 第 N 个 worktree | 3001 + N*10 | 5173 + N*10 |

**新建 worktree 端口分配步骤**(配合 §5.5.2 的命令):

```bash
# === 1) 在主 repo 跑 ===

# 看现有 slot 已占哪些
cat .worktree-ports.json | jq '.slots[].slot'

# 假设下一个空闲 = 1,则:
BACKEND=3011
FRONTEND=5183

# 2) 创建 worktree(同 §5.5.2)
git worktree add .worktrees/feature/upload -b feature/upload origin/main

# 3) 复制 .env 并改后端端口
cp .env .worktrees/feature/upload/.env
cp server/.env .worktrees/feature/upload/server/.env
sed -i '' "s|^PORT=.*|PORT=\"$BACKEND\"|" .worktrees/feature/upload/server/.env
sed -i '' "s|^WEB_ORIGIN=.*|WEB_ORIGIN=\"http://localhost:$FRONTEND\"|" .worktrees/feature/upload/server/.env

# 4) 写前端 .env(新建)
cat > .worktrees/feature/upload/web/.env <<EOF
VITE_DEV_PORT=$FRONTEND
VITE_API_PORT=$BACKEND
EOF

# 5) 登记到 .worktree-ports.json(用 jq 或手编辑)
jq --arg slot 1 --arg name feature/upload --arg path .worktrees/feature/upload \
   --arg branch feature/upload --arg backend "$BACKEND" --arg frontend "$FRONTEND" \
   --arg since "$(date -u +%F)" \
   '.slots += [{slot:($slot|tonumber),name:$name,path:$path,branch:$branch,backend:($backend|tonumber),frontend:($frontend|tonumber),since:$since}]' \
   .worktree-ports.json > /tmp/wp.json && mv /tmp/wp.json .worktree-ports.json

# 6) 装依赖
cd .worktrees/feature/upload/server && npm install && npx prisma generate
cd ../web && npm install
```

**vite.config.js 已改造**(向后兼容):
```js
// web/vite.config.js
const devPort = Number(env.VITE_DEV_PORT) || 5173;
const apiPort = Number(env.VITE_API_PORT) || 3001;
```
- 主 repo 不需要 `web/.env`(走默认 5173/3001)
- worktree 通过 `web/.env` 注入端口,vite 启动时自动读

**禁止**:
1. 跳过 `.worktree-ports.json` 直接 `git worktree add`(端口登记会漂移)
2. 多个 worktree 共用同一 slot(端口冲突)
3. 手改 `vite.config.js` 硬编码端口(改 env 即可)

**删除 worktree**:
```bash
git worktree remove .worktrees/feature/upload
git branch -d feature/upload
# 从登记表删条目
jq '.slots |= map(select(.name != "feature/upload"))' \
   .worktree-ports.json > /tmp/wp.json && mv /tmp/wp.json .worktree-ports.json
```

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

# 11. LLM(Kimi)配置(上线后追加)

## 11.1 .env 字段

```dotenv
KIMI_BASE_URL=https://api.moonshot.cn/v1
KIMI_API_KEY=sk-...
KIMI_MODEL=moonshot-v1-32k
```

`KIMI_API_KEY` **优先级**:DB SystemSetting > .env fallback。生产建议:
- `.env` 留空(`KIMI_API_KEY=`),让 admin 在 UI 设置(加密写 DB)
- 仅紧急回退时填 .env

## 11.2 admin UI 改 Kimi 配置

Sidebar → LLM Key → 编辑:
1. **API Key**:粘贴 `sk-...` → 系统加密(AES-256-GCM,密钥从 JWT_SECRET HKDF 派生)写 DB
2. **模型**:从 Kimi `/v1/models` 动态拉,管理员选择
3. **Prompt**:解析模板,默认 ~3000 字,可改至 20000 字

⚠️ **风险**:轮换 `JWT_SECRET` 会让加密 SystemSetting 全部不可解,需先 UI 解密 → 改 secret → 重写。

## 11.3 测试 Kimi 连通

```bash
curl -X POST "https://insovo.top/api/system/settings/kimi.api_key/test" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"value":"sk-..."}'
# {"ok":true} 或 4xx 错误描述
```

# 12. R2 业务桶 + 备份桶分离

| 桶 | 用途 | 凭证位置 |
|----|------|---------|
| `mesa-resumes` | 业务文件:简历 / 评价附件 | VPS `/opt/mesa/.env` 中的 `R2_*` |
| `mesa-backups` | 每日 pg_dump | VPS `~/.aws/credentials` 中 `[r2-backup]` profile |

业务桶 CORS 限定 `https://insovo.top`。备份桶不需 CORS(server-to-server)。

