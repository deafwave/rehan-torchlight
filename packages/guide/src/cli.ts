/** guide ideal [--out path] | advise <export.json> [--fe N] [--season N] [--out path] [--steps N, default 0: the next-buys list only] [--budget-minutes N, default 30] | figure <loadout.json> [--skill hoa|iceShot] [--level N]   (ideal / advise: [--prices <file>, default prices.json at the repository root when it exists: { "<item name>": FE }]; all: [--workers N] [--bombs N, default 10] [--budget-minutes N] [--roll-budget N, default 1<<20] [--target <dps-debug BOSSES key | dummy>, default cube3: what Hammer of Ash is priced against]) */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { writeAtomic } from './atomic';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mainSid } from './candidates/gems';
import { createEvaluator, DEFAULT_FIGHT } from './engine/pool';
import { localHistory, localItems, runAdvise, runIdeal } from './modes';
import { fetchSeason, fetchSnapshot, historyBook, snapshotBook, withPrices } from './pricing';
import { fromExport } from './start';
import type { GuideOut, PriceBook, Skill } from './types';

const [cmd, ...args] = process.argv.slice(2);
/** a path the caller typed, from the caller's directory (`pnpm guide` runs in packages/guide; pnpm keeps the caller's in INIT_CWD) */
const at = (p: string | undefined) => (p === undefined ? undefined : resolve(process.env.INIT_CWD ?? process.cwd(), p));
const flag = (name: string) => { const i = args.indexOf(`--${name}`); const v = i < 0 ? undefined : args[i + 1]; return ['out', 'prices'].includes(name) ? at(v) : v; };
const positional = at(args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')));
const num = (name: string) => { const v = flag(name); if (v !== undefined && !Number.isFinite(Number(v))) throw new Error(`--${name} needs a number`); return v === undefined ? undefined : Number(v); };
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const bombs = num('bombs');
const rollBudget = num('roll-budget');
const budgetMinutes = num('budget-minutes');
const final = (f: string, text: string) => { if (!writeAtomic(f, text)) throw new Error(`could not write ${f}`); };
const dump = (o: GuideOut) => JSON.stringify(o, null, 1) + '\n';
const evaluator = () => createEvaluator({ workers: num('workers'),
  onBusy: (p) => console.log(p ? 'game busy: evaluator paused' : 'game free: evaluator resumed'), ...(rollBudget === undefined ? {} : { rollBudget }), ...(flag('target') === undefined ? {} : { target: flag('target') === 'dummy' ? null : flag('target') }), ...(bombs === undefined ? {} : { fight: { ...DEFAULT_FIGHT, bombs } }), memoDir: fileURLToPath(new URL('../.cache/memo', import.meta.url)) });

/** your prices over a book: --prices <file>, else prices.json at the repository root when it exists; the knobs say which file and how many */
function yours(b: PriceBook): { book: PriceBook; knobs: { prices?: { file: string; overrides: number } } } {
  const file = flag('prices') ?? fileURLToPath(new URL('../../../prices.json', import.meta.url));
  if (!flag('prices') && !existsSync(file)) return { book: b, knobs: {} };
  const mine = readJson(file);
  if (!mine || typeof mine !== 'object' || Array.isArray(mine)) throw new Error(`${file}: expected { "<item name>": FE, ... }`);
  const r = withPrices(b, mine);
  if (r.unknown.length) console.warn(`prices: not on etor, used as game names (check the spelling): ${r.unknown.join(', ')}`);
  console.log(`prices: ${Object.keys(mine).length} item(s) from ${file}`);
  return { book: r.book, knobs: { prices: { file, overrides: Object.keys(mine).length } } };
}

async function main() {
  if (cmd === 'ideal') {
    const out = flag('out') ?? fileURLToPath(new URL('../../page/src/data/guide.json', import.meta.url));
    const p = yours(historyBook(localItems(), localHistory()));
    const ev = await evaluator();
    try { final(out, dump(await runIdeal(ev, { ...(budgetMinutes === undefined ? {} : { budgetMinutes }), ...p.knobs }, p.book, (o) => writeAtomic(out, dump(o))))); } finally { await ev.close(); }
    console.log(`wrote ${out}`);
  } else if (cmd === 'advise') {
    if (!positional) throw new Error('usage: guide advise <export.json> [--fe N] [--out path]');
    const state = fromExport(readJson(positional), num('fe'));
    const prices = yours(snapshotBook(await Promise.resolve().then(async () => fetchSnapshot(num('season') ?? await fetchSeason().catch((e: Error) => { const s = Number(localItems().seasonId); console.warn(`${e.message}: using season ${s}'s last etor prices`); return s; }), localItems())).catch((e: Error) => { console.warn(`live etor prices unavailable (${e.message}); using the stored snapshot`); return localItems(); })));
    const ev = await evaluator();
    const out = flag('out') ?? 'advice.json';
    // the export button waits on this: by default the next-buys list only (every upgrade's exact gain, ranked on the page by your prices); --steps N adds a
    // multi-step plan at etor prices, stopped after --budget-minutes (default 30; the page shows a partial run)
    try { final(out, dump(await runAdvise(ev, state, { budgetMinutes: budgetMinutes ?? 30, maxSteps: num('steps') ?? 0, ...prices.knobs }, prices.book, (o) => writeAtomic(out, dump(o))))); } finally { await ev.close(); }
    // UTF-8 through an env-named file, as reader/export.py does, so non-ASCII names survive
    execFileSync('powershell', ['-NoProfile', '-Command', 'Set-Clipboard -Value ([IO.File]::ReadAllText($env:ADVICE_FILE, [Text.Encoding]::UTF8))'], { env: { ...process.env, ADVICE_FILE: out } });
    console.log(`wrote ${out} and copied it to the clipboard`);
  } else if (cmd === 'figure') {
    if (!positional) throw new Error('usage: guide figure <loadout.json> [--skill hoa|iceShot] [--level N]');
    const loadout = readJson(positional);
    const main0 = (loadout.skills as { sid: number; place: { kind: string; slot: number } }[] | undefined)?.find((g) => g.place.kind === 'active' && g.place.slot === 0);
    const skill = (flag('skill') ?? (['hoa', 'iceShot'] as Skill[]).find((s) => mainSid(s) === main0?.sid)) as Skill | undefined;
    if (skill !== 'hoa' && skill !== 'iceShot') throw new Error('cannot tell the main skill; pass --skill hoa|iceShot');
    const ev = await evaluator();
    try {
      const r = await ev.run(loadout, [], { level: num('level') ?? loadout.hero?.level ?? 100, skill });
      console.log(JSON.stringify({ pin: ev.pin, skill, figure: r.figure, inputs: r.inputs }, null, 1));
    } finally { await ev.close(); }
  } else {
    throw new Error('usage: guide ideal | advise <export.json> | figure <loadout.json>');
  }
}
main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
