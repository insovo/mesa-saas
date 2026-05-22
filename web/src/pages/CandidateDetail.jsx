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
      setC(data.candidate);
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
      <Card className="p-7">
        <div className="flex items-start gap-6 flex-wrap">
          <Avatar name={c.name} animal={c.animal} src={c.avatar} size={88} />
          <div className="flex-1 min-w-[240px]">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold text-navy-700">{c.name}</h1>
              {c.parser && <AiBadge parser={c.parser} confidence={c.parserConfidence} />}
              <StatusPill status={c.status} size="md" />
            </div>
            <p className="text-sm text-gray-700 mt-2">
              {[c.education, c.school, c.major, `${c.yearsExp || 0} 年经验`, c.location].filter(Boolean).join(" · ")}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {(c.tags || []).map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-xs text-gray-700">
              <span className="flex items-center gap-1"><I name="phone" size={12} /> {c.phone || "—"}</span>
              <span className="flex items-center gap-1"><I name="mail" size={12} /> {c.email || "—"}</span>
              <span className="flex items-center gap-1"><I name="briefcase" size={12} /> {c.appliedFor || "—"}</span>
              <span className="flex items-center gap-1"><I name="calendar" size={12} /> 推送 {fmtDate(c.pushedAt)}</span>
              <span className="flex items-center gap-1"><I name="link" size={12} /> {c.source || "—"}</span>
            </div>
          </div>
          {c.jdMatch != null ? (
            <div className="flex flex-col items-center gap-3">
              <MatchRing value={c.jdMatch} size={88} stroke={8} />
              <p className="text-xs text-gray-700">JD 匹配度</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 px-3 py-4 rounded-xl border-2 border-dashed border-gray-200 text-center w-[180px]">
              <I name="link-2-off" size={20} className="text-gray-400" />
              <p className="text-xs text-gray-700 font-medium">未关联 JD</p>
              <p className="text-[11px] text-gray-600">下方可关联岗位<br/>触发 AI 评估</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3 mt-6 pt-5 border-t border-gray-200">
          <Button onClick={pushNextStatus} icon={<I name="zap" size={14} />}>
            推进到下一阶段
          </Button>
          <Button variant="ghost" icon={<I name="message-square" size={14} />}>
            添加备注
          </Button>
          <Button variant="ghost" icon={<I name="calendar-plus" size={14} />}>
            安排面试
          </Button>
          <Button variant="ghost" icon={<I name="share-2" size={14} />}>分享给招聘官</Button>
          <div className="flex-1"></div>
          <Button variant="danger" onClick={onDelete} icon={<I name="trash-2" size={14} />}>
            删除候选人
          </Button>
        </div>
      </Card>

      {/* === 关联 JD · 触发匹配度评估 === */}
      <Card className="p-5 flex flex-wrap items-center gap-3">
        <I name="link" size={16} className="text-brand" />
        <p className="text-sm font-bold text-navy-700">关联岗位 JD 评估</p>
        <span className="text-xs text-gray-700">
          {c.jdMatch != null ? `已关联评估 · 当前匹配度 ${c.jdMatch}` : "未关联 · 选 JD 后 AI 会根据简报和 JD 描述给评估"}
        </span>
        <select
          value={matchingJobId}
          onChange={(e) => setMatchingJobId(e.target.value)}
          className="flex-1 min-w-[200px] h-10 rounded-xl border border-gray-200 px-3 text-sm text-navy-700 outline-none focus:border-brand bg-white"
        >
          <option value="">— 选一个 JD —</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}{j.dept ? ` · ${j.dept}` : ""}{!j.description ? " ⚠️ 无 JD 描述" : ""}
            </option>
          ))}
        </select>
        <Button onClick={runJdMatch} disabled={!matchingJobId || matching} icon={<I name={matching ? "loader" : "sparkles"} size={14} className={matching ? "animate-spin" : ""} />}>
          {matching ? "评估中" : (c.jdMatch != null ? "重新评估" : "AI 评估")}
        </Button>
      </Card>

      {/* === AI 解析简报(纯文本,HR 友好)=== */}
      {c.aiSummary && (
        <Card className="p-6">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* === AI 核心技能 / 风险 / 亮点 === */}
        <Card className="p-6">
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

        <Card className="p-6">
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

        <Card className="p-6">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-6">
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

        <Card className="p-6">
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
