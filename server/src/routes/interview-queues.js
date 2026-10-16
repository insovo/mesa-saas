import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { assertPage } from "../lib/permissions.js";
import { encrypt, decrypt } from "../lib/secrets.js";
import { issueCode, consumeCode } from "../lib/verificationCodes.js";
import { isEmailConfigured } from "../lib/email.js";
import { assertQueueLink, queueError, queueEntryView, mutateQueue, deleteQueueEntry, queueSetup, queueStation, QUEUE_LINK_KINDS } from "../lib/interviewQueue.js";

const uuid = { type: "string", format: "uuid" };
const text = (maxLength) => ({ type: "string", minLength: 1, maxLength, pattern: "\\S" });
const sessionParams = { type: "object", required: ["sessionId"], properties: { sessionId: uuid } };
const jobParams = { type: "object", required: ["jobId"], properties: { jobId: uuid } };
const entryParams = { type: "object", required: ["entryId"], properties: { entryId: uuid } };
const deletionKeySchema = { type: "string", minLength: 6, maxLength: 64, pattern: "^[A-Za-z0-9]+$" };
const deletionSchema = { type: "object", additionalProperties: false, required: ["updatedAt", "deletionKey", "confirmed"], properties: {
  updatedAt: { type: "string", format: "date-time" }, deletionKey: deletionKeySchema, confirmed: { const: true },
} };
const actionSchema = { type: "object", additionalProperties: false, required: ["items", "action"], properties: {
  items: { type: "array", minItems: 1, maxItems: 500, items: { type: "object", additionalProperties: false, required: ["id", "updatedAt"], properties: { id: uuid, updatedAt: { type: "string", format: "date-time" } } } },
  action: { enum: ["professional-result", "professional-timer", "culture-result", "culture-timer", "direction", "salary", "suggestion", "requeue", "assign"] },
  targetStationId: { type: ["string", "null"], format: "uuid" },
  targetStage: { enum: ["professional", "culture"] },
  content: text(5000),
  confirmed: { type: "boolean" }, result: { enum: ["passed", "pending"] }, jobDirection: text(200),
  salaryBase: { type: "number", minimum: 0, maximum: 10000000 }, salaryFactor: { type: "number", minimum: 0, maximum: 1000 }, salaryStatus: { enum: ["accepted", "abandoned"] },
} };
const revisionSchema = { type: "object", properties: { revision: { type: "integer", minimum: 0 } } };
const linkHeaders = { type: "object", required: ["x-queue-link"], properties: { "x-queue-link": { type: "string", minLength: 24, maxLength: 64 } } };
const limited = { rateLimit: { max: 10, timeWindow: "1 minute" } };
const deletionLimited = { rateLimit: { max: 10, timeWindow: "1 minute", keyGenerator: (req) => {
  try { return `queue-delete:${req.server.jwt.verify(req.headers.authorization?.replace(/^Bearer /, "")).sub}`; }
  catch { return `queue-delete:${req.ip}`; }
} } };

async function staff(req, reply, write = false) {
  const access = await assertPage(req, reply, "interviews");
  if (!access) return false;
  if (write && access.role === "VIEWER") {
    reply.code(403).send({ error: "forbidden", message: "只读账号不能修改面试排队" });
    return false;
  }
  return access;
}

async function loadQueue(prisma, sessionId) {
  const queue = await prisma.interviewQueue.findUnique({ where: { sessionId }, include: { session: { select: { id: true, name: true, school: true, status: true, showSalaryOnsite: true, showSalaryReferral: true } } } });
  if (!queue) throw queueError("请先创建该大学专场的面试排队", 404, "queue_not_found");
  return queue;
}

async function queueJob(prisma, jobId, session) {
  const job = await prisma.job.findFirst({ where: { id: jobId, recruitmentType: "campus", campusActive: true }, select: {
    id: true, title: true, dept: true, location: true, employment: true, educationRequirement: true, languageRequirement: true,
    description: true, responsibilities: true, requirements: true, nice: true, benefits: true, salary: true, campusKind: true,
  } });
  if (!job) throw queueError("校招岗位已移除或不存在", 404, "queue_job_not_found");
  const { campusKind, salary, ...detail } = job;
  const showSalary = campusKind === "referral" ? session.showSalaryReferral : session.showSalaryOnsite;
  return { job: { ...detail, kind: campusKind, salary: showSalary ? salary : null } };
}

async function queueData(prisma, queueId, role, revision, stationId = null) {
  return prisma.$transaction(async (tx) => {
    const queue = await tx.interviewQueue.findUnique({ where: { id: queueId }, include: { session: { select: { id: true, name: true, school: true, status: true } } } });
    if (!queue) throw queueError("面试排队不存在", 404);
    if (revision === queue.revision) return { unchanged: true, revision };
    const station = queueStation(queue, role, stationId);
    const where = ["staff", "hr"].includes(role) ? {} : { OR: [{ stage: role, ...(station ? { stationId: station.id } : {}) }, { stage: "pending" }] };
    const rows = await tx.interviewQueueEntry.findMany({ where: { queueId, ...where }, include: { suggestions: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, authorRole: true, content: true, createdAt: true } } }, orderBy: [{ phaseEnteredAt: "asc" }, { createdAt: "asc" }, { id: "asc" }] });
    const jobs = await tx.job.findMany({ where: { recruitmentType: "campus", campusActive: true }, select: { id: true, title: true, location: true, employment: true, educationRequirement: true, campusKind: true }, orderBy: [{ campusSortOrder: "asc" }, { createdAt: "asc" }] });
    return { queue: { id: queue.id, session: queue.session, setup: queueSetup(queue), station, ...(["staff", "hr"].includes(role) ? { deletionEnabled: Boolean(queue.deletionKeyHash) } : {}) }, revision: queue.revision, entries: rows.map((row) => queueEntryView(row, role)), jobs: jobs.map(({ campusKind, ...job }) => ({ ...job, kind: campusKind })) };
  }, { isolationLevel: "RepeatableRead" });
}

function linkView(link) {
  let accessKey = "";
  if (link.requireKey && link.keyEnc) { try { accessKey = decrypt(link.keyEnc); } catch { /* 轮换后可重新生成 */ } }
  return { kind: link.kind, active: link.active, expiresAt: link.expiresAt, requireKey: link.requireKey, accessKey,
    path: `/interview-queue/${link.kind === "registration" ? "register" : "share"}/${link.token}` };
}

function randomKey() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = letters + digits;
  return letters[crypto.randomInt(letters.length)] + digits[crypto.randomInt(digits.length)] + Array.from({ length: 4 }, () => all[crypto.randomInt(all.length)]).join("");
}

export default async function interviewQueueRoutes(app) {
  app.addHook("preHandler", app.authenticate);
  app.get("/", async (req, reply) => {
    const access = await staff(req, reply);
    if (!access) return;
    const sessions = await app.prisma.campusSession.findMany({ select: { id: true, name: true, school: true, location: true, status: true, interviewQueue: { include: { links: true, _count: { select: { entries: true } } } } }, orderBy: { createdAt: "asc" } });
    return { sessions: sessions.map(({ interviewQueue, ...session }) => ({ ...session, queueId: interviewQueue?.id || null, count: interviewQueue?._count.entries || 0, setup: queueSetup(interviewQueue || {}), deletionEnabled: Boolean(interviewQueue?.deletionKeyHash), links: access.role === "VIEWER" ? [] : (interviewQueue?.links || []).map(linkView) })) };
  });
  app.post("/:sessionId", { schema: { params: sessionParams } }, async (req, reply) => {
    if (!(await staff(req, reply, true))) return;
    if (!(await app.prisma.campusSession.findUnique({ where: { id: req.params.sessionId }, select: { id: true } }))) throw queueError("大学专场不存在", 404);
    const queue = await app.prisma.interviewQueue.upsert({ where: { sessionId: req.params.sessionId }, create: { sessionId: req.params.sessionId }, update: {} });
    return { queueId: queue.id };
  });
  app.get("/:sessionId", { schema: { params: sessionParams, querystring: revisionSchema } }, async (req, reply) => {
    if (!(await staff(req, reply))) return;
    const queue = await loadQueue(app.prisma, req.params.sessionId);
    return queueData(app.prisma, queue.id, "staff", req.query.revision);
  });
  app.post("/:sessionId/actions", { schema: { params: sessionParams, body: actionSchema } }, async (req, reply) => {
    if (!(await staff(req, reply, true))) return;
    const queue = await loadQueue(app.prisma, req.params.sessionId);
    return mutateQueue(app.prisma, queue.id, req.body, "staff");
  });
  app.patch("/:sessionId/deletion-key", { config: limited, schema: { params: sessionParams, body: { type: "object", additionalProperties: false, required: ["deletionKey"], properties: { deletionKey: deletionKeySchema } } } }, async (req, reply) => {
    if (!(await staff(req, reply, true))) return;
    const queue = await loadQueue(app.prisma, req.params.sessionId);
    const deletionKeyHash = await bcrypt.hash(req.body.deletionKey, 10);
    await app.prisma.interviewQueue.update({ where: { id: queue.id }, data: { deletionKeyHash, revision: { increment: 1 } } });
    return { deletionEnabled: true };
  });
  app.post("/:sessionId/entries/:entryId/delete", { config: deletionLimited, schema: { params: { ...sessionParams, required: ["sessionId", "entryId"], properties: { ...sessionParams.properties, ...entryParams.properties } }, body: deletionSchema } }, async (req, reply) => {
    if (!(await staff(req, reply, true))) return;
    const queue = await loadQueue(app.prisma, req.params.sessionId);
    return deleteQueueEntry(app.prisma, queue.id, req.params.entryId, req.body, "staff");
  });
  app.get("/:sessionId/jobs/:jobId", { schema: { params: { type: "object", required: ["sessionId", "jobId"], properties: { ...sessionParams.properties, ...jobParams.properties } } } }, async (req, reply) => {
    if (!(await staff(req, reply))) return;
    const queue = await loadQueue(app.prisma, req.params.sessionId);
    return queueJob(app.prisma, req.params.jobId, queue.session);
  });
  app.patch("/:sessionId/location", { schema: { params: sessionParams, body: { type: "object", required: ["location"], additionalProperties: false, properties: { location: text(200) } } } }, async (req, reply) => {
    if (!(await staff(req, reply, true))) return;
    const queue = await loadQueue(app.prisma, req.params.sessionId);
    return app.prisma.$transaction(async (tx) => {
      await tx.interviewQueue.update({ where: { id: queue.id }, data: { revision: { increment: 1 } } });
      return tx.campusSession.update({ where: { id: req.params.sessionId }, data: { location: req.body.location.trim() }, select: { location: true } });
    });
  });
  const setupSchema = { type: "object", additionalProperties: false, required: ["cultureOnsite", "stations"], properties: {
    cultureOnsite: { type: "boolean" }, stations: { type: "array", maxItems: 40, items: { type: "object", additionalProperties: false, required: ["id", "name", "role"], properties: { id: uuid, name: text(40), role: { enum: ["professional", "culture"] } } } },
  } };
  app.patch("/:sessionId/setup", { schema: { params: sessionParams, body: { type: "object", additionalProperties: false, required: ["setup", "previousSetup"], properties: { setup: setupSchema, previousSetup: setupSchema } } } }, async (req, reply) => {
    if (!(await staff(req, reply, true))) return;
    const queue = await loadQueue(app.prisma, req.params.sessionId);
    const setup = { cultureOnsite: req.body.setup.cultureOnsite, stations: req.body.setup.stations.map((s) => ({ ...s, id: s.id.toLowerCase(), name: s.name.trim() })) };
    if (!setup.stations.some((s) => s.role === "professional") || (setup.cultureOnsite && !setup.stations.some((s) => s.role === "culture"))) throw queueError("请至少配置一位专业面试官；现场文化面试开启时也需配置文化面试官");
    if (new Set(setup.stations.map((s) => s.id)).size !== setup.stations.length || new Set(setup.stations.map((s) => `${s.role}:${s.name}`)).size !== setup.stations.length) throw queueError("席位编号和同类席位名称不能重复");
    return app.prisma.$transaction(async (tx) => {
      const current = await tx.interviewQueue.update({ where: { id: queue.id }, data: { revision: { increment: 1 } } });
      if (JSON.stringify(queueSetup(current)) !== JSON.stringify(queueSetup({ setup: req.body.previousSetup }))) throw queueError("配置已更新，请重新打开设置", 409, "queue_conflict");
      const assigned = await tx.interviewQueueEntry.findMany({ where: { queueId: queue.id, stationId: { not: null }, stage: { in: ["professional", "culture"] } }, select: { stationId: true, stage: true } });
      if (assigned.some((row) => !setup.stations.some((s) => s.id === row.stationId && s.role === row.stage))) throw queueError("席位还有排队人员，请先由 HR 转派或撤回分配后再删除", 409, "queue_conflict");
      await tx.interviewQueue.update({ where: { id: queue.id }, data: { setup } });
      return { setup };
    });
  });
  const kindParams = { ...sessionParams, required: ["sessionId", "kind"], properties: { ...sessionParams.properties, kind: { enum: QUEUE_LINK_KINDS } } };
  app.post("/:sessionId/links/:kind", { schema: { params: kindParams, body: { type: "object", additionalProperties: false, properties: {
    requireKey: { type: "boolean", default: false }, accessKey: { type: "string", minLength: 6, maxLength: 64, pattern: "^[A-Za-z0-9]+$" },
    expirySeconds: { anyOf: [{ type: "integer", minimum: 60, maximum: 31536000 }, { type: "null" }] },
  } } } }, async (req, reply) => {
    if (!(await staff(req, reply, true))) return;
    const { sessionId, kind } = req.params;
    const queue = await loadQueue(app.prisma, sessionId);
    const expiry = req.body.expirySeconds === undefined ? kind === "registration" ? 86400 : 259200 : req.body.expirySeconds;
    const requireKey = kind !== "registration" && req.body.requireKey;
    if (expiry === null && !requireKey) throw queueError("无密钥时必须设置有效期");
    const accessKey = requireKey ? req.body.accessKey || randomKey() : null;
    const data = { active: true, token: crypto.randomBytes(24).toString("base64url"), expiresAt: expiry ? new Date(Date.now() + expiry * 1000) : null, requireKey,
      keyHash: accessKey ? await bcrypt.hash(accessKey, 10) : null, keyEnc: accessKey ? encrypt(accessKey) : null };
    const link = await app.prisma.$transaction(async (tx) => {
      await tx.interviewQueue.update({ where: { id: queue.id }, data: { revision: { increment: 1 } } });
      return tx.interviewQueueLink.upsert({ where: { queueId_kind: { queueId: queue.id, kind } }, create: { queueId: queue.id, kind, ...data }, update: { ...data, tokenVersion: { increment: 1 } } });
    });
    return { link: linkView(link) };
  });
  app.delete("/:sessionId/links/:kind", { schema: { params: kindParams } }, async (req, reply) => {
    if (!(await staff(req, reply, true))) return;
    const queue = await loadQueue(app.prisma, req.params.sessionId);
    await app.prisma.$transaction(async (tx) => {
      await tx.interviewQueue.update({ where: { id: queue.id }, data: { revision: { increment: 1 } } });
      await tx.interviewQueueLink.updateMany({ where: { queueId: queue.id, kind: req.params.kind }, data: { active: false, tokenVersion: { increment: 1 } } });
    });
    return { ok: true };
  });
}

export async function publicInterviewQueueRoutes(app) {
  app.addHook("onSend", async (_req, reply, payload) => { reply.header("Cache-Control", "no-store"); return payload; });
  async function fromLink(req, kind) {
    return assertQueueLink(await app.prisma.interviewQueueLink.findUnique({ where: { token: req.headers["x-queue-link"] }, include: { queue: { include: { session: { select: { id: true, name: true, school: true, showSalaryOnsite: true, showSalaryReferral: true } } } } } }), kind);
  }
  async function shareActor(req, prisma = app.prisma) {
    let actor;
    try { actor = await req.jwtVerify(); } catch { throw queueError("请重新打开分享链接", 401, "queue_session_invalid"); }
    if (actor.aud !== "interview-queue-share") throw queueError("无权访问此页面", 403);
    const link = assertQueueLink(await prisma.interviewQueueLink.findUnique({ where: { id: actor.sub }, include: { queue: true } }));
    if (actor.tv !== link.tokenVersion || actor.kind !== link.kind || actor.queueId !== link.queueId || link.kind === "registration") throw queueError("分享设置已更新，请重新打开链接", 401, "queue_session_invalid");
    queueStation(link.queue, link.kind, actor.stationId);
    return { ...link, stationId: actor.stationId || null };
  }
  app.get("/link", { schema: { headers: linkHeaders } }, async (req) => {
    const link = await fromLink(req);
    const jobs = link.kind === "registration" ? await app.prisma.job.findMany({ where: { recruitmentType: "campus", campusActive: true }, select: { id: true, title: true, location: true, employment: true, educationRequirement: true, campusKind: true }, orderBy: [{ campusSortOrder: "asc" }, { createdAt: "asc" }] }) : [];
    const { id, name, school } = link.queue.session;
    return { kind: link.kind, requireKey: link.requireKey, expiresAt: link.expiresAt, session: { id, name, school }, queueId: link.queueId, setup: { ...queueSetup(link.queue), routingEnabled: queueSetup(link.queue).stations.length > 0, stations: queueSetup(link.queue).stations.filter((s) => link.kind === "registration" ? false : s.role === link.kind) }, jobs: jobs.map(({ campusKind, ...job }) => ({ ...job, kind: campusKind })) };
  });
  app.get("/registration/jobs/:jobId", { schema: { headers: linkHeaders, params: jobParams } }, async (req) => {
    const link = await fromLink(req, "registration");
    return queueJob(app.prisma, req.params.jobId, link.queue.session);
  });
  app.get("/share/jobs/:jobId", { schema: { params: jobParams } }, async (req) => {
    const link = await shareActor(req);
    if (!["professional", "hr"].includes(link.kind)) throw queueError("此角色不能修改岗位方向", 403, "queue_role_forbidden");
    const queue = await app.prisma.interviewQueue.findUnique({ where: { id: link.queueId }, include: { session: { select: { showSalaryOnsite: true, showSalaryReferral: true } } } });
    return queueJob(app.prisma, req.params.jobId, queue.session);
  });
  app.post("/share/open", { config: limited, schema: { headers: linkHeaders, body: { type: "object", additionalProperties: false, properties: { accessKey: { type: "string", maxLength: 64 }, stationId: uuid } } } }, async (req) => {
    const link = await fromLink(req);
    if (link.kind === "registration") throw queueError("请使用排队登记页面", 403);
    if (link.requireKey && (!req.body.accessKey || !(await bcrypt.compare(req.body.accessKey, link.keyHash)))) throw queueError("访问密钥不正确", 401, "access_key_invalid");
    const station = queueStation(link.queue, link.kind, req.body.stationId);
    return { token: app.jwt.sign({ ...(station ? { stationId: station.id } : {}), aud: "interview-queue-share", sub: link.id, viewerId: crypto.randomUUID(), kind: link.kind, queueId: link.queueId, tv: link.tokenVersion }, { expiresIn: "12h" }), kind: link.kind };
  });
  app.get("/share/data", { schema: { querystring: revisionSchema } }, async (req) => {
    const link = await shareActor(req);
    return queueData(app.prisma, link.queueId, link.kind, req.query.revision, link.stationId);
  });
  app.post("/share/actions", { schema: { body: actionSchema } }, async (req) => {
    const link = await shareActor(req);
    return mutateQueue(app.prisma, link.queueId, req.body, link.kind, (tx) => shareActor(req, tx), link.stationId);
  });
  app.post("/share/entries/:entryId/delete", { config: deletionLimited, schema: { params: entryParams, body: deletionSchema } }, async (req) => {
    const link = await shareActor(req);
    return deleteQueueEntry(app.prisma, link.queueId, req.params.entryId, req.body, link.kind, (tx) => shareActor(req, tx));
  });
  app.post("/register", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } }, schema: { headers: linkHeaders, body: { type: "object", additionalProperties: false,
    required: ["name", "school", "major", "degree", "gradYear", "languageAbility", "phone", "jobDirection", "email"], properties: {
      name: text(100), school: text(200), major: text(200), degree: text(50), gradYear: { type: "integer", minimum: 2000, maximum: 2100, default: 2027 },
      languageAbility: text(200), phone: { type: "string", minLength: 5, maxLength: 30, pattern: "^(?=(?:\\D*\\d){5,})[+0-9 ()-]+$" }, jobDirection: text(200), email: { type: "string", format: "email", maxLength: 254 },
    } } } }, async (req) => {
    const link = await fromLink(req, "registration");
    const data = Object.fromEntries(Object.entries(req.body).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]));
    data.email = data.email.toLowerCase();
    let entry;
    try {
      entry = await app.prisma.$transaction(async (tx) => {
        await tx.interviewQueue.update({ where: { id: link.queueId }, data: { revision: { increment: 1 } } });
        const currentLink = assertQueueLink(await tx.interviewQueueLink.findUnique({ where: { id: link.id } }), "registration");
        if (currentLink.token !== req.headers["x-queue-link"]) throw queueError("登记链接已更新，请重新扫码", 410, "queue_link_inactive");
        const job = await tx.job.findFirst({ where: { title: data.jobDirection, recruitmentType: "campus", campusActive: true, campusKind: "onsite" }, select: { id: true } });
        if (!job) throw queueError("请选择当前标记为现场面试的校招岗位", 422, "queue_job_not_onsite");
        return tx.interviewQueueEntry.create({ data: { queueId: link.queueId, ...data } });
      });
    } catch (err) {
      if (err.code === "P2002") throw queueError("该邮箱已登记，请用邮箱验证码找回记录", 409, "queue_already_registered");
      throw err;
    }
    return { token: app.jwt.sign({ aud: "interview-queue-student", sub: entry.id, viewerId: crypto.randomUUID() }, { expiresIn: "30d" }), entry: queueEntryView(entry, "student") };
  });
  const emailSchema = { type: "object", required: ["email"], additionalProperties: false, properties: { email: { type: "string", format: "email", maxLength: 254 } } };
  app.post("/recover/send-code", { config: limited, schema: { body: emailSchema } }, async (req, reply) => {
    if (process.env.NODE_ENV === "production" && !isEmailConfigured()) throw queueError("邮件服务暂不可用，请联系现场工作人员", 424, "email_not_configured");
    const email = req.body.email.trim().toLowerCase();
    let issued;
    if (await app.prisma.interviewQueueEntry.findFirst({ where: { email }, select: { id: true } })) {
      try { issued = await issueCode(app.prisma, { email, purpose: "INTERVIEW_QUEUE_RECOVER", ip: req.ip }); }
      catch (err) { return reply.code(err.statusCode === 429 ? 429 : 424).send({ error: err.code, message: err.statusCode === 429 ? "请稍后再申请验证码" : "验证码发送失败，请稍后重试" }); }
    }
    return { ok: true, message: "如该邮箱已登记，验证码将发送至邮箱", ...(process.env.NODE_ENV !== "production" && issued?.devCode ? { devCode: issued.devCode } : {}) };
  });
  app.post("/recover/verify", { config: limited, schema: { body: { ...emailSchema, required: ["email", "code"], properties: { ...emailSchema.properties, code: { type: "string", pattern: "^[0-9]{6}$" } } } } }, async (req) => {
    const email = req.body.email.trim().toLowerCase();
    await consumeCode(app.prisma, { email, code: req.body.code, purpose: "INTERVIEW_QUEUE_RECOVER" });
    return { token: app.jwt.sign({ aud: "interview-queue-student", sub: email, viewerId: crypto.randomUUID(), verified: true }, { expiresIn: "30d" }) };
  });
  app.get("/mine", async (req) => {
    let actor;
    try { actor = await req.jwtVerify(); } catch { throw queueError("请用邮箱验证码找回记录", 401, "queue_session_invalid"); }
    if (actor.aud !== "interview-queue-student") throw queueError("无权访问此记录", 403);
    const entries = await app.prisma.interviewQueueEntry.findMany({ where: actor.verified === true ? { email: actor.sub } : { id: actor.sub }, include: { queue: { select: { setup: true, session: { select: { id: true, name: true } } } } }, orderBy: { createdAt: "desc" } });
    const records = await Promise.all(entries.map(async ({ queue, ...entry }) => {
      const ahead = ["professional", "culture"].includes(entry.stage) ? await app.prisma.interviewQueueEntry.count({ where: { queueId: entry.queueId, stage: entry.stage, ...(queueSetup(queue).stations.length ? { stationId: entry.stationId } : {}), OR: [{ phaseEnteredAt: { lt: entry.phaseEnteredAt } }, { phaseEnteredAt: entry.phaseEnteredAt, createdAt: { lt: entry.createdAt } }, { phaseEnteredAt: entry.phaseEnteredAt, createdAt: entry.createdAt, id: { lt: entry.id } }] } }) : 0;
      return { ...queueEntryView(entry, "student"), session: queue.session, ahead, cultureOnsite: queueSetup(queue).cultureOnsite, routingEnabled: queueSetup(queue).stations.length > 0, stationName: queueSetup(queue).stations.find((s) => s.id === entry.stationId)?.name || null };
    }));
    return { entries: records };
  });
}
