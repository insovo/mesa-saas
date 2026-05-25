import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// demo.md 1.3 — proxy /api → 后端,彻底避开 CORS 在 dev 环境的复杂性。
// 生产用 Nginx 反代(阶段③ nginx.conf 的 location /api/),与此配置语义一致。
//
// 端口可通过 web/.env 覆盖(多 worktree 并行用,详见 .worktree-ports.json):
//   VITE_DEV_PORT=5183     # 前端 dev server 端口(默认 5173)
//   VITE_API_PORT=3011     # 后端 API 端口(默认 3001),用于 proxy /api target
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const devPort = Number(env.VITE_DEV_PORT) || 5173;
  const apiPort = Number(env.VITE_API_PORT) || 3001;
  return {
    plugins: [react()],
    server: {
      port: devPort,
      host: "127.0.0.1",
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
