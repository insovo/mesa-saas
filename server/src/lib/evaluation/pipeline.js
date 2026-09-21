// 三层流水线编排:文档层(TextIn)→ 理解层(Kimi)→ 规则层(硬筛)→ 评估层(Jev)→ 报告层(Kimi)→ 落库
// 由 routes/resumes.js 以 fire-and-forget 方式调用(setImmediate),进度写 parseTaskStore(task.stages)。
//
// mode:
//   "create"     新上传:R2 key → 抽取 → 结构化 → (有 jobId)评估 → 创建 candidate
//   "full"       重新识别文档:重新调 TextIn(文件 sha 变了 / admin 强制)→ 结构化 → 评估 → 更新
//   "reextract"  重新抽取:复用已存 markdown(不再向 TextIn 计费)→ 结构化 → 评估 → 更新(reparse 默认)
//   "reevaluate" 只重评:硬筛 + Jev + 报告(切 JD 默认,秒级)
//   "report"     只补报告(C/D 按需 / 报告失败重试)
// jobIdOverride 语义与旧 runReparse 一致:undefined 沿用 / null 取消 JD / uuid 切换。

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { parseResume, matchAgainstJob, isKimiConfigured, buildResumeDisplayFields, generateReport, extractJdFacts, suggestEvaluationWording } from "../kimi.js";
import { extractDocument, sha256 } from "../documents.js";
import { deriveProfile } from "../profile/derive.js";
import { withDerivedCandidate } from "../derived.js";
import { markRunning, markDone, markFailed, updateTask } from "../parseTaskStore.js";
import { cleanupEmployeeOnJobChange } from "../candidateToEmployee.js";
import { notifyCandidateReady } from "../feishuNotify.js";
import { isJevEnabled, jevMode, evaluate as jevEvaluate } from "../jev.js";
import { getEffective, getEffectiveBool, getEffectiveJson, getEffectiveNumber, SETTING_KEYS } from "../settings.js";
import { runHardFilter } from "./hardFilter.js";
import { buildState, buildQuestions } from "./questions.js";
import { normalizeAnswers, composite } from "./composite.js";
import { legacyToEvaluation } from "./legacyAdapter.js";
import { sanitizeReport, candidateSnapshotFromReport } from "./report.js";
import { draftEvaluationModel, EVAL_SCHEMA_VERSION, QUESTION_TEMPLATE_VERSION } from "./templates.js";

const MARKDOWN_MAX = 200_000;

// ─── 旧 resumes.js 的小工具(原样迁入,供 create/update 复用)───
export function safeMd(s) {
  return typeof s === "string" ? s.trim().slice(0, 5000) : "";
}
export function stripPendingTag(tags) {
  return Array.isArray(tags) ? tags.filter((t) => t !== "待解析") : tags;
}
export function deriveName(parsedName, summary, fallback) {
  const clean = (s) => (typeof s === "string" ? s.trim() : "");
  const pn = clean(parsedName);
  if (pn) return pn;
  const firstLine = clean((summary || "").split("\n")[0]);
  const isPlaceholder = /^(未提供|未解析|未提供或未解析到)/.test(firstLine);
  if (firstLine && firstLine.length <= 20 && !isPlaceholder && !firstLine.includes(":") && !firstLine.includes("：")) return firstLine;
  return fallback;
}
export function pickPhone(parsedPhone, summary) {
  const p = typeof parsedPhone === "string" ? parsedPhone.trim() : "";
  if (p) return p;
  for (const line of (summary || "").split("\n")) {
    if (!/(联系电话|电话|手机号?|电话号码|tel\.?|phone|mobile|cell)/i.test(line)) continue;
    const m = line.match(/([+(]?\d[\d\s\-()]{5,}\d)/);
    if (m) {
      const d = m[1].replace(/\D/g, "");
      if (d.length >= 6 && d.length <= 15) return m[1].trim();
    }
  }
  return null;
}
export function pickEmail(parsedEmail, summary) {
  const e = typeof parsedEmail === "string" ? parsedEmail.trim() : "";
  if (e) return e;
  const m = (summary || "").match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0] : null;
}
export async function streamToBuffer(stream) {
  if (Buffer.isBuffer(stream)) return stream;
  if (stream && typeof stream.transformToByteArray === "function") return Buffer.from(await stream.transformToByteArray());
  const readable = Readable.isReadable?.(stream) ? stream : Readable.from(stream);
  const chunks = [];
  for await (const c of readable) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}
const E = (message, statusCode, code) => Object.assign(new Error(message), { statusCode, code });

// Postgres text / jsonb 都拒收 \u0000(22021 invalid byte sequence)。TextIn / Kimi 输出偶带 NUL,
// 落库前对所有字符串(含 JSON 深层)统一剥离。纯函数,导出供单测。
export function deepStripNul(v) {
  if (typeof v === "string") return v.includes("\u0000") ? v.replace(/\u0000/g, "") : v;
  if (Array.isArray(v)) return v.map(deepStripNul);
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = deepStripNul(x);
    return out;
  }
  return v;
}

async function stage(app, taskId, name, patch) {
  const t = await updateTask(app, taskId, {});
  const stages = { ...(t?.stages || {}), [name]: { ...((t?.stages || {})[name] || {}), ...patch } };
  await updateTask(app, taskId, { stages });
}

async function fetchR2(app, key) {
  if (!app.r2) throw E("R2 凭证未配置,无法读取简历", 424, "r2_not_configured");
  let buffer;
  try {
    const obj = await app.r2.client.send(new GetObjectCommand({ Bucket: app.r2.bucket, Key: key }));
    buffer = await streamToBuffer(obj.Body);
  } catch {
    throw E(`R2 中找不到对象 ${key}`, 404, "r2_object_not_found");
  }
  if (!buffer || buffer.length === 0) throw E("文件为空", 400, "empty_file");
  return buffer;
}

async function putRawToR2(app, key, json) {
  if (!app.r2) return null;
  try {
    await app.r2.client.send(new PutObjectCommand({ Bucket: app.r2.bucket, Key: key, Body: JSON.stringify(json), ContentType: "application/json" }));
    return key;
  } catch (err) {
    app.log.warn({ err: err.message, key }, "[pipeline] raw TextIn result upload failed (ignored)");
    return null;
  }
}

// ─── 文档层:拿到 markdown(复用 ResumeParse 或新抽取)───
async function extractStage(app, taskId, { mode, candidate, key, filename, contentType }) {
  // 复用:reextract / reevaluate / report 优先取最近一次解析
  if (candidate && mode !== "full" && mode !== "create") {
    const last = await app.prisma.resumeParse.findFirst({ where: { candidateId: candidate.id }, orderBy: { createdAt: "desc" } });
    if (last && (mode !== "reextract" || last.attachmentKey === candidate.attachment)) {
      await stage(app, taskId, "extract", { status: "reused", provider: last.provider, resumeParseId: last.id });
      return { markdown: last.markdown, provider: last.provider, providerVersion: last.providerVersion, resumeParseId: last.id, detail: [], buffer: null, sha: last.fileSha256, reused: true };
    }
    if (mode === "reevaluate" || mode === "report") {
      // 没有任何 ResumeParse(存量候选人):用简报兜底,不重新计费
      await stage(app, taskId, "extract", { status: "fallback_summary" });
      return { markdown: candidate.aiSummary || "", provider: "summary", providerVersion: null, resumeParseId: null, detail: [], buffer: null, sha: null, reused: true };
    }
  }
  await stage(app, taskId, "extract", { status: "running" });
  const t0 = Date.now();
  const buffer = await fetchR2(app, key);
  const sha = sha256(buffer);
  // 同文件同 provider 已解析过 → 复用(reparse 重复点击 / 飞书重复投递)
  if (candidate && mode !== "full") {
    const dup = await app.prisma.resumeParse.findFirst({ where: { candidateId: candidate.id, fileSha256: sha, provider: "textin" } });
    if (dup) {
      await stage(app, taskId, "extract", { status: "reused", provider: dup.provider, resumeParseId: dup.id, ms: Date.now() - t0 });
      return { markdown: dup.markdown, provider: dup.provider, providerVersion: dup.providerVersion, resumeParseId: dup.id, detail: [], buffer, sha, reused: true };
    }
  }
  const doc = await extractDocument({ buffer, filename, contentType, log: app.log });
  await stage(app, taskId, "extract", { status: "done", provider: doc.provider, ms: Date.now() - t0, pages: doc.pageCount, fallbackReason: doc.fallbackReason });
  return { markdown: doc.text, provider: doc.provider, providerVersion: doc.providerVersion, raw: doc.raw, pageCount: doc.pageCount, durationMs: doc.durationMs, detail: doc.detail, buffer, sha, reused: false };
}

// ─── 理解层:Kimi 结构化 → candidate 字段 ───
async function structureStage(app, taskId, { ext, filename, contentType, model, existing, fallbackName }) {
  await stage(app, taskId, "structure", { status: "running" });
  const t0 = Date.now();
  const result = await parseResume({ buffer: ext.buffer, filename, contentType, model, preExtractedText: ext.markdown || null, extractionMeta: { provider: ext.provider } });
  const parsed = { ...result.parsed };
  delete parsed.jdMatch; delete parsed.risks; delete parsed.highlights;
  if (!Array.isArray(parsed.languages)) parsed.languages = [];
  const displayFields = buildResumeDisplayFields(parsed);
  const derived = deriveProfile(result.profile);
  if (derived.totalYears != null && derived.totalYears > 0) parsed.yearsExp = Math.round(derived.totalYears);
  const fields = {
    name: deriveName(parsed.name, result.summary, existing?.name || fallbackName),
    gender: parsed.gender ?? existing?.gender ?? null,
    animal: parsed.animal ?? existing?.animal ?? null,
    education: parsed.education ?? existing?.education ?? null,
    school: parsed.school ?? existing?.school ?? null,
    major: parsed.major ?? existing?.major ?? null,
    age: parsed.age ?? existing?.age ?? null,
    location: parsed.location ?? existing?.location ?? null,
    yearsExp: parsed.yearsExp ?? existing?.yearsExp ?? null,
    phone: pickPhone(parsed.phone, result.summary) ?? existing?.phone ?? null,
    email: pickEmail(parsed.email, result.summary) ?? existing?.email ?? null,
    tags: stripPendingTag((Array.isArray(parsed.tags) && parsed.tags.length > 0) ? parsed.tags : (existing?.tags || [])),
    languages: (Array.isArray(parsed.languages) && parsed.languages.length > 0) ? parsed.languages : (existing?.languages || []),
    aiSummary: result.summary,
    skills: safeMd(displayFields.skills),
    experience: safeMd(displayFields.experience),
    educationHistory: safeMd(displayFields.educationHistory),
    profile: result.profile,
    derived,
    profileVersion: result.profile?.schemaVersion || "resume.v1",
    profileWarnings: result.profileWarnings || [],
    parser: ext.provider === "textin" ? "TextIn+Kimi" : "Kimi",
    parserConfidence: derived.profileQuality ?? 92,
  };
  await stage(app, taskId, "structure", { status: "done", ms: Date.now() - t0, model: result.meta?.model, shape: result.meta?.profileShape, warnings: (result.profileWarnings || []).length });
  return { fields, summary: result.summary, profile: result.profile, derived, meta: result.meta, appliedFor: parsed.appliedFor || null, status: parsed.status || null };
}

// ─── JD 评价模型:缺失时自动生成草稿(懒加载,源 kimi_suggested)───
async function ensureEvaluationModel(app, job) {
  if (job.evaluationModel?.requirements?.length) return { model: job.evaluationModel, job };
  let jdFacts = job.jdFacts || null;
  let source = "draft";
  if (!jdFacts && (await isKimiConfigured())) {
    try {
      const text = [job.title, job.description, ...(job.responsibilities || []).map((r) => `职责:${r}`), ...(job.requirements || []).map((r) => `要求:${r}`), ...(job.nice || []).map((r) => `优先:${r}`), job.educationRequirement && `学历:${job.educationRequirement}`, job.yearsExpRange && `年限:${job.yearsExpRange}`, job.languageRequirement && `语言:${job.languageRequirement}`, job.location && `地点:${job.location}`].filter(Boolean).join("\n");
      const r = await extractJdFacts({ text });
      jdFacts = r.jdFacts;
      source = "kimi_suggested";
    } catch (err) {
      app.log.warn({ err: err.message, jobId: job.id }, "[pipeline] extractJdFacts failed, drafting model from job fields");
    }
  }
  if (!jdFacts) {
    // 无 Kimi:从 Job 旧字段拼最小 jdFacts(学历 / 年限 / 地点),其余靠固定题
    jdFacts = minimalJdFacts(job);
    source = "draft";
  }
  const model = draftEvaluationModel(jdFacts, { defaultWeights: await getEffectiveJson(SETTING_KEYS.EVAL_DEFAULT_WEIGHTS, null) });
  model.source = source;
  if (source === "kimi_suggested" && (await isKimiConfigured())) {
    try {
      const { wording } = await suggestEvaluationWording({ draft: model, jdFacts });
      for (const r of model.requirements) if (wording[r.key] && r.jev) r.jev = { ...r.jev, ...pickWording(wording[r.key], r.jev.type) };
    } catch (err) {
      app.log.warn({ err: err.message, jobId: job.id }, "[pipeline] suggestEvaluationWording failed (draft wording kept)");
    }
  }
  const updated = await app.prisma.job.update({
    where: { id: job.id },
    data: { jdFacts: deepStripNul(jdFacts), jdFactsVersion: jdFacts.schemaVersion || "jd.v1", evaluationModel: deepStripNul(model), evaluationModelVersion: { increment: 1 }, evaluationModelUpdatedAt: new Date(), evaluationModelSource: source },
  });
  return { model: updated.evaluationModel, job: updated };
}
function pickWording(w, type) {
  if (!w || typeof w !== "object") return {};
  const out = {};
  if (typeof w.instructions === "string") out.instructions = w.instructions.slice(0, 600);
  if (type === "score" && Array.isArray(w.criteria) && w.criteria.length >= 2) out.criteria = w.criteria.slice(0, 10).map(String);
  if (type === "noul" && w.criteria && typeof w.criteria === "object" && !Array.isArray(w.criteria)) out.criteria = { true: String(w.criteria.true || ""), false: String(w.criteria.false || "") };
  return out;
}
function minimalJdFacts(job) {
  const years = /(\d+)\s*年/.exec(job.yearsExpRange || "");
  const degree = /(博士|硕士|本科|大专|专科)/.exec(job.educationRequirement || "");
  return {
    schemaVersion: "jd.v1",
    basics: { title: job.title, locations: job.location ? [{ city: job.location }] : [] },
    responsibilities: (job.responsibilities || []).slice(0, 3).map((d) => ({ name: d.slice(0, 30), description: d, importance: "core" })),
    education: degree ? { minDegree: degree[1], majors: [], majorType: "any" } : { majors: [], majorType: "any" },
    experienceYears: { total: { min: years ? Number(years[1]) : null } },
    languages: /英语|english/i.test(job.languageRequirement || "") ? [{ language: "en", raw: "英语", level: "working", required: true }] : [],
    workConditions: {},
    restrictions: {},
  };
}

// ─── 评估层:硬筛 + Jev + 加权;失败 → legacy ───
async function evaluateStage(app, taskId, { cand, job, markdown, detail, summary, model: kimiModel, force = null }) {
  await stage(app, taskId, "evaluate", { status: "running" });
  const t0 = Date.now();
  const [enabled, mode, piiStrip, thresholds, tierWeights, gate, policy] = await Promise.all([
    isJevEnabled(), jevMode(), getEffectiveBool(SETTING_KEYS.EVAL_PII_STRIP),
    getEffectiveJson(SETTING_KEYS.EVAL_THRESHOLDS, null), getEffectiveJson(SETTING_KEYS.EVAL_DEFAULT_WEIGHTS, null),
    getEffectiveNumber(SETTING_KEYS.EVAL_CONFIDENCE_GATE, 0.5), getEffective(SETTING_KEYS.EVAL_REPORT_POLICY),
  ]);
  const useJev = force === "jev" ? true : force === "legacy" ? false : enabled;
  const runLegacy = async () => {
    const match = await matchAgainstJob({ candidateSummary: summary || `${cand.name || ""}`, jobTitle: job.title, jobDescription: job.description || "", model: kimiModel });
    const ev = legacyToEvaluation(match, { thresholds: thresholds || undefined });
    return { evaluation: { ...ev, versions: { schema: EVAL_SCHEMA_VERSION, engine: "legacy", kimiModel: kimiModel || null }, costs: null }, match };
  };

  let primary = null, shadow = null, match = null, jevError = null;
  if (useJev) {
    try {
      const { model: evalModel, job: job2 } = await ensureEvaluationModel(app, job);
      job = job2;
      const hardFilter = runHardFilter(evalModel, cand);
      const { state, meta: stateMeta } = buildState({ markdown, profile: cand.profile, derived: cand.derived, jdFacts: job.jdFacts, job, piiStrip });
      const { questions, map, meta: qMeta } = buildQuestions(evalModel, hardFilter);
      let answers = {}, jevOut = null;
      if (Object.keys(questions).length) {
        jevOut = await jevEvaluate({ state, questions, app, meta: { taskId, candidateId: cand.id, jobId: job.id } });
        answers = jevOut.answers;
      }
      const items = normalizeAnswers(evalModel, hardFilter, answers, map);
      const c = composite(evalModel, items, answers, { thresholds: thresholds || undefined, tierWeights: tierWeights || undefined, confidenceGate: gate });
      primary = {
        engine: "jev", hardFilter, items, jevRequest: { questions, map, meta: { ...stateMeta, ...qMeta } }, jevAnswers: answers,
        dimensions: c.dimensions, overallScore: c.overallScore, bonus: c.bonus, classification: c.classification, reviewPriority: c.reviewPriority,
        reasons: c.reasons, flags: c.flags, minConfidence: c.minConfidence, interviewKeys: c.interviewKeys,
        versions: { schema: EVAL_SCHEMA_VERSION, questionTemplate: QUESTION_TEMPLATE_VERSION, evaluationModel: job.evaluationModelVersion, jevModel: jevOut?.model || null, kimiModel: kimiModel || null },
        costs: jevOut ? { jevInputTokens: jevOut.inputTokens, jevUsd: jevOut.costUsd, cached: jevOut.cached, latencyMs: jevOut.latencyMs } : { jevInputTokens: 0, jevUsd: 0 },
        reportPolicy: policy || "auto_ab",
      };
    } catch (err) {
      jevError = err;
      app.log.warn({ err: err.message, code: err.code, taskId }, "[pipeline] Jev evaluation failed → legacy fallback");
      if (err.code === "jev_bad_request") throw err; // 题目模板问题,不能靠回退掩盖
    }
  }
  if (mode === "shadow" && primary && !force) {
    // shadow:legacy 为主写快照,Jev 为副只落评估表
    shadow = primary; primary = null;
  }
  if (!primary) {
    if (!(await isKimiConfigured())) {
      if (shadow) { primary = shadow; shadow = null; }   // 无 Kimi 时只能用 Jev 结果
      else throw jevError || E("评估不可用:Jev 未启用且 Kimi 未配置", 424, "evaluation_unavailable");
    } else {
      const r = await runLegacy();
      primary = r.evaluation; match = r.match;
      if (jevError) primary.flags = [...(primary.flags || []), `jev_fallback:${jevError.code || "error"}`];
    }
  }
  await stage(app, taskId, "evaluate", { status: "done", engine: primary.engine, classification: primary.classification, overall: primary.overallScore, ms: Date.now() - t0, shadow: !!shadow, fallback: jevError ? (jevError.code || "error") : null });
  return { primary, shadow, match, job };
}

// 无 Kimi 时的确定性兜底报告(只用判定结果,不写作)
function fallbackReport(ev) {
  const items = ev.items || [];
  const ok = items.filter((i) => i.verdict === "满足").map((i) => ({ reqKey: i.key, text: `${i.label}:满足`, evidence: null }));
  const bad = items.filter((i) => i.verdict === "不满足" || i.verdict === "未提及" || i.verdict === "待确认").map((i) => ({ reqKey: i.key, text: `${i.label}:${i.verdict}`, evidence: null }));
  return {
    matchReason: `系统判定 ${ev.classification} 类(${ev.overallScore} 分):${(ev.reasons || []).join("、")}`,
    highlights: ok.slice(0, 6), risks: bad.slice(0, 6), insights: [], interviewProbes: items.filter((i) => (ev.interviewKeys || []).includes(i.key)).map((i) => ({ reqKey: i.key, question: `请确认:${i.label}`, why: "简历未提及" })),
    matchedFor: ok.slice(0, 5).map((i) => i.text.split(":")[0]), againstFor: bad.slice(0, 4).map((i) => i.text.split(":")[0]), aiSuggestedTags: [], evidence: [], stats: { fallback: true },
  };
}

// ─── 报告层 ───
async function reportStage(app, taskId, { evaluation, summary, markdown, detail, jobTitle, model, force = false }) {
  const policy = evaluation.reportPolicy || "auto_ab";
  const want = force || policy === "auto_all" || (policy === "auto_ab" && (evaluation.classification === "A" || evaluation.classification === "B"));
  if (evaluation.engine === "legacy") return { report: evaluation.report, reportStatus: "done" };
  if (!want) return { report: fallbackReport(evaluation), reportStatus: "pending" };
  if (!(await isKimiConfigured())) return { report: fallbackReport(evaluation), reportStatus: "skipped" };
  await stage(app, taskId, "report", { status: "running" });
  const t0 = Date.now();
  try {
    const { report: raw, meta } = await generateReport({ evaluation, candidateSummary: summary, resumeText: markdown, jobTitle, model });
    const report = sanitizeReport(raw, { resumeText: markdown, items: evaluation.items, detail });
    await stage(app, taskId, "report", { status: "done", ms: Date.now() - t0, verifiedQuotes: report.stats?.verifiedQuotes, dropped: report.stats?.droppedQuotes });
    return { report, reportStatus: "done", reportMeta: meta };
  } catch (err) {
    app.log.warn({ err: err.message, taskId }, "[pipeline] report generation failed");
    await stage(app, taskId, "report", { status: "failed", error: err.code || err.message });
    return { report: fallbackReport(evaluation), reportStatus: "failed" };
  }
}

// ─── 评估落库(事务内调用)───
async function persistEvaluation(tx, { candidateId, jobId, resumeParseId, evaluation, report, reportStatus, shadow }) {
  if (!shadow) await tx.candidateEvaluation.updateMany({ where: { candidateId, isCurrent: true }, data: { isCurrent: false } });
  return tx.candidateEvaluation.create({
    data: {
      candidateId, jobId, resumeParseId: resumeParseId || null, engine: evaluation.engine, isCurrent: !shadow, shadow: !!shadow,
      hardFilter: evaluation.hardFilter || { result: "UNKNOWN", items: [] },
      jevRequest: evaluation.jevRequest || null, jevAnswers: evaluation.jevAnswers || null,
      dimensions: evaluation.dimensions || [], items: evaluation.items || [],
      overallScore: evaluation.overallScore ?? 0, classification: evaluation.classification || "C", reviewPriority: evaluation.reviewPriority || "REVIEW",
      reasons: evaluation.reasons || [], flags: evaluation.flags || [], minConfidence: evaluation.minConfidence ?? null,
      report: report || null, reportStatus: reportStatus || "pending",
      versions: evaluation.versions || {}, costs: evaluation.costs || null,
    },
  });
}

// 候选人快照字段(旧列)— 前端 / 公开页 / 飞书卡片零改动
function snapshotFields(evaluation, report) {
  const snap = candidateSnapshotFromReport(report, evaluation);
  return { jdMatch: snap.jdMatch, risks: snap.risks, highlights: snap.highlights, insights: snap.insights, matchedFor: snap.matchedFor, againstFor: snap.againstFor, aiSuggestedTags: snap.aiSuggestedTags.slice(0, 12), classification: snap.classification, reviewPriority: snap.reviewPriority };
}
const CLEAR_EVAL_FIELDS = { jdMatch: null, risks: [], highlights: [], aiSuggestedTags: [], matchedFor: [], againstFor: [], insights: [], classification: null, reviewPriority: null };

// 给前端的 match 形状(与旧 matchAgainstJob 返回兼容)
function matchShape(evaluation, report) {
  if (!evaluation) return null;
  return {
    jdMatch: evaluation.overallScore, classification: evaluation.classification, reviewPriority: evaluation.reviewPriority, engine: evaluation.engine,
    risks: (report?.risks || []).map((x) => x.text), highlights: (report?.highlights || []).map((x) => x.text), insights: report?.insights || [],
    matchedFor: report?.matchedFor || [], againstFor: report?.againstFor || [], aiSuggestedTags: report?.aiSuggestedTags || [], matchReason: report?.matchReason || null,
  };
}

// ═══════════════════════════════════════════════════════════════
// 主入口
// ═══════════════════════════════════════════════════════════════
export async function runPipeline(app, taskId, opts) {
  const { mode, candidateId = null, create = null, jobIdOverride, model, notifyChatId, forceEngine = null } = opts;
  let candidate = null;
  try {
    await markRunning(app, taskId);
    await updateTask(app, taskId, { mode, stages: {} });

    if (candidateId) {
      candidate = await app.prisma.candidate.findUnique({ where: { id: candidateId } });
      if (!candidate) throw E("候选人不存在", 404, "candidate_not_found");
      if (["full", "reextract"].includes(mode) && !candidate.attachment) throw E("候选人无简历附件", 400, "no_attachment");
      await app.prisma.candidate.update({ where: { id: candidateId }, data: { parsingStartedAt: new Date() } });
    }
    const key = create?.key || candidate?.attachment || null;
    const filename = create?.filename || (key ? key.split("/").pop() : "resume.pdf") || "resume.pdf";
    const contentType = create?.contentType || "application/octet-stream";
    const jobIdChanged = candidate ? (jobIdOverride !== undefined && jobIdOverride !== candidate.jobId) : false;
    const jobId = candidate ? (jobIdOverride === undefined ? candidate.jobId : jobIdOverride) : (create?.jobId || null);

    // 1) 文档层
    let ext = null;
    if (mode === "create" || mode === "full" || mode === "reextract") ext = await extractStage(app, taskId, { mode, candidate, key, filename, contentType });
    else ext = await extractStage(app, taskId, { mode, candidate, key, filename, contentType });

    // 2) 理解层
    let fields = null, summary = candidate?.aiSummary || "", profile = candidate?.profile || null, derived = candidate?.derived || null, structured = null;
    if (mode === "create" || mode === "full" || mode === "reextract") {
      if (!(await isKimiConfigured())) throw E("KIMI_API_KEY 未配置,无法结构化简历", 424, "kimi_not_configured");
      structured = await structureStage(app, taskId, { ext, filename, contentType, model, existing: candidate, fallbackName: create?.filename?.replace(/\.[^/.]+$/, "")?.slice(0, 100) || "待解析简历" });
      fields = structured.fields; summary = structured.summary; profile = structured.profile; derived = structured.derived;
    } else if (!profile && candidate) {
      // 存量候选人没有 profile:只重评时用旧列拼最小 profile/derived,保证硬筛可用
      profile = { schemaVersion: "resume.v1", identity: { name: candidate.name, currentCity: candidate.location }, education: candidate.education ? [{ school: candidate.school, degree: candidate.education, major: candidate.major }] : [], experience: [], intent: {}, skills: {}, languages: [], certificates: [] };
      derived = { ...deriveProfile(profile), totalYears: candidate.yearsExp ?? 0, highestDegree: candidate.education || null };
    }

    // 3) 评估层 + 4) 报告层
    let job = null, evaluation = null, shadowEval = null, report = null, reportStatus = "pending", legacyMatch = null;
    if (jobId) {
      job = await app.prisma.job.findUnique({ where: { id: jobId } });
      if (job) {
        const candView = { id: candidate?.id || null, name: fields?.name || candidate?.name, profile, derived };
        if (mode === "report") {
          const current = await app.prisma.candidateEvaluation.findFirst({ where: { candidateId, jobId, isCurrent: true }, orderBy: { evaluatedAt: "desc" } });
          if (!current) throw E("没有可补报告的评估记录", 404, "evaluation_not_found");
          evaluation = { ...current, reportPolicy: "auto_all" };
          const rep = await reportStage(app, taskId, { evaluation, summary, markdown: ext.markdown, detail: ext.detail, jobTitle: job.title, model, force: true });
          report = rep.report; reportStatus = rep.reportStatus;
          report = deepStripNul(report);
          const updatedEval = await app.prisma.candidateEvaluation.update({ where: { id: current.id }, data: { report, reportStatus } });
          const updatedCand = await app.prisma.candidate.update({ where: { id: candidateId }, data: { ...snapshotFields(evaluation, report), parsingStartedAt: null } });
          await markDone(app, taskId, { candidate: withDerivedCandidate(updatedCand), match: matchShape(evaluation, report), evaluation: { id: updatedEval.id, classification: evaluation.classification, overallScore: evaluation.overallScore, engine: evaluation.engine, reportStatus } });
          return;
        }
        try {
          const r = await evaluateStage(app, taskId, { cand: candView, job, markdown: ext.markdown, detail: ext.detail, summary, model, force: forceEngine });
          evaluation = r.primary; shadowEval = r.shadow; legacyMatch = r.match; job = r.job;
          const rep = await reportStage(app, taskId, { evaluation, summary, markdown: ext.markdown, detail: ext.detail, jobTitle: job.title, model });
          report = rep.report; reportStatus = rep.reportStatus;
        } catch (err) {
          app.log.warn({ err: err.message, code: err.code, jobId, taskId }, "[pipeline] 评估失败,候选人仍写入(无 JD 字段)");
          await stage(app, taskId, "evaluate", { status: "failed", error: err.code || err.message });
        }
      }
    }

    // 5) 落库(事务)— 先剥离 NUL(坑 #54)
    if (fields) fields = deepStripNul(fields);
    if (evaluation) evaluation = deepStripNul(evaluation);
    if (shadowEval) shadowEval = deepStripNul(shadowEval);
    if (report) report = deepStripNul(report);
    const now = new Date();
    const result = await app.prisma.$transaction(async (tx) => {
      let row;
      if (mode === "create") {
        const data = {
          ...fields,
          attachment: key,
          source: create?.source?.trim()?.slice(0, 500) || "自动上传",
          status: structured?.status || "待筛选",
          jobId: job?.id || null,
          appliedFor: job?.title || structured?.appliedFor || null,
          ownerId: create?.ownerId || null,
          ...(evaluation ? snapshotFields(evaluation, report) : CLEAR_EVAL_FIELDS),
          parsingStartedAt: null,
        };
        row = await tx.candidate.create({ data });
      } else {
        const data = { ...(fields || {}), parsingStartedAt: null };
        if (jobIdChanged) { data.jobId = jobId; data.status = "待筛选"; if (job) data.appliedFor = job.title; }
        if (jobIdOverride === null) Object.assign(data, CLEAR_EVAL_FIELDS);
        if (evaluation) Object.assign(data, snapshotFields(evaluation, report));
        row = await tx.candidate.update({ where: { id: candidate.id }, data });
        if (jobIdChanged) await cleanupEmployeeOnJobChange(tx, candidate.id, app.log);
      }
      const resumeParseId = ext && !ext.reused && ext.sha ? await persistResumeParseTx(tx, app, row.id, key, ext) : (ext?.resumeParseId || null);
      let evalRow = null;
      if (evaluation && job) {
        evalRow = await persistEvaluation(tx, { candidateId: row.id, jobId: job.id, resumeParseId, evaluation, report, reportStatus, shadow: false });
        if (shadowEval) await persistEvaluation(tx, { candidateId: row.id, jobId: job.id, resumeParseId, evaluation: shadowEval, report: null, reportStatus: "skipped", shadow: true });
      }
      return { row, evalRow };
    }, { timeout: 30_000 });

    await markDone(app, taskId, {
      candidate: withDerivedCandidate(result.row),
      match: evaluation ? matchShape(evaluation, report) : (legacyMatch || null),
      reparsed: mode !== "create",
      evaluation: result.evalRow ? { id: result.evalRow.id, classification: evaluation.classification, overallScore: evaluation.overallScore, engine: evaluation.engine, reportStatus, shadow: !!shadowEval } : null,
    });
    app.log.info({ taskId, mode, candidateId: result.row.id, classification: evaluation?.classification, engine: evaluation?.engine }, "pipeline done");
    if (notifyChatId) await notifyCandidateReady(app, result.row, notifyChatId);
  } catch (err) {
    app.log.error({ err, taskId, mode, candidateId }, "pipeline failed");
    if (candidateId) await app.prisma.candidate.updateMany({ where: { id: candidateId }, data: { parsingStartedAt: null } }).catch(() => {});
    await markFailed(app, taskId, err);
  }
}

// 事务内版本的 ResumeParse 持久化(raw JSON 上传 R2 在事务外已不可行,这里先传再写行)
async function persistResumeParseTx(tx, app, candidateId, attachmentKey, ext) {
  const rawKey = ext.raw ? await putRawToR2(app, `parses/${candidateId}/${ext.sha}.json`, ext.raw) : null;
  const md = String(ext.markdown || "").replace(/\u0000/g, "");
  const row = await tx.resumeParse.upsert({
    where: { candidateId_fileSha256_provider: { candidateId, fileSha256: ext.sha, provider: ext.provider } },
    update: { markdown: md.slice(0, MARKDOWN_MAX), truncated: md.length > MARKDOWN_MAX, rawResultKey: rawKey, providerVersion: ext.providerVersion, pageCount: ext.pageCount ?? null, durationMs: ext.durationMs ?? null, charCount: md.length, attachmentKey },
    create: { candidateId, attachmentKey, fileSha256: ext.sha, provider: ext.provider, providerVersion: ext.providerVersion, markdown: md.slice(0, MARKDOWN_MAX), truncated: md.length > MARKDOWN_MAX, rawResultKey: rawKey, pageCount: ext.pageCount ?? null, durationMs: ext.durationMs ?? null, charCount: md.length },
  });
  return row.id;
}
