// MESA Recruit · 共享原子组件
// 迁自 ui_kits/mesa-recruit/Primitives.jsx,改为 ESM 导出,图标用 lucide-react。

import { useEffect, useState, useRef, forwardRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import * as Lucide from "lucide-react";
import { STATUS_TONE, HIRE_STAGE_TONE, TASK_STATUS_TONE, URGENCY_TONE } from "../lib/constants.js";

// === Icon ===========================================================
// 兼容 ui_kits 里 <I name="xxx" /> 的写法。
// lucide-react 用 PascalCase 命名(如 LayoutDashboard);这里把 kebab-case 自动转过去。
function pascal(name) {
  return name.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
}

export function I({ name, size = 18, strokeWidth = 2, className = "", ...rest }) {
  const Icon = Lucide[pascal(name)] || Lucide.HelpCircle;
  return <Icon size={size} strokeWidth={strokeWidth} className={className} {...rest} />;
}

// === Card ===========================================================
// hover: 传入后卡片获得统一抬升微交互(.lift)。gradient: 渐变描边卡。
export const Card = forwardRef(function Card(
  { children, className = "", extra = "", as: As = "div", hover = false, gradient = false, ...rest },
  ref,
) {
  return (
    <As
      ref={ref}
      className={`relative flex flex-col rounded-card bg-clip-border shadow-card ${gradient ? "gradient-border" : "bg-white"} ${hover ? "lift" : ""} ${className} ${extra}`}
      {...rest}
    >
      {children}
    </As>
  );
});

// === Button =========================================================
const BTN_SIZES = {
  sm: "h-9 px-4 text-sm rounded-xl gap-1.5",
  md: "h-11 px-5 text-sm rounded-xl gap-2",
  lg: "h-12 px-6 text-base rounded-xl gap-2",
};
// primary 改为品牌渐变 + hover 辉光,统一全站主按钮的活力质感
const BTN_VARIANTS = {
  primary: "bg-brand-gradient bg-[length:160%_160%] hover:bg-[position:100%_50%] text-white font-medium shadow-button hover:shadow-button-hover",
  secondary: "bg-lightPrimary text-navy-700 hover:bg-gray-200 font-medium",
  ghost: "bg-transparent text-navy-700 hover:bg-lightPrimary border border-gray-200 hover:border-brand/40 font-medium",
  danger: "bg-gradient-to-br from-rose-500 to-red-600 text-white hover:shadow-[0_10px_28px_rgba(244,63,94,0.4)] font-medium",
  pill: "bg-brand-gradient bg-[length:160%_160%] hover:bg-[position:100%_50%] text-white font-medium rounded-full shadow-button hover:shadow-button-hover",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  className = "",
  as: As = "button",
  disabled,
  ...rest
}) {
  return (
    <As
      disabled={disabled}
      className={`inline-flex items-center justify-center transition-all duration-300 ease-out-expo active:scale-[0.97] ${BTN_SIZES[size]} ${BTN_VARIANTS[variant]} ${disabled ? "opacity-60 cursor-not-allowed pointer-events-none" : ""} ${className}`}
      {...rest}
    >
      {icon && <span className="inline-flex" style={{ lineHeight: 0 }}>{icon}</span>}
      {children}
    </As>
  );
}

// === Input ==========================================================
// 必填红 *,全项目规范统一通过此组件渲染。手写 label 也用 <RequiredMark /> 替换 " *" 字符。
export function RequiredMark({ className = "" }) {
  return <span className={`text-red-500 ml-0.5 select-none ${className}`} aria-hidden="true">*</span>;
}

export function Input({
  label, id, type = "text", placeholder, state, disabled, icon, value, onChange,
  required = false,
  className = "", containerClassName = "", ...rest
}) {
  const stateCls = disabled
    ? "!border-none !bg-gray-100"
    : state === "error"
    ? "border-red-500 text-red-500 placeholder:text-red-500"
    : state === "success"
    ? "border-green-500 text-green-500"
    : "border-gray-200 text-navy-700";
  return (
    <div className={containerClassName}>
      {label && (
        <label htmlFor={id} className="text-sm text-navy-700 font-bold ml-3 block mb-2">
          {label}
          {required && <RequiredMark />}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{icon}</span>
        )}
        <input
          disabled={disabled}
          type={type}
          id={id}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          className={`flex h-12 w-full items-center rounded-xl border bg-white/40 p-3 text-sm outline-none placeholder:text-gray-400 focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/10 transition-all duration-200 ${icon ? "pl-10" : ""} ${stateCls} ${className}`}
          {...rest}
        />
      </div>
    </div>
  );
}

// === Avatar =========================================================
const ANIMAL_EMOJI = {
  dog: "🐶", cat: "🐱", rabbit: "🐰", bear: "🐻", bird: "🐦", fish: "🐠",
  rat: "🐭", squirrel: "🐿️", turtle: "🐢", snail: "🐌", bug: "🐛", worm: "🪱",
  pig: "🐷", duck: "🦆", panda: "🐼", fox: "🦊", monkey: "🐵", whale: "🐳",
  cow: "🐮", tiger: "🐯", lion: "🦁",
};

export function Avatar({ name, animal, src, size = 40 }) {
  const initials = (name || "?").trim().slice(0, 1);
  const emoji = animal ? ANIMAL_EMOJI[animal] : null;
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="rounded-full object-cover bg-gray-100"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-brand-gradient text-white flex items-center justify-center font-medium"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      title={name}
    >
      {emoji || initials}
    </div>
  );
}

// === Status Pill ====================================================
export function StatusPill({ status, size = "sm" }) {
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

export function StagePill({ stage, size = "sm" }) {
  const tone = HIRE_STAGE_TONE[stage] || HIRE_STAGE_TONE["待入职"];
  const sz = size === "sm" ? "px-3 py-1 text-[11px]" : "px-3.5 py-1.5 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold whitespace-nowrap ${sz}`}
      style={{ background: tone.bg, color: tone.fg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone.dot }}></span>
      {stage}
    </span>
  );
}

export function TaskStatusPill({ status }) {
  const tone = TASK_STATUS_TONE[status] || TASK_STATUS_TONE["待开始"];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap"
      style={{ background: tone.bg, color: tone.fg }}
    >
      <I name={tone.icon} size={11} strokeWidth={2.5} />
      {status}
    </span>
  );
}

export function UrgencyChip({ urgency }) {
  const tone = URGENCY_TONE[urgency] || URGENCY_TONE.mid;
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {tone.label}
    </span>
  );
}

// === AI Badge =======================================================
export function AiBadge({ parser = "Kimi", confidence }) {
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

// === Match Ring =====================================================
export function MatchRing({ value = 0, size = 56, stroke = 6, showLabel = true }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const safe = Math.max(0, Math.min(100, value));
  const offset = c - (c * safe) / 100;
  const color = safe >= 85 ? "#22C55E" : safe >= 70 ? "#3B82F6" : safe >= 50 ? "#F59E0B" : "#F53939";
  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#E9ECEF" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[13px] font-bold text-navy-700">{safe}</span>
        </div>
      )}
    </div>
  );
}

// === Liquid Loader ================================================
// 液体进度球 — 改写自 /Users/mysaria/Desktop/Project/liquid-loader.html
// 适配 mesa 多种尺寸 (40-80px),保留液面 + 双层波浪 + 气泡上升 + 中心数字 + 三档调色板 (red ≤60 / blue 60-80 / violet >80)
// 模块顶层一次性注入 @keyframes,后续多处复用零成本
if (typeof document !== "undefined" && !document.getElementById("mesa-liquid-keyframes")) {
  const style = document.createElement("style");
  style.id = "mesa-liquid-keyframes";
  style.textContent = `
    @keyframes mesaLiquidWaveBack { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    @keyframes mesaLiquidWaveFront { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    @keyframes mesaLiquidBubble {
      0% { opacity: 0; transform: translateY(0) scale(0.6); }
      15% { opacity: 1; }
      85% { opacity: 0.7; }
      100% { opacity: 0; transform: translateY(-100%) scale(1.15); }
    }
    @keyframes mesaLiquidPulse {
      0%, 100% { box-shadow: 0 0 0 0 var(--mesa-pulse, rgba(66,42,251,0.45)); }
      50% { box-shadow: 0 0 0 6px transparent; }
    }
  `;
  document.head.appendChild(style);
}

const MESA_LIQUID_PALETTES = {
  violet: { main: "#6547FF", back: "#3F27C9", edge: "rgba(38,24,106,0.48)", glow: "rgba(101,71,255,0.45)" },
  blue:   { main: "#1187FF", back: "#0064D8", edge: "rgba(7,46,92,0.46)",  glow: "rgba(17,135,255,0.45)" },
  red:    { main: "#F51342", back: "#D80334", edge: "rgba(67,13,25,0.42)", glow: "rgba(245,19,66,0.45)" },
};

function pickMesaLiquidPalette(value) {
  if (value > 80) return MESA_LIQUID_PALETTES.violet;
  if (value > 60) return MESA_LIQUID_PALETTES.blue;
  return MESA_LIQUID_PALETTES.red;
}

export function LiquidLoader({ size = 56, level = 0, label = "", loading = false }) {
  const fillPct = Math.max(0, Math.min(100, level));
  const numericLabel = typeof label === "number" ? label : (label === "" ? "" : String(label));
  const paletteValue = typeof label === "number" ? label : fillPct;
  const palette = pickMesaLiquidPalette(paletteValue);
  // 小尺寸下数字字号 / 波浪高度自适应
  const waveH = Math.max(8, Math.round(size * 0.22));
  const showBubbles = size >= 48;
  return (
    <div
      className="relative rounded-full shrink-0 inline-flex"
      style={{
        width: size,
        height: size,
        animation: loading ? "mesaLiquidPulse 1.6s ease-out infinite" : undefined,
        "--mesa-pulse": palette.glow,
      }}
      aria-label={loading ? "评估中" : `匹配度 ${numericLabel}`}
      role={loading ? "status" : "img"}
    >
      <div
        className="relative rounded-full overflow-hidden w-full h-full"
        style={{
          background: "radial-gradient(circle at 34% 22%, rgba(255,255,255,0.55), transparent 24%), rgba(244,247,254,0.7)",
          boxShadow: `inset 0 5px 10px rgba(255,255,255,0.55), inset 0 -5px 10px rgba(0,0,0,0.05), 0 4px 14px ${palette.glow}`,
        }}
      >
        <div className="absolute left-0 right-0 bottom-0" style={{ height: `${fillPct}%`, transition: "height 600ms cubic-bezier(0.34,1.56,0.64,1)" }}>
          <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${palette.main} 0%, ${palette.back} 100%)` }} />
          <svg
            className="absolute left-0 w-[200%]"
            style={{ height: waveH, top: -Math.round(waveH * 0.66), opacity: 0.86, animation: "mesaLiquidWaveBack 4.4s linear infinite reverse" }}
            viewBox="0 0 1440 100" preserveAspectRatio="none"
          >
            <path d="M0 58C120 26 240 26 360 58S600 90 720 58S960 26 1080 58S1320 90 1440 58V100H0Z" fill={palette.back} />
          </svg>
          <svg
            className="absolute left-0 w-[200%]"
            style={{ height: waveH, top: -Math.round(waveH * 0.5), animation: "mesaLiquidWaveFront 3.2s linear infinite" }}
            viewBox="0 0 1440 100" preserveAspectRatio="none"
          >
            <path d="M0 48C120 12 240 12 360 48S600 84 720 48S960 12 1080 48S1320 84 1440 48V100H0Z" fill={palette.main} />
          </svg>
        </div>
        {showBubbles && (
          <>
            <span className="absolute" style={{ left: "28%", bottom: 0, width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.9)", animation: "mesaLiquidBubble 3s linear infinite" }} />
            <span className="absolute" style={{ left: "55%", bottom: 0, width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.9)", animation: "mesaLiquidBubble 3.8s linear 0.7s infinite" }} />
            <span className="absolute" style={{ left: "74%", bottom: 0, width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.9)", animation: "mesaLiquidBubble 3.4s linear 1.4s infinite" }} />
          </>
        )}
        <span
          className="absolute pointer-events-none"
          style={{ left: "18%", top: "12%", width: "30%", height: "12%", borderRadius: "50%", background: "linear-gradient(180deg, rgba(255,255,255,0.72), rgba(255,255,255,0))", filter: "blur(1px)", transform: "rotate(-18deg)", zIndex: 4 }}
        />
        {numericLabel !== "" && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{
              color: "#fff",
              fontWeight: 800,
              fontSize: Math.round(size * 0.36),
              lineHeight: 1,
              letterSpacing: "-0.02em",
              WebkitTextStroke: "0.5px rgba(22,22,22,0.22)",
              textShadow: `0 1px 0 ${palette.edge}, 0 0 2px rgba(22,22,22,0.22), 0 2px 6px rgba(22,22,22,0.18)`,
              zIndex: 5,
            }}
          >
            {numericLabel}
          </div>
        )}
      </div>
    </div>
  );
}

// === Tag ============================================================
export function Tag({ children, tone = "default" }) {
  const tones = {
    default: "bg-lightPrimary text-gray-700",
    brand: "bg-brand-50 text-brand-700",
    success: "bg-green-100 text-green-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

// === Widget (stat tile) =============================================
export function Widget({ icon, label, value, accent = "#422AFB", subtitle, to }) {
  const interactive = !!to;
  const inner = (
    <Card
      className={`relative p-5 flex items-center gap-4${
        interactive
          ? " transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lg group-focus-visible:-translate-y-0.5 group-focus-visible:shadow-lg"
          : ""
      }`}
    >
      <div
        className="flex items-center justify-center rounded-2xl shrink-0 shadow-inner-top transition-transform duration-300 group-hover:scale-105"
        style={{
          width: 56,
          height: 56,
          background: `linear-gradient(135deg, ${accent}1f 0%, ${accent}0d 100%)`,
          color: accent,
          boxShadow: `inset 0 0 0 1px ${accent}1a`,
        }}
      >
        <I name={icon} size={26} strokeWidth={2.2} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-700 font-medium uppercase tracking-wide truncate">{label}</p>
        <p className="text-2xl font-bold text-navy-700 leading-tight mt-0.5">{value}</p>
        {subtitle && <p className="text-xs text-gray-600 mt-0.5 truncate">{subtitle}</p>}
      </div>
      {interactive && (
        <I
          name="arrow-right"
          size={16}
          className="absolute top-4 right-4 text-gray-300 transition-all duration-200 group-hover:text-brand group-hover:translate-x-0.5"
        />
      )}
    </Card>
  );
  if (!interactive) return inner;
  return (
    <Link to={to} className="group block rounded-card outline-none focus-visible:ring-2 focus-visible:ring-brand">
      {inner}
    </Link>
  );
}

// === Modal ==========================================================
export function Modal({ open, onClose, children, maxWidth = "max-w-2xl" }) {
  const scrollRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    // 重置 scroll 到顶部 — 避免某些情况下 focus 把 modal 内部 scroll 推到中间
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  // 用 Portal 渲染到 document.body — 避免被 aside 的 overflow-y-auto / sticky 裁剪
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy-900/40 backdrop-blur-sm animate-[fade-up_0.25s_ease]" onClick={onClose}></div>
      {/* Modal 自身限高 + 内部滚动:
            - max-h-[85vh] Tailwind 是绝对 fallback,所有现代浏览器都支持 vh
            - inline style 用 min(85vh, calc(100dvh - 4rem)),在支持 dvh 的浏览器进一步收紧
              并响应浏览器 chrome 实际占用空间(地址栏 + 书签栏 + 扩展栏扣除后的可见高度)
            - Safari 16.4- 不支持 dvh 时整个 min() 失效,自动回落到 max-h-[85vh] class
            - overflow-y-auto 让 modal 内部滚动,scrollbar 出现在 modal 内右侧(不是视窗外),
              用户能立刻看到"内容可滚"的视觉提示 */}
      <div
        ref={scrollRef}
        className={`relative w-full ${maxWidth} bg-white rounded-card shadow-glow-lg overflow-y-auto max-h-[85vh] animate-scale-in`}
        style={{ maxHeight: "min(85vh, calc(100dvh - 4rem))" }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

// === Empty ==========================================================
export function Empty({ icon = "inbox", title = "暂无数据", desc }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-600 animate-fade-up">
      <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-lightPrimary to-brand-50 flex items-center justify-center mb-4 shadow-card-soft">
        <div className="absolute inset-0 rounded-2xl bg-brand-gradient opacity-[0.06]" />
        <I name={icon} size={30} className="text-brand/60" />
      </div>
      <p className="text-sm font-semibold text-navy-700">{title}</p>
      {desc && <p className="text-xs text-gray-600 mt-1">{desc}</p>}
    </div>
  );
}

// === Loading Block ==================================================
export function LoadingBlock({ height = "h-32", label = "加载中..." }) {
  return (
    <div className={`${height} w-full rounded-card bg-white shadow-card flex items-center justify-center text-sm text-gray-700`}>
      <I name="loader" size={16} className="animate-spin mr-2" />
      {label}
    </div>
  );
}

// === Toast (lightweight) ============================================
let toastSeq = 0;
const toastListeners = new Set();

export function toast(msg, type = "info") {
  const id = ++toastSeq;
  toastListeners.forEach((cb) => cb({ id, msg, type }));
  return id;
}

export function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const cb = (t) => {
      setItems((prev) => [...prev, t]);
      // error 类型不自动消失,用户必须点 X 关闭 — 留时间复制 / 截图
      // success / info 仍 3.5s 自动关闭
      if (t.type !== "error") {
        setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 3500);
      }
    };
    toastListeners.add(cb);
    return () => toastListeners.delete(cb);
  }, []);
  const dismiss = (id) => setItems((prev) => prev.filter((x) => x.id !== id));
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-md">
      {items.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-xl shadow-glow-lg text-sm font-medium flex items-start gap-3 animate-slide-in-right
            ${t.type === "error" ? "bg-gradient-to-br from-rose-500 to-red-600 text-white max-w-md" :
              t.type === "success" ? "bg-gradient-to-br from-emerald-500 to-green-600 text-white max-w-sm" :
              "bg-gradient-to-br from-navy-700 to-navy-800 text-white max-w-sm"}`}
        >
          <span className="flex-1 break-words whitespace-pre-wrap select-text">{t.msg}</span>
          {t.type === "error" && (
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 text-white/80 hover:text-white text-xs leading-none mt-0.5"
              aria-label="关闭"
              title="关闭"
            >
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
