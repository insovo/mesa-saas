import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import campusRoutes from "./campus.js";

const sessionId = "10000000-0000-4000-8000-000000000001";
const jobId = "10000000-0000-4000-8000-000000000002";
const jobId2 = "10000000-0000-4000-8000-000000000004";
const base = "/api/campus/jobs";
function matches(job, where) {
  if (where.AND) return where.AND.every((part) => matches(job, part));
  if (where.OR) return where.OR.some((part) => matches(job, part));
  return Object.entries(where).every(([key, value]) => value?.in ? value.in.includes(job[key]) : value === job[key]);
}
async function fixture(t, { manage = true, page = true, changed = false, failModel = false, applications = 0, twoJobs = false, noScope = false, noSessions = false, role = "RECRUITER", tabs = [] } = {}) {
  const app = Fastify();
  const writes = [];
  let modelCalls = 0;
  const job = { id: jobId, title: "校招工程师", recruitmentType: "campus", campusActive: true, campusKind: "onsite", campusMatchEnabled: true, campusSortOrder: 4, responsibilities: [], requirements: [], nice: [], benefits: [], updatedAt: new Date("2026-10-08T00:00:00Z"), _count: { campusSessionJobs: 2 } };
  const job2 = { ...job, id: jobId2, title: "校招设计师", campusSortOrder: 5, nice: ["作品集"], benefits: ["补充医保"] };
  const jobs = twoJobs ? [job, job2] : [job];
  const sessions = noSessions ? [] : [{ id: sessionId }, { id: "10000000-0000-4000-8000-000000000007" }];
  const links = sessions.flatMap((session) => jobs.map((job) => ({ sessionId: session.id, jobId: job.id, kind: job.campusKind, matchEnabled: job.campusMatchEnabled, sortOrder: job.campusSortOrder })));
  const prisma = {
    job: {
      findMany: async ({ where, orderBy }) => { const rows = jobs.filter((job) => matches(job, where)); return orderBy ? rows.sort((a, b) => a.campusSortOrder - b.campusSortOrder) : rows; },
      findFirst: async ({ where }) => jobs.find((job) => matches(job, where)) || null,
      findUnique: async ({ where }) => jobs.find((job) => job.id === where.id),
      aggregate: async () => ({ _max: { campusSortOrder: Math.max(...jobs.map((job) => job.campusSortOrder)) } }),
      create: async ({ data }) => { writes.push({ type: "create", data }); Object.assign(job, data); return job; },
      update: async ({ where, data }) => { writes.push({ type: "update", where, data }); const target = jobs.find((job) => job.id === where.id); Object.assign(target, data); return target; },
      updateMany: async ({ where, data }) => {
        const targets = where.updatedAt ? jobs.filter((job) => job.id === where.id) : jobs.filter((job) => matches(job, where));
        if (changed && where.updatedAt) return { count: 0 };
        writes.push({ type: "bulkJob", where, data }); targets.forEach((job) => Object.assign(job, data)); return { count: targets.length };
      },
    },
    campusSession: {
      findMany: async () => sessions,
      findUnique: async () => null,
      create: async ({ data }) => { const session = { id: "10000000-0000-4000-8000-000000000009", ...data }; sessions.push(session); return session; },
    },
    campusApplication: { findMany: async () => [], count: async () => applications, groupBy: async () => [] },
    campusSessionJob: {
      createMany: async ({ data, skipDuplicates }) => { assert.equal(skipDuplicates, true); writes.push({ type: "attach", data }); for (const row of data) if (!links.some((link) => link.sessionId === row.sessionId && link.jobId === row.jobId)) links.push(row); },
      updateMany: async ({ where, data }) => { writes.push({ type: "links", where, data }); const targets = links.filter((row) => where.jobId.in ? where.jobId.in.includes(row.jobId) : where.jobId === row.jobId); targets.forEach((row) => Object.assign(row, data)); return { count: targets.length }; },
    },
    auditLog: { create: async () => ({}) },
    userJobScope: { create: async ({ data }) => { writes.push({ type: "scope", data }); return data; } },
    $executeRaw: async () => 0,
    $transaction: async (run) => run(prisma),
  };
  app.decorate("prisma", prisma);
  app.decorate("authenticate", async (req) => {
    req.user = { sub: "test-manager", role };
    req.permsCache = { access: { role, isActive: true, isAdmin: false, pageKeys: page ? ["campus", ...tabs.map((tab) => `campus.${tab}`)] : [], moduleKeys: manage ? ["campus.manage"] : [], departmentScopes: [], jobScopes: noScope ? [] : jobs.map((job) => ({ jobId: job.id })) } };
  });
  await app.register(campusRoutes, { prefix: "/api/campus", generateJobModel: async (input) => {
    modelCalls++; assert.equal(input.id, jobId);
    if (failModel) throw Object.assign(new Error("upstream failed"), { statusCode: 502 });
    return { jdFacts: { schemaVersion: "jd.v1" }, evaluationModel: { schemaVersion: "eval.v1" }, evaluationModelVersion: { increment: 1 }, evaluationModelUpdatedAt: new Date() };
  } });
  t.after(() => app.close());
  return { app, writes, job, job2, links, modelCalls: () => modelCalls };
}

test("新建校招岗位一次关联全部现有专场，不需要社招创建权限", async (t) => {
  const { app, writes } = await fixture(t);
  const response = await app.inject({ method: "POST", url: `${base}/new`, payload: { title: " 校招软件工程师 ", responsibilities: [" 开发功能 "], kind: "referral", matchEnabled: false } });
  assert.equal(response.statusCode, 201, response.body);
  assert.equal(response.json().item.job.title, "校招软件工程师");
  assert.equal(response.json().item.kind, "referral");
  assert.equal(response.json().item.matchEnabled, false);
  assert.deepEqual(writes.find((row) => row.type === "create").data.responsibilities, ["开发功能"]);
  const added = writes.find((row) => row.type === "attach").data;
  assert.equal(added.length, 2);
  assert.equal(added.every((row) => row.kind === "referral" && row.matchEnabled === false && row.sortOrder === 5), true);
  assert.deepEqual(writes.find((row) => row.type === "scope").data, { userId: "test-manager", jobId });
});

test("没有专场时也能创建岗位，后续新建专场自动带入统一目录", async (t) => {
  const { app, links } = await fixture(t, { noSessions: true });
  assert.equal((await app.inject({ method: "POST", url: `${base}/new`, payload: { title: "新岗位", kind: "referral" } })).statusCode, 201);
  assert.equal(links.length, 0);
  const response = await app.inject({ method: "POST", url: "/api/campus/sessions", payload: { name: "新专场" } });
  assert.equal(response.statusCode, 201, response.body);
  assert.equal(links.length, 1);
  assert.equal(links[0].sessionId, response.json().session.id);
  assert.equal(links[0].kind, "referral");
});

test("岗位类型、参与匹配和排序同步所有专场", async (t) => {
  const { app, links } = await fixture(t, { twoJobs: true });
  const patch = await app.inject({ method: "PATCH", url: `${base}/${jobId}`, payload: { kind: "referral", matchEnabled: false } });
  assert.equal(patch.statusCode, 200, patch.body);
  assert.equal(links.filter((row) => row.jobId === jobId).every((row) => row.kind === "referral" && !row.matchEnabled), true);
  const reorder = await app.inject({ method: "POST", url: `${base}/reorder`, payload: { ids: [jobId2, jobId] } });
  assert.equal(reorder.statusCode, 200, reorder.body);
  assert.equal(links.filter((row) => row.jobId === jobId2).every((row) => row.sortOrder === 4), true);
});

test("编辑 JD 和批量资料应用到统一岗位且保留未选择字段", async (t) => {
  const { app, job, links } = await fixture(t);
  const edit = await app.inject({ method: "PATCH", url: `${base}/${jobId}/job`, payload: { title: "更新名称", responsibilities: ["测试"], openings: 0 } });
  assert.equal(edit.statusCode, 200, edit.body);
  assert.equal(edit.json().item.job.sessionsCount, 2);
  const bulk = await app.inject({ method: "PATCH", url: `${base}/bulk`, payload: { ids: [jobId], changes: { kind: "referral", dept: " 研发 ", openings: 0, deadline: null } } });
  assert.equal(bulk.statusCode, 200, bulk.body);
  assert.equal(job.dept, "研发");
  assert.equal(job.title, "更新名称");
  assert.equal(links.every((row) => row.kind === "referral"), true);
});

test("批量追加分别保留各岗位原资料并去重；任一超限则整批拒绝", async (t) => {
  const { app, job, job2, writes } = await fixture(t, { twoJobs: true });
  job.nice = [" 沟通能力 "]; job.benefits = ["餐补"];
  const saved = await app.inject({ method: "PATCH", url: `${base}/bulk`, payload: { ids: [jobId, jobId2], changes: { niceAdd: ["作品集", "沟通能力"], benefitsAdd: ["餐补", "弹性工作"] } } });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.deepEqual(job.nice, [" 沟通能力 ", "作品集"]);
  assert.deepEqual(job2.benefits, ["补充医保", "餐补", "弹性工作"]);
  job2.nice = Array.from({ length: 20 }, (_, i) => `加分项 ${i}`);
  writes.length = 0;
  const limit = await app.inject({ method: "PATCH", url: `${base}/bulk`, payload: { ids: [jobId, jobId2], changes: { kind: "referral", niceAdd: ["新条目"] } } });
  assert.equal(limit.statusCode, 409);
  assert.equal(limit.json().error, "campus_job_items_limit");
  assert.equal(writes.length, 0);
});

test("福利待遇超过20条仍完整保存和追加，加分项原有上限保持有效", async (t) => {
  const { app, job } = await fixture(t);
  const benefits = Array.from({ length: 37 }, (_, index) => `福利 ${index}`);
  const response = await app.inject({ method: "PATCH", url: `${base}/${jobId}/job`, payload: { benefits } });
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(job.benefits, benefits);
  const extra = Array.from({ length: 22 }, (_, index) => `新增福利 ${index}`);
  assert.equal((await app.inject({ method: "PATCH", url: `${base}/bulk`, payload: { ids: [jobId], changes: { benefitsAdd: extra } } })).statusCode, 200);
  assert.equal(job.benefits.length, 59);
});

test("批量修改、恢复、生成模型均遵守权限和岗位范围", async (t) => {
  const denied = await fixture(t, { noScope: true });
  assert.equal((await denied.app.inject({ method: "PATCH", url: `${base}/bulk`, payload: { ids: [jobId], changes: { kind: "referral" } } })).statusCode, 409);
  assert.equal((await denied.app.inject({ method: "POST", url: base, payload: { jobId } })).statusCode, 404);
  assert.equal((await denied.app.inject({ method: "POST", url: `${base}/${jobId}/evaluation-model`, payload: {} })).statusCode, 404);
  const readonly = await fixture(t, { manage: false });
  for (const [method, path, payload] of [["POST", "/new", { title: "test" }], ["PATCH", "/bulk", { ids: [jobId], changes: { kind: "referral" } }], ["PATCH", `/${jobId}/job`, { title: "test" }], ["POST", `/${jobId}/evaluation-model`, {}]]) assert.equal((await readonly.app.inject({ method, url: base + path, payload })).statusCode, 403);
  const noPage = await fixture(t, { page: false });
  assert.equal((await noPage.app.inject({ method: "POST", url: `${base}/new`, payload: { title: "test" } })).statusCode, 403);
});

test("岗位 tab 授权可以访问统一目录，台账授权不能修改目录", async (t) => {
  const jobs = await fixture(t, { role: "CAMPUS_INTERVIEWER", tabs: ["jobs"] });
  assert.equal((await jobs.app.inject({ url: base })).statusCode, 200);
  const ledger = await fixture(t, { role: "CAMPUS_INTERVIEWER", tabs: ["ledger"] });
  assert.equal((await ledger.app.inject({ method: "POST", url: `${base}/new`, payload: { title: "test" } })).statusCode, 403);
});

test("输入校验拒绝重复 ID、非法字段与超限内容", async (t) => {
  const { app, writes } = await fixture(t);
  for (const payload of [{ ids: [jobId, jobId], changes: { kind: "onsite" } }, { ids: [jobId], changes: {} }, { ids: [jobId], changes: { title: "不能批量改名" } }, { ids: [jobId], changes: { openings: -1 } }]) assert.equal((await app.inject({ method: "PATCH", url: `${base}/bulk`, payload })).statusCode, 400);
  for (const payload of [{ title: "   " }, { title: "test", responsibilities: Array(21).fill("item") }, { title: "test", openings: 1.5 }, { title: "test", benefits: ["x".repeat(201)] }]) assert.equal((await app.inject({ method: "POST", url: `${base}/new`, payload })).statusCode, 400);
  assert.equal(writes.length, 0);
});

test("模型生成保存到共用 JD；并发修改及上游失败不覆盖已有数据", async (t) => {
  const normal = await fixture(t);
  const saved = await normal.app.inject({ method: "POST", url: `${base}/${jobId}/evaluation-model`, payload: {} });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(saved.json().item.job.hasEvaluationModel, true);
  assert.equal(normal.modelCalls(), 1);
  const changed = await fixture(t, { changed: true });
  assert.equal((await changed.app.inject({ method: "POST", url: `${base}/${jobId}/evaluation-model`, payload: {} })).statusCode, 409);
  assert.equal(changed.job.evaluationModel, undefined);
  const failed = await fixture(t, { failModel: true });
  assert.equal((await failed.app.inject({ method: "POST", url: `${base}/${jobId}/evaluation-model`, payload: {} })).statusCode, 422);
  assert.equal(failed.writes.length, 0);
});

test("有投递的岗位不能移除；无投递岗位可移除并恢复到全部专场", async (t) => {
  const applied = await fixture(t, { applications: 1 });
  assert.equal((await applied.app.inject({ method: "DELETE", url: `${base}/${jobId}` })).statusCode, 409);
  const empty = await fixture(t);
  assert.equal((await empty.app.inject({ method: "DELETE", url: `${base}/${jobId}` })).statusCode, 204);
  const removed = await empty.app.inject({ url: base });
  assert.equal(removed.json().items.length, 0);
  assert.equal(removed.json().available.length, 1);
  assert.equal((await empty.app.inject({ method: "POST", url: base, payload: { jobId, kind: "referral" } })).statusCode, 201);
  assert.equal(empty.links.every((row) => row.kind === "referral"), true);
});

test("旧专场写接口不能创建独立配置", async (t) => {
  const { app, writes } = await fixture(t);
  const response = await app.inject({ method: "POST", url: `/api/campus/sessions/${sessionId}/jobs/new`, payload: { title: "独立岗位" } });
  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "campus_jobs_shared");
  assert.equal(writes.length, 0);
});
