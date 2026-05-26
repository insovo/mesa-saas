// /api/candidates — 首个 CRUD 闭环(demo.md 1.3.3)
// 所有路由都需 JWT 鉴权。

import { whereByIdOrExternal } from "../lib/idLookup.js";
import { withDerivedCandidate as withDerived } from "../lib/derived.js";

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
    departmentId: { type: "string", format: "uuid", nullable: true },
    // V2 新字段(2026-05-24) — 跟 prisma schema add_v2_fields migration 对齐
    aiSuggestedTags: { type: "array", items: { type: "string", maxLength: 60 }, maxItems: 12 },
    insights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["up", "down"] },
          text: { type: "string", maxLength: 300 },
        },
        additionalProperties: false,
      },
      maxItems: 20,
    },
    matchedFor: { type: "array", items: { type: "string", maxLength: 80 }, maxItems: 12 },
    againstFor: { type: "array", items: { type: "string", maxLength: 80 }, maxItems: 12 },
    profileCompletion: { type: "integer", minimum: 0, maximum: 100, nullable: true },
    languages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", maxLength: 50 },
          level: { type: "string", maxLength: 50 },
        },
        additionalProperties: false,
      },
      maxItems: 10,
    },
    documents: {
      type: "object",
      properties: {
        resume: { type: "array", maxItems: 20 },
        materials: { type: "array", maxItems: 30 },
        portfolio: { type: "array", maxItems: 20 },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

const LIST_QUERY = {
  type: "object",
  properties: {
    q: { type: "string", maxLength: 100 },
    status: { type: "string", maxLength: 50 },
    appliedFor: { type: "string", maxLength: 200 },
    // ownerId: 传 "me" 会自动替换为当前 user 的 id;传 uuid 直接 filter;不传 = 不过滤
    // 用于 Upload 页拉"我接收到的"候选人(本地手动上传 + 公开链接上传都会 ownerId=me)
    ownerId: { type: "string", maxLength: 50 },
    // orderBy: createdAt | updatedAt(默认 updatedAt 保持向后兼容)
    orderBy: { type: "string", enum: ["createdAt", "updatedAt"], default: "updatedAt" },
    skip: { type: "integer", minimum: 0, default: 0 },
    take: { type: "integer", minimum: 1, maximum: 200, default: 50 },
  },
};

export default async function candidatesRoutes(app) {
  app.addHook("preHandler", app.authenticate);

  // List + filter + search
  app.get("/", { schema: { querystring: LIST_QUERY } }, async (req) => {
    const { q, status, appliedFor, ownerId, orderBy = "updatedAt", skip = 0, take = 50 } = req.query;
    const where = {};
    if (status) where.status = status;
    if (appliedFor) where.appliedFor = appliedFor;
    if (ownerId === "me") where.ownerId = req.user.sub;
    else if (ownerId) where.ownerId = ownerId;
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
        orderBy: { [orderBy]: "desc" },
        skip,
        take,
        include: {
          job: { select: { id: true, title: true, dept: true } },
          department: { select: { id: true, name: true, code: true } },
        },
      }),
      app.prisma.candidate.count({ where }),
    ]);
    return { items: items.map(withDerived), total, skip, take };
  });

  // Detail
  app.get("/:id", async (req, reply) => {
    const candidate = await app.prisma.candidate.findFirst({
      where: whereByIdOrExternal(req.params.id),
      include: {
        job: { select: { id: true, title: true, dept: true } },
        department: { select: { id: true, name: true, code: true } },
      },
    });
    if (!candidate) return reply.code(404).send({ error: "not_found" });
    return { candidate: withDerived(candidate) };
  });

  // Create
  app.post("/", { schema: { body: { ...CANDIDATE_BODY, required: ["name"] } } }, async (req, reply) => {
    const ownerId = req.user.sub;
    const data = { ...req.body, ownerId };
    if (data.pushedAt) data.pushedAt = new Date(data.pushedAt);
    // profileCompletion 是 derived,不接受外部写入
    delete data.profileCompletion;
    const created = await app.prisma.candidate.create({ data });
    return reply.code(201).send({ candidate: withDerived(created) });
  });

  // Update
  app.patch("/:id", { schema: { body: CANDIDATE_BODY } }, async (req, reply) => {
    const { id } = req.params;
    const data = { ...req.body };
    if (data.pushedAt) data.pushedAt = new Date(data.pushedAt);
    delete data.profileCompletion;
    try {
      const updated = await app.prisma.candidate.update({
        where: { id },
        data,
      });
      return { candidate: withDerived(updated) };
    } catch (err) {
      if (err.code === "P2025") return reply.code(404).send({ error: "not_found" });
      throw err;
    }
  });

  // ─── 备注 ──────────────────────────────────────────────────
  app.get("/:id/notes", async (req) => {
    const notes = await app.prisma.candidateNote.findMany({
      where: { candidateId: req.params.id },
      orderBy: { createdAt: "desc" },
    });
    return { notes };
  });

  app.post("/:id/notes", {
    schema: {
      body: {
        type: "object",
        required: ["content"],
        properties: { content: { type: "string", minLength: 1, maxLength: 5000 } },
      },
    },
  }, async (req, reply) => {
    const note = await app.prisma.candidateNote.create({
      data: {
        candidateId: req.params.id,
        content: req.body.content,
        authorId: req.user.sub,
        authorName: req.user.email,
      },
    });
    return reply.code(201).send({ note });
  });

  app.delete("/:id/notes/:noteId", async (req, reply) => {
    try {
      await app.prisma.candidateNote.delete({ where: { id: req.params.noteId } });
      return reply.code(204).send();
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
