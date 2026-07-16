import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { resources } from "../lib/api.js";
import { HIRE_STAGES } from "../lib/constants.js";
import { Card, Button, I, Empty, LoadingBlock, Avatar, toast, StagePill, Modal, Input } from "../components/Primitives.jsx";
import PerformanceShareModal, {
  CreatePerformanceEvalModal,
  BulkCreatePerformanceEvalModal,
  CreatePerformancePersonModal,
  PerformanceEvalViewModal,
} from "../components/PerformanceShareModal.jsx";
import HrSignatureManager, { blobErrorMessage } from "../components/HrSignatureManager.jsx";

const STATUS_LABEL = {
  draft: { label: "草稿", tone: "bg-gray-100 text-gray-700" },
  self_done: { label: "已自评", tone: "bg-amber-100 text-amber-700" },
  submitted: { label: "已完成", tone: "bg-green-100 text-green-700" },
  revoked: { label: "已撤销", tone: "bg-red-100 text-red-700" },
};

function StatusChip({ status }) {
  const cfg = STATUS_LABEL[status] || { label: status || "—", tone: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.tone}`}>
      {cfg.label}
    </span>
  );
}

/** 表头列快速筛选：chevron + 下拉；「全部」清空 */
function HeaderFilter({ label, active, open, onToggle, children }) {
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onToggle(false);
    }
    function onKey(e) {
      if (e.key === "Escape") onToggle(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onToggle]);

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => onToggle(!open)}
        className={`inline-flex items-center gap-1 font-bold uppercase tracking-wide transition ${
          active ? "text-brand" : "text-[#A0AEC0] hover:text-navy-700"
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {label}
        <I name={active ? "filter" : "chevron-down"} size={12} className={active ? "text-brand" : ""} />
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-30 mt-1 min-w-[160px] max-h-64 overflow-y-auto rounded-xl border border-[#E9ECEF] bg-white py-1 shadow-card"
          role="listbox"
        >
          {children}
        </div>
      )}
    </div>
  );
}

function FilterOption({ selected, onClick, children }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-lightPrimary ${
        selected ? "font-bold text-brand" : "text-navy-700"
      }`}
    >
      <span className="truncate">{children}</span>
      {selected && <I name="check" size={12} className="shrink-0 text-brand" />}
    </button>
  );
}

function FilterSectionLabel({ children }) {
  return (
    <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-[#A0AEC0]">
      {children}
    </div>
  );
}

/** 已完成 / 已撤销 / 已出结果的可查看 */
function canViewEval(ev) {
  if (!ev) return false;
  return (
    ev.status === "submitted" ||
    ev.status === "revoked" ||
    ev.status === "self_done" ||
    ev.rating != null ||
    ev.managerTotal != null
  );
}

/** 无评价 → 发起；已有 → 分享/导出 */
function openEvalExport(emp, { setEvalTarget, setShareTarget }) {
  const latest = emp.latestEvaluation;
  if (latest) {
    setShareTarget({ employee: emp, evaluation: latest });
  } else {
    setEvalTarget(emp);
  }
}

export default function Performance() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [personOpen, setPersonOpen] = useState(false);
  const [evalTarget, setEvalTarget] = useState(null);
  const [shareTarget, setShareTarget] = useState(null); // { employee, evaluation }
  const [viewTarget, setViewTarget] = useState(null); // { employee, evaluationId }
  const [selected, setSelected] = useState(() => new Set());
  const [embedHrBatch, setEmbedHrBatch] = useState(false);
  const [hasHrStamp, setHasHrStamp] = useState(false);
  const [hrSealOpen, setHrSealOpen] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [keyTargets, setKeyTargets] = useState(() => ["self", "manager"]);
  const [setKeyValue, setSetKeyValue] = useState("");
  const [keyResultOpen, setKeyResultOpen] = useState(false);
  const [keyResultItems, setKeyResultItems] = useState([]);
  const [keyResultMode, setKeyResultMode] = useState("generate");
  const [bulkCreateOpen, setBulkCreateOpen] = useState(false);
  const [filterJob, setFilterJob] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterStage, setFilterStage] = useState("");
  const [openFilter, setOpenFilter] = useState(null); // "jobDept" | "stage" | null

  async function load(search = q) {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.q = search.trim();
      const { items: list } = await resources.performance.listPeople(params);
      setItems(list || []);
      setSelected(new Set());
    } catch (e) {
      toast(e.response?.data?.message || e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function refreshHrStamp() {
    try {
      const data = await resources.performance.getHrSignature();
      setHasHrStamp(!!data?.hasSignature);
      if (!data?.hasSignature) setEmbedHrBatch(false);
    } catch {
      /* 列表页可继续用；嵌入勾选保持禁用 */
    }
  }

  useEffect(() => {
    load();
    refreshHrStamp();
    // eslint-disable-next-line
  }, []);

  const jobOptions = useMemo(() => {
    const names = new Set();
    for (const e of items) {
      if (e.appliedFor) names.add(e.appliedFor);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "zh"));
  }, [items]);

  const deptOptions = useMemo(() => {
    const names = new Set();
    for (const e of items) {
      if (e.dept) names.add(e.dept);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "zh"));
  }, [items]);

  const stageOptions = useMemo(() => {
    const present = new Set(items.map((e) => e.stage).filter(Boolean));
    const extra = [...present]
      .filter((s) => !HIRE_STAGES.includes(s))
      .sort((a, b) => a.localeCompare(b, "zh"));
    return [...HIRE_STAGES, ...extra];
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((e) => {
      if (filterJob && e.appliedFor !== filterJob) return false;
      if (filterDept && e.dept !== filterDept) return false;
      if (filterStage && e.stage !== filterStage) return false;
      return true;
    });
  }, [items, filterJob, filterDept, filterStage]);

  const keyableIds = useMemo(() => {
    return filtered
      .filter((emp) => emp.latestEvaluation && emp.latestEvaluation.status !== "revoked")
      .map((emp) => emp.latestEvaluation.id);
  }, [filtered]);

  const exportableIds = useMemo(() => {
    return filtered
      .filter((emp) => emp.latestEvaluation?.status === "submitted")
      .map((emp) => emp.latestEvaluation.id);
  }, [filtered]);

  const allKeyableSelected =
    keyableIds.length > 0 && keyableIds.every((id) => selected.has(id));

  const bothKeyTargets =
    keyTargets.includes("self") && keyTargets.includes("manager");

  const selectedEmployees = useMemo(() => {
    const byId = new Map();
    for (const evalId of selected) {
      const emp = items.find((e) => e.latestEvaluation?.id === evalId);
      if (emp) byId.set(emp.id, emp);
    }
    return [...byId.values()];
  }, [selected, items]);

  const bulkCreateInitialPeriod = useMemo(() => {
    const periods = selectedEmployees
      .map((e) => e.latestEvaluation?.reviewPeriod)
      .filter(Boolean);
    if (periods.length === 0) return "";
    const first = periods[0];
    return periods.every((p) => p === first) ? first : "";
  }, [selectedEmployees]);

  const canBulkCreate =
    selectedEmployees.length > 0 && bothKeyTargets && !batchBusy;

  function toggleOne(evalId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(evalId)) next.delete(evalId);
      else next.add(evalId);
      return next;
    });
  }

  function toggleAllKeyable() {
    if (allKeyableSelected) setSelected(new Set());
    else setSelected(new Set(keyableIds));
  }

  function toggleKeyTarget(t) {
    setKeyTargets((prev) => {
      if (prev.includes(t)) {
        const next = prev.filter((x) => x !== t);
        return next.length ? next : prev;
      }
      return [...prev, t];
    });
  }

  async function runBulkKeys(mode) {
    const ids = [...selected];
    if (ids.length === 0) {
      toast("请先勾选评价记录", "error");
      return;
    }
    if (mode === "set") {
      const k = setKeyValue.trim();
      if (!k) {
        toast("请输入统一访问密钥", "error");
        return;
      }
    }
    setBatchBusy(true);
    try {
      const data = await resources.performance.bulkAccessKeys({
        evaluationIds: ids,
        targets: keyTargets,
        mode,
        accessKey: mode === "set" ? setKeyValue.trim() : undefined,
      });
      setKeyResultMode(mode);
      setKeyResultItems(data.items || []);
      setKeyResultOpen(true);
      toast(
        mode === "generate"
          ? `已为 ${data.count} 份评价刷新随机密钥`
          : `已为 ${data.count} 份评价设置统一密钥`,
        "success"
      );
      if (mode === "set") setSetKeyValue("");
    } catch (err) {
      toast(err.response?.data?.message || err.message, "error");
    } finally {
      setBatchBusy(false);
    }
  }

  async function exportAccessKeys() {
    const ids = [...selected];
    if (ids.length === 0) {
      toast("请先勾选评价记录", "error");
      return;
    }
    setBatchBusy(true);
    try {
      const res = await resources.performance.exportAccessKeys({
        evaluationIds: ids,
        targets: keyTargets,
        origin: window.location.origin,
      });
      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `绩效访问密钥-${stamp}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast(`已导出 ${ids.length} 条密钥`, "success");
    } catch (err) {
      toast(await blobErrorMessage(err), "error");
    } finally {
      setBatchBusy(false);
    }
  }

  async function batchExport() {
    const ids = [...selected].filter((id) => exportableIds.includes(id));
    if (ids.length === 0) {
      toast("请勾选「已完成」的评价后再导出", "error");
      return;
    }
    if (embedHrBatch && !hasHrStamp) {
      toast("请先上传 HR 电子章", "error");
      return;
    }
    setBatchBusy(true);
    let ok = 0;
    try {
      for (const id of ids) {
        const emp = items.find((e) => e.latestEvaluation?.id === id);
        try {
          const res = await resources.performance.exportEvaluation(id, {
            lang: "zh-en",
            embedHrSignature: embedHrBatch ? "1" : undefined,
          });
          const blob = new Blob([res.data], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `属地人员月度绩效评价表_${emp?.name || "员工"}.xlsx`;
          a.click();
          URL.revokeObjectURL(a.href);
          ok += 1;
          // 连续下载间隔，避免浏览器吞掉
          await new Promise((r) => setTimeout(r, 350));
        } catch (err) {
          toast(`${emp?.name || id}: ${await blobErrorMessage(err)}`, "error");
        }
      }
      if (ok > 0) toast(`已开始下载 ${ok} 份`, "success");
    } finally {
      setBatchBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-4 !flex-row flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] flex-wrap">
          <div className="relative flex-1 max-w-md min-w-[180px]">
            <I name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A0AEC0]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="搜索姓名 / 岗位 / 部门…"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#E9ECEF] text-sm outline-none focus:border-brand"
            />
          </div>
          <select
            value={filterJob}
            onChange={(e) => setFilterJob(e.target.value)}
            className="h-9 px-3 rounded-xl border border-[#E9ECEF] bg-white text-sm text-navy-700 outline-none focus:border-brand max-w-[180px]"
            title="按岗位筛选"
          >
            <option value="">全部岗位</option>
            {jobOptions.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="h-9 px-3 rounded-xl border border-[#E9ECEF] bg-white text-sm text-navy-700 outline-none focus:border-brand max-w-[180px]"
            title="按部门筛选"
          >
            <option value="">全部部门</option>
            {deptOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          {(filterJob || filterDept) && (
            <button
              type="button"
              onClick={() => {
                setFilterJob("");
                setFilterDept("");
              }}
              className="text-xs text-[#707EAE] hover:text-brand font-medium px-1"
            >
              清除筛选
            </button>
          )}
          <Button size="sm" variant="ghost" onClick={() => load()}>
            <I name="refresh-cw" size={14} /> 刷新
          </Button>
        </div>
        <Button size="sm" onClick={() => setPersonOpen(true)}>
          <I name="user-plus" size={14} /> 新建人员
        </Button>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4 space-y-3">
          <div className="text-sm font-bold text-navy-700 flex items-center gap-1.5">
            <I name="download" size={16} className="text-brand" />
            批量导出
          </div>
          <p className="text-[11px] text-[#707EAE]">
            勾选列表中「已完成」的评价，可连续下载多份中英双语 Excel
          </p>
          <div className="flex items-center justify-between gap-2">
            <label className={`flex items-center gap-2 text-xs min-w-0 ${hasHrStamp ? "text-navy-700" : "text-[#A0AEC0]"}`}>
              <input
                type="checkbox"
                checked={embedHrBatch}
                disabled={!hasHrStamp || batchBusy}
                onChange={(e) => setEmbedHrBatch(e.target.checked)}
                className="rounded border-[#E9ECEF] text-brand focus:ring-brand"
              />
              嵌入 HR 签名
              {!hasHrStamp && (
                <span className="text-[10px]">（请先点「HR电子章」上传）</span>
              )}
            </label>
            <Button size="sm" variant="ghost" className="shrink-0" onClick={() => setHrSealOpen(true)}>
              <I name="file-signature" size={14} /> HR电子章
            </Button>
          </div>
          <Button
            size="sm"
            disabled={batchBusy || selected.size === 0}
            onClick={batchExport}
          >
            <I name="download" size={14} />
            {batchBusy ? "导出中…" : `下载选中 (${selected.size})`}
          </Button>
        </Card>
        <Card className="p-4 space-y-3">
          <div className="text-sm font-bold text-navy-700 flex items-center gap-1.5">
            <I name="key-round" size={16} className="text-brand" />
            批量访问密钥
          </div>
          <p className="text-[11px] text-[#707EAE]">
            勾选评价后：刷新则每人不同随机密钥；统一设置则勾选人共用同一密钥（适合主管评多人）；也可导出含链接与明文密钥的 Excel。
          </p>
          <div className="flex flex-wrap items-center gap-4 text-xs text-navy-700">
            {[
              { id: "self", label: "自评" },
              { id: "manager", label: "主管" },
            ].map((t) => (
              <label
                key={t.id}
                className="inline-flex items-center gap-2 cursor-pointer select-none font-bold"
              >
                <input
                  type="checkbox"
                  checked={keyTargets.includes(t.id)}
                  onChange={() => toggleKeyTarget(t.id)}
                  className="h-4 w-4 rounded border-[#E9ECEF] text-brand focus:ring-brand"
                />
                {t.label}
              </label>
            ))}
          </div>
          <Input
            className="!h-10 text-xs font-mono"
            placeholder="统一密钥（设置时填写，6–10 位）"
            value={setKeyValue}
            onChange={(e) => setSetKeyValue(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" disabled={batchBusy || selected.size === 0} onClick={() => runBulkKeys("generate")}>
              <I name="refresh-cw" size={14} /> 刷新随机密钥
            </Button>
            <Button size="sm" disabled={batchBusy || selected.size === 0} onClick={() => runBulkKeys("set")}>
              <I name="key-round" size={14} /> 设置统一密钥
            </Button>
            <Button size="sm" variant="ghost" disabled={batchBusy || selected.size === 0} onClick={exportAccessKeys}>
              <I name="download" size={14} /> 批量导出密钥
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!canBulkCreate}
              title={
                !bothKeyTargets
                  ? "需同时勾选「自评」与「主管」"
                  : selectedEmployees.length === 0
                    ? "请先勾选评价记录"
                    : `为 ${selectedEmployees.length} 人发起新周期`
              }
              onClick={() => setBulkCreateOpen(true)}
            >
              <I name="clipboard-check" size={14} /> 批量发起评价
            </Button>
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <LoadingBlock height="h-48" label="加载中…" />
        ) : items.length === 0 ? (
          <div className="p-8">
            <Empty
              icon="clipboard-check"
              title="暂无绩效评价对象"
              desc="已入职候选人对应员工，或在此新建人员后即可发起评价。"
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[#A0AEC0] border-b border-[#E9ECEF] bg-lightPrimary/40">
                  <th className="px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allKeyableSelected}
                      disabled={keyableIds.length === 0}
                      onChange={toggleAllKeyable}
                      title="全选可管理评价"
                      className="rounded border-[#E9ECEF] text-brand focus:ring-brand"
                    />
                  </th>
                  <th className="px-4 py-3 font-bold">员工</th>
                  <th className="px-4 py-3">
                    <HeaderFilter
                      label="岗位 / 部门"
                      active={!!(filterJob || filterDept)}
                      open={openFilter === "jobDept"}
                      onToggle={(next) => setOpenFilter(next ? "jobDept" : null)}
                    >
                      <FilterOption
                        selected={!filterJob && !filterDept}
                        onClick={() => {
                          setFilterJob("");
                          setFilterDept("");
                          setOpenFilter(null);
                        }}
                      >
                        全部
                      </FilterOption>
                      {jobOptions.length > 0 && (
                        <>
                          <FilterSectionLabel>岗位</FilterSectionLabel>
                          {jobOptions.map((job) => (
                            <FilterOption
                              key={`job:${job}`}
                              selected={filterJob === job}
                              onClick={() => {
                                setFilterJob(filterJob === job ? "" : job);
                                setOpenFilter(null);
                              }}
                            >
                              {job}
                            </FilterOption>
                          ))}
                        </>
                      )}
                      {deptOptions.length > 0 && (
                        <>
                          <FilterSectionLabel>部门</FilterSectionLabel>
                          {deptOptions.map((dept) => (
                            <FilterOption
                              key={`dept:${dept}`}
                              selected={filterDept === dept}
                              onClick={() => {
                                setFilterDept(filterDept === dept ? "" : dept);
                                setOpenFilter(null);
                              }}
                            >
                              {dept}
                            </FilterOption>
                          ))}
                        </>
                      )}
                      {jobOptions.length === 0 && deptOptions.length === 0 && (
                        <div className="px-3 py-2 text-xs text-[#A0AEC0]">暂无可筛选项</div>
                      )}
                    </HeaderFilter>
                  </th>
                  <th className="px-4 py-3">
                    <HeaderFilter
                      label="阶段"
                      active={!!filterStage}
                      open={openFilter === "stage"}
                      onToggle={(next) => setOpenFilter(next ? "stage" : null)}
                    >
                      <FilterOption
                        selected={!filterStage}
                        onClick={() => {
                          setFilterStage("");
                          setOpenFilter(null);
                        }}
                      >
                        全部
                      </FilterOption>
                      {stageOptions.map((s) => (
                        <FilterOption
                          key={s}
                          selected={filterStage === s}
                          onClick={() => {
                            setFilterStage(filterStage === s ? "" : s);
                            setOpenFilter(null);
                          }}
                        >
                          {s}
                        </FilterOption>
                      ))}
                    </HeaderFilter>
                  </th>
                  <th className="px-4 py-3 font-bold">最近评价</th>
                  <th className="px-4 py-3 font-bold text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10">
                      <Empty
                        icon="filter"
                        title="没有匹配筛选条件的人"
                        desc="试试清除表头「岗位 / 部门」或「阶段」筛选，或调整搜索关键词。"
                      />
                    </td>
                  </tr>
                ) : (
                  filtered.map((emp) => {
                  const latest = emp.latestEvaluation;
                  const viewable = canViewEval(latest);
                  const canKey = !!latest && latest.status !== "revoked";
                  return (
                    <tr key={emp.id} className="border-b border-[#F4F7FE] hover:bg-lightPrimary/30">
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          disabled={!canKey}
                          checked={canKey && selected.has(latest.id)}
                          onChange={() => canKey && toggleOne(latest.id)}
                          className="rounded border-[#E9ECEF] text-brand focus:ring-brand disabled:opacity-30"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={emp.name} src={emp.avatar} size={36} />
                          <div>
                            <Link
                              to={`/staff/${emp.id}`}
                              className="font-bold text-navy-700 hover:text-brand"
                            >
                              {emp.name}
                            </Link>
                            <div className="text-[11px] text-[#A0AEC0]">
                              {emp.source === "绩效评价新建" ? "绩效新建" : emp.candidate?.status || "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#707EAE]">
                        <div>{emp.appliedFor || "—"}</div>
                        <div className="text-[11px]">{emp.dept || "—"}</div>
                      </td>
                      <td className="px-4 py-3">
                        {emp.stage ? <StagePill stage={emp.stage} /> : <span className="text-[#A0AEC0]">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {latest ? (
                          <button
                            type="button"
                            className={`text-left space-y-1 rounded-lg -mx-1 px-1 py-0.5 transition ${
                              viewable
                                ? "hover:bg-brand/5 cursor-pointer group"
                                : "cursor-default"
                            }`}
                            disabled={!viewable}
                            onClick={() => {
                              if (!viewable) return;
                              setViewTarget({ employee: emp, evaluationId: latest.id });
                            }}
                            title={viewable ? "查看评价详情" : undefined}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <StatusChip status={latest.status} />
                              <span
                                className={`text-xs ${
                                  viewable
                                    ? "text-brand font-bold group-hover:underline"
                                    : "text-[#707EAE]"
                                }`}
                              >
                                {latest.reviewPeriod}
                              </span>
                              {viewable && (
                                <span className="text-[10px] text-brand/70 font-medium inline-flex items-center gap-0.5">
                                  <I name="eye" size={11} /> 查看
                                </span>
                              )}
                            </div>
                            {latest.rating && (
                              <div className="text-[11px] text-navy-700 font-medium">
                                {latest.rating}
                                {latest.managerTotal != null ? ` · ${latest.managerTotal}` : ""}
                              </div>
                            )}
                          </button>
                        ) : (
                          <span className="text-xs text-[#A0AEC0]">尚未发起</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2 flex-nowrap">
                          {viewable && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="shrink-0"
                              onClick={() => setViewTarget({ employee: emp, evaluationId: latest.id })}
                            >
                              <I name="eye" size={14} /> 查看
                            </Button>
                          )}
                          <Button
                            size="sm"
                            className="shrink-0"
                            onClick={() => openEvalExport(emp, { setEvalTarget, setShareTarget })}
                          >
                            <I name="clipboard-check" size={14} /> 评价/导出
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CreatePerformancePersonModal
        open={personOpen}
        onClose={() => setPersonOpen(false)}
        onCreated={() => load()}
      />
      <CreatePerformanceEvalModal
        open={!!evalTarget}
        employee={evalTarget}
        onClose={() => setEvalTarget(null)}
        onCreated={(ev, keys) => {
          setShareTarget({
            employee: evalTarget,
            evaluation: ev,
            initialAccessKeys: keys || null,
          });
          load();
        }}
      />
      <BulkCreatePerformanceEvalModal
        open={bulkCreateOpen}
        employees={selectedEmployees}
        initialPeriod={bulkCreateInitialPeriod}
        onClose={() => setBulkCreateOpen(false)}
        onCreated={(data) => {
          const items = (data?.items || []).map((it) => ({
            evaluationId: it.evaluation?.id,
            employeeName: it.employeeName,
            selfAccessKey: it.selfAccessKey,
            managerAccessKey: it.managerAccessKey,
          }));
          if (items.length) {
            setKeyResultMode("create");
            setKeyResultItems(items);
            setKeyResultOpen(true);
          }
          load();
        }}
      />
      <PerformanceEvalViewModal
        open={!!viewTarget}
        employee={viewTarget?.employee}
        evaluationId={viewTarget?.evaluationId}
        onClose={() => setViewTarget(null)}
        onShare={(ev) => {
          setShareTarget({ employee: viewTarget?.employee, evaluation: ev });
        }}
      />
      <PerformanceShareModal
        open={!!shareTarget}
        employee={shareTarget?.employee}
        evaluation={shareTarget?.evaluation}
        initialAccessKeys={shareTarget?.initialAccessKeys}
        onClose={() => setShareTarget(null)}
        onUpdated={(ev) => {
          setShareTarget((s) => (s ? { ...s, evaluation: ev } : s));
          load();
        }}
        onNewEvaluation={() => {
          if (shareTarget?.employee) setEvalTarget(shareTarget.employee);
        }}
      />
      <Modal open={hrSealOpen} onClose={() => setHrSealOpen(false)} maxWidth="max-w-md">
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-bold text-navy-700 flex items-center gap-2">
              <I name="file-signature" size={20} className="text-brand" />
              HR 电子章管理
            </h3>
            <button
              type="button"
              onClick={() => setHrSealOpen(false)}
              className="text-[#A0AEC0] hover:text-navy-700 shrink-0"
            >
              <I name="x" size={20} />
            </button>
          </div>
          <HrSignatureManager
            key={hrSealOpen ? "hr-seal-open" : "hr-seal-closed"}
            onChange={(d) => {
              setHasHrStamp(!!d?.hasSignature);
              if (!d?.hasSignature) setEmbedHrBatch(false);
            }}
          />
        </div>
      </Modal>
      <Modal open={keyResultOpen} onClose={() => setKeyResultOpen(false)} maxWidth="max-w-2xl">
        <div className="p-6 space-y-4">
          <div>
            <h3 className="text-lg font-bold text-navy-700">
              {keyResultMode === "generate"
                ? "随机密钥已生成"
                : keyResultMode === "create"
                  ? "新周期评价已创建"
                  : "统一密钥已设置"}
            </h3>
            <p className="text-xs text-amber-700 mt-1">
              明文仅此展示一次，请立即复制发给对方；关闭后无法再查看。
            </p>
          </div>
          <div className="max-h-[50vh] overflow-auto rounded-xl border border-[#E9ECEF]">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-lightPrimary/50 text-left text-[#707EAE]">
                  <th className="px-3 py-2">员工</th>
                  <th className="px-3 py-2">自评密钥</th>
                  <th className="px-3 py-2">主管密钥</th>
                </tr>
              </thead>
              <tbody>
                {keyResultItems.map((it) => (
                  <tr key={it.evaluationId} className="border-t border-[#F4F7FE]">
                    <td className="px-3 py-2 font-bold text-navy-700">{it.employeeName}</td>
                    <td className="px-3 py-2 font-mono">
                      {it.selfAccessKey || "—"}
                      {it.selfAccessKey && (
                        <button
                          type="button"
                          className="ml-2 text-brand"
                          onClick={() => navigator.clipboard.writeText(it.selfAccessKey).then(() => toast("已复制", "success"))}
                        >
                          复制
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {it.managerAccessKey || "—"}
                      {it.managerAccessKey && (
                        <button
                          type="button"
                          className="ml-2 text-brand"
                          onClick={() => navigator.clipboard.writeText(it.managerAccessKey).then(() => toast("已复制", "success"))}
                        >
                          复制
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setKeyResultOpen(false)}>关闭</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
