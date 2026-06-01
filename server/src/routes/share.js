// /api/candidates/:id/share — ShareLink CRUD (登录用户,需 candidate.share 模块 + 数据范围)
// /api/public/share/:token — 公开访问入口(无鉴权,但 token 不可猜 + 过期校验 + 创建者权限继承)

import { randomBytes } from "node:crypto";
import {
  loadUserAccess,
  hasModule,
  assertCandidateAccess,
  buildCandidateScopeWhere,
  computeAllowedModules,
  isAdmin,
} from "../lib/permissions.js";
import { ALL_MODULE_KEYS_SET } from "../lib/permissionKeys.js";

function tokenGen() {
  return randomBytes(24).toString("base64url");
}

function computeExpiresAt(duration) {
  if (!duration || duration === "forever") return null;
  const match = duration.match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!match) throw Object.assign(new Error("invalid duration format"), { statusCode: 400, code: "invalid_duration" });
  const n = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const secs = unit === "s" ? n : unit === "m" ? n * 60 : unit === "h" ? n * 3600 : n * 86400;
  const MIN = 60, MAX = 30 * 86400;
  if (secs < MIN || secs > MAX) {
    throw Object.assign(new Error("duration must be 60s - 30d"), { statusCode: 400, code: "duration_out_of_range" });
  }
  return new Date(Date.now() + secs * 1000);
}

// 把 admin 端 body.allowedModules 收敛到合法 key 集合
function sanitizeAllowedModules(body) {
  if (!Array.isArray(body?.allowedModules)) return null;
  return body.allowedModules.filter((k) => typeof k === "string" && ALL_MODULE_KEYS_SET.has(k));
}

export default async function shareRoutes(app) {
  // ─── 登录用户端 ─────────────────────────────────────
  app.register(async (admin) => {
    admin.addHook("preHandler", admin.authenticate);

    admin.get("/candidates/:id/share", async (req, reply) => {
      const access = await loadUserAccess(req);
      if (!hasModule(access, "candidate.share")) {
        return reply.code(403).send({ error: "forbidden", message: "无分享权限" });
      }
      const ok = await assertCandidateAccess(req, reply, req.params.id);
      if (!ok) return;
      const link = await admin.prisma.shareLink.findFirst({
        where: { candidateId: req.params.id },
        orderBy: { createdAt: "desc" },
      });
      return { link };
    });

    admin.post("/candidates/:id/share", {
      schema: {
        body: {
          type: "object",
          properties: {
            duration: { type: "string", maxLength: 20 },
            maxViews: { type: ["integer", "null"], minimum: 1, maximum: 9999 },
            showContact:     { type: "boolean" },
            showAttachments: { type: "boolean" },
            showInterviewEval: { type: "boolean" },
            showInterviewEvalList: { type: "boolean" },
            // 创建者最多能允许的模块,会和创建者自身的模块权限取交集
            allowedModules: { type: "array", items: { type: "string", maxLength: 64 } },
          },
          additionalProperties: false,
        },
      },
    }, async (req, reply) => {
      const access = await loadUserAccess(req);
      if (!hasModule(access, "candidate.share")) {
        return reply.code(403).send({ error: "forbidden", message: "无分享权限" });
      }
      const ok = await assertCandidateAccess(req, reply, req.params.id);
      if (!ok) return;

      const candidate = await admin.prisma.candidate.findUnique({ where: { id: req.params.id } });
      if (!candidate) return reply.code(404).send({ error: "candidate_not_found" });

      const duration = req.body?.duration || "3d";
      let expiresAt;
      try { expiresAt = computeExpiresAt(duration); }
      catch (err) { return reply.code(400).send({ error: err.code, message: err.message }); }

      // showAttachments 必须创建者拥有 candidate.attachments 才允许
      const askShowAttachments = req.body?.showAttachments === true;
      const canShowAttachments = hasModule(access, "candidate.attachments");
      const showAttachments = askShowAttachments && canShowAttachments;

      // showInterviewEval 默认开,创建者只要能分享即可开放(无额外模块门)
      const showInterviewEval = req.body?.showInterviewEval !== false;
      // showInterviewEvalList(展示已有评价)默认关,独立于「支持填写」
      const showInterviewEvalList = req.body?.showInterviewEvalList === true;

      // showContact 必须创建者拥有 candidate.contact 才允许
      const askShowContact = req.body?.showContact !== false; // default true
      const canShowContact = hasModule(access, "candidate.contact");
      const showContact = askShowContact && canShowContact;

      // 计算 allowedModules 快照
      const requestedModules = sanitizeAllowedModules(req.body);
      const allowedModules = computeAllowedModules(access, requestedModules);

      // 先删旧 link (1 candidate : 1 active link)
      await admin.prisma.shareLink.deleteMany({ where: { candidateId: req.params.id } });

      const link = await admin.prisma.shareLink.create({
        data: {
          token: tokenGen(),
          candidateId: req.params.id,
          expiresAt,
          maxViews: req.body?.maxViews ?? null,
          showContact,
          showAttachments,
          showInterviewEval,
          showInterviewEvalList,
          allowedModules,
          createdBy: req.user.sub,
        },
      });
      return reply.code(201).send({ link });
    });

    admin.patch("/candidates/:id/share", {
      schema: {
        body: {
          type: "object",
          properties: {
            duration: { type: "string", maxLength: 20 },
            maxViews: { type: ["integer", "null"], minimum: 1, maximum: 9999 },
            showContact:     { type: "boolean" },
            showAttachments: { type: "boolean" },
            showInterviewEval: { type: "boolean" },
            showInterviewEvalList: { type: "boolean" },
            allowedModules: { type: "array", items: { type: "string", maxLength: 64 } },
          },
          additionalProperties: false,
        },
      },
    }, async (req, reply) => {
      const access = await loadUserAccess(req);
      if (!hasModule(access, "candidate.share")) {
        return reply.code(403).send({ error: "forbidden", message: "无分享权限" });
      }
      const ok = await assertCandidateAccess(req, reply, req.params.id);
      if (!ok) return;

      const data = {};
      if (typeof req.body?.duration !== "undefined") {
        try { data.expiresAt = computeExpiresAt(req.body.duration); }
        catch (err) { return reply.code(400).send({ error: err.code, message: err.message }); }
      }
      if (typeof req.body?.maxViews !== "undefined") {
        data.maxViews = req.body.maxViews;
      }
      if (typeof req.body?.showContact === "boolean") {
        const want = req.body.showContact;
        if (want && !hasModule(access, "candidate.contact")) {
          return reply.code(403).send({ error: "forbidden", message: "您没有联系方式模块权限,无法对外开放" });
        }
        data.showContact = want;
      }
      if (typeof req.body?.showAttachments === "boolean") {
        const want = req.body.showAttachments;
        if (want && !hasModule(access, "candidate.attachments")) {
          return reply.code(403).send({ error: "forbidden", message: "您没有附件模块权限,无法对外开放" });
        }
        data.showAttachments = want;
      }
      if (typeof req.body?.showInterviewEval === "boolean") {
        data.showInterviewEval = req.body.showInterviewEval;
      }
      if (typeof req.body?.showInterviewEvalList === "boolean") {
        data.showInterviewEvalList = req.body.showInterviewEvalList;
      }
      if (req.body?.allowedModules) {
        const requested = sanitizeAllowedModules(req.body);
        data.allowedModules = computeAllowedModules(access, requested);
      }
      if (Object.keys(data).length === 0) {
        return reply.code(400).send({ error: "no_fields", message: "至少传 1 个字段" });
      }

      const existing = await admin.prisma.shareLink.findFirst({ where: { candidateId: req.params.id } });
      if (!existing) return reply.code(404).send({ error: "share_not_found" });

      const link = await admin.prisma.shareLink.update({ where: { id: existing.id }, data });
      return { link };
    });

    admin.delete("/candidates/:id/share", async (req, reply) => {
      const access = await loadUserAccess(req);
      if (!hasModule(access, "candidate.share")) {
        return reply.code(403).send({ error: "forbidden", message: "无分享权限" });
      }
      const ok = await assertCandidateAccess(req, reply, req.params.id);
      if (!ok) return;
      await admin.prisma.shareLink.deleteMany({ where: { candidateId: req.params.id } });
      return reply.code(204).send();
    });
  });

  // ─── 公开端 ─────────────────────────────────────────
  // 应用创建者权限继承规则(规划文档第十节):
  //   1. 创建者被停用 → 410 share_disabled
  //   2. 创建者已无该候选人访问权限 → 410 share_disabled
  //   3. 最终模块 = link.allowedModules ∩ 创建者当前权限 (向后兼容: allowedModules 为空 = 全开)
  app.get("/public/share/:token", async (req, reply) => {
    const link = await app.prisma.shareLink.findUnique({
      where: { token: req.params.token },
      include: {
        candidate: true,
        creator: {
          select: {
            id: true,
            role: true,
            isActive: true,
            accessPolicy: { select: { moduleKeys: true } },
            departmentScopes: { select: { departmentId: true, includeChildren: true } },
            jobScopes: { select: { jobId: true } },
          },
        },
      },
    });
    if (!link) return reply.code(404).send({ error: "share_not_found", message: "链接无效" });
    if (link.expiresAt && link.expiresAt < new Date()) {
      return reply.code(410).send({ error: "share_expired", message: "此分享链接已过期" });
    }
    if (link.maxViews != null && link.viewCount >= link.maxViews) {
      return reply.code(410).send({ error: "share_quota_exceeded", message: `此链接访问次数已达上限 (${link.maxViews} 次)` });
    }

    // 创建者权限继承校验
    const creator = link.creator;
    let creatorModules;
    if (!creator) {
      // 历史 ShareLink: createdBy 为 NULL 或被删用户 → 视为 ADMIN 全开(向后兼容旧数据)
      creatorModules = Array.from(ALL_MODULE_KEYS_SET);
    } else {
      if (creator.isActive === false) {
        return reply.code(410).send({ error: "share_disabled", message: "分享链接已被禁用" });
      }
      // 校验创建者是否仍能访问该候选人(非 ADMIN 才查)
      if (!isAdmin(creator.role)) {
        const c = link.candidate;
        const dirCandSelfOwned = c.ownerId === creator.id;
        const jobAllowed = c.jobId && creator.jobScopes.some((s) => s.jobId === c.jobId);
        let deptAllowed = false;
        if (c.departmentId && creator.departmentScopes.length > 0) {
          const directIds = new Set(creator.departmentScopes.map((s) => s.departmentId));
          if (directIds.has(c.departmentId)) deptAllowed = true;
          else {
            // 递归看子部门
            const expand = creator.departmentScopes.filter((s) => s.includeChildren).map((s) => s.departmentId);
            if (expand.length > 0) {
              const set = new Set();
              let frontier = expand;
              while (frontier.length > 0) {
                const children = await app.prisma.department.findMany({
                  where: { parentId: { in: frontier } },
                  select: { id: true },
                });
                const next = [];
                for (const ch of children) {
                  if (!set.has(ch.id)) {
                    set.add(ch.id);
                    next.push(ch.id);
                  }
                }
                frontier = next;
              }
              if (set.has(c.departmentId)) deptAllowed = true;
            }
          }
        }
        if (!(dirCandSelfOwned || jobAllowed || deptAllowed)) {
          return reply.code(410).send({ error: "share_disabled", message: "分享链接已被禁用" });
        }
      }
      creatorModules = isAdmin(creator.role)
        ? Array.from(ALL_MODULE_KEYS_SET)
        : (creator.accessPolicy?.moduleKeys || []);
    }

    // 最终 module 集合 = allowedModules ∩ 创建者现有 module 权限
    // 向后兼容:link.allowedModules 为空数组 → 仅靠 showContact/showAttachments 控,等同旧行为(全开)
    const linkAllowed = link.allowedModules || [];
    const effective = new Set(linkAllowed.length > 0
      ? linkAllowed.filter((k) => creatorModules.includes(k))
      : creatorModules
    );

    // 记录访问
    await app.prisma.shareLink.update({
      where: { id: link.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    }).catch(() => {});

    const c = link.candidate;
    // showContact / showAttachments 也叠加 effective(双闸,任一关闭就关)
    const showContact = link.showContact !== false && effective.has("candidate.contact");
    const showAttachments = link.showAttachments === true && effective.has("candidate.attachments");
    const showAiInsights = effective.has("candidate.aiInsights");
    const showJdMatch = effective.has("candidate.jdMatch");
    const showInterviewEval = link.showInterviewEval !== false;
    const showInterviewEvalList = link.showInterviewEvalList === true;

    // 「展示已有面试评价」开启时,带出该候选人已提交的评价记录(只读可看,含 token 查看详情);
    // 草稿/未提交不暴露 token,防被随意编辑。独立于「支持填写」开关。
    let interviewEvals = [];
    if (showInterviewEvalList) {
      const evs = await app.prisma.interviewEvaluation.findMany({
        where: { candidateId: c.id, status: "submitted", deletedAt: null },
        orderBy: { submittedAt: "desc" },
        select: { token: true, interviewer: true, position: true, totalScore: true, recommendation: true, submittedAt: true },
      });
      interviewEvals = evs.map((e) => ({
        token: e.token,
        interviewer: e.interviewer || null,
        position: e.position || null,
        totalScore: e.totalScore,
        recommendation: e.recommendation || null,
        submittedAt: e.submittedAt,
      }));
    }

    return {
      interviewEvals,
      candidate: {
        id: c.id,
        externalId: c.externalId,
        name: c.name,
        gender: c.gender,
        animal: c.animal,
        avatar: c.avatar,
        education: c.education,
        school: c.school,
        major: c.major,
        age: c.age,
        location: c.location,
        yearsExp: c.yearsExp,
        phone: showContact && c.phone ? c.phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2") : null,
        email: showContact && c.email ? c.email.replace(/(.{2}).+(@.+)/, "$1***$2") : null,
        appliedFor: c.appliedFor,
        jdMatch: showJdMatch ? c.jdMatch : null,
        status: c.status,
        parser: c.parser,
        parserConfidence: c.parserConfidence,
        tags: c.tags,
        skills: c.skills,
        risks: showAiInsights ? c.risks : [],
        highlights: showAiInsights ? c.highlights : [],
        experience: c.experience,
        educationHistory: c.educationHistory,
        aiSummary: showAiInsights ? c.aiSummary : null,
      },
      share: {
        expiresAt: link.expiresAt,
        viewCount: link.viewCount,
        createdAt: link.createdAt,
        showContact,
        showAttachments,
        showInterviewEval,
        showInterviewEvalList,
        allowedModules: Array.from(effective),
      },
    };
  });
}
