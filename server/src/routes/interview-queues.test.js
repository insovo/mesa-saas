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
  const session = { id: sessionId, name: "测试大学", school: "测试大学", location: "原现场地址", status: "draft", showSalaryOnsite: true, showSalaryReferral: false };
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
    campusSession: { findMany: async () => [{ ...session, interviewQueue: queue }], findUnique: async () => session, update: async ({ data }) => { Object.assign(session, data); return { location: session.location }; } },
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
  const second = await app.inject({ method: "POST", url, headers, payload: { accessKey } });
  assert.notEqual(app.jwt.verify(second.json().token).viewerId, claims.viewerId);
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


test("三角色建议接口保存真实作者角色，并校验阶段、内容和只读权限", async (t) => {
  for (const [kind, stage] of [["professional", "professional"], ["culture", "culture"], ["hr", "salary"]]) {
    const { app, link } = await setup(t, { kind });
    const entry = { id: userId, stage, updatedAt: "2026-10-15T01:00:00.000Z" };
    const saved = [];
    app.prisma.interviewQueueEntry = { findMany: async ({ where }) => where.queueId === queueId && where.id.in.includes(entry.id) ? [entry] : [] };
    app.prisma.interviewQueueSuggestion = { create: async ({ data }) => saved.push(data) };
    const headers = { authorization: `Bearer ${app.jwt.sign({ aud: "interview-queue-share", sub: link.id, kind, queueId, tv: 0 })}` };
    const request = { action: "suggestion", items: [{ id: entry.id, updatedAt: entry.updatedAt }], content: "  面试建议  " };
    const response = await app.inject({ method: "POST", url: "/api/public/interview-queues/share/actions", headers, payload: { ...request, authorRole: "staff" } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(saved, [{ entryId: entry.id, authorRole: kind, content: "面试建议" }]);
    for (const content of [" ", "字".repeat(5001)]) {
      assert.equal((await app.inject({ method: "POST", url: "/api/public/interview-queues/share/actions", headers, payload: { ...request, content } })).statusCode, 400);
    }
    entry.stage = "pending";
    assert.equal((await app.inject({ method: "POST", url: "/api/public/interview-queues/share/actions", headers, payload: request })).statusCode, 403);
    link.active = false;
    assert.equal((await app.inject({ method: "POST", url: "/api/public/interview-queues/share/actions", headers, payload: request })).statusCode, 410);
    assert.equal(saved.length, 1);
  }
  const { app, headers } = await setup(t, { role: "VIEWER" });
  assert.equal((await app.inject({ method: "POST", url: `/api/interview-queues/${sessionId}/actions`, headers, payload: { action: "suggestion", items: [{ id: userId, updatedAt: new Date().toISOString() }], content: "不可写入" } })).statusCode, 403);
});

test("学生查询即使读取到关联建议，也不会返回面试内部建议", async (t) => {
  const { app } = await setup(t);
  app.prisma.interviewQueueEntry = {
    findMany: async () => [{ id: userId, stage: "salary", suggestions: [{ content: "内部建议" }], queue: { session: { id: sessionId, name: "测试大学" } } }],
  };
  const response = await app.inject({ url: "/api/public/interview-queues/mine", headers: { authorization: `Bearer ${app.jwt.sign({ aud: "interview-queue-student", sub: userId })}` } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().entries[0].suggestions, undefined);
  assert.equal(JSON.stringify(response.json()).includes("内部建议"), false);
});


test("三个分享角色同步看到专场全部待定及来源，专业文化仍隐藏邮箱和薪资", async (t) => {
  const stamp = "2026-10-15T01:00:00.000Z";
  const rows = [
    { id: "p", queueId, stage: "pending", professionalResult: "pending" },
    { id: "c", queueId, stage: "pending", professionalResult: "passed", cultureResult: "pending" },
    { id: "s", queueId, stage: "pending", professionalResult: "passed", cultureResult: "passed", salaryStatus: "abandoned" },
    { id: "other", queueId: "other-queue", stage: "pending" },
    ...["professional", "culture", "salary"].map((stage) => ({ id: stage, queueId, stage })),
  ].map((row) => ({ ...row, updatedAt: stamp, email: "student@example.com", salaryBase: 8700, salaryFactor: 13.5 }));
  const matches = (row, where) => Object.entries(where).every(([key, value]) => key === "OR" ? value.some((condition) => matches(row, condition)) : row[key] === value);
  for (const kind of ["professional", "culture", "hr"]) {
    const { app, link } = await setup(t, { kind });
    app.prisma.interviewQueueEntry = { findMany: async ({ where }) => rows.filter((row) => matches(row, where)) };
    const response = await app.inject({ url: "/api/public/interview-queues/share/data", headers: { authorization: `Bearer ${app.jwt.sign({ aud: "interview-queue-share", sub: link.id, kind, queueId, tv: 0 })}` } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().entries.filter((row) => row.stage === "pending").map((row) => [row.id, row.pendingFrom]), [["p", "professional"], ["c", "culture"], ["s", "salary"]]);
    assert.equal(response.json().entries.filter((row) => row.stage !== "pending")[0].stage, kind === "hr" ? "salary" : kind);
    assert.equal(response.json().entries.length, 4);
    if (kind !== "hr") for (const row of response.json().entries) { assert.equal(row.email, undefined); assert.equal(row.salaryBase, undefined); assert.equal(row.salaryStatus, undefined); }
  }
});

test("专业与 HR 会话可浏览有效校招 JD，权限、薪资隐藏、撤销及旧会话均生效", async (t) => {
  for (const kind of ["professional", "hr", "culture"]) {
    const { app, link, jobs } = await setup(t, { kind });
    const headers = { authorization: `Bearer ${app.jwt.sign({ aud: "interview-queue-share", sub: link.id, kind, queueId, tv: 0 })}` };
    for (const [index, status] of [[0, 200], [1, 200], [2, 404], [3, 404]]) {
      const response = await app.inject({ url: `/api/public/interview-queues/share/jobs/${jobs[index].id}`, headers });
      assert.equal(response.statusCode, kind === "culture" ? 403 : status);
      if (response.statusCode === 200) {
        assert.equal(response.json().job.evaluationModel, undefined);
        assert.equal(response.json().job.salary, index === 0 ? jobs[0].salary : null);
        assert.equal(response.json().job.description, jobs[index].description);
      }
    }
    link.tokenVersion++;
    assert.equal((await app.inject({ url: `/api/public/interview-queues/share/jobs/${jobs[0].id}`, headers })).statusCode, 401);
    link.active = false;
    assert.equal((await app.inject({ url: `/api/public/interview-queues/share/jobs/${jobs[0].id}`, headers })).statusCode, 410);
  }
  const { app, headers, jobs } = await setup(t);
  assert.equal((await app.inject({ url: `/api/interview-queues/${sessionId}/jobs/${jobs[0].id}`, headers })).statusCode, 200);
  assert.equal((await app.inject({ url: `/api/public/interview-queues/share/jobs/${jobs[0].id}`, headers })).statusCode, 403);
  const restricted = await setup(t, { role: "RECRUITER", pages: ["candidates"] });
  assert.equal((await restricted.app.inject({ url: `/api/interview-queues/${sessionId}/jobs/${jobs[0].id}`, headers: restricted.headers })).statusCode, 403);
});

test("HR 方向修改和待定重新排队经过实际动作接口，校验确认、版本、专场、角色及分享状态", async (t) => {
  for (const kind of ["hr", "professional", "culture"]) {
    const { app, link } = await setup(t, { kind });
    const entry = { id: userId, queueId, stage: "pending", professionalResult: "pending", updatedAt: "2026-10-15T01:00:00.000Z", jobDirection: "原岗位" };
    let writes = 0;
    app.prisma.interviewQueueEntry = {
      findMany: async ({ where }) => where.queueId === entry.queueId && where.id.in.includes(entry.id) ? [entry] : [],
      findFirst: async () => ({ phaseEnteredAt: new Date(Date.now() + 10000) }),
      updateMany: async ({ data }) => { writes++; Object.assign(entry, data); },
    };
    const headers = { authorization: `Bearer ${app.jwt.sign({ aud: "interview-queue-share", sub: link.id, kind, queueId, tv: 0 })}` };
    const send = (payload) => app.inject({ method: "POST", url: "/api/public/interview-queues/share/actions", headers, payload });
    const request = () => ({ action: "requeue", targetStage: "culture", items: [{ id: entry.id, updatedAt: new Date(entry.updatedAt).toISOString() }], confirmed: true });
    if (kind !== "hr") {
      assert.equal((await send(request())).statusCode, 403);
      assert.equal((await send({ ...request(), action: "direction", jobDirection: "新岗位" })).statusCode, kind === "culture" ? 403 : 409);
      assert.equal(writes, 0); continue;
    }
    for (const extra of [{ confirmed: false }, { targetStage: "salary" }]) assert.equal((await send({ ...request(), ...extra })).statusCode, 400);
    assert.equal((await send({ ...request(), items: [{ id: entry.id, updatedAt: new Date().toISOString() }] })).statusCode, 409);
    const oldQueue = entry.queueId; entry.queueId = "other-queue";
    assert.equal((await send(request())).statusCode, 409); entry.queueId = oldQueue;
    assert.equal((await send({ ...request(), action: "direction", jobDirection: "新岗位" })).statusCode, 200);
    assert.equal(entry.jobDirection, "新岗位"); assert.equal(entry.stage, "pending"); assert.equal(entry.professionalResult, "pending");
    const stale = request();
    assert.equal((await send(request())).statusCode, 200);
    assert.equal(entry.stage, "culture"); assert.equal(entry.professionalResult, null); assert.equal(entry.cultureStartedAt, null);
    assert.equal((await send(stale)).statusCode, 409);
    entry.stage = "pending"; link.active = false;
    assert.equal((await send(request())).statusCode, 410); assert.equal(writes, 2);
  }
  const { app, headers } = await setup(t, { role: "VIEWER" });
  assert.equal((await app.inject({ method: "POST", url: `/api/interview-queues/${sessionId}/actions`, headers, payload: { action: "requeue", targetStage: "professional", items: [{ id: userId, updatedAt: new Date().toISOString() }], confirmed: true } })).statusCode, 403);
});

test("登记海报读取专场地址；更新持久到同一专场，限制长度、空白、只读和匿名访问", async (t) => {
  const { app, headers, link } = await setup(t);
  const list = () => app.inject({ url: "/api/interview-queues/", headers });
  assert.equal((await list()).json().sessions[0].location, "原现场地址");
  const url = `/api/interview-queues/${sessionId}/location`;
  for (const location of [" ", "地".repeat(201)]) assert.equal((await app.inject({ method: "PATCH", url, headers, payload: { location } })).statusCode, 400);
  const response = await app.inject({ method: "PATCH", url, headers, payload: { location: "  学生活动中心 201 室  " } });
  assert.equal(response.statusCode, 200); assert.equal(response.json().location, "学生活动中心 201 室");
  assert.equal((await list()).json().sessions[0].location, "学生活动中心 201 室");
  const anonymous = { authorization: `Bearer ${app.jwt.sign({ aud: "interview-queue-share", sub: link.id, kind: link.kind, queueId, tv: 0 })}` };
  assert.equal((await app.inject({ method: "PATCH", url, headers: anonymous, payload: { location: "错误修改" } })).statusCode, 401);
  for (const access of [{ role: "VIEWER" }, { role: "RECRUITER", pages: ["candidates"] }]) {
    const restricted = await setup(t, access);
    assert.equal((await restricted.app.inject({ method: "PATCH", url, headers: restricted.headers, payload: { location: "错误修改" } })).statusCode, 403);
  }
});

test("面试官与流程设置验证配置冲突、重复席位、删除占用席位及只读权限", async (t) => {
  const { app, headers, link } = await setup(t);
  const professional = { id: crypto.randomUUID(), role: "professional", name: "专业面试官一" };
  const culture = { id: crypto.randomUUID(), role: "culture", name: "文化面试官一" };
  let occupied = [];
  app.prisma.interviewQueueEntry = { findMany: async () => occupied };
  app.prisma.interviewQueue.update = async ({ data }) => { if (data.setup) link.queue.setup = data.setup; return link.queue; };
  const previousSetup = { cultureOnsite: true, stations: [] };
  const configured = { cultureOnsite: false, stations: [professional] };
  const patch = (body) => app.inject({ method: "PATCH", url: `/api/interview-queues/${sessionId}/setup`, headers, payload: body });
  assert.equal((await patch({ previousSetup, setup: configured })).statusCode, 200);
  assert.equal(link.queue.setup.cultureOnsite, false);
  assert.equal((await patch({ previousSetup, setup: configured })).statusCode, 409);
  for (const stations of [[], [professional, professional]]) assert.equal((await patch({ previousSetup: configured, setup: { cultureOnsite: false, stations } })).statusCode, 400);
  occupied = [{ stationId: professional.id, stage: "professional" }];
  assert.equal((await patch({ previousSetup: configured, setup: { cultureOnsite: true, stations: [{ ...professional, id: crypto.randomUUID() }, culture] } })).statusCode, 409);
  const viewer = await setup(t, { role: "VIEWER" });
  assert.equal((await viewer.app.inject({ method: "PATCH", url: `/api/interview-queues/${sessionId}/setup`, headers: viewer.headers, payload: { previousSetup, setup: configured } })).statusCode, 403);
});

test("配置席位后分享会话绑定席位，同阶段其他席位人员不可见或修改", async (t) => {
  const { app, link, accessKey } = await setup(t, { kind: "professional" });
  const stationId = crypto.randomUUID(), otherId = crypto.randomUUID();
  link.queue.setup = { cultureOnsite: false, stations: [{ id: stationId, role: "professional", name: "甲席位" }, { id: otherId, role: "professional", name: "乙席位" }] };
  const rows = [stationId, otherId, null].map((seat, i) => ({ id: crypto.randomUUID(), queueId, stationId: seat, stage: "professional", name: `示例${i}`, updatedAt: new Date(), salaryBase: 8700, salaryFactor: 13.5 }));
  const match = (r, w) => Object.entries(w).every(([k, v]) => k === "OR" ? v.some((part) => match(r, part)) : v?.in ? v.in.includes(r[k]) : r[k] === v);
  let writes = 0;
  app.prisma.interviewQueueEntry = { findMany: async ({ where }) => rows.filter((r) => match(r, where)), updateMany: async () => { writes++; return { count: 1 }; } };
  const open = (body) => app.inject({ method: "POST", url: "/api/public/interview-queues/share/open", headers: { "x-queue-link": link.token }, payload: { accessKey, ...body } });
  assert.equal((await open({})).statusCode, 401);
  assert.equal((await open({ stationId: crypto.randomUUID() })).statusCode, 401);
  const session = await open({ stationId }); assert.equal(session.statusCode, 200);
  const headers = { authorization: `Bearer ${session.json().token}` };
  const data = await app.inject({ url: "/api/public/interview-queues/share/data", headers });
  assert.equal(data.statusCode, 200, data.body); assert.deepEqual(data.json().entries.map((r) => r.id), [rows[0].id]);
  assert.equal(data.json().queue.station.name, "甲席位");
  const denied = await app.inject({ method: "POST", url: "/api/public/interview-queues/share/actions", headers, payload: { action: "professional-result", result: "passed", confirmed: true, items: [{ id: rows[1].id, updatedAt: rows[1].updatedAt.toISOString() }] } });
  assert.equal(denied.statusCode, 403); assert.equal(writes, 0);
});
