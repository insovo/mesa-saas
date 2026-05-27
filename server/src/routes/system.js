// /api/system/settings — 仅 admin 可读写的系统级配置
// 用于覆盖 .env 默认值,例如 kimi.api_key 与 kimi.model
//
// 安全:
//   1. 所有路由强制 ADMIN 角色 (preHandler 校验)
//   2. value 字段加密存储(AES-256-GCM, key 从 JWT_SECRET 派生)
//   3. GET 永远不回明文,只 mask
//   4. Fastify schema 限定字段长度,防止超长写入

import { ping, DEFAULT_PROMPT, listModels } from "../lib/kimi.js";
import { getEffective, listAll, setOne, deleteOne, SETTING_KEYS } from "../lib/settings.js";

const ALLOWED_KEYS = new Set(Object.values(SETTING_KEYS));

const SET_BODY = {
  type: "object",
  required: ["value"],
  properties: {
    // prompt 可能很长,留 20000 字符上限,api_key 一般 < 100 字符
    value: { type: "string", minLength: 1, maxLength: 20000 },
  },
  additionalProperties: false,
};

// LLM 系统配置:允许 ADMIN, 或被 admin 显式授权 'system.llm_config' 的普通用户
// 每次请求从 DB 拉最新 permissions,避免 JWT 过期前用户被收回权限仍可调用
async function adminOrLlmPerm(req, reply) {
  if (!req.user) return reply.code(401).send({ error: "unauthorized" });
  if (req.user.role === "ADMIN") return;
  try {
    const u = await req.server.prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { permissions: true },
    });
    if (!u || !(u.permissions || []).includes("system.llm_config")) {
      return reply.code(403).send({ error: "forbidden", message: "需要 LLM 系统配置权限" });
    }
  } catch (err) {
    req.server.log?.error({ err }, "system perm check failed");
    return reply.code(500).send({ error: "internal" });
  }
}

export default async function systemRoutes(app) {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", adminOrLlmPerm);

  // 列出全部 settings(api_key 已 mask;prompt 长内容也返回明文便于 admin 编辑)
  app.get("/settings", async () => ({ items: await listAll() }));

  // 单 key 全文(prompt 需要完整内容才能编辑)
  // api_key 永不通过此接口返回明文 - 用 listAll 的 mask
  app.get("/settings/:key/full", async (req, reply) => {
    const { key } = req.params;
    if (!ALLOWED_KEYS.has(key)) return reply.code(400).send({ error: "unknown_key" });
    if (key === SETTING_KEYS.KIMI_API_KEY) {
      return reply.code(403).send({ error: "forbidden", message: "api_key 不允许明文回显" });
    }
    const value = await getEffective(key);
    let effectiveValue = value;
    if (!effectiveValue && key === SETTING_KEYS.KIMI_PROMPT) effectiveValue = DEFAULT_PROMPT;
    return { key, value: effectiveValue || "" };
  });

  // 当前 Kimi 账号真实可用的模型列表(动态拉取,10 分钟缓存)
  app.get("/models", async (req, reply) => {
    try {
      const ids = await listModels({ forceRefresh: req.query?.refresh === "1" });
      return { ids };
    } catch (err) {
      return reply.code(502).send({ error: "kimi_models_failed", message: err.message?.slice(0, 200) });
    }
  });

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
