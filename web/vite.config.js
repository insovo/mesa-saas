import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// demo.md 1.3 — proxy /api → 后端,彻底避开 CORS 在 dev 环境的复杂性。
// 生产用 Nginx 反代(阶段③ nginx.conf 的 location /api/),与此配置语义一致。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
});
