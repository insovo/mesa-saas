// 绩效评价 → xlsx 导出器（四语种模板）
// 公式列 G11:G15 / D17 / G18 / G19 / G20 / C29 完全不动

import ExcelJS from "exceljs";
import {
  loadTemplateBuffer,
  PRIMARY_SHEET_NAME,
  INFO_FIELDS,
  SCORE_DIMENSIONS,
  SUMMARY_FIELDS,
  sanitizeForExcel,
  safeFilename,
  LANG_LABELS,
  AUTHORITATIVE_LANG,
  EXPORT_LANGS,
} from "./performanceEvalTemplate.js";

function setCell(ws, address, value) {
  if (value == null || value === "") return;
  const cell = ws.getCell(address);
  cell.value = sanitizeForExcel(value);
}

function formatDate(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

/**
 * @param {object} evaluation Prisma PerformanceEvaluation
 * @param {string} lang zh|zh-en|zh-es|en
 */
export async function renderPerformanceToXlsx(evaluation, lang = AUTHORITATIVE_LANG) {
  if (!EXPORT_LANGS.includes(lang)) {
    throw Object.assign(new Error(`unsupported export lang: ${lang}`), {
      statusCode: 400,
      code: "invalid_lang",
    });
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(loadTemplateBuffer(lang));

  const sheetName = PRIMARY_SHEET_NAME[lang];
  const ws = wb.getWorksheet(sheetName);
  if (!ws) throw new Error(`template missing sheet: ${sheetName}`);

  const infoValues = {
    employeeName: evaluation.employeeName,
    position: evaluation.position,
    employeeNo: evaluation.employeeNo,
    lineManager: evaluation.lineManager,
    department: evaluation.department,
    level: evaluation.level,
    reviewPeriod: evaluation.reviewPeriod,
    evalDate: formatDate(evaluation.evalDate),
  };
  for (const f of INFO_FIELDS) {
    setCell(ws, f.cell, infoValues[f.key]);
  }

  // 权重若自定义且与默认不同，写入 D 列（黄格允许）；否则保留模板默认
  const scoresByKey = new Map((evaluation.scores || []).map((s) => [s.key, s]));
  for (const dim of SCORE_DIMENSIONS) {
    const item = scoresByKey.get(dim.key) || {};
    if (item.weight != null && Number(item.weight) !== dim.weight) {
      ws.getCell(dim.weightCell).value = Number(item.weight);
    }
    if (item.selfScore != null && item.selfScore !== "") {
      const n = Number(item.selfScore);
      if (Number.isFinite(n)) ws.getCell(dim.selfScoreCell).value = n;
    }
    if (item.managerScore != null && item.managerScore !== "") {
      const n = Number(item.managerScore);
      if (Number.isFinite(n)) ws.getCell(dim.managerScoreCell).value = n;
    }
    if (item.evidence) {
      setCell(ws, dim.evidenceCell, item.evidence);
    }
  }

  const summaryValues = {
    achievements: evaluation.achievements,
    developmentPlan: evaluation.developmentPlan,
    nextGoals: evaluation.nextGoals,
  };
  for (const f of SUMMARY_FIELDS) {
    const v = summaryValues[f.key];
    if (v != null && v !== "") {
      setCell(ws, f.cell, v);
    } else {
      ws.getCell(f.cell).value = null;
    }
  }

  const buffer = await wb.xlsx.writeBuffer();

  const dateStr = (() => {
    const d = evaluation.evalDate ? new Date(evaluation.evalDate) : new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const langTag = LANG_LABELS[lang] || lang;
  const filename = `属地员工绩效评价表_${langTag}_${safeFilename(evaluation.employeeName)}_${safeFilename(evaluation.reviewPeriod || "周期")}_${dateStr}.xlsx`;

  return { buffer: Buffer.from(buffer), filename };
}

export function attachmentHeaderForFilename(filename) {
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
