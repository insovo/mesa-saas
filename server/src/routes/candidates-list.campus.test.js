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
