import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { assertPage } from "../lib/permissions.js";
import { encrypt, decrypt } from "../lib/secrets.js";
import { issueCode, consumeCode } from "../lib/verificationCodes.js";
import { isEmailConfigured } from "../lib/email.js";
import { assertQueueLink, queueError, queueEntryView, mutateQueue, QUEUE_LINK_KINDS } from "../lib/interviewQueue.js";

const uuid = { type: "string", format: "uuid" };
const text = (maxLength) => ({ type: "string", minLength: 1, maxLength, pattern: "\\S" });
const sessionParams = { type: "object", required: ["sessionId"], properties: { sessionId: uuid } };
const actionSchema = { type: "object", additionalProperties: false, required: ["items", "action"], properties: {
  items: { type: "array", minItems: 1, maxItems: 500, items: { type: "object", additionalProperties: false, required: ["id", "updatedAt"], properties: { id: uuid, updatedAt: { type: "string", format: "date-time" } } } },
  action: { enum: ["professional-result", "professional-timer", "culture-result", "culture-timer", "direction", "salary"] },
  confirmed: { type: "boolean" }, result: { enum: ["passed", "pending"] }, jobDirection: text(200),
  salaryBase: { type: "number", minimum: 0, maximum: 10000000 }, salaryFactor: { type: "number", minimum: 0, maximum: 1000 }, salaryStatus: { enum: ["accepted", "abandoned"] },
} };
const revisionSchema = { type: "object", properties: { revision: { type: "integer", minimum: 0 } } };
const linkHeaders = { type: "object", required: ["x-queue-link"], properties: { "x-queue-link": { type: "string", minLength: 24, maxLength: 64 } } };
const limited = { rateLimit: { max: 10, timeWindow: "1 minute" } };

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
  const queue = await prisma.interviewQueue.findUnique({ where: { sessionId }, include: { session: { select: { id: true, name: true, school: true, status: true } } } });
  if (!queue) throw queueError("请先创建该大学专场的面试排队", 404, "queue_not_found");
  return queue;
}

async function queueData(prisma, queueId, role, revision) {
  return prisma.$transaction(async (tx) => {
    const queue = await tx.interviewQueue.findUnique({ where: { id: queueId }, include: { session: { select: { id: true, name: true, school: true, status: true } } } });
    if (!queue) throw queueError("面试排队不存在", 404);
    if (revision === queue.revision) return { unchanged: true, revision };
    const where = role === "staff" ? {} : role === "professional" ? { OR: [{ stage: "professional" }, { stage: "pending", professionalResult: "pending" }] } : role === "culture" ? { OR: [{ stage: "culture" }, { stage: "pending", cultureResult: "pending" }] } : { OR: [{ stage: "salary" }, { stage: "pending", salaryStatus: "abandoned" }] };
    const rows = await tx.interviewQueueEntry.findMany({ where: { queueId, ...where }, orderBy: [{ phaseEnteredAt: "asc" }, { createdAt: "asc" }, { id: "asc" }] });
    const jobs = await tx.job.findMany({ where: { recruitmentType: "campus", campusActive: true }, select: { id: true, title: true }, orderBy: [{ campusSortOrder: "asc" }, { createdAt: "asc" }] });
    return { queue: { id: queue.id, session: queue.session }, revision: queue.revision, entries: rows.map((row) => queueEntryView(row, role)), jobs };
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
    const sessions = await app.prisma.campusSession.findMany({ select: { id: true, name: true, school: true, status: true, interviewQueue: { include: { links: true, _count: { select: { entries: true } } } } }, orderBy: { createdAt: "asc" } });
    return { sessions: sessions.map(({ interviewQueue, ...session }) => ({ ...session, queueId: interviewQueue?.id || null, count: interviewQueue?._count.entries || 0, links: access.role === "VIEWER" ? [] : (interviewQueue?.links || []).map(linkView) })) };
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
    return assertQueueLink(await app.prisma.interviewQueueLink.findUnique({ where: { token: req.headers["x-queue-link"] }, include: { queue: { include: { session: { select: { id: true, name: true, school: true } } } } } }), kind);
  }
  async function shareActor(req, prisma = app.prisma) {
    let actor;
    try { actor = await req.jwtVerify(); } catch { throw queueError("请重新打开分享链接", 401, "queue_session_invalid"); }
    if (actor.aud !== "interview-queue-share") throw queueError("无权访问此页面", 403);
    const link = assertQueueLink(await prisma.interviewQueueLink.findUnique({ where: { id: actor.sub } }));
    if (actor.tv !== link.tokenVersion || actor.kind !== link.kind || actor.queueId !== link.queueId || link.kind === "registration") throw queueError("分享设置已更新，请重新打开链接", 401, "queue_session_invalid");
    return link;
  }
  app.get("/link", { schema: { headers: linkHeaders } }, async (req) => {
    const link = await fromLink(req);
    const jobs = link.kind === "registration" ? await app.prisma.job.findMany({ where: { recruitmentType: "campus", campusActive: true }, select: { title: true }, orderBy: { campusSortOrder: "asc" } }) : [];
    return { kind: link.kind, requireKey: link.requireKey, expiresAt: link.expiresAt, session: link.queue.session, queueId: link.queueId, jobs };
  });
  app.post("/share/open", { config: limited, schema: { headers: linkHeaders, body: { type: "object", additionalProperties: false, properties: { accessKey: { type: "string", maxLength: 64 } } } } }, async (req) => {
    const link = await fromLink(req);
    if (link.kind === "registration") throw queueError("请使用排队登记页面", 403);
    if (link.requireKey && (!req.body.accessKey || !(await bcrypt.compare(req.body.accessKey, link.keyHash)))) throw queueError("访问密钥不正确", 401, "access_key_invalid");
    return { token: app.jwt.sign({ aud: "interview-queue-share", sub: link.id, kind: link.kind, queueId: link.queueId, tv: link.tokenVersion }, { expiresIn: "12h" }), kind: link.kind };
  });
  app.get("/share/data", { schema: { querystring: revisionSchema } }, async (req) => {
    const link = await shareActor(req);
    return queueData(app.prisma, link.queueId, link.kind, req.query.revision);
  });
  app.post("/share/actions", { schema: { body: actionSchema } }, async (req) => {
    const link = await shareActor(req);
    return mutateQueue(app.prisma, link.queueId, req.body, link.kind, (tx) => shareActor(req, tx));
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
        return tx.interviewQueueEntry.create({ data: { queueId: link.queueId, ...data } });
      });
    } catch (err) {
      if (err.code === "P2002") throw queueError("该邮箱已登记，请用邮箱验证码找回记录", 409, "queue_already_registered");
      throw err;
    }
    return { token: app.jwt.sign({ aud: "interview-queue-student", sub: entry.id }, { expiresIn: "30d" }), entry: queueEntryView(entry) };
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
    return { token: app.jwt.sign({ aud: "interview-queue-student", sub: email, verified: true }, { expiresIn: "30d" }) };
  });
  app.get("/mine", async (req) => {
    let actor;
    try { actor = await req.jwtVerify(); } catch { throw queueError("请用邮箱验证码找回记录", 401, "queue_session_invalid"); }
    if (actor.aud !== "interview-queue-student") throw queueError("无权访问此记录", 403);
    const entries = await app.prisma.interviewQueueEntry.findMany({ where: actor.verified === true ? { email: actor.sub } : { id: actor.sub }, include: { queue: { select: { session: { select: { id: true, name: true } } } } }, orderBy: { createdAt: "desc" } });
    const records = await Promise.all(entries.map(async ({ queue, ...entry }) => {
      const ahead = ["professional", "culture"].includes(entry.stage) ? await app.prisma.interviewQueueEntry.count({ where: { queueId: entry.queueId, stage: entry.stage, OR: [{ phaseEnteredAt: { lt: entry.phaseEnteredAt } }, { phaseEnteredAt: entry.phaseEnteredAt, createdAt: { lt: entry.createdAt } }, { phaseEnteredAt: entry.phaseEnteredAt, createdAt: entry.createdAt, id: { lt: entry.id } }] } }) : 0;
      return { ...queueEntryView(entry), session: queue.session, ahead };
    }));
    return { entries: records };
  });
}
