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
async function setup(t, { role = "ADMIN", pages = ["interviews"], kind = "culture" } = {}) {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
  const accessKey = crypto.randomBytes(6).toString("hex");
  const link = { id: linkId, queueId, kind, token: crypto.randomBytes(24).toString("base64url"), tokenVersion: 0, active: true, expiresAt: null, requireKey: kind !== "registration", keyEnc: encrypt(accessKey), keyHash: await bcrypt.hash(accessKey, 4) };
  const session = { id: sessionId, name: "测试大学", school: "测试大学", status: "draft", showSalaryOnsite: true, showSalaryReferral: false };
  const queue = { id: queueId, sessionId, revision: 0, session, links: [link], _count: { entries: 0 } };
  link.queue = queue;
  const app = Fastify();
  const jobs = [
    { id: "20000000-0000-4000-8000-000000000001", title: "现场岗位", recruitmentType: "campus", campusActive: true, campusKind: "onsite", salary: "可展示薪资", description: "岗位完整 JD", responsibilities: ["岗位职责"], requirements: ["任职要求"], benefits: Array.from({ length: 37 }, (_, i) => `福利${i}`), evaluationModel: { internal: true } },
    { id: "20000000-0000-4000-8000-000000000002", title: "内推岗位", recruitmentType: "campus", campusActive: true, campusKind: "referral", salary: "隐藏薪资", description: "内推任职要求" },
    { id: "20000000-0000-4000-8000-000000000003", title: "已移除岗位", recruitmentType: "campus", campusActive: false, campusKind: "onsite" },
    { id: "20000000-0000-4000-8000-000000000004", title: "社招岗位", recruitmentType: "social", campusActive: true, campusKind: "onsite" },
  ];
  const matches = (job, where) => Object.entries(where).every(([key, value]) => job[key] === value);
  const pick = (job, select) => job ? Object.fromEntries(Object.keys(select).map((key) => [key, job[key] ?? null])) : null;
  app.setErrorHandler((err, _req, reply) => reply.code(err.statusCode || 500).send({ error: err.code || "request_error", message: err.message }));
  app.decorate("prisma", {
    user: { findUnique: async () => ({ id: userId, role, tokenVersion: 0, isActive: true, accessPolicy: { pageKeys: pages, moduleKeys: [] }, departmentScopes: [], jobScopes: [] }) },
    campusSession: { findMany: async () => [{ ...session, interviewQueue: queue }], findUnique: async () => session },
    interviewQueue: { findUnique: async () => queue, update: async () => queue },
    interviewQueueLink: { findUnique: async ({ where }) => where.token === link.token || where.id === link.id ? link : null },
    job: { findMany: async ({ where, select }) => jobs.filter((job) => matches(job, where)).map((job) => pick(job, select)), findFirst: async ({ where, select }) => pick(jobs.find((job) => matches(job, where)), select) },
  });
  app.prisma.$transaction = async (run) => run(app.prisma);
  await app.register(jwtPlugin);
  await app.register(routes, { prefix: "/api/interview-queues" });
  await app.register(publicInterviewQueueRoutes, { prefix: "/api/public/interview-queues" });
  t.after(() => app.close());
  const headers = { authorization: `Bearer ${app.jwt.sign({ sub: userId, tv: 0 })}` };
  return { app, headers, link, accessKey, jobs };
}

test("只读用户可以查看大学专场，但拿不到分享凭证且不能创建或修改排队", async (t) => {
  const { app, headers } = await setup(t, { role: "VIEWER" });
  const list = await app.inject({ url: "/api/interview-queues/", headers });
  assert.equal(list.statusCode, 200); assert.equal(list.json().sessions[0].status, "draft");
  assert.deepEqual(list.json().sessions[0].links, []);
  assert.equal((await app.inject({ method: "POST", url: `/api/interview-queues/${sessionId}`, headers })).statusCode, 403);
  assert.equal((await app.inject({ method: "DELETE", url: `/api/interview-queues/${sessionId}/links/culture`, headers })).statusCode, 403);
});

test("登记可查看现场与内推 JD，仅返回公开字段并遵循薪资展示设置", async (t) => {
  const { app, link, jobs } = await setup(t, { kind: "registration" });
  const headers = { "x-queue-link": link.token };
  const list = await app.inject({ url: "/api/public/interview-queues/link", headers });
  assert.deepEqual(list.json().jobs.map((job) => [job.id, job.kind]), jobs.slice(0, 2).map((job) => [job.id, job.campusKind]));
  assert.equal(list.json().jobs[0].evaluationModel, undefined);
  for (const [index, expected] of [[0, 200], [1, 200], [2, 404], [3, 404]]) {
    const response = await app.inject({ url: `/api/public/interview-queues/registration/jobs/${jobs[index].id}`, headers });
    assert.equal(response.statusCode, expected);
    if (expected === 200) { assert.equal(response.json().job.description, jobs[index].description); assert.equal(response.json().job.evaluationModel, undefined); }
    if (index === 0) assert.equal(response.json().job.benefits.length, 37);
    if (index === 1) { assert.equal(response.json().job.kind, "referral"); assert.equal(response.json().job.salary, null); }
  }
  link.active = false;
  assert.equal((await app.inject({ url: `/api/public/interview-queues/registration/jobs/${jobs[0].id}`, headers })).statusCode, 410);
});

test("岗位 JD 必须使用登记链接；登记后台拒绝内推、已移除和自行输入岗位", async (t) => {
  const { app, link, jobs } = await setup(t, { kind: "registration" });
  const headers = { "x-queue-link": link.token };
  const form = { name: "测试学生", school: "测试大学", major: "机械", degree: "本科", gradYear: 2027, languageAbility: "CET-6", phone: "13900000000", email: "student@example.com" };
  for (const jobDirection of [jobs[1].title, jobs[2].title, jobs[3].title, "自由输入"]) {
    const response = await app.inject({ method: "POST", url: "/api/public/interview-queues/register", headers, payload: { ...form, jobDirection } });
    assert.equal(response.statusCode, 422); assert.equal(response.json().error, "queue_job_not_onsite");
  }
  link.kind = "professional";
  assert.equal((await app.inject({ url: `/api/public/interview-queues/registration/jobs/${jobs[0].id}`, headers })).statusCode, 403);
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
