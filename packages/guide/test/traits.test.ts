import { describe, expect, it } from 'vitest';
import { traitMoves } from '../src/candidates/traits';
import { GROUND, L100, applyAll, fakePrices, loadout } from './apply';

const l100 = loadout(L100);   // traits 810001:1, 810011:2, 810022:2, 810031:2
const gen = (level: number) => traitMoves({ loadout: l100, owned: [], fe: 0, level, skill: 'hoa' }, { prices: fakePrices({}), level, notSearched: new Set() });

describe('traitMoves', () => {
  const moves = gen(100);
  const swaps = (m: (typeof moves)[number]) => (m.changes[0] as { changes: { trait: number; tier: number }[] }).changes;
  it('swaps one held trait for its layer sibling at the same tier, free', () => {
    expect(moves.map(m => swaps(m).map(c => `${c.trait}:${c.tier}`).join('>')).sort()).toEqual(
      ['810011:0>810012:2', '810022:0>810021:2', '810031:0>810032:2']);
    expect(moves.every(m => m.kind === 'trait' && !m.acquisition && m.costFE === 0)).toBe(true);
  });
  it('level gate: a layer that opens above the hero level is not offered', () => {
    expect(gen(70).map(m => m.minLevel).sort()).toEqual([45, 60]);
    expect(gen(40)).toEqual([]);
  });
  it('applies through dps-debug applyOtherChange', () => {
    const m = moves.find(x => swaps(x)[0].trait === 810011)!;
    expect(applyAll(l100, m, GROUND.hoa).traits).toEqual({ 810001: 1, 810012: 2, 810022: 2, 810031: 2 });
  });
});
