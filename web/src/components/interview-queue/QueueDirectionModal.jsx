import { useId, useState } from "react";
import { Button, I, Input, Modal } from "../Primitives.jsx";
import RegistrationJobPicker from "./RegistrationJobPicker.jsx";

export default function QueueDirectionModal({ row, jobs, loadJob, onClose, onConfirm }) {
  const [direction, setDirection] = useState(row.jobDirection);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [browsing, setBrowsing] = useState(false);
  const id = useId();
  const options = jobs.filter((job) => [job.title, job.location, job.educationRequirement].filter(Boolean).join(" ").toLowerCase().includes(search.trim().toLowerCase()));
  function choose(title) { setDirection(title); setExpanded(false); setActiveIndex(-1); }
  function keyDown(event) {
    if (event.key === "Escape" && expanded) { event.stopPropagation(); setExpanded(false); }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setExpanded(true);
      const next = !options.length ? -1 : activeIndex < 0 ? event.key === "ArrowDown" ? 0 : options.length - 1 : (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      setActiveIndex(next);
      document.getElementById(`${id}-option-${next}`)?.scrollIntoView({ block: "nearest" });
    }
    if (event.key === "Enter" && expanded && activeIndex >= 0 && options[activeIndex]) { event.preventDefault(); choose(options[activeIndex].title); }
  }
  if (browsing) return <RegistrationJobPicker interviewer jobs={jobs} selectedTitle={direction} loadJob={loadJob} onClose={() => setBrowsing(false)} onSelect={(title) => { choose(title); setBrowsing(false); }} />;
  return <Modal open onClose={onClose} maxWidth="max-w-lg"><form className="p-5 md:p-6 space-y-4" onSubmit={(event) => { event.preventDefault(); if (direction.trim()) onConfirm(direction.trim()); }}>
    <h2 className="font-bold text-xl">修改岗位方向 · {row.name}</h2>
    <div>
      <label htmlFor={id} className="text-sm font-bold ml-3 block mb-2">岗位方向<span className="text-red-500"> *</span></label>
      <div className="relative"><Input id={id} role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${id}-options`} aria-activedescendant={expanded && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined} value={direction} required maxLength={200} autoComplete="off" placeholder="搜索或选择岗位，也可自行填写" className="pr-12" onFocus={() => { setExpanded(true); setSearch(""); }} onChange={(event) => { setDirection(event.target.value); setSearch(event.target.value); setExpanded(true); setActiveIndex(-1); }} onKeyDown={keyDown} /><button type="button" aria-label={expanded ? "收起岗位菜单" : "展开岗位菜单"} aria-expanded={expanded} aria-controls={`${id}-options`} className="absolute right-0 top-0 h-12 px-4 text-gray-700" onClick={() => { setExpanded(!expanded); setSearch(""); setActiveIndex(-1); }}><I name="chevron-down" size={18} /></button></div>
      {expanded && <div id={`${id}-options`} role="listbox" aria-label="校招岗位选项" className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white">{options.map((job, index) => <button key={job.id} id={`${id}-option-${index}`} type="button" role="option" aria-selected={direction === job.title} className={`w-full px-4 py-3 text-left text-sm hover:bg-lightPrimary ${index === activeIndex || direction === job.title ? "bg-lightPrimary text-brand" : "text-navy-700"}`} onClick={() => choose(job.title)}><span className="block break-words">{job.title}</span><span className="text-xs text-gray-600">{job.kind === "onsite" ? "现场面试" : "内推，非现场面试"}</span></button>)}{!options.length && <p className="p-4 text-sm text-gray-600">没有符合条件的岗位，可继续搜索或自行填写。</p>}</div>}
    </div>
    <button type="button" className="text-sm text-brand font-medium" onClick={() => { setExpanded(false); setBrowsing(true); }}>浏览校招岗位与 JD →</button>
    <div className="flex justify-end gap-3"><Button variant="ghost" type="button" onClick={onClose}>取消</Button><Button type="submit" disabled={!direction.trim()}>下一步确认</Button></div>
  </form></Modal>;
}
