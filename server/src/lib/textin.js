// TextIn xParse(合合信息)文档解析客户端 — 文档层
// 任意格式(pdf / doc / docx / 图片 / …)→ Markdown + 逐段坐标。只负责"把文件读对",不做任何判断。
//
// 配置走 settings(DB > env):textin.app_id / textin.secret_code / textin.enabled / textin.max_pages
// 错误码口径与 kimi.js 一致:全部 4xx(424 未配置 / 408 超时 / 422 上游拒绝),让 Cloudflare 透传 JSON(坑 #20)。
// 429 / 5xx / QPS 超限(4030x)指数退避重试;余额不足(40003)不重试,由调用方回退本地链。

import { getEffective, getEffectiveBool, getEffectiveNumber, SETTING_KEYS } from "./settings.js";

const TEXTIN_BASE_URL = process.env.TEXTIN_BASE_URL || "https://api.textin.com/ai/service/v1";
const PARSE_PATH = "/pdf_to_markdown";
const TIMEOUT_MS = 60_000;
const RETRYABLE_HTTP = new Set([429, 500, 502, 503, 504]);
// TextIn 业务码:4030x = QPS / 并发超限(可重试);40003 = 余额不足;4010x = 鉴权失败
const RETRYABLE_CODES = new Set([40301, 40302, 40303, 40304, 40305, 40306]);
const AUTH_CODES = new Set([40101, 40102, 40103]);

function err(message, statusCode, code, extra = {}) {
  return Object.assign(new Error(message), { statusCode, code, ...extra });
}

export async function isTextinConfigured() {
  const [id, secret] = await Promise.all([
    getEffective(SETTING_KEYS.TEXTIN_APP_ID),
    getEffective(SETTING_KEYS.TEXTIN_SECRET_CODE),
  ]);
  return !!(id && secret && !String(id).startsWith("__") && !String(secret).startsWith("__"));
}

// 已配置且 admin 打开开关 → 文档层走 TextIn;否则沿用旧回退链(pdftotext → Kimi Files)
export async function isTextinEnabled() {
  return (await isTextinConfigured()) && (await getEffectiveBool(SETTING_KEYS.TEXTIN_ENABLED));
}

async function authHeaders() {
  const [id, secret] = await Promise.all([
    getEffective(SETTING_KEYS.TEXTIN_APP_ID),
    getEffective(SETTING_KEYS.TEXTIN_SECRET_CODE),
  ]);
  if (!id || !secret || String(id).startsWith("__") || String(secret).startsWith("__")) {
    throw err("TextIn 凭证未配置", 424, "textin_not_configured");
  }
  return { "x-ti-app-id": id, "x-ti-secret-code": secret };
}

async function textinRequest(url, { body, contentType, timeoutMs = TIMEOUT_MS, attempt = 0 }) {
  const headers = { ...(await authHeaders()), "Content-Type": contentType };
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { method: "POST", headers, body, signal: ctrl.signal });
  } catch (e) {
    clearTimeout(tid);
    if (e.name === "AbortError") throw err(`TextIn 请求超时(${timeoutMs}ms)`, 408, "textin_timeout");
    if (attempt < 3) return retry(url, { body, contentType, timeoutMs, attempt }, `network:${e.message}`);
    throw err(`TextIn 网络错误: ${e.message}`, 422, "textin_upstream_error");
  }
  clearTimeout(tid);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (RETRYABLE_HTTP.has(res.status) && attempt < 3) return retry(url, { body, contentType, timeoutMs, attempt }, `http ${res.status}`);
    throw err(`TextIn HTTP ${res.status}: ${text.slice(0, 200)}`, 422, "textin_upstream_error");
  }
  const json = await res.json().catch(() => null);
  if (!json || typeof json.code !== "number") throw err("TextIn 返回非 JSON", 422, "textin_upstream_error");
  if (json.code === 200) return json;
  if (RETRYABLE_CODES.has(json.code) && attempt < 3) return retry(url, { body, contentType, timeoutMs, attempt }, `code ${json.code}`);
  if (AUTH_CODES.has(json.code)) throw err(`TextIn 鉴权失败(${json.code}): ${json.message || ""}`, 424, "textin_unauthorized", { textinCode: json.code });
  if (json.code === 40003) throw err("TextIn 余额不足", 422, "textin_quota_exhausted", { textinCode: json.code });
  throw err(`TextIn 解析失败(${json.code}): ${json.message || ""}`.slice(0, 300), 422, "textin_upstream_error", { textinCode: json.code });
}

async function retry(url, opts, reason) {
  const delayMs = Math.round(1500 * Math.pow(2.4, opts.attempt));
  console.warn(`[textin] ${reason}, retrying in ${delayMs}ms (attempt ${opts.attempt + 1}/3)`);
  await new Promise((r) => setTimeout(r, delayMs));
  return textinRequest(url, { ...opts, attempt: opts.attempt + 1 });
}

// TextIn markdown 轻清洗:去图片引用 / 多余空行;保留标题层级与表格(Kimi 靠它重建阅读顺序)
export function cleanMarkdown(md) {
  if (typeof md !== "string") return "";
  return md
    .replace(/\u0000/g, "")                   // NUL 字节:Postgres text/jsonb 拒收(生产首例即触发 22021)
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")     // 图片引用(get_image=none 一般不会有,兜底)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

// 解析文档 → { markdown, raw, pageCount, version, durationMs, detail }
//   raw    = TextIn 完整响应(调用方存 R2,便于换模型不重新解析)
//   detail = 逐段 { page_id, text, position, outline_level, type } 供证据回溯页码
export async function parseDocument({ buffer, filename, contentType }) {
  if (!buffer || buffer.length === 0) throw err("文件为空", 400, "empty_file");
  const maxPages = await getEffectiveNumber(SETTING_KEYS.TEXTIN_MAX_PAGES, 10);
  const u = new URL(TEXTIN_BASE_URL + PARSE_PATH);
  const params = {
    parse_mode: "auto",           // 自动判断文本层 / 扫描件
    table_flavor: "md",
    apply_document_tree: "1",     // 标题层级 → markdown #
    markdown_details: "1",        // detail[] 逐段坐标 + 页码
    get_image: "none",
    page_count: String(Math.max(1, Math.min(100, maxPages))),
  };
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);

  const t0 = Date.now();
  // TextIn 按二进制流收文件;文件类型由内容识别,不依赖 contentType(doc/docx/图片皆可)
  const json = await textinRequest(u.toString(), { body: buffer, contentType: "application/octet-stream" });
  const result = json.result || {};
  const markdown = cleanMarkdown(result.markdown);
  if (markdown.replace(/\s/g, "").length < 20) {
    throw err(`TextIn 未识别出有效文本(${filename || "file"})`, 422, "textin_empty_result");
  }
  return {
    markdown,
    raw: json,
    pageCount: result.total_page_number ?? result.success_count ?? null,
    successPages: result.success_count ?? null,
    version: json.version || null,
    durationMs: Date.now() - t0,
    upstreamDurationMs: json.duration ?? null,
    detail: Array.isArray(result.detail)
      ? result.detail.map((d) => ({ page: d.page_id, text: d.text, type: d.type, outline: d.outline_level, position: d.position }))
      : [],
  };
}

// 探活:发 1 字节非法文件。鉴权失败会先于文件校验返回 4010x;其它业务码即凭证有效。不消耗页数额度。
export async function ping() {
  const u = new URL(TEXTIN_BASE_URL + PARSE_PATH);
  u.searchParams.set("page_count", "1");
  const headers = { ...(await authHeaders()), "Content-Type": "application/octet-stream" };
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(u, { method: "POST", headers, body: Buffer.from([0x00]), signal: ctrl.signal });
    const json = await res.json().catch(() => ({}));
    if (AUTH_CODES.has(json.code)) throw err(`TextIn 鉴权失败(${json.code})`, 424, "textin_unauthorized");
    return { ok: true, code: json.code ?? res.status, message: json.message || "", version: json.version || null };
  } catch (e) {
    if (e.name === "AbortError") throw err("TextIn 探活超时", 408, "textin_timeout");
    throw e;
  } finally {
    clearTimeout(tid);
  }
}
