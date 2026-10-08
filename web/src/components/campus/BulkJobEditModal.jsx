import { useState } from "react";
import { Button, I, Input, Modal, toast } from "../Primitives.jsx";
import JobQuickOptions, { appendQuickLine } from "../JobQuickOptions.jsx";
import { Select } from "./ui.jsx";

const FIELDS = [
  ["kind", "岗位类型"], ["dept", "部门"], ["location", "工作地点"], ["employment", "用工类型"],
  ["salary", "薪资"], ["educationRequirement", "学历要求"], ["languageRequirement", "语言要求"],
  ["openings", "招聘名额"], ["deadline", "截止投递日期"],
  ["niceAdd", "加分项（追加）"], ["benefitsAdd", "福利待遇（追加）"],
];
const LIMITS = { dept: 100, location: 100, salary: 200, educationRequirement: 100, languageRequirement: 200 };
const EMPTY = { kind: "onsite", dept: "", location: "芜湖", employment: "全职", salary: "", educationRequirement: "", languageRequirement: "", openings: "1", deadline: "", niceAdd: "", benefitsAdd: "" };

export default function BulkJobEditModal({ selected, onClose, onSave }) {
  const [enabled, setEnabled] = useState(() => new Set());
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  const toggle = (key) => setEnabled((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  const pick = (key, value) => {
    setEnabled((prev) => new Set(prev).add(key));
    setForm((prev) => ({ ...prev, [key]: key === "niceAdd" || key === "benefitsAdd" ? appendQuickLine(prev[key], value) : value }));
  };
  const close = () => { if (!saving) onClose(); };

  async function submit(e) {
    e.preventDefault();
    if (saving || !enabled.size) return;
    const changes = {};
    for (const key of enabled) {
      if (key === "openings") {
        const value = Number(form.openings);
        if (form.openings === "" || !Number.isInteger(value) || value < 0 || value > 999) return toast("招聘名额须为 1–999 的整数,或选择不限制", "error");
        changes.openings = value;
      } else if (key === "deadline") {
        changes.deadline = form.deadline ? new Date(`${form.deadline}T23:59:59`).toISOString() : null;
      } else if (key === "kind") {
        changes.kind = form.kind;
      } else if (key === "niceAdd" || key === "benefitsAdd") {
        const items = [...new Set(form[key].split("\n").map((line) => line.replace(/^\s*(?:[-•*]|\d+[.、)])\s*/, "").trim()).filter(Boolean))];
        const limit = key === "niceAdd" ? 500 : 200;
        const label = key === "niceAdd" ? "加分项" : "福利待遇";
        if (!items.length || items.length > 20 || items.some((item) => item.length > limit)) return toast(`${label}请填写 1–20 条,每条不超过 ${limit} 字`, "error");
        changes[key] = items;
      } else {
        changes[key] = form[key].trim() || null;
      }
    }
    setSaving(true);
    try { if (await onSave(changes)) onClose(); }
    finally { setSaving(false); }
  }

  return (
    <Modal open onClose={close} maxWidth="max-w-2xl">
      <form onSubmit={submit} className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-navy-700">批量编辑 {selected.length} 个岗位</h3>
            <p className="text-xs text-gray-600 mt-1">只会修改勾选的字段。JD 字段属于共享岗位,系统岗位页及其他专场会同步更新。</p>
          </div>
          <button type="button" aria-label="关闭批量编辑" disabled={saving} onClick={close} className="p-1.5 rounded-lg hover:bg-lightPrimary text-gray-500"><I name="x" size={16} /></button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FIELDS.map(([key, label]) => (
            <div key={key} className="space-y-2">
              <label className="inline-flex items-center gap-2 text-sm font-bold text-navy-700">
                <input type="checkbox" className="accent-brand" checked={enabled.has(key)} onChange={() => toggle(key)} aria-label={`批量修改${label}`} />{label}
              </label>
              {key === "kind" ? (
                <Select aria-label="批量岗位类型" disabled={!enabled.has(key)} value={form.kind} onChange={set(key)}><option value="onsite">现场面试</option><option value="referral">内推</option></Select>
              ) : key === "employment" ? (
                <Select aria-label="批量用工类型" disabled={!enabled.has(key)} value={form.employment} onChange={set(key)}><option value="">清空</option><option value="全职">全职</option><option value="实习">实习</option><option value="兼职">兼职</option><option value="合同制">合同制</option></Select>
              ) : key === "openings" ? (
                <div className="space-y-2">
                  <Input id="bulk-job-openings" aria-label="批量招聘名额" type="number" min="1" max="999" disabled={!enabled.has(key) || form.openings === "0"} value={form.openings === "0" ? "" : form.openings} onChange={set(key)} placeholder="1–999" />
                  <label className="inline-flex items-center gap-2 text-xs text-navy-700"><input type="checkbox" className="accent-brand" disabled={!enabled.has(key)} checked={form.openings === "0"} onChange={(e) => setForm((prev) => ({ ...prev, openings: e.target.checked ? "0" : "1" }))} />不限制</label>
                </div>
              ) : key === "deadline" ? (
                <div><Input id="bulk-job-deadline" aria-label="批量截止投递日期" type="date" disabled={!enabled.has(key)} value={form.deadline} onChange={set(key)} /><p className="text-[11px] text-gray-500 mt-1">留空可清除截止日期</p></div>
              ) : key === "niceAdd" || key === "benefitsAdd" ? (
                <div><textarea aria-label={`批量添加${label}`} rows={4} disabled={!enabled.has(key)} value={form[key]} onChange={set(key)} placeholder="每行一条,追加到原有内容" className="w-full p-3 rounded-xl border border-gray-200 bg-white/40 text-sm text-navy-700 outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 disabled:bg-gray-100 resize-y" /><JobQuickOptions field={key === "niceAdd" ? "nice" : "benefits"} value={enabled.has(key) ? form[key] : ""} onPick={(value) => pick(key, value)} disabled={saving} /><p className="text-[11px] text-gray-500 mt-1">保留原有内容,重复条目不会再添加</p></div>
              ) : (
                <div><Input id={`bulk-job-${key}`} aria-label={`批量${label}`} maxLength={LIMITS[key]} disabled={!enabled.has(key)} value={form[key]} onChange={set(key)} placeholder="留空可清除该字段" />{["location", "educationRequirement", "languageRequirement"].includes(key) && <JobQuickOptions field={key} value={enabled.has(key) ? form[key] : ""} onPick={(value) => pick(key, value)} disabled={saving} />}</div>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3 pt-2"><Button type="button" variant="ghost" disabled={saving} onClick={close}>取消</Button><Button type="submit" disabled={saving || !enabled.size}>{saving ? "保存中…" : `应用到 ${selected.length} 个岗位`}</Button></div>
      </form>
    </Modal>
  );
}
