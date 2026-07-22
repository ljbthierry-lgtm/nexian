import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Front-end build → dist/web (served by the Worker as static assets).
// `npm run dev:web` proxies /api and /a to a locally running `wrangler dev`.
export default defineConfig({
  plugins: [react()],
  root: "src/web",
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
    // dist/web is served publicly by the Worker, so a sourcemap here is a
    // half-megabyte download shipped to every visitor. Build with
    // `vite build --sourcemap` when debugging a production bundle.
    sourcemap: false,
  },
  server: {
    port: 5174,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/a": "http://127.0.0.1:8787",
    },
  },
});
