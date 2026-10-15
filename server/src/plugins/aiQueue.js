import fp from "fastify-plugin";
import { createAiQueue } from "../lib/aiQueue.js";

export default fp(async (app) => {
  if (!app.redis) {
    app.log.warn("AI queue disabled: Redis unavailable");
    return;
  }
  const queue = createAiQueue(app.redis, app.log);
  app.decorate("aiQueue", queue);
  app.addHook("onClose", async () => queue.close());
}, { name: "ai-queue", dependencies: ["redis"] });
