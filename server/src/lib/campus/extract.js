// 校招「上传即抽取」:简历版本落库后,后台只跑文档层 + 理解层(不评估),结果回填 Candidate 与学生档案。
// 复用 evaluation/pipeline.runPipeline(mode=reextract, skipEvaluate=true);任务状态写 parseTaskStore,
// 版本行上同步 parseStatus,台账 / 学生端据此显示「解析中 / 已解析 / 失败」。

import { createTask, getTask, requestCancel } from "../parseTaskStore.js";
import { runPipeline } from "../evaluation/pipeline.js";
import { isKimiConfigured } from "../kimi.js";

// 进程内并发闸(抽取与后续匹配共用),上限读 settings campus.match.concurrency
let running = 0;
const queue = [];
export async function withGate(limit, fn) {
  if (running >= limit) await new Promise((resolve) => queue.push(resolve));
  running++;
  try { return await fn(); }
  finally {
    running--;
    const next = queue.shift();
    if (next) next();
  }
}
// 取消抽取:置任务 cancelRequested + 版本行立即标 cancelled(UI 即时反馈);流水线在下个阶段边界退出且不落库
export async function cancelExtraction(app, { versionId }) {
  const v = await app.prisma.campusResumeVersion.findUnique({ where: { id: versionId } });
  if (!v) return null;
  if (v.parseStatus !== "running" && v.parseStatus !== "pending") return v;
  if (v.parseTaskId) await requestCancel(app, v.parseTaskId);
  return app.prisma.campusResumeVersion.update({ where: { id: versionId }, data: { parseStatus: "cancelled", parseError: null } });
}
export function gateStatus() {
  return { running, queued: queue.length };
}

// 把抽取出的 Candidate 字段回填到学生档案;毕业年份可覆盖默认值,不能覆盖人工修改。
export async function backfillApplicant(prisma, applicantId, candidate) {
  const a = await prisma.campusApplicant.findUnique({ where: { id: applicantId } });
  if (!a) return;
  const data = {};
  if (!a.name && candidate.name && candidate.name !== "待解析简历") data.name = candidate.name;
  if (!a.school && candidate.school) data.school = candidate.school;
  if (!a.major && candidate.major) data.major = candidate.major;
  if (!a.degree && candidate.education) data.degree = candidate.education;
  if (!a.email && candidate.email) data.email = candidate.email;
  const gy = candidate.derived?.graduationYear;
  if (Object.keys(data).length) await prisma.campusApplicant.update({ where: { id: applicantId }, data });
  if (Number.isInteger(gy) && gy >= 1990 && gy <= 2100) {
    await prisma.campusApplicant.updateMany({
      where: { id: applicantId, gradYearSource: { not: "manual" } },
      data: { gradYear: gy, gradYearSource: "resume" },
    });
  }
}

// 启动抽取(fire-and-forget)。返回 taskId;Kimi 未配置时直接把版本标 skipped 并返回 null。
export async function startExtraction(app, { applicantId, versionId, candidateId, concurrency = 3 }) {
  if (!(await isKimiConfigured())) {
    await app.prisma.campusResumeVersion.update({ where: { id: versionId }, data: { parseStatus: "skipped", parseError: "kimi_not_configured" } });
    return null;
  }
  const task = await createTask(app, candidateId, "reparse");
  await app.prisma.campusResumeVersion.update({ where: { id: versionId }, data: { parseStatus: "running", parseTaskId: task.id, parseError: null } });

  setImmediate(() => withGate(concurrency, () => executeExtraction(app, { applicantId, versionId, candidateId, taskId: task.id })));
  return task.id;
}

// 真正执行抽取并回写版本状态(可 await;匹配任务里版本未解析时直接调用,不再另排队)。返回最终 parseStatus
export async function executeExtraction(app, { applicantId, versionId, candidateId, taskId }) {
  try {
    await runPipeline(app, taskId, { mode: "reextract", candidateId, skipEvaluate: true });
    const t = await getTask(app, taskId);
    // 用户已点「取消」:版本行已由 cancelExtraction 标 cancelled,这里不覆盖
    const cur = await app.prisma.campusResumeVersion.findUnique({ where: { id: versionId }, select: { parseStatus: true } });
    if (t?.status === "cancelled" || cur?.parseStatus === "cancelled") {
      await app.prisma.campusResumeVersion.update({ where: { id: versionId }, data: { parseStatus: "cancelled" } }).catch(() => {});
      return "cancelled";
    }
    if (t?.status === "done") {
      const parse = await app.prisma.resumeParse.findFirst({ where: { candidateId }, orderBy: { createdAt: "desc" }, select: { id: true } });
      if (t.candidate) await backfillApplicant(app.prisma, applicantId, t.candidate);
      await app.prisma.campusResumeVersion.update({ where: { id: versionId }, data: { parseStatus: "done", resumeParseId: parse?.id || null, parseError: null } });
      return "done";
    }
    await app.prisma.campusResumeVersion.update({ where: { id: versionId }, data: { parseStatus: "failed", parseError: t?.error?.code || t?.error?.message || "unknown_error" } });
    return "failed";
  } catch (err) {
    app.log.error({ err, applicantId, versionId }, "[campus] extraction wrapper failed");
    await app.prisma.campusResumeVersion.update({ where: { id: versionId }, data: { parseStatus: "failed", parseError: err?.code || err?.message || "unknown_error" } }).catch(() => {});
    return "failed";
  }
}
