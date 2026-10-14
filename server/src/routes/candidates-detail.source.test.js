import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import candidatesRoutes from "./candidates.js";

test("候选人详情优先展示校招汇总更正的来源，恢复自动后显示原始来源", async (t) => {
  const app = Fastify();
  const applicant = { id: "applicant-1", updatedAt: new Date("2026-10-14T01:00:00Z"), summaryData: { source: "线下宣讲" } };
  app.decorate("authenticate", async (req) => {
    req.user = { sub: "admin-1", role: "ADMIN" };
    req.permsCache = { access: { isAdmin: true, role: "ADMIN" } };
  });
  app.decorate("prisma", {
    candidate: { findFirst: async ({ include }) => {
      assert.deepEqual(include.campusApplicant.select, { id: true, updatedAt: true, summaryData: true });
      return { id: "candidate-1", name: "测试候选人", source: "校招·测试专场", campusApplicant: applicant, interviews: [] };
    } },
  });
  await app.register(candidatesRoutes, { prefix: "/api/candidates" });
  t.after(() => app.close());

  const corrected = await app.inject({ url: "/api/candidates/candidate-1" });
  assert.equal(corrected.statusCode, 200, corrected.body);
  assert.equal(corrected.json().candidate.source, "线下宣讲");
  assert.equal(corrected.json().candidate.campusSummary.id, applicant.id);
  assert.equal("campusApplicant" in corrected.json().candidate, false);

  applicant.summaryData = {};
  const restored = await app.inject({ url: "/api/candidates/candidate-1" });
  assert.equal(restored.json().candidate.source, "校招·测试专场");
});
