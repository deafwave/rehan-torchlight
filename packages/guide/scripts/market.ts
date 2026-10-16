/** The market search on screen ranked by what it costs to finish: listing price + the expected crafting left to have every wanted mod at T1
 *  (market-targets.json at the repository root, by base name; each missing T1 at craftStep's expected embers at live etor prices). No damage figures: fast.
 *  A slate search (listings with talents) is ranked instead by the model's damage gain of one more slate with the listing's talents on your character
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
import { withSlate } from '../src/candidates/slates';
import { createEvaluator } from '../src/engine/pool';
import { talentName } from '../src/names';
import { rankable, ctxOfState } from '../src/search';
import { fromExport } from '../src/start';

type Aff = { id: number; tier: number; text: string };
type Listing = { n: number; price: number; priceType: number; baseId: number; level: number; prefix: Aff[]; suffix: Aff[]; talents?: number[] };
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
  const state = fromExport(JSON.parse(readFileSync(exp, 'utf8')), 0), ev = await createEvaluator({ memoDir: `${root}packages/guide/.cache/memo` });
  try {
    const base = (await ev.run(state.loadout, [], ctxOfState(state))).figure, by = new Map<string, Promise<number | string>>();
    if (!withSlate(state, [])) throw new Error(`${exp}: no slate placed to copy`);
    const gain = (t: number[]) => by.get(t.join()) ?? by.set(t.join(), ev.run(state.loadout, [withSlate(state, t)!], ctxOfState(state))
      .then((r) => (rankable(base, r.figure) ? r.figure.kill / base.kill - 1 : r.figure.stop ?? r.figure.partial.filter((p) => !base.partial.includes(p)).join('; ')))).get(t.join())!;   // a partial figure is flagged with what it dropped, not ranked
    const rows = await Promise.all(slates.map(async (l) => ({ l, g: await gain(l.talents!) })));
    console.log(`${slates.length} slates; ranked by damage gain (kill speed vs ${base.target ?? 'the target'}) of one more slate with these talents on ${exp} (L${state.level} ${state.skill})`);
    const pct = (g: number) => `${g >= 0 ? '+' : ''}${(g * 100).toFixed(2)}%`;
    const num = (g: number | string) => (typeof g === 'number' ? g : -Infinity);
    for (const r of rows.sort((a, b) => num(b.g) - num(a.g)).slice(0, top))
      console.log(`#${String(r.l.n).padStart(2)}  ${String(r.l.price).padStart(5)} FE  ${typeof r.g === 'string' ? '  partial' : `${pct(r.g).padStart(8)}  ${(r.g * 100 / Math.max(r.l.price, 1) * 100).toFixed(2).padStart(6)}%/100FE`} | ${r.l.talents!.map(talentName).join(' + ')}${typeof r.g === 'string' ? ` | not ranked, the model dropped: ${r.g.slice(0, 160)}` : ''}`);
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
