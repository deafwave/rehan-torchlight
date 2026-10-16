/** A loadout as the page shows it: what to wear, which talents, which skills. Names only; no figure. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { table } from './pin';
import { talentName, treeName } from './names';
import { treeCores, treeNodes, treeOf } from './talentRules';
import type { Loadout } from './types';

/** a talent tree as the game lays it out: `row` = depth (unlocked by points in the tree), `col` = place across; `pts` = points taken; kind 1 small, 3 medium */
export interface TreeView { tree: number; name: string; points: number; nodes: { id: number; row: number; col: number; kind: number; max: number; pts: number; name: string; prereq: number[] }[];
  cores: { id: number; need: number; name: string; taken: boolean }[] }
export interface Sheet { section: string; lines: string[]; /** Talents: one view per tree with points */ trees?: TreeView[] }

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
  const gid = /guide-(?:unique-|target-\d+-u)(\d+)/.exec(g.itemId ?? '')?.[1], name = (gid && L()[`item_gold|name|${gid}`]) || g.label;
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
      ...[...byTree].map(([t, ns]) => `${treeName(t)}: ${ns.join(', ')}`)], trees: [...byTree.keys()].map((t) => treeView(t, x.talents ?? {}, x.coreTalents ?? [])) },
    { section: 'Hero memories, pactspirits', lines: [...(x.heroMemories ?? []).map((m: Gear, i: number) => `memory ${m.slot ?? i + 1}: ${m.label}`),
      ...(x.pacts ?? []).map((p: { name?: string; servantId: number; rank: number; slot?: number }) => `pactspirit${p.slot !== undefined ? ` slot ${p.slot}` : ''}: ${p.name ?? L()[`servant|name|${p.servantId}`] ?? `pactspirit ${p.servantId}`} (rank ${p.rank})`)] },
  ].filter((s) => s.lines.length);
}

function treeView(tree: number, talents: Record<string, number>, cores: number[]): TreeView {
  const nodes = treeNodes(tree).map((n) => ({ id: n.id, row: n.row, col: n.col, kind: n.kind, max: n.max, pts: talents[n.id] ?? 0, name: talentName(n.id).replace(/^[^:]*: /, ''), prereq: n.prereq }));
  return { tree, name: treeName(tree), points: nodes.reduce((a, n) => a + n.pts, 0), nodes,
    cores: treeCores(tree).map((c) => ({ id: c.id, need: c.need, name: talentName(c.id), taken: cores.includes(c.id) })) };
}

/** the trees a loadout has points in, plus `also` (a respec's trees before it), drawn as the game lays them out */
export function talentTrees(l: Loadout, also: number[] = []): TreeView[] {
  const x = l as { talents?: Record<string, number>; coreTalents?: number[] };
  const trees = [...new Set([...Object.entries(x.talents ?? {}).filter(([, p]) => p > 0).map(([n]) => treeOf(+n)), ...also])];
  return trees.map((t) => treeView(t, x.talents ?? {}, x.coreTalents ?? []));
}
