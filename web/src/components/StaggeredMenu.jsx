// MESA Recruit · StaggeredMenu 左侧导航(移植自 React Bits StaggeredMenu)
//   - GSAP 驱动:预层色块先行 + 白色面板跟进 + 菜单项 stagger 飞入(符合项目「动画只用 GSAP」约定)
//   - 开关控件:关闭态 = 左上角固定图标按钮;展开态 = 面板内右上角开/关图标(随面板滑入)
//   - 菜单展开时通过 onMenuOpen/onMenuClose 通知 Layout 把主内容区推开(非 overlay 覆盖)
//   - 菜单项 = 原 Sidebar 导航(权限过滤后由调用方传入),NavLink SPA 跳转,点击后收起
//   - prefers-reduced-motion:动画时长归零(等效瞬时开合)

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { gsap } from "gsap";
import { I } from "./Primitives.jsx";
import RansomLogo from "./RansomLogo.jsx";

// 面板宽度 — Layout 推开内容区时用同一值(改动需两处同步)
export const MENU_PANEL_WIDTH = "clamp(240px, 19vw, 300px)";

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function StaggeredMenu({
  items = [],
  colors = ["#B5A6FF", "#422AFB"],
  accentColor = "#422AFB",
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

  const openTlRef = useRef(null);
  const closeTweenRef = useRef(null);

  const openBtnRef = useRef(null);
  const busyRef = useRef(false);

  // reduced-motion 时所有时长乘 0 → 瞬时开合
  const dur = useCallback((v) => (prefersReducedMotion() ? 0 : v), []);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const panel = panelRef.current;
      const preContainer = preLayersRef.current;
      if (!panel) return;

      let preLayers = [];
      if (preContainer) {
        preLayers = Array.from(preContainer.querySelectorAll(".sm-prelayer"));
      }
      preLayerElsRef.current = preLayers;

      gsap.set([panel, ...preLayers], { xPercent: -100, opacity: 1 });
    });
    return () => ctx.revert();
  }, []);

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
    const footerEl = panel.querySelector(".sm-panel-footer");

    if (itemEls.length) gsap.set(itemEls, { yPercent: 140, rotate: 10 });
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
        const footerEl = panel.querySelector(".sm-panel-footer");
        if (footerEl) gsap.set(footerEl, { y: 25, opacity: 0 });
        busyRef.current = false;
      },
    });
  }, [dur]);

  const openMenu = useCallback(() => {
    if (openRef.current) return;
    openRef.current = true;
    setOpen(true);
    onMenuOpen?.();
    playOpen();
  }, [playOpen, onMenuOpen]);

  const closeMenu = useCallback(() => {
    if (!openRef.current) return;
    openRef.current = false;
    setOpen(false);
    onMenuClose?.();
    playClose();
  }, [playClose, onMenuClose]);

  // 点击面板外关闭
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target) &&
        openBtnRef.current &&
        !openBtnRef.current.contains(event.target)
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
        className="sm-panel absolute top-0 left-0 h-full bg-white flex flex-col overflow-y-auto z-10 pointer-events-auto shadow-sidebar"
        aria-hidden={!open}
      >
        {/* 面板内右上角:收起按钮(开/关图标,随面板滑入滑出) */}
        <button
          onClick={closeMenu}
          className="absolute top-5 right-5 w-9 h-9 rounded-full bg-lightPrimary hover:bg-gray-200 flex items-center justify-center text-gray-700 hover:text-brand transition"
          aria-label="收起菜单"
          title="收起菜单"
          type="button"
        >
          <I name="panel-left-close" size={18} />
        </button>

        <div className="sm-panel-inner flex-1 flex flex-col gap-5 pt-5 pb-6 px-7">
          {/* 面板品牌头:HRMS logo 随面板滑入(原固定顶栏 logo 移入此处) */}
          <div className="sm-panel-brand flex items-center min-h-[36px] pr-12 select-none">
            <RansomLogo text="HRMS" fontPx={20} />
          </div>

          <ul className="sm-panel-list list-none m-0 p-0 flex flex-col" role="list">
            {items.map((it) => {
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
                    className={`sm-panel-item relative font-bold cursor-pointer leading-none inline-block no-underline transition-colors duration-150 ${
                      isActive ? "text-brand" : "text-navy-700 hover:text-brand"
                    }`}
                  >
                    {/* 图标和文字都放进 itemLabel,GSAP stagger 时一起飞入 */}
                    <span className="sm-panel-itemLabel inline-flex items-center gap-3 [transform-origin:50%_100%] will-change-transform">
                      <span className="inline-flex w-5 shrink-0 items-center justify-center" aria-hidden="true">
                        <I name={it.icon} size={20} />
                      </span>
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

      {/* 固定左上角:展开按钮(菜单关闭时可见;logo 已移入面板内) */}
      <header className="fixed top-0 left-0 flex items-center p-5 z-20 pointer-events-none" aria-label="Main navigation header">
        <button
          ref={openBtnRef}
          onClick={openMenu}
          className={`w-9 h-9 rounded-full bg-white shadow-card flex items-center justify-center text-gray-700 hover:text-brand transition-all duration-300 ${
            open ? "opacity-0 pointer-events-none -translate-x-2" : "opacity-100 pointer-events-auto"
          }`}
          aria-label="展开菜单"
          aria-expanded={open}
          aria-controls="staggered-menu-panel"
          title="展开菜单"
          type="button"
        >
          <I name="panel-left-open" size={18} />
        </button>
      </header>

      <style>{`
.sm-scope .sm-panel,
.sm-scope .sm-prelayers { width: ${MENU_PANEL_WIDTH}; }
.sm-scope .sm-panel-item { font-size: clamp(1.1rem, 2.6vh, 1.5rem); padding: 0.38em 0; letter-spacing: 0.5px; }
@media (max-width: 640px) {
  .sm-scope .sm-panel,
  .sm-scope .sm-prelayers { width: 100%; }
}
      `}</style>
    </div>
  );
}
