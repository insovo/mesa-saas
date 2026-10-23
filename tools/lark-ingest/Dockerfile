# lark-ingest · 飞书校招自动定薪常驻容器
# 内置官方 @larksuite/cli(长连接事件订阅 + 文件下载)+ 零依赖 Node 脚本。
FROM node:20-slim

# 官方 Lark/Feishu CLI(Go 二进制,经 npm 分发)。固定主版本,避免 CLI 行为漂移。
# 其 postinstall 脚本用 curl 下载二进制,而 node:*-slim 不含 curl/证书,需先装。
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g @larksuite/cli@1 \
    && lark-cli --version

WORKDIR /app
COPY package.json ingest.mjs salary-client.mjs entrypoint.sh ./

# downloads 为临时下载目录；data保留兼容旧卷，新幂等状态在数据库。
# 全部归 node 用户,容器以非 root 运行。
RUN chmod +x entrypoint.sh \
    && mkdir -p downloads data \
    && chown -R node:node /app

USER node
ENV HOME=/home/node \
    DATA_DIR=/app/data

ENTRYPOINT ["/app/entrypoint.sh"]
