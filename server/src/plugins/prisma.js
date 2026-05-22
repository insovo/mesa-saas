import fp from "fastify-plugin";
import { PrismaClient } from "@prisma/client";

export default fp(async (app) => {
  const prisma = new PrismaClient({
    log: process.env.LOG_LEVEL === "debug" ? ["query", "info", "warn", "error"] : ["warn", "error"],
  });
  await prisma.$connect();
  app.decorate("prisma", prisma);
  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });
}, { name: "prisma" });
