// 专场岗位配置(专场卡片内折叠面板):加入 / 类型 / 参与匹配 / 排序 / 移除;未生成评价模型时一键生成。
// 完整的 JD 新建 / 编辑在岗位 tab(CampusJobs.jsx),两处共用 useSessionJobs。
import { useState } from "react";
import { Button, I } from "../Primitives.jsx";
import { Select, KindTag } from "./ui.jsx";
import { useSessionJobs } from "./useSessionJobs.js";
import ModelGenerationNotice from "./ModelGenerationNotice.jsx";

export default function SessionJobsPanel({ session, canManage, onChanged }) {
  const { items, available, loading, error, busy, mutating, modelNotice, dismissModelNotice, load, add, patch, remove, move, generateModel } = useSessionJobs(session.id, onChanged, canManage);
  const [addId, setAddId] = useState("");
  const [addKind, setAddKind] = useState("onsite");
  const modelBusy = Object.values(busy).some(Boolean);

  async function onAdd() {
    if (!addId) return;
    if (await add(addId, addKind)) setAddId("");
  }
  function onRemove(sj) {
    if (!confirm(`从专场移除「${sj.job?.title}」?`)) return;
    remove(sj);
  }

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-xs text-red-600">{error}<button type="button" className="ml-2 underline" onClick={load}>重试</button></p>}
      {loading && <p className="text-xs text-gray-500">加载岗位中…</p>}
      {!loading && !error && items.length === 0 && <p className="text-xs text-gray-500 py-2">还没有岗位,从下方加入;新建 JD 请到「岗位」tab</p>}
      {items.map((sj, idx) => (
        <div key={sj.id} className="flex items-center gap-3 p-3 rounded-xl bg-lightPrimary/50">
          <div className="flex flex-col text-gray-400">
            <button type="button" disabled={!canManage || loading || mutating || idx === 0} onClick={() => move(idx, -1)} className="hover:text-brand disabled:opacity-30"><I name="chevron-up" size={12} /></button>
            <button type="button" disabled={!canManage || loading || mutating || idx === items.length - 1} onClick={() => move(idx, 1)} className="hover:text-brand disabled:opacity-30"><I name="chevron-down" size={12} /></button>
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
            <Button size="sm" variant="ghost" disabled={loading || mutating || modelBusy} onClick={() => generateModel(sj)} icon={<I name={busy[sj.id] ? "loader" : "sparkles"} size={13} className={busy[sj.id] ? "animate-spin" : ""} />}>{busy[sj.id] ? "生成中…" : "生成评价模型"}</Button>
          )}
          <Select small value={sj.kind} disabled={!canManage || loading || mutating || busy[sj.id]} onChange={(e) => patch(sj, { kind: e.target.value })}><option value="onsite">现场面试</option><option value="referral">内推</option></Select>
          <label className={`inline-flex items-center gap-1.5 text-xs text-navy-700 ${!sj.job?.hasEvaluationModel ? "opacity-50" : ""}`} title={!sj.job?.hasEvaluationModel ? "先生成评价模型才能开启匹配" : ""}>
            <input type="checkbox" className="accent-brand" disabled={!canManage || loading || mutating || busy[sj.id] || !sj.job?.hasEvaluationModel} checked={sj.matchEnabled && !!sj.job?.hasEvaluationModel} onChange={(e) => patch(sj, { matchEnabled: e.target.checked })} />参与匹配
          </label>
          {canManage && <button type="button" disabled={loading || mutating || busy[sj.id] || sj.applications > 0} title={sj.applications > 0 ? "已有投递,不能移除" : "从专场移除"} onClick={() => onRemove(sj)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-white"><I name="trash-2" size={14} /></button>}
        </div>
      ))}
      {canManage && (
        <div className="flex items-center gap-2 pt-1">
          <Select small value={addId} onChange={(e) => setAddId(e.target.value)} className="flex-1"><option value="">选择要加入的岗位…</option>{available.map((j) => <option key={j.id} value={j.id}>{j.title}{j.dept ? ` · ${j.dept}` : ""}</option>)}</Select>
          <Select small value={addKind} onChange={(e) => setAddKind(e.target.value)}><option value="onsite">现场面试</option><option value="referral">内推</option></Select>
          <Button size="sm" variant="secondary" disabled={!addId || loading || mutating} onClick={onAdd} icon={<I name="plus" size={14} />}>加入</Button>
        </div>
      )}
      <ModelGenerationNotice notice={modelNotice} onDismiss={dismissModelNotice} />
    </div>
  );
}
