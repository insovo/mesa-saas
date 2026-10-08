// 候选人资料卡内的校招分区:该候选人若来自校招,显示专场 / 投递 / 简历版本 / 最近匹配,并可跳台账
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { resources } from "../../lib/api.js";
import { I, LiquidLoader, toast } from "../Primitives.jsx";
import { KindTag, AppStatusPill, ParseTag, fmtDateTime } from "./ui.jsx";

export default function CampusCandidateCard({ candidateId, currentUser }) {
  const [data, setData] = useState(undefined);
  const [starting, setStarting] = useState(false);
  const load = useCallback(() => resources.campus.byCandidate(candidateId).then(setData).catch(() => setData(null)), [candidateId]);
  useEffect(() => { if (candidateId) load(); }, [candidateId, load]);
  const active = ["queued", "running"].includes(data?.latestMatchRun?.status);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(load, 2500);
    return () => clearInterval(timer);
  }, [active, load]);
  async function startMatch() {
    setStarting(true);
    try {
      const run = await resources.campus.matchByCandidate(candidateId);
      setData((prev) => ({ ...prev, latestMatchRun: run }));
      toast("已开始智能匹配，结果会自动更新", "success");
    } catch (err) {
      toast(err.response?.data?.message || err.message || "智能匹配启动失败", "error");
    } finally {
      setStarting(false);
    }
  }
  if (!data?.applicant) return null;
  const { applicant: a, session, latestMatchRun: run } = data;
  const apps = a.applications.filter((x) => x.status !== "withdrawn");
  const canMatch = ["ADMIN", "CAMPUS_INTERVIEWER", "RECRUITER"].includes(currentUser?.role);
  return (
    <section className="mt-4 border-t border-[#E9ECEF] pt-4 min-w-0">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-8 h-8 rounded-lg bg-brand-50 text-brand flex items-center justify-center"><I name="graduation-cap" size={16} /></span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-navy-700">校招</p>
          <p className="text-[11px] text-gray-500 truncate">{session?.name}{session?.school ? ` · ${session.school}` : ""}</p>
        </div>
        <Link to="/campus" className="shrink-0 text-[11px] text-brand font-bold hover:underline inline-flex items-center gap-1">台账 <I name="chevron-right" size={12} /></Link>
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
            <span className="flex-1 min-w-0 truncate text-navy-700">{x.job?.title}</span>
            {x.scoreShown != null && <span className="text-gray-500">{x.scoreShown}<span className="text-gray-400">/{x.scoreRaw}</span></span>}
            <AppStatusPill status={x.status} />
          </div>
        ))}
      </div>
      {(canMatch || run) && <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <p className="text-[11px] text-gray-500">
            {active ? `智能匹配中 · ${run.progress ?? 0}%${run.total ? ` (${run.done ?? 0}/${run.total})` : ""}` : run?.status === "failed" ? "智能匹配失败，请重试" : run?.status === "done" ? `最近智能匹配 · ${fmtDateTime(run.finishedAt)}${run.stale ? " · 已过期" : ""}` : "尚未智能匹配"}
          </p>
          {canMatch && <button type="button" onClick={startMatch} disabled={starting || active || !a.currentVersion} className="inline-flex items-center gap-1 rounded-lg border border-brand/30 px-2.5 py-1.5 text-[11px] font-semibold text-brand hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50">
            <I name="sparkles" size={13} />{starting || active ? "匹配中" : run ? "重新智能匹配" : "智能匹配"}
          </button>}
        </div>
        {run?.status === "done" && Array.isArray(run.results) && run.results.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {run.results.map((r) => (
              <div key={r.jobId} className="flex flex-col items-center shrink-0 w-16" title={r.error ? `${r.title}：评分失败 (${r.error})` : r.excluded ? `${r.title}：硬性条件未通过` : r.title}>
                {r.scoreShown == null ? <span className="w-10 h-10 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center text-sm">—</span> : <LiquidLoader size={40} level={r.scoreShown} label={r.scoreShown} instant />}
                <span className="text-[10px] text-gray-600 mt-1 truncate w-full text-center">{r.title}</span>
                {r.scoreShown == null && <span className="text-[10px] text-rose-500">评分失败</span>}
                {r.scoreShown != null && r.excluded && <span className="text-[10px] text-amber-600">硬筛未过</span>}
              </div>
            ))}
          </div>
        )}
      </div>}
    </section>
  );
}
