/** Figure memo keyed by pin + skill + level + canonical JSON of (loadout, changes). In-process always; on disk only when the pin is clean. */
import { FIRST_ROLL_BUDGET } from './apply';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** JSON with object keys sorted, so equal values give equal text */
export function canonical(v: unknown): string {
  return JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x);
}

export const memoKey = (pin: string, skill: string, level: number, loadout: unknown, changes: unknown, fight: unknown, rollBudget: number, target?: string): string =>
  `v11|${pin}|${skill}|${level}|${target ?? 'dummy'}|${canonical([loadout, changes, fight, FIRST_ROLL_BUDGET, rollBudget])}`;

export const DEFAULT_MEMO_ENTRIES = 20000;
/** `max`: settled results kept in memory (least recently used leave first; in-flight computations are always kept) */
export function createMemo<T>(pin: string, dir?: string, max = DEFAULT_MEMO_ENTRIES) {
  const inflight = new Map<string, Promise<T>>(), settled = new Map<string, Promise<T>>();
  // a +dirty pin names no fixed tree: never persisted
  const disk = dir && !pin.endsWith('+dirty') ? dir : undefined;
  const file = (hash: string) => join(disk!, `${hash}.json`);
  return {
    /** the memoised value for `key`, else `compute()` (concurrent callers share one computation). `keep: false` = answer the caller, cache nowhere. */
    async get(key: string, compute: () => Promise<{ v: T; keep: boolean }>): Promise<T> {
      const h = createHash('sha256').update(key).digest('hex');   // the memory key too: a full key is megabytes of loadout JSON
      const hit = inflight.get(h) ?? settled.get(h);
      if (hit) { if (settled.delete(h)) settled.set(h, hit); return hit; }   // a settled hit becomes the most recent
      let cached = true;
      const p = (async () => {
        if (disk && existsSync(file(h))) {
          try { return JSON.parse(readFileSync(file(h), 'utf8')) as T; } catch { /* torn or corrupt file: a miss */ }
        }
        const { v, keep } = await compute();
        cached = keep;
        if (disk && keep) {
          mkdirSync(disk, { recursive: true });
          const tmp = `${file(h)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
          writeFileSync(tmp, JSON.stringify(v)); renameSync(tmp, file(h));
        }
        return v;
      })();
      inflight.set(h, p);
      p.then(() => {
        inflight.delete(h);
        if (!cached) return;
        settled.set(h, p);
        while (settled.size > max) settled.delete(settled.keys().next().value!);
      }, () => inflight.delete(h));
      return p;
    },
  };
}
