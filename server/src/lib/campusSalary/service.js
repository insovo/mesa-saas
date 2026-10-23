import { createHash, randomUUID } from "node:crypto";
import { extractDocument } from "../documents.js";
import { parseResume } from "../kimi.js";
import { evaluateSalary } from "./engine.js";
import { extractSalaryFacts } from "./facts.js";
import { suggestSalaryClassification } from "./semantic.js";
import { POLICY_HASH, POLICY_VERSION, BUILTIN_SCHOOLS } from "./policy.js";
import { buildSalaryCard } from "./cards.js";
import { replySalaryCard } from "../feishuNotify.js";
import { reconcileResumeVersion } from "./versions.js";

export const MAX_RESUME_SIZE = 20 * 1024 * 1024;
export const MIME = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };
export const salaryError = (message, statusCode = 422, code = "salary_invalid") => Object.assign(new Error(message), { statusCode, code });

export function validateResume(buffer, filename, contentType) {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (!buffer.length || buffer.length > MAX_RESUME_SIZE || MIME[extension] !== contentType) throw salaryError("文件为空、超过20MB或类型不支持");
  const magic = buffer.subarray(0, 8).toString("hex");
  const valid = extension === "pdf" ? buffer.subarray(0, 1024).includes(Buffer.from("%PDF-")) : extension === "doc" ? magic === "d0cf11e0a1b11ae1" : extension === "docx" ? magic.startsWith("504b0304") : extension === "png" ? magic === "89504e470d0a1a0a" : magic.startsWith("ffd8ff");
  if (!valid) throw salaryError("文件内容与声明类型不一致");
  return extension;
}

async function dictionary(app) {
  const rows = await app.prisma.salarySchool.findMany({ orderBy: { name: "asc" } });
  return [...BUILTIN_SCHOOLS, ...rows.map((r) => ({ ...r.definition, name: r.name, version: `school-${r.id}-r${r.revision}` }))];
}

export async function enqueueSalaryEvaluation(app, evaluationId) {
  if (!app.aiQueue) throw salaryError("定薪任务队列暂不可用，任务已保存等待恢复", 503, "salary_queue_unavailable");
  const existing = await app.aiQueue.getJob(evaluationId);
  if (existing) {
    if (await existing.getState() === "failed") await failSalaryEvaluation(app, evaluationId);
    return;
  }
  await app.aiQueue.add("campus-salary", { evaluationId }, { jobId: evaluationId, attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: { age: 86400, count: 2000 }, removeOnFail: { age: 604800, count: 2000 } });
}

export async function requestSalaryEvaluation(app, submissionId, { revision, context, confirmed, reason, requestedBy } = {}) {
  const schools = await dictionary(app);
  const evaluation = await app.prisma.$transaction(async (tx) => {
    const row = await tx.salarySubmission.findUnique({ where: { id: submissionId }, include: { group: true } });
    if (!row || row.status === "deleted" || !row.group.enabled) throw salaryError("记录不存在或群已停用", 404, "not_found");
    if (row.supersededById) throw salaryError("此简历已有更新，请打开最新简历的定薪记录", 409, "salary_resume_superseded");
    const initial = revision == null;
    if (initial && row.latestEvaluationId) return tx.salaryEvaluation.findUnique({ where: { id: row.latestEvaluationId } });
    if (!initial && revision !== row.revision) throw salaryError("记录已更新，请刷新后再补充", 409, "salary_revision_conflict");
    const nextRevision = initial ? row.revision : row.revision + 1;
    const nextContext = { ...row.context, ...(context || {}) };
    const overrides = { ...row.overrides, ...(confirmed || {}) };
    const changed = await tx.salarySubmission.updateMany({ where: { id: row.id, revision: row.revision, latestEvaluationId: row.latestEvaluationId }, data: { revision: nextRevision, context: nextContext, overrides, status: "queued" } });
    if (!changed.count) throw salaryError("记录已更新，请刷新后重试", 409, "salary_revision_conflict");
    const created = await tx.salaryEvaluation.create({ data: { submissionId, revision: nextRevision, requestedBy: requestedBy || "feishu-service", reason: reason || "群内简历自动定薪", input: { policyVersion: POLICY_VERSION, policyHash: POLICY_HASH, engineVersion: "salary-engine.v3", facts: row.facts, confirmed: overrides, context: nextContext, schools, groupRevision: row.group.revision } } });
    await tx.salarySubmission.update({ where: { id: row.id }, data: { latestEvaluationId: created.id } });
    return created;
  });
  // 数据库记录充当待投递箱；入队失败由worker定期补偿，不能把持久化成功误报为简历丢失。
  void enqueueSalaryEvaluation(app, evaluation.id).catch(() => app.log.warn({ evaluationId: evaluation.id }, "salary enqueue deferred"));
  return evaluation;
}

export async function deleteSalarySubmission(app, submissionId, { revision, latestId }) {
  return app.prisma.$transaction(async (tx) => {
    const initial = await tx.salarySubmission.findUniqueOrThrow({ where: { id: submissionId } });
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${initial.groupId}))::text`;
    const row = await tx.salarySubmission.findUniqueOrThrow({ where: { id: submissionId } });
    if (row.status === "deleted") throw salaryError("记录已删除", 404, "not_found");
    if (row.revision !== revision || (row.supersededById || row.id) !== latestId) throw salaryError("记录已有更新，请刷新后再删除", 409, "salary_revision_conflict");
    const family = { groupId: row.groupId, status: { not: "deleted" }, OR: [{ id: latestId }, { supersededById: latestId }] };
    const rows = await tx.salarySubmission.findMany({ where: family, select: { id: true } });
    const ids = rows.map((item) => item.id);
    await tx.salarySubmission.updateMany({ where: { id: { in: ids } }, data: { status: "deleted", revision: { increment: 1 } } });
    await tx.salaryEvaluation.updateMany({ where: { submissionId: { in: ids }, status: { in: ["queued", "running"] } }, data: { status: "cancelled", finishedAt: new Date() } });
    await tx.salaryEvaluation.updateMany({ where: { submissionId: { in: ids }, deliveryStatus: { not: "sent" } }, data: { deliveryStatus: "superseded", deliveryNextAt: null } });
    return { deletedCount: ids.length };
  });
}

export async function acceptSalaryResume(app, { tenantKey, chatId, messageId, senderOpenId, messageCreatedAt, filename, contentType, data }) {
  const group = await app.prisma.salaryGroup.findUnique({ where: { tenantKey_chatId: { tenantKey, chatId } } });
  if (!group?.enabled) throw salaryError("此群未启用自动定薪", 403, "salary_group_disabled");
  if (!app.r2) throw salaryError("简历存储尚未配置", 503, "r2_not_configured");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4) throw salaryError("文件编码无效");
  const buffer = Buffer.from(data, "base64");
  const extension = validateResume(buffer, filename, contentType);
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  let row = await app.prisma.salarySubmission.findUnique({ where: { groupId_messageId: { groupId: group.id, messageId } } });
  if (!row) {
    try {
      row = await app.prisma.salarySubmission.create({ data: { groupId: group.id, messageId, senderOpenId, ...(messageCreatedAt ? { messageCreatedAt: new Date(messageCreatedAt) } : {}), filename, contentType, fileHash, fileSize: buffer.length, fileKey: `salary-resumes/${randomUUID()}.${extension}`, context: group.context } });
    } catch (err) {
      if (err.code !== "P2002") throw err;
      row = await app.prisma.salarySubmission.findUnique({ where: { groupId_messageId: { groupId: group.id, messageId } } });
    }
  }
  if (row.fileHash !== fileHash) throw salaryError("同一消息关联的文件发生变化", 409, "salary_file_conflict");
  if (row.status === "deleted" || row.latestEvaluationId) return { submissionId: row.id, evaluationId: row.latestEvaluationId, duplicate: true };
  try { await app.r2.putObjectBuffer(row.fileKey, buffer, contentType); }
  catch { await app.prisma.salarySubmission.updateMany({ where: { id: row.id, latestEvaluationId: null, status: { not: "deleted" } }, data: { status: "failed" } }); throw salaryError("简历存储失败，请重新发送", 503, "salary_upload_failed"); }
  await app.prisma.salarySubmission.updateMany({ where: { id: row.id, status: { in: ["accepted", "failed"] } }, data: { status: "uploaded" } });
  let evaluation;
  try { evaluation = await requestSalaryEvaluation(app, row.id); }
  catch (err) {
    if (err.code !== "salary_revision_conflict") throw err;
    const latest = await app.prisma.salarySubmission.findUnique({ where: { id: row.id } });
    if (!latest.latestEvaluationId) throw err;
    return { submissionId: row.id, evaluationId: latest.latestEvaluationId, duplicate: true };
  }
  return { submissionId: row.id, evaluationId: evaluation.id, duplicate: false };
}

export async function runSalaryEvaluation(app, evaluationId, dependencies = {}) {
  const evaluation = await app.prisma.salaryEvaluation.findUnique({ where: { id: evaluationId }, include: { submission: { include: { group: true } } } });
  if (!evaluation || ["done", "failed", "cancelled", "superseded"].includes(evaluation.status)) return;
  if (evaluation.submission.status === "deleted" || !evaluation.submission.group.enabled || evaluation.submission.supersededById || evaluation.submission.latestEvaluationId !== evaluationId) {
    await app.prisma.salaryEvaluation.update({ where: { id: evaluationId }, data: { status: "superseded", deliveryStatus: "superseded" } });
    return;
  }
  const claimed = await app.prisma.salaryEvaluation.updateMany({ where: { id: evaluationId, status: { in: ["queued", "running"] } }, data: { status: "running", error: null } });
  if (!claimed.count) return;
  const input = evaluation.input;
  let facts = input.facts || evaluation.submission.facts;
  if (!facts && input.confirmed.education?.length) facts = { name: null, education: [], evidence: [], confirmed: {}, extraction: { provider: "manual" } };
  try {
    if (!facts) {
      const buffer = await app.r2.getObjectBuffer(evaluation.submission.fileKey, { timeoutMs: 60000 });
      if (createHash("sha256").update(buffer).digest("hex") !== evaluation.submission.fileHash) throw salaryError("文件指纹不一致");
      const args = { buffer, filename: evaluation.submission.filename, contentType: evaluation.submission.contentType, log: app.log };
      const extracted = await (dependencies.extractDocument || extractDocument)(args);
      const parsed = await (dependencies.parseResume || parseResume)({ ...args, preExtractedText: extracted.text, extractionMeta: { provider: extracted.provider } });
      facts = extractSalaryFacts(parsed.profile, extracted.text);
      facts.extraction = { provider: extracted.provider, pageCount: extracted.pageCount, model: parsed.meta?.model, promptHash: parsed.meta?.promptHash };
      await app.prisma.salarySubmission.update({ where: { id: evaluation.submissionId }, data: { facts } });
      await app.prisma.salaryEvaluation.update({ where: { id: evaluationId }, data: { input: { ...input, facts } } });
    }
    const version = await reconcileResumeVersion(app, evaluation.submissionId, facts);
    if (!version.isCurrent) return;
    const result = evaluateSalary({ ...facts, confirmed: input.confirmed }, input.context, { schools: input.schools });
    result.resumeVersion = version;
    if (["conflict", "possible", "unverified"].includes(version.identityStatus)) result.missingFields.push({ field: "identity", reason: version.identityStatus === "conflict" ? "联系方式或姓名存在冲突，未自动合并简历" : version.identityStatus === "possible" ? "存在同名但身份依据不同的简历，未自动合并" : "缺少可核实的完整联系方式，同名新文件不能自动认定为同一人", materials: ["候选人本人姓名及完整手机号或邮箱核对信息"] });
    const semantic = result.missingFields.some((m) => ["majorCategory", "doctorField"].includes(m.field)) ? await (dependencies.suggest || suggestSalaryClassification)(app, { ...facts, confirmed: input.confirmed }) : { status: "not_needed", reason: "本次不需要额外语义判断，已使用明确规则或等待政策口径" };
    result.contextSource = evaluation.revision === 1 ? "发送简历时的群配置" : evaluation.reason;
    if (input.policyHash !== POLICY_HASH) {
      result.salary = { status: "pending", min: null, max: null };
      result.compensation = { status: "pending", salaryFactor: input.context.salaryFactor || null, annualMin: null, annualMax: null };
      result.scenarios = [];
      result.rules = [];
      result.benefits = {};
      result.bonus = { status: "pending", conditions: "政策版本变化，须重新测算", reason: "本版规则未执行" };
      result.missingFields.push({ field: "policy", reason: "任务政策版本已变化，请按当前版本重新测算", materials: ["当前政策版本确认"] });
    }
    await app.prisma.$transaction(async (tx) => {
      const latest = await tx.salarySubmission.findUnique({ where: { id: evaluation.submissionId } });
      const current = latest.status !== "deleted" && !latest.supersededById && latest.latestEvaluationId === evaluationId;
      await tx.salaryEvaluation.update({ where: { id: evaluationId }, data: { status: current ? "done" : "superseded", ...(!current ? { deliveryStatus: "superseded" } : {}), input: { ...input, facts }, result, semantic, finishedAt: new Date() } });
      await tx.salarySubmission.updateMany({ where: { id: evaluation.submissionId, status: { not: "deleted" }, latestEvaluationId: evaluationId, supersededById: null }, data: { status: "done" } });
    });
  } catch (err) {
    app.log.warn({ evaluationId, code: err.code || "salary_processing_failed" }, "salary processing failed");
    throw err;
  }
  await deliverSalaryEvaluation(app, evaluationId, dependencies.reply);
}

export async function deliverSalaryEvaluation(app, evaluationId, send = replySalaryCard) {
  const row = await app.prisma.salaryEvaluation.findUnique({ where: { id: evaluationId }, include: { submission: { include: { group: true } } } });
  if (!row?.result || row.deliveryStatus === "sent" || row.deliveryStatus === "superseded") return;
  if (row.submission.status === "deleted" || !row.submission.group.enabled || row.submission.supersededById || row.submission.latestEvaluationId !== evaluationId) {
    await app.prisma.salaryEvaluation.update({ where: { id: evaluationId }, data: { deliveryStatus: "superseded" } }); return;
  }
  const now = new Date();
  const claimed = await app.prisma.salaryEvaluation.updateMany({ where: { id: evaluationId, deliveryStatus: { in: ["pending", "retry", "sending"] }, OR: [{ deliveryNextAt: null }, { deliveryNextAt: { lte: now } }] }, data: { deliveryStatus: "sending", deliveryAttempts: { increment: 1 }, deliveryNextAt: new Date(Date.now() + 120000) } });
  if (!claimed.count) return;
  try {
    const response = await send(row.submission.messageId, buildSalaryCard(row), row.id);
    await app.prisma.salaryEvaluation.update({ where: { id: row.id }, data: { deliveryStatus: "sent", deliveryMessageId: response?.data?.message_id || null, deliveryNextAt: null } });
  } catch {
    await app.prisma.salaryEvaluation.update({ where: { id: row.id }, data: { deliveryStatus: "retry", deliveryNextAt: new Date(Date.now() + Math.min(3600000, 10000 * 2 ** Math.min(row.deliveryAttempts, 8))) } });
  }
}

export async function failSalaryEvaluation(app, evaluationId, { reply } = {}) {
  const evaluation = await app.prisma.salaryEvaluation.findUnique({ where: { id: evaluationId } });
  if (!evaluation || ["done", "failed", "superseded", "cancelled"].includes(evaluation.status)) return;
  const result = { policyVersion: evaluation.input.policyVersion, salary: { status: "pending", min: null, max: null }, bonus: { status: "pending", conditions: "奖金需按政策条件核验", reason: "简历未完成识别" }, rules: [], scenarios: [], restrictions: [], benefits: {}, facts: { education: evaluation.input.facts?.education || [], context: evaluation.input.context }, missingFields: [{ field: "resume", reason: "简历识别或处理失败，未生成金额", materials: ["可识别的简历文件，或在记录页补充教育及录用信息后重试"] }] };
  const failed = await app.prisma.salaryEvaluation.updateMany({ where: { id: evaluation.id, status: { in: ["queued", "running"] } }, data: { status: "failed", error: "简历处理失败，请补充信息或重试", result, finishedAt: new Date() } });
  if (!failed.count) return;
  await app.prisma.salarySubmission.updateMany({ where: { id: evaluation.submissionId, status: { not: "deleted" }, latestEvaluationId: evaluation.id, supersededById: null }, data: { status: "failed" } });
  if (reply) await deliverSalaryEvaluation(app, evaluation.id, reply);
}

export async function recoverSalaryWork(app, { reply } = {}) {
  let cursor;
  while (true) {
    const queued = await app.prisma.salaryEvaluation.findMany({ where: { status: { in: ["queued", "running"] } }, select: { id: true }, orderBy: { id: "asc" }, take: 100, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}) });
    for (const row of queued) await enqueueSalaryEvaluation(app, row.id).catch(() => {});
    if (queued.length < 100) break;
    cursor = queued.at(-1).id;
  }
  const uploaded = await app.prisma.salarySubmission.findMany({ where: { status: "uploaded", latestEvaluationId: null }, select: { id: true }, take: 100 });
  for (const row of uploaded) await requestSalaryEvaluation(app, row.id).catch(() => {});
  const deliveries = await app.prisma.salaryEvaluation.findMany({ where: { status: { in: ["done", "failed"] }, deliveryStatus: { in: ["pending", "retry", "sending"] }, OR: [{ deliveryNextAt: null }, { deliveryNextAt: { lte: new Date() } }] }, select: { id: true }, take: 100 });
  for (const row of deliveries) await deliverSalaryEvaluation(app, row.id, reply);
}
