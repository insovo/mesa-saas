// 智能匹配:进度(波浪球 + 阶段文案 + 排队 + 后台提示/取消)→ 结果(现场面试优先 · 展示分下限 · 3 条理由 · 投递)
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { campus } from "../../../lib/campusApi.js";
import { Button, I, LiquidLoader, toast } from "../../../components/Primitives.jsx";
import { KindTag } from "../../../components/campus/ui.jsx";
import { Shell, useCampus, base, gatePath, Spinner, toastErr, TaskBanner, ErrorCard } from "./shell.jsx";

const STAGE_TEXT = {
  queued: (p) => (p.queuePosition ? `前方还有约 ${p.queuePosition} 位同学,请稍候` : "排队中,马上开始"),
  extract: () => "正在读取你的简历…",
  structure: () => "正在理解你的经历与技能…",
  evaluate: (p) => `正在和 ${p.total || "各"} 个岗位比对${p.total ? `(${p.done || 0}/${p.total})` : ""}…`,
  done: () => "匹配完成",
  failed: () => "这次没成功",
  cancelled: () => "已取消",
};

export default function CampusMatch() {
  const { slug, me, session, ready, reload } = useCampus();
  const nav = useNavigate();
  const [run, setRun] = useState(undefined); // undefined 加载中 · null 无
  const [level, setLevel] = useState(0);      // 插值后的水位
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(null);
  const started = useRef(false);

  // 门禁
  useEffect(() => { if (ready && (!me || !me.hasResume || !me.contactConfirmed)) nav(gatePath(slug, me, `${base(slug)}/match`), { replace: true }); }, [ready, me, slug, nav]);

  const start = useCallback(async () => {
    setBusy(true);
    try { const r = await campus.startMatch(); setRun(r); setLevel(3); }
    catch (e) {
      const code = e.response?.data?.error;
      if (code === "campus_match_in_progress") { setRun(await campus.latestMatch()); }
      else { toastErr(e, "无法开始匹配"); setRun(null); }
    } finally { setBusy(false); }
  }, []);

  // 首次:有未过期的完成结果就直接展示,否则自动发起
  useEffect(() => {
    if (!ready || !me?.hasResume || !me?.contactConfirmed || started.current) return;
    started.current = true;
    (async () => {
      const latest = await campus.latestMatch().catch(() => null);
      if (latest && (latest.status === "running" || latest.status === "queued" || (latest.status === "done" && !latest.stale))) { setRun(latest); setLevel(latest.progress || 0); }
      else await start();
    })();
  }, [ready, me, start]);

  // 轮询 2s
  const active = run && (run.status === "queued" || run.status === "running");
  useEffect(() => {
    if (!active) return;
    const t = setInterval(async () => {
      try { const r = await campus.matchRun(run.id); setRun(r); if (r.status === "done") reload(); }
      catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(t);
  }, [active, run?.id, reload]);

  // 水位插值:缓慢向目标上涨,不越过当前阶段上限(设计 §5.5)
  useEffect(() => {
    if (!run) return;
    if (!active) { setLevel(run.status === "done" ? 100 : 0); return; }
    const cap = Math.min(99, (run.progress || 0) + 12);
    const t = setInterval(() => setLevel((l) => (l < (run.progress || 0) ? Math.min(run.progress, l + 3) : l < cap ? Math.min(cap, +(l + 0.4).toFixed(1)) : l)), 400);
    return () => clearInterval(t);
  }, [run?.progress, run?.status, active]);

  async function cancel() {
    setBusy(true);
    try { const r = await campus.cancelMatch(run.id); setRun(r); toast("已取消匹配", "success"); }
    catch (e) { toastErr(e, "取消失败"); } finally { setBusy(false); }
  }
  async function apply(item) {
    setApplying(item.jobId);
    try {
      const r = await campus.apply({ jobId: item.jobId, source: "match", matchRunId: run.id });
      toast(`已投递「${item.title}」,还可投 ${Math.max(0, r.maxApplyJobs - r.applied)} 个`, "success");
      await reload();
    } catch (e) { toastErr(e, "投递失败"); } finally { setApplying(null); }
  }

  if (!ready || run === undefined) return <Shell title="智能匹配" back><Spinner label="准备中…" /></Shell>;
  if (session && !session.matchEnabled) return <Shell title="智能匹配" back><ErrorCard icon="sparkles" title="本专场未开放智能匹配" message="可直接查看岗位投递" /></Shell>;
  if (run === null) {
    return (
      <Shell title="智能匹配" back>
        <div className="bg-white rounded-card shadow-card p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-brand-50 text-brand mx-auto flex items-center justify-center mb-4"><I name="sparkles" size={30} /></div>
          <h2 className="text-lg font-bold">开始匹配分析</h2>
          <p className="text-xs text-gray-600 mt-2">系统会把你的简历与本专场所有岗位逐一比对,给出匹配度与理由,现场面试岗位优先展示。</p>
          <Button className="mt-5 w-full !h-12" disabled={busy} onClick={start} icon={<I name="sparkles" size={16} />}>开始匹配</Button>
        </div>
      </Shell>
    );
  }

  // ── 进行中 / 失败 / 取消 ──
  if (run.status !== "done") {
    const p = run;
    const text = (STAGE_TEXT[p.stage] || STAGE_TEXT.extract)(p);
    const ended = run.status === "failed" || run.status === "cancelled";
    return (
      <Shell title="智能匹配" back>
        <div className="bg-white rounded-card shadow-card p-6">
          {!ended && <TaskBanner running label="匹配在后台进行" onCancel={cancel} busy={busy} />}
          <div className="flex flex-col items-center py-8">
            <LiquidLoader size={160} level={ended ? 0 : level} label={ended ? "" : Math.round(level)} loading={!ended} />
            <p className="mt-5 text-base font-bold">{text}</p>
            <p className="text-xs text-gray-500 mt-1">{ended ? (run.status === "cancelled" ? "已取消本次匹配,可随时重新开始" : `匹配失败${run.error ? `(${run.error})` : ""},不影响直接投递`) : "通常需要 1–3 分钟,可以先去看岗位或关闭页面"}</p>
          </div>
          <div className="flex gap-2">
            {ended ? <Button className="flex-1 !h-11" disabled={busy} onClick={start} icon={<I name="refresh-cw" size={15} />}>重新匹配</Button> : <Button variant="secondary" className="flex-1 !h-11" as={Link} to={`${base(slug)}/jobs`}>先看岗位</Button>}
            <Button variant="ghost" className="flex-1 !h-11" as={Link} to={`${base(slug)}/mine`}>我的投递</Button>
          </div>
        </div>
      </Shell>
    );
  }

  // ── 结果 ──
  const results = run.results || [];
  const appliedSet = new Set((me?.applications || []).filter((a) => a.status !== "withdrawn").map((a) => a.jobId));
  const quotaLeft = Math.max(0, (session?.maxApplyJobs ?? 3) - (me?.applied ?? 0));
  const visible = results.filter((r) => !r.excluded && !r.error);
  const hidden = results.filter((r) => r.excluded || r.error);
  const groups = [["onsite", "现场面试岗位", "投递后可在现场参加面试"], ["referral", "内推岗位", "由内推人跟进,不安排现场面试"]];
  return (
    <Shell title="匹配结果" back>
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-gray-600">按匹配度排序,现场面试岗位优先 · 还可投 {quotaLeft} 个</p>
        {run.stale ? <button type="button" onClick={start} className="text-xs text-brand font-bold">简历已更新,重新匹配</button> : <button type="button" onClick={start} disabled={busy} className="text-xs text-gray-500">重新匹配</button>}
      </div>
      {visible.length === 0 && <div className="mt-4"><ErrorCard icon="inbox" title="暂无匹配岗位" message={hidden.length ? "以下岗位有硬性条件不符,仍可直接浏览岗位列表投递" : "本专场暂无参与匹配的岗位"} /></div>}
      {groups.map(([kind, title, desc]) => {
        const items = visible.filter((r) => r.kind === kind);
        if (!items.length) return null;
        return (
          <section key={kind} className="mt-5">
            <div className="flex items-baseline gap-2 mb-2 px-1"><h2 className="text-sm font-bold">{title}</h2><span className="text-[11px] text-gray-500">{desc}</span></div>
            <div className="space-y-3">
              {items.map((r) => {
                const applied = appliedSet.has(r.jobId);
                return (
                  <div key={r.jobId} className="bg-white rounded-card shadow-card p-4">
                    <div className="flex items-center gap-3">
                      <LiquidLoader size={56} level={r.scoreShown ?? 0} label={r.scoreShown ?? ""} instant />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2"><Link to={`${base(slug)}/jobs/${r.jobId}`} className="font-bold text-sm truncate">{r.title}</Link><KindTag kind={r.kind} /></div>
                        <p className="text-[11px] text-gray-500 mt-0.5 truncate">{[r.dept, r.location].filter(Boolean).join(" · ")}</p>
                      </div>
                      <Button size="sm" className="!h-9 shrink-0" disabled={applied || applying === r.jobId || quotaLeft === 0} onClick={() => apply(r)}>{applied ? "已投递" : applying === r.jobId ? "投递中…" : "投递"}</Button>
                    </div>
                    {r.reasons?.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {r.reasons.map((x, i) => <li key={i} className={`flex items-start gap-1.5 text-xs ${x.kind === "match" ? "text-green-700" : "text-gray-600"}`}><I name={x.kind === "match" ? "check" : "info"} size={12} className="mt-0.5 shrink-0" />{x.text}</li>)}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {hidden.length > 0 && (
        <details className="mt-5 bg-white/60 rounded-card p-4">
          <summary className="text-xs font-bold text-gray-600 cursor-pointer">暂不匹配的岗位({hidden.length})</summary>
          <ul className="mt-2 space-y-2">
            {hidden.map((r) => <li key={r.jobId} className="text-xs text-gray-600"><span className="font-bold text-navy-700">{r.title}</span> · {r.error ? "评估未完成,可直接投递" : r.reasons?.[0]?.text}</li>)}
          </ul>
        </details>
      )}
      <p className="mt-6 text-[11px] text-gray-400 text-center">匹配度仅供参考,最终以 HR 筛选与面试为准</p>
    </Shell>
  );
}
