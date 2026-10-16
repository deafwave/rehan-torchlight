/** The market search on screen ranked by what it costs to finish: listing price + the expected crafting left to have every wanted mod at T1
 *  (market-targets.json at the repository root, by base name; each missing T1 at craftStep's expected embers at live etor prices). No damage figures: fast.
 *  usage (repo root, elevated shell, game running, a market search open): pnpm guide:market [--top N] [--file <saved listings.json>] */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { craftStep } from '../src/candidates/gear';
import { localItems } from '../src/modes';
import { fetchSeason, fetchSnapshot, snapshotBook } from '../src/pricing';
import { table } from '../src/pin';

type Aff = { id: number; tier: number; text: string };
type Listing = { n: number; price: number; priceType: number; baseId: number; level: number; prefix: Aff[]; suffix: Aff[] };
const root = fileURLToPath(new URL('../../../', import.meta.url));
const top = Number(process.argv[process.argv.indexOf('--top') + 1]) || 8;
const file = process.argv[process.argv.indexOf('--file') + 1];   // --file <listings.json>: a saved read instead of the live game
const listings: Listing[] = JSON.parse(process.argv.includes('--file') ? readFileSync(file, 'utf8') : execFileSync('python', [`${root}scripts/market_listings.py`], { encoding: 'utf8', maxBuffer: 64 << 20 }))
  .map((l: Listing, i: number) => ({ ...l, n: l.n ?? i + 1 }));
if (!listings.length) { console.log('no market search result on screen (open a search in the auction house first)'); process.exit(0); }
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
