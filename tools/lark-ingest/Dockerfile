# lark-ingest · 飞书简历自动入库常驻容器
# 内置官方 @larksuite/cli(长连接事件订阅 + 文件下载)+ 零依赖 Node 脚本。
FROM node:20-slim

# 官方 Lark/Feishu CLI(Go 二进制,经 npm 分发)。固定主版本,避免 CLI 行为漂移。
RUN npm install -g @larksuite/cli@1 \
    && lark-cli --version

WORKDIR /app
COPY package.json ingest.mjs entrypoint.sh ./

# downloads 临时下载目录;DATA_DIR(/app/data)放去重状态,运行时挂卷持久化。
# 全部归 node 用户,容器以非 root 运行。
RUN chmod +x entrypoint.sh \
    && mkdir -p downloads data \
    && chown -R node:node /app

USER node
ENV HOME=/home/node \
    DATA_DIR=/app/data

ENTRYPOINT ["/app/entrypoint.sh"]
