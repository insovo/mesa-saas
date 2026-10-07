// 专场岗位配置:加入 / 类型 / 参与匹配 / 排序 / 移除;未生成评价模型时一键生成(extract-facts → suggest → PATCH job)
import { useEffect, useMemo, useState } from "react";
import { api, resources, LONG_TIMEOUT } from "../../lib/api.js";
import { Button, I, toast } from "../Primitives.jsx";
import { Select, KindTag, errMsg } from "./ui.jsx";

export default function SessionJobsPanel({ session, canManage, onChanged }) {
  const [items, setItems] = useState([]);
  const [allJobs, setAllJobs] = useState([]);
  const [addId, setAddId] = useState("");
  const [addKind, setAddKind] = useState("onsite");
  const [busy, setBusy] = useState({});
  const load = async () => {
    try { setItems(await resources.campus.listSessionJobs(session.id)); } catch (e) { toast(errMsg(e), "error"); }
  };
  useEffect(() => { load(); resources.jobs.list({ take: 200 }).then((r) => setAllJobs(r.items || [])).catch(() => {}); }, [session.id]);
  const available = useMemo(() => allJobs.filter((j) => !items.some((sj) => sj.jobId === j.id)), [allJobs, items]);

  async function add() {
    if (!addId) return;
    try { await resources.campus.addSessionJob(session.id, { jobId: addId, kind: addKind }); setAddId(""); await load(); onChanged?.(); }
    catch (e) { toast(errMsg(e), "error"); }
  }
  async function patch(sj, body) {
    try { await resources.campus.updateSessionJob(session.id, sj.id, body); await load(); }
    catch (e) { toast(errMsg(e), "error"); }
  }
  async function remove(sj) {
    if (!confirm(`从专场移除「${sj.job?.title}」?`)) return;
    try { await resources.campus.removeSessionJob(session.id, sj.id); await load(); onChanged?.(); }
    catch (e) { toast(errMsg(e), "error"); }
  }
  async function move(idx, dir) {
    const next = [...items]; const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setItems(next);
    try { await resources.campus.reorderSessionJobs(session.id, next.map((x) => x.id)); } catch (e) { toast(errMsg(e), "error"); load(); }
  }
  // 一键生成评价模型(校招模板)
  async function generateModel(sj) {
    setBusy((b) => ({ ...b, [sj.id]: true }));
    try {
      let jdFacts = null;
      if (!sj.job.hasJdFacts) {
        const r = await api.post(`/jobs/${sj.jobId}/extract-facts`, {}, { timeout: LONG_TIMEOUT });
        jdFacts = r.data.jdFacts;
      }
      const s = await api.post(`/jobs/${sj.jobId}/evaluation-model/suggest`, { ...(jdFacts ? { jdFacts } : {}), templateId: "tpl.campus.general", wording: false }, { timeout: LONG_TIMEOUT });
      await resources.jobs.update(sj.jobId, { ...(jdFacts ? { jdFacts } : {}), evaluationModel: s.data.evaluationModel });
      toast("评价模型已生成(校园招聘模板)", "success"); await load();
    } catch (e) { toast(errMsg(e, "生成失败"), "error"); }
    finally { setBusy((b) => ({ ...b, [sj.id]: false })); }
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="text-xs text-gray-500 py-2">还没有岗位,从下方加入</p>}
      {items.map((sj, idx) => (
        <div key={sj.id} className="flex items-center gap-3 p-3 rounded-xl bg-lightPrimary/50">
          <div className="flex flex-col text-gray-400">
            <button type="button" disabled={!canManage || idx === 0} onClick={() => move(idx, -1)} className="hover:text-brand disabled:opacity-30"><I name="chevron-up" size={12} /></button>
            <button type="button" disabled={!canManage || idx === items.length - 1} onClick={() => move(idx, 1)} className="hover:text-brand disabled:opacity-30"><I name="chevron-down" size={12} /></button>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-navy-700 truncate">{sj.job?.title || "岗位已删除"}</span>
              <KindTag kind={sj.kind} />
              {sj.applications > 0 && <span className="text-[11px] text-gray-500">{sj.applications} 投递</span>}
              {!sj.job?.hasEvaluationModel && <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full"><I name="alert-triangle" size={10} />未生成评价模型</span>}
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">{[sj.job?.dept, sj.job?.location, sj.job?.employment].filter(Boolean).join(" · ")}</p>
          </div>
          {!sj.job?.hasEvaluationModel && canManage && (
            <Button size="sm" variant="ghost" disabled={busy[sj.id]} onClick={() => generateModel(sj)} icon={<I name={busy[sj.id] ? "loader" : "sparkles"} size={13} className={busy[sj.id] ? "animate-spin" : ""} />}>{busy[sj.id] ? "生成中…" : "生成评价模型"}</Button>
          )}
          <Select small value={sj.kind} disabled={!canManage} onChange={(e) => patch(sj, { kind: e.target.value })}><option value="onsite">现场面试</option><option value="referral">内推</option></Select>
          <label className={`inline-flex items-center gap-1.5 text-xs text-navy-700 ${!sj.job?.hasEvaluationModel ? "opacity-50" : ""}`} title={!sj.job?.hasEvaluationModel ? "先生成评价模型才能开启匹配" : ""}>
            <input type="checkbox" className="accent-brand" disabled={!canManage || !sj.job?.hasEvaluationModel} checked={sj.matchEnabled && !!sj.job?.hasEvaluationModel} onChange={(e) => patch(sj, { matchEnabled: e.target.checked })} />参与匹配
          </label>
          {canManage && <button type="button" onClick={() => remove(sj)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-white"><I name="trash-2" size={14} /></button>}
        </div>
      ))}
      {canManage && (
        <div className="flex items-center gap-2 pt-1">
          <Select small value={addId} onChange={(e) => setAddId(e.target.value)} className="flex-1"><option value="">选择要加入的岗位…</option>{available.map((j) => <option key={j.id} value={j.id}>{j.title}{j.dept ? ` · ${j.dept}` : ""}</option>)}</Select>
          <Select small value={addKind} onChange={(e) => setAddKind(e.target.value)}><option value="onsite">现场面试</option><option value="referral">内推</option></Select>
          <Button size="sm" variant="secondary" disabled={!addId} onClick={add} icon={<I name="plus" size={14} />}>加入</Button>
        </div>
      )}
    </div>
  );
}
