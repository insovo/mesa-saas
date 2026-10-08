import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import campusPublicRoutes from "./campus-public.js";

test("确认联系方式的毕业年份先取简历,人工修改后保持人工年份", async (t) => {
  const app = Fastify();
  const row = {
    id: "student-1", candidateId: "candidate-1", tokenVersion: 0, lastSeenAt: new Date(),
    gradYear: 2026, gradYearSource: "default", wechat: "existing-wechat", currentResumeVersionId: "version-1",
    resumeVersions: [{ id: "version-1", parseStatus: "done" }], applications: [], matchRuns: [],
    session: { maxApplyJobs: 3, maxResumeUploads: 3 },
  };
  let candidateDerived = { graduationYear: 2027, highestDegree: "本科" };
  const prisma = {
    campusApplicant: {
      findUnique: async () => row,
      update: async ({ data }) => { Object.assign(row, data); return row; },
    },
    candidate: {
      findUnique: async () => ({ name: "学生", derived: candidateDerived }),
      update: async ({ data }) => { if (data.derived) candidateDerived = data.derived; },
    },
    $transaction: async (fn) => fn(prisma),
  };
  app.decorate("prisma", prisma);
  app.decorateRequest("jwtVerify", async function () { return { aud: "campus-public", sub: row.id, tv: 0 }; });
  await app.register(campusPublicRoutes, { prefix: "/api/campus/public" });
  t.after(() => app.close());
  const headers = { authorization: "Bearer student-token" };
  const statusUrl = "/api/campus/public/resumes/version-1/parse-status";

  const extracted = await app.inject({ method: "GET", url: statusUrl, headers });
  assert.equal(extracted.statusCode, 200);
  assert.equal(extracted.json().prefill.gradYear, 2027);

  const edited = await app.inject({ method: "PATCH", url: "/api/campus/public/me", headers, payload: { gradYear: 2025 } });
  assert.equal(edited.statusCode, 200);
  assert.equal(row.gradYearSource, "manual");
  assert.equal(edited.json().me.gradYearSource, "manual");
  assert.deepEqual(candidateDerived, { graduationYear: 2025, highestDegree: "本科" });
  assert.equal((await app.inject({ method: "GET", url: statusUrl, headers })).json().prefill.gradYear, 2025);

  const confirmed = await app.inject({ method: "POST", url: "/api/campus/public/me/contact-confirm", headers, payload: { phone: "13800138000", email: "student@example.com" } });
  assert.equal(confirmed.statusCode, 200);
  assert.equal(row.wechat, "existing-wechat");
  assert.equal(confirmed.json().me.gradYear, 2025);
  assert.equal((await app.inject({ method: "GET", url: statusUrl, headers })).json().prefill.gradYear, 2025);

  const reset = await app.inject({ method: "PATCH", url: "/api/campus/public/me", headers, payload: { gradYear: null } });
  assert.equal(reset.statusCode, 200);
  assert.equal(row.gradYear, 2026);
  assert.equal(row.gradYearSource, "default");
});
