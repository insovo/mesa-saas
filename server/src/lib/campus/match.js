// 校招智能匹配:一版简历 × 全部参与匹配岗位 → 逐岗位评估 → 结果快照(设计 §5.4 / §9)
//   - 抽取只做一次:版本未解析时先在本任务内抽取(复用 executeExtraction),已解析直接复用 ResumeParse / profile
//   - 评估走 pipeline(mode=reevaluate, detached, skipReport):只写 CandidateEvaluation(isCurrent=false),不动候选人主投递与快照
//   - 理由由代码从逐项判定生成,不调 Kimi;对学生展示分 = max(scoreFloor, 原始分)
//   - 协作式取消:run.taskId 的 cancelRequested 在每个岗位之间检查;cancelMatchRun 立即把 run 标 cancelled
//   - 任务与页面无关:进度写 parseTaskStore(task.stages),学生端 2s 轮询

import { createTask, getTask, requestCancel, isCancelRequested, markRunning, markDone, markFailed, markCancelled, updateTask } from "../parseTaskStore.js";
import { runPipeline } from "../evaluation/pipeline.js";
import { isKimiConfigured } from "../kimi.js";
import { withGate, gateStatus, executeExtraction } from "./extract.js";
import { shownScore } from "./shared.js";
import { httpError } from "./service.js";

const TIER_ORDER = { MUST: 0, CORE: 1, PREFERRED: 2, STABILITY: 3, BONUS: 4 };

// 从评估逐项判定生成 3 条理由:2 条「符合」+ 1 条「可补充」
export function buildReasons(evaluation) {
  const items = Array.isArray(evaluation?.items) ? evaluation.items : [];
  const byTier = (a, b) => (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9);
  const ok = items.filter((i) => i.verdict === "满足").sort(byTier).slice(0, 2).map((i) => ({ kind: "match", text: `符合:${i.label}` }));
  const gap = items.filter((i) => i.verdict === "不满足" || i.verdict === "未提及" || i.verdict === "部分满足").sort(byTier)[0];
  const out = [...ok];
  if (gap) out.push({ kind: "gap", text: `${gap.verdict === "未提及" ? "简历未体现" : "可补充"}:${gap.label}` });
  if (out.length === 0) out.push({ kind: "info", text: "已完成评估,详情以 HR 沟通为准" });
  return out;
}

function excludedReason(hardFilter) {
  const fails = (hardFilter?.items || []).filter((i) => i.result === "FAIL");
  return fails.length ? `不符合硬性条件:${fails.map((i) => i.label || i.key).join("、")}` : "不符合硬性条件";
}

// 进度映射(设计 §5.5):queued 0–5 · extract 5–30 · structure 30–60 · evaluate 60–95 · done 100
export function progressOf(run, task) {
  if (!run) return { progress: 0, stage: "queued" };
  if (run.status === "done") return { progress: 100, stage: "done" };
  if (run.status === "failed") return { progress: 0, stage: "failed" };
  if (run.status === "cancelled") return { progress: 0, stage: "cancelled" };
  const st = task?.stages || {};
  const ev = st.evaluate;
  if (ev && ev.total) return { progress: Math.min(95, 60 + Math.round((35 * (ev.done || 0)) / ev.total)), stage: "evaluate", done: ev.done || 0, total: ev.total };
  if (st.structure?.status === "running" || st.structure?.status === "done") return { progress: st.structure.status === "done" ? 60 : 45, stage: "structure" };
  if (st.extract?.status === "running" || st.extract?.status === "done" || st.extract?.status === "reused") return { progress: st.extract.status === "running" ? 15 : 30, stage: "extract" };
  if (run.status === "running") return { progress: 8, stage: "extract" };
  return { progress: 3, stage: "queued", queuePosition: task?.queuedAhead ?? null };
}

export async function startMatchRun(app, { applicant, session, concurrency = 3 }) {
  if (!session.matchEnabled) throw httpError("本专场未开放智能匹配", 403, "campus_match_disabled");
  if (!applicant.currentResumeVersionId) throw httpError("请先上传简历", 428, "campus_resume_required");
  if (!(await isKimiConfigured())) throw httpError("匹配服务未配置,请联系现场 HR", 424, "kimi_not_configured");
  const inFlight = await app.prisma.campusMatchRun.findFirst({ where: { applicantId: applicant.id, status: { in: ["queued", "running"] } } });
  if (inFlight) throw httpError("已有一个匹配任务在进行中", 409, "campus_match_in_progress");
  const jobsCount = await app.prisma.campusSessionJob.count({ where: { sessionId: session.id, matchEnabled: true, job: { evaluationModel: { not: null } } } });
  if (jobsCount === 0) throw httpError("本专场暂无可匹配的岗位", 409, "campus_no_match_jobs");

  const task = await createTask(app, applicant.candidateId, "campus_match");
  await updateTask(app, task.id, { queuedAhead: gateStatus().queued + Math.max(0, gateStatus().running - concurrency + 1) });
  const run = await app.prisma.campusMatchRun.create({ data: { applicantId: applicant.id, resumeVersionId: applicant.currentResumeVersionId, taskId: task.id, status: "queued" } });
  setImmediate(() => withGate(concurrency, () => runMatch(app, run.id)));
  return run;
}

export async function cancelMatchRun(app, run) {
  if (!run || run.status === "done" || run.status === "failed" || run.status === "cancelled") return run;
  if (run.taskId) await requestCancel(app, run.taskId);
  return app.prisma.campusMatchRun.update({ where: { id: run.id }, data: { status: "cancelled", finishedAt: new Date(), error: null } });
}

async function cancelled(app, runId, taskId) {
  if (taskId && (await isCancelRequested(app, taskId))) return true;
  const r = await app.prisma.campusMatchRun.findUnique({ where: { id: runId }, select: { status: true } });
  return r?.status === "cancelled";
}

async function runMatch(app, runId) {
  const run = await app.prisma.campusMatchRun.findUnique({ where: { id: runId }, include: { applicant: { include: { session: true } }, resumeVersion: true } });
  if (!run || run.status === "cancelled") return;
  const taskId = run.taskId;
  const { applicant, resumeVersion: version } = run;
  const session = applicant.session;
  const t0 = Date.now();
  try {
    if (await cancelled(app, runId, taskId)) { await markCancelled(app, taskId); return; }
    await markRunning(app, taskId);
    await app.prisma.campusMatchRun.update({ where: { id: runId }, data: { status: "running" } });

    // 1) 保证抽取完成(通常上传时已完成;running 则等待,其它状态在本任务内抽取)
    let parseStatus = version.parseStatus;
    if (parseStatus === "running") {
      for (let i = 0; i < 90 && parseStatus === "running"; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        parseStatus = (await app.prisma.campusResumeVersion.findUnique({ where: { id: version.id }, select: { parseStatus: true } }))?.parseStatus;
        if (await cancelled(app, runId, taskId)) { await markCancelled(app, taskId); return; }
      }
    }
    if (parseStatus !== "done") {
      await app.prisma.candidate.update({ where: { id: applicant.candidateId }, data: { attachment: version.attachmentKey } });
      await app.prisma.campusResumeVersion.update({ where: { id: version.id }, data: { parseStatus: "running", parseTaskId: taskId, parseError: null } });
      parseStatus = await executeExtraction(app, { applicantId: applicant.id, versionId: version.id, candidateId: applicant.candidateId, taskId });
      if (parseStatus === "cancelled") { await markCancelled(app, taskId); return; }
      if (parseStatus !== "done") throw Object.assign(new Error("简历读取失败,无法匹配"), { code: "campus_extract_failed" });
      // executeExtraction 已把 task 标 done;复位为 running 继续评估阶段
      await updateTask(app, taskId, { status: "running", finishedAt: undefined });
    }

    // 2) 逐岗位评估
    const sjs = await app.prisma.campusSessionJob.findMany({ where: { sessionId: session.id, matchEnabled: true, job: { evaluationModel: { not: null } } }, orderBy: [{ sortOrder: "asc" }], include: { job: { select: { id: true, title: true, dept: true, location: true } } } });
    const total = sjs.length;
    const results = [];
    let jevCached = 0, latency = 0;
    await updateTask(app, taskId, { stages: { ...(await getTask(app, taskId))?.stages, evaluate: { status: "running", done: 0, total } } });
    for (let i = 0; i < sjs.length; i++) {
      if (await cancelled(app, runId, taskId)) { await markCancelled(app, taskId); return; }
      const sj = sjs[i];
      const sub = await createTask(app, applicant.candidateId, "campus_eval");
      const ts = Date.now();
      await runPipeline(app, sub.id, { mode: "reevaluate", candidateId: applicant.candidateId, jobIdOverride: sj.jobId, skipReport: true, detached: true });
      const st = await getTask(app, sub.id);
      latency += Date.now() - ts;
      let item = { jobId: sj.jobId, kind: sj.kind, title: sj.job.title, dept: sj.job.dept, location: sj.job.location, scoreRaw: null, scoreShown: null, classification: null, hardFilter: null, excluded: false, reasons: [], evaluationId: null, error: null };
      if (st?.status === "done" && st.evaluation?.id) {
        const ev = await app.prisma.candidateEvaluation.findUnique({ where: { id: st.evaluation.id } });
        if (ev) {
          const excluded = ev.hardFilter?.result === "FAIL";
          item = { ...item, scoreRaw: ev.overallScore, scoreShown: shownScore(ev.overallScore, session.scoreFloor), classification: ev.classification, hardFilter: ev.hardFilter?.result || null, excluded, reasons: excluded ? [{ kind: "gap", text: excludedReason(ev.hardFilter) }] : buildReasons(ev), evaluationId: ev.id, engine: ev.engine };
          if (ev.costs?.cached) jevCached++;
        }
      } else {
        item.error = st?.error?.code || st?.error?.message || "evaluate_failed";
      }
      results.push(item);
      const cur = await getTask(app, taskId);
      await updateTask(app, taskId, { stages: { ...(cur?.stages || {}), evaluate: { status: "running", done: i + 1, total } } });
      await app.prisma.campusMatchRun.update({ where: { id: runId }, data: { results } });
    }

    // 3) 排序:现场面试优先 → 原始分降序;硬筛不通过 / 失败的沉底
    const rank = (r) => (r.kind === "onsite" ? 0 : 1) * 10 + (r.excluded || r.error ? 5 : 0);
    results.sort((a, b) => rank(a) - rank(b) || (b.scoreRaw ?? -1) - (a.scoreRaw ?? -1));
    if (await cancelled(app, runId, taskId)) { await markCancelled(app, taskId); return; }
    await app.prisma.campusMatchRun.update({ where: { id: runId }, data: { status: "done", results, finishedAt: new Date(), costs: { jobs: total, jevCached, latencyMs: latency, totalMs: Date.now() - t0 } } });
    const cur = await getTask(app, taskId);
    await updateTask(app, taskId, { stages: { ...(cur?.stages || {}), evaluate: { status: "done", done: total, total } } });
    await markDone(app, taskId, { candidate: null, match: null, results: results.length });
  } catch (err) {
    if (err?.code === "cancelled") { await markCancelled(app, taskId); await app.prisma.campusMatchRun.updateMany({ where: { id: runId, status: { in: ["queued", "running"] } }, data: { status: "cancelled", finishedAt: new Date() } }); return; }
    app.log.error({ err, runId }, "[campus] match run failed");
    await app.prisma.campusMatchRun.update({ where: { id: runId }, data: { status: "failed", error: err?.code || err?.message || "unknown_error", finishedAt: new Date() } }).catch(() => {});
    await markFailed(app, taskId, err);
  }
}

// 学生端 / HR 端共用的 run 形状
export function runShape(run, task, { student = true } = {}) {
  const p = progressOf(run, task);
  const results = Array.isArray(run.results) ? run.results : [];
  return {
    id: run.id, status: run.status, stale: run.stale, startedAt: run.startedAt, finishedAt: run.finishedAt, error: run.error,
    resumeVersionId: run.resumeVersionId, ...p,
    results: run.status === "done" ? results.map((r) => (student ? { jobId: r.jobId, kind: r.kind, title: r.title, dept: r.dept, location: r.location, scoreShown: r.scoreShown, excluded: r.excluded, reasons: r.reasons, error: r.error ? "evaluate_failed" : null } : r)) : undefined,
    ...(student ? {} : { costs: run.costs }),
  };
}
