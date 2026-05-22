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
  UrgencyChip,
  toast,
  Tag,
} from "../components/Primitives.jsx";

const EMPTY_FORM = { title: "", dept: "", owner: "", openings: 1, candidates: 0, level: "", location: "", urgency: "mid", description: "" };

export default function Jobs() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [urgency, setUrgency] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  async function load() {
    setLoading(true);
    try {
      const params = {};
      if (q) params.q = q;
      if (urgency) params.urgency = urgency;
      const { items } = await resources.jobs.list(params);
      setItems(items);
    } catch (e) {
      toast(e.response?.data?.message || e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [urgency]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setCreateOpen(true);
  }

  function openEdit(j) {
    setEditing(j);
    setForm({
      title: j.title || "",
      dept: j.dept || "",
      owner: j.owner || "",
      openings: j.openings || 1,
      candidates: j.candidates || 0,
      level: j.level || "",
      location: j.location || "",
      urgency: j.urgency || "mid",
      description: j.description || "",
    });
    setCreateOpen(true);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.title) return;
    const payload = {
      ...form,
      openings: Number(form.openings) || 1,
      candidates: Number(form.candidates) || 0,
    };
    try {
      if (editing) {
        await resources.jobs.update(editing.id, payload);
        toast("已更新", "success");
      } else {
        await resources.jobs.create(payload);
        toast("已创建", "success");
      }
      setCreateOpen(false);
      load();
    } catch (e) {
      toast(e.response?.data?.message || "保存失败", "error");
    }
  }

  async function onDelete(j) {
    if (!confirm(`删除岗位「${j.title}」?`)) return;
    try {
      await resources.jobs.remove(j.id);
      toast("已删除", "success");
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-4 !flex-row items-center justify-start gap-2 overflow-x-auto">
        {[
          { v: "", l: "全部" },
          { v: "high", l: "紧急" },
          { v: "mid", l: "正常" },
          { v: "low", l: "可缓" },
        ].map((b) => (
          <button
            key={b.v}
            onClick={() => setUrgency(b.v === urgency ? "" : b.v)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition
              ${urgency === b.v ? "bg-brand text-white" : "text-gray-700 hover:bg-lightPrimary"}`}
          >
            {b.l}
          </button>
        ))}
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex-1 min-w-[240px] flex items-center bg-lightPrimary rounded-xl pl-4 h-11">
            <I name="search" size={16} className="text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="搜索岗位 / 部门 / Owner"
              className="flex-1 ml-3 bg-transparent outline-none text-sm text-navy-700 placeholder:text-gray-400"
            />
          </div>
          <Button variant="ghost" onClick={load} icon={<I name="refresh-cw" size={14} />}>刷新</Button>
          <Button onClick={openCreate} icon={<I name="plus" size={16} />}>新建岗位</Button>
        </div>

        {loading ? (
          <LoadingBlock height="h-40" />
        ) : items.length === 0 ? (
          <Empty title="暂无岗位" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map((j) => (
              <div
                key={j.id}
                className="group p-5 rounded-card bg-lightPrimary hover:bg-white hover:shadow-card transition relative"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-navy-700 truncate">{j.title}</h3>
                    <p className="text-xs text-gray-700 mt-1">{j.dept || "—"} · {j.location || "—"}</p>
                  </div>
                  <UrgencyChip urgency={j.urgency} />
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {j.level && <Tag tone="brand">{j.level}</Tag>}
                  {j.owner && <Tag>负责人 · {j.owner}</Tag>}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
                  <div className="bg-white rounded-xl p-2.5">
                    <p className="text-gray-700 text-[11px]">名额</p>
                    <p className="text-lg font-bold text-navy-700 mt-0.5">{j.openings}</p>
                  </div>
                  <div className="bg-white rounded-xl p-2.5" title="已关联此 JD 的候选人数 (实时统计)">
                    <p className="text-gray-700 text-[11px]">候选人</p>
                    <p className="text-lg font-bold text-navy-700 mt-0.5">{j._count?.linkedCandidates ?? j.candidates ?? 0}</p>
                  </div>
                  <div className="bg-white rounded-xl p-2.5" title="已入职到此岗位的员工数 (Employee 表)">
                    <p className="text-gray-700 text-[11px]">在职</p>
                    <p className="text-lg font-bold text-green-600 mt-0.5">{j._count?.employees ?? 0}</p>
                  </div>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition absolute bottom-3 right-3 flex gap-1.5">
                  <button
                    onClick={() => openEdit(j)}
                    className="w-7 h-7 rounded-full bg-white text-gray-700 hover:text-brand hover:bg-lightPrimary flex items-center justify-center shadow-sm"
                    title="编辑"
                  >
                    <I name="pencil" size={12} />
                  </button>
                  <button
                    onClick={() => onDelete(j)}
                    className="w-7 h-7 rounded-full bg-white text-red-500 hover:bg-red-50 flex items-center justify-center shadow-sm"
                    title="删除"
                  >
                    <I name="trash-2" size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="max-w-3xl">
        <form onSubmit={onSubmit} className="p-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-navy-700">{editing ? "编辑岗位" : "新建岗位"}</h3>
            <button type="button" onClick={() => setCreateOpen(false)} className="text-gray-400 hover:text-navy-700">
              <I name="x" size={20} />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input containerClassName="md:col-span-2" label="岗位名 *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />

            {/* JD 描述 — 关键信息,放在显眼位置 */}
            <div className="md:col-span-2">
              <label className="text-sm text-navy-700 font-bold ml-3 block mb-2 flex items-center gap-2">
                <I name="file-text" size={14} className="text-brand" />
                JD 描述 <span className="text-[11px] text-amber-700 font-normal">★ 关键 · 用于 AI 候选人匹配度评估</span>
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={10}
                placeholder={`示例 ——\n岗位职责:\n1. ...\n2. ...\n\n任职要求:\n1. 5 年以上 XX 经验\n2. 熟悉 ...\n3. 学历 ...\n\n加分项:\n- ...`}
                className="w-full p-3 rounded-xl border-2 border-gray-200 text-sm text-navy-700 outline-none focus:border-brand resize-y font-mono leading-relaxed"
              />
              <div className="flex items-center justify-between mt-1.5 ml-1">
                <p className={`text-[11px] ${form.description.length < 200 ? "text-amber-700" : "text-gray-600"}`}>
                  {form.description.length < 200
                    ? `当前 ${form.description.length} 字符 · 建议至少 200 字让 AI 评估更准`
                    : `${form.description.length} 字符 ✓`}
                </p>
                <p className="text-[11px] text-gray-600">上限 20,000</p>
              </div>
            </div>

            <Input label="部门" value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value })} />
            <Input label="负责人" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
            <Input label="职级" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} placeholder="如 P6–P7" />
            <Input label="工作地点" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            <Input label="名额" type="number" min="0" value={form.openings} onChange={(e) => setForm({ ...form, openings: e.target.value })} />
            <Input label="候选人数" type="number" min="0" value={form.candidates} onChange={(e) => setForm({ ...form, candidates: e.target.value })} />
            <div>
              <label className="text-sm text-navy-700 font-bold ml-3 block mb-2">优先级</label>
              <select
                value={form.urgency}
                onChange={(e) => setForm({ ...form, urgency: e.target.value })}
                className="w-full h-12 rounded-xl border border-gray-200 px-3 text-sm text-navy-700 outline-none focus:border-brand"
              >
                <option value="high">紧急</option>
                <option value="mid">正常</option>
                <option value="low">可缓</option>
              </select>
            </div>
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
