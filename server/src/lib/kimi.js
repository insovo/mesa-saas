// Kimi (Moonshot AI) API 客户端
// 一份合并 prompt,一次 chat 输出 JSON:
//   - summary 字段: 按 HR 简报模板的纯文本(候选人详情页直接展示)
//   - 顶层其他字段: name/skills/experience/...(填 Candidate 结构化列,供列表/检索/匹配度排序)
// 模型从 GET /v1/models 动态拉(缓存 10 min)
// API key / model / prompt 三者都走 settings: DB(admin 改) > env > hardcoded

import { getEffective, SETTING_KEYS } from "./settings.js";
import { jsonrepair } from "jsonrepair";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1";
const execFileAsync = promisify(execFile);

// 简报中字段缺失/未解析到时的统一占位文案(方案 B 后端拼装简报用)
const NA = "未提供或未解析到";

async function effectiveApiKey() {
  return (await getEffective(SETTING_KEYS.KIMI_API_KEY)) || "";
}
async function effectiveModel() {
  return (await getEffective(SETTING_KEYS.KIMI_MODEL)) || "moonshot-v1-32k";
}

// ─── 默认 PROMPT (admin 可在 UI 改) ─────────────────────────────
// 方案 B: LLM 只输出结构化 JSON(简历事实抽取),HR 简报 txt 由后端 assembleSummary
// 确定性拼装 → 格式 100% 稳定、结构字段与简报永远一致,根治 LLM 简报格式漂移。
export const DEFAULT_PROMPT = `# Role: 简历信息提取专家

你是一个专业的简历解析器。先对简历内容进行噪声清洗,再从清洗后的正文中提取信息,**只输出一个 JSON 对象**。系统会用这个 JSON 确定性地拼装 HR 简报,所以你**绝对不要**输出任何简报纯文本、引导语或解释。

## 一、噪声清洗

剔除以下非简历正文内容:

1. 平台水印: 智联招聘 / BOSS直聘 / 前程无忧 / 猎聘 / 拉勾 / 脉脉 / 领英 等平台名称的重复出现或对角线水印
2. 来源标注: "简历来源:XX平台" "来自XX网" "Downloaded from XX"
3. 平台页眉页脚: 第X页/共X页、页码、打印时间戳、"该简历来自XX"
4. 平台附加信息: "最近活跃:X天内" "简历更新时间:XX" "简历编号:XX"
5. 广告与推荐: "升级VIP查看联系方式" "立即沟通" "推荐职位"
6. 系统生成标签: "人才标签:XX" "简历完整度:XX%" "活跃度:高"
7. 格式伪影: OCR 乱码、重复分隔线、连续空行、HTML/XML 残留标签
8. 免责声明: 版权声明、"未经允许不得转发"
9. 猎头/HR 批注: "HR备注:XX" "推荐理由:XX"、手写批注 OCR

清洗原则: 只保留候选人本人填写的内容,不确定时保留(宁多勿删)。清洗过程不输出。

## 二、提取规则

1. 只忠于简历原文,不推测、不编造。**任何字段(姓名/公司/学校/证书/职位/专业/成果/技能)在原文找不到就填 null(数组就填 []),严禁编造、脑补、凑数**。公司名、学校名、证书名等**专有名词必须照抄原文**(英文简历保持英文原名,不要自行翻译或改写,以便核对);专业、职责可适度归纳但必须忠于原文,不得添加原文没有的内容。
2. 时间统一 YYYY.MM,"至今"保留。**只输出简历明确写出的时间**:简历只给一个日期(如教育的毕业/完成时间、只有入职没有离职)时,**只填这一个日期, 严禁补全或推算另一端**(尤其严禁给教育编造"入学时间"凑成区间);缺失的一端不写。每条记录的 学校/学历/专业 或 公司/职位/时间 必须取自原文**同一条**记录,严禁把不同记录的日期、学历、专业交叉拼接或错配。
3. PDF / 表格 / 多栏简历的正文可能有抽取顺序噪音。遇到 Work History / Education / Languages 这类表格时,必须按表头与视觉行关系重建记录:同一行的日期、公司、职位、国家、专业才可以组合;不要把相邻行、页眉页脚、栏目标题或下一页内容错配进同一条经历/教育。
4. 工作经历、项目经验按时间倒序(最近的在前)
5. 相同技能、证书、奖项去重
6. 从工作和项目经历中提炼隐含技能放进 skills
7. 联系电话、邮箱**可以有多个**,分别放进 phones / emails 数组;平台打码(如 138****1234)保留打码格式,不猜测补全
8. 学历(degree)只能取这几个值之一: 函授 / 专科 / 大专 / 本科 / 硕士 / 博士 / 博士后 / 教授 / Other;读不准就用 Other
9. 工作经历每段拆成 核心职责(duties[]) 与 关键成果(achievements[]),忠于原文,无则空数组;下属人数(reports)读不到填 null
10. 姓名读不到填 null,**严禁**用 张三/李四 等占位名

## 三、输出格式 — 一个 JSON 对象

**严格要求**:
- 不要 Markdown 代码块包裹
- 不要在 JSON 前后加任何文字、引导语、说明、简报正文
- 顶层是对象,不是数组
- 字段缺失用 null / [] 而非省略 key
- 所有 JSON 结构标点必须 ASCII 半角(英文 , : " 等),不能用中文全角

\`\`\`
{
  "name": "候选人真实姓名; 读不到填 null, 严禁编造或占位",
  "currentTitle": "当前职位 或 null",
  "location": "所在地区/现居城市 或 null",
  "gender": "male | female | unknown",
  "age": 整数 0-120 或 null,
  "phones": ["可多个, 保留原打码格式"],
  "emails": ["可多个"],
  "languages": [
    { "name": "中文", "level": "母语" },
    { "name": "英语", "level": "CEFR C1 / TOEFL 105 / 流利, 简历未写具体级别用 一般|流利|精通" }
  ],
  "skills": ["关键技能短句, 已去重"],
  "awards": ["奖项 / 证书, 已去重, 照抄原文名称"],
  "appliedFor": "应聘岗位(没明确写就空字符串)",
  "tags": ["3-6 个亮点关键词"],
  "yearsExp": 整数 或 null (= 各段工作经历时长之和、重叠不重复; 没汇总句也要按 experience 各段 period 推算),
  "educationHistory": [
    {
      "school": "学校名称(照抄原文)",
      "degree": "函授|专科|大专|本科|硕士|博士|博士后|教授|Other",
      "major": "专业",
      "period": "只填简历明确写的时间; 教育常只有毕业/完成时间, 就只填那一个(如 \"2022.06\"); 严禁编造入学时间凑区间; 完全没有就填 null"
    }
  ],
  "experience": [
    {
      "company": "公司全称",
      "title": "职位",
      "period": "2023.01 – 至今 (照抄原文; 只有单边时间就只填那一端)",
      "location": "工作地点 或 null",
      "reports": "下属人数 或 null",
      "duties": ["核心职责, 忠于原文"],
      "achievements": ["关键成果, 量化优先"]
    }
  ],
  "projects": [
    { "responsibility": "负责内容", "output": "关键产出" }
  ]
}
\`\`\`

## 四、最终自检

- 输出是否为**合法 JSON 对象**、所有 key 都在(缺失用 null/[])
- 是否**误输出了简报纯文本 / 解释 / markdown**(都不应有,只要 JSON)
- 日期是否只来自原文、未补全单边时间、未给教育编造入学时间
- 姓名/公司/学校/证书等专有名词是否照抄原文未翻译改写
- 学历是否落在允许枚举内`;

async function effectivePrompt() {
  return (await getEffective(SETTING_KEYS.KIMI_PROMPT)) || DEFAULT_PROMPT;
}

// Node fetch 默认无 timeout,Kimi 慢时会阻塞 backend 直到上游 nginx 掐断 → 前端看到 502 + 空 body。
// 用 AbortController 让 backend 自己控制 Kimi 调用 timeout,失败后返回结构化 error code(504/502)。
// 链 backend (chat 90s + files 60s 单次) < nginx 180s,保证 backend 能先响应。
function pickTimeout(path) {
  if (path.includes("/chat/completions")) return 90000;   // LLM 推理,大 prompt 60-90s 常见
  if (path.includes("/files")) return 60000;              // 文件上传到 Kimi,PDF 较大时 20-40s
  return 30000;                                            // /models 等轻量请求
}

// 应该重试的 Kimi 上游错误:429 速率限制 + 5xx 服务端临时故障(包括 engine_overloaded)
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

async function kimiRequest(path, options = {}, attempt = 0) {
  const apiKey = await effectiveApiKey();
  if (!apiKey || apiKey.startsWith("__")) {
    // 424 Failed Dependency 而非 503 — Cloudflare 替换 5xx HTML 错误页,4xx 透传 JSON body
    throw Object.assign(new Error("KIMI_API_KEY not configured"), { statusCode: 424, code: "kimi_not_configured" });
  }
  const url = `${KIMI_BASE_URL}${path}`;
  const timeoutMs = options.timeoutMs || pickTimeout(path);
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${apiKey}`, ...(options.headers || {}) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // 上游过载 → 自动重试(指数 backoff: 1.5s, 4s, 9s, 总 ~15s, 不超 backend AbortController 90s)
      if (RETRYABLE_STATUS.has(res.status) && attempt < 3) {
        const delayMs = Math.round(1500 * Math.pow(2.4, attempt));
        // 注意: backend 内部 log 不走 CF, 直接 console
        console.warn(`[kimi] ${path} returned ${res.status}, retrying in ${delayMs}ms (attempt ${attempt + 1}/3)`);
        await new Promise((r) => setTimeout(r, delayMs));
        return kimiRequest(path, options, attempt + 1);
      }
      // 注意: 用 422 而不是 502,因为 Cloudflare 默认会把 origin 5xx 替换成自己的 HTML 错误页,
      // 前端就看不到我们返回的 JSON message。422 (unprocessable entity) Cloudflare 不替换,语义近似
      // "upstream rejected request"。res.status 也带进 message 让前端能识别真实上游码。
      throw Object.assign(new Error(`kimi ${path} ${res.status} (after ${attempt} retries): ${body.slice(0, 300)}`), { statusCode: 422, code: "kimi_upstream_error" });
    }
    return res;
  } catch (err) {
    if (err.name === "AbortError") {
      // 504 也会被 Cloudflare 替换;用 408 (Request Timeout) 4xx 让 Cloudflare 透传 body
      throw Object.assign(new Error(`kimi ${path} timed out after ${timeoutMs}ms (backend AbortController fired before nginx upstream)`), { statusCode: 408, code: "kimi_timeout" });
    }
    throw err;
  } finally {
    clearTimeout(tid);
  }
}

export async function uploadFile({ buffer, filename, contentType = "application/octet-stream" }) {
  const form = new FormData();
  form.append("purpose", "file-extract");
  form.append("file", new Blob([buffer], { type: contentType }), filename);
  const res = await kimiRequest("/files", { method: "POST", body: form });
  return res.json();
}

export async function getFileContent(fileId) {
  const res = await kimiRequest(`/files/${fileId}/content`);
  return res.text();
}

function isPdfFile(filename, contentType) {
  return /pdf/i.test(contentType || "") || /\.pdf$/i.test(filename || "");
}

function normalizeExtractedText(text) {
  if (typeof text !== "string") return "";
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/\f/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  return stripResumeNoise(normalized);
}

function stripResumeNoise(text) {
  const lines = text.split("\n");
  const tokenCounts = new Map();
  for (const line of lines) {
    for (const match of line.matchAll(/[A-Za-z0-9_~=-]{24,}/g)) {
      tokenCounts.set(match[0], (tokenCounts.get(match[0]) || 0) + 1);
    }
  }
  const hasWatermarkNoise = tokenCounts.size > 0;
  return lines
    .map((line) => {
      if (!hasWatermarkNoise) return line;
      return line
        .replace(/\s{8,}[A-Za-z0-9_~=-](?:[A-Za-z0-9_~=\- ]{0,30})$/g, "")
        .replace(/^\s*[A-Za-z0-9_~=-](?:[A-Za-z0-9_~=\- ]{0,8})\s{2,}(?=\p{Script=Han})/u, "")
        .replace(/(?<=\p{Script=Han})\s+[A-Za-z_~=-](?:\s*[A-Za-z_~=-]){0,3}$/u, "")
        .replace(/\s{4,}\d{1,2}\s+(?=\p{Script=Han})/u, " ");
    })
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (/^PAGE\s+\\\*\s+MERGEFORMAT\s+\d+$/i.test(trimmed)) return false;
      const compact = trimmed.replace(/\s+/g, "");
      if (hasWatermarkNoise && /^[A-Za-z0-9_~=-]{1,4}$/.test(compact)) return false;
      if (/^[A-Za-z0-9_~=-]{24,}$/.test(compact)) return false;
      for (const [token, count] of tokenCounts) {
        if (count > 1 && compact.includes(token) && compact.length <= token.length + 8) return false;
      }
      return true;
    })
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

async function extractPdfTextWithLayout(buffer, filename) {
  const safeName = (filename || "resume.pdf").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80) || "resume.pdf";
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mesa-resume-"));
  const tmpFile = path.join(tmpDir, safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`);
  try {
    await fs.writeFile(tmpFile, buffer);
    const { stdout } = await execFileAsync(
      "pdftotext",
      ["-layout", "-enc", "UTF-8", tmpFile, "-"],
      { timeout: 20_000, maxBuffer: 12 * 1024 * 1024 }
    );
    return normalizeExtractedText(stdout);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function extractResumeTextForLlm({ buffer, filename, contentType }) {
  if (isPdfFile(filename, contentType)) {
    try {
      const localText = await extractPdfTextWithLayout(buffer, filename);
      // Scanned/image PDFs often produce little or no text; keep Kimi Files API as OCR/fallback.
      if (localText.replace(/\s/g, "").length >= 80) {
        return {
          extractedText: localText,
          meta: {
            extractionSource: "pdftotext-layout",
            fileId: null,
            bytesProcessed: buffer.length,
          },
        };
      }
    } catch (err) {
      console.warn(`[kimi] local PDF text extraction failed, falling back to Kimi Files API: ${err.message}`);
    }
  }

  const file = await uploadFile({ buffer, filename, contentType });
  const extractedText = normalizeExtractedText(await getFileContent(file.id));
  return {
    extractedText,
    meta: {
      extractionSource: "kimi-files",
      fileId: file.id,
      bytesProcessed: file.bytes,
    },
  };
}

// ─── 动态模型列表 ──────────────────────────────────────────────
let modelsCache = { data: null, expiresAt: 0 };
const MODELS_TTL_MS = 10 * 60 * 1000;

export async function listModels({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && modelsCache.data && modelsCache.expiresAt > now) {
    return modelsCache.data;
  }
  const res = await kimiRequest("/models");
  const data = await res.json();
  const ids = (data?.data || []).map((m) => m.id).filter(Boolean).sort();
  modelsCache = { data: ids, expiresAt: now + MODELS_TTL_MS };
  return ids;
}

// LLM 输出 JSON 抢救:LLM 偶尔会输出 trailing comma / markdown code fence /
// 中文全角符号 / 单引号 / 非转义换行,JSON.parse 直接 throw。
// 这里做最小 sanitization,提高解析成功率。
function sanitizeLlmJson(raw) {
  if (!raw) return raw;
  let s = raw.trim();
  // 去 markdown code fence: ```json ... ``` 或 ``` ... ```
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  // 抓第一个 { 到最后一个 }
  const firstBrace = s.indexOf("{");
  const lastBrace = s.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    s = s.slice(firstBrace, lastBrace + 1);
  }
  // 修复中文全角符号在 JSON 结构位置错用 — 中文 LLM 输出常见坑,字体显示一样 JSON.parse 拒
  // 数组/对象元素之间: }，{  ]，[  }，[  ]，{
  s = s.replace(/([}\]])\s*[，、]\s*(?=[{["])/g, "$1,");
  // 对象内字段之间: "，"  "key"，"value"  "key"，123 等
  s = s.replace(/"\s*[，、]\s*(?=["\dtfn-])/g, '",');
  // 冒号也可能误用中文全角:"key" ：value
  s = s.replace(/"\s*[：]\s*/g, '":');
  // 去 trailing comma: ,] 或 ,}
  s = s.replace(/,(\s*[}\]])/g, "$1");
  return s;
}

// 解析 LLM JSON 输出 — 4 层 fallback,失败时给可读 error(含 raw 片段)
//   1) 直接 JSON.parse — 大多数情况
//   2) 手写 sanitize 后 JSON.parse — 处理 markdown fence / trailing comma / 中文全角符号
//   3) jsonrepair 库 — 专门修 LLM 输出 JSON(unescaped newlines / 缺 comma / 未闭合 string 等)
//   4) 都失败 → throw kimi_parse_error 422 + snippet
function parseLlmJson(raw, context = "kimi") {
  if (!raw) {
    throw Object.assign(new Error(`${context} returned empty content`), { statusCode: 422, code: "kimi_parse_error" });
  }
  // 1) 直接 parse
  try { return JSON.parse(raw); } catch {}
  // 2) sanitize 后 parse
  const cleaned = sanitizeLlmJson(raw);
  try { return JSON.parse(cleaned); } catch {}
  // 3) jsonrepair — 终极 fallback,能修 95%+ LLM JSON 输出错误
  try {
    const repaired = jsonrepair(cleaned);
    return JSON.parse(repaired);
  } catch (e) {
    // 失败时把 raw 关键片段附在 error 上(限长避免日志爆炸)
    const m = /at position (\d+)/.exec(e.message);
    let snippet = raw.slice(0, 400);
    if (m) {
      const pos = parseInt(m[1], 10);
      const start = Math.max(0, pos - 80);
      const end = Math.min(raw.length, pos + 80);
      snippet = `...${raw.slice(start, end)}...`;
    }
    throw Object.assign(
      new Error(`${context} JSON parse failed even after jsonrepair: ${e.message} | snippet: ${snippet}`),
      { statusCode: 422, code: "kimi_parse_error" }
    );
  }
}

async function pickModel(requested) {
  if (!requested) return effectiveModel();
  try {
    const allowed = await listModels();
    if (allowed.includes(requested)) return requested;
  } catch { /* ignore */ }
  return requested;
}

// 简历解析专用 model 选择:推理模型(kimi-k* / *-thinking)解析长简历常超 90s timeout,
// 又被 Cloudflare 100s 硬上限封死。简历是「长输入 + 抽取式输出」,根本不需要 reasoning,
// 用 moonshot-v1-32k(普通 chat,10-20s)反而稳定。
// 用户显式传 model 仍然尊重(/upload 页 admin 自己选什么用什么)。
async function pickParseModel(requested) {
  if (requested) return pickModel(requested);
  const adminConfigured = await effectiveModel();
  if (!adminConfigured) return "moonshot-v1-32k";
  // 推理模型 (kimi-k*, *-thinking, *-reasoner) 简历解析超时风险高, fallback 到 v1-32k
  if (/^kimi-k/i.test(adminConfigured) || /thinking|reasoner/i.test(adminConfigured)) {
    return "moonshot-v1-32k";
  }
  return adminConfigured;
}

// ─── 工作年限确定性计算 ──────────────────────────────────────────
// LLM「心算」yearsExp 不可靠:资深候选人(简历不写"工作年限:X年"汇总句时)常被填 0/null,
// 前端兜底就显示成「经验 < 1 年」严重误导。改为从 LLM 照抄的工作经历 period(可靠)用代码算:
// 解析每段 [起,止] 月区间 → 合并重叠(简历规则:重叠时间不重复)→ 总月数 / 12 四舍五入。
// 纯算法、可复现、不依赖 prompt 与 admin 是否改过生产 DB → 同一份简历每次结果一致。
const NOW_TOKEN_RE = /至今|今|present|now|current|在职|目前|现在/i;

// 把一段 period 文本(如 "2006.07 – 至今" / "2008.12 - 2010.09")解析成 [起月, 止月] 绝对月序号
// (year*12 + month0-11)。无法确定起止则返回 null。nowAbs = 当前绝对月序号(用于"至今"与未来截断)。
function periodToRange(period, nowAbs) {
  if (typeof period !== "string" || !period.trim()) return null;
  // 抓所有 19xx/20xx 年份及其紧随的月份(period 语义即时间, 误抓概率低)
  const points = [];
  for (const m of period.matchAll(/(19|20)\d{2}/g)) {
    const year = parseInt(m[0], 10);
    const tail = period.slice(m.index + 4, m.index + 9); // 形如 ".07" / "-11" / "年6"
    const mm = /^\s*[.\-/年]?\s*(\d{1,2})/.exec(tail);
    const month = mm ? Math.min(12, Math.max(1, parseInt(mm[1], 10))) : 1;
    points.push(year * 12 + (month - 1));
  }
  if (points.length === 0) return null;
  let start = points[0];
  let end;
  if (points.length >= 2) end = points[1];
  else if (NOW_TOKEN_RE.test(period)) end = nowAbs;
  else return null; // 只有起始年又无"至今" → 时长不可知, 跳过该段
  if (end < start) [start, end] = [end, start]; // 顺序容错
  end = Math.min(end, nowAbs); // 简历写到未来 → 截到当前
  if (end < start) return null;
  return [start, end];
}

// 从一组 period 文本算总工作年限(整数年);无任何有效区间则返回 null。
// 导出供 backfill 脚本 / 单测复用。now 可注入便于测试。
export function yearsFromPeriods(periods, now = new Date()) {
  if (!Array.isArray(periods)) return null;
  const nowAbs = now.getFullYear() * 12 + now.getMonth();
  const ranges = periods
    .map((p) => periodToRange(p, nowAbs))
    .filter(Boolean)
    .sort((a, b) => a[0] - b[0]);
  if (ranges.length === 0) return null;
  let total = 0;
  let [curStart, curEnd] = ranges[0];
  for (let i = 1; i < ranges.length; i++) {
    const [s, e] = ranges[i];
    if (s <= curEnd + 1) curEnd = Math.max(curEnd, e); // 重叠或相邻月(上段月底接下段月初)→ 合并
    else { total += curEnd - curStart; [curStart, curEnd] = [s, e]; }
  }
  total += curEnd - curStart;
  return Math.round(total / 12);
}

// experience 数组缺失时, 从最终简报(aiSummary 一定有)的「工作经历」段抓 period 兜底。
export function periodsFromSummary(summary) {
  if (typeof summary !== "string") return [];
  const m = /工作经历([\s\S]*?)(?:\n\s*(?:项目经验|项目经历|核心能力|技能|证书|综合评估)|$)/.exec(summary);
  const block = m ? m[1] : "";
  return [...block.matchAll(/时间[:：]\s*(.+)/g)].map((x) => x[1].trim()).filter(Boolean);
}

// 综合两个数据源算 yearsExp:优先 LLM experience 数组的 period,其次简报工作经历段。
export function computeYearsExp(experience, summary) {
  const fromArr = Array.isArray(experience)
    ? experience.map((e) => e && e.period).filter(Boolean)
    : [];
  let years = yearsFromPeriods(fromArr);
  if (years == null) years = yearsFromPeriods(periodsFromSummary(summary));
  return years; // null 表示算不出 → 调用方 fallback 到 LLM 原值
}

// ─── 确定性派生顶层扁平字段 ───────────────────────────────────
// Kimi 常把教育/语言写进 summary 详细模板, 却漏填顶层 education/school/major/languages,
// 导致岗位概览「学历/语言」显示「—」。这里从已规整的 summary 教育段 + 原文确定性派生兜底。
const DEGREE_RANK = { 教授: 6, 博士后: 5, 博士: 4, 硕士: 3, 本科: 2, 学士: 2, 大专: 1, 专科: 1, 函授: 1, 高中: 0, 中专: 0 };
function degreeRank(d) {
  if (DEGREE_RANK[d] != null) return DEGREE_RANK[d];
  if (/教授|professor/i.test(d)) return 6;
  if (/博士后|postdoc|post-doc/i.test(d)) return 5;
  if (/博士|phd|doctor/i.test(d)) return 4;
  if (/硕士|master|msc|m\.s/i.test(d)) return 3;
  if (/本科|学士|bachelor|b\.s|bsc/i.test(d)) return 2;
  if (/大专|专科|函授|college/i.test(d)) return 1;
  return -1;
}
// 把任意语言/写法的学历字符串确定性归一到用户规定的枚举:
// 函授/专科/大专/本科/硕士/博士/博士后/教授/Other(枚举外、高中及以下、证书类 → Other)。
// LLM 对中文学位较稳, 对英/法文学位(MASTER OF SCIENCE / BAC / Bachelor 等)常照抄原文不归类, 故加此闸门。
const DEGREE_ENUM = new Set(["函授", "专科", "大专", "本科", "硕士", "博士", "博士后", "教授", "Other"]);
export function normalizeDegree(raw) {
  const d = String(raw ?? "").trim();
  if (!d || d === NA || d === "未提供") return "";
  if (DEGREE_ENUM.has(d)) return d;
  if (/教授|professor/i.test(d)) return "教授";
  if (/博士后|postdoc|post-doc/i.test(d)) return "博士后";
  if (/博士|ph\.?\s?d|doctor|doctorate|doctoral/i.test(d)) return "博士";
  if (/硕士|master|m\.?sc|mba|m\.?eng|mphil|magist[èe]r/i.test(d)) return "硕士";
  if (/本科|学士|bachelor|licence|undergrad|b\.?sc|b\.?eng|b\.?a\b|b\.?s\b/i.test(d)) return "本科";
  if (/大专|专科|associate|hnd|\bdiploma\b|\bcollege\b/i.test(d)) return "大专";
  if (/函授/i.test(d)) return "函授";
  return "Other"; // 高中/A-Level/GCSE/BAC/证书 等不在枚举内 → Other
}

// 方案 B 主路径: 直接从 educationHistory 数组取最高学历那条的 学校/学历(归一)/专业(确定性、不依赖 summary 文本)
export function deriveEducationFromArray(educationHistory) {
  if (!Array.isArray(educationHistory)) return {};
  let best = null, bestRank = -2;
  for (const e of educationHistory) {
    if (!e || typeof e !== "object") continue;
    const canonical = normalizeDegree(e.degree || e.education);
    if (!canonical) continue;
    const rank = degreeRank(canonical);
    if (rank > bestRank) {
      bestRank = rank;
      best = { education: canonical, school: String(e.school || "").trim(), major: String(e.major || "").trim() };
    }
  }
  return best || {};
}
// 从 summary「教育背景」段取最高学历那一条的 学校/学历/专业
export function deriveEducationFields(summary) {
  if (typeof summary !== "string") return {};
  const m = /教育背景([\s\S]*?)(?:\n\s*(?:工作经历|项目经历|核心能力|技能|证书|综合评估)|$)/.exec(summary);
  if (!m) return {};
  const re = /学校[:：]\s*(.+?)\s*\n\s*学历[:：]\s*(.+?)\s*\n\s*专业[:：]\s*(.+)/g;
  let best = null, bestRank = -1, mm;
  while ((mm = re.exec(m[1]))) {
    const school = mm[1].trim(), degree = mm[2].trim(), major = mm[3].trim();
    const rank = degreeRank(degree);
    if (rank > bestRank && degree && degree !== "未提供") { bestRank = rank; best = { school, education: degree, major }; }
  }
  return best || {};
}
// 从原文「语言/Languages」段确定性识别语言(只在语言段内匹配, 避免误抓职责描述里的 English)
// 含各语言对主要语种的本地互称(英/法/德/西…), 让 fallback 也能识别非中英简历的语言段
const LANG_DICT = [
  ["中文", /chinese|mandarin|chinois|chinesisch|chino|汉语|普通话|cantonese|粤语|中文/i],
  ["英语", /english|anglais|englisch|ingl[ée]s|inglese|英语|英文|英語/i],
  ["法语", /french|fran[çc]ais|franz[öo]sisch|franc[ée]s|francese|法语|法語/i],
  ["日语", /japanese|japonais|japanisch|日语|日本语|日本語|日語/i],
  ["德语", /german|deutsch|allemand|alem[áa]n|德语|德語/i],
  ["西班牙语", /spanish|espa[ñn]ol|espagnol|spanisch|西班牙语/i],
  ["韩语", /korean|cor[ée]en|韩语|韓語|한국어/i],
  ["俄语", /russian|russe|russisch|俄语|俄語/i],
  ["意大利语", /italian|italien|italienisch|italiano|意大利语/i],
  ["葡萄牙语", /portuguese|portugais|portugiesisch|portugu[êe]s|葡萄牙语/i],
];
// 从 summary「语言」段解析(Kimi 已把任意语言/格式简历归一成中文模板, 跨简历泛化), 格式 "- 中文(母语)"
function languagesFromSummary(summary) {
  if (typeof summary !== "string") return [];
  const m = /\n语言\s*\n([\s\S]*?)(?:\n\s*(?:综合评估|证书|核心能力|技能|工作经历|项目经历)|$)/.exec(summary);
  if (!m) return [];
  const out = [];
  for (const raw of m[1].split("\n")) {
    const l = raw.trim();
    if (!l.startsWith("-")) continue;
    const body = l.replace(/^-\s*/, "").trim();
    if (!body || body === "未提供") continue;
    const mm = /^(.+?)\s*[（(](.+?)[)）]\s*$/.exec(body);
    if (mm) out.push({ name: mm[1].trim(), level: mm[2].trim() });
    else out.push({ name: body, level: "" });
  }
  return out;
}
export function deriveLanguages(summary, extractedText) {
  // 优先从 summary「语言」段(Kimi 归一化, 不依赖原文格式/语言 → 泛化好)
  const fromSummary = languagesFromSummary(summary);
  if (fromSummary.length) return fromSummary;
  // fallback: 存量 summary 无语言段 / Kimi 漏写 → 原文语言段词典(段标题多语言, 仅兜底)
  if (typeof extractedText !== "string") return [];
  const seg = /(?:语言能力|外语能力|语言|langues?|languages?|sprachen|idiomas|언어|言語)\s*[:：\n]([\s\S]{0,200})/i.exec(extractedText);
  if (!seg) return [];
  const found = [];
  for (const [name, re] of LANG_DICT) if (re.test(seg[1])) found.push({ name, level: "" });
  return found;
}

// ─── 反幻觉: 原文日期存在性校验 ───────────────────────────────
// LLM 可能输出原文不存在的日期(尤其给只有单边时间的经历补全另一端)。收集简历原文出现过的
// 年份/年月, 对文本里查无依据的日期 token 打回「未提供」。保守(误删风险低): 原文该年完全没
// 出现→判捏造; 原文有该年但抽不到月→不按月苛求; 原文一个年份都没抽到(纯图片简历)→整段不动。
function collectOriginDates(text) {
  const years = new Set();
  const yms = new Set();
  if (typeof text === "string") {
    for (const m of text.matchAll(/(19|20)\d{2}/g)) {
      const y = m[0];
      years.add(y);
      const tail = text.slice(m.index + 4, m.index + 9);
      const mm = /^\s*[.\-/年]\s*(\d{1,2})/.exec(tail);
      if (mm) yms.add(`${y}.${String(Math.min(12, Math.max(1, parseInt(mm[1], 10)))).padStart(2, "0")}`);
    }
  }
  return { years, yms };
}

export function scrubHallucinatedDates(text, originText) {
  if (typeof text !== "string" || !text) return text;
  const { years, yms } = collectOriginDates(originText);
  if (years.size === 0) return text; // 原文没抽到任何年份(纯图片/OCR 失败)→ 不动, 避免误删
  const yearHasMonth = (y) => [...yms].some((s) => s.startsWith(`${y}.`));
  return text.replace(/((?:19|20)\d{2})(?:\s*[.\-/年]\s*(\d{1,2}))?/g, (full, y, mm) => {
    if (!years.has(y)) return "未提供";          // 原文根本没这个年份 → 凭空捏造
    if (mm == null || !yearHasMonth(y)) return full; // 只精确到年 / 原文该年无月信息 → 放过
    const norm = `${y}.${String(Math.min(12, Math.max(1, parseInt(mm, 10)))).padStart(2, "0")}`;
    return yms.has(norm) ? full : "未提供";       // 原文该年有月份信息但对不上 → 月份是编的
  });
}

function cleanBulletText(value) {
  if (value == null) return "";
  return String(value)
    .replace(/\s+/g, " ")
    .replace(/^[\-•*]\s*/, "")
    .trim();
}

function markdownFromItems(items) {
  return items
    .map(cleanBulletText)
    .filter(Boolean)
    .map((item) => `- ${item}`)
    .join("\n")
    .slice(0, 5000);
}

function normalizeExistingMarkdown(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.split("\n").every((line) => !line.trim() || line.trim().startsWith("- "))) {
    return trimmed.slice(0, 5000);
  }
  return markdownFromItems(trimmed.split(/\n+/));
}

function formatExperienceItem(item) {
  if (!item || typeof item !== "object") return cleanBulletText(item);
  const head = [item.company, item.title].map(cleanBulletText).filter(Boolean).join(" ");
  const period = cleanBulletText(item.period);
  // 方案 B 的经历项无 summary 键, 退而取 duties/achievements 前 2 条拼一句要点
  const summary = cleanBulletText(item.summary || item.description || item.responsibility)
    || [...(Array.isArray(item.duties) ? item.duties : []), ...(Array.isArray(item.achievements) ? item.achievements : [])]
        .map(cleanBulletText).filter(Boolean).slice(0, 2).join("; ");
  let line = head || summary;
  if (period) line = line ? `${line} (${period})` : period;
  if (summary && summary !== line && !line.includes(summary)) line = line ? `${line} — ${summary}` : summary;
  return line;
}

function formatEducationItem(item) {
  if (!item || typeof item !== "object") return cleanBulletText(item);
  const line = [item.school, item.degree || item.education, item.major].map(cleanBulletText).filter(Boolean).join(" ");
  const period = cleanBulletText(item.period || item.time || item.completionDate);
  return period ? `${line || "教育经历"} (${period})` : line;
}

export function buildResumeDisplayFields(parsed = {}) {
  const skills = Array.isArray(parsed.skills)
    ? markdownFromItems(parsed.skills)
    : normalizeExistingMarkdown(parsed.skills);
  const experience = Array.isArray(parsed.experience)
    ? markdownFromItems(parsed.experience.map(formatExperienceItem))
    : normalizeExistingMarkdown(parsed.experience);
  const educationHistory = Array.isArray(parsed.educationHistory)
    ? markdownFromItems(parsed.educationHistory.map(formatEducationItem))
    : normalizeExistingMarkdown(parsed.educationHistory);
  return { skills, experience, educationHistory };
}

// ─── 方案 B: 从结构化 JSON 确定性拼装 HR 简报 txt ─────────────
// 简报格式与字段 100% 由代码控制, 不再依赖 LLM 自由发挥 → 跨简历格式恒定。
// 第一行恒为姓名(无标签), 与 deriveName / pickPhone / pickEmail 的简报兜底约定一致。
function naText(value) {
  const s = value == null ? "" : String(value).trim();
  return s || NA;
}
// 时间段净化:
//  1) 剥离日期反幻觉闸门可能留下的占位残片("未提供24" / "未提供-2002.06" 里的占位词)
//  2) 必须含有效年份(19xx/20xx)或「至今/present」才保留, 否则(如 "GCSEs" / 纯残片)→ 空 → NA
function periodText(value) {
  let s = cleanBulletText(value).replace(/未提供或未解析到|未提供|未解析到/g, " ");
  s = s.replace(/\s+/g, " ").replace(/^[\s\-–~/.,]+|[\s\-–~/.,]+$/g, "").trim();
  if (!/(?:19|20)\d{2}|至今|present|now|current/i.test(s)) return "";
  return s;
}
// 一组条目 → bullet 列表(空则 "- {NA}"); fmt 把元素映射成一行文本
function bulletBlock(items, fmt = (x) => x) {
  const lines = (Array.isArray(items) ? items : [])
    .map((it) => cleanBulletText(fmt(it)))
    .filter(Boolean);
  return lines.length ? lines.map((l) => `- ${l}`).join("\n") : `- ${NA}`;
}
function formatLanguageLine(lang) {
  if (!lang || typeof lang !== "object") return cleanBulletText(lang);
  const name = cleanBulletText(lang.name);
  const level = cleanBulletText(lang.level);
  if (!name) return "";
  return level ? `${name}(${level})` : name;
}

// 条目是否含有效内容(过滤 LLM 偶发吐出的全空经历/教育/项目占位条目)
function anyFilled(...vals) {
  return vals.some((v) => Array.isArray(v) ? v.some((x) => cleanBulletText(x)) : cleanBulletText(v));
}

export function assembleSummary(parsed = {}) {
  const out = [];
  // 头部
  out.push(naText(parsed.name));
  out.push(`当前职位:${naText(parsed.currentTitle)}`);
  out.push(`所在地区:${naText(parsed.location)}`);
  const phones = Array.isArray(parsed.phones) ? parsed.phones.map((p) => cleanBulletText(p)).filter(Boolean) : [];
  const emails = Array.isArray(parsed.emails) ? parsed.emails.map((e) => cleanBulletText(e)).filter(Boolean) : [];
  out.push(`联系电话:${phones.length ? phones.join(" / ") : NA}`);
  out.push(`邮箱:${emails.length ? emails.join(" / ") : NA}`);

  // 语言能力 / 关键技能 / 奖项证书
  out.push("", "语言能力:", bulletBlock(parsed.languages, formatLanguageLine));
  out.push("", "关键技能:", bulletBlock(parsed.skills));
  out.push("", "奖项证书:", bulletBlock(parsed.awards));

  // 教育背景(多段)
  out.push("", "教育背景");
  const edu = (Array.isArray(parsed.educationHistory) ? parsed.educationHistory : [])
    .filter((e) => e && typeof e === "object" && anyFilled(e.school, e.degree, e.education, e.major, e.period));
  if (!edu.length) {
    out.push(`  ${NA}`);
  } else {
    edu.forEach((e, i) => {
      e = e && typeof e === "object" ? e : {};
      out.push(`${i + 1}.`);
      out.push(`  学校:${naText(e.school)}`);
      out.push(`  学历:${naText(normalizeDegree(e.degree || e.education))}`);
      out.push(`  专业:${naText(e.major)}`);
      out.push(`  时间:${naText(periodText(e.period))}`);
    });
  }

  // 工作经历(多段)
  out.push("", "工作经历");
  const exp = (Array.isArray(parsed.experience) ? parsed.experience : [])
    .filter((w) => w && typeof w === "object" && anyFilled(w.company, w.title, w.period, w.location, w.reports, w.duties, w.achievements));
  if (!exp.length) {
    out.push(`  ${NA}`);
  } else {
    exp.forEach((w, i) => {
      w = w && typeof w === "object" ? w : {};
      out.push(`${i + 1}.`);
      out.push(`  公司:${naText(w.company)}`);
      out.push(`  职位:${naText(w.title)}`);
      out.push(`  时间:${naText(periodText(w.period))}`);
      out.push(`  地点:${naText(w.location)}`);
      out.push(`  下属人数:${naText(w.reports)}`);
      out.push("  核心职责:");
      out.push(...indentBullets(w.duties));
      out.push("  关键成果:");
      out.push(...indentBullets(w.achievements));
    });
  }

  // 项目经验(多段)
  out.push("", "项目经验");
  const projects = (Array.isArray(parsed.projects) ? parsed.projects : [])
    .filter((p) => p && typeof p === "object" && anyFilled(p.responsibility, p.output));
  if (!projects.length) {
    out.push(`  ${NA}`);
  } else {
    projects.forEach((p, i) => {
      p = p && typeof p === "object" ? p : {};
      out.push(`${i + 1}.`);
      out.push(`  负责内容:${naText(p.responsibility)}`);
      out.push(`  关键产出:${naText(p.output)}`);
    });
  }

  return out.join("\n").trim();
}
// 二级缩进 bullet(工作经历的核心职责/关键成果); 空则 "  - {NA}"
function indentBullets(items) {
  const lines = (Array.isArray(items) ? items : [])
    .map((it) => cleanBulletText(it))
    .filter(Boolean);
  return lines.length ? lines.map((l) => `  - ${l}`) : [`  - ${NA}`];
}

// ─── 解析: 一次 chat, LLM 出结构化 JSON → 后端拼装 summary ──────
export async function parseResume({ buffer, filename, contentType, model }) {
  const { extractedText, meta: extractionMeta } = await extractResumeTextForLlm({ buffer, filename, contentType });
  // 简历解析强制走 non-reasoning model — 见 pickParseModel 注释
  const useModel = await pickParseModel(model);
  const prompt = await effectivePrompt();

  // 内部函数,执行 1 次 chat 调用 + JSON 解析
  async function attempt() {
    const res = await kimiRequest("/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: useModel,
        // 不传 temperature: kimi-k2.5 等推理模型只接受 temperature=1,旧 moonshot-v1-* 默认也 OK
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: prompt },
          { role: "system", content: `以下是简历原文(可能含 OCR 噪音):\n\n${extractedText}` },
          { role: "user", content: "请按上述要求输出 JSON。严格要求:所有标点符号必须 ASCII 半角(英文 , : \" 等),不能用中文全角(,,:\" 等),数组元素之间用半角 comma,不要 trailing comma,不要 markdown code fence。" },
        ],
      }),
    });
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    const json = parseLlmJson(raw, "kimi parseResume");
    return { json, meta: { usage: data?.usage } };
  }

  // 重试 1 次:LLM 输出抖动大,第一次 JSON 语法错时通常第二次能正确返回
  let result;
  try {
    result = await attempt();
  } catch (err) {
    if (err.code === "kimi_parse_error") {
      // 仅 parse 错误才 retry,上游 4xx/5xx 不重试避免雪崩
      result = await attempt();
    } else {
      throw err;
    }
  }

  // 方案 B: LLM 只出结构化 JSON, summary 由后端确定性拼装(下面 assembleSummary)
  const parsed = (result.json && typeof result.json === "object") ? result.json : {};

  // 反幻觉: 校验经历/教育的 period(确定性闸门, 清 LLM 凭空生造/补全的日期)
  if (Array.isArray(parsed.experience)) {
    for (const e of parsed.experience) {
      if (e && typeof e.period === "string") e.period = scrubHallucinatedDates(e.period, extractedText);
    }
  }
  if (Array.isArray(parsed.educationHistory)) {
    for (const e of parsed.educationHistory) {
      if (e && typeof e.period === "string") e.period = scrubHallucinatedDates(e.period, extractedText);
    }
  }
  // languages LLM 偶尔漏填 → 从原文语言段确定性派生兜底(summary 尚未拼装, 故只走原文词典)
  if (!Array.isArray(parsed.languages) || parsed.languages.length === 0) {
    const langs = deriveLanguages("", extractedText);
    if (langs.length) parsed.languages = langs;
  }

  // 确定性拼装 HR 简报 txt(格式 100% 由代码控制, 与结构字段永远一致)
  let summary = assembleSummary(parsed);
  // 简报整体再过一遍日期反幻觉闸门(防职责/成果文本里夹带原文没有的日期)
  summary = scrubHallucinatedDates(summary, extractedText);

  // 顶层扁平字段(供列表/检索/匹配排序), 从结构化数组确定性派生:
  // 1) 最高学历 → education/school/major
  const eduFlat = deriveEducationFromArray(parsed.educationHistory);
  if (eduFlat.education) parsed.education = eduFlat.education;
  if (eduFlat.school) parsed.school = eduFlat.school;
  if (eduFlat.major) parsed.major = eduFlat.major;
  // 2) phones/emails 数组 → 单值 phone/email(resumes.js 的 pickPhone/pickEmail 兼容)
  if (!parsed.phone && Array.isArray(parsed.phones) && parsed.phones.length) parsed.phone = parsed.phones[0];
  if (!parsed.email && Array.isArray(parsed.emails) && parsed.emails.length) parsed.email = parsed.emails[0];
  // 3) yearsExp 不信任 LLM 心算: 用(已校验的)工作经历 period 确定性重算, 算得出就覆盖
  const computedYears = computeYearsExp(parsed.experience, summary);
  if (computedYears != null) parsed.yearsExp = computedYears;

  // parseResume 负责简历事实抽取:summary + 基础信息 + tags + skills/experience/educationHistory。
  // matchAgainstJob 只做 JD 相关评估,不能再改写这些简历主体展示字段。

  // 删掉「仅用于拼装简报」的辅助键(信息已烘进 summary / 已映射到 phone·email):
  // parse-and-create 流程会 `{...parsed}` 整体展开进 Prisma create, 残留非列字段会让 create 抛错。
  for (const k of ["currentTitle", "phones", "emails", "awards", "projects"]) delete parsed[k];

  return {
    summary,
    parsed,
    meta: { ...extractionMeta, model: useModel, usage: result.meta.usage },
  };
}

// ─── 二次评估: 给已有候选人匹配某个 JD ─────────────────────────
// 输入: candidateSummary (已解析的纯文本简报) + jobDescription (JD 描述)
// 输出: { jdMatch, risks, highlights, matchReason, aiSuggestedTags, insights, matchedFor, againstFor }
//   (V2 新字段: 2026-05-24 加入 aiSuggestedTags/insights/matchedFor/againstFor,
//    供 candidate-detail-flat 设计稿的左侧 TagsModule / 匹配项-不匹配项 / 洞察 Tab 渲染)
export async function matchAgainstJob({ candidateSummary, jobTitle, jobDescription, model }) {
  const useModel = await pickModel(model);
  const systemPrompt = `你是 MESA Recruit 的「候选人-岗位匹配评估」专家。
基于下面给出的候选人简报和岗位 JD,输出严格 JSON,不要 Markdown 包裹,不要额外文字。

JSON 结构(所有字段都必须出现,无内容也要返回空数组/空串/空 markdown 而不是省略 key):
{
  "jdMatch": 0-100 整数(综合匹配度),
  "risks": ["相对此 JD 的风险/缺项, 3-6 条"],
  "highlights": ["相对此 JD 的亮点, 3-6 条"],
  "matchReason": "1-2 句话说明给出 jdMatch 分数的关键依据",
  "matchedFor": ["匹配维度的简短标签 2-5 个,如 教育背景 / 技能栈 / 工作经验 / 行业经验 / 管理经验"],
  "againstFor": ["不匹配维度的简短标签 0-4 个,如 薪资期望 / 通勤城市 / 技术栈 / 行业经验"],
  "aiSuggestedTags": ["AI 推荐给 HR 的候选人标签 3-6 个,4-8 字短语,如 性能优化高手 / Tech Lead 潜质 / 海外协作经验 / 组件库主理 / DevOps 双修"],
  "insights": [
    { "kind": "up", "text": "对这次匹配的正面洞察,具体且可执行" },
    { "kind": "down", "text": "需要 HR 在面试中深入了解的关注点" }
  ]
}

评估规则:
1. 只参考给出的简报和 JD,不要凭空推测、不要给含糊推测的"可能有助于..."这种水文
2. jdMatch 维度: 行业匹配 / 核心技能匹配 / 工作年限匹配 / 学历匹配 / 关键经验匹配,综合打分
3. risks(相对此 JD 的缺项): 每条具体到 JD 的某项要求,例:"JD 要求 5 年 XX 经验,候选人仅 2 年" 或 "JD 要求精通 React,简历未提及"
4. highlights(相对此 JD 的优势,**硬性要求**):
   - 每条**必须直接对应 JD 中的一项要求或加分项**, 不要写跟 JD 无关的通用夸赞
   - **优先量化**: 引用具体数字 / 公司 / 项目 / 证书 / 专利数
   - **禁用含糊语**: "可能具备" "可能有助于" "或许" "应该" 等推测词全部禁用 — 必须基于简历明确事实
   - 如果候选人**真的没有针对此 JD 的强匹配点**, 此数组返回 ["未发现显著相对此 JD 的亮点"], **不要凑数**
5. matchedFor / againstFor: 简短标签(4-8 字),用于左侧主卡的"匹配项 / 不匹配项"chip,只列**维度名**(如 "教育背景"),不要写完整句子
6. aiSuggestedTags: 给 HR 一个候选人画像 chip 列表,每条 4-8 字,**避免**"优秀工程师"这种没区分度的标签,要有信息量,如 "P7 候选" / "百万 DAU 经验" / "缺增长经验"
7. insights:
   - kind="up" 表示对面试有利的正面线索, kind="down" 表示要重点核实的关注点
   - 每条 1-2 句,具体到事实(不要"工作经历丰富"这种空话);引用简历或 JD 中的具体数字/公司/技能
   - 总数 3-6 条,up 和 down 都要有(若简历完美无可挑剔, down 可只 1 条写"未发现明显风险点")
8. 若 JD 描述空白或太短(<50 字符), matchReason 必须明确写 "JD 信息不足, 评估不准确, 请补充 JD 描述",
   且 jdMatch ≤ 60, aiSuggestedTags/matchedFor 可返回 [], insights 至少 1 条 kind="down" 提示 JD 残缺`;

  const userMsg = `# 候选人简报
${candidateSummary || "(未提供)"}

# 岗位标题
${jobTitle || "(未提供)"}

# 岗位 JD 描述
${jobDescription || "(未提供)"}`;

  const res = await kimiRequest("/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: useModel,
      // 不传 temperature: kimi-k2.5 等推理模型只接受 temperature=1, 旧 moonshot-v1-* 默认也 OK
      // 任何 chat/completions 调用统一不传, 兼容所有 Kimi 模型
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMsg },
      ],
    }),
  });
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content || "";
  const parsed = parseLlmJson(raw, "kimi matchAgainstJob");
  return { ...parsed, _meta: { model: useModel, usage: data?.usage } };
}

// ─── JD 文件解析: 上传一份 JD 文档(PDF/DOCX/TXT),抽取成结构化字段 ──
// 输入: buffer + filename + contentType + 可选 model
// 输出: { title 候选, description 整段, responsibilities[], requirements[], nice[], benefits[],
//        employment, salary, levelRange, yearsExpRange, educationRequirement, languageRequirement, meta }
// 不存 DB — 前端拿到后展示给用户在新建 JD 弹窗里编辑确认,再 POST /jobs 落库
export async function parseJobDescription({ buffer, filename, contentType, model }) {
  const file = await uploadFile({ buffer, filename, contentType });
  const extractedText = await getFileContent(file.id);
  const useModel = await pickModel(model);

  const systemPrompt = `你是 MESA Recruit 的「JD 文件结构化抽取」专家。
基于下面给出的岗位描述(JD)文件原文,输出严格 JSON,不要 Markdown 包裹,不要额外文字。

JSON 结构(所有字段都必须出现,JD 没明确写的字段返回 null 或 [] 不要省略 key):
{
  "title": "岗位标题(短,不超过 30 字)",
  "description": "JD 完整描述(整段,可包含岗位介绍/职责/要求/福利,2000-8000 字符;直接复用原文要点,允许轻度整理标点)",
  "responsibilities": ["职责条目, 5-10 条"],
  "requirements": ["硬性要求条目, 5-10 条"],
  "nice": ["加分项条目, 0-6 条"],
  "benefits": ["福利条目, 0-8 条"],
  "employment": "雇佣类型: 全职 / 兼职 / 实习 / 合同制(JD 没说就 null)",
  "salary": "薪资范围 如 30K-40K · 16薪(JD 没说就 null)",
  "levelRange": "职级范围 如 P6-P7(JD 没说就 null)",
  "yearsExpRange": "工作年限要求 如 5-7 年(JD 没说就 null)",
  "educationRequirement": "学历要求 如 本科及以上(JD 没说就 null)",
  "languageRequirement": "语言要求 如 英语 CEFR B2+(JD 没说就 null)"
}

抽取规则:
1. 严禁虚构 — JD 原文没明确给出的字段,返回 null(字符串字段)或 [](数组字段),不要凭空补全
2. title: 优先用 JD 原文的岗位名称;若 JD 标题含公司名前缀(如「字节跳动 - 高级前端工程师」),只保留岗位部分
3. description: 必须保留 JD 的关键信息,可以重新组织段落让可读性更好,但不要删减实质内容
4. 列表类字段(responsibilities/requirements/nice/benefits): 每条独立成句,去掉编号前缀("1." "•" "-"),不要 trailing 标点
5. salary/levelRange/yearsExpRange 等结构化字段: 严格按格式样例返回,不要变体
6. 全角符号硬要求: 所有 JSON 结构符号必须 ASCII 半角(英文 , : " 等),不能用中文全角(,,:" 等)`;

  const userMsg = `# JD 文件原文(可能含 OCR 噪音)

${extractedText}`;

  async function attempt() {
    const res = await kimiRequest("/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: useModel,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMsg },
        ],
      }),
    });
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    const json = parseLlmJson(raw, "kimi parseJobDescription");
    return { json, meta: { usage: data?.usage } };
  }

  // 与 parseResume 同款:LLM 偶尔输出 JSON 抖动,parse 错误时 retry 1 次
  let result;
  try {
    result = await attempt();
  } catch (err) {
    if (err.code === "kimi_parse_error") {
      result = await attempt();
    } else {
      throw err;
    }
  }

  const j = result.json;
  // 字段兜底 + 限长(防 LLM 输出超大 / 类型错乱炸前端)
  return {
    job: {
      title: typeof j.title === "string" ? j.title.slice(0, 100).trim() : "",
      description: typeof j.description === "string" ? j.description.slice(0, 10000).trim() : "",
      responsibilities: Array.isArray(j.responsibilities) ? j.responsibilities.filter((x) => typeof x === "string").slice(0, 20).map((s) => s.slice(0, 300)) : [],
      requirements: Array.isArray(j.requirements) ? j.requirements.filter((x) => typeof x === "string").slice(0, 20).map((s) => s.slice(0, 300)) : [],
      nice: Array.isArray(j.nice) ? j.nice.filter((x) => typeof x === "string").slice(0, 10).map((s) => s.slice(0, 300)) : [],
      benefits: Array.isArray(j.benefits) ? j.benefits.filter((x) => typeof x === "string").slice(0, 15).map((s) => s.slice(0, 200)) : [],
      employment: typeof j.employment === "string" ? j.employment.slice(0, 30) : null,
      salary: typeof j.salary === "string" ? j.salary.slice(0, 60) : null,
      levelRange: typeof j.levelRange === "string" ? j.levelRange.slice(0, 30) : null,
      yearsExpRange: typeof j.yearsExpRange === "string" ? j.yearsExpRange.slice(0, 30) : null,
      educationRequirement: typeof j.educationRequirement === "string" ? j.educationRequirement.slice(0, 60) : null,
      languageRequirement: typeof j.languageRequirement === "string" ? j.languageRequirement.slice(0, 100) : null,
    },
    meta: { fileId: file.id, model: useModel, usage: result.meta.usage, bytesProcessed: file.bytes },
  };
}

export async function isKimiConfigured() {
  const key = await effectiveApiKey();
  return !!key && !key.startsWith("__");
}

export async function getActiveModel() {
  return effectiveModel();
}

export async function ping(apiKey) {
  const url = `${KIMI_BASE_URL}/models`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw Object.assign(new Error(`Kimi ping ${res.status}: ${body.slice(0, 200)}`), { statusCode: res.status });
  }
  const data = await res.json();
  return { ok: true, modelsCount: Array.isArray(data?.data) ? data.data.length : 0 };
}
