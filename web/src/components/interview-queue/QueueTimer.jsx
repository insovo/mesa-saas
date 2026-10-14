import { useEffect, useState } from "react";
import { Button, LiquidLoader } from "../Primitives.jsx";

export default function QueueTimer({ startedAt, culture = false, onStart, disabled }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const seconds = startedAt ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000)) : 0;
  return <div className="flex flex-wrap items-center gap-4">
    <LiquidLoader size={72} level={Math.min(100, seconds / 6)} label={Math.floor(seconds / 60)} tone={seconds >= 600 ? "red" : "blue"} ariaLabel={seconds >= 600 ? "已满十分钟" : "面试计时"} />
    <div className="space-y-1"><p className="font-bold">{culture ? "群面建议 5–10 分钟" : "每人建议 10 分钟"}</p><p className={`font-mono text-xl tabular-nums ${seconds >= 600 ? "text-red-500" : "text-brand"}`}>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</p>{startedAt ? <p className="text-xs text-gray-500">{seconds >= 600 ? "已满 10 分钟" : "计时中 · 刷新后继续"}</p> : <Button size="sm" disabled={disabled} onClick={onStart}>开始计时</Button>}</div>
  </div>;
}
