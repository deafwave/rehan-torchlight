import { mkdirSync, mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { applyPatch, type LoadoutPatch } from '../src/patches';
import { killSpeed } from '../src/kill';
import { memoKey } from '../src/engine/memo';
import { pinRoot } from '../src/pin';
import { applyInOrder, figureDefaultFirst, withAsked } from '../src/engine/apply';
import { type Knobs, overBudget, rankable } from '../src/search';
import { writeAtomic } from '../src/atomic';
import { createEvaluator, DEFAULT_FIGHT, DEFAULT_TARGET, INFO, type Fight, WorkerDied, type Job, type JobResult, type WorkerLike } from '../src/engine/pool';
import type { Change } from '../src/types';
import { realSkip } from './real';

const fig = (life100: number, life0: number, extra: Partial<JobResult['fig']> = {}) => ({ life100, life0, left: [], needs: [], ...extra });
/** stub worker: records jobs; `f` decides the figure (throwing = dps-debug throwing, reported as a rejection) */
function stub(f: (j: Job) => JobResult['fig'] = () => fig(200, 100), delay = 0, dropped: string[] = []) {
  const jobs: Job[] = []; let active = 0, peak = 0;
  const factory = (): WorkerLike => ({
    ready: Promise.resolve(),
    async run(j) {
      jobs.push(j); peak = Math.max(peak, ++active);
      try { await new Promise(r => setTimeout(r, delay)); return { loadout: j.loadout, dropped, fig: f(j) }; } finally { active--; }
    },
    async close() {},
  });
  return { factory, jobs, peak: () => peak };
}
const ctx = { level: 100, skill: 'hoa' } as const;
const lo = { a: 1 };
const ch = [{ kind: 'stub' }] as unknown as Change[];

describe('evaluator (stub workers)', () => {
  it('maps the figure: kill = killAverage, partial = left + needs + dropped, dropped passes through', async () => {
    const s = stub(() => ({ life100: 200, life0: 100, left: ['L'], needs: ['N'] }), 0, ['x']);
    const ev = await createEvaluator({ factory: s.factory, workers: 1, pin: 'p' });
    const r = await ev.run(lo, [], ctx);
    expect(r.figure).toEqual({ life100: 200, life0: 100, kill: killSpeed(200, 100), partial: ['L', 'N', 'x'], target: 'cube3' });
    expect(r.dropped).toEqual(['x']);
  });
  it('Hammer of Ash is priced against the target boss, Ice Shot on its dummy; kill = killSpeed under the lock and the cull', async () => {
    const s = stub(() => fig(300, 100, { lock: 150, cull: { threshold: 0.2, blocked: [] }, lifeMax: 1000 }));
    const ev = await createEvaluator({ factory: s.factory, workers: 1, pin: 'p' });
    const r = await ev.run(lo, [], ctx);
    expect(s.jobs[0].target).toBe('cube3');
    expect(r.figure).toMatchObject({ life100: 300, life0: 100, kill: killSpeed(300, 100, 150, 0.2), lock: 150, cull: 0.2, target: 'cube3', lifeMax: 1000 });
    await ev.run(lo, [], { level: 90, skill: 'iceShot' });
    expect(s.jobs[1].target).toBeUndefined();
    await (await createEvaluator({ factory: s.factory, workers: 1, pin: 'p', target: null })).run(lo, [], ctx);
    expect(s.jobs[2].target).toBeUndefined();
    expect(memoKey('p', 'hoa', 1, lo, [], {}, 1, 'cube3')).not.toBe(memoKey('p', 'hoa', 1, lo, [], {}, 1));
  });
  it("a call can ask for the training dummy (ctx.target null): the same Hammer of Ash build on Ice Shot's yardstick", async () => {
    const s = stub(() => fig(300, 100));
    const ev = await createEvaluator({ factory: s.factory, workers: 1, pin: 'p' });
    const r = await ev.run(lo, [], { ...ctx, target: null });
    expect(s.jobs[0].target).toBeUndefined();
    expect(r.figure.target).toBeUndefined();
    await ev.run(lo, [], ctx);
    expect(s.jobs[1].target).toBe('cube3');   // its own memo entry, not the dummy's
  });
  it('a blocked cull ends nothing: cull 0, the reason kept', async () => {
    const s = stub(() => fig(300, 100, { lock: 150, cull: { threshold: 0.2, blocked: ['HP lock'] } }));
    const r = await (await createEvaluator({ factory: s.factory, workers: 1, pin: 'p' })).run(lo, [], ctx);
    expect(r.figure.cull).toBeUndefined();
    expect(r.figure.cullNote).toBe('HP lock');
    expect(r.figure.kill).toBe(killSpeed(300, 100, 150));
  });
  it('informational price: notes are not omissions: figures differing only in them are rankable', async () => {
    const node = 'not in this figure: node 3030 - affix class x';
    const mk = (n: number) => () => ({ life100: 200, life0: 100, left: [], needs: [`price: roll space of ${n} joint rolls priced by the affine closed form`, node, `price: roll space of ${n + 1} joint rolls`] });
    const ev = await createEvaluator({ factory: stub(mk(5)).factory, workers: 1, pin: 'p' });
    const ev2 = await createEvaluator({ factory: stub(mk(7)).factory, workers: 1, pin: 'p' });
    const a = (await ev.run(lo, [], ctx)).figure, b = (await ev2.run(lo, [], ctx)).figure;
    expect(a.partial).toEqual([node]);
    expect(rankable(a, b)).toBe(true);
    expect(INFO[0]).toBe('price:');
  });
  it("U2-MIX's lines say how a mixed buff was priced (notes); a mix still not priced and a target buff not derived stay omissions", async () => {
    const notes = ['priced as the expectation over a mix of states (U2-MIX): buff 15184 (50355540 row 1, 50355540 row 2): 2.97255 adds/s x 5 stack(s), life 8 s, cap 40',
      'priced as the expectation over a mix of states (U2-MIX), on the target: buff 330 (636982 row 1): 2.97255 adds/s x 1 stack(s), life 3 s, cap 1',
      'U2-MIX joint states of buffs 15184,330 (the product of their weights; states under 0.000001 / 8 taken with all at the cap): 5',
      "the target's buff (IN1): buff 330 (636982 row 1): stated at 1 of its mix of states (U2-MIX: 1: 9.999e-1, 0: 1.340e-4)"];
    const kept = ["the target's buff not derived (IN1): buff 260 (103010015 row 1, 103010015 row 1): single-slot policy 1 with a cap of 5",
      'buff 11730 (13523221 row 1): 2.6 adds/s over a life of 2 s leave P(below the cap 3) = 2.6e-2: a mix of states, not a point'];
    const ev = await createEvaluator({ factory: stub(() => ({ life100: 200, life0: 100, left: [], needs: [...notes, ...kept] })).factory, workers: 1, pin: 'p' });
    expect((await ev.run(lo, [], ctx)).figure.partial).toEqual(kept);
  });
  it('held buff "not carried" lines are informational; "left off" stays an omission', async () => {
    const off = 'held buffs left off: 11210';
    const ev = await createEvaluator({ factory: stub(() => ({ life100: 200, life0: 100, left: [], needs: ['held buff 390 (zhanyi) not carried: no piece of this build adds it', off, 'price: x'] })).factory, workers: 1, pin: 'p' });
    expect((await ev.run(lo, [], ctx)).figure.partial).toEqual([off]);
  });
  it('memo: same call runs once (also concurrently, key order irrelevant); another pin or level never hits it', async () => {
    const s = stub(undefined, 5);
    const a = await createEvaluator({ factory: s.factory, workers: 2, pin: 'p1' });
    await Promise.all([a.run({ a: 1, b: 2 }, ch, ctx), a.run({ b: 2, a: 1 }, ch, ctx)]);
    await a.run({ a: 1, b: 2 }, ch, ctx);
    expect(s.jobs).toHaveLength(1);
    const b = await createEvaluator({ factory: s.factory, workers: 1, pin: 'p2' });
    await b.run({ a: 1, b: 2 }, ch, ctx);
    expect(s.jobs).toHaveLength(2);
    await a.run({ a: 1, b: 2 }, ch, { level: 99, skill: 'hoa' });
    expect(s.jobs).toHaveLength(3);
  });
  it('memo is bounded: settled results leave least-recently-used first; in-flight calls are always shared', async () => {
    const s = stub(() => fig(200, 100), 5);
    const ev = await createEvaluator({ factory: s.factory, workers: 1, pin: 'p', memoEntries: 2 });
    const c = (n: number) => [{ kind: 'stub', n }] as unknown as Change[];
    await Promise.all([ev.run(lo, c(1), ctx), ev.run(lo, c(1), ctx)]);   // in flight together: one job
    expect(s.jobs).toHaveLength(1);
    await ev.run(lo, c(2), ctx); await ev.run(lo, c(1), ctx);            // 1 touched: 2 is now the oldest
    await ev.run(lo, c(3), ctx);                                           // evicts 2
    expect(s.jobs).toHaveLength(3);
    await ev.run(lo, c(1), ctx); await ev.run(lo, c(3), ctx);            // both still held
    expect(s.jobs).toHaveLength(3);
    await ev.run(lo, c(2), ctx);                                           // recomputed
    expect(s.jobs).toHaveLength(4);
  });
  it('disk memo is written for a clean pin and never for +dirty', async () => {
    for (const [pin, files] of [['abc', 1], ['abc+dirty', 0]] as const) {
      const dir = mkdtempSync(join(tmpdir(), 'memo-'));
      const ev = await createEvaluator({ factory: stub().factory, workers: 1, pin, memoDir: dir });
      await ev.run(lo, [], ctx);
      expect(readdirSync(dir)).toHaveLength(files);
      if (files) { // a fresh evaluator reads it back without running
        const s = stub();
        await (await createEvaluator({ factory: s.factory, workers: 1, pin, memoDir: dir })).run(lo, [], ctx);
        expect(s.jobs).toHaveLength(0);
        expect(JSON.parse(readFileSync(join(dir, readdirSync(dir)[0]), 'utf8')).figure.kill).toBe(killSpeed(200, 100));
      }
    }
  });
  it('fight inputs: workers get them (default bombs 10); evaluators with different fight never share a memo entry', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'memo-'));
    const s = stub();
    const mk = (fight?: Fight) => createEvaluator({ factory: s.factory, workers: 1, pin: 'abc', memoDir: dir, ...(fight ? { fight } : {}) });
    const [d, five, again] = [await mk(), await mk({ bombs: 5 }), await mk({ bombs: 5 })];
    await d.run(lo, [], ctx); await five.run(lo, [], ctx); await again.run(lo, [], ctx);
    expect(s.jobs.map(j => j.fight)).toEqual([DEFAULT_FIGHT, { bombs: 5 }]);
    expect(d.fight).toEqual({ bombs: 10, inputs: { 'castLogSum id=10000000 window=4s tags=[[],[],[],[]]': 0 } });
    expect(d.fightNote).toBe('training dummy stands still (dps-debug STILL / e2e1-lib.ts)');
    // same bombs, different named input: its own entry too
    await (await mk({ bombs: 5, inputs: { x: 1 } })).run(lo, [], ctx);
    expect(readdirSync(dir)).toHaveLength(3);
  });
  it('roll budget: workers get it (default 1 << 20); different budgets never share a memo entry', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'memo-'));
    const s = stub();
    const mk = (rollBudget?: number) => createEvaluator({ factory: s.factory, workers: 1, pin: 'abc', memoDir: dir, ...(rollBudget ? { rollBudget } : {}) });
    const [d, small] = [await mk(), await mk(1000)];
    await d.run(lo, [], ctx); await small.run(lo, [], ctx);
    expect(s.jobs.map(j => j.rollBudget)).toEqual([1 << 20, 1000]);
    expect(d.rollBudget).toBe(1 << 20);
    expect(readdirSync(dir)).toHaveLength(2);
  });
  it('a throwing job returns figure.stop with the message; the pool stays alive', async () => {
    const f = stub().factory;
    const ev = await createEvaluator({ workers: 1, pin: 'p', factory: () => {
      const w = f();
      return { ...w, run: async j => { if ((j.loadout as any).bad) throw new Error('boom: not a thing'); return w.run(j); } };
    } });
    const bad = await ev.run({ bad: true }, ch, ctx);
    expect(bad.figure).toMatchObject({ life100: 0, life0: 0, kill: 0, stop: 'boom: not a thing' });
    expect(bad.loadout).toEqual({ bad: true });
    expect((await ev.run(lo, [], ctx)).figure.stop).toBeUndefined();
  });
  it('a figure stop propagates as figure.stop', async () => {
    const ev = await createEvaluator({ factory: stub(() => fig(0, 0, { stop: 'not ported: Ice Shot build entry' })).factory, workers: 1, pin: 'p' });
    expect((await ev.run(lo, [], { level: 94, skill: 'iceShot' })).figure.stop).toMatch(/not ported/);
  });
  it('queues: never more jobs at once than workers', async () => {
    const s = stub(undefined, 5);
    const ev = await createEvaluator({ factory: s.factory, workers: 3, pin: 'p' });
    await Promise.all(Array.from({ length: 40 }, (_, i) => ev.run({ i }, [], ctx)));
    expect(s.jobs).toHaveLength(40);
    expect(s.peak()).toBe(3);
  });
});

describe('busy file', () => {
  it('starts no job while the file exists, keeps queue order, and resumes when it is removed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'busy-')), busyFile = join(dir, 'game.busy');
    writeFileSync(busyFile, '');
    const s = stub(), events: boolean[] = [];
    const ev = await createEvaluator({ factory: s.factory, workers: 1, pin: 'p', busyFile, busyPollMs: 10, onBusy: p => events.push(p) });
    const runs = [1, 2, 3].map(n => ev.run({ n }, [], ctx));
    await new Promise(r => setTimeout(r, 80));
    expect(s.jobs).toHaveLength(0);
    expect(events).toEqual([true]);
    rmSync(busyFile);
    await Promise.all(runs);
    expect(s.jobs.map(j => (j.loadout as { n: number }).n)).toEqual([1, 2, 3]);
    expect(events).toEqual([true, false]);
  });
  it('a file that appears later pauses the next job, and null disables the check', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'busy-')), busyFile = join(dir, 'game.busy');
    const s = stub();
    const ev = await createEvaluator({ factory: s.factory, workers: 1, pin: 'p', busyFile, busyPollMs: 10 });
    await ev.run({ n: 1 }, [], ctx);
    writeFileSync(busyFile, '');
    const p = ev.run({ n: 2 }, [], ctx);
    await new Promise(r => setTimeout(r, 60));
    expect(s.jobs).toHaveLength(1);
    rmSync(busyFile); await p;
    expect(s.jobs).toHaveLength(2);
    writeFileSync(busyFile, '');
    const off = await createEvaluator({ factory: s.factory, workers: 1, pin: 'p', busyFile: null });
    await off.run({ n: 3 }, [], ctx);
    expect(s.jobs).toHaveLength(3);
  });
});

describe('busy file: retry, env, close, paused time', () => {
  const tmpBusy = () => join(mkdtempSync(join(tmpdir(), 'busy-')), 'game.busy');
  it('a retry after WorkerDied waits for the busy file too', async () => {
    const busyFile = tmpBusy(), s = stub(); let made = 0;
    const ev = await createEvaluator({ workers: 1, pin: 'p', busyFile, busyPollMs: 10, factory: () => {
      const id = made++, w = s.factory();
      return id === 0 ? { ...w, run: async () => { writeFileSync(busyFile, ''); throw new WorkerDied('boom'); } } : w;
    } });
    const p = ev.run(lo, [], ctx);
    await new Promise(r => setTimeout(r, 80));
    expect(s.jobs).toHaveLength(0);
    rmSync(busyFile);
    await p;
    expect(s.jobs).toHaveLength(1);
  });
  it('GUIDE_BUSY_FILE overrides the default', async () => {
    const busyFile = tmpBusy(); writeFileSync(busyFile, '');
    process.env.GUIDE_BUSY_FILE = busyFile;
    try {
      const s = stub();
      const ev = await createEvaluator({ factory: s.factory, workers: 1, pin: 'p', busyPollMs: 10 });
      const p = ev.run(lo, [], ctx);
      await new Promise(r => setTimeout(r, 60));
      expect(s.jobs).toHaveLength(0);
      rmSync(busyFile); await p;
    } finally { delete process.env.GUIDE_BUSY_FILE; }
  });
  it('close() ends a pause without a resume event; paused time is tracked', async () => {
    const busyFile = tmpBusy(); writeFileSync(busyFile, '');
    const events: boolean[] = [];
    const ev = await createEvaluator({ factory: stub().factory, workers: 1, pin: 'p', busyFile, busyPollMs: 60_000, onBusy: p => events.push(p) });
    const p = ev.run(lo, [], ctx).catch(e => e);
    await new Promise(r => setTimeout(r, 30));
    expect(ev.pausedMs!()).toBeGreaterThan(0);
    await ev.close();
    await p;
    expect(events).toEqual([true]);
  });
  it('paused time is subtracted from the budget', async () => {
    const busyFile = tmpBusy(); writeFileSync(busyFile, '');
    let clock = 0;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => clock);
    try {
      const ev = await createEvaluator({ factory: stub().factory, workers: 1, pin: 'p', busyFile, busyPollMs: 5 });
      const p = ev.run(lo, [], ctx);
      await new Promise(r => setTimeout(r, 30));
      clock = 10 * 60_000;
      expect(ev.pausedMs!()).toBe(10 * 60_000);
      expect(overBudget({ budgetMinutes: 5 } as Knobs, 0, ev)).toBe(false);
      expect(overBudget({ budgetMinutes: 5 } as Knobs, 0)).toBe(true);
      rmSync(busyFile); await p;
      expect(ev.pausedMs!()).toBe(10 * 60_000);
    } finally { spy.mockRestore(); }
  });
});

describe('writeAtomic', () => {
  it('writes via temp + rename, retries a failing rename, and cleans up when it keeps failing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atomic-')), f = join(dir, 'g.json');
    expect(writeAtomic(f, '{"a":1}')).toBe(true);
    expect(JSON.parse(readFileSync(f, 'utf8'))).toEqual({ a: 1 });
    expect(readdirSync(dir)).toEqual(['g.json']);
    // a directory at the target makes rename fail (EPERM/EISDIR): returns false, no temp left, run not aborted
    const bad = join(dir, 'd'); mkdirSync(bad);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try { expect(writeAtomic(bad, 'x', 2, 1)).toBe(false); expect(warn).toHaveBeenCalled(); } finally { warn.mockRestore(); }
    expect(readdirSync(dir).sort()).toEqual(['d', 'g.json']);
  });
});

describe('worker death, startup, close', () => {
  it('a worker that dies mid-job is replaced, the job retried once, later jobs succeed', async () => {
    let made = 0, closedWorkers = 0;
    const ev = await createEvaluator({ workers: 1, pin: 'p', factory: () => {
      const id = made++, w = stub().factory();
      return { ...w, close: async () => { closedWorkers++; }, run: async j => { if (id === 0) throw new WorkerDied('exit 1'); return w.run(j); } };
    } });
    expect((await ev.run({ a: 1 }, [], ctx)).figure.stop).toBeUndefined();
    expect(made).toBe(2); expect(closedWorkers).toBe(1);
    expect((await ev.run({ a: 2 }, [], ctx)).figure.stop).toBeUndefined();
  });
  it('a crash-derived stop (retry also dies) is returned but never cached', async () => {
    let dying = true, runs = 0;
    const ev = await createEvaluator({ workers: 1, pin: 'p', factory: () => ({
      ready: Promise.resolve(), close: async () => {},
      run: async j => { runs++; if (dying) throw new WorkerDied('exit 1'); return { loadout: j.loadout, dropped: [], fig: fig(200, 100) }; },
    }) });
    expect((await ev.run(lo, [], ctx)).figure.stop).toBe('exit 1');
    expect(runs).toBe(2);
    dying = false;
    expect((await ev.run(lo, [], ctx)).figure.stop).toBeUndefined();
    expect(runs).toBe(3);
  });
  it('a crash stop is not written to disk', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'memo-'));
    const ev = await createEvaluator({ workers: 1, pin: 'abc', memoDir: dir, factory: () => ({ ready: Promise.resolve(), close: async () => {}, run: async () => { throw new WorkerDied('x'); } }) });
    await ev.run(lo, [], ctx);
    expect(readdirSync(dir)).toHaveLength(0);
  });
  it('a corrupt disk memo file is a miss; writes leave no temp files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'memo-'));
    const mk = () => createEvaluator({ factory: stub().factory, workers: 1, pin: 'abc', memoDir: dir });
    await (await mk()).run(lo, [], ctx);
    const [f] = readdirSync(dir);
    writeFileSync(join(dir, f), '{"torn');
    const s = stub();
    expect((await (await createEvaluator({ factory: s.factory, workers: 1, pin: 'abc', memoDir: dir })).run(lo, [], ctx)).figure.kill).toBe(killSpeed(200, 100));
    expect(s.jobs).toHaveLength(1);
    expect(readdirSync(dir).filter(x => x.endsWith('.tmp'))).toHaveLength(0);
  });
  it('startup failure throws and closes the workers that started', async () => {
    let closedWorkers = 0, i = 0;
    await expect(createEvaluator({ workers: 3, pin: 'p', factory: () => ({
      ready: i++ === 1 ? Promise.reject(new Error('tsx registration failed')) : Promise.resolve(),
      run: async () => { throw new Error('unused'); }, close: async () => { closedWorkers++; },
    }) })).rejects.toThrow('tsx registration failed');
    expect(closedWorkers).toBe(3);
  });
  it('after close(), queued and new runs reject with "evaluator closed"', async () => {
    const ev = await createEvaluator({ factory: stub(undefined, 20).factory, workers: 1, pin: 'p' });
    const first = ev.run({ i: 1 }, [], ctx), queued = ev.run({ i: 2 }, [], ctx);
    const queuedRej = expect(queued).rejects.toThrow('evaluator closed');
    await ev.close();
    await queuedRej;
    await first;
    await expect(ev.run({ i: 3 }, [], ctx)).rejects.toThrow('evaluator closed');
  });
  it('applies [Change, Change, Patch, Change] as applyChanges([c1,c2]) -> applyPatch -> applyChanges([c4])', () => {
    const calls: string[] = [];
    const c = (n: string) => ({ kind: 'c', n }) as unknown as Change;
    const patch = { kind: 'patch', op: 'prism-provide', tree: 1, extraAffix: [] } as LoadoutPatch;
    const r = applyInOrder({ v: '' }, [c('1'), c('2'), patch, c('4')], {
      isPatch: (x): x is LoadoutPatch => (x as { kind: string }).kind === 'patch',
      applyPatch: lo => { calls.push('patch'); return { v: `${lo.v}P` }; },
      applyChanges: (lo, cs) => { calls.push(`changes[${cs.map(x => (x as any).n)}]`); return { loadout: { v: `${lo.v}C` }, dropped: [`d${calls.length}`] }; },
    });
    expect(calls).toEqual(['changes[1,2]', 'patch', 'changes[4]']);
    expect(r).toEqual({ loadout: { v: 'CPC' }, dropped: ['d1', 'd3'] });
  });
});

const skipReal = realSkip();
if (skipReal) console.warn(skipReal);
describe('evaluator (real workers, pinned dps-debug)', () => {
  it.skipIf(!!skipReal)('equals guideFigure in-process on the target build; patches applied; iceShot stops', async () => {
    const fx = await import('@dps/guide/figure');
    const root = pinRoot(), read = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));
    // target assembly of dps-debug guide/figure.test.ts (a): the slate file filtered to the build's slates
    const l = read('re/evidence/loadout_probuild-hanshansi-bing.json');
    const mine = new Set<number>(l.slates);
    l.slateItems = read('re/evidence/t5_slate_v2_probuild.json').filter((v: any) => v.EffectTalentIds.every((t: number) => mine.has(t)))
      .map((v: any) => ({ itemId: `probuild_${v.id}`, baseId: 0, talents: v.EffectTalentIds, influence: v }));
    const patch: LoadoutPatch = { kind: 'patch', op: 'prism-provide', tree: 1, extraAffix: [] };
    const ev = await createEvaluator({ workers: 3 });
    try {
      const [r, p, ice] = await Promise.all([
        ev.run(l, [], ctx), ev.run(l, [patch], ctx), ev.run(l, [], { level: 94, skill: 'iceShot' })]);
      // the evaluator prices Hammer of Ash against DEFAULT_TARGET (Cube 3): the reference is the same ground with that target
      const ground = { ...fx.GROUNDS.hoa, target: (fx.BOSSES as Record<string, string>)[DEFAULT_TARGET], carry: { ...fx.GROUNDS.hoa.carry, fight: DEFAULT_FIGHT } };
      const ref = fx.guideFigure(fx.openCatalog(), structuredClone(l), 'hoa', { heroLevel: 100, ground });
      expect(r.figure.stop).toBeUndefined();
      expect(r.figure.life100).toBe(ref.life100);
      expect(r.figure.life0).toBe(ref.life0);
      expect(r.figure.lock).toBe(ref.lock?.ceiling);
      const cull = ref.cull && !ref.cull.blocked.length && !ref.cull.stop ? ref.cull.threshold : 0;
      expect(r.figure.kill).toBe(killSpeed(ref.life100, ref.life0, ref.lock?.ceiling ?? Infinity, cull));
      expect(ev.pin).toMatch(/^[0-9a-f]{40}(\+dirty)?$/);
      expect(p.loadout).toEqual(applyPatch(l, patch));
      expect(ice.figure.stop).toMatch(/not ported|refused: skill \d+ is limited to the weapon rows/);
    } finally { await ev.close(); }
  }, 900_000);
});

describe('figure session reuse (real worker)', () => {
  it.skipIf(!!skipReal)('one worker, same loadout twice plus a patched one: each equals a cold guideFigure', async () => {
    const fx = await import('@dps/guide/figure');
    const root = pinRoot(), read = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));
    const l = read('re/evidence/loadout_probuild-hanshansi-bing.json');
    const mine = new Set<number>(l.slates);
    l.slateItems = read('re/evidence/t5_slate_v2_probuild.json').filter((v: any) => v.EffectTalentIds.every((t: number) => mine.has(t)))
      .map((v: any) => ({ itemId: `probuild_${v.id}`, baseId: 0, talents: v.EffectTalentIds, influence: v }));
    const patch: LoadoutPatch = { kind: 'patch', op: 'prism-provide', tree: 1, extraAffix: [] };
    const cat = fx.openCatalog(), ground = { ...fx.GROUNDS.hoa, target: (fx.BOSSES as Record<string, string>)[DEFAULT_TARGET], carry: { ...fx.GROUNDS.hoa.carry, fight: DEFAULT_FIGHT } };
    const cold = (lo: unknown) => fx.guideFigure(cat, structuredClone(lo) as never, 'hoa', { heroLevel: 100, ground });
    const ev = await createEvaluator({ workers: 1 });
    try {
      const a = await ev.run(l, [], ctx);
      const b = await ev.run(structuredClone(l), [patch], ctx);
      const a2 = await ev.run(structuredClone(l), [], ctx);
      const refA = cold(l), refB = cold(applyPatch(l, patch));
      for (const [r, ref] of [[a, refA], [a2, refA], [b, refB]] as const) {
        expect(r.figure.life100).toBe(ref.life100);
        expect(r.figure.life0).toBe(ref.life0);
      }
    } finally { await ev.close(); }
  }, 900_000);
});

describe('stated fight inputs (real worker)', () => {
  it.skipIf(!!skipReal)("the L100 Phantom Delivery loadout prices: bombs, castLogSum and Old King's Armor's movement bonus are stated", async () => {
    const dir = join(pinRoot(), 'game'), f = readdirSync(dir).filter(x => /^loadout_l100-.*\.json$/.test(x)).sort().pop()!;
    const ev = await createEvaluator({ workers: 1 });
    try {
      const r = await ev.run(JSON.parse(readFileSync(join(dir, f), 'utf8')), [], { level: 93, skill: 'hoa' });
      expect(r.figure.stop).toBeUndefined();
      expect(r.figure.kill).toBeGreaterThan(0);
    } finally { await ev.close(); }
  }, 900_000);
});

describe('withAsked (fight inputs stated only when a figure asks)', () => {
  const ask = (k: string) => `the scenario did not supply the fight input ${k} (gear 3010 modifier 51416041)`;
  it("re-prices with an on-ask input when the figure names it, and leaves every other figure alone", () => {
    const seen: Record<string, number>[] = [];
    const r = withAsked((x) => { seen.push(x); return x['affix class 782097792 var 1'] === 0 ? { v: 1 } as { stop?: string; v: number } : { stop: ask('affix class 782097792 var 1'), v: 0 }; });
    expect(r.v).toBe(1);
    expect(seen).toEqual([{}, { 'affix class 782097792 var 1': 0 }]);
    const once: Record<string, number>[] = [];
    expect(withAsked((x) => (once.push(x), { stop: ask('affix class 1 var 1') })).stop).toMatch(/affix class 1 var 1/);
    expect(once).toEqual([{}]);
    expect(DEFAULT_FIGHT.inputs).not.toHaveProperty(['affix class 782097792 var 1']);
  });
});

describe('figureDefaultFirst', () => {
  const affine = (n: number, b: number) => `roll space of ${n} exceeds the enumeration budget ${b} and the price is not affine in the draw of type 3 (at 0.5: 1 against 2)`;
  it('re-prices at the big budget only on a not-affine stop', () => {
    const seen: (number | undefined)[] = [];
    const r = figureDefaultFirst(o => { seen.push(o.rollBudget); return o.rollBudget ? { stop: undefined, v: 1 } : { stop: affine(9, 262144), v: 0 }; }, 1 << 20);
    expect(r.v).toBe(1);
    expect(seen).toEqual([undefined, 1 << 20]);
  });
  it('matches the across-the-draws form too', () => {
    const seen: (number | undefined)[] = [];
    figureDefaultFirst(o => { seen.push(o.rollBudget); return { stop: o.rollBudget ? undefined : "not ported: roll space of 9 exceeds the budget 262144 and the price is not affine across the draws (midpoint 1 against the corners' mean)" }; }, 1 << 20);
    expect(seen).toEqual([undefined, 1 << 20]);
  });
  it("matches the owner's main messages (no budget number)", () => {
    for (const stop of ['not ported: roll space of 9 exceeds the enumeration budget and the price is not affine in the draw of type 3 (at 0.5: 1 against 2)',
      'not ported: roll space of 9 exceeds the budget and the price is not affine across the draws (price at the mean fractions 1 against the corners interpolation 2)']) {
      const seen: (number | undefined)[] = [];
      figureDefaultFirst(o => { seen.push(o.rollBudget); return { stop: o.rollBudget ? undefined : stop }; }, 1 << 20);
      expect(seen).toEqual([undefined, 1 << 20]);
    }
  });
  it('prices once, without a budget, when the default computes', () => {
    const seen: unknown[] = [];
    figureDefaultFirst(o => { seen.push(o); return { stop: undefined }; }, 1 << 20);
    expect(seen).toEqual([{}]);
  });
});
