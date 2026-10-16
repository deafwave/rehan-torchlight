/** guide ideal [--live] [--out path] | live [--every M, default 60]: ideal --live every M minutes, each committed and pushed | advise <export.json> [--fe N] [--season N] [--out path] [--steps N, default 0: the next-buys list only] [--budget-minutes N, default 30] | figure <loadout.json> [--skill hoa|iceShot] [--level N]   (ideal / advise: [--prices <file>, default prices.json at the repository root when it exists: { "<item name>": FE }]; all: [--workers N] [--bombs N, default 10] [--budget-minutes N] [--roll-budget N, default 1<<20] [--target <dps-debug BOSSES key | dummy>, default cube3: what Hammer of Ash is priced against]) */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { writeAtomic } from './atomic';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mainSid } from './candidates/gems';
import { createEvaluator, DEFAULT_FIGHT } from './engine/pool';
import { localHistory, localItems, runAdvise, runIdeal } from './modes';
import { fetchSeason, fetchSnapshot, legBooks, LEG_WINDOWS, snapshotBook, withPrices } from './pricing';
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

/** your prices, laid over any book: --prices <file>, else prices.json at the repository root when it exists; the knobs say which file and how many */
function yours(): { wrap: (b: PriceBook) => PriceBook; knobs: { prices?: { file: string; overrides: number } } } {
  const file = flag('prices') ?? fileURLToPath(new URL('../../../prices.json', import.meta.url));
  if (!flag('prices') && !existsSync(file)) return { wrap: (b) => b, knobs: {} };
  const mine = readJson(file);
  if (!mine || typeof mine !== 'object' || Array.isArray(mine)) throw new Error(`${file}: expected { "<item name>": FE, ... }`);
  console.log(`prices: ${Object.keys(mine).length} item(s) from ${file}`);
  let warned = false;
  return { knobs: { prices: { file, overrides: Object.keys(mine).length } }, wrap: (b) => {
    const r = withPrices(b, mine);
    if (r.unknown.length && !warned) { warned = true; console.warn(`prices: not on etor, used as game names (check the spelling): ${r.unknown.join(', ')}`); }
    return r.book;
  } };
}

/** etor's live snapshot of the current season (between seasons: the stored season's last prices; etor down: the stored snapshot) */
async function liveBook(): Promise<PriceBook> {
  return snapshotBook(await Promise.resolve().then(async () => fetchSnapshot(num('season') ?? await fetchSeason().catch((e: Error) => { const s = Number(localItems().seasonId); console.warn(`${e.message}: using season ${s}'s last etor prices`); return s; }), localItems()))
    .catch((e: Error) => { console.warn(`live etor prices unavailable (${e.message}); using the stored snapshot`); return localItems(); }));
}
const guideJson = () => flag('out') ?? fileURLToPath(new URL('../../page/src/data/guide.json', import.meta.url));

async function main() {
  if (cmd === 'ideal') {
    const out = guideJson(), p = yours(), live = args.includes('--live');
    // last season's history, a window per leg; --live: etor's live snapshot for both legs
    const books = live ? ((b: PriceBook) => ({ iceShot: b, hoa: b }))(p.wrap(await liveBook())) : ((lb) => ({ iceShot: p.wrap(lb.iceShot), hoa: p.wrap(lb.hoa) }))(legBooks(localItems(), localHistory()));
    const ev = await evaluator();
    try { final(out, dump(await runIdeal(ev, { ...(budgetMinutes === undefined ? {} : { budgetMinutes }), ...p.knobs, ...(live ? { livePrices: true } : { priceWindows: LEG_WINDOWS }) }, books, (o) => writeAtomic(out, dump(o))))); } finally { await ev.close(); }
    console.log(`wrote ${out}`);
  } else if (cmd === 'live') {
    // the live guide: every M minutes, etor's live prices, ideal rerun (the evaluator and its saved figures stay warm), guide.json committed and pushed
    const every = num('every') ?? 60, out = guideJson(), p = yours(), repo = fileURLToPath(new URL('../../../', import.meta.url));
    const git = (...a: string[]) => execFileSync('git', ['-C', repo, ...a], { stdio: 'inherit' });
    const ev = await evaluator();
    try {
      for (;;) {
        const t = Date.now(), book = p.wrap(await liveBook());
        final(out, dump(await runIdeal(ev, { budgetMinutes: budgetMinutes ?? every, ...p.knobs, livePrices: true }, { iceShot: book, hoa: book }, (o) => writeAtomic(out, dump(o)))));
        try { git('commit', '-m', `data: live guide (etor ${book.season}, prices ${book.fetchedAt})`, '--', out); git('push'); }
        catch { console.log(new Date().toISOString(), 'live guide: nothing new to push'); }
        const wait = every * 60_000 - (Date.now() - t);
        console.log(new Date().toISOString(), `live guide refreshed in ${((Date.now() - t) / 60_000).toFixed(1)} min; next in ${Math.max(0, wait / 60_000).toFixed(1)} min`);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      }
    } finally { await ev.close(); }
  } else if (cmd === 'auto') {
    // your own plan with no pasting: every M minutes dps-debug's reader/export.py reads the running game (elevated shell), advise prices the next buys on
    // it, and packages/page/src/data/advice.json is committed and pushed (the page shows it first); a failed read is logged and tried again next round
    const every = num('every') ?? 30, repo = fileURLToPath(new URL('../../../', import.meta.url)), out = resolve(repo, 'packages/page/src/data/advice.json');
    const dd = flag('dps-debug') ?? fileURLToPath(new URL('../../../../dps-debug/', import.meta.url)), mine = yours();
    const git = (...a: string[]) => execFileSync('git', ['-C', repo, ...a], { stdio: 'inherit' });
    const ev = await evaluator();
    try {
      for (;;) {
        const t = Date.now();
        try {
          const line = execFileSync('python', ['-I', resolve(dd, 'reader/export.py'), '--no-clipboard'], { cwd: dd, encoding: 'utf8' }).trim().split(/\r?\n/).at(-1)!;
          const path = line.split(' items=')[0].trim();
          const state = fromExport(readJson(path), num('fe')), book = mine.wrap(await liveBook());   // --fe N: plan on N FE instead of the read FE
          final(out, dump(await runAdvise(ev, state, { budgetMinutes: budgetMinutes ?? 20, maxSteps: num('steps') ?? 0, ...mine.knobs }, book, (o) => writeAtomic(out, dump(o)))));
          try { git('add', out); git('commit', '-m', `data: your plan from the live game (L${state.level}, etor ${book.fetchedAt})`, '--', out); git('push'); }
          catch { console.log(new Date().toISOString(), 'auto: nothing new to push'); }
        } catch (e) { console.log(new Date().toISOString(), `auto: no plan this round: ${(e as Error).message.split(/\r?\n/).filter(Boolean).slice(-1)[0]}`); }
        const wait = every * 60_000 - (Date.now() - t);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      }
    } finally { await ev.close(); }
  } else if (cmd === 'advise') {
    if (!positional) throw new Error('usage: guide advise <export.json> [--fe N] [--out path]');
    const state = fromExport(readJson(positional), num('fe'));
    const mine = yours(), prices = { knobs: mine.knobs, book: mine.wrap(await liveBook()) };
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
    throw new Error('usage: guide ideal [--live] | live [--every M] | advise <export.json> | figure <loadout.json>');
  }
}
main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
