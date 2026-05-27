// TOTP (RFC 6238) — 用 otpauth 库封装,生成密钥 / 校验码 / 备份码
// otpauth-uri 形如:otpauth://totp/MESA%20Recruit:admin@mesa.local?secret=XXX&issuer=MESA%20Recruit&algorithm=SHA1&digits=6&period=30
// 前端用 qrcode.react 渲染二维码即可。

import * as OTPAuth from "otpauth";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";

const ISSUER = "MESA Recruit";

// 生成新密钥 + 返回 secret(base32) + otpauth URI
export function generateSecret(label) {
  const secret = new OTPAuth.Secret({ size: 20 }); // 160 bit
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: label || "user",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
  return {
    secret: secret.base32,
    otpauthUrl: totp.toString(),
  };
}

// 校验 6 位 token,允许 ±1 step (30s) 时钟漂移
export function verifyToken(secretBase32, token) {
  if (!secretBase32 || !token) return false;
  const cleaned = String(token).replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
  const delta = totp.validate({ token: cleaned, window: 1 });
  return delta !== null;
}

// 生成 N 个备份码 + 各自 bcrypt 哈希
// 明文格式: XXXX-XXXX(8 位英数,无歧义字符,首位破折号分组)
export async function generateRecoveryCodes(count = 10) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 去掉易混 0 O I L 1
  const out = [];
  for (let i = 0; i < count; i += 1) {
    let s = "";
    for (let j = 0; j < 8; j += 1) {
      s += alphabet[crypto.randomInt(0, alphabet.length)];
    }
    out.push(`${s.slice(0, 4)}-${s.slice(4)}`);
  }
  const hashes = await Promise.all(out.map((c) => bcrypt.hash(c.replace("-", ""), 8)));
  return { plain: out, hashes };
}

// 校验备份码:命中后返回 { matched: true, remainingHashes: [...] } 让调用方更新 user 数据
export async function consumeRecoveryCode(storedHashes, plain) {
  if (!Array.isArray(storedHashes) || !plain) return { matched: false };
  const cleaned = String(plain).replace(/[-\s]+/g, "").toUpperCase();
  if (!/^[A-Z2-9]{8}$/.test(cleaned)) return { matched: false };
  for (let i = 0; i < storedHashes.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await bcrypt.compare(cleaned, storedHashes[i]);
    if (ok) {
      const remaining = storedHashes.slice(0, i).concat(storedHashes.slice(i + 1));
      return { matched: true, remainingHashes: remaining };
    }
  }
  return { matched: false };
}
