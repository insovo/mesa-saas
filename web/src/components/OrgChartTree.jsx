// 组织架构图 — flat list → 纵向树 + dnd-kit 拖拽 + GSAP Flip 动效
// 拖拽语义:
//   1. 拖到节点上边缘  → 成为该节点的"前一个兄弟"
//   2. 拖到节点中心    → 成为该节点的子部门
//   3. 拖到节点下边缘  → 成为该节点的"后一个兄弟"
//   4. 拖到顶部根区    → 成为顶级部门
// 同层 sortOrder 以 10 步进重排(留中间插入余量)

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { gsap } from "gsap";
import { Flip } from "gsap/Flip";
import { useGSAP } from "@gsap/react";
import { I } from "./Primitives.jsx";

gsap.registerPlugin(Flip, useGSAP);

const NODE_W = 232;
const NODE_H = 124;
const H_GAP = 28;
const V_GAP = 72;
const EDGE_H = 14; // 上/下边缘 dropzone 高度

// ===== 工具:树形布局 =====
export function buildTree(items) {
  const byParent = new Map();
  for (const it of items) {
    const k = it.parentId || "_root";
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(it);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh"));
  }
  function attach(parentKey) {
    const kids = byParent.get(parentKey) || [];
    return kids.map((k) => ({ ...k, children: attach(k.id) }));
  }
  return { children: attach("_root") };
}

function calcWidth(node) {
  if (!node.children?.length) {
    node.subtreeW = NODE_W;
    return NODE_W;
  }
  const total = node.children.reduce((s, c) => s + calcWidth(c), 0);
  const gaps = (node.children.length - 1) * H_GAP;
  node.subtreeW = Math.max(NODE_W, total + gaps);
  return node.subtreeW;
}

function place(node, leftX, depth, positions) {
  let curX = leftX;
  if (node.children?.length) {
    for (const c of node.children) {
      place(c, curX, depth + 1, positions);
      curX += c.subtreeW + H_GAP;
    }
    const first = positions.get(node.children[0].id);
    const last = positions.get(node.children[node.children.length - 1].id);
    node.x = (first.x + last.x) / 2;
  } else {
    node.x = leftX + (node.subtreeW - NODE_W) / 2;
  }
  node.y = depth * (NODE_H + V_GAP);
  if (node.id) positions.set(node.id, { x: node.x, y: node.y });
}

function computeLayout(tree) {
  const positions = new Map();
  let curX = 0;
  for (const root of tree.children) {
    calcWidth(root);
    place(root, curX, 0, positions);
    curX += root.subtreeW + H_GAP * 2;
  }
  let maxX = NODE_W;
  let maxY = NODE_H;
  for (const p of positions.values()) {
    if (p.x + NODE_W > maxX) maxX = p.x + NODE_W;
    if (p.y + NODE_H > maxY) maxY = p.y + NODE_H;
  }
  return { positions, width: maxX, height: maxY };
}

function computeDescendantCounts(items) {
  const childrenByParent = new Map();
  for (const it of items) {
    const k = it.parentId || "_root";
    if (!childrenByParent.has(k)) childrenByParent.set(k, []);
    childrenByParent.get(k).push(it.id);
  }
  const memo = new Map();
  function dfs(id, direct) {
    if (memo.has(id)) return memo.get(id);
    let sum = direct;
    for (const kid of childrenByParent.get(id) || []) {
      const kidItem = items.find((d) => d.id === kid);
      if (kidItem) sum += dfs(kid, kidItem.directCount || 0);
    }
    memo.set(id, sum);
    return sum;
  }
  const out = new Map();
  for (const it of items) out.set(it.id, dfs(it.id, it.directCount || 0));
  return out;
}

export function getDescendantSet(items, rootId) {
  const out = new Set();
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop();
    for (const it of items) {
      if (it.parentId === cur && !out.has(it.id)) {
        out.add(it.id);
        stack.push(it.id);
      }
    }
  }
  return out;
}

export function computeMoves(items, active, overZoneId) {
  if (!overZoneId) return [];
  let newParentId = null;
  let mode = null; // "before" | "after" | "child" | "root"
  let refId = null;
  if (overZoneId === "root") {
    mode = "root";
  } else if (overZoneId.endsWith(":child")) {
    mode = "child";
    refId = overZoneId.split(":")[0];
    newParentId = refId;
  } else if (overZoneId.endsWith(":before") || overZoneId.endsWith(":after")) {
    refId = overZoneId.split(":")[0];
    const ref = items.find((d) => d.id === refId);
    if (!ref) return [];
    newParentId = ref.parentId;
    mode = overZoneId.endsWith(":before") ? "before" : "after";
  } else {
    return [];
  }

  if (newParentId === active.id) return [];
  if (newParentId) {
    const desc = getDescendantSet(items, active.id);
    if (desc.has(newParentId)) return [];
  }

  const oldParentId = active.parentId || null;

  const newSiblings = items
    .filter((d) => (d.parentId || null) === newParentId && d.id !== active.id)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh"));

  let insertIdx = newSiblings.length;
  if (mode === "before") {
    insertIdx = newSiblings.findIndex((d) => d.id === refId);
    if (insertIdx < 0) insertIdx = newSiblings.length;
  } else if (mode === "after") {
    const idx = newSiblings.findIndex((d) => d.id === refId);
    insertIdx = idx < 0 ? newSiblings.length : idx + 1;
  }

  const newOrder = [...newSiblings];
  newOrder.splice(insertIdx, 0, active);

  const moves = [];
  newOrder.forEach((d, i) => {
    const newSort = i * 10;
    const isActive = d.id === active.id;
    const parentChanged = isActive && oldParentId !== newParentId;
    if (d.sortOrder !== newSort || parentChanged) {
      moves.push({
        id: d.id,
        ...(isActive ? { parentId: newParentId } : {}),
        sortOrder: newSort,
      });
    }
  });

  if (oldParentId !== newParentId) {
    const oldSiblings = items
      .filter((d) => (d.parentId || null) === oldParentId && d.id !== active.id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh"));
    oldSiblings.forEach((d, i) => {
      const newSort = i * 10;
      if (d.sortOrder !== newSort) moves.push({ id: d.id, sortOrder: newSort });
    });
  }

  return moves;
}

// ===== SVG 连线 =====
function SvgLines({ positions, items }) {
  const lines = [];
  for (const it of items) {
    if (!it.parentId) continue;
    const p = positions.get(it.parentId);
    const c = positions.get(it.id);
    if (!p || !c) continue;
    const x1 = p.x + NODE_W / 2;
    const y1 = p.y + NODE_H;
    const x2 = c.x + NODE_W / 2;
    const y2 = c.y;
    const midY = (y1 + y2) / 2;
    const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
    lines.push(
      <path
        key={it.id}
        d={d}
        fill="none"
        stroke="#CBD5E1"
        strokeWidth={2}
        strokeLinecap="round"
      />
    );
  }
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width="100%"
      height="100%"
      style={{ overflow: "visible" }}
    >
      {lines}
    </svg>
  );
}

// ===== 节点卡片 =====
function NodeCard({ d, descCount, dragging = false, dimmed = false }) {
  const initial = (d.code?.slice(0, 2) || d.name?.slice(0, 1) || "?").toUpperCase();
  return (
    <div
      className={`w-full h-full rounded-card bg-white border ${
        dragging ? "shadow-2xl border-brand ring-2 ring-brand/30" : "border-gray-100 shadow-card"
      } ${dimmed ? "opacity-30" : ""} px-4 py-3 select-none transition-shadow`}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-gradient text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-navy-700 truncate" title={d.name}>
            {d.name}
          </h4>
          <p className="text-[11px] text-gray-700 truncate">
            {d.head ? `负责人 ${d.head}` : d.code || "—"}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 mt-2.5">
        <div className="bg-lightPrimary rounded-lg px-2 py-1">
          <p className="text-[10px] text-gray-700 leading-none">直属</p>
          <p className="text-sm font-bold text-navy-700 mt-0.5">{d.directCount ?? 0}</p>
        </div>
        <div className="bg-lightPrimary rounded-lg px-2 py-1">
          <p className="text-[10px] text-gray-700 leading-none">含子</p>
          <p className="text-sm font-bold text-brand mt-0.5">{descCount}</p>
        </div>
      </div>
    </div>
  );
}

// ===== 可拖拽节点 + 3 档 dropzone =====
function DraggableNode({ d, pos, descCount, isActive }) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: d.id });
  const before = useDroppable({ id: `${d.id}:before` });
  const child = useDroppable({ id: `${d.id}:child` });
  const after = useDroppable({ id: `${d.id}:after` });

  return (
    <div
      className="org-node absolute"
      style={{ left: pos.x, top: pos.y, width: NODE_W, height: NODE_H }}
      data-flip-id={d.id}
    >
      {/* before-sibling */}
      <div
        ref={before.setNodeRef}
        className={`absolute -top-2 left-0 right-0 h-3 rounded-full transition-all ${
          before.isOver ? "bg-brand/40 scale-y-150" : "bg-transparent"
        }`}
      />
      {/* draggable card (整体) */}
      <div
        ref={setDragRef}
        {...listeners}
        {...attributes}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        style={{ touchAction: "none" }}
      >
        <NodeCard d={d} descCount={descCount} dimmed={isDragging || isActive} />
      </div>
      {/* child dropzone (中心透明覆盖 ~ 占满卡片内部,但留出上下边缘给 before/after) */}
      <div
        ref={child.setNodeRef}
        className={`absolute inset-x-2 top-3 bottom-3 rounded-card pointer-events-none transition-all ${
          child.isOver ? "ring-2 ring-violet-500 ring-offset-2 bg-violet-50/60" : ""
        }`}
      />
      {/* after-sibling */}
      <div
        ref={after.setNodeRef}
        className={`absolute -bottom-2 left-0 right-0 h-3 rounded-full transition-all ${
          after.isOver ? "bg-brand/40 scale-y-150" : "bg-transparent"
        }`}
      />
    </div>
  );
}

// ===== 顶级根 dropzone =====
function RootDropZone() {
  const { isOver, setNodeRef } = useDroppable({ id: "root" });
  return (
    <div
      ref={setNodeRef}
      className={`mb-4 border-2 border-dashed rounded-card py-2.5 text-center text-xs font-medium transition-all ${
        isOver
          ? "border-brand bg-brand/10 text-brand"
          : "border-gray-200 text-gray-700"
      }`}
    >
      <I name="corner-up-left" size={14} className="inline-block -mt-0.5 mr-1" />
      拖到这里 = 设为顶级部门
    </div>
  );
}

// ===== 主组件 =====
export default function OrgChartTree({ items, onReorder }) {
  const containerRef = useRef(null);
  const [activeId, setActiveId] = useState(null);

  const tree = useMemo(() => buildTree(items), [items]);
  const { positions, width, height } = useMemo(() => computeLayout(tree), [tree]);
  const descMap = useMemo(() => computeDescendantCounts(items), [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // 进场 stagger
  useGSAP(
    () => {
      if (!items.length) return;
      gsap.fromTo(
        ".org-node",
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.45, stagger: 0.035, ease: "power2.out" }
      );
    },
    { scope: containerRef, dependencies: [items.length] }
  );

  // Flip 重排 — items 变化时
  const prevSig = useRef("");
  useEffect(() => {
    const sig = items.map((d) => `${d.id}:${d.parentId || ""}:${d.sortOrder}`).join("|");
    if (prevSig.current === sig || !prevSig.current) {
      prevSig.current = sig;
      return;
    }
    const state = Flip.getState(".org-node");
    prevSig.current = sig;
    requestAnimationFrame(() => {
      Flip.from(state, {
        duration: 0.5,
        ease: "power2.inOut",
        absolute: false,
      });
    });
  }, [items]);

  function handleDragStart(e) {
    setActiveId(e.active.id);
  }
  function handleDragCancel() {
    setActiveId(null);
  }
  function handleDragEnd(e) {
    setActiveId(null);
    if (!e.over) return;
    const active = items.find((d) => d.id === e.active.id);
    if (!active) return;
    const moves = computeMoves(items, active, e.over.id);
    if (!moves.length) return;
    onReorder(moves);
  }

  const activeItem = activeId ? items.find((d) => d.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      <div ref={containerRef}>
        <RootDropZone />
        <div className="overflow-auto pb-2">
          <div
            className="relative mx-auto"
            style={{ width: Math.max(width + 8, 320), height: Math.max(height + 8, 120) }}
          >
            <SvgLines positions={positions} items={items} />
            {items.map((d) => {
              const pos = positions.get(d.id);
              if (!pos) return null;
              return (
                <DraggableNode
                  key={d.id}
                  d={d}
                  pos={pos}
                  descCount={descMap.get(d.id) || 0}
                  isActive={activeId === d.id}
                />
              );
            })}
          </div>
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <div style={{ width: NODE_W, height: NODE_H }}>
            <NodeCard d={activeItem} descCount={descMap.get(activeItem.id) || 0} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
