// 品牌 logo「Overseas R&D」— ransom note(勒索信拼贴)效果
//
// 参考「Ransom note」交互(每个字母像从不同杂志上撕下来、歪歪扭扭贴上去):
// 原实现用真实剪纸字母 sprite 图;本组件为零素材纯 CSS 移植,保留其核心机制:
//   1. mulberry32 确定性 PRNG + hashSeed:同一文本默认呈现同一拼贴(可 re-roll)
//   2. 每字符独立「纸片」:随机 纸色/字色/字体/大小写/倾斜/基线弹跳/缩放
//   3. 入场「rise & settle」:从下方带模糊升入,按字符 index 40ms stagger
//   4. 点击单个字母 → 该字母重新抽一张「纸片」(快速翻换)
//   5. 空闲循环:每隔几秒随机翻换一个字母(hover 冻结;reduced-motion / 隐藏页全停)
//
// 无障碍:容器 aria-label 完整文本,字符 span aria-hidden;reduced-motion 下静态呈现。

import { useEffect, useRef, useState } from "react";

// ── 确定性随机(与参考实现同款) ────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ── 「纸片」变体池(替代 sprite 素材包) ──────────────────────────
// 配色向参考截图靠:白纸红字 / 黑纸粉字 / 黄纸深字 / 亮橙 / 霓虹紫 / 报纸米色…
const SCRAPS = [
  { bg: "#ffffff", fg: "#e11d48", border: "#e5e7eb" },   // 白纸红字
  { bg: "#16161d", fg: "#f472b6", border: "#16161d" },   // 黑纸粉字
  { bg: "#16161d", fg: "#facc15", border: "#16161d" },   // 黑纸金字
  { bg: "#fde047", fg: "#1f2937", border: "#eab308" },   // 黄纸深字
  { bg: "#f9a8d4", fg: "#111827", border: "#f472b6" },   // 粉纸黑字
  { bg: "#ffffff", fg: "#2563eb", border: "#e5e7eb" },   // 白纸蓝字
  { bg: "#dc2626", fg: "#fef9c3", border: "#b91c1c" },   // 红纸米字
  { bg: "#1e1b4b", fg: "#a78bfa", border: "#1e1b4b" },   // 深蓝纸霓虹紫
  { bg: "#f5f0e6", fg: "#374151", border: "#d6cdbb" },   // 报纸米色
  { bg: "#422AFB", fg: "#ffffff", border: "#3311DB" },   // 品牌紫纸白字
  { bg: "#fb923c", fg: "#7c2d12", border: "#ea580c" },   // 橙纸棕字
  { bg: "#0f172a", fg: "#38bdf8", border: "#0f172a" },   // 墨纸青字
];
// 字体池:全部走系统栈 + 已加载的 Poppins,兜底 generic family
const FONTS = [
  "'Poppins', sans-serif",
  "Georgia, 'Times New Roman', serif",
  "'Courier New', Courier, monospace",
  "Impact, 'Arial Black', sans-serif",
  "'Arial Black', Arial, sans-serif",
  "'Brush Script MT', 'Comic Sans MS', cursive",
];

// 为一个字符抽一张「纸片」(确定性:同 seed 同结果)
function pickScrap(ch, seed) {
  const rnd = mulberry32(seed);
  const scrap = SCRAPS[Math.floor(rnd() * SCRAPS.length)];
  const font = FONTS[Math.floor(rnd() * FONTS.length)];
  return {
    ...scrap,
    font,
    // 大小写混排是拼贴感的关键(STaY WeiRD);& 等符号不受影响
    lower: /[a-z]/i.test(ch) && rnd() < 0.38,
    rot: (rnd() * 2 - 1) * 8,          // ±8° 倾斜
    dy: (rnd() * 2 - 1) * 0.1,         // ±0.1em 基线弹跳
    scale: 1 + (rnd() * 2 - 1) * 0.12, // 0.88–1.12 缩放
    italic: rnd() < 0.15,
  };
}

function Scrap({ ch, idx, seedBase, bump, onSwap, fontPx }) {
  const s = pickScrap(ch, (seedBase + idx * 101 + bump * 0x9e37) >>> 0);
  const [swapping, setSwapping] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => timer.current && clearTimeout(timer.current), []);

  const handleClick = () => {
    if (swapping) return;
    setSwapping(true);
    onSwap(idx);
    timer.current = setTimeout(() => setSwapping(false), 260);
  };

  return (
    <span
      aria-hidden
      onClick={handleClick}
      className={`ransom-char ${swapping ? "ransom-char-swap" : ""}`}
      style={{
        "--ransom-rot": `${s.rot.toFixed(2)}deg`,
        "--ransom-dy": `${s.dy.toFixed(3)}em`,
        "--ransom-scale": s.scale.toFixed(3),
        animationDelay: `${idx * 40}ms`,
        fontFamily: s.font,
        fontSize: `${fontPx}px`,
        fontStyle: s.italic ? "italic" : "normal",
        color: s.fg,
        background: s.bg,
        boxShadow: `0 1px 2px rgba(20,20,30,.28), inset 0 0 0 1px ${s.border}`,
      }}
    >
      {s.lower ? ch.toLowerCase() : ch.toUpperCase()}
    </span>
  );
}

/**
 * @param {object} props
 * @param {string} props.text 默认 "Overseas R&D"(内容不变,仅换视觉)
 * @param {number} props.fontPx 单字母字号 px(侧栏空间有限,默认 13)
 * @param {string} props.className 外层透传
 */
export default function RansomLogo({ text = "Overseas R&D", fontPx = 13, className = "" }) {
  // 同一文本默认同一拼贴;bumps[i] 记录单字母被点击翻换的次数
  const seedBase = hashSeed(text);
  const [bumps, setBumps] = useState(() => Array.from(text, () => 0));

  const swapAt = (idx) =>
    setBumps((b) => b.map((v, i) => (i === idx ? v + 1 : v)));

  // 空闲循环:每 6s 随机翻换一个字母(reduced-motion / 页面隐藏 / hover 时不动)
  const hostRef = useRef(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let hovering = false;
    const host = hostRef.current;
    const onEnter = () => { hovering = true; };
    const onLeave = () => { hovering = false; };
    host?.addEventListener("pointerenter", onEnter);
    host?.addEventListener("pointerleave", onLeave);
    const glyphIdx = Array.from(text)
      .map((ch, i) => (ch === " " ? null : i))
      .filter((i) => i != null);
    const id = setInterval(() => {
      if (document.hidden || hovering || !glyphIdx.length) return;
      swapAt(glyphIdx[Math.floor(Math.random() * glyphIdx.length)]);
    }, 6000);
    return () => {
      clearInterval(id);
      host?.removeEventListener("pointerenter", onEnter);
      host?.removeEventListener("pointerleave", onLeave);
    };
  }, [text]);

  // 自动缩放适配:拼贴自然宽 > 容器宽时整行等比缩小(镜像参考实现的 lineWidth 单行 fit)
  const innerRef = useRef(null);
  const [fit, setFit] = useState(1);
  useEffect(() => {
    const outer = hostRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const measure = () => {
      const have = outer.clientWidth;
      const need = inner.scrollWidth;
      setFit(have > 0 && need > have ? Math.max(0.5, have / need) : 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    return () => ro.disconnect();
  }, [text, fontPx]);

  return (
    <span
      ref={hostRef}
      className={`block min-w-0 flex-1 overflow-visible ${className}`}
      aria-label={text}
    >
      <span
        ref={innerRef}
        className="ransom-logo"
        style={{ transform: `scale(${fit})`, transformOrigin: "left center" }}
      >
        {Array.from(text).map((ch, i) =>
          ch === " " ? (
            <span key={i} aria-hidden style={{ width: `${fontPx * 0.4}px`, display: "inline-block" }} />
          ) : (
            <Scrap key={i} ch={ch} idx={i} seedBase={seedBase} bump={bumps[i]} onSwap={swapAt} fontPx={fontPx} />
          ),
        )}
      </span>
    </span>
  );
}
