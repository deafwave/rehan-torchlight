/** The pinned dps-debug checkout (read-only) and its extracted catalog; the one place that finds either. */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** env DPS_DEBUG_PIN, else walk up from this module's directory until `<ancestor>/dps-debug/.worktrees/tli-lens-pin` exists
 *  (works from the main checkout and from `.worktrees/<t>`); throws `dps-debug pin not found (set DPS_DEBUG_PIN)` */
export function pinRoot(): string {
  if (process.env.DPS_DEBUG_PIN) return process.env.DPS_DEBUG_PIN;
  for (let d = dirname(fileURLToPath(import.meta.url)); dirname(d) !== d; d = dirname(d)) {
    const p = join(d, 'dps-debug', '.worktrees', 'tli-lens-pin');
    if (existsSync(p)) return p;
  }
  throw new Error('dps-debug pin not found (set DPS_DEBUG_PIN)');
}

/** `<pinRoot>/catalog/0x6aa39847` (the client build the pin's catalog is extracted from) */
export function catalogDir(): string { return join(pinRoot(), 'catalog', '0x6aa39847'); }

const tables = new Map<string, unknown>();
/** catalog table `name` at its highest revision (`name.json`, `name.r2.json`, … → the largest rN), JSON-parsed once per process */
export function table<T = unknown>(name: string): T {
  if (!tables.has(name)) {
    const dir = catalogDir(), re = new RegExp(`^${name}(?:\\.r(\\d+))?\\.json$`);
    const rev = (f: string) => { const m = re.exec(f); return m ? Number(m[1] ?? 1) : 0; };
    const best = readdirSync(dir).filter(f => rev(f) > 0).sort((a, b) => rev(b) - rev(a))[0];
    if (!best) throw new Error(`catalog table ${name} not found in ${dir}`);
    tables.set(name, JSON.parse(readFileSync(join(dir, best), 'utf8')));
  }
  return tables.get(name) as T;
}

let commit: string | undefined;
/** `git rev-parse HEAD` of the pin, read once */
export function pinCommit(): string {
  return commit ??= execFileSync('git', ['-c', 'safe.directory=*', '-C', pinRoot(), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}
