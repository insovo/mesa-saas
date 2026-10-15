import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Fastify from "fastify";
import campusRoutes from "./campus.js";
import campusPublicRoutes from "./campus-public.js";
import { findSessionForPublic } from "../lib/campus/service.js";

const ids = [1, 2, 3].map((n) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
async function fixture(t, { page = true, manage = true, role = "RECRUITER", tabs = [] } = {}) {
  const app = Fastify();
  const writes = [], audits = [];
  const sessions = ids.map((id, i) => ({ id, externalId: `school-${i}`, slug: `school-${i}`, name: `大学${i + 1}专场`, status: i ? "draft" : "live", updatedAt: new Date(i), maxApplyJobs: 3, maxResumeUploads: 3, _count: { jobs: 1, applicants: 1 } }));
  const job = { id: "20000000-0000-4000-8000-000000000010", title: "校招工程师", campusActive: true, recruitmentType: "campus" };
  const links = sessions.map((s) => ({ id: `link-${s.id}`, sessionId: s.id, jobId: job.id, job, kind: "onsite", matchEnabled: true }));
  const students = sessions.map((s, i) => ({ id: `student-${i}`, sessionId: s.id, session: s, tokenVersion: 0, lastSeenAt: new Date(), name: `学生${i + 1}`, resumeVersions: [], matchRuns: [], applications: i ? [] : [{ id: "application-1", jobId: job.id, status: "submitted", sessionJob: links[0] }] }));
  const credentials = students.map(() => randomBytes(24).toString("base64url"));
  const matches = (row, where) => Object.entries(where).every(([key, value]) => key === "NOT" ? !matches(row, value) : row[key] === value);
  const prisma = {
    campusSession: {
      findFirst: async ({ where }) => sessions.filter((s) => matches(s, where)).sort((a, b) => b.updatedAt - a.updatedAt)[0] || null,
      findUnique: async ({ where }) => sessions.find((s) => matches(s, where)) || null,
      findMany: async () => [...sessions],
      update: async ({ where, data }) => { const s = sessions.find((s) => matches(s, where)); writes.push(s.id); Object.assign(s, data, { updatedAt: new Date(Date.now() + writes.length) }); return s; },
      updateMany: async ({ where, data }) => { const rows = sessions.filter((s) => matches(s, where)); rows.forEach((s) => { writes.push(s.id); Object.assign(s, data); }); return { count: rows.length }; },
    },
    campusSessionJob: { findMany: async ({ where }) => where ? links.filter((sj) => sj.sessionId === where.sessionId) : links },
    campusApplication: { groupBy: async () => [] },
    campusApplicant: { findUnique: async ({ where }) => students.find((s) => s.id === where.id) },
    auditLog: { create: async ({ data }) => { audits.push(data); return data; } },
    $transaction: async (fn) => fn(prisma),
  };
  app.decorate("prisma", prisma);
  app.decorate("authenticate", async (req) => {
    req.user = { sub: "manager", role };
    req.permsCache = { access: { role, isActive: true, isAdmin: false, pageKeys: page ? ["campus", ...tabs.map((tab) => `campus.${tab}`)] : [], moduleKeys: manage ? ["campus.manage"] : [], departmentScopes: [], jobScopes: [] } };
  });
  app.decorateRequest("jwtVerify", async function () {
    const index = credentials.indexOf(this.headers.authorization?.replace(/^Bearer /, ""));
    if (index < 0) throw new Error("unauthorized");
    return { sub: students[index].id, aud: "campus-public", tv: 0 };
  });
  await app.register(campusRoutes, { prefix: "/api/campus" });
  await app.register(campusPublicRoutes, { prefix: "/api/campus/public" });
  t.after(() => app.close());
  const status = (i, action) => app.inject({ method: "POST", url: `/api/campus/sessions/${ids[i]}/${action}` });
  return { app, prisma, sessions, job, writes, audits, credentials, status };
}

test("多个大学可同时上线，重复上线保留其他专场及审计目标", async (t) => {
  const { status, sessions, writes, audits, app } = await fixture(t);
  const results = await Promise.all([status(1, "live"), status(2, "live")]);
  results.forEach((r) => assert.equal(r.statusCode, 200, r.body));
  assert.equal((await status(1, "live")).statusCode, 200);
  assert.deepEqual(sessions.map((s) => s.status), ["live", "live", "live"]);
  assert.deepEqual(writes, [ids[1], ids[2], ids[1]]);
  assert.deepEqual(audits.map((a) => [a.action, a.entityId]), writes.map((id) => ["campus.session.live", id]));
  assert.equal((await app.inject("/api/campus/sessions")).json().items.filter((s) => s.status === "live").length, 3);
});

test("结束、草稿和重新上线各自独立，学生 slug 仍能选中每所学校", async (t) => {
  const { status, sessions, prisma } = await fixture(t);
  await status(1, "live"); await status(2, "live");
  for (const [action, expected] of [["close", "closed"], ["draft", "draft"], ["live", "live"]]) {
    assert.equal((await status(1, action)).statusCode, 200);
    assert.deepEqual(sessions.map((s) => s.status), ["live", expected, "live"]);
    for (const s of sessions) assert.equal((await findSessionForPublic(prisma, s.slug)).id, s.id);
  }
  assert.equal((await findSessionForPublic(prisma)).id, ids[1]);
  assert.equal(await findSessionForPublic(prisma, "missing-school"), null);
});

test("同时上线后的岗位、已投状态和学生详情按各校专场隔离", async (t) => {
  const { app, status, sessions, credentials } = await fixture(t);
  await status(1, "live");
  for (const index of [0, 1]) {
    const headers = { authorization: `Bearer ${credentials[index]}` };
    const own = await app.inject({ url: `/api/campus/public/session/current/jobs?slug=${sessions[index].slug}`, headers });
    assert.equal(own.statusCode, 200, own.body);
    assert.equal(own.json().onsite[0].applied, index === 0);
    const me = await app.inject({ url: "/api/campus/public/me", headers });
    assert.equal(me.statusCode, 200, me.body);
    assert.equal(me.json().session.id, ids[index]);
    assert.equal(me.json().session.open, true);
    const other = await app.inject({ url: `/api/campus/public/session/current/jobs?slug=${sessions[1 - index].slug}`, headers });
    assert.equal(other.json().onsite[0].applied, false);
  }
});

test("上线保留校招页面、配置权限和面试官 tab 授权校验", async (t) => {
  for (const options of [{ page: false }, { manage: false }, { role: "CAMPUS_INTERVIEWER", tabs: ["ledger"] }]) {
    const { status, writes } = await fixture(t, options);
    assert.equal((await status(1, "live")).statusCode, 403);
    assert.equal(writes.length, 0);
  }
  const { app, status, writes } = await fixture(t, { role: "CAMPUS_INTERVIEWER", tabs: ["sessions"] });
  assert.equal((await status(1, "live")).statusCode, 200);
  const missing = await app.inject({ method: "POST", url: "/api/campus/sessions/missing/live" });
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(writes, [ids[1]]);
});
