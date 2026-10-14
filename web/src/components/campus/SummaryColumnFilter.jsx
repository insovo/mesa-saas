import { useState } from "react";
import { Button, I, Input, Modal } from "../Primitives.jsx";

export default function SummaryColumnFilter({ column, options, values, onApply, onClose }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(() => new Set(values ?? options.map(({ value }) => value)));
  const choices = [...options, ...(values || []).filter((value) => !options.some((option) => option.value === value)).map((value) => ({ value, count: 0 }))];
  const visible = choices.filter(({ value }) => (value || "(空白)").toLowerCase().includes(search.trim().toLowerCase()));
  const allVisible = visible.length > 0 && visible.every(({ value }) => selected.has(value));
  function apply() {
    const included = search.trim() ? visible.filter(({ value }) => selected.has(value)).map(({ value }) => value) : [...selected];
    onApply(choices.every(({ value }) => included.includes(value)) ? null : included);
  }
  function toggle(value) {
    setSelected((current) => { const next = new Set(current); next.has(value) ? next.delete(value) : next.add(value); return next; });
  }
  return <Modal open onClose={onClose} maxWidth="max-w-sm">
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3"><h2 className="font-bold text-navy-700">筛选 · {column.label}</h2><button type="button" onClick={onClose} aria-label="关闭筛选" className="p-2 text-gray-600"><I name="x" size={18} /></button></div>
      <Input aria-label="搜索列内容" placeholder="搜索列内容" value={search} onChange={(event) => setSearch(event.target.value)} icon={<I name="search" size={16} />} className="!h-9" />
      <label className="flex items-center gap-2 text-sm text-navy-700"><input type="checkbox" checked={allVisible} disabled={!visible.length} className="accent-brand" onChange={() => setSelected((current) => { const next = new Set(current); visible.forEach(({ value }) => allVisible ? next.delete(value) : next.add(value)); return next; })} />{search ? "全选搜索结果" : "全选"}</label>
      <div className="max-h-[min(40vh,300px)] overflow-y-auto space-y-1 border-y border-gray-100 py-2">
        {visible.map(({ value, count }) => <label key={value} className="flex items-start gap-2 rounded-lg p-2 text-sm text-navy-700 hover:bg-lightPrimary cursor-pointer"><input type="checkbox" checked={selected.has(value)} onChange={() => toggle(value)} className="mt-0.5 accent-brand" /><span className="min-w-0 flex-1 break-words">{value || "(空白)"}</span><span className="text-xs text-gray-500">{count}</span></label>)}
        {!visible.length && <p className="p-3 text-xs text-gray-500">无匹配内容</p>}
      </div>
      <div className="flex items-center justify-between gap-2"><button type="button" className="text-xs text-brand" onClick={() => onApply(null)}>清除此列筛选</button><div className="flex gap-2"><Button size="sm" variant="ghost" onClick={onClose}>取消</Button><Button size="sm" onClick={apply}>应用</Button></div></div>
    </div>
  </Modal>;
}
