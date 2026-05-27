// 邮箱验证码 — 生成 / 发送 / 校验 / 限流
//
// 流程:
//   1. issue() 生成 6 位数字 → bcrypt hash 入库 → 邮件发送
//   2. 限流:同 (email, purpose) 60 秒内只能再请求 1 次;1 小时内最多 5 次
//   3. consume() 校验:必须在 expiresAt 前 + 未 consumed + attemptCount < 5
//      用 bcrypt.compare 比较;每次错都 attemptCount++,超 5 次该条作废
//   4. 校验成功后立刻 consumedAt = now(),防止重放

import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { isEmailConfigured, renderVerificationEmail, sendEmail } from "./email.js";

const CODE_TTL_MS = 5 * 60 * 1000;   // 5 分钟
const RESEND_INTERVAL_MS = 60 * 1000; // 60 秒重发间隔
const HOURLY_LIMIT = 5;               // 每邮箱每 purpose 每小时上限
const MAX_ATTEMPTS = 5;               // 单条 code 最多 5 次尝试

const VALID_PURPOSES = new Set(["CHANGE_EMAIL", "CHANGE_EMAIL_NEW", "CHANGE_PASSWORD", "RESET_PASSWORD"]);

function gen6() {
  // 6 位数字,首位不为 0 不重要,均匀分布即可
  return String(crypto.randomInt(100000, 1000000));
}

// 创建并发送验证码 — 调用方传 ip 用于审计 + 限流维度
// 返回 { ok, devCode? }  — 仅 dev 模式(没配 RESEND_API_KEY)返回 devCode,生产永不返回
export async function issueCode(prisma, { email, userId = null, purpose, ip = null }) {
  if (!VALID_PURPOSES.has(purpose)) {
    throw Object.assign(new Error("bad_purpose"), { statusCode: 400, code: "bad_purpose" });
  }
  email = String(email || "").toLowerCase().trim();
  if (!email) throw Object.assign(new Error("missing_email"), { statusCode: 400, code: "missing_email" });

  const now = new Date();

  // 限流 1:60s 重发间隔
  const recent = await prisma.emailVerificationCode.findFirst({
    where: { email, purpose, createdAt: { gt: new Date(now.getTime() - RESEND_INTERVAL_MS) } },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    const waitSecs = Math.ceil((recent.createdAt.getTime() + RESEND_INTERVAL_MS - now.getTime()) / 1000);
    throw Object.assign(new Error("resend_too_soon"), {
      statusCode: 429, code: "resend_too_soon", retryAfter: waitSecs,
      payload: { retryAfter: waitSecs },
    });
  }

  // 限流 2:小时上限
  const hourlyCount = await prisma.emailVerificationCode.count({
    where: { email, purpose, createdAt: { gt: new Date(now.getTime() - 3600 * 1000) } },
  });
  if (hourlyCount >= HOURLY_LIMIT) {
    throw Object.assign(new Error("hourly_limit_exceeded"), {
      statusCode: 429, code: "hourly_limit_exceeded",
    });
  }

  const code = gen6();
  const codeHash = await bcrypt.hash(code, 8);

  await prisma.emailVerificationCode.create({
    data: {
      email,
      userId,
      purpose,
      codeHash,
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      ip,
    },
  });

  // 发送邮件
  const { subject, html, text } = renderVerificationEmail({ code, purpose });
  try {
    await sendEmail({ to: email, subject, html, text });
  } catch (err) {
    // 不抹掉验证码,但提示前端
    throw Object.assign(new Error("email_send_failed"), {
      statusCode: err.statusCode || 502,
      code: err.code || "email_send_failed",
    });
  }

  // dev 模式回显(没配 RESEND_API_KEY 才回);生产绝不回
  return {
    ok: true,
    devCode: isEmailConfigured() ? null : code,
  };
}

// 校验验证码 — 成功后立即 consumedAt = now(防重放)
// 失败:attemptCount++;超过 MAX_ATTEMPTS 即作废该条记录
export async function consumeCode(prisma, { email, purpose, code }) {
  email = String(email || "").toLowerCase().trim();
  code = String(code || "").trim();
  if (!email || !code) {
    throw Object.assign(new Error("missing_input"), { statusCode: 400, code: "missing_input" });
  }
  if (!VALID_PURPOSES.has(purpose)) {
    throw Object.assign(new Error("bad_purpose"), { statusCode: 400, code: "bad_purpose" });
  }

  // 最近一条未消费 + 未过期的
  const row = await prisma.emailVerificationCode.findFirst({
    where: {
      email,
      purpose,
      consumedAt: null,
      expiresAt: { gt: new Date() },
      attemptCount: { lt: MAX_ATTEMPTS },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!row) {
    throw Object.assign(new Error("code_invalid_or_expired"), {
      statusCode: 400, code: "code_invalid_or_expired", message: "验证码已失效,请重新申请",
    });
  }

  const ok = await bcrypt.compare(code, row.codeHash);
  if (!ok) {
    await prisma.emailVerificationCode.update({
      where: { id: row.id },
      data: { attemptCount: { increment: 1 } },
    });
    throw Object.assign(new Error("code_mismatch"), {
      statusCode: 400, code: "code_mismatch", message: "验证码不正确",
    });
  }

  await prisma.emailVerificationCode.update({
    where: { id: row.id },
    data: { consumedAt: new Date() },
  });
  return { ok: true, userId: row.userId };
}
