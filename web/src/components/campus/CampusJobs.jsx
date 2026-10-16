// 校招岗位统一目录:所有专场共用岗位、匹配配置与顺序
import { useEffect, useState } from "react";
import { Card, Button, I, Empty, LoadingBlock, Modal, toast } from "../Primitives.jsx";
import { Select, KindTag, fmtDate, fmtDateTime } from "./ui.jsx";
import { useCampusJobs } from "./useSessionJobs.js";
import JobFormModal from "./JobFormModal.jsx";
import BulkJobEditModal from "./BulkJobEditModal.jsx";
import ModelGenerationNotice from "./ModelGenerationNotice.jsx";
import CampusJobShareModal from "./CampusJobShareModal.jsx";

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
  const session = sessions.find((item) => item.status === "live") || null;
  const { items, available, loading, error, busy, mutating, bulkProgress, modelNotice, dismissModelNotice, load, add, patch, bulkPatch, remove, bulkRemove, move, generateModel, bulkGenerateModels } = useCampusJobs(onChanged);
  const [form, setForm] = useState(null); // { sj: null } 新建 | { sj } 编辑
  const [addId, setAddId] = useState("");
  const [addKind, setAddKind] = useState("onsite");
  const [expanded, setExpanded] = useState(() => new Set());
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  useEffect(() => { setSelectedIds((prev) => new Set([...prev].filter((id) => items.some((sj) => sj.id === id)))); }, [items]);

  const toggleExpand = (id) => setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selected = items.filter((sj) => selectedIds.has(sj.id));
  const allSelected = items.length > 0 && selected.length === items.length;
  const deletable = selected.filter((sj) => !sj.applications);
  const retained = selected.filter((sj) => sj.applications > 0);
  const modelBusy = Object.values(busy).some(Boolean);
  const selectionBusy = loading || mutating || modelBusy;
  const toggleSelected = (id) => setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  async function onBulkSave(changes) {
    const done = await bulkPatch(selected.map((sj) => sj.id), changes);
    if (done) toast(`已更新 ${selected.length} 个岗位${Object.keys(changes).some((key) => !["kind", "matchEnabled"].includes(key)) ? ",JD 变更后请重新生成评价模型" : ""}`, "success");
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
  async function onBulkRemove() {
    if (!deletable.length || selectionBusy) return;
    const count = deletable.length;
    setDeleteError("");
    if (await bulkRemove(deletable.map((sj) => sj.id))) {
      setDeleteOpen(false); toast(`已删除 ${count} 个校招岗位，可在下方恢复`, "success");
    } else setDeleteError("删除未完成，请查看错误提示，核对最新岗位后重试。");
  }
  function onRemove(sj) {
    if (!confirm(`移除校招岗位「${sj.job?.title}」?所有专场的学生端都会同步移除，可在下方恢复。`)) return;
    remove(sj);
  }
  const hasJdDetail = (j) => j.responsibilities?.length || j.requirements?.length || j.nice?.length || j.benefits?.length || j.description;

  return (
    <div className="space-y-5">
      <Card className="p-4 !flex-row items-center gap-3 flex-wrap">
        <I name="briefcase" size={18} className="text-brand" />
        <div className="flex-1 min-w-0"><h2 className="text-sm font-bold text-navy-700">统一校招岗位</h2><p className="mt-1 text-xs text-gray-600">{items.length} 个岗位 · 添加一次，所有专场均可用；类型、参与匹配和顺序同步生效</p></div>
        <div className="sm:ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" icon={<I name="refresh-cw" size={14} className={loading ? "animate-spin" : ""} />} disabled={loading || mutating || modelBusy} onClick={load}>刷新</Button>
          {canManage && <Button size="sm" icon={<I name="plus" size={14} />} disabled={loading || mutating} onClick={() => setForm({ sj: null })}>新建岗位 JD</Button>}
          {canManage && <Button size="sm" variant="ghost" onClick={() => { setSelectedIds(new Set()); setShareOpen(true); }}>管理岗位分享</Button>}
        </div>
      </Card>

      {canManage && items.length > 0 && !error && (
        <Card className="p-4 !flex-row items-center gap-3 flex-wrap">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-navy-700">
            <input type="checkbox" className="accent-brand" aria-label="全选校招岗位" disabled={selectionBusy} checked={allSelected} onChange={() => setSelectedIds(allSelected ? new Set() : new Set(items.map((sj) => sj.id)))} />全选全部岗位
          </label>
          <span className="text-xs text-gray-600">已选 {selected.length} / {items.length}</span>
          {bulkProgress && <span role="status" className="text-xs text-brand">评价模型生成中 {bulkProgress.done}/{bulkProgress.total}</span>}
          <div className="sm:ml-auto flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="secondary" disabled={!selected.length || selectionBusy} onClick={() => setShareOpen(true)} icon={<I name="share-2" size={13} />}>分享给 HR</Button>
            <Button size="sm" variant="secondary" disabled={!selected.length || selectionBusy} onClick={() => setBulkOpen(true)} icon={<I name="pencil" size={13} />}>批量编辑</Button>
            <Button size="sm" variant="danger" disabled={!selected.length || selectionBusy} onClick={() => { setDeleteError(""); setDeleteOpen(true); }} icon={<I name="trash-2" size={13} />}>批量删除</Button>
            <Button size="sm" disabled={!selected.length || selectionBusy} onClick={onBulkGenerate} icon={<I name="sparkles" size={13} />}>批量生成评价模型</Button>
          </div>
        </Card>
      )}

      {error ? <Card className="p-6"><p role="alert" className="text-sm text-red-600">{error}</p><Button className="mt-3 self-start" size="sm" onClick={load}>重新加载</Button></Card> : loading && items.length === 0 ? <LoadingBlock height="h-40" /> : items.length === 0 ? (
        <Card className="p-6"><Empty icon="briefcase" title="还没有校招岗位" desc={canManage ? "点右上「新建岗位 JD」，创建后所有专场自动可用" : "请联系有校招配置权限的同事添加"} /></Card>
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
                <label className={`inline-flex items-center gap-1.5 text-xs text-navy-700 ${!j.hasEvaluationModel ? "opacity-50" : ""}`} title={!j.hasEvaluationModel ? "尚无评价模型，生成后按参与匹配设置生效" : ""}>
                  <input type="checkbox" className="accent-brand" disabled={!canManage || loading || mutating || busy[sj.id] || !j.hasEvaluationModel} checked={sj.matchEnabled} onChange={(e) => patch(sj, { matchEnabled: e.target.checked })} />参与匹配
                </label>
                {canManage && <Button size="sm" variant="ghost" icon={<I name="pencil" size={14} />} disabled={loading || mutating || busy[sj.id]} onClick={() => setForm({ sj })}>编辑 JD</Button>}
                {canManage && (
                  <Button size="sm" variant={j.hasEvaluationModel ? "ghost" : "secondary"} disabled={loading || mutating || modelBusy} onClick={() => generateModel(sj)} icon={<I name={busy[sj.id] ? "loader" : "sparkles"} size={13} className={busy[sj.id] ? "animate-spin" : ""} />}>
                    {busy[sj.id] ? "生成中…" : j.hasEvaluationModel ? "重新生成评价模型" : "生成评价模型"}
                  </Button>
                )}
                {session?.status === "live" && j.id && (
                  <a href={`/campus/${session.slug}/jobs/${j.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 h-9 px-3 rounded-xl text-xs font-medium text-navy-700 border border-gray-200 hover:border-brand/40 hover:bg-lightPrimary" title="以学生视角打开 JD 页">
                    <I name="external-link" size={13} />学生端预览
                  </a>
                )}
                {canManage && <button type="button" disabled={loading || mutating || busy[sj.id] || sj.applications > 0} onClick={() => onRemove(sj)} className="disabled:opacity-40 disabled:cursor-not-allowed p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-lightPrimary" aria-label={`移除${j.title}`} title={sj.applications > 0 ? "已有投递,不能移除;可关闭参与匹配" : "从所有专场移除"}><I name="trash-2" size={14} /></button>}
              </div>
            </div>
          </Card>
        );
      })}

      {canManage && !error && available.length > 0 && (
        <Card className="p-4 !flex-row items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-600 inline-flex items-center gap-1"><I name="corner-down-right" size={12} />恢复已移除校招岗位</span>
          <Select small aria-label="选择已有校招岗位" disabled={loading || mutating} value={addId} onChange={(e) => setAddId(e.target.value)} className="flex-1 min-w-[240px]"><option value="">选择要恢复的校招岗位…</option>{available.map((x) => <option key={x.id} value={x.id}>{x.title}{x.dept ? ` · ${x.dept}` : ""}</option>)}</Select>
          <Select small aria-label="加入岗位类型" disabled={loading || mutating} value={addKind} onChange={(e) => setAddKind(e.target.value)}><option value="onsite">现场面试</option><option value="referral">内推</option></Select>
          <Button size="sm" variant="secondary" disabled={!addId || loading || mutating} onClick={onAdd} icon={<I name="plus" size={14} />}>恢复</Button>
        </Card>
      )}

      <JobFormModal key={form?.sj?.id || "new"} open={!!form} onClose={() => setForm(null)} sessionJob={form?.sj || null} onSaved={() => { load(); onChanged?.(); }} />
      {bulkOpen && <BulkJobEditModal selected={selected} onClose={() => setBulkOpen(false)} onSave={onBulkSave} />}
      {deleteOpen && (
        <Modal open onClose={() => !mutating && setDeleteOpen(false)} maxWidth="max-w-lg">
          <div className="p-5 sm:p-6 space-y-4 text-navy-700">
            <h2 className="text-xl font-bold">确认批量删除岗位</h2>
            <p className="text-sm text-gray-600">已选 {selected.length} 个岗位，可删除 {deletable.length} 个。删除后所有大学专场同步移除，可在列表下方的「恢复已移除校招岗位」中恢复。</p>
            <section>
              <h3 className="text-sm font-bold mb-2">将删除的岗位（{deletable.length}）</h3>
              <ul className="max-h-52 overflow-y-auto rounded-xl bg-lightPrimary p-3 space-y-2 text-sm">
                {deletable.map((sj) => <li key={sj.id} className="break-words">{sj.job?.title || "岗位已删除"}</li>)}
                {!deletable.length && <li>没有可删除的岗位。</li>}
              </ul>
            </section>
            {retained.length > 0 && <section>
              <h3 className="text-sm font-bold text-amber-700 mb-2">已有投递，将保留（{retained.length}）</h3>
              <ul className="max-h-32 overflow-y-auto rounded-xl bg-amber-50 p-3 space-y-2 text-sm text-amber-800">
                {retained.map((sj) => <li key={sj.id} className="break-words">{sj.job?.title} · {sj.applications} 条投递</li>)}
              </ul>
            </section>}
            {deletable.length > 1000 && <p className="text-sm text-red-500">每次最多删除 1000 个岗位，请分批选择。</p>}
            {deleteError && <p role="alert" className="text-sm text-red-500">{deleteError}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="ghost" disabled={mutating} onClick={() => setDeleteOpen(false)}>取消</Button>
              <Button variant="danger" disabled={selectionBusy || !deletable.length || deletable.length > 1000} onClick={onBulkRemove}>{mutating ? "删除中…" : `确认删除 ${deletable.length} 个岗位`}</Button>
            </div>
          </div>
        </Modal>
      )}
      {shareOpen && <CampusJobShareModal ids={selected.map((sj) => sj.jobId)} onClose={() => setShareOpen(false)} />}
      <ModelGenerationNotice notice={modelNotice} onDismiss={dismissModelNotice} />
    </div>
  );
}
