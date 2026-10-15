import fp from "fastify-plugin";
import { PrismaClient } from "@prisma/client";

export default fp(async (app) => {
  const slowQueryMs = Math.max(50, Number(process.env.SLOW_QUERY_MS) || 300);
  const prisma = new PrismaClient({
    log: [{ emit: "event", level: "query" }, "warn", "error"],
  });
  prisma.$on("query", (event) => {
    if (event.duration >= slowQueryMs) {
      app.log.warn({ durationMs: event.duration, sql: event.query }, "slow database query");
    }
  });
  await prisma.$connect();
  app.decorate("prisma", prisma);
  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });
}, { name: "prisma" });
