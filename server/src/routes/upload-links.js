// /api/upload-links          - admin 端: 登录用户管理自己生成的上传分享链接
// /api/public/upload/:token  - 公开端: 外部(候选人 / 同事 / 猎头)通过链接提交简历
//
// 模型: UploadShareLink (server/prisma/schema.prisma)
// 安全策略:
//   1. token = 24 字节 URL-safe base64 (32 字符), 不可猜
//   2. expiresAt + maxUploads 双重限流, 任一上限就 410
//   3. 公开 presigned-url 端点 token-gated, R2 凭证不暴露给陌生人
//   4. 公开提交创建的 candidate.ownerId 自动 = link.createdBy, 不污染他人候选人池
//   5. 公开提交不立即跑 LLM 解析(降级入库),admin 后续在详情页"重新解析"

import { randomBytes, randomUUID } from "node:crypto";

function tokenGen() {
  return randomBytes(24).toString("base64url");
}

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const MAX_SIZE = 20 * 1024 * 1024;

// 同 share.js 的 computeExpiresAt — 复制是为了避免循环依赖,改动需保持两份一致
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

function monthBucket() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function sanitizeFilename(name) {
  const ext = name?.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1]?.toLowerCase() || "bin";
  return `${randomUUID()}.${ext}`;
}

// 公开页显示前的 link 元数据(剔除敏感字段)
function publicShape(link) {
  return {
    token: link.token,
    defaultJob: link.defaultJob ? { id: link.defaultJob.id, title: link.defaultJob.title } : null,
    defaultSource: link.defaultSource,
    note: link.note,
    expiresAt: link.expiresAt,
    maxUploads: link.maxUploads,
    uploadCount: link.uploadCount,
  };
}

export default async function uploadLinksRoutes(app) {
  // ─── Admin 端 ────────────────────────────────────────────────
  app.register(async (admin) => {
    admin.addHook("preHandler", admin.authenticate);
    admin.addHook("preHandler", async (req, reply) => {
      const { loadUserAccess, hasModule } = await import("../lib/permissions.js");
      const access = await loadUserAccess(req);
      if (!hasModule(access, "candidate.share")) {
        reply.code(403).send({ error: "forbidden", message: "无分享权限" });
      }
    });

    // GET 列出当前用户创建的所有上传链接
    admin.get("/upload-links", async (req) => {
      const links = await admin.prisma.uploadShareLink.findMany({
        where: { createdBy: req.user.sub },
        orderBy: { createdAt: "desc" },
        include: { defaultJob: { select: { id: true, title: true, dept: true } } },
      });
      return { links };
    });

    // POST 创建新上传链接(单用户允许多个并存,各自 token 独立)
    admin.post("/upload-links", {
      schema: {
        body: {
          type: "object",
          properties: {
            defaultJobId: { type: ["string", "null"], format: "uuid" },
            defaultSource: { type: ["string", "null"], maxLength: 500 },
            note: { type: ["string", "null"], maxLength: 1000 },
            duration: { type: "string", maxLength: 20 },             // "30d" / "forever" 等
            maxUploads: { type: ["integer", "null"], minimum: 1, maximum: 9999 },
          },
          additionalProperties: false,
        },
      },
    }, async (req, reply) => {
      const duration = req.body?.duration || "30d";
      let expiresAt;
      try { expiresAt = computeExpiresAt(duration); }
      catch (err) { return reply.code(400).send({ error: err.code, message: err.message }); }

      // defaultJobId 校验(若给了,必须真实存在)
      if (req.body?.defaultJobId) {
        const job = await admin.prisma.job.findUnique({ where: { id: req.body.defaultJobId } });
        if (!job) return reply.code(400).send({ error: "job_not_found", message: "defaultJobId 对应岗位不存在" });
      }

      const link = await admin.prisma.uploadShareLink.create({
        data: {
          token: tokenGen(),
          defaultJobId: req.body?.defaultJobId || null,
          defaultSource: req.body?.defaultSource?.trim()?.slice(0, 500) || null,
          note: req.body?.note?.trim()?.slice(0, 1000) || null,
          expiresAt,
          maxUploads: req.body?.maxUploads ?? null,
          createdBy: req.user.sub,
        },
        include: { defaultJob: { select: { id: true, title: true, dept: true } } },
      });
      return reply.code(201).send({ link });
    });

    // DELETE 删除自己的上传链接
    admin.delete("/upload-links/:id", async (req, reply) => {
      const link = await admin.prisma.uploadShareLink.findUnique({ where: { id: req.params.id } });
      if (!link) return reply.code(404).send({ error: "link_not_found" });
      if (link.createdBy !== req.user.sub && req.user.role !== "ADMIN") {
        return reply.code(403).send({ error: "forbidden", message: "无权删除他人创建的链接" });
      }
      await admin.prisma.uploadShareLink.delete({ where: { id: link.id } });
      return reply.code(204).send();
    });
  });

  // ─── 公开端: 不鉴权 ───────────────────────────────────────────
  // 校验 token 有效性的内部 helper
  async function loadValidLink(token, reply) {
    const link = await app.prisma.uploadShareLink.findUnique({
      where: { token },
      include: { defaultJob: true },
    });
    if (!link) {
      reply.code(404).send({ error: "link_not_found", message: "上传链接无效或已删除" });
      return null;
    }
    if (link.expiresAt && link.expiresAt < new Date()) {
      reply.code(410).send({ error: "link_expired", message: "此上传链接已过期" });
      return null;
    }
    if (link.maxUploads != null && link.uploadCount >= link.maxUploads) {
      reply.code(410).send({ error: "link_quota_exceeded", message: `此链接收件数已达上限 (${link.maxUploads} 份)` });
      return null;
    }
    return link;
  }

  // GET 元数据 — 公开页打开时调用
  app.get("/public/upload/:token", async (req, reply) => {
    const link = await loadValidLink(req.params.token, reply);
    if (!link) return; // reply 已经 send 错误
    return { link: publicShape(link) };
  });

  // POST presigned URL — token-gated, 给公开页直传 R2 用
  app.post("/public/upload/:token/presigned-url", {
    schema: {
      body: {
        type: "object",
        required: ["filename", "contentType"],
        properties: {
          filename: { type: "string", minLength: 1, maxLength: 200 },
          contentType: { type: "string", maxLength: 100 },
          expectedSize: { type: "integer", minimum: 1, maximum: MAX_SIZE },
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const link = await loadValidLink(req.params.token, reply);
    if (!link) return;
    if (!app.r2) return reply.code(503).send({ error: "r2_not_configured", message: "R2 未配置" });
    if (!ALLOWED_MIME.has(req.body.contentType)) {
      return reply.code(400).send({ error: "unsupported_type", message: "仅支持 PDF / Word 简历" });
    }
    // 公开上传的 key 单独分桶,方便审计
    const key = `resumes/public-uploads/${monthBucket()}/${sanitizeFilename(req.body.filename)}`;
    const uploadUrl = await app.r2.presignPut({
      key,
      contentType: req.body.contentType,
      expiresIn: 900,
    });
    return { uploadUrl, key, expiresIn: 900 };
  });

  // POST submit — 完成 R2 上传后,创建 candidate + uploadCount++
  // 入参: key (必填, presigned PUT 上传后的 key), filename, name, contact, source, uploaderNote
  // 字段语义:
  //   source       — 上传者填的"来源"(如 "xxx 推荐"/"罗卡"/"英国猎头"),直接写入 candidate.source 覆盖默认
  //   uploaderNote — 上传者填的"备注"(任意自由文本),不污染 source,单独写入 CandidateNote 表
  // 简化策略: 不立即跑 LLM 解析(降级入库),admin 后续在详情页点"重新解析"再跑 Kimi
  app.post("/public/upload/:token/submit", {
    schema: {
      body: {
        type: "object",
        required: ["key"],
        properties: {
          key: { type: "string", minLength: 1, maxLength: 500 },
          filename: { type: "string", maxLength: 200 },
          name: { type: ["string", "null"], maxLength: 100 },         // 上传者填的候选人姓名(若知道)
          contact: { type: ["string", "null"], maxLength: 200 },      // 上传者填的联系方式
          source: { type: ["string", "null"], maxLength: 500 },       // 上传者填的"来源",优先级 > link.defaultSource
          uploaderNote: { type: ["string", "null"], maxLength: 2000 }, // 上传者备注 → 同步到 CandidateNote 表
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const link = await loadValidLink(req.params.token, reply);
    if (!link) return;

    const candidateName = req.body?.name?.trim()
      || req.body?.filename?.replace(/\.[^/.]+$/, "")?.slice(0, 100)
      || "待解析简历";

    // 来源:用户填的 > link 预设的 > 默认"[公开上传]"
    const userSource = req.body?.source?.trim()?.slice(0, 500);
    const finalSource = userSource || link.defaultSource || "[公开上传]";

    const trimmedNote = req.body?.uploaderNote?.trim();

    // 在一个事务里:创建 candidate + uploadCount++ + 备注非空时创建 CandidateNote(任一失败就回滚)
    const result = await app.prisma.$transaction(async (tx) => {
      const candidate = await tx.candidate.create({
        data: {
          name: candidateName,
          status: "待筛选",
          source: finalSource,
          attachment: req.body.key,
          phone: req.body?.contact?.trim()?.slice(0, 200) || null,
          tags: ["待解析", "公开上传"],
          // skills/experience/educationHistory 迁移后为 String?(markdown),留空走默认 null;
          // risks/highlights 仍是 String[],保持空数组
          risks: [],
          highlights: [],
          jobId: link.defaultJobId || null,
          appliedFor: link.defaultJob?.title || null,
          ownerId: link.createdBy || null,
        },
      });

      // 备注 → CandidateNote(候选人详情页"洞察+备注"模块的备注卡片)
      if (trimmedNote) {
        await tx.candidateNote.create({
          data: {
            candidateId: candidate.id,
            content: trimmedNote.slice(0, 2000),
            authorId: null,                                  // 公开上传无登录态
            authorName: candidateName || "公开上传访客",   // 用姓名作 author 显示
          },
        });
      }

      const updated = await tx.uploadShareLink.update({
        where: { id: link.id },
        data: { uploadCount: { increment: 1 }, lastUploadAt: new Date() },
      });
      return { candidate, link: updated };
    });

    // 仅返回 ack, 不返回 candidate 详细信息给陌生上传者
    return reply.code(201).send({
      ok: true,
      uploadCount: result.link.uploadCount,
      maxUploads: result.link.maxUploads,
    });
  });
}
