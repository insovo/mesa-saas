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
