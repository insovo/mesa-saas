// /api/resumes — LLM 解析简历 + JD 二次评估
//
// 设计原则:
//   1. /parse 只做"纯抽取"(基础信息 + summary), JD 相关字段(jdMatch/risks/highlights)
//      只有在传 jobId 时才填充 — 否则保持 null/[] 避免 LLM 凭空乱给
//   2. /match {candidateId, jobId} 给已有候选人事后关联 JD 进行二次评估
//   3. 二次评估输入是 candidate.aiSummary + job.description, 不需要再读 R2 文件

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { parseResume, matchAgainstJob, isKimiConfigured, listModels } from "../lib/kimi.js";

const PARSE_BODY = {
  type: "object",
  required: ["key"],
  properties: {
    key: { type: "string", minLength: 1, maxLength: 500 },
    contentType: { type: "string", maxLength: 100 },
    model: { type: "string", maxLength: 100 },
    jobId: { type: "string", format: "uuid", nullable: true },
  },
  additionalProperties: false,
};

const MATCH_BODY = {
  type: "object",
  required: ["candidateId", "jobId"],
  properties: {
    candidateId: { type: "string", format: "uuid" },
    jobId: { type: "string", format: "uuid" },
    model: { type: "string", maxLength: 100 },
  },
  additionalProperties: false,
};

async function streamToBuffer(stream) {
  if (Buffer.isBuffer(stream)) return stream;
  if (stream && typeof stream.transformToByteArray === "function") {
    return Buffer.from(await stream.transformToByteArray());
  }
  const readable = Readable.isReadable?.(stream) ? stream : Readable.from(stream);
  const chunks = [];
  for await (const c of readable) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}

export default async function resumesRoutes(app) {
  app.addHook("preHandler", app.authenticate);

  app.get("/llm-status", async () => {
    const { getEffective, SETTING_KEYS } = await import("../lib/settings.js");
    const configured = await isKimiConfigured();
    let availableModels = [];
    if (configured) {
      try {
        const ids = await listModels();
        availableModels = ids.map((id) => ({ id, label: id, desc: "" }));
      } catch { /* ignore */ }
    }
    return {
      provider: "kimi",
      model: (await getEffective(SETTING_KEYS.KIMI_MODEL)) || "moonshot-v1-32k",
      configured,
      mode: "system",
      availableModels,
    };
  });

  // ─── 简历解析(纯抽取 + 可选 JD 联评)─────────────────────
  app.post("/parse", { schema: { body: PARSE_BODY } }, async (req, reply) => {
    if (!app.r2) {
      return reply.code(503).send({ error: "r2_not_configured", message: "R2 凭证未配置,无法读取简历" });
    }
    if (!(await isKimiConfigured())) {
      return reply.code(503).send({ error: "kimi_not_configured", message: "KIMI_API_KEY 未配置" });
    }
    const { key, contentType, model, jobId } = req.body;

    // 1) R2 拉文件
    let buffer;
    try {
      const cmd = new GetObjectCommand({ Bucket: app.r2.bucket, Key: key });
      const obj = await app.r2.client.send(cmd);
      buffer = await streamToBuffer(obj.Body);
    } catch (err) {
      req.log.error({ err, key }, "fetch from r2 failed");
      return reply.code(404).send({ error: "r2_object_not_found", message: `R2 中找不到对象 ${key}` });
    }
    if (!buffer || buffer.length === 0) {
      return reply.code(400).send({ error: "empty_file", message: "文件为空" });
    }

    // 2) Kimi 解析(基础信息 + summary)
    const filename = key.split("/").pop() || "resume.pdf";
    let result;
    try {
      result = await parseResume({
        buffer, filename,
        contentType: contentType || "application/octet-stream",
        model,
      });
    } catch (err) {
      req.log.error({ err, key }, "kimi parse failed");
      return reply.code(err.statusCode || 502).send({
        error: err.code || "kimi_error",
        message: err.message?.slice(0, 500) || "Kimi 解析失败",
      });
    }

    // 3) 剥离 JD 相关字段 — 这些只有在传 jobId 时由二次评估填
    const parsed = { ...result.parsed };
    delete parsed.jdMatch;
    delete parsed.risks;
    delete parsed.highlights;

    const candidate = {
      ...parsed,
      aiSummary: result.summary,
      attachment: key,
      parser: "Kimi",
      parserConfidence: 92,
      source: "自动上传",
      status: parsed.status || "待筛选",
      // 显式置 null/[] 让前端知道未评估
      jdMatch: null,
      risks: [],
      highlights: [],
      jobId: jobId || null,
    };

    // 4) 若传了 jobId, 跑二次评估补 jdMatch/risks/highlights
    let match = null;
    if (jobId) {
      try {
        const job = await app.prisma.job.findUnique({ where: { id: jobId } });
        if (job) {
          match = await matchAgainstJob({
            candidateSummary: result.summary,
            jobTitle: job.title,
            jobDescription: job.description || "",
            model,
          });
          candidate.jdMatch = match.jdMatch ?? null;
          candidate.risks = Array.isArray(match.risks) ? match.risks : [];
          candidate.highlights = Array.isArray(match.highlights) ? match.highlights : [];
          if (!candidate.appliedFor) candidate.appliedFor = job.title;
        }
      } catch (err) {
        req.log.warn({ err, jobId }, "match against job failed, candidate still saved without jd evaluation");
      }
    }

    return { candidate, meta: result.meta, match };
  });

  // ─── 现有候选人事后关联 JD 二次评估 ───────────────────────
  app.post("/match", { schema: { body: MATCH_BODY } }, async (req, reply) => {
    if (!(await isKimiConfigured())) {
      return reply.code(503).send({ error: "kimi_not_configured" });
    }
    const { candidateId, jobId, model } = req.body;

    const [candidate, job] = await Promise.all([
      app.prisma.candidate.findUnique({ where: { id: candidateId } }),
      app.prisma.job.findUnique({ where: { id: jobId } }),
    ]);
    if (!candidate) return reply.code(404).send({ error: "candidate_not_found" });
    if (!job) return reply.code(404).send({ error: "job_not_found" });

    let match;
    try {
      match = await matchAgainstJob({
        candidateSummary: candidate.aiSummary || `${candidate.name} · ${candidate.school || ""} · ${candidate.major || ""} · ${candidate.yearsExp || 0} 年经验`,
        jobTitle: job.title,
        jobDescription: job.description || "",
        model,
      });
    } catch (err) {
      return reply.code(err.statusCode || 502).send({
        error: "kimi_error",
        message: err.message?.slice(0, 300),
      });
    }

    // 持久化到 candidate(更新 jdMatch / risks / highlights / appliedFor)
    const updated = await app.prisma.candidate.update({
      where: { id: candidateId },
      data: {
        jdMatch: match.jdMatch ?? null,
        risks: Array.isArray(match.risks) ? match.risks : [],
        highlights: Array.isArray(match.highlights) ? match.highlights : [],
        appliedFor: candidate.appliedFor || job.title,
      },
    });

    return { candidate: updated, match };
  });
}
