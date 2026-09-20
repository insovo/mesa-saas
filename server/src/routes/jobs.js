// /api/jobs — CRUD + 列表过滤

import { whereByIdOrExternal } from "../lib/idLookup.js";
import {
  loadUserAccess,
  buildJobScopeWhere,
  hasModule,
} from "../lib/permissions.js";
import { sanitizeJdFacts } from "../lib/jd/normalize.js";
import { draftEvaluationModel, validateEvaluationModel, listTemplates, EVAL_SCHEMA_VERSION } from "../lib/evaluation/templates.js";
import { extractJdFacts, suggestEvaluationWording, isKimiConfigured } from "../lib/kimi.js";
import { lintQuestion } from "../lib/evaluation/questions.js";
import { list as taxonomyList, KINDS as TAXONOMY_KINDS } from "../lib/taxonomy/index.js";
import { getEffectiveJson, SETTING_KEYS } from "../lib/settings.js";

const JOB_BODY = {
  type: "object",
  properties: {
    externalId: { type: "string", maxLength: 64 },
    title: { type: "string", minLength: 1, maxLength: 200 },
    dept: { type: "string", maxLength: 100, nullable: true },
    owner: { type: "string", maxLength: 100, nullable: true },
    openings: { type: "integer", minimum: 0, maximum: 999 },
    candidates: { type: "integer", minimum: 0, maximum: 9999 },
    level: { type: "string", maxLength: 50, nullable: true },
    location: { type: "string", maxLength: 100, nullable: true },
    urgency: { type: "string", enum: ["high", "mid", "low"] },
    status: { type: "string", maxLength: 50, nullable: true },
    description: { type: "string", maxLength: 20000, nullable: true },
    // V2 新字段(2026-05-24) — 跟 prisma schema add_v2_fields migration 对齐
    employment: { type: "string", maxLength: 50, nullable: true },
    salary: { type: "string", maxLength: 200, nullable: true },
    levelRange: { type: "string", maxLength: 50, nullable: true },
    yearsExpRange: { type: "string", maxLength: 50, nullable: true },
    educationRequirement: { type: "string", maxLength: 100, nullable: true },
    languageRequirement: { type: "string", maxLength: 200, nullable: true },
    publishedAt: { type: "string", format: "date-time", nullable: true },
    deadline: { type: "string", format: "date-time", nullable: true },
    responsibilities: { type: "array", items: { type: "string", maxLength: 500 }, maxItems: 20 },
    requirements: { type: "array", items: { type: "string", maxLength: 500 }, maxItems: 20 },
    nice: { type: "array", items: { type: "string", maxLength: 500 }, maxItems: 20 },
    benefits: { type: "array", items: { type: "string", maxLength: 200 }, maxItems: 20 },
    // 三层架构(2026-09-20):JD 事实层 + 评价模型层(结构由 lib/jd/normalize.js 与 lib/evaluation/templates.js 校验)
    jdFacts: { type: "object", nullable: true, additionalProperties: true },
    evaluationModel: { type: "object", nullable: true, additionalProperties: true },
  },
  additionalProperties: false,
};

// jdFacts / evaluationModel 入库前清洗与校验(两个 create/patch 共用)
function prepareStructured(data, reply) {
  if (Object.prototype.hasOwnProperty.call(data, "jdFacts") && data.jdFacts) {
    data.jdFacts = sanitizeJdFacts(data.jdFacts, "").facts;
    data.jdFactsVersion = data.jdFacts.schemaVersion;
  }
  if (Object.prototype.hasOwnProperty.call(data, "evaluationModel") && data.evaluationModel) {
    const v = validateEvaluationModel(data.evaluationModel);
    if (!v.ok) {
      reply.code(422).send({ error: "invalid_evaluation_model", message: v.errors.slice(0, 5).join(";"), errors: v.errors, warnings: v.warnings });
      return false;
    }
    data.evaluationModel = { ...data.evaluationModel, schemaVersion: EVAL_SCHEMA_VERSION, source: "manual", lintWarnings: v.warnings };
    data.evaluationModelVersion = { increment: 1 };
    data.evaluationModelUpdatedAt = new Date();
    data.evaluationModelSource = "manual";
  }
  return true;
}

const LIST_QUERY = {
  type: "object",
  properties: {
    q: { type: "string", maxLength: 100 },
    dept: { type: "string", maxLength: 100 },
    urgency: { type: "string", enum: ["high", "mid", "low"] },
    skip: { type: "integer", minimum: 0, default: 0 },
    take: { type: "integer", minimum: 1, maximum: 200, default: 100 },
  },
};

export default async function jobsRoutes(app) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", { schema: { querystring: LIST_QUERY } }, async (req) => {
    const { q, dept, urgency, skip = 0, take = 100 } = req.query;
    const where = {};
    if (dept) where.dept = dept;
    if (urgency) where.urgency = urgency;
    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { dept: { contains: q, mode: "insensitive" } },
        { owner: { contains: q, mode: "insensitive" } },
      ];
    }
    const scopeWhere = await buildJobScopeWhere(req);
    const finalWhere = scopeWhere ? { AND: [where, scopeWhere] } : where;
    const [items, total] = await Promise.all([
      app.prisma.job.findMany({
        where: finalWhere,
        orderBy: { updatedAt: "desc" },
        skip,
        take,
        include: { _count: { select: { linkedCandidates: true, employees: true } } },
      }),
      app.prisma.job.count({ where: finalWhere }),
    ]);
    return { items, total, skip, take };
  });

  app.get("/:id", async (req, reply) => {
    const scopeWhere = await buildJobScopeWhere(req);
    const idWhere = whereByIdOrExternal(req.params.id);
    const where = scopeWhere ? { AND: [idWhere, scopeWhere] } : idWhere;
    const job = await app.prisma.job.findFirst({
      where,
      include: { _count: { select: { linkedCandidates: true, employees: true } } },
    });
    if (!job) return reply.code(404).send({ error: "not_found" });
    return { job };
  });

  app.post("/", { schema: { body: { ...JOB_BODY, required: ["title"] } } }, async (req, reply) => {
    const access = await loadUserAccess(req);
    if (!hasModule(access, "job.create")) {
      return reply.code(403).send({ error: "forbidden", message: "无创建岗位权限" });
    }
    const data = { ...req.body };
    if (data.publishedAt) data.publishedAt = new Date(data.publishedAt);
    if (data.deadline) data.deadline = new Date(data.deadline);
    if (!prepareStructured(data, reply)) return;
    if (data.evaluationModelVersion) data.evaluationModelVersion = 1; // create 时不能用 increment
    const created = await app.prisma.job.create({ data });
    return reply.code(201).send({ job: created });
  });

  app.patch("/:id", { schema: { body: JOB_BODY } }, async (req, reply) => {
    const access = await loadUserAccess(req);
    if (!hasModule(access, "job.edit")) {
      return reply.code(403).send({ error: "forbidden", message: "无编辑岗位权限" });
    }
    // 数据范围校验
    const scopeWhere = await buildJobScopeWhere(req);
    if (scopeWhere) {
      const inScope = await app.prisma.job.findFirst({
        where: { AND: [{ id: req.params.id }, scopeWhere] },
        select: { id: true },
      });
      if (!inScope) return reply.code(404).send({ error: "not_found" });
    }
    const { id } = req.params;
    const data = { ...req.body };
    if (data.publishedAt) data.publishedAt = new Date(data.publishedAt);
    if (data.deadline) data.deadline = new Date(data.deadline);
    if (!prepareStructured(data, reply)) return;
    try {
      const updated = await app.prisma.job.update({ where: { id }, data });
      return { job: updated };
    } catch (err) {
      if (err.code === "P2025") return reply.code(404).send({ error: "not_found" });
      throw err;
    }
  });

  app.delete("/:id", async (req, reply) => {
    const access = await loadUserAccess(req);
    if (!hasModule(access, "job.delete")) {
      return reply.code(403).send({ error: "forbidden", message: "无删除岗位权限" });
    }
    const scopeWhere = await buildJobScopeWhere(req);
    if (scopeWhere) {
      const inScope = await app.prisma.job.findFirst({
        where: { AND: [{ id: req.params.id }, scopeWhere] },
        select: { id: true },
      });
      if (!inScope) return reply.code(404).send({ error: "not_found" });
    }
    const { id } = req.params;
    try {
      await app.prisma.job.delete({ where: { id } });
      return reply.code(204).send();
    } catch (err) {
      if (err.code === "P2025") return reply.code(404).send({ error: "not_found" });
      throw err;
    }
  });

  // ─── 三层架构:JD 结构化 / 评价模型 ───
  async function loadJobInScope(req, reply) {
    const scopeWhere = await buildJobScopeWhere(req);
    const idWhere = whereByIdOrExternal(req.params.id);
    const job = await app.prisma.job.findFirst({ where: scopeWhere ? { AND: [idWhere, scopeWhere] } : idWhere });
    if (!job) { reply.code(404).send({ error: "not_found" }); return null; }
    return job;
  }
  function jobText(job) {
    return [job.title, job.description, ...(job.responsibilities || []).map((r) => `职责:${r}`), ...(job.requirements || []).map((r) => `要求:${r}`), ...(job.nice || []).map((r) => `优先:${r}`),
      job.educationRequirement && `学历:${job.educationRequirement}`, job.yearsExpRange && `年限:${job.yearsExpRange}`, job.languageRequirement && `语言:${job.languageRequirement}`, job.location && `地点:${job.location}`, job.level && `职级:${job.level}`].filter(Boolean).join("\n");
  }

  // 已有 JD 文本 → jdFacts 草稿(不落库,前端确认后 PATCH)
  app.post("/:id/extract-facts", async (req, reply) => {
    const access = await loadUserAccess(req);
    if (!hasModule(access, "job.edit")) return reply.code(403).send({ error: "forbidden", message: "无编辑岗位权限" });
    const job = await loadJobInScope(req, reply);
    if (!job) return;
    if (!(await isKimiConfigured())) return reply.code(424).send({ error: "kimi_not_configured", message: "KIMI_API_KEY 未配置" });
    try {
      const r = await extractJdFacts({ text: jobText(job), model: req.body?.model });
      return { jdFacts: r.jdFacts, warnings: r.jdFactsWarnings, job: r.job };
    } catch (err) {
      req.log.error({ err, jobId: job.id }, "extractJdFacts failed");
      return reply.code(err.statusCode || 502).send({ error: err.code || "kimi_error", message: "JD 结构化失败,请稍后重试" });
    }
  });

  // jdFacts(body 或已存)→ evaluationModel 草稿(模板 + 可选 Kimi 措辞;不落库)
  app.post("/:id/evaluation-model/suggest", {
    schema: { body: { type: "object", properties: { jdFacts: { type: "object", nullable: true, additionalProperties: true }, templateId: { type: "string", maxLength: 60 }, wording: { type: "boolean" } }, additionalProperties: false } },
  }, async (req, reply) => {
    const access = await loadUserAccess(req);
    if (!hasModule(access, "job.edit")) return reply.code(403).send({ error: "forbidden", message: "无编辑岗位权限" });
    const job = await loadJobInScope(req, reply);
    if (!job) return;
    const facts = req.body?.jdFacts ? sanitizeJdFacts(req.body.jdFacts, "").facts : job.jdFacts;
    if (!facts) return reply.code(400).send({ error: "no_jd_facts", message: "请先结构化 JD(extract-facts)" });
    const model = draftEvaluationModel(facts, { templateId: req.body?.templateId || null, defaultWeights: await getEffectiveJson(SETTING_KEYS.EVAL_DEFAULT_WEIGHTS, null) });
    let wordingMeta = null;
    if (req.body?.wording !== false && (await isKimiConfigured())) {
      try {
        const { wording, meta } = await suggestEvaluationWording({ draft: model, jdFacts: facts });
        wordingMeta = meta;
        for (const r of model.requirements) {
          const w = wording[r.key];
          if (w && r.jev) {
            if (typeof w.instructions === "string") r.jev.instructions = w.instructions.slice(0, 600);
            if (r.jev.type === "score" && Array.isArray(w.criteria) && w.criteria.length >= 2) r.jev.criteria = w.criteria.slice(0, 10).map(String);
            if (r.jev.type === "noul" && w.criteria && typeof w.criteria === "object" && !Array.isArray(w.criteria)) r.jev.criteria = { true: String(w.criteria.true || ""), false: String(w.criteria.false || "") };
          }
        }
        model.source = "kimi_suggested";
      } catch (err) {
        req.log.warn({ err: err.message, jobId: job.id }, "suggestEvaluationWording failed (draft wording kept)");
      }
    }
    const lint = Object.fromEntries(model.requirements.filter((r) => r.jev).map((r) => [r.key, lintQuestion(r.jev)]).filter(([, w]) => w.length));
    return { evaluationModel: model, lint, wordingMeta };
  });

  app.get("/evaluation/templates", async () => ({ items: listTemplates() }));
  app.get("/taxonomy/:kind", async (req, reply) => {
    const { kind } = req.params;
    if (!TAXONOMY_KINDS.includes(kind)) return reply.code(404).send({ error: "unknown_taxonomy" });
    reply.header("Cache-Control", "private, max-age=600");
    return { kind, items: taxonomyList(kind).map(({ id, name, parent }) => ({ id, name, parent: parent || null })) };
  });
}
