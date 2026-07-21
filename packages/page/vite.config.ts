import { defineConfig } from "vite";
import { resolve } from "node:path";

// Multi-page: emit both the Rehan page (index.html) and the Bing - HoA page (bing.html).
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        bing: resolve(__dirname, "bing.html"),
      },
    },
  },
});
