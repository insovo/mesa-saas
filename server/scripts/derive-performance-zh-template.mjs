// 派生纯中文绩效评价模板 — 从中英双语复制并去掉英文行,保留合并/公式/样式
// 用法: node scripts/derive-performance-zh-template.mjs
// 依赖: 本机 python3 + openpyxl

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = join(root, "assets/templates/performance-evaluation-zh-en-v1.xlsx");
const dst = join(root, "assets/templates/performance-evaluation-zh-v1.xlsx");

const py = `
from openpyxl import load_workbook
import re
src = ${JSON.stringify(src)}
dst = ${JSON.stringify(dst)}
wb = load_workbook(src)
SHEET_RENAMES = {
    "绩效评分表 Evaluation": "绩效评分表",
    "使用说明 Instructions": "使用说明",
    "评分标准 Criteria": "评分标准",
    "部门KPI参考库 KPIs": "部门KPI参考库",
}
def strip_bilingual(text):
    if not isinstance(text, str):
        return text
    s = text
    def strip_slash_parts(line):
        if " / " not in line and "／" not in line:
            return line
        parts = re.split(r'\\s*/\\s*', line)
        if len(parts) < 2:
            return line
        kept = []
        for i, p in enumerate(parts):
            has_cjk = bool(re.search(r'[\\u4e00-\\u9fff]', p))
            latin_ratio = len(re.findall(r'[A-Za-z]', p)) / max(len(p), 1)
            if has_cjk or (i == 0 and latin_ratio < 0.5):
                kept.append(p.strip())
            elif not has_cjk and latin_ratio > 0.4 and i > 0:
                continue
            else:
                kept.append(p.strip())
        return " / ".join(kept) if len(kept) > 1 else (kept[0] if kept else line)
    out_lines = []
    for line in s.split("\\n"):
        has_cjk = bool(re.search(r'[\\u4e00-\\u9fff]', line))
        has_latin = bool(re.search(r'[A-Za-z]', line))
        if not has_cjk and has_latin and re.search(r'[A-Za-z]{3,}', line):
            if re.fullmatch(r'[\\d\\s\\-–—.<≥≤%≈]+', line.strip()) or re.fullmatch(r'[A-E]', line.strip()):
                out_lines.append(line)
            continue
        cleaned = strip_slash_parts(line)
        cleaned = re.sub(r'\\s*[·|]\\s*[A-Za-z][A-Za-z0-9 ,.\\-&/()\\'%]{2,}$', '', cleaned)
        out_lines.append(cleaned)
    result = "\\n".join(out_lines).strip("\\n")
    result = re.sub(r'\\n{3,}', '\\n\\n', result)
    return result if result else s
for ws in wb.worksheets:
    for row in ws.iter_rows():
        for cell in row:
            if isinstance(cell.value, str) and not cell.value.startswith("="):
                nv = strip_bilingual(cell.value)
                if nv != cell.value:
                    cell.value = nv
for old, new in list(SHEET_RENAMES.items()):
    if old in wb.sheetnames:
        wb[old].title = new
wb.save(dst)
wb_src = load_workbook(src)
wb_dst = load_workbook(dst)
assert len(wb_src.worksheets) == len(wb_dst.worksheets)
for a, b in zip(wb_src.worksheets, wb_dst.worksheets):
    assert len(a.merged_cells.ranges) == len(b.merged_cells.ranges)
    for ra, rb in zip(a.iter_rows(max_row=a.max_row, max_col=a.max_column),
                      b.iter_rows(max_row=b.max_row, max_col=b.max_column)):
        for ca, cb in zip(ra, rb):
            if isinstance(ca.value, str) and ca.value.startswith("="):
                assert cb.value == ca.value
print("ok")
`;

const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(1);
}
if (!existsSync(dst)) {
  console.error("derived file missing");
  process.exit(1);
}
const hash = createHash("sha256").update(readFileSync(dst)).digest("hex");
console.log("wrote", dst);
console.log("sha256", hash);
