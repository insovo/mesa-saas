// MESA Recruit · GSAP 公共节拍 (设计规划文档 §5)
// 对齐设计:duration 0.3-0.8s · ease power2.out / expo.out · stagger 0.04-0.08
// 全局 prefers-reduced-motion 适配:matchMedia reduce → globalTimeline.timeScale 1000(瞬时切换)
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Flip } from "gsap/Flip";

gsap.registerPlugin(ScrollTrigger, Flip);

// 统一节拍
export const D = { fast: 0.25, base: 0.5, slow: 0.8 };
export const E = { out: "power2.out", expo: "expo.out", back: "back.out(1.4)" };

// reduce-motion 适配 — 一次性安装
let __motionInited = false;
export function ensureMotionPref() {
  if (__motionInited || typeof window === "undefined") return;
  __motionInited = true;
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  const apply = (m) => gsap.globalTimeline.timeScale(m.matches ? 1000 : 1);
  apply(mql);
  mql.addEventListener("change", apply);
}

export { gsap, ScrollTrigger, Flip };
