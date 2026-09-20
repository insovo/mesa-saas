// 系统设置读写 helper
// 读取优先级: DB > env > 默认值
//
// 已知 setting key 与 env fallback:
//   kimi.api_key        → KIMI_API_KEY
//   kimi.model          → KIMI_MODEL (default "moonshot-v1-32k")
//   textin.app_id / textin.secret_code / textin.enabled → TEXTIN_* (文档层, 2026-09-20)
//   jev.api_key / jev.base_url / jev.model / jev.enabled / jev.mode → JEV_* (评估层, 2026-09-20)
//   eval.*              → 评估规则(阈值 / 默认权重 / 置信门控 / 报告策略 / 脱敏), 无 env, 代码默认

import { PrismaClient } from "@prisma/client";
import { encrypt, decrypt } from "./secrets.js";

// settings 表常驻一个 prisma 实例
const prisma = new PrismaClient();

// 简单内存缓存(30s TTL),避免每次解析都查 DB
const cache = new Map(); // key -> { value, expiresAt }
const CACHE_TTL_MS = 30_000;

export const SETTING_KEYS = {
  KIMI_API_KEY: "kimi.api_key",
  KIMI_MODEL: "kimi.model",
  KIMI_PROMPT: "kimi.prompt",  // 简历抽取 prompt: JSON 输出 profile(resume.v1)
  KIMI_REPORT_PROMPT: "kimi.report_prompt",     // 评估报告 prompt(只解释不改分)
  KIMI_JD_PROMPT: "kimi.jd_schema_prompt",      // JD 事实抽取 prompt

  TEXTIN_APP_ID: "textin.app_id",
  TEXTIN_SECRET_CODE: "textin.secret_code",
  TEXTIN_ENABLED: "textin.enabled",             // "true" | "false"
  TEXTIN_MAX_PAGES: "textin.max_pages",

  JEV_API_KEY: "jev.api_key",
  JEV_BASE_URL: "jev.base_url",
  JEV_MODEL: "jev.model",
  JEV_ENABLED: "jev.enabled",                   // "true" | "false"
  JEV_MODE: "jev.mode",                         // "shadow" | "primary"
  JEV_TIMEOUT_MS: "jev.timeout_ms",
  JEV_CONCURRENCY: "jev.concurrency",
  JEV_CACHE_TTL_S: "jev.cache_ttl_s",

  EVAL_THRESHOLDS: "eval.thresholds",           // JSON {A,B,C}
  EVAL_DEFAULT_WEIGHTS: "eval.default_weights", // JSON {MUST,CORE,PREFERRED,STABILITY}
  EVAL_CONFIDENCE_GATE: "eval.confidence_gate", // "0.5"
  EVAL_REPORT_POLICY: "eval.report_policy",     // auto_ab | auto_all | on_demand
  EVAL_PII_STRIP: "eval.pii_strip",             // "true" | "false"
};

function boolEnv(name, dflt) {
  const v = process.env[name];
  if (v == null || v === "") return dflt;
  return /^(1|true|yes|on)$/i.test(v) ? "true" : "false";
}

// env fallback 映射(prompt 没有 env fallback,在 kimi.js 里做 DEFAULT_PROMPT 兜底)
const ENV_FALLBACK = {
  "kimi.api_key": () => process.env.KIMI_API_KEY,
  "kimi.model":   () => process.env.KIMI_MODEL || "moonshot-v1-32k",
  "kimi.prompt":  () => null,
  "kimi.report_prompt": () => null,
  "kimi.jd_schema_prompt": () => null,

  "textin.app_id":      () => process.env.TEXTIN_APP_ID,
  "textin.secret_code": () => process.env.TEXTIN_SECRET_CODE,
  "textin.enabled":     () => boolEnv("TEXTIN_ENABLED", "false"),
  "textin.max_pages":   () => process.env.TEXTIN_MAX_PAGES || "10",

  "jev.api_key":     () => process.env.JEV_API_KEY,
  "jev.base_url":    () => process.env.JEV_BASE_URL || "https://api.typesafe.ai/v1",
  "jev.model":       () => process.env.JEV_MODEL || "jev-latest",
  "jev.enabled":     () => boolEnv("JEV_ENABLED", "false"),
  "jev.mode":        () => process.env.JEV_MODE || "shadow",
  "jev.timeout_ms":  () => process.env.JEV_TIMEOUT_MS || "20000",
  "jev.concurrency": () => process.env.JEV_CONCURRENCY || "5",
  "jev.cache_ttl_s": () => process.env.JEV_CACHE_TTL_S || String(7 * 24 * 3600),

  "eval.thresholds":      () => JSON.stringify({ A: 85, B: 70, C: 55 }),
  "eval.default_weights": () => JSON.stringify({ MUST: 25, CORE: 45, PREFERRED: 15, STABILITY: 15 }),
  "eval.confidence_gate": () => "0.5",
  "eval.report_policy":   () => "auto_ab",
  "eval.pii_strip":       () => "true",
};

// 哪些 key 需要加密(prompt / 开关 / 阈值不算敏感,不加密)
const ENCRYPTED_KEYS = new Set(["kimi.api_key", "textin.app_id", "textin.secret_code", "jev.api_key"]);

export function isEncryptedKey(key) {
  return ENCRYPTED_KEYS.has(key);
}

// 高敏感凭证:仅 admin 可写、永不明文回显(system.js 用)
export function isSecretKey(key) {
  return ENCRYPTED_KEYS.has(key);
}

// 读取生效值(DB 优先,空再走 env)
export async function getEffective(key) {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const row = await prisma.systemSetting.findUnique({ where: { key } });
  let value;
  if (row && row.value) {
    value = row.encrypted ? decrypt(row.value) : row.value;
  } else {
    value = ENV_FALLBACK[key]?.() ?? null;
  }
  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

// 布尔型 setting("true"/"false" 字符串)
export async function getEffectiveBool(key) {
  const v = await getEffective(key);
  return /^(1|true|yes|on)$/i.test(String(v ?? ""));
}

// JSON 型 setting,解析失败回退默认值
export async function getEffectiveJson(key, fallback) {
  const v = await getEffective(key);
  if (!v) return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}

// 数值型 setting
export async function getEffectiveNumber(key, fallback) {
  const v = Number(await getEffective(key));
  return Number.isFinite(v) ? v : fallback;
}

// 列出所有 setting(给 admin UI)
//   返回结构: [{ key, source: "db"|"env"|"none", maskedValue, updatedBy?, updatedAt? }]
export async function listAll() {
  const rows = await prisma.systemSetting.findMany();
  const dbMap = new Map(rows.map((r) => [r.key, r]));
  const allKeys = new Set([...Object.values(SETTING_KEYS), ...rows.map((r) => r.key)]);

  return Array.from(allKeys).map((key) => {
    const row = dbMap.get(key);
    if (row && row.value) {
      const plaintext = row.encrypted ? decrypt(row.value) : row.value;
      return {
        key,
        source: "db",
        encrypted: row.encrypted,
        // 永远不返回明文 — 即便 admin 也只能看 mask
        maskedValue: row.encrypted ? maskShort(plaintext) : plaintext,
        updatedBy: row.updatedBy,
        updatedAt: row.updatedAt,
      };
    }
    const envVal = ENV_FALLBACK[key]?.();
    if (envVal) {
      return {
        key,
        source: "env",
        encrypted: ENCRYPTED_KEYS.has(key),
        maskedValue: ENCRYPTED_KEYS.has(key) ? maskShort(envVal) : envVal,
        updatedBy: null,
        updatedAt: null,
      };
    }
    return { key, source: "none", encrypted: ENCRYPTED_KEYS.has(key), maskedValue: "", updatedBy: null, updatedAt: null };
  });
}

function maskShort(s) {
  if (!s) return "";
  if (s.length <= 7) return "*".repeat(s.length);
  return `${s.slice(0, 3)}${"*".repeat(Math.max(8, s.length - 7))}${s.slice(-4)}`;
}

export async function setOne({ key, value, updatedBy }) {
  const encryptedFlag = ENCRYPTED_KEYS.has(key);
  const stored = encryptedFlag ? encrypt(value) : value;
  const row = await prisma.systemSetting.upsert({
    where: { key },
    update: { value: stored, encrypted: encryptedFlag, updatedBy },
    create: { key, value: stored, encrypted: encryptedFlag, updatedBy },
  });
  cache.delete(key);
  return row;
}

export async function deleteOne(key) {
  try {
    await prisma.systemSetting.delete({ where: { key } });
  } catch (err) {
    if (err.code !== "P2025") throw err;  // not found 当成成功
  }
  cache.delete(key);
}

export function invalidateCache(key) {
  if (key) cache.delete(key);
  else cache.clear();
}
