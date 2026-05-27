// 面试评价模板 v1 — 单源真理 (Single Source of Truth)
//
// 这里固化:
//   1. 模板 xlsx 文件位置 + SHA-256 hash (启动时校验,被改过就报警)
//   2. 7 个评分维度(key/name/weight/observation) — 与 Excel 模板 B10:C16/D10:D16 完全对齐
//   3. 字段到 Excel 单元格的映射(填充用)
//   4. 评分标准 (§2.6 文档表) — 公开页抽屉数据源
//   5. 计算函数: weightedScore / totalScore / recommendation
//   6. sanitizeForExcel / safeFilename — 公式注入防护 + 文件名安全化
//
// 任何字段/单元格映射变更必须 bump TEMPLATE_VERSION 并补新模板文件。

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── 模板文件 ─────────────────────────────────────────────────────
export const TEMPLATE_VERSION = "v1";
export const TEMPLATE_PATH = join(__dirname, "..", "..", "assets", "templates", "interview-evaluation-v1.xlsx");
export const TEMPLATE_EXPECTED_HASH = "02bf31db8256a8f0af7369887eda8aa978be1867eb9b41c1699bf6f4e645c534";

let _cachedBuffer = null;
let _cachedHash = null;

export function loadTemplateBuffer() {
  if (_cachedBuffer) return _cachedBuffer;
  if (!existsSync(TEMPLATE_PATH)) {
    throw new Error(`interview eval template missing: ${TEMPLATE_PATH}`);
  }
  _cachedBuffer = readFileSync(TEMPLATE_PATH);
  _cachedHash = createHash("sha256").update(_cachedBuffer).digest("hex");
  return _cachedBuffer;
}

export function getTemplateHash() {
  if (!_cachedHash) loadTemplateBuffer();
  return _cachedHash;
}

// 启动时调用一次,hash 不一致就抛错(让运维知道模板被改过)
export function verifyTemplateOnBoot() {
  const buf = loadTemplateBuffer();
  const hash = createHash("sha256").update(buf).digest("hex");
  if (hash !== TEMPLATE_EXPECTED_HASH) {
    throw new Error(
      `interview eval template hash mismatch.\n` +
      `  expected: ${TEMPLATE_EXPECTED_HASH}\n` +
      `  actual:   ${hash}\n` +
      `  path:     ${TEMPLATE_PATH}\n` +
      `如果是有意更新模板,请 bump TEMPLATE_VERSION + 更新 TEMPLATE_EXPECTED_HASH`
    );
  }
  return hash;
}

// ─── 评分维度定义 ─────────────────────────────────────────────────
// key 顺序 = Excel 行顺序 (E10..E16 / G10..G16)
export const SCORE_DIMENSIONS = [
  {
    key: "communication",
    name: "沟通表达",
    weight: 15,
    observation: "表达是否清晰、有条理；是否能准确理解问题并回应重点",
    scoreCell: "E10",
    remarkCell: "G10",
    weightCell: "D10",
    weightedCell: "F10",
  },
  {
    key: "role_match",
    name: "岗位匹配度",
    weight: 20,
    observation: "过往经历、能力结构与目标岗位要求的匹配程度",
    scoreCell: "E11",
    remarkCell: "G11",
    weightCell: "D11",
    weightedCell: "F11",
  },
  {
    key: "professional",
    name: "专业基础/业务理解",
    weight: 20,
    observation: "是否具备岗位所需基础知识、业务理解和案例支撑",
    scoreCell: "E12",
    remarkCell: "G12",
    weightCell: "D12",
    weightedCell: "F12",
  },
  {
    key: "learning",
    name: "学习与适应能力",
    weight: 15,
    observation: "面对新环境、新业务、跨文化协作时的学习和调整能力",
    scoreCell: "E13",
    remarkCell: "G13",
    weightCell: "D13",
    weightedCell: "F13",
  },
  {
    key: "execution",
    name: "责任心与执行力",
    weight: 15,
    observation: "是否有结果意识、推进意识，能把事情落地",
    scoreCell: "E14",
    remarkCell: "G14",
    weightCell: "D14",
    weightedCell: "F14",
  },
  {
    key: "stability",
    name: "稳定性与求职动机",
    weight: 10,
    observation: "离职原因、加入动机、长期发展意愿是否清晰稳定",
    scoreCell: "E15",
    remarkCell: "G15",
    weightCell: "D15",
    weightedCell: "F15",
  },
  {
    key: "culture",
    name: "文化契合与团队协作",
    weight: 5,
    observation: "是否尊重协作、开放沟通，能适应团队与组织方式",
    scoreCell: "E16",
    remarkCell: "G16",
    weightCell: "D16",
    weightedCell: "F16",
  },
];

// 候选人信息 9 字段 → Excel 单元格(均落合并块左上角)
export const INFO_FIELDS = [
  { key: "candidateName",         cell: "B4", label: "姓名",                  required: true  },
  { key: "position",              cell: "D4", label: "应聘岗位",              required: true  },
  { key: "region",                cell: "G4", label: "属地国家/地区",         required: false },
  { key: "interviewDate",         cell: "B5", label: "面试日期",              required: true  , type: "date" },
  { key: "interviewer",           cell: "D5", label: "面试官",                required: true  },
  { key: "languageStrength",      cell: "G5", label: "语言/沟通优势",         required: false },
  { key: "currentCity",           cell: "B6", label: "当前城市",              required: false },
  { key: "department",            cell: "D6", label: "应聘部门",              required: false },
  { key: "timezoneCollaboration", cell: "G6", label: "是否接受跨时区协作",     required: false },
];

// 纪要 4 字段 → 合并块左上角
export const SUMMARY_FIELDS = [
  { key: "strengths",         cell: "B20", label: "优势亮点",        required: false, maxLen: 500 },
  { key: "risks",             cell: "B22", label: "主要风险",        required: false, maxLen: 500 },
  { key: "followUpQuestions", cell: "B24", label: "建议追问/复试方向", required: false, maxLen: 500 },
  { key: "finalOpinion",      cell: "B26", label: "最终意见",        required: true,  maxLen: 500 },
];

// 评分标准 (§2.6) — 公开页抽屉用,与 Excel 评分标准 Sheet 内容一致
export const SCORING_RUBRIC = [
  {
    dimension: "沟通表达",
    definition: "表达逻辑、重点提炼、倾听反馈",
    levels: [
      { range: "9-10", desc: "回答结构清晰，重点明确，能举出有效实例并回应追问" },
      { range: "7-8",  desc: "表达较清楚，偶有冗长，但能说明核心信息" },
      { range: "5-6",  desc: "表达基本能理解，但逻辑性和重点性一般" },
      { range: "1-4",  desc: "表达混乱，难以说明问题，追问后仍不清楚" },
    ],
  },
  {
    dimension: "岗位匹配度",
    definition: "经历与岗位要求的相关性、可迁移性",
    levels: [
      { range: "9-10", desc: "核心经历高度贴合岗位，可快速上手并产出" },
      { range: "7-8",  desc: "大部分经历相关，经过短期磨合可胜任" },
      { range: "5-6",  desc: "部分相关，需要较多培训或适配" },
      { range: "1-4",  desc: "匹配度低，关键经历或能力明显不足" },
    ],
  },
  {
    dimension: "专业基础/业务理解",
    definition: "专业知识、业务认知、方法论",
    levels: [
      { range: "9-10", desc: "专业基础扎实，能结合案例说明做法与结果" },
      { range: "7-8",  desc: "基础较好，能覆盖岗位主要要求" },
      { range: "5-6",  desc: "基础一般，对关键知识理解不够深入" },
      { range: "1-4",  desc: "基础薄弱，回答停留在表面或明显错误" },
    ],
  },
  {
    dimension: "学习与适应能力",
    definition: "学习速度、适应新环境、跨文化协作",
    levels: [
      { range: "9-10", desc: "学习快，适应强，能主动补位并快速融入新场景" },
      { range: "7-8",  desc: "能较好适应变化，遇到新问题愿意学习" },
      { range: "5-6",  desc: "适应速度一般，需要更多引导" },
      { range: "1-4",  desc: "对变化抗拒明显，适应与学习意愿偏弱" },
    ],
  },
  {
    dimension: "责任心与执行力",
    definition: "结果导向、推进能力、闭环意识",
    levels: [
      { range: "9-10", desc: "目标意识强，能主动推进并对结果负责" },
      { range: "7-8",  desc: "执行较稳，能完成既定任务并及时反馈" },
      { range: "5-6",  desc: "执行基本可接受，但主动性和闭环意识一般" },
      { range: "1-4",  desc: "执行推动弱，责任边界不清，容易失约或失控" },
    ],
  },
  {
    dimension: "稳定性与求职动机",
    definition: "离职原因、加入动机、发展规划",
    levels: [
      { range: "9-10", desc: "动机清晰真实，职业规划稳定，风险低" },
      { range: "7-8",  desc: "动机较明确，整体稳定性较好" },
      { range: "5-6",  desc: "动机一般，存在一定不确定性" },
      { range: "1-4",  desc: "动机不清、变动频繁或稳定性风险明显" },
    ],
  },
  {
    dimension: "文化契合与团队协作",
    definition: "尊重他人、协作方式、价值观取向",
    levels: [
      { range: "9-10", desc: "合作意识强，尊重规则，能建设性处理分歧" },
      { range: "7-8",  desc: "团队协作较好，沟通开放" },
      { range: "5-6",  desc: "可以合作，但协作意识较弱" },
      { range: "1-4",  desc: "协作意愿弱，价值取向或行为方式存在明显风险" },
    ],
  },
];

// ─── 计算函数 (与 Excel 公式 1:1 对应) ────────────────────────────
export function weightedScore(weight, score) {
  if (score == null || score === "" || isNaN(score)) return null;
  return Math.round((weight * Number(score) / 10) * 10) / 10;  // ROUND(D*E/10, 1)
}

// scores: [{ key, score }] 任一 score 为空都返回 null (与 Excel COUNTA 一致)
// 文档定义: 提交时要求 7 项全填,这里仅做计算工具,不做必填校验
export function computeTotalScore(scores) {
  if (!Array.isArray(scores) || scores.length === 0) return null;
  const byKey = new Map(scores.map((s) => [s.key, s.score]));
  let sum = 0;
  let anyValid = false;
  for (const dim of SCORE_DIMENSIONS) {
    const sc = byKey.get(dim.key);
    if (sc == null || sc === "" || isNaN(sc)) continue;
    const w = weightedScore(dim.weight, sc);
    if (w != null) {
      sum += w;
      anyValid = true;
    }
  }
  if (!anyValid) return null;
  return Math.round(sum * 10) / 10;
}

export function recommendationFor(total) {
  if (total == null) return null;
  if (total >= 85) return "建议录用";
  if (total >= 75) return "建议复试";
  if (total >= 60) return "谨慎考虑";
  return "不建议录用";
}

// ─── 安全处理 ─────────────────────────────────────────────────────
// Excel 公式注入: 单元格首字符为 = + - @ tab cr lf 时被当公式
// 解法: 前缀单引号 → Excel 视为纯文本
export function sanitizeForExcel(v) {
  if (v == null) return null;
  const s = String(v);
  if (s.length === 0) return s;
  if (/^[=+\-@\t\r\n]/.test(s)) return "'" + s;
  return s;
}

// 文件名(候选人姓名/岗位等用户输入)安全化 — 防止路径穿越 / Windows 不合法字符
export function safeFilename(s) {
  return String(s || "未命名")
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
    .replace(/\.+$/, "")
    .slice(0, 80) || "未命名";
}

// 评分单项校验: 1-10 整数
export function isValidScore(v) {
  if (v == null || v === "") return false;
  const n = Number(v);
  if (!Number.isInteger(n)) return false;
  return n >= 1 && n <= 10;
}
