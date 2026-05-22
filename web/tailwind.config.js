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
        sidebar: "2px 0 30px rgba(112,144,176,0.06)",
        button: "0 4px 14px rgba(66,42,251,0.18)",
      },
      borderRadius: {
        card: "20px",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #868CFF 0%, #432CF3 50%, #422AFB 100%)",
        "brand-gradient-v": "linear-gradient(180deg, #868CFF 0%, #422AFB 100%)",
      },
    },
  },
  plugins: [],
};
