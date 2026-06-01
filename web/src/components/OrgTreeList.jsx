// 部门树 — flat list → 纵向缩进折叠树 + 搜索 + 展开/折叠全部 + dnd-kit 拖拽改层级
// 拖拽语义复用 OrgChartTree:行上边缘=前一个兄弟 / 行中心=子部门 / 行下边缘=后一个兄弟 / 顶部根区=顶级
// 右侧数字 = directCount(已关联候选人)

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
import { useGSAP } from "@gsap/react";
import { I, Empty } from "./Primitives.jsx";
import { buildTree, computeMoves } from "./OrgChartTree.jsx";

gsap.registerPlugin(useGSAP);

const INDENT = 22;

// 拍平嵌套树为可渲染行,尊重 expanded(搜索激活时强制展开,且只保留命中节点及其祖先)
function flatten(nodes, depth, expandedSet, visibleSet, out) {
  for (const n of nodes) {
    if (visibleSet && !visibleSet.has(n.id)) continue;
    const allKids = n.children || [];
    out.push({ node: n, depth, hasKids: allKids.length > 0 });
    const open = visibleSet ? true : expandedSet.has(n.id);
    if (allKids.length > 0 && open) {
      const kids = visibleSet ? allKids.filter((c) => visibleSet.has(c.id)) : allKids;
      flatten(kids, depth + 1, expandedSet, visibleSet, out);
    }
  }
  return out;
}

// 搜索:返回命中节点 + 其所有祖先(保证层级路径可见)
function computeSearchMatch(items, query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const byId = new Map(items.map((d) => [d.id, d]));
  const matched = new Set();
  const visible = new Set();
  for (const d of items) {
    const blob = [d.name, d.head, d.code].filter(Boolean).join(" ").toLowerCase();
    if (blob.includes(q)) {
      matched.add(d.id);
      let cur = d;
      while (cur) {
        visible.add(cur.id);
        cur = cur.parentId ? byId.get(cur.parentId) : null;
      }
    }
  }
  return { matched, visible };
}

function RootDropZone() {
  const { isOver, setNodeRef } = useDroppable({ id: "root" });
  return (
    <div
      ref={setNodeRef}
      className={`mb-2 border-2 border-dashed rounded-xl py-2 text-center text-xs font-medium transition-all ${
        isOver ? "border-brand bg-brand/10 text-brand" : "border-gray-200 text-gray-400"
      }`}
    >
      <I name="corner-up-left" size={13} className="inline-block -mt-0.5 mr-1" />
      拖到这里 = 设为顶级部门
    </div>
  );
}

function TreeRow({
  row,
  expanded,
  selected,
  matched,
  searching,
  onToggle,
  onSelect,
  onEdit,
  onDelete,
  onAddChild,
}) {
  const { node, depth, hasKids } = row;
  const isTop = !node.parentId;
  const { attributes, listeners, setNodeRef: dragRef, isDragging } = useDraggable({ id: node.id });
  const before = useDroppable({ id: `${node.id}:before` });
  const child = useDroppable({ id: `${node.id}:child` });
  const after = useDroppable({ id: `${node.id}:after` });

  return (
    <div className="tree-row relative" data-flip-id={node.id}>
      {/* before-sibling */}
      <div
        ref={before.setNodeRef}
        className={`absolute -top-0.5 left-0 right-0 h-1 rounded-full z-10 transition-all ${
          before.isOver ? "bg-brand h-1.5" : ""
        }`}
      />
      {/* child dropzone(覆盖行内部,留出上下边缘给 before/after) */}
      <div
        ref={child.setNodeRef}
        className={`absolute inset-x-1 top-1 bottom-1 rounded-xl pointer-events-none transition-all ${
          child.isOver ? "ring-2 ring-violet-400 bg-violet-50/60" : ""
        }`}
      />
      <div
        onClick={() => onSelect(node.id)}
        className={`group relative flex items-center h-11 rounded-xl cursor-pointer transition-colors ${
          selected
            ? "bg-brand-50 ring-1 ring-brand/40"
            : "hover:bg-lightPrimary"
        } ${isDragging ? "opacity-40" : ""} ${searching && !matched ? "opacity-55" : ""}`}
        style={{ paddingLeft: 10 + depth * INDENT }}
      >
        {/* chevron 占位,叶子节点留白对齐 */}
        {hasKids ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-brand shrink-0"
            title={expanded ? "折叠" : "展开"}
          >
            <I name={expanded ? "chevron-down" : "chevron-right"} size={16} />
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        {/* 层级图标:顶级=楼,子级=文件夹 */}
        <span
          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
            isTop ? "bg-brand-50 text-brand" : "text-brand/80"
          }`}
        >
          <I name={isTop ? "building-2" : "folder"} size={16} />
        </span>
        {/* 名称 + 代码 */}
        <div className="min-w-0 flex-1 ml-2">
          <p
            className={`text-sm truncate ${
              selected ? "font-bold text-brand" : "font-medium text-navy-700"
            }`}
            title={node.head ? `负责人 ${node.head}` : node.name}
          >
            {node.name}
            {node.code && (
              <span className="text-[11px] text-gray-400 ml-2 font-normal">{node.code}</span>
            )}
          </p>
        </div>
        {/* hover 操作 */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition mr-1.5 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddChild(node);
            }}
            className="w-7 h-7 rounded-lg text-gray-500 hover:text-brand hover:bg-white flex items-center justify-center"
            title="新建子部门"
          >
            <I name="plus" size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(node);
            }}
            className="w-7 h-7 rounded-lg text-gray-500 hover:text-brand hover:bg-white flex items-center justify-center"
            title="编辑"
          >
            <I name="pencil" size={13} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node);
            }}
            className="w-7 h-7 rounded-lg text-red-500 hover:bg-red-50 flex items-center justify-center"
            title="删除"
          >
            <I name="trash-2" size={13} />
          </button>
          {/* 拖拽手柄 */}
          <span
            ref={dragRef}
            {...listeners}
            {...attributes}
            className="w-7 h-7 rounded-lg text-gray-400 hover:text-navy-700 hover:bg-white flex items-center justify-center cursor-grab active:cursor-grabbing"
            style={{ touchAction: "none" }}
            title="拖动调整层级"
            onClick={(e) => e.stopPropagation()}
          >
            <I name="grip-vertical" size={14} />
          </span>
        </div>
        {/* 右侧:已关联候选人数 */}
        <span
          className="text-sm font-bold text-gray-400 group-hover:text-navy-700 w-9 text-right mr-3 shrink-0 tabular-nums"
          title="已关联候选人"
        >
          {node.directCount ?? 0}
        </span>
      </div>
      {/* after-sibling */}
      <div
        ref={after.setNodeRef}
        className={`absolute -bottom-0.5 left-0 right-0 h-1 rounded-full z-10 transition-all ${
          after.isOver ? "bg-brand h-1.5" : ""
        }`}
      />
    </div>
  );
}

export default function OrgTreeList({ items, onReorder, onEdit, onDelete, onAddChild }) {
  const tree = useMemo(() => buildTree(items), [items]);
  const [expanded, setExpanded] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const containerRef = useRef(null);
  const didInit = useRef(false);
  const animatedRef = useRef(false);

  // 初次默认展开所有「有子部门」的节点
  useEffect(() => {
    if (didInit.current || !items.length) return;
    didInit.current = true;
    const parentIds = new Set(items.filter((d) => d.parentId).map((d) => d.parentId));
    setExpanded(parentIds);
  }, [items]);

  const search = useMemo(() => computeSearchMatch(items, query), [items, query]);
  const visibleSet = search ? search.visible : null;
  const matchedSet = search ? search.matched : null;
  const rows = useMemo(
    () => flatten(tree.children, 0, expanded, visibleSet, []),
    [tree, expanded, visibleSet]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  useGSAP(
    () => {
      if (animatedRef.current || !rows.length) return;
      animatedRef.current = true;
      gsap.fromTo(
        ".tree-row",
        { opacity: 0, x: -10 },
        { opacity: 1, x: 0, duration: 0.32, stagger: 0.015, ease: "power2.out" }
      );
    },
    { scope: containerRef, dependencies: [rows.length > 0] }
  );

  // 有子部门的节点(只有它们能展开/折叠)
  const expandableIds = useMemo(
    () => new Set(items.filter((d) => d.parentId).map((d) => d.parentId)),
    [items]
  );
  const allExpanded =
    expandableIds.size > 0 && [...expandableIds].every((id) => expanded.has(id));

  function toggleAll() {
    setExpanded(allExpanded ? new Set() : new Set(expandableIds));
  }
  function toggle(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleDragEnd(e) {
    setActiveId(null);
    if (!e.over) return;
    const active = items.find((d) => d.id === e.active.id);
    if (!active) return;
    const moves = computeMoves(items, active, e.over.id);
    if (!moves.length) return;
    const overId = String(e.over.id);
    if (overId.endsWith(":child")) {
      const parentId = overId.split(":")[0];
      setExpanded((prev) => new Set(prev).add(parentId));
    }
    onReorder(moves);
  }

  const activeItem = activeId ? items.find((d) => d.id === activeId) : null;
  const searching = !!visibleSet;

  return (
    <div>
      {/* 工具栏:搜索 + 展开/折叠全部 */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <I
            name="search"
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索部门 · 负责人 · 代码"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 text-sm text-navy-700 outline-none focus:border-brand bg-white"
          />
        </div>
        <button
          onClick={toggleAll}
          className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-gray-200 text-xs font-bold text-navy-700 hover:bg-lightPrimary transition-colors shrink-0"
        >
          <I name={allExpanded ? "chevrons-down-up" : "chevrons-up-down"} size={14} />
          {allExpanded ? "折叠全部" : "展开全部"}
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e) => setActiveId(e.active.id)}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={handleDragEnd}
      >
        <RootDropZone />
        <div ref={containerRef} className="space-y-0.5">
          {rows.length === 0 ? (
            <div className="py-8">
              <Empty icon="search" title="没有匹配的部门" />
            </div>
          ) : (
            rows.map((r) => (
              <TreeRow
                key={r.node.id}
                row={r}
                expanded={expanded.has(r.node.id)}
                selected={selectedId === r.node.id}
                matched={!matchedSet || matchedSet.has(r.node.id)}
                searching={searching}
                onToggle={toggle}
                onSelect={setSelectedId}
                onEdit={onEdit}
                onDelete={onDelete}
                onAddChild={onAddChild}
              />
            ))
          )}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeItem ? (
            <div className="inline-flex items-center gap-2 h-10 px-3 rounded-xl bg-white shadow-2xl border border-brand ring-2 ring-brand/30">
              <I name={activeItem.parentId ? "folder" : "building-2"} size={16} className="text-brand" />
              <span className="text-sm font-bold text-navy-700">{activeItem.name}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
