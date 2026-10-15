import { describe, expect, it } from 'vitest';
import { basesFor } from '../src/candidates/gear';
import { gemLevelAt, mainSid, supportsFor } from '../src/candidates/gems';
import { table } from '../src/pin';
import { switchMoves } from '../src/candidates/switch';
import type { Skill } from '../src/types';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { snapshotBook, type EtorItems } from '../src/pricing';
import { GROUND, L100, L94, applyAll, fakePrices, loadout } from './apply';

const l94 = loadout(L94);
const target = loadout('re/evidence/loadout_probuild-hanshansi-bing.json').skills as { sid: number; name: string; place: { kind: string; ownerKind?: string; ownerSlot?: number } }[];
const targetSupports = target.filter(g => g.place.kind === 'support' && g.place.ownerKind === 'active' && g.place.ownerSlot === 0);
const gen = (skill: Skill, level: number, prices: Record<string, number> = {}, l = l94) => {
  const notSearched = new Set<string>();
  return { moves: switchMoves({ loadout: l, owned: [], fe: 0, level, skill }, { prices: fakePrices(prices), level, notSearched }), notSearched };
};
const lang = table<{ rows: Record<string, string> }>('lang_en').rows;
const mauls = (level: number) => basesFor('mainHand', level, 'hoa');
const maulName = (level: number) => lang[`item_base|name|${mauls(level).at(-1)!.baseId}`];
const names = ['Hammer of Ash', ...targetSupports.map(g => g.name), maulName(94)];
const all = Object.fromEntries(names.map((n, i) => [n, i + 1]));

describe('switchMoves', () => {
  it('Ice Shot offers exactly one acquisition switch to hoa; the reverse (a hoa state) is never offered', () => {
    const { moves } = gen('iceShot', 94, all);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ kind: 'switch', skill: 'hoa', acquisition: true, enabler: true });
    expect(gen('hoa', 100, all, loadout(L100)).moves).toEqual([]);
  });
  it('weapon is a maul base at the hero level; the level gate is that base', () => {
    const { moves } = gen('iceShot', 94, all), w = moves[0].changes[0] as { kind: string; slot: string; item: { baseId: number; level: number } };
    expect([w.kind, w.slot]).toEqual(['gear', 'mainHand']);
    expect(basesFor('mainHand', 94, 'hoa').map(b => b.baseId)).toContain(w.item.baseId);
    expect(moves[0].minLevel).toBe(basesFor('mainHand', 94, 'hoa').at(-1)!.level);
    const first = mauls(100)[0].level;
    expect(gen('iceShot', first - 1, all).moves).toHaveLength(0);
    expect(gen('iceShot', first, all).moves).toHaveLength(1);
  });
  it('main skill sids come from the pin loadouts: Ice Shot 1030 (l94), Hammer of Ash 1110 (target build)', () => {
    expect([mainSid('iceShot'), mainSid('hoa')]).toEqual([1030, 1110]);
  });
  it('hero-level gate: Hammer of Ash is installed at the gem level the ladder allows; at hero level 0 nothing is offered', () => {
    const hero = 72;   // Hammer of Ash level 20 needs 73
    expect(gemLevelAt(1110, hero, 20)).toBeLessThan(20);
    const m = gen('iceShot', hero, all).moves[0], multi = m.changes[1] as { changes: { kind: string; gem: { level: number } }[] };
    expect(multi.changes.find(c => c.kind === 'skill')!.gem.level).toBe(gemLevelAt(1110, hero, 20));
    expect(gen('iceShot', 0, all).moves).toEqual([]);
  });
  it('an unpriced component that is not a drop (no etor row) is named in notSearched so the gap is visible', () => {
    const r = gen('iceShot', 94, {});
    expect(r.moves[0].costFE).toBeNull();
    expect([...r.notSearched].join()).toMatch(/switch unpriced \(Hammer of Ash.*\): no etor price and not a white base \/ normal gem/);
    expect([...gen('iceShot', 94, all).notSearched].some(n => /switch unpriced/.test(n))).toBe(false);
  });
  it('with the real etor snapshot the switch is priced: normal gems and the bare maul that etor does not price are drops', () => {
    const items: EtorItems = JSON.parse(readFileSync(fileURLToPath(new URL('../../../data/etor/items_1501.json', import.meta.url)), 'utf8'));
    const prices = snapshotBook(items), notSearched = new Set<string>();
    const [m] = switchMoves({ loadout: l94, owned: [], fe: 0, level: 94, skill: 'iceShot' }, { prices, level: 94, notSearched });
    const cat = (n: string) => prices.category!(n);
    expect(m.costFE, `unpriced: ${[...notSearched].filter(n => /switch unpriced/.test(n))}`).not.toBeNull();
    expect(cat('Hammer of Ash')).toBe('Active Skill');
    expect(prices.price(maulName(94), 94)).toBeNull();
    if (m.market === 'drop') expect(m.costNote).toBe('drop');
  });
  it('costs the sum of the skill, support and maul prices by name; any missing price makes it unpriced (null)', () => {
    expect(gen('iceShot', 94, all).moves[0].costFE).toBe(Object.values(all).reduce((a, b) => a + b, 0));
    const { Steamroll: _s, ...missing } = all;
    expect(gen('iceShot', 94, missing).moves[0].costFE).toBeNull();   // the fake book carries no etor categories, so an unpriced gem is not a drop
    const { [maulName(94)]: _m, ...noMaul } = all;   // a bare maul etor does not price is a drop: 0 FE, the rest still sum
    expect(gen('iceShot', 94, noMaul).moves[0].costFE).toBe(Object.values(all).reduce((x, y) => x + y, 0) - all[maulName(94)]);
  });
  it('supports come from the target build and every one compiles on Hammer of Ash (SUP1)', () => {
    const { moves, notSearched } = gen('iceShot', 94, all);
    const multi = moves[0].changes[1] as { kind: string; changes: { kind: string; action: string; gem?: { sid: number } }[] };
    expect(multi.kind).toBe('multi');
    expect(multi.changes.some(c => c.kind === 'gear')).toBe(false);   // dps-debug multi would turn a gear entry into a removal
    const got = multi.changes.filter(c => c.kind === 'support').map(c => c.gem!.sid);
    const ok = new Set(supportsFor('hoa').map(s => s.sid));
    expect(got.sort()).toEqual(targetSupports.map(g => g.sid).filter(s => ok.has(s)).sort());
    expect([...notSearched].some(n => /does not compile/.test(n))).toBe(targetSupports.some(g => !ok.has(g.sid)));
  });
  it('the change list applies through dps-debug: maul in the main hand, Hammer of Ash in active slot 0 with the target supports', () => {
    const m = gen('iceShot', 94, all).moves[0], out = applyAll(l94, m, GROUND.iceShot);
    const w = m.changes[0] as { item: { baseId: number } };
    expect((out.gear as { slot: string; baseId: number }[]).find(g => g.slot === 'mainHand')!.baseId).toBe(w.item.baseId);
    const sk = out.skills as { sid: number; place: { kind: string; slot: number; ownerKind?: string; ownerSlot?: number } }[];
    expect(sk.find(g => g.place.kind === 'active' && g.place.slot === 0)!.sid).toBe(1110);
    expect(sk.filter(g => g.place.kind === 'support' && g.place.ownerKind === 'active' && g.place.ownerSlot === 0).map(g => g.sid).sort())
      .toEqual(targetSupports.map(g => g.sid).sort());
  });
});
