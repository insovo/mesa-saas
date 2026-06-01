import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { resources } from "../lib/api.js";
import { useHasModule } from "../lib/authContext.jsx";
import {
  Card,
  Avatar,
  StagePill,
  TaskStatusPill,
  AiBadge,
  Tag,
  I,
  Empty,
  LoadingBlock,
  Button,
  LiquidLoader,
  toast,
} from "../components/Primitives.jsx";
import { HIRE_CHECKLIST_KEYS } from "../lib/constants.js";

const STAGE_STEPS = ["待入职", "入职准备", "入职当天", "试用期", "已转正"];

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function categorizeEvent(type) {
  if (type === "入职前工作") return "入职前工作";
  if (type === "教育") return "教育";
  return "入职后";
}
function eventTone(cat) {
  if (cat === "入职前工作") return { dot: "#EF4444", pillBg: "#FEE2E2", pillFg: "#B91C1C" };
  if (cat === "教育") return { dot: "#94A3B8", pillBg: "#E0E7FF", pillFg: "#3730A3" };
  return { dot: "#422AFB", pillBg: "#E9E3FF", pillFg: "#2111A5" };
}

// 5 阶段 stepper
function CareerStepper({ currentStage }) {
  const curIdx = STAGE_STEPS.indexOf(currentStage);
  return (
    <div className="flex items-stretch gap-0">
      {STAGE_STEPS.map((s, i) => {
        const done = curIdx > i;
        const active = curIdx === i;
        return (
          <div key={s} className="flex-1 flex flex-col items-center gap-2 min-w-0">
            <div className="flex items-center w-full px-1">
              <div className={`flex-1 h-0.5 ${i > 0 && i <= curIdx ? "bg-brand" : "bg-gray-200"} ${i === 0 ? "invisible" : ""}`} />
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 ${
                  done
                    ? "bg-green-500 text-white"
                    : active
                    ? "bg-amber-400 text-white ring-4 ring-amber-100"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {done ? <I name="check" size={14} /> : i + 1}
              </div>
              <div className={`flex-1 h-0.5 ${i < curIdx ? "bg-brand" : "bg-gray-200"} ${i === STAGE_STEPS.length - 1 ? "invisible" : ""}`} />
            </div>
            <span
              className={`text-[11px] text-center truncate w-full ${
                active ? "text-navy-700 font-bold" : done ? "text-navy-700" : "text-gray-700"
              }`}
            >
              {s}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// 入职清单单条
function ChecklistRow({ k, item, onMark }) {
  const status = item.status || "待开始";
  const done = status === "已完成";
  return (
    <li className="flex items-start gap-3 p-3 rounded-xl bg-lightPrimary/60 hover:bg-lightPrimary transition-colors">
      <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-brand shrink-0">
        <I name={k.icon} size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-navy-700">{k.label}</span>
            <TaskStatusPill status={status} />
          </div>
          <div className="flex items-center gap-3">
            {done ? (
              <button
                onClick={() => onMark?.(k.key, "待开始")}
                className="text-[11px] text-gray-700 hover:text-brand inline-flex items-center gap-1"
              >
                <I name="rotate-ccw" size={11} /> 撤销
              </button>
            ) : (
              <button
                onClick={() => onMark?.(k.key, "已完成")}
                className="text-[11px] text-brand hover:underline inline-flex items-center gap-1 font-bold"
              >
                <I name="check" size={11} /> 标记完成
              </button>
            )}
            {item.date && <span className="text-[11px] text-gray-700">{item.date}</span>}
          </div>
        </div>
        <div className="flex items-center justify-between mt-1.5 gap-2">
          <p className="text-[11px] text-gray-700 truncate">
            {item.note ? <><span className="mr-1">☐</span>{item.note}</> : <span className="text-gray-400">—</span>}
          </p>
          {item.owner && <span className="text-[11px] text-gray-600 shrink-0">{item.owner}</span>}
        </div>
      </div>
    </li>
  );
}

function TimelineRow({ ev }) {
  const cat = categorizeEvent(ev.type);
  const tone = eventTone(cat);
  return (
    <li className="relative pl-6">
      <span
        className="absolute left-0.5 top-2 w-2.5 h-2.5 rounded-full"
        style={{ background: tone.dot, boxShadow: `0 0 0 3px ${tone.dot}22` }}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-700">{ev.date}</span>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded"
          style={{ background: tone.pillBg, color: tone.pillFg }}
        >
          {ev.type}
        </span>
      </div>
      <p className="text-sm font-bold text-navy-700 mt-1">{ev.title}</p>
      {ev.desc && <p className="text-xs text-gray-700 mt-0.5 leading-relaxed">{ev.desc}</p>}
      {ev.owner && <p className="text-[11px] text-gray-600 mt-1">负责人 · {ev.owner}</p>}
    </li>
  );
}

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const canDelete = useHasModule("employee.delete");
  const [emp, setEmp] = useState(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("timeline"); // timeline | risk
  const [filter, setFilter] = useState("全部");

  useEffect(() => {
    setEmp(null);
    setErr("");
    resources.employees
      .detail(id)
      .then(setEmp)
      .catch((e) => setErr(e.response?.data?.message || e.message));
  }, [id]);

  const events = emp?.events || [];
  const risks = emp?.riskItems || [];

  const eventsByCategory = useMemo(() => {
    const m = { 全部: events, 入职后: [], 入职前工作: [], 教育: [] };
    for (const ev of events) {
      const cat = categorizeEvent(ev.type);
      m[cat]?.push(ev);
    }
    return m;
  }, [events]);

  const sortedEvents = useMemo(() => {
    const arr = [...(eventsByCategory[filter] || [])];
    arr.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return arr;
  }, [eventsByCategory, filter]);

  if (err) return <Card className="p-6 text-red-500 text-sm">{err}</Card>;
  if (!emp) return <LoadingBlock height="h-64" />;

  const cl = emp.checklist || {};
  const checklistDone = HIRE_CHECKLIST_KEYS.filter((k) => cl[k.key]?.status === "已完成").length;
  const checklistTotal = HIRE_CHECKLIST_KEYS.length;
  const curStageIdx = STAGE_STEPS.indexOf(emp.stage);
  const nextStage = curStageIdx >= 0 && curStageIdx < STAGE_STEPS.length - 1 ? STAGE_STEPS[curStageIdx + 1] : null;
  const risksOpen = risks.filter((r) => r.status !== "已完成" && r.status !== "已解决").length;
  const risksDone = risks.length - risksOpen;

  async function persistChecklist(nextCl) {
    try {
      const updated = await resources.employees.update(emp.id, { checklist: nextCl });
      setEmp((cur) => ({ ...cur, ...updated }));
    } catch (e) {
      toast(e.response?.data?.message || e.message || "保存失败", "error");
    }
  }
  function onMark(key, newStatus) {
    const next = {
      ...cl,
      [key]: {
        ...(cl[key] || {}),
        status: newStatus,
        date: newStatus === "已完成" ? fmtDate(new Date()) : cl[key]?.date,
      },
    };
    setEmp((cur) => ({ ...cur, checklist: next }));
    persistChecklist(next);
  }
  function onMarkAll() {
    const next = { ...cl };
    const today = fmtDate(new Date());
    for (const k of HIRE_CHECKLIST_KEYS) {
      next[k.key] = { ...(cl[k.key] || {}), status: "已完成", date: cl[k.key]?.date || today };
    }
    setEmp((cur) => ({ ...cur, checklist: next }));
    persistChecklist(next);
  }
  async function onAdvanceStage() {
    if (!nextStage) return;
    try {
      const updated = await resources.employees.update(emp.id, { stage: nextStage });
      setEmp((cur) => ({ ...cur, ...updated }));
      toast(`已推进到 ${nextStage}`, "success");
    } catch (e) {
      toast(e.response?.data?.message || e.message || "操作失败", "error");
    }
  }
  async function onDelete() {
    if (!confirm(`确定删除入职员工「${emp.name}」的记录吗?此操作不可恢复(候选人信息保留)。`)) return;
    try {
      await resources.employees.remove(emp.id);
      toast("已删除", "success");
      navigate("/newhire");
    } catch (e) {
      toast(e.response?.data?.message || e.message || "删除失败", "error");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/newhire"
          className="text-sm text-brand hover:underline inline-flex items-center gap-1"
        >
          <I name="arrow-left" size={14} />
          返回员工列表
        </Link>
        {canDelete && (
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border border-red-200 text-red-500 text-xs font-bold hover:bg-red-50 hover:border-red-300 transition-colors"
            title="删除入职员工记录"
          >
            <I name="trash-2" size={13} />
            删除员工
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)_360px] gap-5 items-start">
        {/* ===== 左列 ===== */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1 lg:-mr-1">
          <Card className="p-5">
            <div className="flex flex-col items-center text-center">
              <Avatar name={emp.name} animal={emp.animal} src={emp.avatar} size={88} />
              <h1 className="text-2xl font-bold text-navy-700 mt-3">{emp.name}</h1>
              <p className="text-[11px] text-gray-700 mt-0.5">
                {emp.externalId || "—"}
                {emp.level ? ` · ${emp.level}` : ""}
              </p>
              <div className="mt-2.5 flex items-center gap-2 flex-wrap justify-center">
                <StagePill stage={emp.stage || "待入职"} />
                {emp.parser && <AiBadge parser={emp.parser} confidence={emp.parserConfidence} />}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-5">
              {[
                { icon: "briefcase", label: "岗位", val: emp.appliedFor },
                { icon: "building-2", label: "部门", val: emp.dept },
                { icon: "map-pin", label: "工作地", val: emp.workLocation },
                { icon: "user-cog", label: "直属上级", val: emp.directManager },
              ].map((row) => (
                <div key={row.label} className="bg-lightPrimary rounded-xl p-2.5 min-w-0">
                  <p className="text-[10px] text-gray-700 flex items-center gap-1">
                    <I name={row.icon} size={10} /> {row.label}
                  </p>
                  <p
                    className="text-xs text-navy-700 font-medium mt-0.5 truncate"
                    title={row.val}
                  >
                    {row.val || "—"}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-1.5 text-xs text-gray-700">
              {emp.phone && (
                <p className="flex items-center gap-2">
                  <I name="phone" size={12} className="text-brand" /> {emp.phone}
                </p>
              )}
              {emp.email && (
                <p className="flex items-center gap-2 truncate">
                  <I name="mail" size={12} className="text-brand shrink-0" />
                  <span className="truncate">{emp.email}</span>
                </p>
              )}
              {emp.hrbp && (
                <p className="flex items-center gap-2">
                  <I name="user" size={12} className="text-brand" /> HRBP · {emp.hrbp}
                </p>
              )}
            </div>
            {emp.candidate && (
              <Link
                to={`/candidates/${emp.candidate.externalId || emp.candidate.id}`}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-lightPrimary text-brand text-xs font-bold hover:bg-brand hover:text-white transition-colors"
              >
                <I name="external-link" size={12} />
                查看招聘期档案
              </Link>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex flex-col items-center">
              <LiquidLoader
                size={110}
                level={emp.jdMatch ?? 0}
                label={emp.jdMatch ?? "—"}
              />
              <p className="text-xs text-gray-700 mt-3">招聘期 JD 匹配</p>
              {emp.parser && (
                <p className="text-[11px] text-gray-600 mt-0.5">
                  解析器 {emp.parser}
                  {emp.parserConfidence ? ` · ${emp.parserConfidence}%` : ""}
                </p>
              )}
              {emp.source && (
                <p className="text-[11px] text-gray-600">来源 {emp.source}</p>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <dl className="space-y-2.5 text-xs">
              {[
                { label: "学历", val: emp.education ? `${emp.education}·${emp.school || ""}` : null },
                { label: "专业", val: emp.major },
                { label: "工作年限", val: emp.yearsExp != null ? `${emp.yearsExp} 年` : null },
                { label: "所在地", val: emp.location },
              ].map((r) => (
                <div key={r.label} className="flex items-start gap-3">
                  <dt className="text-gray-700 w-16 shrink-0">{r.label}</dt>
                  <dd className="text-navy-700 font-medium flex-1">{r.val || "—"}</dd>
                </div>
              ))}
            </dl>
            {(emp.tags || []).length > 0 && (
              <>
                <p className="text-[11px] text-gray-700 mt-4 mb-2">员工标签</p>
                <div className="flex flex-wrap gap-1.5">
                  {emp.tags.map((t) => (
                    <Tag key={t}>{t}</Tag>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>

        {/* ===== 中列 ===== */}
        <div className="space-y-5 min-w-0 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1 lg:-mr-1">
          <Card className="p-6">
            <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
              <h3 className="title-card flex items-center gap-2">
                <I name="route" size={18} className="text-brand" />
                入职生涯
                <span className="text-xs text-gray-700 font-normal">
                  阶段 {Math.max(1, curStageIdx + 1)}/{STAGE_STEPS.length}
                </span>
              </h3>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" icon={<I name="plus" size={12} />}>
                  新增记录
                </Button>
                {nextStage && (
                  <Button size="sm" onClick={onAdvanceStage} icon={<I name="arrow-right" size={12} />}>
                    推进到 {nextStage}
                  </Button>
                )}
              </div>
            </div>
            <CareerStepper currentStage={emp.stage} />
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
              <h3 className="title-card">
                {emp.stage || "入职准备"}清单
                <span className="text-xs text-gray-700 font-normal ml-2">
                  {checklistDone}/{checklistTotal} 已完成
                </span>
              </h3>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onMarkAll}
                  icon={<I name="check-check" size={12} />}
                >
                  一键全部完成
                </Button>
                <Button variant="ghost" size="sm" icon={<I name="list-checks" size={12} />}>
                  批量操作
                </Button>
              </div>
            </div>
            {emp.plannedHireDate && (
              <p className="text-xs text-gray-700 mb-4">
                预计入职 {fmtDate(emp.plannedHireDate)}
              </p>
            )}
            <ul className="space-y-2.5">
              {HIRE_CHECKLIST_KEYS.map((k) => (
                <ChecklistRow key={k.key} k={k} item={cl[k.key] || {}} onMark={onMark} />
              ))}
            </ul>
          </Card>
        </div>

        {/* ===== 右列 ===== */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1 lg:-mr-1">
          <Card className="p-5">
            <div className="flex items-center gap-1 mb-5 border-b border-gray-100">
              <button
                onClick={() => setTab("timeline")}
                className={`px-3 py-2 text-sm font-bold transition-colors ${
                  tab === "timeline"
                    ? "text-brand border-b-2 border-brand -mb-px"
                    : "text-gray-700 hover:text-navy-700"
                }`}
              >
                生涯时间轴
              </button>
              <button
                onClick={() => setTab("risk")}
                className={`px-3 py-2 text-sm font-bold transition-colors ${
                  tab === "risk"
                    ? "text-brand border-b-2 border-brand -mb-px"
                    : "text-gray-700 hover:text-navy-700"
                }`}
              >
                HRBP 风险 {risks.length > 0 && `(${risksDone}/${risks.length})`}
              </button>
            </div>

            {tab === "timeline" ? (
              <>
                <div className="flex gap-1.5 mb-4 flex-wrap">
                  {[
                    { k: "全部", n: events.length },
                    { k: "入职后", n: eventsByCategory["入职后"].length },
                    { k: "入职前工作", n: eventsByCategory["入职前工作"].length },
                    { k: "教育", n: eventsByCategory["教育"].length },
                  ].map((c) => {
                    const active = filter === c.k;
                    return (
                      <button
                        key={c.k}
                        onClick={() => setFilter(c.k)}
                        className={`text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors ${
                          active
                            ? "bg-brand text-white"
                            : "bg-lightPrimary text-navy-700 hover:bg-white hover:shadow-card"
                        }`}
                      >
                        {c.k} <span className={active ? "text-white/80" : "text-gray-700"}>{c.n}</span>
                      </button>
                    );
                  })}
                </div>
                {sortedEvents.length === 0 ? (
                  <Empty title="尚无事件" />
                ) : (
                  <ul className="space-y-4 relative">
                    <span className="absolute left-[5px] top-2 bottom-2 w-px bg-gray-100" />
                    {sortedEvents.map((ev, i) => (
                      <TimelineRow key={i} ev={ev} />
                    ))}
                  </ul>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-4 w-full justify-center"
                  icon={<I name="plus" size={12} />}
                >
                  新增事件
                </Button>
              </>
            ) : risks.length === 0 ? (
              <Empty title="暂无风险项" desc="自动转正前会再次评估" />
            ) : (
              <ul className="space-y-3">
                {risks.map((r, i) => (
                  <li key={i} className="p-3 rounded-xl border border-gray-200">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-navy-700">{r.item}</p>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">
                        {r.level || "—"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-gray-700">
                      <span>负责人 · {r.owner || "—"}</span>
                      <span>截止 · {r.dueDate || "—"}</span>
                      <TaskStatusPill status={r.status || "待开始"} />
                    </div>
                    {r.action && (
                      <p className="text-[11px] text-gray-700 mt-1">行动 · {r.action}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
