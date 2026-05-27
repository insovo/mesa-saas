// /api/audit-logs — 仅 ADMIN 可读
//
// 支持 filter:
//   action (字符串或 "<prefix>." 前缀匹配,如 "auth.")
//   actorId / entityType / entityId
//   from / to (ISO 时间)
//   skip / take 分页(take ≤ 200)

import { listLogs } from "../lib/audit.js";
import { loadUserAccess } from "../lib/permissions.js";

const LIST_QUERY = {
  type: "object",
  properties: {
    action: { type: "string", maxLength: 80 },
    actorId: { type: "string", format: "uuid" },
    entityType: { type: "string", maxLength: 40 },
    entityId: { type: "string", maxLength: 80 },
    from: { type: "string", format: "date-time" },
    to: { type: "string", format: "date-time" },
    skip: { type: "integer", minimum: 0, default: 0 },
    take: { type: "integer", minimum: 1, maximum: 200, default: 50 },
  },
};

export default async function auditRoutes(app) {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", async (req, reply) => {
    const access = await loadUserAccess(req);
    if (!access.isAdmin) {
      reply.code(403).send({ error: "forbidden", message: "仅 ADMIN 可查看审计日志" });
    }
  });

  app.get("/", { schema: { querystring: LIST_QUERY } }, async (req) => {
    const { action, actorId, entityType, entityId, from, to, skip, take } = req.query;
    return await listLogs(app.prisma, { action, actorId, entityType, entityId, from, to, skip, take });
  });
}
