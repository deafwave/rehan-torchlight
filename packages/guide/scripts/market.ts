/** The market search on screen ranked by what it costs to finish: listing price + the expected crafting left to have every wanted mod at T1
 *  (market-targets.json at the repository root, by base name; each missing T1 at craftStep's expected embers at etor prices, cached 30 minutes). No damage figures: fast.
 *  A slate search (listings with talents) is ranked instead by the model's damage gain of the listing's talents in place of one of your slates (the best one
 *  named; the owner rebuilds the board around the slates bought, so the shape is not held to the replaced one's; --same-shape holds it)
 *  (--export <export.json>, default the newest dps-debug game/exports read). A listing is priced in place of your weakest slate (the one whose removal costs
 *  least) and of any slate sharing one of its talents; --exact prices it in place of every slate (6x the figures).
 *  --watch: keep running, re-read the screen every 2 s and rank again when the listings change (the workers and prices stay warm).
 *  usage (repo root, elevated shell, game running, a market search open): pnpm guide:market [--top N] [--watch] [--workers N, default 8] [--exact] [--file <saved listings.json>] [--export <export.json>] */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeAtomic } from '../src/atomic';
import { craftStep } from '../src/candidates/gear';
import { localItems } from '../src/modes';
import { fetchSeason, fetchSnapshot, snapshotBook, type EtorItems } from '../src/pricing';
import { table } from '../src/pin';
import { replaceSlate } from '../src/candidates/slates';
import { createEvaluator } from '../src/engine/pool';
import { talentName } from '../src/names';
import { rankable, ctxOfState } from '../src/search';
import { fromExport } from '../src/start';
import { DEFAULT_PLAN } from '../src/plan';
import type { Evaluator } from '../src/types';

type Aff = { id: number; tier: number; text: string };
type Listing = { n: number; price: number; priceType: number; baseId: number; level: number; prefix: Aff[]; suffix: Aff[]; talents?: number[]; shapeId?: number };
const root = fileURLToPath(new URL('../../../', import.meta.url));
const argv = process.argv, has = (f: string) => argv.includes(`--${f}`), arg = (f: string) => (has(f) ? argv[argv.indexOf(`--${f}`) + 1] : undefined);
const top = Number(arg('top')) || 8, watch = has('watch'), exact = has('exact'), same = has('same-shape');
const file = arg('file') && resolve(process.env.INIT_CWD ?? process.cwd(), arg('file')!);   // --file <listings.json>: a saved read instead of the live game
const screen = () => (file ? readFileSync(file, 'utf8') : execFileSync('python', [`${root}scripts/market_listings.py`], { encoding: 'utf8', maxBuffer: 64 << 20 }));

/** etor's live snapshot, kept on disk and fetched again once it is 30 minutes old (etor down: the old one, said so) */
const SNAPSHOT = `${root}packages/guide/.cache/etor-snapshot.json`, SNAPSHOT_MS = 30 * 60_000;
async function prices(): Promise<EtorItems> {
  if (existsSync(SNAPSHOT) && Date.now() - statSync(SNAPSHOT).mtimeMs < SNAPSHOT_MS) return JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  try { const s = await fetchSnapshot(await fetchSeason(), localItems()); writeAtomic(SNAPSHOT, JSON.stringify(s)); return s; }
  catch (e) { if (!existsSync(SNAPSHOT)) throw e; console.warn(`etor unavailable (${(e as Error).message}): prices from ${statSync(SNAPSHOT).mtime.toLocaleString()}`); return JSON.parse(readFileSync(SNAPSHOT, 'utf8')); }
}

const targets: Record<string, { want: number[] }> = JSON.parse(readFileSync(`${root}market-targets.json`, 'utf8'));
const lang = table<{ rows: Record<string, string> }>('lang_en').rows;
const group = (id: number) => Math.floor(id / 100);
async function rankGear(listings: Listing[]) {
  const ctx = { prices: snapshotBook(await prices()), level: 100, notSearched: new Set<string>() };
  const rows = listings.map((l) => {
    const base = lang[`item_base|name|${l.baseId}`] ?? String(l.baseId), want = targets[base]?.want;
    if (!want) return { l, base, total: null as number | null, left: [] as string[], have: [] as string[] };
    const mods = [...l.prefix, ...l.suffix];
    const at = (id: number) => mods.find((a) => group(a.id) === group(id));
    const left = want.filter((id) => at(id)?.tier !== 1);
    const craft = left.map((id) => craftStep(l.baseId, id, ctx)?.costFE ?? NaN).reduce((a, b) => a + b, 0);
    return { l, base, total: l.price + craft, left: left.map((id) => `${at(id) ? `T${at(id)!.tier}->T1` : 'add T1'} ${(craftStep(l.baseId, id, ctx)?.text ?? String(id)).replace(/\(.*?\)/g, '').slice(0, 34).trim()}`),
      have: want.filter((id) => at(id)?.tier === 1).map((id) => at(id)!.text.slice(0, 40)) };
  });
  const known = rows.filter((r) => r.total !== null).sort((a, b) => a.total! - b.total!);
  for (const b of new Set(rows.filter((r) => r.total === null).map((r) => r.base))) console.log(`no target for ${b}: add it to market-targets.json`);
  console.log(`${listings.length} listings; ranked by price + expected crafting to all wanted mods at T1 (etor ember prices of ${ctx.prices.fetchedAt ?? 'the stored snapshot'})`);
  for (const r of known.slice(0, top))
    console.log(`#${String(r.l.n).padStart(2)}  ${String(r.l.price).padStart(5)} FE + craft ${String(Math.round(r.total! - r.l.price)).padStart(5)} = ${String(Math.round(r.total!)).padStart(5)} FE | T1 already: ${r.have.join(', ') || 'none'} | to craft: ${r.left.join('; ')}`);
}

/** the evaluator and your character, made on the first slate search and kept (--watch) */
let slateRun: Promise<(slates: Listing[]) => Promise<void>> | undefined, ev: Evaluator | undefined;
async function slateRanker() {
  const dd = resolve(process.env.DPS_DEBUG ?? `${root}../dps-debug`, 'game/exports');
  const exp = arg('export') ? resolve(process.env.INIT_CWD ?? process.cwd(), arg('export')!)
    : readdirSync(dd).sort().reverse().map((d) => resolve(dd, d, `export-${d}.json`)).find((f) => { try { return readFileSync(f).length > 0; } catch { return false; } })!;
  // the target the plan ranks on (plan.ts DEFAULT_PLAN, --target to change)
  const state = { ...fromExport(JSON.parse(readFileSync(exp, 'utf8')), 0), target: arg('target') ?? DEFAULT_PLAN.target }, ctx = ctxOfState(state);
  // 8 workers (~1.4 GB each) by default: the 16 a plan takes held 21 GB for a page of slates
  ev = await createEvaluator({ memoDir: `${root}packages/guide/.cache/memo`, workers: Number(arg('workers')) || 8 });
  const base = (await ev.run(state.loadout, [], ctx)).figure, by = new Map<string, Promise<number | string>>();
  const mine = (state.loadout.slateItems ?? []) as { shapeId?: number; talents: number[] }[];
  const one = (i: number, t: number[]) => {
    const k = `${i}|${[...t].sort()}`;   // the same talents in another order: one figure
    if (!by.has(k)) by.set(k, ev!.run(state.loadout, [replaceSlate(state, i, t)], ctx)
      .then((r) => (rankable(base, r.figure) ? r.figure.kill / base.kill - 1 : r.figure.stop ?? r.figure.partial.filter((p) => !base.partial.includes(p)).join('; '))));   // a partial figure is flagged with what it dropped, not ranked
    return by.get(k)!;
  };
  // what each of your slates is worth: an empty slate in its place
  const drop = await Promise.all(mine.map((_, i) => one(i, [])));
  return async (slates: Listing[]) => {
    // ponytail: the weakest slate (+ any sharing a talent) stands in for every slate - exact when talents multiply; a listing that interacts with another
    // slate some other way is ranked low. --exact prices every slot.
    const gain = async (l: Listing): Promise<{ g: number | string; slot?: number }> => {
      const fits = mine.map((m, i) => (!same || m.shapeId === l.shapeId ? i : -1)).filter((i) => i >= 0);
      if (!fits.length) return { g: `no slate of shape ${l.shapeId} on your board to put it in place of` };
      const weakest = fits.filter((i) => typeof drop[i] === 'number').sort((a, b) => (drop[b] as number) - (drop[a] as number))[0];
      const tries = exact || weakest === undefined ? fits
        : fits.filter((i) => i === weakest || typeof drop[i] !== 'number' || mine[i].talents.some((t) => l.talents!.includes(t)));
      const gs = await Promise.all(tries.map(async (i) => ({ g: await one(i, l.talents!), slot: i })));
      return gs.sort((a, b) => (typeof b.g === 'number' ? b.g : -Infinity) - (typeof a.g === 'number' ? a.g : -Infinity))[0];
    };
    const rows = await Promise.all(slates.map(async (l) => ({ l, ...(await gain(l)) })));
    console.log(`${slates.length} slates; ranked by damage gain (kill speed vs ${base.target ?? 'the target'}) in place of ${exact ? 'one of your slates' : 'your weakest slate (or one sharing a talent)'}${same ? ' of the same shape' : ''}, on ${exp} (L${state.level} ${state.skill}); your slates: ${mine.map((m, i) => `${i + 1} shape ${m.shapeId}${typeof drop[i] === 'number' ? ` (${pct(drop[i] as number)} without it)` : ''}`).join(', ')}`);
    const num = (g: number | string) => (typeof g === 'number' ? g : -Infinity);
    for (const r of rows.sort((a, b) => num(b.g) - num(a.g)).slice(0, top))
      console.log(`#${String(r.l.n).padStart(2)}  ${String(r.l.price).padStart(5)} FE  ${typeof r.g === 'string' ? '  partial' : `${pct(r.g).padStart(8)}  ${(r.g * 100 / Math.max(r.l.price, 1) * 100).toFixed(2).padStart(6)}%/100FE`} | ${r.l.talents!.map(talentName).join(' + ')}${r.slot !== undefined && typeof r.g === 'number' ? ` | in place of your slate ${r.slot + 1}` : ''}${typeof r.g === 'string' ? ` | not ranked: ${r.g.slice(0, 160)}` : ''}`);
  };
}
const pct = (g: number) => `${g >= 0 ? '+' : ''}${(g * 100).toFixed(2)}%`;

async function rank(text: string) {
  const listings: Listing[] = JSON.parse(text).map((l: Listing, i: number) => ({ ...l, n: l.n ?? i + 1 }));
  if (!listings.length) return console.log('no market search result on screen (open a search in the auction house first)');
  const slates = listings.filter((l) => l.talents?.length);
  if (slates.length) await (await (slateRun ??= slateRanker()))(slates);
  else await rankGear(listings);
}

try {
  if (!watch) await rank(screen());
  else for (let last = ''; ;) {
    try {
      const text = screen();
      if (text !== last) { last = text; console.log(`\n${new Date().toLocaleTimeString()}`); await rank(text); }
    } catch (e) { console.warn(`market: ${(e as Error).message.split(/\r?\n/).filter(Boolean).at(-1)}`); }
    await new Promise((r) => setTimeout(r, 2000));
  }
} finally { await ev?.close(); }
process.exit(0);
