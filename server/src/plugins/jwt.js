// JWT plugin
// 签发的 token payload: { sub, email, role, tv }
//   tv = User.tokenVersion;改密/重置/强制下线/启用 TOTP 时 ++,使旧 token 全部失效
//
// authenticate hook 校验顺序:
//   1. jwtVerify(签名/过期)
//   2. 查 user.tokenVersion + isActive(一行,只 select 必要字段)
//   3. tv 不一致 → 401 session_invalid
//   4. isActive=false → 403 user_inactive + deactivatedReason
//
// MFA 临时 token (purpose=mfa) 也走此 hook 但被 routes/auth.js 的 /mfa-verify 单独识别,
// 别的路由不应收到 purpose=mfa 的 token — 在 authenticate 里直接拒绝。

import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";

export default fp(async (app) => {
  await app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET,
    sign: { expiresIn: "7d" },
  });

  app.decorate("authenticate", async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch (err) {
      return reply.code(401).send({ error: "unauthorized", message: err.message });
    }
    // MFA 临时 token 只允许走 /api/auth/mfa-verify
    if (req.user?.purpose === "mfa" && !req.routeOptions?.config?.allowMfaToken) {
      return reply.code(401).send({ error: "mfa_token_unusable", message: "请先完成两步验证" });
    }
    if (!req.user?.sub) {
      return reply.code(401).send({ error: "bad_token" });
    }
    const u = await req.server.prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { id: true, isActive: true, tokenVersion: true, deactivatedReason: true },
    });
    if (!u) return reply.code(401).send({ error: "session_invalid", message: "账号不存在" });
    if (u.isActive === false) {
      return reply.code(403).send({
        error: "user_inactive",
        message: "账号已停用",
        deactivatedReason: u.deactivatedReason || null,
      });
    }
    const payloadTv = req.user.tv ?? 0;
    if (u.tokenVersion !== payloadTv) {
      return reply.code(401).send({ error: "session_invalid", message: "会话已失效,请重新登录" });
    }
  });
}, { name: "jwt", dependencies: [] });
