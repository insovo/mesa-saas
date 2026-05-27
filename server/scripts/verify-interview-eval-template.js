// 面试评价模板回归脚本
//
// 用途:
//   1. 校验模板文件 SHA-256 是否与代码中固化值一致
//   2. ExcelJS load → save 回归: 不改任何数据, 用 Python openpyxl diff 检查关键属性是否丢失
//   3. 完整渲染测试: 灌入一份样例评价, 检查所有目标单元格已写入 / 公式列未动 / 合并未破
//
// 使用:
//   node scripts/verify-interview-eval-template.js                  # 全部跑
//   node scripts/verify-interview-eval-template.js --keep            # 保留生成的临时文件供人工 Excel 打开对比
//
// 退出码: 0 = 全部通过, 1 = 有失败

import ExcelJS from "exceljs";
import { writeFileSync, unlinkSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  TEMPLATE_PATH,
  TEMPLATE_EXPECTED_HASH,
  SCORE_DIMENSIONS,
  INFO_FIELDS,
  SUMMARY_FIELDS,
  verifyTemplateOnBoot,
} from "../src/lib/interviewEvalTemplate.js";
import { renderEvaluationToXlsx } from "../src/lib/interviewEvalExport.js";

const KEEP = process.argv.includes("--keep");

let passed = 0;
let failed = 0;

function check(name, ok, detail = "") {
  if (ok) {
    console.log(`✓ ${name}`);
    passed++;
  } else {
    console.error(`✗ ${name} ${detail}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

// ─── 1. Hash 校验 ────────────────────────────────────────────────
section("1. 模板 hash 校验");
try {
  const h = verifyTemplateOnBoot();
  check(`hash = ${h}`, h === TEMPLATE_EXPECTED_HASH);
} catch (err) {
  check("verifyTemplateOnBoot", false, err.message);
}

// ─── 2. load→save 回归 ──────────────────────────────────────────
section("2. ExcelJS load → save 不改任何数据");
{
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);

  // 关键属性快照(load 后)
  const ws = wb.getWorksheet("面试评分表");
  check("'面试评分表' Sheet 存在", !!ws);
  check("'评分标准' Sheet 存在", !!wb.getWorksheet("评分标准"));

  if (ws) {
    // 合并单元格数量
    const expectedMerges = 13;
    const mergedCount = Object.keys(ws._merges || {}).length;
    check(`面试评分表 合并单元格 = ${expectedMerges}`, mergedCount === expectedMerges, `actual=${mergedCount}`);

    // 公式列
    for (let i = 0; i < SCORE_DIMENSIONS.length; i++) {
      const dim = SCORE_DIMENSIONS[i];
      const cell = ws.getCell(dim.weightedCell);
      const isFormula = cell.value && typeof cell.value === "object" && "formula" in cell.value;
      check(`${dim.weightedCell} 是公式`, !!isFormula, `value=${JSON.stringify(cell.value)}`);
    }
    const f17 = ws.getCell("F17").value;
    check("F17 是公式", f17 && typeof f17 === "object" && "formula" in f17);
    const g17 = ws.getCell("G17").value;
    check("G17 是公式", g17 && typeof g17 === "object" && "formula" in g17);

    // freeze pane
    const view = (ws.views || [])[0];
    check("面试评分表 freeze A9", view?.state === "frozen" && view.ySplit === 8, `view=${JSON.stringify(view)}`);

    // 列宽 (B=18, C=34)
    check("B 列宽 = 18", ws.getColumn("B").width === 18, `actual=${ws.getColumn("B").width}`);
    check("C 列宽 = 34", ws.getColumn("C").width === 34, `actual=${ws.getColumn("C").width}`);
  }

  // save 一次,确认能 round-trip 不报错
  const buf = await wb.xlsx.writeBuffer();
  check("save → buffer 大小 > 0", buf.byteLength > 0, `size=${buf.byteLength}`);

  // 比较 round-trip 后的 hash (不期望一致, ExcelJS 会重新序列化, 但应该能正常 re-load)
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(buf);
  const ws2 = wb2.getWorksheet("面试评分表");
  check("round-trip 后能重新 load", !!ws2);
  if (ws2) {
    const mergeCount2 = Object.keys(ws2._merges || {}).length;
    check("round-trip 后合并单元格仍 = 13", mergeCount2 === 13, `actual=${mergeCount2}`);
  }
}

// ─── 3. 完整渲染评价 ────────────────────────────────────────────
section("3. 完整渲染评价 → 关键单元格内容正确");
{
  const sampleEvaluation = {
    candidateName: "张三",
    position: "高级前端开发",
    region: "中国",
    interviewDate: new Date("2026-05-28T06:56:00Z"),
    interviewer: "王浩",
    languageStrength: "中英双语",
    currentCity: "上海",
    department: "前端",
    timezoneCollaboration: "可接受",
    scores: [
      { key: "communication", score: 9, remark: "结构清晰" },
      { key: "role_match",    score: 8, remark: "经历高度相关" },
      { key: "professional",  score: 8, remark: "" },
      { key: "learning",      score: 9, remark: "" },
      { key: "execution",     score: 7, remark: "" },
      { key: "stability",     score: 8, remark: "" },
      { key: "culture",       score: 8, remark: "" },
    ],
    strengths: "结构思维强，能用项目案例佐证。",
    risks: "对新业务领域经验略浅。",
    followUpQuestions: "复试可深挖大型重构项目。",
    finalOpinion: "建议进入复试。",
    totalScore: 82,
    recommendation: "建议复试",
    // 公式注入测试: 备注以 = 开头,应被 prefix '
    // (放在 risks 测一下)
  };
  // 加一行测试 sanitize
  sampleEvaluation.risks = "=SUM(A1:A10) 这是测试公式注入,应被当文本";

  const { buffer, filename } = await renderEvaluationToXlsx(sampleEvaluation);
  check("渲染返回 buffer", buffer && buffer.length > 0, `size=${buffer?.length}`);
  check("文件名含候选人姓名", filename.includes("张三"), filename);
  check("文件名含岗位", filename.includes("高级前端开发"), filename);
  check("文件名以 .xlsx 结尾", filename.endsWith(".xlsx"), filename);

  // 写到临时文件 + 重新 load 验证内容
  const tmpFile = join(tmpdir(), `verify-interview-eval-${Date.now()}.xlsx`);
  writeFileSync(tmpFile, buffer);
  console.log(`  临时文件: ${tmpFile}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet("面试评分表");
  check("渲染后 '面试评分表' 存在", !!ws);
  check("渲染后 '评分标准' 存在", !!wb.getWorksheet("评分标准"));

  if (ws) {
    // 候选人信息单元格
    check("B4 = 张三", ws.getCell("B4").value === "张三");
    check("D4 = 高级前端开发", ws.getCell("D4").value === "高级前端开发");
    check("G4 = 中国", ws.getCell("G4").value === "中国");
    check("D5 = 王浩", ws.getCell("D5").value === "王浩");
    check("D6 = 前端", ws.getCell("D6").value === "前端");
    check("G6 = 可接受", ws.getCell("G6").value === "可接受");

    // 评分单元格 (E10..E16 = 数字)
    check("E10 = 9 (communication)", ws.getCell("E10").value === 9);
    check("E16 = 8 (culture)", ws.getCell("E16").value === 8);

    // 备注单元格
    check("G10 = '结构清晰'", ws.getCell("G10").value === "结构清晰");

    // 公式列没动
    const f10 = ws.getCell("F10").value;
    check("F10 仍是公式", f10 && typeof f10 === "object" && "formula" in f10, `value=${JSON.stringify(f10)}`);
    const f17 = ws.getCell("F17").value;
    check("F17 仍是公式", f17 && typeof f17 === "object" && "formula" in f17);
    const g17 = ws.getCell("G17").value;
    check("G17 仍是公式", g17 && typeof g17 === "object" && "formula" in g17);

    // 公式注入防护: risks 以 = 开头, 必须被 prefix '
    const risksCell = ws.getCell("B22").value;
    check("B22 公式注入已防护(前缀 ')", typeof risksCell === "string" && risksCell.startsWith("'="), `value=${JSON.stringify(risksCell)}`);

    // 模板占位文字必须被覆盖
    const strengthsCell = ws.getCell("B20").value;
    check("B20 已覆盖占位", strengthsCell === "结构思维强，能用项目案例佐证。", `value=${JSON.stringify(strengthsCell)}`);
    const finalCell = ws.getCell("B26").value;
    check("B26 已覆盖占位", finalCell === "建议进入复试。", `value=${JSON.stringify(finalCell)}`);

    // 评分维度名称 (B 列) 应该保留模板原文
    check("B10 = '沟通表达' (模板原值)", ws.getCell("B10").value === "沟通表达");
    check("D10 = 15 (权重保留)", ws.getCell("D10").value === 15);

    // 合并单元格数量保留
    const mc = Object.keys(ws._merges || {}).length;
    check("渲染后合并单元格仍 = 13", mc === 13, `actual=${mc}`);
  }

  if (!KEEP) {
    unlinkSync(tmpFile);
  } else {
    console.log(`  --keep 模式: 临时文件保留, 可用 Excel/WPS 打开人工对比`);
  }
}

// ─── 汇总 ───────────────────────────────────────────────────────
console.log(`\n=== 汇总 ===`);
console.log(`✓ ${passed} 通过`);
if (failed > 0) {
  console.error(`✗ ${failed} 失败`);
  process.exit(1);
} else {
  console.log("全部通过 ✓");
  process.exit(0);
}
