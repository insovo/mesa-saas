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
function rawCard(elements) {
  return { type: "raw", data: { schema: "2.0", config: { wide_screen_mode: true }, body: { elements } } };
}
function md(content) {
  return { tag: "markdown", content };
}
function cbButton(content, value, type = "default") {
  // 回调按钮:点击后 value 原样出现在 event.action.value
  return { tag: "button", text: { tag: "plain_text", content }, type, behaviors: [{ type: "callback", value }] };
}
function actionRow(buttons) {
  return { tag: "action", actions: buttons };
}
function toast(type, content) {
  return { type, content, i18n: { zh_cn: content } };
}

// pick_jd:展示可选 JD 按钮(每个按钮带 set_jd + cid + jid)
function cardPickJd(cid, jobs) {
  if (!jobs.length) {
    return rawCard([md("⚠️ 暂无可选 JD,请先在 MESA 创建岗位")]);
  }
  // 每行最多 3 个按钮,避免过宽
  const rows = [];
  for (let i = 0; i < jobs.length; i += 3) {
    rows.push(actionRow(jobs.slice(i, i + 3).map((j) => cbButton(j.title.slice(0, 30), { a: "set_jd", cid, jid: j.id }))));
  }
  return rawCard([md("📋 **选择要投递的 JD**:"), ...rows]);
}
function cardJdDone(title) {
  return rawCard([md(`✅ 已关联 JD:**${title}**\n\n_下一步:解析指令即将支持(Phase 3)_`)]);
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
        return reply.send({ toast: toast("success", `已关联 ${job.title}`), card: cardJdDone(job.title) });
      }

      return reply.send({ toast: toast("info", "未知操作") });
    } catch (err) {
      app.log.error({ err, value }, "飞书卡片回调处理失败");
      return reply.send({ toast: toast("error", "处理失败,请稍后重试") });
    }
  });
}
