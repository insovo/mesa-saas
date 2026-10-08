import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { I, toast } from "../Primitives.jsx";

function formatTime(value) {
  return new Date(value).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function CandidateJobRecommendation({ candidateId, canEdit }) {
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null);
    setHistoryOpen(false);
    api.get(`/candidates/${candidateId}/job-recommendation`)
      .then(({ data: result }) => { if (live) setData(result); })
      .catch((error) => { if (live) toast(error.response?.data?.message || "建议岗位加载失败", "error"); });
    return () => { live = false; };
  }, [candidateId]);

  async function chooseJob(jobId) {
    if (saving || jobId === (data?.current?.jobId || "")) return;
    setSaving(true);
    try {
      const { data: result } = await api.put(`/candidates/${candidateId}/job-recommendation`, { jobId: jobId || null });
      setData(result);
      toast("建议岗位已更新", "success");
    } catch (error) {
      toast(error.response?.data?.message || "建议岗位保存失败", "error");
    } finally {
      setSaving(false);
    }
  }

  const current = data?.current;
  const hasMissingOption = current?.jobId && !data.options.some((job) => job.id === current.jobId);

  return (
    <div className="w-full min-w-0 rounded-xl border border-[#CFC8FF] bg-[#F7F5FF] px-3 py-2.5 lg:flex-1 2xl:flex-none">
      <div className="flex items-center gap-1.5 text-xs font-bold text-[#422AFB]">
        <I name="sparkles" size={14} /> 建议岗位
      </div>
      {canEdit ? (
        <select
          aria-label="选择建议岗位"
          value={current?.jobId || ""}
          onChange={(event) => chooseJob(event.target.value)}
          disabled={!data || saving}
          className="mt-1.5 w-full rounded-lg border border-[#B8AEFF] bg-white px-2.5 py-2 text-sm font-semibold text-[#1B254B] focus:outline-none focus:ring-2 focus:ring-[#422AFB] disabled:opacity-60"
        >
          <option value="">暂不建议岗位</option>
          {hasMissingOption && <option value={current.jobId}>{current.jobTitle}（已移出专场）</option>}
          {data?.options.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
        </select>
      ) : <p className="mt-1.5 truncate text-sm font-semibold text-[#1B254B]" title={current?.jobTitle || "尚未选择"}>{current?.jobTitle || "尚未选择"}</p>}
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] text-[#707EAE]">
        <span className="min-w-0 truncate" title={current ? `${current.actorName} · ${formatTime(current.createdAt)}` : ""}>
          {current ? `${current.actorName} · ${formatTime(current.createdAt)}` : "暂无操作记录"}
        </span>
        {!!data?.history.length && <button type="button" onClick={() => setHistoryOpen((open) => !open)} aria-expanded={historyOpen} className="shrink-0 font-semibold text-[#422AFB] hover:underline">{historyOpen ? "收起记录" : "历史记录"}</button>}
      </div>
      {historyOpen && <ol className="mt-2 max-h-40 space-y-1.5 overflow-y-auto border-t border-[#E3DFFF] pt-2 text-[11px] text-[#707EAE]">
        {data.history.map((entry) => <li key={entry.id} className="break-words"><span className="font-semibold text-[#1B254B]">{entry.actorName}</span> · {entry.jobTitle || "清除建议"}<span className="block">{formatTime(entry.createdAt)}</span></li>)}
      </ol>}
    </div>
  );
}
