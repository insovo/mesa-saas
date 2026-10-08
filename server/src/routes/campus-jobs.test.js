import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import campusRoutes from "./campus.js";

const sessionId = "10000000-0000-4000-8000-000000000001";
const jobId = "10000000-0000-4000-8000-000000000002";
const sjId = "10000000-0000-4000-8000-000000000003";
const jobId2 = "10000000-0000-4000-8000-000000000004";
const sjId2 = "10000000-0000-4000-8000-000000000005";
const base = `/api/campus/sessions/${sessionId}/jobs`;

async function fixture(t, { manage = true, page = true, linked = true, changed = false, failModel = false, applications = 0, twoJobs = false, admin = false, lookupJobType = null } = {}) {
  const app = Fastify();
  const writes = [];
  let modelCalls = 0;
  const job = { id: jobId, title: "校招工程师", responsibilities: [], requirements: [], nice: [], benefits: [], updatedAt: new Date("2026-10-08T00:00:00Z"), _count: { campusSessionJobs: 2 } };
  const sj = { id: sjId, sessionId, jobId, kind: "onsite", matchEnabled: true, sortOrder: 0, job, _count: { applications } };
  const job2 = { ...job, id: jobId2, title: "校招设计师", nice: ["作品集"], benefits: ["补充医保"] };
  const sj2 = { ...sj, id: sjId2, jobId: jobId2, job: job2 };
  const jobs = twoJobs ? [job, job2] : [job];
  const sessionJobs = twoJobs ? [sj, sj2] : [sj];
  const prisma = {
    job: {
      create: async ({ data }) => { writes.push({ type: "create", data }); Object.assign(job, data); return job; },
      update: async ({ where, data }) => { writes.push({ type: "update", where, data }); const target = jobs.find((item) => item.id === where.id); Object.assign(target, data); return target; },
      updateMany: async ({ where, data }) => { writes.push({ type: where.updatedAt ? "model" : "bulkJob", where, data }); const targets = where.id?.in ? jobs.filter((item) => where.id.in.includes(item.id)) : [job]; if (!changed || !where.updatedAt) targets.forEach((item) => Object.assign(item, data)); return { count: changed && where.updatedAt ? 0 : targets.length }; },
      findFirst: async ({ where }) => { writes.push({ type: "lookup", where }); return where.recruitmentType === lookupJobType ? { id: jobId } : null; },
    },
    campusSession: { findFirst: async () => ({ id: sessionId }) },
    campusApplication: { findMany: async () => [] },
    campusSessionJob: {
      findFirst: async () => linked ? sj : null,
      findMany: async ({ where }) => linked && where.sessionId === sessionId ? sessionJobs.filter((item) => where.id.in.includes(item.id)).map((item) => ({ id: item.id, jobId: item.jobId, job: item.job })) : [],
      findUnique: async ({ where }) => where.sessionId_jobId ? null : sj,
      updateMany: async ({ where, data }) => { writes.push({ type: "bulkSessionJob", where, data }); const targets = sessionJobs.filter((item) => where.id.in.includes(item.id)); targets.forEach((item) => Object.assign(item, data)); return { count: targets.length }; },
      aggregate: async () => ({ _max: { sortOrder: 4 } }),
      create: async ({ data }) => { writes.push({ type: "attach", data }); Object.assign(sj, data); return sj; },
    },
    auditLog: { create: async () => ({}) },
    userJobScope: { create: async ({ data }) => { writes.push({ type: "scope", data }); return data; } },
    $transaction: async (fn) => fn(prisma),
  };
  app.decorate("prisma", prisma);
  app.decorate("authenticate", async (req) => {
    req.user = { sub: "test-manager" };
    req.permsCache = { access: { isActive: true, isAdmin: admin, pageKeys: page ? ["campus"] : [], moduleKeys: manage ? ["campus.manage"] : [], departmentScopes: [], jobScopes: [] } };
  });
  await app.register(campusRoutes, {
    prefix: "/api/campus",
    generateJobModel: async (input) => {
      modelCalls++;
      assert.equal(input.id, jobId);
      if (failModel) throw Object.assign(new Error("upstream failed"), { statusCode: 502 });
      return { jdFacts: { schemaVersion: "jd.v1" }, evaluationModel: { schemaVersion: "eval.v1" }, evaluationModelVersion: { increment: 1 }, evaluationModelUpdatedAt: new Date() };
    },
  });
  t.after(() => app.close());
  return { app, writes, job, job2, modelCalls: () => modelCalls };
}

test("campus manager can create a JD and attach it without social job permissions", async (t) => {
  const { app, writes } = await fixture(t);
  const r = await app.inject({ method: "POST", url: `${base}/new`, payload: { title: " 校招软件工程师 ", responsibilities: [" 开发功能 "], kind: "referral", matchEnabled: false } });
  assert.equal(r.statusCode, 201);
  assert.equal(r.json().item.job.title, "校招软件工程师");
  assert.equal(r.json().item.kind, "referral");
  assert.equal(r.json().item.matchEnabled, false);
  assert.deepEqual(writes[0].data.responsibilities, ["开发功能"]);
  assert.equal(writes[0].data.recruitmentType, "campus");
  assert.deepEqual(writes[1].data, { userId: "test-manager", jobId });
  assert.equal(writes[2].data.sortOrder, 5);
});

test("shared JD edits return the updated fields and usage count", async (t) => {
  const { app } = await fixture(t);
  const r = await app.inject({ method: "PATCH", url: `${base}/${sjId}/job`, payload: { title: "更新名称", deadline: null, responsibilities: ["测试"], openings: 0 } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().item.job.title, "更新名称");
  assert.equal(r.json().item.job.sessionsCount, 2);
  assert.equal(r.json().item.job.openings, 0);
  assert.equal(r.json().item.job.deadline, null);
});

test("bulk edits update only requested fields for jobs in the selected session", async (t) => {
  const { app, writes, job } = await fixture(t);
  const r = await app.inject({ method: "PATCH", url: `${base}/bulk`, payload: { ids: [sjId], changes: { kind: "referral", dept: " 研发 ", openings: 0, deadline: null } } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().updated, 1);
  assert.equal(job.dept, "研发");
  assert.equal(job.openings, 0);
  assert.deepEqual(writes.find((w) => w.type === "bulkSessionJob").data, { kind: "referral" });
  assert.deepEqual(writes.find((w) => w.type === "bulkJob").data, { dept: "研发", openings: 0, deadline: null });
});

test("bulk additions append and deduplicate each selected job's own nice and benefits", async (t) => {
  const { app, job, job2 } = await fixture(t, { twoJobs: true });
  job.nice = [" 沟通能力 "];
  job.benefits = ["餐补"];
  const r = await app.inject({ method: "PATCH", url: `${base}/bulk`, payload: { ids: [sjId, sjId2], changes: { niceAdd: [" 作品集 ", "沟通能力"], benefitsAdd: ["餐补", "弹性工作"] } } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().updated, 2);
  assert.deepEqual(job.nice, [" 沟通能力 ", "作品集"]);
  assert.deepEqual(job2.nice, ["作品集", "沟通能力"]);
  assert.deepEqual(job.benefits, ["餐补", "弹性工作"]);
  assert.deepEqual(job2.benefits, ["补充医保", "餐补", "弹性工作"]);
});

test("bulk addition refuses the entire batch when any job would exceed 20 items", async (t) => {
  const { app, writes, job2 } = await fixture(t, { twoJobs: true });
  job2.nice = Array.from({ length: 20 }, (_, i) => `加分项 ${i}`);
  const r = await app.inject({ method: "PATCH", url: `${base}/bulk`, payload: { ids: [sjId, sjId2], changes: { kind: "referral", niceAdd: ["新条目"] } } });
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().error, "campus_job_items_limit");
  assert.equal(writes.length, 0);
});

test("bulk edits reject jobs outside the session and invalid field sets without writing", async (t) => {
  const { app, writes } = await fixture(t, { linked: false });
  const r = await app.inject({ method: "PATCH", url: `${base}/bulk`, payload: { ids: [sjId], changes: { kind: "referral", salary: "20K" } } });
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().error, "campus_jobs_changed");
  for (const payload of [
    { ids: [sjId, sjId], changes: { kind: "onsite" } },
    { ids: [sjId], changes: {} },
    { ids: [sjId], changes: { title: "不能批量改名" } },
    { ids: [sjId], changes: { openings: -1 } },
  ]) assert.equal((await app.inject({ method: "PATCH", url: `${base}/bulk`, payload })).statusCode, 400, JSON.stringify(payload));
  assert.equal(writes.length, 0);
});

test("read-only campus users cannot mutate jobs or generate models", async (t) => {
  const { app, writes, modelCalls } = await fixture(t, { manage: false });
  for (const [method, path, payload] of [["POST", "/new", { title: "test" }], ["PATCH", "/bulk", { ids: [sjId], changes: { kind: "referral" } }], ["PATCH", `/${sjId}/job`, { title: "test" }], ["POST", `/${sjId}/evaluation-model`, {}]]) {
    const r = await app.inject({ method, url: base + path, payload });
    assert.equal(r.statusCode, 403);
  }
  assert.equal(writes.length, 0);
  assert.equal(modelCalls(), 0);
});

test("campus page access remains required even with manage permission", async (t) => {
  const { app, writes } = await fixture(t, { page: false });
  const r = await app.inject({ method: "POST", url: `${base}/new`, payload: { title: "test" } });
  assert.equal(r.statusCode, 403);
  assert.equal(writes.length, 0);
});

test("job fields reject whitespace titles, oversized lists and fractional openings", async (t) => {
  const { app, writes } = await fixture(t);
  for (const payload of [{ title: "   " }, { title: "test", responsibilities: Array(21).fill("item") }, { title: "test", openings: 1.5 }, { title: "test", benefits: ["x".repeat(201)] }]) {
    const r = await app.inject({ method: "POST", url: `${base}/new`, payload });
    assert.equal(r.statusCode, 400);
  }
  assert.equal(writes.length, 0);
});

test("existing jobs are checked against the user's job scope before attachment", async (t) => {
  const { app, writes } = await fixture(t);
  const r = await app.inject({ method: "POST", url: base, payload: { jobId } });
  assert.equal(r.statusCode, 404);
  assert.deepEqual(writes[0].where, { AND: [{ id: jobId, recruitmentType: "campus" }, { id: { in: [] } }] });
});

test("a campus session only accepts campus jobs", async (t) => {
  const { app, writes } = await fixture(t, { admin: true, lookupJobType: "social" });
  const denied = await app.inject({ method: "POST", url: base, payload: { jobId } });
  assert.equal(denied.statusCode, 404);
  assert.deepEqual(writes[0].where, { id: jobId, recruitmentType: "campus" });
  assert.equal(writes.some((write) => write.type === "attach"), false);
});

test("an existing campus job can be reused in another campus session", async (t) => {
  const { app, writes } = await fixture(t, { admin: true, lookupJobType: "campus" });
  const response = await app.inject({ method: "POST", url: base, payload: { jobId } });
  assert.equal(response.statusCode, 201);
  assert.equal(writes.find((write) => write.type === "attach").data.jobId, jobId);
});

test("campus manager can generate and persist a model on the linked job", async (t) => {
  const { app, writes, modelCalls } = await fixture(t);
  const r = await app.inject({ method: "POST", url: `${base}/${sjId}/evaluation-model`, payload: {} });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().item.job.hasEvaluationModel, true);
  assert.equal(modelCalls(), 1);
  assert.equal(writes[0].where.id, jobId);
  assert.equal(writes[0].where.updatedAt.toISOString(), "2026-10-08T00:00:00.000Z");
});

test("a different session's job cannot be edited or used to generate a model", async (t) => {
  const { app, writes, modelCalls } = await fixture(t, { linked: false });
  for (const [method, path, payload] of [["PATCH", "job", { title: "test" }], ["POST", "evaluation-model", {}]]) {
    const r = await app.inject({ method, url: `${base}/${sjId}/${path}`, payload });
    assert.equal(r.statusCode, 404);
  }
  assert.equal(writes.length, 0);
  assert.equal(modelCalls(), 0);
});

test("concurrent JD edits prevent an outdated model from being persisted", async (t) => {
  const { app, job } = await fixture(t, { changed: true });
  const r = await app.inject({ method: "POST", url: `${base}/${sjId}/evaluation-model`, payload: {} });
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().error, "campus_job_changed");
  assert.equal(job.evaluationModel, undefined);
});

test("upstream model failures return JSON and preserve the previous model", async (t) => {
  const { app, writes } = await fixture(t, { failModel: true });
  const r = await app.inject({ method: "POST", url: `${base}/${sjId}/evaluation-model`, payload: {} });
  assert.equal(r.statusCode, 422);
  assert.equal(r.json().error, "campus_job_model_failed");
  assert.equal(writes.length, 0);
});

test("jobs with applications cannot be removed", async (t) => {
  const { app } = await fixture(t, { applications: 1 });
  const r = await app.inject({ method: "DELETE", url: `${base}/${sjId}` });
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().error, "campus_job_has_applications");
});
