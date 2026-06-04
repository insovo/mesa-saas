// Kimi (Moonshot AI) API 客户端
// 一份合并 prompt,一次 chat 输出 JSON:
//   - summary 字段: 按 HR 简报模板的纯文本(候选人详情页直接展示)
//   - 顶层其他字段: name/skills/experience/...(填 Candidate 结构化列,供列表/检索/匹配度排序)
// 模型从 GET /v1/models 动态拉(缓存 10 min)
// API key / model / prompt 三者都走 settings: DB(admin 改) > env > hardcoded

import { getEffective, SETTING_KEYS } from "./settings.js";
import { jsonrepair } from "jsonrepair";

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1";

async function effectiveApiKey() {
  return (await getEffective(SETTING_KEYS.KIMI_API_KEY)) || "";
}
async function effectiveModel() {
  return (await getEffective(SETTING_KEYS.KIMI_MODEL)) || "moonshot-v1-32k";
}

// ─── 默认 PROMPT (admin 可在 UI 改) ─────────────────────────────
// 基于用户提供的「简历信息提取专家」规则,改为单次 JSON 输出。
// 在 summary 字段内仍严格遵循用户的纯文本模板要求。
export const DEFAULT_PROMPT = `# Role: 简历信息提取专家

你是一个专业的简历解析器。先对简历内容进行噪声清洗,再从清洗后的正文中提取信息,**用 JSON 输出**(便于系统存储和检索)。

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

1. 只忠于简历原文,不推测、不编造
2. 时间统一 YYYY.MM,"至今"保留
3. 工作经历、项目经历按时间倒序(最近的在前)
4. 工作年限按工作经历自动计算,重叠时间不重复
5. 985 / 211 / 双一流根据学校名称自动判断;无法判断则如实标注
6. 从工作和项目经历中提炼隐含技能
7. 相同技能、证书去重
8. 联系方式若平台打码(如 138****1234),保留打码格式,不猜测补全
9. 量化成果必须用【】标注
10. 简历未提供时,字段值为 null(JSON 字段)或在 summary 文本里写"未提供"

## 三、输出格式 — 一份 JSON 对象

**严格要求**:
- 不要 Markdown 代码块包裹
- 不要在 JSON 前后加任何文字、引导语、说明
- 顶层是对象,不是数组
- 字段缺失用 null / "" / [] 而非省略 key

\`\`\`
{
  "summary": "<HR 友好的纯文本简报, 按下面 §四 模板>",
  "name": "候选人真实姓名;读不到真实姓名时填 null,严禁编造或使用 张三/李四 等占位名",
  "gender": "male | female | unknown",
  "age": 整数 0-120 或 null,
  "education": "博士|硕士|本科|大专|高中|其他",
  "school": "最高学历对应院校",
  "major": "专业",
  "location": "现居城市(如 上海·浦东)",
  "yearsExp": 整数 或 null (= 各段工作经历时长之和、重叠不重复; 简历没写"工作年限:X年"时也要按 experience 各段 period 推算, 不要因为没汇总句就填 0/null),
  "phone": "保留原打码格式",
  "email": "邮箱",
  "appliedFor": "应聘岗位(没明确写就空字符串)",
  "jdMatch": 0-100 整数(无 JD 时按综合能力评分),
  "tags": ["3-6 个亮点关键词"],
  "skills": ["核心技能短句, 已去重"],
  "risks": ["风险点(跳槽频繁/空档期/行业不匹配),无则空数组"],
  "highlights": ["亮点: 头部公司/稀缺经验/专利/论文"],
  "experience": [
    { "period": "2023.01 – 至今", "company": "公司全称", "title": "职位", "summary": "1-2 句要点" }
  ],
  "educationHistory": [
    { "period": "2018.09 – 2022.06", "school": "...", "major": "...", "degree": "本科/硕士/博士" }
  ],
  "languages": [
    { "name": "中文", "level": "母语" },
    { "name": "英语", "level": "CEFR C1 / TOEFL 105 / 流利,如简历未写具体级别用 一般|流利|精通" }
  ]
}
\`\`\`

## 四、summary 字段的纯文本模板(严格)

summary 内容必须是**纯文本**(无 Markdown / 无分隔线 / 无引导语),从候选人姓名开始(第一行只是姓名本身,不带"姓名:"标签),到"国际经验:..."结束。模板:

\`\`\`
{姓名}
当前职位:{当前职位}
所在地区:{所在地区}
联系电话:{联系电话}
邮箱:{邮箱}

教育背景
1.
  学校:{学校名称}
  学历:{学历}
  专业:{专业}
  时间:{时间}
  学校标签:{985/211/双一流/其他/未提供}

工作经历
1.
  公司:{公司名称}
  职位:{职位}
  时间:{开始时间 至 结束时间}
  地点:{地点}
  下属人数:{下属人数}
  核心职责:
  - {职责1}
  - {职责2}
  关键成果:
  - {成果1}
  - {成果2}

项目经历
1.
  项目名称:{项目名称}
  角色:{角色}
  时间:{开始时间 至 结束时间}
  项目说明:{项目说明}
  职责:
  - {职责1}
  - {职责2}
  项目成果:
  - {成果1}
  - {成果2}

核心能力
- {能力1}
- {能力2}

技能
- {技能1}
- {技能2}

证书
- {证书1}
- {证书2}

综合评估
工作年限:{工作年限}
行业领域:{行业领域}
核心专长:
- {专长1}
- {专长2}
管理幅度:{管理幅度}
国际经验:{国际经验}
\`\`\`

## 五、空值处理

- 模块完全无内容时,在 summary 中保留模块名后写"未提供"
- 二级列表无内容时,写"  - 未提供"
- 多段时按同一格式继续编号

## 六、最终自检

- summary 第一行是否只有姓名(不带"姓名:")
- summary 最后一行是否是"国际经验:..."
- summary 内是否出现了"===" "---" "简历信息提取结果" "已清洗内容"等禁止内容(应删除)
- JSON 是否合法,所有字段都存在`;

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
  const m = /工作经历([\s\S]*?)(?:\n\s*(?:项目经历|核心能力|技能|证书|综合评估)|$)/.exec(summary);
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

// ─── 解析: 一次 chat, JSON 输出含 summary + 结构化字段 ─────────
export async function parseResume({ buffer, filename, contentType, model }) {
  const file = await uploadFile({ buffer, filename, contentType });
  const extractedText = await getFileContent(file.id);
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

  const { summary: rawSummary, ...parsed } = result.json;
  const summary = typeof rawSummary === "string" ? rawSummary.trim() : "";

  // yearsExp 不信任 LLM 心算: 用工作经历 period 确定性重算, 算得出就覆盖(资深候选人常被 LLM 填 0/null)
  const computedYears = computeYearsExp(parsed.experience, summary);
  if (computedYears != null) parsed.yearsExp = computedYears;

  // 注意: 两阶段解析 — parseResume 只负责 summary + 基础信息 + tags,
  // experience/educationHistory/skills 不再在这里产出 (即便 LLM 输出了也由调用方丢弃),
  // 这三项交给 matchAgainstJob 在关联 JD 后产出 markdown bullet 字符串。

  return {
    summary,
    parsed,
    meta: { fileId: file.id, model: useModel, usage: result.meta.usage, bytesProcessed: file.bytes },
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
  "skillsMd": "markdown 无序列表:候选人针对此 JD 的核心技能, 4-10 条, 例:\n- 整车技术统筹 (智己 / 上汽大众 6+ 年)\n- RFQ 管理与成本控制 (节约 10%+)",
  "experienceMd": "markdown 无序列表:候选人工作经历(突出与 JD 强相关的项),按时间倒序, 例:\n- 智己汽车 制造&质量项目经理 (2024.01 – 至今) — 整车技术统筹, 6 个项目并行\n- 上汽大众 项目经理 (2017.07 – 2023.12) — 主导 RFQ, 预算节约 10%+",
  "educationMd": "markdown 无序列表:教育背景, 按时间倒序, 例:\n- 同济大学 硕士 车辆工程 (2014.09 – 2017.06, 985)",
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
7. skillsMd / experienceMd / educationMd (三大 markdown 字段, **硬性要求**):
   - 严格用 markdown 无序列表语法,每行以 "- " (短横+空格) 开头,行间用 \\n 分隔
   - 不要 markdown 表格、不要 ##/### 标题、不要 **加粗**、不要链接,**纯 bullet**
   - experienceMd 必须**按 JD 相关度排序**:跟 JD 强相关的经历放前面,完全无关的可以省略或一句话带过
   - skillsMd 必须**面向此 JD**:列简报里支持得起这个 JD 要求的技能,JD 无关的技能不出现
   - educationMd 按时间倒序,1-3 条,每条「学校 学历 专业 (时间, 学校档次如有)」
   - 简报里如果**完全没相关信息**(如简报短而残缺),三个字段都返回 "" 空字符串
8. insights:
   - kind="up" 表示对面试有利的正面线索, kind="down" 表示要重点核实的关注点
   - 每条 1-2 句,具体到事实(不要"工作经历丰富"这种空话);引用简历或 JD 中的具体数字/公司/技能
   - 总数 3-6 条,up 和 down 都要有(若简历完美无可挑剔, down 可只 1 条写"未发现明显风险点")
9. 若 JD 描述空白或太短(<50 字符), matchReason 必须明确写 "JD 信息不足, 评估不准确, 请补充 JD 描述",
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
