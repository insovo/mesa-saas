// /api/candidates/:id/reviews — 登录用户提交评价
// /api/public/share/:token/reviews — 公开访客经分享链接提交评价
// 完整对话系统: parentId 回复 + soft-delete (deletedAt) + 删除请求审核 + admin 隐藏

import { GetObjectCommand } from "@aws-sdk/client-s3";

const ATTACHMENT_ITEM = {
  type: "object",
  required: ["type", "name"],
  properties: {
    type: { type: "string", enum: ["image", "file", "link"] },
    name: { type: "string", maxLength: 200 },
    url: { type: "string", maxLength: 1000 },
    size: { type: "integer", minimum: 0, maximum: 30 * 1024 * 1024 },
    contentType: { type: "string", maxLength: 100 },
  },
  additionalProperties: false,
};

const POST_BODY = {
  type: "object",
  required: ["content"],
  properties: {
    content: { type: "string", minLength: 1, maxLength: 500 },
    attachments: { type: "array", items: ATTACHMENT_ITEM, maxItems: 10 },
    authorName: { type: "string", minLength: 1, maxLength: 100 },
    parentId: { type: "string", format: "uuid" },
    referencedIds: { type: "array", items: { type: "string", format: "uuid" }, maxItems: 50 },
    visibility: { type: "string", enum: ["public", "internal", "admin"] },
    stance: { type: ["string", "null"], enum: ["approve", "reject", null] },
  },
  additionalProperties: false,
};

const MAX_TOTAL_SIZE = 30 * 1024 * 1024;

function validateAttachmentsSize(attachments) {
  if (!attachments) return null;
  let total = 0;
  for (const a of attachments) {
    if (a.size) total += a.size;
  }
  if (total > MAX_TOTAL_SIZE) {
    return { error: "attachments_too_large", message: `附件总大小 ${(total / 1024 / 1024).toFixed(1)}MB,超过 30MB 上限` };
  }
  return null;
}

// 公开展示: 过滤 hidden + visibility != "public"
function publicShape(r) {
  if (r.hidden) return null;
  if (r.visibility !== "public") return null;  // internal / admin 评论公开访客看不到
  return {
    id: r.id,
    candidateId: r.candidateId,
    authorName: r.authorName,
    authorRole: r.authorRole,
    authorAvatar: r.authorAvatar,
    via: r.via,
    visibility: r.visibility,
    parentId: r.parentId,
    referencedIds: r.referencedIds || [],
    stance: r.stance || null,
    upvotes: r.upvotes || 0,
    downvotes: r.downvotes || 0,
    content: r.deletedAt ? "" : r.content,
    attachments: r.deletedAt ? [] : (r.attachments || []),
    deletedAt: r.deletedAt,
    deleteRequested: r.deleteRequested,
    createdAt: r.createdAt,
  };
}

// 内部视图: 普通登录用户能看 public + internal; admin 能看全部
function internalShape(r, isAdmin) {
  if (!isAdmin && r.hidden) return null;
  if (!isAdmin && r.visibility === "admin") return null;  // 普通登录用户看不到 admin-only
  return {
    id: r.id,
    candidateId: r.candidateId,
    authorName: r.authorName,
    authorRole: r.authorRole,
    authorAvatar: r.authorAvatar,
    userId: r.userId,
    via: r.via,
    visibility: r.visibility,
    shareToken: r.shareToken,
    parentId: r.parentId,
    referencedIds: r.referencedIds || [],
    stance: r.stance || null,
    upvotes: r.upvotes || 0,
    downvotes: r.downvotes || 0,
    content: r.deletedAt ? "" : r.content,
    attachments: r.deletedAt ? [] : (r.attachments || []),
    hidden: r.hidden,
    deletedAt: r.deletedAt,
    deleteRequested: r.deleteRequested,
    deleteRequestedBy: r.deleteRequestedBy,
    createdAt: r.createdAt,
  };
}

export default async function reviewsRoutes(app) {
  // ─── 内部端: 登录用户 ────────────────────────────────────
  app.register(async (internal) => {
    internal.addHook("preHandler", internal.authenticate);

    // 列表 (admin 看全部,普通用户看 !hidden)
    internal.get("/candidates/:id/reviews", async (req) => {
      const isAdmin = req.user.role === "ADMIN";
      const reviews = await internal.prisma.review.findMany({
        where: { candidateId: req.params.id },
        orderBy: { createdAt: "desc" },  // 倒序 — 最新在前
      });
      return { reviews: reviews.map((r) => internalShape(r, isAdmin)).filter(Boolean) };
    });

    // 添加 / 回复
    internal.post("/candidates/:id/reviews", { schema: { body: POST_BODY } }, async (req, reply) => {
      const sizeErr = validateAttachmentsSize(req.body.attachments);
      if (sizeErr) return reply.code(400).send(sizeErr);

      // 校验 parentId 同一 candidate
      if (req.body.parentId) {
        const parent = await internal.prisma.review.findUnique({ where: { id: req.body.parentId } });
        if (!parent || parent.candidateId !== req.params.id) {
          return reply.code(400).send({ error: "bad_parent" });
        }
        // 1 级嵌套限制 — 不允许回复回复(防止深嵌套)
        if (parent.parentId) {
          return reply.code(400).send({ error: "nested_reply_not_allowed", message: "只支持 1 级回复" });
        }
      }

      const user = await internal.prisma.user.findUnique({ where: { id: req.user.sub } });
      let visibility = req.body.visibility || "public";
      if (visibility === "admin" && req.user.role !== "ADMIN") {
        visibility = "internal";
      }
      // referencedIds 校验同 candidate
      const refIds = Array.isArray(req.body.referencedIds) ? req.body.referencedIds : [];
      if (refIds.length > 0) {
        const refs = await internal.prisma.review.findMany({
          where: { id: { in: refIds }, candidateId: req.params.id },
          select: { id: true },
        });
        if (refs.length !== refIds.length) return reply.code(400).send({ error: "bad_reference_ids" });
      }
      const stance = req.body.stance && ["approve", "reject"].includes(req.body.stance) ? req.body.stance : null;
      const review = await internal.prisma.review.create({
        data: {
          candidateId: req.params.id,
          authorName: user?.name || req.body.authorName || user?.email || "登录用户",
          authorRole: user?.jobTitle || (user?.role === "ADMIN" ? "管理员" : "招聘官"),
          authorAvatar: user?.avatar || null,
          userId: user?.id || null,
          via: "internal",
          visibility,
          parentId: req.body.parentId || (refIds[0] || null),
          referencedIds: refIds,
          stance,
          content: req.body.content,
          attachments: req.body.attachments || [],
        },
      });
      return reply.code(201).send({ review: internalShape(review, req.user.role === "ADMIN") });
    });

    // 请求删除 (作者本人, 标记 deleteRequested)
    // admin 直接调 approve-delete 路由不走这里
    internal.post("/candidates/:id/reviews/:reviewId/request-delete", async (req, reply) => {
      const r = await internal.prisma.review.findUnique({ where: { id: req.params.reviewId } });
      if (!r || r.candidateId !== req.params.id) return reply.code(404).send({ error: "not_found" });
      if (r.deletedAt) return reply.code(400).send({ error: "already_deleted" });
      // 仅作者本人
      if (r.userId !== req.user.sub && req.user.role !== "ADMIN") {
        return reply.code(403).send({ error: "forbidden", message: "只能请求删除自己写的评价" });
      }
      const updated = await internal.prisma.review.update({
        where: { id: r.id },
        data: { deleteRequested: new Date(), deleteRequestedBy: req.user.sub },
      });
      return { review: internalShape(updated, req.user.role === "ADMIN") };
    });

    // admin 批准删除 (soft-delete)
    internal.post("/candidates/:id/reviews/:reviewId/approve-delete", async (req, reply) => {
      if (req.user.role !== "ADMIN") return reply.code(403).send({ error: "admin_only" });
      const r = await internal.prisma.review.findUnique({ where: { id: req.params.reviewId } });
      if (!r) return reply.code(404).send({ error: "not_found" });
      const updated = await internal.prisma.review.update({
        where: { id: r.id },
        data: { deletedAt: new Date() },
      });
      return { review: internalShape(updated, true) };
    });

    // admin 拒绝删除请求
    internal.post("/candidates/:id/reviews/:reviewId/reject-delete", async (req, reply) => {
      if (req.user.role !== "ADMIN") return reply.code(403).send({ error: "admin_only" });
      const r = await internal.prisma.review.findUnique({ where: { id: req.params.reviewId } });
      if (!r) return reply.code(404).send({ error: "not_found" });
      const updated = await internal.prisma.review.update({
        where: { id: r.id },
        data: { deleteRequested: null, deleteRequestedBy: null },
      });
      return { review: internalShape(updated, true) };
    });

    // admin 直接 soft-delete
    internal.delete("/candidates/:id/reviews/:reviewId", async (req, reply) => {
      if (req.user.role !== "ADMIN") return reply.code(403).send({ error: "admin_only", message: "删除需要管理员权限" });
      const r = await internal.prisma.review.findUnique({ where: { id: req.params.reviewId } });
      if (!r) return reply.code(404).send({ error: "not_found" });
      const updated = await internal.prisma.review.update({
        where: { id: r.id },
        data: { deletedAt: new Date() },
      });
      return { review: internalShape(updated, true) };
    });

    // 投票 (登录用户) - 用 ReviewVote 表去重,一个用户对一个评价只一票
    // body: { value: 1 | -1 | 0 } (0 = 取消)
    internal.post("/candidates/:id/reviews/:reviewId/vote", {
      schema: { body: { type: "object", required: ["value"], properties: { value: { type: "integer", enum: [-1, 0, 1] } } } },
    }, async (req, reply) => {
      const reviewId = req.params.reviewId;
      const userId = req.user.sub;
      const value = req.body.value;

      const r = await internal.prisma.review.findUnique({ where: { id: reviewId } });
      if (!r || r.candidateId !== req.params.id) return reply.code(404).send({ error: "not_found" });
      if (r.deletedAt) return reply.code(400).send({ error: "deleted" });

      const existing = await internal.prisma.reviewVote.findUnique({ where: { reviewId_userId: { reviewId, userId } } });
      const prevValue = existing?.value || 0;

      if (value === 0) {
        // 取消
        if (existing) {
          await internal.prisma.reviewVote.delete({ where: { id: existing.id } });
        }
      } else if (existing) {
        await internal.prisma.reviewVote.update({ where: { id: existing.id }, data: { value } });
      } else {
        await internal.prisma.reviewVote.create({ data: { reviewId, userId, value } });
      }

      // 算 delta 更新 upvotes/downvotes
      const upDelta = (value === 1 ? 1 : 0) - (prevValue === 1 ? 1 : 0);
      const downDelta = (value === -1 ? 1 : 0) - (prevValue === -1 ? 1 : 0);
      const updated = await internal.prisma.review.update({
        where: { id: reviewId },
        data: {
          upvotes: { increment: upDelta },
          downvotes: { increment: downDelta },
        },
      });
      return { review: internalShape(updated, req.user.role === "ADMIN"), myVote: value };
    });

    // 拉用户已投票 map
    internal.get("/candidates/:id/reviews-votes", async (req) => {
      const votes = await internal.prisma.reviewVote.findMany({
        where: { userId: req.user.sub, review: { candidateId: req.params.id } },
        select: { reviewId: true, value: true },
      });
      const map = {};
      for (const v of votes) map[v.reviewId] = v.value;
      return { votes: map };
    });

    // admin 隐藏 / 取消隐藏
    internal.post("/candidates/:id/reviews/:reviewId/hide", async (req, reply) => {
      if (req.user.role !== "ADMIN") return reply.code(403).send({ error: "admin_only" });
      const updated = await internal.prisma.review.update({ where: { id: req.params.reviewId }, data: { hidden: true } });
      return { review: internalShape(updated, true) };
    });
    internal.post("/candidates/:id/reviews/:reviewId/unhide", async (req, reply) => {
      if (req.user.role !== "ADMIN") return reply.code(403).send({ error: "admin_only" });
      const updated = await internal.prisma.review.update({ where: { id: req.params.reviewId }, data: { hidden: false } });
      return { review: internalShape(updated, true) };
    });
  });

  // ─── 公开端: 通过 share token 提交评价 ────────────────────
  app.get("/public/share/:token/reviews", async (req, reply) => {
    const link = await app.prisma.shareLink.findUnique({ where: { token: req.params.token } });
    if (!link) return reply.code(404).send({ error: "share_not_found" });
    if (link.expiresAt && link.expiresAt < new Date()) return reply.code(410).send({ error: "share_expired" });

    const reviews = await app.prisma.review.findMany({
      where: { candidateId: link.candidateId },
      orderBy: { createdAt: "desc" },  // 倒序
    });
    return { reviews: reviews.map(publicShape).filter(Boolean) };
  });

  app.post("/public/share/:token/reviews", {
    schema: { body: { ...POST_BODY, required: ["content", "authorName"] } },
  }, async (req, reply) => {
    const link = await app.prisma.shareLink.findUnique({ where: { token: req.params.token } });
    if (!link) return reply.code(404).send({ error: "share_not_found" });
    if (link.expiresAt && link.expiresAt < new Date()) return reply.code(410).send({ error: "share_expired" });

    if (req.body.parentId) {
      const parent = await app.prisma.review.findUnique({ where: { id: req.body.parentId } });
      if (!parent || parent.candidateId !== link.candidateId) return reply.code(400).send({ error: "bad_parent" });
      if (parent.parentId) return reply.code(400).send({ error: "nested_reply_not_allowed" });
    }

    const sizeErr = validateAttachmentsSize(req.body.attachments);
    if (sizeErr) return reply.code(400).send(sizeErr);

    // 公开访客只能发 public 评论 (默认 public 也可显式传 public, 其他值忽略)
    const refIds = Array.isArray(req.body.referencedIds) ? req.body.referencedIds : [];
    if (refIds.length > 0) {
      const refs = await app.prisma.review.findMany({
        where: { id: { in: refIds }, candidateId: link.candidateId, visibility: "public" },
        select: { id: true },
      });
      if (refs.length !== refIds.length) return reply.code(400).send({ error: "bad_reference_ids" });
    }
    const stance = req.body.stance && ["approve", "reject"].includes(req.body.stance) ? req.body.stance : null;
    const review = await app.prisma.review.create({
      data: {
        candidateId: link.candidateId,
        authorName: req.body.authorName.trim().slice(0, 100),
        authorRole: "外部招聘官",
        via: "public",
        visibility: "public",
        shareToken: link.token,
        parentId: req.body.parentId || (refIds[0] || null),
        referencedIds: refIds,
        stance,
        content: req.body.content,
        attachments: req.body.attachments || [],
      },
    });
    return reply.code(201).send({ review: publicShape(review) });
  });

  // 公开访客请求删除自己的评价 — 校验 authorName 匹配
  app.post("/public/share/:token/reviews/:reviewId/request-delete", {
    schema: {
      body: {
        type: "object",
        required: ["authorName"],
        properties: { authorName: { type: "string", minLength: 1, maxLength: 100 } },
      },
    },
  }, async (req, reply) => {
    const link = await app.prisma.shareLink.findUnique({ where: { token: req.params.token } });
    if (!link) return reply.code(404).send({ error: "share_not_found" });

    const r = await app.prisma.review.findUnique({ where: { id: req.params.reviewId } });
    if (!r || r.candidateId !== link.candidateId) return reply.code(404).send({ error: "not_found" });
    if (r.via !== "public") return reply.code(403).send({ error: "not_yours" });
    if (r.deletedAt) return reply.code(400).send({ error: "already_deleted" });
    if (r.authorName !== req.body.authorName.trim()) {
      return reply.code(403).send({ error: "name_mismatch", message: "姓名与评价作者不一致" });
    }
    const updated = await app.prisma.review.update({
      where: { id: r.id },
      data: { deleteRequested: new Date(), deleteRequestedBy: req.body.authorName.trim() },
    });
    return { review: publicShape(updated) };
  });

  // 公开访客投票 — 用 voterName + reviewId 弱去重 (前端 localStorage 也限制)
  // body: { value: 1|-1|0, voterName }
  app.post("/public/share/:token/reviews/:reviewId/vote", {
    schema: {
      body: {
        type: "object",
        required: ["value"],
        properties: {
          value: { type: "integer", enum: [-1, 0, 1] },
          voterName: { type: "string", minLength: 1, maxLength: 100 },
          prevValue: { type: "integer", enum: [-1, 0, 1] },
        },
      },
    },
  }, async (req, reply) => {
    const link = await app.prisma.shareLink.findUnique({ where: { token: req.params.token } });
    if (!link) return reply.code(404).send({ error: "share_not_found" });
    if (link.expiresAt && link.expiresAt < new Date()) return reply.code(410).send({ error: "share_expired" });

    const r = await app.prisma.review.findUnique({ where: { id: req.params.reviewId } });
    if (!r || r.candidateId !== link.candidateId) return reply.code(404).send({ error: "not_found" });
    if (r.deletedAt) return reply.code(400).send({ error: "deleted" });

    // 公开访客无可靠去重,前端用 localStorage 限制重复点击
    // 后端用客户端传的 prevValue 算 delta
    const prev = req.body.prevValue || 0;
    const value = req.body.value;
    const upDelta = (value === 1 ? 1 : 0) - (prev === 1 ? 1 : 0);
    const downDelta = (value === -1 ? 1 : 0) - (prev === -1 ? 1 : 0);
    const updated = await app.prisma.review.update({
      where: { id: r.id },
      data: {
        upvotes: { increment: upDelta },
        downvotes: { increment: downDelta },
      },
    });
    return { review: publicShape(updated) };
  });

  // 公开访客 presigned-url (附件上传)
  app.post("/public/share/:token/presigned-url", {
    schema: {
      body: {
        type: "object",
        required: ["filename", "contentType"],
        properties: {
          filename: { type: "string", minLength: 1, maxLength: 200 },
          contentType: { type: "string", maxLength: 100 },
        },
      },
    },
  }, async (req, reply) => {
    const link = await app.prisma.shareLink.findUnique({ where: { token: req.params.token } });
    if (!link) return reply.code(404).send({ error: "share_not_found" });
    if (link.expiresAt && link.expiresAt < new Date()) return reply.code(410).send({ error: "share_expired" });

    if (!app.r2) return reply.code(503).send({ error: "r2_not_configured" });

    const ALLOWED = new Set([
      "image/png", "image/jpeg", "image/gif", "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
    ]);
    if (!ALLOWED.has(req.body.contentType)) {
      return reply.code(400).send({ error: "unsupported_type" });
    }

    const { randomUUID } = await import("node:crypto");
    const ext = req.body.filename.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1]?.toLowerCase() || "bin";
    const key = `reviews/public/${link.candidateId}/${randomUUID()}.${ext}`;
    const uploadUrl = await app.r2.presignPut({
      key,
      contentType: req.body.contentType,
      expiresIn: 600,
    });
    return { uploadUrl, key, expiresIn: 600 };
  });

  // 公开附件下载
  app.post("/public/share/:token/signed-get-url", {
    schema: {
      body: {
        type: "object",
        required: ["key"],
        properties: { key: { type: "string", maxLength: 500 } },
      },
    },
  }, async (req, reply) => {
    const link = await app.prisma.shareLink.findUnique({ where: { token: req.params.token } });
    if (!link) return reply.code(404).send({ error: "share_not_found" });
    if (link.expiresAt && link.expiresAt < new Date()) return reply.code(410).send({ error: "share_expired" });

    if (!app.r2) return reply.code(503).send({ error: "r2_not_configured" });
    if (!req.body.key.startsWith("reviews/")) return reply.code(400).send({ error: "bad_key" });

    const url = await app.r2.presignGet({ key: req.body.key, expiresIn: 600 });
    return { url, expiresIn: 600 };
  });
}
