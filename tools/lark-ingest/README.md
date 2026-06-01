# lark-ingest(本地最小原型)

飞书群 / 私聊里发来的简历文件(pdf/doc/docx)→ 自动进 MESA「待解析」候选人池。

> 本目录是**本地验证用原型**,跑通后再演进成 VPS 常驻容器(见 `delivery-docs/src/05_feishu_resume_ingest.md`)。
> 零运行时依赖(Node 20 内置 fetch/child_process 即可),无需 `npm install`。

## 链路

```
lark-cli event consume im.message.receive_v1   (长连接,出站)
   → 过滤 message_type=file + 后缀白名单
   → lark-cli api GET 原始消息拿 file_key
   → lark-cli +messages-resources-download 下载
   → MESA: presigned-url → PUT R2 → submit(降级入库 tags=待解析)
```

## 前置准备

### 1. 配置 lark-cli 凭证(App Secret 不经第三方,自己执行)

```bash
# App Secret 用 stdin 传入,避免出现在进程列表 / shell history
printf '%s' '<你的 App Secret>' | lark-cli config init --app-id <你的 App ID> --app-secret-stdin --brand feishu
lark-cli config show          # 确认已写入
```

### 2. 在 MESA 建一个长期上传链接

MESA 后台新建一个 **UploadShareLink**(建议 `有效期=永久`、`次数上限=不限`、来源可留空),
复制它的 **token** 串。该链接的创建者 = 自动入库候选人的归属人(ownerId)。

### 3. 配置本目录 .env

```bash
cp .env.example .env
# 编辑 .env,填 MESA_BASE_URL 与 UPLOAD_TOKEN
```

## 运行

```bash
node ingest.mjs
# 或 npm start
```

然后在飞书里:把机器人拉进「简历收集群」,或直接私聊机器人 → 发一份 pdf/doc/docx 简历。
几秒后该候选人应出现在 MESA Upload 列表(`source=飞书群自动入库` / `飞书私聊自动入库`,`tags` 含「待解析」)。
admin 在列表点「解析」即触发 LLM 联评。

## 行为说明

- **覆盖来源**:内部群 / 外部群 / 私聊转发(`chat_type` p2p 与 group 都收)。
- **只收文件**:`message_type=file` 且后缀 ∈ {pdf,doc,docx};文本/图片/表情忽略;`merge_forward`(合并转发)暂不拆解(日志提示)。
- **去重**:`event_id` 幂等 + 文件 sha256 去重(持久化到 `state.json`,扛重启)。
- **断线重连**:`event consume` 退出后指数退避重连(1s→30s 封顶)。
- **fail-soft**:单条处理失败只记日志,主循环不中断;失败的事件不标记已处理,下次重投可重试。

## 验收自检

- [ ] 群里发 pdf/doc/docx → MESA 出现对应候选人
- [ ] 发文本/图片 → 不入库
- [ ] 同一文件转发两次 → 只入库一次(看到 `[dedup]`)
- [ ] 私聊转发简历给机器人 → 也能入库

## 安全

- `.env` / `downloads/` / `state.json` 已被 `.gitignore` 排除,**切勿提交**。
- App Secret 仅经 `lark-cli config`(stdin)落到 lark-cli 本地配置,不进本仓库。
- `UPLOAD_TOKEN` 是公开上传凭证,泄露 = 任意人可灌库,勿外发。

## 已知待办(原型 → 生产)

- 容器化(Dockerfile + compose 第 6 服务,`restart: unless-stopped`)
- `merge_forward` 合并转发拆解
- 失败告警(推回飞书群一条卡片 / 接 Uptime Kuma)
- 按发送人 open_id 映射不同招聘官(当前统一归 token 创建者)
