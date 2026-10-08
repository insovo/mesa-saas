import { useState } from "react";
import { Button, I, Input, Modal, toast } from "../Primitives.jsx";
import JobQuickOptions, { appendQuickLine } from "../JobQuickOptions.jsx";
import { Select, fmtDate } from "./ui.jsx";

const FIELDS = [
  ["kind", "岗位类型"], ["dept", "部门"], ["location", "工作地点"], ["employment", "用工类型"],
  ["salary", "薪资"], ["educationRequirement", "学历要求"], ["languageRequirement", "语言要求"],
  ["openings", "招聘名额"], ["deadline", "截止投递日期"],
  ["niceAdd", "加分项（追加）"], ["benefitsAdd", "福利待遇（追加）"],
];
const LIMITS = { dept: 100, location: 100, salary: 200, educationRequirement: 100, languageRequirement: 200 };
const EMPLOYMENTS = ["全职", "实习", "兼职", "合同制"];

function fieldValue(sj, key) {
  if (key === "kind") return sj.kind;
  if (key === "niceAdd") return sj.job?.nice || [];
  if (key === "benefitsAdd") return sj.job?.benefits || [];
  if (key === "deadline") return sj.job?.deadline ? fmtDate(sj.job.deadline) : "";
  return sj.job?.[key] ?? "";
}

function initialForm(selected) {
  return Object.fromEntries(FIELDS.map(([key]) => {
    if (key === "niceAdd" || key === "benefitsAdd") return [key, ""];
    const values = selected.map((sj) => fieldValue(sj, key));
    const same = values.every((value) => value === values[0]);
    return [key, same ? String(values[0]) : ""];
  }));
}

function currentSummary(selected, key) {
  const values = selected.map((sj) => fieldValue(sj, key));
  const labels = [...new Set(values.map((value) => {
    if (key === "kind") return value === "onsite" ? "现场面试" : "内推";
    if (key === "openings") return value === 0 ? "不限制" : `${value} 人`;
    if (Array.isArray(value)) return value.length ? value.join("、") : "无";
    return value || "未填写";
  }))];
  const summary = labels.length === 1 ? labels[0] : `各岗位不同（${labels.slice(0, 2).join(" / ")}${labels.length > 2 ? ` 等 ${labels.length} 种` : ""}）`;
  return `当前：${summary}`;
}

export default function BulkJobEditModal({ selected, onClose, onSave }) {
  const [initial] = useState(() => initialForm(selected));
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = new Set(FIELDS.filter(([key]) => form[key] !== initial[key]).map(([key]) => key));
  const change = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const set = (key) => (e) => change(key, e.target.value);
  const pick = (key, value) => setForm((prev) => ({ ...prev, [key]: key === "niceAdd" || key === "benefitsAdd" ? appendQuickLine(prev[key], value) : value }));
  const close = () => { if (!saving) onClose(); };

  async function submit(e) {
    e.preventDefault();
    if (saving || !dirty.size) return;
    const changes = {};
    for (const key of dirty) {
      if (key === "openings") {
        const value = Number(form.openings);
        if (form.openings === "" || !Number.isInteger(value) || value < 0 || value > 999) return toast("招聘名额须为 1–999 的整数,或选择不限制", "error");
        changes.openings = value;
      } else if (key === "deadline") {
        changes.deadline = form.deadline ? new Date(`${form.deadline}T23:59:59`).toISOString() : null;
      } else if (key === "kind") {
        if (!form.kind) return toast("请选择岗位类型", "error");
        changes.kind = form.kind;
      } else if (key === "niceAdd" || key === "benefitsAdd") {
        const items = [...new Set(form[key].split("\n").map((line) => line.replace(/^\s*(?:[-•*]|\d+[.、)])\s*/, "").trim()).filter(Boolean))];
        const limit = key === "niceAdd" ? 500 : 200;
        const label = key === "niceAdd" ? "加分项" : "福利待遇";
        if (!items.length || items.length > 20 || items.some((item) => item.length > limit)) return toast(`${label}请填写 1–20 条,每条不超过 ${limit} 字`, "error");
        changes[key] = items;
      } else {
        changes[key] = key === "employment" && form[key] === "__clear__" ? null : form[key].trim() || null;
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
            <p className="text-xs text-gray-600 mt-1">直接填写要修改的字段,红字显示所选岗位的原值;未改动字段不会保存。JD 字段属于共享岗位,其他专场也会同步更新。</p>
          </div>
          <button type="button" aria-label="关闭批量编辑" disabled={saving} onClick={close} className="p-1.5 rounded-lg hover:bg-lightPrimary text-gray-500"><I name="x" size={16} /></button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FIELDS.map(([key, label]) => {
            const current = currentSummary(selected, key);
            return (
            <div key={key} className="space-y-2">
              <div className="flex items-baseline gap-2 flex-wrap"><label htmlFor={`bulk-job-${key}`} className="text-sm font-bold text-navy-700">{label}</label><span className="text-[11px] text-red-500 break-all" title={current}>{current.length > 75 ? `${current.slice(0, 75)}…` : current}</span></div>
              {key === "kind" ? (
                <Select id="bulk-job-kind" aria-label="批量岗位类型" disabled={saving} value={form.kind} onChange={set(key)}><option value="" disabled>请选择岗位类型</option><option value="onsite">现场面试</option><option value="referral">内推</option></Select>
              ) : key === "employment" ? (
                <Select id="bulk-job-employment" aria-label="批量用工类型" disabled={saving} value={form.employment} onChange={set(key)}><option value="" disabled>请选择用工类型</option>{EMPLOYMENTS.map((item) => <option key={item} value={item}>{item}</option>)}{form.employment && form.employment !== "__clear__" && !EMPLOYMENTS.includes(form.employment) && <option value={form.employment}>{form.employment}</option>}<option value="__clear__">清空用工类型</option></Select>
              ) : key === "openings" ? (
                <div className="space-y-2">
                  <Input id="bulk-job-openings" aria-label="批量招聘名额" type="number" min="1" max="999" disabled={saving || form.openings === "0"} value={form.openings === "0" ? "" : form.openings} onChange={set(key)} placeholder="1–999" />
                  <button type="button" aria-pressed={form.openings === "0"} disabled={saving} onClick={() => change("openings", form.openings === "0" ? "1" : "0")} className={`px-2 py-1 rounded-lg text-xs border ${form.openings === "0" ? "border-brand text-brand bg-lightPrimary" : "border-gray-200 text-gray-600 hover:border-brand/40"}`}>不限制</button>
                </div>
              ) : key === "deadline" ? (
                <div><Input id="bulk-job-deadline" aria-label="批量截止投递日期" type="date" disabled={saving} value={form.deadline} onChange={set(key)} /><button type="button" disabled={saving} onClick={() => change("deadline", "")} className="text-[11px] text-brand hover:underline mt-1">清除截止日期</button></div>
              ) : key === "niceAdd" || key === "benefitsAdd" ? (
                <div><textarea id={`bulk-job-${key}`} aria-label={`批量添加${label}`} rows={4} disabled={saving} value={form[key]} onChange={set(key)} placeholder="每行一条,追加到原有内容" className="w-full p-3 rounded-xl border border-gray-200 bg-white/40 text-sm text-navy-700 outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 disabled:bg-gray-100 resize-y" /><JobQuickOptions field={key === "niceAdd" ? "nice" : "benefits"} value={form[key]} onPick={(value) => pick(key, value)} disabled={saving} /><p className="text-[11px] text-gray-500 mt-1">保留原有内容,重复条目不会再添加</p></div>
              ) : (
                <div><Input id={`bulk-job-${key}`} aria-label={`批量${label}`} maxLength={LIMITS[key]} disabled={saving} value={form[key]} onChange={set(key)} placeholder="留空可清除该字段" />{["location", "educationRequirement", "languageRequirement"].includes(key) && <JobQuickOptions field={key} value={form[key]} onPick={(value) => pick(key, value)} disabled={saving} />}</div>
              )}
            </div>
          ); })}
        </div>
        <div className="flex justify-end gap-3 pt-2"><Button type="button" variant="ghost" disabled={saving} onClick={close}>取消</Button><Button type="submit" disabled={saving || !dirty.size}>{saving ? "保存中…" : `应用到 ${selected.length} 个岗位`}</Button></div>
      </form>
    </Modal>
  );
}
