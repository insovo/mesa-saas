// /api/employees — CRUD + 阶段过滤

import { whereByIdOrExternal } from "../lib/idLookup.js";
import { buildEmployeeScopeWhere, loadUserAccess, hasModule } from "../lib/permissions.js";

const EMPLOYEE_BODY = {
  type: "object",
  properties: {
    externalId: { type: "string", maxLength: 64 },
    candidateId: { type: "string", format: "uuid", nullable: true },
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
    jobId: { type: "string", format: "uuid", nullable: true },
    dept: { type: "string", maxLength: 100, nullable: true },
    jdOwner: { type: "string", maxLength: 100, nullable: true },
    level: { type: "string", maxLength: 50, nullable: true },
    workLocation: { type: "string", maxLength: 100, nullable: true },
    jdMatch: { type: "integer", minimum: 0, maximum: 100, nullable: true },
    stage: { type: "string", maxLength: 50, nullable: true },
    plannedHireDate: { type: "string", format: "date-time", nullable: true },
    actualHireDate: { type: "string", format: "date-time", nullable: true },
    probationEndDate: { type: "string", format: "date-time", nullable: true },
    regularizeDate: { type: "string", format: "date-time", nullable: true },
    regularizeAdvice: { type: "string", maxLength: 100, nullable: true },
    hrbp: { type: "string", maxLength: 100, nullable: true },
    directManager: { type: "string", maxLength: 100, nullable: true },
    checklist: { type: "object" },
    probation: { type: "object" },
    events: { type: "array" },
    riskItems: { type: "array" },
    parser: { type: "string", maxLength: 50, nullable: true },
    parserConfidence: { type: "integer", minimum: 0, maximum: 100, nullable: true },
    source: { type: "string", maxLength: 50, nullable: true },
    attachment: { type: "string", maxLength: 500, nullable: true },
    tags: { type: "array", items: { type: "string" } },
  },
  additionalProperties: false,
};

const LIST_QUERY = {
  type: "object",
  properties: {
    q: { type: "string", maxLength: 100 },
    stage: { type: "string", maxLength: 50 },
    dept: { type: "string", maxLength: 100 },
    skip: { type: "integer", minimum: 0, default: 0 },
    take: { type: "integer", minimum: 1, maximum: 200, default: 100 },
  },
};

const DATE_FIELDS = ["plannedHireDate", "actualHireDate", "probationEndDate", "regularizeDate"];
function normalizeDates(data) {
  for (const f of DATE_FIELDS) {
    if (data[f]) data[f] = new Date(data[f]);
  }
  return data;
}

export default async function employeesRoutes(app) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", { schema: { querystring: LIST_QUERY } }, async (req) => {
    const { q, stage, dept, skip = 0, take = 100 } = req.query;
    const where = {};
    if (stage) where.stage = stage;
    if (dept) where.dept = dept;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { appliedFor: { contains: q, mode: "insensitive" } },
        { dept: { contains: q, mode: "insensitive" } },
        { school: { contains: q, mode: "insensitive" } },
      ];
    }
    const scopeWhere = await buildEmployeeScopeWhere(req);
    const finalWhere = scopeWhere ? { AND: [where, scopeWhere] } : where;
    const [items, total] = await Promise.all([
      app.prisma.employee.findMany({ where: finalWhere, orderBy: { updatedAt: "desc" }, skip, take }),
      app.prisma.employee.count({ where: finalWhere }),
    ]);
    return { items, total, skip, take };
  });

  app.get("/:id", async (req, reply) => {
    const scopeWhere = await buildEmployeeScopeWhere(req);
    const idWhere = whereByIdOrExternal(req.params.id);
    const where = scopeWhere ? { AND: [idWhere, scopeWhere] } : idWhere;
    const emp = await app.prisma.employee.findFirst({
      where,
      include: { candidate: true, job: true },
    });
    if (!emp) return reply.code(404).send({ error: "not_found" });
    return { employee: emp };
  });

  app.post("/", { schema: { body: { ...EMPLOYEE_BODY, required: ["name"] } } }, async (req, reply) => {
    const created = await app.prisma.employee.create({ data: normalizeDates({ ...req.body }) });
    return reply.code(201).send({ employee: created });
  });

  app.patch("/:id", { schema: { body: EMPLOYEE_BODY } }, async (req, reply) => {
    const { id } = req.params;
    try {
      const updated = await app.prisma.employee.update({ where: { id }, data: normalizeDates({ ...req.body }) });
      return { employee: updated };
    } catch (err) {
      if (err.code === "P2025") return reply.code(404).send({ error: "not_found" });
      throw err;
    }
  });

  app.delete("/:id", async (req, reply) => {
    const access = await loadUserAccess(req);
    if (!hasModule(access, "employee.delete")) {
      return reply.code(403).send({ error: "forbidden", message: "无删除入职员工权限" });
    }
    const { id } = req.params;
    try {
      await app.prisma.employee.delete({ where: { id } });
      return reply.code(204).send();
    } catch (err) {
      if (err.code === "P2025") return reply.code(404).send({ error: "not_found" });
      throw err;
    }
  });
}
