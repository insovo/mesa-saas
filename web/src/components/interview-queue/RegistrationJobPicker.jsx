import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, Input, LoadingBlock, Modal } from "../Primitives.jsx";
import { publicQueueApi, queueErrorMessage } from "../../lib/interviewQueueApi.js";

function JdBlock({ title, items, text }) {
  if (!items?.length && !text) return null;
  return <section className="space-y-2"><h3 className="font-bold text-sm">{title}</h3>{items?.length ? <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700 break-words">{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="whitespace-pre-wrap break-words text-sm text-gray-700">{text}</p>}</section>;
}

export default function RegistrationJobPicker({ token, jobs, selectedTitle, onSelect, onClose }) {
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState(null);
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const scrollRef = useRef(null);
  const listScrollTopRef = useRef(0);
  const openJob = (item) => {
    listScrollTopRef.current = scrollRef.current?.scrollTop || 0;
    setViewing(item);
  };
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = viewing ? 0 : listScrollTopRef.current;
  }, [viewing]);
  useEffect(() => {
    if (!viewing) return;
    let active = true;
    setJob(null); setError("");
    publicQueueApi.job(token, viewing.id).then((result) => { if (active) setJob(result); }).catch((err) => { if (active) setError(queueErrorMessage(err)); });
    return () => { active = false; };
  }, [token, viewing, retry]);
  const visible = jobs.filter((item) => [item.title, item.location, item.educationRequirement].filter(Boolean).join(" ").toLowerCase().includes(search.trim().toLowerCase()));
  return <Modal open onClose={onClose} maxWidth="max-w-2xl" scrollContainerRef={scrollRef}><div className="p-5 md:p-6 space-y-5 text-navy-700">
    <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-xl">{viewing ? "岗位 JD 详情" : "查看校招岗位"}</h2><p className="text-xs text-gray-600 mt-2">查看和选择岗位后，已填写的登记信息会保留。</p></div><button type="button" aria-label="返回登记表" className="p-2 text-gray-600" onClick={onClose}>✕</button></div>
    {viewing ? <><button type="button" className="text-sm text-brand" onClick={() => { setViewing(null); setJob(null); setError(""); }}>← 返回岗位列表</button><h3 className="text-lg font-bold break-words">{viewing.title}</h3>{error ? <div className="space-y-3"><p className="text-sm text-red-500">{error}</p><Button type="button" size="sm" variant="secondary" onClick={() => setRetry((value) => value + 1)}>重新加载 JD</Button></div> : !job ? <LoadingBlock height="h-40" label="加载岗位 JD…" /> : <><p className={`rounded-xl px-3 py-2 text-sm ${job.kind === "onsite" ? "bg-lightPrimary text-brand" : "bg-amber-50 text-amber-700"}`}>{job.kind === "onsite" ? "现场面试岗位 · 可选择并参加面试排队" : "内推岗位，非现场面试 · 不参加本次面试排队"}</p><p className="text-sm text-gray-600">{[job.dept, job.location, job.employment].filter(Boolean).join(" · ")}</p><div className="flex flex-wrap gap-2 text-xs">{[job.educationRequirement, job.languageRequirement, job.salary].filter(Boolean).map((label, index) => <span key={index} className="bg-lightPrimary px-3 py-2 rounded-lg">{label}</span>)}</div><JdBlock title="岗位职责" items={job.responsibilities} /><JdBlock title="任职要求" items={job.requirements} />{!job.responsibilities?.length && !job.requirements?.length && <JdBlock title="岗位描述" text={job.description || "暂无岗位描述"} />}<JdBlock title="加分项" items={job.nice} /><JdBlock title="福利待遇" items={job.benefits} /></>}</> : <>
      <Input aria-label="搜索校招岗位" placeholder="搜索岗位名称、工作地点、学历要求" value={search} onChange={(event) => setSearch(event.target.value)} />
      <div className="space-y-3">{visible.map((item) => <article key={item.id} className={`rounded-xl border p-4 space-y-3 ${selectedTitle === item.title ? "border-brand/40 bg-lightPrimary/50" : "border-gray-100"}`}><button type="button" className="font-bold text-left text-brand break-words" onClick={() => openJob(item)}>{item.title}</button><p className={`text-xs ${item.kind === "onsite" ? "text-brand" : "text-amber-700"}`}>{item.kind === "onsite" ? "现场面试" : "内推，非现场面试"}</p><p className="text-xs text-gray-600">{[item.location, item.employment, item.educationRequirement].filter(Boolean).join(" · ")}</p><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary" aria-label={`查看${item.title}JD`} onClick={() => openJob(item)}>查看 JD</Button><Button type="button" size="sm" aria-label={`选择${item.title}`} disabled={item.kind !== "onsite"} onClick={() => onSelect(item.title)}>{item.kind !== "onsite" ? "内推 · 不参加排队" : selectedTitle === item.title ? "已选 · 返回填写" : "选择此岗位"}</Button></div></article>)}{!visible.length && <p className="text-sm text-gray-600 py-6 text-center">{jobs.length ? "没有符合搜索条件的岗位" : "暂无可选择的校招岗位"}</p>}</div>
    </>}
  </div>{viewing && job && <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4 flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>返回继续填写</Button><Button type="button" disabled={job.kind !== "onsite"} onClick={() => onSelect(job.title)}>{job.kind === "onsite" ? "选择此岗位并返回" : "内推 · 非现场面试"}</Button></div>}</Modal>;
}
