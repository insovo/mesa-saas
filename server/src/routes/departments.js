// /api/departments — CRUD + 组织树拖拽 reorder + 人员统计 xlsx 导出

import ExcelJS from "exceljs";
import { whereByIdOrExternal } from "../lib/idLookup.js";

function colLetter(n) {
  let s = "";
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const DEPT_BODY = {
  type: "object",
  properties: {
    externalId: { type: "string", maxLength: 64 },
    name: { type: "string", minLength: 1, maxLength: 100 },
    code: { type: "string", maxLength: 50, nullable: true },
    parentId: { type: "string", format: "uuid", nullable: true },
    head: { type: "string", maxLength: 100, nullable: true },
    headcount: { type: "integer", minimum: 0, maximum: 99999 },
    openHc: { type: "integer", minimum: 0, maximum: 9999 },
    sortOrder: { type: "integer", minimum: 0, maximum: 999999 },
  },
  additionalProperties: false,
};

const REORDER_BODY = {
  type: "object",
  required: ["moves"],
  properties: {
    moves: {
      type: "array",
      minItems: 1,
      maxItems: 500,
      items: {
        type: "object",
        required: ["id", "sortOrder"],
        properties: {
          id: { type: "string", format: "uuid" },
          parentId: { type: "string", format: "uuid", nullable: true },
          sortOrder: { type: "integer", minimum: 0, maximum: 999999 },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

function collectDescendantIds(flat, rootId) {
  const childrenByParent = new Map();
  for (const d of flat) {
    if (!childrenByParent.has(d.parentId)) childrenByParent.set(d.parentId, []);
    childrenByParent.get(d.parentId).push(d.id);
  }
  const out = new Set();
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop();
    const kids = childrenByParent.get(cur) || [];
    for (const k of kids) {
      if (!out.has(k)) {
        out.add(k);
        stack.push(k);
      }
    }
  }
  return out;
}

export default async function departmentsRoutes(app) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async () => {
    const items = await app.prisma.department.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { candidates: true, children: true } } },
    });
    const shaped = items.map((d) => ({
      id: d.id,
      externalId: d.externalId,
      name: d.name,
      code: d.code,
      parentId: d.parentId,
      head: d.head,
      headcount: d.headcount,
      openHc: d.openHc,
      sortOrder: d.sortOrder,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      directCount: d._count.candidates,
      childrenCount: d._count.children,
    }));
    return { items: shaped, total: shaped.length };
  });

  app.get("/:id", async (req, reply) => {
    const dept = await app.prisma.department.findFirst({
      where: whereByIdOrExternal(req.params.id),
      include: { children: true, parent: true },
    });
    if (!dept) return reply.code(404).send({ error: "not_found" });
    return { department: dept };
  });

  app.post("/", { schema: { body: { ...DEPT_BODY, required: ["name"] } } }, async (req, reply) => {
    const created = await app.prisma.department.create({ data: req.body });
    return reply.code(201).send({ department: created });
  });

  app.patch("/:id", { schema: { body: DEPT_BODY } }, async (req, reply) => {
    const { id } = req.params;
    const data = req.body;
    if (Object.prototype.hasOwnProperty.call(data, "parentId") && data.parentId) {
      if (data.parentId === id) {
        return reply.code(422).send({ error: "cycle_detected", message: "不能把部门挂在自己下面" });
      }
      const flat = await app.prisma.department.findMany({ select: { id: true, parentId: true } });
      const descendants = collectDescendantIds(flat, id);
      if (descendants.has(data.parentId)) {
        return reply.code(422).send({ error: "cycle_detected", message: "不能把部门挂到自己的子部门下" });
      }
    }
    try {
      const updated = await app.prisma.department.update({ where: { id }, data });
      return { department: updated };
    } catch (err) {
      if (err.code === "P2025") return reply.code(404).send({ error: "not_found" });
      throw err;
    }
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = req.params;
    try {
      await app.prisma.department.delete({ where: { id } });
      return reply.code(204).send();
    } catch (err) {
      if (err.code === "P2025") return reply.code(404).send({ error: "not_found" });
      throw err;
    }
  });

  // 批量重排 — 组织树拖拽时一次性提交多个节点的新 (parentId, sortOrder)
  app.post("/reorder", { schema: { body: REORDER_BODY } }, async (req, reply) => {
    const { moves } = req.body;
    const flat = await app.prisma.department.findMany({ select: { id: true, parentId: true } });
    const proposed = new Map(flat.map((d) => [d.id, { ...d }]));
    for (const m of moves) {
      const node = proposed.get(m.id);
      if (!node) return reply.code(404).send({ error: "not_found", message: `部门 ${m.id} 不存在` });
      if (Object.prototype.hasOwnProperty.call(m, "parentId")) {
        if (m.parentId === m.id) {
          return reply.code(422).send({ error: "cycle_detected", message: "不能把部门挂在自己下面" });
        }
        if (m.parentId && !proposed.has(m.parentId)) {
          return reply.code(422).send({ error: "parent_not_found", message: `父部门 ${m.parentId} 不存在` });
        }
        node.parentId = m.parentId ?? null;
      }
    }
    const N = proposed.size;
    for (const start of proposed.keys()) {
      let cur = proposed.get(start).parentId;
      let steps = 0;
      while (cur) {
        if (cur === start) {
          return reply.code(422).send({ error: "cycle_detected", message: "调整会产生循环" });
        }
        const next = proposed.get(cur);
        if (!next) break;
        cur = next.parentId;
        if (++steps > N) {
          return reply.code(422).send({ error: "cycle_detected", message: "调整会产生循环" });
        }
      }
    }

    try {
      await app.prisma.$transaction(
        moves.map((m) =>
          app.prisma.department.update({
            where: { id: m.id },
            data: {
              ...(Object.prototype.hasOwnProperty.call(m, "parentId") ? { parentId: m.parentId } : {}),
              sortOrder: m.sortOrder,
            },
          })
        )
      );
    } catch (err) {
      if (err.code === "P2025") return reply.code(404).send({ error: "not_found" });
      throw err;
    }
    return { ok: true, updated: moves.length };
  });

  // 人员统计 xlsx 导出 — 仿模板「海外研究院人员统计.xlsx」
  // 排版:三级合并表头 (root → 分中心 → 国家 → 完成/总数) + 末列合计 + 末行合计
  //       下半部分紧凑「分子/分母」版,公式联动上半部分
  app.get("/:id/export.xlsx", async (req, reply) => {
    const all = await app.prisma.department.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { candidates: true } } },
    });
    const root = all.find(
      (d) => d.id === req.params.id || d.externalId === req.params.id
    );
    if (!root) return reply.code(404).send({ error: "not_found" });

    const byParent = new Map();
    for (const d of all) {
      const k = d.parentId || "_root";
      if (!byParent.has(k)) byParent.set(k, []);
      byParent.get(k).push(d);
    }

    function subtreeStats(rootId) {
      let direct = 0;
      let headcount = 0;
      const stack = [rootId];
      const visited = new Set();
      while (stack.length) {
        const cur = stack.pop();
        if (visited.has(cur)) continue;
        visited.add(cur);
        const node = all.find((x) => x.id === cur);
        if (node) {
          direct += node._count.candidates;
          headcount += node.headcount;
        }
        for (const c of byParent.get(cur) || []) stack.push(c.id);
      }
      return { direct, headcount };
    }

    const centers = byParent.get(root.id) || [];
    const layout =
      centers.length === 0
        ? [{ center: root, countries: [root] }]
        : centers.map((c) => {
            const kids = byParent.get(c.id) || [];
            return { center: c, countries: kids.length ? kids : [c] };
          });

    const totalCountries = layout.reduce((s, l) => s + l.countries.length, 0);
    const totalCols = 1 + totalCountries * 2 + 2;

    const wb = new ExcelJS.Workbook();
    wb.creator = "MESA Recruit";
    wb.created = new Date();
    const ws = wb.addWorksheet(root.name.slice(0, 28) || "人员统计");

    const TITLE_FILL = "FF4F81BD";
    const SUB_FILL = "FFDCE6F1";
    const TOTAL_FILL = "FFBFBFBF";
    const GRAND_FILL = "FFA6A6A6";
    const ARIAL = (over = {}) => ({ name: "Arial", size: 10, ...over });

    function fill(cell, color) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    }
    function center(cell) {
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    }
    function border(cell) {
      const b = { style: "thin", color: { argb: "FFBFBFBF" } };
      cell.border = { top: b, left: b, bottom: b, right: b };
    }

    ws.getColumn(1).width = 12;
    for (let c = 2; c <= totalCols; c++) ws.getColumn(c).width = 7.5;

    // ===== 上半部分 =====
    // Row 1: A1:A3 root name + 每分中心横跨 + 合计
    ws.mergeCells(1, 1, 3, 1);
    {
      const c = ws.getCell(1, 1);
      c.value = root.name;
      c.font = ARIAL({ bold: true, color: { argb: "FFFFFFFF" } });
      fill(c, TITLE_FILL);
      center(c);
    }

    let col = 2;
    for (const l of layout) {
      const span = l.countries.length * 2;
      ws.mergeCells(1, col, 1, col + span - 1);
      const c = ws.getCell(1, col);
      c.value = l.center.name;
      c.font = ARIAL({ bold: true, color: { argb: "FFFFFFFF" } });
      fill(c, TITLE_FILL);
      center(c);
      col += span;
    }
    ws.mergeCells(1, col, 1, col + 1);
    {
      const c = ws.getCell(1, col);
      c.value = "合计";
      c.font = ARIAL({ bold: true, color: { argb: "FFFFFFFF" } });
      fill(c, TITLE_FILL);
      center(c);
    }
    const grandStartCol = col;
    col += 2;

    // Row 2: 国家名 + 合计副表头
    col = 2;
    for (const l of layout) {
      for (const country of l.countries) {
        ws.mergeCells(2, col, 2, col + 1);
        const c = ws.getCell(2, col);
        c.value = country.name;
        c.font = ARIAL({ bold: true });
        fill(c, SUB_FILL);
        center(c);
        col += 2;
      }
    }
    ws.mergeCells(2, col, 2, col + 1);
    {
      const c = ws.getCell(2, col);
      c.value = "合计";
      c.font = ARIAL({ bold: true });
      fill(c, SUB_FILL);
      center(c);
    }

    // Row 3: 完成/总数 交替
    for (let c = 2; c <= totalCols; c++) {
      const cell = ws.getCell(3, c);
      cell.value = c % 2 === 0 ? "完成" : "总数";
      cell.font = ARIAL({ bold: true });
      fill(cell, SUB_FILL);
      center(cell);
    }

    // Row 4: 数据行「合计」
    {
      const c = ws.getCell(4, 1);
      c.value = "合计";
      c.font = ARIAL({ bold: true });
      fill(c, TOTAL_FILL);
      center(c);
    }
    const colPairs = [];
    col = 2;
    for (const l of layout) {
      for (const country of l.countries) {
        const { direct, headcount } = subtreeStats(country.id);
        const cd = ws.getCell(4, col);
        const ct = ws.getCell(4, col + 1);
        cd.value = direct;
        ct.value = headcount;
        cd.font = ARIAL();
        ct.font = ARIAL();
        center(cd);
        center(ct);
        colPairs.push({ done: col, total: col + 1 });
        col += 2;
      }
    }
    const sumDone = colPairs.map((p) => colLetter(p.done) + "4").join("+");
    const sumTot = colPairs.map((p) => colLetter(p.total) + "4").join("+");
    {
      const c = ws.getCell(4, grandStartCol);
      c.value = { formula: sumDone };
      c.font = ARIAL({ bold: true, size: 11 });
      fill(c, GRAND_FILL);
      center(c);
    }
    {
      const c = ws.getCell(4, grandStartCol + 1);
      c.value = { formula: sumTot };
      c.font = ARIAL({ bold: true, size: 11 });
      fill(c, GRAND_FILL);
      center(c);
    }

    for (let r = 1; r <= 4; r++) {
      for (let c = 1; c <= totalCols; c++) border(ws.getCell(r, c));
    }
    ws.getRow(1).height = 22;
    ws.getRow(2).height = 22;

    // ===== 下半部分:分子/分母版 =====
    // 起始行 6 (留 row 5 空白做分隔)
    const ROW_A = 6;
    const ROW_B = 7;
    const ROW_DATA = 8;
    const totalCols2 = 1 + totalCountries + 1; // A 标签 + 各国 1 列 + 合计 1 列

    // Row 6: A6:A7 root name
    ws.mergeCells(ROW_A, 1, ROW_B, 1);
    {
      const c = ws.getCell(ROW_A, 1);
      c.value = root.name;
      c.font = ARIAL({ bold: true, color: { argb: "FFFFFFFF" } });
      fill(c, TITLE_FILL);
      center(c);
    }
    // Row 6: 每分中心横跨它的国家数 (1 列/国家)
    col = 2;
    for (const l of layout) {
      const span = l.countries.length;
      if (span > 1) ws.mergeCells(ROW_A, col, ROW_A, col + span - 1);
      const c = ws.getCell(ROW_A, col);
      c.value = l.center.name;
      c.font = ARIAL({ bold: true, color: { argb: "FFFFFFFF" } });
      fill(c, TITLE_FILL);
      center(c);
      col += span;
    }
    // 合计 (ROW_A:ROW_B 合并)
    ws.mergeCells(ROW_A, col, ROW_B, col);
    {
      const c = ws.getCell(ROW_A, col);
      c.value = "合计";
      c.font = ARIAL({ bold: true, color: { argb: "FFFFFFFF" } });
      fill(c, TITLE_FILL);
      center(c);
    }
    const grandCol2 = col;

    // Row 7: 国家名
    col = 2;
    for (const l of layout) {
      for (const country of l.countries) {
        const c = ws.getCell(ROW_B, col);
        c.value = country.name;
        c.font = ARIAL({ bold: true });
        fill(c, SUB_FILL);
        center(c);
        col += 1;
      }
    }

    // Row 8: 「合计」数据行 — 用公式联动上半部分
    {
      const c = ws.getCell(ROW_DATA, 1);
      c.value = "合计";
      c.font = ARIAL({ bold: true });
      fill(c, TOTAL_FILL);
      center(c);
    }
    col = 2;
    let idx = 0;
    for (const _ of layout) {
      for (const __ of _.countries) {
        const pair = colPairs[idx++];
        const c = ws.getCell(ROW_DATA, col);
        // ="" & 上半部分完成 & "/" & 总数  (避开 ISBLANK 的复杂逻辑,因为我们必填)
        c.value = {
          formula: `${colLetter(pair.done)}4&"/"&${colLetter(pair.total)}4`,
        };
        c.font = ARIAL();
        center(c);
        col += 1;
      }
    }
    {
      const c = ws.getCell(ROW_DATA, grandCol2);
      c.value = {
        formula: `${colLetter(grandStartCol)}4&"/"&${colLetter(grandStartCol + 1)}4`,
      };
      c.font = ARIAL({ bold: true, size: 11 });
      fill(c, GRAND_FILL);
      center(c);
    }

    for (let r = ROW_A; r <= ROW_DATA; r++) {
      for (let c = 1; c <= totalCols2; c++) border(ws.getCell(r, c));
    }

    const buffer = await wb.xlsx.writeBuffer();
    const safeName = (root.name || "departments").replace(/[\\/:*?"<>|]/g, "_");
    const filename = `${safeName}_人员统计_${new Date().toISOString().slice(0, 10)}.xlsx`;
    reply
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
      )
      .send(buffer);
  });
}
