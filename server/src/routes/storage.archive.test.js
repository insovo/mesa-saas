import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import storageRoutes from "./storage.js";
import { resumeFilename } from "../lib/resumeArchive.js";

const id = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function candidate(n, overrides = {}) { return { id: id(n), name: "测试姓名", major: "计算机", education: "硕士", school: "测试大学", attachment: `resumes/${n}.pdf`, ...overrides }; }
async function setup(t, { rows = [candidate(1)], role = "ADMIN", pages = [], modules = [], failing = [], missingR2 = false } = {}) {
  const app = Fastify();
  const reads = [];
  app.decorate("authenticate", async (req) => {
    req.user = { sub: id(99), role };
    req.permsCache = { access: { userId: id(99), role, isAdmin: role === "ADMIN", pageKeys: pages, moduleKeys: modules, departmentScopes: [], jobScopes: [] } };
  });
  app.decorate("prisma", {
    candidate: { findMany: async ({ where }) => {
      const selector = where.AND[0];
      return rows.filter((row) => (selector.id?.in || selector.campusApplicant?.is.id.in).includes(selector.id ? row.id : row.campusApplicant?.id)
        && (!where.AND[1]?.campusApplicant || row.campusApplicant)
        && (!where.AND[1]?.OR || row.ownerId === id(99)));
    } }, auditLog: { create: async () => ({}) },
  });
  app.decorate("r2", missingR2 ? null : { getObjectBuffer: async (key) => { reads.push(key); if (failing.includes(key)) throw new Error("unavailable"); return Buffer.from(`original:${key}`); } });
  await app.register(storageRoutes, { prefix: "/api/storage" });
  t.after(() => app.close());
  return { app, reads };
}

test("原始简历 ZIP 保留字节和格式、采用人工更正值、重名不覆盖并说明缺失文件", async (t) => {
  const rows = [candidate(1), candidate(2), candidate(3, { attachment: null }), candidate(4), candidate(5, {
    campusApplicant: { id: id(51), name: "解析旧名", major: "旧专业", degree: "本科", school: "旧学校", currentResumeVersionId: id(81), summaryData: { name: "人工姓名", major: "人工专业", degree: "博士", school: "人工学校" }, resumeVersions: [{ id: id(81), attachmentKey: "resumes/current.docx", filename: "原简历.docx" }] },
  })];
  const { app, reads } = await setup(t, { rows, failing: ["resumes/4.pdf"] });
  const response = await app.inject({ method: "POST", url: "/api/storage/resumes/archive", payload: { candidateIds: rows.map(({ id }) => id) } });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.headers["content-type"], "application/zip");
  const Zip = (await import("jszip")).default;
  const zip = await Zip.loadAsync(response.rawPayload);
  assert.deepEqual(Object.keys(zip.files), ["测试姓名-计算机-硕士-测试大学.pdf", "测试姓名-计算机-硕士-测试大学 (2).pdf", "人工姓名-人工专业-博士-人工学校.docx", "下载说明.txt"]);
  assert.equal(await zip.file("测试姓名-计算机-硕士-测试大学.pdf").async("string"), "original:resumes/1.pdf");
  assert.equal(await zip.file("人工姓名-人工专业-博士-人工学校.docx").async("string"), "original:resumes/current.docx");
  assert.match(await zip.file("下载说明.txt").async("string"), /未上传原始简历/);
  assert.match(await zip.file("下载说明.txt").async("string"), /暂时无法读取/);
  assert.equal(reads.includes("resumes/5.pdf"), false);
});

test("批量下载拒绝无附件权限、越权/已删人员、重复或空选择；全部缺失返回清晰错误", async (t) => {
  const denied = await setup(t, { role: "VIEWER", pages: ["candidates"] });
  const request = { method: "POST", url: "/api/storage/resumes/archive", payload: { candidateIds: [id(1)] } };
  assert.equal((await denied.app.inject(request)).statusCode, 403);
  assert.equal(denied.reads.length, 0);
  const scoped = await setup(t, { role: "RECRUITER", pages: ["candidates"], modules: ["candidate.attachments"] });
  assert.equal((await scoped.app.inject(request)).statusCode, 404);
  assert.equal(scoped.reads.length, 0);
  const missing = await setup(t, { rows: [candidate(1, { attachment: null })] });
  assert.equal((await missing.app.inject(request)).statusCode, 409);
  for (const candidateIds of [[], [id(1), id(1)], [id(88)]]) assert.ok([400, 404].includes((await missing.app.inject({ ...request, payload: { candidateIds } })).statusCode));
  const unavailable = await setup(t, { missingR2: true });
  assert.equal((await unavailable.app.inject(request)).statusCode, 503);
});

test("校招只读汇总下载需对应 tab 权限，候选人列表下载固定校招范围", async (t) => {
  const rows = [candidate(1, { campusApplicant: { id: id(51), summaryData: {} } })];
  const allowed = await setup(t, { rows, role: "CAMPUS_INTERVIEWER", pages: ["campus", "campus.summary", "candidates"], modules: ["candidate.attachments"] });
  assert.equal((await allowed.app.inject({ method: "POST", url: "/api/storage/resumes/archive", payload: { applicantIds: [id(51)] } })).statusCode, 200);
  assert.equal((await allowed.app.inject({ method: "POST", url: "/api/storage/resumes/archive", payload: { candidateIds: [id(1)] } })).statusCode, 200);
  const denied = await setup(t, { rows, role: "CAMPUS_INTERVIEWER", pages: ["campus", "campus.jobs"], modules: ["candidate.attachments"] });
  assert.equal((await denied.app.inject({ method: "POST", url: "/api/storage/resumes/archive", payload: { applicantIds: [id(51)] } })).statusCode, 403);
});

test("简历命名清理路径字符、补齐未填写资料并控制 UTF-8 文件名长度", () => {
  const used = new Set();
  const result = resumeFilename(candidate(1, { name: "../../测试", major: "\n", school: "大学".repeat(100), education: null }), used);
  assert.equal(result.name.includes("/"), false);
  assert.match(result.name, /未填写专业-未填写学历/);
  assert.ok(Buffer.byteLength(result.name) < 255);
});
