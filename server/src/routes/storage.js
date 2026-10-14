// /api/storage — Cloudflare R2 预签名直传(demo.md §2.2)
// 安全策略:
//   1. 前端不直接持有 R2 长期凭证,必须经后端签发短时效 URL
//   2. Key 名由后端生成(uuid + 月度分桶),避免前端伪造覆盖他人文件
//   3. ContentType 严格白名单,防止伪装可执行文件

import { randomUUID } from "node:crypto";
import { loadUserAccess, hasModule, hasPage, buildCandidateScopeWhere } from "../lib/permissions.js";
import { sendResumeArchive } from "../lib/resumeArchive.js";
import { writeLog } from "../lib/audit.js";

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

  app.post("/resumes/archive", { schema: { body: {
    type: "object", additionalProperties: false,
    oneOf: [{ required: ["candidateIds"] }, { required: ["applicantIds"] }],
    properties: Object.fromEntries(["candidateIds", "applicantIds"].map((key) => [key, { type: "array", minItems: 1, maxItems: 1000, uniqueItems: true, items: { type: "string", format: "uuid" } }])),
  } } }, async (req, reply) => {
    const access = await loadUserAccess(req);
    if (!hasModule(access, "candidate.attachments")) return reply.code(403).send({ error: "forbidden", message: "无原始简历下载权限" });
    const campus = !!req.body.applicantIds;
    if (campus ? !(hasPage(access, "campus") && (access.role !== "CAMPUS_INTERVIEWER" || hasPage(access, "campus.ledger") || hasPage(access, "campus.summary"))) : !hasPage(access, "candidates")) return reply.code(403).send({ error: "forbidden" });
    const ids = req.body.applicantIds || req.body.candidateIds;
    const scope = campus ? null : await buildCandidateScopeWhere(req);
    const candidates = await app.prisma.candidate.findMany({
      where: { AND: [campus ? { campusApplicant: { is: { id: { in: ids } } } } : { id: { in: ids } }, ...(scope ? [scope] : [])] },
      select: { id: true, name: true, major: true, education: true, school: true, attachment: true, campusApplicant: { select: { id: true, name: true, major: true, degree: true, school: true, summaryData: true, currentResumeVersionId: true, resumeVersions: { select: { id: true, attachmentKey: true, filename: true } } } } },
    });
    if (candidates.length !== ids.length) return reply.code(404).send({ error: "not_found", message: "所选人员中有记录不存在或无访问权限，请刷新后重试" });
    if (!app.r2) return reply.code(503).send({ error: "r2_not_configured", message: "简历存储暂不可用" });
    const order = new Map(ids.map((id, index) => [id, index]));
    candidates.sort((a, b) => order.get(campus ? a.campusApplicant.id : a.id) - order.get(campus ? b.campusApplicant.id : b.id));
    await writeLog(app.prisma, { req, action: "resume.archive.download", entityType: "Candidate", diff: { ids: candidates.map(({ id }) => id) } });
    return sendResumeArchive(app, req, reply, candidates);
  });

  app.post("/presigned-url", { schema: { body: PRESIGN_BODY } }, async (req, reply) => {
    if (!app.r2) {
      return reply.code(503).send({ error: "r2_not_configured", message: "R2 凭证未配置" });
    }
    // 上传简历/附件需要 candidate.attachments 模块权限
    const access = await loadUserAccess(req);
    if (access.role === "CAMPUS_INTERVIEWER" && !hasPage(access, "campus.ledger")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    if (!hasModule(access, "candidate.attachments")) {
      return reply.code(403).send({ error: "forbidden", message: "无附件上传权限" });
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
    const access = await loadUserAccess(req);
    if (access.role === "CAMPUS_INTERVIEWER" && !hasPage(access, "campus.ledger")) return reply.code(403).send({ error: "forbidden" });
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
    const access = await loadUserAccess(req);
    if (!hasModule(access, "candidate.attachments")) {
      return reply.code(403).send({ error: "forbidden", message: "无附件查看权限" });
    }
    if (access.role === "CAMPUS_INTERVIEWER") {
      const key = req.body.key;
      const [candidate, version] = await Promise.all([
        app.prisma.candidate.findFirst({ where: { attachment: key, campusApplicant: { isNot: null } }, select: { id: true } }),
        app.prisma.campusResumeVersion.findFirst({ where: { attachmentKey: key }, select: { id: true } }),
      ]);
      if (!candidate && !version) return reply.code(404).send({ error: "not_found" });
    }
    const url = await app.r2.presignGet({ key: req.body.key, expiresIn: 600 });
    return { url, expiresIn: 600 };
  });
}
