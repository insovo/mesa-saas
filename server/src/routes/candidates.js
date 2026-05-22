// /api/candidates — 首个 CRUD 闭环(demo.md 1.3.3)
// 所有路由都需 JWT 鉴权。

import { whereByIdOrExternal } from "../lib/idLookup.js";

const CANDIDATE_BODY = {
  type: "object",
  properties: {
    externalId: { type: "string", maxLength: 64 },
    name: { type: "string", minLength: 1, maxLength: 100 },
    gender: { type: "string", maxLength: 16, nullable: true },
    animal: { type: "string", maxLength: 32, nullable: true },
    avatar: { type: "string", maxLength: 500, nullable: true },
    education: { type: "string", maxLength: 50, nullable: true },
    school: { type: "string", maxLength: 200, nullable: true },
    major: { type: "string", maxLength: 200, nullable: true },
    age: { type: "integer", minimum: 0, maximum: 120, nullable: true },
    location: { type: "string", maxLength: 100, nullable: true },
    yearsExp: { type: "integer", minimum: 0, maximum: 80, nullable: true },
    phone: { type: "string", maxLength: 50, nullable: true },
    email: { type: "string", maxLength: 200, nullable: true },
    appliedFor: { type: "string", maxLength: 200, nullable: true },
    jdMatch: { type: "integer", minimum: 0, maximum: 100, nullable: true },
    status: { type: "string", maxLength: 50, nullable: true },
    source: { type: "string", maxLength: 50, nullable: true },
    pushedAt: { type: "string", format: "date-time", nullable: true },
    parser: { type: "string", maxLength: 50, nullable: true },
    parserConfidence: { type: "integer", minimum: 0, maximum: 100, nullable: true },
    tags: { type: "array", items: { type: "string" } },
    skills: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    highlights: { type: "array", items: { type: "string" } },
    experience: { type: "array" },
    educationHistory: { type: "array" },
    attachment: { type: "string", maxLength: 500, nullable: true },
    aiSummary: { type: "string", maxLength: 50000, nullable: true },
    jobId: { type: "string", format: "uuid", nullable: true },
  },
  additionalProperties: false,
};

const LIST_QUERY = {
  type: "object",
  properties: {
    q: { type: "string", maxLength: 100 },
    status: { type: "string", maxLength: 50 },
    appliedFor: { type: "string", maxLength: 200 },
    skip: { type: "integer", minimum: 0, default: 0 },
    take: { type: "integer", minimum: 1, maximum: 200, default: 50 },
  },
};

export default async function candidatesRoutes(app) {
  app.addHook("preHandler", app.authenticate);

  // List + filter + search
  app.get("/", { schema: { querystring: LIST_QUERY } }, async (req) => {
    const { q, status, appliedFor, skip = 0, take = 50 } = req.query;
    const where = {};
    if (status) where.status = status;
    if (appliedFor) where.appliedFor = appliedFor;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { school: { contains: q, mode: "insensitive" } },
        { major: { contains: q, mode: "insensitive" } },
        { appliedFor: { contains: q, mode: "insensitive" } },
      ];
    }
    const [items, total] = await Promise.all([
      app.prisma.candidate.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take,
      }),
      app.prisma.candidate.count({ where }),
    ]);
    return { items, total, skip, take };
  });

  // Detail
  app.get("/:id", async (req, reply) => {
    const candidate = await app.prisma.candidate.findFirst({ where: whereByIdOrExternal(req.params.id) });
    if (!candidate) return reply.code(404).send({ error: "not_found" });
    return { candidate };
  });

  // Create
  app.post("/", { schema: { body: { ...CANDIDATE_BODY, required: ["name"] } } }, async (req, reply) => {
    const ownerId = req.user.sub;
    const data = { ...req.body, ownerId };
    if (data.pushedAt) data.pushedAt = new Date(data.pushedAt);
    const created = await app.prisma.candidate.create({ data });
    return reply.code(201).send({ candidate: created });
  });

  // Update
  app.patch("/:id", { schema: { body: CANDIDATE_BODY } }, async (req, reply) => {
    const { id } = req.params;
    const data = { ...req.body };
    if (data.pushedAt) data.pushedAt = new Date(data.pushedAt);
    try {
      const updated = await app.prisma.candidate.update({
        where: { id },
        data,
      });
      return { candidate: updated };
    } catch (err) {
      if (err.code === "P2025") return reply.code(404).send({ error: "not_found" });
      throw err;
    }
  });

  // Delete
  app.delete("/:id", async (req, reply) => {
    const { id } = req.params;
    try {
      await app.prisma.candidate.delete({ where: { id } });
      return reply.code(204).send();
    } catch (err) {
      if (err.code === "P2025") return reply.code(404).send({ error: "not_found" });
      throw err;
    }
  });
}
