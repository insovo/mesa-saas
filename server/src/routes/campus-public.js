// /api/campus/public — 校招学生端(AuthGuard 外)。设计:校招模块/校招模块设计规划.html §5 §8.1
//
// 学生免登录:首次上传前勾选告知 → POST /auth/start 匿名建档(phone 为空)→ 学生 JWT { sub: applicantId, aud: "campus-public", sid, tv }
//      存浏览器 localStorage;手机 / 邮箱 / 微信在「确认联系方式」页填写。与后台 JWT 同密钥不同 audience;
//      plugins/jwt.js 的 authenticate 拒绝该 aud,反之这里只收该 aud。
// 规则:投递与智能匹配都必须先有简历(428 campus_resume_required)并确认联系方式(428 campus_contact_unconfirmed);
//      上传成功即后台抽取(lib/campus/extract.js);对学生只回必要字段,不回 R2 直链 / 评估明细 / 原始分。

import { SETTING_KEYS, getEffective, getEffectiveNumber, getEffectiveJson, getEffectiveBool } from "../lib/settings.js";
import { issueCode, consumeCode } from "../lib/verificationCodes.js";
import { isEmailConfigured } from "../lib/email.js";
import { startExtraction, cancelExtraction } from "../lib/campus/extract.js";
import { startMatchRun, cancelMatchRun, runShape, buildStrengthReasons } from "../lib/campus/match.js";
import { getTask } from "../lib/parseTaskStore.js";
import { ensureCandidate, createVersionTx, createApplicationTx, findSessionForPublic, httpError } from "../lib/campus/service.js";
import { reconcileCampusAutoEvaluation } from "../lib/campus/autoEvaluation.js";
import { ALLOWED_RESUME_MIME, RESUME_MAX_SIZE, QUOTA_STATUS, normalizePhone, uploadsAllowed, shownScore } from "../lib/campus/shared.js";

const PHONE_RE = /^\+?\d{6,15}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONSENT_VERSION = "2026-10-08";

async function refreshAutoEvaluation(app, applicantId) {
  await reconcileCampusAutoEvaluation(app, applicantId).catch((err) => app.log.error({ err, applicantId }, "[campus] auto evaluation scheduling failed"));
}

function sessionShape(s, { showSalaryFlags = false } = {}) {
  if (!s) return null;
  return {
    id: s.id, slug: s.slug, name: s.name, school: s.school, location: s.location, status: s.status,
    startsAt: s.startsAt, endsAt: s.endsAt, heroTitle: s.heroTitle || s.name, heroSubtitle: s.heroSubtitle,
    maxApplyJobs: s.maxApplyJobs, maxResumeUploads: s.maxResumeUploads, matchEnabled: s.matchEnabled,
    ...(showSalaryFlags ? { showSalaryOnsite: s.showSalaryOnsite, showSalaryReferral: s.showSalaryReferral } : {}),
  };
}
function sessionOpen(s) {
  if (!s || s.status !== "live") return false;
  if (s.endsAt && s.endsAt < new Date()) return false;
  return true;
}
function jobCard(sj, session, appliedSet) {
  const j = sj.job;
  const showSalary = sj.kind === "referral" ? session.showSalaryReferral : session.showSalaryOnsite;
  return { id: j.id, title: j.title, dept: j.dept, location: j.location, employment: j.employment, kind: sj.kind, matchEnabled: sj.matchEnabled && !!j.evaluationModel, salary: showSalary ? j.salary : null, applied: appliedSet ? appliedSet.has(j.id) : false };
}
function jobDetail(sj, session, appliedSet) {
  const j = sj.job;
  return { ...jobCard(sj, session, appliedSet), levelRange: j.levelRange, yearsExpRange: j.yearsExpRange, educationRequirement: j.educationRequirement, languageRequirement: j.languageRequirement, description: j.description, responsibilities: j.responsibilities || [], requirements: j.requirements || [], nice: j.nice || [], benefits: j.benefits || [] };
}
function versionShape(v) {
  return { id: v.id, version: v.version, filename: v.filename, size: v.size, parseStatus: v.parseStatus, uploadedAt: v.uploadedAt };
}
function applicationShape(a) {
  return { id: a.id, jobId: a.jobId, source: a.source, status: a.status, statusChangedAt: a.statusChangedAt, scoreShown: shownScore(a.scoreShown ?? a.scoreRaw, 60), createdAt: a.createdAt, kind: a.sessionJob?.kind, job: a.sessionJob?.job ? { id: a.sessionJob.job.id, title: a.sessionJob.job.title, dept: a.sessionJob.job.dept, location: a.sessionJob.job.location } : null };
}
function meShape(a, session) {
  const current = a.resumeVersions?.find((v) => v.id === a.currentResumeVersionId) || null;
  const active = (a.applications || []).filter((x) => QUOTA_STATUS.includes(x.status));
  const lastRun = a.matchRuns?.[0] || null;
  return {
    latestMatchRun: lastRun ? { id: lastRun.id, status: lastRun.status, stale: lastRun.stale, finishedAt: lastRun.finishedAt, resumeVersionId: lastRun.resumeVersionId } : null,
    id: a.id, name: a.name, phone: a.phone, email: a.email, wechat: a.wechat, school: a.school, major: a.major, degree: a.degree, gradYear: a.gradYear,
    contactConfirmed: !!a.contactConfirmedAt, hasResume: !!current, currentVersion: current ? versionShape(current) : null,
    uploadsUsed: a.resumeUploadCount, uploadsAllowed: uploadsAllowed(session, a), applied: active.length, maxApplyJobs: session.maxApplyJobs,
    applications: (a.applications || []).map(applicationShape), versions: (a.resumeVersions || []).map(versionShape),
  };
}

const applicantInclude = {
  session: true,
  matchRuns: { orderBy: { startedAt: "desc" }, take: 1, select: { id: true, status: true, stale: true, finishedAt: true, resumeVersionId: true } },
  resumeVersions: { orderBy: { version: "desc" } },
  applications: { include: { sessionJob: { include: { job: { select: { id: true, title: true, dept: true, location: true } } } } }, orderBy: { createdAt: "asc" } },
};

export default async function campusPublicRoutes(app) {
  const concurrency = async () => getEffectiveNumber(SETTING_KEYS.CAMPUS_MATCH_CONCURRENCY, 3);

  // 可选鉴权:有合法学生 token 则挂 req.applicant,否则 null(首页 / 岗位列表用)
  async function optionalStudent(req) {
    const h = req.headers.authorization || "";
    if (!h.startsWith("Bearer ")) return null;
    try {
      const payload = await req.jwtVerify();
      if (payload?.aud !== "campus-public" || !payload.sub) return null;
      const a = await app.prisma.campusApplicant.findUnique({ where: { id: payload.sub }, include: applicantInclude });
      if (!a || a.tokenVersion !== (payload.tv ?? 0)) return null;
      return a;
    } catch { return null; }
  }
  // 必须鉴权
  async function requireStudent(req, reply) {
    const a = await optionalStudent(req);
    if (!a) { reply.code(401).send({ error: "campus_unauthorized", message: "请先登录" }); return null; }
    // lastSeenAt 节流 5 分钟写一次
    if (!a.lastSeenAt || Date.now() - new Date(a.lastSeenAt).getTime() > 5 * 60_000) {
      app.prisma.campusApplicant.update({ where: { id: a.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
    }
    return a;
  }
  function requireOpen(session, reply) {
    if (!sessionOpen(session)) { reply.code(410).send({ error: "campus_session_inactive", message: "本专场未开放或已结束" }); return false; }
    return true;
  }
  async function studentRunShape(run, task, candidateId) {
    const shaped = runShape(run, task);
    if (run.status !== "done") return shaped;
    const results = Array.isArray(run.results) ? run.results : [];
    const legacy = results.filter((result) => result.excluded && result.evaluationId && !shaped.results.find((item) => item.jobId === result.jobId)?.reasons.length);
    if (!legacy.length) return shaped;
    const evaluations = await app.prisma.candidateEvaluation.findMany({ where: { id: { in: legacy.map((result) => result.evaluationId) }, candidateId }, select: { id: true, items: true } });
    const strengths = new Map(evaluations.map((evaluation) => [evaluation.id, buildStrengthReasons(evaluation)]));
    shaped.results = shaped.results.map((result) => {
      const source = legacy.find((item) => item.jobId === result.jobId);
      return source ? { ...result, reasons: strengths.get(source.evaluationId) || [] } : result;
    });
    return shaped;
  }
  function sendErr(reply, err) {
    if (err?.statusCode) return reply.code(err.statusCode).send({ error: err.code, message: err.message, ...(err.payload || {}) });
    throw err;
  }
  // 后台预览草稿:?preview=1 + 后台 JWT
  async function allowPreview(req) {
    if (req.query?.preview !== "1") return false;
    try { const p = await req.jwtVerify(); return !!p?.sub && p.aud !== "campus-public"; } catch { return false; }
  }

  // ─── 专场 / 岗位(无需登录)──────────────────────────────────
  app.get("/session/current", { schema: { querystring: { type: "object", properties: { slug: { type: "string", maxLength: 48 }, preview: { type: "string" } } } } }, async (req) => {
    const s = await findSessionForPublic(app.prisma, req.query.slug);
    const me = await optionalStudent(req);
    const preview = s && s.status !== "live" ? await allowPreview(req) : false;
    const hints = await getEffectiveJson(SETTING_KEYS.CAMPUS_CONTACT_HINTS, []);
    return {
      session: s ? { ...sessionShape(s), open: sessionOpen(s) || preview, preview } : null,
      me: me && me.sessionId === s?.id ? { applied: me.applications.filter((x) => QUOTA_STATUS.includes(x.status)).length, uploads: me.resumeUploadCount, hasResume: !!me.currentResumeVersionId, contactConfirmed: !!me.contactConfirmedAt, name: me.name, phone: me.phone } : null,
      contactHints: hints,
      pcUploadEnabled: await getEffectiveBool(SETTING_KEYS.CAMPUS_PC_UPLOAD_ENABLED),
      // 电脑端上传兜底:专场已绑定公开上传链接且开关打开时下发公开路径(学生复制到电脑打开)
      pcUpload: s?.pcUploadToken && (await getEffectiveBool(SETTING_KEYS.CAMPUS_PC_UPLOAD_ENABLED)) ? { path: `/upload/${s.pcUploadToken}` } : null,
      emailConfigured: isEmailConfigured(), // false 时找回页提示开发模式(验证码直接回显)
    };
  });

  app.get("/session/current/jobs", { schema: { querystring: { type: "object", properties: { slug: { type: "string", maxLength: 48 } } } } }, async (req, reply) => {
    const s = await findSessionForPublic(app.prisma, req.query.slug);
    if (!s) return reply.code(404).send({ error: "campus_session_not_found", message: "没有进行中的专场" });
    const me = await optionalStudent(req);
    const appliedSet = me && me.sessionId === s.id ? new Set(me.applications.filter((x) => x.status !== "withdrawn").map((x) => x.jobId)) : null;
    const sjs = await app.prisma.campusSessionJob.findMany({ where: { sessionId: s.id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { job: true } });
    const cards = sjs.map((sj) => jobCard(sj, s, appliedSet));
    return { onsite: cards.filter((c) => c.kind === "onsite"), referral: cards.filter((c) => c.kind === "referral") };
  });

  app.get("/jobs/:id", { schema: { querystring: { type: "object", properties: { slug: { type: "string", maxLength: 48 } } } } }, async (req, reply) => {
    const s = await findSessionForPublic(app.prisma, req.query.slug);
    if (!s) return reply.code(404).send({ error: "campus_session_not_found" });
    const sj = await app.prisma.campusSessionJob.findUnique({ where: { sessionId_jobId: { sessionId: s.id, jobId: req.params.id } }, include: { job: true } });
    if (!sj) return reply.code(404).send({ error: "campus_job_not_in_session", message: "岗位不属于当前专场" });
    const me = await optionalStudent(req);
    const appliedSet = me && me.sessionId === s.id ? new Set(me.applications.filter((x) => x.status !== "withdrawn").map((x) => x.jobId)) : null;
    return { job: jobDetail(sj, s, appliedSet) };
  });

  // ─── 匿名建档(免登录)────────────────────────────────────────
  // 首次上传简历前调用:勾选《个人信息处理告知》→ 建 Candidate(占位)+ 学生记录 → 签 JWT 存浏览器。
  // 已持有效 token 时直接复用(幂等)。
  app.post("/auth/start", { schema: { body: { type: "object", required: ["consent"], properties: { slug: { type: ["string", "null"], maxLength: 48 }, consent: { type: "boolean" } }, additionalProperties: false } } }, async (req, reply) => {
    if (!req.body.consent) return reply.code(422).send({ error: "campus_consent_required", message: "请先同意个人信息处理告知" });
    const s = await findSessionForPublic(app.prisma, req.body.slug || undefined);
    if (!s) return reply.code(404).send({ error: "campus_session_not_found", message: "没有进行中的专场" });
    if (!requireOpen(s, reply)) return;
    const existing = await optionalStudent(req);
    if (existing && existing.sessionId === s.id) {
      return { token: null, me: meShape(existing, s), session: sessionShape(s), reused: true };
    }
    const now = new Date();
    const applicant = await app.prisma.$transaction(async (tx) => {
      const candidateId = await ensureCandidate(tx, { session: s, phone: null, ownerId: s.createdBy });
      return tx.campusApplicant.create({ data: { sessionId: s.id, candidateId, consentAt: now, consentVersion: CONSENT_VERSION, lastSeenAt: now } });
    });
    const ttl = (await getEffective(SETTING_KEYS.CAMPUS_AUTH_JWT_TTL)) || "30d";
    const token = app.jwt.sign({ sub: applicant.id, aud: "campus-public", sid: s.id, tv: applicant.tokenVersion }, { expiresIn: ttl });
    const full = await app.prisma.campusApplicant.findUnique({ where: { id: applicant.id }, include: applicantInclude });
    return reply.code(201).send({ token, me: meShape(full, s), session: sessionShape(s), reused: false });
  });

  // ─── 找回记录(免登录,换设备 / 清缓存后用)────────────────────
  // 手机号 + 邮箱 匹配本专场已确认联系方式的记录 → 邮箱验证码 → 签新 token 接回原记录。不是登录:没有账号密码,只是把会话续回去。
  async function findRecoverable(sessionId, phone, email) {
    return app.prisma.campusApplicant.findFirst({ where: { sessionId, phone, email: { equals: email, mode: "insensitive" }, contactConfirmedAt: { not: null } }, orderBy: { updatedAt: "desc" } });
  }
  const RECOVER_BODY = { type: "object", required: ["phone", "email"], properties: { slug: { type: ["string", "null"], maxLength: 48 }, phone: { type: "string", maxLength: 30 }, email: { type: "string", maxLength: 200 }, code: { type: "string", minLength: 4, maxLength: 8 } }, additionalProperties: false };

  app.post("/auth/recover/send-code", { schema: { body: RECOVER_BODY } }, async (req, reply) => {
    const phone = normalizePhone(req.body.phone);
    const email = String(req.body.email).trim().toLowerCase();
    if (!PHONE_RE.test(phone)) return reply.code(422).send({ error: "campus_phone_invalid", message: "手机号格式不正确" });
    if (!EMAIL_RE.test(email)) return reply.code(422).send({ error: "campus_email_invalid", message: "邮箱格式不正确" });
    const s = await findSessionForPublic(app.prisma, req.body.slug || undefined);
    if (!s) return reply.code(404).send({ error: "campus_session_not_found", message: "没有进行中的专场" });
    const a = await findRecoverable(s.id, phone, email);
    if (!a) return reply.code(404).send({ error: "campus_record_not_found", message: "没有找到这组手机号 + 邮箱的记录,请核对后重试,或联系现场 HR" });
    try {
      const r = await issueCode(app.prisma, { email, purpose: "CAMPUS_RECOVER", ip: req.headers["cf-connecting-ip"] || req.ip });
      return { ok: true, cooldownS: 60, ...(r.devCode ? { devCode: r.devCode } : {}) };
    } catch (err) {
      if (err.code === "resend_too_soon") return reply.code(429).send({ error: "campus_code_rate_limited", message: `发送过于频繁,请 ${err.retryAfter} 秒后再试`, retryAfter: err.retryAfter });
      if (err.code === "hourly_limit_exceeded") return reply.code(429).send({ error: "campus_code_rate_limited", message: "该邮箱本小时发送次数已达上限" });
      if (err.code === "email_send_failed" || err.code === "email_timeout") return reply.code(424).send({ error: "campus_email_send_failed", message: "验证码邮件发送失败,请稍后重试" });
      return sendErr(reply, err);
    }
  });

  app.post("/auth/recover/verify", { schema: { body: { ...RECOVER_BODY, required: ["phone", "email", "code"] } } }, async (req, reply) => {
    const phone = normalizePhone(req.body.phone);
    const email = String(req.body.email).trim().toLowerCase();
    const s = await findSessionForPublic(app.prisma, req.body.slug || undefined);
    if (!s) return reply.code(404).send({ error: "campus_session_not_found", message: "没有进行中的专场" });
    const a = await findRecoverable(s.id, phone, email);
    if (!a) return reply.code(404).send({ error: "campus_record_not_found", message: "没有找到匹配的记录" });
    try {
      await consumeCode(app.prisma, { email, purpose: "CAMPUS_RECOVER", code: req.body.code });
    } catch (err) {
      return reply.code(400).send({ error: "campus_code_invalid", message: err.code === "code_mismatch" ? "验证码不正确" : "验证码已失效,请重新获取" });
    }
    const ttl = (await getEffective(SETTING_KEYS.CAMPUS_AUTH_JWT_TTL)) || "30d";
    const token = app.jwt.sign({ sub: a.id, aud: "campus-public", sid: s.id, tv: a.tokenVersion }, { expiresIn: ttl });
    await app.prisma.campusApplicant.update({ where: { id: a.id }, data: { emailVerifiedAt: new Date(), lastSeenAt: new Date() } });
    const full = await app.prisma.campusApplicant.findUnique({ where: { id: a.id }, include: applicantInclude });
    return { token, me: meShape(full, s), session: sessionShape(s) };
  });

  // ─── 我 ─────────────────────────────────────────────────────
  app.get("/me", async (req, reply) => {
    const a = await requireStudent(req, reply);
    if (!a) return;
    return { me: meShape(a, a.session), session: { ...sessionShape(a.session), open: sessionOpen(a.session) } };
  });

  app.patch("/me", { schema: { body: { type: "object", properties: { name: { type: ["string", "null"], maxLength: 100 }, wechat: { type: ["string", "null"], maxLength: 100 }, school: { type: ["string", "null"], maxLength: 120 }, major: { type: ["string", "null"], maxLength: 120 }, degree: { type: ["string", "null"], maxLength: 50 }, gradYear: { type: ["integer", "null"], minimum: 1990, maximum: 2100 } }, additionalProperties: false } } }, async (req, reply) => {
    const a = await requireStudent(req, reply);
    if (!a) return;
    const data = { ...req.body };
    if (Object.hasOwn(data, "gradYear")) {
      data.gradYearSource = data.gradYear == null ? "default" : "manual";
      if (data.gradYear == null) data.gradYear = 2026;
    }
    const u = await app.prisma.$transaction(async (tx) => {
      const row = await tx.campusApplicant.update({ where: { id: a.id }, data, include: applicantInclude });
      const cd = {};
      if (data.name) cd.name = data.name;
      if (data.school !== undefined) cd.school = data.school;
      if (data.major !== undefined) cd.major = data.major;
      if (data.degree !== undefined) cd.education = data.degree;
      if (Object.keys(cd).length) await tx.candidate.update({ where: { id: a.candidateId }, data: cd });
      return row;
    });
    return { me: meShape(u, a.session) };
  });

  // 联系方式确认:手机 + 邮箱必填,微信可选;同时同步 Candidate
  app.post("/me/contact-confirm", { schema: { body: { type: "object", required: ["phone", "email"], properties: { phone: { type: "string", maxLength: 30 }, email: { type: "string", maxLength: 200 }, wechat: { type: ["string", "null"], maxLength: 100 }, name: { type: ["string", "null"], maxLength: 100 } }, additionalProperties: false } } }, async (req, reply) => {
    const a = await requireStudent(req, reply);
    if (!a) return;
    const phone = normalizePhone(req.body.phone);
    const email = String(req.body.email).trim().toLowerCase();
    const wechat = req.body.wechat?.trim() || null;
    const name = req.body.name?.trim() || null;
    if (!PHONE_RE.test(phone)) return reply.code(422).send({ error: "campus_phone_invalid", message: "手机号格式不正确" });
    if (!EMAIL_RE.test(email)) return reply.code(422).send({ error: "campus_email_invalid", message: "邮箱格式不正确" });
    const u = await app.prisma.$transaction(async (tx) => {
      const row = await tx.campusApplicant.update({ where: { id: a.id }, data: { phone, email, wechat, ...(name ? { name } : {}), contactConfirmedAt: new Date() }, include: applicantInclude });
      await tx.candidate.update({ where: { id: a.candidateId }, data: { phone, email, ...(name ? { name } : {}) } });
      return row;
    });
    return { me: meShape(u, a.session) };
  });

  // ─── 简历 ───────────────────────────────────────────────────
  app.post("/resumes/presigned-url", { schema: { body: { type: "object", required: ["filename", "contentType"], properties: { filename: { type: "string", minLength: 1, maxLength: 200 }, contentType: { type: "string", maxLength: 100 }, size: { type: "integer", minimum: 1, maximum: RESUME_MAX_SIZE } }, additionalProperties: false } } }, async (req, reply) => {
    const a = await requireStudent(req, reply);
    if (!a) return;
    if (!requireOpen(a.session, reply)) return;
    if (!app.r2) return reply.code(503).send({ error: "r2_not_configured", message: "文件存储未配置,请联系现场 HR" });
    if (!ALLOWED_RESUME_MIME.has(req.body.contentType)) return reply.code(415).send({ error: "campus_file_unsupported", message: "仅支持 PDF / Word 简历" });
    const allowed = uploadsAllowed(a.session, a);
    if (a.resumeUploadCount >= allowed) return reply.code(410).send({ error: "campus_resume_quota_exceeded", message: `已用完 ${allowed} 次上传机会,如需更新请联系现场 HR` });
    const ext = req.body.filename.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1]?.toLowerCase() || "bin";
    const key = `campus/${a.sessionId}/${a.id}/v${a.resumeUploadCount + 1}-${Date.now().toString(36)}.${ext}`;
    const uploadUrl = await app.r2.presignPut({ key, contentType: req.body.contentType, expiresIn: 900 });
    return { uploadUrl, key, expiresIn: 900 };
  });

  app.post("/resumes/submit", { schema: { body: { type: "object", required: ["key"], properties: { key: { type: "string", minLength: 1, maxLength: 500 }, filename: { type: ["string", "null"], maxLength: 200 }, size: { type: ["integer", "null"], minimum: 0, maximum: RESUME_MAX_SIZE }, contentType: { type: ["string", "null"], maxLength: 100 }, sha256: { type: ["string", "null"], maxLength: 64 } }, additionalProperties: false } } }, async (req, reply) => {
    const a = await requireStudent(req, reply);
    if (!a) return;
    if (!requireOpen(a.session, reply)) return;
    // key 必须是本人前缀(presigned 时由后端生成)
    if (!req.body.key.startsWith(`campus/${a.sessionId}/${a.id}/`)) return reply.code(403).send({ error: "campus_key_forbidden", message: "文件 key 非法" });
    // 同一 sha256 重复上传:不计次,提示
    if (req.body.sha256) {
      const same = a.resumeVersions.find((v) => v.fileSha256 && v.fileSha256 === req.body.sha256);
      if (same) return reply.code(200).send({ duplicate: true, version: versionShape(same), remaining: uploadsAllowed(a.session, a) - a.resumeUploadCount, message: "与已上传的版本相同,未重复计次" });
    }
    let v;
    try {
      v = await app.prisma.$transaction((tx) => createVersionTx(tx, { applicant: a, session: a.session, resume: req.body }));
    } catch (err) { return sendErr(reply, err); }
    const taskId = await startExtraction(app, { applicantId: a.id, versionId: v.id, candidateId: a.candidateId, concurrency: await concurrency() });
    await refreshAutoEvaluation(app, a.id);
    return reply.code(201).send({ duplicate: false, version: { ...versionShape(v), parseStatus: taskId ? "running" : "skipped" }, remaining: uploadsAllowed(a.session, a) - v.version, parseTaskId: taskId });
  });

  app.get("/resumes", async (req, reply) => {
    const a = await requireStudent(req, reply);
    if (!a) return;
    return { items: a.resumeVersions.map(versionShape), currentId: a.currentResumeVersionId, remaining: uploadsAllowed(a.session, a) - a.resumeUploadCount };
  });

  // 抽取状态(确认页小波浪球 + 预填)
  app.get("/resumes/:versionId/parse-status", async (req, reply) => {
    const a = await requireStudent(req, reply);
    if (!a) return;
    const v = a.resumeVersions.find((x) => x.id === req.params.versionId);
    if (!v) return reply.code(404).send({ error: "not_found" });
    let prefill = null;
    if (v.parseStatus === "done") {
      const c = await app.prisma.candidate.findUnique({ where: { id: a.candidateId }, select: { name: true, school: true, major: true, education: true, derived: true } });
      const extractedYear = c?.derived?.graduationYear;
      const gradYear = Number.isInteger(extractedYear) && extractedYear >= 1990 && extractedYear <= 2100 ? extractedYear : a.gradYear ?? 2026;
      prefill = { name: a.name || (c?.name !== "待解析简历" ? c?.name : null) || null, school: a.school || c?.school || null, major: a.major || c?.major || null, degree: a.degree || c?.education || null, gradYear: a.gradYearSource === "manual" ? a.gradYear : gradYear };
    }
    return { status: v.parseStatus, error: v.parseStatus === "failed" ? v.parseError : null, prefill };
  });

  // 取消抽取(后台任务可随时取消;已完成 / 已失败则原样返回)
  app.post("/resumes/:versionId/cancel-parse", async (req, reply) => {
    const a = await requireStudent(req, reply);
    if (!a) return;
    const v = a.resumeVersions.find((x) => x.id === req.params.versionId);
    if (!v) return reply.code(404).send({ error: "not_found" });
    const u = await cancelExtraction(app, { versionId: v.id });
    return { status: u?.parseStatus || v.parseStatus };
  });
  // 重新解析当前版本(取消 / 失败后可重试,不计上传次数)
  app.post("/resumes/:versionId/reparse", async (req, reply) => {
    const a = await requireStudent(req, reply);
    if (!a) return;
    if (!requireOpen(a.session, reply)) return;
    const v = a.resumeVersions.find((x) => x.id === req.params.versionId);
    if (!v) return reply.code(404).send({ error: "not_found" });
    if (v.id !== a.currentResumeVersionId) return reply.code(409).send({ error: "campus_not_current_version", message: "只能解析当前版本" });
    if (v.parseStatus === "running") return reply.code(409).send({ error: "campus_parse_in_progress", message: "正在解析中" });
    await app.prisma.candidate.update({ where: { id: a.candidateId }, data: { attachment: v.attachmentKey } });
    const taskId = await startExtraction(app, { applicantId: a.id, versionId: v.id, candidateId: a.candidateId, concurrency: await concurrency() });
    if (!taskId) return reply.code(424).send({ error: "kimi_not_configured", message: "解析服务未配置,请联系现场 HR" });
    return reply.code(202).send({ taskId, status: "running" });
  });

  // ─── 智能匹配 ───────────────────────────────────────────────
  app.post("/match-runs", async (req, reply) => {
    const a = await requireStudent(req, reply);
    if (!a) return;
    if (!requireOpen(a.session, reply)) return;
    if (!gate(a, reply)) return;
    try {
      const run = await startMatchRun(app, { applicant: a, session: a.session, concurrency: await concurrency() });
      const task = run.taskId ? await getTask(app, run.taskId) : null;
      return reply.code(202).send({ run: await studentRunShape(run, task, a.candidateId) });
    } catch (err) { return sendErr(reply, err); }
  });
  app.get("/match-runs/latest", async (req, reply) => {
    const a = await requireStudent(req, reply);
    if (!a) return;
    const run = await app.prisma.campusMatchRun.findFirst({ where: { applicantId: a.id }, orderBy: { startedAt: "desc" } });
    if (!run) return { run: null };
    const task = run.taskId ? await getTask(app, run.taskId) : null;
    return { run: await studentRunShape(run, task, a.candidateId) };
  });
  app.get("/match-runs/:id", async (req, reply) => {
    const a = await requireStudent(req, reply);
    if (!a) return;
    const run = await app.prisma.campusMatchRun.findFirst({ where: { id: req.params.id, applicantId: a.id } });
    if (!run) return reply.code(404).send({ error: "not_found" });
    const task = run.taskId ? await getTask(app, run.taskId) : null;
    return { run: await studentRunShape(run, task, a.candidateId) };
  });
  app.post("/match-runs/:id/cancel", async (req, reply) => {
    const a = await requireStudent(req, reply);
    if (!a) return;
    const run = await app.prisma.campusMatchRun.findFirst({ where: { id: req.params.id, applicantId: a.id } });
    if (!run) return reply.code(404).send({ error: "not_found" });
    const u = await cancelMatchRun(app, run);
    return { run: runShape(u, null) };
  });

  // ─── 投递 ───────────────────────────────────────────────────
  function gate(a, reply) {
    if (!a.currentResumeVersionId) { reply.code(428).send({ error: "campus_resume_required", message: "请先上传简历" }); return false; }
    if (!a.contactConfirmedAt) { reply.code(428).send({ error: "campus_contact_unconfirmed", message: "请先确认联系方式" }); return false; }
    return true;
  }

  app.post("/applications", { schema: { body: { type: "object", required: ["jobId"], properties: { jobId: { type: "string", format: "uuid" }, source: { type: "string", enum: ["direct", "match"] }, matchRunId: { type: ["string", "null"], format: "uuid" } }, additionalProperties: false } } }, async (req, reply) => {
    const a = await requireStudent(req, reply);
    if (!a) return;
    if (!requireOpen(a.session, reply)) return;
    if (!gate(a, reply)) return;
    try {
      const row = await app.prisma.$transaction(async (tx) => {
        let extra = {};
        if (req.body.source === "match" && req.body.matchRunId) {
          const run = await tx.campusMatchRun.findFirst({ where: { id: req.body.matchRunId, applicantId: a.id, resumeVersionId: a.currentResumeVersionId, status: "done", stale: false } });
          const hit = Array.isArray(run?.results) ? run.results.find((r) => r.jobId === req.body.jobId) : null;
          if (hit && !hit.error && hit.evaluationId) extra = { matchRunId: run.id, scoreRaw: hit.scoreRaw ?? null, scoreShown: shownScore(hit.scoreShown ?? hit.scoreRaw, 60), evaluationId: hit.evaluationId };
        }
        return createApplicationTx(tx, { applicant: a, session: a.session, jobId: req.body.jobId, source: req.body.source || "direct", resumeVersionId: a.currentResumeVersionId, ...extra });
      });
      await refreshAutoEvaluation(app, a.id);
      const full = await app.prisma.campusApplication.findUnique({ where: { id: row.id }, include: { sessionJob: { include: { job: { select: { id: true, title: true, dept: true, location: true } } } } } });
      const active = await app.prisma.campusApplication.count({ where: { applicantId: a.id, status: { in: QUOTA_STATUS } } });
      return reply.code(201).send({ application: applicationShape(full), applied: active, maxApplyJobs: a.session.maxApplyJobs });
    } catch (err) { return sendErr(reply, err); }
  });

  app.get("/applications", async (req, reply) => {
    const a = await requireStudent(req, reply);
    if (!a) return;
    return { items: a.applications.map(applicationShape), applied: a.applications.filter((x) => QUOTA_STATUS.includes(x.status)).length, maxApplyJobs: a.session.maxApplyJobs };
  });

  // 撤回(仅 applied / screening 阶段可撤)
  app.delete("/applications/:id", async (req, reply) => {
    const a = await requireStudent(req, reply);
    if (!a) return;
    const row = a.applications.find((x) => x.id === req.params.id);
    if (!row) return reply.code(404).send({ error: "not_found" });
    if (!["applied", "screening"].includes(row.status)) return reply.code(409).send({ error: "campus_cannot_withdraw", message: "该投递已进入面试流程,如需撤回请联系 HR" });
    await app.prisma.campusApplication.update({ where: { id: row.id }, data: { status: "withdrawn", statusChangedAt: new Date(), withdrawnAt: new Date() } });
    await refreshAutoEvaluation(app, a.id);
    return reply.code(204).send();
  });

  app.get("/health", async () => ({ ok: true, r2: !!app.r2 }));
}
