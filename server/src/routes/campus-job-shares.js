import { randomBytes } from "node:crypto";
import { loadUserAccess, hasModule, hasPage, buildJobScopeWhere } from "../lib/permissions.js";
import { campusRouteAllowed } from "../lib/campusTabAccess.js";
import { activeCampusJob, catalogTransaction, attachJobToSessions } from "../lib/campus/catalog.js";
import { CAMPUS_JOB_SHARE_DEFAULTS } from "../lib/campus/jobShareDefaults.js";
import { reconcileCampusAutoEvaluation } from "../lib/campus/autoEvaluation.js";
import { QUOTA_STATUS } from "../lib/campus/shared.js";
import { writeLog } from "../lib/audit.js";

const idsSchema = { type: "array", minItems: 1, maxItems: 500, uniqueItems: true, items: { type: "string", format: "uuid" } };
const idParams = { type: "object", required: ["id"], properties: { id: { type: "string", format: "uuid" } } };
const publicJobSelect = {
  id: true, title: true, dept: true, location: true, employment: true, educationRequirement: true,
  languageRequirement: true, openings: true, salary: true, deadline: true, description: true,
  responsibilities: true, requirements: true, nice: true, benefits: true, campusKind: true,
};
const publicJob = ({ campusKind, ...job }) => ({ ...job, kind: campusKind });
const linkShape = (link) => ({ id: link.id, active: link.active, expiresAt: link.expiresAt, createdAt: link.createdAt, jobsCount: link._count?.jobs, path: `/campus-job-review/${link.token}` });
const fail = (statusCode, code, message) => { throw Object.assign(new Error(message), { statusCode, code }); };

async function managementAccess(req) {
  const access = await loadUserAccess(req);
  if (!access.isActive || access.role === "VIEWER" || !hasPage(access, "campus") || !hasModule(access, "campus.manage") || !campusRouteAllowed(access, "POST", "/api/campus/jobs/share-links")) fail(403, "forbidden", "无校招岗位管理权限");
  return access;
}

async function jobWhere(req, extra = {}) {
  const scope = await buildJobScopeWhere(req);
  return { AND: [activeCampusJob, extra, ...(scope ? [scope] : [])] };
}

async function sharedContext(req, prisma, lock = false) {
  const token = req.headers["x-campus-job-share"];
  if (typeof token !== "string" || token.length < 24 || token.length > 128) fail(404, "share_not_found", "岗位分享链接不存在");
  if (lock) await prisma.$queryRaw`SELECT id FROM campus_job_shares WHERE token = ${token} FOR UPDATE`;
  const link = await prisma.campusJobShare.findUnique({ where: { token }, include: { creator: { select: { id: true, isActive: true } } } });
  if (!link) fail(404, "share_not_found", "岗位分享链接不存在");
  if (!link.active || link.expiresAt <= new Date() || !link.creator?.isActive) fail(410, "share_expired", "岗位分享已停止或过期，请联系分享人");
  const creatorReq = { server: { prisma }, user: { sub: link.createdBy } };
  try { await managementAccess(creatorReq); } catch { fail(410, "share_permission_revoked", "分享人已无岗位管理权限，请联系管理员"); }
  const where = await jobWhere(creatorReq, { campusShareItems: { some: { shareId: link.id } } });
  return { link, creatorReq, where };
}

export default async function campusJobShareRoutes(app) {
  app.post("/jobs/share-links", { schema: { body: { type: "object", required: ["ids"], additionalProperties: false, properties: { ids: idsSchema, expirySeconds: { type: "integer", minimum: 60, maximum: 31536000, default: 259200 } } } } }, async (req, reply) => {
    await managementAccess(req);
    const where = await jobWhere(req, { id: { in: req.body.ids } });
    const link = await catalogTransaction(app.prisma, async (tx) => {
      const selected = await tx.job.findMany({ where, select: { id: true } });
      if (selected.length !== req.body.ids.length) fail(409, "campus_jobs_changed", "所选岗位已变化或不可访问，请刷新后重试");
      return tx.campusJobShare.create({ data: {
        token: randomBytes(24).toString("base64url"), createdBy: req.user.sub,
        expiresAt: new Date(Date.now() + req.body.expirySeconds * 1000),
        jobs: { create: selected.map((job) => ({ jobId: job.id })) },
      }, include: { _count: { select: { jobs: true } } } });
    });
    await writeLog(app.prisma, { req, action: "campus.job_share.create", entityType: "CampusJobShare", entityId: link.id, diff: { count: req.body.ids.length, expiresAt: link.expiresAt } });
    return reply.code(201).send({ link: linkShape(link) });
  });

  app.get("/jobs/share-links", async (req) => {
    await managementAccess(req);
    const links = await app.prisma.campusJobShare.findMany({ where: { createdBy: req.user.sub, active: true, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, take: 50, include: { _count: { select: { jobs: true } } } });
    return { items: links.map(linkShape) };
  });

  app.delete("/jobs/share-links/:id", { schema: { params: idParams } }, async (req, reply) => {
    const access = await managementAccess(req);
    await catalogTransaction(app.prisma, async (tx) => {
      await tx.$queryRaw`SELECT id FROM campus_job_shares WHERE id = ${req.params.id}::uuid FOR UPDATE`;
      const link = await tx.campusJobShare.findUnique({ where: { id: req.params.id } });
      if (!link || (!access.isAdmin && link.createdBy !== req.user.sub)) fail(404, "share_not_found", "岗位分享链接不存在");
      await tx.campusJobShare.update({ where: { id: link.id }, data: { active: false } });
    });
    await writeLog(app.prisma, { req, action: "campus.job_share.stop", entityType: "CampusJobShare", entityId: req.params.id });
    return reply.code(204).send();
  });
}

export async function publicCampusJobShareRoutes(app) {
  app.get("/", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const { link, where } = await sharedContext(req, app.prisma);
    const jobs = await app.prisma.job.findMany({ where, select: publicJobSelect, orderBy: [{ campusSortOrder: "asc" }, { createdAt: "asc" }] });
    return { expiresAt: link.expiresAt, jobs: jobs.map(publicJob), defaults: CAMPUS_JOB_SHARE_DEFAULTS };
  });

  app.patch("/kind", { schema: { body: { type: "object", required: ["ids", "kind"], additionalProperties: false, properties: { ids: idsSchema, kind: { type: "string", enum: ["onsite", "referral"] } } } } }, async (req) => {
    const { ids, kind } = req.body;
    const link = await catalogTransaction(app.prisma, async (tx) => {
      const { link, where } = await sharedContext(req, tx, true);
      const scoped = { AND: [where, { id: { in: ids } }] };
      const jobs = await tx.job.findMany({ where: scoped, select: { id: true } });
      if (jobs.length !== ids.length) fail(409, "campus_jobs_changed", "所选岗位已变化或不在分享范围内，请刷新后重试");
      await tx.job.updateMany({ where: scoped, data: { campusKind: kind } });
      await tx.campusSessionJob.updateMany({ where: { jobId: { in: ids } }, data: { kind } });
      return link;
    });
    const affected = await app.prisma.campusApplication.findMany({ where: { jobId: { in: ids }, status: { in: QUOTA_STATUS } }, distinct: ["applicantId"], select: { applicantId: true } });
    for (const row of affected) await reconcileCampusAutoEvaluation(app, row.applicantId).catch((err) => app.log.error({ err, applicantId: row.applicantId }, "[campus] auto evaluation scheduling failed"));
    await writeLog(app.prisma, { req, actorId: link.createdBy, action: "campus.job_share.kind", entityType: "CampusJobShare", entityId: link.id, diff: { count: ids.length, kind, allSessions: true, viaPublicLink: true } });
    return { updated: ids.length };
  });

  const lines = { type: "array", minItems: 1, maxItems: 100, items: { type: "string", minLength: 1, maxLength: 1000 } };
  app.post("/jobs", { schema: { body: { type: "object", required: ["title", "responsibilities", "requirements"], additionalProperties: false, properties: { title: { type: "string", minLength: 1, maxLength: 200 }, responsibilities: lines, requirements: lines, kind: { type: "string", enum: ["onsite", "referral"], default: "referral" } } } } }, async (req, reply) => {
    const title = req.body.title.trim();
    const responsibilities = req.body.responsibilities.map((line) => line.trim()).filter(Boolean);
    const requirements = req.body.requirements.map((line) => line.trim()).filter(Boolean);
    if (!title || !responsibilities.length || !requirements.length) fail(422, "job_fields_required", "请填写岗位名称、岗位职责和任职要求");
    const { job, link } = await catalogTransaction(app.prisma, async (tx) => {
      const { link, creatorReq } = await sharedContext(req, tx, true);
      const access = await loadUserAccess(creatorReq);
      const max = await tx.job.aggregate({ where: activeCampusJob, _max: { campusSortOrder: true } });
      const job = await tx.job.create({ data: {
        ...CAMPUS_JOB_SHARE_DEFAULTS, title, responsibilities, requirements,
        recruitmentType: "campus", status: "招聘中", campusActive: true, campusKind: req.body.kind,
        campusMatchEnabled: true, campusSortOrder: (max._max.campusSortOrder ?? -1) + 1,
      }, select: { ...publicJobSelect, campusMatchEnabled: true, campusSortOrder: true } });
      if (!access.isAdmin) await tx.userJobScope.create({ data: { userId: link.createdBy, jobId: job.id } });
      await attachJobToSessions(tx, job);
      await tx.campusJobShareJob.create({ data: { shareId: link.id, jobId: job.id } });
      return { job, link };
    });
    await writeLog(app.prisma, { req, actorId: link.createdBy, action: "campus.job_share.job_create", entityType: "Job", entityId: job.id, diff: { title, kind: job.campusKind, shareId: link.id, allSessions: true, viaPublicLink: true } });
    const { campusMatchEnabled, campusSortOrder, ...shown } = job;
    return reply.code(201).send({ job: publicJob(shown) });
  });
}
