const BRAND = process.env.LARK_BRAND || "feishu";
const BASE = BRAND === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn";
let tokenCache = { value: "", exp: 0 };

export function feishuNotifyConfigured() {
  return Boolean(process.env.LARK_APP_ID && process.env.LARK_APP_SECRET);
}

async function tenantToken() {
  if (tokenCache.value && tokenCache.exp > Date.now() + 60000) return tokenCache.value;
  if (!feishuNotifyConfigured()) throw new Error("feishu_not_configured");
  const res = await fetch(`${BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ app_id: process.env.LARK_APP_ID, app_secret: process.env.LARK_APP_SECRET }),
  });
  const json = await res.json();
  if (!res.ok || json.code !== 0 || !json.tenant_access_token) throw new Error("feishu_auth_failed");
  tokenCache = { value: json.tenant_access_token, exp: Date.now() + (json.expire || 7200) * 1000 };
  return tokenCache.value;
}

export async function replySalaryCard(messageId, card, uuid) {
  const token = await tenantToken();
  const res = await fetch(`${BASE}/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reply`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ msg_type: "interactive", content: JSON.stringify(card), uuid, reply_in_thread: true }),
  });
  const json = await res.json();
  if (!res.ok || json.code !== 0) throw new Error("feishu_salary_delivery_failed");
  return json;
}

// 旧在途解析任务仍会调用此导出；保持兼容，但禁止再建公开分享链接或推送JD评分。
export async function notifyCandidateReady(app, candidate, chatId) {
  if (chatId) app.log.info({ candidateId: candidate?.id }, "legacy Feishu JD notification retired");
}
