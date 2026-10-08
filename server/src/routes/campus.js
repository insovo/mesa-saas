// /api/campus — 校招模块后台(Phase 0):专场 / 专场岗位 / 台账 / 学生 / 投递 / 设置
// 学生端公开路由在 routes/campus-public.js(Phase 1)。设计:校招模块/校招模块设计规划.html §6 §8.2
//
// 权限:
//   页面 pageKey "campus"(看台账、推进投递、登记学生、代传简历)
//   模块 "campus.manage"(专场 / 岗位配置 / 设置)· "campus.export"(含联系方式的台账导出)
//   联系方式字段受 "candidate.contact" 控制,无权限时打码

import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import { whereByIdOrExternal } from "../lib/idLookup.js";
import { assertPage, loadUserAccess, hasModule, buildJobScopeWhere } from "../lib/permissions.js";
import { buildCampusJobModel } from "../lib/campus/jobModel.js";
import { writeLog } from "../lib/audit.js";
import { attachmentHeaderForFilename } from "../lib/interviewEvalExport.js";
import { SETTING_KEYS, getEffective, getEffectiveNumber, getEffectiveJson, setOne } from "../lib/settings.js";
import { startExtraction, cancelExtraction, gateStatus } from "../lib/campus/extract.js";
import { startMatchRun, cancelMatchRun, runShape } from "../lib/campus/match.js";
import { getTask } from "../lib/parseTaskStore.js";
import { ensureCandidate, createVersionTx, createApplicationTx } from "../lib/campus/service.js";
import { mapStatusToStage, candidateToEmployeeData } from "../lib/candidateToEmployee.js";
import { randomBytes } from "node:crypto";
import {
  JOB_KINDS, APP_STATUS, ALLOWED_RESUME_MIME, RESUME_MAX_SIZE,
  maskPhone, maskEmail, normalizeSlug, normalizePhone, uploadsAllowed,
} from "../lib/campus/shared.js";

const SESSION_BODY = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1, maxLength: 120 },
    slug: { type: "string", maxLength: 48 },
    school: { type: ["string", "null"], maxLength: 120 },
    location: { type: ["string", "null"], maxLength: 200 },
    startsAt: { type: ["string", "null"], format: "date-time" },
    endsAt: { type: ["string", "null"], format: "date-time" },
    heroTitle: { type: ["string", "null"], maxLength: 120 },
    heroSubtitle: { type: ["string", "null"], maxLength: 300 },
    bannerKey: { type: ["string", "null"], maxLength: 500 },
    maxApplyJobs: { type: "integer", minimum: 1, maximum: 20 },
    maxResumeUploads: { type: "integer", minimum: 1, maximum: 20 },
    scoreFloor: { type: "integer", minimum: 0, maximum: 100 },
    matchEnabled: { type: "boolean" },
    showSalaryOnsite: { type: "boolean" },
    showSalaryReferral: { type: "boolean" },
  },
  additionalProperties: false,
};

const SESSION_JOB_BODY = {
  type: "object",
  properties: {
    jobId: { type: "string", format: "uuid" },
    kind: { type: "string", enum: JOB_KINDS },
    matchEnabled: { type: "boolean" },
    sortOrder: { type: "integer", minimum: 0, maximum: 9999 },
  },
  additionalProperties: false,
};

// 校招 JD 字段:岗位 tab 新建 / 编辑用,是 routes/jobs.js JOB_BODY 的校招子集(不开放 jdFacts / evaluationModel / urgency 等)
const CAMPUS_JOB_FIELDS = {
  title: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S" },
  dept: { type: ["string", "null"], maxLength: 100 },
  owner: { type: ["string", "null"], maxLength: 100 },
  location: { type: ["string", "null"], maxLength: 100 },
  employment: { type: ["string", "null"], maxLength: 50 },
  salary: { type: ["string", "null"], maxLength: 200 },
  educationRequirement: { type: ["string", "null"], maxLength: 100 },
  languageRequirement: { type: ["string", "null"], maxLength: 200 },
  openings: { type: "integer", minimum: 0, maximum: 999 },
  deadline: { type: ["string", "null"], format: "date-time" },
  description: { type: ["string", "null"], maxLength: 20000 },
  responsibilities: { type: "array", items: { type: "string", maxLength: 500 }, maxItems: 20 },
  requirements: { type: "array", items: { type: "string", maxLength: 500 }, maxItems: 20 },
  nice: { type: "array", items: { type: "string", maxLength: 500 }, maxItems: 20 },
  benefits: { type: "array", items: { type: "string", maxLength: 200 }, maxItems: 20 },
};
const CAMPUS_JOB_CREATE_BODY = {
  type: "object",
  required: ["title"],
  properties: { ...CAMPUS_JOB_FIELDS, kind: { type: "string", enum: JOB_KINDS }, matchEnabled: { type: "boolean" } },
  additionalProperties: false,
};
const CAMPUS_JOB_PATCH_BODY = { type: "object", minProperties: 1, properties: CAMPUS_JOB_FIELDS, additionalProperties: false };
const CAMPUS_JOB_BULK_FIELDS = Object.fromEntries(
  ["dept", "location", "employment", "salary", "educationRequirement", "languageRequirement", "openings", "deadline"].map((key) => [key, CAMPUS_JOB_FIELDS[key]]),
);
const CAMPUS_JOB_APPEND_FIELDS = {
  niceAdd: { type: "array", minItems: 1, maxItems: 20, items: { type: "string", maxLength: 500, pattern: "\\S" } },
  benefitsAdd: { type: "array", minItems: 1, maxItems: 20, items: { type: "string", maxLength: 200, pattern: "\\S" } },
};
const CAMPUS_JOB_BULK_BODY = {
  type: "object", required: ["ids", "changes"], additionalProperties: false,
  properties: {
    ids: { type: "array", minItems: 1, maxItems: 200, uniqueItems: true, items: { type: "string", format: "uuid" } },
    changes: { type: "object", minProperties: 1, additionalProperties: false, properties: { kind: { type: "string", enum: JOB_KINDS }, ...CAMPUS_JOB_BULK_FIELDS, ...CAMPUS_JOB_APPEND_FIELDS } },
  },
};
function jobData(body) {
  const data = Object.fromEntries(Object.entries(body).map(([key, value]) => [key,
    typeof value === "string" ? value.trim() : Array.isArray(value) ? value.map((item) => item.trim()).filter(Boolean) : value,
  ]));
  if (data.deadline) data.deadline = new Date(data.deadline);
  return data;
}

const RESUME_BODY = {
  type: "object",
  required: ["key"],
  properties: {
    key: { type: "string", minLength: 1, maxLength: 500 },
    filename: { type: ["string", "null"], maxLength: 200 },
    size: { type: ["integer", "null"], minimum: 0, maximum: RESUME_MAX_SIZE },
    contentType: { type: ["string", "null"], maxLength: 100 },
    sha256: { type: ["string", "null"], maxLength: 64 },
  },
  additionalProperties: false,
};

const APPLICANT_FIELDS = {
  name: { type: ["string", "null"], maxLength: 100 },
  phone: { type: "string", minLength: 5, maxLength: 30 },
  email: { type: ["string", "null"], maxLength: 200 },
  wechat: { type: ["string", "null"], maxLength: 100 },
  school: { type: ["string", "null"], maxLength: 120 },
  major: { type: ["string", "null"], maxLength: 120 },
  degree: { type: ["string", "null"], maxLength: 50 },
  gradYear: { type: ["integer", "null"], minimum: 1990, maximum: 2100 },
};

const APPLICANT_CREATE_BODY = {
  type: "object",
  required: ["phone"],
  properties: {
    ...APPLICANT_FIELDS,
    jobIds: { type: "array", items: { type: "string", format: "uuid" }, maxItems: 20 },
    resume: { ...RESUME_BODY, type: ["object", "null"] },
    contactConfirmed: { type: "boolean" },
  },
  additionalProperties: false,
};

const APPLICANT_PATCH_BODY = {
  type: "object",
  properties: {
    ...APPLICANT_FIELDS,
    extraUploads: { type: "integer", minimum: 0, maximum: 50 },
    contactConfirmed: { type: "boolean" },
  },
  additionalProperties: false,
};

const APPLICATION_PATCH_BODY = {
  type: "object",
  properties: {
    status: { type: "string", enum: APP_STATUS },
    note: { type: ["string", "null"], maxLength: 2000 },
    advance: { type: "boolean" }, // status=passed 时为 true → 候选人状态置「待入职」,自动进入入职管理
  },
  additionalProperties: false,
};

const SETTINGS_BODY = {
  type: "object",
  properties: {
    matchConcurrency: { type: "integer", minimum: 1, maximum: 20 },
    authJwtTtl: { type: "string", pattern: "^\\d+[hd]$" },
    contactHints: { type: "array", items: { type: "string", maxLength: 120 }, maxItems: 5 },
    pcUploadEnabled: { type: "boolean" },
  },
  additionalProperties: false,
};

// JD 全字段随专场岗位一起下发(岗位 tab 编辑 / 预览用);sessionsCount = 该 Job 被多少个专场引用
const jobSelect = {
  id: true, title: true, dept: true, owner: true, location: true, employment: true, salary: true, status: true, openings: true,
  educationRequirement: true, languageRequirement: true, yearsExpRange: true, deadline: true,
  description: true, responsibilities: true, requirements: true, nice: true, benefits: true,
  jdFacts: true, evaluationModel: true, evaluationModelUpdatedAt: true, updatedAt: true,
  _count: { select: { campusSessionJobs: true } },
};
function jobShape(j) {
  if (!j) return null;
  return {
    id: j.id, title: j.title, dept: j.dept, owner: j.owner, location: j.location, employment: j.employment, salary: j.salary, status: j.status, openings: j.openings,
    educationRequirement: j.educationRequirement, languageRequirement: j.languageRequirement, yearsExpRange: j.yearsExpRange, deadline: j.deadline,
    description: j.description, responsibilities: j.responsibilities || [], requirements: j.requirements || [], nice: j.nice || [], benefits: j.benefits || [],
    hasJdFacts: !!j.jdFacts, hasEvaluationModel: !!j.evaluationModel, evaluationModelUpdatedAt: j.evaluationModelUpdatedAt, updatedAt: j.updatedAt,
    sessionsCount: j._count?.campusSessionJobs ?? undefined,
  };
}
function sessionJobShape(sj) {
  return { id: sj.id, sessionId: sj.sessionId, jobId: sj.jobId, kind: sj.kind, matchEnabled: sj.matchEnabled, sortOrder: sj.sortOrder, job: jobShape(sj.job), applications: sj._count?.applications ?? undefined };
}
function versionShape(v) {
  return { id: v.id, version: v.version, filename: v.filename, size: v.size, contentType: v.contentType, parseStatus: v.parseStatus, parseError: v.parseError, uploadedAt: v.uploadedAt, uploadedBy: v.uploadedBy, resumeParseId: v.resumeParseId };
}
function applicationShape(a) {
  return {
    id: a.id, jobId: a.jobId, sessionJobId: a.sessionJobId, source: a.source, status: a.status, statusChangedAt: a.statusChangedAt, note: a.note,
    scoreRaw: a.scoreRaw, scoreShown: a.scoreShown, resumeVersionId: a.resumeVersionId, createdAt: a.createdAt,
    kind: a.sessionJob?.kind, job: a.sessionJob?.job ? { id: a.sessionJob.job.id, title: a.sessionJob.job.title, dept: a.sessionJob.job.dept } : null,
  };
}
function applicantShape(a, { showContact, versionsAllowed }) {
  const current = a.resumeVersions?.find((v) => v.id === a.currentResumeVersionId) || a.resumeVersions?.[0] || null;
  return {
    id: a.id, sessionId: a.sessionId, candidateId: a.candidateId,
    name: a.name || a.candidate?.name || null,
    phone: showContact ? a.phone : maskPhone(a.phone),
    email: showContact ? a.email : maskEmail(a.email),
    wechat: showContact ? a.wechat : (a.wechat ? "***" : null),
    emailVerifiedAt: a.emailVerifiedAt, contactConfirmedAt: a.contactConfirmedAt,
    school: a.school || a.candidate?.school || null, major: a.major || a.candidate?.major || null,
    degree: a.degree || a.candidate?.education || null, gradYear: a.gradYear,
    resumeUploadCount: a.resumeUploadCount, extraUploads: a.extraUploads, uploadsAllowed: versionsAllowed,
    currentResumeVersionId: a.currentResumeVersionId,
    currentVersion: current ? versionShape(current) : null,
    versions: (a.resumeVersions || []).map(versionShape),
    applications: (a.applications || []).map(applicationShape),
    registeredBy: a.registeredBy, lastSeenAt: a.lastSeenAt, createdAt: a.createdAt, updatedAt: a.updatedAt,
    candidate: a.candidate ? { id: a.candidate.id, status: a.candidate.status, classification: a.candidate.classification, jdMatch: a.candidate.jdMatch, parsingStartedAt: a.candidate.parsingStartedAt, profileCompletion: a.candidate.profileCompletion } : null,
  };
}

const applicantInclude = {
  candidate: { select: { id: true, name: true, school: true, major: true, education: true, status: true, classification: true, jdMatch: true, parsingStartedAt: true, profileCompletion: true } },
  resumeVersions: { orderBy: { version: "desc" } },
  applications: { include: { sessionJob: { include: { job: { select: { id: true, title: true, dept: true } } } } }, orderBy: { createdAt: "asc" } },
};

export default async function campusRoutes(app, { generateJobModel = buildCampusJobModel } = {}) {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", async (req, reply) => {
    const access = await assertPage(req, reply, "campus");
    if (!access) return reply;
  });

  async function requireManage(req, reply) {
    const access = await loadUserAccess(req);
    if (!hasModule(access, "campus.manage")) {
      reply.code(403).send({ error: "forbidden", message: "无校招专场配置权限" });
      return null;
    }
    return access;
  }
  async function loadSession(req, reply, id) {
    const s = await app.prisma.campusSession.findFirst({ where: whereByIdOrExternal(id) });
    if (!s) { reply.code(404).send({ error: "not_found" }); return null; }
    return s;
  }
  async function loadApplicant(req, reply, id) {
    const a = await app.prisma.campusApplicant.findUnique({ where: { id }, include: { ...applicantInclude, session: true } });
    if (!a) { reply.code(404).send({ error: "not_found" }); return null; }
    return a;
  }
  async function concurrency() { return getEffectiveNumber(SETTING_KEYS.CAMPUS_MATCH_CONCURRENCY, 3); }

  // ─── 专场 ────────────────────────────────────────────────────────
  app.get("/sessions", async () => {
    const items = await app.prisma.campusSession.findMany({
      orderBy: [{ status: "asc" }, { startsAt: "desc" }, { createdAt: "desc" }],
      include: { _count: { select: { jobs: true, applicants: true } } },
    });
    const appCounts = await app.prisma.campusApplication.groupBy({ by: ["sessionJobId"], _count: { _all: true } });
    const sjs = await app.prisma.campusSessionJob.findMany({ select: { id: true, sessionId: true } });
    const bySession = new Map();
    const sjToSession = new Map(sjs.map((s) => [s.id, s.sessionId]));
    for (const c of appCounts) {
      const sid = sjToSession.get(c.sessionJobId);
      if (sid) bySession.set(sid, (bySession.get(sid) || 0) + c._count._all);
    }
    // live 排最前
    const order = { live: 0, draft: 1, closed: 2 };
    items.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
    return { items: items.map((s) => ({ ...s, jobsCount: s._count.jobs, applicantsCount: s._count.applicants, applicationsCount: bySession.get(s.id) || 0, _count: undefined })) };
  });

  app.post("/sessions", { schema: { body: { ...SESSION_BODY, required: ["name"] } } }, async (req, reply) => {
    if (!(await requireManage(req, reply))) return;
    const b = req.body;
    const data = { ...b, slug: normalizeSlug(b.slug || ""), createdBy: req.user.sub };
    if (data.startsAt) data.startsAt = new Date(data.startsAt);
    if (data.endsAt) data.endsAt = new Date(data.endsAt);
    const exists = await app.prisma.campusSession.findUnique({ where: { slug: data.slug } });
    if (exists) return reply.code(409).send({ error: "campus_slug_taken", message: "slug 已被占用" });
    const created = await app.prisma.campusSession.create({ data });
    await writeLog(app.prisma, { req, action: "campus.session.create", entityType: "CampusSession", entityId: created.id, diff: { name: created.name, slug: created.slug } });
    return reply.code(201).send({ session: created });
  });

  app.get("/sessions/:id", async (req, reply) => {
    const s = await loadSession(req, reply, req.params.id);
    if (!s) return;
    const jobs = await app.prisma.campusSessionJob.findMany({ where: { sessionId: s.id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { job: { select: jobSelect }, _count: { select: { applications: true } } } });
    const [applicantsCount, applicationsCount] = await Promise.all([
      app.prisma.campusApplicant.count({ where: { sessionId: s.id } }),
      app.prisma.campusApplication.count({ where: { sessionJob: { sessionId: s.id } } }),
    ]);
    return { session: { ...s, applicantsCount, applicationsCount }, jobs: jobs.map(sessionJobShape) };
  });

  app.patch("/sessions/:id", { schema: { body: SESSION_BODY } }, async (req, reply) => {
    if (!(await requireManage(req, reply))) return;
    const s = await loadSession(req, reply, req.params.id);
    if (!s) return;
    const data = { ...req.body };
    if (data.slug !== undefined) {
      data.slug = normalizeSlug(data.slug);
      const dup = await app.prisma.campusSession.findFirst({ where: { slug: data.slug, NOT: { id: s.id } } });
      if (dup) return reply.code(409).send({ error: "campus_slug_taken", message: "slug 已被占用" });
    }
    if (data.startsAt !== undefined) data.startsAt = data.startsAt ? new Date(data.startsAt) : null;
    if (data.endsAt !== undefined) data.endsAt = data.endsAt ? new Date(data.endsAt) : null;
    const updated = await app.prisma.campusSession.update({ where: { id: s.id }, data });
    await writeLog(app.prisma, { req, action: "campus.session.update", entityType: "CampusSession", entityId: s.id, diff: data });
    return { session: updated };
  });

  app.delete("/sessions/:id", async (req, reply) => {
    if (!(await requireManage(req, reply))) return;
    const s = await loadSession(req, reply, req.params.id);
    if (!s) return;
    const n = await app.prisma.campusApplicant.count({ where: { sessionId: s.id } });
    if (n > 0) return reply.code(409).send({ error: "campus_session_not_empty", message: `专场已有 ${n} 位学生,不能删除(可改为「结束」)` });
    await app.prisma.campusSession.delete({ where: { id: s.id } });
    await writeLog(app.prisma, { req, action: "campus.session.delete", entityType: "CampusSession", entityId: s.id, diff: { name: s.name } });
    return reply.code(204).send();
  });

  // 上线互斥:同一时刻只允许一个 live
  app.post("/sessions/:id/live", async (req, reply) => {
    if (!(await requireManage(req, reply))) return;
    const s = await loadSession(req, reply, req.params.id);
    if (!s) return;
    const updated = await app.prisma.$transaction(async (tx) => {
      await tx.campusSession.updateMany({ where: { status: "live", NOT: { id: s.id } }, data: { status: "closed" } });
      return tx.campusSession.update({ where: { id: s.id }, data: { status: "live" } });
    });
    await writeLog(app.prisma, { req, action: "campus.session.live", entityType: "CampusSession", entityId: s.id });
    return { session: updated };
  });
  app.post("/sessions/:id/close", async (req, reply) => {
    if (!(await requireManage(req, reply))) return;
    const s = await loadSession(req, reply, req.params.id);
    if (!s) return;
    const updated = await app.prisma.campusSession.update({ where: { id: s.id }, data: { status: "closed" } });
    await writeLog(app.prisma, { req, action: "campus.session.close", entityType: "CampusSession", entityId: s.id });
    return { session: updated };
  });
  // 草稿:结束后想再编辑 / 重新上线前回到草稿
  app.post("/sessions/:id/draft", async (req, reply) => {
    if (!(await requireManage(req, reply))) return;
    const s = await loadSession(req, reply, req.params.id);
    if (!s) return;
    const updated = await app.prisma.campusSession.update({ where: { id: s.id }, data: { status: "draft" } });
    return { session: updated };
  });

  // ─── 电脑端上传兜底链接:按需创建公开上传链接(UploadShareLink,永久 / 不限份数)并绑定到专场 ──
  app.post("/sessions/:id/pc-upload-link", { schema: { body: { type: "object", properties: { regenerate: { type: "boolean" } }, additionalProperties: false } } }, async (req, reply) => {
    if (!(await requireManage(req, reply))) return;
    const s = await loadSession(req, reply, req.params.id);
    if (!s) return;
    let link = s.pcUploadToken ? await app.prisma.uploadShareLink.findUnique({ where: { token: s.pcUploadToken } }) : null;
    if (!link || req.body?.regenerate) {
      if (link) await app.prisma.uploadShareLink.delete({ where: { id: link.id } }).catch(() => {});
      link = await app.prisma.uploadShareLink.create({ data: { token: randomBytes(24).toString("base64url"), defaultSource: `校招·${s.name}·电脑上传`, note: `${s.name}:请上传 PDF / Word 简历,并在备注里写明你的手机号,方便与现场登记合并。`, expiresAt: null, maxUploads: null, createdBy: s.createdBy || req.user.sub } });
      await app.prisma.campusSession.update({ where: { id: s.id }, data: { pcUploadToken: link.token } });
      await writeLog(app.prisma, { req, action: "campus.session.pc_upload_link", entityType: "CampusSession", entityId: s.id });
    }
    return { token: link.token, path: `/upload/${link.token}`, uploadCount: link.uploadCount };
  });

  // ─── 专场岗位 ────────────────────────────────────────────────────
  app.get("/sessions/:id/jobs", async (req, reply) => {
    const s = await loadSession(req, reply, req.params.id);
    if (!s) return;
    const jobs = await app.prisma.campusSessionJob.findMany({ where: { sessionId: s.id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { job: { select: jobSelect }, _count: { select: { applications: true } } } });
    return { items: jobs.map(sessionJobShape) };
  });

  app.post("/sessions/:id/jobs", { schema: { body: { ...SESSION_JOB_BODY, required: ["jobId"] } } }, async (req, reply) => {
    if (!(await requireManage(req, reply))) return;
    const s = await loadSession(req, reply, req.params.id);
    if (!s) return;
    const scopeWhere = await buildJobScopeWhere(req);
    const job = await app.prisma.job.findFirst({ where: scopeWhere ? { AND: [{ id: req.body.jobId }, scopeWhere] } : { id: req.body.jobId }, select: { id: true } });
    if (!job) return reply.code(404).send({ error: "job_not_found", message: "岗位不存在" });
    const dup = await app.prisma.campusSessionJob.findUnique({ where: { sessionId_jobId: { sessionId: s.id, jobId: job.id } } });
    if (dup) return reply.code(409).send({ error: "campus_job_exists", message: "该岗位已在专场中" });
    const max = await app.prisma.campusSessionJob.aggregate({ where: { sessionId: s.id }, _max: { sortOrder: true } });
    const created = await app.prisma.campusSessionJob.create({
      data: { sessionId: s.id, jobId: job.id, kind: req.body.kind || "onsite", matchEnabled: req.body.matchEnabled ?? true, sortOrder: req.body.sortOrder ?? ((max._max.sortOrder ?? -1) + 1) },
      include: { job: { select: jobSelect }, _count: { select: { applications: true } } },
    });
    return reply.code(201).send({ item: sessionJobShape(created) });
  });

  app.patch("/sessions/:id/jobs/bulk", { schema: { body: CAMPUS_JOB_BULK_BODY } }, async (req, reply) => {
    if (!(await requireManage(req, reply))) return;
    const s = await loadSession(req, reply, req.params.id);
    if (!s) return;
    const { ids, changes } = req.body;
    if (!Object.keys(changes).length) return reply.code(400).send({ error: "empty_changes", message: "请选择要修改的字段" });
    const { kind, niceAdd, benefitsAdd, ...jobFields } = changes;
    try {
      await app.prisma.$transaction(async (tx) => {
        const selected = await tx.campusSessionJob.findMany({ where: { sessionId: s.id, id: { in: ids } }, select: { id: true, jobId: true, job: { select: { title: true, nice: true, benefits: true } } } });
        if (selected.length !== ids.length) throw new Error("campus_jobs_changed");
        const additions = selected.map((sj) => {
          const data = {};
          for (const [field, incoming] of [["nice", niceAdd], ["benefits", benefitsAdd]]) {
            if (!incoming) continue;
            const current = sj.job[field] || [];
            const next = [...current];
            const known = new Set(current.map((item) => item.trim()));
            for (const item of incoming) {
              const value = item.trim();
              if (!known.has(value)) { next.push(value); known.add(value); }
            }
            if (next.length > 20) throw Object.assign(new Error("campus_job_items_limit"), { title: sj.job.title, field });
            if (next.length !== current.length) data[field] = next;
          }
          return { jobId: sj.jobId, data };
        });
        if (kind !== undefined) {
          const result = await tx.campusSessionJob.updateMany({ where: { sessionId: s.id, id: { in: ids } }, data: { kind } });
          if (result.count !== ids.length) throw new Error("campus_jobs_changed");
        }
        if (Object.keys(jobFields).length) {
          const result = await tx.job.updateMany({ where: { id: { in: selected.map((sj) => sj.jobId) } }, data: jobData(jobFields) });
          if (result.count !== selected.length) throw new Error("campus_jobs_changed");
        }
        for (const addition of additions) {
          if (Object.keys(addition.data).length) await tx.job.update({ where: { id: addition.jobId }, data: addition.data });
        }
      });
    } catch (err) {
      if (err.message === "campus_jobs_changed") return reply.code(409).send({ error: "campus_jobs_changed", message: "所选岗位已变化,请刷新后重试" });
      if (err.message === "campus_job_items_limit") return reply.code(409).send({ error: "campus_job_items_limit", message: `「${err.title}」的${err.field === "nice" ? "加分项" : "福利待遇"}添加后会超过 20 条,本次未保存` });
      throw err;
    }
    await writeLog(app.prisma, { req, action: "campus.job.bulk_update", entityType: "CampusSession", entityId: s.id, diff: { count: ids.length, fields: Object.keys(changes) } });
    return { updated: ids.length };
  });

  app.patch("/sessions/:id/jobs/:sjId", { schema: { body: SESSION_JOB_BODY } }, async (req, reply) => {
    if (!(await requireManage(req, reply))) return;
    const sj = await app.prisma.campusSessionJob.findFirst({ where: { id: req.params.sjId, session: whereByIdOrExternal(req.params.id) } });
    if (!sj) return reply.code(404).send({ error: "not_found" });
    const { jobId, ...data } = req.body; // 不允许改 jobId(删掉重加)
    const updated = await app.prisma.campusSessionJob.update({ where: { id: sj.id }, data, include: { job: { select: jobSelect }, _count: { select: { applications: true } } } });
    return { item: sessionJobShape(updated) };
  });

  app.delete("/sessions/:id/jobs/:sjId", async (req, reply) => {
    if (!(await requireManage(req, reply))) return;
    const sj = await app.prisma.campusSessionJob.findFirst({ where: { id: req.params.sjId, session: whereByIdOrExternal(req.params.id) }, include: { _count: { select: { applications: true } } } });
    if (!sj) return reply.code(404).send({ error: "not_found" });
    if (sj._count.applications > 0) return reply.code(409).send({ error: "campus_job_has_applications", message: `已有 ${sj._count.applications} 条投递,不能移除(可关闭匹配或调整类型)` });
    await app.prisma.campusSessionJob.delete({ where: { id: sj.id } });
    return reply.code(204).send();
  });

  app.post("/sessions/:id/jobs/reorder", { schema: { body: { type: "object", required: ["ids"], properties: { ids: { type: "array", items: { type: "string", format: "uuid" }, maxItems: 200 } } } } }, async (req, reply) => {
    if (!(await requireManage(req, reply))) return;
    const s = await loadSession(req, reply, req.params.id);
    if (!s) return;
    await app.prisma.$transaction(req.body.ids.map((id, i) => app.prisma.campusSessionJob.updateMany({ where: { id, sessionId: s.id }, data: { sortOrder: i } })));
    return { ok: true };
  });

  // 新建校招 JD:创建 Job 并挂到专场(事务)。走 campus.manage 而不是 job.create,校招负责人不必拿社招岗位权限
  app.post("/sessions/:id/jobs/new", { schema: { body: CAMPUS_JOB_CREATE_BODY } }, async (req, reply) => {
    const access = await requireManage(req, reply);
    if (!access) return;
    const s = await loadSession(req, reply, req.params.id);
    if (!s) return;
    const { kind, matchEnabled, ...jd } = req.body;
    const created = await app.prisma.$transaction(async (tx) => {
      const job = await tx.job.create({ data: { ...jobData(jd), status: "招聘中" } });
      // 创建者须能从已有岗位中再次找到自己新建的 JD(含移除后重新加入)。
      if (!access.isAdmin) await tx.userJobScope.create({ data: { userId: req.user.sub, jobId: job.id } });
      const max = await tx.campusSessionJob.aggregate({ where: { sessionId: s.id }, _max: { sortOrder: true } });
      return tx.campusSessionJob.create({
        data: { sessionId: s.id, jobId: job.id, kind: kind || "onsite", matchEnabled: matchEnabled ?? true, sortOrder: (max._max.sortOrder ?? -1) + 1 },
        include: { job: { select: jobSelect }, _count: { select: { applications: true } } },
      });
    });
    await writeLog(app.prisma, { req, action: "campus.job.create", entityType: "Job", entityId: created.jobId, diff: { sessionId: s.id, title: created.job.title, kind: created.kind } });
    return reply.code(201).send({ item: sessionJobShape(created) });
  });

  // 编辑校招 JD:改的是 Job 本身,其它专场 / 社招共用该岗位时同步生效(前端按 sessionsCount 提示)
  app.patch("/sessions/:id/jobs/:sjId/job", { schema: { body: CAMPUS_JOB_PATCH_BODY } }, async (req, reply) => {
    if (!(await requireManage(req, reply))) return;
    const sj = await app.prisma.campusSessionJob.findFirst({ where: { id: req.params.sjId, session: whereByIdOrExternal(req.params.id) } });
    if (!sj) return reply.code(404).send({ error: "not_found" });
    await app.prisma.job.update({ where: { id: sj.jobId }, data: jobData(req.body) });
    const updated = await app.prisma.campusSessionJob.findUnique({ where: { id: sj.id }, include: { job: { select: jobSelect }, _count: { select: { applications: true } } } });
    await writeLog(app.prisma, { req, action: "campus.job.update", entityType: "Job", entityId: sj.jobId, diff: { sessionId: sj.sessionId, fields: Object.keys(req.body) } });
    return { item: sessionJobShape(updated) };
  });

  app.post("/sessions/:id/jobs/:sjId/evaluation-model", { schema: { body: { type: "object", additionalProperties: false } } }, async (req, reply) => {
    if (!(await requireManage(req, reply))) return;
    const sj = await app.prisma.campusSessionJob.findFirst({ where: { id: req.params.sjId, session: whereByIdOrExternal(req.params.id) }, include: { job: true } });
    if (!sj) return reply.code(404).send({ error: "not_found" });
    let data;
    try {
      data = await generateJobModel(sj.job);
    } catch (err) {
      req.log.error({ code: err.code, jobId: sj.jobId }, "campus job model generation failed");
      const status = err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 422;
      return reply.code(status).send({ error: err.code || "campus_job_model_failed", message: status === 424 ? "请先配置 Kimi 服务" : "评价模型生成失败,请稍后重试" });
    }
    // Kimi 调用期间可能有同事改 JD,不能把旧原文生成的模型覆盖到新版岗位。
    const saved = await app.prisma.job.updateMany({ where: { id: sj.jobId, updatedAt: sj.job.updatedAt }, data });
    if (!saved.count) return reply.code(409).send({ error: "campus_job_changed", message: "JD 已被修改,请刷新后重新生成评价模型" });
    const updated = await app.prisma.campusSessionJob.findUnique({ where: { id: sj.id }, include: { job: { select: jobSelect }, _count: { select: { applications: true } } } });
    if (!updated) return reply.code(404).send({ error: "not_found", message: "岗位已从专场移除" });
    await writeLog(app.prisma, { req, action: "campus.job.model", entityType: "Job", entityId: sj.jobId, diff: { sessionId: sj.sessionId } });
    return { item: sessionJobShape(updated) };
  });

  // ─── 台账 ────────────────────────────────────────────────────────
  const LEDGER_QUERY = {
    type: "object",
    properties: {
      q: { type: "string", maxLength: 100 },
      jobId: { type: "string", format: "uuid" },
      kind: { type: "string", enum: JOB_KINDS },
      source: { type: "string", enum: ["direct", "match", "hr"] },
      status: { type: "string", enum: APP_STATUS },
      school: { type: "string", maxLength: 120 },
      degree: { type: "string", maxLength: 50 },
      gradYear: { type: "integer" },
      parse: { type: "string", enum: ["done", "running", "pending", "failed", "none"] },
      contact: { type: "string", enum: ["confirmed", "unconfirmed"] },
      skip: { type: "integer", minimum: 0, default: 0 },
      take: { type: "integer", minimum: 1, maximum: 500, default: 100 },
    },
  };

  async function queryLedger(sessionId, q, { showContact }) {
    const where = { sessionId };
    if (q.school) where.school = { contains: q.school, mode: "insensitive" };
    if (q.degree) where.degree = q.degree;
    if (q.gradYear) where.gradYear = q.gradYear;
    if (q.contact === "confirmed") where.contactConfirmedAt = { not: null };
    if (q.contact === "unconfirmed") where.contactConfirmedAt = null;
    if (q.jobId || q.kind || q.source || q.status) {
      where.applications = { some: { ...(q.jobId ? { jobId: q.jobId } : {}), ...(q.source ? { source: q.source } : {}), ...(q.status ? { status: q.status } : {}), ...(q.kind ? { sessionJob: { kind: q.kind } } : {}) } };
    }
    if (q.q) {
      const kw = q.q.trim();
      where.OR = [
        { name: { contains: kw, mode: "insensitive" } }, { phone: { contains: kw } }, { email: { contains: kw, mode: "insensitive" } },
        { school: { contains: kw, mode: "insensitive" } }, { major: { contains: kw, mode: "insensitive" } }, { candidate: { name: { contains: kw, mode: "insensitive" } } },
      ];
    }
    const [session, rows, total] = await Promise.all([
      app.prisma.campusSession.findUnique({ where: { id: sessionId } }),
      app.prisma.campusApplicant.findMany({ where, orderBy: { createdAt: "desc" }, skip: q.skip ?? 0, take: q.take ?? 100, include: applicantInclude }),
      app.prisma.campusApplicant.count({ where }),
    ]);
    let items = rows.map((a) => applicantShape(a, { showContact, versionsAllowed: uploadsAllowed(session, a) }));
    if (q.parse) {
      items = items.filter((it) => (q.parse === "none" ? !it.currentVersion : it.currentVersion?.parseStatus === q.parse));
    }
    return { items, total, session };
  }

  async function ledgerStats(sessionId) {
    const [applicants, withResume, confirmed, apps] = await Promise.all([
      app.prisma.campusApplicant.count({ where: { sessionId } }),
      app.prisma.campusApplicant.count({ where: { sessionId, currentResumeVersionId: { not: null } } }),
      app.prisma.campusApplicant.count({ where: { sessionId, contactConfirmedAt: { not: null } } }),
      app.prisma.campusApplication.groupBy({ by: ["status"], where: { sessionJob: { sessionId } }, _count: { _all: true } }),
    ]);
    const byStatus = Object.fromEntries(apps.map((r) => [r.status, r._count._all]));
    const applications = apps.reduce((n, r) => n + r._count._all, 0);
    return { applicants, withResume, confirmed, applications, byStatus, onsiteInterview: byStatus.onsite_interview || 0, passed: byStatus.passed || 0 };
  }

  app.get("/sessions/:id/ledger", { schema: { querystring: LEDGER_QUERY } }, async (req, reply) => {
    const s = await loadSession(req, reply, req.params.id);
    if (!s) return;
    const access = await loadUserAccess(req);
    const showContact = hasModule(access, "candidate.contact");
    const [{ items, total }, stats] = await Promise.all([queryLedger(s.id, req.query, { showContact }), ledgerStats(s.id)]);
    return { items, total, stats, showContact, gate: gateStatus() };
  });

  app.get("/sessions/:id/ledger/export.xlsx", { schema: { querystring: LEDGER_QUERY } }, async (req, reply) => {
    const access = await loadUserAccess(req);
    if (!hasModule(access, "campus.export")) return reply.code(403).send({ error: "forbidden", message: "无台账导出权限" });
    const s = await loadSession(req, reply, req.params.id);
    if (!s) return;
    const { items } = await queryLedger(s.id, { ...req.query, skip: 0, take: 500 }, { showContact: true });
    const statusLabel = { applied: "已投递", screening: "筛选中", onsite_interview: "现场面试", referred: "内推已推送", passed: "已通过", rejected: "未通过", withdrawn: "已撤回" };
    const kindLabel = { onsite: "现场面试", referral: "内推" };
    const sourceLabel = { direct: "直投", match: "智能匹配", hr: "HR 登记" };
    const parseLabel = { pending: "待解析", running: "解析中", done: "已解析", failed: "解析失败", skipped: "未解析" };
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("校招台账");
    ws.columns = [
      { header: "姓名", key: "name", width: 12 }, { header: "学校", key: "school", width: 20 }, { header: "专业", key: "major", width: 18 }, { header: "学历", key: "degree", width: 8 }, { header: "毕业年份", key: "gradYear", width: 10 },
      { header: "手机", key: "phone", width: 14 }, { header: "邮箱", key: "email", width: 24 }, { header: "微信", key: "wechat", width: 16 }, { header: "联系方式已确认", key: "confirmed", width: 14 },
      { header: "投递岗位", key: "jobs", width: 40 }, { header: "岗位类型", key: "kinds", width: 14 }, { header: "来源", key: "sources", width: 12 }, { header: "匹配分(展示)", key: "scoreShown", width: 12 }, { header: "匹配分(原始)", key: "scoreRaw", width: 12 },
      { header: "投递状态", key: "status", width: 14 }, { header: "简历版本", key: "version", width: 10 }, { header: "解析状态", key: "parse", width: 10 }, { header: "登记时间", key: "createdAt", width: 20 },
    ];
    ws.getRow(1).font = { bold: true };
    const safe = (v) => (typeof v === "string" && /^[=+\-@\t]/.test(v) ? `'${v}` : v);
    for (const it of items) {
      const apps = it.applications.filter((a) => a.status !== "withdrawn");
      ws.addRow({
        name: safe(it.name || ""), school: safe(it.school || ""), major: safe(it.major || ""), degree: safe(it.degree || ""), gradYear: it.gradYear || "",
        phone: safe(it.phone || ""), email: safe(it.email || ""), wechat: safe(it.wechat || ""), confirmed: it.contactConfirmedAt ? "是" : "否",
        jobs: safe(apps.map((a) => a.job?.title || "").join(" / ")), kinds: apps.map((a) => kindLabel[a.kind] || "").join(" / "), sources: apps.map((a) => sourceLabel[a.source] || "").join(" / "),
        scoreShown: apps.map((a) => a.scoreShown ?? "").join(" / "), scoreRaw: apps.map((a) => a.scoreRaw ?? "").join(" / "),
        status: apps.map((a) => statusLabel[a.status] || a.status).join(" / "), version: it.currentVersion ? `v${it.currentVersion.version}/${it.uploadsAllowed}` : "", parse: it.currentVersion ? parseLabel[it.currentVersion.parseStatus] || "" : "无简历",
        createdAt: new Date(it.createdAt).toLocaleString("zh-CN", { hour12: false }),
      });
    }
    const buf = await wb.xlsx.writeBuffer();
    await writeLog(app.prisma, { req, action: "campus.ledger.export", entityType: "CampusSession", entityId: s.id, diff: { rows: items.length } });
    const filename = `校招台账_${s.name}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    return reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("Content-Disposition", attachmentHeaderForFilename(filename)).send(Buffer.from(buf));
  });

  // ─── 学生(HR 手工登记 / 维护)────────────────────────────────────
  function validateResume(resume, reply) {
    if (!resume) return true;
    if (resume.contentType && !ALLOWED_RESUME_MIME.has(resume.contentType)) {
      reply.code(415).send({ error: "campus_file_unsupported", message: "仅支持 PDF / Word 简历" });
      return false;
    }
    return true;
  }


  app.post("/sessions/:id/applicants", { schema: { body: APPLICANT_CREATE_BODY } }, async (req, reply) => {
    const s = await loadSession(req, reply, req.params.id);
    if (!s) return;
    const b = req.body;
    if (!validateResume(b.resume, reply)) return;
    const phone = normalizePhone(b.phone);
    const dup = await app.prisma.campusApplicant.findFirst({ where: { sessionId: s.id, phone } });
    if (dup) return reply.code(409).send({ error: "campus_applicant_exists", message: "该手机号在本专场已登记", applicantId: dup.id });

    let version = null;
    let applicantId;
    try {
      applicantId = await app.prisma.$transaction(async (tx) => {
        const candidateId = await ensureCandidate(tx, { session: s, phone, name: b.name, email: b.email, school: b.school, major: b.major, degree: b.degree, attachmentKey: b.resume?.key, ownerId: s.createdBy || req.user.sub });
        const a = await tx.campusApplicant.create({
          data: {
            sessionId: s.id, candidateId, phone, email: b.email?.trim() || null, name: b.name?.trim() || null, wechat: b.wechat || null,
            school: b.school || null, major: b.major || null, degree: b.degree || null, gradYear: b.gradYear ?? null,
            contactConfirmedAt: b.contactConfirmed ? new Date() : null, registeredBy: req.user.sub,
          },
        });
        if (b.resume?.key) version = await createVersionTx(tx, { applicant: a, session: s, resume: b.resume, uploadedBy: req.user.sub });
        for (const jobId of b.jobIds || []) await createApplicationTx(tx, { applicant: a, session: s, jobId, source: "hr", resumeVersionId: version?.id });
        return a.id;
      });
    } catch (err) {
      if (err.statusCode) return reply.code(err.statusCode).send({ error: err.code, message: err.message });
      throw err;
    }
    const a = await app.prisma.campusApplicant.findUnique({ where: { id: applicantId }, include: applicantInclude });
    // 上传即抽取(设计 §4 规则 12)
    if (version) await startExtraction(app, { applicantId, versionId: version.id, candidateId: a.candidateId, concurrency: await concurrency() });
    await writeLog(app.prisma, { req, action: "campus.applicant.create", entityType: "CampusApplicant", entityId: applicantId, diff: { sessionId: s.id, withResume: !!version, jobs: (b.jobIds || []).length } });
    const access = await loadUserAccess(req);
    return reply.code(201).send({ applicant: applicantShape(a, { showContact: hasModule(access, "candidate.contact"), versionsAllowed: uploadsAllowed(s, a) }) });
  });

  app.get("/applicants/:id", async (req, reply) => {
    const a = await loadApplicant(req, reply, req.params.id);
    if (!a) return;
    const access = await loadUserAccess(req);
    const runs = await app.prisma.campusMatchRun.findMany({ where: { applicantId: a.id }, orderBy: { startedAt: "desc" }, take: 10 });
    const shaped = [];
    for (const r of runs) shaped.push(runShape(r, r.status === "queued" || r.status === "running" ? await getTask(app, r.taskId) : null, { student: false }));
    return { applicant: applicantShape(a, { showContact: hasModule(access, "candidate.contact"), versionsAllowed: uploadsAllowed(a.session, a) }), session: { id: a.session.id, name: a.session.name, maxApplyJobs: a.session.maxApplyJobs, scoreFloor: a.session.scoreFloor, matchEnabled: a.session.matchEnabled }, matchRuns: shaped };
  });

  app.patch("/applicants/:id", { schema: { body: APPLICANT_PATCH_BODY } }, async (req, reply) => {
    const a = await loadApplicant(req, reply, req.params.id);
    if (!a) return;
    const { contactConfirmed, ...rest } = req.body;
    const data = { ...rest };
    if (data.phone !== undefined) {
      data.phone = normalizePhone(data.phone);
      const dup = await app.prisma.campusApplicant.findFirst({ where: { sessionId: a.sessionId, phone: data.phone, NOT: { id: a.id } } });
      if (dup) return reply.code(409).send({ error: "campus_applicant_exists", message: "该手机号在本专场已登记" });
    }
    if (contactConfirmed !== undefined) data.contactConfirmedAt = contactConfirmed ? new Date() : null;
    const updated = await app.prisma.$transaction(async (tx) => {
      const u = await tx.campusApplicant.update({ where: { id: a.id }, data, include: applicantInclude });
      // 同步候选人基础信息(姓名 / 联系方式 / 学校)
      const cd = {};
      if (data.name) cd.name = data.name;
      if (data.phone) cd.phone = data.phone;
      if (data.email !== undefined) cd.email = data.email;
      if (data.school !== undefined) cd.school = data.school;
      if (data.major !== undefined) cd.major = data.major;
      if (data.degree !== undefined) cd.education = data.degree;
      if (Object.keys(cd).length) await tx.candidate.update({ where: { id: a.candidateId }, data: cd });
      return u;
    });
    const access = await loadUserAccess(req);
    return { applicant: applicantShape(updated, { showContact: hasModule(access, "candidate.contact"), versionsAllowed: uploadsAllowed(a.session, updated) }) };
  });

  app.delete("/applicants/:id", async (req, reply) => {
    if (!(await requireManage(req, reply))) return;
    const a = await loadApplicant(req, reply, req.params.id);
    if (!a) return;
    // 只删校招登记,候选人保留
    await app.prisma.campusApplicant.delete({ where: { id: a.id } });
    await writeLog(app.prisma, { req, action: "campus.applicant.delete", entityType: "CampusApplicant", entityId: a.id, diff: { candidateId: a.candidateId } });
    return reply.code(204).send();
  });

  // HR 代传新版简历
  app.post("/applicants/:id/resumes", { schema: { body: RESUME_BODY } }, async (req, reply) => {
    const a = await loadApplicant(req, reply, req.params.id);
    if (!a) return;
    if (!validateResume(req.body, reply)) return;
    let version;
    try {
      version = await app.prisma.$transaction((tx) => createVersionTx(tx, { applicant: a, session: a.session, resume: req.body, uploadedBy: req.user.sub }));
    } catch (err) {
      if (err.statusCode) return reply.code(err.statusCode).send({ error: err.code, message: err.message });
      throw err;
    }
    const taskId = await startExtraction(app, { applicantId: a.id, versionId: version.id, candidateId: a.candidateId, concurrency: await concurrency() });
    return reply.code(201).send({ version: { ...versionShape(version), parseStatus: taskId ? "running" : "skipped" }, taskId });
  });

  // 重试解析(仅当前版本)
  app.post("/applicants/:id/resumes/:versionId/reparse", async (req, reply) => {
    const a = await loadApplicant(req, reply, req.params.id);
    if (!a) return;
    const v = a.resumeVersions.find((x) => x.id === req.params.versionId);
    if (!v) return reply.code(404).send({ error: "not_found" });
    if (v.id !== a.currentResumeVersionId) return reply.code(409).send({ error: "campus_not_current_version", message: "只能解析当前版本" });
    if (v.parseStatus === "running") return reply.code(409).send({ error: "campus_parse_in_progress", message: "正在解析中" });
    await app.prisma.candidate.update({ where: { id: a.candidateId }, data: { attachment: v.attachmentKey } });
    const taskId = await startExtraction(app, { applicantId: a.id, versionId: v.id, candidateId: a.candidateId, concurrency: await concurrency() });
    if (!taskId) return reply.code(424).send({ error: "kimi_not_configured", message: "KIMI_API_KEY 未配置" });
    return reply.code(202).send({ taskId });
  });

  // 取消抽取(HR 代学生取消,或台账里看到卡住时)
  app.post("/applicants/:id/resumes/:versionId/cancel", async (req, reply) => {
    const a = await loadApplicant(req, reply, req.params.id);
    if (!a) return;
    const v = a.resumeVersions.find((x) => x.id === req.params.versionId);
    if (!v) return reply.code(404).send({ error: "not_found" });
    const u = await cancelExtraction(app, { versionId: v.id });
    await writeLog(app.prisma, { req, action: "campus.resume.cancel_parse", entityType: "CampusResumeVersion", entityId: v.id });
    return { version: versionShape(u || v) };
  });

  app.get("/applicants/:id/resumes/:versionId/download", async (req, reply) => {
    const a = await loadApplicant(req, reply, req.params.id);
    if (!a) return;
    const access = await loadUserAccess(req);
    if (!hasModule(access, "candidate.attachments")) return reply.code(403).send({ error: "forbidden", message: "无附件下载权限" });
    const v = a.resumeVersions.find((x) => x.id === req.params.versionId);
    if (!v) return reply.code(404).send({ error: "not_found" });
    if (!app.r2) return reply.code(503).send({ error: "r2_not_configured" });
    const url = await app.r2.presignGet({ key: v.attachmentKey, expiresIn: 300 });
    return reply.redirect(url, 302);
  });

  // ─── 智能匹配(HR 代跑 / 取消)──────────────────────────────────
  app.post("/applicants/:id/match-runs", async (req, reply) => {
    const a = await loadApplicant(req, reply, req.params.id);
    if (!a) return;
    try {
      const run = await startMatchRun(app, { applicant: a, session: a.session, concurrency: await concurrency() });
      await writeLog(app.prisma, { req, action: "campus.match.start", entityType: "CampusMatchRun", entityId: run.id, diff: { applicantId: a.id } });
      return reply.code(202).send({ run: runShape(run, await getTask(app, run.taskId), { student: false }) });
    } catch (err) {
      if (err.statusCode) return reply.code(err.statusCode).send({ error: err.code, message: err.message });
      throw err;
    }
  });
  app.post("/applicants/:id/match-runs/:runId/cancel", async (req, reply) => {
    const run = await app.prisma.campusMatchRun.findFirst({ where: { id: req.params.runId, applicantId: req.params.id } });
    if (!run) return reply.code(404).send({ error: "not_found" });
    const u = await cancelMatchRun(app, run);
    await writeLog(app.prisma, { req, action: "campus.match.cancel", entityType: "CampusMatchRun", entityId: run.id });
    return { run: runShape(u, null, { student: false }) };
  });

  // ─── 投递 ────────────────────────────────────────────────────────
  app.post("/applicants/:id/applications", { schema: { body: { type: "object", required: ["jobId"], properties: { jobId: { type: "string", format: "uuid" } }, additionalProperties: false } } }, async (req, reply) => {
    const a = await loadApplicant(req, reply, req.params.id);
    if (!a) return;
    try {
      const row = await app.prisma.$transaction((tx) => createApplicationTx(tx, { applicant: a, session: a.session, jobId: req.body.jobId, source: "hr", resumeVersionId: a.currentResumeVersionId }));
      const full = await app.prisma.campusApplication.findUnique({ where: { id: row.id }, include: { sessionJob: { include: { job: { select: { id: true, title: true, dept: true } } } } } });
      return reply.code(201).send({ application: applicationShape(full) });
    } catch (err) {
      if (err.statusCode) return reply.code(err.statusCode).send({ error: err.code, message: err.message });
      throw err;
    }
  });

  app.patch("/applications/:id", { schema: { body: APPLICATION_PATCH_BODY } }, async (req, reply) => {
    const row = await app.prisma.campusApplication.findUnique({ where: { id: req.params.id } });
    if (!row) return reply.code(404).send({ error: "not_found" });
    const data = { ...req.body };
    if (data.status && data.status !== row.status) {
      data.statusChangedAt = new Date();
      data.withdrawnAt = data.status === "withdrawn" ? new Date() : null;
    }
    const { advance, ...appData } = data;
    const updated = await app.prisma.$transaction(async (tx) => {
      const u = await tx.campusApplication.update({ where: { id: row.id }, data: appData, include: { sessionJob: { include: { job: { select: { id: true, title: true, dept: true } } } }, applicant: { select: { candidateId: true } } } });
      if (appData.status === "passed" && advance) await advanceCandidateTx(tx, u.applicant.candidateId, u.jobId);
      return u;
    });
    if (data.status && data.status !== row.status) await writeLog(app.prisma, { req, action: "campus.application.status", entityType: "CampusApplication", entityId: row.id, diff: { from: row.status, to: data.status, advance: !!advance } });
    return { application: applicationShape(updated) };
  });

  app.post("/applications/bulk-status", { schema: { body: { type: "object", required: ["ids", "status"], properties: { ids: { type: "array", items: { type: "string", format: "uuid" }, minItems: 1, maxItems: 500 }, status: { type: "string", enum: APP_STATUS }, advance: { type: "boolean" } }, additionalProperties: false } } }, async (req) => {
    const { ids, status, advance } = req.body;
    const r = await app.prisma.$transaction(async (tx) => {
      const res = await tx.campusApplication.updateMany({ where: { id: { in: ids }, NOT: { status } }, data: { status, statusChangedAt: new Date(), withdrawnAt: status === "withdrawn" ? new Date() : null } });
      if (status === "passed" && advance) {
        const rows = await tx.campusApplication.findMany({ where: { id: { in: ids } }, include: { applicant: { select: { candidateId: true } } } });
        for (const a of rows) await advanceCandidateTx(tx, a.applicant.candidateId, a.jobId);
      }
      return res;
    });
    await writeLog(app.prisma, { req, action: "campus.application.bulk_status", entityType: "CampusApplication", diff: { count: r.count, status, advance: !!advance } });
    return { updated: r.count };
  });

  // 通过 → 候选人「待入职」(主投递设为该岗位)+ 自动建 employee(与 candidates.js PATCH 同口径:已存在不动 stage)
  async function advanceCandidateTx(tx, candidateId, jobId) {
    const job = await tx.job.findUnique({ where: { id: jobId }, select: { title: true } });
    const u = await tx.candidate.update({ where: { id: candidateId }, data: { status: "待入职", jobId, appliedFor: job?.title || undefined } });
    if (mapStatusToStage(u.status)) {
      const existing = await tx.employee.findUnique({ where: { candidateId } });
      if (!existing) { const empData = candidateToEmployeeData(u); if (empData) await tx.employee.create({ data: empData }); }
    }
  }

  // ─── 现场面试:单条 / 批量安排(创建 Interview + 投递状态 → onsite_interview)──
  const INTERVIEW_BODY = { type: "object", required: ["scheduledAt"], properties: { scheduledAt: { type: "string", format: "date-time" }, location: { type: ["string", "null"], maxLength: 200 }, interviewer: { type: ["string", "null"], maxLength: 100 }, round: { type: ["string", "null"], maxLength: 50 }, notes: { type: ["string", "null"], maxLength: 2000 } }, additionalProperties: false };
  async function scheduleInterviewTx(tx, appRow, body, session) {
    const cand = await tx.candidate.findUnique({ where: { id: appRow.applicant.candidateId }, select: { name: true } });
    const job = await tx.job.findUnique({ where: { id: appRow.jobId }, select: { title: true } });
    const iv = await tx.interview.create({ data: {
      candidateId: appRow.applicant.candidateId, candidateName: cand?.name || appRow.applicant.name || null, jobId: appRow.jobId, jobTitle: job?.title || null,
      round: body.round || "现场面试", category: "校招", mode: "线下", status: "已安排", scheduledAt: new Date(body.scheduledAt),
      interviewer: body.interviewer || null, interviewers: body.interviewer ? [{ name: body.interviewer, role: "面试官" }] : [], link: body.location || session?.location || null, notes: body.notes || `校招专场:${session?.name || ""}`,
    } });
    if (["applied", "screening"].includes(appRow.status)) await tx.campusApplication.update({ where: { id: appRow.id }, data: { status: "onsite_interview", statusChangedAt: new Date() } });
    // 候选人状态同步到「面试中」(未入更后阶段时)
    await tx.candidate.updateMany({ where: { id: appRow.applicant.candidateId, OR: [{ status: { in: ["待筛选", "已沟通"] } }, { status: null }] }, data: { status: "面试中" } });
    return iv;
  }
  app.post("/applications/:id/interview", { schema: { body: INTERVIEW_BODY } }, async (req, reply) => {
    const row = await app.prisma.campusApplication.findUnique({ where: { id: req.params.id }, include: { applicant: { include: { session: true } }, sessionJob: true } });
    if (!row) return reply.code(404).send({ error: "not_found" });
    if (row.sessionJob.kind !== "onsite") return reply.code(409).send({ error: "campus_not_onsite", message: "内推岗位不安排现场面试" });
    const iv = await app.prisma.$transaction((tx) => scheduleInterviewTx(tx, row, req.body, row.applicant.session));
    await writeLog(app.prisma, { req, action: "campus.interview.schedule", entityType: "Interview", entityId: iv.id, diff: { applicationId: row.id } });
    return reply.code(201).send({ interview: iv });
  });
  app.post("/applications/bulk-interview", { schema: { body: { ...INTERVIEW_BODY, required: ["ids", "scheduledAt"], properties: { ...INTERVIEW_BODY.properties, ids: { type: "array", items: { type: "string", format: "uuid" }, minItems: 1, maxItems: 200 } } } } }, async (req, reply) => {
    const { ids, ...body } = req.body;
    const rows = await app.prisma.campusApplication.findMany({ where: { id: { in: ids } }, include: { applicant: { include: { session: true } }, sessionJob: true } });
    const onsite = rows.filter((r) => r.sessionJob.kind === "onsite");
    const created = await app.prisma.$transaction(async (tx) => { const out = []; for (const r of onsite) out.push(await scheduleInterviewTx(tx, r, body, r.applicant.session)); return out; });
    await writeLog(app.prisma, { req, action: "campus.interview.bulk_schedule", entityType: "Interview", diff: { requested: ids.length, created: created.length } });
    return reply.code(201).send({ created: created.length, skipped: rows.length - onsite.length });
  });

  app.delete("/applications/:id", async (req, reply) => {
    const row = await app.prisma.campusApplication.findUnique({ where: { id: req.params.id } });
    if (!row) return reply.code(404).send({ error: "not_found" });
    await app.prisma.campusApplication.delete({ where: { id: row.id } });
    return reply.code(204).send();
  });

  // ─── 候选人详情「校招」卡:按 candidateId 查学生摘要 ──────────────
  app.get("/by-candidate/:candidateId", async (req, reply) => {
    const a = await app.prisma.campusApplicant.findUnique({ where: { candidateId: req.params.candidateId }, include: { ...applicantInclude, session: { select: { id: true, name: true, slug: true, school: true, status: true, scoreFloor: true } }, matchRuns: { orderBy: { startedAt: "desc" }, take: 1 } } });
    if (!a) return { applicant: null };
    const access = await loadUserAccess(req);
    const run = a.matchRuns[0] || null;
    return { applicant: applicantShape(a, { showContact: hasModule(access, "candidate.contact"), versionsAllowed: uploadsAllowed(a.session, a) }), session: a.session, latestMatchRun: run ? runShape(run, null, { student: false }) : null };
  });

  // ─── 合并电脑端上传:把公开上传进来的候选人简历并入学生记录(作为新版本,触发抽取),源候选人打标 ──
  app.post("/applicants/:id/merge", { schema: { body: { type: "object", required: ["candidateId"], properties: { candidateId: { type: "string", format: "uuid" } }, additionalProperties: false } } }, async (req, reply) => {
    const a = await loadApplicant(req, reply, req.params.id);
    if (!a) return;
    const src = await app.prisma.candidate.findUnique({ where: { id: req.body.candidateId }, include: { campusApplicant: { select: { id: true } } } });
    if (!src) return reply.code(404).send({ error: "candidate_not_found" });
    if (src.id === a.candidateId) return reply.code(409).send({ error: "campus_merge_self", message: "不能合并自己" });
    if (src.campusApplicant) return reply.code(409).send({ error: "campus_merge_linked", message: "该候选人已绑定其他校招学生" });
    if (!src.attachment) return reply.code(409).send({ error: "campus_merge_no_attachment", message: "该候选人没有简历附件" });
    if ((src.tags || []).includes("已合并到校招")) return reply.code(409).send({ error: "campus_merge_done", message: "该候选人已合并过" });
    let version;
    try {
      version = await app.prisma.$transaction(async (tx) => {
        // 次数不够时自动加一次(HR 合并属于管理操作)
        const allowed = uploadsAllowed(a.session, a);
        if (a.resumeUploadCount >= allowed) await tx.campusApplicant.update({ where: { id: a.id }, data: { extraUploads: { increment: 1 } } });
        const v = await createVersionTx(tx, { applicant: { ...a, extraUploads: a.resumeUploadCount >= allowed ? a.extraUploads + 1 : a.extraUploads }, session: a.session, resume: { key: src.attachment, filename: `合并自 ${src.name || "电脑端上传"}`, contentType: null }, uploadedBy: req.user.sub });
        // 补空字段
        const fill = {};
        if (!a.name && src.name && src.name !== "待解析简历") fill.name = src.name;
        if (!a.phone && src.phone) fill.phone = src.phone;
        if (!a.email && src.email) fill.email = src.email;
        if (!a.school && src.school) fill.school = src.school;
        if (!a.major && src.major) fill.major = src.major;
        if (!a.degree && src.education) fill.degree = src.education;
        if (Object.keys(fill).length) await tx.campusApplicant.update({ where: { id: a.id }, data: fill });
        await tx.candidate.update({ where: { id: src.id }, data: { tags: Array.from(new Set([...(src.tags || []), "已合并到校招"])), status: "已淘汰" } });
        await tx.candidateNote.create({ data: { candidateId: a.candidateId, content: `合并自电脑端上传候选人「${src.name || src.id}」(${src.source || ""}),简历作为 v${v.version}。`, authorId: req.user.sub, authorName: req.user.email || "HR" } }).catch(() => {});
        return v;
      });
    } catch (err) { if (err.statusCode) return reply.code(err.statusCode).send({ error: err.code, message: err.message }); throw err; }
    await startExtraction(app, { applicantId: a.id, versionId: version.id, candidateId: a.candidateId, concurrency: await concurrency() });
    await writeLog(app.prisma, { req, action: "campus.applicant.merge", entityType: "CampusApplicant", entityId: a.id, diff: { from: src.id, version: version.version } });
    return reply.code(201).send({ version: versionShape(version) });
  });

  // ─── 校招数据看板 ───────────────────────────────────────────────
  app.get("/sessions/:id/stats", async (req, reply) => {
    const s = await loadSession(req, reply, req.params.id);
    if (!s) return;
    const [byStatus, bySource, applicants, jobs, runs, versions] = await Promise.all([
      app.prisma.campusApplication.groupBy({ by: ["status"], where: { sessionJob: { sessionId: s.id } }, _count: { _all: true } }),
      app.prisma.campusApplication.groupBy({ by: ["source"], where: { sessionJob: { sessionId: s.id } }, _count: { _all: true } }),
      app.prisma.campusApplicant.findMany({ where: { sessionId: s.id }, select: { school: true, degree: true, createdAt: true, contactConfirmedAt: true, currentResumeVersionId: true } }),
      app.prisma.campusSessionJob.findMany({ where: { sessionId: s.id }, include: { job: { select: { title: true } }, _count: { select: { applications: true } }, applications: { select: { status: true, source: true, scoreRaw: true } } } }),
      app.prisma.campusMatchRun.groupBy({ by: ["status"], where: { applicant: { sessionId: s.id } }, _count: { _all: true } }),
      app.prisma.campusResumeVersion.groupBy({ by: ["parseStatus"], where: { applicant: { sessionId: s.id } }, _count: { _all: true } }),
    ]);
    const count = (rows, key) => Object.fromEntries(rows.map((r) => [r[key], r._count._all]));
    const schoolMap = new Map(); const degreeMap = new Map(); const dayMap = new Map();
    for (const a of applicants) {
      const sc = a.school || "未填"; schoolMap.set(sc, (schoolMap.get(sc) || 0) + 1);
      const dg = a.degree || "未填"; degreeMap.set(dg, (degreeMap.get(dg) || 0) + 1);
      const d = a.createdAt.toISOString().slice(0, 10); dayMap.set(d, (dayMap.get(d) || 0) + 1);
    }
    const days = []; for (let i = 13; i >= 0; i--) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); days.push({ date: d.slice(5), count: dayMap.get(d) || 0 }); }
    const byStatusMap = count(byStatus, "status");
    const funnelOrder = ["applied", "screening", "onsite_interview", "referred", "passed", "rejected", "withdrawn"];
    return {
      session: { id: s.id, name: s.name },
      totals: { applicants: applicants.length, withResume: applicants.filter((a) => a.currentResumeVersionId).length, confirmed: applicants.filter((a) => a.contactConfirmedAt).length, applications: byStatus.reduce((n, r) => n + r._count._all, 0), matchRunsDone: count(runs, "status").done || 0 },
      funnel: funnelOrder.map((k) => ({ status: k, count: byStatusMap[k] || 0 })),
      bySource: count(bySource, "source"),
      bySchool: Array.from(schoolMap, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10),
      byDegree: Array.from(degreeMap, ([name, count]) => ({ name, count })),
      byJob: jobs.map((j) => { const scored = j.applications.filter((x) => x.scoreRaw != null); return { jobId: j.jobId, title: j.job?.title || "—", kind: j.kind, applications: j._count.applications, passed: j.applications.filter((x) => x.status === "passed").length, fromMatch: j.applications.filter((x) => x.source === "match").length, avgScoreRaw: scored.length ? Math.round(scored.reduce((n, x) => n + x.scoreRaw, 0) / scored.length) : null }; }).sort((a, b) => b.applications - a.applications),
      daily: days,
      parse: count(versions, "parseStatus"),
      matchRuns: count(runs, "status"),
    };
  });

  // ─── 设置(admin)───────────────────────────────────────────────
  async function readSettings() {
    return {
      matchConcurrency: await getEffectiveNumber(SETTING_KEYS.CAMPUS_MATCH_CONCURRENCY, 3),
      authJwtTtl: (await getEffective(SETTING_KEYS.CAMPUS_AUTH_JWT_TTL)) || "30d",
      contactHints: await getEffectiveJson(SETTING_KEYS.CAMPUS_CONTACT_HINTS, []),
      pcUploadEnabled: /^(1|true|yes|on)$/i.test(String(await getEffective(SETTING_KEYS.CAMPUS_PC_UPLOAD_ENABLED) ?? "true")),
      gate: gateStatus(),
    };
  }
  app.get("/settings", async (req, reply) => {
    const access = await loadUserAccess(req);
    if (!access.isAdmin && !hasModule(access, "campus.manage")) return reply.code(403).send({ error: "forbidden" });
    return { settings: await readSettings() };
  });
  app.put("/settings", { schema: { body: SETTINGS_BODY } }, async (req, reply) => {
    const access = await loadUserAccess(req);
    if (!access.isAdmin) return reply.code(403).send({ error: "forbidden", message: "仅管理员可修改校招设置" });
    const b = req.body; const by = req.user.sub;
    if (b.matchConcurrency !== undefined) await setOne({ key: SETTING_KEYS.CAMPUS_MATCH_CONCURRENCY, value: String(b.matchConcurrency), updatedBy: by });
    if (b.authJwtTtl !== undefined) await setOne({ key: SETTING_KEYS.CAMPUS_AUTH_JWT_TTL, value: b.authJwtTtl, updatedBy: by });
    if (b.contactHints !== undefined) await setOne({ key: SETTING_KEYS.CAMPUS_CONTACT_HINTS, value: JSON.stringify(b.contactHints.map((s) => s.trim()).filter(Boolean)), updatedBy: by });
    if (b.pcUploadEnabled !== undefined) await setOne({ key: SETTING_KEYS.CAMPUS_PC_UPLOAD_ENABLED, value: b.pcUploadEnabled ? "true" : "false", updatedBy: by });
    await writeLog(app.prisma, { req, action: "campus.settings.update", entityType: "SystemSetting", diff: b });
    return { settings: await readSettings() };
  });

  // 文件 sha256(前端无法读 R2 再算时,后端可选补算 — Phase 2 匹配用);此处仅暴露工具以便将来复用
  app.get("/health", async () => ({ ok: true, gate: gateStatus(), sha: createHash("sha256").update("campus").digest("hex").slice(0, 8) }));
}
