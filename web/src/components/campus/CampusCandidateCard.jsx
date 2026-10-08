// 候选人资料卡内的校招信息与最近智能匹配
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { resources } from "../../lib/api.js";
import { I, LiquidLoader, Modal, toast } from "../Primitives.jsx";
import { KindTag, AppStatusPill, ParseTag, fmtDateTime } from "./ui.jsx";

function MatchAnalysisModal({ result, stale, onClose }) {
  if (!result) return null;
  const hardItems = result.analysis?.hardFilter?.items || [];
  const items = result.analysis?.items || [];
  const failed = hardItems.filter((item) => item.result === "FAIL");
  const failedKeys = new Set(failed.map((item) => item.key));
  const gaps = [
    ...failed.map((item) => ({ ...item, verdict: "硬筛未过" })),
    ...items.filter((item) => ["不满足", "部分满足", "未提及", "待确认"].includes(item.verdict) && !failedKeys.has(item.key)),
  ];
  const strengths = items.filter((item) => item.verdict === "满足");
  const fallbackGaps = (result.reasons || []).filter((reason) => reason.kind === "gap");
  const fallbackStrengths = (result.reasons || []).filter((reason) => reason.kind === "match");

  return (
    <Modal open onClose={onClose} maxWidth="max-w-2xl">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-[#707EAE]">JD 适配分析{stale ? " · 旧版简历结果" : ""}</p>
            <h3 className="mt-1 text-lg font-bold text-[#1B254B] break-words">{result.title}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭岗位适配分析" className="shrink-0 rounded-lg p-1.5 text-[#707EAE] hover:bg-[#F4F7FE] hover:text-[#1B254B]"><I name="x" size={18} /></button>
        </div>
        <div className="mt-4 flex items-center gap-3">
          {result.scoreShown != null && <LiquidLoader size={48} level={result.scoreShown} label={result.scoreShown} instant />}
          <div className="text-xs text-[#707EAE]">
            <p>{result.scoreShown == null ? "暂无匹配分" : "岗位匹配度"}</p>
            {result.excluded && <p className="mt-1 font-semibold text-amber-700">硬筛未过{failed.length ? ` · ${failed.length} 项条件未通过` : ""}</p>}
            {result.error && <p className="mt-1 text-rose-600">评分失败，暂无完整分析</p>}
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <section className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
            <h4 className="flex items-center gap-2 text-sm font-bold text-amber-900"><I name="alert-triangle" size={15} />缺项与劣势</h4>
            {gaps.length > 0 ? (
              <ul className="mt-3 space-y-3">
                {gaps.map((item, index) => <li key={item.key || index} className="text-xs text-[#1B254B]">
                  <div className="flex items-start gap-2"><span className="mt-0.5 shrink-0 text-amber-600">•</span><span className="min-w-0 break-words"><span className="font-semibold">{item.label}</span><span className="ml-1 text-amber-700">{item.verdict}</span>{item.reason && <span className="mt-0.5 block text-[#707EAE]">{item.reason}</span>}</span></div>
                </li>)}
              </ul>
            ) : fallbackGaps.length > 0 ? <ul className="mt-3 space-y-2">{fallbackGaps.map((reason, index) => <li key={index} className="text-xs text-[#1B254B] break-words">• {reason.text}</li>)}</ul> : <p className="mt-3 text-xs text-[#707EAE]">暂无明确缺项</p>}
          </section>
          <section className="rounded-xl border border-green-100 bg-green-50/50 p-4">
            <h4 className="flex items-center gap-2 text-sm font-bold text-green-800"><I name="check-circle-2" size={15} />亮点与优势</h4>
            {strengths.length > 0 ? (
              <ul className="mt-3 space-y-3">
                {strengths.map((item, index) => <li key={item.key || index} className="flex items-start gap-2 text-xs text-[#1B254B]"><span className="mt-0.5 shrink-0 text-green-600">•</span><span className="min-w-0 break-words"><span className="font-semibold">{item.label}</span>{item.reason && <span className="mt-0.5 block text-[#707EAE]">{item.reason}</span>}</span></li>)}
              </ul>
            ) : fallbackStrengths.length > 0 ? <ul className="mt-3 space-y-2">{fallbackStrengths.map((reason, index) => <li key={index} className="text-xs text-[#1B254B] break-words">• {reason.text}</li>)}</ul> : <p className="mt-3 text-xs text-[#707EAE]">暂无明确匹配项</p>}
          </section>
        </div>
      </div>
    </Modal>
  );
}

export function useCampusCandidate(candidateId) {
  const [data, setData] = useState(undefined);
  const [starting, setStarting] = useState(false);
  const latestCandidateId = useRef(candidateId);
  latestCandidateId.current = candidateId;
  const load = useCallback(() => resources.campus.byCandidate(candidateId)
    .then((result) => { if (latestCandidateId.current === candidateId) setData(result); })
    .catch(() => { if (latestCandidateId.current === candidateId) setData(null); }), [candidateId]);
  useEffect(() => { setData(undefined); if (candidateId) load(); }, [candidateId, load]);
  const currentData = data?.applicant?.candidateId === candidateId ? data : null;
  const active = ["queued", "running"].includes(currentData?.latestMatchRun?.status);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(load, 2500);
    return () => clearInterval(timer);
  }, [active, load]);
  async function startMatch() {
    setStarting(true);
    try {
      const run = await resources.campus.matchByCandidate(candidateId);
      if (latestCandidateId.current === candidateId) setData((prev) => ({ ...prev, latestMatchRun: run }));
      toast("已开始智能匹配，结果会自动更新", "success");
    } catch (err) {
      toast(err.response?.data?.message || err.message || "智能匹配启动失败", "error");
    } finally {
      setStarting(false);
    }
  }
  return { data: currentData, active, starting, startMatch };
}

export function CampusMatchPanel({ campus, currentUser }) {
  const [selectedJobId, setSelectedJobId] = useState(null);
  const { data, active, starting, startMatch } = campus;
  useEffect(() => setSelectedJobId(null), [data?.latestMatchRun?.id]);
  if (!data?.applicant) return null;
  const { applicant: a, latestMatchRun: run } = data;
  const selectedResult = run?.results?.find((result) => result.jobId === selectedJobId) || null;
  const canMatch = ["ADMIN", "CAMPUS_INTERVIEWER", "RECRUITER"].includes(currentUser?.role);
  if (!canMatch && !run) return null;
  return (
    <div className="w-full min-w-0 md:w-[360px] md:shrink-0 2xl:w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className="text-[11px] text-gray-500">
          {active ? `智能匹配中 · ${run.progress ?? 0}%${run.total ? ` (${run.done ?? 0}/${run.total})` : ""}` : run?.status === "failed" ? "智能匹配失败，请重试" : run?.status === "done" ? `最近智能匹配 · ${fmtDateTime(run.finishedAt)}${run.stale ? " · 已过期" : ""}` : "尚未智能匹配"}
        </p>
        {canMatch && <button type="button" onClick={startMatch} disabled={starting || active || !a.currentVersion} className="inline-flex items-center gap-1 rounded-lg border border-brand/30 px-2.5 py-1.5 text-[11px] font-semibold text-brand hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50">
          <I name="sparkles" size={13} />{starting || active ? "匹配中" : run ? "重新智能匹配" : "智能匹配"}
        </button>}
      </div>
      {run?.status === "done" && Array.isArray(run.results) && run.results.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {run.results.map((r) => (
            <button key={r.jobId} type="button" onClick={() => setSelectedJobId(r.jobId)} aria-label={`查看${r.title}的 JD 适配分析`} className="flex flex-col items-center shrink-0 w-16 rounded-lg hover:bg-[#F4F7FE] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" title={r.error ? `${r.title}：评分失败 (${r.error})` : r.excluded ? `${r.title}：硬性条件未通过` : r.title}>
              {r.scoreShown == null ? <span className="w-10 h-10 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center text-sm">—</span> : <LiquidLoader size={40} level={r.scoreShown} label={r.scoreShown} instant />}
              <span className="text-[10px] text-gray-600 mt-1 truncate w-full text-center">{r.title}</span>
              {r.scoreShown == null && <span className="text-[10px] text-rose-500">评分失败</span>}
              {r.scoreShown != null && r.excluded && <span className="text-[10px] text-amber-600">硬筛未过</span>}
            </button>
          ))}
        </div>
      )}
      <MatchAnalysisModal result={selectedResult} stale={run?.stale} onClose={() => setSelectedJobId(null)} />
    </div>
  );
}

export default function CampusCandidateCard({ campus }) {
  const { data } = campus;
  if (!data?.applicant) return null;
  const { applicant: a, session } = data;
  const apps = a.applications.filter((x) => x.status !== "withdrawn");
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
    </section>
  );
}
