/** English names for talent trees, talent nodes and core talents, from the pinned catalog (lang_en, config_talent). */
import { table } from './pin';
import { treeOf } from './talentRules';

type Rows = Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
const rows = (n: string): Rows => { const t = table<Rows>(n); return (t.rows as Rows | undefined) ?? t; };
let lang: Rows | undefined, talent: Rows | undefined;
const L = () => (lang ??= rows('lang_en'));
const strip = (s: string) => s.replace(/<e[^>]*>|<\/e>/g, '');

/** a tree: a profession (Prophet, Shadowmaster, ...), or a god / goddess tree (k = 0: the family's god) */
export function treeName(tree: number): string {
  return L()[`profession|name|${tree % 10 === 0 ? tree / 10 : tree}`] ?? `tree ${tree}`;
}

/** a node: its own name (core talents: Close Range Fire, ...); a generic node (Micro / Medium Talent) by its tree and effect */
export function talentName(id: number): string {
  const name: string | undefined = L()[`talent|name|${id}`];
  if (name && !/ Talent$|^Talent$/.test(name)) return name;
  // every effect of the node (owner, 2026-10-16: '+8% additional Deterioration Damage / +5% additional Deterioration Duration' read as Damage alone)
  const fxs = ((talent ??= rows('config_talent'))[String(id)]?.c50 ?? []) as [number, unknown[]][];
  const effects = fxs.map((fx) => {
    const desc: string | undefined = L()[`affix_class|description|${fx[0]}`];
    const v = fx[1]?.[0], lit = Array.isArray(v) && v[0] === 'lit' ? String(v[2]) : undefined;
    // a computed value (the node's per-point expression) is left out with its sign and %, never guessed
    return desc && strip(desc).replace(/\$([+-]?)P1\$(%?)/g, (_, s: string, p: string) => (lit === undefined ? '' : `${s}${lit}${p}`))
      .replace(/\$[+-]?P\d\$%?/g, '').replace(/\s+/g, ' ').trim().replace(/^(to|of) /i, '');
  }).filter((x): x is string => !!x);
  return `${treeName(treeOf(id))}: ${effects.length ? [...new Set(effects)].join(' / ') : name ?? `talent ${id}`}`;
}

/** the legendary an item is (config_item_gold: its base, and one of every key's modifier groups among the item's), else undefined. The game read labels an
 *  item by its base (Old King's Sabatons); the owner knows it by this name (Boots of Devastation) */
export function uniqueName(baseId: number, modifierIds: number[]): string | undefined {
  const gold = rows('config_item_gold'), groups = new Set(modifierIds.map((id) => Math.floor(id / 10)));
  const KEYS = ['m88', 'ma8', 'mc8', 'me8', 'm108', 'm128', 'm148', 'm168'];
  const hit = Object.entries(gold).find(([, r]) => r.i8 === baseId && (() => { const ks = KEYS.map((k) => Object.keys(r[k] ?? {}).map(Number)).filter((x) => x.length);
    return ks.length > 0 && ks.every((x) => x.some((y) => groups.has(y))); })());
  return hit ? L()[`item_gold|name|${hit[0]}`] : undefined;
}

/** a skill or support gem by its stone id (config_item_base p5c -> lang_en item_base name): the read sometimes names none (2026-10-17) */
let stones: Map<number, string> | undefined;
export function stoneName(sid: number): string | undefined {
  if (!stones) { stones = new Map(); for (const [b, r] of Object.entries(rows('config_item_base'))) { const s = r.p5c?.[0], n = L()[`item_base|name|${b}`]; if (typeof s === 'number' && n && !stones.has(s)) stones.set(s, n); } }
  return stones.get(sid);
}
