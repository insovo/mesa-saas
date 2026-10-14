// 专场仅查看统一校招岗位，配置在岗位 tab 维护。
import { useEffect, useState } from "react";
import { resources } from "../../lib/api.js";
import { KindTag, errMsg } from "./ui.jsx";

export default function SessionJobsPanel({ session }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    resources.campus.listSessionJobs(session.id).then((rows) => { if (active) setItems(rows); }).catch((err) => { if (active) setError(errMsg(err)); });
    return () => { active = false; };
  }, [session.id]);
  return <div className="space-y-3">
    <p className="text-xs text-gray-600">所有专场共用同一份校招岗位，在「岗位」tab 统一维护。</p>
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    {!items && !error && <p className="text-xs text-gray-500">加载岗位中…</p>}
    {items?.map((item) => <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl bg-lightPrimary/50">
      <span className="flex-1 min-w-0 truncate text-sm font-bold text-navy-700">{item.job?.title}</span><KindTag kind={item.kind} />
      <span className="text-xs text-gray-600">{item.matchEnabled && item.job?.hasEvaluationModel ? "参与匹配" : "未参与匹配"}</span>
    </div>)}
    {items?.length === 0 && <p className="text-xs text-gray-500">尚未添加校招岗位</p>}
  </div>;
}
