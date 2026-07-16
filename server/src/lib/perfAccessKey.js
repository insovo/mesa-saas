// 绩效评价公开链接访问密钥 — 生成 / 校验 / bcrypt hash + AES-GCM enc（admin 回显）
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { encrypt, decrypt } from "./secrets.js";

export const ACCESS_KEY_HEADER = "x-perf-access-key";
export const ACCESS_KEY_MIN_LEN = 6;
export const ACCESS_KEY_MAX_LEN = 10;
export const ACCESS_KEY_DEFAULT_LEN = 8;
export const ACCESS_KEY_MAX_FAILS = 5;
export const ACCESS_KEY_LOCK_MS = 10 * 60 * 1000; // 10 min
const BCRYPT_ROUNDS = 10;

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O
const LOWER = "abcdefghijkmnpqrstuvwxyz"; // no l/o
const DIGIT = "23456789"; // no 0/1
const ALL = UPPER + LOWER + DIGIT;

function pick(alphabet) {
  return alphabet[randomInt(alphabet.length)];
}

/** 生成 6–10 位密钥，保证至少各 1 个大写/小写/数字 */
export function generateAccessKey(len = ACCESS_KEY_DEFAULT_LEN) {
  const n = Math.min(ACCESS_KEY_MAX_LEN, Math.max(ACCESS_KEY_MIN_LEN, Number(len) || ACCESS_KEY_DEFAULT_LEN));
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT)];
  while (chars.length < n) chars.push(pick(ALL));
  // Fisher–Yates
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function validateAccessKeyFormat(key) {
  if (key == null || typeof key !== "string") {
    return { ok: false, message: "访问密钥须为 6–10 位，且含大小写字母与数字" };
  }
  const s = key.trim();
  if (s.length < ACCESS_KEY_MIN_LEN || s.length > ACCESS_KEY_MAX_LEN) {
    return { ok: false, message: "访问密钥须为 6–10 位，且含大小写字母与数字" };
  }
  if (!/^[A-Za-z0-9]+$/.test(s)) {
    return { ok: false, message: "访问密钥只能包含字母和数字" };
  }
  if (!/[A-Z]/.test(s) || !/[a-z]/.test(s) || !/[0-9]/.test(s)) {
    return { ok: false, message: "访问密钥须同时包含大写字母、小写字母和数字" };
  }
  return { ok: true, key: s };
}

export async function hashAccessKey(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function compareAccessKey(plain, hash) {
  if (!plain || !hash) return false;
  return bcrypt.compare(plain, hash);
}

/** 与 SystemSetting 相同：AES-256-GCM(HKDF(JWT_SECRET, mesa.settings.v1)) */
export function encryptAccessKey(plain) {
  if (!plain) return null;
  return encrypt(plain);
}

export function decryptAccessKey(encoded) {
  if (!encoded) return null;
  try {
    const plain = decrypt(encoded);
    return plain || null;
  } catch {
    return null;
  }
}

/** 写入 DB 用：bcrypt hash + AES enc 成对生成 */
export async function sealAccessKey(plain) {
  const hash = await hashAccessKey(plain);
  const enc = encryptAccessKey(plain);
  return { hash, enc };
}

export function readAccessKeyFromRequest(req) {
  const h = req.headers?.[ACCESS_KEY_HEADER] ?? req.headers?.["X-Perf-Access-Key"];
  if (typeof h === "string" && h.trim()) return h.trim();
  if (typeof req.body?.accessKey === "string" && req.body.accessKey.trim()) {
    return req.body.accessKey.trim();
  }
  return null;
}
