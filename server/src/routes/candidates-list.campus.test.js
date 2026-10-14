import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import candidatesRoutes from "./candidates.js";

test("candidate list returns current campus job scores without exposing match run details", async (t) => {
  const app = Fastify();
  app.decorate("authenticate", async (req) => {
    req.user = { sub: "admin" };
    req.permsCache = { access: { isAdmin: true } };
  });
  app.decorate("prisma", {
    candidate: {
      findMany: async ({ include }) => {
        assert.equal(include.campusApplicant.select.matchRuns.take, 1);
        return [
          {
            id: "candidate-1",
            name: "校招候选人",
            campusApplicant: {
              currentResumeVersionId: "version-1",
              session: { jobs: [{ jobId: "job-1", job: { title: "产品定义" } }, { jobId: "job-2", job: { title: "项目管理" } }] },
              matchRuns: [{ resumeVersionId: "version-1", results: [{ jobId: "job-1", scoreShown: 74 }, { jobId: "job-2", scoreRaw: 42 }] }],
            },
          },
          {
            id: "candidate-2",
            name: "旧版简历",
            campusApplicant: {
              currentResumeVersionId: "version-2",
              session: { jobs: [{ jobId: "job-1", job: { title: "产品定义" } }] },
              matchRuns: [{ resumeVersionId: "version-1", results: [{ jobId: "job-1", scoreShown: 99 }] }],
            },
          },
        ];
      },
      count: async () => 2,
    },
  });
  await app.register(candidatesRoutes, { prefix: "/api/candidates" });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/candidates" });
  assert.equal(response.statusCode, 200, response.body);
  const [current, stale] = response.json().items;
  assert.deepEqual(current.campusMatches, [
    { jobId: "job-1", title: "产品定义", scoreShown: 74 },
    { jobId: "job-2", title: "项目管理", scoreShown: 60 },
  ]);
  assert.deepEqual(stale.campusMatches, [{ jobId: "job-1", title: "产品定义", scoreShown: null }]);
  assert.equal("campusApplicant" in current, false);
});

test("候选人跨页全选保留筛选和数据权限，仅返回人员 ID", async (t) => {
  const app = Fastify();
  app.decorate("authenticate", async (req) => { req.user = { sub: "tester" }; req.permsCache = { access: { userId: "tester", role: "RECRUITER", isAdmin: false, departmentScopes: [], jobScopes: [] } }; });
  app.decorate("prisma", { candidate: { findMany: async ({ where, select, skip, take }) => {
    assert.equal(skip, undefined); assert.equal(take, undefined);
    assert.deepEqual(select, { id: true });
    assert.equal(where.AND[0].status, "待筛选");
    assert.equal(where.AND[0].classification, "A");
    assert.equal(where.AND[0].OR[0].name.contains, "测试");
    assert.deepEqual(where.AND[1], { OR: [{ ownerId: "tester" }] });
    return Array.from({ length: 65 }, (_, index) => ({ id: `candidate-${index}` }));
  } } });
  await app.register(candidatesRoutes, { prefix: "/api/candidates" });
  t.after(() => app.close());
  const response = await app.inject({ url: `/api/candidates?selection=all&q=${encodeURIComponent("测试")}&status=${encodeURIComponent("待筛选")}&classification=A&skip=50&take=10` });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().selection.length, 65);
  assert.equal(response.json().total, 65);
});
