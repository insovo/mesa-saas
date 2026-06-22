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
    build: {
      // 把第三方库按归属切成稳定 vendor chunk:它们极少变动,业务代码频繁迭代,
      // 分开后每次部署用户只需重新下载变化的业务 chunk,长期缓存命中率更高。
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("react-router") || id.includes("/react-dom/") || id.includes("/react/") || id.includes("/scheduler/")) return "react-vendor";
            if (id.includes("recharts") || id.includes("/d3-") || id.includes("/victory")) return "charts";
            if (id.includes("/gsap") || id.includes("@gsap/")) return "gsap";
            if (id.includes("@dnd-kit")) return "dnd";
            if (id.includes("lucide-react")) return "icons";
            if (id.includes("/axios/")) return "axios";
            return "vendor";
          },
        },
      },
    },
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
