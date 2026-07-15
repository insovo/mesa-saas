import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { resources } from "../lib/api.js";
import { Card, Button, I, Empty, LoadingBlock, Avatar, toast, StagePill } from "../components/Primitives.jsx";
import PerformanceShareModal, {
  CreatePerformanceEvalModal,
  CreatePerformancePersonModal,
} from "../components/PerformanceShareModal.jsx";

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

export default function Performance() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [personOpen, setPersonOpen] = useState(false);
  const [evalTarget, setEvalTarget] = useState(null);
  const [shareTarget, setShareTarget] = useState(null); // { employee, evaluation }

  async function load(search = q) {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.q = search.trim();
      const { items: list } = await resources.performance.listPeople(params);
      setItems(list || []);
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
                  return (
                    <tr key={emp.id} className="border-b border-[#F4F7FE] hover:bg-lightPrimary/30">
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
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <StatusChip status={latest.status} />
                              <span className="text-xs text-[#707EAE]">{latest.reviewPeriod}</span>
                            </div>
                            {latest.rating && (
                              <div className="text-[11px] text-navy-700 font-medium">
                                {latest.rating}
                                {latest.managerTotal != null ? ` · ${latest.managerTotal}` : ""}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-[#A0AEC0]">尚未发起</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
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
