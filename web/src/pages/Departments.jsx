import { useEffect, useState } from "react";
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

const EMPTY_FORM = { name: "", code: "", head: "", headcount: 0, openHc: 0 };

export default function Departments() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

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
    setForm(EMPTY_FORM);
    setCreateOpen(true);
  }

  function openEdit(d) {
    setEditing(d);
    setForm({ name: d.name, code: d.code || "", head: d.head || "", headcount: d.headcount || 0, openHc: d.openHc || 0 });
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

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="title-card flex items-center gap-2">
              <I name="building-2" size={18} className="text-brand" />
              部门管理
            </h2>
            <p className="text-xs text-gray-700 mt-1">管理员视角的组织结构 · 含编制与缺员视图</p>
          </div>
          <Button onClick={openCreate} icon={<I name="plus" size={16} />}>新建部门</Button>
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
                <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
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
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition absolute top-3 right-3 flex gap-1">
                  <button onClick={() => openEdit(d)} className="w-7 h-7 rounded-full bg-white text-gray-700 hover:text-brand flex items-center justify-center">
                    <I name="pencil" size={12} />
                  </button>
                  <button onClick={() => onDelete(d)} className="w-7 h-7 rounded-full bg-white text-red-500 hover:bg-red-50 flex items-center justify-center">
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
            <h3 className="text-xl font-bold text-navy-700">{editing ? "编辑部门" : "新建部门"}</h3>
            <button type="button" onClick={() => setCreateOpen(false)} className="text-gray-400 hover:text-navy-700">
              <I name="x" size={20} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input containerClassName="col-span-2" label="部门名 *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
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
