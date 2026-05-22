import fp from "fastify-plugin";
import Redis from "ioredis";

export default fp(async (app) => {
  if (!process.env.REDIS_URL) {
    app.log.warn("REDIS_URL not set, redis plugin skipped");
    return;
  }
  const redis = new Redis(process.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
  });
  try {
    await redis.connect();
  } catch (err) {
    app.log.warn({ err }, "redis connect failed; continuing without redis");
    return;
  }
  app.decorate("redis", redis);
  app.addHook("onClose", async () => {
    await redis.quit();
  });
}, { name: "redis" });
