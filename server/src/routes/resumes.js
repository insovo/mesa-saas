// /api/resumes — LLM 解析简历 + JD 二次评估
//
// 设计原则:
//   1. /parse 只做"纯抽取"(基础信息 + summary), JD 相关字段(jdMatch/risks/highlights)
//      只有在传 jobId 时才填充 — 否则保持 null/[] 避免 LLM 凭空乱给
//   2. /match {candidateId, jobId} 给已有候选人事后关联 JD 进行二次评估
//   3. 二次评估输入是 candidate.aiSummary + job.description, 不需要再读 R2 文件

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { parseResume, parseJobDescription, matchAgainstJob, isKimiConfigured, listModels, buildResumeDisplayFields } from "../lib/kimi.js";
import { withDerivedCandidate } from "../lib/derived.js";
import { createTask, getTask, markRunning, markDone, markFailed } from "../lib/parseTaskStore.js";
import { notifyCandidateReady } from "../lib/feishuNotify.js";
import { cleanupEmployeeOnJobChange } from "../lib/candidateToEmployee.js";

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

// 入库前清洗 — 限长 + trim,避免 LLM 抖出超长内容把 DB Text 列撑爆
function safeMd(s) {
  return typeof s === "string" ? s.trim().slice(0, 5000) : "";
}

// 「待解析」是公开上传/飞书入库打的临时状态标记(upload-links.js),解析成功后必须剔除,
// 否则候选人简报都出来了头部还挂「待解析」自相矛盾。来源标记「公开上传」保留(溯源价值)。
function stripPendingTag(tags) {
  return Array.isArray(tags) ? tags.filter((t) => t !== "待解析") : tags;
}

// 解析后回写候选人姓名:Kimi 偶发漏填结构化 name(但简报模板首行恒为姓名)。
// 优先 parsed.name → 退而取简报首行(短、无冒号才认作姓名)→ 再退回 fallback(通常是文件名)。
// 修复:飞书/公开上传的候选人初始 name=文件名,解析后应更新为真实姓名,别留文件名。
function deriveName(parsedName, summary, fallback) {
  const clean = (s) => (typeof s === "string" ? s.trim() : "");
  const pn = clean(parsedName);
  if (pn) return pn;
  const firstLine = clean((summary || "").split("\n")[0]);
  if (firstLine && firstLine.length <= 20 && !firstLine.includes(":") && !firstLine.includes("：")) {
    return firstLine;
  }
  return fallback;
}

// 同 deriveName:Kimi 偶发没把电话/邮箱填进结构化字段(只在简报里),从简报兜底提取。
function pickPhone(parsedPhone, summary) {
  const p = typeof parsedPhone === "string" ? parsedPhone.trim() : "";
  if (p) return p;
  // 候选人可能是任何国家的人 → 不绑定中国号码格式:从带「电话/phone/tel」标签的行取号码,
  // 兼容 +/空格/横杠;校验有效位数 6-15,避免误把年份/编号当电话。
  for (const line of (summary || "").split("\n")) {
    if (!/(联系电话|电话|手机号?|电话号码|tel\.?|phone|mobile|cell)/i.test(line)) continue;
    const m = line.match(/([+(]?\d[\d\s\-()]{5,}\d)/);
    if (m) {
      const d = m[1].replace(/\D/g, "");
      if (d.length >= 6 && d.length <= 15) return m[1].trim();
    }
  }
  return null;
}
function pickEmail(parsedEmail, summary) {
  const e = typeof parsedEmail === "string" ? parsedEmail.trim() : "";
  if (e) return e;
  const m = (summary || "").match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0] : null;
}

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
// notifyChatId:仅飞书卡片「解析」触发时传入,完成后把候选人详情卡片发回该群;
// web 端 reparse 不传 → undefined → 不通知(向后兼容)
export async function runReparse(app, taskId, candidateId, model, jobIdOverride, notifyChatId) {
  try {
    await markRunning(app, taskId);

    if (!app.r2) throw Object.assign(new Error("R2 凭证未配置,无法读取简历"), { statusCode: 424, code: "r2_not_configured" });

    const existingCandidate = await app.prisma.candidate.findUnique({ where: { id: candidateId } });
    if (!existingCandidate) throw Object.assign(new Error("候选人不存在"), { statusCode: 404, code: "candidate_not_found" });
    if (!existingCandidate.attachment) throw Object.assign(new Error("候选人无简历附件"), { statusCode: 400, code: "no_attachment" });

    // 打上「解析中」标记 — 所有读 candidate 的页面据此统一显示解析中(派生 c.parsing,见 lib/derived.js)。
    // 成功在最终 updateData 里清空,失败在 catch 清空,backend 重启残留由 PARSING_TTL_MS 兜底过期。
    await app.prisma.candidate.update({ where: { id: candidateId }, data: { parsingStartedAt: new Date() } });

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

    const displayFields = buildResumeDisplayFields(parsed);

    // 4) JD 联评(如有 jobId)
    // 简报来自阶段一,本步只产出 JD 相关字段:
    // jdMatch + risks/highlights/insights/matchedFor/againstFor/aiSuggestedTags。
    // skills/experience/educationHistory 属于简历事实展示,由阶段一纯抽取产出,避免被 JD 二评改写。
    let match = null;
    let llmFields = {
      jdMatch: null, risks: [], highlights: [], aiSuggestedTags: [],
      matchedFor: [], againstFor: [], insights: [],
    };
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
    // 阶段一写基础字段 + summary + tags + languages + 简历事实展示字段。
    const updateData = {
      name: deriveName(parsed.name, result.summary, existingCandidate.name),
      gender: parsed.gender ?? existingCandidate.gender,
      animal: parsed.animal ?? existingCandidate.animal,
      education: parsed.education ?? existingCandidate.education,
      school: parsed.school ?? existingCandidate.school,
      major: parsed.major ?? existingCandidate.major,
      age: parsed.age ?? existingCandidate.age,
      location: parsed.location ?? existingCandidate.location,
      yearsExp: parsed.yearsExp ?? existingCandidate.yearsExp,
      phone: pickPhone(parsed.phone, result.summary) ?? existingCandidate.phone,
      email: pickEmail(parsed.email, result.summary) ?? existingCandidate.email,
      tags: stripPendingTag((Array.isArray(parsed.tags) && parsed.tags.length > 0) ? parsed.tags : existingCandidate.tags),
      languages: (Array.isArray(parsed.languages) && parsed.languages.length > 0) ? parsed.languages : existingCandidate.languages,
      aiSummary: result.summary,
      skills: safeMd(displayFields.skills),
      experience: safeMd(displayFields.experience),
      educationHistory: safeMd(displayFields.educationHistory),
      parser: "Kimi",
      parserConfidence: 92,
      parsingStartedAt: null, // 解析完成,清「解析中」标记
    };
    // jobId 切换:用户在 reparse 前 modal 改了投递岗位 → 同步写 DB
    // 同时把候选人 status 退回「待筛选」(换 JD = 重新评估), 让入职管理那边的 employee 也跟着清理
    if (jobIdChanged) {
      updateData.jobId = jobId;
      updateData.status = "待筛选";
    }
    // jobId 设为 null(取消 JD)时,清空所有 JD 相关字段 + 三个 markdown
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

    // 换 JD 后:若对应 employee 还停留在「待入职」(HR 未推进入职流程)就清掉,
    // 已经手工推进过(入职准备/入职当天/试用期/已转正/延期试用)的保留,不破坏 HR 数据。
    if (jobIdChanged) {
      await cleanupEmployeeOnJobChange(app.prisma, existingCandidate.id, app.log);
    }

    await markDone(app, taskId, { candidate: withDerivedCandidate(updated), match, reparsed: true });
    app.log.info({ taskId, candidateId, jdMatch: updated.jdMatch }, "reparse task done");
    // Phase 4:飞书卡片触发的解析,完成后把候选人详情(ShareLink)发回原群
    if (notifyChatId) await notifyCandidateReady(app, updated, notifyChatId);
  } catch (err) {
    app.log.error({ err, taskId, candidateId }, "reparse task failed");
    // 清「解析中」标记(updateMany:候选人可能不存在时不报错)
    if (candidateId) {
      await app.prisma.candidate.updateMany({ where: { id: candidateId }, data: { parsingStartedAt: null } }).catch(() => {});
    }
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

    // 3) 字段处理 — 阶段一保留基础字段 + summary + tags + languages + 简历事实展示字段。
    const parsed = { ...result.parsed };
    delete parsed.jdMatch;
    delete parsed.risks;
    delete parsed.highlights;
    if (!Array.isArray(parsed.languages)) parsed.languages = [];
    const displayFields = buildResumeDisplayFields(parsed);
    delete parsed.experience;
    delete parsed.educationHistory;
    delete parsed.skills;

    // 4) JD 联评(若有 jobId 且 job 存在)— 只产出 JD 评估字段。
    let match = null;
    let llmFields = {
      jdMatch: null, risks: [], highlights: [], aiSuggestedTags: [],
      matchedFor: [], againstFor: [], insights: [], appliedFor: null,
    };
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
    const fallbackName = payload.filename?.replace(/\.[^/.]+$/, "")?.slice(0, 100) || "待解析简历";
    const candidateData = {
      ...parsed,
      name: deriveName(parsed.name, result.summary, fallbackName),
      phone: pickPhone(parsed.phone, result.summary),
      email: pickEmail(parsed.email, result.summary),
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
      skills: safeMd(displayFields.skills),
      experience: safeMd(displayFields.experience),
      educationHistory: safeMd(displayFields.educationHistory),
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
      // 数据范围 + 编辑权限校验
      const { loadUserAccess, hasModule, assertCandidateAccess } = await import("../lib/permissions.js");
      const access = await loadUserAccess(req);
      if (!hasModule(access, "candidate.edit")) {
        return reply.code(403).send({ error: "forbidden", message: "无编辑权限" });
      }
      const ok = await assertCandidateAccess(req, reply, candidateId);
      if (!ok) return;

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

    // 数据范围 + 编辑权限校验
    const { loadUserAccess, hasModule, assertCandidateAccess } = await import("../lib/permissions.js");
    const access = await loadUserAccess(req);
    if (!hasModule(access, "candidate.edit")) {
      return reply.code(403).send({ error: "forbidden", message: "无编辑权限" });
    }
    const ok = await assertCandidateAccess(req, reply, candidateId);
    if (!ok) return;

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
    // 切 JD 同步:jobId 真换了 → status 回「待筛选」+ 清理「待入职」状态的 employee
    // (与 reparse 切 JD 路径完全对齐,见上方 runReparse + lib/candidateToEmployee.js)
    const jobIdChanged = candidate.jobId !== jobId;
    const updateData = {
      jdMatch: match.jdMatch ?? null,
      risks: Array.isArray(match.risks) ? match.risks : [],
      highlights: Array.isArray(match.highlights) ? match.highlights : [],
      appliedFor: job.title,
      jobId,
      aiSuggestedTags: Array.isArray(match.aiSuggestedTags) ? match.aiSuggestedTags.slice(0, 12) : [],
      matchedFor: Array.isArray(match.matchedFor) ? match.matchedFor.slice(0, 12) : [],
      againstFor: Array.isArray(match.againstFor) ? match.againstFor.slice(0, 12) : [],
      insights: filteredInsights,
    };
    if (jobIdChanged) updateData.status = "待筛选";
    const updated = await app.prisma.candidate.update({
      where: { id: candidateId },
      data: updateData,
    });

    if (jobIdChanged) {
      await cleanupEmployeeOnJobChange(app.prisma, updated.id, app.log);
    }

    return { candidate: withDerivedCandidate(updated), match };
  });
}
