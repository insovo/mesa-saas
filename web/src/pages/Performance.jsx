import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { resources } from "../lib/api.js";
import { Card, Button, I, Empty, LoadingBlock, Avatar, toast, StagePill } from "../components/Primitives.jsx";
import PerformanceShareModal, {
  CreatePerformanceEvalModal,
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

const EXPORT_LANGS = [
  { value: "zh", label: "中文" },
  { value: "zh-en", label: "中英双语" },
  { value: "zh-es", label: "中西双语" },
  { value: "en", label: "英文" },
];

function StatusChip({ status }) {
  const cfg = STATUS_LABEL[status] || { label: status || "—", tone: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.tone}`}>
      {cfg.label}
    </span>
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

export default function Performance() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [personOpen, setPersonOpen] = useState(false);
  const [evalTarget, setEvalTarget] = useState(null);
  const [shareTarget, setShareTarget] = useState(null); // { employee, evaluation }
  const [viewTarget, setViewTarget] = useState(null); // { employee, evaluationId }
  const [selected, setSelected] = useState(() => new Set());
  const [batchLang, setBatchLang] = useState("zh-en");
  const [embedHrBatch, setEmbedHrBatch] = useState(false);
  const [hasHrStamp, setHasHrStamp] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);

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

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, []);

  const exportableIds = useMemo(() => {
    return items
      .filter((emp) => emp.latestEvaluation?.status === "submitted")
      .map((emp) => emp.latestEvaluation.id);
  }, [items]);

  const allExportableSelected =
    exportableIds.length > 0 && exportableIds.every((id) => selected.has(id));

  function toggleOne(evalId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(evalId)) next.delete(evalId);
      else next.add(evalId);
      return next;
    });
  }

  function toggleAllExportable() {
    if (allExportableSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(exportableIds));
    }
  }

  async function batchExport() {
    const ids = [...selected];
    if (ids.length === 0) {
      toast("请先勾选已完成的评价", "error");
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
            lang: batchLang,
            embedHrSignature: embedHrBatch ? "1" : undefined,
          });
          const blob = new Blob([res.data], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `绩效评价_${emp?.name || "员工"}_${batchLang}.xlsx`;
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
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1 max-w-md">
            <I name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A0AEC0]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="搜索姓名 / 岗位 / 部门…"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#E9ECEF] text-sm outline-none focus:border-brand"
            />
          </div>
          <Button size="sm" variant="ghost" onClick={() => load()}>
            <I name="refresh-cw" size={14} /> 刷新
          </Button>
        </div>
        <Button size="sm" onClick={() => setPersonOpen(true)}>
          <I name="user-plus" size={14} /> 新建人员
        </Button>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HrSignatureManager onChange={(d) => setHasHrStamp(!!d?.hasSignature)} />
        <Card className="p-4 space-y-3">
          <div className="text-sm font-bold text-navy-700 flex items-center gap-1.5">
            <I name="download" size={16} className="text-brand" />
            批量导出
          </div>
          <p className="text-[11px] text-[#707EAE]">
            勾选列表中「已完成」的评价，可连续下载多份 Excel
          </p>
          <div className="flex flex-wrap gap-2">
            {EXPORT_LANGS.map((l) => (
              <button
                key={l.value}
                type="button"
                onClick={() => setBatchLang(l.value)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                  batchLang === l.value
                    ? "bg-brand-gradient text-white"
                    : "bg-lightPrimary text-[#707EAE]"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <label className={`flex items-center gap-2 text-xs ${hasHrStamp ? "text-navy-700" : "text-[#A0AEC0]"}`}>
            <input
              type="checkbox"
              checked={embedHrBatch}
              disabled={!hasHrStamp || batchBusy}
              onChange={(e) => setEmbedHrBatch(e.target.checked)}
              className="rounded border-[#E9ECEF] text-brand focus:ring-brand"
            />
            嵌入 HR 签名
            {!hasHrStamp && <span className="text-[10px]">（请先上传电子章）</span>}
          </label>
          <Button
            size="sm"
            disabled={batchBusy || selected.size === 0}
            onClick={batchExport}
          >
            <I name="download" size={14} />
            {batchBusy ? "导出中…" : `下载选中 (${selected.size})`}
          </Button>
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
                      checked={allExportableSelected}
                      disabled={exportableIds.length === 0}
                      onChange={toggleAllExportable}
                      title="全选已完成"
                      className="rounded border-[#E9ECEF] text-brand focus:ring-brand"
                    />
                  </th>
                  <th className="px-4 py-3 font-bold">员工</th>
                  <th className="px-4 py-3 font-bold">岗位 / 部门</th>
                  <th className="px-4 py-3 font-bold">阶段</th>
                  <th className="px-4 py-3 font-bold">最近评价</th>
                  <th className="px-4 py-3 font-bold text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((emp) => {
                  const latest = emp.latestEvaluation;
                  const viewable = canViewEval(latest);
                  const canExport = latest?.status === "submitted";
                  return (
                    <tr key={emp.id} className="border-b border-[#F4F7FE] hover:bg-lightPrimary/30">
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          disabled={!canExport}
                          checked={canExport && selected.has(latest.id)}
                          onChange={() => canExport && toggleOne(latest.id)}
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
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {viewable && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setViewTarget({ employee: emp, evaluationId: latest.id })}
                            >
                              <I name="eye" size={14} /> 查看
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setEvalTarget(emp)}>
                            <I name="clipboard-plus" size={14} /> 发起评价
                          </Button>
                          {latest && (
                            <Button
                              size="sm"
                              onClick={() => setShareTarget({ employee: emp, evaluation: latest })}
                            >
                              <I name="share-2" size={14} /> 分享 / 导出
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
        onCreated={(ev) => {
          setShareTarget({ employee: evalTarget, evaluation: ev });
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
        onClose={() => setShareTarget(null)}
        onUpdated={(ev) => {
          setShareTarget((s) => (s ? { ...s, evaluation: ev } : s));
          load();
        }}
      />
    </div>
  );
}
