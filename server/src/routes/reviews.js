// /api/candidates/:id/reviews — 登录用户提交评价
// /api/public/share/:token/reviews — 公开访客经分享链接提交评价
// 公开访客必填 authorName, 内部用户自动从 JWT 拿身份

import { GetObjectCommand } from "@aws-sdk/client-s3";

const ATTACHMENT_ITEM = {
  type: "object",
  required: ["type", "name"],
  properties: {
    type: { type: "string", enum: ["image", "file", "link"] },
    name: { type: "string", maxLength: 200 },
    url: { type: "string", maxLength: 1000 },  // R2 key 或外部 URL
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

export default async function reviewsRoutes(app) {
  // ─── 内部端: 登录用户 ────────────────────────────────────
  app.register(async (internal) => {
    internal.addHook("preHandler", internal.authenticate);

    // 列表
    internal.get("/candidates/:id/reviews", async (req) => {
      const reviews = await internal.prisma.review.findMany({
        where: { candidateId: req.params.id },
        orderBy: { createdAt: "desc" },
      });
      return { reviews };
    });

    // 添加(登录用户)
    internal.post("/candidates/:id/reviews", { schema: { body: POST_BODY } }, async (req, reply) => {
      const sizeErr = validateAttachmentsSize(req.body.attachments);
      if (sizeErr) return reply.code(400).send(sizeErr);

      const user = await internal.prisma.user.findUnique({ where: { id: req.user.sub } });
      const review = await internal.prisma.review.create({
        data: {
          candidateId: req.params.id,
          authorName: user?.name || req.body.authorName || user?.email || "登录用户",
          authorRole: user?.jobTitle || (user?.role === "ADMIN" ? "管理员" : "招聘官"),
          authorAvatar: user?.avatar || null,
          userId: user?.id || null,
          via: "internal",
          content: req.body.content,
          attachments: req.body.attachments || [],
        },
      });
      return reply.code(201).send({ review });
    });

    // 删除(自己或 admin)
    internal.delete("/candidates/:id/reviews/:reviewId", async (req, reply) => {
      const review = await internal.prisma.review.findUnique({ where: { id: req.params.reviewId } });
      if (!review) return reply.code(404).send({ error: "not_found" });
      if (req.user.role !== "ADMIN" && review.userId !== req.user.sub) {
        return reply.code(403).send({ error: "forbidden" });
      }
      await internal.prisma.review.delete({ where: { id: req.params.reviewId } });
      return reply.code(204).send();
    });
  });

  // ─── 公开端: 通过 share token 提交评价 ────────────────────
  // 列表(公开,任何持有 token 的人都能看 — 与候选人正文一起)
  app.get("/public/share/:token/reviews", async (req, reply) => {
    const link = await app.prisma.shareLink.findUnique({ where: { token: req.params.token } });
    if (!link) return reply.code(404).send({ error: "share_not_found" });
    if (link.expiresAt && link.expiresAt < new Date()) return reply.code(410).send({ error: "share_expired" });
    // 注意:列表不消耗 quota,quota 只在主页面查看时扣

    const reviews = await app.prisma.review.findMany({
      where: { candidateId: link.candidateId },
      orderBy: { createdAt: "desc" },
    });
    return { reviews };
  });

  // 提交(必填 authorName)
  app.post("/public/share/:token/reviews", {
    schema: {
      body: {
        ...POST_BODY,
        required: ["content", "authorName"],
      },
    },
  }, async (req, reply) => {
    const link = await app.prisma.shareLink.findUnique({ where: { token: req.params.token } });
    if (!link) return reply.code(404).send({ error: "share_not_found" });
    if (link.expiresAt && link.expiresAt < new Date()) return reply.code(410).send({ error: "share_expired" });
    // 公开评论也算访问 quota? 通常不算,这里保持只有 GET 主页计 quota

    const sizeErr = validateAttachmentsSize(req.body.attachments);
    if (sizeErr) return reply.code(400).send(sizeErr);

    const review = await app.prisma.review.create({
      data: {
        candidateId: link.candidateId,
        authorName: req.body.authorName.trim().slice(0, 100),
        authorRole: "外部招聘官",
        via: "public",
        shareToken: link.token,
        content: req.body.content,
        attachments: req.body.attachments || [],
      },
    });
    return reply.code(201).send({ review });
  });

  // 公开版预签名 URL — 给评价附件上传用
  // 必须有有效 share token,否则拒绝
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

    // 文件名只保留扩展名,文件本体用 uuid
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

  // 给附件生成下载 URL(展示用)— 任何人都能调用,因为 key 已经是不可猜 uuid
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
    // 防御:key 必须以 reviews/ 开头,避免拉别的对象
    if (!req.body.key.startsWith("reviews/")) return reply.code(400).send({ error: "bad_key" });

    const url = await app.r2.presignGet({ key: req.body.key, expiresIn: 600 });
    return { url, expiresIn: 600 };
  });
}
