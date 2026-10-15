import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { talentMoves, talentMovesWith } from '../src/candidates/talents';
import { pinRoot } from '../src/pin';
import { talentName, treeName } from '../src/names';
import { POINT_OBSERVATIONS, copiesOf, legalAllocation, nodeRow, pointsAtLevel, treeCores, treeOf, treeSlotsAllowed, trimPage, violations } from '../src/talentRules';

const pin = pinRoot();
const l94 = JSON.parse(readFileSync(`${pin}/game/loadout_l94-20261013-160234.json`, 'utf8'));
const state = { loadout: l94, owned: [], fe: 0, level: 94, skill: 'iceShot' as const };
const tr = (t: Record<string, number>) => {
  const o = new Map<number, Record<number, number>>();
  for (const [k, p] of Object.entries(t)) if (p > 0) o.set(treeOf(+k), { ...o.get(treeOf(+k)), [+k]: p });
  return o;
};
const apply = (talents: Record<string, number>, cores: number[], changes: any[]) => {
  const t = { ...talents }, c = [...cores];
  for (const ch of changes) {
    if (ch.kind === 'talent') { if (ch.points > 0) t[ch.node] = ch.points; else delete t[ch.node]; }
    else if (ch.action === 'add') c.push(ch.node); else c.splice(c.indexOf(ch.node), 1);
  }
  return { t, c };
};
const gen = (level = 94) => { const ctx = { prices: {} as any, level, notSearched: new Set<string>() }; return { moves: talentMoves(state, ctx), ctx }; };

describe('talent rules', () => {
  it('points at observed levels equal the captured totals (recomputed from the captures)', () => {
    for (const o of POINT_OBSERVATIONS) {
      const player = JSON.parse(readFileSync(`${pin}/captures/${o.capture}/pre/player.json`, 'utf8'));
      const t = JSON.parse(readFileSync(`${pin}/captures/${o.capture}/pre/talents.json`, 'utf8'));
      const total = Object.values(t).flatMap((n: any) => Object.values(n)).reduce((a: number, n: any) => a + (n.IsMapping ? 0 : n.Point), 0);
      expect(player.cfg.level, o.capture).toBe(o.level);
      expect(total, o.capture).toBe(o.points);
      expect(pointsAtLevel(o.level)).toBe(o.points);
    }
  });
  it('below 93 the ledger formula round(108 x (L - 1) / 92) applies, from 93 the full budget', () => {
    expect(pointsAtLevel(94)).toBe(108);
    expect(pointsAtLevel(60)).toBe(Math.round(108 * 59 / 92));
    expect(pointsAtLevel(92)).toBe(107);
    expect(pointsAtLevel(100)).toBe(108);
  });
  it('accepts the owner L94 allocation, per tree', () => {
    for (const [t, p] of tr(l94.talents)) expect(legalAllocation(t, p), `tree ${t}`).toBe(true);
  });
  it('rejects a node whose row needs more points than spent above it, and a node with a prerequisite below max', () => {
    expect(legalAllocation(34, { 34070100: 1 })).toBe(false);
    expect(legalAllocation(34, { 34010100: 3, 34020100: 2, 34030200: 1 })).toBe(false);
    expect(legalAllocation(34, { 34010100: 2, 34020100: 1 })).toBe(false); // prereq 34010100 not at max
  });
  it('slot rule: one god tree (k=0) slot plus three profession slots', () => {
    const s = treeSlotsAllowed(4001);
    expect(s).toHaveLength(4);
    expect(s[0]).toEqual([10, 20, 30, 40, 50, 60]);
    expect(s[1]).toContain(34); expect(s[1]).not.toContain(10);
  });
  it('every tree set on disk follows the rule (<=1 god tree, <=3 professions)', () => {
    let n = 0;
    const check = (trees: number[]) => { n++; expect(trees.filter(t => t % 10 === 0).length).toBeLessThanOrEqual(1); expect(trees.filter(t => t % 10 !== 0).length).toBeLessThanOrEqual(3); };
    // a capture holding more points than its level has read two talent pages at once (pin rungs L107-L111: 174 of 108); not one allocation
    for (const f of readdirSync(`${pin}/game`).filter(f => /^loadout_.*json$/.test(f))) {
      const l = JSON.parse(readFileSync(`${pin}/game/${f}`, 'utf8')), t: Record<string, number> = l.talents ?? {};
      if (Object.values(t).reduce((a, b) => a + b, 0) > pointsAtLevel(l.hero?.level ?? 93)) continue;
      check([...tr(t).keys()]);
    }
    expect(n).toBeGreaterThan(100);
  });

});

describe('talent moves', () => {
  const { moves, ctx } = gen();
  it('emits point, core and tree-swap moves, all free reconfigurations', () => {
    expect(moves.some(m => m.label.startsWith('Swap talent tree'))).toBe(true);
    expect(moves.some(m => m.label.startsWith('Swap core') || m.label.startsWith('Add core'))).toBe(true);
    expect(moves.some(m => m.label.startsWith('Move a point'))).toBe(true);
    for (const m of moves) { expect(m.acquisition).toBe(false); expect(m.costFE).toBe(0); }
  });
  it('every move keeps the allocation legal, within points, cores unlocked', () => {
    for (const m of moves) {
      const { t, c } = apply(l94.talents, l94.coreTalents, m.changes);
      for (const [tree, p] of tr(t)) expect(legalAllocation(tree, p), m.label).toBe(true);
      expect(Object.values(t).reduce((a: number, b: any) => a + b, 0), m.label).toBeLessThanOrEqual(pointsAtLevel(94));
      for (const core of c) {
        const need = treeCores(treeOf(core)).find(n => n.id === core)!.need;
        expect([...(tr(t).get(treeOf(core)) ? Object.values(tr(t).get(treeOf(core))!) : [])].reduce((a, b) => a + b, 0), m.label).toBeGreaterThanOrEqual(need);
      }
    }
  });
  it('tree swap drops the old tree cores and fills the new tree', () => {
    const m = moves.find(x => x.label === `Swap talent tree ${treeName(34)} for ${treeName(11)}`)!;
    const { t, c } = apply(l94.talents, l94.coreTalents, m.changes);
    expect(Object.keys(t).some(k => treeOf(+k) === 34)).toBe(false);
    expect(c).not.toContain(34001200);
    expect(Object.keys(t).some(k => treeOf(+k) === 11)).toBe(true);
  });
  it('swaps keep roles: profession for profession, god for god, never a tree already held', () => {
    // the trees a swap empties and fills, from its changes (the label names them)
    const swaps = moves.filter(m => m.label.startsWith('Swap talent tree')).map(m => {
      const cs = (m.changes as { kind: string; node: number; points?: number }[]).filter(c => c.kind === 'talent');
      return [treeOf(cs.find(c => c.points === 0)!.node), treeOf(cs.find(c => (c.points ?? 0) > 0)!.node)];
    });
    expect(swaps.length).toBeGreaterThan(0);
    for (const [t, u] of swaps) { expect(t % 10 === 0).toBe(u % 10 === 0); expect([20, 21, 34, 43]).not.toContain(u); }
    expect(swaps).toContainEqual([20, 30]);
    expect(swaps).not.toContainEqual([34, 10]);
  });
  it('lists the unported rules, inverse images included', () => {
    expect([...ctx.notSearched].some(x => x.startsWith('inverse images'))).toBe(true);
    expect(moves.some(m => m.kind === 'inverse')).toBe(false);
  });
  it('core moves offer only unlocked cores', () => {
    const low = { ...state, loadout: { ...l94, talents: { 34010100: 3 }, coreTalents: [] } };
    const cm = talentMoves(low, { prices: {} as any, level: 94, notSearched: new Set() }).filter(m => m.kind === 'core');
    expect(cm).toHaveLength(0);
  });
  it('every loadout in game/ without Inverse Image copies satisfies the row rule', () => {
    let checked = 0;
    for (const f of readdirSync(`${pin}/game`).filter(f => /^loadout_.*json$/.test(f))) {
      const l = JSON.parse(readFileSync(`${pin}/game/${f}`, 'utf8'));
      // a copy can stand in for an original (prisms.md (c)); those states are not checkable from `talents` alone
      if ((l.resolvedTalents?.talents ?? []).some((x: any) => String(x[2]).startsWith('talent:-'))) continue;
      for (const [t, p] of tr(l.talents ?? {})) expect(legalAllocation(t, p), `${f} tree ${t}`).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(10);
  });

  const total = (t: Record<string, number>) => Object.values(t).reduce((a, b) => a + b, 0);
  const run = (loadout: any, level = 94, gen = talentMoves) => gen({ ...state, loadout, level }, { prices: {} as any, level, notSearched: new Set<string>() });

  it('at 107 of 108 points: point adds exist and nothing goes past the budget', () => {
    const talents = { ...l94.talents }; delete talents['34070400'];
    expect(total(talents)).toBe(107);
    const ms = run({ ...l94, talents });
    const adds = ms.filter(m => m.label.startsWith('+1 point'));
    expect(adds.length).toBeGreaterThan(0);
    for (const m of ms) expect(total(apply(talents, l94.coreTalents, m.changes).t), m.label).toBeLessThanOrEqual(108);
    expect(ms.some(m => m.label.startsWith('Move a point'))).toBe(false);
  });
  it('a core is offered at exactly its threshold and not one point below', () => {
    const t21 = Object.fromEntries(Object.entries(l94.talents).filter(([k]) => k.startsWith('21'))) as Record<string, number>;
    expect(total(t21)).toBe(24);
    const cores = (t: Record<string, number>) => run({ ...l94, talents: t, coreTalents: [] }).filter(m => m.kind === 'core')
      .flatMap(m => (m.changes as { kind: string; node: number; action?: string }[]).filter(c => c.kind === 'core' && c.action === 'add').map(c => c.node));
    expect(cores(t21)).toContain(21001100);
    expect(cores(t21).some(x => String(x).startsWith('21002'))).toBe(false); // set 2 needs 32
    expect(run({ ...l94, talents: t21, coreTalents: [] }).some(m => m.label === `Add core talent ${talentName(21001100)}`)).toBe(true);
    expect(cores({ ...t21, '21050300': 0 })).toEqual([]);
  });
  it('unknown, foreign or malformed nodes are illegal and never throw', () => {
    expect(legalAllocation(34, { 99999999: 1 })).toBe(false);
    expect(legalAllocation(34, { 12010100: 1 })).toBe(false);
    expect(legalAllocation(34, { 34010100: 4 })).toBe(false);
    expect(legalAllocation(34, { 34010100: NaN })).toBe(false);
    expect(violations(34, { 99999999: 1, 34010100: 3 })).toEqual([99999999]);
    expect(nodeRow(99999999)).toBeUndefined();
    const ms = run({ ...l94, coreTalents: [...l94.coreTalents, 99999999] });
    expect(ms.length).toBeGreaterThan(0);
  });
  it('shifts are bounded by maxShifts and the selection is deterministic', () => {
    const shifts = (n: number) => run(l94, 94, talentMovesWith({ maxShifts: n })).filter(m => m.label.startsWith('Move a point')).map(m => m.label);
    expect(shifts(60).length).toBe(60);
    expect(shifts(5)).toHaveLength(5);
    expect(shifts(5)).toEqual(shifts(5));
    expect(shifts(60).slice(0, 5)).toEqual(shifts(5));
    expect(shifts(1000).length).toBeGreaterThan(60);
  });
  const withCopies = ['loadout_l104-20261013-205555.json', 'loadout_probuild-hanshansi-bing-20261013-040710.json'];
  it('a real loadout with Inverse Image copies still gets moves, each touched tree gains no rule break', () => {
    for (const f of withCopies) {
      const l = JSON.parse(readFileSync(`${pin}/game/${f}`, 'utf8'));
      const copies = copiesOf(l.resolvedTalents.talents);
      expect(copies.length, f).toBeGreaterThan(0);
      const ms = run(l);
      expect(ms.length, f).toBeGreaterThan(10);
      for (const m of ms) {
        const { t } = apply(l.talents, l.coreTalents, m.changes);
        for (const tree of new Set(m.changes.map((c: any) => treeOf(c.node)))) {
          const was = violations(tree, tr(l.talents).get(tree) ?? {}, copies), now = violations(tree, tr(t).get(tree) ?? {}, copies);
          expect(now.filter(n => !was.includes(n)), `${f} ${m.label}`).toEqual([]);
        }
      }
    }
  });
  it('counting Inverse Image copies at their mirrored row satisfies every row threshold on disk; held cores are met with copies counted', () => {
    let withCopy = 0;
    for (const f of readdirSync(`${pin}/game`).filter(f => /^loadout_.*json$/.test(f))) {
      const l = JSON.parse(readFileSync(`${pin}/game/${f}`, 'utf8')), copies = copiesOf(l.resolvedTalents?.talents);
      withCopy += copies.length ? 1 : 0;
      for (const [id, p] of Object.entries(l.talents ?? {}) as [string, number][]) {
        const n = nodeRow(+id)!, above = Object.entries(l.talents).reduce((a, [k, q]: any) => a + (treeOf(+k) === treeOf(+id) && nodeRow(+k)!.row < n.row ? q : 0), 0)
          + copies.reduce((a, c) => a + (c.tree === treeOf(+id) && c.row < n.row ? c.point : 0), 0);
        if (p > 0) expect(above, `${f} ${id}`).toBeGreaterThanOrEqual(n.need);
      }
      for (const c of (l.coreTalents ?? []).filter((x: number) => nodeRow(x))) expect(total(Object.fromEntries(Object.entries(l.talents as Record<string, number>).filter(([k]) => treeOf(+k) === treeOf(c)))) + copies.reduce((a, x) => a + (x.tree === treeOf(c) ? x.point : 0), 0), `${f} core ${c}`).toBeGreaterThanOrEqual(nodeRow(c)!.need);
    }
    expect(withCopy).toBeGreaterThan(100);
  });
});

describe('trimPage', () => {
  const t = JSON.parse(readFileSync(`${pin}/re/evidence/loadout_probuild-hanshansi-bing.json`, 'utf8')) as { talents: Record<string, number>; coreTalents: number[] };
  const sum = (p: Record<number, number>) => Object.values(p).reduce((a, b) => a + b, 0);
  it('a page that fits is kept whole', () => {
    expect(trimPage(t.talents, t.coreTalents, 200)).toEqual({ talents: Object.fromEntries(Object.entries(t.talents).map(([k, v]) => [Number(k), v])), cores: t.coreTalents });
  });
  // the target page breaks the bare rules (it reaches points through prism copies and slates): a cut adds no violation it did not have
  const own = (p: Record<string | number, number>, tree: number) => Object.fromEntries(Object.entries(p).filter(([k]) => treeOf(+k) === tree).map(([k, v]) => [+k, v]));
  const inTree = (p: Record<string | number, number>, tree: number) => sum(own(p, tree));
  it('a page cut to the level points: no new rule broken per tree, never above the target, a core kept only while its tree has its need', () => {
    for (const points of [99, 69]) {
      const r = trimPage(t.talents, t.coreTalents, points);
      expect(sum(r.talents)).toBe(points);
      for (const tree of new Set(Object.keys(r.talents).map((k) => treeOf(+k)))) {
        const before = new Set(violations(tree, own(t.talents, tree)));
        expect(violations(tree, own(r.talents, tree)).filter((v) => !before.has(v)), `tree ${tree} at ${points}`).toEqual([]);
      }
      for (const [k, v] of Object.entries(r.talents)) expect(v).toBeLessThanOrEqual(t.talents[k]);
      for (const c of t.coreTalents) {
        const need = Math.min(nodeRow(c)!.need, inTree(t.talents, treeOf(c)));
        expect(r.cores.includes(c), `core ${c} at ${points}`).toBe(inTree(r.talents, treeOf(c)) >= need);
      }
    }
  });
  it('the points come off the deepest rows first', () => {
    const r = trimPage(t.talents, t.coreTalents, 99), cut = Object.keys(t.talents).filter((k) => (r.talents[+k] ?? 0) < t.talents[k]);
    const kept = Object.keys(r.talents).filter((k) => r.talents[+k] === t.talents[k]);
    for (const tree of new Set(cut.map((k) => treeOf(+k)))) {
      const low = Math.min(...cut.filter((k) => treeOf(+k) === tree).map((k) => nodeRow(+k)!.row));
      const deeperKept = kept.filter((k) => treeOf(+k) === tree && nodeRow(+k)!.row > low);
      expect(deeperKept, `tree ${tree}`).toEqual([]);
    }
  });
});
