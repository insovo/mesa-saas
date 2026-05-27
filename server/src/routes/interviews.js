// /api/interviews — CRUD + 日期范围过滤

import {
  buildCandidateScopeWhere,
  buildJobScopeWhere,
  loadUserAccess,
} from "../lib/permissions.js";
import { shouldAutoAdvanceToInterviewing } from "../lib/candidateToEmployee.js";

const INTERVIEW_BODY = {
  type: "object",
  properties: {
    externalId: { type: "string", maxLength: 64 },
    candidateId: { type: "string", format: "uuid", nullable: true },
    candidateName: { type: "string", maxLength: 100, nullable: true },
    jobId: { type: "string", format: "uuid", nullable: true },
    jobTitle: { type: "string", maxLength: 200, nullable: true },
    round: { type: "string", maxLength: 50, nullable: true },
    mode: { type: "string", maxLength: 50, nullable: true },
    status: { type: "string", maxLength: 50, nullable: true },
    recommendation: { type: "string", maxLength: 50, nullable: true },
    scheduledAt: { type: "string", format: "date-time", nullable: true },
    interviewer: { type: "string", maxLength: 100, nullable: true },
    notes: { type: "string", maxLength: 2000, nullable: true },
    // V2 新字段(2026-05-24)
    category: { type: "string", maxLength: 50, nullable: true },
    link: { type: "string", maxLength: 500, nullable: true },
    managers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", maxLength: 100 },
          role: { type: "string", maxLength: 100 },
          animal: { type: "string", maxLength: 32 },
          avatar: { type: "string", maxLength: 500 },
        },
        additionalProperties: false,
      },
      maxItems: 10,
    },
    interviewers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", maxLength: 100 },
          role: { type: "string", maxLength: 100 },
          animal: { type: "string", maxLength: 32 },
          avatar: { type: "string", maxLength: 500 },
        },
        additionalProperties: false,
      },
      maxItems: 10,
    },
  },
  additionalProperties: false,
};

const LIST_QUERY = {
  type: "object",
  properties: {
    status: { type: "string", maxLength: 50 },
    candidateId: { type: "string", format: "uuid" },
    jobId: { type: "string", format: "uuid" },
    from: { type: "string", format: "date-time" },
    to: { type: "string", format: "date-time" },
    skip: { type: "integer", minimum: 0, default: 0 },
    take: { type: "integer", minimum: 1, maximum: 200, default: 100 },
  },
};

export default async function interviewsRoutes(app) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", { schema: { querystring: LIST_QUERY } }, async (req) => {
    const { status, candidateId, jobId, from, to, skip = 0, take = 100 } = req.query;
    const where = {};
    if (status) where.status = status;
    if (candidateId) where.candidateId = candidateId;
    if (jobId) where.jobId = jobId;
    if (from || to) {
      where.scheduledAt = {};
      if (from) where.scheduledAt.gte = new Date(from);
      if (to) where.scheduledAt.lte = new Date(to);
    }
    // 范围过滤:Interview 关联 candidate/job;普通用户只能看到自己 scope 内的 candidate 或 job 上的面试
    const access = await loadUserAccess(req);
    if (!access.isAdmin) {
      const candScope = await buildCandidateScopeWhere(req);
      const jobScope = await buildJobScopeWhere(req);
      const scopeFilters = [];
      if (candScope) scopeFilters.push({ candidate: candScope });
      if (jobScope) scopeFilters.push({ job: jobScope });
      // 没绑 candidate / job 的孤立 interview 普通用户看不见(防数据泄露)
      where.AND = [
        ...(where.AND || []),
        scopeFilters.length > 0 ? { OR: scopeFilters } : { id: { in: [] } },
      ];
    }
    const [items, total] = await Promise.all([
      app.prisma.interview.findMany({
        where,
        orderBy: { scheduledAt: "asc" },
        skip,
        take,
        include: {
          candidate: { select: { id: true, name: true } },
          job: { select: { id: true, title: true } },
        },
      }),
      app.prisma.interview.count({ where }),
    ]);
    return { items, total, skip, take };
  });

  app.post("/", { schema: { body: INTERVIEW_BODY } }, async (req, reply) => {
    const data = { ...req.body };
    if (data.scheduledAt) data.scheduledAt = new Date(data.scheduledAt);
    const created = await app.prisma.interview.create({ data });

    // 自动推进 candidate.status:面试已安排,如果还在「面试前」阶段 → 推到「面试中」
    // 已经在「面试中/待定中/待入职/已入职/已淘汰」的不动(尊重 HR 手工设的状态)
    if (created.candidateId) {
      try {
        const cand = await app.prisma.candidate.findUnique({
          where: { id: created.candidateId },
          select: { status: true },
        });
        if (cand && shouldAutoAdvanceToInterviewing(cand.status)) {
          await app.prisma.candidate.update({
            where: { id: created.candidateId },
            data: { status: "面试中" },
          });
          app.log.info({ candidateId: created.candidateId, interviewId: created.id }, "auto-advanced status to 面试中");
        }
      } catch (err) {
        app.log.warn({ err: err?.message, candidateId: created.candidateId }, "auto-advance status failed");
      }
    }
    return reply.code(201).send({ interview: created });
  });

  app.patch("/:id", { schema: { body: INTERVIEW_BODY } }, async (req, reply) => {
    const { id } = req.params;
    const data = { ...req.body };
    if (data.scheduledAt) data.scheduledAt = new Date(data.scheduledAt);
    try {
      const updated = await app.prisma.interview.update({ where: { id }, data });
      return { interview: updated };
    } catch (err) {
      if (err.code === "P2025") return reply.code(404).send({ error: "not_found" });
      throw err;
    }
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = req.params;
    try {
      await app.prisma.interview.delete({ where: { id } });
      return reply.code(204).send();
    } catch (err) {
      if (err.code === "P2025") return reply.code(404).send({ error: "not_found" });
      throw err;
    }
  });
}
