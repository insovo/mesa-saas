// 绩效评价模板 v2 — 单源真理
// 金样: server/assets/templates/performance-evaluation-zh-en-v2.xlsx
// 对齐桌面「属地人员月度绩效评价表」(修权重/公式后入库)

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "..", "..", "assets", "templates");

export const TEMPLATE_VERSION = "v2";

/** @typedef {'zh-en'} PerfLang */

export const EXPORT_LANGS = Object.freeze(["zh-en"]);

export const TEMPLATE_FILES = Object.freeze({
  "zh-en": "performance-evaluation-zh-en-v2.xlsx",
});

export const PRIMARY_SHEET_NAME = Object.freeze({
  "zh-en": "绩效评分表 Evaluation",
});

// SHA-256 — 启动校验。有意更新模板时同步改这里。
export const TEMPLATE_EXPECTED_HASHES = Object.freeze({
  "zh-en": "54196a5fb78eba6a127edff8d1db762934d8e20cd7002460167ebfd1a1249ea8",
});

export const AUTHORITATIVE_LANG = "zh-en";

const _cache = new Map(); // lang → { buffer, hash }

export function templatePath(lang) {
  const file = TEMPLATE_FILES[lang];
  if (!file) throw new Error(`unknown performance export lang: ${lang}`);
  return join(TEMPLATES_DIR, file);
}

export function loadTemplateBuffer(lang = AUTHORITATIVE_LANG) {
  if (_cache.has(lang)) return _cache.get(lang).buffer;
  const path = templatePath(lang);
  if (!existsSync(path)) {
    throw new Error(`performance eval template missing: ${path}`);
  }
  const buffer = readFileSync(path);
  const hash = createHash("sha256").update(buffer).digest("hex");
  _cache.set(lang, { buffer, hash });
  return buffer;
}

export function getTemplateHash(lang = AUTHORITATIVE_LANG) {
  if (!_cache.has(lang)) loadTemplateBuffer(lang);
  return _cache.get(lang).hash;
}

export function verifyPerformanceTemplatesOnBoot() {
  const results = {};
  for (const lang of EXPORT_LANGS) {
    const buf = loadTemplateBuffer(lang);
    const hash = createHash("sha256").update(buf).digest("hex");
    const expected = TEMPLATE_EXPECTED_HASHES[lang];
    if (hash !== expected) {
      throw new Error(
        `performance eval template hash mismatch (${lang}).\n` +
          `  expected: ${expected}\n` +
          `  actual:   ${hash}\n` +
          `  path:     ${templatePath(lang)}\n` +
          `若有意更新模板,请同步改 TEMPLATE_EXPECTED_HASHES`
      );
    }
    results[lang] = hash;
  }
  return results;
}

// ─── 7 评价行 (行 11–17) ───────────────────────────────────────
// 前 4 行共用维度「业绩与目标达成」，C 列区分 4P 模块
export const SCORE_DIMENSIONS = [
  {
    key: "goals_product",
    group: "goals",
    name: "业绩与目标达成",
    nameEn: "Performance & goal achievement",
    subtitle: "4P（产品）",
    weight: 20,
    observation:
      "关键任务/目标的完成度与结果（可参考部门KPI库）研究院长制定 可从4P（产品）模块制定",
    row: 11,
    weightCell: "D11",
    selfScoreCell: "E11",
    managerScoreCell: "F11",
    weightedCell: "G11",
    evidenceCell: "H11",
  },
  {
    key: "goals_adapt",
    group: "goals",
    name: "业绩与目标达成",
    nameEn: "Performance & goal achievement",
    subtitle: "4P（适应性验证）",
    weight: 20,
    observation:
      "关键任务/目标的完成度与结果（可参考部门KPI库）研究院长制定 可从4P（适应性验证）模块制定",
    row: 12,
    weightCell: "D12",
    selfScoreCell: "E12",
    managerScoreCell: "F12",
    weightedCell: "G12",
    evidenceCell: "H12",
  },
  {
    key: "goals_reg",
    group: "goals",
    name: "业绩与目标达成",
    nameEn: "Performance & goal achievement",
    subtitle: "4P（法规认证）",
    weight: 20,
    observation:
      "关键任务/目标的完成度与结果（可参考部门KPI库）研究院长制定 可从4P（法规认证）模块制定",
    row: 13,
    weightCell: "D13",
    selfScoreCell: "E13",
    managerScoreCell: "F13",
    weightedCell: "G13",
    evidenceCell: "H13",
  },
  {
    key: "goals_localize",
    group: "goals",
    name: "业绩与目标达成",
    nameEn: "Performance & goal achievement",
    subtitle: "4P（地产化）",
    weight: 20,
    observation:
      "关键任务/目标的完成度与结果（可参考部门KPI库）研究院长制定 可从4P(地产化)模块制定",
    row: 14,
    weightCell: "D14",
    selfScoreCell: "E14",
    managerScoreCell: "F14",
    weightedCell: "G14",
    evidenceCell: "H14",
  },
  {
    key: "culture",
    group: null,
    name: "文化认同与沟通协作（员工）/属地团队建设（专业负责人）",
    nameEn:
      "Cultural alignment, communication (Employee) & collaboration / Local Team Development (Lead)",
    subtitle: null,
    weight: 10,
    observation: "企业文化认同、沟通协作、知识共享",
    row: 15,
    weightCell: "D15",
    selfScoreCell: "E15",
    managerScoreCell: "F15",
    weightedCell: "G15",
    evidenceCell: "H15",
  },
  {
    key: "local_capability",
    group: null,
    name: "海外属地能力体系建设",
    nameEn: "Local Capability Development Framework",
    subtitle: null,
    weight: 5,
    observation: "专业深度、方案质量、缺陷/返工率、技术文档",
    row: 16,
    weightCell: "D16",
    selfScoreCell: "E16",
    managerScoreCell: "F16",
    weightedCell: "G16",
    evidenceCell: "H16",
  },
  {
    key: "compliance",
    group: null,
    name: "合规·安全·数据保护",
    nameEn: "Compliance, safety & data protection",
    subtitle: null,
    weight: 5,
    observation: "流程/法规遵从、功能与试验安全、GDPR与信息安全",
    row: 17,
    weightCell: "D17",
    selfScoreCell: "E17",
    managerScoreCell: "F17",
    weightedCell: "G17",
    evidenceCell: "H17",
  },
];

export const REQUIRED_SCORE_COUNT = SCORE_DIMENSIONS.length;

// 被评价人信息 → 填写格（标签在 A/D 合并区，值在 C / G）
export const INFO_FIELDS = [
  { key: "employeeName", cell: "C5", label: "姓名 / Name", required: true },
  { key: "position", cell: "G5", label: "岗位 / Position", required: false },
  { key: "employeeNo", cell: "C6", label: "工号 / ID", required: false },
  { key: "lineManager", cell: "G6", label: "直属主管 / Line Manager", required: false },
  { key: "department", cell: "C7", label: "部门 / Department", required: false },
  { key: "level", cell: "G7", label: "职级 / Level", required: false },
  { key: "reviewPeriod", cell: "C8", label: "评价周期 / Review Period", required: true },
  { key: "evalDate", cell: "G8", label: "评价日期 / Date", required: false, type: "date" },
];

export const SUMMARY_FIELDS = [
  {
    key: "areasForImprovement",
    cell: "C24",
    label: "不足及待提升部分 / Areas for Improvement",
    maxLen: 2000,
  },
  {
    key: "developmentPlan",
    cell: "C25",
    label: "改进与发展计划 / Improvement & development",
    maxLen: 2000,
  },
];

export const SCORING_RUBRIC = [
  {
    range: "90–100",
    level: "A 优秀 / Excellent",
    desc: "持续大幅超目标 · 标杆级质量 · 完全自驱并带动他人 · 影响跨部门/公司级",
  },
  {
    range: "80–89",
    level: "B 良好 / Good",
    desc: "达成并部分超出 · 高质量少返工 · 独立完成 · 影响团队",
  },
  {
    range: "60–79",
    level: "C 胜任 / Competent",
    desc: "基本达成目标 · 质量达标 · 常规需引导 · 影响个人职责",
  },
  {
    range: "40–59",
    level: "D 待改进 / Needs improvement",
    desc: "部分达成有缺口 · 质量不稳 · 需较多督导 · 需他人补位",
  },
  {
    range: "<40",
    level: "E 不胜任 / Unsatisfactory",
    desc: "明显未达成 · 缺陷不可接受 · 无法独立 · 造成返工/风险",
  },
];

export const RATING_APPLICATION = [
  { rating: "A", range: "90–100", application: "重点激励、晋升候选 / Top incentives, promotion candidate" },
  { rating: "B", range: "80–89", application: "强激励、发展机会 / Strong incentives, development" },
  { rating: "C", range: "60–79", application: "正常激励与发展 / Normal incentives and development" },
  { rating: "D", range: "40–59", application: "绩效改进计划 PIP / Performance Improvement Plan" },
  { rating: "E", range: "<40", application: "PIP+密切跟进 / PIP + close follow-up" },
];

/** 对齐模板 A28 — 四、确认与签字免责声明 */
export const ACKNOWLEDGEMENT_BLURB =
  "员工有权阅读评价、提出书面意见并申诉（见制度文件）。签字表示已知悉，不代表必然同意评价内容。\n" +
  "The employee has the right to read the evaluation, submit written comments and appeal (see the policy document). Signing acknowledges receipt, not necessarily agreement with the content.";

/** 签字图锚点（0-based；Excel 第 30 行 = row 29） */
export const SIGNATURE_IMAGE_ANCHORS = {
  self: { tl: { col: 0, row: 29 }, br: { col: 3, row: 30 } }, // A30:C30
  manager: { tl: { col: 3, row: 29 }, br: { col: 6, row: 30 } }, // D30:F30
  hr: { tl: { col: 6, row: 29 }, br: { col: 8, row: 30 } }, // G30:H30
};

export const SIGNATURE_DATE_CELLS = {
  self: "A31",
  manager: "D31",
  hr: "G31",
};

export const PERF_SIGNATURE_PREFIX = "performance-signatures/";
export const PERF_SIGNATURE_MAX_BYTES = 1 * 1024 * 1024;

/** 加权单项: ROUND(weight * score / 100, 1) — 镜像 Excel G 列公式 */
export function weightedItem(weight, score) {
  if (score == null || score === "" || Number.isNaN(Number(score))) return null;
  return Math.round(((Number(weight) * Number(score)) / 100) * 10) / 10;
}

/**
 * 主管加权总分 = SUM(weight_i * managerScore_i / 100)，需 7 项全填
 */
export function computeManagerTotal(scores) {
  if (!Array.isArray(scores) || scores.length === 0) return null;
  const byKey = new Map(scores.map((s) => [s.key, s]));
  let sum = 0;
  for (const dim of SCORE_DIMENSIONS) {
    const item = byKey.get(dim.key);
    const sc = item?.managerScore;
    if (sc == null || sc === "" || Number.isNaN(Number(sc))) return null;
    const w = item?.weight ?? dim.weight;
    const wi = weightedItem(w, sc);
    if (wi == null) return null;
    sum += wi;
  }
  return Math.round(sum * 10) / 10;
}

/**
 * 自评参考总分 = SUMPRODUCT(weights, selfScores)/100，需 7 项全填
 */
export function computeSelfTotal(scores) {
  if (!Array.isArray(scores) || scores.length === 0) return null;
  const byKey = new Map(scores.map((s) => [s.key, s]));
  let sum = 0;
  for (const dim of SCORE_DIMENSIONS) {
    const item = byKey.get(dim.key);
    const sc = item?.selfScore;
    if (sc == null || sc === "" || Number.isNaN(Number(sc))) return null;
    const w = Number(item?.weight ?? dim.weight);
    sum += (w * Number(sc)) / 100;
  }
  return Math.round(sum * 10) / 10;
}

export function ratingFor(total) {
  if (total == null) return null;
  if (total >= 90) return "A 优秀/Excellent";
  if (total >= 80) return "B 良好/Good";
  if (total >= 60) return "C 胜任/Competent";
  if (total >= 40) return "D 待改进/Needs improvement";
  return "E 不胜任/Unsatisfactory";
}

export function pipTriggeredFor(total) {
  if (total == null) return null;
  return total < 60;
}

export function defaultScoresPayload() {
  return SCORE_DIMENSIONS.map((d) => ({
    key: d.key,
    weight: d.weight,
    selfScore: null,
    managerScore: null,
    evidence: "",
  }));
}

export function isValidPerfScore(v) {
  if (v == null || v === "") return false;
  const n = Number(v);
  if (!Number.isFinite(n)) return false;
  if (n < 1 || n > 100) return false;
  return true;
}

export function sanitizeForExcel(v) {
  if (v == null) return null;
  const s = String(v);
  if (s.length === 0) return s;
  if (/^[=+\-@\t\r\n]/.test(s)) return "'" + s;
  return s;
}

export function safeFilename(s) {
  return String(s || "未命名")
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
    .replace(/\.+$/, "")
    .slice(0, 80) || "未命名";
}

export const LANG_LABELS = Object.freeze({
  "zh-en": "中英双语",
});

export const PERF_SOURCE = "绩效评价新建";
export const HIRED_STAGES = Object.freeze([
  "入职准备",
  "入职当天",
  "试用期",
  "已转正",
  "延期试用",
]);
