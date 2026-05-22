// Kimi (Moonshot AI) API 客户端
// 文档: https://platform.moonshot.cn/docs/api/files
// 流程: uploadFile(buffer, name) → 拿 file_id → parseResume(fileId) → JSON 结构化字段
//
// 选型理由:
//   1. Kimi Files API 直接吃 PDF/DOCX,无需我们自己跑 pdf-parse / mammoth
//   2. moonshot-v1-32k 模型对中文简历理解强,32k context 足够一份长简历
//   3. 兼容 OpenAI Chat Completions 格式,JSON Schema 强约束输出

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1";
const KIMI_MODEL = process.env.KIMI_MODEL || "moonshot-v1-32k";

// 可用模型清单(对前端展示用,后端不强校验)
// 见 https://platform.moonshot.cn/docs/intro/pricing
export const AVAILABLE_MODELS = [
  { id: "moonshot-v1-8k",   label: "Moonshot v1 · 8K",   desc: "短简历最经济(~¥0.012/1k token)" },
  { id: "moonshot-v1-32k",  label: "Moonshot v1 · 32K",  desc: "默认 · 平衡速度与上下文(~¥0.024/1k)" },
  { id: "moonshot-v1-128k", label: "Moonshot v1 · 128K", desc: "超长简历或合并多份(~¥0.060/1k)" },
  { id: "kimi-latest",      label: "Kimi Latest (auto)",  desc: "自动路由,支持视觉" },
  { id: "moonshot-v1-auto", label: "Moonshot Auto",       desc: "按 token 数自动选 8k/32k/128k" },
];

// 让 LLM 输出严格对齐 Candidate schema 的 JSON
// 字段映射 server/prisma/schema.prisma 的 Candidate 模型
const SYSTEM_PROMPT = `你是 MESA Recruit 的简历解析助手。
读取附件简历内容,输出严格的 JSON(不要有任何额外文字,不要 markdown 代码块包裹)。

JSON 字段要求(中文值优先,无信息时用 null 或空数组):
{
  "name": "候选人姓名(字符串,必填)",
  "gender": "male | female | unknown",
  "age": 年龄(整数 0-120,可空),
  "education": "学历(最高学历:博士|硕士|本科|大专|高中|其他)",
  "school": "毕业院校(最高学历对应的)",
  "major": "专业",
  "location": "现居城市(如:上海·浦东、北京·海淀)",
  "yearsExp": 工作年限(整数,可空),
  "phone": "电话号码(原样保留分隔符)",
  "email": "邮箱",
  "appliedFor": "应聘岗位(如简历明确写,否则推断或留空字符串)",
  "jdMatch": 0-100 的 JD 匹配度估计(无 JD 时按综合能力评分,整数),
  "tags": ["3-6 个标签", "技能/经历亮点关键词"],
  "skills": ["按要点列出核心技能 / 经验 / 证书,每条短句"],
  "risks": ["潜在风险点(如频繁跳槽、空档期、行业不匹配),无则空数组"],
  "highlights": ["亮点(头部公司、稀缺经验、专利、论文等)"],
  "experience": [
    { "period": "2023.1 – 至今", "company": "公司全称", "title": "职位", "summary": "1-2 句要点" }
  ],
  "educationHistory": [
    { "period": "2018.9 – 2022.6", "school": "学校", "major": "专业", "degree": "本科/硕士/博士" }
  ]
}

约束:
- 必须返回合法 JSON(顶层是对象,不是数组)
- 不要回复解释、不要 markdown 包裹、不要在 JSON 前后加任何文本
- 字段缺失时用 null / "" / [] 而非省略 key
- experience / educationHistory 按时间倒序`;

async function kimiRequest(path, options = {}) {
  if (!process.env.KIMI_API_KEY || process.env.KIMI_API_KEY.startsWith("__")) {
    throw Object.assign(new Error("KIMI_API_KEY not configured"), { statusCode: 503, code: "kimi_not_configured" });
  }
  const url = `${KIMI_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.KIMI_API_KEY}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw Object.assign(new Error(`kimi ${path} ${res.status}: ${body.slice(0, 300)}`), { statusCode: 502, code: "kimi_upstream_error" });
  }
  return res;
}

export async function uploadFile({ buffer, filename, contentType = "application/octet-stream" }) {
  const form = new FormData();
  // Kimi 用 purpose=file-extract,服务端会自动提取文本
  form.append("purpose", "file-extract");
  form.append("file", new Blob([buffer], { type: contentType }), filename);

  const res = await kimiRequest("/files", { method: "POST", body: form });
  const data = await res.json();
  return data; // { id, object, bytes, created_at, filename, purpose, status, status_details }
}

export async function getFileContent(fileId) {
  // Kimi 返回上传文件的提取后纯文本
  const res = await kimiRequest(`/files/${fileId}/content`);
  return res.text();
}

export async function parseResume({ buffer, filename, contentType, model }) {
  // 1) 上传文件让 Kimi 提取文本
  const file = await uploadFile({ buffer, filename, contentType });

  // 2) 拿提取后的文本作为 system 消息附件
  const extractedText = await getFileContent(file.id);

  // 3) 调 chat 让 Kimi 输出 JSON(model 可由调用方指定,否则用 env 默认)
  const useModel = (model && model.startsWith("moonshot") || model === "kimi-latest") ? model : KIMI_MODEL;
  const chatRes = await kimiRequest("/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: useModel,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "system", content: `以下是简历原文(可能含 OCR 噪音):\n\n${extractedText}` },
        { role: "user", content: "请按上述 JSON Schema 输出。" },
      ],
    }),
  });
  const completion = await chatRes.json();

  const raw = completion?.choices?.[0]?.message?.content || "";
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 兜底:剥离可能的 markdown 包裹
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw Object.assign(new Error("kimi returned non-JSON content"), { statusCode: 502, code: "kimi_parse_error" });
    parsed = JSON.parse(match[0]);
  }

  return {
    parsed,
    meta: {
      fileId: file.id,
      model: completion.model,
      usage: completion.usage,
      bytesProcessed: file.bytes,
    },
  };
}

export function isKimiConfigured() {
  return !!process.env.KIMI_API_KEY && !process.env.KIMI_API_KEY.startsWith("__");
}
