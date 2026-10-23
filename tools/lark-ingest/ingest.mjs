import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { readFile, mkdir, rm } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { salaryRequest, createSalaryHandler, createEventQueue } from "./salary-client.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const envPath = join(HERE, ".env");
if (existsSync(envPath)) for (const raw of readFileSync(envPath, "utf8").split("\n")) {
  const line = raw.trim(), i = line.indexOf("=");
  if (!line || line.startsWith("#") || i < 0) continue;
  const key = line.slice(0, i).trim();
  if (!(key in process.env)) process.env[key] = line.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
}
const cli = process.env.LARK_CLI || "lark-cli";
const base = (process.env.MESA_BASE_URL || "").replace(/\/$/, "");
const secret = process.env.LARK_APP_SECRET || "";
if (!base || !secret || secret.startsWith("__")) throw new Error("请配置MESA_BASE_URL及现有机器人的LARK_APP_SECRET；旧UPLOAD_TOKEN已废除");

function runCli(args, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const child = spawn(cli, args, { cwd: HERE, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error("lark_cli_timeout")); }, timeoutMs);
    child.stdout.on("data", (d) => output += d);
    child.stderr.resume();
    child.on("error", () => { clearTimeout(timer); reject(new Error("lark_cli_failed")); });
    child.on("close", (code) => { clearTimeout(timer); code === 0 ? resolve(output) : reject(new Error("lark_cli_failed")); });
  });
}
const handle = createSalaryHandler({
  defaultTenant: process.env.LARK_TENANT_KEY || "default",
  request: (path, body) => salaryRequest(base, secret, path, body),
  download: async (id) => {
    const response = JSON.parse(await runCli(["api", "GET", `/open-apis/im/v1/messages/${id}`, "--as", "bot"]));
    const item = response?.data?.items?.[0];
    if (item?.msg_type !== "file") throw new Error("invalid_file_message");
    const { file_key: key, file_name: filename } = JSON.parse(item.body?.content || "{}");
    if (!key || !filename) throw new Error("missing_file_resource");
    const ext = filename.split(".").pop().toLowerCase();
    if (!["pdf", "doc", "docx", "jpg", "jpeg", "png"].includes(ext)) return { filename, buffer: Buffer.alloc(0) };
    await mkdir(join(HERE, "downloads"), { recursive: true });
    const relative = `downloads/${randomUUID()}.${ext}`;
    const path = join(HERE, relative);
    try {
      await runCli(["im", "+messages-resources-download", "--message-id", id, "--file-key", key, "--type", "file", "--output", relative, "--as", "bot"], 120000);
      return { path, filename, buffer: await readFile(path), messageCreatedAt: item.create_time };
    } catch (err) { await rm(path, { force: true }); throw err; }
  },
  remove: (path) => rm(path, { force: true }),
  reply: async (id, content) => {
    if (process.env.REPLY_ENABLED !== "false") await runCli(["im", "+messages-reply", "--message-id", id, "--markdown", content, "--as", "bot"]);
  },
});
const processing = createEventQueue(handle, { concurrency: 3, onError: () => console.error("[salary] 单份简历处理失败，可安全重投；其他任务继续") });
let child, stopping = false, backoff = 1000;
function startConsumer() {
  if (stopping) return;
  // consume以stdin EOF作为退出信号，必须保持pipe打开；停止时以SIGTERM清理订阅。
  child = spawn(cli, ["event", "consume", "im.message.receive_v1", "--as", "bot", "--quiet"], { cwd: HERE, stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.on("error", () => {});
  child.stderr.resume();
  createInterface({ input: child.stdout }).on("line", (line) => {
    let obj; try { obj = JSON.parse(line); } catch { return; }
    backoff = 1000;
    processing.push(obj);
  });
  child.on("error", () => console.error("[salary] 无法启动lark-cli"));
  child.on("close", () => { if (!stopping) { setTimeout(startConsumer, backoff); backoff = Math.min(backoff * 2, 30000); } });
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
  stopping = true;
  child?.kill("SIGTERM");
  processing.drain().finally(() => process.exit(0));
});
startConsumer();
