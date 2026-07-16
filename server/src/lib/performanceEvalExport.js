// 绩效评价 → xlsx 导出器（中英双语 v2 模板）
// 公式列 G11:G17 / D18 / G19 / G20 / G21 完全不动
// 签字图嵌入 A30:C30 / D30:F30 / G30:H30；日期写入 A31 / D31 / G31

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
  SIGNATURE_IMAGE_ANCHORS,
  SIGNATURE_DATE_CELLS,
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
 * @param {string} lang zh-en
 * @param {{ selfPng?: Buffer|null, managerPng?: Buffer|null, hrPng?: Buffer|null, hrSignedAt?: Date|string|null }} [images]
 */
export async function renderPerformanceToXlsx(evaluation, lang = AUTHORITATIVE_LANG, images = {}) {
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

  const scoresByKey = new Map((evaluation.scores || []).map((s) => [s.key, s]));
  for (const dim of SCORE_DIMENSIONS) {
    const item = scoresByKey.get(dim.key) || {};
    // D 列以金样为准，不覆盖权重
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
    areasForImprovement: evaluation.areasForImprovement,
    developmentPlan: evaluation.developmentPlan,
  };
  for (const f of SUMMARY_FIELDS) {
    const v = summaryValues[f.key];
    if (v != null && v !== "") {
      setCell(ws, f.cell, v);
    } else {
      ws.getCell(f.cell).value = null;
    }
  }

  await embedSignature(wb, ws, "self", images.selfPng, evaluation.selfSignedAt);
  await embedSignature(wb, ws, "manager", images.managerPng, evaluation.managerSignedAt);
  await embedSignature(wb, ws, "hr", images.hrPng, images.hrSignedAt || new Date());

  const buffer = await wb.xlsx.writeBuffer();

  const dateStr = (() => {
    const d = evaluation.evalDate ? new Date(evaluation.evalDate) : new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const langTag = LANG_LABELS[lang] || lang;
  const filename = `属地人员月度绩效评价表_${langTag}_${safeFilename(evaluation.employeeName)}_${safeFilename(evaluation.reviewPeriod || "周期")}_${dateStr}.xlsx`;

  return { buffer: Buffer.from(buffer), filename };
}

async function embedSignature(wb, ws, role, pngBuffer, signedAt) {
  if (!pngBuffer || !Buffer.isBuffer(pngBuffer) || pngBuffer.length === 0) return;
  const anchor = SIGNATURE_IMAGE_ANCHORS[role];
  if (!anchor) return;
  const imageId = wb.addImage({
    buffer: pngBuffer,
    extension: "png",
  });
  ws.addImage(imageId, {
    tl: { ...anchor.tl },
    br: { ...anchor.br },
    editAs: "oneCell",
  });
  const dateCell = SIGNATURE_DATE_CELLS[role];
  const formatted = formatDate(signedAt);
  if (dateCell && formatted) {
    const cell = ws.getCell(dateCell);
    const prev = cell.value;
    const label = typeof prev === "string" && prev.trim() ? prev.trim().replace(/\s*$/, "") : "日期 Date:";
    cell.value = sanitizeForExcel(`${label} ${formatted}`);
  }
}

export function attachmentHeaderForFilename(filename) {
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
