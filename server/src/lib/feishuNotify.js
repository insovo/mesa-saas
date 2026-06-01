// 飞书主动通知:解析完成后,后端生成候选人 ShareLink 并把详情卡片发回原飞书群。
//
// 为什么放后端:reparse 在 backend 完成(runReparse),而"发飞书消息"需要 bot 身份。
// 这里用 app_id/app_secret 换 tenant_access_token 直接调 IM API 发消息,
// 不依赖 lark-ingest(它只管入库 + 卡片回执)。
//
// 全部 fail-soft:任一步失败只记日志,绝不影响解析主流程。

import { randomBytes } from "node:crypto";

const APP_ID = process.env.LARK_APP_ID || "";
const APP_SECRET = process.env.LARK_APP_SECRET || "";
const BRAND = process.env.LARK_BRAND || "feishu";
const BASE = BRAND === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn";
const APP_BASE_URL = (process.env.APP_BASE_URL || "https://insovo.top").replace(/\/$/, "");

let tokenCache = { value: "", exp: 0 };

export function feishuNotifyConfigured() {
  return Boolean(APP_ID && APP_SECRET);
}

async function tenantToken() {
  const now = Date.now();
  if (tokenCache.value && tokenCache.exp > now + 60_000) return tokenCache.value;
  const res = await fetch(`${BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });
  const json = await res.json();
  if (json.code !== 0 || !json.tenant_access_token) {
    throw new Error(`tenant_access_token 失败: code=${json.code} ${json.msg || ""}`);
  }
  tokenCache = { value: json.tenant_access_token, exp: now + (json.expire || 7200) * 1000 };
  return tokenCache.value;
}

async function sendCardToChat(chatId, card) {
  const token = await tenantToken();
  const res = await fetch(`${BASE}/open-apis/im/v1/messages?receive_id_type=chat_id`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ receive_id: chatId, msg_type: "interactive", content: JSON.stringify(card) }),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`发送消息失败: code=${json.code} ${json.msg || ""}`);
  return json;
}

// 为候选人建/换一个公开 ShareLink(同候选人只留一个 active),返回完整公开 URL
async function createShareLink(app, candidate) {
  await app.prisma.shareLink.deleteMany({ where: { candidateId: candidate.id } });
  const token = randomBytes(24).toString("base64url");
  await app.prisma.shareLink.create({
    data: {
      token,
      candidateId: candidate.id,
      expiresAt: new Date(Date.now() + 30 * 86400 * 1000), // 30 天
      maxViews: null,
      showContact: true,
      showAttachments: false,
      showInterviewEval: false,
      allowedModules: [],
      createdBy: candidate.ownerId || null,
    },
  });
  return `${APP_BASE_URL}/share/${token}`;
}

// schema 2.0 卡片(发送时 content 即卡片本身,不包 type:raw)
function buildReadyCard(candidate, shareUrl) {
  const score = typeof candidate.jdMatch === "number" ? `${candidate.jdMatch} 分` : "—";
  const lines = [
    `🎉 **${candidate.name}** 简历解析完成`,
    candidate.appliedFor ? `投递岗位:${candidate.appliedFor}` : null,
    `JD 匹配度:**${score}**`,
    "",
    `👉 [点击查看候选人详情](${shareUrl})`,
  ].filter((l) => l !== null);
  return {
    schema: "2.0",
    body: { elements: [{ tag: "markdown", content: lines.join("\n") }] },
  };
}

// 对外:解析完成后调用 —— 建分享链接 + 发卡片到群。fail-soft。
export async function notifyCandidateReady(app, candidate, chatId) {
  if (!chatId) return;
  if (!feishuNotifyConfigured()) {
    app.log.warn("LARK_APP_ID/SECRET 未配置,跳过飞书解析完成通知");
    return;
  }
  try {
    const shareUrl = await createShareLink(app, candidate);
    await sendCardToChat(chatId, buildReadyCard(candidate, shareUrl));
    app.log.info({ candidateId: candidate.id, chatId }, "飞书解析完成通知已发送");
  } catch (err) {
    app.log.warn({ err: err.message, candidateId: candidate.id }, "飞书解析完成通知失败");
  }
}
