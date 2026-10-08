// 校招岗位 tab:按专场管理岗位与 JD —— 新建 / 编辑 JD、从已有岗位加入、类型 / 参与匹配 / 排序、生成评价模型、学生端预览
import { useEffect, useState } from "react";
import { Card, Button, I, Empty, LoadingBlock, toast } from "../Primitives.jsx";
import { Select, KindTag, SessionStatusPill, fmtDate, fmtDateTime } from "./ui.jsx";
import { useSessionJobs } from "./useSessionJobs.js";
import JobFormModal from "./JobFormModal.jsx";
import BulkJobEditModal from "./BulkJobEditModal.jsx";

function JdBlock({ title, items }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-xs font-bold text-navy-700 mb-1">{title}</p>
      <ul className="list-disc pl-5 space-y-0.5 text-xs text-gray-700">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}

function Chip({ icon, children }) {
  return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-lightPrimary text-[11px] text-navy-700"><I name={icon} size={11} className="text-gray-500" />{children}</span>;
}

export default function CampusJobs({ sessions, canManage, onChanged }) {
  const [sessionId, setSessionId] = useState("");
  const session = sessions.find((s) => s.id === sessionId) || null;
  useEffect(() => {
    if (!sessions.some((s) => s.id === sessionId) && sessions.length) setSessionId((sessions.find((s) => s.status === "live") || sessions[0]).id);
  }, [sessions, sessionId]);
  const { items, available, loading, error, busy, mutating, bulkProgress, load, add, patch, bulkPatch, remove, move, generateModel, bulkGenerateModels } = useSessionJobs(sessionId, onChanged, canManage);
  const [form, setForm] = useState(null); // { sj: null } 新建 | { sj } 编辑
  const [addId, setAddId] = useState("");
  const [addKind, setAddKind] = useState("onsite");
  const [expanded, setExpanded] = useState(() => new Set());
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  useEffect(() => { setAddId(""); setForm(null); setExpanded(new Set()); setSelectedIds(new Set()); setBulkOpen(false); }, [sessionId]);
  useEffect(() => { setSelectedIds((prev) => new Set([...prev].filter((id) => items.some((sj) => sj.id === id)))); }, [items]);

  if (!sessions.length) {
    return <Card className="p-6"><Empty icon="briefcase" title="还没有校招专场" desc="先到「专场」tab 新建一个专场,再回来配置岗位与 JD" /></Card>;
  }

  const toggleExpand = (id) => setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selected = items.filter((sj) => selectedIds.has(sj.id));
  const allSelected = items.length > 0 && selected.length === items.length;
  const selectionBusy = loading || mutating || Object.values(busy).some(Boolean);
  const toggleSelected = (id) => setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  async function onBulkSave(changes) {
    const done = await bulkPatch(selected.map((sj) => sj.id), changes);
    if (done) toast(`已更新 ${selected.length} 个岗位${Object.keys(changes).some((key) => key !== "kind") ? ",JD 变更后请重新生成评价模型" : ""}`, "success");
    return done;
  }
  async function onBulkGenerate() {
    if (!confirm(`为选中的 ${selected.length} 个岗位生成评价模型?已有模型的岗位也会重新生成。`)) return;
    const failed = await bulkGenerateModels(selected);
    if (failed) setSelectedIds(new Set(failed));
  }
  async function onAdd() {
    if (!addId) return;
    if (await add(addId, addKind)) setAddId("");
  }
  function onRemove(sj) {
    if (!confirm(`从「${session?.name}」移除「${sj.job?.title}」?\n岗位本身不会删除,仍在系统「岗位」页。`)) return;
    remove(sj);
  }
  const hasJdDetail = (j) => j.responsibilities?.length || j.requirements?.length || j.nice?.length || j.benefits?.length || j.description;

  return (
    <div className="space-y-5">
      <Card className="p-4 !flex-row items-center gap-3 flex-wrap">
        <I name="briefcase" size={18} className="text-brand" />
        <Select small aria-label="选择校招专场" value={sessionId} disabled={mutating} onChange={(e) => { setSessionId(e.target.value); setExpanded(new Set()); }} className="w-full sm:w-auto sm:min-w-[240px]">
          {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}{s.status === "live" ? "(上线中)" : s.status === "closed" ? "(已结束)" : "(草稿)"}</option>)}
        </Select>
        {session && <SessionStatusPill status={session.status} />}
        <span className="text-xs text-gray-600">{items.length} 个岗位 · 学生端按「现场面试 → 内推」分组、按此处顺序展示</span>
        <div className="sm:ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" icon={<I name="refresh-cw" size={14} className={loading ? "animate-spin" : ""} />} disabled={loading || mutating} onClick={load}>刷新</Button>
          {canManage && <Button size="sm" icon={<I name="plus" size={14} />} disabled={!session || loading || mutating} onClick={() => setForm({ sj: null })}>新建岗位 JD</Button>}
        </div>
      </Card>

      {canManage && items.length > 0 && !error && (
        <Card className="p-4 !flex-row items-center gap-3 flex-wrap">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-navy-700">
            <input type="checkbox" className="accent-brand" aria-label="全选本专场岗位" disabled={selectionBusy} checked={allSelected} onChange={() => setSelectedIds(allSelected ? new Set() : new Set(items.map((sj) => sj.id)))} />全选本专场
          </label>
          <span className="text-xs text-gray-600">已选 {selected.length} / {items.length}</span>
          {bulkProgress && <span role="status" className="text-xs text-brand">评价模型生成中 {bulkProgress.done}/{bulkProgress.total}</span>}
          <div className="sm:ml-auto flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="secondary" disabled={!selected.length || selectionBusy} onClick={() => setBulkOpen(true)} icon={<I name="pencil" size={13} />}>批量编辑</Button>
            <Button size="sm" disabled={!selected.length || selectionBusy} onClick={onBulkGenerate} icon={<I name="sparkles" size={13} />}>批量生成评价模型</Button>
          </div>
        </Card>
      )}

      {error ? <Card className="p-6"><p role="alert" className="text-sm text-red-600">{error}</p><Button className="mt-3 self-start" size="sm" onClick={load}>重新加载</Button></Card> : loading && items.length === 0 ? <LoadingBlock height="h-40" /> : items.length === 0 ? (
        <Card className="p-6"><Empty icon="briefcase" title="该专场还没有岗位" desc={canManage ? "点右上「新建岗位 JD」,或在下方从已有岗位加入" : "请联系有校招配置权限的同事添加"} /></Card>
      ) : items.map((sj, idx) => {
        const j = sj.job || {};
        const open = expanded.has(sj.id);
        return (
          <Card key={sj.id} className="p-5">
            <div className="flex items-start gap-4 flex-wrap">
              {canManage && <label className="pt-1" title={`选择${j.title || "岗位"}`}><input type="checkbox" className="accent-brand" aria-label={`选择岗位${j.title || "岗位"}`} disabled={selectionBusy} checked={selectedIds.has(sj.id)} onChange={() => toggleSelected(sj.id)} /></label>}
              <div className="flex flex-col text-gray-400 pt-1">
                <button type="button" disabled={!canManage || loading || mutating || idx === 0} onClick={() => move(idx, -1)} className="hover:text-brand disabled:opacity-30" title="上移"><I name="chevron-up" size={14} /></button>
                <button type="button" disabled={!canManage || loading || mutating || idx === items.length - 1} onClick={() => move(idx, 1)} className="hover:text-brand disabled:opacity-30" title="下移"><I name="chevron-down" size={14} /></button>
              </div>
              <div className="flex-1 min-w-0 basis-48">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-navy-700">{j.title || "岗位已删除"}</h3>
                  <KindTag kind={sj.kind} />
                  {j.hasEvaluationModel
                    ? <span className="inline-flex items-center gap-1 text-[11px] text-green-700 bg-green-100 px-2 py-0.5 rounded-full" title={j.evaluationModelUpdatedAt ? `生成于 ${fmtDateTime(j.evaluationModelUpdatedAt)}` : ""}><I name="check" size={10} />评价模型已生成</span>
                    : <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full"><I name="alert-triangle" size={10} />未生成评价模型</span>}
                  {sj.applications > 0 && <span className="text-[11px] text-gray-500">{sj.applications} 投递</span>}
                  {(j.sessionsCount || 0) > 1 && <span className="text-[11px] text-gray-500" title="编辑 JD 会同步到这些专场">另用于 {j.sessionsCount - 1} 个专场</span>}
                </div>
                <p className="text-xs text-gray-600 mt-1">{[j.dept, j.location, j.employment].filter(Boolean).join(" · ") || "未填部门 / 地点"}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {j.salary && <Chip icon="dollar-sign">{j.salary}</Chip>}
                  {j.educationRequirement && <Chip icon="graduation-cap">{j.educationRequirement}</Chip>}
                  {j.languageRequirement && <Chip icon="globe">{j.languageRequirement}</Chip>}
                  {j.openings != null && <Chip icon="users">{j.openings === 0 ? "名额不限" : `${j.openings} 人`}</Chip>}
                  {j.deadline && <Chip icon="calendar-x">截止 {fmtDate(j.deadline)}</Chip>}
                </div>
                {open && (
                  <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {hasJdDetail(j) ? <>
                      <JdBlock title="岗位职责" items={j.responsibilities} />
                      <JdBlock title="任职要求" items={j.requirements} />
                      <JdBlock title="加分项" items={j.nice} />
                      <JdBlock title="福利待遇" items={j.benefits} />
                      {j.description && <div className="md:col-span-2"><p className="text-xs font-bold text-navy-700 mb-1">JD 全文 / 补充描述</p><p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{j.description}</p></div>}
                    </> : <p className="text-xs text-gray-500 md:col-span-2">还没有 JD 内容{canManage ? ",点「编辑 JD」填写" : ""}</p>}
                  </div>
                )}
                <button type="button" onClick={() => toggleExpand(sj.id)} className="mt-2 inline-flex items-center gap-1 text-[11px] text-brand hover:underline">
                  <I name={open ? "chevron-up" : "chevron-down"} size={11} />{open ? "收起 JD" : "展开 JD"}
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end w-full xl:w-auto xl:max-w-[420px]">
                <Select small aria-label={`${j.title}岗位类型`} value={sj.kind} disabled={!canManage || loading || mutating || busy[sj.id]} onChange={(e) => patch(sj, { kind: e.target.value })}><option value="onsite">现场面试</option><option value="referral">内推</option></Select>
                <label className={`inline-flex items-center gap-1.5 text-xs text-navy-700 ${!j.hasEvaluationModel ? "opacity-50" : ""}`} title={!j.hasEvaluationModel ? "先生成评价模型才能开启匹配" : ""}>
                  <input type="checkbox" className="accent-brand" disabled={!canManage || loading || mutating || busy[sj.id] || !j.hasEvaluationModel} checked={sj.matchEnabled && !!j.hasEvaluationModel} onChange={(e) => patch(sj, { matchEnabled: e.target.checked })} />参与匹配
                </label>
                {canManage && <Button size="sm" variant="ghost" icon={<I name="pencil" size={14} />} disabled={loading || mutating || busy[sj.id]} onClick={() => setForm({ sj })}>编辑 JD</Button>}
                {canManage && (
                  <Button size="sm" variant={j.hasEvaluationModel ? "ghost" : "secondary"} disabled={loading || mutating || busy[sj.id]} onClick={() => generateModel(sj)} icon={<I name={busy[sj.id] ? "loader" : "sparkles"} size={13} className={busy[sj.id] ? "animate-spin" : ""} />}>
                    {busy[sj.id] ? "生成中…" : j.hasEvaluationModel ? "重新生成评价模型" : "生成评价模型"}
                  </Button>
                )}
                {session?.status === "live" && j.id && (
                  <a href={`/campus/${session.slug}/jobs/${j.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 h-9 px-3 rounded-xl text-xs font-medium text-navy-700 border border-gray-200 hover:border-brand/40 hover:bg-lightPrimary" title="以学生视角打开 JD 页">
                    <I name="external-link" size={13} />学生端预览
                  </a>
                )}
                {canManage && <button type="button" disabled={loading || mutating || busy[sj.id] || sj.applications > 0} onClick={() => onRemove(sj)} className="disabled:opacity-40 disabled:cursor-not-allowed p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-lightPrimary" aria-label={`移除${j.title}`} title={sj.applications > 0 ? "已有投递,不能移除;可关闭参与匹配" : "从专场移除"}><I name="trash-2" size={14} /></button>}
              </div>
            </div>
          </Card>
        );
      })}

      {canManage && !error && (
        <Card className="p-4 !flex-row items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-600 inline-flex items-center gap-1"><I name="corner-down-right" size={12} />从已有岗位加入</span>
          <Select small aria-label="选择已有岗位" disabled={loading || mutating} value={addId} onChange={(e) => setAddId(e.target.value)} className="flex-1 min-w-[240px]"><option value="">选择系统「岗位」页里已有的岗位…</option>{available.map((x) => <option key={x.id} value={x.id}>{x.title}{x.dept ? ` · ${x.dept}` : ""}</option>)}</Select>
          <Select small aria-label="加入岗位类型" disabled={loading || mutating} value={addKind} onChange={(e) => setAddKind(e.target.value)}><option value="onsite">现场面试</option><option value="referral">内推</option></Select>
          <Button size="sm" variant="secondary" disabled={!addId || loading || mutating} onClick={onAdd} icon={<I name="plus" size={14} />}>加入</Button>
        </Card>
      )}

      <JobFormModal key={`${sessionId}:${form?.sj?.id || "new"}`} open={!!form} onClose={() => setForm(null)} session={session} sessionJob={form?.sj || null} onSaved={() => { load(); onChanged?.(); }} />
      {bulkOpen && <BulkJobEditModal selected={selected} onClose={() => setBulkOpen(false)} onSave={onBulkSave} />}
    </div>
  );
}
