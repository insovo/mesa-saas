// /api/jobs — CRUD + 列表过滤

import { whereByIdOrExternal } from "../lib/idLookup.js";

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
    const [items, total] = await Promise.all([
      app.prisma.job.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take }),
      app.prisma.job.count({ where }),
    ]);
    return { items, total, skip, take };
  });

  app.get("/:id", async (req, reply) => {
    const job = await app.prisma.job.findFirst({ where: whereByIdOrExternal(req.params.id) });
    if (!job) return reply.code(404).send({ error: "not_found" });
    return { job };
  });

  app.post("/", { schema: { body: { ...JOB_BODY, required: ["title"] } } }, async (req, reply) => {
    const created = await app.prisma.job.create({ data: req.body });
    return reply.code(201).send({ job: created });
  });

  app.patch("/:id", { schema: { body: JOB_BODY } }, async (req, reply) => {
    const { id } = req.params;
    try {
      const updated = await app.prisma.job.update({ where: { id }, data: req.body });
      return { job: updated };
    } catch (err) {
      if (err.code === "P2025") return reply.code(404).send({ error: "not_found" });
      throw err;
    }
  });

  app.delete("/:id", async (req, reply) => {
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
