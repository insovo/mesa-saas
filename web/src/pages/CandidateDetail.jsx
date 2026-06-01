// ============================================================================
// MESA Recruit · 候选人详情页 (扁平化单文件) for Claude Design
// ----------------------------------------------------------------------------
// 用途: 上传到 claude.ai → 在 artifact 中迭代视觉, 然后 diff 移植回
//       web/src/pages/CandidateDetail.jsx
//
// 已做的扁平化:
//   ✓ 内联 lucide-react 图标 (动态 <I name="..."/>)
//   ✓ 内联 Primitives (Card / Button / Avatar / StatusPill / AiBadge / MatchRing
//                       / Tag / I / Modal / Empty / LoadingBlock / Input / toast)
//   ✓ 内联设计令牌 (品牌色用 arbitrary value 写, 不依赖 tailwind.config)
//   ✓ 删除 react-router (useParams/useNavigate/Link → noop)
//   ✓ 删除 axios + resources.* + api.* → 全部走 mock async functions
//   ✓ Mock 候选人 / JD 列表 / 评论 / 笔记 / 当前用户 (全部脱敏)
//   ✓ 删除 SystemSetting / Notification.requestPermission 真实调用 (保留 UI)
//   ✓ Notification + Web Audio API 真实可触发 (但默认不轮询, 避免干扰设计)
//
// 注意 (移植回去时):
//   - 改完别直接覆盖生产文件, 用 diff 工具挑选 className / JSX 结构变更
//   - 主组件 CandidateDetail 顶部的 useState + load + useEffect 必须保留生产版
//   - 不要引入 lucide-react 之外的新 icon 库
//
// 品牌色锚点 (千万别改):
//   primary  #422AFB    hover #3311DB    active #2111A5    gradient via #432CF3 → #868CFF
//   navy-700 #1B254B    gray-700 #707EAE  light-primary #F4F7FE
//   shadow-card 14px 17px 40px 4px rgba(112,144,176,0.08)
//   rounded-card 20px
// ============================================================================

// 合入生产: V2 设计稿 1:1 接管 /candidates/:id。
// mockApi → resources/api;接 useParams 拿真实候选人 id;新字段(documents/insights/aiSuggestedTags 等)生产 API 暂未返回,渲染处用 ?? [] / ?? null 兜底。
import React, { useEffect, useMemo, useState } from "react";
import * as Lucide from "lucide-react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, resources, LONG_TIMEOUT } from "../lib/api.js";
import { getUser } from "../lib/auth.js";
import { useHasModule } from "../lib/authContext.jsx";
import { LiquidLoader } from "../components/Primitives.jsx";
import ReparseConfirmModal from "../components/ReparseConfirmModal.jsx";
import MarkdownBullets from "../components/MarkdownBullets.jsx";
import InterviewEvalCard from "../components/InterviewEvalCard.jsx";
import { candidateExpText, hasWorkExperience } from "../lib/constants.js";
import { DurationPicker, MaxViewsPicker, BotShareSettings } from "../components/ShareDefaultsPanel.jsx";

// ─────────────────────────────────────────────────────────────────────────────
// 1) 设计常量 (内联自 web/src/lib/constants.js)
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_ORDER = ["待筛选", "已沟通", "面试中", "待定中", "待入职", "已入职", "已淘汰"];

const STATUS_TONE = {
  待筛选: { bg: "#F4F7FE", fg: "#707EAE", dot: "#A3AED0" },
  已沟通: { bg: "#DBEAFE", fg: "#1D4ED8", dot: "#3B82F6" },
  面试中: { bg: "#E9E3FF", fg: "#2111A5", dot: "#422AFB" },
  待定中: { bg: "#FEF3C7", fg: "#854D0E", dot: "#EAB308" },
  待入职: { bg: "#FFEDD5", fg: "#9A3412", dot: "#F97316" },
  已入职: { bg: "#DCFCE7", fg: "#15803D", dot: "#22C55E" },
  已淘汰: { bg: "#FEE2E2", fg: "#B91C1C", dot: "#F53939" },
};

const INTERVIEW_ROUNDS = ["初筛", "一面", "二面", "终面", "HR 面", "加面"];


function parseDur(s) {
  if (s === "forever") return Infinity;
  const m = /^(\d+)([smhd])$/.exec(s);
  if (!m) return 3 * 86400000;
  const n = parseInt(m[1], 10);
  const unit = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2]];
  return n * unit;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) 内联 Primitives (从 web/src/components/Primitives.jsx 迁来,
//    所有 brand/navy/lightPrimary 都改成 arbitrary value, 不依赖 tailwind.config)
// ─────────────────────────────────────────────────────────────────────────────

function pascal(name) {
  return (name || "help-circle").split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
}

function I({ name, size = 18, strokeWidth = 2, className = "", ...rest }) {
  const Icon = Lucide[pascal(name)] || Lucide.HelpCircle;
  return <Icon size={size} strokeWidth={strokeWidth} className={className} {...rest} />;
}

function Card({ children, className = "", ...rest }) {
  return (
    <div
      className={`relative flex flex-col rounded-[20px] bg-white shadow-[14px_17px_40px_4px_rgba(112,144,176,0.08)] ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

const BTN_SIZES = {
  sm: "h-9 px-4 text-sm rounded-xl gap-1.5",
  md: "h-11 px-5 text-sm rounded-xl gap-2",
  lg: "h-12 px-6 text-base rounded-xl gap-2",
};

const BTN_VARIANTS = {
  primary: "bg-[#422AFB] text-white hover:bg-[#3311DB] active:bg-[#2111A5] font-medium shadow-[0_4px_14px_rgba(66,42,251,0.18)]",
  secondary: "bg-[#F4F7FE] text-[#1B254B] hover:bg-[#E9ECEF] font-medium",
  ghost: "bg-transparent text-[#1B254B] hover:bg-[#F4F7FE] border border-[#E9ECEF] font-medium",
  danger: "bg-red-500 text-white hover:bg-red-600 active:bg-red-700 font-medium",
};

function Button({ children, variant = "primary", size = "md", icon, className = "", disabled, ...rest }) {
  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center transition-colors duration-200 ${BTN_SIZES[size]} ${BTN_VARIANTS[variant]} ${disabled ? "opacity-60 cursor-not-allowed" : ""} ${className}`}
      {...rest}
    >
      {icon && <span className="inline-flex" style={{ lineHeight: 0 }}>{icon}</span>}
      {children}
    </button>
  );
}

function Input({ label, id, type = "text", placeholder, value, onChange, className = "", containerClassName = "", ...rest }) {
  return (
    <div className={containerClassName}>
      {label && (
        <label htmlFor={id} className="text-sm text-[#1B254B] font-bold ml-3 block mb-2">
          {label}
        </label>
      )}
      <input
        type={type} id={id} value={value} onChange={onChange} placeholder={placeholder}
        className={`flex h-12 w-full items-center rounded-xl border border-[#E9ECEF] bg-white/0 p-3 text-sm outline-none placeholder:text-[#A0AEC0] focus:border-[#422AFB] text-[#1B254B] transition-colors ${className}`}
        {...rest}
      />
    </div>
  );
}

const ANIMAL_EMOJI = {
  dog: "🐶", cat: "🐱", rabbit: "🐰", bear: "🐻", bird: "🐦", fish: "🐠",
  fox: "🦊", panda: "🐼", monkey: "🐵", whale: "🐳", cow: "🐮", tiger: "🐯", lion: "🦁",
};

function Avatar({ name, animal, src, size = 40 }) {
  if (src) {
    return <img src={src} alt={name} className="rounded-full object-cover bg-gray-100" style={{ width: size, height: size }} />;
  }
  const initials = (name || "?").trim().slice(0, 1);
  const emoji = animal ? ANIMAL_EMOJI[animal] : null;
  return (
    <div
      className="rounded-full text-white flex items-center justify-center font-medium"
      style={{
        width: size, height: size, fontSize: size * 0.4,
        background: "linear-gradient(135deg, #868CFF 0%, #432CF3 50%, #422AFB 100%)",
      }}
      title={name}
    >
      {emoji || initials}
    </div>
  );
}

function StatusPill({ status, size = "sm" }) {
  const tone = STATUS_TONE[status] || STATUS_TONE["待筛选"];
  const sz = size === "sm" ? "px-3 py-1 text-[11px]" : "px-3.5 py-1.5 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold whitespace-nowrap ${sz}`}
      style={{ background: tone.bg, color: tone.fg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone.dot }}></span>
      {status}
    </span>
  );
}

function AiBadge({ parser = "Kimi", confidence }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
      style={{ background: "linear-gradient(135deg,#868CFF 0%,#432CF3 50%,#422AFB 100%)" }}
    >
      <I name="sparkles" size={11} strokeWidth={2.5} />
      {parser} 已解析
      {confidence != null && <span className="opacity-80 font-medium">· {confidence}%</span>}
    </span>
  );
}


function Tag({ children }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#F4F7FE] text-[#707EAE]">
      {children}
    </span>
  );
}

function Modal({ open, onClose, children, maxWidth = "max-w-2xl" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0B1437]/30 backdrop-blur-sm" onClick={onClose}></div>
      <div className={`relative w-full ${maxWidth} bg-white rounded-[20px] shadow-[14px_17px_40px_4px_rgba(112,144,176,0.08)] max-h-[90vh] overflow-auto`}>
        {children}
      </div>
    </div>
  );
}

function ExperienceItem({ e, projects = [] }) {
  const [open, setOpen] = useState(false);
  const hasDetail =
    (Array.isArray(e.achievements) && e.achievements.length > 0) ||
    projects.length > 0;
  return (
    <li className="relative pl-6">
      <span className="absolute left-0 top-2 w-[7px] h-[7px] rounded-full bg-[#422AFB] ring-2 ring-white" />
      <button
        type="button"
        onClick={() => hasDetail && setOpen(v => !v)}
        disabled={!hasDetail}
        className={`group w-full text-left flex items-start gap-2 ${hasDetail ? "cursor-pointer" : "cursor-default"}`}
        aria-expanded={open}
      >
        <span
          className={`mt-[3px] inline-flex items-center justify-center w-3.5 h-3.5 shrink-0 text-[#A3AED0] transition-transform ${open ? "rotate-90" : ""} ${hasDetail ? "group-hover:text-[#422AFB]" : "invisible"}`}
          aria-hidden="true"
        >
          <I name="chevron-right" size={12} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[#A3AED0]">{e.period}</p>
          <p className="text-sm font-bold text-[#1B254B] mt-0.5 flex items-center gap-1.5">
            {e.company}
            {hasDetail && (
              <span className="text-[10px] font-medium text-[#A3AED0] group-hover:text-[#422AFB] transition">
                {open ? "收起" : "展开"}
              </span>
            )}
          </p>
          <p className="text-xs text-[#707EAE]">{e.title}</p>
          {e.summary && <p className="text-xs text-[#707EAE] mt-1">{e.summary}</p>}
        </div>
      </button>

      {open && hasDetail && (
        <div className="mt-3 ml-[18px] space-y-3">
          {Array.isArray(e.achievements) && e.achievements.length > 0 && (
            <div className="rounded-xl bg-[#F4F7FE] p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#A3AED0] mb-1.5 flex items-center gap-1">
                <I name="list-checks" size={11} /> 核心产出
              </p>
              <ul className="space-y-1">
                {e.achievements.map((a, j) => (
                  <li key={j} className="text-[11px] text-[#707EAE] flex gap-1.5 leading-relaxed">
                    <span className="text-[#422AFB] mt-1 shrink-0">▸</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {projects.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#A3AED0] mb-1.5 flex items-center gap-1">
                <I name="folder-kanban" size={11} /> 相关项目 ({projects.length})
              </p>
              <ul className="space-y-2">
                {projects.map((p, i) => (
                  <li key={i} className="rounded-xl border border-[#E9ECEF] p-3 hover:border-[#422AFB] transition">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#1B254B] leading-snug">{p.name}</p>
                        <p className="text-[11px] text-[#707EAE] mt-1 flex items-center gap-1.5">
                          <I name="user" size={11} /> {p.role}
                        </p>
                      </div>
                      <span className="text-[11px] text-[#A3AED0] flex items-center gap-1 shrink-0 whitespace-nowrap">
                        <I name="calendar" size={11} /> {p.period}
                      </span>
                    </div>
                    {p.summary && <p className="text-xs text-[#707EAE] mt-2 leading-relaxed">{p.summary}</p>}
                    {Array.isArray(p.stack) && p.stack.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {p.stack.map((s) => (
                          <span key={s} className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-white text-[#422AFB] border border-[#E9E3FF] whitespace-nowrap">{s}</span>
                        ))}
                      </div>
                    )}
                    {Array.isArray(p.metrics) && p.metrics.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-[#E9ECEF]">
                        {p.metrics.map((m, j) => (
                          <div key={j} className="flex flex-col min-w-0">
                            <span className="text-[10px] text-[#A3AED0] uppercase tracking-wide truncate">{m.label}</span>
                            <span className="text-sm font-bold text-[#1B254B] mt-0.5 leading-tight">{m.value}</span>
                            {m.delta && <span className="text-[10px] text-[#422AFB] font-bold mt-0.5">{m.delta}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {Array.isArray(p.links) && p.links.length > 0 && (
                      <div className="flex flex-wrap gap-3 mt-2.5">
                        {p.links.map((l, j) => (
                          <a key={j} href={l.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#422AFB] hover:underline flex items-center gap-1">
                            <I name="external-link" size={11} /> {l.label}
                          </a>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function Empty({ icon = "inbox", title = "暂无数据", desc }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-[#A3AED0]">
      <div className="w-14 h-14 rounded-full bg-[#F4F7FE] flex items-center justify-center mb-3">
        <I name={icon} size={28} className="text-[#A0AEC0]" />
      </div>
      <p className="text-sm font-medium text-[#1B254B]">{title}</p>
      {desc && <p className="text-xs text-[#A3AED0] mt-1">{desc}</p>}
    </div>
  );
}

// MarkdownBullets 已抽到 ../components/MarkdownBullets.jsx (SharedCandidate 也用)

// 候选人未关联 JD / 关联了但 LLM 还没产数据时的引导卡片
function NeedJobPlaceholder({ hasJob, onPickJob, fieldName }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center px-4">
      <div className="w-12 h-12 rounded-full bg-[#E9E3FF] flex items-center justify-center mb-3">
        <I name="sparkles" size={20} className="text-[#422AFB]" />
      </div>
      {hasJob ? (
        <>
          <p className="text-sm font-bold text-[#1B254B]">暂无{fieldName}</p>
          <p className="text-[11px] text-[#A3AED0] mt-1">已关联 JD, 重新解析后自动生成</p>
        </>
      ) : (
        <>
          <p className="text-sm font-bold text-[#1B254B]">关联 JD 后自动生成</p>
          <p className="text-[11px] text-[#A3AED0] mt-1 mb-3">{fieldName} 根据 JD 二次评估产出</p>
          {onPickJob && (
            <button
              type="button"
              onClick={onPickJob}
              className="text-[11px] font-bold text-[#422AFB] hover:underline inline-flex items-center gap-1"
            >
              <I name="briefcase" size={11} /> 选择投递岗位
            </button>
          )}
        </>
      )}
    </div>
  );
}

function LoadingBlock({ height = "h-32", label = "加载中..." }) {
  return (
    <div className={`${height} w-full rounded-[20px] bg-white shadow-[14px_17px_40px_4px_rgba(112,144,176,0.08)] flex items-center justify-center text-sm text-[#707EAE]`}>
      <I name="loader" size={16} className="animate-spin mr-2" />
      {label}
    </div>
  );
}

// 轻量 toast
let toastSeq = 0;
const toastListeners = new Set();
function toast(msg, type = "info") {
  const id = ++toastSeq;
  toastListeners.forEach((cb) => cb({ id, msg, type }));
  return id;
}
function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const cb = (t) => {
      setItems((prev) => [...prev, t]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 3500);
    };
    toastListeners.add(cb);
    return () => toastListeners.delete(cb);
  }, []);
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-xl shadow-[14px_17px_40px_4px_rgba(112,144,176,0.08)] text-sm font-medium max-w-sm
            ${t.type === "error" ? "bg-red-500 text-white" : t.type === "success" ? "bg-green-500 text-white" : "bg-[#1B254B] text-white"}`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) 工具函数
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtReviewTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// 真实可触发的桌面通知 + Web Audio 短音 (默认主组件不轮询, 仅留 API 备用)
function notifyNewReviews(candidateName, newOnes) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      const first = newOnes[0];
      const body = newOnes.length === 1
        ? `${first.authorName}: ${(first.content || "").slice(0, 80)}`
        : `${newOnes.length} 条新评论`;
      const n = new Notification(`${candidateName} 有新评论`, { body, icon: "/favicon.ico", tag: `candidate-${first.candidateId}`, renotify: true });
      n.onclick = () => { window.focus(); n.close(); };
    }
  } catch { /* ignore */ }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.setValueAtTime(880, ctx.currentTime);
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    o.start(); o.stop(ctx.currentTime + 0.3);
    setTimeout(() => {
      const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
      o2.connect(g2); g2.connect(ctx.destination);
      o2.frequency.setValueAtTime(1318.51, ctx.currentTime);
      g2.gain.setValueAtTime(0.001, ctx.currentTime);
      g2.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      o2.start(); o2.stop(ctx.currentTime + 0.3);
      setTimeout(() => ctx.close().catch(() => {}), 500);
    }, 120);
  } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6) JD 匹配卡 — 一直可点击切换 JD 触发评估
// ─────────────────────────────────────────────────────────────────────────────

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
            ${hasMatch ? "bg-[#F4F7FE] hover:bg-white hover:shadow-md" : "border-2 border-dashed border-gray-200 hover:border-[#422AFB] hover:bg-[#F4F7FE]"}`}
        >
          {hasMatch ? (
            <>
              <LiquidLoader size={80} level={candidate.jdMatch ?? 0} label={candidate.jdMatch ?? "—"} loading={matching} />
              <p className="text-xs font-bold text-[#1B254B]">{currentJob?.title || candidate.appliedFor || "JD 匹配度"}</p>
              <p className="text-[11px] text-[#422AFB] group-hover:underline flex items-center gap-1">
                <I name="pencil" size={10} /> 点击换 JD
              </p>
            </>
          ) : (
            <>
              <I name="link-2-off" size={26} className="text-gray-400 group-hover:text-[#422AFB]" />
              <p className="text-sm font-bold text-[#1B254B]">未关联 JD</p>
              <p className="text-[11px] text-[#422AFB] group-hover:underline">点击选 JD 并 AI 评估</p>
            </>
          )}
        </button>
      ) : (
        <div className="p-4 rounded-2xl bg-white border-2 border-[#422AFB]">
          <p className="text-xs font-bold text-[#707EAE] uppercase mb-2">选择 / 切换 JD</p>
          <select
            value={matchingJobId}
            onChange={(e) => setMatchingJobId(e.target.value)}
            disabled={matching}
            className="w-full h-10 rounded-xl border border-[#E9ECEF] px-2 text-sm text-[#1B254B] outline-none focus:border-[#422AFB] bg-white"
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
              className="flex-1 h-9 rounded-xl text-xs font-bold text-[#707EAE] hover:bg-[#F4F7FE]"
              disabled={matching}
            >
              取消
            </button>
            <button
              onClick={async () => { await onRun(); setOpen(false); }}
              disabled={!matchingJobId || matching}
              className="flex-1 h-9 rounded-xl text-xs font-bold bg-[#422AFB] text-white hover:bg-[#3311DB] disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {matching ? <><I name="loader" size={12} className="animate-spin" /> 评估中</> : <><I name="sparkles" size={12} /> {hasMatch ? "重评" : "AI 评估"}</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7) 备注 / 面试 / 分享 Modal
// ─────────────────────────────────────────────────────────────────────────────

function JdDescModal({ open, onClose, job, onSwitch }) {
  if (!job) return null;
  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-2xl">
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-[#1B254B] flex items-center gap-2 flex-wrap">
              <I name="file-text" size={18} className="text-[#422AFB]" />
              {job.title}
              {job.dept && <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#F4F7FE] text-[#707EAE] font-bold">{job.dept}</span>}
            </h3>
            {job.description && <p className="text-sm text-[#707EAE] mt-1.5 leading-relaxed">{job.description}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-[#1B254B] shrink-0"><I name="x" size={20} /></button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { icon: "map-pin", label: "工作地点", value: job.location },
            { icon: "briefcase", label: "经验要求", value: job.yearsExp },
            { icon: "graduation-cap", label: "学历", value: job.education },
            { icon: "dollar-sign", label: "薪资范围", value: job.salary },
          ].filter(x => x.value).map((x, i) => (
            <div key={i} className="p-3 rounded-xl bg-[#F4F7FE]">
              <p className="text-[10px] text-[#A3AED0] uppercase tracking-wide flex items-center gap-1"><I name={x.icon} size={11} />{x.label}</p>
              <p className="text-sm font-bold text-[#1B254B] mt-1">{x.value}</p>
            </div>
          ))}
        </div>

        <div className="max-h-[50vh] overflow-y-auto -mx-2 px-2 space-y-5">
          {Array.isArray(job.responsibilities) && job.responsibilities.length > 0 && (
            <section>
              <h4 className="text-sm font-bold text-[#1B254B] flex items-center gap-2 mb-2">
                <I name="list-checks" size={14} className="text-[#422AFB]" />
                岗位职责
              </h4>
              <ul className="space-y-1.5">
                {job.responsibilities.map((r, i) => (
                  <li key={i} className="text-xs text-[#1B254B] flex items-start gap-2 leading-relaxed">
                    <span className="w-5 h-5 rounded-md bg-[#F4F7FE] text-[#422AFB] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {Array.isArray(job.requirements) && job.requirements.length > 0 && (
            <section>
              <h4 className="text-sm font-bold text-[#1B254B] flex items-center gap-2 mb-2">
                <I name="check-circle-2" size={14} className="text-[#422AFB]" />
                任职要求
              </h4>
              <ul className="space-y-1.5">
                {job.requirements.map((r, i) => (
                  <li key={i} className="text-xs text-[#1B254B] flex items-start gap-2 leading-relaxed">
                    <I name="check" size={11} className="text-[#422AFB] mt-1 shrink-0" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {Array.isArray(job.nice) && job.nice.length > 0 && (
            <section>
              <h4 className="text-sm font-bold text-[#1B254B] flex items-center gap-2 mb-2">
                <I name="sparkles" size={14} className="text-[#422AFB]" />
                加分项
              </h4>
              <ul className="space-y-1.5">
                {job.nice.map((r, i) => (
                  <li key={i} className="text-xs text-[#707EAE] flex items-start gap-2 leading-relaxed">
                    <I name="plus" size={11} className="text-[#A3AED0] mt-1 shrink-0" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {Array.isArray(job.benefits) && job.benefits.length > 0 && (
            <section>
              <h4 className="text-sm font-bold text-[#1B254B] flex items-center gap-2 mb-2">
                <I name="gift" size={14} className="text-[#422AFB]" />
                福利待遇
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {job.benefits.map((b, i) => (
                  <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-medium bg-[#F4F7FE] text-[#1B254B]">{b}</span>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-[#E9ECEF] flex-wrap">
          <div className="text-[11px] text-[#A3AED0]">
            {job.publishedAt && <span>发布: {job.publishedAt}</span>}
            {job.deadline && <span className="ml-3">截止: {job.deadline}</span>}
            {job.owner && <span className="ml-3">负责人: {job.owner}</span>}
          </div>
          <div className="flex gap-2 ml-auto">
            {onSwitch && (
              <Button variant="ghost" onClick={onSwitch} icon={<I name="repeat" size={12} />}>切换 JD</Button>
            )}
            <Button onClick={onClose}>关闭</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function JdSwitchConfirmModal({ open, onClose, onConfirm, currentJob, targetJob, candidateName }) {
  if (!open || !targetJob) return null;
  const fromTitle = currentJob ? `${currentJob.title}${currentJob.dept ? ` · ${currentJob.dept}` : ""}` : "—";
  const toTitle = `${targetJob.title}${targetJob.dept ? ` · ${targetJob.dept}` : ""}`;
  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <h3 className="text-lg font-bold text-[#1B254B] flex items-center gap-2">
            <I name="repeat" size={18} className="text-[#422AFB]" />
            切换 JD 并重新匹配
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-[#1B254B]"><I name="x" size={20} /></button>
        </div>

        <p className="text-sm text-[#707EAE] mb-4">
          系统将基于 <span className="font-bold text-[#1B254B]">{candidateName || "候选人"}</span> 已解析的简历内容,
          针对新的 JD 重新生成评估。
        </p>

        <div className="flex items-stretch gap-2 mb-5">
          <div className="flex-1 min-w-0 p-3 rounded-xl bg-[#F4F7FE]">
            <p className="text-[10px] uppercase tracking-wide text-[#A3AED0] mb-1">当前 JD</p>
            <p className="text-sm font-bold text-[#1B254B] truncate">{fromTitle}</p>
          </div>
          <div className="flex items-center justify-center text-[#422AFB] shrink-0">
            <I name="arrow-right" size={16} />
          </div>
          <div className="flex-1 min-w-0 p-3 rounded-xl bg-[#E9E3FF]">
            <p className="text-[10px] uppercase tracking-wide text-[#422AFB] mb-1">目标 JD</p>
            <p className="text-sm font-bold text-[#1B254B] truncate">{toTitle}</p>
          </div>
        </div>

        <div className="rounded-xl border border-[#E9ECEF] p-3 mb-5">
          <p className="text-[11px] font-bold text-[#A3AED0] uppercase tracking-wide mb-2">将重新生成</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-[#707EAE]">
            {[
              "JD 匹配度",
              "匹配项 / 不匹配项",
              "核心技能",
              "风险与缺项",
              "亮点",
              "智能标签 (AI 建议)",
              "岗位概览要求",
              "右侧洞察",
            ].map(x => (
              <span key={x} className="flex items-center gap-1.5">
                <I name="sparkles" size={10} className="text-[#422AFB] shrink-0" />
                {x}
              </span>
            ))}
          </div>
        </div>

        <p className="text-[10px] text-[#A3AED0] mb-4">
          ⚠ 当前已采纳的智能标签和评估字段会被覆盖,确认前请先备份。原始简历不变。
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={onConfirm} icon={<I name="zap" size={12} />}>
            确认切换并重新匹配
          </Button>
        </div>
      </div>
    </Modal>
  );
}

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
    } catch (e) { toast(e.message || "添加失败", "error"); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[#1B254B] flex items-center gap-2">
            <I name="message-square" size={18} className="text-[#422AFB]" />
            添加备注
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-[#1B254B]"><I name="x" size={20} /></button>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="备注内容(如:候选人在二面表现出色,沟通能力突出...)"
          className="w-full p-3 rounded-xl border border-[#E9ECEF] text-sm text-[#1B254B] outline-none focus:border-[#422AFB] resize-none"
          disabled={saving}
        />
        <p className="text-xs text-[#A3AED0] mt-1.5">{content.length} / 5000</p>
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

const INTERVIEW_CATEGORIES = ["技术", "文化", "HR", "综合", "Boss"];

// 一个内置的"常用人选"小池子,用来给 PeopleChips 提供建议(生产代码请换成搜索 API)
const PEOPLE_POOL = [
  { name: "演示管理员", role: "HR 经理", animal: "fox" },
  { name: "陈架构师", role: "技术总监", animal: "tiger" },
  { name: "王浩", role: "高级工程师", animal: "panda" },
  { name: "李四", role: "招聘主管", animal: "owl" },
  { name: "王招聘官", role: "外部 HR", animal: "rabbit" },
  { name: "刘经理", role: "业务方", animal: "koala" },
];

function PeopleChips({ value, onChange, label, placeholder = "输入名字后回车" }) {
  const [draft, setDraft] = useState("");
  const ids = new Set(value.map(v => v.name));
  const suggestions = PEOPLE_POOL.filter(p => !ids.has(p.name) && (!draft || p.name.includes(draft)));

  function add(person) {
    if (!person || !person.name) return;
    if (ids.has(person.name)) return;
    onChange([...value, person]);
    setDraft("");
  }
  function remove(name) {
    onChange(value.filter(v => v.name !== name));
  }
  return (
    <div>
      <label className="text-sm text-[#1B254B] font-bold ml-3 block mb-2">{label} <span className="text-[10px] text-[#A3AED0] font-medium">· 可不选 / 单选 / 多选</span></label>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-[#F4F7FE] text-[#1B254B] text-[12px]">
              <Avatar name={p.name} animal={p.animal} size={20} />
              {p.name}
              {p.role && <span className="text-[10px] text-[#A3AED0]">· {p.role}</span>}
              <button onClick={() => remove(p.name)} type="button" className="ml-1 text-[#A3AED0] hover:text-red-500" aria-label={`移除 ${p.name}`}>
                <I name="x" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              add({ name: draft.trim(), animal: "rabbit" });
            }
          }}
          placeholder={placeholder}
          className="flex-1 h-10 rounded-xl border border-[#E9ECEF] px-3 text-sm outline-none focus:border-[#422AFB]"
        />
        <button
          type="button"
          onClick={() => draft.trim() && add({ name: draft.trim(), animal: "rabbit" })}
          disabled={!draft.trim()}
          className="px-3 h-10 rounded-xl bg-[#F4F7FE] text-[#422AFB] text-sm font-bold hover:bg-[#E9E3FF] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          添加
        </button>
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          <span className="text-[10px] text-[#A3AED0] self-center">建议:</span>
          {suggestions.slice(0, 5).map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => add(p)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border border-[#E9ECEF] text-[#707EAE] text-[11px] hover:border-[#422AFB] hover:text-[#422AFB]"
            >
              <I name="plus" size={10} />
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EditInterviewModal({ open, onClose, interview, onSave }) {
  const [round, setRound] = useState("一面");
  const [category, setCategory] = useState("技术");
  const [mode, setMode] = useState("线上");
  const [scheduledAt, setScheduledAt] = useState("");
  const [link, setLink] = useState("");
  const [managers, setManagers] = useState([]);
  const [interviewers, setInterviewers] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !interview) return;
    setRound(interview.round || "一面");
    setCategory(interview.category || "");
    setMode(interview.mode || "线上");
    // datetime-local needs "YYYY-MM-DDTHH:mm" format, strip Z and seconds
    if (interview.scheduledAt) {
      const d = new Date(interview.scheduledAt);
      const pad = (n) => String(n).padStart(2, "0");
      setScheduledAt(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    } else {
      setScheduledAt("");
    }
    setLink(interview.link || "");
    setManagers(interview.managers || []);
    setInterviewers(interview.interviewers || []);
  }, [open, interview]);

  async function submit() {
    setSaving(true);
    try {
      const patch = {
        round,
        category,
        mode,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        link: link.trim(),
        managers,
        interviewers,
      };
      // 生产代码请改成 await resources.interviews.update(candidate.id, interview.id, patch);
      onSave({ ...interview, ...patch });
      toast("面试已更新", "success");
      onClose();
    } catch (e) { toast(e.message || "保存失败", "error"); }
    finally { setSaving(false); }
  }

  if (!interview) return null;
  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-xl">
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-[#1B254B] flex items-center gap-2">
            <I name="calendar-check" size={18} className="text-[#422AFB]" />
            编辑面试
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-[#1B254B]"><I name="x" size={20} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-[#1B254B] font-bold ml-3 block mb-2">轮次</label>
            <select value={round} onChange={(e) => setRound(e.target.value)} className="w-full h-11 rounded-xl border border-[#E9ECEF] px-3 text-sm outline-none focus:border-[#422AFB] bg-white">
              {INTERVIEW_ROUNDS.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-[#1B254B] font-bold ml-3 block mb-2">类型</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full h-11 rounded-xl border border-[#E9ECEF] px-3 text-sm outline-none focus:border-[#422AFB] bg-white">
              <option value="">— 不限 —</option>
              {INTERVIEW_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-[#1B254B] font-bold ml-3 block mb-2">方式</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className="w-full h-11 rounded-xl border border-[#E9ECEF] px-3 text-sm outline-none focus:border-[#422AFB] bg-white">
              <option>线上</option><option>线下</option><option>电话</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-[#1B254B] font-bold ml-3 block mb-2">时间</label>
            <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="w-full h-11 rounded-xl border border-[#E9ECEF] px-3 text-sm outline-none focus:border-[#422AFB]" />
          </div>
          <div className="col-span-2">
            <label className="text-sm text-[#1B254B] font-bold ml-3 block mb-2">
              链接 / 地点 <span className="text-[10px] text-[#A3AED0] font-medium">· 可填 URL, 也可写"会议室 A / 总部 5F"等文字</span>
            </label>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://meet.example.com/... 或 上海办公室 5F 会议室 A"
              className="w-full h-11 rounded-xl border border-[#E9ECEF] px-3 text-sm outline-none focus:border-[#422AFB]"
            />
          </div>
          <div className="col-span-2">
            <PeopleChips label="HR" value={managers} onChange={setManagers} placeholder="输入 HR 名字, 回车添加" />
          </div>
          <div className="col-span-2">
            <PeopleChips label="面试官" value={interviewers} onChange={setInterviewers} placeholder="输入面试官名字, 回车添加" />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-[#E9ECEF]">
          <Button variant="ghost" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={submit} disabled={saving} icon={<I name={saving ? "loader" : "check"} size={12} className={saving ? "animate-spin" : ""} />}>
            {saving ? "保存中" : "保存"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// 按方式给「面试地点 / 链接 / 电话」字段切换 label + placeholder
const LINK_FIELD_BY_MODE = {
  "线下": { label: "面试地点", placeholder: "如 北京朝阳区望京 SOHO T3 12 层 1201", icon: "map-pin" },
  "视频": { label: "视频链接", placeholder: "如 https://meet.google.com/abc-defg-hij", icon: "video" },
  "电话": { label: "联系电话",  placeholder: "如 138 0000 0000",                            icon: "phone" },
};

function InterviewModal({ open, onClose, candidate, jobs, reviews, onCreated }) {
  const [jobId, setJobId] = useState("");
  const [round, setRound] = useState("一面");
  const [mode, setMode] = useState("线下");
  const [scheduledAt, setScheduledAt] = useState("");
  const [interviewer, setInterviewer] = useState("");
  const [link, setLink] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setJobId(candidate?.jobId || "");
    setScheduledAt(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
    setLink("");
    setInterviewer("");
    setMode("线下");
    setRound("一面");
  }, [open, candidate?.jobId]);

  // 从评论模块抽 unique authorName 做快捷选项 — 过滤空 / 公开「匿名」/ deleted
  const reviewAuthors = (() => {
    if (!Array.isArray(reviews)) return [];
    const set = new Set();
    for (const r of reviews) {
      if (r?.deletedAt) continue;
      const n = (r?.authorName || "").trim();
      if (n && n !== "匿名") set.add(n);
    }
    return Array.from(set).slice(0, 12);
  })();

  async function submit() {
    if (!scheduledAt) return toast("请选时间", "error");
    setSaving(true);
    try {
      const created = await resources.interviews.create({
        candidateId: candidate.id,
        jobId: jobId || null,
        round,
        mode,
        scheduledAt: new Date(scheduledAt).toISOString(),
        interviewer: interviewer || null,
        link: link.trim() || null,
      });
      toast("面试已安排", "success");
      onCreated?.(created);
      onClose();
    } catch (e) { toast(e.message || "保存失败", "error"); }
    finally { setSaving(false); }
  }

  const linkCfg = LINK_FIELD_BY_MODE[mode] || LINK_FIELD_BY_MODE["线下"];

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[#1B254B] flex items-center gap-2">
            <I name="calendar-plus" size={18} className="text-[#422AFB]" />
            安排面试 — {candidate?.name}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-[#1B254B]"><I name="x" size={20} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-sm text-[#1B254B] font-bold ml-3 block mb-2">关联岗位</label>
            <select value={jobId} onChange={(e) => setJobId(e.target.value)} className="w-full h-11 rounded-xl border border-[#E9ECEF] px-3 text-sm outline-none focus:border-[#422AFB] bg-white">
              <option value="">— 无 / 候选人简历推断岗位 —</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}{j.dept ? ` · ${j.dept}` : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-[#1B254B] font-bold ml-3 block mb-2">轮次</label>
            <select value={round} onChange={(e) => setRound(e.target.value)} className="w-full h-11 rounded-xl border border-[#E9ECEF] px-3 text-sm outline-none focus:border-[#422AFB] bg-white">
              {INTERVIEW_ROUNDS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-[#1B254B] font-bold ml-3 block mb-2">方式</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className="w-full h-11 rounded-xl border border-[#E9ECEF] px-3 text-sm outline-none focus:border-[#422AFB] bg-white">
              <option>线下</option><option>视频</option><option>电话</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-[#1B254B] font-bold ml-3 block mb-2">时间</label>
            <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="w-full h-11 rounded-xl border border-[#E9ECEF] px-3 text-sm outline-none focus:border-[#422AFB]" />
          </div>
          {/* 根据方式动态切换的输入框 (跨两列占满) */}
          <div className="col-span-2">
            <label className="text-sm text-[#1B254B] font-bold ml-3 block mb-2 flex items-center gap-1.5">
              <I name={linkCfg.icon} size={13} className="text-[#422AFB]" />
              {linkCfg.label}
            </label>
            <input
              type="text"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder={linkCfg.placeholder}
              className="w-full h-11 rounded-xl border border-[#E9ECEF] px-3 text-sm outline-none focus:border-[#422AFB]"
            />
          </div>
          <div className="col-span-2">
            <Input label="面试官" value={interviewer} onChange={(e) => setInterviewer(e.target.value)} placeholder="如 王浩 (多个面试官用逗号分隔)" />
            {/* 快捷选评论作者 */}
            {reviewAuthors.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-[#A3AED0]">从评论人快选:</span>
                {reviewAuthors.map((n) => {
                  const already = interviewer.split(/[,，]/).map((s) => s.trim()).includes(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        if (already) return;
                        setInterviewer(interviewer ? `${interviewer.replace(/[,，]\s*$/, "")}, ${n}` : n);
                      }}
                      disabled={already}
                      className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
                        already
                          ? "bg-[#E9E3FF] text-[#422AFB] border-[#422AFB]/40 cursor-default"
                          : "bg-white text-[#422AFB] border-[#422AFB]/40 hover:bg-[#E9E3FF]"
                      }`}
                    >
                      {already ? "✓ " : "+ "}{n}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
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


// 公开页可见性 toggle 子组件 — ShareModal「已有 link」和「无 link」两个分支共用
function ShareVisibilityToggles({ showContact, setShowContact, showResume, setShowResume, showNotes, setShowNotes, showReviews, setShowReviews, showAttachments, setShowAttachments, showInterviewEval, setShowInterviewEval, showInterviewEvalList, setShowInterviewEvalList }) {
  return (
    <div>
      <p className="text-xs font-bold text-[#707EAE] uppercase mb-2">公开页可见性</p>
      <div className="space-y-2">
        <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-[#E9ECEF] hover:border-[#422AFB]/40 cursor-pointer transition">
          <input
            type="checkbox"
            checked={!!showContact}
            onChange={(e) => setShowContact(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-[#A3AED0] text-[#422AFB] focus:ring-[#422AFB]"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-[#1B254B]">展示联系方式</p>
            <p className="text-[10px] text-[#A3AED0] mt-0.5">关闭后访客看不到 phone / email;开启则完整展示</p>
          </div>
        </label>
        <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-[#E9ECEF] hover:border-[#422AFB]/40 cursor-pointer transition">
          <input
            type="checkbox"
            checked={!!showResume}
            onChange={(e) => setShowResume(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-[#A3AED0] text-[#422AFB] focus:ring-[#422AFB]"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-[#1B254B]">查看原始简历</p>
            <p className="text-[10px] text-[#A3AED0] mt-0.5">关闭后访客无法查看/下载候选人原始简历文件</p>
          </div>
        </label>
        <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-[#E9ECEF] hover:border-[#422AFB]/40 cursor-pointer transition">
          <input
            type="checkbox"
            checked={!!showNotes}
            onChange={(e) => setShowNotes(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-[#A3AED0] text-[#422AFB] focus:ring-[#422AFB]"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-[#1B254B]">允许查看备注</p>
            <p className="text-[10px] text-[#A3AED0] mt-0.5">默认关闭。开启后分享页展示内部备注模块(洞察不受此控,始终展示)</p>
          </div>
        </label>
        <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-[#E9ECEF] hover:border-[#422AFB]/40 cursor-pointer transition">
          <input
            type="checkbox"
            checked={!!showReviews}
            onChange={(e) => setShowReviews(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-[#A3AED0] text-[#422AFB] focus:ring-[#422AFB]"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-[#1B254B]">显示评论/评价</p>
            <p className="text-[10px] text-[#A3AED0] mt-0.5">关闭后分享页不显示评价对话模块</p>
          </div>
        </label>
        <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-[#E9ECEF] hover:border-[#422AFB]/40 cursor-pointer transition">
          <input
            type="checkbox"
            checked={!!showAttachments}
            onChange={(e) => setShowAttachments(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-[#A3AED0] text-[#422AFB] focus:ring-[#422AFB]"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-[#1B254B]">允许访客上传评论附件</p>
            <p className="text-[10px] text-[#A3AED0] mt-0.5">关闭后评论表单不显示「附件」输入,后端二道防线也拒</p>
          </div>
        </label>
        <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-[#E9ECEF] hover:border-[#422AFB]/40 cursor-pointer transition">
          <input
            type="checkbox"
            checked={!!showInterviewEval}
            onChange={(e) => setShowInterviewEval(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-[#A3AED0] text-[#422AFB] focus:ring-[#422AFB]"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-[#1B254B]">支持填写面试评价</p>
            <p className="text-[10px] text-[#A3AED0] mt-0.5">开启后分享页显示「填写面试评价」按钮,访客提交后自动归档到该候选人的面试评价模块</p>
          </div>
        </label>
        <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-[#E9ECEF] hover:border-[#422AFB]/40 cursor-pointer transition">
          <input
            type="checkbox"
            checked={!!showInterviewEvalList}
            onChange={(e) => setShowInterviewEvalList(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-[#A3AED0] text-[#422AFB] focus:ring-[#422AFB]"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-[#1B254B]">展示已有面试评价</p>
            <p className="text-[10px] text-[#A3AED0] mt-0.5">默认关闭。开启后分享页列出该候选人已提交的面试评价,访客可点开查看详情</p>
          </div>
        </label>
      </div>
    </div>
  );
}

function ShareModal({ open, onClose, candidate }) {
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState("3d");
  const [custom, setCustom] = useState({ n: 7, unit: "d" });
  const [showCustom, setShowCustom] = useState(false);
  const [maxViewsPreset, setMaxViewsPreset] = useState("unlimited");
  const [customMaxViews, setCustomMaxViews] = useState(100);
  const [nowTick, setNowTick] = useState(Date.now());
  // 公开页可见性开关 — 默认: 联系方式露(mask), 评论附件关闭
  const [showContact, setShowContact] = useState(true);
  const [showResume, setShowResume] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [showReviews, setShowReviews] = useState(true);
  const [showAttachments, setShowAttachments] = useState(false);
  const [showInterviewEval, setShowInterviewEval] = useState(true);
  const [showInterviewEvalList, setShowInterviewEvalList] = useState(false);
  const [tab, setTab] = useState("share"); // "share" 本次分享 | "bot" 飞书 bot 自动分享设置

  useEffect(() => {
    if (!open || !candidate?.id) return;
    setLoading(true);
    resources.share.get(candidate.id).then((l) => {
      setLink(l);
      if (l) {
        if (l.maxViews == null) setMaxViewsPreset("unlimited");
        else if ([10, 50, 100].includes(l.maxViews)) setMaxViewsPreset(String(l.maxViews));
        else { setMaxViewsPreset("custom"); setCustomMaxViews(l.maxViews); }
        // sync toggle: 后端 default(true / false) 也覆盖
        setShowContact(l.showContact !== false);
        setShowResume(l.showResume !== false);
        setShowNotes(l.showNotes === true);
        // 评论:allowedModules 为空(全开)或含 candidate.reviews 即视为显示
        setShowReviews(!Array.isArray(l.allowedModules) || l.allowedModules.length === 0 || l.allowedModules.includes("candidate.reviews"));
        setShowAttachments(l.showAttachments === true);
        setShowInterviewEval(l.showInterviewEval !== false);
        setShowInterviewEvalList(l.showInterviewEvalList === true);
      } else {
        // 重置回默认值
        setShowContact(true);
        setShowResume(true);
        setShowNotes(false);
        setShowReviews(true);
        setShowAttachments(false);
        setShowInterviewEval(true);
        setShowInterviewEvalList(false);
      }
    }).catch(() => setLink(null)).finally(() => setLoading(false));
  }, [open, candidate?.id]);

  useEffect(() => {
    if (!open || !link?.expiresAt) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open, link?.expiresAt]);

  const PRESETS = [
    { v: "1d", l: "1 天" },
    { v: "3d", l: "3 天 (推荐)" },
    { v: "7d", l: "1 周" },
    { v: "30d", l: "1 个月" },
    { v: "forever", l: "无限期" },
  ];

  const effectiveDuration = () => showCustom ? `${custom.n}${custom.unit}` : duration;
  const effectiveMaxViews = () => {
    if (maxViewsPreset === "unlimited") return null;
    if (maxViewsPreset === "custom") return Math.max(1, Math.min(9999, customMaxViews | 0));
    return parseInt(maxViewsPreset, 10);
  };

  async function generate() {
    setLoading(true);
    try {
      const l = await resources.share.create(candidate.id, {
        duration: effectiveDuration(),
        maxViews: effectiveMaxViews(),
        showContact,
        showResume,
        showNotes,
        showReviews,
        showAttachments,
        showInterviewEval,
        showInterviewEvalList,
      });
      setLink(l);
      toast(link ? "已重新生成链接" : "已生成分享链接", "success");
    } catch (e) { toast(e.message || "生成失败", "error"); }
    finally { setLoading(false); }
  }

  async function changeDuration() {
    if (!link) return;
    setLoading(true);
    try {
      const l = await resources.share.update(candidate.id, {
        duration: effectiveDuration(),
        maxViews: effectiveMaxViews(),
        showContact,
        showResume,
        showNotes,
        showReviews,
        showAttachments,
        showInterviewEval,
        showInterviewEvalList,
      });
      setLink(l);
      toast("已修改配置", "success");
    } catch (e) { toast(e.message || "修改失败", "error"); }
    finally { setLoading(false); }
  }

  async function destroy() {
    if (!confirm("删除当前链接? 已分享的链接将立刻失效。")) return;
    setLoading(true);
    try {
      await resources.share.remove(candidate.id);
      setLink(null);
      toast("已删除", "success");
    } catch (e) { toast(e.message || "删除失败", "error"); }
    finally { setLoading(false); }
  }

  const publicUrl = link ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/${link.token}` : "";

  function copy() {
    navigator.clipboard?.writeText(publicUrl).then(() => toast("链接已复制到剪贴板", "success")).catch(() => toast("复制失败", "error"));
  }

  function fmtQuota() {
    if (!link || link.maxViews == null) return { text: `已访问 ${link?.viewCount ?? 0} 次 · 不限`, tone: "green", exceeded: false };
    const used = link.viewCount; const max = link.maxViews; const remaining = max - used;
    if (remaining <= 0) return { text: `已用完 (${used}/${max})`, tone: "red", exceeded: true };
    if (remaining <= Math.max(1, Math.floor(max * 0.2))) return { text: `剩余 ${remaining} 次 (${used}/${max})`, tone: "amber", exceeded: false };
    return { text: `${used}/${max} 次`, tone: "green", exceeded: false };
  }

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
          <h3 className="text-lg font-bold text-[#1B254B] flex items-center gap-2">
            <I name="share-2" size={18} className="text-[#422AFB]" />
            分享给招聘官 — {candidate?.name}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-[#1B254B]"><I name="x" size={20} /></button>
        </div>

        <div className="flex gap-2 mb-4 border-b border-[#E9ECEF]">
          {[["share", "本次分享"], ["bot", "飞书 Bot 自动分享"]].map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)}
              className={`px-3 py-2 text-sm font-bold border-b-2 -mb-px transition ${tab === v ? "border-[#422AFB] text-[#422AFB]" : "border-transparent text-[#A3AED0] hover:text-[#707EAE]"}`}>{l}</button>
          ))}
        </div>

        {tab === "bot" && <BotShareSettings open={open && tab === "bot"} />}

        {tab === "share" && (link ? (() => {
          const exp = fmtExpires(); const quota = fmtQuota();
          const worst = (a, b) => (a === "red" || b === "red") ? "red" : (a === "amber" || b === "amber") ? "amber" : "green";
          const tone = worst(exp.tone, quota.tone);
          const isBlocked = exp.expired || quota.exceeded;
          const wrap = tone === "red" ? "bg-red-50 border-red-200" : tone === "amber" ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-100";
          const head = tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-800" : "text-green-800";
          const headIcon = tone === "red" ? "alert-circle" : tone === "amber" ? "clock" : "check-circle-2";
          const expColor = exp.tone === "red" ? "text-red-700 font-bold" : exp.tone === "amber" ? "text-amber-700 font-bold" : "text-green-700 font-bold";
          const quotaColor = quota.tone === "red" ? "text-red-700 font-bold" : quota.tone === "amber" ? "text-amber-700 font-bold" : "text-[#707EAE]";
          return (
            <div className="space-y-4">
              <div className={`p-4 rounded-xl border ${wrap}`}>
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <p className={`text-xs font-bold flex items-center gap-1.5 ${head}`}>
                    <I name={headIcon} size={14} />
                    {exp.expired ? "链接已过期" : quota.exceeded ? "访问次数已达上限" : "当前分享链接"}
                  </p>
                  <div className="flex items-center gap-3 text-xs">
                    <span className={`flex items-center gap-1 ${expColor}`}>
                      <I name="hourglass" size={12} /> {exp.text}
                    </span>
                    <span className={`flex items-center gap-1 ${quotaColor}`}>
                      <I name="eye" size={12} /> {quota.text}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-white rounded-lg p-2">
                  <code className="flex-1 text-xs font-mono text-[#1B254B] truncate">{publicUrl}</code>
                  <Button size="sm" onClick={copy} icon={<I name="copy" size={12} />} disabled={isBlocked}>
                    复制
                  </Button>
                </div>
                <div className="flex items-center gap-4 mt-2 text-[11px] text-[#707EAE]">
                  <span className="flex items-center gap-1">
                    <I name="calendar" size={11} />
                    {link.expiresAt ? `到期 ${new Date(link.expiresAt).toLocaleString("zh-CN")}` : "永久有效"}
                  </span>
                  {link.maxViews != null && <span className="flex items-center gap-1"><I name="users" size={11} /> 上限 {link.maxViews} 次</span>}
                </div>
                {link.maxViews != null && (
                  <div className="mt-2 h-1.5 rounded-full bg-white/60 overflow-hidden">
                    <div
                      className={`h-full transition-all ${quota.tone === "red" ? "bg-red-500" : quota.tone === "amber" ? "bg-amber-500" : "bg-green-500"}`}
                      style={{ width: `${Math.min(100, (link.viewCount / link.maxViews) * 100)}%` }}
                    />
                  </div>
                )}
                {isBlocked && (
                  <p className="text-[11px] text-red-600 mt-2 flex items-start gap-1.5">
                    <I name="info" size={11} className="mt-0.5 shrink-0" />
                    {exp.expired ? "已过期 · " : ""}{quota.exceeded ? "访问次数已用完 · " : ""}
                    访问者打开链接会看到错误页。
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs font-bold text-[#707EAE] uppercase mb-2">修改有效期</p>
                  <DurationPicker {...{ duration, setDuration, custom, setCustom, showCustom, setShowCustom, PRESETS }} />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#707EAE] uppercase mb-2">访问次数限制</p>
                  <MaxViewsPicker {...{ maxViewsPreset, setMaxViewsPreset, customMaxViews, setCustomMaxViews }} />
                </div>
                <ShareVisibilityToggles {...{ showContact, setShowContact, showResume, setShowResume, showNotes, setShowNotes, showReviews, setShowReviews, showAttachments, setShowAttachments, showInterviewEval, setShowInterviewEval, showInterviewEvalList, setShowInterviewEvalList }} />
                <div className="flex gap-2 pt-2">
                  <Button variant="ghost" onClick={destroy} disabled={loading} icon={<I name="trash-2" size={12} />}>删除链接</Button>
                  <div className="flex-1" />
                  <Button variant="ghost" onClick={generate} disabled={loading} icon={<I name="rotate-ccw" size={12} />}>重新生成</Button>
                  <Button onClick={changeDuration} disabled={loading} icon={<I name={loading ? "loader" : "check"} size={12} className={loading ? "animate-spin" : ""} />}>
                    仅改配置
                  </Button>
                </div>
              </div>
            </div>
          );
        })() : loading ? (
          <div className="py-10 text-center text-[#707EAE] text-sm">
            <I name="loader" size={16} className="animate-spin inline mr-2" />加载中...
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-[#707EAE]">生成一个 <strong>公开链接</strong>(无须登录),只能看到这位候选人的简报,不暴露其他页面信息。链接过期或访问次数用完后立即失效。</p>
            <div>
              <p className="text-xs font-bold text-[#707EAE] uppercase mb-2">有效期</p>
              <DurationPicker {...{ duration, setDuration, custom, setCustom, showCustom, setShowCustom, PRESETS }} />
            </div>
            <div>
              <p className="text-xs font-bold text-[#707EAE] uppercase mb-2">访问次数限制</p>
              <MaxViewsPicker {...{ maxViewsPreset, setMaxViewsPreset, customMaxViews, setCustomMaxViews }} />
            </div>
            <ShareVisibilityToggles {...{ showContact, setShowContact, showResume, setShowResume, showNotes, setShowNotes, showReviews, setShowReviews, showAttachments, setShowAttachments, showInterviewEval, setShowInterviewEval, showInterviewEvalList, setShowInterviewEvalList }} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>取消</Button>
              <Button onClick={generate} disabled={loading} icon={<I name={loading ? "loader" : "share-2"} size={12} className={loading ? "animate-spin" : ""} />}>
                {loading ? "生成中" : "生成链接"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 8) 评论组件
// ─────────────────────────────────────────────────────────────────────────────

function VisibilityChip({ visibility }) {
  if (!visibility || visibility === "public") return null;
  const map = {
    internal: { label: "仅登录账号可见", icon: "lock", bg: "bg-blue-50", fg: "text-blue-700" },
    admin: { label: "仅管理员可见", icon: "shield", bg: "bg-purple-50", fg: "text-purple-700" },
  };
  const m = map[visibility];
  if (!m) return null;
  return (
    <span className={`ml-2 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${m.bg} ${m.fg}`}>
      <I name={m.icon} size={10} /> {m.label}
    </span>
  );
}

function VoteButton({ direction, review, candidate, active, onVote }) {
  const [open, setOpen] = useState(false);
  const [voters, setVoters] = useState(null);
  const [loading, setLoading] = useState(false);
  const isUp = direction === "up";
  const count = isUp ? (review.upvotes || 0) : (review.downvotes || 0);

  async function loadVoters() {
    if (voters || loading) return;
    setLoading(true);
    try {
      const d = await resources.reviews.voters(candidate.id, review.id);
      setVoters(d);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={onVote}
        onContextMenu={(e) => { e.preventDefault(); setOpen((v) => !v); loadVoters(); }}
        className={`px-2 py-0.5 rounded font-medium inline-flex items-center gap-1 transition
          ${active
            ? (isUp ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")
            : `text-[#707EAE] ${isUp ? "hover:bg-green-50 hover:text-green-700" : "hover:bg-red-50 hover:text-red-700"}`}`}
        title={`${isUp ? "赞同" : "否决"}(右键查看名单)`}
      >
        <I name={isUp ? "thumbs-up" : "thumbs-down"} size={11} />
        <span
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); loadVoters(); }}
          className="hover:underline"
        >
          {count}
        </span>
      </button>
      {open && count > 0 && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-40 bg-white rounded-xl shadow-[14px_17px_40px_4px_rgba(112,144,176,0.08)] p-3 min-w-[200px] max-w-[260px]">
            <p className={`text-[11px] font-bold mb-2 ${isUp ? "text-green-700" : "text-red-700"} flex items-center gap-1`}>
              <I name={isUp ? "thumbs-up" : "thumbs-down"} size={11} />
              {isUp ? "赞同" : "否决"}的人
            </p>
            {loading && <p className="text-xs text-[#707EAE] py-2">加载中...</p>}
            {!loading && voters && (
              <>
                {(isUp ? voters.up : voters.down).length === 0 && (isUp ? voters.anonymousUp : voters.anonymousDown) === 0 ? (
                  <p className="text-xs text-[#707EAE]">还没有人</p>
                ) : (
                  <ul className="space-y-1 max-h-[200px] overflow-y-auto">
                    {(isUp ? voters.up : voters.down).map((u, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-[#1B254B]">
                        <Avatar name={u.name} src={u.avatar} size={20} />
                        <span className="font-medium">{u.name}</span>
                        {u.role && <span className="text-[10px] text-[#707EAE]">{u.role}</span>}
                      </li>
                    ))}
                    {(isUp ? voters.anonymousUp : voters.anonymousDown) > 0 && (
                      <li className="text-xs text-[#707EAE] pt-1 border-t border-gray-100 mt-1">
                        + {(isUp ? voters.anonymousUp : voters.anonymousDown)} 位匿名访客
                      </li>
                    )}
                  </ul>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AttachmentChip({ a }) {
  const [downloading, setDownloading] = useState(false);
  async function open() {
    if (a.type === "link") {
      window.open(a.url, "_blank", "noopener,noreferrer");
      return;
    }
    setDownloading(true);
    try {
      const { data } = await api.post("/storage/signed-get-url", { key: a.url });
      window.open(data.url, "_blank");
    } catch (e) { toast("下载失败", "error"); }
    finally { setDownloading(false); }
  }
  const icon = a.type === "image" ? "image" : a.type === "link" ? "link" : "paperclip";
  const tone = a.type === "image" ? "bg-blue-50 text-blue-700" : a.type === "link" ? "bg-green-50 text-green-700" : "bg-gray-100 text-[#707EAE]";
  return (
    <button onClick={open} disabled={downloading} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium ${tone} hover:opacity-80 transition max-w-[180px]`}>
      <I name={downloading ? "loader" : icon} size={11} className={downloading ? "animate-spin shrink-0" : "shrink-0"} />
      <span className="truncate">{a.name}</span>
      {a.size != null && a.size > 0 && <span className="opacity-60 shrink-0">{(a.size / 1024).toFixed(0)}KB</span>}
    </button>
  );
}

function ReviewItem({ review, replies = [], candidate, me, isAdmin, myVotes = {}, onVote, onReply, updateReview, isReply = false, selectedIds = [], toggleSelect }) {
  const isMine = me?.id && review.userId === me.id;
  const canRequestDelete = !review.deletedAt && (isMine || isAdmin);
  const pendingDelete = !!review.deleteRequested && !review.deletedAt;

  async function requestDelete() {
    if (!confirm("请求删除这条评论?(删除需要管理员同意)")) return;
    try { const r = await resources.reviews.requestDelete(candidate.id, review.id); updateReview(r); toast("已请求,等管理员审核", "info"); }
    catch (e) { toast(e.message || "操作失败", "error"); }
  }
  async function approveDelete() {
    try { const r = await resources.reviews.approveDelete(candidate.id, review.id); updateReview(r); toast("已批准删除", "success"); }
    catch (e) { toast(e.message || "操作失败", "error"); }
  }
  async function rejectDelete() {
    try { const r = await resources.reviews.rejectDelete(candidate.id, review.id); updateReview(r); toast("已拒绝", "success"); }
    catch (e) { toast(e.message || "操作失败", "error"); }
  }
  async function adminDelete() {
    if (!confirm("直接删除这条评论?")) return;
    try { const r = await resources.reviews.adminDelete(candidate.id, review.id); updateReview(r); toast("已删除", "success"); }
    catch (e) { toast(e.message || "操作失败", "error"); }
  }
  async function toggleHide() {
    try {
      const r = review.hidden
        ? await resources.reviews.unhide(candidate.id, review.id)
        : await resources.reviews.hide(candidate.id, review.id);
      updateReview(r);
      toast(review.hidden ? "已取消隐藏" : "已隐藏(普通用户/公开访客看不到)", "success");
    } catch (e) { toast(e.message || "操作失败", "error"); }
  }

  const headerLeft = (
    <p className={`text-sm font-bold flex items-center gap-1 flex-wrap ${review.deletedAt ? "text-gray-500" : "text-[#1B254B]"}`}>
      <span>{review.authorName}</span>
      {review.authorRole && <span className="text-[10px] text-[#707EAE] font-medium ml-1">{review.authorRole}</span>}
      {review.via === "public" && (
        <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold">外部</span>
      )}
      {review.stance === "approve" && (
        <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 font-bold inline-flex items-center gap-1">
          <I name="thumbs-up" size={9} /> 赞同
        </span>
      )}
      {review.stance === "reject" && (
        <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 font-bold inline-flex items-center gap-1">
          <I name="thumbs-down" size={9} /> 否决
        </span>
      )}
      <VisibilityChip visibility={review.visibility} />
      {review.hidden && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-[#707EAE] font-bold">已隐藏</span>}
      {pendingDelete && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">待审核删除</span>}
    </p>
  );

  const isSelected = selectedIds.includes(review.id);
  const canSelect = !isReply && !review.deletedAt && toggleSelect;

  return (
    <li className={`group rounded-lg transition ${isSelected ? "bg-[#E9E3FF] -mx-2 px-2" : ""}`}>
      <div className="flex items-start gap-2">
        {canSelect && (
          <input
            type="checkbox" checked={isSelected} onChange={() => toggleSelect(review.id)}
            className="mt-2 w-3.5 h-3.5 accent-[#422AFB] cursor-pointer shrink-0" title="选中以批量回复"
          />
        )}
        <Avatar name={review.authorName} src={review.authorAvatar} size={isReply ? 28 : 32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {headerLeft}
            <span className="text-[11px] text-[#707EAE] flex items-center gap-1">
              <I name="clock" size={11} /> {fmtReviewTime(review.createdAt)}
            </span>
          </div>
          {!review.deletedAt && (review.referencedIds || []).length > 1 && (
            <p className="text-[10px] text-[#A3AED0] mt-0.5 flex items-center gap-1">
              <I name="quote" size={10} /> 引用 {review.referencedIds.length} 条评论
            </p>
          )}
          {review.deletedAt ? (
            <p className="text-sm text-gray-400 italic mt-1 line-through">[已删除]</p>
          ) : (
            <p className="text-sm text-[#1B254B] mt-1 whitespace-pre-wrap">{review.content}</p>
          )}
          {!review.deletedAt && (review.attachments || []).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {review.attachments.map((a, i) => <AttachmentChip key={i} a={a} candidate={candidate} />)}
            </div>
          )}
          {!review.deletedAt && (
            <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-gray-100 text-[11px] flex-wrap">
              {onVote && (
                <>
                  <VoteButton direction="up" review={review} candidate={candidate} active={myVotes[review.id] === 1} onVote={() => onVote(review.id, 1)} />
                  <VoteButton direction="down" review={review} candidate={candidate} active={myVotes[review.id] === -1} onVote={() => onVote(review.id, -1)} />
                  <span className="text-gray-300">·</span>
                </>
              )}
              {!isReply && (
                <button onClick={() => onReply(review)} className="text-[#422AFB] hover:bg-[#E9E3FF] px-2 py-0.5 rounded font-medium flex items-center gap-1">
                  <I name="reply" size={10} /> 回复
                </button>
              )}
              {pendingDelete && isAdmin && (
                <>
                  <button onClick={approveDelete} className="text-red-600 hover:bg-red-50 px-2 py-0.5 rounded font-medium">批准删除</button>
                  <button onClick={rejectDelete} className="text-[#707EAE] hover:bg-[#F4F7FE] px-2 py-0.5 rounded">拒绝</button>
                </>
              )}
              {!pendingDelete && canRequestDelete && !isAdmin && (
                <button onClick={requestDelete} className="text-[#707EAE] hover:text-red-500 hover:bg-red-50 px-2 py-0.5 rounded">请求删除</button>
              )}
              {isAdmin && !pendingDelete && (
                <button onClick={adminDelete} className="text-red-500 hover:bg-red-50 px-2 py-0.5 rounded">删除</button>
              )}
              {isAdmin && (
                <button onClick={toggleHide} className="text-[#707EAE] hover:bg-[#F4F7FE] px-2 py-0.5 rounded">
                  {review.hidden ? "取消隐藏" : "隐藏"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {replies.length > 0 && (
        <ul className="mt-3 ml-9 pl-3 border-l-2 border-gray-100 space-y-3">
          {replies.map((rp) => (
            <ReviewItem key={rp.id} review={rp} candidate={candidate} me={me} isAdmin={isAdmin} myVotes={myVotes} onVote={onVote} onReply={onReply} updateReview={updateReview} isReply />
          ))}
        </ul>
      )}
    </li>
  );
}

function ReviewsCard({ reviews, candidate, me, isAdmin, myVotes, onVote, onAdd, onReply, updateReview }) {
  const [sortMode, setSortMode] = useState("newest");
  const SORT_OPTIONS = [
    { v: "newest", l: "最新在前" },
    { v: "oldest", l: "最旧在前" },
    { v: "most_approved", l: "最赞同" },
    { v: "most_rejected", l: "最否决" },
  ];

  let tree = reviews.filter((r) => !r.parentId);
  tree = [...tree].sort((a, b) => {
    if (sortMode === "newest") return new Date(b.createdAt) - new Date(a.createdAt);
    if (sortMode === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
    if (sortMode === "most_approved") return (b.upvotes || 0) - (a.upvotes || 0) || new Date(b.createdAt) - new Date(a.createdAt);
    if (sortMode === "most_rejected") return (b.downvotes || 0) - (a.downvotes || 0) || new Date(b.createdAt) - new Date(a.createdAt);
    return 0;
  });
  const repliesByParent = {};
  reviews.filter((r) => r.parentId).forEach((r) => {
    (repliesByParent[r.parentId] = repliesByParent[r.parentId] || []).push(r);
  });
  Object.keys(repliesByParent).forEach((k) =>
    repliesByParent[k].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  );

  const visibleCount = reviews.filter((r) => !r.deletedAt).length;

  const [selectedIds, setSelectedIds] = useState([]);
  const toggleSelect = (id) => setSelectedIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const clearSelected = () => setSelectedIds([]);
  function bulkReply() {
    const targets = reviews.filter((r) => selectedIds.includes(r.id) && !r.deletedAt);
    if (targets.length === 0) return;
    onReply({ ...targets[0], _bulk: targets });
  }

  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xl font-bold text-[#1B254B] flex items-center gap-2">
          <I name="message-circle" size={18} className="text-[#422AFB]" />
          评论
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#422AFB] text-white font-bold">{visibleCount}</span>
        </h3>
        <select
          value={sortMode} onChange={(e) => setSortMode(e.target.value)}
          className="text-[11px] h-7 px-2 rounded-lg border border-[#E9ECEF] text-[#707EAE] outline-none focus:border-[#422AFB] bg-white"
          title="排序方式"
        >
          {SORT_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      </div>

      {tree.length === 0 ? (
        <p className="text-xs text-[#707EAE] py-2">还没有评论 · 点下方按钮添加第一条</p>
      ) : (
        <ul className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {tree.map((r) => (
            <ReviewItem
              key={r.id} review={r} replies={repliesByParent[r.id] || []}
              candidate={candidate} me={me} isAdmin={isAdmin}
              myVotes={myVotes} onVote={onVote} onReply={onReply} updateReview={updateReview}
              selectedIds={selectedIds} toggleSelect={toggleSelect}
            />
          ))}
        </ul>
      )}

      {selectedIds.length > 0 && (
        <div className="mt-3 p-2.5 rounded-xl bg-[#E9E3FF] border border-[#422AFB]/30 flex items-center gap-2">
          <span className="text-xs font-bold text-[#422AFB]">已选 {selectedIds.length} 条</span>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" onClick={clearSelected}>清空</Button>
          <Button size="sm" onClick={bulkReply} icon={<I name="reply" size={12} />}>批量回复</Button>
        </div>
      )}

      <button
        onClick={onAdd}
        className="mt-4 w-full p-3 rounded-xl bg-[#F4F7FE] hover:bg-[#E9E3FF] text-[#422AFB] font-bold text-sm flex items-center justify-center gap-2 transition border-2 border-dashed border-transparent hover:border-[#422AFB]/30"
      >
        <I name="message-square-plus" size={16} />
        添加评论
      </button>
    </Card>
  );
}

function ReviewModal({ open, onClose, candidate, replyTo, onCreated }) {
  const [content, setContent] = useState("");
  const [linkInput, setLinkInput] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [visibility, setVisibility] = useState("public");
  const [stance, setStance] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const isAdmin = (getUser()?.role) === "ADMIN";

  useEffect(() => {
    if (!open) {
      setContent(""); setLinkInput(""); setAttachments([]); setVisibility("public"); setStance(null);
    }
  }, [open]);

  const totalSize = attachments.reduce((s, a) => s + (a.size || 0), 0);
  const MAX_TOTAL = 30 * 1024 * 1024;

  async function uploadFile(file) {
    if (totalSize + file.size > MAX_TOTAL) {
      toast(`总附件大小将超过 30MB,无法添加`, "error");
      return;
    }
    setUploading(true);
    try {
      const isImage = (file.type || "").startsWith("image/");
      const { data: presign } = await api.post("/storage/presigned-url", {
        scope: "reviews",
        filename: file.name,
        contentType: file.type || "application/octet-stream",
      });
      // 直传 R2(后端只签 PUT URL,不经过后端流量)
      await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      setAttachments((prev) => [...prev, {
        type: isImage ? "image" : "file",
        name: file.name, url: presign.key, size: file.size, contentType: file.type,
      }]);
    } catch (e) { toast("上传失败", "error"); }
    finally { setUploading(false); }
  }

  function addLink() {
    const url = linkInput.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      toast("链接必须以 http:// 或 https:// 开头", "error");
      return;
    }
    setAttachments((p) => [...p, { type: "link", name: url, url, size: 0 }]);
    setLinkInput("");
  }

  function removeAttachment(idx) {
    setAttachments((p) => p.filter((_, i) => i !== idx));
  }

  const bulk = replyTo?._bulk;
  const isBulkReply = Array.isArray(bulk) && bulk.length > 1;

  async function submit() {
    if (!content.trim()) return toast("请输入评论内容", "error");
    setSaving(true);
    try {
      const body = { content: content.trim(), attachments, visibility };
      if (isBulkReply) {
        body.referencedIds = bulk.map((b) => b.id);
        body.parentId = bulk[0].id;
      } else if (replyTo?.id) {
        body.parentId = replyTo.id;
      }
      if (replyTo && stance) body.stance = stance;
      const r = await resources.reviews.create(candidate.id, body);
      onCreated(r);
      toast(replyTo ? "已回复" : "评论已添加", "success");
    } catch (e) { toast(e.message || "添加失败", "error"); }
    finally { setSaving(false); }
  }

  const VIS_OPTIONS = [
    { v: "public", label: "全员可见", desc: "登录账号 + 公开页访客都能看", icon: "globe" },
    { v: "internal", label: "仅登录账号可见", desc: "经分享链接访问的人看不到", icon: "lock" },
    ...(isAdmin ? [{ v: "admin", label: "仅管理员可见", desc: "其他登录账号也看不到", icon: "shield" }] : []),
  ];

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-xl">
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-[#1B254B] flex items-center gap-2">
            <I name={replyTo ? "reply" : "message-circle"} size={18} className="text-[#422AFB]" />
            {isBulkReply ? `批量回复 ${bulk.length} 条` : replyTo ? `回复 ${replyTo.authorName}` : `添加评论 — ${candidate?.name}`}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-[#1B254B]"><I name="x" size={20} /></button>
        </div>

        {replyTo && !isBulkReply && (
          <div className="p-3 rounded-xl bg-[#F4F7FE] border-l-4 border-[#422AFB]">
            <p className="text-[11px] font-bold text-[#707EAE]">引用 {replyTo.authorName} 的评论:</p>
            <p className="text-xs text-[#707EAE] mt-1 line-clamp-2">{replyTo.content}</p>
          </div>
        )}
        {isBulkReply && (
          <div className="p-3 rounded-xl bg-[#E9E3FF] border-l-4 border-[#422AFB] max-h-[180px] overflow-y-auto">
            <p className="text-[11px] font-bold text-[#707EAE] mb-2">批量引用 {bulk.length} 条评论:</p>
            <ul className="space-y-1.5">
              {bulk.map((r) => (
                <li key={r.id} className="text-xs">
                  <span className="font-bold text-[#1B254B]">{r.authorName}:</span>{" "}
                  <span className="text-[#707EAE]">{(r.content || "").slice(0, 80)}{r.content?.length > 80 ? "..." : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, 500))}
            rows={5}
            placeholder="请输入对此候选人的评论,如表现、推荐理由、建议等..."
            className="w-full p-3 rounded-xl border border-[#E9ECEF] text-sm text-[#1B254B] outline-none focus:border-[#422AFB] resize-none"
            disabled={saving}
          />
          <p className={`text-[11px] mt-1.5 ${content.length >= 500 ? "text-red-500" : "text-[#A3AED0]"}`}>
            {content.length} / 500 字符
          </p>
        </div>

        {replyTo && (
          <div>
            <p className="text-xs font-bold text-[#707EAE] uppercase mb-2 flex items-center gap-1.5">
              <I name="vote" size={12} /> 对原评论的态度 (可选)
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setStance(stance === "approve" ? null : "approve")}
                disabled={saving}
                className={`p-2.5 rounded-xl border-2 text-xs font-bold transition flex items-center justify-center gap-1.5
                  ${stance === "approve" ? "border-green-500 bg-green-50 text-green-700" : "border-[#E9ECEF] text-[#707EAE] hover:border-green-300"}`}
              >
                <I name="thumbs-up" size={12} /> 赞同
              </button>
              <button
                onClick={() => setStance(stance === "reject" ? null : "reject")}
                disabled={saving}
                className={`p-2.5 rounded-xl border-2 text-xs font-bold transition flex items-center justify-center gap-1.5
                  ${stance === "reject" ? "border-red-500 bg-red-50 text-red-700" : "border-[#E9ECEF] text-[#707EAE] hover:border-red-300"}`}
              >
                <I name="thumbs-down" size={12} /> 否决
              </button>
              <button
                onClick={() => setStance(null)}
                disabled={saving}
                className={`p-2.5 rounded-xl border-2 text-xs font-bold transition flex items-center justify-center gap-1.5
                  ${stance === null ? "border-[#422AFB] bg-[#E9E3FF] text-[#422AFB]" : "border-[#E9ECEF] text-[#707EAE] hover:border-[#CBD5E0]"}`}
              >
                <I name="minus" size={12} /> 不表态
              </button>
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-bold text-[#707EAE] uppercase mb-2 flex items-center gap-1.5">
            <I name="eye" size={12} /> 可见范围
          </p>
          <div className="space-y-1.5">
            {VIS_OPTIONS.map((o) => (
              <button
                key={o.v}
                onClick={() => setVisibility(o.v)}
                disabled={saving}
                className={`w-full text-left p-2.5 rounded-xl border-2 transition flex items-start gap-3
                  ${visibility === o.v ? "border-[#422AFB] bg-[#E9E3FF]" : "border-[#E9ECEF] hover:border-[#CBD5E0]"}`}
              >
                <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0
                  ${visibility === o.v ? "border-[#422AFB] bg-[#422AFB]" : "border-[#CBD5E0]"}`}>
                  {visibility === o.v && <span className="w-1.5 h-1.5 rounded-full bg-white"></span>}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[#1B254B] flex items-center gap-1.5">
                    <I name={o.icon} size={12} className="text-[#422AFB]" />
                    {o.label}
                  </p>
                  <p className="text-[11px] text-[#707EAE] mt-0.5">{o.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-[#707EAE] uppercase mb-2">附件(可选,总 ≤ 30MB)</p>
          {attachments.length > 0 && (
            <ul className="space-y-1.5 mb-2">
              {attachments.map((a, i) => (
                <li key={i} className="flex items-center gap-2 px-2.5 py-1.5 bg-[#F4F7FE] rounded-lg text-xs">
                  <I name={a.type === "image" ? "image" : a.type === "link" ? "link" : "paperclip"} size={12} className="text-[#707EAE] shrink-0" />
                  <span className="flex-1 truncate text-[#1B254B]">{a.name}</span>
                  <span className="text-[10px] text-[#A3AED0] shrink-0">{a.type === "link" ? "链接" : `${(a.size / 1024).toFixed(0)} KB`}</span>
                  <button onClick={() => removeAttachment(i)} className="text-red-500 hover:bg-red-50 w-5 h-5 rounded flex items-center justify-center">
                    <I name="x" size={11} />
                  </button>
                </li>
              ))}
              <li className="text-[11px] text-[#A3AED0] mt-1">总大小 {(totalSize / 1024 / 1024).toFixed(2)} / 30 MB</li>
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-dashed border-[#E9ECEF] hover:border-[#422AFB] text-xs font-bold text-[#707EAE]">
              <I name={uploading ? "loader" : "upload"} size={12} className={uploading ? "animate-spin" : ""} />
              {uploading ? "上传中" : "图片 / 文件"}
              <input
                type="file" className="hidden"
                accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt,image/*"
                disabled={uploading || saving}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }}
              />
            </label>
            <div className="flex-1 min-w-[200px] flex items-center gap-1.5 px-2 rounded-xl border border-[#E9ECEF] h-9 focus-within:border-[#422AFB]">
              <I name="link" size={12} className="text-gray-400 shrink-0" />
              <input
                type="url" value={linkInput} onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLink())}
                placeholder="粘贴 URL 链接,回车添加"
                className="flex-1 bg-transparent outline-none text-xs text-[#1B254B]"
                disabled={saving}
              />
              <button onClick={addLink} disabled={!linkInput.trim()} className="text-[10px] font-bold text-[#422AFB] hover:underline disabled:opacity-30 px-1">
                添加
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-[#E9ECEF]">
          <Button variant="ghost" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={submit} disabled={saving || !content.trim()} icon={<I name={saving ? "loader" : "check"} size={12} className={saving ? "animate-spin" : ""} />}>
            {saving ? "保存中" : "发布评论"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 8.5) 新布局辅助组件
// ─────────────────────────────────────────────────────────────────────────────

function IconBtn({ icon, title, onClick, tone = "default" }) {
  const styles = tone === "danger"
    ? "text-red-500 hover:bg-red-50 border-red-100"
    : "text-[#422AFB] hover:bg-[#E9E3FF] border-[#E9ECEF]";
  return (
    <button onClick={onClick} title={title} className={`w-9 h-9 rounded-full border bg-white inline-flex items-center justify-center transition ${styles}`}>
      <I name={icon} size={15} />
    </button>
  );
}

function DetailRow({ label, value, expandable = false, defaultExpanded = false, children, last = false }) {
  const [open, setOpen] = useState(Boolean(defaultExpanded));
  const isExpandable = Boolean(expandable && children);
  return (
    <div className={`${last ? "" : "border-b border-[#E9ECEF]"}`}>
      <div
        className={`flex items-center gap-3 px-5 py-3 ${isExpandable ? "cursor-pointer hover:bg-[#FAFBFD] select-none" : ""}`}
        onClick={isExpandable ? () => setOpen(v => !v) : undefined}
        role={isExpandable ? "button" : undefined}
        aria-expanded={isExpandable ? open : undefined}
      >
        <p className="text-xs text-[#707EAE] font-medium w-20 shrink-0">{label}</p>
        <p className="text-xs text-[#1B254B] flex-1 min-w-0 truncate">{value || "—"}</p>
        {isExpandable && (
          <I
            name="chevron-down"
            size={14}
            className={`text-[#A3AED0] shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </div>
      {isExpandable && open && (
        <div className="px-5 pb-3 pt-0.5">{children}</div>
      )}
    </div>
  );
}

function DocChip({ label, tone = "primary", onClick }) {
  const cls = tone === "danger"
    ? "border-red-300 text-red-600 hover:bg-red-50"
    : tone === "muted"
      ? "border-[#E9ECEF] text-[#707EAE] hover:bg-[#F4F7FE]"
      : "border-[#422AFB]/40 text-[#422AFB] hover:bg-[#E9E3FF]";
  return (
    <button onClick={onClick} className={`px-3.5 h-9 rounded-lg border-2 font-bold text-xs transition ${cls}`}>
      {label}
    </button>
  );
}

const DOC_CATEGORIES = [
  { key: "resume", label: "简历", icon: "file-text" },
  { key: "materials", label: "个人材料", icon: "folder" },
  { key: "portfolio", label: "作品集", icon: "image" },
];

function DocItemRow({ item, onChange, onDelete, onDownload, selected, onToggleSelect, categoryLabel }) {
  const [editingName, setEditingName] = useState(false);
  const [editingContent, setEditingContent] = useState(false);
  const [draft, setDraft] = useState("");

  // _readonly = 虚拟项(如 LLM 上传的原始简历自动同步到「简历」分类),禁止改名/删除,只能下载
  const readonly = !!item._readonly;
  const displayName = item.kind === "file" ? item.name : item.label;

  function commit(field, next) {
    onChange({ ...item, [field]: next });
    if (field === "name" || field === "label") setEditingName(false);
    if (field === "content" || field === "url") setEditingContent(false);
  }

  return (
    <li className="group flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-[#F4F7FE] transition">
      {/* checkbox: 仅文件类可勾选下载,其他 kind 用占位保持对齐 */}
      <div className="w-4 shrink-0 mt-1.5">
        {item.kind === "file" && onToggleSelect && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={onToggleSelect}
            className="w-4 h-4 rounded border-[#A3AED0] text-[#422AFB] focus:ring-[#422AFB] cursor-pointer"
            aria-label={`选中 ${displayName}`}
          />
        )}
      </div>
      <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
        item.kind === "file" ? "bg-[#E9E3FF] text-[#422AFB]" :
        item.kind === "link" ? "bg-blue-50 text-blue-600" :
        "bg-amber-50 text-amber-700"
      }`}>
        <I name={item.kind === "file" ? "file" : item.kind === "link" ? "link" : "sticky-note"} size={14} />
      </div>
      <div className="flex-1 min-w-0">
        {/* Name / label row */}
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          {editingName ? (
            <input
              autoFocus
              defaultValue={displayName}
              onBlur={(e) => commit(item.kind === "file" ? "name" : "label", e.target.value.trim() || displayName)}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditingName(false); }}
              className="flex-1 min-w-0 h-6 px-1.5 -my-0.5 rounded-md border border-[#422AFB] text-xs text-[#1B254B] outline-none bg-white"
            />
          ) : item.kind === "link" && item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#422AFB] hover:underline truncate min-w-0" title={item.url}>
              {displayName}
            </a>
          ) : (
            <span className="text-xs font-bold text-[#1B254B] truncate min-w-0">{displayName}</span>
          )}
          {categoryLabel && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#F4F7FE] text-[#707EAE] font-bold shrink-0">{categoryLabel}</span>
          )}
          {item.kind === "file" && item.size && (
            <span className="text-[10px] text-[#A3AED0] shrink-0">{item.size}</span>
          )}
          {readonly && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#E9E3FF] text-[#422AFB] font-bold shrink-0" title="LLM 解析时上传的原始简历">原始</span>
          )}
        </div>
        {/* Subtitle: url for links, content for notes */}
        {item.kind === "link" && !editingContent && (
          <p className="text-[10px] text-[#A3AED0] mt-0.5 truncate">{item.url}</p>
        )}
        {item.kind === "note" && !editingContent && (
          <p className="text-[11px] text-[#707EAE] mt-1 leading-relaxed whitespace-pre-wrap">{item.content}</p>
        )}
        {editingContent && (
          <textarea
            autoFocus
            rows={item.kind === "note" ? 3 : 1}
            defaultValue={item.kind === "link" ? item.url : item.content}
            onBlur={(e) => commit(item.kind === "link" ? "url" : "content", e.target.value.trim())}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (item.kind === "link" || e.metaKey || e.ctrlKey)) e.currentTarget.blur();
              if (e.key === "Escape") setEditingContent(false);
            }}
            className="w-full mt-1 px-2 py-1 rounded-md border border-[#422AFB] text-[11px] text-[#1B254B] outline-none bg-white resize-none"
          />
        )}
      </div>
      {/* Action row, visible on hover */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
        {!readonly && (
          <button onClick={() => setEditingName(true)} className="w-6 h-6 rounded hover:bg-white text-[#707EAE] hover:text-[#422AFB] flex items-center justify-center" title="重命名">
            <I name="pencil" size={11} />
          </button>
        )}
        {!readonly && (item.kind === "link" || item.kind === "note") && (
          <button onClick={() => setEditingContent(true)} className="w-6 h-6 rounded hover:bg-white text-[#707EAE] hover:text-[#422AFB] flex items-center justify-center" title={item.kind === "link" ? "编辑链接" : "编辑文字"}>
            <I name="edit-3" size={11} />
          </button>
        )}
        {item.kind === "file" && (
          <button
            onClick={() => {
              if (item._sourceKey && onDownload) onDownload(item._sourceKey, item.name);
              else toast("(mock) 下载 " + item.name, "info");
            }}
            className="w-6 h-6 rounded hover:bg-white text-[#707EAE] hover:text-[#422AFB] flex items-center justify-center"
            title={item._sourceKey ? "在新标签打开" : "下载"}
          >
            <I name={item._sourceKey ? "external-link" : "download"} size={11} />
          </button>
        )}
        {item.kind === "link" && (
          <button onClick={() => { navigator.clipboard?.writeText(item.url || ""); toast("链接已复制", "success"); }} className="w-6 h-6 rounded hover:bg-white text-[#707EAE] hover:text-[#422AFB] flex items-center justify-center" title="复制链接">
            <I name="copy" size={11} />
          </button>
        )}
        {!readonly && (
          <button onClick={() => onDelete(item.id)} className="w-6 h-6 rounded hover:bg-white text-[#707EAE] hover:text-red-500 flex items-center justify-center" title="删除">
            <I name="trash-2" size={11} />
          </button>
        )}
      </div>
    </li>
  );
}

function DocsModule({ documents, onChange, onDownload }) {
  const fileInputRef = React.useRef(null);
  const [selected, setSelected] = useState(() => new Set());
  // 新增项默认归类:中性的「个人材料」,避免覆盖「简历」的语义独立性
  const DEFAULT_NEW_CATEGORY = "materials";

  // 把分桶的 documents flatten 成单一列表,标 _category 以便回写时找回原桶
  const flatItems = useMemo(() => {
    return DOC_CATEGORIES.flatMap(cat =>
      (Array.isArray(documents[cat.key]) ? documents[cat.key] : []).map(it => ({
        ...it,
        _category: cat.key,
        _categoryLabel: cat.label,
      })),
    );
  }, [documents]);

  const fileItems = flatItems.filter(it => it.kind === "file");
  const fileIds = fileItems.map(it => it.id);
  const allSelected = fileIds.length > 0 && fileIds.every(id => selected.has(id));
  const someSelected = !allSelected && fileIds.some(id => selected.has(id));
  const selectedCount = fileIds.filter(id => selected.has(id)).length;

  // 把回写到父的 item 剥掉视图层注入字段
  function stripMeta(it) {
    const { _category, _categoryLabel, ...rest } = it;
    return rest;
  }

  function applyToCategory(cat, mutator) {
    const current = Array.isArray(documents[cat]) ? documents[cat] : [];
    onChange({ ...documents, [cat]: mutator(current) });
  }

  function updateItem(updated) {
    const cat = updated._category;
    if (!cat) return;
    applyToCategory(cat, list => list.map(it => it.id === updated.id ? stripMeta(updated) : it));
  }
  function deleteItem(item) {
    if (!confirm("确定删除该项?")) return;
    applyToCategory(item._category, list => list.filter(it => it.id !== item.id));
    setSelected(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    toast("已删除", "success");
  }

  function appendNewItem(newItem) {
    applyToCategory(DEFAULT_NEW_CATEGORY, list => [...list, newItem]);
  }

  function uploadFile() { fileInputRef.current?.click(); }
  function onFilePicked(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const size = file.size > 1024 * 1024
      ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(file.size / 1024))} KB`;
    appendNewItem({ id: `doc-${Date.now()}`, kind: "file", name: file.name, size, verified: false, url: "#" });
    toast(`已上传 ${file.name}`, "success");
    e.target.value = "";
  }
  function addLink() {
    appendNewItem({ id: `doc-${Date.now()}`, kind: "link", label: "新链接", url: "", verified: false });
  }
  function addNote() {
    appendNewItem({ id: `doc-${Date.now()}`, kind: "note", label: "新说明", content: "", verified: false });
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(fileIds));
  }

  // 顺序触发下载(并发开多个 tab 会被浏览器拦截),有 _sourceKey 走 signed-get-url,其他 mock
  async function downloadList(items) {
    if (items.length === 0) {
      toast("没有可下载的文件", "error");
      return;
    }
    for (const it of items) {
      if (it._sourceKey && onDownload) {
        await onDownload(it._sourceKey, it.name);
      } else {
        toast("(mock) 下载 " + it.name, "info");
      }
      await new Promise(r => setTimeout(r, 200));
    }
  }
  function downloadSelected() {
    downloadList(fileItems.filter(it => selected.has(it.id)));
  }
  function downloadAll() {
    downloadList(fileItems);
  }

  // 全选 checkbox 的 indeterminate 状态:有选但未全选
  const selectAllRef = React.useRef(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3 gap-3">
        <h3 className="font-bold text-[#1B254B] flex items-center gap-2 text-sm">
          <I name="folder" size={16} className="text-[#422AFB]" />
          附件
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#F4F7FE] text-[#707EAE] font-bold">{flatItems.length}</span>
        </h3>
        {fileIds.length > 0 && (
          <label className="inline-flex items-center gap-1.5 text-[11px] text-[#707EAE] font-bold cursor-pointer select-none">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-[#A3AED0] text-[#422AFB] focus:ring-[#422AFB] cursor-pointer"
              aria-label="全选文件"
            />
            全选
          </label>
        )}
      </div>

      {/* Items list */}
      <div>
        {flatItems.length === 0 ? (
          <p className="text-[11px] text-[#A3AED0] py-4 text-center bg-[#F4F7FE] rounded-lg">暂无附件</p>
        ) : (
          <ul className="space-y-1 -mx-2">
            {flatItems.map(it => (
              <DocItemRow
                key={`${it._category}:${it.id}`}
                item={it}
                onChange={updateItem}
                onDelete={() => deleteItem(it)}
                onDownload={onDownload}
                selected={selected.has(it.id)}
                onToggleSelect={() => toggleSelect(it.id)}
                categoryLabel={it._categoryLabel}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Add actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <button onClick={uploadFile} className="inline-flex items-center gap-1 px-2.5 h-7 rounded-md text-[11px] font-bold text-[#422AFB] hover:bg-[#E9E3FF] border border-dashed border-[#422AFB]/40 transition">
          <I name="upload" size={11} /> 上传文件
        </button>
        <button onClick={addLink} className="inline-flex items-center gap-1 px-2.5 h-7 rounded-md text-[11px] font-bold text-[#422AFB] hover:bg-[#E9E3FF] border border-dashed border-[#422AFB]/40 transition">
          <I name="link" size={11} /> 添加链接
        </button>
        <button onClick={addNote} className="inline-flex items-center gap-1 px-2.5 h-7 rounded-md text-[11px] font-bold text-[#422AFB] hover:bg-[#E9E3FF] border border-dashed border-[#422AFB]/40 transition">
          <I name="sticky-note" size={11} /> 添加文字
        </button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={onFilePicked} />
      </div>

      {/* Footer: 下载选中 + 下载全部 */}
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[#E9ECEF]">
        <div className="flex-1" />
        <button
          onClick={downloadSelected}
          disabled={selectedCount === 0}
          className="text-[11px] font-bold text-[#422AFB] hover:underline flex items-center gap-1 disabled:text-[#A3AED0] disabled:no-underline disabled:cursor-not-allowed"
        >
          <I name="download" size={11} /> 下载选中{selectedCount > 0 ? `(${selectedCount})` : ""}
        </button>
        <button
          onClick={downloadAll}
          disabled={fileItems.length === 0}
          className="text-[11px] font-bold text-[#422AFB] hover:underline flex items-center gap-1 disabled:text-[#A3AED0] disabled:no-underline disabled:cursor-not-allowed"
        >
          <I name="download-cloud" size={11} /> 下载全部
        </button>
      </div>
    </Card>
  );
}

function OverviewTile({ icon, label, value, sub }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-[#E9ECEF] hover:border-[#422AFB]/40 transition">
      <div className="w-10 h-10 rounded-lg bg-[#E9E3FF] flex items-center justify-center shrink-0">
        <I name={icon} size={18} className="text-[#422AFB]" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-[#1B254B] truncate">{value}</p>
        <p className="text-[10px] text-[#707EAE] uppercase tracking-wide">{label}</p>
        {sub && <p className="text-[10px] text-[#A3AED0] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function RobotMascot() {
  // 装饰用的渐变机器人小图标 — 仅 svg + lucide bot
  return (
    <div className="relative w-full h-full flex items-center justify-end pr-4 pt-4">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#868CFF] via-[#432CF3] to-[#422AFB] blur-2xl opacity-30" />
        <div className="relative w-20 h-20 rounded-2xl flex items-center justify-center text-white" style={{ background: "linear-gradient(135deg, #868CFF 0%, #432CF3 50%, #422AFB 100%)" }}>
          <I name="bot" size={42} strokeWidth={1.6} />
        </div>
      </div>
    </div>
  );
}

function FeedbackHistoryCard({ notes, onDelete, onAdd, insights }) {
  const [tab, setTab] = useState("insights");
  const safeNotes = Array.isArray(notes) ? notes : [];
  const safeInsights = Array.isArray(insights) ? insights : [];
  return (
    <Card className="p-5">
      <div className="flex items-center gap-4 border-b border-[#E9ECEF] -mx-5 px-5 pb-2 mb-3">
        {[{ v: "insights", l: "洞察" }, { v: "feedback", l: "备注" }].map(t => {
          const active = tab === t.v;
          return (
            <button
              key={t.v}
              onClick={() => setTab(t.v)}
              className={`relative pb-2 text-sm transition ${active ? "text-[#422AFB] font-bold" : "text-[#707EAE] font-medium hover:text-[#1B254B]"}`}
            >
              {t.l}
              {active && <span className="absolute left-0 right-0 -bottom-[3px] h-[3px] rounded-full bg-[#422AFB]" />}
            </button>
          );
        })}
        {tab === "feedback" && onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="ml-auto -mt-1 w-7 h-7 rounded-full text-white flex items-center justify-center shadow hover:scale-105 active:scale-95 transition"
            style={{ background: "linear-gradient(135deg, #868CFF 0%, #432CF3 50%, #422AFB 100%)" }}
            aria-label="添加备注"
            title="添加备注"
          >
            <I name="plus" size={14} />
          </button>
        )}
      </div>
      {tab === "feedback" ? (
        safeNotes.length === 0 ? (
          <button
            type="button"
            onClick={onAdd}
            disabled={!onAdd}
            className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-[#422AFB]/30 text-[#422AFB] hover:bg-[#E9E3FF]/40 hover:border-[#422AFB]/60 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <I name="plus" size={18} />
            <span className="text-xs font-bold">新增备忘</span>
            <span className="text-[10px] text-[#A3AED0] font-medium">点击新增第一条备注</span>
          </button>
        ) : (
          <ul className="space-y-3">
            {safeNotes.map((n) => (
              <li key={n.id} className="flex gap-3 p-3 rounded-xl bg-[#F4F7FE] group">
                <div
                  className="w-8 h-8 rounded-full text-white flex items-center justify-center shrink-0 text-xs font-bold"
                  style={{ background: "linear-gradient(135deg, #868CFF 0%, #432CF3 50%, #422AFB 100%)" }}
                >
                  {(n.authorName || "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-[#707EAE] truncate">
                      <span className="font-bold text-[#1B254B]">{n.authorName || "匿名"}</span>
                      <span className="ml-1">· {new Date(n.createdAt).toLocaleString("zh-CN")}</span>
                    </p>
                    {onDelete && (
                      <button
                        onClick={() => onDelete(n)}
                        className="opacity-0 group-hover:opacity-100 transition text-red-500 hover:bg-red-50 w-6 h-6 rounded flex items-center justify-center shrink-0"
                        aria-label="删除备注"
                      >
                        <I name="trash-2" size={12} />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-[#1B254B] mt-1 whitespace-pre-wrap leading-relaxed break-words">{n.content}</p>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : (
        safeInsights.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <I name="sparkles" size={18} className="text-[#A3AED0]" />
            <p className="text-xs font-bold text-[#707EAE]">待 AI 解析</p>
            <p className="text-[10px] text-[#A3AED0]">切换 / 匹配 JD 后自动生成洞察</p>
          </div>
        ) : (
          <ul className="space-y-2.5 text-xs text-[#707EAE]">
            {safeInsights.map((it, i) => (
              <li key={i} className="flex items-start gap-2">
                <I
                  name={it.kind === "down" ? "trending-down" : "trending-up"}
                  size={14}
                  className={`mt-0.5 shrink-0 ${it.kind === "down" ? "text-amber-500" : "text-green-500"}`}
                />
                {it.text}
              </li>
            ))}
          </ul>
        )
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 9) 主组件 — 候选人详情页
// ─────────────────────────────────────────────────────────────────────────────

const SOURCE_OPTIONS = ["BOSS 直聘", "拉勾", "智联招聘", "猎聘", "LinkedIn", "脉脉", "51job", "内推", "主动投递", "校招", "其他"];

function InlineSource({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = React.useRef(null);

  useEffect(() => {
    if (editing) {
      setDraft(value || "");
      setShowDropdown(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editing, value]);

  function commit(next) {
    const v = (next ?? draft).trim();
    if (v && v !== value) onChange(v);
    setEditing(false);
    setShowDropdown(false);
  }
  function cancel() {
    setEditing(false);
    setShowDropdown(false);
    setDraft(value || "");
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="truncate text-left hover:text-[#422AFB] hover:underline decoration-dotted underline-offset-2 transition cursor-pointer"
        title="点击修改来源"
      >
        {value || "—"}
      </button>
    );
  }

  const filtered = SOURCE_OPTIONS.filter(o => !draft || o.includes(draft));

  return (
    <span className="relative inline-block min-w-0 flex-1">
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setShowDropdown(true); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { e.preventDefault(); cancel(); }
        }}
        onBlur={() => setTimeout(commit, 120)}
        placeholder="例: BOSS 直聘 / 内推 / LinkedIn"
        className="w-full h-6 px-1.5 -my-0.5 rounded-md border border-[#422AFB] text-[11px] text-[#1B254B] outline-none bg-white"
      />
      {showDropdown && filtered.length > 0 && (
        <div className="absolute z-40 top-full left-0 mt-1 w-[180px] max-h-48 overflow-y-auto bg-white rounded-lg shadow-[14px_17px_40px_4px_rgba(112,144,176,0.18)] p-1">
          {filtered.map(o => (
            <button
              key={o}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); commit(o); }}
              className={`w-full text-left px-2 py-1.5 rounded text-[11px] hover:bg-[#F4F7FE] ${o === value ? "bg-[#F4F7FE] font-bold text-[#422AFB]" : "text-[#1B254B]"}`}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function TagsModule({ tags, suggestions, onChange }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingIdx, setEditingIdx] = useState(-1);
  const [aiOpen, setAiOpen] = useState(false);

  function addTag(v) {
    const t = (v ?? draft).trim();
    if (!t) { setAdding(false); setDraft(""); return; }
    if (tags.includes(t)) { toast("标签已存在", "error"); return; }
    onChange([...tags, t]);
    setDraft("");
    setAdding(false);
  }
  function removeTag(idx) {
    onChange(tags.filter((_, i) => i !== idx));
  }
  function editTag(idx, next) {
    const t = next.trim();
    if (!t) { removeTag(idx); return; }
    if (tags.includes(t) && tags[idx] !== t) { toast("已存在同名标签", "error"); setEditingIdx(-1); return; }
    onChange(tags.map((x, i) => i === idx ? t : x));
    setEditingIdx(-1);
  }

  const availableSuggestions = (suggestions || []).filter(s => !tags.includes(s));

  return (
    <div className="mt-3 pt-3 border-t border-[#E9ECEF]">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-wide font-bold text-[#A3AED0]">标签</p>
        <div className="relative">
          <button
            type="button"
            onClick={() => setAiOpen(v => !v)}
            disabled={availableSuggestions.length === 0}
            className="inline-flex items-center gap-1 px-2 h-6 rounded-full text-[10px] font-bold text-[#422AFB] hover:bg-[#E9E3FF] border border-[#422AFB]/30 disabled:opacity-40 disabled:cursor-not-allowed transition"
            title="AI 建议标签"
          >
            <I name="sparkles" size={10} /> AI 建议 {availableSuggestions.length > 0 && `(${availableSuggestions.length})`}
          </button>
          {aiOpen && availableSuggestions.length > 0 && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setAiOpen(false)} />
              <div className="absolute z-40 top-full right-0 mt-1 w-[240px] bg-white rounded-xl shadow-[14px_17px_40px_4px_rgba(112,144,176,0.18)] p-2">
                <p className="text-[10px] text-[#A3AED0] mb-1.5 px-1">点击采纳 · 基于简历自动生成</p>
                <div className="flex flex-wrap gap-1.5">
                  {availableSuggestions.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { onChange([...tags, s]); }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#F4F7FE] text-[#422AFB] text-[11px] hover:bg-[#E9E3FF] transition"
                    >
                      <I name="plus" size={10} /> {s}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t, i) => (
          <span key={i} className="group inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-[#F4F7FE] text-[#1B254B] text-[11px]">
            {editingIdx === i ? (
              <input
                autoFocus
                defaultValue={t}
                onBlur={(e) => editTag(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") setEditingIdx(-1);
                }}
                className="h-5 px-1 rounded border border-[#422AFB] text-[11px] text-[#1B254B] outline-none bg-white max-w-[120px]"
              />
            ) : (
              <button type="button" onClick={() => setEditingIdx(i)} className="hover:text-[#422AFB] transition" title="点击编辑">{t}</button>
            )}
            <button
              type="button"
              onClick={() => removeTag(i)}
              className="w-4 h-4 rounded-full hover:bg-white text-[#A3AED0] hover:text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
              aria-label={`删除 ${t}`}
            >
              <I name="x" size={10} />
            </button>
          </span>
        ))}
        {adding ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => addTag()}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault(), addTag();
              if (e.key === "Escape") { setAdding(false); setDraft(""); }
            }}
            placeholder="标签"
            className="h-6 px-2 rounded-full border border-[#422AFB] text-[11px] text-[#1B254B] outline-none bg-white max-w-[100px]"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] text-[#422AFB] border border-dashed border-[#422AFB]/40 hover:bg-[#E9E3FF] transition"
          >
            <I name="plus" size={10} /> 添加
          </button>
        )}
      </div>
    </div>
  );
}

function CandidateDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  // 模块权限 — 没权限的入口按钮直接隐藏(后端也会拒)
  const canShare = useHasModule("candidate.share");
  const canDelete = useHasModule("candidate.delete");
  const canEdit = useHasModule("candidate.edit");
  const [c, setC] = useState(null);
  const [err, setErr] = useState("");
  const [jobs, setJobs] = useState([]);
  const [matchingJobId, setMatchingJobId] = useState("");
  const [matching, setMatching] = useState(false);
  const [notes, setNotes] = useState([]);
  const [noteOpen, setNoteOpen] = useState(false);
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [editingInterview, setEditingInterview] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [jdPickerOpen, setJdPickerOpen] = useState(false);
  const [jdDescOpen, setJdDescOpen] = useState(false);
  const [pendingJobId, setPendingJobId] = useState(""); // ⬅ 切 JD 确认流
  const [reviews, setReviews] = useState([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [myVotes, setMyVotes] = useState({});

  const me = getUser() || { id: null, name: "未知用户", role: "VIEWER" };
  const isAdmin = me?.role === "ADMIN";

  async function load() {
    try { setC(await resources.candidates.detail(id)); }
    catch (e) { setErr(e.response?.data?.message || e.message); }
  }

  useEffect(() => {
    // 切候选人时立刻清空所有与「上个候选人」绑定的 state,
    // 避免在新 detail/reviews/notes 拉回来之前一闪而过显示旧候选人的内容
    setC(null);
    setErr("");
    setNotes([]);
    setReviews([]);
    setMyVotes({});
    setMatchingJobId("");
    setStatusOpen(false);
    setJdPickerOpen(false);
    setJdDescOpen(false);
    setPendingJobId("");
    setEditingInterview(null);
    setReplyTo(null);
    load();
    resources.jobs.list({ take: 200 }).then((d) => setJobs(d.items || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!c?.id) return;
    resources.notes.list(c.id).then(setNotes).catch(() => {});
    resources.reviews.list(c.id).then(setReviews).catch(() => {});
    resources.reviews.myVotes(c.id).then(setMyVotes).catch(() => {});
  }, [c?.id]);

  async function vote(reviewId, value) {
    const prev = myVotes[reviewId] || 0;
    const nextValue = prev === value ? 0 : value;
    try {
      const { review, myVote } = await resources.reviews.vote(c.id, reviewId, nextValue);
      setReviews((p) => p.map((r) => r.id === review.id ? { ...r, upvotes: review.upvotes, downvotes: review.downvotes } : r));
      setMyVotes((p) => {
        const next = { ...p };
        if (myVote === 0) delete next[reviewId];
        else next[reviewId] = myVote;
        return next;
      });
    } catch (e) { toast(e.message || "投票失败", "error"); }
  }

  async function switchJob(id) {
    // 用户在 picker / select 里选了一个目标 JD —— 不直接发请求,先弹确认窗
    setJdPickerOpen(false);
    if (!id || !c || id === c.jobId) return;
    setPendingJobId(id);
  }

  // 重新解析(异步): POST /resumes/parse {candidateId, jobId} 立即拿 taskId,
  // 轮询 GET /parse-tasks/:taskId 直到 done/failed。绕过 Cloudflare 100s 硬上限,
  // Kimi 跑多久都没事(单次轮询 < 100ms)。
  // 入口走 ReparseConfirmModal,让用户先确认/修改投递岗位再开跑。
  const [reparsing, setReparsing] = useState(false);
  const [reparseOpen, setReparseOpen] = useState(false);

  function openReparse() {
    if (!c?.id) return;
    if (!c.attachment) return toast("候选人无简历附件,无法重新解析", "error");
    setReparseOpen(true);
  }

  // jobId: uuid = 切换到该 JD; null = 取消 JD 关联(只刷简历字段)
  async function doReparse(jobId) {
    if (!c?.id) return;
    setReparsing(true);
    try {
      // 1) 立即 POST 拿 taskId(透传 jobId 给后端决定是否跑 match)
      const { data: { task: initialTask } } = await api.post("/resumes/parse", { candidateId: c.id, jobId });
      // 2) 轮询(每 2s 一次,最长 5 分钟)
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
        toast(`重新解析超时(>5 分钟未完成,task ${taskId.slice(0, 8)})`, "error");
        return;
      }
      if (finalTask.status === "done") {
        setC(finalTask.candidate);
        setReparseOpen(false);
        toast(`✓ 已重新解析: ${finalTask.candidate.name}${finalTask.match ? ` · JD 匹配度 ${finalTask.candidate.jdMatch ?? "—"}` : ""}`, "success");
      } else {
        // failed — 完整错误信息复制到剪贴板 + console.error 完整 task 便于排查
        reportReparseError(finalTask, c?.name);
      }
    } catch (e) {
      console.error("[reparse] axios failed", e);
      reportAxiosError(e, c?.name);
    } finally {
      setReparsing(false);
    }
  }

  // 失败信息无处可贴的问题:full task 信息塞剪贴板 + console.error 全文 + toast 提示已复制
  function reportReparseError(task, candidateName) {
    const err = task.error || {};
    const full = JSON.stringify({
      candidate: candidateName,
      taskId: task.id,
      startedAt: task.startedAt,
      finishedAt: task.finishedAt,
      statusCode: err.statusCode,
      errorCode: err.code,
      message: err.message,
    }, null, 2);
    console.error("[reparse] task failed", task);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(full).catch(() => {});
    }
    toast(`重新解析失败 · ${err.code || "error"} · 完整错误已复制到剪贴板,直接粘贴`, "error");
  }
  function reportAxiosError(e, candidateName) {
    const r = e.response;
    const full = JSON.stringify({
      candidate: candidateName,
      status: r?.status,
      url: r?.config?.url,
      data: r?.data,
      message: e.message,
    }, null, 2);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(full).catch(() => {});
    }
    toast(`重新解析失败 · ${r?.data?.error || e.message?.slice(0, 40)} · 完整错误已复制到剪贴板`, "error");
  }

  async function confirmSwitchJob() {
    const id = pendingJobId;
    if (!id || !c) { setPendingJobId(""); return; }
    setMatchingJobId(id);
    setMatching(true);
    setPendingJobId("");
    try {
      const { data } = await api.post("/resumes/match", { candidateId: c.id, jobId: id }, { timeout: LONG_TIMEOUT });
      setC({ ...data.candidate, jobId: id });
      // 评估完顺手把 jobId 持久化(忽略失败,不阻塞 UI)
      api.patch(`/candidates/${c.id}`, { jobId: id }).catch(() => {});
      toast(`已切换 JD + 重新评估 (匹配度 ${data.candidate.jdMatch ?? "—"})`, "success");
    } catch (err) { toast(err.message || "评估失败", "error"); }
    finally { setMatching(false); }
  }

  async function changeStatus(newStatus) {
    setStatusOpen(false);
    if (!c || newStatus === c.status) return;
    try {
      const updated = await resources.candidates.update(c.id, { status: newStatus });
      setC(updated);
      toast(`状态改为 ${newStatus}`, "success");
    } catch (e) { toast(e.message || "更新失败", "error"); }
  }

  // 标签增删改 — 乐观更新本地 + 持久化到后端(只动 tags,失败回滚),切页/刷新不丢
  async function changeTags(next) {
    if (!c) return;
    const prevTags = c.tags || [];
    setC((cur) => (cur ? { ...cur, tags: next } : cur));
    try {
      await resources.candidates.update(c.id, { tags: next });
    } catch (e) {
      setC((cur) => (cur ? { ...cur, tags: prevTags } : cur));
      toast(e.response?.data?.message || e.message || "标签保存失败", "error");
    }
  }

  async function runJdMatch() {
    if (!matchingJobId || !c?.id) return toast("请选 JD", "error");
    setMatching(true);
    try {
      const { data } = await api.post("/resumes/match", { candidateId: c.id, jobId: matchingJobId }, { timeout: LONG_TIMEOUT });
      setC({ ...data.candidate, jobId: matchingJobId });
      api.patch(`/candidates/${c.id}`, { jobId: matchingJobId }).catch(() => {});
      toast(`✓ 评估完成: JD 匹配度 ${data.candidate.jdMatch ?? "—"}`, "success");
    } catch (e) { toast(e.message || "评估失败", "error"); }
    finally { setMatching(false); }
  }

  // 用 R2 key 拿短时效签名 URL,新 tab 打开预览(PDF/图片浏览器内置,doc/docx 触发下载)。
  // 复用任意 R2 key 的简历/附件下载,不只限原始简历。
  async function openR2Object(key, fallbackLabel) {
    if (!key) return toast("无可预览文件", "error");
    try {
      const { data } = await api.post("/storage/signed-get-url", { key });
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast(e.response?.data?.message || `预览 ${fallbackLabel || ""} 失败`, "error");
    }
  }

  if (err) return <Card className="p-6 text-red-500 text-sm">{err}</Card>;
  if (!c) return <LoadingBlock label="加载候选人..." height="h-64" />;

  async function pushNextStatus() {
    const idx = STATUS_ORDER.indexOf(c.status);
    const next = STATUS_ORDER[Math.min(idx + 1, STATUS_ORDER.length - 1)];
    if (!next || next === c.status) return toast("已是最后阶段", "info");
    try {
      const updated = await resources.candidates.update(c.id, { status: next });
      setC(updated);
      toast(`状态已推进到 ${next}`, "success");
    } catch (e) { toast(e.message || "更新失败", "error"); }
  }

  async function onDelete() {
    if (!confirm(`确定删除 ${c.name} 吗?`)) return;
    try { await resources.candidates.remove(c.id); toast("已删除", "success"); }
    catch (e) { toast(e.message, "error"); }
  }

  return (
    <>
    <div className="mb-4">
      <Link
        to="/candidates"
        className="text-sm text-[#422AFB] hover:underline inline-flex items-center gap-1"
      >
        <I name="arrow-left" size={14} />
        返回候选人列表
      </Link>
    </div>
    <div className="flex flex-col xl:flex-row gap-4 xl:gap-5 items-start">

      {/* ╔═══ LEFT COLUMN: Profile · Details · Documents ═══╗ */}
      {/* 手机端用 display:contents 把本列「拍平」成父 flex 的直接子项,使「面试/评价/附件」块
          能用 order-last 排到全页最底;桌面 xl:block 还原为原来的左侧 sticky 列 */}
      <aside className="contents xl:block w-full xl:w-[360px] 2xl:w-[380px] xl:shrink-0 xl:space-y-4 xl:sticky xl:top-4 xl:self-start xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pr-1 xl:-mr-1">

        {/* === Profile Card === */}
        <Card className="w-full xl:w-auto p-4 md:p-5">
          {/* 重新解析 banner — 仅在 parser 为空(LLM 上传时降级入库)且有附件时显示 */}
          {!c.parser && c.attachment && (
            <div className="mb-3 -mt-1 rounded-xl bg-amber-50 border border-amber-200 p-2.5 flex items-start gap-2">
              <I name="alert-triangle" size={13} className="text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-amber-900">未 AI 解析</p>
                <p className="text-[10px] text-amber-700 mt-0.5 truncate" title={c.attachment}>简历附件已存档,但结构化字段未抽取</p>
              </div>
              <button
                onClick={openReparse}
                disabled={reparsing}
                className="text-[11px] font-bold text-amber-800 hover:underline whitespace-nowrap disabled:opacity-50 inline-flex items-center gap-1"
              >
                <I name={reparsing ? "loader" : "sparkles"} size={11} className={reparsing ? "animate-spin" : ""} />
                {reparsing ? "解析中..." : "重新解析"}
              </button>
            </div>
          )}
          <div className="flex items-start gap-3.5">
            <Avatar name={c.name} animal={c.animal} src={c.avatar} size={64} />
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-[#1B254B] truncate">{c.name}</h1>
              <p className="text-[11px] text-[#707EAE] mt-1 flex items-center gap-1"><I name="phone" size={11} className="shrink-0" /> {c.phone || "—"}</p>
              <p className="text-[11px] text-[#707EAE] mt-0.5 flex items-center gap-1"><I name="map-pin" size={11} className="shrink-0" /> {c.location || "—"}</p>
              <p className="text-[11px] text-[#707EAE] mt-0.5 flex items-center gap-1 truncate">
                <I name="link" size={11} className="shrink-0" />
                <span className="text-[#A3AED0]">来源</span>
                <InlineSource value={c.source} onChange={(v) => setC(prev => prev ? { ...prev, source: v } : prev)} />
              </p>
              <div className="flex gap-1.5 mt-2">
                <IconBtn icon="mail" title="发邮件 / 复制邮箱" onClick={() => { navigator.clipboard?.writeText(c.email || ""); toast("已复制邮箱", "success"); }} />
                <IconBtn icon="copy" title="复制基本信息" onClick={() => { navigator.clipboard?.writeText(`${c.name} ${c.phone} ${c.email}`); toast("已复制基本信息", "success"); }} />
              </div>
            </div>
          </div>

          {/* Profile completion */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] text-[#707EAE] mb-1.5">
              <span>资料完整度</span>
              <span className="font-bold text-[#422AFB]">{c.profileCompletion || 80}%</span>
            </div>
            <div className="relative h-1.5 rounded-full bg-[#F4F7FE] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${c.profileCompletion || 80}%`, background: "linear-gradient(90deg, #868CFF 0%, #422AFB 100%)" }} />
            </div>
          </div>

          {/* Tags (manual + AI suggested) */}
          <TagsModule
            tags={c.tags || []}
            suggestions={c.aiSuggestedTags || []}
            onChange={changeTags}
          />

          {/* What matched / What against + Score ring */}
          <div className="mt-4 flex items-start gap-3">
            <div className="flex-1 space-y-3 text-[11px]">
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-green-50 flex items-center justify-center shrink-0 mt-0.5">
                  <I name="check" size={11} className="text-green-600" strokeWidth={3} />
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-[#1B254B]">匹配项</p>
                  <p className="text-[#707EAE] mt-0.5">{(c.matchedFor || []).join("、") || "—"}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-red-50 flex items-center justify-center shrink-0 mt-0.5">
                  <I name="x" size={11} className="text-red-500" strokeWidth={3} />
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-[#1B254B]">不匹配项</p>
                  <p className="text-[#707EAE] mt-0.5">{(c.againstFor || []).join("、") || "—"}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center shrink-0">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setJdPickerOpen(v => !v)}
                  disabled={matching}
                  className="group relative block focus:outline-none"
                  aria-haspopup="listbox"
                  aria-expanded={jdPickerOpen}
                >
                  <LiquidLoader
                    size={56}
                    level={matching ? 52 : (c.jdMatch ?? 0)}
                    label={matching ? "—" : (c.jdMatch ?? "—")}
                    loading={matching}
                  />
                  <span className="absolute inset-0 rounded-full ring-2 ring-transparent group-hover:ring-[#422AFB]/30 group-focus-visible:ring-[#422AFB] transition" />
                </button>
                {jdPickerOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setJdPickerOpen(false)} />
                    <div
                      className="absolute z-40 top-full left-1/2 -translate-x-1/2 mt-2 w-[240px] bg-white rounded-xl shadow-[14px_17px_40px_4px_rgba(112,144,176,0.18)] p-1.5"
                      role="listbox"
                    >
                      <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[#A3AED0]">选择/切换 JD</p>
                      {jobs.length === 0 ? (
                        <p className="px-3 py-3 text-xs text-[#A3AED0]">暂无可用岗位</p>
                      ) : jobs.map(j => {
                        const active = j.id === c.jobId;
                        return (
                          <button
                            key={j.id}
                            role="option"
                            aria-selected={active}
                            onClick={() => switchJob(j.id)}
                            disabled={matching}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-start gap-2 hover:bg-[#F4F7FE] ${active ? "bg-[#F4F7FE]" : ""}`}
                          >
                            <span className="flex-1 min-w-0">
                              <span className={`block truncate ${active ? "font-bold text-[#1B254B]" : "text-[#1B254B]"}`}>{j.title}</span>
                              {j.dept && <span className="block text-[10px] text-[#A3AED0] mt-0.5 truncate">{j.dept}</span>}
                            </span>
                            {active && <I name="check" size={14} className="text-[#422AFB] mt-1 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
              <p className="text-[10px] text-[#707EAE] text-center mt-1.5 leading-tight w-[72px]">JD 匹配度</p>
            </div>
          </div>
        </Card>

        {/* 手机端这组(面试安排 / 面试评价 / 附件)用 order-last 排到全页最底;桌面 xl:order-none 还原 */}
        <div className="w-full xl:w-auto space-y-4 order-last xl:order-none">

        {/* === Interviews (moved from middle column · 迭代 12) === */}
        <Card className="p-5">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h3 className="text-sm font-bold text-[#1B254B] flex items-center gap-2">
              <I name="calendar-check" size={16} className="text-[#422AFB]" />
              面试安排
            </h3>
            <p className="text-[10px] text-[#707EAE]">演示管理员 · {fmtDate(c.pushedAt)}</p>
          </div>
          {(c.interviews || []).length === 0 ? (
            <div className="rounded-xl bg-[#F4F7FE] py-6 text-center">
              <I name="calendar-x" size={24} className="text-[#A0AEC0] mx-auto mb-2" />
              <p className="text-xs text-[#707EAE]">还没有面试安排</p>
              <button onClick={() => setInterviewOpen(true)} className="mt-2 text-xs text-[#422AFB] font-bold hover:underline">+ 安排第一轮面试</button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {c.interviews.map((iv, idx) => (
                <div key={idx}>
                  <div className="rounded-xl bg-[#F4F7FE] p-3">
                    <p className="text-sm font-bold text-[#1B254B] flex items-center gap-2 flex-wrap">
                      {iv.round}{iv.category ? ` · ${iv.category}` : ""}
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">{iv.mode}</span>
                    </p>
                    <p className="text-[11px] text-[#707EAE] mt-1.5 flex items-center gap-1.5">
                      <I name="clock" size={11} className="shrink-0" />
                      {new Date(iv.scheduledAt).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                    <p className="text-[11px] text-[#707EAE] mt-1 flex items-center gap-1 min-w-0">
                      <I name="video" size={11} className="shrink-0" />
                      {iv.link
                        ? (/^https?:\/\//.test(iv.link)
                            ? <a href={iv.link} target="_blank" rel="noreferrer" className="text-[#422AFB] hover:underline truncate flex-1 min-w-0">{iv.link}</a>
                            : <span className="text-[#1B254B] truncate flex-1 min-w-0">{iv.link}</span>)
                        : <span className="text-[#A3AED0]">待填写</span>}
                    </p>
                    <div className="grid grid-cols-2 gap-3 mt-2.5">
                      <div className="min-w-0">
                        <p className="text-[10px] text-[#A3AED0] uppercase mb-1 tracking-wide">HR</p>
                        <div className="flex flex-wrap gap-1.5">
                          {iv.managers.map((p, j) => (
                            <div key={j} className="inline-flex items-center gap-1 bg-white rounded-full pl-0.5 pr-2 py-0.5 max-w-full">
                              <Avatar name={p.name} animal={p.animal} size={20} />
                              <span className="text-[11px] text-[#1B254B] font-medium truncate" title={p.name}>{p.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-[#A3AED0] uppercase mb-1 tracking-wide">面试官</p>
                        <div className="flex flex-wrap gap-1.5">
                          {iv.interviewers.map((p, j) => (
                            <div key={j} className="inline-flex items-center gap-1 bg-white rounded-full pl-0.5 pr-2 py-0.5 max-w-full">
                              <Avatar name={p.name} animal={p.animal} size={20} />
                              <span className="text-[11px] text-[#1B254B] font-medium truncate" title={p.name}>{p.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center mt-2 pt-2 border-t border-[#E9ECEF]">
                    <div className="flex-1" />
                    <button onClick={() => setEditingInterview(iv)} className="text-[11px] text-[#422AFB] font-bold hover:underline">编辑面试</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* === 面试评价 (新增, 嵌入「面试安排」与「附件」之间) === */}
        <InterviewEvalCard candidate={c} currentUser={me} />

        {/* === Documents ===
            把 c.attachment(LLM 解析时上传的原始简历 R2 key)虚拟同步到「简历」分类首位,
            标 _readonly + _sourceKey,下载点击走 openR2Object(signed-get-url)。
            onChange 写回 DB 时剥掉虚拟项,避免污染 documents JSON 列。 */}
        {(() => {
          const baseDocs = c.documents || { resume: [], materials: [], portfolio: [] };
          const baseResume = Array.isArray(baseDocs.resume) ? baseDocs.resume : [];
          const alreadyIn = baseResume.some(it => it && it._sourceKey === c.attachment);
          const virtualResume = c.attachment && !alreadyIn
            ? [{
                id: `original:${c.attachment}`,
                kind: "file",
                name: c.attachment.split("/").pop() || "原始简历",
                verified: true,
                _sourceKey: c.attachment,
                _readonly: true,
              }]
            : [];
          const merged = { ...baseDocs, resume: [...virtualResume, ...baseResume] };
          return (
            <DocsModule
              documents={merged}
              onDownload={openR2Object}
              onChange={(next) => setC(prev => {
                if (!prev) return prev;
                const cleanedResume = (next.resume || []).filter(it => !it?._readonly);
                return { ...prev, documents: { ...next, resume: cleanedResume } };
              })}
            />
          );
        })()}
        </div>
      </aside>

      {/* ╔═══ MIDDLE COLUMN: Stage controls + AI + Interview + Job overview + 经历 / 项目 / 教育 / 备注 ═══╗ */}
      <div className="flex-1 min-w-0 space-y-4 xl:sticky xl:top-4 xl:self-start xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pr-1 xl:-mr-1">

        {/* === Top control row: stage + view CTC + job === */}
        <Card className="px-4 md:px-5 py-3">
          <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-3 md:gap-5">
            <div className="flex items-center gap-2 w-full md:w-auto">
              <span className="text-xs text-[#707EAE] font-medium whitespace-nowrap">当前阶段</span>
              <div className="relative flex-1 md:flex-none">
                <button onClick={() => setStatusOpen(v => !v)} className="w-full md:w-auto inline-flex items-center justify-between md:justify-start gap-2 px-3 h-9 rounded-xl bg-white border border-[#E9ECEF] text-sm text-[#1B254B] font-bold hover:border-[#422AFB] transition">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_TONE[c.status]?.dot }} />
                  {c.status}
                  <I name="chevron-down" size={12} />
                </button>
                {statusOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setStatusOpen(false)} />
                    <div className="absolute top-full left-0 mt-1 z-40 bg-white rounded-xl shadow-[14px_17px_40px_4px_rgba(112,144,176,0.08)] p-1.5 min-w-[160px]">
                      {STATUS_ORDER.map(s => (
                        <button
                          key={s}
                          onClick={() => changeStatus(s)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-[#F4F7FE] ${s === c.status ? "bg-[#F4F7FE] font-bold" : ""}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_TONE[s]?.dot }} />
                          {s}
                          {s === c.status && <I name="check" size={14} className="ml-auto text-[#422AFB]" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="hidden md:block md:flex-1" />
            <div className="flex items-center gap-2 w-full md:w-auto">
              <span className="text-xs text-[#707EAE] font-medium whitespace-nowrap">岗位</span>
              <select
                value={c.jobId || ""}
                disabled={matching}
                onChange={(e) => switchJob(e.target.value)}
                className="flex-1 md:flex-none w-full md:w-auto h-9 px-3 pr-7 rounded-xl bg-white border border-[#E9ECEF] text-sm text-[#1B254B] font-bold hover:border-[#422AFB] outline-none cursor-pointer"
              >
                {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
              {matching && <I name="loader" size={14} className="animate-spin text-[#422AFB]" />}
            </div>
          </div>

          {/* Stage tabs + progress — 7 tab 等宽两端对齐,进度条填到 active tab 中心 */}
          {(() => {
            const idx = STATUS_ORDER.indexOf(c.status);
            const rejected = c.status === "已淘汰";
            // 进度条对齐到当前 tab 中心: 每个 tab 占 1/7 宽度,中心 = (idx + 0.5)/7
            const percent = idx < 0 ? 0 : ((idx + 0.5) / STATUS_ORDER.length) * 100;
            return (
              <div className="-mx-4 md:-mx-5 mt-3 px-4 md:px-5 border-t border-[#E9ECEF]">
                {/* 进度轨 — 正向阶段填充品牌渐变,「已淘汰」红色 */}
                <div className="h-1.5 mt-3 mb-2 bg-[#F4F7FE] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${percent}%`,
                      background: rejected
                        ? "#FB6056"
                        : "linear-gradient(90deg, #868CFF 0%, #432CF3 60%, #422AFB 100%)",
                    }}
                  />
                </div>
                <div className="flex w-full -mb-px">
                  {STATUS_ORDER.map((s, i) => {
                    const active = s === c.status;
                    const isReject = s === "已淘汰";
                    const passed = !rejected && !isReject && i < idx;
                    const colorCls = active
                      ? (isReject ? "text-[#FB6056] font-bold" : "text-[#422AFB] font-bold")
                      : passed
                        ? "text-[#1B254B] font-medium"
                        : "text-[#707EAE] hover:text-[#1B254B] font-medium";
                    return (
                      <button
                        key={s}
                        onClick={() => changeStatus(s)}
                        className={`relative flex-1 py-3 text-sm text-center transition whitespace-nowrap ${colorCls}`}
                      >
                        {s}
                        {active && (
                          <span
                            className="absolute left-1/2 -translate-x-1/2 -bottom-px h-[3px] w-10 rounded-full"
                            style={{ background: isReject ? "#FB6056" : "#422AFB" }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </Card>

        {/* === Action buttons === */}
        {/* 手机:2 列网格(主操作 + 删除各占整行,无右侧空隙);桌面:flex 一行 + 右推删除 */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          {canEdit && <Button className="col-span-2 sm:col-auto" onClick={pushNextStatus} icon={<I name="zap" size={14} />}>推进到下一阶段</Button>}
          <Button variant="ghost" onClick={() => setJdDescOpen(true)} icon={<I name="file-text" size={14} />}>JD 描述</Button>
          {canShare && (
            <Button variant="ghost" onClick={() => setShareOpen(true)} icon={<I name="share-2" size={14} />}>分享</Button>
          )}
          <div className="hidden sm:block sm:flex-1" />
          {canDelete && (
            <Button variant="danger" className="col-span-2 sm:col-auto" onClick={onDelete} icon={<I name="trash-2" size={14} />}>删除候选人</Button>
          )}
        </div>

        {/* === AI Summary === */}
        {c.aiSummary && (
          <Card className="p-5 md:p-6 relative overflow-hidden border-2 border-[#422AFB]/15">
            <div className="relative">
              <h3 className="text-base font-bold text-[#1B254B] flex items-center gap-2">
                <I name="sparkles" size={16} className="text-[#422AFB]" />
                AI 简历简报
              </h3>
              <pre className="whitespace-pre-wrap text-xs font-mono text-[#1B254B] mt-3 leading-relaxed max-h-56 overflow-y-auto pr-2">{c.aiSummary}</pre>
            </div>
            <div className="relative flex items-center gap-3 mt-3 pt-3 border-t border-[#E9ECEF]">
              <button
                onClick={() => openR2Object(c.attachment, "原始简历")}
                disabled={!c.attachment}
                className="text-[#422AFB] text-xs font-bold hover:underline flex items-center gap-1 disabled:text-[#A3AED0] disabled:no-underline disabled:cursor-not-allowed"
                title={c.attachment ? "在新标签打开" : "候选人无原始简历"}
              >
                <I name="file-text" size={12} /> 查看原始简历
              </button>
              <div className="flex-1" />
              <Button size="sm" onClick={runJdMatch} disabled={matching} icon={<I name={matching ? "loader" : "sparkles"} size={12} className={matching ? "animate-spin" : ""} />}>
                {matching ? "重评中" : "重新生成"}
              </Button>
            </div>
          </Card>
        )}

        {/* === Interviews moved to left aside (above Documents) === */}

        {/* === Job Overview === */}
        {(() => {
          const job = jobs.find(j => j.id === c.jobId);
          return (
            <Card className="p-5 md:p-6">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="text-base font-bold text-[#1B254B] flex items-center gap-2">
                  <I name="briefcase" size={16} className="text-[#422AFB]" />
                  岗位概览
                  {job && <span className="text-[11px] text-[#707EAE] font-medium">· {job.title}</span>}
                </h3>
                <div className="flex items-center gap-3 text-[11px] text-[#707EAE]">
                  <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-bold">招聘中</span>
                  <span>创建于 {fmtDate(c.pushedAt)}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <OverviewTile icon="briefcase" label="经验" value={candidateExpText(c.yearsExp, hasWorkExperience(c.experience), { full: false }) || "—"} sub="JD 要求 5-7 年" />
                <OverviewTile icon="graduation-cap" label="学历" value={c.education || "—"} sub="JD 要求 本科+" />
                <OverviewTile
                  icon="languages"
                  label="语言要求"
                  value={(c.languages || []).map(l => l.name).join(" · ") || "—"}
                  sub={(() => {
                    const job = jobs.find(j => j.id === c.jobId);
                    return job?.languageRequirement ? `JD 要求 ${job.languageRequirement}` : "JD 未指定";
                  })()}
                />
              </div>

              {/* JD 技能 / 经验 / 素质要求 */}
              {((job?.requirements?.length || 0) > 0 || (job?.nice?.length || 0) > 0) && (
                <div className="mt-4 pt-4 border-t border-[#E9ECEF]">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                    {Array.isArray(job.requirements) && job.requirements.length > 0 && (
                      <div>
                        <h4 className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0] flex items-center gap-1.5 mb-2">
                          <I name="check-circle-2" size={12} className="text-[#422AFB]" />
                          技能 / 经验 / 素质要求
                        </h4>
                        <ul className="space-y-1.5">
                          {job.requirements.map((r, i) => (
                            <li key={i} className="text-xs text-[#1B254B] flex items-start gap-2 leading-relaxed">
                              <span className="w-4 h-4 rounded bg-[#F4F7FE] text-[#422AFB] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                              <span>{r}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {Array.isArray(job.nice) && job.nice.length > 0 && (
                      <div>
                        <h4 className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0] flex items-center gap-1.5 mb-2">
                          <I name="sparkles" size={12} className="text-[#422AFB]" />
                          加分项
                        </h4>
                        <ul className="space-y-1.5">
                          {job.nice.map((r, i) => (
                            <li key={i} className="text-xs text-[#707EAE] flex items-start gap-2 leading-relaxed">
                              <I name="plus" size={11} className="text-[#A3AED0] mt-1 shrink-0" />
                              <span>{r}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setJdDescOpen(true)}
                    className="mt-3 text-[11px] text-[#422AFB] font-bold hover:underline flex items-center gap-1"
                  >
                    查看完整 JD <I name="arrow-right" size={11} />
                  </button>
                </div>
              )}
            </Card>
          );
        })()}

        {/* === Skills / Risks / Highlights — 3 small cards === */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="p-4">
            <h3 className="text-sm font-bold text-[#1B254B] flex items-center gap-2">
              <I name="sparkles" size={14} className="text-[#422AFB]" />
              核心技能
            </h3>
            {/* 两阶段:阶段二由 JD match 产出 markdown 字符串;兼容旧 array 数据 */}
            {(() => {
              if (typeof c.skills === "string" && c.skills.trim()) {
                return <MarkdownBullets md={c.skills} textSize="text-[11px]" />;
              }
              if (Array.isArray(c.skills) && c.skills.length > 0) {
                return (
                  <ul className="mt-3 space-y-1.5">
                    {c.skills.map((s, i) => (
                      <li key={i} className="text-[11px] text-[#1B254B] flex items-start gap-1.5 leading-relaxed">
                        <I name="check-circle-2" size={11} className="text-[#422AFB] mt-0.5 shrink-0" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                );
              }
              return <NeedJobPlaceholder hasJob={!!c.jobId} onPickJob={() => setJdPickerOpen(true)} fieldName="核心技能" />;
            })()}
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-bold text-[#1B254B] flex items-center gap-2">
              <I name="alert-triangle" size={14} className="text-amber-500" />
              风险与缺项
            </h3>
            <ul className="mt-3 space-y-1.5">
              {(c.risks || []).map((s, i) => (
                <li key={i} className="text-[11px] text-[#1B254B] flex items-start gap-1.5 leading-relaxed">
                  <span className="text-amber-500 mt-0.5 shrink-0">•</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-bold text-[#1B254B] flex items-center gap-2">
              <I name="trophy" size={14} className="text-green-500" />
              亮点
            </h3>
            <ul className="mt-3 space-y-1.5">
              {(c.highlights || []).map((s, i) => (
                <li key={i} className="text-[11px] text-[#1B254B] flex items-start gap-1.5 leading-relaxed">
                  <I name="star" size={11} className="text-green-500 mt-0.5 shrink-0" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* === Experience timeline === */}
        <Card className="p-5 md:p-6">
          <h3 className="text-base font-bold text-[#1B254B] flex items-center gap-2">
            <I name="briefcase" size={16} className="text-[#422AFB]" />
            工作经历
          </h3>
          {/* 两阶段:阶段二由 JD match 产出 markdown 字符串;兼容旧 array(结构化对象)数据 */}
          {(() => {
            if (typeof c.experience === "string" && c.experience.trim()) {
              return <MarkdownBullets md={c.experience} />;
            }
            if (Array.isArray(c.experience) && c.experience.length > 0) {
              return (
                <ul className="mt-4 space-y-3 relative">
                  <span aria-hidden="true" className="absolute left-[3px] top-2 bottom-2 w-px bg-[#422AFB]/30" />
                  {c.experience.map((e, i) => (
                    <ExperienceItem key={i} e={e} projects={(c.projects || []).filter(p => p.companyTag && e.company?.includes(p.companyTag))} />
                  ))}
                </ul>
              );
            }
            return <NeedJobPlaceholder hasJob={!!c.jobId} onPickJob={() => setJdPickerOpen(true)} fieldName="工作经历" />;
          })()}
        </Card>

        {/* === Education === */}
        <Card className="p-5 md:p-6">
          <h3 className="text-base font-bold text-[#1B254B] flex items-center gap-2">
            <I name="graduation-cap" size={16} className="text-[#422AFB]" />
            教育背景
          </h3>
          {(() => {
            if (typeof c.educationHistory === "string" && c.educationHistory.trim()) {
              return <MarkdownBullets md={c.educationHistory} />;
            }
            if (Array.isArray(c.educationHistory) && c.educationHistory.length > 0) {
              return (
                <ul className="mt-4 space-y-5 relative">
                  <span aria-hidden="true" className="absolute left-[3px] top-2 bottom-2 w-px bg-[#CBD5E0]" />
                  {c.educationHistory.map((e, i) => (
                    <li key={i} className="relative pl-6">
                      <span className="absolute left-0 top-2 w-[7px] h-[7px] rounded-full bg-[#A0AEC0] ring-2 ring-white" />
                      <p className="text-xs text-[#A3AED0]">{e.period}</p>
                      <p className="text-sm font-bold text-[#1B254B] mt-0.5">{e.school}</p>
                      <p className="text-xs text-[#707EAE]">{e.major} · {e.degree}</p>
                    </li>
                  ))}
                </ul>
              );
            }
            return <NeedJobPlaceholder hasJob={!!c.jobId} onPickJob={() => setJdPickerOpen(true)} fieldName="教育背景" />;
          })()}
          {c.attachment && (
            <div className="mt-6 pt-4 border-t border-[#E9ECEF] flex items-center gap-2 text-xs text-[#707EAE]">
              <I name="paperclip" size={14} />
              {c.attachment}
            </div>
          )}
        </Card>

        <div className="pt-2">
          <Link to="/candidates" className="text-sm text-[#422AFB] hover:underline inline-flex items-center gap-1">
            <I name="arrow-left" size={14} /> 返回候选人列表
          </Link>
        </div>
      </div>

      {/* ╔═══ RIGHT COLUMN: Reviews + Feedback History ═══╗ */}
      <aside className="w-full xl:w-[340px] 2xl:w-[360px] shrink-0 space-y-4 xl:sticky xl:top-4 xl:self-start xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pr-1 xl:-mr-1">
        <ReviewsCard
          reviews={reviews} candidate={c} me={me} isAdmin={isAdmin}
          myVotes={myVotes} onVote={vote}
          onAdd={() => { setReplyTo(null); setReviewOpen(true); }}
          onReply={(r) => { setReplyTo(r); setReviewOpen(true); }}
          updateReview={(r) => setReviews((p) => p.map((x) => x.id === r.id ? r : x))}
        />
        <FeedbackHistoryCard
          notes={notes}
          insights={c.insights}
          onAdd={() => setNoteOpen(true)}
          onDelete={async (n) => {
            if (!confirm("删除这条备注?")) return;
            try {
              await resources.notes.remove(c.id, n.id);
              setNotes((p) => p.filter((x) => x.id !== n.id));
              toast("已删除", "success");
            } catch (err) { toast(err.message || "删除失败", "error"); }
          }}
        />
      </aside>
    </div>

    {/* Modals */}
    <NoteModal open={noteOpen} onClose={() => setNoteOpen(false)} candidate={c} onCreated={(n) => { setNotes((p) => [n, ...p]); setNoteOpen(false); }} />
    <EditInterviewModal
      open={!!editingInterview}
      onClose={() => setEditingInterview(null)}
      interview={editingInterview}
      onSave={(updated) => {
        setC(prev => prev ? ({
          ...prev,
          interviews: (prev.interviews || []).map(iv => iv.id === updated.id ? updated : iv),
        }) : prev);
      }}
    />
    <JdDescModal
      open={jdDescOpen}
      onClose={() => setJdDescOpen(false)}
      job={jobs.find(j => j.id === c.jobId)}
      onSwitch={() => { setJdDescOpen(false); setJdPickerOpen(true); }}
    />
    <JdSwitchConfirmModal
      open={!!pendingJobId}
      onClose={() => setPendingJobId("")}
      onConfirm={confirmSwitchJob}
      currentJob={jobs.find(j => j.id === c.jobId)}
      targetJob={jobs.find(j => j.id === pendingJobId)}
      candidateName={c.name}
    />
    <ReparseConfirmModal
      open={reparseOpen}
      onClose={() => setReparseOpen(false)}
      onConfirm={doReparse}
      currentJob={jobs.find(j => j.id === c.jobId)}
      jobs={jobs}
      candidateName={c.name}
      reparsing={reparsing}
    />
    <ReviewModal
      open={reviewOpen}
      onClose={() => { setReviewOpen(false); setReplyTo(null); }}
      candidate={c} replyTo={replyTo}
      onCreated={(r) => { setReviews((p) => [...p, r]); setReviewOpen(false); setReplyTo(null); }}
    />
    <InterviewModal open={interviewOpen} onClose={() => setInterviewOpen(false)} candidate={c} jobs={jobs} reviews={reviews} onCreated={load} />
    <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} candidate={c} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 10) 默认导出 — Layout Outlet 内渲染,不再包 min-h-screen wrapper
//   Layout 已经提供 sidebar/topbar/Topbar 标题、padded main 区域、ToastHost(Primitives 共享)
//   V2 自己的 ToastHost 在右下角额外渲染一份(用 V2 内联 toast 函数发出的提示)— 不与 Layout 的冲突
// ─────────────────────────────────────────────────────────────────────────────

export default function CandidateDetailPage() {
  return (
    <>
      <CandidateDetail />
      <ToastHost />
    </>
  );
}
