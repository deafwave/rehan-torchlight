import { expect, it } from 'vitest';
import { memoryMoves } from '../src/candidates/memories';
import { L100, fakePrices, loadout } from './apply';

it('offers no memory move: dps-debug has no what-if change for a hero memory, and says so', () => {
  const notSearched = new Set<string>();
  expect(memoryMoves({ loadout: loadout(L100), owned: [], fe: 0, level: 100, skill: 'hoa' }, { prices: fakePrices({}), level: 100, notSearched })).toEqual([]);
  expect([...notSearched].join()).toMatch(/no what-if change for hero memories/);
});
