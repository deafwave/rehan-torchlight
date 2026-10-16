import { describe, expect, it } from 'vitest';
import { pactMoves } from '../src/candidates/pacts';
import { GROUND, L100, applyAll, fakePrices, loadout } from './apply';

const l100 = loadout(L100);
const gen = (prices: Record<string, number>) => pactMoves({ loadout: l100, owned: [], fe: 0, level: 100, skill: 'hoa' }, { prices: fakePrices(prices), level: 100, notSearched: new Set() });
type Pact = { servantId: number; rank: number; slot: number };
const equip = (m: ReturnType<typeof gen>[number]) => (m.changes[0] as { changes: { rank: number; contractKeys: number[]; servantId: number }[] }).changes[1];

describe('pactMoves', () => {
  const all = gen({}), moves = all.filter(m => m.label.startsWith('Raise '));
  it('equips an owned battle pactspirit at its owned rank with the contract points of its slot; never a drop pactspirit or one already held', () => {
    const own = all.filter(m => m.label.startsWith('Equip '));
    expect(own.length).toBeGreaterThan(0);
    const held = new Set((l100.pacts as Pact[]).map(p => p.servantId));
    for (const m of own) {
      const e = (m.changes[0] as { changes: { action: string; servantId: number; slot: number; rank: number; contractKeys: number[] }[] }).changes.at(-1)!;
      expect(e.action).toBe('equip');
      expect(held.has(e.servantId)).toBe(false);
      expect([1, 2, 3]).toContain(e.slot);
      expect(e.contractKeys.length).toBeGreaterThan(0);
      expect(e.contractKeys.every(k => Math.floor(k / 100) === e.slot)).toBe(true);
      expect(m).toMatchObject({ costFE: 0, market: 'drop' });
    }
    expect(own.some(m => /Twilight Sparks|Starfish Chanter|Plaintive Ball of Thread - Gold Leaf/.test(m.label))).toBe(false);   // drop pactspirits
  });
  it('raises each equipped pact to every higher rank up to 5, never lowers', () => {
    for (const p of l100.pacts as Pact[]) {
      const ranks = moves.filter(m => equip(m).servantId === p.servantId).map(m => equip(m).rank);
      expect(ranks, String(p.servantId)).toEqual(Array.from({ length: 5 - p.rank }, (_, i) => p.rank + 1 + i));
    }
  });
  it('a rank-up is not on the market: costFE null even when etor prices the servant name', () => {
    expect(moves.every(m => m.acquisition && m.costFE === null && m.market === 'not-on-market')).toBe(true);
    expect(gen({ 'Red Umbrella': 9 }).filter(m => m.label.startsWith('Raise ')).every(m => m.costFE === null)).toBe(true);
  });
  it('re-equips with the contractKeys of its own slot only', () => {
    const m = moves.find(x => equip(x).servantId === 1130)!;
    expect(equip(m).contractKeys.length).toBeGreaterThan(0);
    expect(equip(m).contractKeys.every(k => Math.floor(k / 100) === 1)).toBe(true);
  });
  it('applies through dps-debug applyOtherChange: the new rank is held, the other pacts and keys are unchanged', () => {
    const m = moves.find(x => equip(x).servantId === 1130 && equip(x).rank === 5)!;
    const out = applyAll(l100, m, GROUND.hoa);
    expect((out.pacts as Pact[]).find(p => p.servantId === 1130)!.rank).toBe(5);
    expect((out.pacts as Pact[]).length).toBe((l100.pacts as Pact[]).length);
    expect([...(out.contractKeys as number[])].sort()).toEqual([...l100.contractKeys].sort());
  });
});
