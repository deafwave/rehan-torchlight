import { describe, expect, test } from 'vitest';
import { DEFAULT_KNOBS, newMem, path, rankable, resolve, step } from '../src/search';
import type { LoadoutPatch } from '../src/patches';
import type { Change, Evaluator, Figure, GenCtx, Generator, Move, State } from '../src/types';

// Stub: a loadout is { labels }; a change is { label }. Label "+x%" multiplies by 1+x/100; "E" + "R" together multiply by 3;
// "bad" drops piece "p".
type L = { labels: string[] };
const ch = (label: string) => ({ label }) as unknown as Change;
function figureOf(labels: string[]): Figure {
  let v = 100;
  for (const l of labels) { const m = /^\+(\d+)%/.exec(l); if (m) v *= 1 + Number(m[1]) / 100; }
  if (labels.includes('E') && labels.includes('R')) v *= 3;
  return { life100: v, life0: v, kill: v, partial: labels.includes('bad') ? ['p'] : [] };
}
function stub(parallelism?: number, delayMs = 0) {
  const calls: string[] = [];
  let active = 0, peak = 0;
  const ev: Evaluator = {
    pin: 'stub', ...(parallelism ? { parallelism } : {}), async close() {},
    async run(loadout, changes, ctx) {
      calls.push(JSON.stringify([(loadout as L).labels, changes, ctx]));
      peak = Math.max(peak, ++active);
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      active--;
      const labels = [...(loadout as L).labels, ...changes.map((c) => (c as unknown as { label: string }).label)];
      return { loadout: { labels }, figure: figureOf(labels), dropped: [] };
    },
  };
  return { ev, calls, peak: () => peak };
}
const mv = (label: string, o: Partial<Move> = {}): Move => ({ kind: 'gear', label, acquisition: true, costFE: 1, minLevel: 0, changes: [ch(label)], ...o });
const rc = (label: string): Move => mv(label, { acquisition: false, costFE: 0 });
const state = (o: Partial<State> = {}): State => ({ loadout: { labels: [] }, owned: [], fe: 1000, level: 100, skill: 'iceShot', ...o });
const ctx = (): GenCtx => ({ prices: { season: 's', fetchedAt: 'x', price: () => null }, level: 100, notSearched: new Set() });
const fixed = (...ms: Move[]): Generator => () => ms;
const once = (m: Move): Generator => (s) => ((s.loadout as L).labels.includes(m.label) ? [] : [m]);
const base = figureOf([]);
const K = DEFAULT_KNOBS;

test('rankable rejects a figure that dropped a new piece', () => {
  const b = { life100: 1, life0: 1, kill: 1, partial: ['a'] };
  expect(rankable(b, { ...b, partial: ['a'] })).toBe(true);
  expect(rankable(b, { ...b, partial: ['a', 'b'] })).toBe(false);
  expect(rankable(b, { ...b, partial: [], stop: 'x' })).toBe(false);
});

describe('step', () => {
  test('all unseen candidates are in flight at once, not one batch per slow figure', async () => {
    const { ev, peak } = stub(8, 5);
    const ms = Array.from({ length: 60 }, (_, i) => mv(`+${i + 1}%`));
    await step(state(), base, ev, [fixed(...ms)], [], ctx(), K);
    expect(peak()).toBeGreaterThanOrEqual(60);
  });

  test('takes the best gain per FE and records the step', async () => {
    const r = await step(state(), base, stub().ev, [fixed(mv('+10%', { costFE: 1 }), mv('+30%', { costFE: 10 }), mv('+5%', { costFE: 1 }))], [], ctx(), K);
    expect(r!.step.move.label).toBe('+10%');
    expect(r!.step.before).toBe(base);
    expect(r!.step.after.kill).toBeCloseTo(110);
    expect(r!.step.triggered).toEqual([]);
    expect(r!.step.cumFE).toBe(1);
    expect(r!.state.fe).toBe(999);
  });

  test('a free owned-item move beats any paid move and is consumed', async () => {
    const owned = [{ itemId: 'i1' }] as State['owned'];
    const r = await step(state({ owned }), base, stub().ev, [fixed(mv('+50%', { costFE: 1 }), mv('+1%', { costFE: 0, consumes: 'i1' }))], [], ctx(), K);
    expect(r!.step.move.label).toBe('+1%');
    expect(r!.state.owned).toEqual([]);
    expect(r!.state.fe).toBe(1000);
  });

  test('churn gate: +4% reconfiguration not taken, +6% taken', async () => {
    const acq = fixed(mv('+10%'));
    const lo = await step(state(), base, stub().ev, [acq], [once(rc('+4%'))], ctx(), K);
    expect(lo!.step.triggered).toEqual([]);
    const hi = await step(state(), base, stub().ev, [acq], [once(rc('+6%'))], ctx(), K);
    expect(hi!.step.triggered.map((m) => m.label)).toEqual(['+6%']);
    expect(hi!.step.after.kill).toBeCloseTo(100 * 1.1 * 1.06);
  });

  test('resolve is best-improvement hill climb capped by maxRounds', async () => {
    const r = await resolve(state(), stub().ev, [fixed(rc('+6%'), rc('+20%'))], ctx(), { ...K, maxRounds: 2 });
    expect(r.taken.map((m) => m.label)).toEqual(['+20%', '+20%']);
    expect(r.figure.kill).toBeCloseTo(144);
  });

  test('an enabler whose value appears after a reconfiguration beats a bigger plain gain', async () => {
    const r = await step(state(), base, stub().ev, [fixed(mv('+20%'), mv('E', { enabler: true }))], [fixed(rc('R'))], ctx(), K);
    expect(r!.step.move.label).toBe('E');
    expect(r!.step.triggered.map((m) => m.label)).toEqual(['R']);
    expect(r!.step.after.kill).toBeCloseTo(300);
  });

  test('of several enablers over the floor only the one with the best own figure is re-solved', async () => {
    const { ev, calls } = stub();
    const r = await step(state(), base, ev, [fixed(mv('+1%', { enabler: true }), mv('E', { enabler: true, changes: [ch('E'), ch('+2%')] }))], [fixed(rc('R'))], ctx(), { ...K, topK: 1 });
    expect(r!.step.move.label).toBe('E');
    expect(calls.some((c) => c.startsWith('[["+1%"],[{"label":"R"}]'))).toBe(false);
  });

  test('an enabler whose own figure is under enablerFloor x the current kill is not re-solved', async () => {
    const r = await step(state(), base, stub().ev, [fixed(mv('+20%'), mv('E', { enabler: true }))], [fixed(rc('R'))], ctx(), { ...K, topK: 1, enablerFloor: 1.01 });
    expect(r!.step.move.label).toBe('+20%');
  });

  test('unpriced is listed, never taken; non-rankable is reported, never taken', async () => {
    const mem = newMem();
    const bad = mv('bad', { changes: [ch('bad'), ch('+80%')] });
    const r = await step(state(), base, stub().ev, [fixed(mv('+90%', { costFE: null }), bad, mv('+2%'))], [], ctx(), K, mem);
    expect(r!.step.move.label).toBe('+2%');
    expect([...mem.unpriced]).toEqual(['+90%']);
    expect([...mem.notCalculable].join()).toContain('bad: dropped p');
  });

  test('a move above the hero level is never evaluated', async () => {
    const { ev, calls } = stub();
    const r = await step(state({ level: 60 }), base, ev, [fixed(mv('+50%', { minLevel: 61 }), mv('+1%'))], [], ctx(), K);
    expect(r!.step.move.label).toBe('+1%');
    expect(calls.some((c) => c.includes('+50%'))).toBe(false);
  });

  test('budgetFE excludes moves that cost more than the remaining FE', async () => {
    const k = { ...K, budgetFE: 10 };
    const r = await step(state(), base, stub().ev, [fixed(mv('+50%', { costFE: 100 }), mv('+1%', { costFE: 5 }))], [], ctx(), k);
    expect(r!.step.move.label).toBe('+1%');
    expect(await step(state(), base, stub().ev, [fixed(mv('+50%', { costFE: 100 }))], [], ctx(), k)).toBeNull();
  });

  test('never evaluates the same (loadout, changes, ctx) twice in a step', async () => {
    const { ev, calls } = stub();
    await step(state(), base, ev, [fixed(mv('+10%'), mv('+10%b', { changes: [ch('+10%')] }), mv('E', { enabler: true }))], [fixed(rc('R'))], ctx(), K);
    expect(new Set(calls).size).toBe(calls.length);
  });

  test('lazy greedy does not re-evaluate stale low scores', async () => {
    const { ev, calls } = stub();
    const mem = newMem();
    const ms = [mv('+10%'), mv('+9%'), mv('+1%'), mv('+2%')];
    const k = { ...K, topK: 1 };
    const s1 = await step(state(), base, ev, [fixed(...ms)], [], ctx(), k, mem);
    const n = calls.length;
    await step(s1!.state, s1!.step.after, ev, [fixed(...ms.slice(1))], [], ctx(), k, mem);
    expect(calls.length - n).toBeLessThan(ms.length - 1);
  });
});

test('a move carrying a loadout patch reaches the evaluator with the patch intact', async () => {
  const patch = { kind: 'patch', op: 'prism-provide', tree: 51, extraAffix: [{ id: 1, dyn: [2, 2] }] } satisfies LoadoutPatch;
  const got: unknown[] = [];
  const { ev } = stub();
  const spy: Evaluator = { ...ev, run: (l, c, x) => { got.push(...c); return ev.run(l, c, x); } };
  await step(state(), base, spy, [fixed(mv('+10%', { changes: [ch('+10%'), patch] }))], [], ctx(), K);
  expect(got).toContain(patch);
});

describe('path', () => {
  const ms = [mv('+10%'), mv('+20%', { costFE: 4 }), mv('+3%')];
  const gen: Generator = (s) => ms.filter((m) => !(s.loadout as L).labels.includes(m.label));
  const run = (k = K) => path(state(), stub().ev, [gen], [], () => ctx(), k);

  test('runs until nothing improves and accumulates FE', async () => {
    const r = await run();
    expect(r.steps.map((x) => x.move.label)).toEqual(['+10%', '+20%', '+3%']);
    expect(r.steps.map((x) => x.cumFE)).toEqual([1, 5, 6]);
    expect(r.start).toEqual(base);
  });

  test('stops at maxSteps and at targetKill', async () => {
    expect((await run({ ...K, maxSteps: 1 })).steps).toHaveLength(1);
    expect((await run({ ...K, targetKill: 105 })).steps).toHaveLength(1);
  });

  test('reports unpriced and the generators notSearched union', async () => {
    const c = ctx();
    const g: Generator = (_s, cx) => { cx.notSearched.add('rule X not ported'); return [mv('?', { costFE: null })]; };
    const r = await path(state(), stub().ev, [g], [], () => c, K);
    expect(r.unpriced).toEqual(['?']);
    expect(r.notSearched).toEqual(['rule X not ported']);
    expect(r.steps).toEqual([]);
  });

  test('a switch move changes state.skill and later candidates come from the new skill', async () => {
    const g: Generator = (s) => s.skill === 'iceShot'
      ? [mv('switch', { kind: 'switch', skill: 'hoa', changes: [ch('+10%')] })]
      : (s.loadout as L).labels.includes('+7%') ? [] : [mv('+7%')];
    const r = await path(state(), stub().ev, [g], [], () => ctx(), K);
    expect(r.steps.map((x) => x.move.label)).toEqual(['switch', '+7%']);
  });
});

describe('lazy greedy edge cases', () => {
  test.each([1, 8])('a synergy move is taken once its partner is owned (parallelism %i; not the retry path)', async (par) => {
    // "S" is worth +1% alone but +50% once "A" is owned (synergy, not flagged enabler)
    const { ev } = stub(par);
    const wrapped: Evaluator = {
      ...ev, async run(l, c, x) {
        const r = await ev.run(l, c, x);
        const ls = (r.loadout as L).labels;
        const f = figureOf(ls);
        if (ls.includes('S') && ls.includes('A')) f.kill *= 1.5;
        return { ...r, figure: { ...f, life100: f.kill, life0: f.kill } };
      },
    };
    const defs: [string, string, number][] = [['X', '+10%', 1], ['A', '+5%', 1], ['S', '+1%', 2]];
    const gen2: Generator = (s) => defs.filter(([n]) => !(s.loadout as L).labels.includes(n)).map(([n, b, c]) => mv(n, { costFE: c, changes: [ch(n), ch(b)] }));
    const r = await path(state(), wrapped, [gen2], [], () => ctx(), { ...K, refreshEvery: 100 });
    expect(r.steps.map((x) => x.move.label)).toContain('S');
    expect(r.steps.at(-1)!.after.kill).toBeCloseTo(100 * 1.1 * 1.05 * 1.01 * 1.5);
  });

  test('an unseen free move with a bigger gain is evaluated even when the bar is +Infinity', async () => {
    const owned = [{ itemId: 'a' }, { itemId: 'b' }] as State['owned'];
    const r = await step(state({ owned }), base, stub().ev, [fixed(mv('+1%', { costFE: 0, consumes: 'a' }), mv('+9%', { costFE: 0, consumes: 'b' }))], [], ctx(), { ...K, topK: 1 });
    expect(r!.step.move.label).toBe('+9%');
  });
});

test('a round evaluates unseen candidates at the parallelism', async () => {
  const { ev, peak } = stub(8, 2);
  const ms = Array.from({ length: 40 }, (_, i) => mv(`+${i + 1}%`));
  await step(state(), base, ev, [fixed(...ms)], [], ctx(), { ...K, topK: 1 });
  expect(peak()).toBeGreaterThanOrEqual(8);
});

describe('retry after a null lazy pass', () => {
  // S is harmful alone, x3 once A is owned. In round 2 ten unseen fillers (x0.99) and N (offered only once A is owned) outrank S's stale score
  // and fill the first batch at both widths, so S stays skipped, the lazy pass returns null, and step() clears the scores and retries.
  test.each([[1, 1], [8, 1]])('parallelism %i: the retry runs %i time(s) and finds S', async (par, retries) => {
    const base_ = stub(par).ev;
    let sWithA = 0;
    const ev: Evaluator = { ...base_, async run(l, c, x) {
      const r = await base_.run(l, c, x);
      const ls = (r.loadout as L).labels, f = figureOf(ls);
      if (ls.includes('S')) { f.kill *= ls.includes('A') ? 3 : 0.5; if (ls.includes('A')) sWithA++; }
      if (ls.includes('N')) f.kill *= 0.99;
      f.kill *= 0.99 ** ls.filter((n) => /^F\d+$/.test(n)).length;
      return { ...r, figure: { ...f, life100: f.kill, life0: f.kill } };
    } };
    const gen: Generator = (s) => {
      const ls = (s.loadout as L).labels;
      const fillers = ls.includes('A') ? Array.from({ length: 10 }, (_, i) => `F${i}`) : [];
      return [['A', '+10%'], ['S', '+0%'], ...(ls.includes('A') ? [['N', '+0%']] : []), ...fillers.map((n) => [n, '+0%'])]
        .filter(([n]) => !ls.includes(n)).map(([n, b]) => mv(n, { changes: [ch(n), ch(b)] }));
    };
    const k = { ...K, topK: 1, refreshEvery: 100 }, mem = newMem();
    let clears = 0; const clear = mem.scores.clear.bind(mem.scores); mem.scores.clear = () => { clears++; clear(); };
    const s1 = await step(state(), base, ev, [gen], [], ctx(), k, mem);
    expect(s1!.step.move.label).toBe('A');
    expect(sWithA).toBe(0);
    const s2 = await step(s1!.state, s1!.step.after, ev, [gen], [], ctx(), k, mem);
    expect(s2!.step.move.label).toBe('S');
    expect(clears).toBe(retries);
    expect(sWithA).toBe(1);   // S was first priced with A owned only by the retry
  });

  test('width 8 without fillers: S is in the first batch, no retry needed', async () => {
    const mem = newMem(); let clears = 0; const clear = mem.scores.clear.bind(mem.scores); mem.scores.clear = () => { clears++; clear(); };
    const base_ = stub(8).ev;
    const ev: Evaluator = { ...base_, async run(l, c, x) {
      const r = await base_.run(l, c, x), ls = (r.loadout as L).labels, f = figureOf(ls);
      if (ls.includes('S')) f.kill *= ls.includes('A') ? 3 : 0.5;
      if (ls.includes('N')) f.kill *= 0.99;
      return { ...r, figure: { ...f, life100: f.kill, life0: f.kill } };
    } };
    const gen: Generator = (s) => { const ls = (s.loadout as L).labels;
      return [['A', '+10%'], ['S', '+0%'], ...(ls.includes('A') ? [['N', '+0%']] : [])].filter(([n]) => !ls.includes(n)).map(([n, b]) => mv(n, { changes: [ch(n), ch(b)] })); };
    const k = { ...K, topK: 1, refreshEvery: 100 };
    const s1 = await step(state(), base, ev, [gen], [], ctx(), k, mem);
    const s2 = await step(s1!.state, s1!.step.after, ev, [gen], [], ctx(), k, mem);
    expect(s2!.step.move.label).toBe('S');
    expect(clears).toBe(0);
  });
});

describe('batch size does not change the path', () => {
  const k = { ...K, topK: 1, refreshEvery: 100 };
  const go = (gen: Generator, par: number) => path(state(), stub(par).ev, [gen], [], () => ctx(), k);
  const labels = (r: Awaited<ReturnType<typeof path>>) => r.steps.map((x) => x.move.label);
  const fin = (r: Awaited<ReturnType<typeof path>>) => r.steps.at(-1)!.after.kill;

  test('independent gains: identical moves and final kill at parallelism 1 and 8', async () => {
    const ms = Array.from({ length: 12 }, (_, i) => mv(`+${i + 2}%`, { costFE: i + 1 }));
    const gen: Generator = (s) => ms.filter((m) => !(s.loadout as L).labels.includes(m.label));
    const [a, b] = [await go(gen, 1), await go(gen, 8)];
    expect(labels(a).length).toBeGreaterThan(3);
    expect(labels(b)).toEqual(labels(a));
    expect(fin(b)).toBeCloseTo(fin(a));
  });

  test('synergy (stale scores): the wider batch is never worse', async () => {
    const synergy = (par: number) => {
      const base_ = stub(par).ev;
      const ev: Evaluator = { ...base_, async run(l, c, x) {
        const r = await base_.run(l, c, x);
        const ls = (r.loadout as L).labels, f = figureOf(ls);
        if (ls.includes('S') && ls.includes('A')) f.kill *= 1.5;
        return { ...r, figure: { ...f, life100: f.kill, life0: f.kill } };
      } };
      const defs: [string, string, number][] = [['X', '+10%', 1], ['A', '+5%', 1], ['S', '+1%', 2], ['Y', '+3%', 1]];
      const gen: Generator = (s) => defs.filter(([n]) => !(s.loadout as L).labels.includes(n)).map(([n, b, c]) => mv(n, { costFE: c, changes: [ch(n), ch(b)] }));
      return path(state(), ev, [gen], [], () => ctx(), k);
    };
    const [a, b] = [await synergy(1), await synergy(8)];
    expect(fin(b)).toBeGreaterThanOrEqual(fin(a) - 1e-9);
  });
});

describe('new behaviours (final fix wave)', () => {
  test('I2: free "+1 point" moves are spent with no churn gate, also after the resolve of a step', async () => {
    const pt: Generator = (s) => ((s.loadout as L).labels.filter((l) => l === '+1%').length < 3 ? [rc('+1%')] : []);
    const r = await step(state(), base, stub().ev, [fixed(mv('+10%'))], [], ctx(), K, newMem(), pt);
    expect(r!.step.triggered.map((m) => m.label)).toEqual(['+1%', '+1%', '+1%']);
    expect(r!.step.after.kill).toBeCloseTo(100 * 1.1 * 1.01 ** 3);
    // without it the 1% moves sit under the 5% churn gate
    expect((await step(state(), base, stub().ev, [fixed(mv('+10%'))], [fixed(rc('+1%'))], ctx(), K))!.step.triggered).toEqual([]);
    // a point that does not raise the kill average is not taken, and the loop ends
    const none = await step(state(), base, stub().ev, [fixed(mv('+10%'))], [], ctx(), K, newMem(), fixed(rc('+0%')));
    expect(none!.step.triggered).toEqual([]);
  });

  test('I3: a skill switch ranks even though its omissions differ; the step says how', async () => {
    const sw = mv('switch', { kind: 'switch', skill: 'hoa', changes: [ch('bad'), ch('+80%')] });
    const mem = newMem();
    const r = await step(state(), base, stub().ev, [fixed(sw, mv('+2%'))], [], ctx(), K, mem);
    expect(r!.step.move.label).toBe('switch');
    expect(r!.step.notes).toEqual(['omissions differ across the skill switch: +p / \u2212none']);
    expect(r!.state.skill).toBe('hoa');
    // another kind keeps the subset rule
    const not = await step(state(), base, stub().ev, [fixed(mv('bad', { changes: [ch('bad'), ch('+80%')] }), mv('+2%'))], [], ctx(), K, newMem());
    expect(not!.step.move.label).toBe('+2%');
  });

  test('I4: after the FE is spent the path goes on without the budget, marked, up to continueSteps', async () => {
    const gen: Generator = (s) => ['+10%', '+20%', '+30%', '+40%'].filter((n) => !(s.loadout as L).labels.includes(n)).map((n) => mv(n, { costFE: n === '+10%' ? 1 : 100 }));
    const run = (k: Partial<typeof K>) => path(state({ fe: 5 }), stub().ev, [gen], [], () => ctx(), { ...K, ...k });
    const r = await run({});
    expect(r.steps.map((s) => s.move.label)).toEqual(['+10%', '+40%', '+30%', '+20%']);
    expect(r.steps.map((s) => s.notes ?? [])).toEqual([[], ['beyond your FE'], ['beyond your FE'], ['beyond your FE']]);
    expect(r.steps.at(-1)!.cumFE).toBe(301);
    expect((await run({ continueSteps: 1 })).steps).toHaveLength(2);
    expect((await run({ continueSteps: 0 })).steps).toHaveLength(1);
  });
});
