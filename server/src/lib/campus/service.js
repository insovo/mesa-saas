// 校招共用业务逻辑(后台 routes/campus.js 与学生端 routes/campus-public.js 共用)
// 全部为「事务内」函数:调用方传 tx,保证 学生 / 版本 / 投递 / Candidate 同步原子完成。

import { QUOTA_STATUS, uploadsAllowed } from "./shared.js";

export function httpError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code });
}

// 同手机号在其它专场登记过 → 复用同一 Candidate(避免重复候选人)
export async function findReusableCandidateId(tx, phone) {
  const prev = await tx.campusApplicant.findFirst({ where: { phone }, orderBy: { createdAt: "desc" }, select: { candidateId: true } });
  return prev?.candidateId || null;
}

// 为学生准备 Candidate:复用或新建;返回 candidateId
export async function ensureCandidate(tx, { session, phone, name, email, school, major, degree, attachmentKey, ownerId }) {
  const reuse = phone ? await findReusableCandidateId(tx, phone) : null;
  if (reuse) {
    const prev = await tx.candidate.findUnique({ where: { id: reuse }, select: { tags: true } });
    if (prev) {
      const tags = Array.from(new Set([...(prev.tags || []), "校招", ...(session.school ? [session.school] : [])]));
      await tx.candidate.update({ where: { id: reuse }, data: { tags, ...(attachmentKey ? { attachment: attachmentKey } : {}) } });
      return reuse;
    }
  }
  const c = await tx.candidate.create({
    data: {
      name: name?.trim() || "待解析简历", phone: phone || null, email: email?.trim() || null,
      school: school || null, major: major || null, education: degree || null,
      status: "待筛选", source: `校招·${session.name}`, tags: ["校招", ...(session.school ? [session.school] : [])],
      ownerId: ownerId || session.createdBy || null, attachment: attachmentKey || null,
      risks: [], highlights: [],
    },
  });
  return c.id;
}

// 新建简历版本:次数校验 → 建版本 → 指向当前版 → 旧匹配作废 → 同步 Candidate.attachment
export async function createVersionTx(tx, { applicant, session, resume, uploadedBy = null }) {
  const allowed = uploadsAllowed(session, applicant);
  if (applicant.resumeUploadCount >= allowed) throw httpError(`已达上传次数上限(${allowed} 次)`, 410, "campus_resume_quota_exceeded");
  const version = applicant.resumeUploadCount + 1;
  const v = await tx.campusResumeVersion.create({
    data: { applicantId: applicant.id, version, attachmentKey: resume.key, filename: resume.filename || null, size: resume.size ?? null, contentType: resume.contentType || null, fileSha256: resume.sha256 || null, uploadedBy },
  });
  await tx.campusApplicant.update({ where: { id: applicant.id }, data: { resumeUploadCount: version, currentResumeVersionId: v.id } });
  await tx.campusMatchRun.updateMany({ where: { applicantId: applicant.id, stale: false }, data: { stale: true } });
  await tx.candidate.update({ where: { id: applicant.candidateId }, data: { attachment: resume.key } });
  return v;
}

// 新建 / 复活投递:岗位属于专场 → 非重复 → 额度 → 写行 → 首个投递同步 Candidate.jobId
export async function createApplicationTx(tx, { applicant, session, jobId, source, resumeVersionId = null, matchRunId = null, scoreRaw = null, scoreShown = null, evaluationId = null }) {
  const sj = await tx.campusSessionJob.findUnique({ where: { sessionId_jobId: { sessionId: session.id, jobId } } });
  if (!sj) throw httpError("岗位不属于本专场", 404, "campus_job_not_in_session");
  const dup = await tx.campusApplication.findUnique({ where: { applicantId_jobId: { applicantId: applicant.id, jobId } } });
  if (dup && dup.status !== "withdrawn") throw httpError("已投递过该岗位", 409, "campus_duplicate_application");
  const active = await tx.campusApplication.count({ where: { applicantId: applicant.id, status: { in: QUOTA_STATUS } } });
  if (active >= session.maxApplyJobs) throw httpError(`最多投递 ${session.maxApplyJobs} 个岗位`, 409, "campus_apply_quota_exceeded");
  const data = { source, status: "applied", statusChangedAt: new Date(), withdrawnAt: null, resumeVersionId, matchRunId, scoreRaw, scoreShown, evaluationId };
  const row = dup
    ? await tx.campusApplication.update({ where: { id: dup.id }, data })
    : await tx.campusApplication.create({ data: { ...data, applicantId: applicant.id, sessionJobId: sj.id, jobId } });
  const cand = await tx.candidate.findUnique({ where: { id: applicant.candidateId }, select: { jobId: true } });
  if (!cand?.jobId) {
    const job = await tx.job.findUnique({ where: { id: jobId }, select: { title: true } });
    await tx.candidate.update({ where: { id: applicant.candidateId }, data: { jobId, appliedFor: job?.title || null } });
  }
  return row;
}

// 当前上线专场(可按 slug 指定;slug 对应专场不在线时仍返回它,让学生端显示「已结束 / 未开始」)
export async function findSessionForPublic(prisma, slug) {
  if (slug) return prisma.campusSession.findUnique({ where: { slug } });
  return prisma.campusSession.findFirst({ where: { status: "live" }, orderBy: { updatedAt: "desc" } });
}
