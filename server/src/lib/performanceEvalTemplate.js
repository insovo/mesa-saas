// 绩效评价模板 v1 — 单源真理
// 金样: server/assets/templates/performance-evaluation-*-v1.xlsx
// 主表单元格映射与桌面「属地员工绩效评价表」一致。

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "..", "..", "assets", "templates");

export const TEMPLATE_VERSION = "v1";

/** @typedef {'zh'|'zh-en'|'zh-es'|'en'} PerfLang */

export const EXPORT_LANGS = Object.freeze(["zh", "zh-en", "zh-es", "en"]);

export const TEMPLATE_FILES = Object.freeze({
  zh: "performance-evaluation-zh-v1.xlsx",
  "zh-en": "performance-evaluation-zh-en-v1.xlsx",
  "zh-es": "performance-evaluation-zh-es-v1.xlsx",
  en: "performance-evaluation-en-v1.xlsx",
});

// 主 sheet 名称 — ExcelJS getWorksheet 用
export const PRIMARY_SHEET_NAME = Object.freeze({
  zh: "绩效评分表",
  "zh-en": "绩效评分表 Evaluation",
  "zh-es": "绩效评分表 Evaluación",
  en: "Evaluation",
});

// SHA-256 — 启动校验。有意更新模板时同步改这里。
export const TEMPLATE_EXPECTED_HASHES = Object.freeze({
  zh: "f963250909b692dc4eb59bdbe0a11304cfdfe84109c8f9a69756954c83c9a5f1",
  "zh-en": "9a5299c705485a99abeb5f901ce65f6b8cda62092764dd652d957aef63ddd00c",
  "zh-es": "eacb6ac60babb7944bc2fcc8e9071f635777125d8d75a610fb3f5fb4dd9cdded",
  en: "2b6fd11ec170139587ade6ab69c4e082b7f427410bbc8225176a3a1c4431be6e",
});

// 权威版本号以中英双语金样为准
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

// ─── 5 评价维度 (行 11–15) ───────────────────────────────────────
export const SCORE_DIMENSIONS = [
  {
    key: "goals",
    name: "业绩与目标达成",
    nameEn: "Performance & goal achievement",
    weight: 30,
    observation: "关键任务/目标的完成度与结果（可参考部门KPI库）",
    row: 11,
    weightCell: "D11",
    selfScoreCell: "E11",
    managerScoreCell: "F11",
    weightedCell: "G11",
    evidenceCell: "H11",
  },
  {
    key: "culture",
    name: "文化认同与沟通协作",
    nameEn: "Cultural alignment, communication & collaboration",
    weight: 30,
    observation: "企业文化认同、沟通协作、知识共享",
    row: 12,
    weightCell: "D12",
    selfScoreCell: "E12",
    managerScoreCell: "F12",
    weightedCell: "G12",
    evidenceCell: "H12",
  },
  {
    key: "quality",
    name: "工作质量与专业能力",
    nameEn: "Work quality & professional competence",
    weight: 20,
    observation: "专业深度、方案质量、缺陷/返工率、技术文档",
    row: 13,
    weightCell: "D13",
    selfScoreCell: "E13",
    managerScoreCell: "F13",
    weightedCell: "G13",
    evidenceCell: "H13",
  },
  {
    key: "compliance",
    name: "合规·安全·数据保护",
    nameEn: "Compliance, safety & data protection",
    weight: 10,
    observation: "流程/法规遵从、功能与试验安全、GDPR与信息安全",
    row: 14,
    weightCell: "D14",
    selfScoreCell: "E14",
    managerScoreCell: "F14",
    weightedCell: "G14",
    evidenceCell: "H14",
  },
  {
    key: "innovation",
    name: "创新与持续改进",
    nameEn: "Innovation & continuous improvement",
    weight: 10,
    observation: "改进提案、复用、效率提升、专利与方法沉淀",
    row: 15,
    weightCell: "D15",
    selfScoreCell: "E15",
    managerScoreCell: "F15",
    weightedCell: "G15",
    evidenceCell: "H15",
  },
];

// 被评价人信息 → 单元格 (合并块左上角)
export const INFO_FIELDS = [
  { key: "employeeName", cell: "B5", label: "姓名 / Name", required: true },
  { key: "position", cell: "E5", label: "岗位 / Position", required: false },
  { key: "employeeNo", cell: "B6", label: "工号 / ID", required: false },
  { key: "lineManager", cell: "E6", label: "直属主管 / Line Manager", required: false },
  { key: "department", cell: "B7", label: "部门 / Department", required: false },
  { key: "level", cell: "E7", label: "职级 / Level", required: false },
  { key: "reviewPeriod", cell: "B8", label: "评价周期 / Review Period", required: true },
  { key: "evalDate", cell: "E8", label: "评价日期 / Date", required: false, type: "date" },
];

export const SUMMARY_FIELDS = [
  { key: "achievements", cell: "C23", label: "本期主要成果 / Key achievements", maxLen: 2000 },
  { key: "developmentPlan", cell: "C24", label: "改进与发展计划 / Improvement & development", maxLen: 2000 },
  { key: "nextGoals", cell: "C25", label: "下一周期目标 / Next-period goals", maxLen: 2000 },
];

// 公开页评分标准抽屉 (1–100 锚点,与 Criteria sheet 一致)
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

/** 对齐模板 A28 — 四、结果应用说明 */
export const USE_OF_RESULTS_BLURB =
  "C及以上：发展、晋升参考与变动薪酬（按适用集体协议）。  D/E：启动绩效改进计划（PIP，60–90天），提供支持并留痕；结果不自动导致解雇，合同终止须依西班牙法律单独程序。\n" +
  "C or above: development, promotion input and variable pay (per the applicable collective agreement).  D/E: a Performance Improvement Plan (PIP, 60–90 days) is launched, with support and documentation; results do not imply automatic dismissal — any termination follows a separate procedure under Spanish law.";

/** 对齐模板 A32 — 五、确认与签字免责声明 */
export const ACKNOWLEDGEMENT_BLURB =
  "员工有权阅读评价、提出书面意见并申诉（见制度文件）。签字表示已知悉，不代表必然同意评价内容。\n" +
  "The employee has the right to read the evaluation, submit written comments and appeal (see the policy document). Signing acknowledges receipt, not necessarily agreement with the content.";

/** 签字图在 Excel 中的锚点（0-based，行 33 = Excel 第 34 行） */
export const SIGNATURE_IMAGE_ANCHORS = {
  self: { tl: { col: 0, row: 33 }, br: { col: 3, row: 34 } }, // A34:C34
  manager: { tl: { col: 3, row: 33 }, br: { col: 6, row: 34 } }, // D34:F34
  hr: { tl: { col: 6, row: 33 }, br: { col: 8, row: 34 } }, // G34:H34
};

export const SIGNATURE_DATE_CELLS = {
  self: "B35",
  manager: "E35",
  hr: "H35",
};

export const PERF_SIGNATURE_PREFIX = "performance-signatures/";
export const PERF_SIGNATURE_MAX_BYTES = 1 * 1024 * 1024;

/** 加权单项: ROUND(weight * score / 100, 1) — 镜像 Excel G11 公式 */
export function weightedItem(weight, score) {
  if (score == null || score === "" || Number.isNaN(Number(score))) return null;
  return Math.round(((Number(weight) * Number(score)) / 100) * 10) / 10;
}

/**
 * 主管加权总分 = SUM(weight_i * managerScore_i / 100)，需 5 项全填才返回（与 COUNT(F11:F15)<5 一致）
 * scores: [{ key, weight?, managerScore }]
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
 * 自评参考总分 = SUMPRODUCT(weights, selfScores)/100，需 5 项全填
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

/** 等级标签（中英双语，贴近 Excel G20） */
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
  // 允许整数或一位小数，范围 1–100
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
  zh: "中文",
  "zh-en": "中英双语",
  "zh-es": "中西双语",
  en: "英文",
});

export const PERF_SOURCE = "绩效评价新建";
export const HIRED_STAGES = Object.freeze([
  "入职准备",
  "入职当天",
  "试用期",
  "已转正",
  "延期试用",
]);
