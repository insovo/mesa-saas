// 系统设置读写 helper
// 读取优先级: DB > env > undefined
//
// 已知 setting key 与 env fallback:
//   kimi.api_key → KIMI_API_KEY
//   kimi.model   → KIMI_MODEL (default "moonshot-v1-32k")

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
};

// env fallback 映射
const ENV_FALLBACK = {
  "kimi.api_key": () => process.env.KIMI_API_KEY,
  "kimi.model":   () => process.env.KIMI_MODEL || "moonshot-v1-32k",
};

// 哪些 key 需要加密
const ENCRYPTED_KEYS = new Set(["kimi.api_key"]);

export function isEncryptedKey(key) {
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
