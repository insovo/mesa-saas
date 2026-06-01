import "dotenv/config";
import Fastify from "fastify";
import prismaPlugin from "./plugins/prisma.js";
import jwtPlugin from "./plugins/jwt.js";
import corsPlugin from "./plugins/cors.js";
import redisPlugin from "./plugins/redis.js";
import r2Plugin from "./plugins/r2.js";
import authRoutes from "./routes/auth.js";
import candidatesRoutes from "./routes/candidates.js";
import jobsRoutes from "./routes/jobs.js";
import departmentsRoutes from "./routes/departments.js";
import employeesRoutes from "./routes/employees.js";
import interviewsRoutes from "./routes/interviews.js";
import dashboardRoutes from "./routes/dashboard.js";
import reportsRoutes from "./routes/reports.js";
import storageRoutes from "./routes/storage.js";
import resumesRoutes from "./routes/resumes.js";
import systemRoutes from "./routes/system.js";
import shareRoutes from "./routes/share.js";
import uploadLinksRoutes from "./routes/upload-links.js";
import reviewsRoutes from "./routes/reviews.js";
import usersRoutes from "./routes/users.js";
import auditRoutes from "./routes/audit.js";
import interviewEvalsRoutes from "./routes/interview-evals.js";
import feishuRoutes from "./routes/feishu.js";
import { verifyTemplateOnBoot } from "./lib/interviewEvalTemplate.js";

const requiredEnv = ["DATABASE_URL", "JWT_SECRET", "WEB_ORIGIN"];
for (const key of requiredEnv) {
  if (!process.env[key] || process.env[key].startsWith("__REPLACE_")) {
    console.error(`[boot] missing or placeholder env: ${key}. Copy .env.example to .env and fill in real values.`);
    process.exit(1);
  }
}

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    transport: process.env.NODE_ENV === "production" ? undefined : {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "HH:MM:ss" },
    },
  },
});

await app.register(corsPlugin);
await app.register(prismaPlugin);
await app.register(redisPlugin);
await app.register(r2Plugin);
await app.register(jwtPlugin);

app.get("/api/health", async () => ({
  status: "ok",
  service: "mesa-server",
  uptime: process.uptime(),
}));

await app.register(authRoutes, { prefix: "/api/auth" });
await app.register(candidatesRoutes, { prefix: "/api/candidates" });
await app.register(jobsRoutes, { prefix: "/api/jobs" });
await app.register(departmentsRoutes, { prefix: "/api/departments" });
await app.register(employeesRoutes, { prefix: "/api/employees" });
await app.register(interviewsRoutes, { prefix: "/api/interviews" });
await app.register(dashboardRoutes, { prefix: "/api/dashboard" });
await app.register(reportsRoutes, { prefix: "/api/reports" });
await app.register(storageRoutes, { prefix: "/api/storage" });
await app.register(resumesRoutes, { prefix: "/api/resumes" });
await app.register(systemRoutes, { prefix: "/api/system" });
// share 路由分两部分: admin 在 /api/candidates/:id/share,公开在 /api/public/share/:token
await app.register(shareRoutes, { prefix: "/api" });
// upload-links: admin 在 /api/upload-links,公开在 /api/public/upload/:token
await app.register(uploadLinksRoutes, { prefix: "/api" });
await app.register(reviewsRoutes, { prefix: "/api" });
await app.register(usersRoutes, { prefix: "/api/users" });
await app.register(auditRoutes, { prefix: "/api/audit-logs" });
// interview-evals: admin 在 /api/candidates/:id/interview-evals + /api/interview-evals/:id,公开在 /api/public/interview-eval/:token
await app.register(interviewEvalsRoutes, { prefix: "/api" });
// feishu: 卡片回调(card.action.trigger),公开端点(AuthGuard 外),靠 Verification Token 校验
await app.register(feishuRoutes, { prefix: "/api/feishu" });

// 启动时校验面试评价模板 hash — 不一致就抛错(模板被改过 / 版本不对)
try {
  const tplHash = verifyTemplateOnBoot();
  app.log.info({ tplHash }, "interview eval template verified");
} catch (err) {
  app.log.fatal({ err }, "interview eval template verification failed");
  process.exit(1);
}

app.setErrorHandler((err, req, reply) => {
  const status = err.statusCode || 500;
  req.log.error({ err, url: req.url }, "request failed");
  if (status >= 500) {
    return reply.status(500).send({ error: "internal_server_error" });
  }
  return reply.status(status).send({ error: err.code || "request_error", message: err.message });
});

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || "127.0.0.1";

try {
  await app.listen({ host, port });
} catch (err) {
  app.log.fatal({ err }, "failed to start");
  process.exit(1);
}

const shutdown = async (signal) => {
  app.log.info(`${signal} received, closing...`);
  await app.close();
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
