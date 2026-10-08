import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import campusPublicRoutes from "./campus-public.js";

test("学生看到硬筛岗位的正向理由且仍可查看该岗位,不收到缺项判定", async (t) => {
  const app = Fastify();
  const run = {
    id: "run-1", applicantId: "student-1", status: "done", stale: false, resumeVersionId: "version-1", taskId: null,
    results: [
      { jobId: "job-1", kind: "onsite", title: "项目管理", scoreShown: 60, excluded: true, evaluationId: "evaluation-1", reasons: [{ kind: "gap", text: "不符合硬性条件:证书" }] },
      { jobId: "job-2", kind: "onsite", title: "用户场景", scoreShown: 82, excluded: false, reasons: [{ kind: "match", text: "符合:用户访谈" }, { kind: "gap", text: "简历未体现:证书" }] },
    ],
  };
  const applicant = {
    id: "student-1", candidateId: "candidate-1", tokenVersion: 0, lastSeenAt: new Date(),
    currentResumeVersionId: "version-1", resumeVersions: [{ id: "version-1" }], applications: [], matchRuns: [run],
    session: { id: "session-1", maxApplyJobs: 3, maxResumeUploads: 3 },
  };
  app.decorate("prisma", {
    campusApplicant: { findUnique: async () => applicant },
    campusMatchRun: { findFirst: async () => run },
    candidateEvaluation: { findMany: async ({ where }) => {
      assert.deepEqual(where, { id: { in: ["evaluation-1"] }, candidateId: "candidate-1" });
      return [{ id: "evaluation-1", items: [
        { label: "项目规划", verdict: "满足", tier: "CORE" },
        { label: "跨团队协作", verdict: "部分满足", tier: "CORE" },
        { label: "证书", verdict: "不满足", tier: "MUST" },
      ] }];
    } },
  });
  app.decorateRequest("jwtVerify", async function () { return { aud: "campus-public", sub: applicant.id, tv: 0 }; });
  await app.register(campusPublicRoutes, { prefix: "/api/campus/public" });
  t.after(() => app.close());

  for (const path of ["latest", run.id]) {
    const response = await app.inject({ method: "GET", url: `/api/campus/public/match-runs/${path}`, headers: { authorization: "Bearer student-token" } });
    assert.equal(response.statusCode, 200);
    const [result, ordinary] = response.json().run.results;
    assert.equal(result.jobId, "job-1");
    assert.equal(result.scoreShown, 60);
    assert.deepEqual(result.reasons, [
      { kind: "match", text: "符合:项目规划" },
      { kind: "match", text: "较为符合:跨团队协作" },
    ]);
    assert.equal(Object.hasOwn(result, "excluded"), false);
    assert.equal(Object.hasOwn(result, "error"), false);
    assert.deepEqual(ordinary.reasons, [{ kind: "match", text: "符合:用户访谈" }]);
    assert.equal(Object.hasOwn(ordinary, "excluded"), false);
  }
});
