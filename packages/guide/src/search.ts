/** Two-loop progression search (spec §3.2): acquisitions ranked by kill-average gain per FE (lazy greedy),
 *  reconfigurations re-solved by a churn-gated hill climb. */
import type { EvalCtx, Evaluated, Evaluator, Figure, GenCtx, Generator, Move, State, Step } from './types';

export interface Knobs { churn: number; topK: number; maxRounds: number; refreshEvery: number; maxSteps: number; targetKill?: number; budgetFE?: number;
  /** wall-clock minutes; once over, the run stops after the current step (knobs.stoppedBy = 'budget') */ budgetMinutes?: number;
  /** Hammer of Ash's bosses in order and when a leg moves on: once its boss dies within this many seconds (modes.ts BOSS_ORDER) */ targets?: string[]; moveOnSeconds?: number;
  /** echoed only: the prices file laid over etor (cli `--prices` / prices.json) and how many items it names */ prices?: { file: string; overrides: number };
  /** echoed only: the price basis - etor's live snapshot, or last season's history window per leg */ livePrices?: boolean; priceWindows?: Record<string, string>;
  /** advise: once the FE is spent, steps still searched without the budget (each noted "beyond your FE") */ continueSteps: number;
  /** the best enabler (own figure) is re-solved only when its figure reaches this share of the current kill average (ponytail: a heuristic bound, one
   *  re-solve round would need a 1/floor gain to rescue it; set 0 to always re-solve the best) */ enablerFloor: number }
export const overBudget = (k: Knobs, t0: number, ev?: Evaluator) =>
  k.budgetMinutes !== undefined && Date.now() - t0 - (ev?.pausedMs?.() ?? 0) >= k.budgetMinutes * 60_000;
export const DEFAULT_KNOBS: Knobs = { churn: 0.05, topK: 5, maxRounds: 10, refreshEvery: 10, maxSteps: 400, continueSteps: 10, enablerFloor: 0.25 };

/** A partial piece's identity: its text with the measured decimals (rates, probabilities) taken out, ids kept. dps-debug writes the live numbers into the
 *  text ("buff 15184 ...: 2.72727 adds/s ... P = 2.24e-4"), so nearly any change moved them and made the same omission look new. */
export const pieceKey = (p: string) => p.replace(/\d+\.\d+(?:e[-+]?\d+)?|\d+e[-+]?\d+/gi, '#');
/** omissions that only leave out a buff the build would add, so the figure is a lower bound and still ranks (it is better if it beats the base without
 *  it): node 306, a timed attribute buff the model does not build (dps-debug's coordinator, 2026-10-16: its parameters are not decoded); node 2230, energy
 *  granted to skill stones (a grant: leaving it out only understates; the known >= 110T build's vorax limb carries it) */
const LOWER_BOUND = [/^not in this figure: node 306 \(buff component 0x12 only/, /^not in this figure: node 2230 \(skill stones' energy/];
/** A figure is rankable only if it dropped no piece the baseline still had (but a lower-bound one), and it computed. */
export function rankable(before: Figure, after: Figure): boolean {
  const had = new Set(before.partial.map(pieceKey));
  return !after.stop && after.partial.every((p) => had.has(pieceKey(p)) || LOWER_BOUND.some((r) => r.test(p)));
}

/** A move's figure is rankable by `rankable`, except a skill switch: a different skill compiles different pieces, so its omissions need not be a subset
 *  of the old skill's; it ranks when it computed, and the step says what differs (`switchNote`). */
export const rankableMove = (m: Move, before: Figure, after: Figure): boolean => m.kind === 'switch' ? !after.stop : rankable(before, after);
export const switchNote = (b: Figure, a: Figure): string[] => {
  const added = a.partial.filter((p) => !b.partial.includes(p)), removed = b.partial.filter((p) => !a.partial.includes(p));
  return added.length || removed.length ? [`omissions differ across the skill switch: +${added.join(', ') || 'none'} / −${removed.join(', ') || 'none'}`] : [];
};

/** Search-wide bookkeeping owned by `path` (stale scores for lazy greedy, running FE, reported lists). */
export interface Mem { scores: Map<string, number>; since: number; cumFE: number; unpriced: Set<string>; notCalculable: Set<string> }
export const newMem = (): Mem => ({ scores: new Map(), since: 0, cumFE: 0, unpriced: new Set(), notCalculable: new Set() });

const key = (m: Move) => `${m.kind}|${m.label}`;
const why = (b: Figure, a: Figure) => a.stop ? `stopped: ${a.stop}` : `dropped ${a.partial.filter((p) => !b.partial.map(pieceKey).includes(pieceKey(p))).join(', ')}`;

/** Memoise run() per (loadout object, changes, ctx) so one step never evaluates the same thing twice (in-flight promises shared). */
function memoEv(ev: Evaluator): Evaluator {
  const seen = new WeakMap<object, Map<string, Promise<Evaluated>>>();
  return {
    pin: ev.pin, parallelism: ev.parallelism, close: () => ev.close(),
    run(loadout, changes, ctx) {
      let m = seen.get(loadout); if (!m) seen.set(loadout, m = new Map());
      const k = JSON.stringify([changes, ctx]);
      let p = m.get(k); if (!p) m.set(k, p = ev.run(loadout, changes, ctx));
      return p;
    },
  };
}

/** the evaluation context of a state: its level, skill and boss */
export const ctxOfState = (s: State, skill = s.skill): EvalCtx => ({ level: s.level, skill, ...(s.target !== undefined ? { target: s.target } : {}) });
const evalMove = (s: State, m: Move, ev: Evaluator) => ev.run(s.loadout, m.changes, ctxOfState(s, m.skill ?? s.skill));
const apply = (s: State, m: Move, e: Evaluated): State => ({
  ...s, loadout: e.loadout, fe: s.fe - (m.costFE ?? 0), skill: m.skill ?? s.skill,
  owned: m.consumes ? s.owned.flatMap((o) => (o.itemId !== m.consumes ? [o] : (o.count ?? 1) > 1 ? [{ ...o, count: o.count - 1 }] : [])) : s.owned,
});
const legal = (s: State, m: Move) => m.minLevel <= s.level;
const lnGain = (b: number, a: number) => (a > b ? (b > 0 ? Math.log(a / b) : Infinity) : (a > 0 ? Math.log(a / b) : b > 0 ? -Infinity : 0));
const scoreOf = (gain: number, cost: number) => (gain <= 0 ? gain : cost === 0 ? Infinity : gain / cost);

export async function resolve(s: State, ev: Evaluator, gens: Generator[], ctx: GenCtx, k: Knobs, f?: Figure, mem: Mem = newMem()):
  Promise<{ state: State; figure: Figure; taken: Move[] }> {
  let figure = f ?? (await ev.run(s.loadout, [], ctxOfState(s))).figure;
  const taken: Move[] = [];
  for (let round = 0; round < k.maxRounds; round++) {
    const moves = gens.flatMap((g) => g(s, ctx)).filter((m) => legal(s, m) && (m.costFE !== null || (mem.unpriced.add(m.label), false)));
    const evs = await Promise.all(moves.map((m) => evalMove(s, m, ev)));
    let best = -1;
    evs.forEach((e, i) => {
      if (!rankable(figure, e.figure)) { mem.notCalculable.add(`${moves[i].label}: ${why(figure, e.figure)}`); return; }
      if (e.figure.kill > figure.kill && e.figure.kill >= figure.kill * (1 + k.churn) && (best < 0 || e.figure.kill > evs[best].figure.kill)) best = i;
    });
    if (best < 0) break;
    s = apply(s, moves[best], evs[best]); figure = evs[best].figure; taken.push(moves[best]);
  }
  return { state: s, figure, taken };
}

/** Spend what `spend` offers (free "+1 point" moves) while each one raises the kill average, with no churn gate: a single point is worth less than the gate. */
export const spendFree = (s: State, ev: Evaluator, spend: Generator, ctx: GenCtx, k: Knobs, f: Figure, mem: Mem) =>
  resolve(s, ev, [spend], ctx, { ...k, churn: 0, maxRounds: 1000 }, f, mem);

async function stepOnce(s: State, f: Figure, rawEv: Evaluator, acq: Generator[], recon: Generator[], ctx: GenCtx, k: Knobs, mem: Mem = newMem(), spend?: Generator):
  Promise<{ state: State; step: Step } | null> {
  const ev = memoEv(rawEv);
  if (mem.since >= k.refreshEvery) { mem.scores.clear(); mem.since = 0; }
  mem.since++;
  const remaining = Math.min(s.fe, (k.budgetFE ?? Infinity) - mem.cumFE);
  const cands: Move[] = [];
  for (const m of acq.flatMap((g) => g(s, ctx))) {
    if (!legal(s, m)) continue;
    if (m.costFE === null) { mem.unpriced.add(m.label); continue; }
    if (m.costFE <= remaining) cands.push(m);
  }
  // lazy greedy: unseen candidates and enablers score +∞ (evaluated now); stale scores are upper bounds
  const fresh = new Map<string, { m: Move; e: Evaluated; gain: number; score: number }>();
  const stale = (m: Move) => mem.scores.get(key(m)) ?? Infinity;
  const kth = () => [...fresh.values()].map((r) => r.score).sort((a, b) => b - a)[k.topK - 1] ?? -Infinity;
  let sweep = true; // first round takes every unseen candidate in one batch (they all score +∞, so no decision changes)
  const unseen = cands.filter((m) => !mem.scores.has(key(m))).length;
  for (;;) {
    const bar = kth();
    const todo = cands.filter((m) => !fresh.has(key(m)) && (m.enabler || !mem.scores.has(key(m)) || stale(m) > bar))
      .sort((a, b) => stale(b) - stale(a)).slice(0, Math.max(k.topK, ev.parallelism ?? 1, cands.filter((m) => m.enabler && !fresh.has(key(m))).length, sweep ? unseen : 0));
    sweep = false;
    if (!todo.length) break;
    const evs = await Promise.all(todo.map((m) => evalMove(s, m.then ? { ...m, changes: m.then.changes } : m, ev)));
    todo.forEach((m, i) => {
      const e = evs[i];
      if (!rankableMove(m, f, e.figure)) { mem.notCalculable.add(`${m.label}: ${why(f, e.figure)}`); mem.scores.set(key(m), -Infinity); fresh.set(key(m), { m, e, gain: -Infinity, score: -Infinity }); return; }
      const gain = lnGain(f.kill, e.figure.kill), score = scoreOf(gain, m.then?.costFE ?? m.costFE!);
      mem.scores.set(key(m), score); fresh.set(key(m), { m, e, gain, score });
    });
  }
  const byScore = (a: { score: number; gain: number }, b: { score: number; gain: number }) => (b.score - a.score) || (b.gain - a.gain) || 0;
  const all = [...fresh.values()].filter((r) => r.gain > -Infinity);
  // ponytail: one enabler re-solved per step, the best own figure over the floor (each re-solve prices every reconfiguration; none won a step in the
  // 2026-10-15 guides); re-solve more if a lost step shows it
  const enabler = all.filter((r) => r.m.enabler && r.e.figure.kill >= f.kill * k.enablerFloor).sort((a, b) => b.e.figure.kill - a.e.figure.kill)[0];
  const picks = new Set([...all.sort(byScore).slice(0, k.topK), ...(enabler ? [enabler] : [])]);
  const solved = await Promise.all([...picks].map(async (r) => {
    const e0 = r.m.then ? await evalMove(s, r.m, ev) : r.e;   // a lookahead move is taken as its first part
    if (r.m.then && !rankable(f, e0.figure)) return { r, res: { state: s, figure: f, taken: [] }, gain: -Infinity, score: -Infinity };
    const s1 = apply(s, r.m, e0);
    let res = await resolve(s1, ev, recon, ctx, k, e0.figure, mem);
    if (spend) { const sp = await spendFree(res.state, ev, spend, ctx, k, res.figure, mem); res = { ...sp, taken: [...res.taken, ...sp.taken] }; }   // e.g. a tree swap that left points unplaced
    const gain = r.m.then ? r.gain : lnGain(f.kill, res.figure.kill);
    return { r, res, gain, score: r.m.then ? r.score : scoreOf(gain, r.m.costFE!) };
  }));
  const win = solved.filter((x) => x.gain > 0).sort(byScore)[0];
  if (!win) return null;
  const cost = win.r.m.costFE!;
  mem.cumFE += cost; mem.scores.delete(key(win.r.m));
  const notes = win.r.m.kind === 'switch' ? switchNote(f, win.res.figure) : win.r.m.then ? [win.r.m.then.note] : [];
  return { state: win.res.state, step: { level: s.level, move: win.r.m, triggered: win.res.taken, before: f, after: win.res.figure, cumFE: mem.cumFE, ...(notes.length ? { notes } : {}) } };
}

/** Lazy pass first; if it finds nothing, drop the stale scores and look at everything once before giving up. */
export async function step(s: State, f: Figure, ev: Evaluator, acq: Generator[], recon: Generator[], ctx: GenCtx, k: Knobs, mem: Mem = newMem(), spend?: Generator):
  Promise<{ state: State; step: Step } | null> {
  const r = await stepOnce(s, f, ev, acq, recon, ctx, k, mem, spend);
  if (r || !mem.scores.size) return r;
  mem.scores.clear();
  return stepOnce(s, f, ev, acq, recon, ctx, k, mem, spend);
}

export interface PathOut { start: Figure; steps: Step[]; notCalculable: string[]; unpriced: string[]; notSearched: string[]; stoppedBy?: 'budget' }
export async function path(s0: State, ev: Evaluator, acq: Generator[], recon: Generator[], ctxOf: (s: State) => GenCtx, k: Knobs,
  onStep?: (p: PathOut) => void):
  Promise<PathOut> {
  const t0 = Date.now();
  const start = (await ev.run(s0.loadout, [], ctxOfState(s0))).figure;
  const mem = newMem(), notSearched = new Set<string>(), steps: Step[] = [];
  let s = s0, f = start;
  const snap = (): PathOut => ({ start, steps: [...steps], notCalculable: [...mem.notCalculable], unpriced: [...mem.unpriced], notSearched: [...notSearched] });
  let stoppedBy: 'budget' | undefined;
  while (steps.length < k.maxSteps && !(k.targetKill !== undefined && f.kill >= k.targetKill)) {
    if (overBudget(k, t0, ev)) { stoppedBy = 'budget'; break; }
    const ctx = ctxOf(s);
    const r = await step(s, f, ev, acq, recon, ctx, k, mem);
    ctx.notSearched.forEach((n) => notSearched.add(n));
    if (!r) break;
    steps.push(r.step); s = r.state; f = r.step.after;
    onStep?.(snap());
  }
  // the FE is spent (or nothing affordable helps): keep going without the budget, each step marked
  if (!stoppedBy && k.continueSteps > 0 && Number.isFinite(Math.min(s0.fe, k.budgetFE ?? Infinity))) {
    const open: Knobs = { ...k, budgetFE: undefined };
    s = { ...s, fe: Infinity };
    for (let n = 0; n < k.continueSteps && steps.length < k.maxSteps && !(k.targetKill !== undefined && f.kill >= k.targetKill); n++) {
      if (overBudget(k, t0, ev)) { stoppedBy = 'budget'; break; }
      const ctx = ctxOf(s);
      const r = await step(s, f, ev, acq, recon, ctx, open, mem);
      ctx.notSearched.forEach((x) => notSearched.add(x));
      if (!r) break;
      r.step.notes = [...(r.step.notes ?? []), 'beyond your FE'];
      steps.push(r.step); s = r.state; f = r.step.after;
      onStep?.(snap());
    }
  }
  return { ...snap(), ...(stoppedBy ? { stoppedBy } : {}) };
}
