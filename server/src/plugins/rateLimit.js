import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";
import crypto from "node:crypto";

// 全局限流 —— 堵公开 token 端点的枚举/刷量,以及整体滥用。
//
// Cloudflare → Nginx → Fastify 时 req.ip 是代理地址。认证用户按账号、
// 分享访客按会话计数，另以真实 IP 设置宽松的总量闸。
//
// 分档(单点维护,无需改各路由文件):
//   /api/health   — 放行(监控高频探测)
//   /api/public/* — 最严,防 token 暴力枚举 / 公开上传刷量
//   /api/feishu*  — 中档,飞书回调来自固定 IP 段,留足正常回调余量
//   其余(登录态) — 宽松
//
// store:Redis 可用时跨进程/重启一致计数;不可用自动退回内存(单实例 docker 也够用)。
export default fp(async (app) => {
  const ipCounters = new Map();
  const visitorId = (req) => {
    const value = req.headers["x-mesa-visitor"] || req.headers.cookie?.match(/(?:^|;\s*)mesa_visitor=([^;]+)/)?.[1];
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || "") ? value : null;
  };
  const clientIp = (req) => req.headers["x-real-ip"] || req.ip;
  const identity = (req) => {
    const ip = clientIp(req);
    const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
    if (token && app.jwt) {
      try {
        const actor = app.jwt.verify(token);
        if (actor.sub) {
          const visitor = actor.aud === "interview-queue-share" && !actor.viewerId ? visitorId(req) : null;
          return { key: `actor:${actor.aud || "staff"}:${actor.viewerId || visitor || actor.sub}`, ip, identified: true };
        }
      } catch { /* 无效凭证按 IP 限流 */ }
    }
    const visitor = visitorId(req);
    if (visitor && (req.url.startsWith("/api/public/") || req.url.startsWith("/api/campus/public/"))) {
      return { key: `visitor:${visitor}`, ip, identified: true };
    }
    return { key: `ip:${ip}`, ip, identified: false };
  };
  const tier = (req) => {
    const u = req.url || "";
    if (u.startsWith("/api/health")) return 10000;
    if (u.startsWith("/api/public/interview-queues/")) return 600;
    if (u.startsWith("/api/public/")) return 40;
    if (u.startsWith("/api/campus/public/")) return 90;
    if (u.startsWith("/api/feishu")) return 60;
    return 200;
  };

  // 已识别访客单独计数，同时保留宽松的 IP 总量闸，防止轮换访客标识绕过限流。
  app.addHook("onRequest", async (req, reply) => {
    if (req.url.startsWith("/api/health")) return;
    const actor = identity(req);
    if (!actor.identified) return;
    const limit = req.url.startsWith("/api/public/") || req.url.startsWith("/api/campus/public/") ? 3000 : 6000;
    const minute = Math.floor(Date.now() / 60000);
    const key = `mesa:rate:ip:${crypto.createHash("sha256").update(actor.ip).digest("hex")}:${minute}`;
    let count;
    if (app.redis) {
      try {
        count = await app.redis.incr(key);
        if (count === 1) await app.redis.expire(key, 70);
      } catch (err) { app.log.warn({ err }, "IP rate counter unavailable"); }
    }
    if (count == null) {
      count = (ipCounters.get(key) || 0) + 1;
      ipCounters.set(key, count);
      if (ipCounters.size > 10000) for (const entry of ipCounters.keys()) if (!entry.endsWith(`:${minute}`)) ipCounters.delete(entry);
    }
    if (count > limit) return reply.code(429).send({ error: "rate_limited", message: "该网络请求过于频繁，请稍后重试" });
  });

  await app.register(rateLimit, {
    global: true,
    max: tier,
    timeWindow: "1 minute",
    redis: app.redis, // undefined 时 @fastify/rate-limit 自动用内存 store
    keyGenerator: (req) => identity(req).key,
    // 必须带 statusCode:429 —— 否则被当作无状态码的 error 抛出,index.js 的全局
    // errorHandler 会按 `statusCode || 500` 误判成 500(且 CF 会拦 5xx,见坑#20)。
    errorResponseBuilder: (req, ctx) => ({
      statusCode: 429,
      error: "rate_limited",
      message: `请求过于频繁,请 ${Math.ceil(ctx.ttl / 1000)} 秒后重试`,
    }),
  });
}, { name: "rate-limit", dependencies: ["redis"] });
