#!/bin/sh
# 启动期用环境变量配置 lark-cli(App Secret 走 stdin,不进镜像/进程列表),再起监听。
set -e

if [ -z "$LARK_APP_ID" ] || [ -z "$LARK_APP_SECRET" ]; then
  echo "[fatal] 缺少 LARK_APP_ID / LARK_APP_SECRET 环境变量(在 VPS .env 配置)"
  exit 1
fi

printf '%s' "$LARK_APP_SECRET" \
  | lark-cli config init --app-id "$LARK_APP_ID" --app-secret-stdin --brand "${LARK_BRAND:-feishu}" >/dev/null

echo "[entrypoint] lark-cli 已配置(app=$LARK_APP_ID, brand=${LARK_BRAND:-feishu}),启动 ingest…"
exec node ingest.mjs
