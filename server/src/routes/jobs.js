// /api/jobs — CRUD + 列表过滤

import { whereByIdOrExternal } from "../lib/idLookup.js";
import {
  loadUserAccess,
  buildJobScopeWhere,
  hasModule,
} from "../lib/permissions.js";

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
  },
  additionalProperties: false,
};

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
}
