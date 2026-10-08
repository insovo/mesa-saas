import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import candidatesRoutes from "./candidates.js";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const CANDIDATE_ID = "33333333-3333-4333-8333-333333333333";

async function fixture(t, role = "ADMIN", inScope = true) {
  const app = Fastify();
  const history = [];
  app.decorate("authenticate", async (req) => {
    req.user = { sub: "44444444-4444-4444-8444-444444444444", email: "operator@example.com" };
    req.permsCache = { access: {
      userId: req.user.sub, role, isActive: true, isAdmin: role === "ADMIN",
      moduleKeys: [], pageKeys: [], departmentScopes: [], jobScopes: [],
    } };
  });
  app.decorate("prisma", {
    candidate: { findFirst: async () => inScope ? { id: CANDIDATE_ID, campusApplicant: { sessionId: "session-1" } } : null },
    campusSessionJob: { findMany: async ({ where }) => {
      assert.equal(where.sessionId, "session-1");
      return [{ job: { id: JOB_ID, title: "项目管理" } }];
    } },
    candidateJobRecommendation: {
      findMany: async () => [...history].reverse(),
      findFirst: async () => history.at(-1) || null,
      create: async ({ data }) => {
        const item = { id: history.length + 1, ...data, createdAt: new Date("2026-10-08T10:00:00Z") };
        history.push(item);
        return item;
      },
    },
    user: { findUnique: async () => ({ name: "招聘官小李", email: "operator@example.com" }) },
  });
  await app.register(candidatesRoutes, { prefix: "/api/candidates" });
  t.after(() => app.close());
  return { app, history };
}

test("校招建议岗位可选择、清除并保留操作人和历史；重复选择不新增记录", async (t) => {
  const { app, history } = await fixture(t);
  const url = "/api/candidates/c-1/job-recommendation";
  const first = await app.inject({ method: "PUT", url, payload: { jobId: JOB_ID } });
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(first.json().current.jobTitle, "项目管理");
  assert.equal(first.json().current.actorName, "招聘官小李");
  assert.equal((await app.inject({ method: "PUT", url, payload: { jobId: JOB_ID } })).statusCode, 200);
  assert.equal(history.length, 1);
  const cleared = await app.inject({ method: "PUT", url, payload: { jobId: null } });
  assert.equal(cleared.statusCode, 200, cleared.body);
  assert.equal(cleared.json().current.jobId, null);
  assert.deepEqual(cleared.json().history.map((row) => row.jobTitle), [null, "项目管理"]);
  assert.equal((await app.inject({ method: "GET", url })).json().history.length, 2);
});

test("建议岗位只能选当前专场可见岗位，且遵守候选人范围和编辑权限", async (t) => {
  const { app } = await fixture(t);
  const url = "/api/candidates/c-1/job-recommendation";
  assert.equal((await app.inject({ method: "PUT", url, payload: { jobId: OTHER_ID } })).statusCode, 400);
  assert.equal((await app.inject({ method: "PUT", url, payload: { jobId: "bad" } })).statusCode, 400);
  const viewer = await fixture(t, "VIEWER");
  assert.equal((await viewer.app.inject({ method: "PUT", url, payload: { jobId: JOB_ID } })).statusCode, 403);
  const hidden = await fixture(t, "ADMIN", false);
  assert.equal((await hidden.app.inject({ method: "GET", url })).statusCode, 404);
  const interviewer = await fixture(t, "CAMPUS_INTERVIEWER");
  assert.equal((await interviewer.app.inject({ method: "PUT", url, payload: { jobId: JOB_ID } })).statusCode, 200);
});
