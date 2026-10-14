import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import Fastify from "fastify";
import jwtPlugin from "../plugins/jwt.js";
import routes, { publicInterviewQueueRoutes } from "./interview-queues.js";
import { encrypt } from "../lib/secrets.js";
import { consumeCode } from "../lib/verificationCodes.js";

const sessionId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const queueId = "10000000-0000-4000-8000-000000000003";
const linkId = "10000000-0000-4000-8000-000000000004";
async function setup(t, { role = "ADMIN", pages = ["interviews"] } = {}) {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
  const accessKey = crypto.randomBytes(6).toString("hex");
  const link = { id: linkId, queueId, kind: "culture", token: crypto.randomBytes(24).toString("base64url"), tokenVersion: 0, active: true, expiresAt: null, requireKey: true, keyEnc: encrypt(accessKey), keyHash: await bcrypt.hash(accessKey, 4) };
  const session = { id: sessionId, name: "测试大学", school: "测试大学", status: "draft" };
  const queue = { id: queueId, sessionId, revision: 0, session, links: [link], _count: { entries: 0 } };
  link.queue = queue;
  const app = Fastify();
  app.setErrorHandler((err, _req, reply) => reply.code(err.statusCode || 500).send({ error: err.code || "request_error", message: err.message }));
  app.decorate("prisma", {
    user: { findUnique: async () => ({ id: userId, role, tokenVersion: 0, isActive: true, accessPolicy: { pageKeys: pages, moduleKeys: [] }, departmentScopes: [], jobScopes: [] }) },
    campusSession: { findMany: async () => [{ ...session, interviewQueue: queue }], findUnique: async () => session },
    interviewQueue: { findUnique: async () => queue },
    interviewQueueLink: { findUnique: async ({ where }) => where.token === link.token || where.id === link.id ? link : null },
  });
  await app.register(jwtPlugin);
  await app.register(routes, { prefix: "/api/interview-queues" });
  await app.register(publicInterviewQueueRoutes, { prefix: "/api/public/interview-queues" });
  t.after(() => app.close());
  const headers = { authorization: `Bearer ${app.jwt.sign({ sub: userId, tv: 0 })}` };
  return { app, headers, link, accessKey };
}

test("只读用户可以查看大学专场，但拿不到分享凭证且不能创建或修改排队", async (t) => {
  const { app, headers } = await setup(t, { role: "VIEWER" });
  const list = await app.inject({ url: "/api/interview-queues/", headers });
  assert.equal(list.statusCode, 200); assert.equal(list.json().sessions[0].status, "draft");
  assert.deepEqual(list.json().sessions[0].links, []);
  assert.equal((await app.inject({ method: "POST", url: `/api/interview-queues/${sessionId}`, headers })).statusCode, 403);
  assert.equal((await app.inject({ method: "DELETE", url: `/api/interview-queues/${sessionId}/links/culture`, headers })).statusCode, 403);
});

test("页面权限和 JWT audience 双重隔离后台与匿名角色", async (t) => {
  const { app, headers } = await setup(t, { role: "RECRUITER", pages: ["candidates"] });
  assert.equal((await app.inject({ url: "/api/interview-queues/", headers })).statusCode, 403);
  for (const aud of ["interview-queue-share", "interview-queue-student"]) {
    assert.equal((await app.inject({ url: "/api/interview-queues/", headers: { authorization: `Bearer ${app.jwt.sign({ sub: userId, aud })}` } })).statusCode, 401);
  }
  assert.equal((await app.inject({ url: "/api/public/interview-queues/mine", headers })).statusCode, 403);
});

test("分享密钥校验、撤销和旧会话失效，错误不会返回凭证", async (t) => {
  const { app, link, accessKey } = await setup(t);
  const url = "/api/public/interview-queues/share/open";
  const headers = { "x-queue-link": link.token };
  const wrong = await app.inject({ method: "POST", url, headers, payload: { accessKey: crypto.randomBytes(5).toString("hex") } });
  assert.equal(wrong.statusCode, 401); assert.equal(wrong.json().error, "access_key_invalid");
  const opened = await app.inject({ method: "POST", url, headers, payload: { accessKey } });
  assert.equal(opened.statusCode, 200);
  const claims = app.jwt.verify(opened.json().token); assert.equal(claims.aud, "interview-queue-share"); assert.equal(claims.kind, "culture");
  const auth = { authorization: `Bearer ${opened.json().token}` };
  link.tokenVersion++;
  assert.equal((await app.inject({ url: "/api/public/interview-queues/share/data", headers: auth })).statusCode, 401);
  link.active = false;
  assert.equal((await app.inject({ url: "/api/public/interview-queues/share/data", headers: auth })).statusCode, 410);
  assert.equal((await app.inject({ method: "POST", url, headers, payload: { accessKey } })).statusCode, 410);
});

test("登记和动作的边界 schema 拒绝错误金额、年份、结果和空字段", async (t) => {
  const { app, headers, link } = await setup(t);
  const entry = { id: userId, updatedAt: new Date().toISOString() };
  for (const extra of [{ salaryBase: -1 }, { salaryFactor: 1001 }, { result: "rejected" }]) {
    assert.equal((await app.inject({ method: "POST", url: `/api/interview-queues/${sessionId}/actions`, headers, payload: { action: "salary", items: [entry], ...extra } })).statusCode, 400);
  }
  const form = { name: "测试学生", school: "测试大学", major: "机械", degree: "本科", gradYear: 2027, languageAbility: "CET-6", phone: "13900000000", jobDirection: "技术", email: "student@example.com" };
  for (const extra of [{ name: " " }, { gradYear: 2200 }, { email: "invalid" }, { phone: "     " }, { phone: "-----" }]) {
    assert.equal((await app.inject({ method: "POST", url: "/api/public/interview-queues/register", headers: { "x-queue-link": link.token }, payload: { ...form, ...extra } })).statusCode, 400);
  }
});

test("邮箱找回验证码并发消费只成功一次", async () => {
  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = await bcrypt.hash(code, 4);
  let consumed = false;
  const prisma = { emailVerificationCode: {
    findFirst: async () => ({ id: "code", codeHash, userId: null }),
    updateMany: async () => { if (consumed) return { count: 0 }; consumed = true; return { count: 1 }; },
  } };
  const results = await Promise.allSettled([consumeCode(prisma, { email: "student@example.com", code, purpose: "INTERVIEW_QUEUE_RECOVER" }), consumeCode(prisma, { email: "student@example.com", code, purpose: "INTERVIEW_QUEUE_RECOVER" })]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
});
