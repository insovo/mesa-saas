// /api/candidates/:id/interview-evals  - admin 端: 列表 + 创建
// /api/interview-evals/:id              - admin 端: 详情 / patch / delete / export
// /api/public/interview-eval/:token     - 公开端: 表单读 / 草稿 / 提交 / 导出
//
// 模型: InterviewEvaluation (server/prisma/schema.prisma)
// 模板: server/assets/templates/interview-evaluation-v1.xlsx (SHA-256 在 lib 中锁定)
// 评分维度 / 字段映射 / 计算函数 / 安全工具: lib/interviewEvalTemplate.js
// 导出器: lib/interviewEvalExport.js
//
// 安全策略:
//   1. token = 24 字节 URL-safe base64 (32 字符), 不可猜
//   2. expiresAt 软过期, 超期返回 410, DB 不删
//   3. 公开端 GET/PATCH 不返回 createdBy / revokedBy / 内部 user id
//   4. 提交后默认锁定 (status="submitted"), admin 可 patch status=draft 退回
//   5. 公开端的 PATCH 草稿 deep-merge, 不破坏未传字段
//   6. 导出文件名 RFC 5987 编码, 兼容中文

import { randomBytes } from "node:crypto";
import {
  SCORE_DIMENSIONS,
  SCORING_RUBRIC,
  INFO_FIELDS,
  SUMMARY_FIELDS,
  TEMPLATE_VERSION,
  getTemplateHash,
  computeTotalScore,
  recommendationFor,
  isValidScore,
} from "../lib/interviewEvalTemplate.js";
import {
  renderEvaluationToXlsx,
  attachmentHeaderForFilename,
} from "../lib/interviewEvalExport.js";

function tokenGen() {
  return randomBytes(24).toString("base64url");
}

// duration "3d" / "7d" / "60s" / "forever" → Date | null
// 与 share.js 保持一致;独立实现是为了避免循环依赖
function computeExpiresAt(duration) {
  if (!duration || duration === "forever") return null;
  const match = duration.match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!match) {
    throw Object.assign(new Error("invalid duration format"), {
      statusCode: 400, code: "invalid_duration",
    });
  }
  const n = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const secs = unit === "s" ? n : unit === "m" ? n * 60 : unit === "h" ? n * 3600 : n * 86400;
  const MIN = 60, MAX = 30 * 86400;
  if (secs < MIN || secs > MAX) {
    throw Object.assign(new Error("duration must be 60s - 30d"), {
      statusCode: 400, code: "duration_out_of_range",
    });
  }
  return new Date(Date.now() + secs * 1000);
}

// 把数据库 InterviewEvaluation 整形成公开端响应(剔除敏感字段)
function publicShape(ev, meta = {}) {
  const scoresMap = new Map((ev.scores || []).map((s) => [s.key, s]));
  const scoresOut = SCORE_DIMENSIONS.map((dim) => ({
    key: dim.key,
    name: dim.name,
    weight: dim.weight,
    observation: dim.observation,
    score: scoresMap.get(dim.key)?.score ?? null,
    remark: scoresMap.get(dim.key)?.remark ?? "",
  }));

  return {
    evaluation: {
      candidateName: ev.candidateName,
      position: ev.position,
      region: ev.region,
      interviewDate: ev.interviewDate,
      interviewer: ev.interviewer,
      languageStrength: ev.languageStrength,
      currentCity: ev.currentCity,
      department: ev.department,
      timezoneCollaboration: ev.timezoneCollaboration,
      scores: scoresOut,
      strengths: ev.strengths,
      risks: ev.risks,
      followUpQuestions: ev.followUpQuestions,
      finalOpinion: ev.finalOpinion,
      totalScore: ev.totalScore,
      recommendation: ev.recommendation,
      status: ev.status,
    },
    meta: {
      expiresAt: ev.expiresAt,
      submittedAt: ev.submittedAt,
      templateVersion: ev.templateVersion,
      readonly: ev.status === "submitted" || ev.status === "revoked",
      canExport: ev.status === "submitted",  // 决策 4: 提交后面试官也可导出
      ...meta,
    },
    scoringRubric: SCORING_RUBRIC,
  };
}

// admin 端响应整形 (含内部字段)
function adminShape(ev) {
  return {
    id: ev.id,
    candidateId: ev.candidateId,
    interviewId: ev.interviewId,
    jobId: ev.jobId,
    token: ev.token,
    status: ev.status,
    expiresAt: ev.expiresAt,
    candidateName: ev.candidateName,
    position: ev.position,
    region: ev.region,
    interviewDate: ev.interviewDate,
    interviewer: ev.interviewer,
    languageStrength: ev.languageStrength,
    currentCity: ev.currentCity,
    department: ev.department,
    timezoneCollaboration: ev.timezoneCollaboration,
    scores: ev.scores || [],
    strengths: ev.strengths,
    risks: ev.risks,
    followUpQuestions: ev.followUpQuestions,
    finalOpinion: ev.finalOpinion,
    totalScore: ev.totalScore,
    recommendation: ev.recommendation,
    templateVersion: ev.templateVersion,
    templateFileHash: ev.templateFileHash,
    createdBy: ev.createdBy,
    submittedAt: ev.submittedAt,
    exportedAt: ev.exportedAt,
    exportedCount: ev.exportedCount,
    lastViewedAt: ev.lastViewedAt,
    viewCount: ev.viewCount,
    revokedAt: ev.revokedAt,
    createdAt: ev.createdAt,
    updatedAt: ev.updatedAt,
  };
}

// 把传入的 scores patch 合并到已有 scores (按 key)
// 仅接受合法 1-10 整数;非法值清空(允许面试官擦除)
function mergeScores(existing, patch) {
  if (!Array.isArray(patch)) return existing || [];
  const byKey = new Map((existing || []).map((s) => [s.key, { ...s }]));
  const validKeys = new Set(SCORE_DIMENSIONS.map((d) => d.key));
  for (const item of patch) {
    if (!item || !validKeys.has(item.key)) continue;
    const next = byKey.get(item.key) || { key: item.key };
    if ("score" in item) {
      const v = item.score;
      next.score = (v == null || v === "") ? null : (isValidScore(v) ? Number(v) : next.score);
    }
    if ("remark" in item) {
      next.remark = item.remark == null ? "" : String(item.remark).slice(0, 200);
    }
    byKey.set(item.key, next);
  }
  return Array.from(byKey.values());
}

// 提交前完整校验
function validateForSubmit(body, merged) {
  const errors = [];
  // 候选人信息必填
  for (const f of INFO_FIELDS) {
    if (f.required && !(merged[f.key] && String(merged[f.key]).trim())) {
      errors.push({ field: f.key, message: `${f.label} 不能为空` });
    }
  }
  // 7 项评分全填且 1-10 整数
  const scoresByKey = new Map((merged.scores || []).map((s) => [s.key, s.score]));
  for (const dim of SCORE_DIMENSIONS) {
    const v = scoresByKey.get(dim.key);
    if (!isValidScore(v)) {
      errors.push({ field: `score.${dim.key}`, message: `${dim.name} 评分必须为 1-10 的整数` });
    }
  }
  // 最终意见必填
  if (!merged.finalOpinion || !String(merged.finalOpinion).trim()) {
    errors.push({ field: "finalOpinion", message: "最终意见 不能为空" });
  }
  return errors;
}

export default async function interviewEvalRoutes(app) {
  // ─── Admin 端: 鉴权 ─────────────────────────────────────────────
  app.register(async (admin) => {
    admin.addHook("preHandler", admin.authenticate);

    // GET 列表 — 某候选人的所有评价邀请
    admin.get("/candidates/:id/interview-evals", async (req) => {
      const list = await admin.prisma.interviewEvaluation.findMany({
        where: { candidateId: req.params.id, deletedAt: null },
        orderBy: { createdAt: "desc" },
      });
      return { items: list.map(adminShape) };
    });

    // POST 创建邀请 + 生成 token
    admin.post("/candidates/:id/interview-evals", {
      schema: {
        body: {
          type: "object",
          required: ["interviewer"],
          properties: {
            interviewer:   { type: "string", minLength: 1, maxLength: 100 },
            interviewId:   { type: ["string", "null"], format: "uuid" },
            duration:      { type: "string", maxLength: 20 },         // 默认 7d
            prefill:       { type: "boolean" },                        // 默认 true: 从 candidate/interview 拉取预填
            position:      { type: ["string", "null"], maxLength: 200 },
            department:    { type: ["string", "null"], maxLength: 100 },
            region:        { type: ["string", "null"], maxLength: 200 },
            currentCity:   { type: ["string", "null"], maxLength: 100 },
            languageStrength:      { type: ["string", "null"], maxLength: 200 },
            timezoneCollaboration: { type: ["string", "null"], maxLength: 100 },
            interviewDate: { type: ["string", "null"], format: "date-time" },
          },
          additionalProperties: false,
        },
      },
    }, async (req, reply) => {
      const candidate = await admin.prisma.candidate.findUnique({
        where: { id: req.params.id },
        include: { job: { select: { id: true, title: true, dept: true } } },
      });
      if (!candidate) return reply.code(404).send({ error: "candidate_not_found" });

      const duration = req.body?.duration || "7d";
      let expiresAt;
      try { expiresAt = computeExpiresAt(duration); }
      catch (err) { return reply.code(400).send({ error: err.code, message: err.message }); }

      // 预填策略: 默认开 (决策 3)
      const prefill = req.body?.prefill !== false;
      let interview = null;
      if (req.body?.interviewId) {
        interview = await admin.prisma.interview.findUnique({
          where: { id: req.body.interviewId },
        });
        if (!interview || interview.candidateId !== candidate.id) {
          return reply.code(400).send({ error: "interview_mismatch", message: "interviewId 不属于此候选人" });
        }
      }

      const data = {
        token: tokenGen(),
        candidateId: candidate.id,
        interviewId: interview?.id || null,
        jobId: candidate.jobId || interview?.jobId || null,
        status: "link_sent",
        expiresAt,
        // 候选人信息: 显式入参 > 预填取值 > null
        candidateName: candidate.name,  // 姓名始终从 candidate 取
        position: req.body?.position ?? (prefill ? (candidate.appliedFor || candidate.job?.title || null) : null),
        department: req.body?.department ?? (prefill ? (candidate.job?.dept || null) : null),
        region: req.body?.region ?? null,
        currentCity: req.body?.currentCity ?? (prefill ? (candidate.location || null) : null),
        languageStrength: req.body?.languageStrength ?? null,
        timezoneCollaboration: req.body?.timezoneCollaboration ?? null,
        interviewDate: req.body?.interviewDate
          ? new Date(req.body.interviewDate)
          : (prefill && interview?.scheduledAt ? interview.scheduledAt : null),
        interviewer: req.body.interviewer.trim().slice(0, 100),
        scores: [],
        templateVersion: TEMPLATE_VERSION,
        templateFileHash: getTemplateHash(),
        createdBy: req.user.sub,
      };

      const created = await admin.prisma.interviewEvaluation.create({ data });
      return reply.code(201).send({ item: adminShape(created) });
    });

    // GET 单条详情
    admin.get("/interview-evals/:id", async (req, reply) => {
      const ev = await admin.prisma.interviewEvaluation.findUnique({ where: { id: req.params.id } });
      if (!ev || ev.deletedAt) return reply.code(404).send({ error: "eval_not_found" });
      // 非 ADMIN 只能看自己创建的(对齐 upload-links.js 风格)
      if (req.user.role !== "ADMIN" && ev.createdBy !== req.user.sub) {
        return reply.code(403).send({ error: "forbidden" });
      }
      return { item: adminShape(ev) };
    });

    // PATCH 改 duration / 撤销 / admin 退回编辑
    admin.patch("/interview-evals/:id", {
      schema: {
        body: {
          type: "object",
          properties: {
            duration: { type: "string", maxLength: 20 },
            status:   { type: "string", enum: ["draft", "revoked"] },  // admin 退回 draft / 撤销
          },
          additionalProperties: false,
        },
      },
    }, async (req, reply) => {
      const ev = await admin.prisma.interviewEvaluation.findUnique({ where: { id: req.params.id } });
      if (!ev || ev.deletedAt) return reply.code(404).send({ error: "eval_not_found" });
      if (req.user.role !== "ADMIN" && ev.createdBy !== req.user.sub) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const patch = {};
      if (typeof req.body?.duration === "string") {
        try { patch.expiresAt = computeExpiresAt(req.body.duration); }
        catch (err) { return reply.code(400).send({ error: err.code, message: err.message }); }
      }
      if (req.body?.status === "revoked") {
        patch.status = "revoked";
        patch.revokedAt = new Date();
        patch.revokedBy = req.user.sub;
      } else if (req.body?.status === "draft") {
        // 仅 ADMIN 可退回
        if (req.user.role !== "ADMIN") {
          return reply.code(403).send({ error: "admin_required", message: "仅 ADMIN 可退回编辑" });
        }
        patch.status = "draft";
        patch.submittedAt = null;
      }
      if (Object.keys(patch).length === 0) {
        return reply.code(400).send({ error: "no_fields", message: "duration / status 至少一个" });
      }

      const updated = await admin.prisma.interviewEvaluation.update({
        where: { id: ev.id },
        data: patch,
      });
      return { item: adminShape(updated) };
    });

    // DELETE 软删除(仅 ADMIN)
    admin.delete("/interview-evals/:id", async (req, reply) => {
      const ev = await admin.prisma.interviewEvaluation.findUnique({ where: { id: req.params.id } });
      if (!ev || ev.deletedAt) return reply.code(404).send({ error: "eval_not_found" });
      if (req.user.role !== "ADMIN") {
        return reply.code(403).send({ error: "admin_required" });
      }
      await admin.prisma.interviewEvaluation.update({
        where: { id: ev.id },
        data: { deletedAt: new Date() },
      });
      return reply.code(204).send();
    });

    // GET 导出 xlsx (admin 任意状态可导出)
    admin.get("/interview-evals/:id/export.xlsx", async (req, reply) => {
      const ev = await admin.prisma.interviewEvaluation.findUnique({ where: { id: req.params.id } });
      if (!ev || ev.deletedAt) return reply.code(404).send({ error: "eval_not_found" });
      if (req.user.role !== "ADMIN" && ev.createdBy !== req.user.sub) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const { buffer, filename } = await renderEvaluationToXlsx(ev);
      await admin.prisma.interviewEvaluation.update({
        where: { id: ev.id },
        data: { exportedAt: new Date(), exportedCount: { increment: 1 } },
      }).catch(() => {});

      reply
        .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .header("Content-Disposition", attachmentHeaderForFilename(filename));
      return reply.send(buffer);
    });
  });

  // ─── 公开端: 不鉴权,仅 token ─────────────────────────────────
  async function loadValid(token, reply) {
    const ev = await app.prisma.interviewEvaluation.findUnique({ where: { token } });
    if (!ev || ev.deletedAt) {
      reply.code(404).send({ error: "eval_not_found", message: "链接无效或已删除" });
      return null;
    }
    if (ev.status === "revoked") {
      reply.code(410).send({ error: "eval_revoked", message: "此评价链接已被撤销" });
      return null;
    }
    if (ev.expiresAt && ev.expiresAt < new Date()) {
      reply.code(410).send({ error: "eval_expired", message: "此评价链接已过期" });
      return null;
    }
    return ev;
  }

  // 公开:从分享链接(/share/:token)的「填写面试评价」按钮创建一条面试评价邀请。
  // 用 share token 校验 → 用 link.candidateId 预填创建 InterviewEvaluation(createdBy 继承链接创建者)→ 返回 eval token,
  // 前端跳 /interview-eval/:token 复用现有公开填写页。面试官姓名留空,在填写页里自填。
  app.post("/public/share/:token/interview-eval", async (req, reply) => {
    const link = await app.prisma.shareLink.findUnique({
      where: { token: req.params.token },
      include: { candidate: { include: { job: { select: { title: true, dept: true } } } } },
    });
    if (!link) return reply.code(404).send({ error: "share_not_found", message: "链接无效" });
    if (link.expiresAt && link.expiresAt < new Date()) {
      return reply.code(410).send({ error: "share_expired", message: "此分享链接已过期" });
    }
    if (link.showInterviewEval === false) {
      return reply.code(403).send({ error: "interview_eval_disabled", message: "此分享未开放面试评价" });
    }
    // 防刷:该候选人「未提交」的面试评价草稿数上限
    const PENDING_CAP = 30;
    const pending = await app.prisma.interviewEvaluation.count({
      where: { candidateId: link.candidateId, status: "link_sent", submittedAt: null, deletedAt: null },
    });
    if (pending >= PENDING_CAP) {
      return reply.code(429).send({ error: "interview_eval_quota", message: "面试评价待填数量已达上限,请联系招聘官" });
    }
    const candidate = link.candidate;
    const created = await app.prisma.interviewEvaluation.create({
      data: {
        token: tokenGen(),
        candidateId: candidate.id,
        jobId: candidate.jobId || null,
        status: "link_sent",
        expiresAt: computeExpiresAt("7d"),
        candidateName: candidate.name,
        position: candidate.appliedFor || candidate.job?.title || null,
        department: candidate.job?.dept || null,
        region: null,
        currentCity: candidate.location || null,
        languageStrength: null,
        timezoneCollaboration: null,
        interviewDate: null,
        interviewer: "",
        scores: [],
        templateVersion: TEMPLATE_VERSION,
        templateFileHash: getTemplateHash(),
        createdBy: link.createdBy || null,
      },
    });
    return reply.code(201).send({ token: created.token });
  });

  // GET 表单数据 — 记录一次访问
  app.get("/public/interview-eval/:token", async (req, reply) => {
    const ev = await loadValid(req.params.token, reply);
    if (!ev) return;

    await app.prisma.interviewEvaluation.update({
      where: { id: ev.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    }).catch(() => {});

    return publicShape(ev);
  });

  // PATCH 保存草稿 — deep-merge,仅传入字段更新
  app.patch("/public/interview-eval/:token", {
    schema: {
      body: {
        type: "object",
        properties: {
          position:              { type: ["string", "null"], maxLength: 200 },
          region:                { type: ["string", "null"], maxLength: 200 },
          interviewDate:         { type: ["string", "null"], format: "date-time" },
          interviewer:           { type: ["string", "null"], maxLength: 100 },
          languageStrength:      { type: ["string", "null"], maxLength: 200 },
          currentCity:           { type: ["string", "null"], maxLength: 100 },
          department:            { type: ["string", "null"], maxLength: 100 },
          timezoneCollaboration: { type: ["string", "null"], maxLength: 100 },
          scores: {
            type: "array",
            maxItems: SCORE_DIMENSIONS.length,
            items: {
              type: "object",
              required: ["key"],
              properties: {
                key:    { type: "string", maxLength: 50 },
                score:  { type: ["integer", "null"], minimum: 1, maximum: 10 },
                remark: { type: ["string", "null"], maxLength: 200 },
              },
              additionalProperties: false,
            },
          },
          strengths:         { type: ["string", "null"], maxLength: 500 },
          risks:             { type: ["string", "null"], maxLength: 500 },
          followUpQuestions: { type: ["string", "null"], maxLength: 500 },
          finalOpinion:      { type: ["string", "null"], maxLength: 500 },
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const ev = await loadValid(req.params.token, reply);
    if (!ev) return;
    if (ev.status === "submitted") {
      return reply.code(409).send({ error: "eval_already_submitted", message: "已提交,无法继续编辑;请联系招聘官退回" });
    }

    const patch = {};
    const stringFields = [
      "position", "region",
      "languageStrength", "currentCity", "department", "timezoneCollaboration",
      "strengths", "risks", "followUpQuestions", "finalOpinion",
    ];
    for (const f of stringFields) {
      if (f in req.body) patch[f] = req.body[f] == null ? null : String(req.body[f]);
    }
    // interviewer 是非空列(schema: String);草稿阶段允许为空,落库为 "" 而非 null,
    // 否则分享页创建的初始空 interviewer 在草稿保存时会触发 Prisma null 约束错误。
    // 最终非空由 /submit 校验保证。
    if ("interviewer" in req.body) {
      patch.interviewer = req.body.interviewer == null ? "" : String(req.body.interviewer);
    }
    if ("interviewDate" in req.body) {
      patch.interviewDate = req.body.interviewDate ? new Date(req.body.interviewDate) : null;
    }
    if ("scores" in req.body) {
      patch.scores = mergeScores(ev.scores, req.body.scores);
    }
    // 第一次 PATCH 把 status 从 link_sent 升到 draft
    if (ev.status === "link_sent") patch.status = "draft";

    const updated = await app.prisma.interviewEvaluation.update({
      where: { id: ev.id },
      data: patch,
    });
    return publicShape(updated);
  });

  // POST 提交 — 幂等 (二次提交返回当前状态)
  app.post("/public/interview-eval/:token/submit", async (req, reply) => {
    const ev = await loadValid(req.params.token, reply);
    if (!ev) return;

    // 幂等: 已提交直接返回
    if (ev.status === "submitted") return publicShape(ev);

    const merged = { ...ev };
    const errors = validateForSubmit(req.body || {}, merged);
    if (errors.length > 0) {
      return reply.code(422).send({
        error: "eval_validation_failed",
        message: "必填字段缺失或评分不合法",
        details: errors,
      });
    }

    const total = computeTotalScore(merged.scores);
    const recommendation = recommendationFor(total);

    const updated = await app.prisma.interviewEvaluation.update({
      where: { id: ev.id },
      data: {
        status: "submitted",
        submittedAt: new Date(),
        totalScore: total,
        recommendation,
      },
    });
    return publicShape(updated);
  });

  // GET 公开端导出 (决策 4: 提交后面试官可导出本次评价)
  app.get("/public/interview-eval/:token/export.xlsx", async (req, reply) => {
    const ev = await loadValid(req.params.token, reply);
    if (!ev) return;
    if (ev.status !== "submitted") {
      return reply.code(403).send({ error: "eval_export_disabled", message: "评价尚未提交,无法导出" });
    }

    const { buffer, filename } = await renderEvaluationToXlsx(ev);
    await app.prisma.interviewEvaluation.update({
      where: { id: ev.id },
      data: { exportedAt: new Date(), exportedCount: { increment: 1 } },
    }).catch(() => {});

    reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", attachmentHeaderForFilename(filename));
    return reply.send(buffer);
  });
}
