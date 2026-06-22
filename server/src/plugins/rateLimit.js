import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";

// 全局限流 —— 堵公开 token 端点的枚举/刷量,以及整体滥用。
//
// 关键:生产链路 Cloudflare → Nginx → Fastify,req.ip 会是 nginx 容器 IP(所有请求
// 共享一个 key,全局限流会误伤所有人)。因此按 cf-connecting-ip 取真实访客 IP。
//
// 分档(单点维护,无需改各路由文件):
//   /api/health   — 放行(监控高频探测)
//   /api/public/* — 最严,防 token 暴力枚举 / 公开上传刷量
//   /api/feishu*  — 中档,飞书回调来自固定 IP 段,留足正常回调余量
//   其余(登录态) — 宽松
//
// store:Redis 可用时跨进程/重启一致计数;不可用自动退回内存(单实例 docker 也够用)。
export default fp(async (app) => {
  const tier = (req) => {
    const u = req.url || "";
    if (u.startsWith("/api/health")) return 10000;
    if (u.startsWith("/api/public/")) return 40;
    if (u.startsWith("/api/feishu")) return 60;
    return 200;
  };

  await app.register(rateLimit, {
    global: true,
    max: tier,
    timeWindow: "1 minute",
    redis: app.redis, // undefined 时 @fastify/rate-limit 自动用内存 store
    keyGenerator: (req) =>
      req.headers["cf-connecting-ip"] ||
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.ip,
    // 必须带 statusCode:429 —— 否则被当作无状态码的 error 抛出,index.js 的全局
    // errorHandler 会按 `statusCode || 500` 误判成 500(且 CF 会拦 5xx,见坑#20)。
    errorResponseBuilder: (req, ctx) => ({
      statusCode: 429,
      error: "rate_limited",
      message: `请求过于频繁,请 ${Math.ceil(ctx.ttl / 1000)} 秒后重试`,
    }),
  });
}, { name: "rate-limit", dependencies: ["redis"] });
