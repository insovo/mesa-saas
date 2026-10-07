import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import campusRoutes from "./campus.js";

const sessionId = "10000000-0000-4000-8000-000000000001";
const jobId = "10000000-0000-4000-8000-000000000002";
const sjId = "10000000-0000-4000-8000-000000000003";
const base = `/api/campus/sessions/${sessionId}/jobs`;

async function fixture(t, { manage = true, page = true, linked = true, changed = false, failModel = false, applications = 0 } = {}) {
  const app = Fastify();
  const writes = [];
  let modelCalls = 0;
  const job = { id: jobId, title: "校招工程师", responsibilities: [], requirements: [], nice: [], benefits: [], updatedAt: new Date("2026-10-08T00:00:00Z"), _count: { campusSessionJobs: 2 } };
  const sj = { id: sjId, sessionId, jobId, kind: "onsite", matchEnabled: true, sortOrder: 0, job, _count: { applications } };
  const prisma = {
    job: {
      create: async ({ data }) => { writes.push({ type: "create", data }); Object.assign(job, data); return job; },
      update: async ({ data }) => { writes.push({ type: "update", data }); Object.assign(job, data); return job; },
      updateMany: async ({ where, data }) => { writes.push({ type: "model", where, data }); if (!changed) Object.assign(job, data); return { count: changed ? 0 : 1 }; },
      findFirst: async ({ where }) => { writes.push({ type: "lookup", where }); return null; },
    },
    campusSession: { findFirst: async () => ({ id: sessionId }) },
    campusSessionJob: {
      findFirst: async () => linked ? sj : null,
      findUnique: async () => sj,
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
    req.permsCache = { access: { isActive: true, isAdmin: false, pageKeys: page ? ["campus"] : [], moduleKeys: manage ? ["campus.manage"] : [], departmentScopes: [], jobScopes: [] } };
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
  return { app, writes, job, modelCalls: () => modelCalls };
}

test("campus manager can create a JD and attach it without social job permissions", async (t) => {
  const { app, writes } = await fixture(t);
  const r = await app.inject({ method: "POST", url: `${base}/new`, payload: { title: " 校招软件工程师 ", responsibilities: [" 开发功能 "], kind: "referral", matchEnabled: false } });
  assert.equal(r.statusCode, 201);
  assert.equal(r.json().item.job.title, "校招软件工程师");
  assert.equal(r.json().item.kind, "referral");
  assert.equal(r.json().item.matchEnabled, false);
  assert.deepEqual(writes[0].data.responsibilities, ["开发功能"]);
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

test("read-only campus users cannot mutate jobs or generate models", async (t) => {
  const { app, writes, modelCalls } = await fixture(t, { manage: false });
  for (const [method, path, payload] of [["POST", "/new", { title: "test" }], ["PATCH", `/${sjId}/job`, { title: "test" }], ["POST", `/${sjId}/evaluation-model`, {}]]) {
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
  assert.deepEqual(writes[0].where, { AND: [{ id: jobId }, { id: { in: [] } }] });
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
