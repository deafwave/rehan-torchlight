import { defineConfig, type Plugin } from "vite";
import { resolve } from "node:path";

/** Map clean guide URLs to multi-page HTML entries during `vite dev`. */
function guideCleanUrls(): Plugin {
  const map: Record<string, string> = {
    "/rehan": "/rehan.html",
    "/rehan/": "/rehan.html",
    "/bing": "/bing.html",
    "/bing/": "/bing.html",
  };
  return {
    name: "guide-clean-urls",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const pathOnly = req.url?.split("?", 1)[0] ?? "";
        const dest = map[pathOnly];
        if (dest) {
          const qs = req.url?.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
          req.url = dest + qs;
        }
        next();
      });
    },
  };
}

// Multi-page: TLI Lens at /, character guides at /rehan and /bing (clean URLs via
// vercel rewrites in prod and the middleware above in dev).
export default defineConfig({
  plugins: [guideCleanUrls()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        rehan: resolve(__dirname, "rehan.html"),
        bing: resolve(__dirname, "bing.html"),
      },
    },
  },
});
