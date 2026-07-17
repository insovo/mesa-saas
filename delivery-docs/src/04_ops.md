---
title: "Overseas R&D · 系统日常运维与数据灾备恢复手册"
author: "Overseas R&D 交付组"
date: "2026-07-17"
---

# 1. 日常巡检 SOP

## 1.1 早班 5 分钟巡检(推荐每日 09:30 前完成)

```bash
ssh deploy@vps
cd /opt/mesa

# 1) 容器健康
docker compose ps             # 4 容器应全部 Up + healthy

# 2) 磁盘 / 内存
df -h                         # / 分区 > 20% 余量
free -h                       # 可用内存 > 1G

# 3) 应用响应
curl -fsSL https://recruit.your-domain.com/api/health

# 4) 备份成功记录
tail -20 /var/log/mesa-backup.log

# 5) 错误日志(应当稀少)
docker logs --since 24h mesa-server 2>&1 | grep -i "error" | head -20
```

## 1.2 周巡检

```bash
# 1) 磁盘占用 top 10
sudo du -sh /var/lib/docker/* | sort -h | tail -10

# 2) Postgres 容量
docker exec mesa-postgres psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "SELECT pg_size_pretty(pg_database_size(current_database()));"

# 3) Redis 内存
docker exec mesa-redis redis-cli INFO memory | grep used_memory_human

# 4) 备份桶大小(R2)
aws --profile r2-backup --endpoint-url $R2_ENDPOINT \
    s3 ls s3://mesa-backups --recursive --human-readable --summarize | tail -3

# 5) Cloudflare Analytics 看 4xx/5xx 趋势
```

# 2. 备份与灾备

## 2.1 自动备份机制(实际部署:systemd timer)

> 本项目采用 **systemd timer + service**,不用 crontab。
> 优点:有 journal 日志、统一管理、支持 `Persistent=true`(重启后补跑)、`RandomizedDelaySec` 防雪崩。

- **触发**:`mesa-backup.timer`(`/etc/systemd/system/mesa-backup.timer`)
  - `OnCalendar=*-*-* 03:00:00` UTC
  - `Persistent=true` · `RandomizedDelaySec=300`
- **脚本**:`/opt/mesa/ops/backup.sh`(由 service unit `mesa-backup.service` 调用)
- **流程**:
  1. `docker exec mesa-postgres pg_dump` → `/var/backups/mesa/mesa-pg-{ts}.sql`
  2. `gzip -9` 压缩
  3. `aws --profile r2-backup s3 cp` 上传到 `s3://mesa-backups/postgres/YYYY/MM/mesa-pg-{ts}.sql.gz`
  4. 本地保留 7 天,远端按 R2 lifecycle(建议设置 90 天后转 IA 存储,365 天后归档)

### 常用命令

```bash
# 看下次备份时间
systemctl list-timers mesa-backup.timer

# 手动触发一次
sudo systemctl start mesa-backup.service

# 看最近备份日志
journalctl -u mesa-backup.service -n 50 --no-pager

# 列 R2 所有备份
aws --profile r2-backup --endpoint-url https://<account-id>.r2.cloudflarestorage.com \
    s3 ls s3://mesa-backups/postgres/ --recursive --human-readable
```

## 2.2 手动备份

```bash
cd /opt/mesa
sudo /opt/mesa/ops/backup.sh
```

## 2.3 备份完整性验证(每月一次)

```bash
# 1) 列出最近 5 个备份
aws --profile r2-backup --endpoint-url $R2_ENDPOINT \
    s3 ls s3://mesa-backups/postgres/$(date +%Y)/$(date +%m)/ | tail -5

# 2) 抽样下载一个,尝试本地解压
TS=20260520T030000Z
aws --profile r2-backup --endpoint-url $R2_ENDPOINT \
    s3 cp s3://mesa-backups/postgres/2026/05/mesa-pg-${TS}.sql.gz /tmp/verify.sql.gz

gunzip -t /tmp/verify.sql.gz && echo "[ok] gzip integrity ok"
zcat /tmp/verify.sql.gz | head -50  # 应看到 CREATE TABLE 等 SQL
```

# 3. 全新服务器灾备恢复(RTO ≤ 30 分钟)

## 3.1 场景

原 VPS 已不可用(机房故障/被入侵/误删 volume),需要在新 VPS 上分钟级恢复服务。

## 3.2 步骤

```bash
# === 在「新 VPS」上 ===

# 1) 按交付文档 03 §2-§3 完成: 创建 deploy 用户、UFW、SSH 加固、装 Docker
#    (略,约 10 分钟)

# 2) 克隆仓库 + 填 .env(可用旧 VPS 上的 .env 备份,或重新生成 JWT_SECRET)
sudo mkdir -p /opt/mesa && sudo chown deploy:deploy /opt/mesa
cd /opt
git clone https://github.com/<owner>/<repo>.git mesa
cd mesa
cp .env.example .env
nano .env  # 填入真实凭证

# 3) 配置 aws CLI 读 R2(临时用,仅恢复用)
aws configure --profile r2-backup
# AWS Access Key ID: <R2_ACCESS_KEY_ID>
# Secret Access Key: <R2_SECRET_ACCESS_KEY>
# Default region:    auto
# Output format:     json

# 4) 启动容器(空数据库)
docker compose up -d
docker compose ps  # 等到全 healthy

# 5) 执行恢复脚本
sudo /opt/mesa/ops/restore.sh \
    r2://mesa-backups/postgres/2026/05/mesa-pg-20260520T030000Z.sql.gz

# 6) 验证
curl -fsSL https://recruit.your-domain.com/api/health
# Cloudflare 已经把流量切到新 VPS IP 之后,浏览器登录验证
```

## 3.3 切流(DNS 变更)

```bash
# Cloudflare API 把 A 记录指向新 VPS IP
curl -X PUT "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$RECORD_ID" \
     -H "Authorization: Bearer $CF_API_TOKEN" \
     -H "Content-Type: application/json" \
     --data '{"type":"A","name":"recruit","content":"<新IP>","ttl":60,"proxied":true}'

# 由于 Cloudflare TTL 通常 60s,DNS 切换 1-2 分钟即可生效
```

# 4. 常见故障排查

## 4.1 frontend 容器 unhealthy

```bash
docker logs mesa-web | tail -30
docker exec mesa-web wget -qO- http://127.0.0.1/healthz   # 容器内自检
docker exec mesa-web nginx -t                              # 检查 nginx.conf 语法
```

## 4.2 backend 502 / 健康检查失败

```bash
docker logs mesa-server | tail -50

# 最常见: 数据库连接失败
docker exec mesa-postgres pg_isready -U $POSTGRES_USER -d $POSTGRES_DB

# 看 backend 是否能连数据库:
docker exec mesa-server sh -c \
  "node -e \"require('@prisma/client'); console.log('prisma ok')\""
```

## 4.3 数据库连接耗尽

```bash
docker exec mesa-postgres psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "SELECT count(*) FROM pg_stat_activity;"
# 默认上限 100;持续 >70 需排查 backend 是否漏关连接(Prisma 已统一管控,概率低)
```

## 4.4 磁盘满

```bash
df -h
docker system df

# 紧急释放
docker image prune -af      # 删除未使用镜像
docker volume prune         # ⚠️ 慎用,会删未挂载的卷
sudo journalctl --vacuum-size=200M
```

## 4.5 JWT_SECRET 改动后所有用户被踢出

正常行为。`JWT_SECRET` 变更等价于全员强制重新登录。如不是有意为之,把旧 secret 恢复回来即可。

# 5. 升级与版本管理

## 5.1 升级单个服务

```bash
cd /opt/mesa
# 拉取最新 main 分支,等待 CI 推送新镜像
git pull
docker compose pull mesa-server      # 仅拉后端,前端同理
docker compose up -d mesa-server     # 滚动升级,downtime < 5s
```

## 5.2 Prisma 迁移

backend 容器启动时会自动 `npx prisma migrate deploy` 应用最新迁移。手动:

```bash
docker exec mesa-server npx prisma migrate deploy
```

## 5.3 回退版本

```bash
docker compose pull mesa-server:abc12345    # 指定 sha tag
docker compose up -d mesa-server
```

# 6. 应急联系与 Runbook

| 场景 | 操作 |
|------|------|
| VPS 整机宕机 | 见 §3.2 全新服务器灾备恢复 |
| Cloudflare 异常(罕见) | 临时把 DNS 代理状态关掉(灰云),直连 VPS;Cloudflare 恢复后再开 |
| 误删 Candidate / Employee | 从最近一次备份 selective restore: `pg_restore --data-only -t candidates ...` |
| 被 DDoS | Cloudflare → Security → I'm Under Attack 模式临时开启 |
| 数据库密码泄露 | 1) 改 `POSTGRES_PASSWORD` 与 `.env`;2) 在容器内 `ALTER USER mesa PASSWORD '...'`;3) `docker compose up -d backend` |
| JWT 密钥泄露 | 改 `JWT_SECRET`,重启 backend。所有 token 立即失效 |

# 7. 可观测性(已部署)

## 7.1 Uptime Kuma · 已上线

- 地址:**https://monitor.insovo.top**
- 部署:`docker-compose.yml` 中 `uptime-kuma` 服务,卷 `mesa_uptime_data`
- 访问:Cloudflare CDN → nginx(`monitor.insovo.top` server block) → `uptime-kuma:3001`
- 推荐 monitor:
  - `https://insovo.top/api/health`(60s)
  - `https://insovo.top/healthz`(60s)
  - `https://insovo.top/login` HTTPS 关键字校验
  - 自定义业务接口
- 通知:UI `Settings → Notifications` 添加 Telegram / 邮件 / Webhook,每个 monitor 单独勾选

## 7.2 可选进一步扩展

| 工具 | 用途 | 接入方式 |
|------|------|----------|
| Grafana + Loki | 日志聚合 | docker compose 加 promtail 收集 mesa-{server,web} 日志 |
| Cloudflare Analytics | 接入层 RPS / 错误率 | 已自带,登录 dashboard 查看 |
| Better Stack Heartbeat | 备份心跳 | 在 backup.sh 末尾 curl 一个 webhook,失败时报警 |

# 8. 附录 · 常用命令速查

```bash
# 重启所有容器
docker compose restart

# 强制重建 + 启动
docker compose up -d --build --force-recreate

# 进入容器
docker exec -it mesa-server sh
docker exec -it mesa-postgres psql -U mesa -d mesa

# 看实时日志
docker compose logs -f --tail=100 backend
docker compose logs -f --tail=100 frontend

# 备份(本地)
sudo /opt/mesa/ops/backup.sh

# 恢复(本地路径或 R2 路径)
sudo /opt/mesa/ops/restore.sh r2://mesa-backups/postgres/2026/05/mesa-pg-xxx.sql.gz

# 完全停机(慎用!)
docker compose down

# 完全清理(慎用!会丢数据卷)
docker compose down -v
```

# 9. 新功能运维注意事项

## 9.1 评价系统数据增长

| 表 | 增长速度 | 监控阈值 |
|----|---------|---------|
| `reviews` | 中速,每候选人 5-50 条 | 单表 > 100MB 关注 |
| `review_votes` | 快速,每评价 N 投票 × 全员 | 单表 > 50MB 加 index 检查 |

清理策略(可选定期 cron):

```sql
-- 删除已 soft-deleted 超过 90 天的评价及其投票/回复(Cascade)
DELETE FROM reviews WHERE deleted_at < NOW() - INTERVAL '90 days';

-- 删除孤儿投票(理论上 Cascade 已处理,周巡检确认)
DELETE FROM review_votes WHERE NOT EXISTS (SELECT 1 FROM reviews r WHERE r.id = review_id);
```

## 9.2 ShareLink 清理

```sql
-- 过期 > 7 天的 ShareLink 已无用,可清理
DELETE FROM share_links
 WHERE expires_at IS NOT NULL AND expires_at < NOW() - INTERVAL '7 days';
```

## 9.3 R2 业务桶清理(简历 + 评价附件)

`mesa-resumes` 桶里有两类文件:
- `uploads/<uuid>.pdf` — 候选人简历
- `reviews/public/<uuid>.*` — 公开访客评价附件

定期对比 DB 实际引用,删除孤儿对象,避免桶无限增长。

## 9.4 Kimi API 用量监控

```bash
# 看今日 Kimi 调用次数
docker compose logs --since 24h backend | grep "kimi" | wc -l
```

如发现异常激增,先 admin UI 把 `kimi.api_key` 设为空字符串临时停服。

## 9.5 浏览器通知 / 音效不工作排查

候选人详情页新评价应触发桌面通知 + 音效,若无效:
1. 浏览器地址栏 → 站点权限 → 通知 = 允许
2. Chrome 设置 → 隐私 → 站点设置 → 通知 → `insovo.top`
3. 音效不响:Web Audio API 需用户交互后才能 play,首次进入页面无声正常(用户先点过任意按钮后才会有音)

## 9.6 JWT_SECRET 与 AES 加密字段联动风险

以下字段用 AES-256-GCM 加密,密钥从 `JWT_SECRET` HKDF 派生(`salt="mesa.settings.v1"`):

| 数据 | 字段 |
|------|------|
| SystemSetting | `kimi.api_key` 等 `encrypted=true` 的 value |
| 绩效访问密钥回显 | `PerformanceEvaluation.selfAccessKeyEnc` / `managerAccessKeyEnc` |

**轮换 JWT_SECRET 会让上述密文全部解不开**,但:

- 用户登录 JWT 全部失效(需重新登录)——预期行为
- 绩效公开填表仍可用:**bcrypt hash 校验不依赖 JWT_SECRET**
- Admin 无法再「眼睛查看 / 预览导出」旧明文,直到 bulk generate / set 新密钥

推荐顺序:
1. admin UI 确认当前 Kimi key 可用(或先备份明文到安全渠道)
2. 若仍需保留旧绩效密钥明文副本:先跑「批量导出密钥」并妥善保管
3. 改 `JWT_SECRET`, `docker compose up -d --force-recreate backend`
4. admin UI 重新粘贴 Kimi key
5. 绩效页对需要回显的记录执行「刷新随机密钥」或「设置统一密钥」

## 9.7 绩效评价运维速查

| 场景 | 动作 |
|------|------|
| 用户忘密钥 | Admin Share Modal → ensure / 刷新随机密钥 / 设置统一密钥 → 重新「复制链接密钥」 |
| 密钥 Excel 泄露 | 对该批评价 `access-keys/bulk` generate 轮换;旧 Excel 作废 |
| 模板改版 | 更新 `assets/templates/performance-evaluation-zh-en-v2.xlsx` + `TEMPLATE_EXPECTED_HASHES`;镜像须含 `COPY assets`(坑 #38) |
| 导出要嵌入 HR 章 | 当前用户先上传电子章;导出勾选 `embedHrSignature` |
| 撤销错发周期 | `POST /evaluations/:id/revoke` |