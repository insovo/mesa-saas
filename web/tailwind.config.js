/** @type {import('tailwindcss').Config} */
// 与 ui_kits/mesa-recruit/index.html 的 inline tailwind.config 保持一致的设计令牌。
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#422AFB",
          50: "#E9E3FF",
          100: "#C0B8FE",
          200: "#A195FD",
          300: "#8171FC",
          400: "#7551FF",
          500: "#422AFB",
          600: "#3311DB",
          700: "#2111A5",
          800: "#190793",
          900: "#11047A",
          hover: "#3311DB",
          active: "#2111A5",
          linear: "#868CFF",
        },
        navy: {
          50: "#D0DCFB",
          100: "#AAC0FE",
          200: "#A3B9F8",
          300: "#728FEA",
          400: "#3652BA",
          500: "#1B3BBB",
          600: "#24388A",
          700: "#1B254B",
          800: "#111C44",
          900: "#0B1437",
        },
        gray: {
          50: "#F8F9FA",
          100: "#EDF2F7",
          200: "#E9ECEF",
          300: "#CBD5E0",
          400: "#A0AEC0",
          500: "#ADB5BD",
          600: "#A3AED0",
          700: "#707EAE",
          800: "#252F40",
          900: "#1B2559",
        },
        lightPrimary: "#F4F7FE",
        // 活力辅助色 — 与品牌紫蓝互补,克制点缀(图表/状态/强调),不喧宾夺主
        accent: {
          cyan: "#06B6D4",
          teal: "#14B8A6",
          emerald: "#22C55E",
          amber: "#F59E0B",
          rose: "#F43F5E",
          fuchsia: "#D946EF",
          violet: "#8B5CF6",
          sky: "#3B82F6",
        },
      },
      fontFamily: {
        sans: ["DM Sans", "ui-sans-serif", "system-ui", "PingFang SC", "Microsoft YaHei", "sans-serif"],
        display: ["Poppins", "DM Sans", "sans-serif"],
        accent: ["Gill Sans Nova", "DM Sans", "Georgia", "serif"],
      },
      fontSize: {
        "page-title": ["33px", { lineHeight: "1.2", letterSpacing: "-0.5px", fontWeight: "700" }],
      },
      boxShadow: {
        card: "14px 17px 40px 4px rgba(112,144,176,0.08)",
        "card-hover": "0 24px 50px -12px rgba(112,144,176,0.28), 0 8px 20px -8px rgba(66,42,251,0.12)",
        "card-soft": "0 8px 30px rgba(112,144,176,0.10)",
        sidebar: "2px 0 30px rgba(112,144,176,0.06)",
        button: "0 4px 14px rgba(66,42,251,0.18)",
        "button-hover": "0 10px 28px rgba(66,42,251,0.36)",
        glow: "0 0 0 1px rgba(66,42,251,0.08), 0 8px 24px -6px rgba(66,42,251,0.32)",
        "glow-lg": "0 0 40px -8px rgba(66,42,251,0.45)",
        "inner-top": "inset 0 1px 0 0 rgba(255,255,255,0.6)",
      },
      borderRadius: {
        card: "20px",
        "2xl": "16px",
        "3xl": "24px",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #868CFF 0%, #432CF3 50%, #422AFB 100%)",
        "brand-gradient-v": "linear-gradient(180deg, #868CFF 0%, #422AFB 100%)",
        // 更大胆活力的渐变 — 用于强调卡片 / hero / 公开页背景
        "aurora": "linear-gradient(120deg, #422AFB 0%, #7C3AED 38%, #D946EF 70%, #06B6D4 100%)",
        "sunset": "linear-gradient(120deg, #F43F5E 0%, #F59E0B 100%)",
        "ocean": "linear-gradient(120deg, #06B6D4 0%, #3B82F6 55%, #8B5CF6 100%)",
        "iris": "linear-gradient(135deg, #868CFF 0%, #422AFB 45%, #C026D3 100%)",
        "mesh-light": "radial-gradient(at 0% 0%, rgba(134,140,255,0.20) 0px, transparent 50%), radial-gradient(at 98% 2%, rgba(217,70,239,0.14) 0px, transparent 45%), radial-gradient(at 50% 100%, rgba(6,182,212,0.12) 0px, transparent 50%)",
        "shimmer": "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.55) 50%, transparent 100%)",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(24px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "gradient-x": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(66,42,251,0.35)" },
          "50%": { boxShadow: "0 0 24px 4px rgba(66,42,251,0.18)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "aurora-drift": {
          "0%, 100%": { transform: "translate(0,0) scale(1)" },
          "33%": { transform: "translate(4%,-3%) scale(1.06)" },
          "66%": { transform: "translate(-3%,4%) scale(0.97)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
        "scale-in": "scale-in 0.4s cubic-bezier(0.16,1,0.3,1) both",
        "slide-in-right": "slide-in-right 0.45s cubic-bezier(0.16,1,0.3,1) both",
        float: "float 6s ease-in-out infinite",
        "gradient-x": "gradient-x 6s ease infinite",
        "glow-pulse": "glow-pulse 2.4s ease-in-out infinite",
        "aurora-drift": "aurora-drift 18s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
