import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api, resources, LONG_TIMEOUT } from "../lib/api.js";
import {
  Card,
  Button,
  Avatar,
  StatusPill,
  AiBadge,
  MatchRing,
  Tag,
  I,
  LoadingBlock,
  Empty,
  toast,
} from "../components/Primitives.jsx";
import { STATUS_ORDER } from "../lib/constants.js";

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
              <StatusPill status={c.status} size="md" />
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
          <Button variant="ghost" icon={<I name="message-square" size={14} />} className="hidden md:inline-flex">
            添加备注
          </Button>
          <Button variant="ghost" icon={<I name="calendar-plus" size={14} />}>
            <span className="hidden sm:inline">安排面试</span>
            <span className="sm:hidden">面试</span>
          </Button>
          <Button variant="ghost" icon={<I name="share-2" size={14} />} className="hidden md:inline-flex">分享给招聘官</Button>
          <div className="flex-1"></div>
          <Button variant="danger" onClick={onDelete} icon={<I name="trash-2" size={14} />}>
            <span className="hidden sm:inline">删除候选人</span>
            <span className="sm:hidden">删除</span>
          </Button>
        </div>
      </Card>

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
          <h3 className="title-card flex items-center gap-2">
            <I name="alert-triangle" size={18} className="text-amber-500" />
            风险与缺项
          </h3>
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
          <h3 className="title-card flex items-center gap-2">
            <I name="trophy" size={18} className="text-green-500" />
            亮点
          </h3>
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
