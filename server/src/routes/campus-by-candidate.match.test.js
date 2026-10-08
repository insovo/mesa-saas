import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import campusRoutes from "./campus.js";

async function fixture(t, role, inScope = true) {
  const app = Fastify();
  let lookedUp = false;
  app.decorate("prisma", {
    candidate: { findFirst: async () => inScope ? { id: "candidate-1" } : null },
    campusApplicant: { findUnique: async () => {
      lookedUp = true;
      return { id: "applicant-1", candidateId: "candidate-1", currentResumeVersionId: null, session: { matchEnabled: false } };
    } },
  });
  app.decorate("authenticate", async (req) => {
    req.user = { sub: "user-1", role };
    req.permsCache = { access: {
      userId: "user-1", role, isActive: true, isAdmin: role === "ADMIN",
      pageKeys: ["candidates", "candidate.detail"], moduleKeys: [], departmentScopes: [], jobScopes: [],
    } };
  });
  await app.register(campusRoutes, { prefix: "/api/campus" });
  t.after(() => app.close());
  return { app, lookedUp: () => lookedUp };
}

test("管理员、校招面试官和招聘官可从候选人详情发起匹配,沿用简历校验", async (t) => {
  for (const role of ["ADMIN", "CAMPUS_INTERVIEWER", "RECRUITER"]) {
    const { app } = await fixture(t, role);
    const res = await app.inject({ method: "POST", url: "/api/campus/by-candidate/candidate-1/match-runs" });
    assert.equal(res.statusCode, 428, role);
    assert.equal(res.json().error, "campus_resume_required");
  }
});

test("候选人范围外的招聘官不能发起匹配,只读用户没有此入口", async (t) => {
  const recruiter = await fixture(t, "RECRUITER", false);
  const outOfScope = await recruiter.app.inject({ method: "POST", url: "/api/campus/by-candidate/candidate-1/match-runs" });
  assert.equal(outOfScope.statusCode, 404);
  assert.equal(recruiter.lookedUp(), false);

  const viewer = await fixture(t, "VIEWER");
  const forbidden = await viewer.app.inject({ method: "POST", url: "/api/campus/by-candidate/candidate-1/match-runs" });
  assert.equal(forbidden.statusCode, 403);
  assert.equal(viewer.lookedUp(), false);
});

test("候选人详情的岗位匹配结果包含硬筛缺项和满足项", async (t) => {
  const app = Fastify();
  const results = [
    { jobId: "job-1", title: "产品定义", scoreShown: 60, excluded: true, evaluationId: "evaluation-1", reasons: [] },
    { jobId: "job-2", title: "项目管理", scoreShown: 89, evaluationId: "evaluation-2", reasons: [] },
  ];
  app.decorate("prisma", {
    campusApplicant: { findUnique: async () => ({
      id: "applicant-1", candidateId: "candidate-1", sessionId: "session-1", session: { id: "session-1", maxResumeUploads: 3 },
      resumeVersions: [], applications: [], matchRuns: [{ id: "run-1", status: "done", taskId: null, results }],
    }) },
    candidateEvaluation: { findMany: async ({ where, select }) => {
      assert.deepEqual(where, { id: { in: ["evaluation-1", "evaluation-2"] }, candidateId: "candidate-1" });
      assert.deepEqual(select, { id: true, hardFilter: true, items: true });
      return [{
        id: "evaluation-1",
        hardFilter: { result: "FAIL", items: [{ key: "grad-year", label: "2026 届毕业生", tier: "MUST", result: "FAIL", reason: "毕业年份 2027" }] },
        items: [{ key: "grad-year", label: "2026 届毕业生", tier: "MUST", verdict: "不满足", raw: { code: { reason: "毕业年份 2027" } } }, { key: "degree", label: "本科及以上", tier: "MUST", verdict: "满足", raw: {} }],
      }];
    } },
  });
  app.decorate("authenticate", async (req) => {
    req.user = { sub: "admin-1", role: "ADMIN" };
    req.permsCache = { access: { userId: "admin-1", role: "ADMIN", isActive: true, isAdmin: true, pageKeys: ["candidate.detail"], moduleKeys: [] } };
  });
  await app.register(campusRoutes, { prefix: "/api/campus" });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/campus/by-candidate/candidate-1" });
  assert.equal(response.statusCode, 200);
  const [failed, missing] = response.json().latestMatchRun.results;
  assert.equal(failed.analysis.hardFilter.items[0].reason, "毕业年份 2027");
  assert.deepEqual(failed.analysis.items.map(({ label, verdict }) => [label, verdict]), [["2026 届毕业生", "不满足"], ["本科及以上", "满足"]]);
  assert.equal(missing.analysis, null);
});
