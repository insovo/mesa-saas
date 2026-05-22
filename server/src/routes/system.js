// /api/system/settings — 仅 admin 可读写的系统级配置
// 用于覆盖 .env 默认值,例如 kimi.api_key 与 kimi.model
//
// 安全:
//   1. 所有路由强制 ADMIN 角色 (preHandler 校验)
//   2. value 字段加密存储(AES-256-GCM, key 从 JWT_SECRET 派生)
//   3. GET 永远不回明文,只 mask
//   4. Fastify schema 限定字段长度,防止超长写入

import { ping } from "../lib/kimi.js";
import { getEffective, listAll, setOne, deleteOne, SETTING_KEYS } from "../lib/settings.js";

const ALLOWED_KEYS = new Set(Object.values(SETTING_KEYS));

const SET_BODY = {
  type: "object",
  required: ["value"],
  properties: {
    value: { type: "string", minLength: 1, maxLength: 500 },
  },
  additionalProperties: false,
};

function adminOnly(req, reply, done) {
  if (req.user?.role !== "ADMIN") {
    reply.code(403).send({ error: "forbidden", message: "需要管理员权限" });
    return;
  }
  done();
}

export default async function systemRoutes(app) {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", adminOnly);

  // 列出全部 settings(已 mask)
  app.get("/settings", async () => ({ items: await listAll() }));

  // 单 key 写入
  app.put("/settings/:key", { schema: { body: SET_BODY } }, async (req, reply) => {
    const { key } = req.params;
    if (!ALLOWED_KEYS.has(key)) {
      return reply.code(400).send({ error: "unknown_key", message: `不支持的 setting key: ${key}` });
    }
    const row = await setOne({ key, value: req.body.value, updatedBy: req.user.sub });
    return { ok: true, key: row.key, updatedAt: row.updatedAt };
  });

  // 删除(回退到 env fallback)
  app.delete("/settings/:key", async (req, reply) => {
    const { key } = req.params;
    if (!ALLOWED_KEYS.has(key)) {
      return reply.code(400).send({ error: "unknown_key" });
    }
    await deleteOne(key);
    return { ok: true, key };
  });

  // 测试当前生效的 Kimi key 是否可用(1 token 探活)
  app.post("/settings/kimi.api_key/test", async (req, reply) => {
    const key = await getEffective(SETTING_KEYS.KIMI_API_KEY);
    if (!key) return reply.code(503).send({ error: "no_key", message: "当前无可用 Kimi key" });
    try {
      const result = await ping(key);
      return { ok: true, ...result };
    } catch (err) {
      return reply.code(502).send({
        error: "kimi_ping_failed",
        message: err.message?.slice(0, 200) || "Kimi 探活失败",
      });
    }
  });
}
