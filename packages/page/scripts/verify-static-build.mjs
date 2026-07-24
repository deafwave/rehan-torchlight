import {
  existsSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(pageRoot, "dist");
const indexPath = path.join(outputRoot, "index.html");
const rehanPath = path.join(outputRoot, "rehan.html");
const bingPath = path.join(outputRoot, "bing.html");

if (!existsSync(indexPath)) {
  throw new Error("Static build must contain dist/index.html.");
}
if (!existsSync(rehanPath)) {
  throw new Error("Static build must contain dist/rehan.html.");
}
if (!existsSync(bingPath)) {
  throw new Error("Static build must contain dist/bing.html.");
}
if (existsSync(path.join(outputRoot, "server", "index.js"))) {
  throw new Error("Static build still contains a retired platform worker.");
}
if (existsSync(path.join(outputRoot, "client", "index.html"))) {
  throw new Error("Static build still uses a retired platform asset layout.");
}

const pages = [
  { path: indexPath, mustInclude: "TLI Lens" },
  { path: rehanPath, mustInclude: "Rehan" },
  { path: bingPath, mustInclude: "Bing" },
];

for (const { path: pagePath, mustInclude } of pages) {
  const html = readFileSync(pagePath, "utf8");
  if (!html.includes(mustInclude)) {
    throw new Error(`Static shell ${path.basename(pagePath)} is missing expected identity (${mustInclude}).`);
  }
  const assetPaths = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/gu)]
    .map((match) => match[1])
    .filter((assetPath) => assetPath.startsWith("/assets/") || assetPath === "/favicon.svg" || assetPath === "/og.png");
  for (const assetPath of assetPaths) {
    if (!existsSync(path.join(outputRoot, assetPath.slice(1)))) {
      throw new Error(`Built page ${path.basename(pagePath)} references a missing asset: ${assetPath}`);
    }
  }
}

console.log("Static Vite output verified (index + rehan + bing).");
