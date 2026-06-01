// /api/feishu — 飞书卡片回调(card.action.trigger)
//
// 用途:lark-ingest 入库后在群里发交互卡片,用户点按钮 → 飞书把点击事件 POST 到本端点
//      → 后端执行(关联 JD 等)→ 同步返回 { toast, card } 更新卡片(必须 3s 内)。
// 本端点公开(AuthGuard 外),靠 Verification Token 校验来源,可选 Encrypt Key 解密。
//
// 安全:
//   1. FEISHU_VERIFICATION_TOKEN 校验 header.token / url_verification token
//   2. FEISHU_ENCRYPT_KEY 配置时,请求体为 { encrypt } 密文,AES-256-CBC 解密
//   3. 不依赖 JWT;candidateId 由我们自己发出的卡片 value 携带,飞书原样回传

import crypto from "node:crypto";
import { createTask } from "../lib/parseTaskStore.js";
import { runReparse } from "./resumes.js";

const VERIFICATION_TOKEN = process.env.FEISHU_VERIFICATION_TOKEN || "";
const ENCRYPT_KEY = process.env.FEISHU_ENCRYPT_KEY || "";

// 飞书 AES-256-CBC 解密:key = sha256(encrypt_key),data = base64,iv = 前 16B,余下为密文(PKCS7)
function decryptBody(encrypt) {
  const aesKey = crypto.createHash("sha256").update(ENCRYPT_KEY).digest();
  const data = Buffer.from(encrypt, "base64");
  const iv = data.subarray(0, 16);
  const ciphertext = data.subarray(16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);
  decipher.setAutoPadding(false);
  let out = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const pad = out[out.length - 1];
  if (pad > 0 && pad <= 16) out = out.subarray(0, out.length - pad);
  return JSON.parse(out.toString("utf8"));
}

// ── schema 2.0 卡片构建 ──────────────────────────────────
// 注意:2.0 不再支持 {tag:"action"} 容器,按钮直接作为 body.elements 元素(纵向排列)
function rawCard(elements) {
  return { type: "raw", data: { schema: "2.0", body: { elements } } };
}
function md(content) {
  return { tag: "markdown", content };
}
function cbButton(content, value, type = "default") {
  // 回调按钮:点击后 value 原样出现在 event.action.value
  return { tag: "button", text: { tag: "plain_text", content }, type, behaviors: [{ type: "callback", value }] };
}
function toast(type, content) {
  return { type, content, i18n: { zh_cn: content } };
}

// pick_jd:列出 JD,点击查看详情(详情卡内可直接投递)+ 新建 JD 入口
function cardPickJd(cid, jobs) {
  const newBtn = cbButton("➕ 新建 JD", { a: "new_jd", cid }, "primary");
  if (!jobs.length) {
    return rawCard([md("⚠️ 暂无可选 JD,可直接新建:"), newBtn]);
  }
  const buttons = jobs.map((j) => cbButton(`👁 ${j.title.slice(0, 38)}`, { a: "view_jd", cid, jid: j.id }));
  return rawCard([md("📋 **点选 JD 查看详情**(详情页可直接投递):"), ...buttons, newBtn]);
}

// new_jd:岗位名称 + 详细描述输入表单(schema 2.0 form;提交走 create_jd 回调)
function cardNewJd(cid) {
  const form = {
    tag: "form",
    name: "jd_form",
    elements: [
      {
        tag: "input",
        name: "title",
        required: true,
        label: { tag: "plain_text", content: "岗位名称" },
        placeholder: { tag: "plain_text", content: "如:高级前端工程师" },
      },
      {
        tag: "input",
        name: "desc",
        input_type: "multiline_text",
        rows: 4,
        label: { tag: "plain_text", content: "岗位详细描述" },
        placeholder: { tag: "plain_text", content: "职责 / 任职要求 / 薪资 / 福利等(可选)" },
      },
      {
        tag: "button",
        name: "submit_jd",
        form_action_type: "submit", // schema 2.0:内嵌表单的提交按钮用 form_action_type,不是 action_type
        type: "primary",
        text: { tag: "plain_text", content: "✅ 创建岗位" },
        behaviors: [{ type: "callback", value: { a: "create_jd", cid } }],
      },
    ],
  };
  return rawCard([md("➕ **新建 JD**(填写后点「创建岗位」):"), form, cbButton("↩ 返回 JD 列表", { a: "pick_jd", cid })]);
}

// view_jd:岗位名称 + 详情(薪资/职级/经验/学历/职责/要求/加分项/福利),带投递 + 返回
function cardViewJd(job, cid) {
  const elements = [md(`📌 **${job.title}**`)];
  const meta = [];
  if (job.salary) meta.push(`💰 ${job.salary}`);
  if (job.employment) meta.push(job.employment);
  if (job.dept) meta.push(`🏢 ${job.dept}`);
  if (job.location) meta.push(`📍 ${job.location}`);
  if (job.levelRange || job.level) meta.push(`📊 ${job.levelRange || job.level}`);
  if (job.yearsExpRange) meta.push(`📅 ${job.yearsExpRange}`);
  if (job.educationRequirement) meta.push(`🎓 ${job.educationRequirement}`);
  if (job.languageRequirement) meta.push(`🌍 ${job.languageRequirement}`);
  if (meta.length) elements.push(md(meta.join(" · ")));

  const section = (label, arr) => {
    if (Array.isArray(arr) && arr.length) {
      elements.push(md(`**${label}**\n${arr.map((x) => `• ${String(x).slice(0, 200)}`).join("\n")}`));
    }
  };
  section("核心职责", job.responsibilities);
  section("任职要求", job.requirements);
  section("加分项", job.nice);
  section("福利待遇", job.benefits);

  const hasStructured =
    job.responsibilities?.length || job.requirements?.length || job.nice?.length || job.benefits?.length;
  if (!hasStructured && job.description) {
    elements.push(md(job.description.slice(0, 1500)));
  } else if (!hasStructured && !meta.length) {
    elements.push(md("_该岗位暂无详情,可在 MESA 补充_"));
  }

  if (cid) {
    elements.push(cbButton("✅ 投递此岗位", { a: "set_jd", cid, jid: job.id }, "primary"));
    elements.push(cbButton("↩ 返回 JD 列表", { a: "pick_jd", cid }));
  }
  return rawCard(elements);
}

function cardJdDone(cid, job) {
  return rawCard([
    md(`✅ 已关联 JD:**${job.title}**`),
    cbButton("🤖 解析简历", { a: "parse", cid }, "primary"),
    cbButton("👁 查看 JD 详情", { a: "view_jd", cid, jid: job.id }),
  ]);
}
function cardParsing() {
  return rawCard([md("⏳ **解析中…** AI 正在评估简历与 JD,稍后可在 MESA 候选人详情查看~")]);
}

export default async function feishuRoutes(app) {
  // 公开端点,不挂 authenticate
  app.post("/card-callback", async (req, reply) => {
    let body = req.body || {};

    // 1) 密文解密(配了 Encrypt Key 时)
    if (typeof body.encrypt === "string") {
      if (!ENCRYPT_KEY) {
        app.log.error("收到加密回调但未配置 FEISHU_ENCRYPT_KEY");
        return reply.code(400).send({ error: "encrypt_key_not_configured" });
      }
      try {
        body = decryptBody(body.encrypt);
      } catch (err) {
        app.log.error({ err }, "飞书回调解密失败");
        return reply.code(400).send({ error: "decrypt_failed" });
      }
    }

    // 2) URL 验证握手:原样返回 challenge
    if (body.type === "url_verification") {
      if (VERIFICATION_TOKEN && body.token && body.token !== VERIFICATION_TOKEN) {
        return reply.code(403).send({ error: "invalid_token" });
      }
      return reply.send({ challenge: body.challenge });
    }

    // 3) 来源校验(Verification Token)
    const token = body?.header?.token;
    if (VERIFICATION_TOKEN) {
      if (token !== VERIFICATION_TOKEN) {
        app.log.warn("飞书回调 token 不匹配,拒绝");
        return reply.code(403).send({ error: "invalid_token" });
      }
    } else {
      app.log.warn("FEISHU_VERIFICATION_TOKEN 未配置,跳过来源校验(建议尽快配置)");
    }

    // 4) 仅处理卡片点击
    if (body?.header?.event_type !== "card.action.trigger") {
      return reply.send({}); // 其它事件忽略,返回 200
    }

    // action.value 飞书原样回传(我们发卡片时设为对象)
    let value = body?.event?.action?.value;
    if (typeof value === "string") {
      try { value = JSON.parse(value); } catch { value = {}; }
    }
    value = value || {};

    try {
      // ── pick_jd:列出可选 JD ──
      if (value.a === "pick_jd") {
        const jobs = await app.prisma.job.findMany({
          select: { id: true, title: true },
          orderBy: { createdAt: "desc" },
          take: 12,
        });
        return reply.send({ card: cardPickJd(value.cid, jobs) });
      }

      // ── view_jd:查看某 JD 的岗位名称 + 详情 ──
      if (value.a === "view_jd") {
        const job = await app.prisma.job.findUnique({ where: { id: value.jid } });
        if (!job) return reply.send({ toast: toast("error", "该岗位不存在或已删除") });
        return reply.send({ card: cardViewJd(job, value.cid) });
      }

      // ── new_jd:弹出新建 JD 输入表单 ──
      if (value.a === "new_jd") {
        return reply.send({ card: cardNewJd(value.cid) });
      }

      // ── create_jd:表单提交 → 创建 Job(+ 有 cid 则自动关联当前候选人)──
      if (value.a === "create_jd") {
        const form = body?.event?.action?.form_value || {};
        const title = (form.title || "").trim();
        const description = (form.desc || "").trim() || null;
        if (!title) {
          return reply.send({ toast: toast("error", "请填写岗位名称") });
        }
        const job = await app.prisma.job.create({ data: { title, description } });
        let associated = false;
        if (value.cid) {
          const candidate = await app.prisma.candidate.findUnique({
            where: { id: value.cid },
            select: { id: true },
          });
          if (candidate) {
            await app.prisma.candidate.update({
              where: { id: candidate.id },
              data: { jobId: job.id, appliedFor: job.title },
            });
            associated = true;
          }
        }
        const card = associated
          ? cardJdDone(value.cid, job)
          : rawCard([
              md(`✅ 已新建 JD:**${job.title}**`),
              cbButton("👁 查看 JD 详情", { a: "view_jd", cid: value.cid, jid: job.id }),
            ]);
        return reply.send({
          toast: toast("success", `已新建「${job.title}」${associated ? ",并关联当前候选人" : ""}`),
          card,
        });
      }

      // ── set_jd:关联候选人到 JD ──
      if (value.a === "set_jd") {
        const candidate = await app.prisma.candidate.findUnique({ where: { id: value.cid } });
        if (!candidate) {
          return reply.send({ toast: toast("error", "候选人不存在或已删除") });
        }
        const job = await app.prisma.job.findUnique({ where: { id: value.jid } });
        if (!job) {
          return reply.send({ toast: toast("error", "该 JD 不存在") });
        }
        await app.prisma.candidate.update({
          where: { id: candidate.id },
          data: { jobId: job.id, appliedFor: job.title },
        });
        return reply.send({ toast: toast("success", `已关联 ${job.title}`), card: cardJdDone(candidate.id, job) });
      }

      // ── parse:触发异步 LLM 解析 + JD 联评(复用 runReparse)──
      if (value.a === "parse") {
        const candidate = await app.prisma.candidate.findUnique({
          where: { id: value.cid },
          select: { id: true, attachment: true },
        });
        if (!candidate) return reply.send({ toast: toast("error", "候选人不存在或已删除") });
        if (!candidate.attachment) return reply.send({ toast: toast("error", "该候选人无简历附件,无法解析") });
        const task = await createTask(app, candidate.id, "reparse");
        // fire-and-forget;jobIdOverride=undefined 沿用候选人当前 jobId(Phase 2 已设)
        // 透传原群 chat_id:解析完成后把候选人详情卡片发回该群(Phase 4)
        const chatId = body?.event?.context?.open_chat_id;
        setImmediate(() => runReparse(app, task.id, candidate.id, undefined, undefined, chatId));
        return reply.send({ toast: toast("info", "已开始解析"), card: cardParsing() });
      }

      return reply.send({ toast: toast("info", "未知操作") });
    } catch (err) {
      app.log.error({ err, value }, "飞书卡片回调处理失败");
      return reply.send({ toast: toast("error", "处理失败,请稍后重试") });
    }
  });
}
