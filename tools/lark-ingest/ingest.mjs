// lark-ingest · 飞书简历自动入库 MESA(本地最小原型)
//
// 链路:lark-cli 长连接监听 im.message.receive_v1
//      → 过滤 file 类型 + 后缀白名单
//      → 回查原始消息拿 file_key(consume 输出的 content 对 file 是预渲染文本,不含 key)
//      → lark-cli 下载文件
//      → MESA 公开上传通道(presigned-url → PUT R2 → submit)
//
// 覆盖来源:内部群 / 外部群 / 私聊转发(chat_type p2p|group 都收)。
// 设计为 fail-soft:单条消息处理失败只记日志,不影响监听主循环。

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID, createHash } from "node:crypto";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

// ── 极简 .env 加载(零依赖,不覆盖已存在的环境变量)──────
function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadDotEnv(join(HERE, ".env"));

// ── 配置 ──────────────────────────────────────────────
const LARK_CLI = process.env.LARK_CLI || "lark-cli";
const MESA_BASE_URL = (process.env.MESA_BASE_URL || "").replace(/\/$/, "");
const UPLOAD_TOKEN = process.env.UPLOAD_TOKEN || "";
const ALLOWED_EXT = new Set(
  (process.env.ALLOWED_EXT || "pdf,doc,docx").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
);
const MAX_SIZE = Number(process.env.MAX_SIZE || 20 * 1024 * 1024);
// 回执开关:机器人在群里回复上传结果。需飞书应用已开「发送消息」权限;未开时设 false 不影响入库。
const REPLY_ENABLED = (process.env.REPLY_ENABLED ?? "true") !== "false";
const EVENT_KEY = "im.message.receive_v1";
// DATA_DIR:去重状态目录(容器内挂卷持久化以扛重启);下载是临时文件,用完即删
const DATA_DIR = process.env.DATA_DIR || HERE;
const DOWNLOAD_DIR = join(HERE, "downloads");
const STATE_FILE = join(DATA_DIR, "state.json");
mkdirSync(DATA_DIR, { recursive: true });

const MIME = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

if (!MESA_BASE_URL || !UPLOAD_TOKEN || UPLOAD_TOKEN.startsWith("__")) {
  console.error("[fatal] 请先在 tools/lark-ingest/.env 配置 MESA_BASE_URL 与 UPLOAD_TOKEN(见 .env.example)");
  process.exit(1);
}

// ── 去重状态(event_id + 文件 sha256,持久化以扛重启)────────
const seen = loadState();
function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      const j = JSON.parse(readFileSync(STATE_FILE, "utf8"));
      return { events: new Set(j.events || []), hashes: new Set(j.hashes || []) };
    }
  } catch { /* ignore corrupt state */ }
  return { events: new Set(), hashes: new Set() };
}
let saveTimer = null;
function persistState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const cap = (set) => new Set([...set].slice(-5000)); // 防无限增长
    seen.events = cap(seen.events);
    seen.hashes = cap(seen.hashes);
    writeFile(STATE_FILE, JSON.stringify({ events: [...seen.events], hashes: [...seen.hashes] })).catch(() => {});
  }, 500);
}
function markSeen(eventId) { if (eventId) { seen.events.add(eventId); persistState(); } }

// ── lark-cli 调用封装 ─────────────────────────────────
function runCli(args, { timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(LARK_CLI, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`lark-cli timeout: ${args.join(" ")}`)); }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`lark-cli exit ${code}: ${err.slice(0, 400) || out.slice(0, 400)}`));
    });
  });
}

// 回查原始消息,取 file_key / file_name(consume 的 content 对 file 是预渲染文本)
async function fetchFileResource(messageId) {
  const raw = await runCli(["api", "GET", `/open-apis/im/v1/messages/${messageId}`, "--as", "bot"]);
  const json = JSON.parse(raw);
  const item = json?.data?.items?.[0];
  if (!item) throw new Error("message GET 无 items");
  if (item.msg_type !== "file") throw new Error(`msg_type=${item.msg_type} 非 file`);
  const body = JSON.parse(item.body?.content || "{}");
  if (!body.file_key) throw new Error("body.content 无 file_key");
  return { fileKey: body.file_key, fileName: body.file_name || "resume" };
}

// 回执:在群/私聊里回复到那条简历消息下面(markdown)。失败只记日志,绝不影响入库。
async function replyToMessage(messageId, markdown) {
  if (!REPLY_ENABLED || !messageId) return;
  try {
    await runCli(["im", "+messages-reply", "--message-id", messageId, "--markdown", markdown, "--as", "bot"]);
  } catch (e) {
    console.error(`[warn] 回执失败(检查机器人发送消息权限 im:message): ${e.message}`);
  }
}

// 交互卡片回执:成功入库后发带「关联 JD」按钮的卡片。按钮点击 → 飞书回调 MESA /api/feishu/card-callback。
async function replyCard(messageId, card) {
  if (!REPLY_ENABLED || !messageId) return;
  try {
    await runCli(["im", "+messages-reply", "--message-id", messageId, "--msg-type", "interactive", "--content", JSON.stringify(card), "--as", "bot"]);
  } catch (e) {
    console.error(`[warn] 卡片回执失败(检查发送/卡片权限): ${e.message}`);
  }
}

// schema 2.0 成功卡片:文案 + 「关联 JD」回调按钮(value 携带 candidateId,飞书原样回传)
// 注意 2.0 不再支持 {tag:"action"} 容器,按钮直接作为 body.elements 元素
function buildSuccessCard(fileName, candidateId) {
  return {
    schema: "2.0",
    body: {
      elements: [
        { tag: "markdown", content: `✅ 已收到简历 **${fileName}**,入库成功(状态:待解析)~` },
        { tag: "button", text: { tag: "plain_text", content: "关联 JD" }, type: "primary",
          behaviors: [{ type: "callback", value: { a: "pick_jd", cid: candidateId } }] },
      ],
    },
  };
}

async function downloadFile(messageId, fileKey, ext) {
  await mkdir(DOWNLOAD_DIR, { recursive: true });
  // --output 仅允许相对路径(lark-cli 拒绝 .. 穿越),相对脚本所在目录给 downloads/
  const rel = `downloads/${randomUUID()}.${ext}`;
  await runCli(
    ["im", "+messages-resources-download", "--message-id", messageId, "--file-key", fileKey, "--type", "file", "--output", rel, "--as", "bot"],
    { timeoutMs: 120000 }
  );
  return join(HERE, rel);
}

// ── MESA 公开上传通道 ─────────────────────────────────
async function uploadToMesa({ buffer, filename, contentType, source }) {
  const base = `${MESA_BASE_URL}/api/public/upload/${UPLOAD_TOKEN}`;

  // 1) 预签名
  const presignRes = await fetch(`${base}/presigned-url`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filename, contentType, expectedSize: buffer.length }),
  });
  if (!presignRes.ok) throw new Error(`presigned-url ${presignRes.status}: ${(await presignRes.text()).slice(0, 200)}`);
  const { uploadUrl, key } = await presignRes.json();

  // 2) PUT 到 R2(Content-Type 必须与签名时一致)
  const putRes = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": contentType }, body: buffer });
  if (!putRes.ok) throw new Error(`R2 PUT ${putRes.status}`);

  // 3) submit 创建候选人(降级入库,tags=待解析)
  const submitRes = await fetch(`${base}/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, filename, source }),
  });
  if (!submitRes.ok) throw new Error(`submit ${submitRes.status}: ${(await submitRes.text()).slice(0, 200)}`);
  return submitRes.json();
}

// ── 单条事件处理 ──────────────────────────────────────
function extractMessage(obj) {
  // consume 输出为扁平结构(schema 顶层即 message_id/message_type/...);兼容可能的 envelope
  return obj?.message_type ? obj : obj?.event?.message || obj?.event || obj?.payload || obj;
}

async function handleEvent(obj) {
  const m = extractMessage(obj);
  const eventId = m.event_id || obj.event_id;
  const messageId = m.message_id || m.id;
  const type = m.message_type;
  const chatType = m.chat_type || "group";

  if (!messageId) return;
  if (eventId && seen.events.has(eventId)) return;            // 幂等:事件重投
  if (type !== "file") {                                      // 只处理文件(合并转发 merge_forward 暂不拆解)
    if (type === "merge_forward") console.log(`[skip] merge_forward 暂不支持拆解 message_id=${messageId}`);
    return;
  }

  let localPath = null;
  let validResume = null; // 一旦确认是要入库的简历文件就记下文件名,失败时用于回执
  try {
    const { fileKey, fileName } = await fetchFileResource(messageId);
    const ext = (fileName.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1] || "").toLowerCase();
    // 非简历(后缀不符)静默跳过,不回执避免群里刷屏
    if (!ALLOWED_EXT.has(ext)) { console.log(`[skip] 后缀 .${ext} 不在白名单 file=${fileName}`); markSeen(eventId); return; }
    validResume = fileName;

    localPath = await downloadFile(messageId, fileKey, ext);
    const buffer = await readFile(localPath);
    if (buffer.length === 0) { console.log(`[skip] 空文件 file=${fileName}`); markSeen(eventId); return; }
    if (buffer.length > MAX_SIZE) {
      console.log(`[skip] 超过 ${MAX_SIZE} 字节 file=${fileName}`);
      await replyToMessage(messageId, `⚠️ 简历 **${fileName}** 超过大小上限,未入库`);
      markSeen(eventId); return;
    }

    const hash = createHash("sha256").update(buffer).digest("hex");
    if (seen.hashes.has(hash)) {
      console.log(`[dedup] 同文件已入库过 file=${fileName}`);
      await replyToMessage(messageId, `ℹ️ 简历 **${fileName}** 之前已入库,本次跳过`);
      markSeen(eventId); return;
    }

    const source = `飞书${chatType === "p2p" ? "私聊" : "群"}自动入库`;
    const ack = await uploadToMesa({ buffer, filename: fileName, contentType: MIME[ext], source });

    seen.hashes.add(hash);
    markSeen(eventId);
    console.log(`[ok] 入库成功 file=${fileName} chat=${chatType} cid=${ack.candidateId ?? "?"} uploadCount=${ack.uploadCount ?? "?"}`);
    // 有 candidateId 就发带「关联 JD」按钮的交互卡片;否则降级纯文本(兼容旧后端)
    if (ack.candidateId) await replyCard(messageId, buildSuccessCard(fileName, ack.candidateId));
    else await replyToMessage(messageId, `✅ 已收到简历 **${fileName}**,入库成功(状态:待解析)~`);
  } catch (e) {
    console.error(`[err] 处理失败 message_id=${messageId}: ${e.message}`);
    // 不 markSeen → 下次重投有机会重试
    if (validResume) await replyToMessage(messageId, `❌ 简历 **${validResume}** 入库失败,请稍后重试或联系管理员`);
  } finally {
    if (localPath) await rm(localPath, { force: true }).catch(() => {}); // 临时文件用完即删
  }
}

// ── 长连接监听主循环(断线退避重连)────────────────────
let backoff = 1000;
let current = null;
let stopping = false;
function startConsumer() {
  console.log(`[start] 监听 ${EVENT_KEY}(--as bot)… MESA=${MESA_BASE_URL}`);
  // 关键:consume 把 stdin EOF 当退出信号。stdin 必须保持打开(pipe 且不 end),
  // 否则 /dev/null/ignore 会立即 EOF 导致秒退。停止用 SIGTERM(勿 kill -9,会泄漏服务端订阅)。
  const child = spawn(LARK_CLI, ["event", "consume", EVENT_KEY, "--as", "bot", "--quiet"], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  current = child;
  child.stdin.on("error", () => {}); // 忽略 EPIPE,我们从不写 stdin,仅借它保持打开
  const rl = createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    const s = line.trim();
    if (!s) return;
    backoff = 1000; // 收到数据视为连接健康,重置退避
    let obj;
    try { obj = JSON.parse(s); } catch { return; } // 非 JSON 行忽略
    handleEvent(obj).catch((e) => console.error(`[err] handleEvent: ${e.message}`));
  });
  child.stderr.on("data", (d) => { const t = String(d).trim(); if (t) console.error(`[lark-cli] ${t}`); });
  child.on("close", (code) => {
    if (stopping) return;
    console.error(`[warn] consume 退出 code=${code},${backoff}ms 后重连`);
    setTimeout(startConsumer, backoff);
    backoff = Math.min(backoff * 2, 30000);
  });
  child.on("error", (e) => console.error(`[err] 无法启动 lark-cli: ${e.message}`));
}

process.on("SIGINT", () => {
  stopping = true;
  console.log("\n[bye] 退出(SIGTERM 通知 consume 优雅清理订阅)");
  if (current) try { current.kill("SIGTERM"); } catch { /* noop */ }
  setTimeout(() => process.exit(0), 300);
});
startConsumer();
