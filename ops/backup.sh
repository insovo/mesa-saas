#!/usr/bin/env bash
# MESA Recruit · 数据库容灾备份脚本(见 delivery-docs/src/04_ops.md §2)
# 流程:
#   1) docker exec mesa-postgres pg_dump → /tmp/mesa-pg-YYYYMMDD-HHMM.sql
#   2) gzip 高比例压缩
#   3) 上传到 Cloudflare R2 的 备份桶(独立 bucket,凭证不写入业务桶)
#   4) 本地保留近 7 天,远端按桶生命周期策略
# 触发: 生产由 systemd timer mesa-backup.timer 每日 03:00 UTC(见 04_ops.md §2.1)
#
# 依赖:
#   - docker / docker compose(容器名 mesa-postgres)
#   - aws CLI(配置好 R2 endpoint)或 wrangler。本脚本默认走 aws CLI。
#   - .env 文件提供 POSTGRES_USER / POSTGRES_DB / R2_BACKUP_BUCKET / R2_ACCOUNT_ID
#
# 安全:
#   - 永远不要把 R2_SECRET_ACCESS_KEY 写在本脚本里;从 ~/.aws/credentials 或环境变量读取。
#   - 备份桶 ACL 禁止公网读取,只允许 backup IAM 读写。

set -euo pipefail

# ─── 配置 ───────────────────────────────────────────────────────
PROJECT_DIR="${PROJECT_DIR:-/opt/mesa}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/mesa}"
RETAIN_DAYS="${RETAIN_DAYS:-7}"
CONTAINER="${CONTAINER:-mesa-postgres}"

# R2 endpoint 形如 https://<account-id>.r2.cloudflarestorage.com
# aws CLI 配置:
#   aws configure set aws_access_key_id     <R2_ACCESS_KEY_ID>     --profile r2-backup
#   aws configure set aws_secret_access_key <R2_SECRET_ACCESS_KEY> --profile r2-backup
#   aws configure set region                auto                   --profile r2-backup
AWS_PROFILE="${AWS_PROFILE:-r2-backup}"

# ─── 加载环境 ───────────────────────────────────────────────────
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
else
  echo "[backup] env file not found: $ENV_FILE" >&2
  exit 1
fi

: "${POSTGRES_USER:?missing POSTGRES_USER in env}"
: "${POSTGRES_DB:?missing POSTGRES_DB in env}"
: "${R2_BACKUP_BUCKET:?missing R2_BACKUP_BUCKET in env}"
: "${R2_ACCOUNT_ID:?missing R2_ACCOUNT_ID in env}"

# ─── 准备 ───────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_FILE="$BACKUP_DIR/mesa-pg-${TS}.sql"
GZ_FILE="${DUMP_FILE}.gz"
R2_KEY="postgres/$(date -u +%Y/%m)/mesa-pg-${TS}.sql.gz"

log() { echo "[backup] $(date -Iseconds) $*"; }

# ─── 1) pg_dump ─────────────────────────────────────────────────
log "dumping db=${POSTGRES_DB} from container=${CONTAINER}"
docker exec -i "$CONTAINER" pg_dump \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --no-owner --no-acl --clean --if-exists \
  > "$DUMP_FILE"

SIZE_RAW="$(stat -c%s "$DUMP_FILE" 2>/dev/null || stat -f%z "$DUMP_FILE")"
log "dump done: $DUMP_FILE ($SIZE_RAW bytes)"

# ─── 2) gzip ────────────────────────────────────────────────────
log "compressing..."
gzip -9 "$DUMP_FILE"
SIZE_GZ="$(stat -c%s "$GZ_FILE" 2>/dev/null || stat -f%z "$GZ_FILE")"
log "compressed: $GZ_FILE ($SIZE_GZ bytes)"

# ─── 3) 上传 R2 ─────────────────────────────────────────────────
log "uploading to r2://$R2_BACKUP_BUCKET/$R2_KEY"
aws --profile "$AWS_PROFILE" \
    --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
    s3 cp "$GZ_FILE" "s3://${R2_BACKUP_BUCKET}/${R2_KEY}" \
    --no-progress

log "uploaded ok"

# ─── 4) 清理本地老备份 ─────────────────────────────────────────
log "pruning local files older than $RETAIN_DAYS days..."
find "$BACKUP_DIR" -name "mesa-pg-*.sql.gz" -mtime "+$RETAIN_DAYS" -print -delete || true

log "all done. local=$GZ_FILE remote=s3://${R2_BACKUP_BUCKET}/${R2_KEY}"
