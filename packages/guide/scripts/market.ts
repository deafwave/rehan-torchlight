/** The market search on screen ranked by the model: a gear search by each listing's kill-speed gain per FE in place of what you wear in its slot.
 *  --craft ranks gear instead by price + the expected crafting left to have every wanted mod at T1 (market-targets.json at the repository root, by base
 *  name; each missing T1 at craftStep's expected embers at etor prices, cached 30 minutes). No damage figures.
 *  A slate search (listings with talents) is ranked instead by the model's damage gain of the listing's talents in place of one of your slates (the best one
 *  named; the owner rebuilds the board around the slates bought, so the shape is not held to the replaced one's; --same-shape holds it)
 *  (--export <export.json>, default the newest dps-debug game/exports read). A listing only goes in place of a slate the board's caps allow (SLATE_CAP: a
 *  Pedigree only in place of your Pedigree); of those, your weakest slate (the one whose removal costs least) and any slate sharing one of its talents;
 *  --exact prices it in place of every one it can replace.
 *  --watch: keep running, re-read the screen 4 times a second and redraw the ranking as each figure lands (the page on screen is priced first; the workers
 *  start at once and stay warm).
 *  usage (repo root, elevated shell, game running, a market search open): pnpm guide:market [--top N] [--watch] [--workers N, default 8] [--exact] [--file <saved listings.json>] [--export <export.json>] */
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { writeAtomic } from '../src/atomic';
import { craftStep, slotsOfBase } from '../src/candidates/gear';
import { localItems } from '../src/modes';
import { fetchSeason, fetchSnapshot, snapshotBook, type EtorItems } from '../src/pricing';
import { pinCommit, table } from '../src/pin';
import { replaceable, replaceSlate } from '../src/candidates/slates';
import { createEvaluator } from '../src/engine/pool';
import { talentName } from '../src/names';
import { rankable, ctxOfState } from '../src/search';
import { fromExport } from '../src/start';
import { DEFAULT_PLAN } from '../src/plan';
import type { Change, EvalCtx, Evaluator, Figure, State } from '../src/types';

type Aff = { id: number; tier: number; text: string; dyn: (number | string)[] };
type Listing = { n: number; price: number; priceType: number; baseId: number; level: number; prefix: Aff[]; suffix: Aff[]; base?: Aff[]; fixed?: Aff[]; talents?: number[]; shapeId?: number };
type Ranked = { lines: string[]; pending: number };
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
async function rankGear(listings: Listing[]): Promise<Ranked> {
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
  const lines = [...new Set(rows.filter((r) => r.total === null).map((r) => r.base))].map((b) => `no target for ${b}: add it to market-targets.json`);
  lines.push(`${listings.length} listings; ranked by price + expected crafting to all wanted mods at T1 (etor ember prices of ${ctx.prices.fetchedAt ?? 'the stored snapshot'})`);
  for (const r of known.slice(0, top))
    lines.push(`#${String(r.l.n).padStart(2)}  ${String(r.l.price).padStart(5)} FE + craft ${String(Math.round(r.total! - r.l.price)).padStart(5)} = ${String(Math.round(r.total!)).padStart(5)} FE | T1 already: ${r.have.join(', ') || 'none'} | to craft: ${r.left.join('; ')}`);
  return { lines, pending: 0 };
}

/** your character: the newest dps-debug read (--export to choose), on the target the plan ranks on (plan.ts DEFAULT_PLAN, --target to change) */
let who: { exp: string; state: State; ctx: EvalCtx } | undefined;
function character() {
  if (who) return who;
  const dd = resolve(process.env.DPS_DEBUG ?? `${root}../dps-debug`, 'game/exports');
  const exp = arg('export') ? resolve(process.env.INIT_CWD ?? process.cwd(), arg('export')!)
    : readdirSync(dd).sort().reverse().map((d) => resolve(dd, d, `export-${d}.json`)).find((f) => { try { return readFileSync(f).length > 0; } catch { return false; } })!;
  const state = { ...fromExport(JSON.parse(readFileSync(exp, 'utf8')), 0), target: arg('target') ?? DEFAULT_PLAN.target };
  return who = { exp, state, ctx: ctxOfState(state) };
}
/** the evaluator and your character's figure, started on the first figure a search needs (--watch: at once) and kept */
let warmRun: Promise<void> | undefined, ev: Evaluator | undefined, base: Figure | undefined;
const warm = () => warmRun ??= (async () => {
  const { state, ctx } = character();
  // 8 workers (~1.4 GB each) by default: the 16 a plan takes held 21 GB for a page of slates
  ev = await createEvaluator({ memoDir: `${root}packages/guide/.cache/memo`, workers: Number(arg('workers')) || 8 });
  base = (await ev.run(state.loadout, [], ctx)).figure;
  pump(); landed();
})();
/** a figure against your character's: the kill-speed gain, or what a partial figure dropped / why it stopped (never ranked) */
const versus = (f: Figure): number | string => (rankable(base!, f) ? f.kill / base!.kill - 1 : f.stop ?? f.partial.filter((p) => !base!.partial.includes(p)).join('; '));

/** Figures as they land. `want` gives a key's gain once settled, else queues it once and gives undefined. The evaluator is handed no more than it runs at
 *  once and the page on screen goes first, so a page flipped past never holds up the one shown; `landed` redraws. */
const settled = new Map<string, number | string>(), asked = new Set<string>(), waiting: { page: number; k: string; changes: Change[] }[] = [];
let page = 0, running = 0, landed = () => {};
function pump() {
  while (base && running < (ev!.parallelism ?? 8) && waiting.length) {
    const [w] = waiting.splice(Math.max(0, waiting.findIndex((x) => x.page === page)), 1), { state, ctx } = character();
    running++;
    ev!.run(state.loadout, w.changes, ctx).then((r) => settled.set(w.k, versus(r.figure)), (e: Error) => settled.set(w.k, e.message))
      .finally(() => { running--; pump(); landed(); });
  }
}
function want(k: string, changes: () => Change[]): number | string | undefined {
  if (settled.has(k)) return settled.get(k);
  if (!asked.has(k)) { asked.add(k); waiting.push({ page, k, changes: changes() }); void warm(); pump(); }
  else { const w = waiting.find((x) => x.k === k); if (w) w.page = page; }
  return undefined;
}
/** a row's gain for sorting: pending rows last, partial ones just above them */
const num = (g: number | string | undefined) => (typeof g === 'number' ? g : g === undefined ? -Infinity : -1e300);

/** gear gains on disk by pin, read, target and item: a listing seen by an earlier run prints without starting the evaluator */
const GAINS = `${root}packages/guide/.cache/market-gains.json`;
const gains: Record<string, number | string> = existsSync(GAINS) ? JSON.parse(readFileSync(GAINS, 'utf8')) : {};
let unsaved = false;

/** A gear search: each listing as it is, in place of what you wear in its slot (a ring: the better of the two), by the model's kill-speed gain per FE. */
function rankWorn(listings: Listing[]): Ranked {
  const { exp, state } = character(), pin = pinCommit().slice(0, 8);
  const mods = (xs: Aff[] = []) => xs.map((a) => ({ id: a.id, dynArgs: a.dyn.map(Number) }));
  const gain = (l: Listing, slot: string) => {
    const modifiers = { baseAttr: mods(l.base), ...(l.fixed?.length ? { baseAffix: mods(l.fixed) } : {}), prefix: mods(l.prefix), suffix: mods(l.suffix) };
    const id = createHash('sha1').update(JSON.stringify([slot, l.baseId, l.level, modifiers])).digest('hex').slice(0, 16);
    const k = `${pin}|${basename(exp)}|${state.target}|${id}`;
    if (k in gains) return gains[k];
    const g = want(k, () => [{ kind: 'gear', slot, item: { baseId: l.baseId, itemId: `market-${id}`, level: l.level, modifiers } } as Change]);
    if (g !== undefined) { gains[k] = g; unsaved = true; }
    return g;
  };
  const rows = listings.map((l) => {
    const slots = slotsOfBase(l.baseId, state.skill).slots;
    if (!slots.length) return { l, g: `not worn by ${state.skill} (${lang[`item_base|name|${l.baseId}`] ?? l.baseId})` as number | string | undefined, slot: '' };
    const gs = slots.map((slot) => ({ l, g: gain(l, slot), slot }));
    return gs.some((r) => r.g === undefined) ? { l, g: undefined, slot: '' } : gs.sort((a, b) => num(b.g) - num(a.g))[0];
  });
  const pending = rows.filter((r) => r.g === undefined).length;
  if (!pending && unsaved) { writeAtomic(GAINS, JSON.stringify(gains)); unsaved = false; }
  const per = (r: { l: Listing; g?: number | string }) => num(r.g) / Math.max(r.l.price, 1);
  const lines = [`${listings.length} listings${pending ? ` (${pending} pricing)` : ''}; ranked by kill-speed gain vs ${state.target} per FE, each in place of what you wear, on ${exp}`];
  const best = rows.reduce((a, b) => (num(b.g) > num(a.g) ? b : a));
  for (const r of rows.sort((a, b) => per(b) - per(a)).slice(0, top)) {
    const tiers = [...r.l.prefix, ...r.l.suffix].map((a) => `T${a.tier}`).join(' ');
    lines.push(`#${String(r.l.n).padStart(2)}  ${String(r.l.price).padStart(6)} FE  ${r.g === undefined ? '  pricing' : typeof r.g === 'string' ? `  partial | not ranked: ${r.g.slice(0, 160)}`
      : `${pct(r.g).padStart(8)}  ${(r.g * 1e4 / Math.max(r.l.price, 1)).toFixed(2).padStart(6)}%/100FE | ${r.slot} | ${tiers}${r === best ? ' | best outright' : ''}`}`);
  }
  if (!rows.slice(0, top).includes(best) && typeof best.g === 'number') lines.push(`best outright: #${best.l.n} ${best.l.price} FE ${pct(best.g)}`);
  return { lines, pending };
}

/** A slate search: each listing's talents (on its own base) in place of one of your slates the board's caps let it replace */
function rankSlates(slates: Listing[]): Ranked {
  const { exp, state } = character();
  const mine = (state.loadout.slateItems ?? []) as { baseId: number; shapeId?: number; talents: number[] }[];
  // the same talents in another order: one figure; the listing's base on the slate it replaces (its shape stays: the board is rebuilt around it)
  const one = (i: number, t: number[], baseId?: number) => want(`slate|${i}|${baseId ?? ''}|${[...t].sort()}`, () => [replaceSlate(state, i, t, baseId === undefined ? undefined : { baseId })]);
  // what each of your slates is worth: an empty slate in its place
  const drop = mine.map((_, i) => one(i, []));
  // ponytail: the weakest slate (+ any sharing a talent) stands in for every slate - exact when talents multiply; a listing that interacts with another
  // slate some other way is ranked low. --exact prices every slot.
  const gain = (l: Listing): { g?: number | string; slot?: number } => {
    const fits = replaceable(mine, l.baseId).filter((i) => !same || mine[i].shapeId === l.shapeId);
    if (!fits.length) return { g: `no slate on your board it can go in place of (${same ? `shape ${l.shapeId}, ` : ''}base ${l.baseId}: SLATE_CAP)` };
    if (!exact && fits.some((i) => drop[i] === undefined)) return {};
    const weakest = fits.filter((i) => typeof drop[i] === 'number').sort((a, b) => (drop[b] as number) - (drop[a] as number))[0];
    const tries = exact || weakest === undefined ? fits
      : fits.filter((i) => i === weakest || typeof drop[i] !== 'number' || mine[i].talents.some((t) => l.talents!.includes(t)));
    const gs = tries.map((i) => ({ g: one(i, l.talents!, l.baseId), slot: i }));
    return gs.some((x) => x.g === undefined) ? {} : gs.sort((a, b) => num(b.g) - num(a.g))[0];
  };
  const rows = slates.map((l) => ({ l, ...gain(l) })), pending = rows.filter((r) => r.g === undefined).length;
  const lines = [`${slates.length} slates${pending ? ` (${pending} pricing)` : ''}; ranked by damage gain (kill speed vs ${state.target}) in place of ${exact ? 'one of your slates' : 'your weakest slate (or one sharing a talent)'} the board's caps allow${same ? ', of the same shape' : ''}, on ${exp} (L${state.level} ${state.skill}); your slates: ${mine.map((m, i) => `${i + 1} shape ${m.shapeId}${typeof drop[i] === 'number' ? ` (${pct(drop[i] as number)} without it)` : ''}`).join(', ')}`];
  for (const r of rows.sort((a, b) => num(b.g) - num(a.g)).slice(0, top))
    lines.push(`#${String(r.l.n).padStart(2)}  ${String(r.l.price).padStart(5)} FE  ${r.g === undefined ? '  pricing' : typeof r.g === 'string' ? '  partial' : `${pct(r.g).padStart(8)}  ${(r.g * 100 / Math.max(r.l.price, 1) * 100).toFixed(2).padStart(6)}%/100FE`} | ${r.l.talents!.map(talentName).join(' + ')}${r.slot !== undefined && typeof r.g === 'number' ? ` | in place of your slate ${r.slot + 1}` : ''}${typeof r.g === 'string' ? ` | not ranked: ${r.g.slice(0, 160)}` : ''}`);
  return { lines, pending };
}
const pct = (g: number) => `${g >= 0 ? '+' : ''}${(g * 100).toFixed(2)}%`;

/** the listings ranked from the figures landed so far */
async function rank(listings: Listing[]): Promise<Ranked> {
  if (!listings.length) return { lines: ['no market search result on screen (open a search in the auction house first)'], pending: 0 };
  const slates = listings.filter((l) => l.talents?.length);
  return slates.length ? rankSlates(slates) : has('craft') ? rankGear(listings) : rankWorn(listings);
}
const parse = (text: string): Listing[] => JSON.parse(text).map((l: Listing, i: number) => ({ ...l, n: l.n ?? i + 1 }));

/** --watch reads through one python kept attached to the game (a new one costs ~0.8 s to start and attach, a read ~0.2 s) */
function reader() {
  const py = spawn('python', [`${root}scripts/market_listings.py`, '--serve'], { stdio: ['pipe', 'pipe', 'inherit'] });
  const out = createInterface({ input: py.stdout })[Symbol.asyncIterator]();
  return async () => {
    py.stdin.write('\n');
    const { value, done } = await out.next();
    if (done) throw new Error('the market reader exited');
    const r = JSON.parse(value);
    if (!Array.isArray(r)) throw new Error(r.error);
    return value as string;
  };
}

try {
  if (!watch) {
    const listings = parse(screen());
    let landings = 0, wake = () => {};
    landed = () => { landings++; wake(); };
    for (;;) {
      const seen = landings, r = await rank(listings);
      if (!r.pending) { console.log(r.lines.join('\n')); break; }
      if (landings === seen) await new Promise<void>((ok) => (wake = ok));
    }
  } else {
    // a terminal: the page redrawn as each figure lands; a pipe: printed once ranked
    const tty = process.stdout.isTTY, read = file ? async () => readFileSync(file, 'utf8') : reader();
    let shown: Listing[] | undefined, at = '', printed = 0, drawing = false, again = false;
    const draw = async () => {
      if (drawing) return void (again = true);
      drawing = true;
      try {
        do {
          again = false;
          if (!shown) continue;
          const p = page, r = await rank(shown), head = `${at}${base || !warmRun ? '' : ' (the evaluator is starting)'}`;
          if (tty) process.stdout.write(`\x1b[H\x1b[J${head}\n${r.lines.join('\n')}\n`);
          else if (!r.pending && printed !== p) { printed = p; console.log(`\n${head}\n${r.lines.join('\n')}`); }
        } while (again);
      } catch (e) { console.warn(`market: ${(e as Error).message}`); } finally { drawing = false; }
    };
    landed = () => void draw();
    if (!has('craft')) void warm();
    for (let last = ''; ;) {
      try {
        const text = await read();
        if (text !== last) { last = text; page++; shown = parse(text); at = new Date().toLocaleTimeString(); void draw(); }
      } catch (e) { console.warn(`market: ${(e as Error).message.split(/\r?\n/).filter(Boolean).at(-1)}`); }
      await new Promise((r) => setTimeout(r, 250));
    }
  }
} finally { await ev?.close(); }
process.exit(0);
