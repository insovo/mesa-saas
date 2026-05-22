import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { resources } from "../lib/api.js";
import { Card, Avatar, StagePill, I, Empty, LoadingBlock, Tag, Button, toast } from "../components/Primitives.jsx";
import { HIRE_STAGES } from "../lib/constants.js";

export default function Staff() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState("");

  async function load() {
    setLoading(true);
    try {
      const params = {};
      if (q) params.q = q;
      if (stageFilter) params.stage = stageFilter;
      const { items } = await resources.employees.list(params);
      setItems(items);
    } catch (e) {
      toast(e.response?.data?.message || e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [stageFilter]);

  const stageCounts = HIRE_STAGES.map((s) => ({
    stage: s,
    count: items.filter((e) => e.stage === s).length,
  }));

  return (
    <div className="space-y-6">
      <Card className="p-4 flex items-center justify-start gap-2 overflow-x-auto">
        <button
          onClick={() => setStageFilter("")}
          className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition
            ${stageFilter === "" ? "bg-brand text-white" : "text-gray-700 hover:bg-lightPrimary"}`}
        >
          全部 · {items.length}
        </button>
        {stageCounts.map((s) => (
          <button
            key={s.stage}
            onClick={() => setStageFilter(stageFilter === s.stage ? "" : s.stage)}
            className={`px-3 py-1.5 rounded-full whitespace-nowrap transition flex items-center gap-2
              ${stageFilter === s.stage ? "bg-lightPrimary ring-2 ring-brand/40" : "hover:bg-lightPrimary"}`}
          >
            <StagePill stage={s.stage} />
            <span className="text-xs font-bold text-navy-700">{s.count}</span>
          </button>
        ))}
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex-1 min-w-[240px] flex items-center bg-lightPrimary rounded-xl pl-4 h-11">
            <I name="search" size={16} className="text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="搜索姓名 / 部门 / 岗位"
              className="flex-1 ml-3 bg-transparent outline-none text-sm text-navy-700 placeholder:text-gray-400"
            />
          </div>
          <Button variant="ghost" onClick={load} icon={<I name="refresh-cw" size={14} />}>刷新</Button>
        </div>

        {loading ? (
          <LoadingBlock height="h-40" />
        ) : items.length === 0 ? (
          <Empty icon="users-round" title="还没有员工" desc="完成候选人入职后会自动出现" />
        ) : (
          <ul className="divide-y divide-gray-200">
            {items.map((e) => (
              <li key={e.id} className="py-4 group">
                {/* 桌面端: 单行 */}
                <div className="hidden md:flex items-center gap-4">
                  <Avatar name={e.name} animal={e.animal} src={e.avatar} size={48} />
                  <div className="min-w-0 flex-1">
                    <Link to={`/staff/${e.externalId || e.id}`} className="text-base font-bold text-navy-700 hover:text-brand">
                      {e.name}
                    </Link>
                    <p className="text-xs text-gray-700 mt-1 truncate">
                      {[e.appliedFor, e.dept, e.level, e.workLocation].filter(Boolean).join(" · ")}
                    </p>
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {(e.tags || []).slice(0, 4).map((t) => <Tag key={t}>{t}</Tag>)}
                    </div>
                  </div>
                  <div className="w-[140px] text-right text-xs text-gray-700 shrink-0">
                    <p>HRBP · {e.hrbp || "—"}</p>
                    <p className="mt-1">主管 · {e.directManager || "—"}</p>
                  </div>
                  <StagePill stage={e.stage || "待入职"} />
                  <Link to={`/staff/${e.externalId || e.id}`} className="opacity-0 group-hover:opacity-100 transition w-8 h-8 rounded-full bg-lightPrimary text-gray-700 hover:text-brand flex items-center justify-center">
                    <I name="arrow-right" size={14} />
                  </Link>
                </div>

                {/* 移动端: 卡片式 stack */}
                <Link to={`/staff/${e.externalId || e.id}`} className="md:hidden block active:bg-lightPrimary -mx-2 px-2 py-1 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Avatar name={e.name} animal={e.animal} src={e.avatar} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-bold text-navy-700">{e.name}</span>
                        <StagePill stage={e.stage || "待入职"} />
                      </div>
                      <p className="text-[11px] text-gray-700 mt-1">{[e.appliedFor, e.dept].filter(Boolean).join(" · ")}</p>
                      <p className="text-[11px] text-gray-700 mt-0.5">{[e.level, e.workLocation].filter(Boolean).join(" · ") || "—"}</p>
                    </div>
                  </div>
                  {((e.tags || []).length > 0) && (
                    <div className="flex gap-1.5 mt-2 flex-wrap pl-[56px]">
                      {(e.tags || []).slice(0, 3).map((t) => <Tag key={t}>{t}</Tag>)}
                    </div>
                  )}
                  <p className="text-[11px] text-gray-600 mt-1.5 pl-[56px]">HRBP · {e.hrbp || "—"} / 主管 · {e.directManager || "—"}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
