import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createSalaryHandler, salaryRequest, createEventQueue, messageTime } from "./salary-client.mjs";

test("只处理已配置群的文件，忽略私聊和其他群；同文件新消息仍可重新测算", async () => {
  const calls = [], replies = [], removals = [];
  const handler = createSalaryHandler({
    request: async (path, body) => {
      calls.push({ path, body });
      return path.endsWith("groups") ? { items: [{ tenantKey: "default", chatId: "g" }] } : { submissionId: "s", duplicate: false };
    },
    download: async () => ({ filename: "resume.pdf", buffer: Buffer.from("%PDF-1.4"), path: "temp" }), remove: async (p) => removals.push(p), reply: async (id, text) => replies.push(text),
  });
  const event = { message_type: "file", message_id: "m1", chat_id: "g", chat_type: "group" };
  await handler({ ...event, chat_type: "p2p" }); await handler({ ...event, message_type: "text" });
  assert.equal(calls.length, 0);
  await handler({ ...event, chat_id: "other" }); assert.equal(calls.length, 1);
  await handler(event); await handler({ ...event, message_id: "m2" });
  assert.equal(calls.filter((c) => c.path.endsWith("submissions")).length, 2);
  assert.ok(calls.every((c) => !c.path.includes("public/upload")));
  assert.equal(removals.length, 2); assert.ok(replies.every((v) => v.includes("条件情景")));
});

test("提交失败与回执失败清理文件且可重投，不受旧hash状态阻止", async () => {
  let submissions = 0, removed = 0;
  const handler = createSalaryHandler({ request: async (path) => {
    if (path.endsWith("groups")) return { items: [{ tenantKey: "default", chatId: "g" }] };
    if (++submissions === 1) throw new Error("network");
    return { submissionId: "s", duplicate: true };
  }, download: async () => ({ filename: "r.pdf", buffer: Buffer.from("%PDF-1.4"), path: "temp" }), remove: async () => removed++, reply: async () => {} });
  const event = { message_type: "file", chat_type: "group", chat_id: "g", message_id: "m" };
  await assert.rejects(handler(event));
  assert.equal((await handler(event)).duplicate, true); assert.equal(removed, 2);
});

test("请求签名绑定时间、HTTP方法、路径和完整正文，错误响应不泄露正文", async () => {
  const secret = "local-test-only";
  await salaryRequest("http://local", secret, "/api/internal/campus-salary/submissions", { file: "data" }, async (url, options) => {
    const stamp = options.headers["x-mesa-timestamp"];
    assert.equal(options.headers["x-mesa-signature"], createHmac("sha256", secret).update(`${stamp}.POST./api/internal/campus-salary/submissions.${options.body}`).digest("hex"));
    return { ok: true, json: async () => ({ ok: true }) };
  });
  await assert.rejects(salaryRequest("http://local", secret, "/path", null, async () => ({ ok: false, status: 401 })), /salary_service_request_failed/);
});

test("批量事件最多3份并行；一份失败不阻塞后续，等待清空不漏消息", async () => {
  let active = 0, maximum = 0;
  const completed = [], failed = [];
  const queue = createEventQueue(async (id) => {
    active++; maximum = Math.max(maximum, active);
    try { await new Promise((resolve) => setTimeout(resolve, 5)); if (id === 2) throw new Error("one failed"); completed.push(id); }
    finally { active--; }
  }, { concurrency: 3, onError: () => failed.push(2) });
  for (let i = 0; i < 12; i++) queue.push(i);
  await queue.drain();
  assert.equal(maximum, 3); assert.equal(completed.length, 11); assert.deepEqual(failed, [2]);
  assert.equal(messageTime("1792731600000"), messageTime("1792731600"));
  assert.equal(messageTime("invalid"), undefined);
});

test("刚启用的群立即接收文件，不被30秒旧白名单缓存丢弃", async () => {
  let enabled = false, submitted = 0;
  const handle = createSalaryHandler({ request: async (path) => path.endsWith("groups") ? { items: enabled ? [{ tenantKey: "default", chatId: "new-group" }] : [] } : (submitted++, { submissionId: "s", duplicate: false }), download: async () => ({ filename: "r.pdf", buffer: Buffer.from("%PDF-1.4") }), remove: async () => {}, reply: async () => {} });
  const event = { message_type: "file", chat_type: "group", chat_id: "new-group", message_id: "first" };
  await handle(event); assert.equal(submitted, 0);
  enabled = true;
  await handle({ ...event, message_id: "after-enable" }); assert.equal(submitted, 1);
});
