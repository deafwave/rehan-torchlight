import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyPatch, isPatch } from '../src/patches';
import { planPrism, providePatch } from '../src/candidates/prisms';
import { pinRoot, table } from '../src/pin';
import type { OwnedItem } from '../src/types';

const pin = pinRoot();
const json = (p: string) => JSON.parse(readFileSync(join(pin, p), 'utf8'));
const L104 = () => json('game/loadout_l104-20261013-205555.json');
const haze = (ids: number[]): OwnedItem => ({ itemId: 'h', baseId: 360502, baseName: 'Haze', level: 86, where: 'bag', page: 0, slot: 0, count: 1, modifiers: { m: ids.map(id => ({ id, dynArgs: [] })) } });
const HAZE = [1214308031, 1214300171, 1204509011, 1204200101];
const asEntries = (x: { Id: number; DynArgs: number[] }[]) => x.map(e => ({ id: e.Id, dyn: e.DynArgs }));

describe('prism-provide gate: the captured Haze placements (tree 54 and 51)', () => {
  const plan = planPrism(haze(HAZE));
  it.each([['A52.state-20261013-043602', 54], ['L104-20261013-205651', 51]])('%s: tree %i ExtraAffix', (cap, tree) => {
    if ('skip' in plan) throw new Error(plan.skip);
    const lo = L104();
    lo.prisms.provide[tree] = { ExtraAffix: {}, TalentId: 0 };   // the loadout with the prism removed
    const out = applyPatch(lo, providePatch(plan, tree)[0]) as any;
    const want = json(`captures/${cap}/pre/prisms.json`);
    expect(asEntries(out.prisms.provide[tree].ExtraAffix)).toEqual(asEntries(want.JewelryProvideGeniusId[tree].ExtraAffix));
    expect(lo.prisms.provide[tree].ExtraAffix).toEqual({});   // pure
  });
  it('the loadout file of the placed Haze carries the same entries', () => {
    if ('skip' in plan) throw new Error(plan.skip);
    expect(asEntries(L104().prisms.provide['51'].ExtraAffix)).toEqual(plan.provide);
  });
});

describe('inverse patch', () => {
  const lo = L104(), rt = lo.resolvedTalents.talents as [number, number, string][];
  const copies = rt.filter(([, , t]) => t.startsWith('talent:-'));
  const bare = { ...lo, resolvedTalents: { ...lo.resolvedTalents, talents: rt.filter(([, , t]) => !t.startsWith('talent:-')) } };
  it('writes the captured mirror entries (ids, weights, tags)', () => {
    const out = applyPatch(bare, { kind: 'patch', op: 'inverse', copies: copies.map(([node, w]) => ({ node, points: Math.round(w / 0.49), ee: -51 })) }) as any;
    const key = (a: [number, number, string][]) => JSON.stringify([...a].sort((x, y) => x[2].localeCompare(y[2])));
    expect(key(out.resolvedTalents.talents)).toBe(key(rt));
  });
  it('remove drops the original, keeps copies', () => {
    const out = applyPatch(lo, { kind: 'patch', op: 'inverse', copies: [], remove: [12060100] }) as any;
    expect(out.resolvedTalents.talents.filter(([i]: number[]) => i === 12060100).map(([, , t]: string[]) => t)).toEqual(['talent:-12060100@49%']);
  });
  it('isPatch tells patches from what-if changes', () => {
    expect(isPatch({ kind: 'patch', op: 'inverse', copies: [] })).toBe(true);
    expect(isPatch({ kind: 'talent', node: 1, points: 1 })).toBe(false);
  });

  /** NOT a pass of the gate: the documented rules reproduce the copies of sources that hold a Point in the loadout, but not
   *  12040100, whose original has Point 0 on the server while its copy carries 2-3 points. So no Inverse Image move is generated. */
  it('rules reproduce the copies of held sources but not the prerequisite-locked 12040100', () => {
    const t = table<{ rows: Record<string, { i0: number; i18: number }> }>('config_talent').rows;
    const type = (id: number) => Object.values(t).find(r => r.i0 === id)!.i18;
    const ee = (id: number) => (type(id) === 48 ? -51 : NaN);   // 10026 type 11 (Medium Talent, prisms.md (a)); micro/legendary type mapping is ambiguous
    const held = (id: number) => rt.find(([i, , tag]) => i === id && !tag.startsWith('talent:-'))?.[1] ?? 0;
    const derived = (id: number) => held(id) * (1 + ee(id) / 100);
    const weight = (id: number) => copies.find(([i]) => i === id)![1];
    expect(derived(12060100)).toBe(weight(12060100));
    expect(derived(12060200)).toBe(weight(12060200));
    expect(derived(12040100)).not.toBe(weight(12040100));
  });
});


describe('gear-roll: one line of a worn item at another roll (a second copy of a legendary bought with a better roll)', () => {
  it('sets the line in that slot only, leaves the rest and the input alone', () => {
    const lo = { gear: [{ slot: 'chest', affixes: [{ id: 80935371, dyn: [18] }, { id: 80935381, dyn: [26] }] }, { slot: 'belt', affixes: [{ id: 80935371, dyn: [5] }] }] };
    const out = applyPatch(lo, { kind: 'patch', op: 'gear-roll', slot: 'chest', id: 80935371, dyn: [28] }) as typeof lo;
    expect(out.gear[0].affixes).toEqual([{ id: 80935371, dyn: [28] }, { id: 80935381, dyn: [26] }]);
    expect(out.gear[1].affixes[0].dyn).toEqual([5]);
    expect(lo.gear[0].affixes[0].dyn).toEqual([18]);
  });
});
