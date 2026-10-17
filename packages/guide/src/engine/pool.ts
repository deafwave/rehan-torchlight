/** Evaluator: a worker_threads pool pricing loadouts with the pinned dps-debug figure entry. */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { killSpeed } from '../kill';
import { pinRoot as defaultPinRoot } from '../pin';
import type { LoadoutPatch } from '../patches';
import type { Change, EvalCtx, Evaluated, Evaluator, Loadout, ManaFit } from '../types';
import { createMemo, memoKey } from './memo';

/** dps-debug lines that are notes, not omissions (their numbers vary per build): never part of `partial` */
export const isPiece = (l: string) => !INFO.some((p) => (typeof p === 'string' ? l.startsWith(p) : p.test(l)));
export const INFO: (string | RegExp)[] = ['price:', /^held buff \d+ \(.*\) not carried: no piece of this build adds it/,
  // U2-MIX (dps-debug buffrate.ts): how a buff in a mix of states was priced - the expectation over its stack states - not an omission
  'priced as the expectation over a mix of states (U2-MIX)', 'U2-MIX joint states ', 'U2-MIX affine closed form',
  // statements, not omissions: a battlecry's enemy-map buff and its derived uptime (IN1); a target buff's resolved uptime (IN1: steady, never added, inert;
  // a real gap is "the target's buff not derived (IN1): ", figure.ts 550); a held buff at the count the character's capture measured
  /^the target's buff \d+ \(\w+\) from the battlecry's enemy map \(IN1\): /, /^the target's buff \(IN1\): /,/^not calculable without a capture: held buffs the pieces do not derive, taken from the capture: /,
  // U2-IS states the cast rate its uptime rules ran on: its text changes whenever attack speed does (dps-debug coordinator, 2026-10-16: a statement)
  /^U2-IS: the uptime rules over the figure's own hit rates /,
  // Kaleidoscope's modifier is set aside from the compile and priced over its three phase states (dps-debug KAL2 / ringW, coordinator 2026-10-16)
  /^not in this figure as compiled: gear \d+: modifier \d+ \(Kaleidoscope: /,
  // nodes that move no figure: the no-op execute 0x1407d0580 (`mov al, 1; ret`), a node inert in the client (Q1), a cull (node 1003: CULL1 counts it in the cull)
  // node 2320 here is the Corona ring's trigger (its enemy buff 35110 is priced, its owner buff 35109 empty); node 626 only sets a buff's duration (NATIVE: no record)
  /^not in this figure: node 2320 \(comp 0x82 \/ 0x91, triggers a skill/, /^not in this figure: node 626 \(/,
  // Fervor's per-hit gain (class 411268, buff 390): no figure moves while the rating is fixed (the target belt's 67; every capture kept its fixed value) - a build with
  // Fervor and no fixed rating would be a real gap (the coordinator, 2026-10-16)
  /^not in this figure: node 627 \(.* - affix class 411268 row \d+ \(buff 390 class 411268\)/,
  /^not in this figure: node \d+ \(execute 0x1407d0580/, /^not in this figure: node \d+ \(Q1: inert in the client/, /^not in this figure: node 1003 \(a hit that kills the target/, /^the target's buff \(IN1\): .* stated at \d+ of its mix of states \(U2-MIX/,
  /^the target's buff \(IN1\): .* stated at \d+ \(POL1/];

/** Stated fight inputs (dps-debug Carry.fight): `bombs` = bombs on the battlefield, `inputs` = other named per-cast / fight inputs */
export interface Fight { bombs?: number; inputs?: Record<string, number> }
/** bombs 10 + the dummy standing still. dps-debug states bombs on the field as 10 in its own E2E1 / M7 work (HANDOFF 0.4: "a stated input, not derived") */
export const STILL_NOTE = 'training dummy stands still (dps-debug STILL / e2e1-lib.ts)';
/** also stated by dps-debug: the castLogSum of the recent-movement window is 0 = STILL_NOTE */
export const STILL_KEY = 'castLogSum id=10000000 window=4s tags=[[],[],[],[]]';
/** joint-roll budget handed to dps-debug's figure entry (its `rollBudget` option) */
export const DEFAULT_ROLL_BUDGET = 1 << 20;
/** the boss Hammer of Ash is priced against (user, 2026-10-15: kill Cube 3 as fast as possible); Ice Shot, the levelling leg, stays on its dummy */
export const DEFAULT_TARGET = 'cube3';
// Old King's Armor's input is stated only when a figure asks (apply.ts ON_ASK), so it moves no other figure's memo key
export { RESOURCE1_KEY } from './apply';
export const DEFAULT_FIGHT: Fight = { bombs: 10, inputs: { [STILL_KEY]: 0 } };   // Fighting Will (RESOURCE1_KEY): apply.ts ON_ASK
export interface Job { loadout: Loadout; changes: (Change | LoadoutPatch)[]; ctx: EvalCtx; fight: Fight; rollBudget: number; /** a dps-debug BOSSES key (hoa) */ target?: string }
export interface JobResult { loadout: Loadout; dropped: string[]; fig: { life100: number; life0: number; left: string[]; needs: string[]; stop?: string; inputs?: Record<string, unknown>;
  /** the damage lock's ceiling, the build's cull on the target (CULL1), the boss's max Life */ lock?: number; cull?: { threshold: number; blocked: string[]; stop?: string }; lifeMax?: number; mana?: ManaFit } }
/** One worker: runs a job, rejects with the dps-debug error message when pricing throws. */
export interface WorkerLike {
  /** settles when the worker can take jobs; rejects when its startup failed */
  ready: Promise<void>;
  run(job: Job): Promise<JobResult>;
  close(): Promise<void>;
}
/** The worker itself died (exit, crash, failed startup): not a verdict on the job. Any other rejection is dps-debug throwing on the job. */
export class WorkerDied extends Error {}
export interface EvaluatorOpts {
  workers?: number; pinRoot?: string;
  /** replaces the worker_threads workers (tests) */
  factory?: (i: number) => WorkerLike;
  /** replaces the git-derived pin (the memo key's first part) */
  pin?: string;
  /** directory of the on-disk memo (none = memory only; never written when the pin is +dirty) */
  memoDir?: string;
  /** the scenario's stated fight inputs (default DEFAULT_FIGHT) */
  fight?: Fight;
  /** dps-debug figure `rollBudget` (default DEFAULT_ROLL_BUDGET) */
  rollBudget?: number;
  /** the dps-debug BOSSES key Hammer of Ash figures are priced against (default DEFAULT_TARGET); null = the ground's dummy */
  target?: string | null;
  /** settled figures kept in memory, least recently used out first (default DEFAULT_MEMO_ENTRIES) */
  memoEntries?: number;
  /** while this file exists no job is started (running ones finish). Default: env GUIDE_BUSY_FILE, else the owner's game-capture flag
   *  (only for real workers; stub factories skip it). null disables. */
  busyFile?: string | null;
  /** how often the busy file is re-checked (ms, default 5000) */
  busyPollMs?: number;
  /** called with true when the pool pauses on the busy file, false when it resumes */
  onBusy?: (paused: boolean) => void;
}
export const DEFAULT_BUSY_FILE = 'C:/Users/deafwave/Documents/no_access/tli/dps-debug/.worktrees/track-a/.cache/game.busy';

/** HEAD sha of the pin, plus `+dirty` when its tree has changes (same rule as dps-debug's pinOf) */
function gitPin(root: string): string {
  const git = (...a: string[]) => execFileSync('git', ['-c', 'safe.directory=*', '-C', root, ...a], { encoding: 'utf8' }).trim();
  return git('rev-parse', 'HEAD') + (git('status', '--porcelain').length ? '+dirty' : '');
}

function threadWorker(root: string): WorkerLike {
  const w = new Worker(new URL('./worker.ts', import.meta.url), { workerData: { pinRoot: root } });
  const pending = new Map<number, { ok: (r: JobResult) => void; fail: (e: Error) => void }>();
  let next = 0, dead: Error | undefined;
  const ready = new Promise<void>((ok, fail) => {
    w.on('message', (m: { id?: number; ready?: true; result?: JobResult; error?: string }) => {
      if (m.ready) return ok();
      const p = pending.get(m.id!); pending.delete(m.id!);
      m.error === undefined ? p?.ok(m.result!) : p?.fail(new Error(m.error));
    });
    const die = (e: Error) => {
      if (!(e instanceof WorkerDied)) e = new WorkerDied(`figure worker failed: ${e.message}`); dead = e; fail(e); for (const p of pending.values()) p.fail(e); pending.clear(); };
    w.on('error', die);
    w.on('exit', c => die(new WorkerDied(`figure worker exited (${c})`)));
  });
  ready.catch(() => {});
  return {
    ready,
    async run(job) {
      await ready;
      if (dead) throw dead;
      return new Promise((ok, fail) => { const id = next++; pending.set(id, { ok, fail }); w.postMessage({ id, job }); });
    },
    async close() { await w.terminate(); },
  };
}

export async function createEvaluator(o: EvaluatorOpts = {}): Promise<Evaluator> {
  const root = o.pinRoot ?? defaultPinRoot();
  const pin = o.pin ?? gitPin(root);
  // 16 threads: 96 one-change figures took 37 s on 8, 29 s on 16, 31 s on 24 (2026-10-16, 32 cores; each thread holds ~1.2 GB and a warm figure slows as more run)
  const n = Math.max(1, o.workers ?? Math.min(16, os.availableParallelism() - 4));
  if (!o.factory) os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL);   // process-wide; the workers are threads of it
  let serial = 0;
  const spawn = (): WorkerLike => (o.factory ?? (() => threadWorker(root)))(serial++);
  const workers = Array.from({ length: n }, spawn);
  const all = new Set(workers);
  const closing = () => Promise.all([...all].map(w => w.close().catch(() => {})));
  try { await Promise.all(workers.map(w => w.ready)); }
  catch (e) { await closing(); throw e; }
  const idle = [...workers];
  const queue: { go: () => void; fail: (e: Error) => void }[] = [];
  let closed = false;
  const fight = o.fight ?? DEFAULT_FIGHT, rollBudget = o.rollBudget ?? DEFAULT_ROLL_BUDGET, target = o.target === undefined ? DEFAULT_TARGET : o.target;
  const targetOf = (ctx: EvalCtx) => { const t = ctx.target === undefined ? target : ctx.target; return ctx.skill === 'hoa' && t ? t : undefined; };
  const memo = createMemo<Evaluated>(pin, o.memoDir, o.memoEntries);
  // env GUIDE_TRACE=1: once a minute, how busy the pool is; a figure over 2 minutes is named
  let done = 0, workMs = 0;
  const trace = process.env.GUIDE_TRACE ? setInterval(() => console.log(new Date().toISOString(),
    `pool: ${n - idle.length} running, ${queue.length} queued, ${done} done, mean ${done ? (workMs / done / 1000).toFixed(1) : '-'} s per figure`), 60_000) : undefined;
  trace?.unref();

  const busyFile = o.busyFile === undefined ? (process.env.GUIDE_BUSY_FILE ?? (o.factory ? null : DEFAULT_BUSY_FILE)) : o.busyFile;
  let paused = false, pausedSince = 0, pausedTotal = 0, poll: Promise<void> | undefined, wake: (() => void) | undefined;
  const sleep = () => poll ??= new Promise<void>(r => {
    const t = setTimeout(r, o.busyPollMs ?? 5000);
    wake = () => { clearTimeout(t); r(); };
  }).finally(() => { poll = undefined; wake = undefined; });
  /** resolves once the busy file is gone, checked fresh each call; waiters share one poll timer so they resume in arrival order */
  const untilFree = async () => {
    if (!busyFile) return;
    while (!closed && existsSync(busyFile)) {
      if (!paused) { paused = true; pausedSince = Date.now(); o.onBusy?.(true); }
      await sleep();
    }
    if (paused && !closed) { paused = false; pausedTotal += Date.now() - pausedSince; o.onBusy?.(false); }
  };

  /** runs f on an idle worker (queued when none). A dead worker is dropped and replaced; `f` is retried once on the replacement. */
  const schedule = <T>(f: (w: WorkerLike) => Promise<T>): Promise<T> => new Promise<T>((ok, fail) => {
    const go = async () => {
      let w = idle.pop()!;
      try {
        for (let attempt = 0; ; attempt++) {
          await untilFree();   // also before the retry on a replacement worker
          try { ok(await f(w)); break; }
          catch (e) {
            if (!(e instanceof WorkerDied) || closed) { fail(e as Error); break; }
            all.delete(w); w.close().catch(() => {});
            w = spawn(); all.add(w);
            if (attempt === 1) { fail(e); break; }
          }
        }
      } finally { idle.push(w); queue.shift()?.go(); }
    };
    if (closed) return fail(new Error('evaluator closed'));
    idle.length ? void go() : queue.push({ go, fail });
  });

  /** `keep: false` marks a result that came from a worker dying twice: returned to the caller, never cached */
  const timed = (w: WorkerLike, job: Job) => {
    const t = Date.now();
    return w.run(job).finally(() => {
      const ms = Date.now() - t; done++; workMs += ms;
      if (trace && ms > 120_000) console.log(new Date().toISOString(), `slow figure ${(ms / 1000).toFixed(0)} s: ${job.ctx.skill} L${job.ctx.level}, changes ${job.changes.map(c => (c as { kind?: string }).kind ?? 'patch').join(',')}`);
    });
  };
  const price = (loadout: Loadout, changes: Job['changes'], ctx: EvalCtx): Promise<{ v: Evaluated; keep: boolean }> =>
    schedule(w => timed(w, { loadout, changes, ctx, fight, rollBudget, ...(targetOf(ctx) ? { target: targetOf(ctx) } : {}) })).then(
      ({ loadout: lo, dropped, fig }) => {
        // the cull ends the kill only when nothing on the target blocks it and the port evaluated every source
        const c = fig.cull, cull = c && !c.blocked.length && !c.stop ? c.threshold : 0;
        const cullNote = c && c.threshold > 0 && !cull ? (c.stop ?? c.blocked.join('; ')) : undefined;
        return { keep: true, v: { loadout: lo, dropped, ...(fig.inputs ? { inputs: fig.inputs } : {}),
          figure: { life100: fig.life100, life0: fig.life0, kill: killSpeed(fig.life100, fig.life0, fig.lock ?? Infinity, cull),
            partial: [...fig.left, ...fig.needs, ...dropped].filter(l => !INFO.some(p => typeof p === 'string' ? l.startsWith(p) : p.test(l))), ...(fig.stop ? { stop: fig.stop } : {}),
            ...(fig.lock !== undefined ? { lock: fig.lock } : {}), ...(fig.mana ? { mana: fig.mana } : {}), ...(cull ? { cull } : {}), ...(cullNote ? { cullNote } : {}),
            ...(targetOf(ctx) ? { target: targetOf(ctx), ...(fig.lifeMax !== undefined ? { lifeMax: fig.lifeMax } : {}) } : {}) } } as Evaluated };
      },
      (e: Error) => {
        if (e.message === 'evaluator closed') throw e;
        return { keep: !(e instanceof WorkerDied), v: { loadout, dropped: [], figure: { life100: 0, life0: 0, kill: 0, partial: [], stop: e.message } } };
      });

  return {
    pin, fight, rollBudget, target, fightNote: STILL_NOTE, parallelism: n,
    /** ms spent paused on the busy file (a pause in progress included) */
    pausedMs: () => pausedTotal + (paused ? Date.now() - pausedSince : 0),
    run: (loadout, changes, ctx) => closed ? Promise.reject(new Error('evaluator closed'))
      : memo.get(memoKey(pin, ctx.skill, ctx.level, loadout, changes, fight, rollBudget, targetOf(ctx)), () => price(loadout, changes, ctx))
        // the notes as they are now: a figure priced before a rule was added is filtered by it too
        .then((e) => ({ ...e, figure: { ...e.figure, partial: e.figure.partial.filter(isPiece) } })),
    close: async () => {
      closed = true;
      clearInterval(trace);
      wake?.();
      for (const q of queue.splice(0)) q.fail(new Error('evaluator closed'));
      await closing();
    },
  };
}
