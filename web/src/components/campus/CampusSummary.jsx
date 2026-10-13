import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { resources } from "../../lib/api.js";
import { Card, Button, Input, I, Empty, LoadingBlock, Modal, toast } from "../Primitives.jsx";
import { Select, errMsg } from "./ui.jsx";

const PAGE_SIZE = 50;
const resultTone = { "通过": "bg-green-50 text-green-700", "淘汰": "bg-red-50 text-red-600", "待定": "bg-amber-50 text-amber-700" };

function Value({ column, row }) {
  const value = row[column.key];
  if (column.key === "name") return <Link to={`/candidates/${row.candidateId}`} className="font-bold text-navy-700 hover:text-brand">{value || "未填写姓名"}</Link>;
  if (!value && value !== 0) return <span className="text-gray-400">—</span>;
  if (column.key.endsWith("Result")) return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${resultTone[value] || "bg-lightPrimary text-gray-700"}`}>{value}</span>;
  return <span className="whitespace-pre-wrap break-words">{value}</span>;
}

function EditSummary({ row, columns, options, onClose, onSaved }) {
  const fields = columns.filter((column) => column.key !== "sequence");
  const [form, setForm] = useState(() => Object.fromEntries(fields.map(({ key }) => [key, row[key] || ""])));
  const [saving, setSaving] = useState(false);
  async function save(event) {
    event.preventDefault();
    const values = Object.fromEntries(Object.entries(form).filter(([key, value]) => value == null || value !== row[key]));
    if (!Object.keys(values).length) { onClose(); return; }
    setSaving(true);
    try {
      await resources.campus.updateSummary(row.id, { values, updatedAt: row.updatedAt });
      toast("汇总资料已保存", "success"); onSaved();
    } catch (error) { toast(errMsg(error, "保存失败"), "error"); }
    finally { setSaving(false); }
  }
  return <Modal open onClose={() => !saving && onClose()} maxWidth="max-w-4xl">
    <form onSubmit={save} className="p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div><h2 className="text-lg font-bold text-navy-700">编辑汇总资料</h2><p className="text-xs text-gray-600 mt-1">{row.name || "未填写姓名"} · {row.sessionName}</p></div>
        <button type="button" aria-label="关闭编辑" disabled={saving} onClick={onClose} className="p-2 text-gray-600 hover:text-brand"><I name="x" size={18} /></button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {fields.map((column) => {
          const value = form[column.key] ?? row.automaticValues[column.key];
          const choices = column.options;
          return <div key={column.key} className={column.key === "cancellationReason" ? "sm:col-span-2 lg:col-span-3" : ""}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label htmlFor={`summary-edit-${column.key}`} className="text-xs font-bold text-navy-700">{column.label}</label>
              {(row.manualFields.includes(column.key) || form[column.key] !== row[column.key]) && <button type="button" onClick={() => setForm((current) => ({ ...current, [column.key]: null }))} className="text-[11px] text-brand">恢复自动</button>}
            </div>
            {choices ? <Select id={`summary-edit-${column.key}`} small className="w-full" value={value} onChange={(event) => setForm({ ...form, [column.key]: event.target.value })}>
              <option value="">未填写</option>{value && !choices.includes(value) && <option value={value}>{value}</option>}{choices.map((option) => <option key={option} value={option}>{option}</option>)}
            </Select> : <>
              <input id={`summary-edit-${column.key}`} list={options[column.key]?.length ? `summary-options-${column.key}` : undefined} value={value} maxLength={column.key === "cancellationReason" ? 1000 : 500} onChange={(event) => setForm({ ...form, [column.key]: event.target.value })} className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-navy-700 outline-none focus:border-brand" />
              {options[column.key]?.length > 0 && <datalist id={`summary-options-${column.key}`}>{options[column.key].map((option) => <option key={option} value={option} />)}</datalist>}
            </>}
          </div>;
        })}
      </div>
      <div className="sticky bottom-0 bg-white pt-5 mt-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>取消</Button>
        <Button type="submit" disabled={saving}>{saving ? "保存中…" : "保存"}</Button>
      </div>
    </form>
  </Modal>;
}

export default function CampusSummary({ sessions }) {
  const [filter, setFilter] = useState({});
  const [skip, setSkip] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState(null);
  const requestId = useRef(0);
  useEffect(() => {
    const current = ++requestId.current;
    setLoading(true); setError("");
    const timer = setTimeout(async () => {
      try {
        const params = Object.fromEntries(Object.entries(filter).filter(([, value]) => value));
        const result = await resources.campus.summary({ ...params, skip, take: PAGE_SIZE });
        if (requestId.current !== current) return;
        setData(result);
        if (skip && skip >= result.total) setSkip(Math.max(0, Math.ceil(result.total / PAGE_SIZE) - 1) * PAGE_SIZE);
      } catch (error) {
        if (requestId.current === current) setError(errMsg(error, "加载汇总失败"));
      } finally { if (requestId.current === current) setLoading(false); }
    }, 200);
    return () => { clearTimeout(timer); requestId.current++; };
  }, [filter, skip, refresh]);
  const columns = data?.columns || [];
  const filterColumns = columns.filter((column) => column.filter);
  const activeCount = Object.entries(filter).filter(([key, value]) => value && key !== "q" && key !== "sessionId").length;
  const updateFilter = (key, value) => { setSkip(0); setFilter((current) => ({ ...current, [key]: value })); };
  const reload = () => setRefresh((value) => value + 1);

  return <div className="min-w-0 w-full space-y-4">
    <Card className="p-4 sm:p-5 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-bold text-navy-700">校招候选人汇总</h2><p className="text-xs text-gray-600 mt-1">{data ? `共 ${data.total} 位候选人` : "汇总全部专场的候选人资料"}</p></div>
        <Button size="sm" variant="ghost" disabled={loading} icon={<I name="refresh-cw" size={14} className={loading ? "animate-spin" : ""} />} onClick={reload}>刷新</Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(160px,240px)_auto] items-center gap-2">
        <Input aria-label="搜索汇总" icon={<I name="search" size={16} />} value={filter.q || ""} onChange={(event) => updateFilter("q", event.target.value)} placeholder="搜索姓名 / 北森号 / 学校 / 岗位" className="!h-10" />
        <Select aria-label="汇总专场" small className="w-full !h-10" value={filter.sessionId || ""} onChange={(event) => updateFilter("sessionId", event.target.value)}><option value="">全部专场</option>{sessions.map((session) => <option key={session.id} value={session.id}>{session.name}</option>)}</Select>
        <Button size="sm" variant={expanded ? "secondary" : "ghost"} aria-expanded={expanded} aria-controls="summary-filters" icon={<I name="filter" size={14} />} onClick={() => setExpanded(!expanded)}>筛选{activeCount ? ` (${activeCount})` : ""}</Button>
      </div>
      {expanded && <div id="summary-filters" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 border-t border-gray-100 pt-4">
        {filterColumns.map((column) => <div key={column.key} className="min-w-0">
          <label htmlFor={`summary-filter-${column.key}`} className="mb-1.5 block text-xs font-medium text-gray-700">{column.label}</label>
          <Select id={`summary-filter-${column.key}`} small className="w-full" value={filter[column.key] || ""} onChange={(event) => updateFilter(column.key, event.target.value)}><option value="">全部</option>{(data.options[column.key] || []).map((option) => <option key={option} value={option}>{option}</option>)}</Select>
        </div>)}
      </div>}
      {Object.values(filter).some(Boolean) && <div className="flex flex-wrap items-center gap-2 text-xs">
        {filterColumns.filter((column) => filter[column.key]).map((column) => <button type="button" key={column.key} onClick={() => updateFilter(column.key, "")} className="inline-flex items-center gap-1 rounded-full bg-lightPrimary px-3 py-1.5 text-brand">{column.label}：{filter[column.key]}<I name="x" size={12} /></button>)}
        <button type="button" className="text-gray-600 hover:text-brand" onClick={() => { setSkip(0); setFilter({}); }}>清空筛选</button>
      </div>}
    </Card>
    {error ? <Card className="p-6"><Empty icon="alert-circle" title={error} /><Button variant="ghost" onClick={reload}>重试</Button></Card> : !data ? <LoadingBlock height="h-48" /> : <Card className={`overflow-hidden ${loading ? "opacity-60" : ""}`}>
      <div className="hidden md:block w-full overflow-x-auto" aria-busy={loading}>
        <table className="w-full min-w-[2800px] text-sm text-left">
          <thead><tr className="bg-lightPrimary/50 text-xs text-gray-700">{columns.map((column) => <th key={column.key} scope="col" className={`px-4 py-4 font-medium whitespace-nowrap ${column.key === "sequence" ? "sticky left-0 z-20 bg-lightPrimary" : column.key === "name" ? "sticky left-16 z-20 bg-lightPrimary min-w-[120px]" : ""}`}>{column.label}</th>)}{data.canEdit && <th scope="col" className="px-4 py-4">操作</th>}</tr></thead>
          <tbody>{data.items.map((row) => <tr key={row.id} className="border-t border-gray-100 hover:bg-lightPrimary/20">{columns.map((column) => <td key={column.key} className={`px-4 py-4 align-top text-navy-700 max-w-[240px] ${column.key === "sequence" ? "sticky left-0 z-10 bg-white w-16" : column.key === "name" ? "sticky left-16 z-10 bg-white" : ""}`}><Value column={column} row={row} /></td>)}{data.canEdit && <td className="px-4 py-4 align-top"><button type="button" onClick={() => setEditing(row)} className="whitespace-nowrap text-brand hover:underline">编辑</button></td>}</tr>)}</tbody>
        </table>
      </div>
      <div className="md:hidden divide-y divide-gray-100" aria-busy={loading}>
        {data.items.map((row) => <article key={row.id} className="p-4">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm"><span className="mr-2 text-gray-400">{row.sequence}</span><Value column={{ key: "name" }} row={row} /></p><p className="text-xs text-gray-600 mt-1 break-words">{[row.school, row.degree, row.gradYear && `${row.gradYear}届`].filter(Boolean).join(" · ") || "学校资料待补充"}</p></div>{data.canEdit && <button type="button" onClick={() => setEditing(row)} className="shrink-0 px-2 py-1 text-xs text-brand">编辑</button>}</div>
          <p className="mt-3 text-xs text-navy-700 break-words">{row.jobDirection || "岗位方向待补充"}{row.status && <span className="ml-2 text-brand">{row.status}</span>}</p>
          <details className="mt-3"><summary className="cursor-pointer text-xs text-gray-700">全部登记信息</summary><dl className="grid grid-cols-2 gap-x-4 gap-y-3 mt-3">{columns.filter((column) => !["sequence", "name"].includes(column.key)).map((column) => <div key={column.key} className="min-w-0"><dt className="text-[11px] text-gray-600 mb-1">{column.label}</dt><dd className="text-xs text-navy-700 break-words"><Value column={column} row={row} /></dd></div>)}</dl></details>
        </article>)}
      </div>
      {!data.items.length && <div className="p-8"><Empty icon="table-2" title="暂无符合条件的候选人" desc="调整筛选条件，或先在台账中登记学生" /></div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 text-xs text-gray-700">
        <span>{data.total ? `${skip + 1}–${Math.min(skip + PAGE_SIZE, data.total)} / ${data.total}` : "0 位候选人"}</span><div className="flex items-center gap-2"><Button size="sm" variant="ghost" disabled={loading || skip === 0} onClick={() => setSkip(skip - PAGE_SIZE)}>上一页</Button><Button size="sm" variant="ghost" disabled={loading || skip + PAGE_SIZE >= data.total} onClick={() => setSkip(skip + PAGE_SIZE)}>下一页</Button></div>
      </div>
    </Card>}
    {editing && <EditSummary row={editing} columns={columns} options={data.options} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
  </div>;
}
