import { defineConfig } from "vite";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

// The generic comparison workspace is now the product entrypoint. The previous
// character-specific HTML files remain in source history while their calculators are
// migrated behind explicit, guarded build profiles.
export default defineConfig({
  // Sites binds static files from dist/client and executes dist/server/index.js.
  // Clean the shared dist root first so a previous root-level Vite build cannot
  // be packaged as a successful deployment with an empty ASSETS binding.
  build: {
    outDir: resolve(__dirname, "dist", "client"),
    emptyOutDir: true,
  },
  plugins: [{
    name: "tli-lens-sites-worker",
    buildStart() {
      rmSync(resolve(__dirname, "dist"), { recursive: true, force: true });
    },
    closeBundle() {
      const serverDir = resolve(__dirname, "dist", "server");
      mkdirSync(serverDir, { recursive: true });
      copyFileSync(resolve(__dirname, "worker", "index.js"), resolve(serverDir, "index.js"));
    },
  }],
});
