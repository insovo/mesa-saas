// /api/performance/people               — 列表 / 新建人员
// /api/performance/evaluations          — 创建 / 列表
// /api/performance/evaluations/:id      — 详情 / patch / revoke / export
// /api/public/performance-eval/:token   — 公开: 读 / 草稿 / 提交

import { randomBytes, randomUUID } from "node:crypto";
import {
  SCORE_DIMENSIONS,
  SCORING_RUBRIC,
  RATING_APPLICATION,
  ACKNOWLEDGEMENT_BLURB,
  INFO_FIELDS,
  SUMMARY_FIELDS,
  TEMPLATE_VERSION,
  getTemplateHash,
  defaultScoresPayload,
  computeManagerTotal,
  computeSelfTotal,
  ratingFor,
  pipTriggeredFor,
  isValidPerfScore,
  EXPORT_LANGS,
  PERF_SOURCE,
  HIRED_STAGES,
  AUTHORITATIVE_LANG,
  PERF_SIGNATURE_PREFIX,
  PERF_SIGNATURE_MAX_BYTES,
} from "../lib/performanceEvalTemplate.js";
import {
  renderPerformanceToXlsx,
  attachmentHeaderForFilename,
} from "../lib/performanceEvalExport.js";
import {
  assertPage,
  buildEmployeeScopeWhere,
} from "../lib/permissions.js";
import {
  candidateToEmployeeData,
} from "../lib/candidateToEmployee.js";

function monthBucket() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function isPerfSignatureKey(key) {
  return typeof key === "string" && key.startsWith(PERF_SIGNATURE_PREFIX) && key.endsWith(".png");
}

async function loadSignaturePng(r2, key) {
  if (!r2 || !key || !isPerfSignatureKey(key)) return null;
  try {
    return await r2.getObjectBuffer(key);
  } catch {
    return null;
  }
}

async function signedUrlForKey(r2, key) {
  if (!r2 || !key || !isPerfSignatureKey(key)) return null;
  try {
    return await r2.presignGet({ key, expiresIn: 600 });
  } catch {
    return null;
  }
}

function tokenGen() {
  return randomBytes(24).toString("base64url");
}

function computeExpiresAt(duration) {
  if (!duration || duration === "forever") return null;
  const match = String(duration).match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!match) {
    throw Object.assign(new Error("invalid duration format"), {
      statusCode: 400,
      code: "invalid_duration",
    });
  }
  const n = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const secs = unit === "s" ? n : unit === "m" ? n * 60 : unit === "h" ? n * 3600 : n * 86400;
  const MIN = 60;
  const MAX = 30 * 86400;
  if (secs < MIN || secs > MAX) {
    throw Object.assign(new Error("duration must be 60s - 30d"), {
      statusCode: 400,
      code: "duration_out_of_range",
    });
  }
  return new Date(Date.now() + secs * 1000);
}

function recomputeDerived(scores) {
  const managerTotal = computeManagerTotal(scores);
  const selfTotal = computeSelfTotal(scores);
  return {
    managerTotal,
    selfTotal,
    rating: ratingFor(managerTotal),
    pipTriggered: pipTriggeredFor(managerTotal),
  };
}

function mergeScores(existing, patch, role) {
  const byKey = new Map((Array.isArray(existing) ? existing : defaultScoresPayload()).map((s) => [s.key, { ...s }]));
  for (const dim of SCORE_DIMENSIONS) {
    if (!byKey.has(dim.key)) {
      byKey.set(dim.key, { key: dim.key, weight: dim.weight, selfScore: null, managerScore: null, evidence: "" });
    }
  }
  if (!Array.isArray(patch)) return Array.from(byKey.values());
  for (const p of patch) {
    if (!p?.key || !byKey.has(p.key)) continue;
    const cur = byKey.get(p.key);
    if (p.weight != null && Number.isFinite(Number(p.weight))) cur.weight = Number(p.weight);
    if (role === "self" || role === "admin") {
      if ("selfScore" in p) {
        if (p.selfScore == null || p.selfScore === "") cur.selfScore = null;
        else if (isValidPerfScore(p.selfScore)) cur.selfScore = Number(p.selfScore);
      }
    }
    if (role === "manager" || role === "admin") {
      if ("managerScore" in p) {
        if (p.managerScore == null || p.managerScore === "") cur.managerScore = null;
        else if (isValidPerfScore(p.managerScore)) cur.managerScore = Number(p.managerScore);
      }
    }
    if ("evidence" in p && (role === "self" || role === "manager" || role === "admin")) {
      cur.evidence = p.evidence == null ? "" : String(p.evidence).slice(0, 200);
    }
  }
  return SCORE_DIMENSIONS.map((d) => byKey.get(d.key));
}

function adminShape(ev) {
  return {
    id: ev.id,
    employeeId: ev.employeeId,
    candidateId: ev.candidateId,
    selfToken: ev.selfToken,
    managerToken: ev.managerToken,
    status: ev.status,
    expiresAt: ev.expiresAt,
    employeeName: ev.employeeName,
    employeeNo: ev.employeeNo,
    position: ev.position,
    department: ev.department,
    level: ev.level,
    lineManager: ev.lineManager,
    reviewPeriod: ev.reviewPeriod,
    evalDate: ev.evalDate,
    scores: ev.scores,
    areasForImprovement: ev.areasForImprovement,
    developmentPlan: ev.developmentPlan,
    selfTotal: ev.selfTotal,
    managerTotal: ev.managerTotal,
    rating: ev.rating,
    pipTriggered: ev.pipTriggered,
    selfSubmittedAt: ev.selfSubmittedAt,
    managerSubmittedAt: ev.managerSubmittedAt,
    templateVersion: ev.templateVersion,
    createdBy: ev.createdBy,
    submittedAt: ev.submittedAt,
    exportedAt: ev.exportedAt,
    exportedCount: ev.exportedCount,
    viewCount: ev.viewCount,
    selfMaxEdits: ev.selfMaxEdits ?? null,
    managerMaxEdits: ev.managerMaxEdits ?? null,
    selfEditCount: ev.selfEditCount ?? 0,
    managerEditCount: ev.managerEditCount ?? 0,
    selfSignedAt: ev.selfSignedAt ?? null,
    managerSignedAt: ev.managerSignedAt ?? null,
    hasSelfSignature: !!ev.selfSignatureKey,
    hasManagerSignature: !!ev.managerSignatureKey,
    createdAt: ev.createdAt,
    updatedAt: ev.updatedAt,
  };
}

function parseMaxEdits(v) {
  if (v === undefined) return undefined;
  if (v === null || v === "" || v === "unlimited") return null;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 1 || n > 999) {
    throw Object.assign(new Error("可修改次数须为 1–999 或不限"), {
      statusCode: 400,
      code: "invalid_max_edits",
    });
  }
  return n;
}

function roleEditState(ev, role) {
  const max = role === "self" ? ev.selfMaxEdits : ev.managerMaxEdits;
  const used = role === "self" ? (ev.selfEditCount || 0) : (ev.managerEditCount || 0);
  const unlimited = max == null;
  const remaining = unlimited ? null : Math.max(0, max - used);
  const exhausted = !unlimited && used >= max;
  return { maxEdits: max ?? null, editCount: used, remaining, exhausted, unlimited };
}

async function publicShape(ev, role, r2 = null) {
  const scoresMap = new Map((ev.scores || []).map((s) => [s.key, s]));
  const scoresOut = SCORE_DIMENSIONS.map((dim) => {
    const item = scoresMap.get(dim.key) || {};
    return {
      key: dim.key,
      name: dim.name,
      nameEn: dim.nameEn,
      group: dim.group || null,
      subtitle: dim.subtitle || null,
      weight: item.weight ?? dim.weight,
      observation: dim.observation,
      selfScore: item.selfScore ?? null,
      managerScore: item.managerScore ?? null,
      evidence: item.evidence || "",
    };
  });

  const locked = ev.status === "submitted" || ev.status === "revoked";
  const roleDone = role === "self"
    ? !!ev.selfSubmittedAt
    : role === "manager"
      ? !!ev.managerSubmittedAt
      : false;
  const edits = roleEditState(ev, role);
  // 次数用尽 → 草稿不可再改，但仍可提交（若尚未提交）
  const readonly = locked || roleDone || edits.exhausted;
  const canSubmit = !locked && !roleDone;
  // 可提交期间允许签名（即使编辑次数用尽）
  const canSign = canSubmit;

  const [selfUrl, managerUrl] = await Promise.all([
    signedUrlForKey(r2, ev.selfSignatureKey),
    signedUrlForKey(r2, ev.managerSignatureKey),
  ]);

  return {
    evaluation: {
      employeeName: ev.employeeName,
      employeeNo: ev.employeeNo,
      position: ev.position,
      department: ev.department,
      level: ev.level,
      lineManager: ev.lineManager,
      reviewPeriod: ev.reviewPeriod,
      evalDate: ev.evalDate,
      scores: scoresOut,
      areasForImprovement: ev.areasForImprovement,
      developmentPlan: ev.developmentPlan,
      selfTotal: ev.selfTotal,
      managerTotal: ev.managerTotal,
      rating: ev.rating,
      pipTriggered: ev.pipTriggered,
      status: ev.status,
      selfSignedAt: ev.selfSignedAt,
      managerSignedAt: ev.managerSignedAt,
    },
    meta: {
      role,
      expiresAt: ev.expiresAt,
      templateVersion: ev.templateVersion,
      readonly,
      canSign,
      editsExhausted: edits.exhausted,
      maxEdits: edits.maxEdits,
      editCount: edits.editCount,
      editsRemaining: edits.remaining,
      canSubmit,
      canExport: ev.status === "submitted",
      selfSubmittedAt: ev.selfSubmittedAt,
      managerSubmittedAt: ev.managerSubmittedAt,
      submittedAt: ev.submittedAt,
      scoringRubric: SCORING_RUBRIC,
      ratingApplication: RATING_APPLICATION,
      acknowledgementBlurb: ACKNOWLEDGEMENT_BLURB,
      infoFields: INFO_FIELDS,
      summaryFields: SUMMARY_FIELDS,
      signatures: {
        self: {
          signed: !!ev.selfSignatureKey,
          signedAt: ev.selfSignedAt,
          url: selfUrl,
        },
        manager: {
          signed: !!ev.managerSignatureKey,
          signedAt: ev.managerSignedAt,
          url: managerUrl,
        },
        hr: {
          signed: false,
          note: "由管理员导出时嵌入电子章",
        },
      },
    },
  };
}

async function findByPublicToken(prisma, token) {
  const bySelf = await prisma.performanceEvaluation.findFirst({
    where: { selfToken: token, deletedAt: null },
  });
  if (bySelf) return { ev: bySelf, role: "self" };
  const byMgr = await prisma.performanceEvaluation.findFirst({
    where: { managerToken: token, deletedAt: null },
  });
  if (byMgr) return { ev: byMgr, role: "manager" };
  return null;
}

function assertNotExpired(ev) {
  if (ev.expiresAt && new Date(ev.expiresAt).getTime() < Date.now()) {
    throw Object.assign(new Error("评价链接已过期"), {
      statusCode: 410,
      code: "performance_eval_expired",
    });
  }
  if (ev.status === "revoked") {
    throw Object.assign(new Error("评价已撤销"), {
      statusCode: 410,
      code: "performance_eval_revoked",
    });
  }
}

async function ensureEmployeeForHiredCandidate(prisma, candidate) {
  const existing = await prisma.employee.findUnique({ where: { candidateId: candidate.id } });
  if (existing) return existing;
  const data = candidateToEmployeeData({ ...candidate, status: "已入职" });
  if (!data) return null;
  // 已存在且禁止回退 stage — create only
  return prisma.employee.create({ data });
}

export default async function performanceRoutes(app) {
  // ─── 登录态: 必须先 authenticate,否则 assertPage 无 req.user → 误报「账号已停用」
  app.register(async (admin) => {
    admin.addHook("preHandler", admin.authenticate);

  // ─── 人员列表 ─────────────────────────────────────────────────
  admin.get("/performance/people", {
    schema: {
      querystring: {
        type: "object",
        properties: {
          q: { type: "string" },
          dept: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const access = await assertPage(req, reply, "performance");
    if (!access) return;

    // 惰性补齐：已入职候选人缺 employee
    const hiredMissing = await app.prisma.candidate.findMany({
      where: {
        status: "已入职",
        employee: null,
      },
      include: { department: true },
      take: 50,
    });
    for (const c of hiredMissing) {
      try {
        await ensureEmployeeForHiredCandidate(app.prisma, c);
      } catch (err) {
        req.log.warn({ err: err?.message, candidateId: c.id }, "performance people: upsert employee failed");
      }
    }

    const scopeWhere = await buildEmployeeScopeWhere(req);
    const q = (req.query.q || "").trim();
    const dept = (req.query.dept || "").trim();

    const where = {
      AND: [
        scopeWhere || {},
        {
          OR: [
            { source: PERF_SOURCE },
            { stage: { in: [...HIRED_STAGES] } },
            { candidate: { status: "已入职" } },
          ],
        },
        dept ? { dept } : {},
        q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { phone: { contains: q, mode: "insensitive" } },
                { appliedFor: { contains: q, mode: "insensitive" } },
                { dept: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    };

    const items = await app.prisma.employee.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        candidate: { select: { id: true, status: true } },
        performanceEvaluations: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            reviewPeriod: true,
            rating: true,
            managerTotal: true,
            selfTotal: true,
            selfToken: true,
            managerToken: true,
            expiresAt: true,
            selfMaxEdits: true,
            managerMaxEdits: true,
            selfEditCount: true,
            managerEditCount: true,
            createdAt: true,
            submittedAt: true,
          },
        },
      },
      take: 500,
    });

    return {
      items: items.map((e) => {
        const { performanceEvaluations, ...rest } = e;
        return {
          ...rest,
          latestEvaluation: performanceEvaluations[0] || null,
        };
      }),
    };
  });

  // ─── 新建人员（默认试用期 + 绩效来源） ────────────────────────
  admin.post("/performance/people", {
    schema: {
      body: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 100 },
          position: { type: "string", maxLength: 120 },
          jobId: { type: "string", format: "uuid" },
          department: { type: "string", maxLength: 120 },
          departmentId: { type: "string", format: "uuid" },
          level: { type: "string", maxLength: 60 },
          lineManager: { type: "string", maxLength: 100 },
          employeeNo: { type: "string", maxLength: 60 },
          phone: { type: "string", maxLength: 40 },
          email: { type: "string", maxLength: 120 },
          gender: { type: "string", maxLength: 20 },
        },
      },
    },
  }, async (req, reply) => {
    const access = await assertPage(req, reply, "performance");
    if (!access) return;

    const body = req.body;
    let jobId = body.jobId || null;
    let appliedFor = body.position?.trim() || null;
    let dept = body.department?.trim() || null;
    const departmentId = body.departmentId || null;

    if (jobId) {
      const job = await app.prisma.job.findUnique({
        where: { id: jobId },
        select: { id: true, title: true, dept: true },
      });
      if (!job) return reply.code(422).send({ error: "invalid_job", message: "岗位不存在" });
      // 选中关联岗位时，标题以 JD 为准；部门可由 departmentId / 手输覆盖
      appliedFor = job.title;
      if (!dept && !departmentId && job.dept) dept = job.dept;
    }

    // Employee 仅有 dept 字符串字段（无 departmentId FK）——关联部门时写入名称
    if (departmentId) {
      const department = await app.prisma.department.findUnique({
        where: { id: departmentId },
        select: { id: true, name: true },
      });
      if (!department) {
        return reply.code(422).send({ error: "invalid_department", message: "部门不存在" });
      }
      dept = department.name;
    }

    const tags = ["绩效评价"];
    const created = await app.prisma.employee.create({
      data: {
        name: body.name.trim(),
        appliedFor,
        jobId,
        dept,
        level: body.level?.trim() || null,
        directManager: body.lineManager?.trim() || null,
        externalId: body.employeeNo?.trim() || null,
        phone: body.phone?.trim() || null,
        email: body.email?.trim() || null,
        gender: body.gender?.trim() || null,
        stage: "试用期",
        source: PERF_SOURCE,
        tags,
        actualHireDate: new Date(),
      },
    });
    return reply.code(201).send({ employee: created });
  });

  // ─── 创建评价 ─────────────────────────────────────────────────
  admin.post("/performance/evaluations", {
    schema: {
      body: {
        type: "object",
        required: ["employeeId", "reviewPeriod"],
        properties: {
          employeeId: { type: "string", format: "uuid" },
          reviewPeriod: { type: "string", minLength: 1, maxLength: 120 },
          lineManager: { type: "string", maxLength: 100 },
          duration: { type: "string" },
          evalDate: { type: "string" },
          selfMaxEdits: { type: ["integer", "null"] },
          managerMaxEdits: { type: ["integer", "null"] },
        },
      },
    },
  }, async (req, reply) => {
    const access = await assertPage(req, reply, "performance");
    if (!access) return;

    const emp = await app.prisma.employee.findUnique({
      where: { id: req.body.employeeId },
      include: { candidate: { select: { id: true, status: true } } },
    });
    if (!emp) return reply.code(404).send({ error: "not_found" });

    // scope check for non-admin
    if (!access.isAdmin) {
      const scopeWhere = await buildEmployeeScopeWhere(req);
      const ok = await app.prisma.employee.findFirst({
        where: { id: emp.id, ...(scopeWhere || {}) },
        select: { id: true },
      });
      if (!ok) return reply.code(404).send({ error: "not_found" });
    }

    let expiresAt = null;
    try {
      expiresAt = computeExpiresAt(req.body.duration || "30d");
    } catch (e) {
      return reply.code(e.statusCode || 400).send({ error: e.code || "bad_request", message: e.message });
    }

    let selfMaxEdits = null;
    let managerMaxEdits = null;
    try {
      if ("selfMaxEdits" in req.body) selfMaxEdits = parseMaxEdits(req.body.selfMaxEdits);
      if ("managerMaxEdits" in req.body) managerMaxEdits = parseMaxEdits(req.body.managerMaxEdits);
    } catch (e) {
      return reply.code(e.statusCode || 400).send({ error: e.code, message: e.message });
    }

    const evalDate = req.body.evalDate ? new Date(req.body.evalDate) : new Date();
    const created = await app.prisma.performanceEvaluation.create({
      data: {
        employeeId: emp.id,
        candidateId: emp.candidateId || null,
        selfToken: tokenGen(),
        managerToken: tokenGen(),
        status: "draft",
        expiresAt,
        employeeName: emp.name,
        employeeNo: emp.externalId || null,
        position: emp.appliedFor || null,
        department: emp.dept || null,
        level: emp.level || null,
        lineManager: req.body.lineManager?.trim() || emp.directManager || null,
        reviewPeriod: req.body.reviewPeriod.trim(),
        evalDate: Number.isNaN(evalDate.getTime()) ? new Date() : evalDate,
        scores: defaultScoresPayload(),
        templateVersion: TEMPLATE_VERSION,
        templateFileHash: getTemplateHash(AUTHORITATIVE_LANG),
        createdBy: access.userId,
        selfMaxEdits,
        managerMaxEdits,
      },
    });

    return reply.code(201).send({ evaluation: adminShape(created) });
  });

  admin.get("/performance/evaluations", {
    schema: {
      querystring: {
        type: "object",
        properties: {
          employeeId: { type: "string", format: "uuid" },
        },
      },
    },
  }, async (req, reply) => {
    const access = await assertPage(req, reply, "performance");
    if (!access) return;

    const where = {
      deletedAt: null,
      ...(req.query.employeeId ? { employeeId: req.query.employeeId } : {}),
    };
    if (!access.isAdmin) {
      const scopeWhere = await buildEmployeeScopeWhere(req);
      where.employee = scopeWhere || undefined;
    }

    const items = await app.prisma.performanceEvaluation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { items: items.map(adminShape) };
  });

  admin.get("/performance/evaluations/:id", async (req, reply) => {
    const access = await assertPage(req, reply, "performance");
    if (!access) return;
    const ev = await app.prisma.performanceEvaluation.findFirst({
      where: { id: req.params.id, deletedAt: null },
    });
    if (!ev) return reply.code(404).send({ error: "not_found" });
    return { evaluation: adminShape(ev) };
  });

  admin.patch("/performance/evaluations/:id", {
    schema: {
      body: {
        type: "object",
        properties: {
          employeeName: { type: "string" },
          employeeNo: { type: "string" },
          position: { type: "string" },
          department: { type: "string" },
          level: { type: "string" },
          lineManager: { type: "string" },
          reviewPeriod: { type: "string" },
          evalDate: { type: "string" },
          scores: { type: "array" },
          areasForImprovement: { type: "string" },
          developmentPlan: { type: "string" },
          duration: { type: "string" },
          regenerateSelfToken: { type: "boolean" },
          regenerateManagerToken: { type: "boolean" },
          status: { type: "string" },
          selfMaxEdits: { type: ["integer", "null"] },
          managerMaxEdits: { type: ["integer", "null"] },
          resetSelfEditCount: { type: "boolean" },
          resetManagerEditCount: { type: "boolean" },
        },
      },
    },
  }, async (req, reply) => {
    const access = await assertPage(req, reply, "performance");
    if (!access) return;

    const ev = await app.prisma.performanceEvaluation.findFirst({
      where: { id: req.params.id, deletedAt: null },
    });
    if (!ev) return reply.code(404).send({ error: "not_found" });

    const body = req.body || {};
    // admin 可退回 draft
    if (body.status === "draft" && access.isAdmin && ev.status === "submitted") {
      const updated = await app.prisma.performanceEvaluation.update({
        where: { id: ev.id },
        data: {
          status: "draft",
          submittedAt: null,
          managerSubmittedAt: null,
          selfSubmittedAt: null,
        },
      });
      return { evaluation: adminShape(updated) };
    }

    const applyEditLimitFields = (data) => {
      try {
        if ("selfMaxEdits" in body) data.selfMaxEdits = parseMaxEdits(body.selfMaxEdits);
        if ("managerMaxEdits" in body) data.managerMaxEdits = parseMaxEdits(body.managerMaxEdits);
      } catch (e) {
        throw e;
      }
      if (body.resetSelfEditCount || body.regenerateSelfToken) data.selfEditCount = 0;
      if (body.resetManagerEditCount || body.regenerateManagerToken) data.managerEditCount = 0;
    };

    if (ev.status === "submitted" || ev.status === "revoked") {
      // 仅允许轮换 token / 改 expires / 改次数上限
      const data = {};
      if (body.regenerateSelfToken) data.selfToken = tokenGen();
      if (body.regenerateManagerToken) data.managerToken = tokenGen();
      if (body.duration !== undefined) {
        try {
          data.expiresAt = computeExpiresAt(body.duration);
        } catch (e) {
          return reply.code(e.statusCode || 400).send({ error: e.code, message: e.message });
        }
      }
      try {
        applyEditLimitFields(data);
      } catch (e) {
        return reply.code(e.statusCode || 400).send({ error: e.code, message: e.message });
      }
      if (Object.keys(data).length === 0) {
        return reply.code(409).send({ error: "locked", message: "已提交的评价不可再改内容" });
      }
      const updated = await app.prisma.performanceEvaluation.update({ where: { id: ev.id }, data });
      return { evaluation: adminShape(updated) };
    }

    const data = {};
    for (const k of ["employeeName", "employeeNo", "position", "department", "level", "lineManager", "reviewPeriod", "areasForImprovement", "developmentPlan"]) {
      if (k in body) {
        if (body[k] == null) data[k] = null;
        else if (["areasForImprovement", "developmentPlan"].includes(k)) {
          data[k] = String(body[k]).slice(0, 500);
        } else {
          data[k] = String(body[k]);
        }
      }
    }
    if (body.evalDate !== undefined) {
      const d = body.evalDate ? new Date(body.evalDate) : null;
      data.evalDate = d && !Number.isNaN(d.getTime()) ? d : null;
    }
    if (body.duration !== undefined) {
      try {
        data.expiresAt = computeExpiresAt(body.duration);
      } catch (e) {
        return reply.code(e.statusCode || 400).send({ error: e.code, message: e.message });
      }
    }
    if (body.regenerateSelfToken) data.selfToken = tokenGen();
    if (body.regenerateManagerToken) data.managerToken = tokenGen();
    try {
      applyEditLimitFields(data);
    } catch (e) {
      return reply.code(e.statusCode || 400).send({ error: e.code, message: e.message });
    }
    if (Array.isArray(body.scores)) {
      data.scores = mergeScores(ev.scores, body.scores, "admin");
      Object.assign(data, recomputeDerived(data.scores));
    }

    const updated = await app.prisma.performanceEvaluation.update({ where: { id: ev.id }, data });
    return { evaluation: adminShape(updated) };
  });

  admin.post("/performance/evaluations/:id/revoke", async (req, reply) => {
    const access = await assertPage(req, reply, "performance");
    if (!access) return;
    const ev = await app.prisma.performanceEvaluation.findFirst({
      where: { id: req.params.id, deletedAt: null },
    });
    if (!ev) return reply.code(404).send({ error: "not_found" });
    const updated = await app.prisma.performanceEvaluation.update({
      where: { id: ev.id },
      data: {
        status: "revoked",
        revokedAt: new Date(),
        revokedBy: access.userId,
      },
    });
    return { evaluation: adminShape(updated) };
  });

  admin.get("/performance/evaluations/:id/export.xlsx", {
    schema: {
      querystring: {
        type: "object",
        properties: {
          lang: { type: "string" },
          embedHrSignature: { type: ["boolean", "string"] },
        },
      },
    },
  }, async (req, reply) => {
    const access = await assertPage(req, reply, "performance");
    if (!access) return;
    const ev = await app.prisma.performanceEvaluation.findFirst({
      where: { id: req.params.id, deletedAt: null },
    });
    if (!ev) return reply.code(404).send({ error: "not_found" });

    const lang = EXPORT_LANGS.includes(req.query.lang) ? req.query.lang : AUTHORITATIVE_LANG;
    const embedHr = req.query.embedHrSignature === true
      || req.query.embedHrSignature === "1"
      || req.query.embedHrSignature === "true";

    try {
      const images = {
        selfPng: await loadSignaturePng(app.r2, ev.selfSignatureKey),
        managerPng: await loadSignaturePng(app.r2, ev.managerSignatureKey),
        hrPng: null,
        hrSignedAt: null,
      };
      if (embedHr) {
        const me = await app.prisma.user.findUnique({
          where: { id: access.userId },
          select: { hrSignatureKey: true, hrSignatureUpdatedAt: true },
        });
        if (!me?.hrSignatureKey) {
          return reply.code(422).send({
            error: "hr_signature_missing",
            message: "请先上传 HR 电子章后再勾选嵌入",
          });
        }
        images.hrPng = await loadSignaturePng(app.r2, me.hrSignatureKey);
        images.hrSignedAt = me.hrSignatureUpdatedAt || new Date();
        if (!images.hrPng) {
          return reply.code(422).send({
            error: "hr_signature_missing",
            message: "HR 电子章文件不可用，请重新上传",
          });
        }
      }

      const { buffer, filename } = await renderPerformanceToXlsx(ev, lang, images);
      await app.prisma.performanceEvaluation.update({
        where: { id: ev.id },
        data: { exportedAt: new Date(), exportedCount: { increment: 1 } },
      });
      reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      reply.header("Content-Disposition", attachmentHeaderForFilename(filename));
      return reply.send(buffer);
    } catch (err) {
      req.log.error({ err }, "performance export failed");
      return reply.code(500).send({ error: "export_failed", message: err.message });
    }
  });

  // HR 电子章 — 挂在当前登录用户
  admin.get("/performance/hr-signature", async (req, reply) => {
    const access = await assertPage(req, reply, "performance");
    if (!access) return;
    const me = await app.prisma.user.findUnique({
      where: { id: access.userId },
      select: { hrSignatureKey: true, hrSignatureUpdatedAt: true },
    });
    const url = await signedUrlForKey(app.r2, me?.hrSignatureKey);
    return {
      hasSignature: !!me?.hrSignatureKey,
      updatedAt: me?.hrSignatureUpdatedAt || null,
      url,
    };
  });

  admin.post("/performance/hr-signature/presigned-url", {
    schema: {
      body: {
        type: "object",
        properties: {
          contentType: { type: "string" },
          expectedSize: { type: "integer", minimum: 1, maximum: PERF_SIGNATURE_MAX_BYTES },
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const access = await assertPage(req, reply, "performance");
    if (!access) return;
    if (!app.r2) return reply.code(503).send({ error: "r2_not_configured", message: "R2 未配置" });
    const contentType = req.body?.contentType || "image/png";
    if (contentType !== "image/png") {
      return reply.code(400).send({ error: "unsupported_type", message: "签名仅支持 PNG" });
    }
    const key = `${PERF_SIGNATURE_PREFIX}hr/${monthBucket()}/${randomUUID()}.png`;
    const uploadUrl = await app.r2.presignPut({
      key,
      contentType: "image/png",
      expiresIn: 900,
    });
    return { uploadUrl, key, expiresIn: 900 };
  });

  admin.put("/performance/hr-signature", {
    schema: {
      body: {
        type: "object",
        required: ["key"],
        properties: { key: { type: "string", maxLength: 500 } },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const access = await assertPage(req, reply, "performance");
    if (!access) return;
    const key = req.body.key;
    if (!isPerfSignatureKey(key) || !key.includes("/hr/")) {
      return reply.code(400).send({ error: "invalid_key", message: "非法签名 key" });
    }
    const me = await app.prisma.user.findUnique({
      where: { id: access.userId },
      select: { hrSignatureKey: true },
    });
    const updated = await app.prisma.user.update({
      where: { id: access.userId },
      data: { hrSignatureKey: key, hrSignatureUpdatedAt: new Date() },
      select: { hrSignatureKey: true, hrSignatureUpdatedAt: true },
    });
    if (me?.hrSignatureKey && me.hrSignatureKey !== key && app.r2) {
      try { await app.r2.deleteObject(me.hrSignatureKey); } catch { /* ignore */ }
    }
    const url = await signedUrlForKey(app.r2, updated.hrSignatureKey);
    return {
      hasSignature: true,
      updatedAt: updated.hrSignatureUpdatedAt,
      url,
    };
  });

  admin.delete("/performance/hr-signature", async (req, reply) => {
    const access = await assertPage(req, reply, "performance");
    if (!access) return;
    const me = await app.prisma.user.findUnique({
      where: { id: access.userId },
      select: { hrSignatureKey: true },
    });
    await app.prisma.user.update({
      where: { id: access.userId },
      data: { hrSignatureKey: null, hrSignatureUpdatedAt: null },
    });
    if (me?.hrSignatureKey && app.r2) {
      try { await app.r2.deleteObject(me.hrSignatureKey); } catch { /* ignore */ }
    }
    return { hasSignature: false, url: null, updatedAt: null };
  });

  }); // end authenticated scope

  // ─── 公开端 ───────────────────────────────────────────────────
  app.get("/public/performance-eval/:token", async (req, reply) => {
    const found = await findByPublicToken(app.prisma, req.params.token);
    if (!found) return reply.code(404).send({ error: "not_found" });
    try {
      assertNotExpired(found.ev);
    } catch (e) {
      return reply.code(e.statusCode).send({ error: e.code, message: e.message });
    }
    await app.prisma.performanceEvaluation.update({
      where: { id: found.ev.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    });
    return publicShape(found.ev, found.role, app.r2);
  });

  app.post("/public/performance-eval/:token/signature/presigned-url", {
    schema: {
      body: {
        type: "object",
        properties: {
          contentType: { type: "string" },
          expectedSize: { type: "integer", minimum: 1, maximum: PERF_SIGNATURE_MAX_BYTES },
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const found = await findByPublicToken(app.prisma, req.params.token);
    if (!found) return reply.code(404).send({ error: "not_found" });
    const { ev, role } = found;
    try {
      assertNotExpired(ev);
    } catch (e) {
      return reply.code(e.statusCode).send({ error: e.code, message: e.message });
    }
    if (ev.status === "submitted" || ev.status === "revoked") {
      return reply.code(409).send({ error: "locked", message: "评价已锁定，不可再签" });
    }
    if (role === "self" && ev.selfSubmittedAt) {
      return reply.code(409).send({ error: "locked", message: "自评已提交" });
    }
    if (role === "manager" && ev.managerSubmittedAt) {
      return reply.code(409).send({ error: "locked", message: "主管评价已提交" });
    }
    if (!app.r2) return reply.code(503).send({ error: "r2_not_configured", message: "R2 未配置" });
    const contentType = req.body?.contentType || "image/png";
    if (contentType !== "image/png") {
      return reply.code(400).send({ error: "unsupported_type", message: "签名仅支持 PNG" });
    }
    const key = `${PERF_SIGNATURE_PREFIX}${role}/${monthBucket()}/${randomUUID()}.png`;
    const uploadUrl = await app.r2.presignPut({
      key,
      contentType: "image/png",
      expiresIn: 900,
    });
    return { uploadUrl, key, expiresIn: 900 };
  });

  app.put("/public/performance-eval/:token/signature", {
    schema: {
      body: {
        type: "object",
        required: ["key"],
        properties: { key: { type: "string", maxLength: 500 } },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const found = await findByPublicToken(app.prisma, req.params.token);
    if (!found) return reply.code(404).send({ error: "not_found" });
    const { ev, role } = found;
    try {
      assertNotExpired(ev);
    } catch (e) {
      return reply.code(e.statusCode).send({ error: e.code, message: e.message });
    }
    if (ev.status === "submitted" || ev.status === "revoked") {
      return reply.code(409).send({ error: "locked", message: "评价已锁定，不可再签" });
    }
    if (role === "self" && ev.selfSubmittedAt) {
      return reply.code(409).send({ error: "locked", message: "自评已提交" });
    }
    if (role === "manager" && ev.managerSubmittedAt) {
      return reply.code(409).send({ error: "locked", message: "主管评价已提交" });
    }

    const key = req.body.key;
    const roleSeg = `/${role}/`;
    if (!isPerfSignatureKey(key) || !key.includes(roleSeg)) {
      return reply.code(400).send({ error: "invalid_key", message: "非法签名 key" });
    }

    const data = role === "self"
      ? { selfSignatureKey: key, selfSignedAt: new Date() }
      : { managerSignatureKey: key, managerSignedAt: new Date() };
    const prevKey = role === "self" ? ev.selfSignatureKey : ev.managerSignatureKey;

    const updated = await app.prisma.performanceEvaluation.update({
      where: { id: ev.id },
      data,
    });
    if (prevKey && prevKey !== key && app.r2) {
      try { await app.r2.deleteObject(prevKey); } catch { /* ignore */ }
    }
    return publicShape(updated, role, app.r2);
  });

  app.patch("/public/performance-eval/:token", {
    schema: {
      body: {
        type: "object",
        properties: {
          scores: { type: "array" },
          areasForImprovement: { type: "string" },
          developmentPlan: { type: "string" },
          lineManager: { type: "string" },
          employeeName: { type: "string" },
          employeeNo: { type: "string" },
          position: { type: "string" },
          department: { type: "string" },
          level: { type: "string" },
          reviewPeriod: { type: "string" },
          evalDate: { type: ["string", "null"] },
          autosave: { type: "boolean" },
        },
      },
    },
  }, async (req, reply) => {
    const found = await findByPublicToken(app.prisma, req.params.token);
    if (!found) return reply.code(404).send({ error: "not_found" });
    const { ev, role } = found;
    try {
      assertNotExpired(ev);
    } catch (e) {
      return reply.code(e.statusCode).send({ error: e.code, message: e.message });
    }
    if (ev.status === "submitted") {
      return reply.code(409).send({ error: "locked", message: "评价已提交，不可再改" });
    }
    if (role === "self" && ev.selfSubmittedAt) {
      return reply.code(409).send({ error: "locked", message: "自评已提交" });
    }
    if (role === "manager" && ev.managerSubmittedAt) {
      return reply.code(409).send({ error: "locked", message: "主管评价已提交" });
    }

    const edits = roleEditState(ev, role);
    if (edits.exhausted) {
      return reply.code(429).send({
        error: "edit_quota_exceeded",
        message: `可修改次数已用尽（${edits.editCount}/${edits.maxEdits}），请联系 HR 重置或重生成链接`,
        maxEdits: edits.maxEdits,
        editCount: edits.editCount,
      });
    }

    const body = req.body || {};
    const isAutosave = !!body.autosave;
    const data = {};
    if (Array.isArray(body.scores)) {
      data.scores = mergeScores(ev.scores, body.scores, role);
      Object.assign(data, recomputeDerived(data.scores));
    }
    // 目标·成果·发展：仅自评可写；主管只读
    if (role === "self") {
      for (const k of ["areasForImprovement", "developmentPlan"]) {
        if (k in body) data[k] = body[k] == null ? null : String(body[k]).slice(0, 500);
      }
      for (const k of ["employeeName", "employeeNo", "position", "department", "level", "reviewPeriod"]) {
        if (k in body) data[k] = body[k] == null ? null : String(body[k]).slice(0, 120);
      }
      if ("evalDate" in body) {
        const d = body.evalDate ? new Date(body.evalDate) : null;
        data.evalDate = d && !Number.isNaN(d.getTime()) ? d : null;
      }
    }
    // 直属主管：自评 / 主管均可填写
    if ("lineManager" in body) {
      data.lineManager = body.lineManager == null ? null : String(body.lineManager).slice(0, 100);
    }

    if (Object.keys(data).length === 0) return publicShape(ev, role, app.r2);

    // 30s 自动保存不占配额；手动保存草稿 / 提交前写入计数
    if (!isAutosave) {
      if (role === "self") data.selfEditCount = { increment: 1 };
      else data.managerEditCount = { increment: 1 };
    }

    const updated = await app.prisma.performanceEvaluation.update({
      where: { id: ev.id },
      data,
    });
    return publicShape(updated, role, app.r2);
  });

  app.post("/public/performance-eval/:token/submit", async (req, reply) => {
    const found = await findByPublicToken(app.prisma, req.params.token);
    if (!found) return reply.code(404).send({ error: "not_found" });
    const { ev, role } = found;
    try {
      assertNotExpired(ev);
    } catch (e) {
      return reply.code(e.statusCode).send({ error: e.code, message: e.message });
    }
    if (ev.status === "submitted") {
      return reply.code(409).send({ error: "already_submitted" });
    }

    const scores = Array.isArray(ev.scores) ? ev.scores : defaultScoresPayload();
    const byKey = new Map(scores.map((s) => [s.key, s]));

    if (role === "self") {
      if (!ev.selfSignatureKey) {
        return reply.code(422).send({
          error: "signature_required",
          message: "请先完成员工签字后再提交",
          field: "signature",
        });
      }
      for (const dim of SCORE_DIMENSIONS) {
        const sc = byKey.get(dim.key)?.selfScore;
        if (!isValidPerfScore(sc)) {
          return reply.code(422).send({
            error: "validation_failed",
            message: `请完成全部自评分数（缺：${dim.name}）`,
            field: dim.key,
          });
        }
      }
      // 基本信息：提交时必填
      const infoChecks = [
        { key: "employeeName", label: "姓名" },
        { key: "position", label: "岗位" },
        { key: "employeeNo", label: "工号" },
        { key: "department", label: "部门" },
        { key: "level", label: "职级" },
        { key: "reviewPeriod", label: "评价周期" },
      ];
      for (const f of infoChecks) {
        if (!String(ev[f.key] || "").trim()) {
          return reply.code(422).send({
            error: "validation_failed",
            message: `请填写「${f.label}」后再提交`,
            field: f.key,
          });
        }
      }
      if (!ev.evalDate) {
        return reply.code(422).send({
          error: "validation_failed",
          message: "请填写「评价日期」后再提交",
          field: "evalDate",
        });
      }
      // 目标·成果·发展：提交时必填（草稿保存不校验）
      const summaryChecks = [
        { key: "areasForImprovement", label: "不足及待提升部分" },
        { key: "developmentPlan", label: "改进与发展计划" },
      ];
      for (const f of summaryChecks) {
        if (!String(ev[f.key] || "").trim()) {
          return reply.code(422).send({
            error: "validation_failed",
            message: `请填写「${f.label}」后再提交`,
            field: f.key,
          });
        }
      }
      const derived = recomputeDerived(scores);
      const updated = await app.prisma.performanceEvaluation.update({
        where: { id: ev.id },
        data: {
          selfSubmittedAt: new Date(),
          status: ev.managerSubmittedAt ? "submitted" : "self_done",
          submittedAt: ev.managerSubmittedAt ? new Date() : null,
          ...derived,
        },
      });
      return publicShape(updated, role, app.r2);
    }

    // manager
    if (!ev.managerSignatureKey) {
      return reply.code(422).send({
        error: "signature_required",
        message: "请先完成主管签字后再提交",
        field: "signature",
      });
    }
    if (!String(ev.lineManager || "").trim()) {
      return reply.code(422).send({
        error: "validation_failed",
        message: "请填写「直属主管」后再提交",
        field: "lineManager",
      });
    }
    for (const dim of SCORE_DIMENSIONS) {
      const sc = byKey.get(dim.key)?.managerScore;
      if (!isValidPerfScore(sc)) {
        return reply.code(422).send({
          error: "validation_failed",
          message: `请完成全部主管评分（缺：${dim.name}）`,
          field: dim.key,
        });
      }
    }
    const derived = recomputeDerived(scores);
    const updated = await app.prisma.performanceEvaluation.update({
      where: { id: ev.id },
      data: {
        managerSubmittedAt: new Date(),
        status: "submitted",
        submittedAt: new Date(),
        ...derived,
      },
    });
    return publicShape(updated, role, app.r2);
  });

  app.get("/public/performance-eval/:token/export.xlsx", {
    schema: {
      querystring: {
        type: "object",
        properties: { lang: { type: "string" } },
      },
    },
  }, async (req, reply) => {
    const found = await findByPublicToken(app.prisma, req.params.token);
    if (!found) return reply.code(404).send({ error: "not_found" });
    const { ev } = found;
    if (ev.status !== "submitted") {
      return reply.code(409).send({ error: "not_submitted", message: "评价提交后才能导出" });
    }
    const lang = EXPORT_LANGS.includes(req.query.lang) ? req.query.lang : AUTHORITATIVE_LANG;
    const images = {
      selfPng: await loadSignaturePng(app.r2, ev.selfSignatureKey),
      managerPng: await loadSignaturePng(app.r2, ev.managerSignatureKey),
    };
    const { buffer, filename } = await renderPerformanceToXlsx(ev, lang, images);
    reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    reply.header("Content-Disposition", attachmentHeaderForFilename(filename));
    return reply.send(buffer);
  });
}
