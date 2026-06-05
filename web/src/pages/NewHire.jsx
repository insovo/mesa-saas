import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { resources } from "../lib/api.js";
import { useHasModule } from "../lib/authContext.jsx";
import {
  Card,
  Avatar,
  StagePill,
  I,
  Empty,
  LoadingBlock,
  Input,
  toast,
} from "../components/Primitives.jsx";
import {
  HIRE_CHECKLIST_KEYS,
  HIRE_STAGE_TONE,
} from "../lib/constants.js";

gsap.registerPlugin(useGSAP);

// 看板里展示的 6 个 stage(去掉「已离职」)
const STAGES_DISPLAY = ["待入职", "入职准备", "入职当天", "试用期", "已转正", "延期试用"];

function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}
function daysSince(d) {
  if (!d) return null;
  const start = new Date(d).getTime();
  return Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24));
}
function checklistDone(checklist) {
  if (!checklist || typeof checklist !== "object") return 0;
  return HIRE_CHECKLIST_KEYS.filter(
    (k) => checklist[k.key]?.status === "已完成"
  ).length;
}

// ===== 顶部 KPI 卡片 (GSAP CountUp 数字) =====
function StageStatCard({ stage, count, active, onClick }) {
  const tone = HIRE_STAGE_TONE[stage] || HIRE_STAGE_TONE["待入职"];
  const numRef = useRef(null);
  const prev = useRef(0);
  useEffect(() => {
    if (!numRef.current) return;
    const obj = { v: prev.current };
    gsap.to(obj, {
      v: count,
      duration: 0.7,
      ease: "power2.out",
      onUpdate: () => {
        if (numRef.current) numRef.current.textContent = Math.round(obj.v);
      },
    });
    prev.current = count;
  }, [count]);
  return (
    <button
      onClick={onClick}
      className={`relative text-left p-4 rounded-card bg-white shadow-card transition-all hover:-translate-y-0.5 ${
        active ? "ring-2 ring-brand" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: tone.bg }}
        >
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: tone.dot }}
          />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-700">{stage}</p>
          <p
            ref={numRef}
            className="text-2xl font-bold text-navy-700 leading-none mt-1 tabular-nums"
          >
            0
          </p>
        </div>
      </div>
    </button>
  );
}

// ===== 横向 chip =====
function FilterChip({ active, stage, count, onClick, label }) {
  const tone = stage ? HIRE_STAGE_TONE[stage] : null;
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors whitespace-nowrap ${
        active
          ? "bg-brand-gradient text-white shadow-button"
          : "bg-lightPrimary text-navy-700 hover:bg-white hover:shadow-card"
      }`}
    >
      {tone && (
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: active ? "#fff" : tone.dot }}
        />
      )}
      {label}
      <span className={active ? "text-white/80" : "text-gray-700"}>
        ({count})
      </span>
    </button>
  );
}

// ===== 入职日期 / 试用期 列 =====
function HireDateCell({ e }) {
  // 已入职:actualHireDate + D{days};未入职:预计 plannedHireDate
  if (e.actualHireDate) {
    const days = daysSince(e.actualHireDate);
    const probEnd = e.probationEndDate ? new Date(e.probationEndDate).getTime() : null;
    const startMs = new Date(e.actualHireDate).getTime();
    let percent = 100;
    if (probEnd && probEnd > startMs) {
      const total = probEnd - startMs;
      const elapsed = Date.now() - startMs;
      percent = Math.min(100, Math.max(0, (elapsed / total) * 100));
    }
    return (
      <div className="min-w-[140px]">
        <p className="text-xs text-navy-700 mb-1.5">{fmtDate(e.actualHireDate)}</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-gradient"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-[10px] font-bold text-gray-700">D{days}</span>
        </div>
      </div>
    );
  }
  if (e.plannedHireDate) {
    return (
      <p className="text-xs text-gray-700">
        预计 <span className="text-navy-700 font-medium">{fmtDate(e.plannedHireDate)}</span>
      </p>
    );
  }
  return <p className="text-xs text-gray-400">—</p>;
}

// ===== 清单进度 =====
function ChecklistCell({ checklist }) {
  const done = checklistDone(checklist);
  const total = HIRE_CHECKLIST_KEYS.length;
  const pct = (done / total) * 100;
  const isFull = done === total;
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${
            isFull ? "bg-green-500" : "bg-brand-gradient"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`text-[10px] font-bold ${
          isFull ? "text-green-600" : "text-brand"
        }`}
      >
        {done}/{total}
      </span>
    </div>
  );
}

// ===== 风险 =====
function RiskCell({ riskItems }) {
  const n = Array.isArray(riskItems) ? riskItems.length : 0;
  if (n === 0) {
    return (
      <span className="inline-flex w-6 h-6 rounded-md items-center justify-center bg-green-100 text-green-600">
        <I name="check" size={12} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md bg-amber-100 text-amber-700 text-xs font-bold">
      {n}
    </span>
  );
}

export default function NewHire() {
  const [items, setItems] = useState([]);
  const [depts, setDepts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filterStage, setFilterStage] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const rowsRef = useRef(null);
  const canDelete = useHasModule("employee.delete");

  async function onDelete(e) {
    if (!confirm(`确定删除入职员工「${e.name}」的记录吗?此操作不可恢复(候选人信息保留)。`)) return;
    try {
      await resources.employees.remove(e.id);
      toast("已删除", "success");
      setItems((prev) => prev.filter((x) => x.id !== e.id));
    } catch (err) {
      toast(err.response?.data?.message || "删除失败", "error");
    }
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([
      resources.employees.list({ take: 200 }),
      resources.departments.list().catch(() => ({ items: [] })),
    ])
      .then(([emp, dept]) => {
        setItems(emp.items || []);
        setDepts(dept.items || []);
      })
      .catch((e) => toast(e.response?.data?.message || e.message, "error"))
      .finally(() => setLoading(false));
  }, []);

  const statsByStage = useMemo(() => {
    const m = {};
    STAGES_DISPLAY.forEach((s) => (m[s] = 0));
    items.forEach((e) => {
      if (m[e.stage] !== undefined) m[e.stage]++;
    });
    return m;
  }, [items]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return items.filter((e) => {
      if (filterStage && e.stage !== filterStage) return false;
      if (filterDept && e.dept !== filterDept) return false;
      if (kw) {
        const blob = [e.name, e.appliedFor, e.dept, e.school, e.level, e.externalId]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!blob.includes(kw)) return false;
      }
      return true;
    });
  }, [items, q, filterStage, filterDept]);

  // 进场 stagger
  useGSAP(
    () => {
      if (!filtered.length) return;
      gsap.fromTo(
        ".hire-row",
        { opacity: 0, y: 10 },
        {
          opacity: 1,
          y: 0,
          duration: 0.4,
          stagger: 0.03,
          ease: "power2.out",
        }
      );
    },
    { scope: rowsRef, dependencies: [filtered.length] }
  );

  // 部门下拉的列表 — 只用顶级 + 二级,够过滤
  const deptOptions = useMemo(() => {
    const names = new Set();
    for (const e of items) {
      if (e.dept) names.add(e.dept);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "zh"));
  }, [items]);

  if (loading) return <LoadingBlock height="h-64" />;

  return (
    <div className="space-y-5">
      {/* === 顶部 6 KPI 卡 === */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {STAGES_DISPLAY.map((s) => (
          <StageStatCard
            key={s}
            stage={s}
            count={statsByStage[s]}
            active={filterStage === s}
            onClick={() => setFilterStage(filterStage === s ? "" : s)}
          />
        ))}
      </div>

      {/* === 搜索 + 部门 + 横向 chip === */}
      <Card className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[260px]">
            <Input
              icon={<I name="search" size={16} />}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="姓名 / 岗位 / 标签"
            />
          </div>
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="h-12 px-4 rounded-xl border border-gray-200 bg-white text-sm text-navy-700 outline-none focus:border-brand"
          >
            <option value="">全部部门</option>
            {deptOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2 flex-wrap">
            <FilterChip
              active={!filterStage}
              count={items.length}
              label="全部"
              onClick={() => setFilterStage("")}
            />
            {STAGES_DISPLAY.map((s) => (
              <FilterChip
                key={s}
                stage={s}
                active={filterStage === s}
                count={statsByStage[s]}
                label={s}
                onClick={() =>
                  setFilterStage(filterStage === s ? "" : s)
                }
              />
            ))}
          </div>
        </div>
      </Card>

      {/* === 表格 === */}
      <Card className="p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10">
            <Empty
              icon="user-plus"
              title={items.length === 0 ? "近期无入职安排" : "没有匹配筛选条件的人"}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] text-gray-700 bg-lightPrimary">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">员工</th>
                  <th className="text-left px-3 py-3 font-medium">投递岗位 / 部门</th>
                  <th className="text-left px-3 py-3 font-medium">阶段</th>
                  <th className="text-left px-3 py-3 font-medium">入职 / 试用期</th>
                  <th className="text-left px-3 py-3 font-medium">入职清单</th>
                  <th className="text-left px-3 py-3 font-medium">风险</th>
                  <th className="text-right px-5 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody ref={rowsRef} className="divide-y divide-gray-100">
                {filtered.map((e) => (
                  <tr key={e.id} className="hire-row hover:bg-lightPrimary/40 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar
                          name={e.name}
                          animal={e.animal}
                          src={e.avatar}
                          size={40}
                        />
                        <div className="min-w-0">
                          <Link
                            to={`/staff/${e.externalId || e.id}`}
                            className="text-sm font-bold text-navy-700 hover:text-brand truncate block transition-colors"
                          >
                            {e.name}
                          </Link>
                          <p className="text-[11px] text-gray-700 truncate">
                            {e.externalId || "—"}
                            {e.level ? ` · ${e.level}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 min-w-[200px]">
                      <p className="text-sm text-navy-700 font-medium truncate max-w-[280px]">
                        {e.appliedFor || "—"}
                      </p>
                      <p className="text-[11px] text-gray-700 truncate max-w-[280px]">
                        {[e.dept, e.workLocation, e.directManager || e.jdOwner]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <StagePill stage={e.stage} />
                    </td>
                    <td className="px-3 py-3">
                      <HireDateCell e={e} />
                    </td>
                    <td className="px-3 py-3">
                      <ChecklistCell checklist={e.checklist} />
                    </td>
                    <td className="px-3 py-3">
                      <RiskCell riskItems={e.riskItems} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-3">
                        <Link
                          to={`/staff/${e.externalId || e.id}`}
                          className="text-xs font-bold text-brand hover:underline"
                        >
                          查看
                        </Link>
                        {canDelete && (
                          <button
                            onClick={() => onDelete(e)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-red-500 hover:text-red-600 hover:underline"
                            title="删除入职员工记录"
                          >
                            <I name="trash-2" size={12} />
                            删除
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
