/** Talent, core-talent and inverse-image candidates. All reconfigurations (acquisition false, 0 FE). Rules: docs/talent-rules.md. */
import type { Change, Generator, Move, MoveKind } from '../types';
import { talentName, treeName } from '../names';
import { type Copy, type TalentRow, coreSet, copiesOf, nodeRow, pointsAtLevel, pointsOutsideObserved, treeCores, treeNodes, treeOf, treeSlotsAllowed, violations } from '../talentRules';

type Pts = Record<number, number>;
export interface TalentOpts { /** cap on "move a point" candidates (docs/talent-rules.md, Shift selection) */ maxShifts: number;
  /** only the "+1 point" moves (spending points a level-up made available) */ pointsOnly?: boolean;
  /** only whole-page variants (a free respec): one tree raised to a core's need with that core, or swapped for a tree of its role at a core's need */ pages?: boolean;
  /** nodes whose points never go down and whose tree is never swapped away (a respec keeps what the model prices at 0: it cannot see it, e.g. a Frozen target) */ locked?: ReadonlySet<number> }

const sum = (t: Pts) => Object.values(t).reduce((a, b) => a + b, 0);
const ofTree = (t: Pts, tr: number): Pts => Object.fromEntries(Object.entries(t).filter(([k, p]) => p > 0 && treeOf(+k) === tr));
const setPts = (node: number, points: number): Change => ({ kind: 'talent', node, points });
/** Rule breaks of one tree: node violations ('n<id>') and held cores without enough points in the tree ('c<id>'). */
const broken = (tr: number, t: Pts, cores: number[], copies: Copy[]) => {
  const own = ofTree(t, tr), total = sum(own) + copies.reduce((a, c) => a + (c.tree === tr ? c.point : 0), 0);
  return new Set([...violations(tr, own, copies).map(n => `n${n}`), ...cores.filter(c => treeOf(c) === tr && total < (nodeRow(c)?.need ?? Infinity)).map(c => `c${c}`)]);
};
/** fill `tree` up to `total` points in node order (rows ascend with id) from `start`, legal at every step */
export function fill(tree: number, total: number, start: Pts = {}): Pts {
  const pts: Pts = { ...start };
  for (let left = total - sum(start), moved = true; left > 0 && moved;) {
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
  const holdsLocked = (tr: number) => Object.keys(talents).some(k => treeOf(+k) === tr && talents[+k] > 0 && opts.locked?.has(+k));

  if (opts.pages) {
    // the points come from the unspent budget first, then off the other trees: the tree with the most points above its cores' need, deepest row first
    const total = (t: Pts, tr: number) => sum(ofTree(t, tr));
    const need = (tr: number, cs: number[]) => Math.max(0, ...cs.filter(c => treeOf(c) === tr).map(c => nodeRow(c)?.need ?? 0));
    const take = (t0: Pts, cs: number[], n: number, keep: number): Pts | undefined => {
      const t = { ...t0 };
      for (; n > 0; n--) {
        const k = Object.keys(t).map(Number).filter(k => t[k] > 0 && !opts.locked?.has(k) && treeOf(k) !== keep && total(t, treeOf(k)) > need(treeOf(k), cs)
          && [...broken(treeOf(k), { ...t, [k]: t[k] - 1 }, cs, copies)].every(v => was(treeOf(k)).has(v)))
          .sort((a, b) => (total(t, treeOf(b)) - need(treeOf(b), cs)) - (total(t, treeOf(a)) - need(treeOf(a), cs)) || nodeRow(b)!.row - nodeRow(a)!.row || b - a)[0];
        if (k === undefined) return undefined;
        t[k]--;
      }
      return t;
    };
    const page = (label: string, from: number, to: number, core: TalentRow) => {
      const gone = from === to ? cores.filter(c => treeOf(c) === to && coreSet(c) === coreSet(core.id)) : cores.filter(c => treeOf(c) === from);
      const nextCores = [...cores.filter(c => !gone.includes(c)), core.id];
      const start = from === to ? ofTree(talents, from) : {}, n = Math.max(total(talents, from), core.need);
      const rest = from === to ? talents : Object.fromEntries(Object.entries(talents).filter(([k]) => treeOf(+k) !== from)) as Pts;
      const short = n - sum(start) - Math.max(0, budget - sum(rest));
      const t = short > 0 ? take(rest, nextCores, short, to) : rest;
      const grown = t && fill(to, n, start);
      if (!t || !grown || sum(grown) !== n) return;
      const next = { ...t, ...grown };
      const changes: Change[] = [...new Set([...Object.keys(talents), ...Object.keys(next)].map(Number))].filter(k => (talents[k] ?? 0) !== (next[k] ?? 0))
        .map(k => setPts(k, next[k] ?? 0));
      push('talent', label, [...changes, ...gone.map(c => ({ kind: 'core', node: c, action: 'remove' }) as Change), { kind: 'core', node: core.id, action: 'add' }], next, nextCores, true);
    };
    const [gods, profs] = treeSlotsAllowed(0);
    for (const t of used) {
      for (const c of treeCores(t)) if (!cores.includes(c.id) && c.need > total(talents, t))
        page(`Raise ${treeName(t)} to ${c.need} points and take core talent ${talentName(c.id)}`, t, t, c);
      if (!holdsLocked(t)) for (const u of gods.includes(t) ? gods : profs) if (!used.includes(u)) for (const c of treeCores(u))
        page(`Swap talent tree ${treeName(t)} for ${treeName(u)} (${Math.max(total(talents, t), c.need)} points, core talent ${talentName(c.id)})`, t, u, c);
    }
    return out;
  }

  // points: +1 (budget left), -1
  const nodes = used.flatMap(treeNodes);
  const adds = nodes.filter(n => (talents[n.id] ?? 0) < n.max);
  const has = nodes.filter(n => (talents[n.id] ?? 0) > 0 && !opts.locked?.has(n.id));
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
  for (const t of used.filter(x => !holdsLocked(x))) {
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
/** whole-page variants for a free respec (each then re-fitted by talentMoves) */
export const pageVariants: Generator = talentMovesWith({ maxShifts: 0, pages: true });
