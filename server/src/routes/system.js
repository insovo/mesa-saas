// /api/system/settings — LLM / 文档层 / 评估层 系统级配置
// 用于覆盖 .env 默认值:kimi.* / textin.* / jev.* / eval.*
//
// 安全:
//   1. 所有路由要求 ADMIN 或被授权 system.llm pageKey(preHandler)
//   2. 凭证类 key(kimi.api_key / textin.app_id / textin.secret_code / jev.api_key)加密存储、仅 admin 可写、永不明文回显
//   3. Fastify schema 限定字段长度,防止超长写入

import { ping, DEFAULT_PROMPT, listModels } from "../lib/kimi.js";
import { ping as textinPing } from "../lib/textin.js";
import { ping as jevPing, isJevConfigured, isJevEnabled, jevMode } from "../lib/jev.js";
import { isTextinConfigured, isTextinEnabled } from "../lib/textin.js";
import { isKimiConfigured } from "../lib/kimi.js";
import { buildJdFactsPrompt, buildReportPrompt } from "../lib/prompts/index.js";
import { getEffective, listAll, setOne, deleteOne, SETTING_KEYS, isSecretKey } from "../lib/settings.js";
import { loadUserAccess, hasPage } from "../lib/permissions.js";

const ALLOWED_KEYS = new Set(Object.values(SETTING_KEYS));
const DEFAULT_TEXT = {
  [SETTING_KEYS.KIMI_PROMPT]: () => DEFAULT_PROMPT,
  [SETTING_KEYS.KIMI_JD_PROMPT]: () => buildJdFactsPrompt(),
  [SETTING_KEYS.KIMI_REPORT_PROMPT]: () => buildReportPrompt(),
};

const SET_BODY = {
  type: "object",
  required: ["value"],
  properties: {
    value: { type: "string", minLength: 1, maxLength: 20000 },
  },
  additionalProperties: false,
};

async function requireLlmAccess(req, reply) {
  if (req.user?.role === "ADMIN") return;
  const access = await loadUserAccess(req);
  if (!access.isActive) {
    return reply.code(403).send({ error: "user_inactive", message: "账号已停用" });
  }
  if (!hasPage(access, "system.llm")) {
    return reply.code(403).send({ error: "forbidden", message: "需要 LLM 系统配置权限" });
  }
}

// 凭证类 key 写操作仅 admin(高敏感,不开给被授权的普通用户)
function adminOnlyForSecrets(req, reply, done) {
  if (req.user?.role === "ADMIN") return done();
  if (isSecretKey(req.params?.key)) {
    return reply.code(403).send({ error: "forbidden", message: "仅管理员可修改凭证类配置" });
  }
  done();
}

export default async function systemRoutes(app) {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", requireLlmAccess);

  app.get("/settings", async () => ({ items: await listAll() }));

  // 单 key 全文(prompt / JSON 配置需要完整内容才能编辑);凭证类永不回显
  app.get("/settings/:key/full", async (req, reply) => {
    const { key } = req.params;
    if (!ALLOWED_KEYS.has(key)) return reply.code(400).send({ error: "unknown_key" });
    if (isSecretKey(key)) return reply.code(403).send({ error: "forbidden", message: "凭证不允许明文回显" });
    const value = await getEffective(key);
    const effectiveValue = value || DEFAULT_TEXT[key]?.() || "";
    return { key, value: effectiveValue };
  });

  app.get("/models", async (req, reply) => {
    try {
      const ids = await listModels({ forceRefresh: req.query?.refresh === "1" });
      return { ids };
    } catch (err) {
      return reply.code(502).send({ error: "kimi_models_failed", message: err.message?.slice(0, 200) });
    }
  });

  // 三个供应商状态(健康检查 / 前端配置面板)
  app.get("/providers", async () => {
    const [kimi, textinConfigured, textinEnabled, jevConfigured, jevEnabled, mode] = await Promise.all([
      isKimiConfigured(), isTextinConfigured(), isTextinEnabled(), isJevConfigured(), isJevEnabled(), jevMode(),
    ]);
    return {
      kimi: { configured: kimi },
      textin: { configured: textinConfigured, enabled: textinEnabled },
      jev: { configured: jevConfigured, enabled: jevEnabled, mode },
    };
  });

  app.put("/settings/:key", { schema: { body: SET_BODY }, preHandler: adminOnlyForSecrets }, async (req, reply) => {
    const { key } = req.params;
    if (!ALLOWED_KEYS.has(key)) return reply.code(400).send({ error: "unknown_key", message: `不支持的 setting key: ${key}` });
    // 布尔 / 枚举 / JSON 类 key 做最小校验,避免写入非法值导致运行时异常
    const v = req.body.value.trim();
    if ([SETTING_KEYS.TEXTIN_ENABLED, SETTING_KEYS.JEV_ENABLED, SETTING_KEYS.EVAL_PII_STRIP].includes(key) && !/^(true|false)$/i.test(v)) {
      return reply.code(400).send({ error: "invalid_value", message: "只能是 true / false" });
    }
    if (key === SETTING_KEYS.JEV_MODE && !["shadow", "primary"].includes(v)) return reply.code(400).send({ error: "invalid_value", message: "只能是 shadow / primary" });
    if (key === SETTING_KEYS.EVAL_REPORT_POLICY && !["auto_ab", "auto_all", "on_demand"].includes(v)) return reply.code(400).send({ error: "invalid_value", message: "只能是 auto_ab / auto_all / on_demand" });
    if ([SETTING_KEYS.EVAL_THRESHOLDS, SETTING_KEYS.EVAL_DEFAULT_WEIGHTS].includes(key)) {
      try { const j = JSON.parse(v); if (!j || typeof j !== "object") throw new Error(); } catch { return reply.code(400).send({ error: "invalid_value", message: "必须是 JSON 对象" }); }
    }
    if ([SETTING_KEYS.EVAL_CONFIDENCE_GATE, SETTING_KEYS.TEXTIN_MAX_PAGES, SETTING_KEYS.JEV_TIMEOUT_MS, SETTING_KEYS.JEV_CONCURRENCY, SETTING_KEYS.JEV_CACHE_TTL_S].includes(key) && !Number.isFinite(Number(v))) {
      return reply.code(400).send({ error: "invalid_value", message: "必须是数字" });
    }
    const row = await setOne({ key, value: v, updatedBy: req.user.sub });
    return { ok: true, key: row.key, updatedAt: row.updatedAt };
  });

  app.delete("/settings/:key", { preHandler: adminOnlyForSecrets }, async (req, reply) => {
    const { key } = req.params;
    if (!ALLOWED_KEYS.has(key)) return reply.code(400).send({ error: "unknown_key" });
    await deleteOne(key);
    return { ok: true, key };
  });

  // 探活:Kimi(1 token)/ TextIn(1 字节非法文件,不计费)/ Jev(1 道 noul)
  app.post("/settings/kimi.api_key/test", async (req, reply) => {
    const key = await getEffective(SETTING_KEYS.KIMI_API_KEY);
    if (!key) return reply.code(503).send({ error: "no_key", message: "当前无可用 Kimi key" });
    try {
      return { ok: true, ...(await ping(key)) };
    } catch (err) {
      return reply.code(502).send({ error: "kimi_ping_failed", message: err.message?.slice(0, 200) || "Kimi 探活失败" });
    }
  });
  app.post("/settings/textin/test", async (req, reply) => {
    if (!(await isTextinConfigured())) return reply.code(503).send({ error: "no_key", message: "TextIn 凭证未配置" });
    try {
      return await textinPing();
    } catch (err) {
      return reply.code(err.statusCode && err.statusCode < 500 ? err.statusCode : 502).send({ error: err.code || "textin_ping_failed", message: err.message?.slice(0, 200) || "TextIn 探活失败" });
    }
  });
  app.post("/settings/jev/test", async (req, reply) => {
    if (!(await isJevConfigured())) return reply.code(503).send({ error: "no_key", message: "Jev API key 未配置" });
    try {
      return await jevPing();
    } catch (err) {
      return reply.code(err.statusCode && err.statusCode < 500 ? err.statusCode : 502).send({ error: err.code || "jev_ping_failed", message: err.message?.slice(0, 200) || "Jev 探活失败" });
    }
  });
}
