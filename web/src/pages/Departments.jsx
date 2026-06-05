import { useEffect, useRef, useState } from "react";
import { resources } from "../lib/api.js";
import {
  Card,
  Button,
  Input,
  I,
  Empty,
  LoadingBlock,
  Modal,
  toast,
} from "../components/Primitives.jsx";
import OrgChartTree from "../components/OrgChartTree.jsx";
import OrgTreeList from "../components/OrgTreeList.jsx";

const EMPTY_FORM = { name: "", code: "", head: "", headcount: 0, openHc: 0, parentId: null };

function ExportMenu({ rootCandidates, onExport }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        icon={<I name="download" size={14} />}
        disabled={!rootCandidates.length}
      >
        导出
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 min-w-[180px] bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden">
          <div className="px-3 py-2 text-[11px] text-gray-700 bg-lightPrimary">
            选择导出根部门 (xlsx)
          </div>
          {rootCandidates.map((d) => (
            <button
              key={d.id}
              onClick={() => {
                setOpen(false);
                onExport(d.id, d.name);
              }}
              className="w-full text-left px-3 py-2 text-sm text-navy-700 hover:bg-lightPrimary flex items-center gap-2"
            >
              <I name="building-2" size={14} className="text-brand" />
              {d.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Departments() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [view, setView] = useState("tree"); // tree | chart
  const [parentName, setParentName] = useState("");

  async function load() {
    setLoading(true);
    try {
      const { items } = await resources.departments.list();
      setItems(items);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setParentName("");
    setForm(EMPTY_FORM);
    setCreateOpen(true);
  }

  function openCreateChild(parent) {
    setEditing(null);
    setParentName(parent.name);
    setForm({ ...EMPTY_FORM, parentId: parent.id });
    setCreateOpen(true);
  }

  function openEdit(d) {
    setEditing(d);
    setParentName("");
    setForm({ name: d.name, code: d.code || "", head: d.head || "", headcount: d.headcount || 0, openHc: d.openHc || 0, parentId: d.parentId ?? null });
    setCreateOpen(true);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.name) return;
    const payload = { ...form, headcount: Number(form.headcount) || 0, openHc: Number(form.openHc) || 0 };
    try {
      if (editing) await resources.departments.update(editing.id, payload);
      else await resources.departments.create(payload);
      toast("已保存", "success");
      setCreateOpen(false);
      load();
    } catch (e) {
      toast(e.response?.data?.message || "保存失败", "error");
    }
  }

  async function onDelete(d) {
    if (!confirm(`删除部门「${d.name}」?`)) return;
    try {
      await resources.departments.remove(d.id);
      toast("已删除", "success");
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function onExport(rootId, name) {
    try {
      const res = await resources.departments.exportXlsx(rootId);
      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `${name}_人员统计_${today}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("已导出", "success");
    } catch (e) {
      toast(e.response?.data?.message || e.message || "导出失败", "error");
    }
  }

  async function onReorder(moves) {
    // 乐观更新:本地立即应用,失败再 revert via reload
    const prev = items;
    const next = items.map((d) => {
      const m = moves.find((x) => x.id === d.id);
      if (!m) return d;
      return {
        ...d,
        ...(Object.prototype.hasOwnProperty.call(m, "parentId") ? { parentId: m.parentId } : {}),
        sortOrder: m.sortOrder,
      };
    });
    setItems(next);
    try {
      await resources.departments.reorder(moves);
    } catch (e) {
      setItems(prev);
      const msg = e.response?.data?.message || e.message || "调整失败";
      toast(msg, "error");
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
          <div>
            <h2 className="title-card flex items-center gap-2">
              <I name="network" size={18} className="text-brand" />
              组织架构
            </h2>
            <p className="text-xs text-gray-700 mt-1">
              {view === "tree"
                ? "缩进折叠树 · 拖动手柄调整层级 · 顶部根区可拖出顶级部门"
                : "横向架构图 · 拖动节点调整父子关系 · 顶部根区可拖出顶级部门"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* 视图切换 */}
            <div className="inline-flex items-center rounded-xl border border-gray-200 p-0.5 bg-white">
              <button
                onClick={() => setView("tree")}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold transition-colors ${
                  view === "tree" ? "bg-brand-gradient text-white shadow-button" : "text-gray-700 hover:bg-lightPrimary"
                }`}
              >
                <I name="list-tree" size={14} /> 树视图
              </button>
              <button
                onClick={() => setView("chart")}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold transition-colors ${
                  view === "chart" ? "bg-brand-gradient text-white shadow-button" : "text-gray-700 hover:bg-lightPrimary"
                }`}
              >
                <I name="network" size={14} /> 架构图
              </button>
            </div>
            <ExportMenu
              rootCandidates={items.filter((d) => !d.parentId)}
              onExport={onExport}
            />
            <Button onClick={openCreate} icon={<I name="plus" size={16} />}>新建部门</Button>
          </div>
        </div>
        {loading ? (
          <LoadingBlock height="h-40" />
        ) : items.length === 0 ? (
          <Empty icon="network" title="还没有部门,先新建一个" />
        ) : view === "tree" ? (
          <OrgTreeList
            items={items}
            onReorder={onReorder}
            onEdit={openEdit}
            onDelete={onDelete}
            onAddChild={openCreateChild}
          />
        ) : (
          <OrgChartTree items={items} onReorder={onReorder} />
        )}
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="title-card flex items-center gap-2">
              <I name="building-2" size={18} className="text-brand" />
              部门管理
            </h2>
            <p className="text-xs text-gray-700 mt-1">管理员视角的组织结构 · 含编制与缺员视图</p>
          </div>
        </div>

        {loading ? (
          <LoadingBlock height="h-40" />
        ) : items.length === 0 ? (
          <Empty icon="building-2" title="还没有部门" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-5">
            {items.map((d) => (
              <div key={d.id} className="p-5 rounded-card bg-lightPrimary hover:bg-white hover:shadow-card transition group relative">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-brand-gradient text-white flex items-center justify-center font-bold">
                    {d.code?.slice(0, 2) || d.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-navy-700 truncate">{d.name}</h3>
                    <p className="text-xs text-gray-700">{d.code || "—"}</p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-4 text-xs">
                  <div className="bg-white rounded-xl p-2.5">
                    <p className="text-gray-700">部门负责人</p>
                    <p className="text-sm font-bold text-navy-700 mt-0.5 truncate">{d.head || "—"}</p>
                  </div>
                  <div className="bg-white rounded-xl p-2.5">
                    <p className="text-gray-700">现编</p>
                    <p className="text-lg font-bold text-navy-700 mt-0.5">{d.headcount}</p>
                  </div>
                  <div className="bg-white rounded-xl p-2.5">
                    <p className="text-gray-700">缺员</p>
                    <p className="text-lg font-bold text-amber-500 mt-0.5">{d.openHc}</p>
                  </div>
                  <div className="bg-white rounded-xl p-2.5">
                    <p className="text-gray-700">已关联候选人</p>
                    <p className="text-lg font-bold text-brand mt-0.5">{d.directCount ?? 0}</p>
                  </div>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition absolute bottom-3 right-3 flex gap-1.5">
                  <button onClick={() => openEdit(d)} className="w-7 h-7 rounded-full bg-white text-gray-700 hover:text-brand flex items-center justify-center shadow-sm" title="编辑">
                    <I name="pencil" size={12} />
                  </button>
                  <button onClick={() => onDelete(d)} className="w-7 h-7 rounded-full bg-white text-red-500 hover:bg-red-50 flex items-center justify-center shadow-sm" title="删除">
                    <I name="trash-2" size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)}>
        <form onSubmit={onSubmit} className="p-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-navy-700">{editing ? "编辑部门" : parentName ? "新建子部门" : "新建部门"}</h3>
            <button type="button" onClick={() => setCreateOpen(false)} className="text-gray-400 hover:text-navy-700">
              <I name="x" size={20} />
            </button>
          </div>
          {!editing && parentName && (
            <div className="mb-4 flex items-center gap-2 text-xs text-brand bg-brand-50 rounded-xl px-3 py-2">
              <I name="corner-down-right" size={14} />
              将作为「{parentName}」的子部门创建
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Input containerClassName="col-span-2" label="部门名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <Input label="部门代码" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <Input label="负责人" value={form.head} onChange={(e) => setForm({ ...form, head: e.target.value })} />
            <Input label="现编人数" type="number" min="0" value={form.headcount} onChange={(e) => setForm({ ...form, headcount: e.target.value })} />
            <Input label="缺员数" type="number" min="0" value={form.openHc} onChange={(e) => setForm({ ...form, openHc: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 mt-8">
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button type="submit" icon={<I name="check" size={14} />}>保存</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
