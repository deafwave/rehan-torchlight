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
  const fx = (talent ??= rows('config_talent'))[String(id)]?.c50?.[0] as [number, unknown[]] | undefined;
  const desc: string | undefined = fx && L()[`affix_class|description|${fx[0]}`];
  const v = fx?.[1]?.[0], lit = Array.isArray(v) && v[0] === 'lit' ? String(v[2]) : undefined;
  // a computed value (the node's per-point expression) is left out with its sign and %, never guessed
  const effect = !desc ? name ?? `talent ${id}`
    : strip(desc).replace(/\$([+-]?)P1\$(%?)/g, (_, s: string, p: string) => (lit === undefined ? '' : `${s}${lit}${p}`))
      .replace(/\$[+-]?P\d\$%?/g, '').replace(/\s+/g, ' ').trim().replace(/^(to|of) /i, '');
  return `${treeName(treeOf(id))}: ${effect}`;
}
