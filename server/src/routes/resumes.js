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
    // 新建候选人场景:R2 key 直传后调 parse → 异步任务化(避开 CF 100s 上限和 Kimi 不稳定的 .doc 慢)→ 后端 create candidate
    key: { type: "string", minLength: 1, maxLength: 500 },
    // 已有候选人「重新解析」场景:传 candidateId,后端从 DB 取 attachment 作为 R2 key,跑 Kimi 后 UPDATE DB
    candidateId: { type: "string", format: "uuid" },
    contentType: { type: "string", maxLength: 100 },
    model: { type: "string", maxLength: 100 },
    jobId: { type: "string", format: "uuid", nullable: true },
    // 新建路径附加字段(异步化后必须传给 backend 一次,task 内部用):
    filename: { type: "string", maxLength: 200 },                       // 原始文件名(降级时入库 candidate.name 用)
    source: { type: ["string", "null"], maxLength: 500 },               // 来源,覆盖默认 "自动上传"
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
// jobIdOverride 语义:
//   undefined → 沿用候选人当前 jobId(不改 DB)
//   null      → 取消 JD 关联(清空 candidate.jobId,跳过 match)
//   uuid 串   → 切到这个 JD,跑 match,并把 candidate.jobId 也同步更新
async function runReparse(app, taskId, candidateId, model, jobIdOverride) {
  try {
    await markRunning(app, taskId);

    if (!app.r2) throw Object.assign(new Error("R2 凭证未配置,无法读取简历"), { statusCode: 424, code: "r2_not_configured" });

    const existingCandidate = await app.prisma.candidate.findUnique({ where: { id: candidateId } });
    if (!existingCandidate) throw Object.assign(new Error("候选人不存在"), { statusCode: 404, code: "candidate_not_found" });
    if (!existingCandidate.attachment) throw Object.assign(new Error("候选人无简历附件"), { statusCode: 400, code: "no_attachment" });

    const key = existingCandidate.attachment;
    const jobIdChanged = jobIdOverride !== undefined && jobIdOverride !== existingCandidate.jobId;
    const jobId = jobIdOverride === undefined ? existingCandidate.jobId : jobIdOverride;

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
      // 列表字段保护:LLM 偶尔结构化输出抖动(summary 文本完整但 JSON 漏字段 → []),
      // 此时保留原值避免把已有内容清空。reparse 的本意是"刷新"不是"清空"。
      // 用户想真正清空请走 PATCH /candidates 显式更新。
      tags: (Array.isArray(parsed.tags) && parsed.tags.length > 0) ? parsed.tags : existingCandidate.tags,
      skills: (Array.isArray(parsed.skills) && parsed.skills.length > 0) ? parsed.skills : existingCandidate.skills,
      experience: (Array.isArray(parsed.experience) && parsed.experience.length > 0) ? parsed.experience : existingCandidate.experience,
      educationHistory: (Array.isArray(parsed.educationHistory) && parsed.educationHistory.length > 0) ? parsed.educationHistory : existingCandidate.educationHistory,
      languages: (Array.isArray(parsed.languages) && parsed.languages.length > 0) ? parsed.languages : existingCandidate.languages,
      aiSummary: result.summary,
      parser: "Kimi",
      parserConfidence: 92,
    };
    // jobId 切换:用户在 reparse 前 modal 改了投递岗位 → 同步写 DB
    if (jobIdChanged) updateData.jobId = jobId;
    // jobId 设为 null(取消 JD)时,清空所有 JD 相关字段
    if (jobIdOverride === null) {
      updateData.jdMatch = null;
      updateData.risks = [];
      updateData.highlights = [];
      updateData.aiSuggestedTags = [];
      updateData.matchedFor = [];
      updateData.againstFor = [];
      updateData.insights = [];
    }
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

// Parse-and-create 异步任务执行器 — 跑 Kimi parseResume + 可选 JD 联评 + Prisma CREATE candidate,
// 把最终结果(或错误)写入 parseTaskStore。前端 POST /parse 立即拿 taskId,2s 一次轮询 GET /parse-tasks/:taskId。
// 关键设计:这个函数 fire-and-forget(setImmediate 调用),HTTP handler 立即返回 taskId,
// 彻底绕过 Cloudflare 100s origin response 硬上限 + 修复 .doc 等格式 Kimi 慢导致 backend 90s abort 的问题。
async function runParseAndCreate(app, taskId, payload) {
  // payload: { key, contentType, model, jobId, filename, source, ownerId }
  try {
    await markRunning(app, taskId);

    if (!app.r2) throw Object.assign(new Error("R2 凭证未配置,无法读取简历"), { statusCode: 424, code: "r2_not_configured" });

    // 1) R2 拉文件
    let buffer;
    try {
      const cmd = new GetObjectCommand({ Bucket: app.r2.bucket, Key: payload.key });
      const obj = await app.r2.client.send(cmd);
      buffer = await streamToBuffer(obj.Body);
    } catch (err) {
      throw Object.assign(new Error(`R2 中找不到对象 ${payload.key}`), { statusCode: 404, code: "r2_object_not_found" });
    }
    if (!buffer || buffer.length === 0) throw Object.assign(new Error("文件为空"), { statusCode: 400, code: "empty_file" });

    // 2) Kimi parseResume(无 Kimi 配置时 throw 在路由层已拦,此处 isKimiConfigured 必为 true)
    const filename = payload.filename || payload.key.split("/").pop() || "resume.pdf";
    const result = await parseResume({
      buffer, filename,
      contentType: payload.contentType || "application/octet-stream",
      model: payload.model,
    });

    // 3) 字段处理 — 与同步老路径一致,只是无 throw 改 markFailed
    const parsed = { ...result.parsed };
    delete parsed.jdMatch;
    delete parsed.risks;
    delete parsed.highlights;
    if (!Array.isArray(parsed.languages)) parsed.languages = [];

    // 4) JD 联评(若有 jobId 且 job 存在)
    let match = null;
    let llmFields = { jdMatch: null, risks: [], highlights: [], aiSuggestedTags: [], matchedFor: [], againstFor: [], insights: [], appliedFor: null };
    if (payload.jobId) {
      try {
        const job = await app.prisma.job.findUnique({ where: { id: payload.jobId } });
        if (job) {
          match = await matchAgainstJob({
            candidateSummary: result.summary,
            jobTitle: job.title,
            jobDescription: job.description || "",
            model: payload.model,
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
          llmFields.appliedFor = job.title;
        }
      } catch (err) {
        app.log.warn({ err, jobId: payload.jobId, taskId }, "parse-and-create JD 联评失败,候选人仍 create(无 JD 字段)");
      }
    }

    // 5) Prisma CREATE candidate(归并所有字段)
    const candidateData = {
      ...parsed,
      aiSummary: result.summary,
      attachment: payload.key,
      parser: "Kimi",
      parserConfidence: 92,
      source: payload.source?.trim()?.slice(0, 500) || "自动上传",
      status: parsed.status || "待筛选",
      jdMatch: llmFields.jdMatch,
      risks: llmFields.risks,
      highlights: llmFields.highlights,
      aiSuggestedTags: llmFields.aiSuggestedTags,
      matchedFor: llmFields.matchedFor,
      againstFor: llmFields.againstFor,
      insights: llmFields.insights,
      jobId: payload.jobId || null,
      appliedFor: llmFields.appliedFor || parsed.appliedFor || null,
      ownerId: payload.ownerId || null,
    };
    // languages 兜底
    if (!Array.isArray(candidateData.languages)) candidateData.languages = [];

    const created = await app.prisma.candidate.create({ data: candidateData });
    await markDone(app, taskId, { candidate: withDerivedCandidate(created), match });
    app.log.info({ taskId, candidateId: created.id, jdMatch: created.jdMatch, source: created.source }, "parse-and-create task done");
  } catch (err) {
    app.log.error({ err, taskId }, "parse-and-create task failed");
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
    const { key, candidateId, contentType, model, jobId, filename, source } = req.body;

    // ─── 路径 A:已有候选人「重新解析」(reparse 模式) ───
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
      const task = await createTask(app, candidateId, "reparse");
      // fire-and-forget,HTTP handler 不等
      // jobId 透传:前端在 reparse 前的 modal 里选/确认了 JD,这里覆盖候选人原 jobId。
      // 注意必须用 hasOwn 区分 undefined(沿用)和 null(显式取消 JD)。
      const jobIdOverride = Object.prototype.hasOwnProperty.call(req.body, "jobId") ? req.body.jobId : undefined;
      setImmediate(() => runReparse(app, task.id, candidateId, model, jobIdOverride));
      return reply.code(202).send({ task });
    }

    // ─── 路径 B:新上传简历「parse-and-create」(异步模式,自 2026-05-26 上线) ───
    // 修复 .doc 等格式 Kimi 慢导致 backend 90s abort 失败的问题。Kimi 跑多久都无所谓,
    // 前端 2s 一次轮询 GET /parse-tasks/:taskId 拿最终 candidate 快照(已写 DB)。
    // R2 检查放到 runParseAndCreate 内异步处理(失败会写到 task.error,前端轮询能拿到)。
    const task = await createTask(app, null, "create");
    setImmediate(() => runParseAndCreate(app, task.id, {
      key,
      contentType,
      model,
      jobId: jobId || null,
      filename,
      source,
      ownerId: req.user?.sub || null,
    }));
    return reply.code(202).send({ task });
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
