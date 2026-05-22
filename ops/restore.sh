#!/usr/bin/env bash
# MESA Recruit · 数据库灾备恢复脚本(demo.md §5.3 + 交付文档 04 配套)
# 用法:
#   ops/restore.sh r2://mesa-backups/postgres/2026/05/mesa-pg-20260522T0300Z.sql.gz
#   ops/restore.sh /var/backups/mesa/mesa-pg-20260522T0300Z.sql.gz
# 流程:
#   1) 入参可以是本地 .sql.gz 或 r2:// 路径;若为后者先拉到本地
#   2) docker exec mesa-postgres dropdb + createdb 重建空库
#   3) gunzip -c | docker exec ... psql 灌入数据
#   4) 重启 backend 容器,触发 prisma migrate deploy 校准 schema
#
# 安全:
#   - 仅在确认目标数据库可清空时使用!脚本会清掉当前 DB。
#   - 先停 backend 写入,避免半中间状态。

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <local-path-or-r2-url>"
  exit 2
fi

INPUT="$1"
PROJECT_DIR="${PROJECT_DIR:-/opt/mesa}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env}"
CONTAINER="${CONTAINER:-mesa-postgres}"
BACKEND="${BACKEND:-mesa-server}"
AWS_PROFILE="${AWS_PROFILE:-r2-backup}"

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
: "${POSTGRES_USER:?missing POSTGRES_USER}"
: "${POSTGRES_DB:?missing POSTGRES_DB}"

log() { echo "[restore] $(date -Iseconds) $*"; }

# ─── 1) 准备本地文件 ───────────────────────────────────────────
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

if [[ "$INPUT" == r2://* ]] || [[ "$INPUT" == s3://* ]]; then
  : "${R2_ACCOUNT_ID:?missing R2_ACCOUNT_ID}"
  : "${R2_BACKUP_BUCKET:?missing R2_BACKUP_BUCKET}"
  KEY="${INPUT#r2://}"; KEY="${KEY#s3://}"
  LOCAL="$TMP_DIR/$(basename "$KEY")"
  log "downloading from r2: $KEY"
  aws --profile "$AWS_PROFILE" \
      --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
      s3 cp "s3://${KEY}" "$LOCAL" --no-progress
else
  LOCAL="$INPUT"
fi
[[ -f "$LOCAL" ]] || { echo "[restore] file not found: $LOCAL" >&2; exit 1; }
log "input: $LOCAL"

# ─── 2) 停 backend(防止半中间写入)─────────────────────────────
log "stopping backend container..."
docker stop "$BACKEND" >/dev/null || true

# ─── 3) drop & recreate db ─────────────────────────────────────
log "dropping & recreating db=$POSTGRES_DB"
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER" psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\";"
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER" psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE \"$POSTGRES_DB\";"

# ─── 4) 灌入 ───────────────────────────────────────────────────
log "restoring dump..."
gunzip -c "$LOCAL" | docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER" \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

# ─── 5) 启动 backend(prisma migrate deploy 会自动跑)───────────
log "starting backend..."
docker start "$BACKEND" >/dev/null

log "done. verify via: curl https://your-domain.example.com/api/health"
