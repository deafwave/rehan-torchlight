import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { areaMediums, catalog, pinRoot, placeChanges, planPrism, prismMoves } from '../src/candidates/prisms';
import type { OwnedItem, State } from '../src/types';

const pin = pinRoot();
const json = (p: string) => JSON.parse(readFileSync(join(pin, p), 'utf8'));
const HAZE = [1214308031, 1214300171, 1204509011, 1204200101];   // 360502: area 10008 shape 3, 10007 type 11 -> 1204400071, 10009, 10004 (provide)
const owned = (ids: number[], itemId = 'haze'): OwnedItem => ({ itemId, baseId: 360502, baseName: 'Haze', level: 86, where: 'bag', page: 0, slot: 0, count: 1,
  modifiers: { m: ids.map(id => ({ id, dynArgs: [] })) } });
/** the server's ExtAffix nodes of `tree` in a captured pre/prisms.json, as the what-if changes that reproduce them */
const captured = (capture: string, tree: number) => {
  const t = json(`captures/${capture}/pre/prisms.json`).TalentDataList[tree] as Record<string, { ExtAffix: { Id: number; DynArgs: number[] }[] | object }>;
  return Object.entries(t).flatMap(([node, v]) => (Array.isArray(v.ExtAffix) ? v.ExtAffix : []).map(x => ({ kind: 'prism', action: 'add', node: Number(node), modifierId: x.Id, dyn: x.DynArgs })))
    .sort((a, b) => a.node - b.node);
};
const sorted = <T extends { node?: number }>(a: T[]) => [...a].sort((x, y) => x.node! - y.node!);

describe('prism rules reproduce the owner captured server resolution', () => {
  const plan = planPrism(owned(HAZE.filter(id => id !== 1204200101)));
  it('plans the 10004 ExtraAffix from the binding and the fixed roll', () => {
    expect(planPrism(owned(HAZE))).toMatchObject({ provide: [{ id: 1204404001, dyn: [12, 12] }] });
  });
  it('plans a 10007/10008 prism from the catalog (shape = the 10008 suffix, ExtAffix dyn = the fixed roll)', () => {
    expect(plan).toEqual({ shape: 3, ext: [{ modifierId: 1204400071, dyn: [6, 6] }], provide: [] });
  });
  it.each([['A52.state-20261013-043602', 54, 54060200], ['L104-20261013-205651', 51, 51050200]])('%s: tree %i prism on %i', (cap, tree, cell) => {
    expect('skip' in plan).toBe(false);
    if ('skip' in plan) return;
    const got = placeChanges(plan, cell);
    expect(sorted(got as { node?: number }[])).toEqual(captured(cap, tree));
    expect(got.length).toBeGreaterThan(0);
  });
  it('the area is the medium nodes of the shape, nothing past it', () => {
    expect(areaMediums(51, catalog().talent[51050200].a40, 3)).toEqual([51040100, 51060100, 51060200]);
  });
});

describe('prismMoves', () => {
  const placed = json('game/loadout_l104-20261013-205555.json').prisms;
  const mk = (items: OwnedItem[], emptyTree51: boolean): State => {
    const l = json('game/loadout_l104-20261013-205555.json');
    if (emptyTree51) {
      l.prisms.placed['51'] = {};
      l.resolvedTalents.ext = [];
    }
    return { loadout: l, owned: items, fe: 0, level: 100, skill: 'iceShot' };
  };
  const run = (s: State) => { const notSearched = new Set<string>(); return { moves: prismMoves(s, { prices: {} as never, level: 100, notSearched }), notSearched }; };

  it('the owned Haze without its 10004 base affix, with tree 51 free, offers the captured placement', () => {
    expect(placed.placed['51'].geniusId).toBe(51050200);
    const { moves } = run(mk([owned(HAZE.filter(id => id !== 1204200101))], true));
    const want = captured('L104-20261013-205651', 51);
    const hit = moves.find(m => JSON.stringify(sorted(m.changes as { node?: number }[])) === JSON.stringify(want));
    expect(hit).toBeDefined();
    expect(hit).toMatchObject({ kind: 'prism', acquisition: false, costFE: 0, consumes: 'haze' });
    expect(moves.every(m => m.changes.length > 0 && m.changes.every(c => c.kind === 'prism'))).toBe(true);
  });
  it('the real Haze (with 10004) is offered with its prism-provide patch last', () => {
    const { moves } = run(mk([owned(HAZE)], true));
    const hit = moves.find(m => JSON.stringify(sorted(m.changes.filter(c => c.kind === 'prism') as { node?: number }[])) === JSON.stringify(captured('L104-20261013-205651', 51)));
    expect(hit?.changes.at(-1)).toEqual({ kind: 'patch', op: 'prism-provide', tree: 51, extraAffix: [{ id: 1204404001, dyn: [12, 12] }] });
  });
  it('a shape without a captured resolution is not offered', () => {
    const c = catalog(), shape4 = Object.entries(c.modifier).find(([, r]) => r.bindings?.[0] === '_mt43_10008_4')![0];
    const { moves, notSearched } = run(mk([owned([Number(shape4), 1214300171])], true));
    expect(moves).toEqual([]);
    expect([...notSearched].some(x => x.includes('area shape 4'))).toBe(true);
  });
  it('an already placed prism is not offered again', () => {
    const l = mk([owned(HAZE.filter(id => id !== 1204200101), '360502_22a5b55a-82cc-11f1-bbf4-000000000fd3')], false);
    expect(run(l).moves).toEqual([]);
  });
  it('trees that hold a prism are not offered', () => {
    expect(run(mk([owned(HAZE.filter(id => id !== 1204200101))], false)).moves.every(m => !m.label.includes('tree 51') && !m.label.includes('tree 12'))).toBe(true);
  });
  it('names the families that are never searched', () => {
    const { notSearched } = run(mk([], false));
    for (const k of ['buying a prism', 'moving a placed prism', 'Inverse Image', 'cell legality']) expect([...notSearched].some(x => x.includes(k))).toBe(true);
  });
});
