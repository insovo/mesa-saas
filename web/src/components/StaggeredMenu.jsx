// MESA Recruit · StaggeredMenu 左侧覆盖式导航(移植自 React Bits StaggeredMenu)
//   - GSAP 驱动:预层色块先行 + 白色面板跟进 + 菜单项 stagger 飞入(符合项目「动画只用 GSAP」约定)
//   - 汉堡按钮固定左上角,Menu/Close 文字滚动切换,+ 号旋转成 ×
//   - 菜单项 = 原 Sidebar 导航(权限过滤后由调用方传入),NavLink SPA 跳转,点击后收起
//   - prefers-reduced-motion:动画时长归零(等效瞬时开合)

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { gsap } from "gsap";
import RansomLogo from "./RansomLogo.jsx";

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function StaggeredMenu({
  items = [],
  colors = ["#B5A6FF", "#422AFB"],
  accentColor = "#422AFB",
  menuButtonColor = "#1B254B",
  openMenuButtonColor = "#1B254B",
  displayItemNumbering = true,
  footer = null,
  onMenuOpen,
  onMenuClose,
}) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);

  const panelRef = useRef(null);
  const preLayersRef = useRef(null);
  const preLayerElsRef = useRef([]);

  const plusHRef = useRef(null);
  const plusVRef = useRef(null);
  const iconRef = useRef(null);

  const textInnerRef = useRef(null);
  const [textLines, setTextLines] = useState(["Menu", "Close"]);

  const openTlRef = useRef(null);
  const closeTweenRef = useRef(null);
  const spinTweenRef = useRef(null);
  const textCycleAnimRef = useRef(null);
  const colorTweenRef = useRef(null);

  const toggleBtnRef = useRef(null);
  const busyRef = useRef(false);

  // reduced-motion 时所有时长乘 0 → 瞬时开合
  const dur = useCallback((v) => (prefersReducedMotion() ? 0 : v), []);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const panel = panelRef.current;
      const preContainer = preLayersRef.current;
      const plusH = plusHRef.current;
      const plusV = plusVRef.current;
      const icon = iconRef.current;
      const textInner = textInnerRef.current;
      if (!panel || !plusH || !plusV || !icon || !textInner) return;

      let preLayers = [];
      if (preContainer) {
        preLayers = Array.from(preContainer.querySelectorAll(".sm-prelayer"));
      }
      preLayerElsRef.current = preLayers;

      gsap.set([panel, ...preLayers], { xPercent: -100, opacity: 1 });
      gsap.set(plusH, { transformOrigin: "50% 50%", rotate: 0 });
      gsap.set(plusV, { transformOrigin: "50% 50%", rotate: 90 });
      gsap.set(icon, { rotate: 0, transformOrigin: "50% 50%" });
      gsap.set(textInner, { yPercent: 0 });
      if (toggleBtnRef.current) gsap.set(toggleBtnRef.current, { color: menuButtonColor });
    });
    return () => ctx.revert();
  }, [menuButtonColor]);

  const buildOpenTimeline = useCallback(() => {
    const panel = panelRef.current;
    const layers = preLayerElsRef.current;
    if (!panel) return null;

    openTlRef.current?.kill();
    if (closeTweenRef.current) {
      closeTweenRef.current.kill();
      closeTweenRef.current = null;
    }

    const itemEls = Array.from(panel.querySelectorAll(".sm-panel-itemLabel"));
    const numberEls = Array.from(panel.querySelectorAll(".sm-panel-list[data-numbering] .sm-panel-item"));
    const footerEl = panel.querySelector(".sm-panel-footer");

    if (itemEls.length) gsap.set(itemEls, { yPercent: 140, rotate: 10 });
    if (numberEls.length) gsap.set(numberEls, { "--sm-num-opacity": 0 });
    if (footerEl) gsap.set(footerEl, { y: 25, opacity: 0 });

    const tl = gsap.timeline({ paused: true });

    layers.forEach((el, i) => {
      tl.fromTo(el, { xPercent: -100 }, { xPercent: 0, duration: dur(0.5), ease: "power4.out" }, i * dur(0.07));
    });

    const lastTime = layers.length ? (layers.length - 1) * dur(0.07) : 0;
    const panelInsertTime = lastTime + (layers.length ? dur(0.08) : 0);
    const panelDuration = dur(0.65);

    tl.fromTo(panel, { xPercent: -100 }, { xPercent: 0, duration: panelDuration, ease: "power4.out" }, panelInsertTime);

    if (itemEls.length) {
      const itemsStart = panelInsertTime + panelDuration * 0.15;
      tl.to(
        itemEls,
        { yPercent: 0, rotate: 0, duration: dur(1), ease: "power4.out", stagger: { each: dur(0.06), from: "start" } },
        itemsStart
      );
      if (numberEls.length) {
        tl.to(
          numberEls,
          { duration: dur(0.6), ease: "power2.out", "--sm-num-opacity": 1, stagger: { each: dur(0.05), from: "start" } },
          itemsStart + dur(0.1)
        );
      }
    }

    if (footerEl) {
      tl.to(footerEl, { y: 0, opacity: 1, duration: dur(0.55), ease: "power3.out" }, panelInsertTime + panelDuration * 0.4);
    }

    openTlRef.current = tl;
    return tl;
  }, [dur]);

  const playOpen = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    const tl = buildOpenTimeline();
    if (tl) {
      tl.eventCallback("onComplete", () => {
        busyRef.current = false;
      });
      tl.play(0);
    } else {
      busyRef.current = false;
    }
  }, [buildOpenTimeline]);

  const playClose = useCallback(() => {
    openTlRef.current?.kill();
    openTlRef.current = null;

    const panel = panelRef.current;
    const layers = preLayerElsRef.current;
    if (!panel) return;

    closeTweenRef.current?.kill();
    closeTweenRef.current = gsap.to([...layers, panel], {
      xPercent: -100,
      duration: dur(0.32),
      ease: "power3.in",
      overwrite: "auto",
      onComplete: () => {
        const itemEls = Array.from(panel.querySelectorAll(".sm-panel-itemLabel"));
        if (itemEls.length) gsap.set(itemEls, { yPercent: 140, rotate: 10 });
        const numberEls = Array.from(panel.querySelectorAll(".sm-panel-list[data-numbering] .sm-panel-item"));
        if (numberEls.length) gsap.set(numberEls, { "--sm-num-opacity": 0 });
        const footerEl = panel.querySelector(".sm-panel-footer");
        if (footerEl) gsap.set(footerEl, { y: 25, opacity: 0 });
        busyRef.current = false;
      },
    });
  }, [dur]);

  const animateIcon = useCallback((opening) => {
    const icon = iconRef.current;
    const h = plusHRef.current;
    const v = plusVRef.current;
    if (!icon || !h || !v) return;

    spinTweenRef.current?.kill();
    if (opening) {
      gsap.set(icon, { rotate: 0, transformOrigin: "50% 50%" });
      spinTweenRef.current = gsap
        .timeline({ defaults: { ease: "power4.out" } })
        .to(h, { rotate: 45, duration: dur(0.5) }, 0)
        .to(v, { rotate: -45, duration: dur(0.5) }, 0);
    } else {
      spinTweenRef.current = gsap
        .timeline({ defaults: { ease: "power3.inOut" } })
        .to(h, { rotate: 0, duration: dur(0.35) }, 0)
        .to(v, { rotate: 90, duration: dur(0.35) }, 0)
        .to(icon, { rotate: 0, duration: 0.001 }, 0);
    }
  }, [dur]);

  const animateColor = useCallback(
    (opening) => {
      const btn = toggleBtnRef.current;
      if (!btn) return;
      colorTweenRef.current?.kill();
      const targetColor = opening ? openMenuButtonColor : menuButtonColor;
      colorTweenRef.current = gsap.to(btn, { color: targetColor, delay: dur(0.18), duration: dur(0.3), ease: "power2.out" });
    },
    [openMenuButtonColor, menuButtonColor, dur]
  );

  const animateText = useCallback(
    (opening) => {
      const inner = textInnerRef.current;
      if (!inner) return;

      textCycleAnimRef.current?.kill();

      const currentLabel = opening ? "Menu" : "Close";
      const targetLabel = opening ? "Close" : "Menu";
      const cycles = 3;

      const seq = [currentLabel];
      let last = currentLabel;
      for (let i = 0; i < cycles; i++) {
        last = last === "Menu" ? "Close" : "Menu";
        seq.push(last);
      }
      if (last !== targetLabel) seq.push(targetLabel);
      seq.push(targetLabel);

      setTextLines(seq);
      gsap.set(inner, { yPercent: 0 });

      const lineCount = seq.length;
      const finalShift = ((lineCount - 1) / lineCount) * 100;

      textCycleAnimRef.current = gsap.to(inner, {
        yPercent: -finalShift,
        duration: dur(0.5 + lineCount * 0.07),
        ease: "power4.out",
      });
    },
    [dur]
  );

  const toggleMenu = useCallback(() => {
    const target = !openRef.current;
    openRef.current = target;
    setOpen(target);

    if (target) {
      onMenuOpen?.();
      playOpen();
    } else {
      onMenuClose?.();
      playClose();
    }

    animateIcon(target);
    animateColor(target);
    animateText(target);
  }, [playOpen, playClose, animateIcon, animateColor, animateText, onMenuOpen, onMenuClose]);

  const closeMenu = useCallback(() => {
    if (!openRef.current) return;
    openRef.current = false;
    setOpen(false);
    onMenuClose?.();
    playClose();
    animateIcon(false);
    animateColor(false);
    animateText(false);
  }, [playClose, animateIcon, animateColor, animateText, onMenuClose]);

  // 点击面板外关闭
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target) &&
        toggleBtnRef.current &&
        !toggleBtnRef.current.contains(event.target)
      ) {
        closeMenu();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, closeMenu]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeMenu]);

  const prelayerColors = colors.slice(0, 2);

  return (
    <div className="sm-scope fixed inset-0 z-40 pointer-events-none" data-open={open || undefined} style={{ "--sm-accent": accentColor }}>
      {/* 预层色块(面板入场前打底扫过) */}
      <div ref={preLayersRef} className="sm-prelayers absolute top-0 left-0 bottom-0 pointer-events-none z-[5]" aria-hidden="true">
        {prelayerColors.map((c, i) => (
          <div key={i} className="sm-prelayer absolute top-0 left-0 h-full w-full" style={{ background: c }} />
        ))}
      </div>

      {/* 白色导航面板 */}
      <aside
        id="staggered-menu-panel"
        ref={panelRef}
        className="sm-panel absolute top-0 left-0 h-full bg-white/95 flex flex-col overflow-y-auto z-10 pointer-events-auto backdrop-blur-[12px]"
        style={{ WebkitBackdropFilter: "blur(12px)" }}
        aria-hidden={!open}
      >
        <div className="sm-panel-inner flex-1 flex flex-col gap-5 pt-[5.5em] pb-6 px-8">
          <ul className="sm-panel-list list-none m-0 p-0 flex flex-col" role="list" data-numbering={displayItemNumbering || undefined}>
            {items.map((it, idx) => {
              const isActive =
                it.to === "/dashboard"
                  ? location.pathname === "/" || location.pathname.startsWith("/dashboard")
                  : location.pathname.startsWith(it.to);
              return (
                <li className="sm-panel-itemWrap relative overflow-hidden leading-none" key={it.to}>
                  <NavLink
                    to={it.to}
                    onClick={closeMenu}
                    aria-label={it.label}
                    data-index={idx + 1}
                    className={`sm-panel-item relative font-bold cursor-pointer leading-none inline-block no-underline pr-[1.4em] transition-colors duration-150 ${
                      isActive ? "text-brand" : "text-navy-700 hover:text-brand"
                    }`}
                  >
                    <span className="sm-panel-itemLabel inline-block [transform-origin:50%_100%] will-change-transform">
                      {it.label}
                    </span>
                  </NavLink>
                </li>
              );
            })}
          </ul>

          {footer && <div className="sm-panel-footer mt-auto pt-6">{footer}</div>}
        </div>
      </aside>

      {/* 固定左上角:logo + Menu/Close 切换按钮 */}
      <header className="fixed top-0 left-0 flex items-center gap-4 p-5 z-20 pointer-events-none" aria-label="Main navigation header">
        <button
          ref={toggleBtnRef}
          className="sm-toggle relative inline-flex items-center gap-[0.4rem] bg-transparent border-0 cursor-pointer font-bold leading-none overflow-visible pointer-events-auto"
          aria-label={open ? "关闭菜单" : "打开菜单"}
          aria-expanded={open}
          aria-controls="staggered-menu-panel"
          onClick={toggleMenu}
          type="button"
        >
          <span className="relative inline-block h-[1em] overflow-hidden whitespace-nowrap w-[3.2em]" aria-hidden="true">
            <span ref={textInnerRef} className="flex flex-col leading-none">
              {textLines.map((l, i) => (
                <span className="block h-[1em] leading-none text-left" key={i}>
                  {l}
                </span>
              ))}
            </span>
          </span>
          <span
            ref={iconRef}
            className="relative w-[14px] h-[14px] shrink-0 inline-flex items-center justify-center [will-change:transform]"
            aria-hidden="true"
          >
            <span
              ref={plusHRef}
              className="absolute left-1/2 top-1/2 w-full h-[2px] bg-current rounded-[2px] -translate-x-1/2 -translate-y-1/2 [will-change:transform]"
            />
            <span
              ref={plusVRef}
              className="absolute left-1/2 top-1/2 w-full h-[2px] bg-current rounded-[2px] -translate-x-1/2 -translate-y-1/2 [will-change:transform]"
            />
          </span>
        </button>
        <div className="pointer-events-auto select-none">
          <RansomLogo text="HRMS" fontPx={16} />
        </div>
      </header>

      <style>{`
.sm-scope .sm-panel,
.sm-scope .sm-prelayers { width: clamp(300px, 30vw, 420px); }
.sm-scope .sm-panel-item { font-size: clamp(1.5rem, 3.6vh, 2.2rem); padding: 0.32em 0; letter-spacing: 0.5px; }
.sm-scope .sm-panel-list[data-numbering] { counter-reset: smItem; }
.sm-scope .sm-panel-list[data-numbering] .sm-panel-item::after {
  counter-increment: smItem;
  content: counter(smItem, decimal-leading-zero);
  position: absolute;
  top: 0.45em;
  right: 0.4em;
  font-size: 13px;
  font-weight: 400;
  color: var(--sm-accent, #422AFB);
  letter-spacing: 0;
  pointer-events: none;
  user-select: none;
  opacity: var(--sm-num-opacity, 0);
}
.sm-scope .sm-toggle { font-size: 15px; }
.sm-scope .sm-toggle:focus-visible { outline: 2px solid rgba(66,42,251,0.5); outline-offset: 4px; border-radius: 4px; }
@media (max-width: 640px) {
  .sm-scope .sm-panel,
  .sm-scope .sm-prelayers { width: 100%; }
}
      `}</style>
    </div>
  );
}
