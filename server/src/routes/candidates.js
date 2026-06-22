// /api/candidates — 首个 CRUD 闭环(demo.md 1.3.3)
// 所有路由都需 JWT 鉴权。

import { whereByIdOrExternal } from "../lib/idLookup.js";
import { withDerivedCandidate as withDerived } from "../lib/derived.js";
import { toDisplayName, resolveNoteAuthorNames } from "../lib/displayName.js";
import {
  loadUserAccess,
  buildCandidateScopeWhere,
  assertCandidateAccess,
  filterCandidateByModules,
  hasModule,
} from "../lib/permissions.js";
import {
  candidateToEmployeeData,
  mapStatusToStage,
  cleanupEmployeeOnJobChange,
} from "../lib/candidateToEmployee.js";

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

  // List + filter + search — 接入数据范围
  app.get("/", { schema: { querystring: LIST_QUERY } }, async (req) => {
    const access = await loadUserAccess(req);
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

    const scopeWhere = await buildCandidateScopeWhere(req);
    const finalWhere = scopeWhere ? { AND: [where, scopeWhere] } : where;

    const [items, total] = await Promise.all([
      app.prisma.candidate.findMany({
        where: finalWhere,
        orderBy: { [orderBy]: "desc" },
        skip,
        take,
        include: {
          job: { select: { id: true, title: true, dept: true } },
          department: { select: { id: true, name: true, code: true } },
        },
      }),
      app.prisma.candidate.count({ where: finalWhere }),
    ]);
    const shaped = items
      .map(withDerived)
      .map((c) => filterCandidateByModules(c, access));
    return { items: shaped, total, skip, take };
  });

  // Detail — 接入数据范围 + 模块字段剥离
  app.get("/:id", async (req, reply) => {
    const access = await loadUserAccess(req);
    const scopeWhere = await buildCandidateScopeWhere(req);
    const idWhere = whereByIdOrExternal(req.params.id);
    const where = scopeWhere ? { AND: [idWhere, scopeWhere] } : idWhere;
    const candidate = await app.prisma.candidate.findFirst({
      where,
      include: {
        job: { select: { id: true, title: true, dept: true } },
        department: { select: { id: true, name: true, code: true } },
        interviews: { orderBy: { scheduledAt: "desc" } },
      },
    });
    if (!candidate) return reply.code(404).send({ error: "not_found" });
    return { candidate: filterCandidateByModules(withDerived(candidate), access) };
  });

  // Create — 普通用户也能创建,但 ownerId 强制为本人
  app.post("/", { schema: { body: { ...CANDIDATE_BODY, required: ["name"] } } }, async (req, reply) => {
    const ownerId = req.user.sub;
    const data = { ...req.body, ownerId };
    if (data.pushedAt) data.pushedAt = new Date(data.pushedAt);
    delete data.profileCompletion;
    const created = await app.prisma.candidate.create({ data });
    return reply.code(201).send({ candidate: withDerived(created) });
  });

  // Update — 需 candidate.edit + 数据范围内
  app.patch("/:id", { schema: { body: CANDIDATE_BODY } }, async (req, reply) => {
    const access = await loadUserAccess(req);
    if (!hasModule(access, "candidate.edit")) {
      return reply.code(403).send({ error: "forbidden", message: "无编辑权限" });
    }
    const accessCheck = await assertCandidateAccess(req, reply, req.params.id);
    if (!accessCheck) return;

    const { id } = req.params;
    const data = { ...req.body };
    if (data.pushedAt) data.pushedAt = new Date(data.pushedAt);
    delete data.profileCompletion;

    // 切 JD 自动同步:先 fetch before, 若 jobId 真的换了且调用方没明确设 status,
    // 强制 status="待筛选"。前端 confirmSwitchJob 切 JD 后会调 PATCH 持久化 jobId,
    // 命中此分支;入职管理那边的 employee 也跟着按 cleanupEmployeeOnJobChange 清理。
    let jobIdChanged = false;
    if (data.jobId !== undefined) {
      const before = await app.prisma.candidate.findUnique({
        where: { id },
        select: { jobId: true },
      });
      if (before && before.jobId !== data.jobId) {
        jobIdChanged = true;
        if (data.status === undefined) data.status = "待筛选";
      }
    }

    try {
      // 事务化:update candidate + 切 JD 清理 employee + status 触发的自动转化,
      // 必须原子完成,避免 candidate 已改但 employee 未同步导致 NewHire 数据脱钩(坑#40)。
      const updated = await app.prisma.$transaction(async (tx) => {
        const u = await tx.candidate.update({
          where: { id },
          data,
          include: { department: true },
        });

        // 切 JD 后清理 employee(只清「待入职」未推进的, 已推进的保留);best-effort
        if (jobIdChanged) {
          await cleanupEmployeeOnJobChange(tx, u.id, app.log);
        }

        // 自动转化:status 切到「待入职」/「已入职」时自动创建 employee。
        // 仅在 employee 不存在时 create,已存在则**不动 stage**(尊重 HR 已推进的进度),
        // 避免把推进到「入职当天/试用期」的人回退到「待入职」。
        // 失败会回滚整个事务 → status 与 employee 保持一致,不再静默脱钩。
        const nextStage = mapStatusToStage(u.status);
        if (nextStage) {
          const existing = await tx.employee.findUnique({
            where: { candidateId: u.id },
          });
          if (!existing) {
            const empData = candidateToEmployeeData(u);
            if (empData) await tx.employee.create({ data: empData });
          }
        }
        return u;
      });
      return { candidate: withDerived(updated) };
    } catch (err) {
      if (err.code === "P2025") return reply.code(404).send({ error: "not_found" });
      throw err;
    }
  });

  // ─── 备注 ─────────────────────────────────────────────
  app.get("/:id/notes", async (req, reply) => {
    const access = await loadUserAccess(req);
    if (!hasModule(access, "candidate.notes")) {
      return reply.code(403).send({ error: "forbidden", message: "无备注模块权限" });
    }
    const ok = await assertCandidateAccess(req, reply, req.params.id);
    if (!ok) return;
    const notes = await app.prisma.candidateNote.findMany({
      where: { candidateId: req.params.id },
      orderBy: { createdAt: "desc" },
    });
    return { notes: await resolveNoteAuthorNames(app.prisma, notes) };
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
    const access = await loadUserAccess(req);
    if (!hasModule(access, "candidate.notes")) {
      return reply.code(403).send({ error: "forbidden", message: "无备注模块权限" });
    }
    const ok = await assertCandidateAccess(req, reply, req.params.id);
    if (!ok) return;
    const author = await app.prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { name: true, email: true },
    });
    const note = await app.prisma.candidateNote.create({
      data: {
        candidateId: req.params.id,
        content: req.body.content,
        authorId: req.user.sub,
        authorName: toDisplayName(author?.name, author?.email || req.user.email),
      },
    });
    return reply.code(201).send({ note });
  });

  app.delete("/:id/notes/:noteId", async (req, reply) => {
    const access = await loadUserAccess(req);
    if (!hasModule(access, "candidate.notes")) {
      return reply.code(403).send({ error: "forbidden", message: "无备注模块权限" });
    }
    const ok = await assertCandidateAccess(req, reply, req.params.id);
    if (!ok) return;
    try {
      await app.prisma.candidateNote.delete({ where: { id: req.params.noteId } });
      return reply.code(204).send();
    } catch (err) {
      if (err.code === "P2025") return reply.code(404).send({ error: "not_found" });
      throw err;
    }
  });

  // Delete — 需 candidate.delete + 数据范围内
  app.delete("/:id", async (req, reply) => {
    const access = await loadUserAccess(req);
    if (!hasModule(access, "candidate.delete")) {
      return reply.code(403).send({ error: "forbidden", message: "无删除权限" });
    }
    const ok = await assertCandidateAccess(req, reply, req.params.id);
    if (!ok) return;
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
