/** Talent rules from the pinned dps-debug catalog (config_talent.r2). Sources and confidence: docs/talent-rules.md. */
import { table } from './pin';

export interface TalentRow { id: number; kind: number; max: number; need: number; prereq: number[]; row: number }

let cache: { nodes: Map<number, TalentRow>; trees: number[]; plain: Map<number, TalentRow[]>; cores: Map<number, TalentRow[]> } | undefined;

function load() {
  if (cache) return cache;
  const raw = table<{ rows: Record<string, any> }>('config_talent').rows as Record<string, any>;
  const nodes = new Map<number, TalentRow>(), trees = new Set<number>();
  for (const r of Object.values(raw)) {
    const tree = Math.floor(r.i0 / 1e6);
    // 8-digit ids of the 30 hero trees (10..64); 6-digit rows are legacy, 80/90/92 are not hero trees
    if (String(r.i0).length !== 8 || tree < 10 || tree > 64) continue;
    nodes.set(r.i0, { id: r.i0, kind: r.i4, max: r.ic, need: r.i10, prereq: (r.a30 as number[]).filter(x => x), row: r.a40[1] });
    trees.add(tree);
  }
  const plain = new Map<number, TalentRow[]>(), cores = new Map<number, TalentRow[]>();
  for (const n of [...nodes.values()].sort((a, b) => a.id - b.id)) {
    const m = n.kind === 2 ? cores : plain, t = treeOf(n.id);
    m.set(t, [...(m.get(t) ?? []), n]);
  }
  return (cache = { nodes, trees: [...trees].sort((a, b) => a - b), plain, cores });
}

export const treeOf = (node: number) => Math.floor(node / 1e6);
export const treeNodes = (tree: number) => load().plain.get(tree) ?? [];
/** Core talents of a tree: id `{tree}00{set}{n}00`; `need` = points in the tree. */
export const treeCores = (tree: number) => load().cores.get(tree) ?? [];
export const coreSet = (core: number) => Math.floor(core / 1e4) % 10;
export const nodeRow = (id: number) => load().nodes.get(id);

/** Observed (player level, talent points spent) pairs: captures/<id>/pre/player.json cfg.level + pre/talents.json (sum of Point, copies excluded).
 *  Spent points are a lower bound on the budget. No level -> points table exists in the catalog or the Lua walks (re/lua strings hold type names only). */
export const POINT_OBSERVATIONS = [
  { level: 93, points: 108, capture: 'L100.state-20261013-165251' },
  { level: 96, points: 108, capture: 'OTHERCHAR-L105.state-20261013-210519' },
] as const;

/** Full-level budget (knob `talentPoints`, default 108 = the value observed at 93 and 96). Below 93 no level was observed: the ledger rules
 *  `round(full x (L - 1) / 92)`, an assumption every step below L93 must say so. 93 and above: the full budget. */
let full = 108;
export const setTalentPoints = (n: number) => { full = n; };
export function pointsAtLevel(level: number): number {
  return level >= 93 ? full : Math.round(full * (level - 1) / 92);
}
export const pointsOutsideObserved = (level: number) => level < POINT_OBSERVATIONS[0].level || level > POINT_OBSERVATIONS.at(-1)!.level;

/** Tree id = family*10 + k; k = 0 is a God/Goddess tree, k != 0 a profession. Inferred from 9 distinct tree sets over 181 loadouts/captures
 *  (no counter-example, docs/talent-rules.md): at most one god tree plus up to three distinct professions of any family. */
export const isGodTree = (tree: number) => tree % 10 === 0;
/** Slots 0..3 = [god, profession, profession, profession]. Slots 2 (tree 51) and 3 (tree 12) are professions (prisms.md:69); whether the god
 *  tree sits in slot 0 or 1 is not recorded, the order here is a label only. */
export function treeSlotsAllowed(_heroId: number): number[][] {
  const t = load().trees;
  return [t.filter(isGodTree), t.filter(x => !isGodTree(x)), t.filter(x => !isGodTree(x)), t.filter(x => !isGodTree(x))];
}

export const allTrees = () => [...load().trees];

/** An Inverse Image copy: points standing at the mirrored row (x,y)->(6-x,8-y) of its source node (re/evidence/prisms.md (c)). */
export interface Copy { tree: number; row: number; point: number }
/** Copies of a loadout's `resolvedTalents.talents`: tag `talent:-<id>@<100+EE>%`, weight = Point x (1 + EE/100) (dps-debug loadout.ts:237-250). */
export function copiesOf(resolved: readonly (readonly [number, number, string])[] | undefined): Copy[] {
  const out: Copy[] = [];
  for (const [id, w, tag] of resolved ?? []) {
    const m = /^talent:-\d+@(-?\d+)%$/.exec(tag), n = load().nodes.get(id);
    if (m && n && +m[1] !== 0) out.push({ tree: treeOf(id), row: 8 - n.row, point: Math.round(w / (+m[1] / 100)) });
  }
  return out;
}

/** Nodes of `points` (node -> points, one tree) that break a rule: unknown or foreign node, points out of range, a prerequisite below max,
 *  or fewer than `need` points in EARLIER rows (Inverse Image copies of the tree count at their mirrored row). Never throws. */
export function violations(tree: number, points: Record<number, number>, copies: readonly Copy[] = []): number[] {
  const { nodes } = load(), bad: number[] = [];
  const known = (k: string) => { const n = nodes.get(+k); return n && n.kind !== 2 && treeOf(n.id) === tree ? n : undefined; };
  const above = (row: number) =>
    Object.entries(points).reduce((s, [k, p]) => s + (known(k) && nodes.get(+k)!.row < row ? p : 0), 0)
    + copies.reduce((s, c) => s + (c.tree === tree && c.row < row ? c.point : 0), 0);
  for (const [k, p] of Object.entries(points)) {
    const n = known(k);
    if (!n || !(p >= 0) || p > n.max) { bad.push(+k); continue; }
    if (p > 0 && (n.prereq.some(q => (points[q] ?? 0) < (nodes.get(q)?.max ?? Infinity)) || above(n.row) < n.need)) bad.push(n.id);
  }
  return bad;
}
export const legalAllocation = (tree: number, points: Record<number, number>, copies: readonly Copy[] = []) => violations(tree, points, copies).length === 0;

/** A talent page cut to `points`, judged against the page as given (the target build reaches some of its points through prism copies and slates the
 *  switch does not carry, so it breaks the bare rules: a cut may add no violation the page did not have, and a core's `need` counts at most what its tree
 *  had). One point at a time comes off the deepest row whose removal keeps that (while another removal can, never one that takes a tree below the need of
 *  a core it carries); then every core whose tree is below its need is dropped. These are the points a player levelling into the page places last. */
export function trimPage(talents: Record<string | number, number>, cores: number[], points: number): { talents: Record<number, number>; cores: number[] } {
  const t: Record<number, number> = Object.fromEntries(Object.entries(talents).map(([k, v]) => [Number(k), v]));
  const tree = (p: Record<number, number>, tr: number) => Object.fromEntries(Object.entries(p).filter(([k]) => treeOf(+k) === tr).map(([k, v]) => [+k, v]));
  const inTree = (p: Record<number, number>, tr: number) => Object.values(tree(p, tr)).reduce((a, b) => a + b, 0);
  const given = new Map([...new Set(Object.keys(t).map(k => treeOf(+k)))].map(tr => [tr, { sum: inTree(t, tr), bad: new Set(violations(tr, tree(t, tr))) }]));
  const need = (c: number) => Math.min(nodeRow(c)?.need ?? 0, given.get(treeOf(c))?.sum ?? 0);
  const coreNeed = (tr: number) => Math.max(0, ...cores.filter(c => treeOf(c) === tr).map(need));
  const ok = (k: number) => violations(treeOf(k), { ...tree(t, treeOf(k)), [k]: t[k] - 1 }).every(v => given.get(treeOf(k))!.bad.has(v));
  for (let total = Object.values(t).reduce((a, b) => a + b, 0); total > points; total--) {
    const legal = Object.keys(t).map(Number).filter(k => t[k] > 0 && ok(k));
    if (!legal.length) break;
    const keeps = (k: number) => Number(inTree(t, treeOf(k)) - 1 >= coreNeed(treeOf(k)));
    const k = legal.sort((a, b) => keeps(b) - keeps(a) || nodeRow(b)!.row - nodeRow(a)!.row || b - a)[0];
    if (--t[k] === 0) delete t[k];
  }
  return { talents: t, cores: cores.filter(c => inTree(t, treeOf(c)) >= need(c)) };
}
