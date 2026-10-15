import { Queue } from "bullmq";
import { markFailed } from "./parseTaskStore.js";

export const AI_QUEUE_NAME = "mesa-ai";
const MAX_WAITING = Math.max(1, Number(process.env.AI_QUEUE_MAX_WAITING) || 300);

function unavailable(message) {
  return Object.assign(new Error(message), { code: "ai_queue_unavailable", statusCode: 503 });
}

function getQueue(app) {
  if (!app.aiQueue) throw unavailable("AI 任务队列暂不可用，请稍后重试");
  return app.aiQueue;
}

export function createAiQueue(connection, log) {
  const queue = new Queue(AI_QUEUE_NAME, { connection, defaultJobOptions: { removeOnComplete: { age: 86400, count: 2000 }, removeOnFail: { age: 7 * 86400, count: 2000 } } });
  queue.on("error", (err) => log.error({ err }, "AI queue error"));
  return queue;
}

export async function enqueueAiJob(app, { name, taskId, data, retryable = false }) {
  const lockKey = "mesa:ai:enqueue-lock";
  const lockValue = taskId;
  let locked = false;
  try {
    const queue = getQueue(app);
    for (let i = 0; i < 50; i++) {
      locked = (await app.redis.set(lockKey, lockValue, "PX", 30000, "NX")) === "OK";
      if (locked) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    if (!locked) throw unavailable("AI 任务队列繁忙，请稍后重试");
    const counts = await queue.getJobCounts("waiting", "delayed", "active");
    if (counts.waiting + counts.delayed + counts.active >= MAX_WAITING) {
      throw Object.assign(new Error("AI 任务排队已满，请稍后重试"), { code: "ai_queue_full", statusCode: 503 });
    }
    await queue.add(name, { taskId, ...data }, { jobId: taskId, attempts: retryable ? 2 : 1, backoff: { type: "exponential", delay: 5000 } });
  } catch (err) {
    await markFailed(app, taskId, err).catch(() => {});
    throw err.statusCode ? err : unavailable("AI 任务队列暂不可用，请稍后重试");
  } finally {
    if (locked) await app.redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, lockKey, lockValue).catch(() => {});
  }
}
