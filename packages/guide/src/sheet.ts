/** A loadout as the page shows it: what to wear, which talents, which skills. Names only; no figure. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { table } from './pin';
import { talentName, treeName } from './names';
import { treeOf } from './talentRules';
import type { Loadout } from './types';

export interface Sheet { section: string; lines: string[] }

let texts: Map<number, string> | undefined;
/** a crafted tier's text from the craft library; undefined for a mod the library does not hold (a unique's, a base attribute) */
function modText(id: number): string | undefined {
  if (!texts) {
    texts = new Map();
    const lib = JSON.parse(readFileSync(fileURLToPath(new URL('../../../data/affix_library.json', import.meta.url)), 'utf8')).affixes as { side: string; tiers: { tier: string; text: string; tierAffixId: string }[] }[];
    for (const a of lib) for (const t of a.tiers) texts.set(Number(t.tierAffixId), `${t.tier} ${t.text.replace(/\n/g, ' / ')} (${a.side.toLowerCase()})`);
  }
  return texts.get(id);
}
let lang: Record<string, string> | undefined;
const L = () => (lang ??= ((t) => t.rows ?? t)(table<any>('lang_en')));   // eslint-disable-line @typescript-eslint/no-explicit-any

type Gear = { label: string; slot?: string | number; itemId?: string; affixes?: { id: number; list?: string }[] };
function item(g: Gear): string {
  const gid = /guide-unique-(\d+)/.exec(g.itemId ?? '')?.[1], name = (gid && L()[`item_gold|name|${gid}`]) || g.label;
  const mods = (g.affixes ?? []).filter((a) => a.list !== 'BaseAttrInfoList'), known = mods.map((a) => modText(a.id)).filter(Boolean);
  const rest = mods.length - known.length;
  return `${g.slot}: ${name}${known.length ? ` - ${known.join('; ')}` : ''}${rest && known.length ? ` (+${rest} more mods)` : ''}`;
}

export function buildSheet(l: Loadout): Sheet[] {
  const x = l as Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
  const byTree = new Map<number, string[]>();
  for (const [n, p] of Object.entries((x.talents ?? {}) as Record<string, number>)) if (p > 0) {
    const t = treeOf(+n); byTree.set(t, [...(byTree.get(t) ?? []), `${talentName(+n).replace(/^[^:]*: /, '')} x${p}`]);
  }
  const points = Object.values((x.talents ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0);
  return [
    { section: 'Gear', lines: [...(x.gear ?? []), ...(x.vorax ?? [])].map(item) },
    { section: 'Skills', lines: (x.skills ?? []).map((s: { name: string | null; itemId?: string; level: number; place: { kind: string; slot: number } }) => {
      const name = s.name ?? L()[`item_base|name|${(s.itemId ?? '').split('_')[0]}`] ?? 'unnamed skill';   // a guide-made gem carries no name
      return s.place.kind === 'support' ? `  + ${name} (level ${s.level})` : `${s.place.kind} ${s.place.slot}: ${name} (level ${s.level})`;
    }) },
    { section: `Talents (${points} points)`, lines: [...(x.coreTalents ?? []).map((c: number) => `core: ${talentName(c)}`),
      ...[...byTree].map(([t, ns]) => `${treeName(t)}: ${ns.join(', ')}`)] },
    { section: 'Hero memories, pacts', lines: [...(x.heroMemories ?? []).map((m: Gear, i: number) => `memory ${m.slot ?? i + 1}: ${m.label}`),
      ...(x.pacts ?? []).map((p: { name: string; rank: number }) => `pact: ${p.name} rank ${p.rank}`)] },
  ].filter((s) => s.lines.length);
}
