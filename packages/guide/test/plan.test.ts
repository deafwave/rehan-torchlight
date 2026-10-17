import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pinRoot } from '../src/pin';
import { candidates, DEFAULT_PLAN, runPlan } from '../src/plan';
import { snapshotBook, withPrices } from '../src/pricing';
import { localItems } from '../src/modes';
import type { Evaluator, State } from '../src/types';

// the owner's live Hammer of Ash character (export 20261016-122806, dps-debug MANA1's fixture)
const live = JSON.parse(readFileSync(join(pinRoot(), 're/evidence/mana1_live.json'), 'utf8'));
const s: State = { loadout: live.loadout, owned: [], fe: 0, level: 90, skill: 'hoa', target: 'traveler' };
const ctx = { prices: snapshotBook(localItems()), level: 90, notSearched: new Set<string>() };
const lines = [{ id: 43040200, name: 'Ranger: chance to gain Agility Blessing on Critical Strike' }, { id: 54070400, name: "Lich: All Skills' Levels" }];

describe('a worn legendary is named by its own name, not its base (owner, 2026-10-16: wearing Boots of Devastation, not its base Old King Sabatons)', () => {
  it('uniqueName resolves the base and modifier groups to the legendary', async () => {
    const { uniqueName } = await import('../src/names');
    const boots = live.loadout.gear.find((g: { slot: string }) => g.slot === 'boots');
    expect(boots.label).toBe("Old King's Sabatons");
    expect(uniqueName(boots.baseId, boots.affixes.map((a: { id: number }) => a.id))).toBe('Boots of Devastation');
  });
});

describe('packBoard: the board re-laid out by each slate type rule (owner, 2026-10-16)', () => {
  it('every placed slate fits again; the Pedigree only flipped across the vertical axis; a slate too many does not fit', async () => {
    const { packBoard } = await import('../src/candidates/slates');
    const lay = packBoard(live.loadout, 90, []);
    expect(lay).not.toBeNull();
    const ped = live.loadout.slateItems.findIndex((x: { shapeId: number }) => x.shapeId === 2090);
    if (ped >= 0) {   // the packed Pedigree is its cells as they are, or mirrored across the vertical axis, moved
      const { boardView } = await import('../src/candidates/slates');
      const norm = (c: [number, number][]) => { const mx = Math.min(...c.map((p) => p[0])), my = Math.min(...c.map((p) => p[1])); return JSON.stringify(c.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[0] - b[0] || a[1] - b[1])); };
      const cur = boardView(live.loadout).slates[ped].cells;
      expect([norm(cur), norm(cur.map(([x, y]) => [-x, y] as [number, number]))]).toContain(norm(lay![ped]));
    }
    const cells = (l: [number, number][][]) => l.reduce((n, c) => n + c.length, 0);
    expect(packBoard(live.loadout, 90, Array(30).fill(2020))).toBeNull();
    const { boardView } = await import('../src/candidates/slates');
    expect(cells(lay!)).toBe(boardView(live.loadout).slates.reduce((n, x) => n + x.cells.length, 0));
  });
});

describe('plan candidates keep the rules of the game (owner, 2026-10-16)', () => {
  const points = Object.values(live.loadout.talents as Record<string, number>).reduce((a, b) => a + b, 0);
  const cs = candidates(s, ctx, { ...DEFAULT_PLAN, points }, lines);
  it('a Magnificent / Noble support is never levelled; another gem below 20 is (time, 0 FE)', () => {
    expect(cs.filter((c) => /Magnificent|Noble/.test(c.label) && /^Level /.test(c.label))).toEqual([]);
    expect(cs.some((c) => c.label === 'Level Hammer of Ash 17 -> 20 (time)' && c.costFE === 0)).toBe(true);
  });
  it("no example-build skill group, no copy of a worn legendary", () => {
    expect(cs.filter((c) => /^Add the skill|Target skill/.test(c.label))).toEqual([]);
    expect(cs.filter((c) => c.kind === 'support' && /Wind Projectiles|Slow Projectile -> /.test(c.label))).toEqual([]);
    expect(cs.filter((c) => /^\+\d+ points?/.test(c.label))).toEqual([]);   // no point out of thin air (owner): only moves
    expect(cs.some((c) => /^Move a point/.test(c.label))).toBe(true);   // the owner's dummy disproved the model's figure
    expect(cs.filter((c) => /^Unique (Ruinous Star|Formation Breaker|Kaleidoscope) in /.test(c.label))).toEqual([]);
  });
  it('a legendary held at the start stays out after a step takes it off (a new one is priced mid-roll; yours is the roll there is)', () => {
    const priced = { ...ctx, prices: withPrices(ctx.prices, { 'Last Words of Chaos': 39 }).book }, lwc = (c: { label: string }) => c.label === 'Unique Last Words of Chaos in helmet';
    expect(candidates(s, priced, DEFAULT_PLAN, lines, new Set()).some(lwc)).toBe(true);
    expect(candidates(s, priced, DEFAULT_PLAN, lines, new Set(['Last Words of Chaos'])).some(lwc)).toBe(false);
  });
  it('another copy of a worn legendary with one line at its best roll, priced at its market price, named in game words', () => {
    const priced = { ...ctx, prices: withPrices(ctx.prices, { 'Ruinous Star': 1433 }).book };
    const c = candidates(s, priced, DEFAULT_PLAN, lines).find((x) => /^Buy another Ruinous Star with \+30% additional Deterioration Duration \(yours: \d+\)/.test(x.label));
    expect(c?.costFE).toBe(1433);
    expect(c?.changes).toEqual([{ kind: 'patch', op: 'gear-roll', slot: 'chest', id: 80935371, dyn: [30] }]);
  });
  it('a hero memory levelled to its rarity cap at the scraps and threads it takes; never awakened to another rarity (a new memory is bought: owner, 2026-10-16)', () => {
    const priced = { ...ctx, prices: withPrices(ctx.prices, { 'Memory Scrap': 0.1, 'Memory Thread - Epic': 1, 'Crude Lunar Dust': 1, 'Luminous Lunar Dust': 1 }).book };
    const m = candidates(s, priced, DEFAULT_PLAN, lines).filter((c) => c.kind === 'memory');
    expect(m.length).toBeGreaterThan(0);
    for (const c of m) expect(c.label).toMatch(/^Level your Memory of \w+ \d+ -> \d+: .*Memory Scrap/);
  });
  it('a slate you own (bag, stash) is a free step in place of each board slate', () => {
    const own = { ...s, owned: [{ itemId: 'x', baseId: 261003, baseName: null, level: 86, where: 'stash', page: 0, slot: 1, count: 1, modifiers: {}, talents: [43040200], shapeId: 2020 }] };
    const c = candidates(own, ctx, DEFAULT_PLAN, lines).filter((x) => x.key.startsWith('ownslate|'));
    expect(c.length).toBe(live.loadout.slateItems.length);
    expect(c[0].costFE).toBe(0);
    expect(c[0].label).toMatch(/^Put your stash slate \(Ranger: chance to gain Agility Blessing on Critical Strike\) in place of board slate 1 /);
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

describe('runPlan: a step must raise the damage at full Life too (owner, 2026-10-16: Passivation -> Wind Projectiles, +8.6 % kill speed, -25 % on the dummy)', () => {
  it('a change that raises the kill speed but lowers full-Life damage is refused, named with why; one that raises both is taken', async () => {
    const fig = (life100: number, kill: number) => ({ life100, life0: kill, kill, partial: [], target: 'traveler', lifeMax: 1.6e12 });
    const ev: Evaluator = { pin: 'stub', parallelism: 4, close: async () => {},
      run: async (loadout, changes) => { const j = JSON.stringify(changes);
        return { loadout, dropped: [], figure: /"name":"Critical Strike Damage Increase"/.test(j) ? fig(0.9e10, 1.2e10) : /"name":"Multiple Projectiles"/.test(j) ? fig(1.1e10, 1.1e10) : fig(1e10, 1e10) }; } };
    const r = await runPlan(ev, s, ctx.prices, { goal: 1e12, maxSteps: 3 });
    expect(r.plan!.steps.some((x) => /Critical Strike Damage Increase/.test(x.label))).toBe(false);
    expect(r.plan!.steps.some((x) => /Multiple Projectiles/.test(x.label))).toBe(true);
    expect(r.notCalculable.some((n) => /Critical Strike Damage Increase.*lowers your damage at full Life/.test(n))).toBe(true);
  }, 300_000);
});
