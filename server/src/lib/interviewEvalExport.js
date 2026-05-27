// 面试评价 → xlsx 导出器
//
// 流程:
//   1. ExcelJS 加载模板 buffer (不修改源文件)
//   2. 按 INFO_FIELDS / SCORE_DIMENSIONS / SUMMARY_FIELDS 写值
//   3. 公式列 F10:F17, G17 完全不动 — 模板原公式保留,打开端自动重算
//   4. 数据校验 / 合并单元格 / 列宽 / 行高 / freeze pane / 评分标准 Sheet — 全部由 ExcelJS load/save 自动保留
//   5. 返回 ArrayBuffer,路由层直接 reply.send

import ExcelJS from "exceljs";
import {
  loadTemplateBuffer,
  INFO_FIELDS,
  SCORE_DIMENSIONS,
  SUMMARY_FIELDS,
  sanitizeForExcel,
  safeFilename,
} from "./interviewEvalTemplate.js";

// 写值到合并单元格时,ExcelJS 要求落在左上角(主单元格);其他从单元格不可写
// 此处所有目标 cell 都已经是合并块左上角,直接 ws.getCell(addr).value = ... 即可
function setCell(ws, address, value) {
  if (value == null || value === "") return;
  const cell = ws.getCell(address);
  cell.value = sanitizeForExcel(value);
}

function formatDate(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;  // 与原模板 B5 视觉风格一致 (无时间)
}

/**
 * 把 evaluation 渲染到 xlsx
 * @param {object} evaluation Prisma InterviewEvaluation 记录(plain object)
 * @returns {Promise<{buffer: Buffer, filename: string}>}
 */
export async function renderEvaluationToXlsx(evaluation) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(loadTemplateBuffer());

  const ws = wb.getWorksheet("面试评分表");
  if (!ws) throw new Error("template missing '面试评分表' sheet");

  // 1) 候选人信息 9 字段
  const infoValues = {
    candidateName: evaluation.candidateName,
    position: evaluation.position,
    region: evaluation.region,
    interviewDate: formatDate(evaluation.interviewDate),
    interviewer: evaluation.interviewer,
    languageStrength: evaluation.languageStrength,
    currentCity: evaluation.currentCity,
    department: evaluation.department,
    timezoneCollaboration: evaluation.timezoneCollaboration,
  };
  for (const f of INFO_FIELDS) {
    setCell(ws, f.cell, infoValues[f.key]);
  }

  // 2) 评分项: E10:E16 + 备注 G10:G16
  //    权重列 D10:D16 不写(模板已有);加权得分列 F10:F16 完全不动(模板公式)
  const scoresByKey = new Map((evaluation.scores || []).map((s) => [s.key, s]));
  for (const dim of SCORE_DIMENSIONS) {
    const item = scoresByKey.get(dim.key);
    if (item && item.score != null && item.score !== "") {
      const n = Number(item.score);
      if (Number.isInteger(n) && n >= 1 && n <= 10) {
        ws.getCell(dim.scoreCell).value = n;  // 数字直接写,不需要 sanitize
      }
    }
    if (item && item.remark) {
      setCell(ws, dim.remarkCell, item.remark);
    }
  }

  // 3) 纪要 4 字段 — 覆盖模板里的占位提示文字
  const summaryValues = {
    strengths: evaluation.strengths,
    risks: evaluation.risks,
    followUpQuestions: evaluation.followUpQuestions,
    finalOpinion: evaluation.finalOpinion,
  };
  for (const f of SUMMARY_FIELDS) {
    const v = summaryValues[f.key];
    // 即便是空字符串,也要清掉模板占位 (避免导出后留着「请记录...」)
    if (v != null && v !== "") {
      setCell(ws, f.cell, v);
    } else {
      ws.getCell(f.cell).value = null;
    }
  }

  // 4) 流式输出
  const buffer = await wb.xlsx.writeBuffer();

  // 5) 文件名: 属地员工面试评价表_姓名_岗位_yyyy-MM-dd.xlsx
  const dateStr = (() => {
    const d = evaluation.interviewDate ? new Date(evaluation.interviewDate) : new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const filename = `属地员工面试评价表_${safeFilename(evaluation.candidateName)}_${safeFilename(evaluation.position || "岗位")}_${dateStr}.xlsx`;

  return { buffer: Buffer.from(buffer), filename };
}

/**
 * RFC 5987 编码的 Content-Disposition 头(兼容中文文件名)
 */
export function attachmentHeaderForFilename(filename) {
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
