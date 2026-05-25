// Reparse 异步任务存储 — Redis-backed,优雅退化到 in-process Map。
//
// 为什么异步:
//   Cloudflare Free/Pro plan 对 origin response 硬上限 100s。Kimi 解析大简历 / 推理模型
//   常超过这个上限,sync POST /parse 会被 CF 替换成 502 HTML 错误页,用户看到的就是
//   「Request failed with status code 502」。
//
//   异步化:POST /parse {candidateId} 立即返回 taskId(<200ms),后端 setImmediate
//   跑 Kimi,前端轮询 GET /parse-tasks/:taskId 直到 status=done/failed。
//   每次轮询 <100ms,彻底绕过 CF 100s 限制。
//
// Task 形状:
//   {
//     id: string (uuid),
//     candidateId: string,
//     status: "pending" | "running" | "done" | "failed",
//     startedAt: ISO string,
//     finishedAt?: ISO string,
//     candidate?: object,   // status=done 时填,等于 update 后的 DB 行
//     match?: object,       // status=done 时填(若 jobId 联评)
//     reparsed?: boolean,   // 标识本次是 reparse 路径
//     error?: { code, message, statusCode },  // status=failed 时填
//   }

import { randomUUID } from "node:crypto";

const KEY_PREFIX = "mesa:parse:task:";
const TTL_SECONDS = 60 * 60; // 1 小时,够任何前端轮询场景 + 留给手动 debug

// Fallback in-process store(单 backend 实例 OK,集群部署需保证用 Redis)
const memoryStore = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of memoryStore) {
    if (v._expiresAt && v._expiresAt < now) memoryStore.delete(k);
  }
}, 5 * 60 * 1000).unref();

function memoryKey(taskId) {
  return KEY_PREFIX + taskId;
}

export async function createTask(app, candidateId) {
  const task = {
    id: randomUUID(),
    candidateId,
    status: "pending",
    startedAt: new Date().toISOString(),
  };
  await saveTask(app, task);
  return task;
}

export async function getTask(app, taskId) {
  if (app?.redis) {
    try {
      const raw = await app.redis.get(memoryKey(taskId));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      app?.log?.warn?.({ err, taskId }, "redis getTask failed, falling back to memory");
    }
  }
  const v = memoryStore.get(memoryKey(taskId));
  if (!v) return null;
  const { _expiresAt, ...task } = v;
  return task;
}

export async function saveTask(app, task) {
  const k = memoryKey(task.id);
  const payload = JSON.stringify(task);
  if (app?.redis) {
    try {
      await app.redis.set(k, payload, "EX", TTL_SECONDS);
      return;
    } catch (err) {
      app?.log?.warn?.({ err, taskId: task.id }, "redis saveTask failed, falling back to memory");
    }
  }
  memoryStore.set(k, { ...task, _expiresAt: Date.now() + TTL_SECONDS * 1000 });
}

export async function updateTask(app, taskId, patch) {
  const existing = await getTask(app, taskId);
  if (!existing) return null;
  const next = { ...existing, ...patch };
  await saveTask(app, next);
  return next;
}

// 标记任务为 running(开始跑 Kimi 之前调用)
export async function markRunning(app, taskId) {
  return updateTask(app, taskId, { status: "running" });
}

// 标记任务为 done,带最终 candidate(已写 DB 的快照)
export async function markDone(app, taskId, { candidate, match, reparsed }) {
  return updateTask(app, taskId, {
    status: "done",
    finishedAt: new Date().toISOString(),
    candidate,
    match: match || null,
    reparsed: !!reparsed,
  });
}

// 标记任务为 failed
export async function markFailed(app, taskId, err) {
  return updateTask(app, taskId, {
    status: "failed",
    finishedAt: new Date().toISOString(),
    error: {
      code: err?.code || "unknown_error",
      message: err?.message?.slice(0, 500) || String(err).slice(0, 500),
      statusCode: err?.statusCode || 500,
    },
  });
}
