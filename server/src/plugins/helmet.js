import fp from "fastify-plugin";
import helmet from "@fastify/helmet";

// 安全响应头(X-Content-Type-Options / X-Frame-Options / HSTS 等)。
// 本服务是纯 JSON API(前端由 nginx 独立服务),CSP / 跨源资源策略对 API 响应无意义,
// 且会误伤 R2 302 跳转等跨源场景,故关闭这几项,保留其余默认安全头。
export default fp(async (app) => {
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
  });
}, { name: "helmet" });
