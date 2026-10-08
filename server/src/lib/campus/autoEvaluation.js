import { createTask, getTask } from "../parseTaskStore.js";
import { runPipeline } from "../evaluation/pipeline.js";
import { candidateSnapshotFromReport } from "../evaluation/report.js";
import { withGate } from "./extract.js";
import { QUOTA_STATUS, shownScore } from "./shared.js";

const activeStatus = new Set(QUOTA_STATUS);
const inFlight = new Map();
const scheduling = new Map();

export function bestAppliedOnsiteMatch(applications, run, versionId) {
  if (!run || run.status !== "done" || run.stale || run.resumeVersionId !== versionId) return null;
  const results = new Map((Array.isArray(run.results) ? run.results : []).map((r) => [r.jobId, r]));
  return applications
    .filter((a) => activeStatus.has(a.status) && a.sessionJob?.kind === "onsite" && a.sessionJob.matchEnabled !== false)
    .map((a) => ({ application: a, match: results.get(a.jobId) }))
    .filter(({ match }) => match && !match.error && !match.excluded && match.evaluationId && Number.isFinite(match.scoreRaw))
    .sort((a, b) => b.match.scoreRaw - a.match.scoreRaw || a.application.createdAt - b.application.createdAt || a.application.id.localeCompare(b.application.id))[0] || null;
}

async function finishReport(app, applicantId, taskId, candidateId) {
  try {
    await runPipeline(app, taskId, { mode: "report", candidateId });
    const task = await getTask(app, taskId);
    const row = task?.evaluation?.id ? await app.prisma.candidateEvaluation.findUnique({ where: { id: task.evaluation.id }, select: { reportStatus: true, report: true } }) : null;
    const done = task?.status === "done" && row?.reportStatus === "done" && !!row.report;
    await app.prisma.campusApplicant.updateMany({
      where: { id: applicantId, autoEvaluationTaskId: taskId },
      data: { autoEvaluationStatus: done ? "done" : "failed", autoEvaluationError: done ? null : (row?.reportStatus === "skipped" ? "AI 报告服务未配置" : "AI 报告生成失败") },
    });
  } catch (err) {
    app.log.error({ err, applicantId }, "[campus] auto evaluation failed");
    await app.prisma.campusApplicant.updateMany({ where: { id: applicantId, autoEvaluationTaskId: taskId }, data: { autoEvaluationStatus: "failed", autoEvaluationError: "AI 评估失败" } }).catch(() => {});
  } finally {
    inFlight.delete(applicantId);
    await reconcileCampusAutoEvaluation(app, applicantId).catch((err) => app.log.error({ err, applicantId }, "[campus] auto evaluation reconcile failed"));
  }
}

async function reconcileInner(app, applicantId, { recover = false } = {}) {
  if (inFlight.has(applicantId)) return;
  const applicant = await app.prisma.campusApplicant.findUnique({
    where: { id: applicantId },
    include: { applications: { include: { sessionJob: { include: { job: { select: { title: true } } } } } } },
  });
  if (!applicant) return;
  const active = applicant.applications.filter((a) => activeStatus.has(a.status));
  const run = applicant.currentResumeVersionId ? await app.prisma.campusMatchRun.findFirst({
    where: { applicantId, resumeVersionId: applicant.currentResumeVersionId, status: "done", stale: false },
    orderBy: { startedAt: "desc" },
  }) : null;
  const selected = bestAppliedOnsiteMatch(active, run, applicant.currentResumeVersionId);

  if (selected && run) {
    for (const a of active) {
      const hit = (Array.isArray(run.results) ? run.results : []).find((r) => r.jobId === a.jobId);
      if (hit && !hit.error && hit.evaluationId && (a.matchRunId !== run.id || a.evaluationId !== hit.evaluationId)) {
        await app.prisma.campusApplication.update({ where: { id: a.id }, data: { matchRunId: run.id, resumeVersionId: run.resumeVersionId, scoreRaw: hit.scoreRaw, scoreShown: shownScore(hit.scoreShown ?? hit.scoreRaw, 60), evaluationId: hit.evaluationId } });
      }
    }
  }

  if (!selected) {
    const status = active.some((a) => a.sessionJob?.kind === "onsite") ? "awaiting_match" : "not_applicable";
    if (applicant.autoEvaluationStatus !== status || applicant.autoEvaluationJobId) {
      await app.prisma.$transaction(async (tx) => {
        if (applicant.autoEvaluationId) {
          const current = await tx.candidateEvaluation.findUnique({ where: { id: applicant.autoEvaluationId }, select: { isCurrent: true } });
          if (current?.isCurrent) {
            await tx.candidateEvaluation.update({ where: { id: applicant.autoEvaluationId }, data: { isCurrent: false } });
            await tx.candidate.update({ where: { id: applicant.candidateId }, data: { jdMatch: null, risks: [], highlights: [], insights: [], matchedFor: [], againstFor: [], aiSuggestedTags: [], classification: null, reviewPriority: null } });
          }
        }
        await tx.campusApplicant.update({ where: { id: applicantId }, data: { autoEvaluationStatus: status, autoEvaluationJobId: null, autoEvaluationVersionId: null, autoEvaluationId: null, autoEvaluationTaskId: null, autoEvaluationError: null } });
      });
    }
    return;
  }

  const { application, match } = selected;
  const same = applicant.autoEvaluationJobId === application.jobId && applicant.autoEvaluationVersionId === run.resumeVersionId && applicant.autoEvaluationId === match.evaluationId;
  if (same && applicant.autoEvaluationStatus === "done") return;
  if (same && applicant.autoEvaluationStatus === "failed" && !recover) return;
  if (same && ["pending", "running"].includes(applicant.autoEvaluationStatus) && !recover) return;
  if (["pending", "running"].includes(applicant.autoEvaluationStatus) && !recover) return;

  const evaluation = await app.prisma.candidateEvaluation.findFirst({ where: { id: match.evaluationId, candidateId: applicant.candidateId, jobId: application.jobId, shadow: false } });
  if (!evaluation) {
    await app.prisma.campusApplicant.update({ where: { id: applicantId }, data: { autoEvaluationStatus: "failed", autoEvaluationJobId: application.jobId, autoEvaluationVersionId: run.resumeVersionId, autoEvaluationId: null, autoEvaluationError: "匹配评估记录不存在" } });
    return;
  }
  const reportReady = evaluation.reportStatus === "done" && !!evaluation.report;
  const task = reportReady ? null : await createTask(app, applicant.candidateId, "campus_auto_report");
  const snap = candidateSnapshotFromReport(evaluation.report, evaluation);
  await app.prisma.$transaction(async (tx) => {
    await tx.candidateEvaluation.updateMany({ where: { candidateId: applicant.candidateId, isCurrent: true }, data: { isCurrent: false } });
    await tx.candidateEvaluation.update({ where: { id: evaluation.id }, data: { isCurrent: true } });
    await tx.candidate.update({ where: { id: applicant.candidateId }, data: { jobId: application.jobId, appliedFor: application.sessionJob.job.title, jdMatch: snap.jdMatch, risks: snap.risks, highlights: snap.highlights, insights: snap.insights, matchedFor: snap.matchedFor, againstFor: snap.againstFor, aiSuggestedTags: snap.aiSuggestedTags.slice(0, 12), classification: snap.classification, reviewPriority: snap.reviewPriority } });
    await tx.campusApplicant.update({ where: { id: applicantId }, data: { autoEvaluationStatus: reportReady ? "done" : "pending", autoEvaluationJobId: application.jobId, autoEvaluationVersionId: run.resumeVersionId, autoEvaluationId: evaluation.id, autoEvaluationTaskId: task?.id || null, autoEvaluationError: null } });
  });
  if (reportReady) return;
  inFlight.set(applicantId, task.id);
  setImmediate(() => withGate(2, async () => {
    await app.prisma.campusApplicant.updateMany({ where: { id: applicantId, autoEvaluationTaskId: task.id }, data: { autoEvaluationStatus: "running" } });
    await finishReport(app, applicantId, task.id, applicant.candidateId);
  }).catch(async (err) => {
    inFlight.delete(applicantId);
    app.log.error({ err, applicantId }, "[campus] auto evaluation queue failed");
    await app.prisma.campusApplicant.updateMany({ where: { id: applicantId, autoEvaluationTaskId: task.id }, data: { autoEvaluationStatus: "failed", autoEvaluationError: "AI 评估启动失败" } }).catch(() => {});
  }));
}

export async function reconcileCampusAutoEvaluation(app, applicantId, options = {}) {
  const previous = scheduling.get(applicantId) || Promise.resolve();
  const current = previous.catch(() => {}).then(() => reconcileInner(app, applicantId, options));
  scheduling.set(applicantId, current);
  try { return await current; }
  finally { if (scheduling.get(applicantId) === current) scheduling.delete(applicantId); }
}

export async function campusAutoEvaluationStatus(prisma, candidateId) {
  const a = await prisma.campusApplicant.findUnique({
    where: { candidateId },
    select: {
      autoEvaluationStatus: true, autoEvaluationJobId: true, autoEvaluationError: true,
      applications: { where: { status: { in: QUOTA_STATUS } }, select: { sessionJob: { select: { kind: true } } } },
    },
  });
  if (!a) return null;
  const job = a.autoEvaluationJobId && ["pending", "running", "done", "failed"].includes(a.autoEvaluationStatus) ? await prisma.job.findUnique({ where: { id: a.autoEvaluationJobId }, select: { id: true, title: true } }) : null;
  const hasOnsiteApplication = a.applications.some((x) => x.sessionJob.kind === "onsite");
  return { status: a.autoEvaluationStatus === "not_applicable" && hasOnsiteApplication ? "awaiting_match" : a.autoEvaluationStatus, job, error: a.autoEvaluationError, hasOnsiteApplication };
}
