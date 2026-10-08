import { useEffect, useState } from "react";
import { I } from "../Primitives.jsx";

export default function ModelGenerationNotice({ notice, onDismiss }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (notice?.status !== "running") return;
    const update = () => setElapsed(Math.floor((Date.now() - notice.startedAt) / 1000));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [notice?.startedAt, notice?.status]);
  if (!notice) return null;

  const running = notice.status === "running";
  const failed = notice.status === "error";
  const title = running ? "正在生成评价模型" : failed ? "评价模型生成未完成" : "评价模型生成完成";
  return (
    <div role={failed ? "alert" : "status"} aria-atomic="true" className={`fixed bottom-4 left-4 right-4 sm:left-auto sm:w-96 z-[190] rounded-card border p-4 shadow-glow-lg bg-white ${failed ? "border-red-200" : "border-brand/20"}`}>
      <div className="flex items-start gap-3">
        <I name={running ? "loader" : failed ? "alert-triangle" : "check-circle"} size={19} className={`shrink-0 mt-0.5 ${running ? "animate-spin text-brand" : failed ? "text-red-600" : "text-green-600"}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-navy-700">{title}</p>
          {notice.mode === "single" ? <p className="text-xs text-gray-700 mt-1 break-words">岗位：{notice.title}</p> : <p className="text-xs text-gray-700 mt-1">{running ? `正在处理：${notice.current} · 已完成 ${notice.done}/${notice.total}` : `成功 ${notice.total - notice.failed} 个，失败 ${notice.failed} 个`}</p>}
          {running ? <p className="text-xs text-gray-600 mt-1">正在分析 JD 并生成模型，已等待 {elapsed} 秒。完成后会显示结果。</p> : <p className={`text-xs mt-1 break-words ${failed ? "text-red-700" : "text-green-700"}`}>{notice.message}</p>}
        </div>
        {!running && <button type="button" aria-label="关闭生成结果" onClick={onDismiss} className="shrink-0 p-1 text-gray-500 hover:text-navy-700"><I name="x" size={14} /></button>}
      </div>
    </div>
  );
}
