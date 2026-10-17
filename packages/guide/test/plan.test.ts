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
    for (const c of m) expect(c.label).toMatch(/^(Level|Reroll) your Memory of \w+\W.*Memory Scrap/);
  });
  it('a memory random affix rerolled to another of its pool (the slot you pick, no keep: owner, 2026-10-17); a level past 20 / 40 rolls one free, then rerolls', () => {
    const priced = { ...ctx, prices: withPrices(ctx.prices, { 'Memory Scrap': 0.1, 'Memory Thread - Rare': 2, 'Memory Thread - Epic': 1, 'Crude Lunar Dust': 1, 'Luminous Lunar Dust': 1 }).book };
    const m = candidates(s, priced, DEFAULT_PLAN, lines).filter((c) => c.kind === 'memory');
    // Origin (Rare, L30): its random affix 402165302 (T2 Fire Skill Critical Strike Damage); at item level 86+ a Rare rerolls T2 (3000) or T3 (4000), a group
    // 1.46 % a roll (the game's odds for Affliction Effect): T2 Attack Damage (group 4021665) = 1 / (0.0146 x 3/7) rerolls of 5 Memory Scrap + 1 Rare Thread
    const ad = m.find((c) => c.key === 'memroll|1|402165302|402166502');
    expect(ad?.costFE).toBeCloseTo((1 / (0.0146 * 3 / 7)) * (5 * 0.1 + 2));
    const mem = (ad!.changes[0] as unknown as { items: { slot: number; affixes: { id: number; list: string }[] }[] }).items.find((x) => x.slot === 1)!;
    expect(mem.affixes.filter((a) => a.list === 'SuffixInfoList').map((a) => a.id)).toEqual([402166502]);
    expect(m.some((c) => c.key === 'memroll|1|402165302|402165303')).toBe(false);   // the same group at a worse tier is no reroll
    // Discipline (Epic, L13): to 20 rolls its first random affix free; T1 (2000 of 9000) Attack Damage of its pool (4021691) = 1 / (0.0146 x 2/9) - 1 rerolls
    const lv = m.find((c) => c.key === 'memlevel|2|13|402169101');
    expect(lv?.costFE).toBeGreaterThan((1 / (0.0146 * 2 / 9) - 1) * (10 * 0.1 + 1));
    expect(lv?.label).toMatch(/^Level your Memory of Discipline 13 -> 20/);
  });
  it('a line already on a board slate is never offered on another slate (owner, 2026-10-17: "Add a 3-cell slate with Ranger: additional damage taken by enemies in Proximity" - we already have one)', () => {
    const onBoard = live.loadout.slateItems[1].talents[0], ids = (k: string) => k.split('|').at(-1)!.split('-');
    const c = candidates(s, ctx, DEFAULT_PLAN, [{ id: onBoard, name: 'on the board' }, ...lines]).filter((x) => /^(add|slate)\|/.test(x.key) && ids(x.key).includes(String(onBoard)));
    expect(c.length).toBeGreaterThan(0);   // the slate that has it: replaced by one with it
    for (const x of c) expect(x.key).toMatch(/^slate\|1\|/);
  });
  it('a slate you own (bag, booth: the read\'s page 0 is My Booth, owner 2026-10-17) is a free step in place of each board slate, its slot named', () => {
    const own = { ...s, owned: [{ itemId: 'x', baseId: 261003, baseName: null, level: 86, where: 'stash', page: 0, slot: 1, count: 1, modifiers: {}, talents: [43040200], shapeId: 2020 }] };
    const c = candidates(own, ctx, DEFAULT_PLAN, lines).filter((x) => x.key.startsWith('ownslate|'));
    expect(c.length).toBe(live.loadout.slateItems.length);
    expect(c[0].costFE).toBe(0);
    expect(c[0].label).toMatch(/^Put your booth slate \(slot 1: Ranger: chance to gain Agility Blessing on Critical Strike\) in place of board slate 1 /);
  });
  it("another skill in a weak place: an active for an active place, an aura for an aura place, its supports kept (owner: Fixate for Bull's Rage)", () => {
    const fix = live.loadout.skills.find((g: { name: string }) => g.name === 'Fixate'), aura = live.loadout.skills.find((g: { place: { kind: string } }) => g.place.kind === 'passive');
    const priced = { ...ctx, prices: withPrices(ctx.prices, { "Bull's Rage": 5 }).book };
    const c = candidates(s, priced, { ...DEFAULT_PLAN, skillSlots: [fix.place, aura.place] }, lines);
    const bull = c.find((x) => x.label.startsWith("Replace Fixate with Bull's Rage"));
    expect(bull?.costFE).toBe(5);
    const items = (bull!.changes[0] as unknown as { items: { name: string; place: { kind: string } }[] }).items;
    expect(items.filter((x) => x.place.kind === 'support').length).toBe(live.loadout.skills.filter((g: { place: { ownerKind?: string; ownerSlot?: number } }) => g.place.ownerKind === 'active' && g.place.ownerSlot === fix.place.slot).length);
    expect(c.some((x) => x.label.startsWith(`Replace ${aura.name} with Bull's Rage`))).toBe(false);   // an active never in an aura place
  });
  it('at most 3 slates of a capped type (the 2- and 3-cell bases: Corners of Divinity, Fallen Starlight); a slate you own brings its own type and shape', async () => {
    const { overCap } = await import('../src/candidates/slates');
    const three = { ...s, loadout: { ...live.loadout, slateItems: [0, 1, 2].map((i) => ({ ...live.loadout.slateItems[0], itemId: `t${i}`, baseId: 261003, shapeId: 2020 })) } };
    expect(overCap(three.loadout.slateItems)).toBe(false);
    const c = candidates(three, ctx, DEFAULT_PLAN, lines);
    expect(c.filter((x) => x.label.startsWith('Add a 2-cell slate'))).toEqual([]);   // a 4th of that type
    const own = { ...three, owned: [{ itemId: 'p', baseId: 261005, baseName: null, level: 86, where: 'stash', page: 0, slot: 1, count: 1, modifiers: {}, talents: [43040200], shapeId: 2030 }] };
    const put = candidates(own, ctx, DEFAULT_PLAN, lines).find((x) => x.key.startsWith('ownslate|p|'));
    expect(put).toBeDefined();
    expect((put!.changes[0] as unknown as { items: { baseId: number; shapeId: number }[] }).items.some((x) => x.baseId === 261005 && x.shapeId === 2030)).toBe(true);
  });
  it('a slate on the board is never offered as one you own (owner, 2026-10-16: the read lists board slates among the items)', () => {
    const b = live.loadout.slateItems[0];
    const own = { ...s, owned: [{ itemId: b.itemId, baseId: b.baseId, baseName: null, level: 86, where: 'board', page: -4, slot: 1, count: 1, modifiers: {}, talents: b.talents, shapeId: b.shapeId },
      { itemId: 'stashed-copy', baseId: b.baseId, baseName: null, level: 86, where: 'stash', page: 0, slot: 1, count: 1, modifiers: {}, talents: [...b.talents].reverse(), shapeId: b.shapeId }] };
    expect(candidates(own, ctx, DEFAULT_PLAN, lines).filter((x) => x.key.startsWith('ownslate|'))).toEqual([]);
  });
  it('your roll prices: one step per roll you priced, a roll above the drop tier as the corrupted tier (x 10 + 0); also for a line already at its best drop roll', () => {
    const ring = live.loadout.gear.find((g: { slot: string }) => g.slot === 'ring2'), kal = ring.affixes.find((a: { id: number }) => Math.floor(a.id / 10) === 5151284);
    const s2 = { ...s, loadout: { ...live.loadout, gear: live.loadout.gear.map((g: { slot: string }) => (g === ring ? { ...ring, affixes: ring.affixes.map((a: { id: number }) => (a === kal ? { ...kal, dyn: [50, 8] } : a)) } : g)) } };
    const c = candidates(s2, ctx, { ...DEFAULT_PLAN, rollPrices: [{ item: 'Kaleidoscope', line: 51512841, rolls: [[56, 168], [65, 368]] }] }, lines).filter((x) => x.key.startsWith('rollp|ring2|'));
    expect(c.map((x) => x.costFE)).toEqual([168, 368]);
    expect(c[0].changes[0]).toEqual({ kind: 'patch', op: 'gear-roll', slot: 'ring2', id: kal.id, dyn: [56, 8], newId: 51512840 });
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

describe('runPlan: no step raises the projectile speed (owner, 2026-10-16: Precise Projectiles, Wind Projectiles cost embers in game)', () => {
  it('a change that speeds the embers up is refused with why, however much it gains; the goal can be a kill time', async () => {
    const fig = (k: number, speedInc: number) => ({ life100: k, life0: k, kill: k, partial: [], target: 'cube2', lifeMax: 1.6e13, projectile: { speedInc, areaInc: 200 } });
    const ev: Evaluator = { pin: 'stub', parallelism: 4, close: async () => {},
      run: async (loadout, changes) => { const j = JSON.stringify(changes);
        return { loadout, dropped: [], figure: /"name":"Critical Strike Damage Increase"/.test(j) ? fig(5e10, 51) : /"name":"Multiple Projectiles"/.test(j) ? fig(1.2e10, 40) : fig(1e10, 40) }; } };
    const r = await runPlan(ev, s, ctx.prices, { target: 'cube2', goalSeconds: 10, maxSteps: 3 });
    expect(r.plan!.goal).toBe(1.6e12);
    expect(r.plan!.steps.some((x) => /Critical Strike Damage Increase/.test(x.label))).toBe(false);
    expect(r.notCalculable.some((n) => /Critical Strike Damage Increase.*raises projectile speed/.test(n))).toBe(true);
  }, 300_000);
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

describe('runPlan: every write carries the slate board (owner, 2026-10-17: a stopped plan left the page with no slate viewer)', () => {
  it('each partial output has the board now and after, as the final one does', async () => {
    const fig = (k: number) => ({ life100: k, life0: k, kill: k, partial: [], target: 'traveler', lifeMax: 1.6e12 });
    const ev: Evaluator = { pin: 'stub', parallelism: 4, close: async () => {},
      run: async (loadout, changes) => ({ loadout, dropped: [], figure: /"name":"Multiple Projectiles"/.test(JSON.stringify(changes)) ? fig(1.1e10) : fig(1e10) }) };
    const writes: { board?: unknown }[] = [];
    await runPlan(ev, s, ctx.prices, { goal: 1e12, maxSteps: 1 }, (o) => writes.push(o));
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) expect(w.board).toMatchObject({ now: { slates: expect.any(Array) }, after: { slates: expect.any(Array) } });
  }, 300_000);
});
