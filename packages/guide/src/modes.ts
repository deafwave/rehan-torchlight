/** The two guide modes (spec §3.3): `runIdeal` paths the Bing1 progression from map entry, `runAdvise` advises a live character. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gearMoves, slotsOfBase, whiteBaseMoves } from './candidates/gear';
import { GEM_LEVEL, gemLevelAt, gemMoves } from './candidates/gems';
import { kismetMoves } from './candidates/kismets';
import { memoryMoves } from './candidates/memories';
import { pactMoves } from './candidates/pacts';
import { prismMoves } from './candidates/prisms';
import { slateMoves, slateWants } from './candidates/slates';
import { switchWithPage, targetPage } from './candidates/switch';
import { rollPlans } from './candidates/gear';
import { targetMoves } from './candidates/target';
import { talentMoves, talentMovesWith, talentPointMoves } from './candidates/talents';
import { traitMoves } from './candidates/traits';
import { type EtorHistory, type EtorItems, legBooks, LEG_WINDOWS, snapshotBook } from './pricing';
import { CULL_NOT_COUNTED } from './kill';
import { ctxOfState, pieceKey, DEFAULT_KNOBS, type Knobs, newMem, overBudget, path, rankable, rankableMove, resolve, spendFree, step, switchNote } from './search';
import { ICE_SHOT_INPUTS, idealStartNotes } from './start';
import { setTalentPoints, treeOf } from './talentRules';
import { talentName, treeName } from './names';
import { table } from './pin';
import { buildSheet, talentTrees } from './sheet';
import { prismOf } from './patches';
import type { Evaluator, Figure, GenCtx, Generator, GuideOut, Leg, Move, NextBuy, PriceBook, Skill, State, Step } from './types';

export const SEASON = 1501;
const etorFile = (f: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../data/etor/${f}_${SEASON}.json`, import.meta.url)), 'utf8'));
export const localItems = (): EtorItems => etorFile('items');
export const localHistory = (): EtorHistory => etorFile('history');

export interface IdealKnobs extends Knobs {
  /** accepted steps per level stage before the path moves on */ stepsPerStage: number;
  startLevel: number; endLevel: number; stageStep: number;
  /** full-level talent budget (below 93 scaled by round(full x (L - 1) / 92)) */ talentPoints: number;
  /** the Ice Shot leg's end: no Ice Shot step once its kill average reaches this. The planned leg change: at the first stage start whose Ice Shot kill
   *  average reaches it (or after a stage with no step), the path switches to
   *  Hammer of Ash on the target build's talent page; never a greedy step (its figure is against the boss, the Ice Shot leg's the dummy) */ switchAt: number;
  /** reconfiguration rounds re-solved right after the planned switch (churn 0) */ switchRounds: number;
  /** steps the last stage may take toward the goal (the last boss at the damage lock) */ finalSteps: number;
  /** the Hammer of Ash leg assembles the known build (user, 2026-10-15: >= 110T with Ruinous Star): its acquisitions are the target build's pieces, cheapest gain
   *  per FE first, its talent page the target's re-fitted each stage; false = the full search */ hoaTarget: boolean;
}
/** Hammer of Ash's bosses in order of difficulty (dps-debug BOSSES keys; Cube 1 3.2e10 Life, Keegan 2 1.4e13, Cube 2 1.6e13: full damage taken;
 *  Cube 3 5.3e13 at -90 % taken): a leg moves on once its boss dies within `moveOnSeconds`; the last runs to the damage lock (user, 2026-10-15) */
export const BOSS_ORDER = ['cube1', 'keegan2', 'cube2', 'cube3'];
export const DEFAULT_IDEAL: IdealKnobs = { ...DEFAULT_KNOBS, topK: 1, maxRounds: 1, stepsPerStage: 15, startLevel: 60, endLevel: 90, stageStep: 5, talentPoints: 108, switchAt: 2e8, switchRounds: 5, finalSteps: 100, hoaTarget: true };
const BOSS_NAME: Record<string, string> = { cube1: 'Cube 1', cube2: 'Cube 2', cube3: 'Cube 3', keegan: 'Keegan 1', keegan2: 'Keegan 2', void1: 'Void 1', void2: 'Void 2', void3: 'Void 3', traveler: 'the Traveler' };
export const bossName = (t: string) => BOSS_NAME[t] ?? t;
const secs = (x: number) => (x < 1 ? `${(x * 1000).toPrecision(2)} ms` : x < 600 ? `${x.toPrecision(3)} s` : x < 36_000 ? `${(x / 60).toPrecision(3)} min`
  : x < 172_800 ? `${(x / 3600).toPrecision(3)} h` : `${(x / 86_400).toPrecision(3)} days`);
/** the time this figure takes to kill its boss (Infinity off a boss or at no kill speed) */
const killTime = (f: Figure) => (f.lifeMax && f.kill > 0 ? f.lifeMax / f.kill : Infinity);
const lockBound = (f: Figure) => f.lock !== undefined && f.life0 >= f.lock;

// the Ice Shot -> Hammer of Ash switch is planned (`switchWithPage`), never a greedy step: its figure is against the boss, the Ice Shot leg's the dummy
/** stages in a row with no Ice Shot step before the switch is taken short of switchAt (one is a lull: L75 had none, L80's uniques took the leg on) */
const STALL_STAGES = 2;
/** a talent respec is free at this hero level and below (user, 2026-10-16) */
const FREE_RESPEC_LEVEL = 90;
/** whole-page talent variants re-fitted per free respec (the best by their own figure) */
const RESPEC_PAGES = 4;
/** point or core moves per re-fit (a tree filled in node order has many to move) */
const RESPEC_ROUNDS = 40;
const ALL: Generator[] = [gearMoves, gemMoves, kismetMoves, memoryMoves, pactMoves, prismMoves, slateMoves, talentMoves, traitMoves, targetMoves, whiteBaseMoves];
const only = (acquisition: boolean) => (g: Generator): Generator => (s, c) => g(s, c).filter((m) => m.acquisition === acquisition);

/** Mode 2: an owned (non-equipped) gear item is worn at 0 FE, once (the search drops it from `owned` when taken). */
export const ownedGear: Generator = (s) => s.owned.flatMap((it) => {
  const { slots, level } = slotsOfBase(it.baseId, s.skill);
  return slots.map((slot): Move => ({
    kind: 'gear', label: `Wear your ${it.baseName ?? it.baseId} (${it.where}) in ${slot}`, acquisition: true, costFE: 0, costNote: 'owned', minLevel: Math.max(level, it.level), consumes: it.itemId,
    changes: [{ kind: 'gear', slot, item: { baseId: it.baseId, baseName: it.baseName ?? undefined, itemId: it.itemId, level: it.level, modifiers: it.modifiers } }] as never,
  }));
});

const pct = (b: Figure, a: Figure) => `+${((a.kill / b.kill - 1) * 100).toFixed(1)} %`;

/** every acquisition at this state that has no price, one per distinct change list */
export function unpricedAcquisitions(acq: Generator[], s: State, ctx: GenCtx): Move[] {
  const seen = new Set<string>();
  return acq.flatMap((g) => g(s, ctx)).filter((m) => m.minLevel <= s.level && m.costFE === null && !seen.has(JSON.stringify(m.changes)) && seen.add(JSON.stringify(m.changes)));
}

/** `prices`: one book for both legs (tests), or one per leg; default `legBooks` (Ice Shot at day-1 prices, Hammer of Ash at days 1-3) */
export async function runIdeal(ev: Evaluator, k: Partial<IdealKnobs> = {}, prices?: PriceBook | Record<Skill, PriceBook>, onStep?: (out: GuideOut) => void): Promise<GuideOut> {
  const K = { ...DEFAULT_IDEAL, ...k };
  setTalentPoints(K.talentPoints);
  try { return await ideal(ev, K, prices, onStep); } finally { setTalentPoints(DEFAULT_IDEAL.talentPoints); }
}

async function ideal(ev: Evaluator, K: IdealKnobs, prices: PriceBook | Record<Skill, PriceBook> | undefined, onStep?: (out: GuideOut) => void): Promise<GuideOut> {
  const t0 = Date.now();
  const isBook = (p: PriceBook | Record<Skill, PriceBook>): p is PriceBook => typeof (p as PriceBook).price === 'function';
  const legBook: Record<Skill, PriceBook> = !prices ? legBooks(localItems(), localHistory()) : isBook(prices) ? { iceShot: prices, hoa: prices } : prices, books = legBook.iceShot;
  const acq = ALL.map(only(true)), recon = ALL.map(only(false));
  // the Hammer of Ash leg on the known build's path: its pieces only, the white-base swap the only reconfiguration
  const gen = (skill: Skill) => (skill === 'hoa' && K.hoaTarget ? { acq: [targetMoves].map(only(true)), recon: [whiteBaseMoves].map(only(false)) } : { acq, recon });
  const ctxOf = (s: State): GenCtx => ({ prices: legBook[s.skill], level: s.level, notSearched: new Set() });
  const start = idealStartNotes(K.startLevel);
  let s: State = { ...start.state, level: K.startLevel };
  const notes = [...start.notes];
  const out = (o: Partial<GuideOut>): GuideOut => ({
    mode: 'ideal', pin: ev.pin, etor: { season: books.season, fetchedAt: books.fetchedAt }, knobs: { ...K, fight: ev.fight, fightNote: ev.fightNote, rollBudget: ev.rollBudget, target: ev.target, ...(!prices ? { priceWindows: LEG_WINDOWS } : {}) }, startNotes: notes, steps: [], notSearched: [], unpriced: [], notCalculable: [], ...o,
  }) as GuideOut;

  const first = await ev.run(s.loadout, [], ctxOfState(s));
  const inputs = { ...first.inputs, ...(s.skill === 'iceShot' ? { iceShot: { ...ICE_SHOT_INPUTS, ...(first.inputs as Record<string, any> | undefined)?.iceShot, status: 'unverified' } } : {}) };   // eslint-disable-line @typescript-eslint/no-explicit-any
  if (first.figure.stop) {
    const why = `L${s.level} ${s.skill} leg cannot be priced yet: ${first.figure.stop}`;
    notes.push(why);
    return out({ start: first.figure, inputs, notCalculable: [why] });
  }
  const mem = newMem(), steps: Step[] = [], notSearched = new Set<string>(CULL_NOT_COUNTED), unpriced: string[] = [];
  let f = first.figure, stopped = false, halted = false, goal = false, stalls = 0, lastLevel = K.startLevel, stageReasons = 0;   // stalls: stages in a row with no step
  const targets = K.targets ?? BOSS_ORDER, moveOn = K.moveOnSeconds ?? 10;
  let ti = 0;
  const legs: Leg[] = [{ skill: s.skill, target: null, firstStep: 0, start: first.figure }];
  const endLeg = (end: string) => { legs[legs.length - 1].end = end; legs[legs.length - 1].build = buildSheet(s.loadout); };
  /** while the current boss dies within moveOn seconds its leg ends and the next boss's begins (the last boss stays: its goal is the lock); false = the
   *  next boss's figure stopped */
  const advance = async (): Promise<boolean> => {
    while (s.skill === 'hoa' && ti < targets.length - 1 && killTime(f) <= moveOn) {
      const from = targets[ti], t = killTime(f);
      ti++; s = { ...s, target: targets[ti] };
      const g = (await ev.run(s.loadout, [], ctxOfState(s))).figure;
      endLeg(`${bossName(from)} dies in ${secs(t)} (under ${moveOn} s): move on to ${bossName(targets[ti])}`);
      notes.push(`L${s.level}: ${legs[legs.length - 1].end}`);
      legs.push({ skill: 'hoa', target: targets[ti], firstStep: steps.length, start: g });
      f = g; mem.scores.clear(); mem.since = 0;
      if (g.stop) { const why = `L${s.level} Hammer of Ash on ${bossName(targets[ti])} cannot be priced yet: ${g.stop}`; mem.notCalculable.add(why); notes.push(why); return false; }
    }
    return true;
  };
  /** the output so far; callers pass `partialRun` until the run completes */
  const snap = (extra: Record<string, unknown>) => out({ start: first.figure, inputs, steps: [...steps], legs: legs.map((l) => ({ ...l })), notSearched: [...notSearched], unpriced: [...unpriced], notCalculable: [...mem.notCalculable],
    knobs: { ...K, fight: ev.fight, fightNote: ev.fightNote, rollBudget: ev.rollBudget, target: ev.target, ...(!prices ? { priceWindows: LEG_WINDOWS } : {}), ...extra } });
  let tried = -1;
  /** the planned switch at `level` (once per level): true once taken as a step; a stop or a switch not offered yet leaves the Ice Shot leg as it is */
  const trySwitch = async (level: number): Promise<boolean> => {
    tried = level;
    const hoa: State = { ...s, skill: 'hoa', target: targets[0] }, ctx = { ...ctxOf(hoa), level }, m = switchWithPage(s, ctx);   // the switch is the Hammer of Ash leg's first buy
    ctx.notSearched.forEach((x) => notSearched.add(x));
    const e = m && m.costFE !== null ? await ev.run(s.loadout, m.changes, ctxOfState(hoa)) : null;
    if (e?.figure.stop) { const why = `L${level} planned switch cannot be priced yet: ${e.figure.stop}`; mem.notCalculable.add(why); notes.push(why); return false; }
    if (!m || !e) return false;
    const r = await resolve({ ...hoa, loadout: e.loadout, fe: s.fe - m.costFE! }, ev, gen('hoa').recon, ctx, { ...K, churn: 0, maxRounds: K.switchRounds }, e.figure, mem);
    const sp = await spendFree(r.state, ev, talentPointMoves, ctx, K, r.figure, mem);
    mem.cumFE += m.costFE!;
    const why = f.kill >= K.switchAt ? `the Ice Shot leg reached ${f.kill.toExponential(2)} (switchAt ${K.switchAt.toExponential(0)})` : `the Ice Shot leg stalled (no step in the last ${STALL_STAGES} stages)`;
    endLeg(`${why}: switch to Hammer of Ash`);
    legs.push({ skill: 'hoa', target: targets[0], firstStep: steps.length, start: sp.figure });
    steps.push({ level, move: m, triggered: [...r.taken, ...sp.taken], before: f, after: sp.figure, cumFE: mem.cumFE,
      notes: [`planned switch: ${why}${sp.figure.target ? `; from here figures are against ${bossName(sp.figure.target)}, not the Ice Shot leg's training dummy` : ''}`, ...switchNote(f, sp.figure), ...(level < 93 ? ['talent points assumed'] : [])] });
    s = sp.state; f = sp.figure; mem.scores.clear(); mem.since = 0;   // the Ice Shot scores say nothing about Hammer of Ash
    if (!(await advance())) halted = true;
    onStep?.(snap({ partialRun: true }));
    return true;
  };
  const capped = () => s.skill === 'iceShot' && f.kill >= K.switchAt;
  for (let level = K.startLevel; level <= K.endLevel; level += K.stageStep) {
    // stage upkeep: gems level up with the hero (to what each ladder allows)
    const skills = (s.loadout.skills as { sid: number; level: number }[]).map((g) => ({ ...g, level: Math.max(g.level, gemLevelAt(g.sid, level, GEM_LEVEL)) }));
    if (level > K.startLevel) notes.push(`L${level}: gems raised to the hero-level limit`);
    s = { ...s, level, loadout: { ...s.loadout, skills } };
    f = (await ev.run(s.loadout, [], ctxOfState(s))).figure;
    if (f.stop) { const why = `L${level} ${s.skill} leg cannot be priced yet: ${f.stop}`; mem.notCalculable.add(why); notes.push(why); break; }
    if (!(await advance())) break;
    mem.scores.clear(); mem.since = 0;   // scores of the last stage are no upper bound on this one (new level, new points, new prices)
    if (s.skill === 'iceShot' && (f.kill >= K.switchAt || stalls >= STALL_STAGES) && !overBudget(K, t0, ev)) await trySwitch(level);
    if (halted) break;
    // on the known build's path the new points go to the target page, re-fitted to the level (one figure, not a point-by-point search)
    if (s.skill === 'hoa' && K.hoaTarget) {
      const tp = targetPage(s, level), have = Object.values((s.loadout.talents ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0);
      if (tp.points > have) {
        const pp = prismOf(s.loadout), e = await ev.run(s.loadout, [...tp.changes, ...(pp ? [pp] : [])], ctxOfState(s));   // the page change drops the prism's resolved entries: put back
        if (!e.figure.stop) { s = { ...s, loadout: e.loadout }; f = e.figure; notes.push(`L${level}: the target talent page re-fitted to ${tp.points} points`); }
      }
    }
    // the level-up's new talent points are spent at once, free and ungated: one point is worth less than the churn gate
    const spent = s.skill === 'hoa' && K.hoaTarget ? { taken: [] as Move[], state: s, figure: f } : await spendFree(s, ev, talentPointMoves, ctxOf(s), K, f, mem);
    if (spent.taken.length) { const per = new Map<number, number>();
      for (const m of spent.taken) for (const c of m.changes as { kind: string; node?: number }[]) if (c.kind === 'talent') per.set(c.node!, (per.get(c.node!) ?? 0) + 1);
      notes.push(`L${level}: ${spent.taken.length} new talent point(s) spent: ${[...per].map(([n, p]) => `${talentName(n)} (+${p})`).join(', ')}`); s = spent.state; f = spent.figure; }
    const before = steps.length, last = level + K.stageStep > K.endLevel;
    lastLevel = level; if (stalls === 0) stageReasons = mem.notCalculable.size;   // the reasons since the last stage that found a step
    // the last stage keeps going toward the goal: the last boss at the damage lock
    for (let n = 0; n < (last && s.skill === 'hoa' ? Math.max(K.stepsPerStage, K.finalSteps) : K.stepsPerStage); n++) {
      if (overBudget(K, t0, ev)) { stopped = true; break; }
      if (s.skill === 'hoa' && ti === targets.length - 1 && lockBound(f)) {
        endLeg(`goal reached: ${bossName(targets[ti])} is lock-bound (more damage no longer kills it faster; ${secs(killTime(f))} to kill)`);
        notes.push(`L${level}: ${legs[legs.length - 1].end}`); goal = true;
        break;
      }
      // the Ice Shot leg ends at switchAt: the switch follows at once, at this level; until it can, no more Ice Shot upgrades
      if (capped() && (tried === level || !(await trySwitch(level)))) {
        notes.push(`L${level}: the Ice Shot leg reached ${f.kill.toExponential(2)} (switchAt ${K.switchAt.toExponential(1)}): no more Ice Shot upgrades until the switch can be taken`);
        break;
      }
      const ctx = ctxOf(s);
      const r = await step(s, f, ev, gen(s.skill).acq, gen(s.skill).recon, ctx, K, mem, s.skill === 'hoa' && K.hoaTarget ? undefined : talentPointMoves);
      ctx.notSearched.forEach((x) => notSearched.add(x));
      if (!r) break;
      if (level < 93) r.step.notes = [...(r.step.notes ?? []), 'talent points assumed'];
      steps.push(r.step); s = r.state; f = r.step.after;
      if (!(await advance())) { halted = true; break; }
      onStep?.(snap({ partialRun: true }));
    }
    if (halted) break;
    if (stopped || overBudget(K, t0, ev)) { stopped = true; break; }
    if (K.stepsPerStage > 0) stalls = steps.length === before ? stalls + 1 : 0;
    // acquisitions nobody sells: what they would add, never ranked (none for an Ice Shot leg that has ended)
    const ctx = ctxOf(s);
    const cands = capped() ? [] : unpricedAcquisitions(gen(s.skill).acq, s, ctx);
    const evs = await Promise.all(cands.map((m) => ev.run(s.loadout, m.changes, ctxOfState(s, m.skill ?? s.skill))));
    ctx.notSearched.forEach((x) => notSearched.add(x));
    cands.map((m, i) => ({ m, e: evs[i].figure }))
      .filter(({ m, e }) => rankableMove(m, f, e) && e.kill > f.kill).sort((a, b) => b.e.kill - a.e.kill).slice(0, K.topK)
      .forEach(({ m, e }) => unpriced.push(`L${level} not on the market / unpriced: ${m.label}: ${pct(f, e)} if you get it`));
    onStep?.(snap({ partialRun: true }));
  }
  if (mem.unpriced.size) unpriced.push(`${mem.unpriced.size} distinct acquisitions had no price; the best ${K.topK} per stage are listed above`);
  // a plan that ran out of upgrades the model can price fully says so, with the reason its last stage gave most often
  if (!stopped && !halted && !goal && !legs[legs.length - 1].end) {
    const count = new Map<string, number>();
    for (const r of [...mem.notCalculable].slice(stageReasons)) { const k = pieceKey(/: (?:dropped|stopped:) (.*)$/.exec(r)?.[1] ?? r).slice(0, 140); count.set(k, (count.get(k) ?? 0) + 1); }
    const top = [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
    endLeg(`the plan ends here at L${lastLevel}${s.skill === 'hoa' ? ` with ${bossName(targets[ti])} dying in ${secs(killTime(f))}` : ''}: no upgrade the model can price fully raises the kill speed${top ? ` (most often: ${top})` : ''}`);
  }
  // the bosses after the one the plan ended on: a tab each, the plan's last build priced on it
  if (s.skill === 'hoa' && !halted) for (let j = ti + 1; j < targets.length; j++) {
    const g = (await ev.run(s.loadout, [], ctxOfState({ ...s, target: targets[j] }))).figure;
    legs.push({ skill: 'hoa', target: targets[j], firstStep: steps.length, start: g, reached: false, build: buildSheet(s.loadout),
      end: `not reached: the ${stopped ? 'run stopped' : 'plan ends'} on ${bossName(targets[ti])}; ${g.stop ? `the last build cannot be priced on ${bossName(targets[j])}: ${g.stop}` : `with its last build ${bossName(targets[j])} dies in ${secs(killTime(g))}`}` });
  }
  // the last build on every boss: what it does to each, stated (no figure here is inferred)
  const final = s.skill === 'hoa' && !halted
    ? await Promise.all(targets.map(async (t) => ({ target: t, figure: (await ev.run(s.loadout, [], ctxOfState({ ...s, target: t }))).figure }))) : undefined;
  return { ...snap(stopped ? { stoppedBy: 'budget' } : {}), ...(final ? { final } : {}) };
}

/** every legal acquisition at `s`, priced or not, that raises the kill average, with its exact figure (best gain first); the path's first step prices
 *  the same changes, so the memo answers it */
export async function nextBuys(s: State, ev: Evaluator, acq: Generator[], ctx: GenCtx, f: Figure): Promise<NextBuy[]> {
  const seen = new Set<string>();
  const ms = acq.flatMap((g) => g(s, ctx)).filter((m) => m.minLevel <= s.level && !seen.has(JSON.stringify(m.changes)) && !!seen.add(JSON.stringify(m.changes)));
  const evs = await Promise.all(ms.map((m) => ev.run(s.loadout, m.changes, ctxOfState(s, m.skill ?? s.skill))));
  const had = new Set(f.partial.map(pieceKey));   // the start's omissions are said once, on the start; a row names only its new ones
  return ms.map((m, i) => ({ m, e: evs[i].figure })).filter(({ e }) => !e.stop && e.kill > f.kill)
    .map(({ m, e }): NextBuy => { const extra = e.partial.filter((p) => !had.has(pieceKey(p)));
      return { label: m.label, kind: m.kind, gain: e.kill / f.kill, kill: e.kill, costFE: m.costFE,
        ...(m.market ? { market: m.market } : {}), ...(m.buy ? { buy: m.buy } : {}), ...(extra.length ? { partial: extra } : {}) }; })
    .sort((a, b) => b.gain - a.gain);
}

/** A real build the model stops on is priced without the pieces that stop it: up to four rounds, each leaves out the first piece (a non-main skill with its
 *  supports, a pactspirit with its contract points, a non-weapon gear item, a slate, a kismet, the hero memories) whose removal clears the stop or moves it on;
 *  each one is named in `out`. The main skill, the weapon and the traits are never left out. */
/** Crafting a rare you wear, as it is done: roll, keep a result worth it (rollPlans). Per item and ember: every outcome priced on the build, then the keep-list
 *  (the best outcomes first) that buys the most damage per FE - expected crafts 1 / P(any kept), expected gain the outcomes' chance-weighted mean. */
async function rollAdvice(ev: Evaluator, state: State, ctx: GenCtx, base: Figure, books: PriceBook): Promise<NextBuy[]> {
  const out: NextBuy[] = [];
  for (const plan of rollPlans(state, ctx)) {
    const price = books.price(plan.ember, state.level);
    if (price === null) continue;
    const r = await Promise.all(plan.outcomes.map(async (o) => ({ o, g: (await ev.run(state.loadout, o.changes, ctxOfState(state))).figure })));
    const good = r.filter((x) => !x.g.stop && rankable(base, x.g) && x.g.kill > base.kill).map((x) => ({ ...x, gain: x.g.kill / base.kill })).sort((a, b) => b.gain - a.gain);
    let best: { k: number; eg: number; cost: number; crafts: number; score: number } | undefined, P = 0, PG = 0;
    good.forEach((x, i) => {
      P += x.o.p; PG += x.o.p * x.gain;
      const eg = PG / P, crafts = 1 / P, cost = crafts * plan.perCraft * price, score = Math.log(eg) / Math.max(cost, 1e-9);
      if (eg > 1.005 && (!best || score > best.score)) best = { k: i + 1, eg, cost, crafts, score };
    });
    if (!best) continue;
    const b = best as { k: number; eg: number; cost: number; crafts: number }, keep = good.slice(0, b.k);
    out.push({ kind: 'craft', label: `Craft on ${plan.slot} with ${plan.ember} (${plan.perCraft} per craft): keep any of ${b.k} result${b.k === 1 ? '' : 's'} - ${keep.slice(0, 4).map((x) => x.o.label).join('; ')}${b.k > 4 ? '; or another of the list' : ''} - about ${Math.ceil(b.crafts)} crafts`,
      gain: b.eg, kill: base.kill * b.eg, costFE: b.cost, buy: { name: plan.ember, qty: b.crafts * plan.perCraft } });
  }
  return out;
}

/** the uniques among your items: an item whose modifier groups hold one of every key of a config_item_gold row on its base; `worn`: the gear you have on
 *  (slot -> name), else the bag and stash */
export function ownedUniques(state: State, worn = false): Map<string, string> {
  const gold = table<{ rows: Record<string, Record<string, unknown> & { i8: number }> }>('config_item_gold').rows, lang = table<{ rows: Record<string, string> }>('lang_en').rows;
  const KEYS = ['m88', 'ma8', 'mc8', 'me8', 'm108', 'm128', 'm148', 'm168'], out = new Map<string, string>();
  const items = worn ? ((state.loadout.gear ?? []) as { slot: string; baseId: number; affixes?: { id: number }[] }[]).map((g) => ({ key: g.slot, baseId: g.baseId, ids: (g.affixes ?? []).map((a) => a.id) }))
    : state.owned.map((o) => ({ key: o.itemId, baseId: o.baseId, ids: Object.values((o.modifiers ?? {}) as Record<string, { id: number }[]>).flat().map((m) => m.id) }));
  for (const o of items) {
    const groups = new Set(o.ids.map((id) => Math.floor(id / 10)));
    const hit = Object.entries(gold).find(([, r]) => r.i8 === o.baseId && (() => { const ks = KEYS.map((k) => Object.keys((r[k] ?? {}) as object).map(Number)).filter((x) => x.length);
      return ks.length > 0 && ks.every((x) => x.some((y) => groups.has(y))); })());
    const name = hit && lang[`item_gold|name|${hit[0]}`];
    if (name) out.set(o.key, name);
  }
  return out;
}

async function priceable(ev: Evaluator, state: State, out: string[]): Promise<State> {
  type L = Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
  const lang = () => table<{ rows: Record<string, string> }>('lang_en').rows;
  for (let round = 0; round < 4; round++) {
    const l = state.loadout as L, f = (await ev.run(l, [], ctxOfState(state))).figure;
    if (!f.stop) break;
    const own = (k: string, sl: number) => (x: L) => (x.place.kind === k && x.place.slot === sl) || (x.place.ownerKind === k && x.place.ownerSlot === sl);
    const cands: { label: string; loadout: L }[] = [
      ...(l.skills ?? []).filter((x: L) => x.place.kind !== 'support' && !(x.place.kind === 'active' && x.place.slot === 0))
        .map((x: L) => ({ label: `your ${x.place.kind} skill ${x.name ?? x.sid} with its supports`, loadout: { ...l, skills: l.skills.filter((y: L) => !own(x.place.kind, x.place.slot)(y)) } })),
      ...(l.pacts ?? []).map((p: L) => ({ label: `your pactspirit ${lang()[`servant|name|${p.servantId}`] ?? p.servantId} (slot ${p.slot})`,
        loadout: { ...l, pacts: l.pacts.filter((q: L) => q !== p), contractKeys: (l.contractKeys ?? []).filter((k: number) => Math.floor(k / 100) !== p.slot) } })),
      ...(l.gear ?? []).filter((g: L) => g.slot !== 'mainHand').map((g: L) => ({ label: `your ${g.slot} ${g.label}`, loadout: { ...l, gear: l.gear.filter((h: L) => h !== g) } })),
      ...(l.slateItems ?? []).map((x: L, i: number) => ({ label: `your slate ${i + 1}`, loadout: { ...l, slateItems: l.slateItems.filter((y: L) => y !== x) } })),
      ...(l.kismets ?? []).map((x: L, i: number) => ({ label: `your kismet ${i + 1}`, loadout: { ...l, kismets: l.kismets.filter((y: L) => y !== x) } })),
      ...((l.heroMemories ?? []).length ? [{ label: 'your hero memories', loadout: { ...l, heroMemories: [] } }] : []),
    ];
    const tried = await Promise.all(cands.map(async (c) => ({ c, g: (await ev.run(c.loadout, [], ctxOfState(state))).figure })));
    const hit = tried.find((t) => !t.g.stop) ?? tried.find((t) => t.g.stop !== f.stop);
    if (!hit) break;
    out.push(`left out of every figure: ${hit.c.label}: the model stops on it (${f.stop})`);
    state = { ...state, loadout: hit.c.loadout };
  }
  return state;
}

/** The planned switch on an Ice Shot character, on `target`: the switch move (weapon, Hammer of Ash and its supports, Ruinous Star, the target page), the target
 *  build's skills when the page needs them (Fixate needs Timid), a piece that stops only on the boss left out and named; the Hammer of Ash state it leaves. */
async function switchOn(ev: Evaluator, state: State, ctx: GenCtx, target: string): Promise<{ state: State; label: string; costFE: number | null; figure: Figure } | undefined> {
  const hoa: State = { ...state, skill: 'hoa', target }, m = switchWithPage(state, ctx);
  if (!m) return undefined;
  let e = await ev.run(state.loadout, m.changes, ctxOfState(hoa)), label = m.label, cost = m.costFE;
  const skills = e.figure.stop ? targetMoves({ ...hoa, loadout: e.loadout }, ctx).find((x) => x.label.startsWith('Target skills: all')) : undefined;
  if (skills) {
    const e2 = await ev.run(e.loadout, skills.changes, ctxOfState(hoa));
    // the skills clear the page's need; what still stops is a piece that stops only on the boss (left out below)
    if (!e2.figure.stop || !/no Timid|has no/.test(e2.figure.stop)) { e = e2; label = `${label}; with the target build's skills (${skills.label.replace(/^Target skills: all \d+ remaining groups \((.*)\)$/, '$1')}${skills.costNote ? `; ${skills.costNote}` : ''})`; cost = cost === null || skills.costFE === null ? null : cost + skills.costFE; }
  }
  let loadout = e.loadout;
  // a piece that prices on the dummy can stop on the boss (Preserver of Eternity's when-hit count): left out of the switch's figure, named
  if (e.figure.stop) {
    const out: string[] = [], s2 = await priceable(ev, { ...hoa, loadout: e.loadout }, out);
    if (out.length) { e = await ev.run(s2.loadout, [], ctxOfState(hoa)); loadout = s2.loadout; label = `${label} (on ${bossName(target)}, ${out.map((x) => x.replace(/^left out of every figure: /, '').replace(/: the model stops on it .*$/, '')).join(', ')} left out: the model cannot price ${out.length === 1 ? 'it' : 'them'} there)`; }
  }
  return { state: { ...hoa, loadout }, label, costFE: cost, figure: e.figure };
}

export async function runAdvise(ev: Evaluator, state: State, k: Partial<Knobs> = {}, prices?: PriceBook, onStep?: (out: GuideOut) => void): Promise<GuideOut> {
  const K = { ...DEFAULT_KNOBS, ...k };
  const books = prices ?? snapshotBook(localItems());
  const acq0 = [ownedGear, ...ALL.map(only(true))], recon = ALL.map(only(false));
  const base = { mode: 'advise' as const, pin: ev.pin, etor: { season: books.season, fetchedAt: books.fetchedAt }, knobs: { ...K, fight: ev.fight, fightNote: ev.fightNote, rollBudget: ev.rollBudget, target: ev.target, fe: state.fe, level: state.level, skill: state.skill },
    character: { level: state.level, skill: state.skill, fe: state.fe, owned: state.owned.length,
      gear: ((state.loadout.gear ?? []) as { slot?: string; label: string }[]).map((g) => ({ slot: g.slot ?? '', label: g.label })) } };
  // Hammer of Ash: the first boss (in order) the character does not kill within moveOnSeconds; the last boss when it kills them all
  const targets = K.targets ?? BOSS_ORDER, moveOn = K.moveOnSeconds ?? 10, passed: string[] = [];
  const leftOut: string[] = [], before = state.loadout as { pacts?: { slot?: number }[]; gear?: { slot?: string }[] };
  state = await priceable(ev, state, leftOut);
  // (after the pieces that stop the figure are left out: a stopped figure applies no change)
  // Hammer of Ash focus (user, 2026-10-16: "focus completely on switching to hammer of ash"): an Ice Shot character is planned as if switched now; the
  // switch is the plan's own card and everything after it (respec, next buys) is Hammer of Ash on the first boss
  if (K.focusHoa && state.skill === 'iceShot') {
    const ctx = { prices: books, level: state.level, notSearched: new Set<string>() }, r = await switchOn(ev, state, ctx, targets[0]);
    if (r) {
      const sw = { label: r.label, costFE: r.costFE, target: targets[0], figure: r.figure };
      const ice = { ...((state.loadout.talents ?? {}) as Record<string, number>) }, iceTrees = [...new Set(Object.keys(ice).filter((n) => ice[n] > 0).map((n) => treeName(treeOf(+n))))];
      const page = (o: GuideOut): GuideOut['respec'] => ({ trees: (o.respec?.trees ?? talentTrees(r.state.loadout)).filter((t) => t.points > 0), before: ice, title: 'Your Hammer of Ash talent page',
        note: `Reset ${iceTrees.join(', ')} and take this page (a respec is free at level ${FREE_RESPEC_LEVEL} and below)${o.respec ? ': the target build’s page fitted to your gear' : ': the target build’s page'}.` });
      const tag = (o: GuideOut): GuideOut => ({ ...o, switch: sw, respec: page(o), startNotes: [`The plan below is after your Hammer of Ash switch (the card above): your Ice Shot gear stays on, the bow is replaced.`, ...leftOut, ...(o.startNotes ?? [])] });
      return tag(await runAdvise(ev, { ...r.state, fe: state.fe }, { ...k, focusHoa: false }, prices, onStep && ((o) => onStep(tag(o)))));
    }
  }
  // a piece left out cannot be compared with: no move replaces it (its slot's figure is measured empty, so any swap would look like a gain)
  const after = state.loadout as typeof before;
  const outPacts = new Set((before.pacts ?? []).filter((p) => !(after.pacts ?? []).includes(p)).map((p) => p.slot));
  const outGear = new Set((before.gear ?? []).filter((g) => !(after.gear ?? []).includes(g)).map((g) => g.slot));
  type Ch = { kind: string; slot?: number | string; changes?: Ch[] };
  const slotsOf = (cs: Ch[]): Ch[] => cs.flatMap((c) => (c.kind === 'multi' ? slotsOf(c.changes ?? []) : [c]));
  const touchesOut = (m: Move) => slotsOf(m.changes as Ch[]).some((c) => (c.kind === 'pact' && outPacts.has(c.slot as number)) || (c.kind === 'gear' && outGear.has(c.slot as string)));
  let first = await ev.run(state.loadout, [], ctxOfState(state));
  if (state.skill === 'hoa') for (const t of targets) {
    state = { ...state, target: t };
    first = await ev.run(state.loadout, [], ctxOfState(state));
    if (first.figure.stop || killTime(first.figure) > moveOn || t === targets.at(-1)) break;
    passed.push(`${bossName(t)} dies in ${secs(killTime(first.figure))}`);
  }
  const legs: Leg[] = [{ skill: state.skill, target: state.target ?? null, firstStep: 0, start: first.figure }];
  if (first.figure.stop) {
    return { ...base, legs, start: first.figure, inputs: first.inputs, steps: [], notSearched: [], unpriced: [],
      notCalculable: [`${state.skill}${state.target ? ` on ${bossName(state.target)}` : ''} cannot be priced yet: ${first.figure.stop}`] };
  }
  const acq = acq0.map((g): Generator => (st, c) => g(st, c).filter((m) => !touchesOut(m)));
  const startNotes = [...leftOut, ...(passed.length ? [`${passed.join(', ')} (under ${moveOn} s): the advice is for ${bossName(state.target!)}`] : [])];
  const ctxOf = (s: State): GenCtx => ({ prices: books, level: s.level,
    notSearched: new Set(s.skill === 'iceShot' ? ['switch to Hammer of Ash: planned in the ideal guide, not searched for an Ice Shot character'] : CULL_NOT_COUNTED) });
  // a talent respec is free at level 90 and below (user, 2026-10-16): the character's own page and its best whole-page variants (a tree raised to a core's
  // need with that core, or swapped for a tree of its role) are each re-fitted by point and core moves while they help (no churn gate); the best is shown
  // as the first step and the next buys are priced on it. A core an item already grants counts once (CT1: Howling Wind's Gale)
  let respec: Step | undefined, respecView: GuideOut['respec'];
  if (state.level <= FREE_RESPEC_LEVEL) {
    const ctx = ctxOf(state), K0 = { ...K, churn: 0, maxRounds: RESPEC_ROUNDS };   // a swapped tree needs many points moved
    // a node whose points price at exactly 0 is one the model cannot see (Prophet's Frozen-target nodes: the dummy is never Frozen in the figure), not a
    // worthless one: the respec never takes points from it (user, 2026-10-16: "are you undervaluing cold infiltration?")
    const held = Object.entries((state.loadout.talents ?? {}) as Record<string, number>).filter(([, p]) => p > 0).map(([k]) => +k);
    const zero = await Promise.all(held.map(async (n) => ((f) => !f.stop && f.kill === first.figure.kill)((await ev.run(state.loadout, [{ kind: 'talent', node: n, points: 0 }], ctxOfState(state))).figure)));
    const locked = new Set(held.filter((_, i) => zero[i]));
    if (locked.size) startNotes.push(`Talent nodes the respec keeps as you have them (the model prices them at 0, so it cannot judge them): ${[...locked].map((n) => talentName(n)).join('; ')}`);
    const refit: Generator = (st, c) => talentMovesWith({ maxShifts: 60, locked })(st, c).filter((m) => !m.label.startsWith('Swap talent tree'));
    const pages = talentMovesWith({ maxShifts: 0, pages: true, locked })(state, ctx);
    const evs = await Promise.all(pages.map((m) => ev.run(state.loadout, m.changes, ctxOfState(state))));
    const top = pages.map((m, i) => ({ m, e: evs[i] })).filter((x) => rankable(first.figure, x.e.figure)).sort((a, b) => b.e.figure.kill - a.e.figure.kill);
    startNotes.push(`Talent pages tried for the free respec (before re-fitting the points): ${top.slice(0, 8).map((x) => `${x.m.label} x${(x.e.figure.kill / first.figure.kill).toFixed(2)}`).join('; ')}`);
    const tries = await Promise.all([resolve(state, ev, [refit], ctx, K0, first.figure, newMem()),
      ...top.slice(0, RESPEC_PAGES).map(async ({ m, e }) => { const r = await resolve({ ...state, loadout: e.loadout }, ev, [refit], ctx, K0, e.figure, newMem()); return { ...r, taken: [m, ...r.taken] }; })]);
    startNotes.push(`Each re-fitted (your page first): ${tries.map((t, i) => `${i ? top[i - 1].m.label : 'your page'} x${(t.figure.kill / first.figure.kill).toFixed(2)}`).join('; ')}`);
    const r = tries.sort((a, b) => b.figure.kill - a.figure.kill)[0], page = pages.includes(r.taken[0]) ? r.taken[0] : undefined;
    if (r.taken.length && r.figure.kill > first.figure.kill) {
      const moves = r.taken.length - (page ? 1 : 0);
      respec = { level: state.level, move: { kind: 'talent', label: `Free talent respec (level ${FREE_RESPEC_LEVEL} and below): ${page ? `${page.label}, then ` : ''}${moves} point or core move${moves === 1 ? '' : 's'}`,
        acquisition: false, costFE: 0, minLevel: 0, changes: [] }, triggered: r.taken, before: first.figure, after: r.figure, cumFE: 0 };
      const before = { ...((state.loadout.talents ?? {}) as Record<string, number>) };
      respecView = { trees: talentTrees(r.state.loadout, [...new Set(Object.keys(before).filter((n) => before[n] > 0).map((n) => treeOf(+n)))]), before };
      state = r.state; first = { ...first, figure: r.figure };
    }
  }
  const slates = await slateWants(ev, state, first.figure);
  // an Ice Shot character at the planned switch's level: the switch on this character, priced on the first boss (its own card: a boss figure does not rank
  // against the dummy's)
  let sw: GuideOut['switch'];
  if (state.skill === 'iceShot') {
    const ctx = ctxOf(state), r = await switchOn(ev, state, ctx, targets[0]);
    if (r) sw = { label: r.label, costFE: r.costFE, target: targets[0], figure: r.figure };
    else startNotes.push(`Hammer of Ash switch: ${[...ctx.notSearched].find((x) => /switch waits/.test(x)) ?? 'not offered yet'}`);
  }
  // one pactspirit per battle slot: the best (every owned one is priced; a list of near-equal swaps is noise)
  const best = new Map<string, number>();
  const all = await nextBuys(state, ev, acq, ctxOf(state), first.figure);
  for (const n of all) { const sl = n.kind === 'pact' && /in battle slot (\d)/.exec(n.label)?.[1]; if (sl && n.gain > (best.get(sl) ?? -Infinity)) best.set(sl, n.gain); }
  // one row per socket (its supports are alternatives, the others listed under it), and a gem in one socket only (its best)
  const gem = (n: NextBuy) => (n.kind === 'support' ? /: (?:.* -> |add )(.+)$/.exec(n.label)?.[1] : undefined), bestGem = new Map<string, number>();
  for (const n of all) { const g = gem(n); if (g && n.gain > (bestGem.get(g) ?? -Infinity)) bestGem.set(g, n.gain); }
  const sock = (n: NextBuy) => (n.kind === 'support' ? /^(.* socket \d+):/.exec(n.label)?.[1] : undefined);
  const inSocket = (k: string) => all.filter((n) => sock(n) === k && n.gain > 1.005 && n.gain === bestGem.get(gem(n)!)).sort((a, b) => b.gain - a.gain);
  // a unique you already own is never a buy (yours may price lower only where the model cannot read its roll: it is named instead)
  const own = new Set(ownedUniques(state).values()), wearing = ownedUniques(state, true);
  const seenGem = new Set<string>();   // ties (the same gain in two sockets): the first
  const next = [...all.filter((n) => { const sl = n.kind === 'pact' && /in battle slot (\d)/.exec(n.label)?.[1], g = gem(n);
    if (g && (n.gain !== bestGem.get(g) || seenGem.has(g))) return false;
    if (g && inSocket(sock(n)!)[0] !== n) return false;
    if (g) seenGem.add(g);
    const u = /^Unique (.+) in \w+$/.exec(n.label)?.[1];
    if (u && n.costFE === null) return false;   // a legendary nobody lists this season may not exist in it (user, 2026-10-16: Howling Ring, Endless Night - Prototype)
    if (u && [...wearing.values()].includes(u)) return false;   // you wear it: a row would read as buy one (its gain is your roll against a middle roll)
    if (u && own.has(u)) { if (!startNotes.some((x) => x.includes(`have ${u} `))) startNotes.push(`you have ${u} in your inventory: wear it rather than buy one`); return false; }
    return !sl || n.gain === best.get(sl); }).map((n) => (sock(n) ? { ...n, alts: inSocket(sock(n)!).slice(1).map((a) => ({ label: gem(a)!, gain: a.gain, costFE: a.costFE })) } : n)), ...await rollAdvice(ev, state, ctxOf(state), first.figure, books)].sort((a, b) => b.gain - a.gain);
  const bought = Object.fromEntries(next.filter((n) => n.buy).map((n) => [n.buy!.name, books.price(n.buy!.name, state.level)]));
  const withNext = { ...base, legs, startNotes, next, prices: bought, ...(slates.length ? { slates } : {}), ...(sw ? { switch: sw } : {}), ...(respecView ? { respec: respecView } : {}) };
  onStep?.({ ...withNext, knobs: { ...base.knobs, partialRun: true }, inputs: first.inputs, start: first.figure, steps: [], notSearched: [], unpriced: [], notCalculable: [] });
  const { stoppedBy, ...r } = await path(state, ev, acq, recon, ctxOf, K,
    onStep && ((p) => onStep({ ...withNext, knobs: { ...base.knobs, partialRun: true }, inputs: first.inputs, ...p } as GuideOut)));
  return { ...withNext, ...(stoppedBy ? { knobs: { ...base.knobs, stoppedBy } } : {}), inputs: first.inputs, ...r, start: legs[0].start, steps: [...(respec ? [respec] : []), ...r.steps] } as GuideOut;
}
