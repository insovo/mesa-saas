import "./testPolicy.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import { Queue, Worker } from "bullmq";
import jwtPlugin from "../../plugins/jwt.js";
import salaryRoutes, { internalSalaryRoutes } from "../../routes/campus-salary.js";
import feishuRoutes from "../../routes/feishu.js";
import { runSalaryEvaluation, deliverSalaryEvaluation, recoverSalaryWork } from "./service.js";
import { MONTHLY, BONUS_VALUES } from "./policy.js";
import { notifyCandidateReady } from "../feishuNotify.js";
import { createSalaryHandler, salaryRequest } from "../../../../tools/lark-ingest/salary-client.mjs";

const database = process.env.SALARY_TEST_DATABASE_URL;
const redisUrl = process.env.SALARY_TEST_REDIS_URL;
async function waitFor(fn) {
  for (let i = 0; i < 150; i++) { const result = await fn(); if (result) return result; await new Promise((r) => setTimeout(r, 40)); }
  throw new Error("local salary test timed out");
}

test("隔离PG/Redis：群消息→签名API→真实队列→独立定薪→回显、补充、历史、重试及权限", { skip: !database || !redisUrl }, async (t) => {
  const dbTarget = new URL(database), redisTarget = new URL(redisUrl);
  assert.ok(["127.0.0.1", "localhost"].includes(dbTarget.hostname) && dbTarget.pathname.startsWith("/salary_test"), "只允许专用本地测试库");
  assert.ok(["127.0.0.1", "localhost"].includes(redisTarget.hostname), "只允许本地Redis");
  const previous = { jwt: process.env.JWT_SECRET, bot: process.env.LARK_APP_SECRET, verification: process.env.FEISHU_VERIFICATION_TOKEN };
  process.env.JWT_SECRET = randomUUID(); process.env.LARK_APP_SECRET = randomUUID(); process.env.FEISHU_VERIFICATION_TOKEN = randomUUID();
  const prisma = new PrismaClient({ datasourceUrl: database });
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const workerConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queueName = `salary-test-${randomUUID()}`;
  const queue = new Queue(queueName, { connection });
  const app = Fastify();
  const files = new Map();
  app.decorate("prisma", prisma); app.decorate("redis", connection); app.decorate("aiQueue", queue);
  app.decorate("r2", { putObjectBuffer: async (key, buffer) => files.set(key, buffer), getObjectBuffer: async (key) => files.get(key) });
  await app.register(jwtPlugin);
  await app.register(salaryRoutes, { prefix: "/api/campus-salary" });
  await app.register(internalSalaryRoutes, { prefix: "/api/internal/campus-salary" });
  await app.register(feishuRoutes, { prefix: "/api/feishu" });
  await app.ready();
  const owner = await prisma.user.create({ data: { email: `${randomUUID()}@salary-test.invalid`, passwordHash: randomUUID(), role: "ADMIN" } });
  const stranger = await prisma.user.create({ data: { email: `${randomUUID()}@salary-test.invalid`, passwordHash: randomUUID(), role: "RECRUITER", accessPolicy: { create: { pageKeys: ["campus"], moduleKeys: [] } } } });
  const auth = { authorization: `Bearer ${app.jwt.sign({ sub: owner.id, tv: 0 })}` };
  const strangerAuth = { authorization: `Bearer ${app.jwt.sign({ sub: stranger.id, tv: 0 })}` };
  let worker;
  t.after(async () => {
    await worker?.close(); await queue.obliterate({ force: true }); await queue.close(); await workerConnection.quit(); await connection.quit();
    const groups = await prisma.salaryGroup.findMany({ where: { ownerId: owner.id }, select: { id: true } });
    const ids = groups.map((g) => g.id);
    await prisma.salaryEvaluation.deleteMany({ where: { submission: { groupId: { in: ids } } } });
    await prisma.salarySubmission.deleteMany({ where: { groupId: { in: ids } } });
    await prisma.salaryGroup.deleteMany({ where: { id: { in: ids } } });
    await prisma.salarySchool.deleteMany({ where: { updatedBy: owner.id } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, stranger.id] } } });
    await app.close(); await prisma.$disconnect();
    for (const [key, value] of [["JWT_SECRET", previous.jwt], ["LARK_APP_SECRET", previous.bot], ["FEISHU_VERIFICATION_TOKEN", previous.verification]]) value == null ? delete process.env[key] : process.env[key] = value;
  });
  assert.equal((await app.inject({ url: "/api/campus-salary/submissions" })).statusCode, 401);
  const groupResponse = await app.inject({ method: "POST", url: "/api/campus-salary/groups", headers: auth, payload: { name: "本地定薪测试群", tenantKey: "default", chatId: "salary-local-group", enabled: true, memberUserIds: [], operators: { "salary-local-hr": owner.id }, context: { contractCity: "芜湖", cityType: "nonfirst", roleType: "general" } } });
  assert.equal(groupResponse.statusCode, 200, groupResponse.body);
  const group = groupResponse.json().item;
  const beforeCandidates = await prisma.candidate.count(); const beforeJobs = await prisma.job.count(); const beforeLinks = await prisma.shareLink.count();
  let extractions = 0, deliveries = 0;
  const fixtures = new Map();
  const sent = [];
  const dependencies = {
    extractDocument: async ({ buffer }) => {
      extractions++; const fixture = fixtures.get(buffer.toString());
      if (fixture?.delay) await new Promise((resolve) => setTimeout(resolve, fixture.delay));
      return { text: fixture?.text || "测试同学\n武汉大学 硕士 计算机科学与技术 2027年毕业\n专业排名前25%", provider: "local-fixture", pageCount: 1 };
    },
    parseResume: async ({ preExtractedText }) => ({ profile: { identity: [...fixtures.values()].find((f) => f.text === preExtractedText)?.identity || { name: "测试同学" }, education: [{ degree: "硕士", school: "武汉大学", major: "计算机科学与技术", endDate: "2027", ranking: "专业排名前25%" }] }, meta: { model: "local-fixture" } }),
    suggest: async () => ({ status: "unavailable", reason: "本地不访问第三方" }),
    reply: async (messageId, card) => { deliveries++; sent.push({ messageId, card }); return { data: { message_id: `reply-${deliveries}` } }; },
  };
  worker = new Worker(queueName, (job) => runSalaryEvaluation(app, job.data.evaluationId, dependencies), { connection: workerConnection, concurrency: 2 });
  const localFetch = async (url, options) => {
    const response = await app.inject({ method: options.method, url: new URL(url).pathname, headers: options.headers, payload: options.body });
    return { ok: response.statusCode < 300, status: response.statusCode, json: async () => response.json() };
  };
  const request = (path, body) => salaryRequest("http://local.invalid", process.env.LARK_APP_SECRET, path, body, localFetch);
  const replies = [];
  const handle = createSalaryHandler({ request, download: async () => ({ filename: "test.pdf", buffer: Buffer.from("%PDF-1.4\nlocal-fixture"), path: "local" }), remove: async () => {}, reply: async (id, content) => replies.push(content) });
  const event = { message_type: "file", chat_type: "group", chat_id: "salary-local-group", message_id: randomUUID() };
  const ack = await handle(event);
  assert.ok(ack.submissionId);
  const completed = await waitFor(async () => { const e = await prisma.salaryEvaluation.findUnique({ where: { id: ack.evaluationId } }); return e.status === "done" && e.deliveryStatus === "sent" ? e : null; });
  assert.equal(completed.result.salary.min, MONTHLY.nonfirst.硕士["985"][3]); assert.equal(completed.result.bonus.monthlyStandard, null);
  assert.ok(JSON.stringify(sent[0].card).includes(String(BONUS_VALUES.middle))); assert.equal(sent[0].messageId, event.message_id);
  assert.equal(extractions, 1); assert.equal(replies.length, 1);
  const duplicate = await handle(event); assert.equal(duplicate.duplicate, true);
  assert.equal(await prisma.salarySubmission.count({ where: { groupId: group.id } }), 1);
  assert.equal(await prisma.candidate.count(), beforeCandidates); assert.equal(await prisma.job.count(), beforeJobs); assert.equal(await prisma.shareLink.count(), beforeLinks);
  assert.equal((await app.inject({ url: `/api/campus-salary/submissions/${ack.submissionId}`, headers: strangerAuth })).statusCode, 404);
  assert.equal((await app.inject({ url: "/api/campus-salary/submissions", headers: strangerAuth })).json().total, 0);
  assert.equal((await app.inject({ url: "/api/internal/campus-salary/groups" })).statusCode, 401);
  assert.equal((await app.inject({ method: "PATCH", url: `/api/campus-salary/submissions/${ack.submissionId}`, headers: auth, payload: { revision: 1, reason: "确认上海合同", context: { contractCity: "上海", cityType: "first" } } })).statusCode, 202);
  const second = await waitFor(async () => { const e = await prisma.salaryEvaluation.findFirst({ where: { submissionId: ack.submissionId, revision: 2 } }); return e?.status === "done" && e.deliveryStatus === "sent" ? e : null; });
  assert.equal(second.result.salary.min, MONTHLY.first.硕士["985"][3]); assert.equal(extractions, 1);
  assert.equal((await prisma.salaryEvaluation.findUnique({ where: { id: completed.id } })).result.salary.min, MONTHLY.nonfirst.硕士["985"][3]);
  assert.equal((await app.inject({ method: "PATCH", url: `/api/campus-salary/submissions/${ack.submissionId}`, headers: auth, payload: { revision: 1, reason: "过期修改" } })).statusCode, 409);
  await prisma.salaryEvaluation.update({ where: { id: second.id }, data: { deliveryStatus: "retry", deliveryNextAt: null } });
  await deliverSalaryEvaluation(app, second.id, async () => { throw new Error("network"); });
  assert.equal((await prisma.salaryEvaluation.findUnique({ where: { id: second.id } })).deliveryStatus, "retry");
  await prisma.salaryEvaluation.update({ where: { id: second.id }, data: { deliveryNextAt: null } });
  await deliverSalaryEvaluation(app, second.id, dependencies.reply);
  assert.equal(extractions, 1);
  const callback = (value, openId = "salary-local-hr", tenant = "default") => app.inject({ method: "POST", url: "/api/feishu/card-callback", payload: { header: { token: process.env.FEISHU_VERIFICATION_TOKEN, tenant_key: tenant, event_type: "card.action.trigger" }, event: { operator: { open_id: openId }, context: { open_chat_id: group.chatId }, action: { value } } } });
  const old = await callback({ a: "create_jd", cid: randomUUID() }); assert.match(old.json().toast.content, /已停用/);
  assert.equal(await prisma.job.count(), beforeJobs);
  const forbidden = await callback({ a: "salary_edit", sid: ack.submissionId, revision: 2 }, "not-authorized"); assert.equal(forbidden.json().toast.type, "error");
  const valid = await callback({ a: "salary_edit", sid: ack.submissionId, revision: 2 }); assert.ok(valid.json().card.data.body.elements.some((e) => e.tag === "form"));
  await notifyCandidateReady(app, { id: randomUUID() }, "old-chat"); assert.equal(await prisma.shareLink.count(), beforeLinks);
  await prisma.salaryGroup.update({ where: { id: group.id }, data: { context: { contractCity: "上海", cityType: "first", roleType: "general" } } });
  const forwarded = await handle({ ...event, message_id: randomUUID() });
  await waitFor(async () => (await prisma.salaryEvaluation.findUnique({ where: { id: forwarded.evaluationId } })).status === "done");
  assert.equal(await prisma.salarySubmission.count({ where: { groupId: group.id } }), 2);
  const waiting = await prisma.salarySubmission.create({ data: { groupId: group.id, messageId: randomUUID(), filename: "recover.pdf", fileKey: [...files.keys()][0], fileHash: (await prisma.salarySubmission.findUnique({ where: { id: ack.submissionId } })).fileHash, fileSize: 22, contentType: "application/pdf", status: "uploaded", context: group.context } });
  await recoverSalaryWork(app, { reply: dependencies.reply });
  await waitFor(async () => (await prisma.salarySubmission.findUnique({ where: { id: waiting.id } })).status === "done");
  assert.equal(await prisma.candidate.count(), beforeCandidates);

  const batchFiles = new Map();
  const batchEvent = (name, email, age, delay = 0, extraEmail) => {
    const id = randomUUID();
    const text = `姓名：${name}\n邮箱：${email}${extraEmail ? ` ${extraEmail}` : ""}\n武汉大学 硕士 计算机科学与技术 2027年毕业\n专业排名前25%\n版本：${id}`;
    const buffer = Buffer.from(`%PDF-1.4\n${id}`);
    fixtures.set(buffer.toString(), { text, identity: { name, emails: [email, ...(extraEmail ? [extraEmail] : [])] }, delay });
    batchFiles.set(id, { filename: `${name}.pdf`, buffer });
    return { ...event, message_id: id, create_time: String(Date.now() - age) };
  };
  const batchHandle = createSalaryHandler({ request, download: async (id) => batchFiles.get(id), remove: async () => {}, reply: async () => {} });
  const newest = batchEvent("版本测试甲", "version-b@example.invalid", 1000);
  const older = batchEvent("版本测试甲", "version-a@example.invalid", 3000, 150);
  const middle = batchEvent("版本测试甲", "version-a@example.invalid", 2000, 0, "version-b@example.invalid");
  const other = [batchEvent("批量测试乙", "batch-b@example.invalid", 1000), batchEvent("同名测试", "same-a@example.invalid", 1000), batchEvent("同名测试", "same-b@example.invalid", 1000), ...[1, 2, 3, 4].map((i) => batchEvent(`批量测试${i}`, `batch-${i}@example.invalid`, 1000))];
  const batch = await Promise.all([newest, older, middle, ...other].map(batchHandle));
  assert.equal(batch.length, 10);
  await waitFor(async () => (await prisma.salarySubmission.count({ where: { id: { in: batch.map((a) => a.submissionId) }, status: { in: ["done", "superseded"] } } })) === 10);
  const versions = await prisma.salarySubmission.findMany({ where: { id: { in: batch.slice(0, 3).map((a) => a.submissionId) } } });
  assert.equal(versions.filter((v) => !v.supersededById).length, 1);
  assert.equal(versions.find((v) => !v.supersededById).messageId, newest.message_id);
  assert.ok(versions.filter((v) => v.supersededById).every((v) => v.supersededById === batch[0].submissionId));
  assert.ok(!sent.some((message) => [older.message_id, middle.message_id].includes(message.messageId)), "旧文件不得在新文件之后回显旧结果");
  const detail = (await app.inject({ url: `/api/campus-salary/submissions/${batch[0].submissionId}`, headers: auth })).json().item;
  assert.equal(detail.resumeHistory.length, 3);
  assert.equal((await app.inject({ method: "PATCH", url: `/api/campus-salary/submissions/${batch[1].submissionId}`, headers: auth, payload: { revision: 1, reason: "不能修改旧简历" } })).statusCode, 409);
  const current = (await app.inject({ url: "/api/campus-salary/submissions", headers: auth })).json();
  assert.equal(current.items.filter((v) => v.name === "版本测试甲").length, 1);
  assert.equal(current.items.filter((v) => v.name === "同名测试").length, 2);
  const history = (await app.inject({ url: "/api/campus-salary/submissions?includeSuperseded=true", headers: auth })).json();
  assert.equal(history.total - current.total, 4);
  assert.equal(await prisma.candidate.count(), beforeCandidates);
  assert.equal(await prisma.job.count(), beforeJobs); assert.equal(await prisma.shareLink.count(), beforeLinks);
});
