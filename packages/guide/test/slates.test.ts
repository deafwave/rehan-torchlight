import { describe, expect, it } from 'vitest';
import { replaceable, slateMoves } from '../src/candidates/slates';
import { table } from '../src/pin';
import { GROUND, L100, applyAll, fakePrices, loadout } from './apply';

const gen = (l: Record<string, unknown>, level: number) => {
  const notSearched = new Set<string>();
  return { moves: slateMoves({ loadout: l, owned: [], fe: 0, level, skill: 'hoa' }, { prices: fakePrices({}), level, notSearched }), notSearched };
};
const l100 = loadout(L100);
type Slate = { itemId: string; talents: number[]; link: { SlotId: number }; direction: number };
const act = (m: { changes: unknown[] }) => (m.changes[0] as { action: string }).action;

describe('slateMoves', () => {
  const { moves, notSearched } = gen(l100, 100);
  it('offers remove and move of placed slates as free reconfigurations, and says buying is not searched', () => {
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every(m => m.kind === 'slate' && !m.acquisition && m.costFE === 0)).toBe(true);
    expect(new Set(moves.map(act))).toEqual(new Set(['remove', 'move']));
    expect([...notSearched].some(n => /buying or placing a slate/.test(n))).toBe(true);
  });
  it('a remove and a move apply through dps-debug applyOtherChange and change the board', () => {
    const rm = moves.find(m => act(m) === 'remove')!, mv = moves.find(m => act(m) === 'move')!;
    const before = l100.slateItems as Slate[];
    expect((applyAll(l100, rm, GROUND.hoa).slateItems as Slate[]).length).toBe(before.length - 1);
    const ch = mv.changes[0] as { itemId: string; slot: number; direction: number };
    const moved = (applyAll(l100, mv, GROUND.hoa).slateItems as Slate[]).find(x => x.itemId === ch.itemId)!;
    expect([moved.link.SlotId, moved.direction]).toEqual([ch.slot, ch.direction]);
  });
  it('level gate: the level-90 board cells are not offered at hero level 60', () => {
    const low = gen(l100, 60).moves;
    expect(low.every(m => m.minLevel <= 60)).toBe(true);
    expect(moves.some(m => m.minLevel === 90)).toBe(true);
    expect(low.filter(m => act(m) === 'move').length).toBeLessThan(moves.filter(m => act(m) === 'move').length);
  });
  it('removing a slate that carries a core talent is an enabler, any other is not', () => {
    const talent = table<{ rows: Record<string, { i4: number }> }>('config_talent').rows;
    for (const it of l100.slateItems as Slate[]) {
      const core = it.talents.some(t => talent[t].i4 === 2);
      const m = moves.find(x => (x.changes[0] as { itemId?: string }).itemId === it.itemId && act(x) === 'remove')!;
      expect(!!m.enabler, it.itemId).toBe(core);
    }
    expect(moves.some(m => m.enabler)).toBe(true);
  });
  it('a loadout with only the flat slates list is not searched', () => {
    const r = gen({ ...l100, slateItems: null }, 100);
    expect(r.moves).toEqual([]);
    expect([...r.notSearched].some(n => /no slateItems/.test(n))).toBe(true);
  });
});

describe('replaceable', () => {
  // the owner's board, 2026-10-17: three Corners of Divinity (261005), two 261003, a God of Might's Divinity, one Pedigree (261010)
  const board = [261005, 261003, 260504, 261010, 261005, 261005, 261003].map((baseId) => ({ baseId }));
  it('a Pedigree replaces only the Pedigree (owner: at most one on a board)', () => expect(replaceable(board, 261010)).toEqual([3]));
  it('a fourth Corner of Divinity replaces only one of the three', () => expect(replaceable(board, 261005)).toEqual([0, 4, 5]));
  it('a base with no cap replaces any slate', () => expect(replaceable(board, 260504)).toEqual([0, 1, 2, 3, 4, 5, 6]));
});
