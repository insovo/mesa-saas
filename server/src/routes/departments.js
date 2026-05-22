// /api/departments — CRUD

import { whereByIdOrExternal } from "../lib/idLookup.js";

const DEPT_BODY = {
  type: "object",
  properties: {
    externalId: { type: "string", maxLength: 64 },
    name: { type: "string", minLength: 1, maxLength: 100 },
    code: { type: "string", maxLength: 50, nullable: true },
    parentId: { type: "string", format: "uuid", nullable: true },
    head: { type: "string", maxLength: 100, nullable: true },
    headcount: { type: "integer", minimum: 0, maximum: 99999 },
    openHc: { type: "integer", minimum: 0, maximum: 9999 },
  },
  additionalProperties: false,
};

export default async function departmentsRoutes(app) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async () => {
    const items = await app.prisma.department.findMany({
      orderBy: { name: "asc" },
      include: { children: { select: { id: true, name: true } } },
    });
    return { items, total: items.length };
  });

  app.get("/:id", async (req, reply) => {
    const dept = await app.prisma.department.findFirst({
      where: whereByIdOrExternal(req.params.id),
      include: { children: true, parent: true },
    });
    if (!dept) return reply.code(404).send({ error: "not_found" });
    return { department: dept };
  });

  app.post("/", { schema: { body: { ...DEPT_BODY, required: ["name"] } } }, async (req, reply) => {
    const created = await app.prisma.department.create({ data: req.body });
    return reply.code(201).send({ department: created });
  });

  app.patch("/:id", { schema: { body: DEPT_BODY } }, async (req, reply) => {
    const { id } = req.params;
    try {
      const updated = await app.prisma.department.update({ where: { id }, data: req.body });
      return { department: updated };
    } catch (err) {
      if (err.code === "P2025") return reply.code(404).send({ error: "not_found" });
      throw err;
    }
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = req.params;
    try {
      await app.prisma.department.delete({ where: { id } });
      return reply.code(204).send();
    } catch (err) {
      if (err.code === "P2025") return reply.code(404).send({ error: "not_found" });
      throw err;
    }
  });
}
