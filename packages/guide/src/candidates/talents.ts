/** Talent, core-talent and inverse-image candidates. All reconfigurations (acquisition false, 0 FE). Rules: docs/talent-rules.md. */
import type { Change, Generator, Move, MoveKind } from '../types';
import { talentName, treeName } from '../names';
import { type Copy, coreSet, copiesOf, nodeRow, pointsAtLevel, pointsOutsideObserved, treeCores, treeNodes, treeOf, treeSlotsAllowed, violations } from '../talentRules';

type Pts = Record<number, number>;
export interface TalentOpts { /** cap on "move a point" candidates (docs/talent-rules.md, Shift selection) */ maxShifts: number;
  /** only the "+1 point" moves (spending points a level-up made available) */ pointsOnly?: boolean }

const sum = (t: Pts) => Object.values(t).reduce((a, b) => a + b, 0);
const ofTree = (t: Pts, tr: number): Pts => Object.fromEntries(Object.entries(t).filter(([k, p]) => p > 0 && treeOf(+k) === tr));
const setPts = (node: number, points: number): Change => ({ kind: 'talent', node, points });
/** Rule breaks of one tree: node violations ('n<id>') and held cores without enough points in the tree ('c<id>'). */
const broken = (tr: number, t: Pts, cores: number[], copies: Copy[]) => {
  const own = ofTree(t, tr), total = sum(own) + copies.reduce((a, c) => a + (c.tree === tr ? c.point : 0), 0);
  return new Set([...violations(tr, own, copies).map(n => `n${n}`), ...cores.filter(c => treeOf(c) === tr && total < (nodeRow(c)?.need ?? Infinity)).map(c => `c${c}`)]);
};
/** fill `tree` with `total` points in node order (rows ascend with id), legal at every step */
export function fill(tree: number, total: number): Pts {
  const pts: Pts = {};
  for (let left = total, moved = true; left > 0 && moved;) {
    moved = false;
    for (const n of treeNodes(tree)) {
      const give = Math.min(n.max - (pts[n.id] ?? 0), left);
      if (give > 0 && violations(tree, { ...pts, [n.id]: (pts[n.id] ?? 0) + give }).length === 0) { pts[n.id] = (pts[n.id] ?? 0) + give; left -= give; moved = true; }
    }
  }
  return pts;
}

export const talentMovesWith = (opts: TalentOpts): Generator => (s, ctx) => {
  const l = s.loadout as { talents?: Pts; coreTalents?: number[]; resolvedTalents?: { talents?: [number, number, string][] } };
  const talents: Pts = Object.fromEntries(Object.entries(l.talents ?? {}).map(([k, v]) => [+k, v]));
  const cores = l.coreTalents ?? [];
  const copies = copiesOf(l.resolvedTalents?.talents);
  const budget = pointsAtLevel(ctx.level), spent = sum(talents);
  const out: Move[] = [];
  const before = new Map<number, Set<string>>();
  const was = (tr: number) => before.get(tr) ?? (before.set(tr, broken(tr, talents, cores, copies)), before.get(tr)!);
  /** a move is legal when no tree it touches gains a rule break; breaks the loadout already had (a state the reading cannot explain) are grandfathered */
  const ok = (changes: Change[], next: Pts, nextCores: number[]) =>
    [...new Set(changes.map(c => treeOf(c.kind === 'talent' || c.kind === 'core' ? c.node : 0)))]
      .every(tr => [...broken(tr, next, nextCores, copies)].every(v => was(tr).has(v)));
  const push = (kind: MoveKind, label: string, changes: Change[], next: Pts, nextCores: number[], enabler = false) => {
    if (ok(changes, next, nextCores)) out.push({ kind, label, acquisition: false, costFE: 0, minLevel: 1, changes, ...(enabler ? { enabler } : {}) });
  };
  const used = [...new Set(Object.entries(talents).filter(([, p]) => p > 0).map(([k]) => treeOf(+k)))];
  const inc = (id: number, d: number) => ({ ...talents, [id]: (talents[id] ?? 0) + d });

  // points: +1 (budget left), -1
  const nodes = used.flatMap(treeNodes);
  const adds = nodes.filter(n => (talents[n.id] ?? 0) < n.max);
  const has = nodes.filter(n => (talents[n.id] ?? 0) > 0);
  if (spent < budget) for (const n of adds) push('talent', `+1 point: ${talentName(n.id)}`, [setPts(n.id, (talents[n.id] ?? 0) + 1)], inc(n.id, 1), cores);
  if (opts.pointsOnly) return out;
  for (const a of has) push('talent', `-1 point: ${talentName(a.id)}`, [setPts(a.id, talents[a.id] - 1)], inc(a.id, -1), cores);

  // shifts (budget full): sources = held nodes whose removal breaks nothing, deepest row first; targets = nodes that accept the point,
  // same tree first; pairs taken in anti-diagonal order (same-tree class first) until maxShifts, so the best sources and targets both appear
  if (spent >= budget) {
    const pairs: { key: number[]; a: number; b: number }[] = [];
    has.filter(a => ok([setPts(a.id, talents[a.id] - 1)], inc(a.id, -1), cores)).sort((x, y) => y.row - x.row || x.id - y.id).forEach((a, si) => {
      const minus = inc(a.id, -1), seen = [0, 0];
      for (const b of [...adds.filter(n => treeOf(n.id) === treeOf(a.id)), ...adds.filter(n => treeOf(n.id) !== treeOf(a.id))]) {
        if (b.id === a.id || !ok([setPts(a.id, talents[a.id] - 1), setPts(b.id, (talents[b.id] ?? 0) + 1)], { ...minus, [b.id]: (talents[b.id] ?? 0) + 1 }, cores)) continue;
        const cls = treeOf(b.id) === treeOf(a.id) ? 0 : 1, ti = seen[cls]++;
        pairs.push({ key: [cls, si + ti, si, ti], a: a.id, b: b.id });
      }
    });
    pairs.sort((x, y) => x.key.reduce((d, k, i) => d || k - y.key[i], 0));
    for (const { a, b } of pairs.slice(0, opts.maxShifts))
      out.push({ kind: 'talent', label: `Move a point: ${talentName(a)} -> ${talentName(b)}`, acquisition: false, costFE: 0, minLevel: 1, changes: [setPts(a, talents[a] - 1), setPts(b, (talents[b] ?? 0) + 1)] });
    if (pairs.length > opts.maxShifts) ctx.notSearched.add(`point shifts beyond the best ${opts.maxShifts} of ${pairs.length} (maxShifts)`);
  }

  // core talents: add into a free (tree, set), or swap the held one of that set
  for (const t of used) for (const c of treeCores(t)) {
    if (cores.includes(c.id)) continue;
    const held = cores.find(h => treeOf(h) === t && coreSet(h) === coreSet(c.id));
    push('core', held ? `Swap core talent ${talentName(held)} for ${talentName(c.id)}` : `Add core talent ${talentName(c.id)}`,
      [...(held ? [{ kind: 'core', node: held, action: 'remove' } as Change] : []), { kind: 'core', node: c.id, action: 'add' }],
      talents, [...cores.filter(h => h !== held), c.id], true);
  }

  // tree swap: drop tree T (points and its cores), fill tree U of the same role (god <-> god, profession <-> profession, not held) in node
  // order with T's points (the search re-solves points)
  const [gods, profs] = treeSlotsAllowed(0);
  for (const t of used) {
    const tp = ofTree(talents, t), total = sum(tp), gone = cores.filter(c => treeOf(c) === t);
    const rest = Object.fromEntries(Object.entries(talents).filter(([k]) => treeOf(+k) !== t)) as Pts;
    for (const u of gods.includes(t) ? gods : profs) {
      if (used.includes(u)) continue;
      const filled = fill(u, total);
      push('talent', `Swap talent tree ${treeName(t)} for ${treeName(u)}`,
        [...Object.keys(tp).map(k => setPts(+k, 0)), ...gone.map(c => ({ kind: 'core', node: c, action: 'remove' }) as Change), ...Object.entries(filled).map(([k, p]) => setPts(+k, p))],
        { ...rest, ...filled }, cores.filter(c => !gone.includes(c)), true);
    }
  }

  // inverse images: applyPatch (src/patches.ts) can write the copies, but the only captured resolution is not reproducible from documented rules
  ctx.notSearched.add('inverse images: the captured resolution is not reproduced by the documented rules (a prerequisite-locked source node, 12040100, has Point 0 on the server but its copy carries 2-3 points; which sources are copied is also unexplained); none generated (docs/talent-rules.md)');
  if (pointsOutsideObserved(ctx.level)) ctx.notSearched.add(`talent points at level ${ctx.level}: no level -> points table exists; ${budget} points assumed (round(108 x (L - 1) / 92) below 93, the value observed at 93-96 above; docs/talent-rules.md)`);
  ctx.notSearched.add('tree slot rule is inferred (one god tree k=0 + up to 3 distinct professions, from 9 observed tree sets); a build outside it is not offered');
  ctx.notSearched.add('core talent limits (count per build): not found; one per (tree, set) assumed');
  return out;
};

export const talentMoves: Generator = talentMovesWith({ maxShifts: 60 });
/** the free "+1 point" moves alone: what the search spends new talent points with (no churn gate) */
export const talentPointMoves: Generator = talentMovesWith({ maxShifts: 0, pointsOnly: true });
