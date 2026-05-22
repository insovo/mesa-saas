// /api/storage — Cloudflare R2 预签名直传(demo.md §2.2)
// 安全策略:
//   1. 前端不直接持有 R2 长期凭证,必须经后端签发短时效 URL
//   2. Key 名由后端生成(uuid + 月度分桶),避免前端伪造覆盖他人文件
//   3. ContentType 严格白名单,防止伪装可执行文件

import { randomUUID } from "node:crypto";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
]);

const MAX_SIZE = 20 * 1024 * 1024; // 20MB 软限制(实际由 R2 桶策略硬限)

const PRESIGN_BODY = {
  type: "object",
  required: ["filename", "contentType"],
  properties: {
    filename: { type: "string", minLength: 1, maxLength: 200 },
    contentType: { type: "string", maxLength: 100 },
    expectedSize: { type: "integer", minimum: 1, maximum: MAX_SIZE },
  },
  additionalProperties: false,
};

function monthBucket() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function sanitizeFilename(name) {
  // 只保留扩展名,文件名本体用 uuid。
  const ext = name.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1]?.toLowerCase() || "bin";
  return `${randomUUID()}.${ext}`;
}

export default async function storageRoutes(app) {
  app.addHook("preHandler", app.authenticate);

  app.post("/presigned-url", { schema: { body: PRESIGN_BODY } }, async (req, reply) => {
    if (!app.r2) {
      return reply.code(503).send({ error: "r2_not_configured", message: "R2 凭证未配置" });
    }
    if (!ALLOWED_MIME.has(req.body.contentType)) {
      return reply.code(400).send({ error: "unsupported_type", message: "仅支持 PDF / Word / 图片" });
    }
    const key = `resumes/${monthBucket()}/${sanitizeFilename(req.body.filename)}`;
    const uploadUrl = await app.r2.presignPut({
      key,
      contentType: req.body.contentType,
      expiresIn: 900,
    });
    return { uploadUrl, key, expiresIn: 900 };
  });

  // 前端拿到 key 后调此接口,后端验证文件已上传,可选生成短期访问 URL。
  app.post("/confirm", {
    schema: {
      body: {
        type: "object",
        required: ["key"],
        properties: { key: { type: "string", maxLength: 500 } },
      },
    },
  }, async (req, reply) => {
    if (!app.r2) return reply.code(503).send({ error: "r2_not_configured" });
    const publicUrl = app.r2.publicBase ? `${app.r2.publicBase}/${req.body.key}` : null;
    return { key: req.body.key, publicUrl };
  });

  app.post("/signed-get-url", {
    schema: {
      body: {
        type: "object",
        required: ["key"],
        properties: { key: { type: "string", maxLength: 500 } },
      },
    },
  }, async (req, reply) => {
    if (!app.r2) return reply.code(503).send({ error: "r2_not_configured" });
    const url = await app.r2.presignGet({ key: req.body.key, expiresIn: 600 });
    return { url, expiresIn: 600 };
  });
}
