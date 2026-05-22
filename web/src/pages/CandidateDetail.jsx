import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api, resources, LONG_TIMEOUT } from "../lib/api.js";
import {
  Card,
  Button,
  Input,
  Avatar,
  StatusPill,
  AiBadge,
  MatchRing,
  Tag,
  I,
  LoadingBlock,
  Empty,
  Modal,
  toast,
} from "../components/Primitives.jsx";
import { STATUS_ORDER, STATUS_TONE, INTERVIEW_ROUNDS } from "../lib/constants.js";

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// JD 匹配卡片 — 一直可点击切换 JD 触发评估
function JdMatchCard({ candidate, jobs, matchingJobId, setMatchingJobId, matching, onRun }) {
  const [open, setOpen] = useState(false);
  const currentJob = jobs.find((j) => j.id === candidate.jobId);
  const hasMatch = candidate.jdMatch != null;

  return (
    <div className="w-full md:w-[220px] shrink-0">
      {!open ? (
        <button
          onClick={() => { setOpen(true); setMatchingJobId(candidate.jobId || ""); }}
          className={`group w-full p-4 rounded-2xl transition flex flex-col items-center gap-2 cursor-pointer
            ${hasMatch ? "bg-lightPrimary hover:bg-white hover:shadow-md" : "border-2 border-dashed border-gray-200 hover:border-brand hover:bg-lightPrimary"}`}
        >
          {hasMatch ? (
            <>
              <MatchRing value={candidate.jdMatch} size={80} stroke={8} />
              <p className="text-xs font-bold text-navy-700">{currentJob?.title || candidate.appliedFor || "JD 匹配度"}</p>
              <p className="text-[11px] text-brand group-hover:underline flex items-center gap-1">
                <I name="pencil" size={10} /> 点击换 JD
              </p>
            </>
          ) : (
            <>
              <I name="link-2-off" size={26} className="text-gray-400 group-hover:text-brand" />
              <p className="text-sm font-bold text-navy-700">未关联 JD</p>
              <p className="text-[11px] text-brand group-hover:underline">点击选 JD 并 AI 评估</p>
            </>
          )}
        </button>
      ) : (
        <div className="p-4 rounded-2xl bg-white border-2 border-brand">
          <p className="text-xs font-bold text-gray-700 uppercase mb-2">选择 / 切换 JD</p>
          <select
            value={matchingJobId}
            onChange={(e) => setMatchingJobId(e.target.value)}
            disabled={matching}
            className="w-full h-10 rounded-xl border border-gray-200 px-2 text-sm text-navy-700 outline-none focus:border-brand bg-white"
          >
            <option value="">— 选一个 JD —</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}{!j.description ? " ⚠️ 无 JD 描述" : ""}
              </option>
            ))}
          </select>
          {matchingJobId && !jobs.find(j => j.id === matchingJobId)?.description && (
            <p className="text-[10px] text-amber-700 mt-1.5 flex items-start gap-1">
              <I name="alert-triangle" size={10} className="mt-0.5 shrink-0" /> 此 JD 无描述,评估准确度受影响
            </p>
          )}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => { setOpen(false); setMatchingJobId(""); }}
              className="flex-1 h-9 rounded-xl text-xs font-bold text-gray-700 hover:bg-lightPrimary"
              disabled={matching}
            >
              取消
            </button>
            <button
              onClick={async () => { await onRun(); setOpen(false); }}
              disabled={!matchingJobId || matching}
              className="flex-1 h-9 rounded-xl text-xs font-bold bg-brand text-white hover:bg-brand-hover disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {matching ? <><I name="loader" size={12} className="animate-spin" /> 评估中</> : <><I name="sparkles" size={12} /> {hasMatch ? "重评" : "AI 评估"}</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CandidateDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [c, setC] = useState(null);
  const [err, setErr] = useState("");
  const [jobs, setJobs] = useState([]);
  const [matchingJobId, setMatchingJobId] = useState("");
  const [matching, setMatching] = useState(false);

  // 备注 / 面试 / 分享 弹窗
  const [notes, setNotes] = useState([]);
  const [noteOpen, setNoteOpen] = useState(false);
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  async function load() {
    try {
      setC(await resources.candidates.detail(id));
    } catch (e) {
      setErr(e.response?.data?.message || e.message);
    }
  }

  useEffect(() => {
    load();
    resources.jobs.list({ take: 200 }).then((d) => setJobs(d.items || [])).catch(() => {});
    // eslint-disable-next-line
  }, [id]);

  // 候选人 id 拿到后,拉备注列表
  useEffect(() => {
    if (!c?.id) return;
    resources.notes.list(c.id).then(setNotes).catch(() => {});
  }, [c?.id]);

  async function changeStatus(newStatus) {
    setStatusOpen(false);
    if (!c || newStatus === c.status) return;
    try {
      const updated = await resources.candidates.update(c.id, { status: newStatus });
      setC(updated);
      toast(`状态改为 ${newStatus}`, "success");
    } catch (e) {
      toast(e.response?.data?.message || "更新失败", "error");
    }
  }

  async function runJdMatch() {
    if (!matchingJobId || !c?.id) return toast("请选 JD", "error");
    setMatching(true);
    try {
      const { data } = await api.post("/resumes/match", { candidateId: c.id, jobId: matchingJobId }, { timeout: LONG_TIMEOUT });
      // 后端 update 时没动 jobId, 这里前端补上, 让 currentJob 立刻反映
      setC({ ...data.candidate, jobId: matchingJobId });
      // 顺便后端把 jobId 也写入(下次 load 时持久化)
      api.patch(`/candidates/${c.id}`, { jobId: matchingJobId }).catch(() => {});
      toast(`✓ 评估完成: JD 匹配度 ${data.candidate.jdMatch ?? "—"}`, "success");
    } catch (e) {
      toast(e.response?.data?.message || "评估失败", "error");
    } finally {
      setMatching(false);
    }
  }

  if (err) return <Card className="p-6 text-red-500 text-sm">{err}</Card>;
  if (!c) return <LoadingBlock label="加载候选人..." height="h-64" />;

  async function pushNextStatus() {
    const idx = STATUS_ORDER.indexOf(c.status);
    const next = STATUS_ORDER[Math.min(idx + 1, STATUS_ORDER.length - 1)];
    if (!next || next === c.status) {
      toast("已是最后阶段", "info");
      return;
    }
    try {
      const updated = await resources.candidates.update(c.id, { status: next });
      setC(updated);
      toast(`状态已推进到 ${next}`, "success");
    } catch (e) {
      toast(e.response?.data?.message || "更新失败", "error");
    }
  }

  async function onDelete() {
    if (!confirm(`确定删除 ${c.name} 吗?`)) return;
    try {
      await resources.candidates.remove(c.id);
      toast("已删除", "success");
      navigate("/candidates");
    } catch (e) {
      toast(e.message, "error");
    }
  }

  return (
    <div className="space-y-6">
      {/* === 头部 === */}
      <Card className="p-5 md:p-7">
        <div className="flex flex-col md:flex-row items-start gap-4 md:gap-6">
          <Avatar name={c.name} animal={c.animal} src={c.avatar} size={88} />
          <div className="flex-1 min-w-0 w-full">
            <div className="flex items-center gap-2 md:gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-bold text-navy-700">{c.name}</h1>
              {c.parser && <AiBadge parser={c.parser} confidence={c.parserConfidence} />}
              {/* 状态药丸 — 点击弹 dropdown 修改 */}
              <div className="relative">
                <button onClick={() => setStatusOpen((v) => !v)} className="cursor-pointer hover:ring-2 hover:ring-brand/30 rounded-full transition" title="点击修改阶段">
                  <StatusPill status={c.status} size="md" />
                </button>
                {statusOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setStatusOpen(false)} />
                    <div className="absolute top-full left-0 mt-1 z-40 bg-white rounded-xl shadow-card p-1.5 min-w-[140px]">
                      {STATUS_ORDER.map((s) => (
                        <button
                          key={s}
                          onClick={() => changeStatus(s)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-lightPrimary ${s === c.status ? "bg-lightPrimary font-bold" : ""}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_TONE[s]?.dot || "#A3AED0" }}></span>
                          {s}
                          {s === c.status && <I name="check" size={14} className="ml-auto text-brand" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            <p className="text-xs md:text-sm text-gray-700 mt-2">
              {[c.education, c.school, c.major, `${c.yearsExp || 0} 年经验`, c.location].filter(Boolean).join(" · ")}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {(c.tags || []).map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 md:gap-x-6 gap-y-2 mt-4 text-[11px] md:text-xs text-gray-700">
              <span className="flex items-center gap-1"><I name="phone" size={12} /> {c.phone || "—"}</span>
              <span className="flex items-center gap-1"><I name="mail" size={12} /> {c.email || "—"}</span>
              <span className="flex items-center gap-1"><I name="briefcase" size={12} /> {c.appliedFor || "—"}</span>
              <span className="flex items-center gap-1"><I name="calendar" size={12} /> 推送 {fmtDate(c.pushedAt)}</span>
              <span className="flex items-center gap-1"><I name="link" size={12} /> {c.source || "—"}</span>
            </div>
          </div>

          {/* JD 匹配卡片 — 点击可改 JD */}
          <JdMatchCard
            candidate={c}
            jobs={jobs}
            matchingJobId={matchingJobId}
            setMatchingJobId={setMatchingJobId}
            matching={matching}
            onRun={runJdMatch}
          />
        </div>

        <div className="flex flex-wrap gap-2 md:gap-3 mt-5 md:mt-6 pt-4 md:pt-5 border-t border-gray-200">
          <Button onClick={pushNextStatus} icon={<I name="zap" size={14} />}>
            <span className="hidden sm:inline">推进到下一阶段</span>
            <span className="sm:hidden">推进</span>
          </Button>
          <Button variant="ghost" onClick={() => setNoteOpen(true)} icon={<I name="message-square" size={14} />}>
            <span className="hidden sm:inline">添加备注</span>
            <span className="sm:hidden">备注</span>
          </Button>
          <Button variant="ghost" onClick={() => setInterviewOpen(true)} icon={<I name="calendar-plus" size={14} />}>
            <span className="hidden sm:inline">安排面试</span>
            <span className="sm:hidden">面试</span>
          </Button>
          <Button variant="ghost" onClick={() => setShareOpen(true)} icon={<I name="share-2" size={14} />}>
            <span className="hidden sm:inline">分享给招聘官</span>
            <span className="sm:hidden">分享</span>
          </Button>
          <div className="flex-1"></div>
          <Button variant="danger" onClick={onDelete} icon={<I name="trash-2" size={14} />}>
            <span className="hidden sm:inline">删除候选人</span>
            <span className="sm:hidden">删除</span>
          </Button>
        </div>
      </Card>

      {/* 备注时间线 */}
      {notes.length > 0 && (
        <Card className="p-5 md:p-6">
          <h3 className="title-card flex items-center gap-2">
            <I name="message-square" size={18} className="text-brand" />
            备注 ({notes.length})
          </h3>
          <ul className="mt-4 space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="flex gap-3 p-3 rounded-xl bg-lightPrimary group">
                <div className="w-8 h-8 rounded-full bg-brand-gradient text-white flex items-center justify-center shrink-0 text-xs font-bold">
                  {(n.authorName || "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-700">
                      <span className="font-bold">{n.authorName || "匿名"}</span> · {new Date(n.createdAt).toLocaleString("zh-CN")}
                    </p>
                    <button
                      onClick={async () => {
                        if (!confirm("删除这条备注?")) return;
                        try {
                          await resources.notes.remove(c.id, n.id);
                          setNotes((prev) => prev.filter((x) => x.id !== n.id));
                          toast("已删除", "success");
                        } catch (err) { toast(err.message, "error"); }
                      }}
                      className="opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-50 w-6 h-6 rounded flex items-center justify-center"
                    >
                      <I name="trash-2" size={12} />
                    </button>
                  </div>
                  <p className="text-sm text-navy-700 mt-1 whitespace-pre-wrap">{n.content}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* === 添加备注 Modal === */}
      <NoteModal open={noteOpen} onClose={() => setNoteOpen(false)} candidate={c} onCreated={(n) => { setNotes((p) => [n, ...p]); setNoteOpen(false); }} />

      {/* === 安排面试 Modal === */}
      <InterviewModal open={interviewOpen} onClose={() => setInterviewOpen(false)} candidate={c} jobs={jobs} />

      {/* === 分享 Modal === */}
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} candidate={c} />

      {/* === AI 解析简报(纯文本,HR 友好)=== */}
      {c.aiSummary && (
        <Card className="p-5 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="title-card flex items-center gap-2">
              <I name="file-text" size={18} className="text-brand" />
              AI 简历简报
            </h3>
            <AiBadge parser={c.parser || "Kimi"} confidence={c.parserConfidence} />
          </div>
          <pre className="whitespace-pre-wrap text-sm font-mono text-navy-700 bg-lightPrimary rounded-xl p-4 max-h-[420px] overflow-y-auto leading-relaxed">{c.aiSummary}</pre>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
        {/* === AI 核心技能 / 风险 / 亮点 === */}
        <Card className="p-5 md:p-6">
          <h3 className="title-card flex items-center gap-2">
            <I name="sparkles" size={18} className="text-brand" />
            核心技能
          </h3>
          {(c.skills || []).length === 0 ? (
            <Empty title="暂无技能识别" />
          ) : (
            <ul className="mt-4 space-y-2.5">
              {c.skills.map((s, i) => (
                <li key={i} className="text-sm text-navy-700 flex items-start gap-2">
                  <I name="check-circle-2" size={14} className="text-brand mt-0.5 shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5 md:p-6">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="title-card flex items-center gap-2">
              <I name="alert-triangle" size={18} className="text-amber-500" />
              风险与缺项
            </h3>
            {c.jdMatch != null && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold shrink-0">
                基于 {c.appliedFor || "JD"} 评估
              </span>
            )}
          </div>
          {(c.risks || []).length === 0 ? (
            <Empty title="未识别显著风险" />
          ) : (
            <ul className="mt-4 space-y-2.5">
              {c.risks.map((s, i) => (
                <li key={i} className="text-sm text-navy-700 flex items-start gap-2">
                  <I name="dot" size={14} className="text-amber-500 mt-0.5 shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5 md:p-6">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="title-card flex items-center gap-2">
              <I name="trophy" size={18} className="text-green-500" />
              亮点
            </h3>
            {c.jdMatch != null && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-bold shrink-0">
                基于 {c.appliedFor || "JD"} 评估
              </span>
            )}
          </div>
          {(c.highlights || []).length === 0 ? (
            <Empty title="暂无亮点" />
          ) : (
            <ul className="mt-4 space-y-2.5">
              {c.highlights.map((s, i) => (
                <li key={i} className="text-sm text-navy-700 flex items-start gap-2">
                  <I name="star" size={14} className="text-green-500 mt-0.5 shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <Card className="p-5 md:p-6">
          <h3 className="title-card">工作经历</h3>
          {(!c.experience || c.experience.length === 0) ? (
            <Empty title="暂无工作经历" />
          ) : (
            <ul className="mt-4 space-y-4">
              {c.experience.map((e, i) => (
                <li key={i} className="border-l-2 border-brand pl-4 relative">
                  <span className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-brand"></span>
                  <p className="text-xs text-gray-600">{e.period}</p>
                  <p className="text-sm font-bold text-navy-700 mt-0.5">{e.company}</p>
                  <p className="text-xs text-gray-700">{e.title}</p>
                  {e.summary && <p className="text-xs text-gray-700 mt-1">{e.summary}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5 md:p-6">
          <h3 className="title-card">教育背景</h3>
          {(!c.educationHistory || c.educationHistory.length === 0) ? (
            <Empty title="暂无教育背景" />
          ) : (
            <ul className="mt-4 space-y-4">
              {c.educationHistory.map((e, i) => (
                <li key={i} className="border-l-2 border-gray-300 pl-4 relative">
                  <span className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-gray-400"></span>
                  <p className="text-xs text-gray-600">{e.period}</p>
                  <p className="text-sm font-bold text-navy-700 mt-0.5">{e.school}</p>
                  <p className="text-xs text-gray-700">{e.major} · {e.degree}</p>
                </li>
              ))}
            </ul>
          )}
          {c.attachment && (
            <div className="mt-6 pt-4 border-t border-gray-200 flex items-center gap-2 text-xs text-gray-700">
              <I name="paperclip" size={14} />
              {c.attachment}
            </div>
          )}
        </Card>
      </div>

      <div>
        <Link to="/candidates" className="text-sm text-brand hover:underline inline-flex items-center gap-1">
          <I name="arrow-left" size={14} />
          返回候选人列表
        </Link>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
// 子组件: 备注 / 面试 / 分享 Modal
// ════════════════════════════════════════════════

function NoteModal({ open, onClose, candidate, onCreated }) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!open) setContent(""); }, [open]);

  async function submit() {
    if (!content.trim()) return toast("请输入内容", "error");
    setSaving(true);
    try {
      const n = await resources.notes.create(candidate.id, content.trim());
      onCreated(n);
      toast("已添加备注", "success");
    } catch (e) { toast(e.response?.data?.message || "添加失败", "error"); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-navy-700 flex items-center gap-2">
            <I name="message-square" size={18} className="text-brand" />
            添加备注
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-navy-700"><I name="x" size={20} /></button>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="备注内容(如:候选人在二面表现出色,沟通能力突出...)"
          className="w-full p-3 rounded-xl border border-gray-200 text-sm text-navy-700 outline-none focus:border-brand resize-none"
          disabled={saving}
        />
        <p className="text-xs text-gray-600 mt-1.5">{content.length} / 5000</p>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={submit} disabled={saving || !content.trim()} icon={<I name={saving ? "loader" : "check"} size={12} className={saving ? "animate-spin" : ""} />}>
            {saving ? "保存中" : "保存"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function InterviewModal({ open, onClose, candidate, jobs }) {
  const [jobId, setJobId] = useState("");
  const [round, setRound] = useState("一面");
  const [mode, setMode] = useState("线下");
  const [scheduledAt, setScheduledAt] = useState("");
  const [interviewer, setInterviewer] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setJobId(candidate?.jobId || "");
    setScheduledAt(new Date(Date.now() + 86400000).toISOString().slice(0, 16));  // 默认明天此时
  }, [open, candidate?.jobId]);

  async function submit() {
    if (!scheduledAt) return toast("请选时间", "error");
    setSaving(true);
    try {
      const job = jobs.find((j) => j.id === jobId);
      await resources.interviews.create({
        candidateId: candidate.id,
        candidateName: candidate.name,
        jobId: jobId || undefined,
        jobTitle: job?.title || candidate.appliedFor,
        round,
        mode,
        status: "已安排",
        scheduledAt: new Date(scheduledAt).toISOString(),
        interviewer: interviewer || undefined,
      });
      toast("面试已安排", "success");
      onClose();
    } catch (e) { toast(e.response?.data?.message || "保存失败", "error"); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-navy-700 flex items-center gap-2">
            <I name="calendar-plus" size={18} className="text-brand" />
            安排面试 — {candidate?.name}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-navy-700"><I name="x" size={20} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-sm text-navy-700 font-bold ml-3 block mb-2">关联岗位</label>
            <select value={jobId} onChange={(e) => setJobId(e.target.value)} className="w-full h-11 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-brand bg-white">
              <option value="">— 无 / 候选人简历推断岗位 —</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}{j.dept ? ` · ${j.dept}` : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-navy-700 font-bold ml-3 block mb-2">轮次</label>
            <select value={round} onChange={(e) => setRound(e.target.value)} className="w-full h-11 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-brand bg-white">
              {INTERVIEW_ROUNDS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-navy-700 font-bold ml-3 block mb-2">方式</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className="w-full h-11 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-brand bg-white">
              <option>线下</option><option>视频</option><option>电话</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-navy-700 font-bold ml-3 block mb-2">时间</label>
            <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="w-full h-11 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-brand" />
          </div>
          <Input label="面试官" value={interviewer} onChange={(e) => setInterviewer(e.target.value)} placeholder="如 王浩" />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={submit} disabled={saving} icon={<I name={saving ? "loader" : "calendar-check"} size={12} className={saving ? "animate-spin" : ""} />}>
            {saving ? "保存中" : "安排"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ShareModal({ open, onClose, candidate }) {
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState("3d");
  const [custom, setCustom] = useState({ n: 7, unit: "d" });
  const [showCustom, setShowCustom] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    if (!open || !candidate?.id) return;
    setLoading(true);
    resources.share.get(candidate.id).then(setLink).catch(() => setLink(null)).finally(() => setLoading(false));
  }, [open, candidate?.id]);

  // 实时倒计时: 链接未过期时每秒 tick 一次, 已过期时停止
  useEffect(() => {
    if (!open || !link?.expiresAt) return;
    const tick = () => setNowTick(Date.now());
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [open, link?.expiresAt]);

  const PRESETS = [
    { v: "1d", l: "1 天" },
    { v: "3d", l: "3 天 (推荐)" },
    { v: "7d", l: "1 周" },
    { v: "30d", l: "1 个月" },
    { v: "forever", l: "无限期" },
  ];

  function effectiveDuration() {
    return showCustom ? `${custom.n}${custom.unit}` : duration;
  }

  async function generate() {
    setLoading(true);
    try {
      const l = await resources.share.create(candidate.id, effectiveDuration());
      setLink(l);
      toast(link ? "已重新生成链接" : "已生成分享链接", "success");
    } catch (e) { toast(e.response?.data?.message || "生成失败", "error"); }
    finally { setLoading(false); }
  }

  async function changeDuration() {
    if (!link) return;
    setLoading(true);
    try {
      const l = await resources.share.update(candidate.id, effectiveDuration());
      setLink(l);
      toast("已修改有效期", "success");
    } catch (e) { toast(e.response?.data?.message || "修改失败", "error"); }
    finally { setLoading(false); }
  }

  async function destroy() {
    if (!confirm("删除当前链接? 已分享的链接将立刻失效。")) return;
    setLoading(true);
    try {
      await resources.share.remove(candidate.id);
      setLink(null);
      toast("已删除", "success");
    } catch (e) { toast(e.response?.data?.message || "删除失败", "error"); }
    finally { setLoading(false); }
  }

  const publicUrl = link ? `${window.location.origin}/share/${link.token}` : "";

  function copy() {
    navigator.clipboard.writeText(publicUrl).then(() => toast("链接已复制到剪贴板", "success"));
  }

  // 精细化剩余时间 / 已过期时间
  // 返回 { text, tone, expired }
  //   tone = "green"(>1h) / "amber"(<=1h 未过期) / "red"(已过期)
  function fmtExpires() {
    if (!link?.expiresAt) return { text: "永久有效", tone: "green", expired: false };
    const d = new Date(link.expiresAt);
    const diffMs = d.getTime() - nowTick;
    const expired = diffMs <= 0;
    const abs = Math.abs(diffMs);
    const days = Math.floor(abs / 86400000);
    const hours = Math.floor((abs % 86400000) / 3600000);
    const minutes = Math.floor((abs % 3600000) / 60000);
    const seconds = Math.floor((abs % 60000) / 1000);
    let parts = [];
    if (days > 0) parts.push(`${days} 天`);
    if (hours > 0 || days > 0) parts.push(`${hours} 小时`);
    if (days === 0) {
      parts.push(`${minutes} 分`);
      if (days === 0 && hours === 0) parts.push(`${seconds} 秒`);
    }
    const span = parts.join(" ");
    if (expired) return { text: `已过期 ${span}`, tone: "red", expired: true };
    if (days === 0 && hours === 0) return { text: `剩余 ${span}`, tone: "amber", expired: false };
    return { text: `剩余 ${span}`, tone: "green", expired: false };
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-xl">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-navy-700 flex items-center gap-2">
            <I name="share-2" size={18} className="text-brand" />
            分享给招聘官 — {candidate?.name}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-navy-700"><I name="x" size={20} /></button>
        </div>

        {/* 已有链接 */}
        {link ? (
          (() => {
            const exp = fmtExpires();
            const wrap = exp.tone === "red" ? "bg-red-50 border-red-200" : exp.tone === "amber" ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-100";
            const head = exp.tone === "red" ? "text-red-700" : exp.tone === "amber" ? "text-amber-800" : "text-green-800";
            const headIcon = exp.tone === "red" ? "alert-circle" : exp.tone === "amber" ? "clock" : "check-circle-2";
            const expColor = exp.tone === "red" ? "text-red-700 font-bold" : exp.tone === "amber" ? "text-amber-700 font-bold" : "text-green-700 font-bold";
            return (
          <div className="space-y-4">
            <div className={`p-4 rounded-xl border ${wrap}`}>
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <p className={`text-xs font-bold flex items-center gap-1.5 ${head}`}>
                  <I name={headIcon} size={14} /> {exp.expired ? "链接已过期" : "当前分享链接"}
                </p>
                {/* 剩余/已过期 时间显著显示 */}
                <span className={`text-xs ${expColor} flex items-center gap-1`}>
                  <I name="hourglass" size={12} /> {exp.text}
                </span>
              </div>
              <div className="flex items-center gap-2 bg-white rounded-lg p-2">
                <code className="flex-1 text-xs font-mono text-navy-700 truncate">{publicUrl}</code>
                <Button size="sm" onClick={copy} icon={<I name="copy" size={12} />} disabled={exp.expired}>
                  复制
                </Button>
              </div>
              <div className="flex items-center gap-4 mt-2 text-[11px] text-gray-700">
                <span className="flex items-center gap-1">
                  <I name="calendar" size={11} />
                  {link.expiresAt ? `到期 ${new Date(link.expiresAt).toLocaleString("zh-CN")}` : "永久有效"}
                </span>
                <span className="flex items-center gap-1"><I name="eye" size={11} /> 已访问 {link.viewCount} 次</span>
              </div>
              {exp.expired && (
                <p className="text-[11px] text-red-600 mt-2 flex items-start gap-1.5">
                  <I name="info" size={11} className="mt-0.5 shrink-0" />
                  访问者打开链接会看到 "链接已过期" 错误页。请使用下方「重新生成」获取新链接,或「仅改有效期」延长当前链接。
                </p>
              )}
            </div>

            <div>
              <p className="text-xs font-bold text-gray-700 uppercase mb-2">修改有效期</p>
              <DurationPicker {...{ duration, setDuration, custom, setCustom, showCustom, setShowCustom, PRESETS }} />
              <div className="flex gap-2 mt-3">
                <Button variant="ghost" onClick={destroy} disabled={loading} icon={<I name="trash-2" size={12} />}>删除链接</Button>
                <div className="flex-1" />
                <Button variant="ghost" onClick={generate} disabled={loading} icon={<I name="rotate-ccw" size={12} />}>重新生成</Button>
                <Button onClick={changeDuration} disabled={loading} icon={<I name={loading ? "loader" : "check"} size={12} className={loading ? "animate-spin" : ""} />}>
                  仅改有效期
                </Button>
              </div>
            </div>
          </div>
            );
          })()
        ) : loading ? (
          <div className="py-10 text-center text-gray-700 text-sm">
            <I name="loader" size={16} className="animate-spin inline mr-2" />加载中...
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">生成一个 <strong>公开链接</strong>(无须登录),只能看到这位候选人的简报,不暴露其他页面信息。链接过期后立即失效。</p>
            <div>
              <p className="text-xs font-bold text-gray-700 uppercase mb-2">有效期</p>
              <DurationPicker {...{ duration, setDuration, custom, setCustom, showCustom, setShowCustom, PRESETS }} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>取消</Button>
              <Button onClick={generate} disabled={loading} icon={<I name={loading ? "loader" : "share-2"} size={12} className={loading ? "animate-spin" : ""} />}>
                {loading ? "生成中" : "生成链接"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function DurationPicker({ duration, setDuration, custom, setCustom, showCustom, setShowCustom, PRESETS }) {
  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.v}
            onClick={() => { setDuration(p.v); setShowCustom(false); }}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition border-2
              ${!showCustom && duration === p.v ? "border-brand bg-brand-50 text-brand" : "border-gray-200 hover:border-gray-300 text-gray-700"}`}
          >
            {p.l}
          </button>
        ))}
        <button
          onClick={() => setShowCustom(true)}
          className={`px-3 py-2 rounded-lg text-xs font-bold transition border-2
            ${showCustom ? "border-brand bg-brand-50 text-brand" : "border-gray-200 hover:border-gray-300 text-gray-700"}`}
        >
          自定义
        </button>
      </div>
      {showCustom && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            min="1"
            value={custom.n}
            onChange={(e) => setCustom({ ...custom, n: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            className="flex-1 h-10 rounded-lg border border-gray-200 px-3 text-sm text-navy-700 outline-none focus:border-brand"
          />
          <select
            value={custom.unit}
            onChange={(e) => setCustom({ ...custom, unit: e.target.value })}
            className="h-10 rounded-lg border border-gray-200 px-2 text-sm text-navy-700 outline-none focus:border-brand bg-white"
          >
            <option value="s">秒</option>
            <option value="m">分钟</option>
            <option value="h">小时</option>
            <option value="d">天</option>
          </select>
          <span className="text-[11px] text-gray-600">60s ~ 30 天</span>
        </div>
      )}
    </>
  );
}
