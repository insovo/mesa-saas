import { createHmac, timingSafeEqual } from "node:crypto";
import { assertPage } from "../lib/permissions.js";
import { acceptSalaryResume, requestSalaryEvaluation, deleteSalarySubmission, salaryError, MAX_RESUME_SIZE, MIME } from "../lib/campusSalary/service.js";
import { BUILTIN_SCHOOLS, POLICY_VERSION, POLICY_HASH, CATEGORIES, ROLE_LABELS } from "../lib/campusSalary/policy.js";
import { MAJOR_CATALOG } from "../lib/campusSalary/majors.js";
import { ENGINE_VERSION } from "../lib/campusSalary/engine.js";

const string = (maxLength = 200) => ({ type: "string", maxLength, pattern: "^[^\\u0000]*$" });
const uuid = { type: "string", format: "uuid" };
const params = { type: "object", required: ["id"], properties: { id: uuid } };
export const CONTEXT_SCHEMA = { type: "object", additionalProperties: false, properties: {
  contractCity: string(50), cityType: { type: "string", enum: ["first", "nonfirst", ""] },
  roleType: { type: "string", enum: [...Object.keys(ROLE_LABELS), ""] }, jobTitle: string(), department: string(),
  salaryFactor: { type: ["number", "null"], exclusiveMinimum: 0, maximum: 1000 },
} };
export const CONFIRMED_SCHEMA = { type: "object", additionalProperties: false, properties: {
  majorCategory: { type: ["string", "null"], enum: [...CATEGORIES, null] },
  doctorField: { type: ["string", "null"], enum: ["regular", "key", "scarce", null] },
  jobRelevance: { type: "boolean" }, overseasCertification: { type: "boolean" },
  education: { type: "array", minItems: 1, maxItems: 5, items: { type: "object", additionalProperties: false, required: ["school", "degree", "major", "graduationYear"], properties: {
    school: { ...string(), minLength: 1 }, degree: { type: "string", enum: ["本科", "硕士", "博士"] }, major: { ...string(), minLength: 1 }, graduationYear: { type: ["integer", "null"], minimum: 2000, maximum: 2100 }, rankingRaw: string(500), gradeRaw: string(500),
  } } },
} };
export const CORRECTION_SCHEMA = { type: "object", additionalProperties: false, required: ["revision", "reason"], properties: {
  revision: { type: "integer", minimum: 1 }, reason: { type: "string", minLength: 1, maxLength: 1000, pattern: "\\S" }, context: CONTEXT_SCHEMA, confirmed: CONFIRMED_SCHEMA,
} };

export async function verifySalaryService(req, reply) {
  const secret = process.env.LARK_APP_SECRET;
  const timestamp = req.headers["x-mesa-timestamp"];
  const signature = req.headers["x-mesa-signature"];
  if (!secret || !/^\d{10,13}$/.test(String(timestamp || "")) || Math.abs(Date.now() - Number(timestamp)) > 300000 || !/^[a-f0-9]{64}$/.test(String(signature || ""))) return reply.code(401).send({ error: "salary_service_unauthorized" });
  const payload = req.body == null ? "" : JSON.stringify(req.body);
  const expected = createHmac("sha256", secret).update(`${timestamp}.${req.method}.${req.url.split("?")[0]}.${payload}`).digest("hex");
  if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) return reply.code(401).send({ error: "salary_service_unauthorized" });
}

export async function internalSalaryRoutes(app) {
  app.addHook("preValidation", verifySalaryService);
  app.get("/groups", { schema: { querystring: { type: "object", additionalProperties: false } } }, async () => ({ items: await app.prisma.salaryGroup.findMany({ where: { enabled: true }, select: { tenantKey: true, chatId: true } }) }));
  app.post("/submissions", { bodyLimit: 30 * 1024 * 1024, schema: { body: {
    type: "object", additionalProperties: false, required: ["tenantKey", "chatId", "messageId", "filename", "contentType", "data"], properties: {
      tenantKey: { ...string(), minLength: 1 }, chatId: { ...string(), minLength: 1 }, messageId: { ...string(), minLength: 1 }, senderOpenId: string(), messageCreatedAt: { type: "string", format: "date-time" }, filename: { ...string(), minLength: 1 }, contentType: { type: "string", enum: [...new Set(Object.values(MIME))] }, data: { type: "string", maxLength: Math.ceil(MAX_RESUME_SIZE / 3) * 4, minLength: 4 },
    },
  } } }, async (req, reply) => reply.code(202).send(await acceptSalaryResume(app, req.body)));
}

const groupSchema = { type: "object", additionalProperties: false, required: ["name", "tenantKey", "chatId", "enabled", "context", "operators", "memberUserIds"], properties: {
  name: { ...string(), minLength: 1 }, tenantKey: { ...string(), minLength: 1 }, chatId: { ...string(), minLength: 1 }, enabled: { type: "boolean" }, ownerId: uuid, revision: { type: "integer", minimum: 1 },
  memberUserIds: { type: "array", maxItems: 100, uniqueItems: true, items: uuid },
  operators: { type: "object", maxProperties: 100, additionalProperties: uuid }, context: CONTEXT_SCHEMA,
} };
const scope = (access) => access.isAdmin ? {} : { OR: [{ ownerId: access.userId }, { memberUserIds: { has: access.userId } }] };

export async function assertSalarySubmission(req, reply, id) {
  const access = await assertPage(req, reply, "campus");
  if (!access) return null;
  const row = await req.server.prisma.salarySubmission.findFirst({ where: { id, status: { not: "deleted" }, group: scope(access) }, include: { group: true, evaluations: { orderBy: { revision: "desc" } } } });
  if (!row) { reply.code(404).send({ error: "not_found" }); return null; }
  return row;
}

export default async function salaryRoutes(app) {
  app.addHook("preHandler", app.authenticate);
  app.get("/metadata", async (req, reply) => {
    const access = await assertPage(req, reply, "campus");
    if (!access) return;
    return { policyVersion: POLICY_VERSION, policyHash: POLICY_HASH, engineVersion: ENGINE_VERSION, majorCatalog: MAJOR_CATALOG, isAdmin: access.isAdmin, userId: access.userId, builtinSchools: BUILTIN_SCHOOLS, roles: ROLE_LABELS, categories: CATEGORIES };
  });
  app.get("/groups", async (req, reply) => {
    const access = await assertPage(req, reply, "campus");
    if (!access) return;
    return { items: await app.prisma.salaryGroup.findMany({ where: scope(access), orderBy: { createdAt: "desc" } }) };
  });
  const saveGroup = async (req, reply) => {
    const access = await assertPage(req, reply, "campus");
    if (!access) return;
    if (!access.isAdmin) return reply.code(403).send({ error: "forbidden" });
    const { revision, ...body } = req.body;
    const ownerId = body.ownerId || access.userId;
    const ids = [...new Set([ownerId, ...body.memberUserIds, ...Object.values(body.operators)])];
    const users = await app.prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } });
    if (users.length !== ids.length || Object.values(body.operators).some((id) => id !== ownerId && !body.memberUserIds.includes(id))) throw salaryError("操作人必须映射到群负责人或已授权且启用的MESA账号");
    if (body.context.cityType === "nonfirst" && ["北京", "上海", "广州", "深圳"].includes(body.context.contractCity?.replace(/市$/, ""))) throw salaryError("合同城市与一线/非一线类别冲突");
    if (req.params?.id) {
      if (!revision) throw salaryError("缺少配置版本", 409);
      const previous = await app.prisma.salaryGroup.findUnique({ where: { id: req.params.id } });
      if (!previous || previous.tenantKey !== body.tenantKey || previous.chatId !== body.chatId) throw salaryError("已有记录的群标识不能变更，请新增群配置", 409);
      const updated = await app.prisma.salaryGroup.updateMany({ where: { id: req.params.id, revision }, data: { ...body, ownerId, revision: { increment: 1 } } });
      if (!updated.count) throw salaryError("配置已更新，请刷新", 409, "salary_revision_conflict");
      return { item: await app.prisma.salaryGroup.findUnique({ where: { id: req.params.id } }) };
    }
    return { item: await app.prisma.salaryGroup.create({ data: { ...body, ownerId } }) };
  };
  app.post("/groups", { schema: { body: groupSchema } }, saveGroup);
  app.put("/groups/:id", { schema: { params, body: groupSchema } }, saveGroup);
  app.get("/schools", async (req, reply) => {
    if (!(await assertPage(req, reply, "campus"))) return;
    return { items: await app.prisma.salarySchool.findMany({ orderBy: { name: "asc" } }) };
  });
  app.post("/schools", { schema: { body: { type: "object", required: ["name", "tier", "overseas", "source"], additionalProperties: false, properties: {
    name: { ...string(), minLength: 1 }, tier: { type: ["string", "null"], enum: ["C9", "985", "211", "first", "second", "ordinary", null] }, overseas: { type: "boolean" }, source: { type: "string", minLength: 1, maxLength: 1000, pattern: "\\S" }, qsRank: { type: ["integer", "null"], minimum: 1, maximum: 10000 }, qsVersion: string(), revision: { type: "integer", minimum: 0 },
  } } } }, async (req, reply) => {
    const access = await assertPage(req, reply, "campus");
    if (!access) return;
    if (!access.isAdmin) return reply.code(403).send({ error: "forbidden" });
    const { revision = 0, name, ...definition } = req.body;
    if (definition.overseas && definition.qsRank && !definition.qsVersion?.trim()) throw salaryError("QS排名必须同时填写榜单版本");
    const existing = await app.prisma.salarySchool.findUnique({ where: { name } });
    if (existing) {
      const change = await app.prisma.salarySchool.updateMany({ where: { id: existing.id, revision }, data: { definition: { ...definition, name }, updatedBy: access.userId, revision: { increment: 1 } } });
      if (!change.count) throw salaryError("学校字典已更新，请刷新", 409, "salary_revision_conflict");
    } else {
      if (revision) throw salaryError("学校字典不存在，请刷新", 409);
      await app.prisma.salarySchool.create({ data: { name, definition: { ...definition, name }, updatedBy: access.userId } });
    }
    return { item: await app.prisma.salarySchool.findUnique({ where: { name } }) };
  });
  app.get("/submissions", { schema: { querystring: { type: "object", properties: { take: { type: "integer", minimum: 1, maximum: 100, default: 30 }, skip: { type: "integer", minimum: 0, default: 0 }, includeSuperseded: { type: "boolean", default: false } }, additionalProperties: false } } }, async (req, reply) => {
    const access = await assertPage(req, reply, "campus");
    if (!access) return;
    const where = { group: scope(access), status: { not: "deleted" }, ...(!req.query.includeSuperseded ? { supersededById: null } : {}) };
    const [items, total] = await Promise.all([app.prisma.salarySubmission.findMany({ where, take: req.query.take, skip: req.query.skip, orderBy: { createdAt: "desc" }, include: { group: { select: { name: true } }, evaluations: { orderBy: { revision: "desc" }, take: 1, select: { id: true, result: true, status: true, deliveryStatus: true, error: true } } } }), app.prisma.salarySubmission.count({ where })]);
    return { total, items: items.map(({ facts, fileKey, fileHash, identityKeys, overrides, ...row }) => ({ ...row, name: facts?.name || row.filename })) };
  });
  app.get("/submissions/:id", { schema: { params } }, async (req, reply) => {
    const row = await assertSalarySubmission(req, reply, req.params.id);
    if (!row) return;
    const { fileKey, identityKeys, ...item } = row;
    const latestId = row.supersededById || row.id;
    const resumeHistory = await app.prisma.salarySubmission.findMany({ where: { groupId: row.groupId, status: { not: "deleted" }, OR: [{ id: latestId }, { supersededById: latestId }] }, select: { id: true, filename: true, messageCreatedAt: true, status: true, supersededById: true }, orderBy: [{ messageCreatedAt: "desc" }, { createdAt: "desc" }] });
    return { item: { ...item, resumeHistory } };
  });
  app.patch("/submissions/:id", { schema: { params, body: CORRECTION_SCHEMA } }, async (req, reply) => {
    const row = await assertSalarySubmission(req, reply, req.params.id);
    if (!row) return;
    const evaluation = await requestSalaryEvaluation(app, row.id, { ...req.body, requestedBy: req.user.sub });
    return reply.code(202).send({ evaluationId: evaluation.id, revision: evaluation.revision });
  });
  app.delete("/submissions/:id", { schema: { params, body: { type: "object", additionalProperties: false, required: ["revision", "latestId", "confirm"], properties: { revision: { type: "integer", minimum: 1 }, latestId: uuid, confirm: { type: "boolean", enum: [true] } } } } }, async (req, reply) => {
    const row = await assertSalarySubmission(req, reply, req.params.id);
    if (!row) return;
    return deleteSalarySubmission(app, row.id, req.body);
  });
}
