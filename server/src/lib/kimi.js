// Kimi (Moonshot AI) API 客户端
// 一份合并 prompt,一次 chat 输出 JSON:
//   - summary 字段: 按 HR 简报模板的纯文本(候选人详情页直接展示)
//   - 顶层其他字段: name/skills/experience/...(填 Candidate 结构化列,供列表/检索/匹配度排序)
// 模型从 GET /v1/models 动态拉(缓存 10 min)
// API key / model / prompt 三者都走 settings: DB(admin 改) > env > hardcoded

import { getEffective, SETTING_KEYS } from "./settings.js";

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
  "name": "候选人姓名(必填)",
  "gender": "male | female | unknown",
  "age": 整数 0-120 或 null,
  "education": "博士|硕士|本科|大专|高中|其他",
  "school": "最高学历对应院校",
  "major": "专业",
  "location": "现居城市(如 上海·浦东)",
  "yearsExp": 整数 或 null,
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

async function kimiRequest(path, options = {}) {
  const apiKey = await effectiveApiKey();
  if (!apiKey || apiKey.startsWith("__")) {
    throw Object.assign(new Error("KIMI_API_KEY not configured"), { statusCode: 503, code: "kimi_not_configured" });
  }
  const url = `${KIMI_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${apiKey}`, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw Object.assign(new Error(`kimi ${path} ${res.status}: ${body.slice(0, 300)}`), { statusCode: 502, code: "kimi_upstream_error" });
  }
  return res;
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

async function pickModel(requested) {
  if (!requested) return effectiveModel();
  try {
    const allowed = await listModels();
    if (allowed.includes(requested)) return requested;
  } catch { /* ignore */ }
  return requested;
}

// ─── 解析: 一次 chat, JSON 输出含 summary + 结构化字段 ─────────
export async function parseResume({ buffer, filename, contentType, model }) {
  const file = await uploadFile({ buffer, filename, contentType });
  const extractedText = await getFileContent(file.id);
  const useModel = await pickModel(model);
  const prompt = await effectivePrompt();

  const res = await kimiRequest("/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: useModel,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt },
        { role: "system", content: `以下是简历原文(可能含 OCR 噪音):\n\n${extractedText}` },
        { role: "user", content: "请按上述要求输出 JSON。" },
      ],
    }),
  });
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content || "";
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw Object.assign(new Error("kimi returned non-JSON content"), { statusCode: 502, code: "kimi_parse_error" });
    json = JSON.parse(m[0]);
  }

  const { summary, ...parsed } = json;
  return {
    summary: typeof summary === "string" ? summary.trim() : "",
    parsed,
    meta: { fileId: file.id, model: useModel, usage: data?.usage, bytesProcessed: file.bytes },
  };
}

// ─── 二次评估: 给已有候选人匹配某个 JD ─────────────────────────
// 输入: candidateSummary (已解析的纯文本简报) + jobDescription (JD 描述)
// 输出: { jdMatch: 0-100, risks: [...], highlights: [...], matchReason: "..." }
export async function matchAgainstJob({ candidateSummary, jobTitle, jobDescription, model }) {
  const useModel = await pickModel(model);
  const systemPrompt = `你是 MESA Recruit 的「候选人-岗位匹配评估」专家。
基于下面给出的候选人简报和岗位 JD,输出严格 JSON,不要 Markdown 包裹,不要额外文字。

JSON 结构:
{
  "jdMatch": 0-100 整数(综合匹配度),
  "risks": ["相对此 JD 的风险/缺项, 3-6 条"],
  "highlights": ["相对此 JD 的亮点, 3-6 条"],
  "matchReason": "1-2 句话说明给出 jdMatch 分数的关键依据"
}

评估规则:
1. 只参考给出的简报和 JD,不要凭空推测
2. jdMatch 衡量维度: 行业匹配 / 核心技能匹配 / 工作年限匹配 / 学历匹配 / 关键经验
3. risks 必须具体,例如:"候选人无 XX 经验, 但 JD 要求 5 年以上"
4. highlights 也要具体, 突出 JD 看重的方面
5. 若 JD 描述空白或太短(<50 字符), 在 matchReason 注明"JD 信息不足, 评估不准确"`;

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
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMsg },
      ],
    }),
  });
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content || "";
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw Object.assign(new Error("kimi match output unparseable"), { statusCode: 502 });
    parsed = JSON.parse(m[0]);
  }
  return { ...parsed, _meta: { model: useModel, usage: data?.usage } };
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
