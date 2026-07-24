import {
  existsSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const pageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientRoot = path.join(pageRoot, "dist", "client");
const workerPath = path.join(pageRoot, "dist", "server", "index.js");
const indexPath = path.join(clientRoot, "index.html");

if (!existsSync(workerPath) || !existsSync(indexPath)) {
  throw new Error(
    "Sites build must contain dist/server/index.js and dist/client/index.html.",
  );
}
if (existsSync(path.join(pageRoot, "dist", "index.html"))) {
  throw new Error(
    "Root-level dist/index.html would be outside the Sites ASSETS binding.",
  );
}

const indexHtml = readFileSync(indexPath, "utf8");
const assetPaths = [...indexHtml.matchAll(/(?:src|href)="(\/[^"]+)"/gu)]
  .map((match) => match[1]);
for (const assetPath of assetPaths) {
  if (!existsSync(path.join(clientRoot, assetPath.slice(1)))) {
    throw new Error(`Built page references a missing asset: ${assetPath}`);
  }
}

const { default: worker } = await import(
  `${pathToFileURL(workerPath).href}?verify=${Date.now()}`
);
const response = await worker.fetch(
  new Request("https://example.test/", {
    headers: { accept: "text/html" },
  }),
  {
    ASSETS: {
      async fetch(request) {
        const pathname = new URL(request.url).pathname;
        if (pathname === "/") return new Response(null, { status: 404 });
        const file = path.join(clientRoot, pathname.slice(1));
        return existsSync(file)
          ? new Response(readFileSync(file), { status: 200 })
          : new Response(null, { status: 404 });
      },
    },
  },
);
if (response.status !== 200 || !(await response.text()).includes("TLI Lens")) {
  throw new Error("Sites worker did not serve the built application shell.");
}

console.log("Sites worker and dist/client assets verified.");
