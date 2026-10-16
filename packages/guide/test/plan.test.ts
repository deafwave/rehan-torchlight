import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pinRoot } from '../src/pin';
import { candidates, DEFAULT_PLAN } from '../src/plan';
import { snapshotBook } from '../src/pricing';
import { localItems } from '../src/modes';
import type { State } from '../src/types';

// the owner's live Hammer of Ash character (export 20261016-122806, dps-debug MANA1's fixture)
const live = JSON.parse(readFileSync(join(pinRoot(), 're/evidence/mana1_live.json'), 'utf8'));
const s: State = { loadout: live.loadout, owned: [], fe: 0, level: 90, skill: 'hoa', target: 'traveler' };
const ctx = { prices: snapshotBook(localItems()), level: 90, notSearched: new Set<string>() };
const lines = [{ id: 43040200, name: 'Ranger: chance to gain Agility Blessing on Critical Strike' }, { id: 54070400, name: "Lich: All Skills' Levels" }];

describe('plan candidates keep the rules of the game (owner, 2026-10-16)', () => {
  const cs = candidates(s, ctx, DEFAULT_PLAN, lines);
  it('a Magnificent / Noble support is never levelled; another gem below 20 is (time, 0 FE)', () => {
    expect(cs.filter((c) => /Magnificent|Noble/.test(c.label) && /^Level /.test(c.label))).toEqual([]);
    expect(cs.some((c) => c.label === 'Level Hammer of Ash 17 -> 20 (time)' && c.costFE === 0)).toBe(true);
  });
  it("no example-build skill group, no copy of a worn legendary", () => {
    expect(cs.filter((c) => /^Add the skill|Target skill/.test(c.label))).toEqual([]);
    expect(cs.filter((c) => /^Unique (Ruinous Star|Formation Breaker|Kaleidoscope) in /.test(c.label))).toEqual([]);
  });
  it('a slate takes the place of one of yours (same shape and cell, so it fits the board), priced at your price', () => {
    const sl = cs.filter((c) => c.label.startsWith('Replace your slate'));
    expect(sl.length).toBe(live.loadout.slateItems.length * 3);   // 2 lines alone + the pair, per slate
    const items = (sl[0].changes[0] as unknown as { items: { link: unknown; shapeId: number; talents: number[] }[] }).items;
    expect(items).toHaveLength(live.loadout.slateItems.length);
    expect(items[0].link).toEqual(live.loadout.slateItems[0].link);
    expect(items[0].shapeId).toBe(live.loadout.slateItems[0].shapeId);
    expect(sl.find((c) => c.label.endsWith('with Ranger: chance to gain Agility Blessing on Critical Strike'))!.costFE).toBe(100);
    expect(sl.find((c) => /Agility Blessing.* \+ Lich/.test(c.label))!.costFE).toBe(370);
  });
});
