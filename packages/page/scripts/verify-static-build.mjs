import {
  existsSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(pageRoot, "dist");
const indexPath = path.join(outputRoot, "index.html");

if (!existsSync(indexPath)) {
  throw new Error("Static build must contain dist/index.html.");
}
if (existsSync(path.join(outputRoot, "server", "index.js"))) {
  throw new Error("Static build still contains a retired platform worker.");
}
if (existsSync(path.join(outputRoot, "client", "index.html"))) {
  throw new Error("Static build still uses a retired platform asset layout.");
}

const indexHtml = readFileSync(indexPath, "utf8");
if (!indexHtml.includes("TLI Lens")) {
  throw new Error("Static application shell is missing the product identity.");
}

const assetPaths = [...indexHtml.matchAll(/(?:src|href)="(\/[^"]+)"/gu)]
  .map((match) => match[1]);
for (const assetPath of assetPaths) {
  if (!existsSync(path.join(outputRoot, assetPath.slice(1)))) {
    throw new Error(`Built page references a missing asset: ${assetPath}`);
  }
}

console.log("Static Vite output verified.");
