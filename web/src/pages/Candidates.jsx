import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, resources, LONG_TIMEOUT } from "../lib/api.js";
import {
  Card,
  Button,
  Input,
  StatusPill,
  AiBadge,
  LiquidLoader,
  Avatar,
  I,
  Empty,
  LoadingBlock,
  Tag,
  Modal,
  toast,
} from "../components/Primitives.jsx";
import { STATUS_ORDER } from "../lib/constants.js";
import ReparseConfirmModal from "../components/ReparseConfirmModal.jsx";

const EMPTY_FORM = {
  name: "",
  appliedFor: "",
  status: "待筛选",
  jdMatch: 0,
  school: "",
  source: "手动录入",
  tags: "",
};

export default function Candidates() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [err, setErr] = useState("");
  const [reparseTarget, setReparseTarget] = useState(null); // 弹 modal 用的候选人

  async function load() {
    setLoading(true);
    try {
      const params = {};
      if (q) params.q = q;
      if (statusFilter) params.status = statusFilter;
      const { items } = await resources.candidates.list(params);
      setItems(items);
    } catch (e) {
      setErr(e.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [statusFilter]);

  // jobs 列表只 load 一次,给 ReparseConfirmModal 的 select 用
  useEffect(() => {
    resources.jobs.list({ take: 200 }).then((d) => setJobs(d.items || [])).catch(() => {});
  }, []);

  // 重新解析(异步): POST /resumes/parse {candidateId, jobId} 立即拿 taskId,轮询 GET /parse-tasks/:taskId 直到 done/failed
  // 入口走 ReparseConfirmModal,让用户先确认/修改投递岗位再开跑(与详情页同行为)。
  const [reparsingId, setReparsingId] = useState(null);

  function openReparse(c) {
    if (!c?.id) return;
    if (!c.attachment) return toast("无简历附件,无法重新解析", "error");
    setReparseTarget(c);
  }

  async function onReparse(jobId) {
    const c = reparseTarget;
    if (!c?.id) return;
    setReparsingId(c.id);
    try {
      const { data: { task: initialTask } } = await api.post("/resumes/parse", { candidateId: c.id, jobId });
      const taskId = initialTask.id;
      const startedAt = Date.now();
      const MAX_WAIT_MS = 5 * 60 * 1000;
      let finalTask = null;
      while (Date.now() - startedAt < MAX_WAIT_MS) {
        await new Promise((r) => setTimeout(r, 2000));
        const { data: { task } } = await api.get(`/resumes/parse-tasks/${taskId}`);
        if (task.status === "done" || task.status === "failed") { finalTask = task; break; }
      }
      if (!finalTask) {
        toast(`${c.name} 重新解析超时(>5 分钟)`, "error");
        return;
      }
      if (finalTask.status === "done") {
        setItems((prev) => prev.map((x) => (x.id === c.id ? finalTask.candidate : x)));
        setReparseTarget(null);
        toast(`✓ ${finalTask.candidate.name} 已重新解析`, "success");
      } else {
        // failed — 全完整错误塞剪贴板 + console.error 完整 task
        const err = finalTask.error || {};
        const full = JSON.stringify({
          candidate: c.name,
          taskId: finalTask.id,
          startedAt: finalTask.startedAt,
          finishedAt: finalTask.finishedAt,
          statusCode: err.statusCode,
          errorCode: err.code,
          message: err.message,
        }, null, 2);
        console.error("[reparse] task failed", finalTask);
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(full).catch(() => {});
        toast(`${c.name} · ${err.code || "error"} · 完整错误已复制到剪贴板`, "error");
      }
    } catch (e) {
      console.error("[reparse] axios failed", c.name, e);
      const r = e.response;
      const full = JSON.stringify({
        candidate: c.name,
        status: r?.status,
        url: r?.config?.url,
        data: r?.data,
        message: e.message,
      }, null, 2);
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(full).catch(() => {});
      toast(`重新解析失败 · ${c.name} · 完整错误已复制到剪贴板`, "error");
    } finally {
      setReparsingId(null);
    }
  }

  async function onCreate(e) {
    e.preventDefault();
    if (!form.name) return;
    try {
      const payload = {
        name: form.name,
        appliedFor: form.appliedFor || null,
        status: form.status || "待筛选",
        jdMatch: Number(form.jdMatch) || 0,
        school: form.school || null,
        source: form.source || null,
        tags: form.tags ? form.tags.split(/[,，\s]+/).filter(Boolean) : [],
      };
      await resources.candidates.create(payload);
      setForm(EMPTY_FORM);
      setCreateOpen(false);
      toast("候选人已创建", "success");
      load();
    } catch (e) {
      toast(e.response?.data?.message || "创建失败", "error");
    }
  }

  async function onDelete(id, name) {
    if (!confirm(`确定删除 ${name} 吗?`)) return;
    try {
      await resources.candidates.remove(id);
      toast("已删除", "success");
      load();
    } catch (e) {
      toast(e.response?.data?.message || "删除失败", "error");
    }
  }

  const summary = useMemo(() => {
    const buckets = {};
    items.forEach((c) => {
      const k = c.status || "待筛选";
      buckets[k] = (buckets[k] || 0) + 1;
    });
    return STATUS_ORDER.map((s) => ({ status: s, count: buckets[s] || 0 }));
  }, [items]);

  return (
    <div className="space-y-6">
      {/* 状态分布快查 */}
      <Card className="p-4 !flex-row items-center justify-start gap-2 overflow-x-auto">
        <button
          onClick={() => setStatusFilter("")}
          className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition
            ${statusFilter === "" ? "bg-brand text-white" : "text-gray-700 hover:bg-lightPrimary"}`}
        >
          全部 · {items.length}
        </button>
        {summary.map((s) => (
          <button
            key={s.status}
            onClick={() => setStatusFilter(statusFilter === s.status ? "" : s.status)}
            className={`px-3 py-1.5 rounded-full whitespace-nowrap transition flex items-center gap-2
              ${statusFilter === s.status ? "bg-lightPrimary ring-2 ring-brand/40" : "hover:bg-lightPrimary"}`}
          >
            <StatusPill status={s.status} />
            <span className="text-xs font-bold text-navy-700">{s.count}</span>
          </button>
        ))}
      </Card>

      {/* 工具栏 */}
      <Card className="p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-4 md:mb-5">
          <div className="flex-1 min-w-[160px] md:min-w-[240px] flex items-center bg-lightPrimary rounded-xl pl-4 h-11">
            <I name="search" size={16} className="text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="搜索姓名 / 学校 / 应聘岗位"
              className="flex-1 ml-3 bg-transparent outline-none text-sm text-navy-700 placeholder:text-gray-400"
            />
          </div>
          <Button variant="ghost" onClick={load} icon={<I name="refresh-cw" size={14} />}>
            <span className="hidden sm:inline">刷新</span>
          </Button>
          <Button onClick={() => setCreateOpen(true)} icon={<I name="user-plus" size={16} />}>
            <span className="hidden sm:inline">新建候选人</span>
            <span className="sm:hidden">新建</span>
          </Button>
        </div>

        {err && <div className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3 mb-4">{err}</div>}

        {loading ? (
          <LoadingBlock label="加载候选人..." height="h-40" />
        ) : items.length === 0 ? (
          <Empty title="还没有候选人" desc="点上方「新建候选人」开始" />
        ) : (
          <ul className="divide-y divide-gray-200">
            {items.map((c) => (
              <li key={c.id} className="py-4 group">
                {/* === 桌面端: 单行 horizontal === */}
                <div className="hidden md:flex items-center gap-4">
                  <Avatar name={c.name} animal={c.animal} size={48} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to={`/candidates/${c.externalId || c.id}`} className="text-base font-bold text-navy-700 hover:text-brand">
                        {c.name}
                      </Link>
                      {c.parser && <AiBadge parser={c.parser} confidence={c.parserConfidence} />}
                    </div>
                    <p className="text-xs text-gray-700 mt-1 truncate">
                      {[c.education, c.school, c.major, c.location, c.yearsExp != null ? `${c.yearsExp} 年经验` : null].filter(Boolean).join(" · ")}
                    </p>
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {(c.tags || []).slice(0, 5).map((t) => <Tag key={t}>{t}</Tag>)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 w-[160px] shrink-0">
                    <p className="text-xs text-gray-700">应聘岗位</p>
                    <p className="text-sm font-bold text-navy-700 truncate w-full text-right">{c.appliedFor || "—"}</p>
                  </div>
                  {c.jdMatch != null ? (
                    <LiquidLoader size={56} level={c.jdMatch} label={c.jdMatch} />
                  ) : (
                    <div className="w-14 h-14 flex flex-col items-center justify-center text-[10px] text-gray-400">
                      <I name="link-2-off" size={16} />
                      <span className="mt-0.5">未关联</span>
                    </div>
                  )}
                  <div className="flex flex-col items-end gap-2 w-[110px] shrink-0">
                    <StatusPill status={c.status || "待筛选"} />
                    <span className="text-[11px] text-gray-600">{c.source || "—"}</span>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition flex flex-col gap-1">
                    <button onClick={() => navigate(`/candidates/${c.externalId || c.id}`)} className="w-8 h-8 rounded-full bg-lightPrimary text-gray-700 hover:text-brand flex items-center justify-center" title="查看详情">
                      <I name="arrow-right" size={14} />
                    </button>
                    {/* 重新解析 — 仅在 parser 为空且 attachment 存在(说明上传时 LLM 降级了)显示 */}
                    {!c.parser && c.attachment && (
                      <button
                        onClick={() => openReparse(c)}
                        disabled={reparsingId === c.id}
                        className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 hover:bg-amber-100 disabled:opacity-50 flex items-center justify-center"
                        title="重新解析"
                      >
                        <I name={reparsingId === c.id ? "loader" : "sparkles"} size={14} className={reparsingId === c.id ? "animate-spin" : ""} />
                      </button>
                    )}
                    <button onClick={() => onDelete(c.id, c.name)} className="w-8 h-8 rounded-full bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center" title="删除">
                      <I name="trash-2" size={14} />
                    </button>
                  </div>
                </div>

                {/* === 移动端: 卡片式 stack === */}
                <Link to={`/candidates/${c.externalId || c.id}`} className="md:hidden block active:bg-lightPrimary -mx-2 px-2 py-1 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Avatar name={c.name} animal={c.animal} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-bold text-navy-700">{c.name}</span>
                        <StatusPill status={c.status || "待筛选"} />
                      </div>
                      <p className="text-[11px] text-gray-700 mt-1 line-clamp-2">
                        {[c.education, c.school, c.major].filter(Boolean).join(" · ")}
                      </p>
                      <p className="text-[11px] text-gray-700 mt-0.5">
                        {[c.location, c.yearsExp != null ? `${c.yearsExp} 年经验` : null, c.source].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    {c.jdMatch != null ? (
                      <LiquidLoader size={48} level={c.jdMatch} label={c.jdMatch} />
                    ) : (
                      <div className="w-12 shrink-0 text-center text-[10px] text-gray-400">
                        <I name="link-2-off" size={14} className="inline" />
                        <p className="mt-0.5">未关联</p>
                      </div>
                    )}
                  </div>
                  {/* tags row */}
                  {((c.tags || []).length > 0) && (
                    <div className="flex gap-1.5 mt-2.5 flex-wrap pl-[56px]">
                      {(c.tags || []).slice(0, 4).map((t) => <Tag key={t}>{t}</Tag>)}
                      {(c.tags || []).length > 4 && <span className="text-[10px] text-gray-600">+{c.tags.length - 4}</span>}
                    </div>
                  )}
                  {/* 应聘岗位 + AI badge */}
                  <div className="flex items-center gap-2 mt-2 pl-[56px] flex-wrap">
                    {c.appliedFor && (
                      <span className="text-[11px] text-gray-700 inline-flex items-center gap-1">
                        <I name="briefcase" size={10} /> {c.appliedFor}
                      </span>
                    )}
                    {c.parser && <AiBadge parser={c.parser} confidence={c.parserConfidence} />}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)}>
        <form onSubmit={onCreate} className="p-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-navy-700">新建候选人</h3>
            <button type="button" onClick={() => setCreateOpen(false)} className="text-gray-400 hover:text-navy-700">
              <I name="x" size={20} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="姓名 *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="学校" value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} />
            <Input label="应聘岗位" value={form.appliedFor} onChange={(e) => setForm({ ...form, appliedFor: e.target.value })} />
            <Input
              label="JD 匹配度 (0-100)"
              type="number"
              min="0"
              max="100"
              value={form.jdMatch}
              onChange={(e) => setForm({ ...form, jdMatch: e.target.value })}
            />
            <div>
              <label className="text-sm text-navy-700 font-bold ml-3 block mb-2">状态</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full h-12 rounded-xl border border-gray-200 px-3 text-sm text-navy-700 outline-none focus:border-brand"
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <Input label="来源" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
            <Input
              label="标签 (逗号分隔)"
              containerClassName="col-span-2"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="如: 海外项目, PMP, 8D"
            />
          </div>
          <div className="flex justify-end gap-3 mt-8">
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button type="submit" icon={<I name="check" size={14} />}>
              创建
            </Button>
          </div>
        </form>
      </Modal>
      <ReparseConfirmModal
        open={!!reparseTarget}
        onClose={() => setReparseTarget(null)}
        onConfirm={onReparse}
        currentJob={jobs.find((j) => j.id === reparseTarget?.jobId)}
        jobs={jobs}
        candidateName={reparseTarget?.name}
        reparsing={!!reparsingId && reparsingId === reparseTarget?.id}
      />
    </div>
  );
}
