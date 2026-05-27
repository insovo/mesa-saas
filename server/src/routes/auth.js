import bcrypt from "bcryptjs";
import { loadUserAccess } from "../lib/permissions.js";
import { issueCode, consumeCode } from "../lib/verificationCodes.js";
import { writeLog } from "../lib/audit.js";
import { generateSecret, verifyToken as verifyTotp, generateRecoveryCodes, consumeRecoveryCode } from "../lib/totp.js";
import { validatePassword } from "../lib/passwordPolicy.js";
import { assertNotReused, recordPassword } from "../lib/passwordHistory.js";

const LOGIN_SCHEMA = {
  body: {
    type: "object",
    required: ["email", "password"],
    properties: {
      email: { type: "string", format: "email", maxLength: 200 },
      password: { type: "string", minLength: 6, maxLength: 200 },
    },
  },
};

const USER_INCLUDE = {
  accessPolicy: { select: { pageKeys: true, moduleKeys: true, mustChangePassword: true } },
  departmentScopes: {
    select: {
      departmentId: true,
      includeChildren: true,
      department: { select: { id: true, name: true } },
    },
  },
  jobScopes: {
    select: { jobId: true, job: { select: { id: true, title: true } } },
  },
};

// 改密通用流程:策略校验 → 历史校验 → bcrypt hash → 事务 (update user + record history + tv++ + mustChange=false)
async function changeUserPassword(prisma, { user, newPassword }) {
  const policy = validatePassword(newPassword, { email: user.email, name: user.name });
  if (!policy.ok) {
    const err = new Error("policy_failed");
    err.statusCode = 422;
    err.code = "password_policy_failed";
    err.message = policy.errors.join(" / ");
    err.payload = { errors: policy.errors };
    throw err;
  }
  await assertNotReused(prisma, user.id, newPassword); // 抛 422 password_reused

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    }),
    prisma.userAccessPolicy.upsert({
      where: { userId: user.id },
      create: { userId: user.id, pageKeys: [], moduleKeys: [], mustChangePassword: false },
      update: { mustChangePassword: false },
    }),
  ]);
  await recordPassword(prisma, user.id, passwordHash);
}

function shapeMe(user, access) {
  const policy = user.accessPolicy || { pageKeys: [], moduleKeys: [], mustChangePassword: false };
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatar: user.avatar,
    jobTitle: user.jobTitle,
    isActive: user.isActive,
    totpEnabled: !!user.totpEnabled,
    totpEnabledAt: user.totpEnabledAt || null,
    recoveryCodesRemaining: Array.isArray(user.totpRecoveryCodes) ? user.totpRecoveryCodes.length : 0,
    isAdmin: access.isAdmin,
    pageKeys: access.pageKeys,
    moduleKeys: access.moduleKeys,
    mustChangePassword: !!policy.mustChangePassword,
    departmentScopes: (user.departmentScopes || []).map((s) => ({
      departmentId: s.departmentId,
      departmentName: s.department?.name,
      includeChildren: s.includeChildren,
    })),
    jobScopes: (user.jobScopes || []).map((s) => ({
      jobId: s.jobId,
      jobTitle: s.job?.title,
    })),
  };
}

export default async function authRoutes(app) {
  app.post("/login", { schema: LOGIN_SCHEMA }, async (req, reply) => {
    const { email, password } = req.body;
    const user = await app.prisma.user.findUnique({ where: { email } });
    if (!user) {
      writeLog(app.prisma, { req, action: "auth.login_failed", diff: { email, reason: "no_such_user" } });
      return reply.code(401).send({ error: "invalid_credentials" });
    }
    if (user.isActive === false) {
      writeLog(app.prisma, { req, actorId: user.id, actorEmail: user.email, action: "auth.login_blocked", diff: { reason: "inactive" } });
      return reply.code(403).send({
        error: "user_inactive",
        message: "账号已停用,请联系管理员",
        deactivatedReason: user.deactivatedReason || null,
      });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      writeLog(app.prisma, { req, actorId: user.id, actorEmail: user.email, action: "auth.login_failed", diff: { reason: "bad_password" } });
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    // 启用了 TOTP → 走 MFA 第二步
    if (user.totpEnabled) {
      const mfaToken = await reply.jwtSign(
        { sub: user.id, email: user.email, role: user.role, tv: user.tokenVersion, purpose: "mfa" },
        { sign: { expiresIn: "5m" } },
      );
      writeLog(app.prisma, { req, actorId: user.id, actorEmail: user.email, action: "auth.login_mfa_required" });
      return reply.send({ mfaRequired: true, mfaToken });
    }

    const token = await reply.jwtSign({
      sub: user.id,
      email: user.email,
      role: user.role,
      tv: user.tokenVersion,
    });
    writeLog(app.prisma, { req, actorId: user.id, actorEmail: user.email, action: "auth.login" });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
        jobTitle: user.jobTitle,
      },
    };
  });

  // MFA 第二步:用 mfaToken + TOTP 6 位 或 备份码 换正式 token
  app.post(
    "/mfa-verify",
    {
      config: { allowMfaToken: true },
      preHandler: [app.authenticate],
      schema: {
        body: {
          type: "object",
          properties: {
            code: { type: "string", maxLength: 10 },
            recoveryCode: { type: "string", maxLength: 20 },
          },
        },
      },
    },
    async (req, reply) => {
      if (req.user?.purpose !== "mfa") {
        return reply.code(400).send({ error: "not_mfa_token" });
      }
      const userId = req.user.sub;
      const user = await app.prisma.user.findUnique({ where: { id: userId } });
      if (!user || !user.totpEnabled || !user.totpSecret) {
        return reply.code(400).send({ error: "totp_not_enabled" });
      }

      const { code, recoveryCode } = req.body;
      let pass = false;
      let usedRecovery = false;

      if (code) {
        pass = verifyTotp(user.totpSecret, code);
      }
      if (!pass && recoveryCode) {
        const r = await consumeRecoveryCode(user.totpRecoveryCodes, recoveryCode);
        if (r.matched) {
          pass = true;
          usedRecovery = true;
          await app.prisma.user.update({
            where: { id: userId },
            data: { totpRecoveryCodes: r.remainingHashes },
          });
        }
      }
      if (!pass) {
        writeLog(app.prisma, { req, actorId: userId, actorEmail: user.email, action: "auth.mfa_failed" });
        return reply.code(401).send({ error: "mfa_code_invalid", message: "验证码不正确" });
      }

      const token = await reply.jwtSign({
        sub: user.id, email: user.email, role: user.role, tv: user.tokenVersion,
      });
      writeLog(app.prisma, {
        req, actorId: userId, actorEmail: user.email,
        action: usedRecovery ? "auth.login_via_recovery" : "auth.login",
        diff: usedRecovery ? { remainingRecoveryCodes: user.totpRecoveryCodes.length - 1 } : null,
      });
      return {
        token,
        user: {
          id: user.id, email: user.email, name: user.name, role: user.role,
          avatar: user.avatar, jobTitle: user.jobTitle,
        },
        ...(usedRecovery ? { recoveryCodeUsed: true, remainingRecoveryCodes: user.totpRecoveryCodes.length - 1 } : {}),
      };
    }
  );

  app.get("/me", { preHandler: [app.authenticate] }, async (req) => {
    const userId = req.user.sub;
    const user = await app.prisma.user.findUnique({
      where: { id: userId },
      include: USER_INCLUDE,
    });
    if (!user) return { user: null };
    const access = await loadUserAccess(req);
    return { user: shapeMe(user, access) };
  });

  // 自助修改头像 / 昵称 / jobTitle
  app.patch(
    "/me",
    {
      preHandler: [app.authenticate],
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string", maxLength: 80 },
            avatar: { type: ["string", "null"], maxLength: 600 },
            jobTitle: { type: ["string", "null"], maxLength: 80 },
          },
        },
      },
    },
    async (req) => {
      const userId = req.user.sub;
      const updated = await app.prisma.user.update({
        where: { id: userId },
        data: {
          name: req.body.name ?? undefined,
          avatar: req.body.avatar === null ? null : req.body.avatar ?? undefined,
          jobTitle: req.body.jobTitle === null ? null : req.body.jobTitle ?? undefined,
        },
        include: USER_INCLUDE,
      });
      const access = await loadUserAccess(req);
      return { user: shapeMe(updated, access) };
    }
  );

  // 自助修改密码 — 必须验证当前密码
  app.post(
    "/me/change-password",
    {
      preHandler: [app.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["currentPassword", "newPassword"],
          properties: {
            currentPassword: { type: "string", minLength: 6, maxLength: 200 },
            newPassword: { type: "string", minLength: 10, maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      const userId = req.user.sub;
      const user = await app.prisma.user.findUnique({ where: { id: userId } });
      if (!user) return reply.code(404).send({ error: "not_found" });
      const ok = await bcrypt.compare(req.body.currentPassword, user.passwordHash);
      if (!ok) return reply.code(401).send({ error: "invalid_password", message: "当前密码错误" });

      try {
        await changeUserPassword(app.prisma, { user, newPassword: req.body.newPassword });
      } catch (err) {
        return reply.code(err.statusCode || 500).send({ error: err.code, message: err.message, ...(err.payload || {}) });
      }
      writeLog(app.prisma, { req, action: "auth.change_password" });
      return { ok: true };
    }
  );

  // ─── 修改密码(验证码版)─ 不需要当前密码 ──────────────────
  // 1) POST /me/request-password-code 发到登录邮箱
  // 2) POST /me/change-password-verify { code, newPassword }
  app.post(
    "/me/request-password-code",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const userId = req.user.sub;
      const user = await app.prisma.user.findUnique({ where: { id: userId } });
      if (!user) return reply.code(404).send({ error: "not_found" });
      try {
        const result = await issueCode(app.prisma, {
          email: user.email,
          userId,
          purpose: "CHANGE_PASSWORD",
          ip: req.ip,
        });
        writeLog(app.prisma, { req, action: "auth.request_password_code", entityType: "user", entityId: userId });
        return result;
      } catch (err) {
        return reply.code(err.statusCode || 500).send({
          error: err.code || "send_failed", message: err.message, ...(err.payload || {}),
        });
      }
    }
  );

  app.post(
    "/me/change-password-verify",
    {
      preHandler: [app.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["code", "newPassword"],
          properties: {
            code: { type: "string", minLength: 4, maxLength: 10 },
            newPassword: { type: "string", minLength: 10, maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      const userId = req.user.sub;
      const user = await app.prisma.user.findUnique({ where: { id: userId } });
      if (!user) return reply.code(404).send({ error: "not_found" });
      try {
        await consumeCode(app.prisma, { email: user.email, purpose: "CHANGE_PASSWORD", code: req.body.code });
      } catch (err) {
        return reply.code(err.statusCode || 400).send({ error: err.code, message: err.message });
      }
      try {
        await changeUserPassword(app.prisma, { user, newPassword: req.body.newPassword });
      } catch (err) {
        return reply.code(err.statusCode || 500).send({ error: err.code, message: err.message, ...(err.payload || {}) });
      }
      writeLog(app.prisma, { req, action: "auth.change_password_via_code", entityType: "user", entityId: userId });
      return { ok: true };
    }
  );

  // ─── 修改邮箱(双重验证)──────────────────────────────────
  // 1) POST /me/request-email-change-code { newEmail }
  //    → 同时给当前邮箱 + 新邮箱发码,各一份
  // 2) POST /me/change-email-verify { currentCode, newCode, newEmail }
  app.post(
    "/me/request-email-change-code",
    {
      preHandler: [app.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["newEmail"],
          properties: {
            newEmail: { type: "string", format: "email", maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      const userId = req.user.sub;
      const user = await app.prisma.user.findUnique({ where: { id: userId } });
      if (!user) return reply.code(404).send({ error: "not_found" });
      const newEmail = req.body.newEmail.toLowerCase().trim();
      if (newEmail === user.email.toLowerCase()) {
        return reply.code(400).send({ error: "same_email", message: "新邮箱与当前邮箱相同" });
      }
      const exist = await app.prisma.user.findUnique({ where: { email: newEmail } });
      if (exist) return reply.code(409).send({ error: "email_taken" });

      try {
        const cur = await issueCode(app.prisma, {
          email: user.email,
          userId,
          purpose: "CHANGE_EMAIL",
          ip: req.ip,
        });
        const next = await issueCode(app.prisma, {
          email: newEmail,
          userId,
          purpose: "CHANGE_EMAIL_NEW",
          ip: req.ip,
        });
        writeLog(app.prisma, { req, action: "auth.request_email_change", diff: { newEmail } });
        return {
          ok: true,
          currentEmail: user.email,
          newEmail,
          // dev 模式 fallback
          devCode: cur.devCode || next.devCode || null,
          devCodes: cur.devCode ? { current: cur.devCode, next: next.devCode } : null,
        };
      } catch (err) {
        return reply.code(err.statusCode || 500).send({
          error: err.code || "send_failed", message: err.message, ...(err.payload || {}),
        });
      }
    }
  );

  app.post(
    "/me/change-email-verify",
    {
      preHandler: [app.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["currentCode", "newCode", "newEmail"],
          properties: {
            currentCode: { type: "string", minLength: 4, maxLength: 10 },
            newCode: { type: "string", minLength: 4, maxLength: 10 },
            newEmail: { type: "string", format: "email", maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      const userId = req.user.sub;
      const user = await app.prisma.user.findUnique({ where: { id: userId } });
      if (!user) return reply.code(404).send({ error: "not_found" });
      const newEmail = req.body.newEmail.toLowerCase().trim();

      // 邮箱占用 double check
      const exist = await app.prisma.user.findUnique({ where: { email: newEmail } });
      if (exist && exist.id !== userId) return reply.code(409).send({ error: "email_taken" });

      try {
        await consumeCode(app.prisma, { email: user.email, purpose: "CHANGE_EMAIL", code: req.body.currentCode });
        await consumeCode(app.prisma, { email: newEmail, purpose: "CHANGE_EMAIL_NEW", code: req.body.newCode });
      } catch (err) {
        return reply.code(err.statusCode || 400).send({ error: err.code, message: err.message });
      }

      const oldEmail = user.email;
      const updated = await app.prisma.user.update({
        where: { id: userId },
        data: { email: newEmail },
        include: USER_INCLUDE,
      });
      writeLog(app.prisma, { req, action: "auth.change_email", entityType: "user", entityId: userId, diff: { from: oldEmail, to: newEmail } });

      const access = await loadUserAccess(req);
      return { user: shapeMe(updated, access) };
    }
  );

  // ─── 忘记密码 ─ 无登录态 ───────────────────────────────────
  // 1) POST /forgot-password { email }     — 即便邮箱不存在也返回 ok(防探针)
  // 2) POST /reset-password { email, code, newPassword }
  app.post(
    "/forgot-password",
    {
      schema: {
        body: {
          type: "object",
          required: ["email"],
          properties: { email: { type: "string", format: "email", maxLength: 200 } },
        },
      },
    },
    async (req, reply) => {
      const email = req.body.email.toLowerCase().trim();
      const user = await app.prisma.user.findUnique({ where: { email } });
      if (!user || user.isActive === false) {
        writeLog(app.prisma, { req, action: "auth.forgot_password_unknown", diff: { email } });
        // 故意不暴露存在性 — 返回 ok,但不发邮件
        return { ok: true };
      }
      try {
        const result = await issueCode(app.prisma, {
          email: user.email,
          userId: user.id,
          purpose: "RESET_PASSWORD",
          ip: req.ip,
        });
        writeLog(app.prisma, { req, action: "auth.forgot_password", entityType: "user", entityId: user.id });
        return result;
      } catch (err) {
        return reply.code(err.statusCode || 500).send({
          error: err.code || "send_failed", message: err.message, ...(err.payload || {}),
        });
      }
    }
  );

  app.post(
    "/reset-password",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "code", "newPassword"],
          properties: {
            email: { type: "string", format: "email", maxLength: 200 },
            code: { type: "string", minLength: 4, maxLength: 10 },
            newPassword: { type: "string", minLength: 10, maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      const email = req.body.email.toLowerCase().trim();
      const user = await app.prisma.user.findUnique({ where: { email } });
      if (!user || user.isActive === false) {
        return reply.code(400).send({ error: "invalid_or_expired", message: "验证码无效或已过期" });
      }
      try {
        await consumeCode(app.prisma, { email, purpose: "RESET_PASSWORD", code: req.body.code });
      } catch (err) {
        return reply.code(err.statusCode || 400).send({ error: err.code, message: err.message });
      }
      try {
        await changeUserPassword(app.prisma, { user, newPassword: req.body.newPassword });
      } catch (err) {
        return reply.code(err.statusCode || 500).send({ error: err.code, message: err.message, ...(err.payload || {}) });
      }
      writeLog(app.prisma, { req, actorId: user.id, actorEmail: user.email, action: "auth.reset_password", entityType: "user", entityId: user.id });
      return { ok: true };
    }
  );

  // ─── TOTP 2FA 管理 ───────────────────────────────────────────
  // 1) POST /me/totp-setup  → 生成 secret + otpauth URL,但不持久化(返回临时 setupToken 让前端再确认)
  // 2) POST /me/totp-verify-setup { secret, code } → 持久化 + 生成备份码(一次性返回明文)
  // 3) POST /me/totp-disable { code | recoveryCode | currentPassword } → 关闭

  app.post("/me/totp-setup", { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = req.user.sub;
    const user = await app.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.code(404).send({ error: "not_found" });
    if (user.totpEnabled) {
      return reply.code(409).send({ error: "totp_already_enabled", message: "已启用两步验证,请先关闭再重新设置" });
    }
    const { secret, otpauthUrl } = generateSecret(user.email);
    writeLog(app.prisma, { req, actorId: userId, actorEmail: user.email, action: "auth.totp_setup_start" });
    return { secret, otpauthUrl };
  });

  app.post(
    "/me/totp-verify-setup",
    {
      preHandler: [app.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["secret", "code"],
          properties: {
            secret: { type: "string", minLength: 16, maxLength: 64 },
            code: { type: "string", minLength: 6, maxLength: 6 },
          },
        },
      },
    },
    async (req, reply) => {
      const userId = req.user.sub;
      const user = await app.prisma.user.findUnique({ where: { id: userId } });
      if (!user) return reply.code(404).send({ error: "not_found" });
      if (user.totpEnabled) {
        return reply.code(409).send({ error: "totp_already_enabled" });
      }
      if (!verifyTotp(req.body.secret, req.body.code)) {
        return reply.code(400).send({ error: "totp_code_invalid", message: "验证码不正确,请检查授权器时间是否同步" });
      }
      const recovery = await generateRecoveryCodes(10);
      await app.prisma.user.update({
        where: { id: userId },
        data: {
          totpSecret: req.body.secret,
          totpEnabled: true,
          totpEnabledAt: new Date(),
          totpRecoveryCodes: recovery.hashes,
          tokenVersion: { increment: 1 }, // 启用后强制其他 session 重登
        },
      });
      writeLog(app.prisma, { req, actorId: userId, actorEmail: user.email, action: "auth.totp_enabled" });
      return {
        ok: true,
        recoveryCodes: recovery.plain, // 仅这一次返回明文
      };
    }
  );

  app.post(
    "/me/totp-disable",
    {
      preHandler: [app.authenticate],
      schema: {
        body: {
          type: "object",
          properties: {
            code: { type: "string", maxLength: 10 },
            recoveryCode: { type: "string", maxLength: 20 },
            currentPassword: { type: "string", maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      const userId = req.user.sub;
      const user = await app.prisma.user.findUnique({ where: { id: userId } });
      if (!user) return reply.code(404).send({ error: "not_found" });
      if (!user.totpEnabled) {
        return reply.code(400).send({ error: "totp_not_enabled" });
      }
      const { code, recoveryCode, currentPassword } = req.body || {};
      let pass = false;
      if (code && verifyTotp(user.totpSecret, code)) pass = true;
      if (!pass && recoveryCode) {
        const r = await consumeRecoveryCode(user.totpRecoveryCodes, recoveryCode);
        if (r.matched) pass = true;
      }
      if (!pass && currentPassword) {
        pass = await bcrypt.compare(currentPassword, user.passwordHash);
      }
      if (!pass) {
        return reply.code(401).send({ error: "totp_disable_unauthorized", message: "需要正确的 TOTP 码、备份码或当前密码任一" });
      }
      await app.prisma.user.update({
        where: { id: userId },
        data: {
          totpEnabled: false,
          totpSecret: null,
          totpEnabledAt: null,
          totpRecoveryCodes: [],
          tokenVersion: { increment: 1 },
        },
      });
      writeLog(app.prisma, { req, actorId: userId, actorEmail: user.email, action: "auth.totp_disabled" });
      return { ok: true };
    }
  );
}
