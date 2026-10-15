import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import campusRoutes from "./campus.js";
import { publicCampusJobShareRoutes } from "./campus-job-shares.js";
import { CAMPUS_JOB_SHARE_BENEFITS } from "../lib/campus/jobShareDefaults.js";

const managerId = randomUUID();
const ids = Array.from({ length: 4 }, () => randomUUID());
const protectedBase = "/api/campus/jobs/share-links";
const publicBase = "/api/public/campus-job-shares";
async function fixture(t, { role = "ADMIN", scope = [ids[0]], manage = true } = {}) {
  const app = Fastify();
  const user = { id: managerId, role, isActive: true, accessPolicy: { pageKeys: ["campus"], moduleKeys: manage ? ["campus.manage"] : [] }, departmentScopes: [], jobScopes: scope.map((jobId) => ({ jobId })) };
  let state = {
    jobs: ids.map((id, index) => ({ id, title: `岗位${index}`, recruitmentType: index === 2 ? "social" : "campus", campusActive: index !== 3, campusKind: "onsite", campusMatchEnabled: false, campusSortOrder: index, responsibilities: ["原职责"], requirements: ["原要求"], benefits: [], owner: "内部信息", evaluationModel: { internal: true } })),
    shares: [], shareJobs: [], links: ids.slice(0, 2).flatMap((jobId) => [1, 2].map((sessionId) => ({ jobId, sessionId, kind: "onsite", matchEnabled: false }))),
  };
  const matches = (job, where) => Object.entries(where).every(([key, value]) => {
    if (key === "AND") return value.every((part) => matches(job, part));
    if (key === "OR") return value.some((part) => matches(job, part));
    if (key === "campusShareItems") return state.shareJobs.some((item) => item.jobId === job.id && item.shareId === value.some.shareId);
    return value?.in ? value.in.includes(job[key]) : value === job[key];
  });
  const select = (row, fields) => fields ? Object.fromEntries(Object.keys(fields).map((key) => [key, row[key]])) : row;
  const shape = (row, include) => row && { ...row, ...(include?.creator ? { creator: { id: user.id, isActive: user.isActive } } : {}), ...(include?._count ? { _count: { jobs: state.shareJobs.filter((item) => item.shareId === row.id).length } } : {}) };
  const prisma = {
    user: { findUnique: async () => user },
    job: {
      findMany: async ({ where, select: fields }) => state.jobs.filter((job) => matches(job, where)).map((job) => select(job, fields)),
      aggregate: async () => ({ _max: { campusSortOrder: 3 } }),
      updateMany: async ({ where, data }) => { const rows = state.jobs.filter((job) => matches(job, where)); rows.forEach((job) => Object.assign(job, data)); return { count: rows.length }; },
      create: async ({ data, select: fields }) => { const job = { id: randomUUID(), ...data }; state.jobs.push(job); return select(job, fields); },
    },
    campusJobShare: {
      create: async ({ data, include }) => { const { jobs, ...fields } = data; const row = { id: randomUUID(), active: true, createdAt: new Date(), ...fields }; state.shares.push(row); state.shareJobs.push(...jobs.create.map((job) => ({ shareId: row.id, ...job }))); return shape(row, include); },
      findUnique: async ({ where, include }) => shape(state.shares.find((row) => where.id ? row.id === where.id : row.token === where.token), include),
      findMany: async ({ where, include }) => state.shares.filter((row) => row.createdBy === where.createdBy && row.active && row.expiresAt > where.expiresAt.gt).map((row) => shape(row, include)),
      update: async ({ where, data }) => { const row = state.shares.find((row) => row.id === where.id); Object.assign(row, data); return row; },
    },
    campusJobShareJob: { create: async ({ data }) => state.shareJobs.push(data) },
    campusSession: { findMany: async () => [{ id: "first" }, { id: "second" }] },
    campusSessionJob: {
      updateMany: async ({ where, data }) => { state.links.filter((link) => where.jobId.in.includes(link.jobId)).forEach((link) => Object.assign(link, data)); },
      createMany: async ({ data }) => state.links.push(...data),
    },
    campusApplication: { findMany: async () => [] },
    userJobScope: { create: async ({ data }) => user.jobScopes.push({ jobId: data.jobId }) },
    auditLog: { create: async () => ({}) },
    $executeRaw: async () => 0, $queryRaw: async () => [],
    $transaction: async (run) => { const original = structuredClone(state); try { return await run(prisma); } catch (err) { state = original; throw err; } },
  };
  app.decorate("prisma", prisma);
  app.decorate("authenticate", async (req) => { req.user = { sub: user.id, role: user.role }; });
  await app.register(campusRoutes, { prefix: "/api/campus" });
  await app.register(publicCampusJobShareRoutes, { prefix: publicBase });
  t.after(() => app.close());
  async function share(selected = [ids[0]], expirySeconds) {
    const response = await app.inject({ method: "POST", url: protectedBase, payload: { ids: selected, ...(expirySeconds ? { expirySeconds } : {}) } });
    assert.equal(response.statusCode, 201, response.body);
    const link = response.json().link;
    return { link, headers: { "x-campus-job-share": link.path.split("/").at(-1) } };
  }
  return { app, share, user, state: () => state };
}

test("HR岗位分享仅包含所选校招岗位，默认三天，自定义期限和字段白名单有效", async (t) => {
  const { app, share } = await fixture(t);
  const { link, headers } = await share();
  assert.ok(Math.abs(new Date(link.expiresAt) - Date.now() - 259200000) < 5000);
  const shown = await app.inject({ url: `${publicBase}/`, headers });
  assert.equal(shown.statusCode, 200, shown.body);
  assert.equal(shown.headers["cache-control"], "no-store");
  assert.deepEqual(shown.json().jobs.map((job) => job.id), [ids[0]]);
  assert.equal(shown.json().jobs[0].owner, undefined);
  assert.equal(shown.json().jobs[0].evaluationModel, undefined);
  assert.equal(shown.json().defaults.benefits.length, 37);
  const custom = await share([ids[0]], 600);
  assert.ok(Math.abs(new Date(custom.link.expiresAt) - Date.now() - 600000) < 5000);
  for (const seconds of [0, 59, 31536001]) assert.equal((await app.inject({ method: "POST", url: protectedBase, payload: { ids: [ids[0]], expirySeconds: seconds } })).statusCode, 400);
  for (const selected of [[ids[2]], [ids[3]], [ids[0], ids[0]]]) assert.notEqual((await app.inject({ method: "POST", url: protectedBase, payload: { ids: selected } })).statusCode, 201);
});

test("批量标记原子校验分享范围并同步所有专场，JD和匹配配置保留", async (t) => {
  const { app, share, state } = await fixture(t);
  const { headers } = await share();
  assert.equal((await app.inject({ method: "PATCH", url: `${publicBase}/kind`, headers, payload: { ids: [ids[0], ids[1]], kind: "referral" } })).statusCode, 409);
  assert.equal(state().jobs[0].campusKind, "onsite");
  const changed = await app.inject({ method: "PATCH", url: `${publicBase}/kind`, headers, payload: { ids: [ids[0]], kind: "referral" } });
  assert.equal(changed.statusCode, 200, changed.body);
  assert.equal(state().links.filter((row) => row.jobId === ids[0]).every((row) => row.kind === "referral"), true);
  assert.deepEqual(state().jobs[0].responsibilities, ["原职责"]);
  assert.equal(state().jobs[0].campusMatchEnabled, false);
});

test("停止、过期、停用和权限收回均禁止读取及写入", async (t) => {
  const { app, share, user, state } = await fixture(t);
  const { link, headers } = await share();
  async function rejected() {
    for (const call of [{ url: `${publicBase}/` }, { method: "PATCH", url: `${publicBase}/kind`, payload: { ids: [ids[0]], kind: "referral" } }, { method: "POST", url: `${publicBase}/jobs`, payload: { title: "新岗位", responsibilities: ["职责"], requirements: ["要求"] } }]) assert.equal((await app.inject({ ...call, headers })).statusCode, 410);
  }
  state().shares[0].expiresAt = new Date(0); await rejected(); state().shares[0].expiresAt = new Date(Date.now() + 60000);
  user.isActive = false; await rejected(); user.isActive = true;
  user.role = "RECRUITER"; user.accessPolicy.moduleKeys = []; await rejected(); user.role = "ADMIN";
  assert.equal((await app.inject({ method: "DELETE", url: `${protectedBase}/${link.id}` })).statusCode, 204); await rejected();
  assert.equal((await app.inject({ url: `${publicBase}/` })).statusCode, 404);
});

test("HR仅填三项新建岗位，37条福利及默认值全部持久化且全专场与当前分享可见", async (t) => {
  const { app, share, state } = await fixture(t, { role: "RECRUITER" });
  const { headers } = await share();
  const response = await app.inject({ method: "POST", url: `${publicBase}/jobs`, headers, payload: { title: " 新岗位 ", responsibilities: [" 职责一 "], requirements: [" 要求一 "] } });
  assert.equal(response.statusCode, 201, response.body);
  const created = state().jobs.at(-1);
  assert.equal(created.title, "新岗位"); assert.equal(created.campusKind, "referral");
  assert.equal(created.location, "芜湖"); assert.equal(created.employment, "全职"); assert.equal(created.educationRequirement, "全日制本科及以上"); assert.equal(created.openings, 0);
  for (const key of ["dept", "salary", "languageRequirement", "deadline"]) assert.equal(created[key], null);
  assert.deepEqual(created.benefits, CAMPUS_JOB_SHARE_BENEFITS);
  assert.equal(state().links.filter((row) => row.jobId === created.id).length, 2);
  assert.equal((await app.inject({ url: `${publicBase}/`, headers })).json().jobs.length, 2);
  const blank = await app.inject({ method: "POST", url: `${publicBase}/jobs`, headers, payload: { title: " ", responsibilities: [" "], requirements: ["要求"] } });
  assert.equal(blank.statusCode, 422); assert.equal(state().jobs.length, 5);
});

test("HR 新建 JD 可选现场面试或内推，岗位及所有专场保存一致，拒绝非法类型", async (t) => {
  const { app, share, state } = await fixture(t);
  const { headers } = await share();
  for (const kind of ["onsite", "referral"]) {
    const response = await app.inject({ method: "POST", url: `${publicBase}/jobs`, headers, payload: { title: `新建${kind}`, responsibilities: ["职责"], requirements: ["要求"], kind } });
    assert.equal(response.statusCode, 201); assert.equal(response.json().job.kind, kind);
    const created = state().jobs.at(-1);
    assert.equal(created.campusKind, kind); assert.deepEqual(created.benefits, CAMPUS_JOB_SHARE_BENEFITS);
    const linked = state().links.filter((row) => row.jobId === created.id);
    assert.equal(linked.length, 2); assert.ok(linked.every((row) => row.kind === kind));
    assert.equal((await app.inject({ url: `${publicBase}/`, headers })).json().jobs.find((job) => job.id === created.id).kind, kind);
  }
  const count = state().jobs.length;
  assert.equal((await app.inject({ method: "POST", url: `${publicBase}/jobs`, headers, payload: { title: "错误类型", responsibilities: ["职责"], requirements: ["要求"], kind: "other" } })).statusCode, 400);
  assert.equal(state().jobs.length, count);
});

test("分享人权限和岗位范围实时生效，禁止无权限创建及停止他人的链接", async (t) => {
  const { app, share, user } = await fixture(t, { role: "RECRUITER" });
  assert.equal((await app.inject({ method: "POST", url: protectedBase, payload: { ids: [ids[1]] } })).statusCode, 409);
  const { link, headers } = await share();
  user.jobScopes = [];
  assert.equal((await app.inject({ url: `${publicBase}/`, headers })).json().jobs.length, 0);
  assert.equal((await app.inject({ method: "PATCH", url: `${publicBase}/kind`, headers, payload: { ids: [ids[0]], kind: "onsite" } })).statusCode, 409);
  user.id = randomUUID();
  assert.equal((await app.inject({ method: "DELETE", url: `${protectedBase}/${link.id}` })).statusCode, 404);
  user.accessPolicy.moduleKeys = [];
  assert.equal((await app.inject({ method: "POST", url: protectedBase, payload: { ids: [ids[0]] } })).statusCode, 403);
});
