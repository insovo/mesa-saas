// /api/resumes — 简历解析 + JD 评估(三层流水线:TextIn → Kimi → 硬筛 → Jev → 报告)
//
// 设计原则:
//   1. 所有长任务异步化:POST 立即 202 + taskId,前端 2s 轮询 GET /parse-tasks/:taskId(绕 Cloudflare 100s)
//   2. /parse 两种模式:新建(key)→ mode=create;已有候选人(candidateId)→ mode 默认 reextract(复用已存 markdown,不重复向 TextIn 计费)
//      body.mode 可指定 full(重新识别文档)/ reextract / reevaluate(只重评,秒级)
//   3. /match 改为异步(reevaluate),响应形状 202 + task,与 /parse 一致
//   4. 评估明细在 CandidateEvaluation;Candidate 旧列(jdMatch/risks/...)是当前评估的快照,旧页面零改动

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { parseJobDescription, isKimiConfigured, listModels, promptStatus } from "../lib/kimi.js";
import { createTask, getTask } from "../lib/parseTaskStore.js";
import { runPipeline, streamToBuffer } from "../lib/evaluation/pipeline.js";
import { extractDocument } from "../lib/documents.js";
import { isTextinConfigured, isTextinEnabled } from "../lib/textin.js";
import { isJevConfigured, isJevEnabled, jevMode } from "../lib/jev.js";
import { getEffective, SETTING_KEYS } from "../lib/settings.js";

const MODES = ["create", "full", "reextract", "reevaluate", "report"];

const PARSE_BODY = {
  type: "object",
  properties: {
    key: { type: "string", minLength: 1, maxLength: 500 },
    candidateId: { type: "string", format: "uuid" },
    contentType: { type: "string", maxLength: 100 },
    model: { type: "string", maxLength: 100 },
    jobId: { type: "string", format: "uuid", nullable: true },
    filename: { type: "string", maxLength: 200 },
    source: { type: ["string", "null"], maxLength: 500 },
    // 三档重新解析粒度(仅 candidateId 路径):full 重新识别文档 / reextract 重新抽取(默认)/ reevaluate 只重评
    mode: { type: "string", enum: ["full", "reextract", "reevaluate"] },
  },
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
    // 强制引擎(调试 / shadow 对比用):jev | legacy
    engine: { type: "string", enum: ["jev", "legacy"] },
  },
  additionalProperties: false,
};

const BATCH_BODY = {
  type: "object",
  required: ["jobId", "candidateIds"],
  properties: {
    jobId: { type: "string", format: "uuid" },
    candidateIds: { type: "array", items: { type: "string", format: "uuid" }, minItems: 1, maxItems: 200 },
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

// 向后兼容:feishu.js 「解析」按钮调用(签名不变)。语义 = reextract(复用已存 markdown,没有则走 TextIn)
export async function runReparse(app, taskId, candidateId, model, jobIdOverride, notifyChatId) {
  return runPipeline(app, taskId, { mode: "reextract", candidateId, model, jobIdOverride, notifyChatId });
}

async function requireCandidateEdit(req, reply, candidateId) {
  const { loadUserAccess, hasModule, assertCandidateAccess } = await import("../lib/permissions.js");
  const access = await loadUserAccess(req);
  if (!hasModule(access, "candidate.edit")) {
    reply.code(403).send({ error: "forbidden", message: "无编辑权限" });
    return false;
  }
  return assertCandidateAccess(req, reply, candidateId);
}

export default async function resumesRoutes(app) {
  app.addHook("preHandler", app.authenticate);

  // 三个供应商的可用性(前端据此降级渲染;凭证永不返回)
  app.get("/llm-status", async () => {
    const [configured, textinConfigured, textinEnabled, jevConfigured, jevEnabled, mode, reportPolicy] = await Promise.all([
      isKimiConfigured(), isTextinConfigured(), isTextinEnabled(), isJevConfigured(), isJevEnabled(), jevMode(), getEffective(SETTING_KEYS.EVAL_REPORT_POLICY),
    ]);
    let availableModels = [];
    if (configured) {
      try { availableModels = (await listModels()).map((id) => ({ id, label: id, desc: "" })); } catch { /* ignore */ }
    }
    return {
      provider: "kimi",
      model: (await getEffective(SETTING_KEYS.KIMI_MODEL)) || "moonshot-v1-32k",
      configured,
      mode: "system",
      availableModels,
      promptStatus: await promptStatus(), // builtin | custom | legacy_ignored(旧版自定义已被忽略)
      providers: {
        kimi: { configured },
        textin: { configured: textinConfigured, enabled: textinEnabled },
        jev: { configured: jevConfigured, enabled: jevEnabled, mode, reportPolicy: reportPolicy || "auto_ab" },
      },
    };
  });

  // ─── 简历解析(新建 / 重新解析)───
  app.post("/parse", { schema: { body: PARSE_BODY } }, async (req, reply) => {
    const { key, candidateId, contentType, model, jobId, filename, source, mode } = req.body;

    if (candidateId) {
      const ok = await requireCandidateEdit(req, reply, candidateId);
      if (!ok) return;
      const exists = await app.prisma.candidate.findUnique({ where: { id: candidateId }, select: { id: true, attachment: true, profile: true } });
      if (!exists) return reply.code(404).send({ error: "candidate_not_found", message: "候选人不存在" });
      const useMode = mode || "reextract";
      if (useMode !== "reevaluate" && !exists.attachment) {
        return reply.code(400).send({ error: "no_attachment", message: "候选人无简历附件,无法重新解析(请重新上传简历)" });
      }
      if (useMode !== "reevaluate" && !(await isKimiConfigured())) {
        return reply.code(424).send({ error: "kimi_not_configured", message: "KIMI_API_KEY 未配置" });
      }
      const task = await createTask(app, candidateId, useMode === "reevaluate" ? "reevaluate" : "reparse");
      const jobIdOverride = Object.prototype.hasOwnProperty.call(req.body, "jobId") ? req.body.jobId : undefined;
      setImmediate(() => runPipeline(app, task.id, { mode: useMode, candidateId, model, jobIdOverride }));
      return reply.code(202).send({ task });
    }

    if (!(await isKimiConfigured())) {
      return reply.code(424).send({ error: "kimi_not_configured", message: "KIMI_API_KEY 未配置" });
    }
    const task = await createTask(app, null, "create");
    setImmediate(() => runPipeline(app, task.id, {
      mode: "create",
      create: { key, contentType, filename, source, jobId: jobId || null, ownerId: req.user?.sub || null },
      model,
    }));
    return reply.code(202).send({ task });
  });

  // ─── 任务状态轮询 ───
  app.get("/parse-tasks/:taskId", async (req, reply) => {
    const task = await getTask(app, req.params.taskId);
    if (!task) return reply.code(404).send({ error: "task_not_found", message: "任务不存在或已过期(TTL 1 小时)" });
    return { task };
  });

  // ─── JD 文件 AI 解析(新建 JD 辅助;同步,JD 文件小)───
  // 文档层优先 TextIn(已启用时),否则 Kimi Files;响应含旧展示字段 job + 新 jdFacts
  app.post("/parse-jd", { schema: { body: PARSE_JD_BODY } }, async (req, reply) => {
    if (!(await isKimiConfigured())) return reply.code(424).send({ error: "kimi_not_configured", message: "KIMI_API_KEY 未配置" });
    if (!app.r2) return reply.code(424).send({ error: "r2_not_configured", message: "R2 凭证未配置,无法读取 JD 文件" });
    const { key, contentType, model } = req.body;
    let buffer;
    try {
      const obj = await app.r2.client.send(new GetObjectCommand({ Bucket: app.r2.bucket, Key: key }));
      buffer = await streamToBuffer(obj.Body);
    } catch (err) {
      req.log.error({ err, key }, "fetch JD from r2 failed");
      return reply.code(404).send({ error: "r2_object_not_found", message: `R2 中找不到对象 ${key}` });
    }
    if (!buffer || buffer.length === 0) return reply.code(400).send({ error: "empty_file", message: "文件为空" });
    if (buffer.length > 20 * 1024 * 1024) return reply.code(413).send({ error: "file_too_large", message: "JD 文件超过 20MB" });
    const filename = key.split("/").pop() || "jd.pdf";
    try {
      let preExtractedText = null;
      if (await isTextinEnabled()) {
        try { preExtractedText = (await extractDocument({ buffer, filename, contentType, log: req.log, allowTextin: true })).text; } catch { /* 回退 Kimi Files */ }
      }
      const result = await parseJobDescription({ buffer, filename, contentType: contentType || "application/octet-stream", model, preExtractedText });
      return { job: result.job, jdFacts: result.jdFacts, jdFactsWarnings: result.jdFactsWarnings, meta: result.meta };
    } catch (err) {
      req.log.error({ err, key }, "parseJobDescription failed");
      return reply.code(err.statusCode || 502).send({ error: err.code || "kimi_error", message: "JD 解析失败,请稍后重试" });
    }
  });

  // ─── 事后关联 JD / 切换 JD 重评(异步 reevaluate:硬筛 + Jev 秒级,报告按策略)───
  app.post("/match", { schema: { body: MATCH_BODY } }, async (req, reply) => {
    const { candidateId, jobId, model, engine } = req.body;
    const ok = await requireCandidateEdit(req, reply, candidateId);
    if (!ok) return;
    const [candidate, job] = await Promise.all([
      app.prisma.candidate.findUnique({ where: { id: candidateId }, select: { id: true } }),
      app.prisma.job.findUnique({ where: { id: jobId }, select: { id: true } }),
    ]);
    if (!candidate) return reply.code(404).send({ error: "candidate_not_found" });
    if (!job) return reply.code(404).send({ error: "job_not_found" });
    if (!(await isJevEnabled()) && !(await isKimiConfigured())) {
      return reply.code(424).send({ error: "evaluation_unavailable", message: "Jev 未启用且 Kimi 未配置,无法评估" });
    }
    const task = await createTask(app, candidateId, "reevaluate");
    setImmediate(() => runPipeline(app, task.id, { mode: "reevaluate", candidateId, jobIdOverride: jobId, model, forceEngine: engine || null }));
    return reply.code(202).send({ task });
  });

  // ─── 批量评估到同一 JD(每人一个 task,串行限并发 3)───
  app.post("/evaluate-batch", { schema: { body: BATCH_BODY } }, async (req, reply) => {
    const { jobId, candidateIds, model } = req.body;
    const { loadUserAccess, hasModule, buildCandidateScopeWhere } = await import("../lib/permissions.js");
    const access = await loadUserAccess(req);
    if (!hasModule(access, "candidate.edit")) return reply.code(403).send({ error: "forbidden", message: "无编辑权限" });
    const job = await app.prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
    if (!job) return reply.code(404).send({ error: "job_not_found" });
    const scopeWhere = await buildCandidateScopeWhere(req);
    const rows = await app.prisma.candidate.findMany({ where: { AND: [{ id: { in: candidateIds } }, ...(scopeWhere ? [scopeWhere] : [])] }, select: { id: true } });
    const ids = rows.map((r) => r.id);
    const tasks = [];
    for (const cid of ids) tasks.push({ candidateId: cid, task: await createTask(app, cid, "reevaluate") });
    // 串行 3 路,避免 Kimi 报告并发过高
    const queue = [...tasks];
    const worker = async () => {
      while (queue.length) {
        const t = queue.shift();
        await runPipeline(app, t.task.id, { mode: "reevaluate", candidateId: t.candidateId, jobIdOverride: jobId, model });
      }
    };
    setImmediate(() => Promise.all([worker(), worker(), worker()]).catch((e) => app.log.error({ e }, "batch worker crashed")));
    return reply.code(202).send({ jobId, count: ids.length, skipped: candidateIds.length - ids.length, tasks: tasks.map((t) => ({ candidateId: t.candidateId, taskId: t.task.id })) });
  });

  // ─── 按需补报告(C/D 类或报告失败重试)───
  app.post("/candidates/:id/report", async (req, reply) => {
    const candidateId = req.params.id;
    const ok = await requireCandidateEdit(req, reply, candidateId);
    if (!ok) return;
    const c = await app.prisma.candidate.findUnique({ where: { id: candidateId }, select: { id: true, jobId: true } });
    if (!c) return reply.code(404).send({ error: "candidate_not_found" });
    if (!c.jobId) return reply.code(400).send({ error: "no_job", message: "候选人未关联 JD" });
    if (!(await isKimiConfigured())) return reply.code(424).send({ error: "kimi_not_configured", message: "KIMI_API_KEY 未配置,无法生成报告" });
    const task = await createTask(app, candidateId, "report");
    setImmediate(() => runPipeline(app, task.id, { mode: "report", candidateId }));
    return reply.code(202).send({ task });
  });
}
