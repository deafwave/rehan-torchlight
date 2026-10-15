/** Price acquisitions by game item name: `lang_en item_base|name|<baseId>` joined to etor by exact name, else through etor-aliases.json. */
import { table } from './pin';
import aliasFile from './data/etor-aliases.json';
import type { Move, PriceBook } from './types';

/** { "<game name>": { etor: "<etor name>", why: "<evidence the two are the same item>" } } */
export type Aliases = Record<string, { etor: string; why: string }>;

export function priceOfName(book: PriceBook, name: string, level: number, aliases: Aliases = aliasFile as Aliases): { fe: number | null; etorName: string | null } {
  for (const n of [name, aliases[name]?.etor]) {
    if (!n) continue;
    const fe = book.price(n, level);
    if (fe !== null) return { fe, etorName: n };
  }
  return { fe: null, etorName: null };
}

const nameOf = (key: string) => table<{ rows: Record<string, string> }>('lang_en').rows[key];

export function priceOfBase(book: PriceBook, baseId: number, level: number, aliases?: Aliases): { fe: number | null; etorName: string | null } {
  const name = nameOf(`item_base|name|${baseId}`);
  return name ? priceOfName(book, name, level, aliases) : { fe: null, etorName: null };
}

/** a legendary (config_item_gold id `goldId`): its English name is `lang_en item_gold|name|<goldId>` (the etor id equals the gold id) */
export function priceOfGold(book: PriceBook, goldId: number, level: number, aliases?: Aliases): { fe: number | null; etorName: string | null } {
  const name = nameOf(`item_gold|name|${goldId}`);
  return name ? priceOfName(book, name, level, aliases) : { fe: null, etorName: null };
}

type Cost = Pick<Move, 'costFE' | 'market' | 'costNote'>;
const NORMAL_GEM = new Set(['Active Skill', 'Support Skill']);
const HIGHER_TIER = /\((Noble|Magnificent)\)$|（(崇高|华贵)）$/;   // etor names every Noble / Magnificent gem this way

/** Cost of acquiring `name`. `drop`: 'bare' = a white gear base, 'gem' = a skill gem. Unpriced by etor: a bare base, or a gem whose etor
 *  category is Active/Support Skill (normal tier) costs 0 FE and drops. A gem with no etor row at all has no category; its game name decides (no
 *  "(Noble)"/"(Magnificent)" suffix = normal). Anything else (Noble/Magnificent, legendary) stays null. */
export function costOf(book: PriceBook, name: string, level: number, drop?: 'bare' | 'gem'): Cost {
  const { fe } = priceOfName(book, name, level);
  if (fe !== null) return { costFE: fe, market: 'tradeable' };
  const cat = book.category?.(name) ?? null;
  const normal = drop === 'bare' || (drop === 'gem' && (cat ? NORMAL_GEM.has(cat) : book.category !== undefined && !HIGHER_TIER.test(name)));
  return normal ? { costFE: 0, market: 'drop', costNote: 'drop' } : { costFE: null, market: 'tradeable' };
}

export function coverage(moves: Move[]): Record<string, { priced: number; drop: number; unpriced: number; notOnMarket: number }> {
  const out: Record<string, { priced: number; drop: number; unpriced: number; notOnMarket: number }> = {};
  for (const m of moves) {
    const c = out[m.kind] ??= { priced: 0, drop: 0, unpriced: 0, notOnMarket: 0 };
    if (m.market === 'not-on-market') c.notOnMarket++;
    else if (m.costFE === null) c.unpriced++;
    else if (m.market === 'drop') c.drop++;
    else c.priced++;
  }
  return out;
}
