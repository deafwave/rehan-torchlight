import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const outputRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const indexPath = path.join(outputRoot, "index.html");
if (!existsSync(indexPath)) throw new Error("Static build must contain dist/index.html.");
const html = readFileSync(indexPath, "utf8");
if (!html.includes("TLI Lens")) throw new Error("dist/index.html is missing expected identity (TLI Lens).");
for (const [, assetPath] of html.matchAll(/(?:src|href)="(\/[^"]+)"/gu)) {
  if ((assetPath.startsWith("/assets/") || assetPath === "/favicon.svg" || assetPath === "/og.png")
    && !existsSync(path.join(outputRoot, assetPath.slice(1)))) {
    throw new Error(`Built page references a missing asset: ${assetPath}`);
  }
}
console.log("Static Vite output verified (index).");
