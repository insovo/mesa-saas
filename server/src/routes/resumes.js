// /api/resumes — LLM 解析简历 + JD 二次评估
//
// 设计原则:
//   1. /parse 只做"纯抽取"(基础信息 + summary), JD 相关字段(jdMatch/risks/highlights)
//      只有在传 jobId 时才填充 — 否则保持 null/[] 避免 LLM 凭空乱给
//   2. /match {candidateId, jobId} 给已有候选人事后关联 JD 进行二次评估
//   3. 二次评估输入是 candidate.aiSummary + job.description, 不需要再读 R2 文件

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { parseResume, parseJobDescription, matchAgainstJob, isKimiConfigured, listModels } from "../lib/kimi.js";
import { withDerivedCandidate } from "../lib/derived.js";
import { createTask, getTask, markRunning, markDone, markFailed } from "../lib/parseTaskStore.js";

const PARSE_BODY = {
  type: "object",
  properties: {
    // 新建候选人场景:R2 key 直传后调 parse → 返回未存 DB 的 candidate object,前端 POST /candidates 创建
    key: { type: "string", minLength: 1, maxLength: 500 },
    // 已有候选人「重新解析」场景:传 candidateId,后端从 DB 取 attachment 作为 R2 key,跑 Kimi 后 UPDATE DB
    candidateId: { type: "string", format: "uuid" },
    contentType: { type: "string", maxLength: 100 },
    model: { type: "string", maxLength: 100 },
    jobId: { type: "string", format: "uuid", nullable: true },
  },
  // 必须二选一
  oneOf: [{ required: ["key"] }, { required: ["candidateId"] }],
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

const PARSE_JD_BODY = {
  type: "object",
  required: ["key"],
  properties: {
    key: { type: "string", minLength: 1, maxLength: 500 },
    contentType: { type: "string", maxLength: 100 },
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

// Reparse 异步任务执行器 — 跑 Kimi parseResume + 可选 JD 联评 + UPDATE DB,
// 把最终结果(或错误)写入 parseTaskStore。前端轮询 GET /parse-tasks/:taskId 拿状态。
// 关键设计:这个函数 fire-and-forget(setImmediate 调用),HTTP handler 立即返回 taskId,
// 彻底绕过 Cloudflare 100s origin response 硬上限。
async function runReparse(app, taskId, candidateId, model) {
  try {
    await markRunning(app, taskId);

    if (!app.r2) throw Object.assign(new Error("R2 凭证未配置,无法读取简历"), { statusCode: 424, code: "r2_not_configured" });

    const existingCandidate = await app.prisma.candidate.findUnique({ where: { id: candidateId } });
    if (!existingCandidate) throw Object.assign(new Error("候选人不存在"), { statusCode: 404, code: "candidate_not_found" });
    if (!existingCandidate.attachment) throw Object.assign(new Error("候选人无简历附件"), { statusCode: 400, code: "no_attachment" });

    const key = existingCandidate.attachment;
    const jobId = existingCandidate.jobId;

    // 1) R2 拉文件
    let buffer;
    try {
      const cmd = new GetObjectCommand({ Bucket: app.r2.bucket, Key: key });
      const obj = await app.r2.client.send(cmd);
      buffer = await streamToBuffer(obj.Body);
    } catch (err) {
      throw Object.assign(new Error(`R2 中找不到对象 ${key}`), { statusCode: 404, code: "r2_object_not_found" });
    }
    if (!buffer || buffer.length === 0) throw Object.assign(new Error("文件为空"), { statusCode: 400, code: "empty_file" });

    // 2) Kimi parseResume
    const filename = key.split("/").pop() || "resume.pdf";
    const result = await parseResume({
      buffer, filename,
      contentType: "application/octet-stream",
      model,
    });

    // 3) 字段处理
    const parsed = { ...result.parsed };
    delete parsed.jdMatch; delete parsed.risks; delete parsed.highlights;
    if (!Array.isArray(parsed.languages)) parsed.languages = [];

    // 4) JD 联评(如有 jobId)
    let match = null;
    let llmFields = { jdMatch: null, risks: [], highlights: [], aiSuggestedTags: [], matchedFor: [], againstFor: [], insights: [] };
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
          llmFields.jdMatch = match.jdMatch ?? null;
          llmFields.risks = Array.isArray(match.risks) ? match.risks : [];
          llmFields.highlights = Array.isArray(match.highlights) ? match.highlights : [];
          llmFields.aiSuggestedTags = Array.isArray(match.aiSuggestedTags) ? match.aiSuggestedTags.slice(0, 12) : [];
          llmFields.matchedFor = Array.isArray(match.matchedFor) ? match.matchedFor.slice(0, 12) : [];
          llmFields.againstFor = Array.isArray(match.againstFor) ? match.againstFor.slice(0, 12) : [];
          llmFields.insights = Array.isArray(match.insights)
            ? match.insights
                .filter((i) => i && (i.kind === "up" || i.kind === "down") && typeof i.text === "string")
                .slice(0, 20)
                .map((i) => ({ kind: i.kind, text: i.text.slice(0, 300) }))
            : [];
        }
      } catch (err) {
        app.log.warn({ err, jobId, taskId }, "reparse JD 联评失败,候选人仍然 update(无 JD 字段)");
      }
    }

    // 5) UPDATE DB (不动 status/appliedFor/source/owner/documents — 用户可能已手动改过)
    const updateData = {
      name: parsed.name || existingCandidate.name,
      gender: parsed.gender ?? existingCandidate.gender,
      animal: parsed.animal ?? existingCandidate.animal,
      education: parsed.education ?? existingCandidate.education,
      school: parsed.school ?? existingCandidate.school,
      major: parsed.major ?? existingCandidate.major,
      age: parsed.age ?? existingCandidate.age,
      location: parsed.location ?? existingCandidate.location,
      yearsExp: parsed.yearsExp ?? existingCandidate.yearsExp,
      phone: parsed.phone ?? existingCandidate.phone,
      email: parsed.email ?? existingCandidate.email,
      tags: Array.isArray(parsed.tags) ? parsed.tags : existingCandidate.tags,
      skills: Array.isArray(parsed.skills) ? parsed.skills : existingCandidate.skills,
      experience: Array.isArray(parsed.experience) ? parsed.experience : existingCandidate.experience,
      educationHistory: Array.isArray(parsed.educationHistory) ? parsed.educationHistory : existingCandidate.educationHistory,
      languages: parsed.languages,
      aiSummary: result.summary,
      parser: "Kimi",
      parserConfidence: 92,
    };
    if (match) {
      updateData.jdMatch = llmFields.jdMatch;
      updateData.risks = llmFields.risks;
      updateData.highlights = llmFields.highlights;
      updateData.aiSuggestedTags = llmFields.aiSuggestedTags;
      updateData.matchedFor = llmFields.matchedFor;
      updateData.againstFor = llmFields.againstFor;
      updateData.insights = llmFields.insights;
    }
    const updated = await app.prisma.candidate.update({
      where: { id: existingCandidate.id },
      data: updateData,
    });

    await markDone(app, taskId, { candidate: withDerivedCandidate(updated), match, reparsed: true });
    app.log.info({ taskId, candidateId, jdMatch: updated.jdMatch }, "reparse task done");
  } catch (err) {
    app.log.error({ err, taskId, candidateId }, "reparse task failed");
    await markFailed(app, taskId, err);
  }
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
  // 两种模式:
  //   (a) 新建候选人 — 前端传 key:        从 R2 拉文件 → Kimi → 返回未存 DB 的 candidate object,前端再 POST /candidates 创建
  //   (b) 重新解析已有候选人 — 前端传 candidateId: 从 DB 拿 candidate.attachment 作 R2 key → Kimi → UPDATE 现有 DB 记录,返回 candidate
  app.post("/parse", { schema: { body: PARSE_BODY } }, async (req, reply) => {
    if (!(await isKimiConfigured())) {
      return reply.code(424).send({ error: "kimi_not_configured", message: "KIMI_API_KEY 未配置" });
    }
    let { key, contentType, model, jobId } = req.body;
    const { candidateId } = req.body;

    // 重新解析模式:异步化避开 Cloudflare 100s 硬上限。
    // 立即返回 taskId,前端轮询 GET /parse-tasks/:taskId 拿结果。Kimi 跑多久都无所谓。
    // R2 检查放到 runReparse 内异步处理(失败会写到 task.error,前端轮询能拿到)。
    if (candidateId) {
      // 提前 sanity check 防止异步任务起后才报「候选人不存在」
      const exists = await app.prisma.candidate.findUnique({
        where: { id: candidateId },
        select: { id: true, attachment: true },
      });
      if (!exists) return reply.code(404).send({ error: "candidate_not_found", message: "候选人不存在" });
      if (!exists.attachment) {
        return reply.code(400).send({ error: "no_attachment", message: "候选人无简历附件,无法重新解析(请重新上传简历)" });
      }
      const task = await createTask(app, candidateId);
      // fire-and-forget,HTTP handler 不等
      setImmediate(() => runReparse(app, task.id, candidateId, model));
      return reply.code(202).send({ task });
    }

    // 新上传模式(传 key):同步处理,因为 Upload 页已有 progress UI 等待
    if (!app.r2) {
      return reply.code(424).send({ error: "r2_not_configured", message: "R2 凭证未配置,无法读取简历" });
    }
    let existingCandidate = null;

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
    //    保留 languages(parseResume 输出的 V2 字段),其它无关字段从 parsed 透出
    const parsed = { ...result.parsed };
    delete parsed.jdMatch;
    delete parsed.risks;
    delete parsed.highlights;
    // languages 兜底 + 限长(Kimi 偶尔会输出 null 或非数组)
    if (!Array.isArray(parsed.languages)) parsed.languages = [];

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
      // V2 新字段默认空,等 /match 后再填
      aiSuggestedTags: [],
      matchedFor: [],
      againstFor: [],
      insights: [],
    };

    // 4) 若传了 jobId, 跑二次评估补 jdMatch/risks/highlights + V2 新字段
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
          candidate.aiSuggestedTags = Array.isArray(match.aiSuggestedTags) ? match.aiSuggestedTags.slice(0, 12) : [];
          candidate.matchedFor = Array.isArray(match.matchedFor) ? match.matchedFor.slice(0, 12) : [];
          candidate.againstFor = Array.isArray(match.againstFor) ? match.againstFor.slice(0, 12) : [];
          candidate.insights = Array.isArray(match.insights)
            ? match.insights
                .filter((i) => i && (i.kind === "up" || i.kind === "down") && typeof i.text === "string")
                .slice(0, 20)
                .map((i) => ({ kind: i.kind, text: i.text.slice(0, 300) }))
            : [];
          if (!candidate.appliedFor) candidate.appliedFor = job.title;
        }
      } catch (err) {
        req.log.warn({ err, jobId }, "match against job failed, candidate still saved without jd evaluation");
      }
    }

    return { candidate: withDerivedCandidate(candidate), meta: result.meta, match };
  });

  // ─── 异步 reparse 任务状态轮询 ────────────────────────────
  // 前端 reparse 立即拿到 taskId, 每 2s 调本 endpoint 拿状态。
  // status: "pending" → 还没开始; "running" → Kimi 跑中; "done" → 成功(task.candidate 是新 DB 快照);
  // "failed" → 失败(task.error 是 {code, message, statusCode})
  app.get("/parse-tasks/:taskId", async (req, reply) => {
    const task = await getTask(app, req.params.taskId);
    if (!task) return reply.code(404).send({ error: "task_not_found", message: "任务不存在或已过期(TTL 1 小时)" });
    return { task };
  });

  // ─── JD 文件 AI 解析(新建 JD 时的辅助)─────────────────────
  // 前端流程: 用户点"新建 JD"→ 上传 JD 文件 → R2 直传 → 调本端点 → AI 抽取结构化字段 → 弹窗回填供用户编辑 → 提交 POST /jobs 落库
  // 本端点纯无副作用: 不存 DB, 不创建 Job. 失败容错: R2 拉失败 → 404; Kimi 失败 → 502;
  // 端点同步处理(JD 文件一般 <2MB, Kimi 10-20s 内完成, 不像简历那样需要异步化)
  app.post("/parse-jd", { schema: { body: PARSE_JD_BODY } }, async (req, reply) => {
    if (!(await isKimiConfigured())) {
      return reply.code(424).send({ error: "kimi_not_configured", message: "KIMI_API_KEY 未配置" });
    }
    if (!app.r2) {
      return reply.code(424).send({ error: "r2_not_configured", message: "R2 凭证未配置,无法读取 JD 文件" });
    }
    const { key, contentType, model } = req.body;

    let buffer;
    try {
      const cmd = new GetObjectCommand({ Bucket: app.r2.bucket, Key: key });
      const obj = await app.r2.client.send(cmd);
      buffer = await streamToBuffer(obj.Body);
    } catch (err) {
      req.log.error({ err, key }, "fetch JD from r2 failed");
      return reply.code(404).send({ error: "r2_object_not_found", message: `R2 中找不到对象 ${key}` });
    }
    if (!buffer || buffer.length === 0) {
      return reply.code(400).send({ error: "empty_file", message: "文件为空" });
    }
    if (buffer.length > 20 * 1024 * 1024) {
      return reply.code(413).send({ error: "file_too_large", message: "JD 文件超过 20MB" });
    }

    const filename = key.split("/").pop() || "jd.pdf";
    try {
      const result = await parseJobDescription({
        buffer, filename,
        contentType: contentType || "application/octet-stream",
        model,
      });
      return result;
    } catch (err) {
      req.log.error({ err, key }, "kimi parseJobDescription failed");
      return reply.code(err.statusCode || 502).send({
        error: err.code || "kimi_error",
        message: err.message?.slice(0, 500) || "Kimi JD 解析失败",
      });
    }
  });

  // ─── 现有候选人事后关联 JD 二次评估 ───────────────────────
  app.post("/match", { schema: { body: MATCH_BODY } }, async (req, reply) => {
    if (!(await isKimiConfigured())) {
      return reply.code(424).send({ error: "kimi_not_configured", message: "KIMI_API_KEY 未配置" });
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

    // 持久化到 candidate
    // appliedFor 强制改为新 JD 的 title(否则切 JD 后头部还是旧应聘岗位,与 risks/highlights 不一致)
    // jobId 也跟着更新,这样下次 load 时 jdMatchCard 能正确反映"当前关联的 JD"
    // V2 新字段(2026-05-24): 把 LLM 输出的 aiSuggestedTags/insights/matchedFor/againstFor 也写入,
    // 这样左侧主卡 TagsModule + 匹配项-不匹配项 + 中间 FeedbackHistoryCard 洞察 Tab 都有真实数据
    const filteredInsights = Array.isArray(match.insights)
      ? match.insights
          .filter((i) => i && (i.kind === "up" || i.kind === "down") && typeof i.text === "string")
          .slice(0, 20)
          .map((i) => ({ kind: i.kind, text: i.text.slice(0, 300) }))
      : [];
    const updated = await app.prisma.candidate.update({
      where: { id: candidateId },
      data: {
        jdMatch: match.jdMatch ?? null,
        risks: Array.isArray(match.risks) ? match.risks : [],
        highlights: Array.isArray(match.highlights) ? match.highlights : [],
        appliedFor: job.title,
        jobId,
        aiSuggestedTags: Array.isArray(match.aiSuggestedTags) ? match.aiSuggestedTags.slice(0, 12) : [],
        matchedFor: Array.isArray(match.matchedFor) ? match.matchedFor.slice(0, 12) : [],
        againstFor: Array.isArray(match.againstFor) ? match.againstFor.slice(0, 12) : [],
        insights: filteredInsights,
      },
    });

    return { candidate: withDerivedCandidate(updated), match };
  });
}
