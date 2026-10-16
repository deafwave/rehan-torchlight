import { describe, expect, it, vi } from 'vitest';
import { basesFor, slotsOfBase } from '../src/candidates/gear';
import { DEFAULT_IDEAL, localHistory, localItems, nextBuys, ownedGear, runAdvise, runIdeal, unpricedAcquisitions } from '../src/modes';
import { historyBook } from '../src/pricing';
import { fromExport, idealStart, ICE_SHOT_INPUTS } from '../src/start';
import { legalAllocation, pointsAtLevel, treeOf } from '../src/talentRules';
import { CULL_NOT_COUNTED } from '../src/kill';
import { gearMoves } from '../src/candidates/gear';
import { slateMoves } from '../src/candidates/slates';
import { pactMoves } from '../src/candidates/pacts';
import type { Evaluator, Generator, Move } from '../src/types';
import { parseAdvice, renderGuide } from '../../page/src/guide-view';

/** stub: every applied change adds 10 to the kill average; `stop` makes every figure refuse */
const stubEv = (stop?: string, o: { runs?: { changes: unknown[]; level: number }[]; stopFrom?: number } = {}): Evaluator => ({
  pin: 'stub', async close() {},
  async run(lo, changes, ctx) {
    o.runs?.push({ changes, level: ctx.level });
    if (o.stopFrom !== undefined && ctx.level >= o.stopFrom) stop = 'not ported: later stage';
    const n = ((lo as { __n?: number }).__n ?? 0) + changes.length, k = 100 + 10 * n;
    const talents = { ...(lo as { talents?: Record<number, number> }).talents };   // talent changes land in the loadout, as dps-debug's applyChanges does
    for (const c of changes as { kind: string; node: number; points: number }[]) if (c.kind === 'talent') talents[c.node] = c.points;
    return { loadout: { ...lo, __n: n, talents }, dropped: [], inputs: { ground: 'stub-ground', elites: 0 },
      figure: stop ? { life100: 0, life0: 0, kill: 0, partial: [], stop } : { life100: k, life0: k, kill: k, partial: [] } };
  },
});
const small = { stepsPerStage: 1, endLevel: 65, topK: 2, maxRounds: 1, finalSteps: 0 };

const helmet = basesFor('helmet', 60, 'iceShot').at(-1)!, ring = basesFor('ring1', 60, 'iceShot').at(-1)!;
const item = (itemId: string, where: string, base: { baseId: number; name: string; level: number }) =>
  ({ itemId, baseId: base.baseId, baseName: base.name, level: base.level, where, page: 1, slot: 3, count: 1, modifiers: { prefix: [] } });
const exportOf = (o: Record<string, unknown> = {}) => ({
  schema: 'tli-lens-export/1', hero: { id: 4001, level: 60 }, loadout: idealStart().loadout, fe: 1000, fe_source: 'sum', fe_bound: 0,
  items: [item('eq-1', 'equipped', helmet), item('bag-1', 'bag', helmet), item('stash-1', 'stash', ring),
    { ...item('fe', 'bag', helmet), baseId: 100300, baseName: 'Flame Elementium', count: 1000 }], ...o });

describe('idealStart', () => {
  const s = idealStart();
  it('is level 60, Ice Shot, with a white drop base (no affixes) in every slot of the L94 loadout', () => {
    expect(s.level).toBe(60); expect(s.skill).toBe('iceShot');
    const gear = s.loadout.gear as { slot: string; baseId: number; level: number; affixes: { list: string }[]; market: string }[];
    expect(gear.map((g) => g.slot).sort()).toEqual(['belt', 'boots', 'chest', 'gloves', 'helmet', 'mainHand', 'necklace', 'ring1', 'ring2']);
    for (const g of gear) {
      expect(slotsOfBase(g.baseId, 'iceShot').slots, g.slot).toContain(g.slot);
      expect(g.level).toBeLessThanOrEqual(60);
      expect(g.market).toBe('drop');
      expect(g.affixes.every((a) => a.list === 'BaseAttrInfoList')).toBe(true);
    }
  });
  it('gearMoves offers moves on every slot the start carries', () => {
    const ctx = { prices: { season: 's', fetchedAt: 'x', price: () => 0.05 }, level: 60, notSearched: new Set<string>() };
    const slots = new Set(gearMoves(s, ctx).map((m) => (m.changes[0] as { slot?: string }).slot));
    for (const g of s.loadout.gear as { slot: string }[]) expect(slots.has(g.slot), g.slot).toBe(true);
    expect(slots.has('ring1') && slots.has('ring2')).toBe(true);
    expect(s.loadout.vorax).toEqual([]);
  });
  it('honours the start level: bases and the talent budget follow it', () => {
    const t = idealStart(70), gear = t.loadout.gear as { level: number }[];
    expect(t.level).toBe(70);
    expect(Math.max(...gear.map((g) => g.level))).toBeGreaterThanOrEqual(Math.max(...(s.loadout.gear as { level: number }[]).map((g) => g.level)));
    expect((t.loadout.hero as { level: number }).level).toBe(70);
    expect(Object.values(t.loadout.talents as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(pointsAtLevel(70));
  });
  it('strips slates, pacts, kismets, prisms and seeds the level-60 talent budget', () => {
    const l = s.loadout as Record<string, any>;
    expect([l.slateItems, l.pacts, l.kismets, l.vorax, l.coreTalents, l.prismEntries].every((x) => x.length === 0)).toBe(true);
    expect(Object.values(l.prisms.placed).every((p) => Object.keys(p as object).length === 0)).toBe(true);
    expect(Object.values(l.talents as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(pointsAtLevel(60));
    expect(Object.keys(l.traits)).toEqual(['810001', '810011', '810021', '810032']);
  });
});

describe('fromExport', () => {
  it('equipped items stay in the loadout; others are owned; FE items are not items', () => {
    const s = fromExport(exportOf());
    expect(s.owned.map((o) => o.itemId)).toEqual(['bag-1', 'stash-1']);
    expect(s).toMatchObject({ fe: 1000, level: 60, skill: 'iceShot' });
  });
  it('a typed fe wins; a missing fe stops with the message', () => {
    expect(fromExport(exportOf(), 55).fe).toBe(55);
    expect(() => fromExport(exportOf({ fe: undefined }))).toThrow('export has no fe; pass --fe N');
    expect(fromExport(exportOf({ fe: undefined }), 7).fe).toBe(7);
  });
  it('rejects another schema', () => expect(() => fromExport(exportOf({ schema: 'x' }))).toThrow(/tli-lens export/));
});

describe('owned items as moves', () => {
  const state = fromExport(exportOf());
  const ctx = { prices: { season: 's', fetchedAt: 'x', price: () => null }, level: 60, notSearched: new Set<string>() };
  it('each owned gear item costs 0 FE and consumes itself, per slot it fits', () => {
    const ms = ownedGear(state, ctx);
    expect(ms.filter((m) => m.consumes === 'bag-1')).toHaveLength(1);
    expect(ms.filter((m) => m.consumes === 'stash-1')).toHaveLength(2);   // ring1, ring2
    expect(ms.every((m) => m.costFE === 0 && m.acquisition)).toBe(true);
  });
  it('an owned item is worn once: free first, then never offered again', async () => {
    const out = await runAdvise(stubEv(), state, { maxRounds: 1, topK: 2, maxSteps: 4 });
    const used = out.steps.map((s) => s.move).filter((m) => m.consumes);
    expect(used.length).toBeGreaterThan(0);
    expect(new Set(used.map((m) => m.consumes)).size).toBe(used.length);   // none twice
    expect(out.steps[0].move.costFE).toBe(0);
    expect(out.mode).toBe('advise'); expect(out.pin).toBe('stub');
    parseAdvice(JSON.stringify(out));
  });
});

describe('runIdeal', () => {
  it('spends the level-up talent points at the stage start, free and ungated, and clears the lazy scores', async () => {
    const out = await runIdeal(stubEv(), { ...small, stepsPerStage: 0, endLevel: 65 });
    const note = out.startNotes!.find((n) => n.startsWith('L65: ') && n.includes('new talent point(s) spent'))!;
    expect(note.startsWith(`L65: ${pointsAtLevel(65) - pointsAtLevel(60)} new talent point(s) spent: `)).toBe(true);
    const nodes = [...note.matchAll(/[A-Za-z][^,(]* \(\+(\d+)\)/g)];   // each node by its English name
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.reduce((a, m) => a + +m[1], 0)).toBe(pointsAtLevel(65) - pointsAtLevel(60));   // every point is listed on a node
  });
  it('writes an ideal GuideOut with pin, season, knobs, start notes and stated inputs', async () => {
    const out = await runIdeal(stubEv(), small);
    expect(out).toMatchObject({ mode: 'ideal', pin: 'stub', etor: { season: 'SS13' }, knobs: { stepsPerStage: 1, topK: 2, churn: 0.05, talentPoints: 108 } });
    expect(out.startNotes!.length).toBeGreaterThan(8);
    expect(out.inputs).toMatchObject({ ground: 'stub-ground', iceShot: ICE_SHOT_INPUTS });
    // dps-debug's own iceShot inputs survive in the header; only the status is ours
    const own = await runIdeal({ ...stubEv(), run: async (lo, c, x) => ({ ...(await stubEv().run(lo, c, x)), inputs: { ground: 'g', iceShot: { hitting: 7, dpsDebugKey: 'k', status: 'measured' } } }) }, { ...small, endLevel: 60 });
    expect(own.inputs).toMatchObject({ iceShot: { hitting: 7, dpsDebugKey: 'k', returns: 1, status: 'unverified' } });
    expect(out.steps.length).toBeGreaterThan(0);
    expect(out.steps.every((s) => s.level >= 60 && s.level <= 65 && s.notes!.includes('talent points assumed'))).toBe(true);
    expect(parseAdvice(JSON.stringify({ ...out, mode: 'advise' })).steps).toHaveLength(out.steps.length);
    expect(renderGuide(out as never)).toContain('stub');
  });
  it('a start figure that stopped says so plainly and does not crash', async () => {
    const out = await runIdeal(stubEv('not ported: Ice Shot build entry'), small);
    expect(out.steps).toEqual([]);
    expect(out.start.stop).toMatch(/not ported/);
    expect(out.notCalculable[0]).toMatch(/cannot be priced yet: not ported: Ice Shot build entry/);
    expect(out.startNotes!.at(-1)).toMatch(/cannot be priced yet/);
    expect(renderGuide(out as never)).toContain('stopped');
  });
});

describe('long-run safety', () => {
  it('onStep gets a valid partial output per step; the final output is not partial', async () => {
    const seen: string[] = [];
    const out = await runIdeal(stubEv(), small, undefined, (o) => seen.push(JSON.stringify(o)));
    const parsed = seen.map((t) => JSON.parse(t));
    expect(parsed.length).toBeGreaterThanOrEqual(out.steps.length);
    expect(parsed.every((p) => p.knobs.partialRun === true && p.mode === 'ideal')).toBe(true);
    expect(parsed.map((p) => p.steps.length)).toEqual([...parsed.map((p) => p.steps.length)].sort((a, b) => a - b));
    expect(out.knobs.partialRun).toBeUndefined();
    const adv: string[] = [];
    const a = await runAdvise(stubEv(), fromExport(exportOf()), { maxRounds: 1, topK: 2, maxSteps: 3 }, undefined, (o) => adv.push(JSON.stringify(o)));
    const planned = (o: { steps: { move: { label: string } }[] }) => o.steps.filter((x) => !/^Free talent respec/.test(x.move.label));   // the free respec leads, unwritten
    expect(adv).toHaveLength(planned(a).length + 1);   // the next-buys list is written first, before any step
    expect(JSON.parse(adv[0])).toMatchObject({ steps: [], next: a.next });
    expect(adv.every((t) => JSON.parse(t).knobs.partialRun === true)).toBe(true);
    expect(a.knobs.partialRun).toBeUndefined();
  });
  it('budgetMinutes stops after the current step and marks stoppedBy', async () => {
    let clock = 0;   // fake wall clock: a minute passes with every checkpoint
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => clock);
    try {
      const tick = () => { clock += 60_000; };
      const ideal = await runIdeal(stubEv(), { ...small, endLevel: 100, stepsPerStage: 5, budgetMinutes: 0.5 }, undefined, tick);
      expect(ideal.knobs.stoppedBy).toBe('budget');
      expect(ideal.steps).toHaveLength(1);
      clock = 0;
      const adv = await runAdvise(stubEv(), fromExport(exportOf()), { maxRounds: 1, topK: 2, maxSteps: 50, budgetMinutes: 0.5 }, undefined, tick);
      expect(adv.knobs.stoppedBy).toBe('budget');
      expect(adv.steps.filter((x) => !/^Free talent respec/.test(x.move.label))).toHaveLength(1);
    } finally { spy.mockRestore(); }
  });
});

describe('advise on a stopped start', () => {
  it('reports it as not calculable', async () => {
    const out = await runAdvise(stubEv('not ported: x'), fromExport(exportOf()));
    expect(out.steps).toEqual([]);
    expect(out.notCalculable[0]).toMatch(/cannot be priced yet/);
  });
});

describe('fix round 1', () => {
  it('the talent seed is a legal allocation per tree', () => {
    const t = idealStart().loadout.talents as Record<string, number>, trees = new Set(Object.keys(t).map((k) => treeOf(+k)));
    for (const tr of trees) expect(legalAllocation(tr, Object.fromEntries(Object.entries(t).filter(([k]) => treeOf(+k) === tr).map(([k, v]) => [+k, v]))), `tree ${tr}`).toBe(true);
  });
  it('a custom talentPoints does not leak into later calls', async () => {
    await runIdeal(stubEv(), { ...small, talentPoints: 50, endLevel: 60, stepsPerStage: 0 });
    expect(pointsAtLevel(60)).toBe(Math.round(108 * 59 / 92));
    expect(Object.values(idealStart().loadout.talents as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(pointsAtLevel(60));
  });
  it('every distinct unpriced acquisition is evaluated each stage, none truncated', async () => {
    const runs: { changes: unknown[]; level: number }[] = [];
    const out = await runIdeal(stubEv(undefined, { runs }), { ...small, endLevel: 60, stepsPerStage: 0 });
    const s = idealStart();
    const ctx = { prices: historyBook(localItems(), localHistory()), level: 60, notSearched: new Set<string>() };
    const want = unpricedAcquisitions([gearMoves, slateMoves, pactMoves].map((g): Generator => (st, c) => g(st, c).filter((m) => m.acquisition)), s, ctx);
    expect(want.length).toBeGreaterThan(0);
    expect(out.knobs).not.toHaveProperty('unpricedEval');
    const seen = new Set(runs.map((r) => JSON.stringify(r.changes)));
    for (const m of want) expect(seen.has(JSON.stringify(m.changes)), m.label).toBe(true);
  });
  it('level 65 reaches the evaluator and the generators', async () => {
    const runs: { changes: unknown[]; level: number }[] = [];
    const out = await runIdeal(stubEv(undefined, { runs }), small);
    expect(runs.some((r) => r.level === 65)).toBe(true);
    expect(out.steps.some((st) => st.level === 65)).toBe(true);
    expect(out.notSearched.some((n) => n.includes('level 65'))).toBe(true);
  });
  it('a stop at a later stage ends the path with a note', async () => {
    const out = await runIdeal(stubEv(undefined, { stopFrom: 65 }), small);
    expect(out.steps.length).toBeGreaterThan(0);
    expect(out.steps.every((st) => st.level === 60)).toBe(true);
    expect(out.notCalculable.some((n) => /^L65 .*cannot be priced yet/.test(n))).toBe(true);
    expect(out.startNotes!.at(-1)).toMatch(/^L65 .*cannot be priced yet/);
  });
  it('the planned switch: at a stage start whose kill reaches switchAt, Hammer of Ash on the target talent page; never below it', async () => {
    const at = (switchAt: number) => runIdeal(stubEv(), { ...small, startLevel: 90, endLevel: 90, stepsPerStage: 0, switchAt });
    const sw = (await at(0)).steps[0];
    expect(sw.move.kind).toBe('switch');
    expect(sw.move.label).toMatch(/on the target build's talent page \(\d+ points; [A-Z][^;]+; cores [A-Z]/);
    expect(sw.notes![0]).toMatch(/^planned switch: the Ice Shot leg reached /);
    expect((await at(Infinity)).steps.some((st) => st.move.kind === 'switch')).toBe(false);
  });
  it('the planned switch fires after two stages in a row with no step (one is a lull), and its page zeroes the old points, removes cores, then sets the target page', async () => {
    const flat: Evaluator = { pin: 'stub', async close() {}, async run(lo) { return { loadout: lo, dropped: [], figure: { life100: 100, life0: 100, kill: 100, partial: [] } }; } };
    expect((await runIdeal(flat, { ...small, startLevel: 90, endLevel: 95, stepsPerStage: 1, switchAt: Infinity })).steps).toEqual([]);
    const out = await runIdeal(flat, { ...small, startLevel: 85, endLevel: 95, stepsPerStage: 1, switchAt: Infinity });
    const sw = out.steps.find((st) => st.move.kind === 'switch')!;
    expect(sw.level).toBe(95);
    expect(sw.notes![0]).toBe('planned switch: the Ice Shot leg stalled (no step in the last 2 stages)');
    const page = sw.move.changes.findIndex((c) => ['talent', 'core'].includes((c as { kind: string }).kind));   // after the maul, the skill group, Ruinous Star
    const kinds = (sw.move.changes.slice(page) as { kind: string; action?: string; points?: number }[]).map((c) => (c.kind === 'core' ? `core-${c.action}` : c.points === 0 ? 'zero' : 'set'));
    expect(kinds.join(',')).toMatch(/^(zero,)+(core-remove,)*(set,)+(core-add,)*core-add$/);
  });
  it('an Ice Shot stage never prices a greedy switch (its Cube 3 figure is no measure against the dummy); an Ice Shot advice says the switch is not searched', async () => {
    const skills: string[] = [];
    const ev = stubEv(), spy: Evaluator = { ...ev, run: (lo, ch, ctx) => (skills.push(ctx.skill), ev.run(lo, ch, ctx)) };
    await runIdeal(spy, { ...small, startLevel: 90, endLevel: 90, stepsPerStage: 1, switchAt: Infinity });
    expect(skills).not.toContain('hoa');
    const out = await runAdvise(stubEv(), fromExport(exportOf()), { maxRounds: 1, topK: 2, maxSteps: 1 });
    expect(out.notSearched).toContain('switch to Hammer of Ash: planned in the ideal guide, not searched for an Ice Shot character');
  });
  it('the planned switch re-solve swaps a worn item that zeroes Hammer of Ash for a white base', async () => {
    // stub: Hammer of Ash prices 0 while the start chest is worn (Demon Slayer's Skin's Edict of Trinity), 100 once the chest is a white swap
    const ev: Evaluator = { pin: 'stub', async close() {}, async run(lo, changes, ctx) {
      let gear = (lo as { gear: { slot: string; itemId: string; label: string; affixes: unknown[] }[] }).gear;
      for (const c of changes as { kind: string; slot?: string; item?: { itemId: string } }[])
        if (c.kind === 'gear' && c.item) gear = [...gear.filter((g) => g.slot !== c.slot), { slot: c.slot!, itemId: c.item.itemId, label: c.item.itemId, affixes: [] }];
      const k = ctx.skill === 'hoa' && !gear.find((g) => g.slot === 'chest')?.itemId.startsWith('guide-white-') ? 0 : 100;
      return { loadout: { ...lo, gear }, dropped: [], figure: { life100: k, life0: k, kill: k, partial: [] } };
    } };
    const out = await runIdeal(ev, { ...small, startLevel: 90, endLevel: 90, stepsPerStage: 0, switchAt: 0 });
    const sw = out.steps.find((st) => st.move.kind === 'switch')!;
    expect(sw.triggered.map((m) => m.label)).toContainEqual(expect.stringMatching(/^Swap .+ for a white .+ \(chest\)$/));
    expect(sw.after.kill).toBe(100);
  });
  it('the Ice Shot leg ends at switchAt: the switch follows at once, mid-stage, at that level, and Hammer of Ash steps go on', async () => {
    const out = await runIdeal(stubEv(), { ...small, startLevel: 85, endLevel: 85, stepsPerStage: 10, switchAt: 150 });
    const i = out.steps.findIndex((st) => st.move.kind === 'switch');
    expect(i).toBeGreaterThan(0);
    expect(out.steps.slice(0, i).every((st) => st.before.kill < 150)).toBe(true);
    expect(out.steps[i - 1].after.kill).toBeGreaterThanOrEqual(150);
    expect(out.steps[i].level).toBe(85);
    expect(out.steps.length).toBeGreaterThan(i + 1);
  });
  it('a switch whose figure stops leaves the Ice Shot leg ended (no more Ice Shot steps), said in the notes', async () => {
    const ev = stubEv(), hoaStops: Evaluator = { ...ev, run: async (lo, ch, c) => {
      const r = await ev.run(lo, ch, c);
      return c.skill === 'hoa' ? { ...r, figure: { ...r.figure, stop: 'not ported: x' } } : r;
    } };
    const out = await runIdeal(hoaStops, { ...small, startLevel: 85, endLevel: 85, stepsPerStage: 10, switchAt: 150 });
    expect(out.steps.every((st) => st.before.kill < 150 && st.move.kind !== 'switch')).toBe(true);
    expect(out.startNotes!.some((n) => /^L85 planned switch cannot be priced yet: not ported: x$/.test(n))).toBe(true);
    expect(out.startNotes!.some((n) => /^L85: the Ice Shot leg reached .* \(switchAt 1\.5e\+2\): no more Ice Shot upgrades/.test(n))).toBe(true);
  });
  it("below the target page's points the switch does not wait: the page is trimmed to the level points", async () => {
    const out = await runIdeal(stubEv(), { ...small, startLevel: 85, endLevel: 85, stepsPerStage: 0, switchAt: 0 });
    const sw = out.steps.find((st) => st.move.kind === 'switch')!;
    expect(sw.level).toBe(85);
    expect(sw.move.label).toMatch(new RegExp(`on the target build's talent page trimmed to ${pointsAtLevel(85)} of \\d+ points`));
    const set = (sw.move.changes as { kind: string; points?: number }[]).filter((c) => c.kind === 'talent' && c.points! > 0);
    expect(set.reduce((a, c) => a + c.points!, 0)).toBe(pointsAtLevel(85));
  });
  it('the cull sources the model does not count are named, in the ideal guide and in Hammer of Ash advice', async () => {
    const ideal = await runIdeal(stubEv(), { ...small, endLevel: 60, stepsPerStage: 0 });
    for (const n of CULL_NOT_COUNTED) expect(ideal.notSearched).toContain(n);
    expect(CULL_NOT_COUNTED.some((n) => /Machine Lord/.test(n)) && CULL_NOT_COUNTED.some((n) => /Ill Omen/.test(n))).toBe(true);
  });
  it('advice lists every next upgrade with its exact gain, priced or not, best first, and the etor price of what each buys', async () => {
    const out = await runAdvise(stubEv(), fromExport(exportOf()), { maxRounds: 1, topK: 2, maxSteps: 1 });
    const next = out.next!;
    expect(next.length).toBeGreaterThan(10);
    expect(next.every((n) => n.gain > 1 && n.kill > out.start.kill)).toBe(true);
    expect(next.filter((n) => n.costFE === null && /^Unique /.test(n.label))).toEqual([]);   // an unlisted legendary may not exist this season
    expect(next.map((n) => n.gain)).toEqual([...next.map((n) => n.gain)].sort((a, b) => b - a));
    for (const n of next) if (n.buy) expect(Object.hasOwn(out.prices!, n.buy.name), n.buy.name).toBe(true);
  });
  // bosses as yardsticks: kill = (100 + 10 per change) x 10, at most the lock 1e6; Life sets the time to kill
  const LIFE: Record<string, number> = { cube1: 1e4, keegan2: 2e4, cube2: 3e4, cube3: 1e9 };
  const bossEv = (): Evaluator => ({ pin: 'stub', async close() {}, async run(lo, changes, ctx) {
    const n = ((lo as { __n?: number }).__n ?? 0) + changes.length, v = (100 + 10 * n) * (ctx.skill === 'hoa' ? 10 : 1), t = ctx.skill === 'hoa' ? ctx.target ?? undefined : undefined;
    const k = Math.min(v, 1e6), talents = { ...(lo as { talents?: Record<number, number> }).talents };
    for (const c of changes as { kind: string; node: number; points: number }[]) if (c.kind === 'talent') talents[c.node] = c.points;
    return { loadout: { ...lo, __n: n, talents }, dropped: [], figure: { life100: v, life0: v, kill: k, partial: [], ...(t ? { target: t, lifeMax: LIFE[t], lock: 1e6 } : {}) } };
  } });
  it('Hammer of Ash goes boss by boss (Cube 1, Keegan 2, Cube 2, Cube 3): a leg ends once its boss dies within moveOnSeconds, each leg on its own yardstick', async () => {
    const out = await runIdeal(bossEv(), { ...small, startLevel: 90, endLevel: 90, stepsPerStage: 20, finalSteps: 2, switchAt: 150, moveOnSeconds: 10 });
    const legs = out.legs!;
    expect(legs.map((l) => `${l.skill}:${l.target}`)).toEqual(['iceShot:null', 'hoa:cube1', 'hoa:keegan2', 'hoa:cube2', 'hoa:cube3']);
    expect(legs[0].end).toMatch(/switch to Hammer of Ash/);
    for (const l of legs.slice(1, -1)) expect(l.end).toMatch(/dies in .* \(under 10 s\): move on to (Keegan 2|Cube 2|Cube 3)$/);
    legs.forEach((l, i) => {
      const own = out.steps.slice(l.firstStep, legs[i + 1]?.firstStep ?? out.steps.length);
      for (const st of own) expect(st.after.target ?? null).toBe(l.target);
    });
    expect(out.steps[legs[1].firstStep].move.kind).toBe('switch');
  }, 300_000);
  it("a next-buys row carries only the omissions the start does not already have (the start's are said once)", async () => {
    const st = fromExport(exportOf()), base = { life100: 100, life0: 100, kill: 100, partial: ['buff 1: 2.5 adds/s'] };
    const ev: Evaluator = { pin: 'stub', async close() {}, async run(lo, ch) { const n = ch.length;
      return { loadout: lo, dropped: [], figure: { life100: 100 + n, life0: 100 + n, kill: 100 + n, partial: ['buff 1: 3.5 adds/s', ...(n > 1 ? ['node 9 not in this figure'] : [])] } }; } };
    const g: Generator = () => [1, 2].map((n) => ({ kind: 'gear', label: `m${n}`, acquisition: true, costFE: 1, minLevel: 0, changes: Array(n).fill({ kind: 'x' }) }) as Move);
    const rows = await nextBuys(st, ev, [g], { prices: historyBook(localItems(), localHistory()), level: 60, notSearched: new Set() }, base);
    expect(rows.find((r) => r.label === 'm1')!.partial).toBeUndefined();
    expect(rows.find((r) => r.label === 'm2')!.partial).toEqual(['node 9 not in this figure']);
  });
  it('advice with maxSteps 0 is the next-buys list alone: no plan steps, not stopped', async () => {
    const out = await runAdvise(stubEv(), fromExport(exportOf()), { maxRounds: 1, topK: 2, maxSteps: 0 });
    expect(out.next!.length).toBeGreaterThan(0);
    expect(out.steps.filter((x) => !/^Free talent respec/.test(x.move.label))).toEqual([]);   // only the free respec (level 90 and below), when it helps
    expect(out.knobs.stoppedBy).toBeUndefined();
    expect(out.knobs.partialRun).toBeUndefined();
  });
  it('a plan that runs out of priceable upgrades says so on its last leg, with the most common reason', async () => {
    // after 2 changes every candidate drops a new piece, with numbers that move: the leg ends with that reason, not silently
    const ev: Evaluator = { pin: 'stub', async close() {}, async run(lo, changes) {
      const n = ((lo as { __n?: number }).__n ?? 0) + changes.length, k = 100 + 10 * n;
      return { loadout: { ...lo, __n: n }, dropped: [], figure: { life100: k, life0: k, kill: k, partial: n > 2 && changes.length ? ['buff 15184: 3.5 adds/s, a mix of states'] : [] } };   // the same text every stage: the set keeps one
    } };
    const out = await runIdeal(ev, { ...small, startLevel: 60, endLevel: 65, stepsPerStage: 5, switchAt: Infinity });
    expect(out.legs!.at(-1)!.end).toMatch(/^the plan ends here at L65: no upgrade the model can price fully raises the kill speed \(most often: buff 15184: # adds\/s, a mix of states\)$/);
  });
  it('bosses the plan does not reach get their own tab too: the last build priced on each, marked not reached, with why', async () => {
    // Hammer of Ash never improves here (every change prices the same): the plan ends on Cube 1
    const ev: Evaluator = { pin: 'stub', async close() {}, async run(lo, changes, ctx) {
      const n = ((lo as { __n?: number }).__n ?? 0) + changes.length, t = ctx.skill === 'hoa' ? ctx.target ?? undefined : undefined;
      const k = ctx.skill === 'hoa' ? 1000 : 100 + 10 * n;
      return { loadout: { ...lo, __n: n }, dropped: [], figure: { life100: k, life0: k, kill: k, partial: [], ...(t ? { target: t, lifeMax: LIFE[t] * 100, lock: 1e6 } : {}) } };
    } };
    const out = await runIdeal(ev, { ...small, startLevel: 90, endLevel: 90, stepsPerStage: 20, finalSteps: 2, switchAt: 150, moveOnSeconds: 10 });
    const legs = out.legs!;
    expect(legs.map((l) => `${l.target}:${l.reached ?? true}`)).toEqual(['null:true', 'cube1:true', 'keegan2:false', 'cube2:false', 'cube3:false']);
    expect(legs[1].end).toMatch(/^the plan ends here at L90/);
    expect(legs[2].end).toBe('not reached: the plan ends on Cube 1; with its last build Keegan 2 dies in 33.3 min');
    for (const l of legs.slice(2)) expect(l.firstStep).toBe(out.steps.length);
  }, 300_000);
  it('the ideal guide ends at hero level 90 (user, 2026-10-15)', () => {
    expect(DEFAULT_IDEAL.endLevel).toBe(90);
  });
  it("the Hammer of Ash leg assembles the known build: its steps are the target build's pieces, and a new stage re-fits the target talent page", async () => {
    const runs: { changes: unknown[]; level: number }[] = [];
    const out = await runIdeal(stubEv(undefined, { runs }), { ...small, startLevel: 85, endLevel: 90, stepsPerStage: 3, switchAt: 150 });
    const i = out.steps.findIndex((st) => st.move.kind === 'switch');
    expect(i).toBeGreaterThan(0);
    const hoa = out.steps.slice(i + 1);
    expect(hoa.length).toBeGreaterThan(0);
    expect(hoa.every((st) => /^(Target[: ]|Rare base |Craft )/.test(st.move.label) || /^Swap .+ for a white /.test(st.move.label))).toBe(true);
    expect(out.startNotes!.some((n) => /^L90: the target talent page re-fitted to \d+ points$/.test(n))).toBe(true);
  }, 300_000);
  it('advice starts on the first boss the character does not kill within moveOnSeconds', async () => {
    const st = fromExport(exportOf({ loadout: { ...idealStart().loadout, skills: [{ sid: 1110, level: 20, place: { kind: 'active', slot: 0 } }] } }));
    const out = await runAdvise(bossEv(), { ...st, loadout: { ...st.loadout, __n: 50 } }, { maxRounds: 1, topK: 2, maxSteps: 1 });
    // kill (100 + 500) x 10 = 6000: Cube 1 in 1.7 s, Keegan 2 in 3.3 s, Cube 2 in 5 s, Cube 3 not: the advice is for Cube 3
    expect(out.legs).toEqual([{ skill: 'hoa', target: 'cube3', firstStep: 0, start: out.start }]);
    expect(out.start.target).toBe('cube3');
  });
  it('the advice carries the character it starts from: level, skill, FE, owned items and worn gear by slot', async () => {
    const st = fromExport(exportOf());
    const out = await runAdvise(stubEv(), st, { maxRounds: 1, topK: 2, maxSteps: 1 });
    expect(out.character).toMatchObject({ level: 60, skill: 'iceShot', fe: 1000, owned: st.owned.length });
    expect(out.character!.gear).toEqual((st.loadout.gear as { slot: string; label: string }[]).map((g) => ({ slot: g.slot, label: g.label })));
    expect(out.character!.gear.length).toBeGreaterThan(0);
  });
  it('fromExport names a missing hero, items or loadout', () => {
    expect(() => fromExport(exportOf({ hero: undefined }))).toThrow('export has no hero.level');
    expect(() => fromExport(exportOf({ items: undefined }))).toThrow('export has no items list');
    expect(() => fromExport(exportOf({ loadout: undefined }))).toThrow('export has no loadout');
    expect(() => fromExport(null)).toThrow(/tli-lens export/);
  });
  it('fromExport rejects talents over the full budget (two pages read), not over the scaled estimate below 93', () => {
    const loadout = (n: number) => ({ ...idealStart().loadout, talents: { 12010100: n } });
    expect(() => fromExport(exportOf({ loadout: loadout(pointsAtLevel(93) + 1) }))).toThrow(/more than the 108 a hero can have/);
    expect(fromExport(exportOf({ loadout: loadout(pointsAtLevel(60) + 1) })).level).toBe(60);
  });
  it('an owned stack is consumed count times; the item level gates it', async () => {
    const stack = fromExport(exportOf({ items: [{ ...item('bag-1', 'bag', helmet), count: 2 }] }));
    const ctx = { prices: { season: 's', fetchedAt: 'x', price: () => null }, level: 60, notSearched: new Set<string>() };
    expect(ownedGear(stack, ctx)[0].minLevel).toBeGreaterThanOrEqual(helmet.level);
    const high = fromExport(exportOf({ items: [{ ...item('bag-9', 'bag', helmet), level: 99 }] }));
    expect(ownedGear(high, ctx)[0].minLevel).toBe(99);
    const out = await runAdvise(stubEv(), stack, { maxRounds: 1, topK: 2, maxSteps: 6 });
    expect(out.steps.filter((st) => st.move.consumes === 'bag-1')).toHaveLength(2);
  });
});
