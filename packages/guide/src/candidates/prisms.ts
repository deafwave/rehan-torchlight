/**
 * Prism candidates: place an owned, unplaced prism on a free cell, only where the documented server rules fully determine
 * the result AND dps-debug's `prism add` change can express it. Rules and sources: docs/prism-rules.md.
 * Everything else goes to ctx.notSearched with its reason.
 */
import { talentName, treeName } from '../names';
import { pinRoot, table } from '../pin';
import type { LoadoutPatch } from '../patches';
import type { Change, Generator, Move, OwnedItem, State } from '../types';

type Rows<T> = Record<string, T>;
interface Catalog {
  modifier: Rows<{ bindings?: string[] }>;
  rolls: Rows<number[][]>;
  /** config_talent: i4 kind (1 micro, 2 core, 3 medium/legendary), i18 type (1 micro, 48 medium, 82 legendary), a40 [col,row] */
  talent: Rows<{ i4: number; i18: number; a40: [number, number] }>;
}

export { pinRoot };   // tests import it from here

let cat: Catalog | undefined;
export function catalog(): Catalog {
  if (cat) return cat;
  const rows = (f: string) => table<{ rows: any }>(f).rows;
  return (cat = { modifier: rows('config_modifier'), rolls: rows('config_modifier_rolls'), talent: rows('config_talent') });
}

/** config_prism_influence_shape (re/evidence/prisms.md (b)): cell offsets [dx (col), dy (row)] relative to the prism, own cell added. Ids 6, 7 are not documented. */
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const box = (x: [number, number], y: [number, number]) => range(...x).flatMap(dx => range(...y).map(dy => [dx, dy] as [number, number]));
const SHAPES: Record<number, [number, number][]> = {
  1: box([-1, 1], [-1, 1]), 2: box([-1, 2], [-1, 1]), 3: box([-1, 1], [-1, 2]),
  4: [[0, 0], [0, 1], [1, 1], [1, 0]], 5: [[0, 0], ...[1, 2, 3].flatMap(k => [[0, k], [0, -k]] as [number, number][])], 8: [[0, 0]],
};
const MEDIUM_TYPE = 48;   // config_talent +0x18; the server's talent-type 11 (prisms.md (a))

/** Shapes with a captured server resolution (both captured Haze placements are shape 3). The offsets of the others are documented
 *  but no capture has confirmed a resolution with them, so they are not generated (Task 7b review ruling). */
const CAPTURED_SHAPES = [3];

export interface PrismPlan { shape: number; ext: { modifierId: number; dyn: number[] }[]; /** 10004: prism-wide ExtraAffix on the tree */ provide: { id: number; dyn: number[] }[] }
export type Plan = PrismPlan | { skip: string };

/** What a prism item's modifiers resolve to, or the first reason it does not (never a guess). */
export function planPrism(item: Pick<OwnedItem, 'modifiers'>, c: Catalog = catalog()): Plan {
  let shape: number | undefined;
  const ext: PrismPlan['ext'] = [], provide: PrismPlan['provide'] = [];
  const fixed = (mod: number, by: number) => {
    const r = c.rolls[mod] ?? [];
    return !r.length || r.some(([lo, hi]) => lo !== hi) ? { skip: `modifier ${mod} granted by ${by} has a rolled value; the DynArgs are not known` } : r.map(([lo]) => lo);
  };
  for (const m of Object.values(item.modifiers).flat()) {
    const b = c.modifier[m.id]?.bindings?.[0] ?? '';   // b[0] only: the second string of a row belongs to the next row (prisms.md (d))
    const x = /^_mt4\d_(\d+)(?:_(\d+))?(?:_(\d+))?/.exec(b);
    if (!x) return { skip: `modifier ${m.id} is not a prism server affix` };
    const [, aff, p1, p2] = x;
    if (aff === '10007') {
      if (p1 !== '11') return { skip: `server affix 10007 on talent type ${p1} (${m.id}): only type 11 (Medium Talent) is confirmed (prisms.md (a))` };
      const mod = Number(p2), dyn = fixed(mod, m.id);
      if ('skip' in dyn) return dyn;
      ext.push({ modifierId: mod, dyn });
    } else if (aff === '10008') {
      if (shape !== undefined) return { skip: 'two server affixes 10008 (area expansions); their combination is not documented' };
      shape = Number(p1);
      if (!CAPTURED_SHAPES.includes(shape)) return { skip: `area shape ${shape} (${m.id}): no captured server resolution uses it (only shape ${CAPTURED_SHAPES}); a capture of a prism with this shape settles it` };
    } else if (aff === '10009' || aff === '10025') continue;   // server-side mechanics with no attribute task (prisms.md, "Extra grants")
    else if (aff === '10004') {   // `_mt42_10004_<p1>_<modifier>`: p1 (123456 on the Haze) is not documented and unused; both captured Haze placements agree
      if (!p2) return { skip: `server affix 10004 (${m.id}) has no modifier suffix` };
      const dyn = fixed(Number(p2), m.id);
      if ('skip' in dyn) return dyn;
      provide.push({ id: Number(p2), dyn });
    }
    else if (aff === '10005') return { skip: `server affix 10005 (${m.id}) adds Points to nodes in the area; its cap/stacking rule is not documented` };
    else return { skip: `server affix ${aff} (${m.id}) has no documented resolution` };
  }
  if (!ext.length && !provide.length) return { skip: 'no 10007 or 10004 affix: nothing to place' };
  // a prism without 10008 keeps its base area; the base InfluenceId is not in OwnedItem, so that case is not generated
  if (shape === undefined) return { skip: 'no 10008 affix: the base area (item InfluenceId) is not in the export' };
  return { shape, ext, provide };
}

/** Medium-talent nodes (ids) of `tree` inside the prism area at `cell` for `shape`. */
export function areaMediums(tree: number, cell: [number, number], shape: number, c: Catalog = catalog()): number[] {
  const cells = new Set(SHAPES[shape].map(([dx, dy]) => `${cell[0] + dx},${cell[1] + dy}`));
  return Object.entries(c.talent)
    .filter(([id, r]) => Math.floor(Number(id) / 1e6) === tree && r.i18 === MEDIUM_TYPE && cells.has(r.a40.join(',')))
    .map(([id]) => Number(id)).sort((a, b) => a - b);
}

/** The what-if changes that place the planned prism on `cell` (a node id). */
export function placeChanges(plan: PrismPlan, cell: number, c: Catalog = catalog()): Change[] {
  return areaMediums(Math.floor(cell / 1e6), c.talent[cell].a40, plan.shape, c)
    .flatMap(node => plan.ext.map(e => ({ kind: 'prism', action: 'add', node, modifierId: e.modifierId, dyn: e.dyn }) as Change));
}

/** The loadout patch that puts the prism's 10004 ExtraAffix on `tree` (none when the prism has no 10004). */
export const providePatch = (plan: PrismPlan, tree: number): LoadoutPatch[] =>
  plan.provide.length ? [{ kind: 'patch', op: 'prism-provide', tree, extraAffix: plan.provide }] : [];

type Placed = Record<string, { geniusId?: number; item?: { Id?: string } }>;
const pointOf = (l: State['loadout'], id: number): number => {
  const rt = (l.resolvedTalents as { talents: [number, number, string][] } | undefined)?.talents;
  if (rt) return rt.find(([i, , tag]) => i === id && !tag.startsWith('talent:-'))?.[1] ?? 0;
  return (l.talents as Record<string, number> | undefined)?.[id] ?? 0;
};

export const prismMoves: Generator = (s, ctx) => {
  const ns = ctx.notSearched;
  ns.add('prism: buying a prism (acquisition): the rolled values and base shape of an unowned prism are not known before purchase, so its resolution cannot be derived from the rules');
  ns.add('prism: moving a placed prism: the Point of the vacated and of the target cell on removal/placement is not documented');
  ns.add('prism: Inverse Image placement (10026): applyPatch can write the mirror copies, but the one captured resolution is not reproducible from documented rules (docs/prism-rules.md), so none is generated');
  ns.add('prism: cell legality is not documented; cells offered are the node kinds the owner has placed prisms on (micro, legendary medium; never a core) with no allocated Point');
  const prisms = s.loadout.prisms as { provide?: Record<string, unknown>; placed?: Placed } | undefined;
  if (!prisms?.provide) { ns.add('prism: the loadout has no prisms section'); return []; }
  const placed = prisms.placed ?? {}, placedIds = new Set(Object.values(placed).map(p => p.item?.Id));
  const free = Object.keys(prisms.provide).map(Number).filter(t => !placed[t] || !Object.keys(placed[t]).length);
  const c = catalog(), moves: Move[] = [];
  for (const it of s.owned) {
    if (placedIds.has(it.itemId)) continue;
    if (!Object.values(it.modifiers).flat().some(m => /^_mt4\d_100\d\d/.test(c.modifier[m.id]?.bindings?.[0] ?? ''))) continue;   // not a prism
    const plan = planPrism(it, c);
    if ('skip' in plan) { ns.add(`prism: owned ${it.baseName ?? it.baseId}: ${plan.skip}`); continue; }
    for (const tree of free) {
      const seen = new Set<string>();
      for (const [id, r] of Object.entries(c.talent)) {
        if (Math.floor(Number(id) / 1e6) !== tree || r.i4 === 2 || (r.i18 !== 1 && r.i18 !== 82) || pointOf(s.loadout, Number(id))) continue;
        const changes = [...placeChanges(plan, Number(id), c), ...providePatch(plan, tree)], key = JSON.stringify(changes);
        if (!changes.length || seen.has(key)) continue;   // same hosts = same figure
        seen.add(key);
        const hosts = [...new Set(changes.filter(x => x.kind === 'prism').map(x => (x as { node: number }).node))];
        moves.push({ kind: 'prism', acquisition: false, costFE: 0, minLevel: 0, changes, consumes: it.itemId,
          label: `Place prism ${it.baseName ?? it.baseId} on ${talentName(Number(id))} in the ${treeName(tree)} tree (medium nodes ${hosts.map(h => talentName(Number(h))).join(', ')})` });
      }
    }
  }
  return moves;
};
