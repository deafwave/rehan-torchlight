/** The market search on screen ranked by what it costs to finish: listing price + the expected crafting left to have every wanted mod at T1
 *  (market-targets.json at the repository root, by base name; each missing T1 at craftStep's expected embers at live etor prices). No damage figures: fast.
 *  A slate search (listings with talents) is ranked instead by the model's damage gain of the listing's talents in place of one of your slates (the best one
 *  named; the owner rebuilds the board around the slates bought, so the shape is not held to the replaced one's; --same-shape holds it)
 *  (--export <export.json>, default the newest dps-debug game/exports read).
 *  usage (repo root, elevated shell, game running, a market search open): pnpm guide:market [--top N] [--file <saved listings.json>] [--export <export.json>] */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { craftStep } from '../src/candidates/gear';
import { localItems } from '../src/modes';
import { fetchSeason, fetchSnapshot, snapshotBook } from '../src/pricing';
import { table } from '../src/pin';
import { replaceSlate } from '../src/candidates/slates';
import { createEvaluator } from '../src/engine/pool';
import { talentName } from '../src/names';
import { rankable, ctxOfState } from '../src/search';
import { fromExport } from '../src/start';
import { DEFAULT_PLAN } from '../src/plan';

type Aff = { id: number; tier: number; text: string };
type Listing = { n: number; price: number; priceType: number; baseId: number; level: number; prefix: Aff[]; suffix: Aff[]; talents?: number[]; shapeId?: number };
const root = fileURLToPath(new URL('../../../', import.meta.url));
const top = Number(process.argv[process.argv.indexOf('--top') + 1]) || 8;
const file = resolve(process.env.INIT_CWD ?? process.cwd(), process.argv[process.argv.indexOf('--file') + 1] ?? '');   // --file <listings.json>: a saved read instead of the live game
const listings: Listing[] = JSON.parse(process.argv.includes('--file') ? readFileSync(file, 'utf8') : execFileSync('python', [`${root}scripts/market_listings.py`], { encoding: 'utf8', maxBuffer: 64 << 20 }))
  .map((l: Listing, i: number) => ({ ...l, n: l.n ?? i + 1 }));
if (!listings.length) { console.log('no market search result on screen (open a search in the auction house first)'); process.exit(0); }
const slates = listings.filter((l) => l.talents?.length);
if (slates.length) {
  const dd = resolve(process.env.DPS_DEBUG ?? `${root}../dps-debug`, 'game/exports'), arg = process.argv.indexOf('--export');
  const exp = arg > 0 ? resolve(process.env.INIT_CWD ?? process.cwd(), process.argv[arg + 1])
    : readdirSync(dd).sort().reverse().map((d) => resolve(dd, d, `export-${d}.json`)).find((f) => { try { return readFileSync(f).length > 0; } catch { return false; } })!;
  // the target the plan ranks on (plan.ts DEFAULT_PLAN, --target to change)
  const state = { ...fromExport(JSON.parse(readFileSync(exp, 'utf8')), 0), target: process.argv.includes('--target') ? process.argv[process.argv.indexOf('--target') + 1] : DEFAULT_PLAN.target },
    ev = await createEvaluator({ memoDir: `${root}packages/guide/.cache/memo` });
  try {
    const base = (await ev.run(state.loadout, [], ctxOfState(state))).figure, by = new Map<string, Promise<number | string>>();
    const mine = (state.loadout.slateItems ?? []) as { shapeId?: number; talents: number[] }[];
    const one = (i: number, t: number[]) => by.get(`${i}|${t}`) ?? by.set(`${i}|${t}`, ev.run(state.loadout, [replaceSlate(state, i, t)], ctxOfState(state))
      .then((r) => (rankable(base, r.figure) ? r.figure.kill / base.kill - 1 : r.figure.stop ?? r.figure.partial.filter((p) => !base.partial.includes(p)).join('; ')))).get(`${i}|${t}`)!;   // a partial figure is flagged with what it dropped, not ranked
    // the listing in place of each of your slates (--same-shape: of its shape only), the best kept
    const same = process.argv.includes('--same-shape');
    const gain = async (l: Listing): Promise<{ g: number | string; slot?: number }> => {
      const fits = mine.map((m, i) => (!same || m.shapeId === l.shapeId ? i : -1)).filter((i) => i >= 0);
      if (!fits.length) return { g: `no slate of shape ${l.shapeId} on your board to put it in place of` };
      const gs = await Promise.all(fits.map(async (i) => ({ g: await one(i, l.talents!), slot: i })));
      return gs.sort((a, b) => (typeof b.g === 'number' ? b.g : -Infinity) - (typeof a.g === 'number' ? a.g : -Infinity))[0];
    };
    const rows = await Promise.all(slates.map(async (l) => ({ l, ...(await gain(l)) })));
    console.log(`${slates.length} slates; ranked by damage gain (kill speed vs ${base.target ?? 'the target'}) in place of one of your slates${process.argv.includes('--same-shape') ? ' of the same shape' : ''}, on ${exp} (L${state.level} ${state.skill}); your slates: ${mine.map((m, i) => `${i + 1} shape ${m.shapeId}`).join(', ')}`);
    const pct = (g: number) => `${g >= 0 ? '+' : ''}${(g * 100).toFixed(2)}%`;
    const num = (g: number | string) => (typeof g === 'number' ? g : -Infinity);
    for (const r of rows.sort((a, b) => num(b.g) - num(a.g)).slice(0, top))
      console.log(`#${String(r.l.n).padStart(2)}  ${String(r.l.price).padStart(5)} FE  ${typeof r.g === 'string' ? '  partial' : `${pct(r.g).padStart(8)}  ${(r.g * 100 / Math.max(r.l.price, 1) * 100).toFixed(2).padStart(6)}%/100FE`} | ${r.l.talents!.map(talentName).join(' + ')}${r.slot !== undefined && typeof r.g === 'number' ? ` | in place of your slate ${r.slot + 1}` : ''}${typeof r.g === 'string' ? ` | not ranked: ${r.g.slice(0, 160)}` : ''}`);
  } finally { await ev.close(); }
  process.exit(0);
}
const targets: Record<string, { want: number[] }> = JSON.parse(readFileSync(`${root}market-targets.json`, 'utf8'));
const lang = table<{ rows: Record<string, string> }>('lang_en').rows;
const book = snapshotBook(await fetchSnapshot(await fetchSeason(), localItems()));
const ctx = { prices: book, level: 100, notSearched: new Set<string>() };
const group = (id: number) => Math.floor(id / 100);

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
console.log(`${listings.length} listings; ranked by price + expected crafting to all wanted mods at T1 (live etor ember prices)`);
for (const r of known.slice(0, top))
  console.log(`#${String(r.l.n).padStart(2)}  ${String(r.l.price).padStart(5)} FE + craft ${String(Math.round(r.total! - r.l.price)).padStart(5)} = ${String(Math.round(r.total!)).padStart(5)} FE | T1 already: ${r.have.join(', ') || 'none'} | to craft: ${r.left.join('; ')}`);
