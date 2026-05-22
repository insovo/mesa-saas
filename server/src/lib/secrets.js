// AES-256-GCM 对称加密(用于 SystemSetting 存敏感值如 API Key)
//
// 设计:
//   - 加密密钥: HKDF(JWT_SECRET, salt="mesa.settings.v1") → 32 字节 AES key
//     (复用 JWT_SECRET,避免再加 env;JWT_SECRET 已经是 64 hex 强随机)
//   - IV: 每次 12 字节随机
//   - 输出: base64(iv || authTag || ciphertext) 单字段存储
//
// 注意: 如果 JWT_SECRET 轮换,所有加密的 SystemSetting 都会变成解不开
//       (因为加密密钥从 JWT_SECRET 派生)。轮换前请先 admin UI 解密 → 改 JWT_SECRET → 重新加密。

import crypto from "node:crypto";

const SALT = Buffer.from("mesa.settings.v1");
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey() {
  const jwt = process.env.JWT_SECRET;
  if (!jwt) throw new Error("JWT_SECRET not set — cannot derive settings encryption key");
  // HKDF-SHA256 派生 32 字节 AES key
  return crypto.hkdfSync("sha256", Buffer.from(jwt), SALT, Buffer.from("aes-256-gcm"), 32);
}

export function encrypt(plaintext) {
  if (plaintext == null || plaintext === "") return "";
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decrypt(encoded) {
  if (!encoded) return "";
  const buf = Buffer.from(encoded, "base64");
  if (buf.length <= IV_LEN + TAG_LEN) throw new Error("ciphertext too short");
  const key = getKey();
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

// 把 sk-XXXXXXXXXXXXXXXXXXXXXX 变成 sk-***************XXXX(前 3 + 后 4)
export function mask(secret) {
  if (!secret) return "";
  if (secret.length <= 7) return "*".repeat(secret.length);
  return `${secret.slice(0, 3)}${"*".repeat(Math.max(8, secret.length - 7))}${secret.slice(-4)}`;
}
