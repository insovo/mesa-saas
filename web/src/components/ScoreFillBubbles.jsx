/**
 * Codex 风格：评分条填充区内半透明白泡，从拇指（填充右缘）向左漂。
 * 有有效填充即持续动画（不依赖拖动）；挂在 overflow-hidden 的 fill 内。
 * prefers-reduced-motion 下不渲染。
 */
import { useEffect, useState } from "react";

/** 预设气泡：靠右（拇指侧）起步，向左终点错开；尺寸/透明度/周期错开 */
const BUBBLES = [
  { size: 3.5, top: "18%", start: "92%", end: "12%", delay: "0s", dur: "2.1s", opacity: 0.55 },
  { size: 2.5, top: "58%", start: "96%", end: "8%", delay: "0.35s", dur: "1.7s", opacity: 0.4 },
  { size: 2, top: "35%", start: "88%", end: "18%", delay: "0.7s", dur: "2.4s", opacity: 0.35 },
  { size: 4, top: "62%", start: "90%", end: "22%", delay: "0.15s", dur: "2.8s", opacity: 0.28 },
  { size: 2.2, top: "22%", start: "94%", end: "6%", delay: "1.1s", dur: "1.9s", opacity: 0.45 },
  { size: 3, top: "48%", start: "91%", end: "15%", delay: "0.9s", dur: "2.2s", opacity: 0.38 },
  { size: 1.8, top: "70%", start: "97%", end: "10%", delay: "0.5s", dur: "1.6s", opacity: 0.5 },
  { size: 2.8, top: "28%", start: "86%", end: "25%", delay: "1.4s", dur: "2.6s", opacity: 0.25 },
];

/** 填充比例低于此值不显示（避免极窄条里气泡挤成一团） */
const MIN_FILL = 0.05;

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduce(mql.matches);
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);
  return reduce;
}

/**
 * @param {object} props
 * @param {boolean} [props.active] 正在拖动时略增强不透明度（可选，不控制显隐）
 * @param {number} props.fillRatio 填充比例 0–1（未评分传 0）
 */
export default function ScoreFillBubbles({ active = false, fillRatio = 0 }) {
  const reduce = usePrefersReducedMotion();
  const r = Math.min(1, Math.max(0, Number(fillRatio) || 0));
  // 有意义填充即显示（含中段）；不门控 dragging，避免「只有正在拖的那条有泡」
  const show = !reduce && r >= MIN_FILL;
  const strong = r >= 0.75 || active;
  const count = strong ? BUBBLES.length : Math.min(5, BUBBLES.length);

  if (!show) return null;

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden rounded-full transition-opacity duration-200 ${
        strong ? "opacity-100" : "opacity-70"
      }`}
    >
      {BUBBLES.slice(0, count).map((b, i) => (
        <span
          key={i}
          className="score-fill-bubble"
          style={{
            width: b.size,
            height: b.size,
            top: b.top,
            "--bubble-start": b.start,
            "--bubble-end": b.end,
            "--bubble-dur": b.dur,
            "--bubble-delay": b.delay,
            "--bubble-opacity": String(b.opacity),
          }}
        />
      ))}
    </div>
  );
}
