import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import candidatesRoutes from "./candidates.js";

test("候选人详情优先展示校招汇总更正的来源，恢复自动后显示原始来源", async (t) => {
  const app = Fastify();
  const applicant = { id: "applicant-1", updatedAt: new Date("2026-10-14T01:00:00Z"), summaryData: { source: "线下宣讲" }, candidate: { source: "校招·测试专场" } };
  app.decorate("authenticate", async (req) => {
    req.user = { sub: "admin-1", role: "ADMIN" };
    req.permsCache = { access: { isAdmin: true, role: "ADMIN" } };
  });
  app.decorate("prisma", {
    candidate: { findFirst: async ({ include }) => {
      assert.equal(include.campusApplicant.include.candidate.select.source, true);
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

test("未授予汇总权限的校招面试官不收到完整登记评价资料", async (t) => {
  const app = Fastify();
  app.decorate("authenticate", async (req) => {
    req.user = { sub: "interviewer-1", role: "CAMPUS_INTERVIEWER" };
    req.permsCache = { access: { userId: req.user.sub, isAdmin: false, isActive: true, role: req.user.role, pageKeys: ["candidate.detail"], moduleKeys: [], jobScopes: [], departmentScopes: [] } };
  });
  app.decorate("prisma", { candidate: { findFirst: async () => ({ id: "candidate-1", name: "候选人", campusApplicant: { id: "applicant-1", summaryData: { name: "更正姓名", hrResult: "待定" } } }) } });
  await app.register(candidatesRoutes, { prefix: "/api/candidates" });
  t.after(() => app.close());
  const result = await app.inject({ url: "/api/candidates/candidate-1" });
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(result.json().candidate.name, "更正姓名");
  assert.equal(result.json().candidate.campusSummary.values, undefined);
});

test("汇总人工资料同步详情主字段与完整登记资料，后续解析不覆盖人工值", async (t) => {
  const app = Fastify();
  const raw = { id: "candidate-1", name: "简历姓名", gender: "男", school: "原学校", education: "本科", major: "原专业", source: "校招", interviews: [] };
  const manual = { name: "更正姓名", gender: "女", school: "更正学校", degree: "硕士", major: "更正专业", gradYear: "2027", englishLevel: "CET-6", department: "研发", hrInterviewer: "HR甲", hrResult: "通过", trackingNumber: "00100" };
  const applicant = { id: "applicant-1", updatedAt: new Date(), summaryData: manual, candidate: raw, session: { name: "测试专场" } };
  app.decorate("authenticate", async (req) => { req.user = { sub: "admin-1", role: "ADMIN" }; req.permsCache = { access: { isAdmin: true, role: "ADMIN" } }; });
  app.decorate("prisma", { candidate: { findFirst: async () => ({ ...raw, campusApplicant: applicant }) } });
  await app.register(candidatesRoutes, { prefix: "/api/candidates" });
  t.after(() => app.close());
  raw.name = "后续解析姓名"; raw.school = "后续解析学校"; raw.education = "博士";
  const response = await app.inject({ url: "/api/candidates/candidate-1" });
  assert.equal(response.statusCode, 200, response.body);
  const candidate = response.json().candidate;
  assert.equal(candidate.name, "更正姓名");
  assert.equal(candidate.education, "硕士");
  assert.equal(candidate.school, "更正学校");
  assert.equal(candidate.campusSummary.columns.length, 22);
  for (const [key, value] of Object.entries(manual)) assert.equal(candidate.campusSummary.values[key], value);
  assert.equal(candidate.campusSummary.manualFields.includes("trackingNumber"), true);
});
