import { useEffect, useState } from "react";
import { resources } from "../lib/api.js";
import { useHasModule } from "../lib/authContext.jsx";
import {
  Card,
  I,
  Empty,
  LoadingBlock,
  toast,
} from "../components/Primitives.jsx";
import { INTERVIEW_STATUS_TONE } from "../lib/constants.js";

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function groupByDate(items) {
  const buckets = new Map();
  items.forEach((iv) => {
    if (!iv.scheduledAt) return;
    const d = new Date(iv.scheduledAt);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(iv);
  });
  return Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b));
}

export default function Interviews() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const canDelete = useHasModule("interview.delete");

  async function onDelete(iv) {
    const who = iv.candidate?.name || iv.candidateName || "该候选人";
    if (!confirm(`确定删除「${who}」的这场面试安排吗?此操作不可恢复。`)) return;
    try {
      await resources.interviews.remove(iv.id);
      toast("已删除", "success");
      setItems((prev) => prev.filter((x) => x.id !== iv.id));
    } catch (e) {
      toast(e.response?.data?.message || e.message || "删除失败", "error");
    }
  }

  async function load() {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const { items } = await resources.interviews.list(params);
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
  }, [statusFilter]);

  const grouped = groupByDate(items);
  const statuses = Object.keys(INTERVIEW_STATUS_TONE);

  return (
    <div className="space-y-6">
      <Card className="p-4 !flex-row items-center justify-start gap-2 overflow-x-auto">
        <button
          onClick={() => setStatusFilter("")}
          className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition
            ${statusFilter === "" ? "bg-brand text-white" : "text-gray-700 hover:bg-lightPrimary"}`}
        >
          全部 · {items.length}
        </button>
        {statuses.map((s) => {
          const tone = INTERVIEW_STATUS_TONE[s];
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
              className={`px-3 py-1.5 rounded-full whitespace-nowrap transition text-xs font-bold ${
                statusFilter === s ? "ring-2 ring-brand/40" : ""
              }`}
              style={{ background: tone.bg, color: tone.fg }}
            >
              {s}
            </button>
          );
        })}
      </Card>

      {loading ? (
        <LoadingBlock height="h-40" />
      ) : grouped.length === 0 ? (
        <Card className="p-6">
          <Empty icon="calendar" title="暂无面试安排" desc="在候选人详情里点「安排面试」即可创建" />
        </Card>
      ) : (
        grouped.map(([date, list]) => (
          <Card key={date} className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="title-card flex items-center gap-2">
                <I name="calendar-days" size={18} className="text-brand" />
                {date}
              </h3>
              <span className="text-xs text-gray-700">{list.length} 场</span>
            </div>
            <ul className="divide-y divide-gray-200">
              {list.map((iv) => {
                const tone = INTERVIEW_STATUS_TONE[iv.status] || INTERVIEW_STATUS_TONE["已安排"];
                return (
                  <li key={iv.id} className="py-4 flex items-center gap-4 flex-wrap">
                    <div className="w-16 text-right shrink-0">
                      <p className="text-lg font-bold text-navy-700 leading-tight">
                        {iv.scheduledAt ? fmtDateTime(iv.scheduledAt).split(" ")[1] : "—"}
                      </p>
                      <p className="text-[11px] text-gray-700 mt-0.5">{iv.mode || "—"}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-navy-700">
                        {iv.candidate?.name || iv.candidateName || "—"} · {iv.job?.title || iv.jobTitle || "—"}
                      </p>
                      <p className="text-xs text-gray-700 mt-1">
                        {iv.round || "—"} · 面试官 {iv.interviewer || "—"}
                      </p>
                      {iv.notes && <p className="text-xs text-gray-700 mt-1">备注 · {iv.notes}</p>}
                    </div>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold whitespace-nowrap"
                      style={{ background: tone.bg, color: tone.fg }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone.dot }}></span>
                      {iv.status}
                    </span>
                    {iv.recommendation && iv.recommendation !== "—" && (
                      <span className="text-[11px] font-bold text-brand px-2 py-0.5 rounded-full bg-brand-50">
                        {iv.recommendation}
                      </span>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => onDelete(iv)}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                        title="删除面试安排"
                      >
                        <I name="trash-2" size={14} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
