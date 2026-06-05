// 无权限页面 — 路由命中但当前用户没该 pageKey 时展示
// GSAP 动画:
//   - 盾牌 SVG 缩放 + 转动入场
//   - 锁孔 + 文案错峰 stagger
//   - 背景同心圆呼吸

import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { useMe } from "../lib/authContext.jsx";

export default function Forbidden() {
  const root = useRef(null);
  const me = useMe();

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      // 背景圆环呼吸
      gsap.to(".fb-ring", {
        scale: 1.06,
        opacity: 0.55,
        duration: 2,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        stagger: 0.3,
        transformOrigin: "center",
      });

      // 盾牌入场
      tl.from(".fb-shield", {
        scale: 0.4,
        rotate: -25,
        opacity: 0,
        duration: 0.9,
        ease: "back.out(1.6)",
        transformOrigin: "center",
      });
      tl.from(".fb-lock", {
        y: -20,
        opacity: 0,
        scale: 0.6,
        duration: 0.5,
        ease: "back.out(2)",
        transformOrigin: "center",
      }, "-=0.3");
      tl.from(".fb-line", {
        y: 14,
        opacity: 0,
        duration: 0.5,
        stagger: 0.1,
      }, "-=0.2");
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={root}
      className="min-h-[70vh] flex flex-col items-center justify-center text-center px-6 py-16"
    >
      <svg
        viewBox="0 0 240 240"
        width={220}
        height={220}
        className="select-none"
      >
        <defs>
          <linearGradient id="fb-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7B5CFF" />
            <stop offset="100%" stopColor="#422AFB" />
          </linearGradient>
        </defs>
        {/* 背景同心圆 */}
        <circle className="fb-ring" cx="120" cy="120" r="100" fill="none" stroke="#E9E4FF" strokeWidth="2" />
        <circle className="fb-ring" cx="120" cy="120" r="78" fill="none" stroke="#D9D2FB" strokeWidth="2" />
        <circle className="fb-ring" cx="120" cy="120" r="56" fill="#F4F0FF" />

        {/* 盾牌 */}
        <g className="fb-shield">
          <path
            d="M120 50 L172 70 V 122 C 172 158 148 184 120 196 C 92 184 68 158 68 122 V 70 Z"
            fill="url(#fb-grad)"
          />
          <path
            d="M120 50 L172 70 V 122 C 172 158 148 184 120 196 C 92 184 68 158 68 122 V 70 Z"
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity="0.35"
            strokeWidth="2"
          />
        </g>

        {/* 锁体 */}
        <g className="fb-lock" transform="translate(98, 100)">
          <rect x="0" y="14" width="44" height="36" rx="6" fill="#FFFFFF" />
          <path
            d="M8 14 V 8 C 8 0 16 -6 22 -6 C 28 -6 36 0 36 8 V 14"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <circle cx="22" cy="30" r="4" fill="#422AFB" />
          <rect x="20" y="32" width="4" height="10" fill="#422AFB" />
        </g>
      </svg>

      <h1 className="fb-line text-2xl font-bold text-navy-700 mt-8">
        无访问权限
      </h1>
      <p className="fb-line text-sm text-gray-700 mt-2 max-w-sm">
        {me?.email ? (
          <>当前账号 <span className="font-medium">{me.email}</span> 没有访问此页面的权限。</>
        ) : (
          <>当前账号没有访问此页面的权限。</>
        )}
      </p>
      <p className="fb-line text-xs text-gray-600 mt-1">
        如需开通,请联系系统管理员调整权限策略。
      </p>
      <div className="fb-line mt-6 flex gap-3">
        <Link
          to="/dashboard"
          className="px-4 py-2 rounded-xl bg-brand-gradient text-white text-sm font-medium shadow-button hover:shadow-button-hover active:scale-95 transition-all"
        >
          返回概览
        </Link>
        <button
          onClick={() => window.history.back()}
          className="px-4 py-2 rounded-xl bg-lightPrimary text-navy-700 text-sm font-medium hover:bg-gray-200 transition"
        >
          返回上一页
        </button>
      </div>
    </div>
  );
}
