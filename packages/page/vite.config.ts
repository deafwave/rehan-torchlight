import { defineConfig } from "vite";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

// The generic comparison workspace is now the product entrypoint. The previous
// character-specific HTML files remain in source history while their calculators are
// migrated behind explicit, guarded build profiles.
export default defineConfig({
  plugins: [{
    name: "tli-lens-sites-worker",
    closeBundle() {
      const serverDir = resolve(__dirname, "dist", "server");
      mkdirSync(serverDir, { recursive: true });
      copyFileSync(resolve(__dirname, "worker", "index.js"), resolve(serverDir, "index.js"));
    },
  }],
});
