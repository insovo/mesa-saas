// 公开候选人页 /share/:token
// 不在 AuthGuard 内 · 不显示 Sidebar / Topbar · 仅展示候选人简报
// 联系方式从 API 拿到时已经 mask, 详情 read-only

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import {
  Card,
  Avatar,
  StatusPill,
  AiBadge,
  MatchRing,
  Tag,
  I,
  LoadingBlock,
  Empty,
} from "../components/Primitives.jsx";

function fmtExpiresHint(iso) {
  if (!iso) return "永久有效";
  const d = new Date(iso);
  const now = Date.now();
  if (d.getTime() < now) return "已过期";
  const hrs = Math.round((d.getTime() - now) / 3600000);
  if (hrs < 24) return `${hrs} 小时后过期`;
  return `${Math.round(hrs / 24)} 天后过期`;
}

export default function SharedCandidate() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    axios.get(`/api/public/share/${token}`)
      .then((r) => setData(r.data))
      .catch((e) => setErr(e.response?.data || { error: "fetch_failed", message: e.message }));
  }, [token]);

  if (err) {
    return (
      <div className="min-h-screen bg-lightPrimary flex items-center justify-center px-4">
        <Card className="p-10 max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <I name={err.error === "share_expired" ? "clock" : "link-2-off"} size={28} className="text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-navy-700 mb-2">
            {err.error === "share_expired" ? "链接已过期" : "链接无效"}
          </h1>
          <p className="text-sm text-gray-700">{err.message || "请联系分享方"}</p>
        </Card>
      </div>
    );
  }

  if (!data) return (
    <div className="min-h-screen bg-lightPrimary flex items-center justify-center p-6">
      <LoadingBlock label="加载候选人信息..." height="h-32" />
    </div>
  );

  const c = data.candidate;
  const share = data.share;

  return (
    <div className="min-h-screen bg-lightPrimary">
      {/* 顶部 banner */}
      <header className="bg-white border-b border-gray-200 py-4 px-4 md:px-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <span className="text-[20px] uppercase text-navy-700" style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700 }}>
            MESA <span style={{ fontWeight: 500 }}>RECRUIT</span>
          </span>
          <div className="flex items-center gap-3 text-xs text-gray-600">
            <span className="flex items-center gap-1"><I name="share-2" size={12} /> 招聘官只读视图</span>
            <span className="flex items-center gap-1"><I name="clock" size={12} /> {fmtExpiresHint(share?.expiresAt)}</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-8 py-6 space-y-5">
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
                {(c.tags || []).map((t) => <Tag key={t}>{t}</Tag>)}
              </div>
              <div className="flex flex-wrap gap-x-4 md:gap-x-6 gap-y-2 mt-4 text-[11px] md:text-xs text-gray-700">
                <span className="flex items-center gap-1"><I name="phone" size={12} /> {c.phone || "—"}</span>
                <span className="flex items-center gap-1"><I name="mail" size={12} /> {c.email || "—"}</span>
                <span className="flex items-center gap-1"><I name="briefcase" size={12} /> {c.appliedFor || "—"}</span>
              </div>
              <p className="text-[11px] text-amber-700 mt-2">
                ⓘ 联系方式已自动打码,如需联系候选人请联系分享方
              </p>
            </div>
            {c.jdMatch != null && (
              <div className="flex flex-col items-center gap-2 px-4 py-3 rounded-2xl bg-lightPrimary">
                <MatchRing value={c.jdMatch} size={80} stroke={8} />
                <p className="text-xs text-gray-700 font-bold">JD 匹配度</p>
              </div>
            )}
          </div>
        </Card>

        {/* === AI 简报 === */}
        {c.aiSummary && (
          <Card className="p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="title-card flex items-center gap-2">
                <I name="file-text" size={18} className="text-brand" />
                AI 简历简报
              </h3>
              <AiBadge parser={c.parser || "Kimi"} confidence={c.parserConfidence} />
            </div>
            <pre className="whitespace-pre-wrap text-sm font-mono text-navy-700 bg-lightPrimary rounded-xl p-4 max-h-[500px] overflow-y-auto leading-relaxed">{c.aiSummary}</pre>
          </Card>
        )}

        {/* === 核心三栏 === */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          <Card className="p-5 md:p-6">
            <h3 className="title-card flex items-center gap-2">
              <I name="sparkles" size={18} className="text-brand" />
              核心技能
            </h3>
            {(c.skills || []).length === 0 ? <Empty title="暂无技能识别" /> : (
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
            {(c.risks || []).length === 0 ? <Empty title="未识别显著风险" /> : (
              <ul className="mt-4 space-y-2.5">
                {c.risks.map((r, i) => (
                  <li key={i} className="text-sm text-navy-700 flex items-start gap-2">
                    <I name="dot" size={14} className="text-amber-500 mt-0.5 shrink-0" />
                    {r}
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
            {(c.highlights || []).length === 0 ? <Empty title="暂无亮点" /> : (
              <ul className="mt-4 space-y-2.5">
                {c.highlights.map((h, i) => (
                  <li key={i} className="text-sm text-navy-700 flex items-start gap-2">
                    <I name="star" size={14} className="text-green-500 mt-0.5 shrink-0" />
                    {h}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* === 工作经历 / 教育 === */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
          <Card className="p-5 md:p-6">
            <h3 className="title-card">工作经历</h3>
            {(!c.experience || c.experience.length === 0) ? <Empty title="暂无工作经历" /> : (
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
            {(!c.educationHistory || c.educationHistory.length === 0) ? <Empty title="暂无教育背景" /> : (
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
          </Card>
        </div>

        <footer className="text-center text-[11px] text-gray-600 pt-4">
          MESA Recruit · 此页面为只读分享链接 · 已被访问 {share.viewCount} 次
        </footer>
      </main>
    </div>
  );
}
