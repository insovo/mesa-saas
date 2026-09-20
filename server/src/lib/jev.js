// Jev(TypeSafe AI System One)决策模型客户端 — 评估层
// 直连 POST https://api.typesafe.ai/v1/systemone。Jev 不生成文本,只对 state 回答 noul / choice / score 题,
// 输出带概率与置信度。分类 / 加权 / 算数 / 日期比较一律在代码里做(lib/evaluation/composite.js)。
//
// 与 kimiRequest 同风格:原生 fetch + AbortController + 429/529/5xx 指数退避,零新依赖。
// 缓存:同一 (model, state, questions) 的答案确定,按 sha256 缓存(Redis 优先,内存 LRU 兜底),
//       重试 / shadow 双跑 / 报告重生成都不重复计费。
// 日志永不打印 state(含简历文本)。

import { createHash } from "node:crypto";
import { getEffective, getEffectiveBool, getEffectiveNumber, SETTING_KEYS } from "./settings.js";

export const JEV_ERROR_CODES = {
  notConfigured: "jev_not_configured",
  unauthorized: "jev_unauthorized",
  badRequest: "jev_bad_request",
  rateLimited: "jev_rate_limited",
  timeout: "jev_timeout",
  upstream: "jev_upstream_error",
};

// $ / 1M 输入 token(2026-09 官方定价;输出免费)。仅用于成本记账展示。
export const JEV_USD_PER_M_INPUT = 0.042;
const MAX_REQUEST_TOKENS = 60_000;

function err(message, statusCode, code, extra = {}) {
  return Object.assign(new Error(message), { statusCode, code, ...extra });
}

export async function isJevConfigured() {
  const key = await getEffective(SETTING_KEYS.JEV_API_KEY);
  return !!(key && !String(key).startsWith("__"));
}
export async function isJevEnabled() {
  return (await isJevConfigured()) && (await getEffectiveBool(SETTING_KEYS.JEV_ENABLED));
}
export async function jevMode() {
  const m = await getEffective(SETTING_KEYS.JEV_MODE);
  return m === "primary" ? "primary" : "shadow";
}

// ─── token 估算(保守):CJK 每字 ≈1 token,其余每 4 字符 ≈1 token;数字/标点偏保守 ───
export function estimateTokens(str) {
  if (!str) return 0;
  const s = typeof str === "string" ? str : JSON.stringify(str);
  let cjk = 0;
  for (const ch of s) if (/[　-鿿豈-﫿]/.test(ch)) cjk++;
  return Math.ceil(cjk + (s.length - cjk) / 3.5);
}

// ─── 并发信号量 ───
let inflight = 0;
const waiters = [];
async function acquire(limit) {
  if (inflight < limit) { inflight++; return; }
  await new Promise((resolve) => waiters.push(resolve));
  inflight++;
}
function release() {
  inflight--;
  const next = waiters.shift();
  if (next) next();
}

// ─── 缓存:Redis(app.redis)优先,内存 LRU(500 条)兜底 ───
const memCache = new Map();
const MEM_MAX = 500;
function memGet(k) {
  const v = memCache.get(k);
  if (!v) return null;
  if (v.exp < Date.now()) { memCache.delete(k); return null; }
  memCache.delete(k); memCache.set(k, v); // LRU touch
  return v.val;
}
function memSet(k, val, ttlS) {
  if (memCache.size >= MEM_MAX) memCache.delete(memCache.keys().next().value);
  memCache.set(k, { val, exp: Date.now() + ttlS * 1000 });
}
async function cacheGet(app, k) {
  if (app?.redis) {
    try { const raw = await app.redis.get(k); if (raw) return JSON.parse(raw); } catch { /* fallthrough */ }
  }
  return memGet(k);
}
async function cacheSet(app, k, val, ttlS) {
  if (ttlS <= 0) return;
  if (app?.redis) {
    try { await app.redis.set(k, JSON.stringify(val), "EX", ttlS); return; } catch { /* fallthrough */ }
  }
  memSet(k, val, ttlS);
}

export function cacheKey(model, state, questions) {
  const h = createHash("sha256").update(model).update("\u0000").update(JSON.stringify(state)).update("\u0000").update(JSON.stringify(questions)).digest("hex");
  return `mesa:jev:ans:${h}`;
}

// ─── 响应校验:answers 必须覆盖全部题目且类型一致、数值在范围内 ───
export function validateAnswers(questions, answers) {
  const missing = [];
  const bad = [];
  for (const [id, q] of Object.entries(questions || {})) {
    const a = answers?.[id];
    if (!a || a.type !== q.type) { missing.push(id); continue; }
    if (q.type === "noul" && !(typeof a.noul === "number" && a.noul >= 0 && a.noul <= 1)) bad.push(id);
    if (q.type === "score") {
      const levels = Array.isArray(q.criteria) ? q.criteria.length : 0;
      if (!(typeof a.score === "number" && a.score >= 0 && a.score <= Math.max(0, levels - 1))) bad.push(id);
    }
    if (q.type === "choice" && typeof a.choice !== "string") bad.push(id);
  }
  return { ok: missing.length === 0 && bad.length === 0, missing, bad };
}

// ─── 主调用 ───
// evaluate({ state, questions, app, meta }) → { answers, model, usage, cached, latencyMs, costUsd, inputTokens }
export async function evaluate({ state, questions, app = null, meta = {} }) {
  const apiKey = await getEffective(SETTING_KEYS.JEV_API_KEY);
  if (!apiKey || String(apiKey).startsWith("__")) throw err("JEV_API_KEY 未配置", 424, JEV_ERROR_CODES.notConfigured);
  if (!questions || typeof questions !== "object" || Object.keys(questions).length === 0) {
    throw err("Jev 请求没有题目", 422, JEV_ERROR_CODES.badRequest);
  }
  const [baseUrl, model, timeoutMs, concurrency, cacheTtlS] = await Promise.all([
    getEffective(SETTING_KEYS.JEV_BASE_URL),
    getEffective(SETTING_KEYS.JEV_MODEL),
    getEffectiveNumber(SETTING_KEYS.JEV_TIMEOUT_MS, 20000),
    getEffectiveNumber(SETTING_KEYS.JEV_CONCURRENCY, 5),
    getEffectiveNumber(SETTING_KEYS.JEV_CACHE_TTL_S, 7 * 24 * 3600),
  ]);
  const body = { model: model || "jev-latest", state, questions };
  const bodyJson = JSON.stringify(body);
  const inputTokensEst = estimateTokens(bodyJson);
  if (inputTokensEst > MAX_REQUEST_TOKENS) {
    throw err(`Jev 请求过大(≈${inputTokensEst} tokens > ${MAX_REQUEST_TOKENS})`, 422, JEV_ERROR_CODES.badRequest);
  }

  const key = cacheKey(body.model, state, questions);
  const hit = await cacheGet(app, key);
  if (hit) {
    return { ...hit, cached: true, latencyMs: 0 };
  }

  await acquire(Math.max(1, concurrency));
  const t0 = Date.now();
  try {
    const json = await request(`${(baseUrl || "https://api.typesafe.ai/v1").replace(/\/$/, "")}/systemone`, apiKey, bodyJson, timeoutMs, 0);
    const v = validateAnswers(questions, json.answers);
    if (!v.ok) {
      throw err(`Jev 答案不完整: missing=[${v.missing.join(",")}] bad=[${v.bad.join(",")}]`, 422, JEV_ERROR_CODES.upstream, { missing: v.missing, bad: v.bad });
    }
    const inputTokens = json.usage?.input_tokens ?? inputTokensEst;
    const out = {
      answers: json.answers,
      model: json.model || body.model,
      usage: json.usage || { input_tokens: inputTokensEst, output_tokens: 0 },
      inputTokens,
      costUsd: Number(((inputTokens / 1e6) * JEV_USD_PER_M_INPUT).toFixed(6)),
      cached: false,
      latencyMs: Date.now() - t0,
    };
    await cacheSet(app, key, { answers: out.answers, model: out.model, usage: out.usage, inputTokens, costUsd: out.costUsd }, cacheTtlS);
    app?.log?.info?.({ jev: { questions: Object.keys(questions).length, inputTokens, latencyMs: out.latencyMs, model: out.model, ...meta } }, "jev evaluate ok");
    return out;
  } finally {
    release();
  }
}

async function request(url, apiKey, bodyJson, timeoutMs, attempt) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: bodyJson,
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(tid);
    if (e.name === "AbortError") throw err(`Jev 请求超时(${timeoutMs}ms)`, 408, JEV_ERROR_CODES.timeout);
    if (attempt < 3) return backoff(url, apiKey, bodyJson, timeoutMs, attempt, res, `network:${e.message}`);
    throw err(`Jev 网络错误: ${e.message}`, 422, JEV_ERROR_CODES.upstream);
  }
  clearTimeout(tid);

  if (res.status === 401) throw err("Jev API key 无效", 424, JEV_ERROR_CODES.unauthorized);
  if (res.status === 422) {
    const text = await res.text().catch(() => "");
    throw err(`Jev 拒绝请求(422): ${text.slice(0, 300)}`, 422, JEV_ERROR_CODES.badRequest);
  }
  if (res.status === 429 || res.status === 529 || res.status >= 500) {
    if (attempt < 3) return backoff(url, apiKey, bodyJson, timeoutMs, attempt, res, `http ${res.status}`);
    throw err(`Jev 上游 ${res.status}(重试 ${attempt} 次后仍失败)`, 422, res.status === 429 ? JEV_ERROR_CODES.rateLimited : JEV_ERROR_CODES.upstream);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw err(`Jev HTTP ${res.status}: ${text.slice(0, 200)}`, 422, JEV_ERROR_CODES.upstream);
  }
  return res.json();
}

async function backoff(url, apiKey, bodyJson, timeoutMs, attempt, res, reason) {
  const retryAfter = Number(res?.headers?.get?.("retry-after"));
  const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.round(1000 * Math.pow(2.5, attempt));
  console.warn(`[jev] ${reason}, retrying in ${delayMs}ms (attempt ${attempt + 1}/3)`);
  await new Promise((r) => setTimeout(r, delayMs));
  return request(url, apiKey, bodyJson, timeoutMs, attempt + 1);
}

// 探活:1 道 noul 题(≈40 token,可忽略成本)。给 admin「测试连接」与健康检查用。
export async function ping() {
  const out = await evaluate({
    state: "候选人:硕士,汽车行业 6 年。",
    questions: { ok: { type: "noul", instructions: "state 是否提到汽车行业?" } },
  });
  const p = out.answers?.ok?.noul ?? 0;
  return { ok: p > 0.5, probability: p, model: out.model, latencyMs: out.latencyMs, cached: out.cached };
}
