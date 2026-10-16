/** The two guide modes (spec §3.3): `runIdeal` paths the Bing1 progression from map entry, `runAdvise` advises a live character. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gearMoves, slotsOfBase, whiteBaseMoves } from './candidates/gear';
import { GEM_LEVEL, gemLevelAt, gemMoves } from './candidates/gems';
import { kismetMoves } from './candidates/kismets';
import { memoryMoves } from './candidates/memories';
import { pactMoves } from './candidates/pacts';
import { prismMoves } from './candidates/prisms';
import { slateMoves } from './candidates/slates';
import { switchWithPage, targetPage } from './candidates/switch';
import { targetMoves } from './candidates/target';
import { talentMoves, talentPointMoves } from './candidates/talents';
import { traitMoves } from './candidates/traits';
import { type EtorHistory, type EtorItems, legBooks, LEG_WINDOWS, snapshotBook } from './pricing';
import { CULL_NOT_COUNTED } from './kill';
import { ctxOfState, pieceKey, DEFAULT_KNOBS, type Knobs, newMem, overBudget, path, rankableMove, resolve, spendFree, step, switchNote } from './search';
import { ICE_SHOT_INPUTS, idealStartNotes } from './start';
import { setTalentPoints } from './talentRules';
import { talentName } from './names';
import { buildSheet } from './sheet';
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
export const DEFAULT_IDEAL: IdealKnobs = { ...DEFAULT_KNOBS, stepsPerStage: 25, startLevel: 60, endLevel: 90, stageStep: 5, talentPoints: 108, switchAt: 2e8, switchRounds: 5, finalSteps: 100, hoaTarget: true };
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

export async function runAdvise(ev: Evaluator, state: State, k: Partial<Knobs> = {}, prices?: PriceBook, onStep?: (out: GuideOut) => void): Promise<GuideOut> {
  const K = { ...DEFAULT_KNOBS, ...k };
  const books = prices ?? snapshotBook(localItems());
  const acq = [ownedGear, ...ALL.map(only(true))], recon = ALL.map(only(false));
  const base = { mode: 'advise' as const, pin: ev.pin, etor: { season: books.season, fetchedAt: books.fetchedAt }, knobs: { ...K, fight: ev.fight, fightNote: ev.fightNote, rollBudget: ev.rollBudget, target: ev.target, fe: state.fe, level: state.level, skill: state.skill },
    character: { level: state.level, skill: state.skill, fe: state.fe, owned: state.owned.length,
      gear: ((state.loadout.gear ?? []) as { slot?: string; label: string }[]).map((g) => ({ slot: g.slot ?? '', label: g.label })) } };
  // Hammer of Ash: the first boss (in order) the character does not kill within moveOnSeconds; the last boss when it kills them all
  const targets = K.targets ?? BOSS_ORDER, moveOn = K.moveOnSeconds ?? 10, passed: string[] = [];
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
  const startNotes = passed.length ? [`${passed.join(', ')} (under ${moveOn} s): the advice is for ${bossName(state.target!)}`] : [];
  const ctxOf = (s: State): GenCtx => ({ prices: books, level: s.level,
    notSearched: new Set(s.skill === 'iceShot' ? ['switch to Hammer of Ash: planned in the ideal guide, not searched for an Ice Shot character'] : CULL_NOT_COUNTED) });
  const next = await nextBuys(state, ev, acq, ctxOf(state), first.figure);
  const bought = Object.fromEntries(next.filter((n) => n.buy).map((n) => [n.buy!.name, books.price(n.buy!.name, state.level)]));
  const withNext = { ...base, legs, startNotes, next, prices: bought };
  onStep?.({ ...withNext, knobs: { ...base.knobs, partialRun: true }, inputs: first.inputs, start: first.figure, steps: [], notSearched: [], unpriced: [], notCalculable: [] });
  const { stoppedBy, ...r } = await path(state, ev, acq, recon, ctxOf, K,
    onStep && ((p) => onStep({ ...withNext, knobs: { ...base.knobs, partialRun: true }, inputs: first.inputs, ...p } as GuideOut)));
  return { ...withNext, ...(stoppedBy ? { knobs: { ...base.knobs, stoppedBy } } : {}), inputs: first.inputs, ...r } as GuideOut;
}
