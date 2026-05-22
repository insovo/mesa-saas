import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { resources } from "../lib/api.js";
import {
  Card,
  Avatar,
  StagePill,
  TaskStatusPill,
  I,
  Empty,
  LoadingBlock,
  toast,
} from "../components/Primitives.jsx";
import { HIRE_CHECKLIST_KEYS } from "../lib/constants.js";

const KANBAN_STAGES = ["待入职", "入职准备", "入职当天", "试用期"];

export default function NewHire() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    resources.employees
      .list({ take: 200 })
      .then(({ items }) => setItems(items.filter((e) => KANBAN_STAGES.includes(e.stage))))
      .catch((e) => toast(e.response?.data?.message || e.message, "error"))
      .finally(() => setLoading(false));
  }, []);

  const byStage = useMemo(() => {
    const m = {};
    KANBAN_STAGES.forEach((s) => (m[s] = []));
    items.forEach((e) => {
      if (m[e.stage]) m[e.stage].push(e);
    });
    return m;
  }, [items]);

  if (loading) return <LoadingBlock height="h-64" />;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="title-card flex items-center gap-2">
          <I name="user-plus" size={18} className="text-brand" />
          入职管理看板
        </h2>
        <p className="text-xs text-gray-700 mt-1">从签字 Offer 到 90 天转正,跨阶段拖动跟进。</p>
      </Card>

      {items.length === 0 ? (
        <Card className="p-6"><Empty icon="user-plus" title="近期无入职安排" /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {KANBAN_STAGES.map((stage) => (
            <Card key={stage} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <StagePill stage={stage} />
                <span className="text-xs font-bold text-gray-700">{byStage[stage].length}</span>
              </div>
              <ul className="space-y-3 min-h-[80px]">
                {byStage[stage].map((e) => {
                  const done = HIRE_CHECKLIST_KEYS.filter((k) => e.checklist?.[k.key]?.status === "已完成").length;
                  return (
                    <li key={e.id} className="p-3 rounded-xl bg-lightPrimary">
                      <div className="flex items-center gap-2">
                        <Avatar name={e.name} animal={e.animal} src={e.avatar} size={36} />
                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/staff/${e.externalId || e.id}`}
                            className="text-sm font-bold text-navy-700 hover:text-brand truncate block"
                          >
                            {e.name}
                          </Link>
                          <p className="text-[11px] text-gray-700 truncate">{e.appliedFor}</p>
                        </div>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-white overflow-hidden">
                          <div
                            className="h-full bg-brand-gradient"
                            style={{ width: `${(done / HIRE_CHECKLIST_KEYS.length) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-[10px] font-bold text-brand">{done}/{HIRE_CHECKLIST_KEYS.length}</span>
                      </div>
                    </li>
                  );
                })}
                {byStage[stage].length === 0 && (
                  <li className="text-xs text-gray-600 text-center py-6">暂无</li>
                )}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
