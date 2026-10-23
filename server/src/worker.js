import "dotenv/config";
import Fastify from "fastify";
import Redis from "ioredis";
import { Worker } from "bullmq";
import prismaPlugin from "./plugins/prisma.js";
import redisPlugin from "./plugins/redis.js";
import aiQueuePlugin from "./plugins/aiQueue.js";
import r2Plugin from "./plugins/r2.js";
import { AI_QUEUE_NAME } from "./lib/aiQueue.js";
import { getTask, markDone, markFailed, markCancelled, updateTask } from "./lib/parseTaskStore.js";
import { runPipeline } from "./lib/evaluation/pipeline.js";
import { executeExtraction } from "./lib/campus/extract.js";
import { runMatch } from "./lib/campus/match.js";
import { finishReport, reconcileCampusAutoEvaluation } from "./lib/campus/autoEvaluation.js";
import { getEffectiveNumber, SETTING_KEYS } from "./lib/settings.js";
import { runSalaryEvaluation, recoverSalaryWork, deliverSalaryEvaluation, failSalaryEvaluation } from "./lib/campusSalary/service.js";

if (!process.env.DATABASE_URL || !process.env.REDIS_URL || !process.env.JWT_SECRET) {
  throw new Error("AI worker requires DATABASE_URL, REDIS_URL and JWT_SECRET");
}

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || "info" } });
await app.register(prismaPlugin);
await app.register(redisPlugin);
await app.register(aiQueuePlugin);
await app.register(r2Plugin);
await app.ready();
if (!app.redis || !app.aiQueue) throw new Error("AI worker requires Redis");

const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
const concurrency = Math.min(8, Math.max(1, Number(process.env.AI_WORKER_CONCURRENCY) || 3));
let campusRunning = 0;
const campusWaiters = [];

async function withCampusLimit(fn) {
  const configured = await getEffectiveNumber(SETTING_KEYS.CAMPUS_MATCH_CONCURRENCY, 3);
  const limit = Math.min(concurrency, Math.max(1, configured));
  while (campusRunning >= limit) await new Promise((resolve) => campusWaiters.push(resolve));
  campusRunning++;
  try { return await fn(); }
  finally {
    campusRunning--;
    campusWaiters.splice(0).forEach((wake) => wake());
  }
}

async function processJob(job) {
  if (job.name === "campus-salary") {
    await runSalaryEvaluation(app, job.data.evaluationId);
    return;
  }
  const { taskId } = job.data;
  const current = await getTask(app, taskId);
  if (!current || current.status === "done" || current.status === "cancelled") return;
  if (job.name === "pipeline") {
    await runPipeline(app, taskId, job.data.options);
  } else if (job.name === "campus-extract") {
    const { applicantId, versionId, candidateId } = job.data;
    const status = await withCampusLimit(async () => {
      const version = await app.prisma.campusResumeVersion.findUnique({ where: { id: versionId }, select: { parseStatus: true } });
      if (version?.parseStatus === "done") { await markDone(app, taskId, { candidate: null }); return "done"; }
      if (!version || version.parseStatus === "cancelled") { await markCancelled(app, taskId); return "cancelled"; }
      await app.prisma.campusResumeVersion.updateMany({ where: { id: versionId, parseStatus: "pending" }, data: { parseStatus: "running" } });
      return executeExtraction(app, { applicantId, versionId, candidateId, taskId });
    });
    if (status === "failed" && (await getTask(app, taskId))?.status !== "failed") {
      await markFailed(app, taskId, Object.assign(new Error("校招简历抽取失败"), { code: "campus_extract_failed" }));
    }
  } else if (job.name === "campus-match") {
    await withCampusLimit(() => runMatch(app, job.data.runId));
  } else if (job.name === "campus-report") {
    const { applicantId, candidateId } = job.data;
    await app.prisma.campusApplicant.updateMany({ where: { id: applicantId, autoEvaluationTaskId: taskId }, data: { autoEvaluationStatus: "running" } });
    await finishReport(app, applicantId, taskId, candidateId);
  } else {
    throw new Error(`Unknown AI job type: ${job.name}`);
  }
  const result = await getTask(app, taskId);
  const retryable = job.opts.attempts > job.attemptsMade + 1 && result?.status === "failed" && Number(result.error?.statusCode || 500) >= 500;
  if (retryable) {
    await updateTask(app, taskId, { status: "pending", error: null, finishedAt: null });
    if (job.name === "campus-extract") await app.prisma.campusResumeVersion.updateMany({ where: { id: job.data.versionId, parseStatus: "failed" }, data: { parseStatus: "pending", parseError: null } });
    if (job.name === "campus-report") await app.prisma.campusApplicant.updateMany({ where: { id: job.data.applicantId, autoEvaluationTaskId: taskId }, data: { autoEvaluationStatus: "pending", autoEvaluationError: null } });
    throw new Error(`Retryable AI task failure: ${result.error?.code || "unknown"}`);
  }
}

const worker = new Worker(AI_QUEUE_NAME, processJob, { connection, concurrency, lockDuration: 120000, maxStalledCount: 1 });
worker.on("error", (err) => app.log.error({ err }, "AI worker error"));
worker.on("failed", (job, err) => {
  app.log.error(job?.name === "campus-salary" ? { evaluationId: job.data.evaluationId, code: err.code || "salary_processing_failed", type: job.name } : { err, taskId: job?.data?.taskId, type: job?.name }, "AI job failed");
  void (async () => {
    if (!job || await job.getState() !== "failed") return;
    if (job.name === "campus-salary") {
      await failSalaryEvaluation(app, job.data.evaluationId);
      await deliverSalaryEvaluation(app, job.data.evaluationId);
      return;
    }
    const task = await getTask(app, job.data.taskId);
    if (task && !["done", "failed", "cancelled"].includes(task.status)) await markFailed(app, job.data.taskId, err);
    if (job.name === "campus-extract") await app.prisma.campusResumeVersion.updateMany({ where: { id: job.data.versionId, parseStatus: { in: ["pending", "running"] } }, data: { parseStatus: "failed", parseError: "worker_failed" } });
    if (job.name === "campus-match") await app.prisma.campusMatchRun.updateMany({ where: { id: job.data.runId, status: { in: ["queued", "running"] } }, data: { status: "failed", error: "worker_failed", finishedAt: new Date() } });
    if (job.name === "campus-report") await app.prisma.campusApplicant.updateMany({ where: { id: job.data.applicantId, autoEvaluationTaskId: job.data.taskId, autoEvaluationStatus: { in: ["pending", "running"] } }, data: { autoEvaluationStatus: "failed", autoEvaluationError: "AI 执行进程中断" } });
  })().catch((failure) => app.log.error({ err: failure }, "AI failure reconciliation failed"));
});
app.log.info({ concurrency }, "AI worker ready");

async function recoverAutoEvaluations() {
  let cursor;
  while (true) {
    const rows = await app.prisma.campusApplicant.findMany({
      where: { OR: [
        { applications: { some: { status: { in: ["applied", "screening", "onsite_interview", "referred", "passed"] } } } },
        { autoEvaluationStatus: { in: ["pending", "running", "done"] } },
      ] },
      select: { id: true, autoEvaluationStatus: true, autoEvaluationTaskId: true }, orderBy: { id: "asc" }, take: 100,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    for (const row of rows) {
      const queued = row.autoEvaluationTaskId && await app.aiQueue.getJob(row.autoEvaluationTaskId);
      const state = queued && await queued.getState();
      await reconcileCampusAutoEvaluation(app, row.id, { recover: ["pending", "running"].includes(row.autoEvaluationStatus) && !["waiting", "active", "delayed"].includes(state) });
    }
    if (rows.length < 100) break;
    cursor = rows.at(-1).id;
  }
}
recoverAutoEvaluations().catch((err) => app.log.error({ err }, "AI recovery failed"));
let recoveringSalary = false;
async function recoverSalary() {
  if (recoveringSalary) return;
  recoveringSalary = true;
  try { await recoverSalaryWork(app); }
  catch { app.log.warn("salary recovery deferred"); }
  finally { recoveringSalary = false; }
}
void recoverSalary();
const salaryRecoveryTimer = setInterval(recoverSalary, 30000);
salaryRecoveryTimer.unref();

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  clearInterval(salaryRecoveryTimer);
  app.log.info({ signal }, "AI worker closing");
  try {
    await worker.close();
    await connection.quit();
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, "AI worker shutdown failed");
    process.exit(1);
  }
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
