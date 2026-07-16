/* Python-compat helpers: outputs must stay bit-comparable with the retired
   Python pipeline (goldens were captured from it). */
import { fileURLToPath } from "node:url";
import path from "node:path";

/* repo root, CWD-independent (vitest runs with CWD=packages/dmg) */
export const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
export const fromRoot = (...p: string[]) => path.join(ROOT, ...p);

/* Python round(): round-half-to-even */
export function pyRound(x: number, nd = 0): number {
  const m = 10 ** nd;
  const y = x * m;
  const f = Math.floor(y);
  const diff = y - f;
  if (diff > 0.5) return (f + 1) / m;
  if (diff < 0.5) return f / m;
  return (f % 2 === 0 ? f : f + 1) / m;
}

/* Python f"{v:g}": 6 significant digits, trailing zeros stripped */
export function pyG(v: number): string {
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
  return String(parseFloat(v.toPrecision(6)));
}

export const deepCopy = <T>(x: T): T => structuredClone(x);

/* Python json.dumps(ensure_ascii=True): \uXXXX-escape all non-ASCII */
export const asciiJson = (value: unknown, indent?: number): string =>
  JSON.stringify(value, null, indent)
    .replace(/[\u007f-\uffff]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
