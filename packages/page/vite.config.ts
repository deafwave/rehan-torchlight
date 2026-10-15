import { defineConfig } from "vite";

// Single page at /. Live prices: same-origin proxy to ETOR (vercel.json rewrites it in production).
export default defineConfig({
  server: { proxy: { "/etor-api": { target: "https://etor-beta.710421059.xyz", changeOrigin: true } } },
});
