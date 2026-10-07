// 候选人详情右栏「校招」卡:该候选人若来自校招,显示专场 / 投递 / 简历版本 / 最近匹配,并可跳台账
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { resources } from "../../lib/api.js";
import { Card, I, LiquidLoader } from "../Primitives.jsx";
import { KindTag, AppStatusPill, ParseTag, fmtDateTime } from "./ui.jsx";

export default function CampusCandidateCard({ candidateId }) {
  const [data, setData] = useState(undefined);
  useEffect(() => { if (!candidateId) return; resources.campus.byCandidate(candidateId).then(setData).catch(() => setData(null)); }, [candidateId]);
  if (!data?.applicant) return null;
  const { applicant: a, session, latestMatchRun: run } = data;
  const apps = a.applications.filter((x) => x.status !== "withdrawn");
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-8 h-8 rounded-lg bg-brand-50 text-brand flex items-center justify-center"><I name="graduation-cap" size={16} /></span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-navy-700">校招</p>
          <p className="text-[11px] text-gray-500 truncate">{session?.name}{session?.school ? ` · ${session.school}` : ""}</p>
        </div>
        <Link to="/campus" className="text-[11px] text-brand font-bold hover:underline inline-flex items-center gap-1">台账 <I name="chevron-right" size={12} /></Link>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-gray-600 mb-3 flex-wrap">
        <span>{a.contactConfirmedAt ? "联系方式已确认" : "联系方式未确认"}</span>
        <span>·</span>
        <span>简历 v{a.currentVersion?.version ?? 0}/{a.uploadsAllowed}</span>
        <ParseTag status={a.currentVersion?.parseStatus} />
        {a.wechat && <span>· 微信 {a.wechat}</span>}
      </div>
      <div className="space-y-2">
        {apps.length === 0 && <p className="text-xs text-gray-500">尚未投递</p>}
        {apps.map((x) => (
          <div key={x.id} className="flex items-center gap-2 text-xs">
            <KindTag kind={x.kind} />
            <span className="flex-1 truncate text-navy-700">{x.job?.title}</span>
            {x.scoreShown != null && <span className="text-gray-500">{x.scoreShown}<span className="text-gray-400">/{x.scoreRaw}</span></span>}
            <AppStatusPill status={x.status} />
          </div>
        ))}
      </div>
      {run && run.status === "done" && Array.isArray(run.results) && run.results.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-[11px] text-gray-500 mb-2">最近智能匹配 · {fmtDateTime(run.finishedAt)}{run.stale ? " · 已过期" : ""}</p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {run.results.slice(0, 4).map((r) => (
              <div key={r.jobId} className="flex flex-col items-center shrink-0 w-16">
                <LiquidLoader size={40} level={r.scoreShown ?? 0} label={r.excluded ? "" : r.scoreShown ?? ""} instant />
                <span className="text-[10px] text-gray-600 mt-1 truncate w-full text-center" title={r.title}>{r.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
