import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import campusRoutes from "./campus.js";
import { SUMMARY_COLUMNS, summaryRow } from "./campus-summary.js";
import { campusInterviewerPageKeys } from "../lib/permissionKeys.js";

const sessionId = "10000000-0000-4000-8000-000000000001";
const applicantId = "10000000-0000-4000-8000-000000000002";
const updatedAt = "2026-10-13T06:00:00.000Z";
function applicant(index = 0) {
  return {
    id: index ? `20000000-0000-4000-8000-${String(index).padStart(12, "0")}` : applicantId,
    candidateId: `candidate-${index}`, sessionId, updatedAt, gradYear: 2026, name: `候选人${index}`, session: { name: "测试专场" },
    summaryData: { schoolType: "211", base: "芜湖" }, applications: [],
    candidate: { gender: "男", education: "硕士", school: "测试大学", source: "校园宣讲", languages: [], derived: { certificateTags: ["cert.cet6"] },
      interviews: [{ id: "hr", category: "HR", round: "初面", interviewers: [{ name: "测试面试官" }], recommendation: "建议复试" }],
      interviewEvaluations: [], department: { name: "测试部门" },
    },
  };
}
async function setup(t, { rows = [applicant()], role = "ADMIN", tabs = [], modules = [] } = {}) {
  const app = Fastify();
  app.decorate("authenticate", async (req) => {
    req.user = { sub: "tester", role };
    req.permsCache = { access: { isActive: true, role, isAdmin: role === "ADMIN", pageKeys: role === "CAMPUS_INTERVIEWER" ? campusInterviewerPageKeys(tabs) : ["campus"], moduleKeys: modules, departmentScopes: [], jobScopes: [] } };
  });
  app.decorate("prisma", {
    campusApplicant: {
      findMany: async ({ where, include }) => {
        if (include) assert.equal(include.candidate.select.interviewEvaluations.select.token, undefined);
        return rows.filter((row) => (!where.sessionId || row.sessionId === where.sessionId) && (!where.id?.in || where.id.in.includes(row.id)));
      },
      findUnique: async ({ where }) => rows.find((row) => row.id === where.id),
      updateMany: async ({ where, data }) => {
        const row = rows.find((row) => row.id === where.id && new Date(row.updatedAt).getTime() === where.updatedAt.getTime());
        if (!row) return { count: 0 };
        Object.assign(row, data, { updatedAt: new Date(new Date(row.updatedAt).getTime() + 60000).toISOString() });
        return { count: 1 };
      },
    },
    auditLog: { create: async () => ({}) },
  });
  app.prisma.$transaction = async (run) => run(app.prisma);
  await app.register(campusRoutes, { prefix: "/api/campus" });
  t.after(() => app.close());
  return app;
}

test("汇总提供模板的23列与15项筛选，并在组合筛选后分页", async (t) => {
  const rows = Array.from({ length: 65 }, (_, index) => applicant(index));
  rows.push({ ...applicant(66), summaryData: { schoolType: "985", base: "芜湖" } });
  const app = await setup(t, { rows });
  const response = await app.inject({ method: "GET", url: `/api/campus/summary?schoolType=211&gender=${encodeURIComponent("男")}&gradYear=2026&hrResult=${encodeURIComponent("通过")}&englishLevel=CET-6&skip=50&take=10` });
  assert.equal(response.statusCode, 200);
  const result = response.json();
  assert.equal(result.total, 65);
  assert.equal(result.items.length, 10);
  assert.deepEqual(result.items.map((row) => row.sequence), [51, 52, 53, 54, 55, 56, 57, 58, 59, 60]);
  assert.equal(result.columns.length, 23);
  assert.equal(result.columns.filter((column) => column.filter).length, 15);
  assert.deepEqual(result.options.schoolType, ["C9", "985", "211", "双一流", "QS100", "QS300", "QS500", "QS10", "一本"]);
  assert.deepEqual(result.options.hrInterviewer, ["测试面试官"]);
  assert.deepEqual(result.options.department, ["测试部门"]);
  assert.equal(result.items[0].hrResult, "通过");
  assert.equal(result.canEdit, true);
  const empty = await app.inject({ url: "/api/campus/summary?source=missing" });
  assert.equal(empty.json().total, 0);
  assert.equal(empty.json().options.source.includes("校园宣讲"), true);
  const selection = await app.inject({ url: "/api/campus/summary?schoolType=211&selection=all&skip=50&take=10" });
  assert.equal(selection.json().selection.length, 65);
  assert.equal(selection.json().selection[0].updatedAt, updatedAt);
  const search = await app.inject({ url: `/api/campus/summary?q=${encodeURIComponent("候选人66")}` });
  assert.equal(search.json().total, 1);
  const otherSession = await app.inject({ url: "/api/campus/summary?sessionId=10000000-0000-4000-8000-000000000099" });
  assert.equal(otherSession.json().total, 0);
});

test("简历来源和学校类型支持多选批量更正，保留其他补录，并拦截重复和过期记录", async (t) => {
  const first = applicant(1);
  const second = applicant(2);
  const app = await setup(t, { rows: [first, second] });
  const items = [first, second].map(({ id, updatedAt }) => ({ id, updatedAt }));
  const source = await app.inject({ method: "PATCH", url: "/api/campus/summary/bulk", payload: { items, field: "source", value: "线下宣讲" } });
  assert.equal(source.statusCode, 200);
  assert.equal(source.json().count, 2);
  assert.equal(first.summaryData.schoolType, "211");
  assert.equal(second.summaryData.source, "线下宣讲");
  const stale = await app.inject({ method: "PATCH", url: "/api/campus/summary/bulk", payload: { items, field: "schoolType", value: "QS10" } });
  assert.equal(stale.statusCode, 409);
  assert.equal(first.summaryData.schoolType, "211");
  const current = [first, second].map(({ id, updatedAt }) => ({ id, updatedAt }));
  const school = await app.inject({ method: "PATCH", url: "/api/campus/summary/bulk", payload: { items: current, field: "schoolType", value: "QS10" } });
  assert.equal(school.statusCode, 200);
  assert.equal(summaryRow(first).schoolType, "QS10");
  assert.equal(summaryRow(second).source, "线下宣讲");
  const duplicate = await app.inject({ method: "PATCH", url: "/api/campus/summary/bulk", payload: { items: [current[0], current[0]], field: "source", value: "重复" } });
  assert.equal(duplicate.statusCode, 400);
  const reset = await app.inject({ method: "PATCH", url: "/api/campus/summary/bulk", payload: { items: [{ id: first.id, updatedAt: first.updatedAt }], field: "schoolType", value: null } });
  assert.equal(reset.statusCode, 200);
  assert.equal(summaryRow(first).schoolType, "");
});

test("补录覆盖自动值、保留北森号前导零，恢复自动后跟随源资料，并拦截过期保存", async (t) => {
  const row = applicant();
  const app = await setup(t, { rows: [row] });
  const response = await app.inject({ method: "PATCH", url: `/api/campus/summary/${applicantId}`, payload: { updatedAt, values: { beisenId: "00123", name: "补录姓名", hrResult: "待定", trackingNumber: "00012345" } } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().item.beisenId, "00123");
  assert.equal(response.json().item.hrResult, "待定");
  row.candidate.name = "后续解析姓名";
  row.name = "后续解析姓名";
  assert.equal(summaryRow(row).name, "补录姓名");
  const conflict = await app.inject({ method: "PATCH", url: `/api/campus/summary/${applicantId}`, payload: { updatedAt, values: { beisenId: "stale" } } });
  assert.equal(conflict.statusCode, 409);
  assert.equal(row.summaryData.beisenId, "00123");
  const reset = await app.inject({ method: "PATCH", url: `/api/campus/summary/${applicantId}`, payload: { updatedAt: row.updatedAt, values: { name: null } } });
  assert.equal(reset.statusCode, 200);
  assert.equal(reset.json().item.name, "后续解析姓名");
  const invalid = await app.inject({ method: "PATCH", url: `/api/campus/summary/${applicantId}`, payload: { updatedAt: row.updatedAt, values: { gender: "unknown" } } });
  assert.equal(invalid.statusCode, 400);
  const extra = await app.inject({ method: "PATCH", url: `/api/campus/summary/${applicantId}`, payload: { updatedAt: row.updatedAt, values: { phone: "12345" } } });
  assert.equal(extra.statusCode, 400);
});

test("全部汇总字段可跨人员统一保存，保留未选字段，支持恢复各自自动值", async (t) => {
  const rows = [applicant(1), applicant(2)];
  const app = await setup(t, { rows });
  const values = { beisenId: "00012", source: "统一宣讲", name: "更正姓名", gender: "女", jobDirection: "产品定义", school: "测试大学", schoolType: "C9", major: "测试专业", degree: "博士", gradYear: "2027", englishLevel: "CET-6", hrInterviewer: "HR甲", hrResult: "通过", professionalInterviewer: "专业甲", professionalResult: "待定", cultureInterviewer: "文化甲", cultureResult: "淘汰", status: "谈薪中", trackingNumber: "000100", cancellationReason: "更正原因", department: "研发", base: "芜湖" };
  const response = await app.inject({ method: "PATCH", url: "/api/campus/summary/bulk", payload: { items: rows.map(({ id, updatedAt }) => ({ id, updatedAt })), values } });
  assert.equal(response.statusCode, 200, response.body);
  for (const row of rows) for (const [key, value] of Object.entries(values)) assert.equal(summaryRow(row)[key], value);
  rows[0].candidate.school = "重新解析学校";
  assert.equal(summaryRow(rows[0]).school, "测试大学");
  const invalid = await app.inject({ method: "PATCH", url: "/api/campus/summary/bulk", payload: { items: [{ id: rows[0].id, updatedAt: rows[0].updatedAt }], values: { sequence: "9" } } });
  assert.equal(invalid.statusCode, 400);
  const reset = await app.inject({ method: "PATCH", url: "/api/campus/summary/bulk", payload: { items: rows.map(({ id, updatedAt }) => ({ id, updatedAt })), values: { school: null, hrResult: "待定" } } });
  assert.equal(reset.statusCode, 200, reset.body);
  assert.equal(summaryRow(rows[0]).school, "重新解析学校");
  assert.equal(summaryRow(rows[1]).school, "测试大学");
  assert.equal(summaryRow(rows[0]).beisenId, "00012");
});

test("汇总 tab 单独授权只读，台账权限不能访问汇总，无编辑模块不能保存", async (t) => {
  const summary = await setup(t, { role: "CAMPUS_INTERVIEWER", tabs: ["summary"] });
  const response = await summary.inject({ url: "/api/campus/summary" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().canEdit, false);
  assert.equal((await summary.inject({ url: `/api/campus/sessions/${sessionId}/ledger` })).statusCode, 403);
  assert.equal((await summary.inject({ method: "PATCH", url: `/api/campus/summary/${applicantId}`, payload: { updatedAt, values: { name: "test" } } })).statusCode, 403);
  assert.equal((await summary.inject({ method: "PATCH", url: "/api/campus/summary/bulk", payload: { items: [{ id: applicantId, updatedAt }], field: "source", value: "改动" } })).statusCode, 403);
  const ledger = await setup(t, { role: "CAMPUS_INTERVIEWER", tabs: ["ledger"] });
  assert.equal((await ledger.inject({ url: "/api/campus/summary" })).statusCode, 403);
  const viewer = await setup(t, { role: "VIEWER" });
  assert.equal((await viewer.inject({ method: "PATCH", url: `/api/campus/summary/${applicantId}`, payload: { updatedAt, values: { name: "test" } } })).statusCode, 403);
});

test("仅从明确证据带入英语等级与面试轮次，不把城市或未通过证书当作事实", () => {
  const row = applicant();
  row.candidate.derived = {};
  row.candidate.languages = [{ name: "英语", level: "CET-6" }];
  row.candidate.location = "芜湖";
  row.summaryData = {};
  row.candidate.interviews = [{ category: "综合", recommendation: "建议录用", interviewer: "未分类面试官" }, { category: "文化", interviewer: "文化面试官", recommendation: "谨慎考虑" }];
  let result = summaryRow(row);
  assert.equal(result.englishLevel, "CET-6");
  assert.equal(result.base, "");
  assert.equal(result.schoolType, "");
  assert.equal(result.hrResult, "");
  assert.equal(result.professionalResult, "");
  assert.equal(result.cultureResult, "待定");
  row.candidate.languages = [{ name: "英语", level: "CET-6未通过" }];
  result = summaryRow(row);
  assert.equal(result.englishLevel, "");
  assert.equal(SUMMARY_COLUMNS[22].label, "Base地");
});
