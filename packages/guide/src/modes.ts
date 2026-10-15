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
import { switchWithPage } from './candidates/switch';
import { targetMoves } from './candidates/target';
import { talentMoves, talentPointMoves } from './candidates/talents';
import { traitMoves } from './candidates/traits';
import { type EtorHistory, type EtorItems, historyBook, snapshotBook } from './pricing';
import { DEFAULT_KNOBS, type Knobs, newMem, overBudget, path, rankableMove, resolve, spendFree, step, switchNote } from './search';
import { ICE_SHOT_INPUTS, idealStartNotes } from './start';
import { setTalentPoints } from './talentRules';
import { talentName } from './names';
import type { Evaluator, Figure, GenCtx, Generator, GuideOut, Move, PriceBook, State, Step } from './types';

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
}
export const DEFAULT_IDEAL: IdealKnobs = { ...DEFAULT_KNOBS, stepsPerStage: 25, startLevel: 60, endLevel: 100, stageStep: 5, talentPoints: 108, switchAt: 2e8, switchRounds: 5 };

// the Ice Shot -> Hammer of Ash switch is planned (`switchWithPage`), never a greedy step: its figure is against the boss, the Ice Shot leg's the dummy
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

export async function runIdeal(ev: Evaluator, k: Partial<IdealKnobs> = {}, prices?: PriceBook, onStep?: (out: GuideOut) => void): Promise<GuideOut> {
  const K = { ...DEFAULT_IDEAL, ...k };
  setTalentPoints(K.talentPoints);
  try { return await ideal(ev, K, prices, onStep); } finally { setTalentPoints(DEFAULT_IDEAL.talentPoints); }
}

async function ideal(ev: Evaluator, K: IdealKnobs, prices: PriceBook | undefined, onStep?: (out: GuideOut) => void): Promise<GuideOut> {
  const t0 = Date.now();
  const books = prices ?? historyBook(localItems(), localHistory());
  const acq = ALL.map(only(true)), recon = ALL.map(only(false));
  const ctxOf = (s: State): GenCtx => ({ prices: books, level: s.level, notSearched: new Set() });
  const start = idealStartNotes(K.startLevel);
  let s: State = { ...start.state, level: K.startLevel };
  const notes = [...start.notes];
  const out = (o: Partial<GuideOut>): GuideOut => ({
    mode: 'ideal', pin: ev.pin, etor: { season: books.season, fetchedAt: books.fetchedAt }, knobs: { ...K, fight: ev.fight, fightNote: ev.fightNote, rollBudget: ev.rollBudget, target: ev.target }, startNotes: notes, steps: [], notSearched: [], unpriced: [], notCalculable: [], ...o,
  }) as GuideOut;

  const first = await ev.run(s.loadout, [], { level: s.level, skill: s.skill });
  const inputs = { ...first.inputs, ...(s.skill === 'iceShot' ? { iceShot: { ...ICE_SHOT_INPUTS, ...(first.inputs as Record<string, any> | undefined)?.iceShot, status: 'unverified' } } : {}) };   // eslint-disable-line @typescript-eslint/no-explicit-any
  if (first.figure.stop) {
    const why = `L${s.level} ${s.skill} leg cannot be priced yet: ${first.figure.stop}`;
    notes.push(why);
    return out({ start: first.figure, inputs, notCalculable: [why] });
  }
  const mem = newMem(), steps: Step[] = [], notSearched = new Set<string>(), unpriced: string[] = [];
  let f = first.figure, stopped = false, stalled = false;
  /** the output so far; callers pass `partialRun` until the run completes */
  const snap = (extra: Record<string, unknown>) => out({ start: first.figure, inputs, steps: [...steps], notSearched: [...notSearched], unpriced: [...unpriced], notCalculable: [...mem.notCalculable],
    knobs: { ...K, fight: ev.fight, fightNote: ev.fightNote, rollBudget: ev.rollBudget, target: ev.target, ...extra } });
  for (let level = K.startLevel; level <= K.endLevel; level += K.stageStep) {
    // stage upkeep: gems level up with the hero (to what each ladder allows)
    const skills = (s.loadout.skills as { sid: number; level: number }[]).map((g) => ({ ...g, level: Math.max(g.level, gemLevelAt(g.sid, level, GEM_LEVEL)) }));
    if (level > K.startLevel) notes.push(`L${level}: gems raised to the hero-level limit`);
    s = { ...s, level, loadout: { ...s.loadout, skills } };
    f = (await ev.run(s.loadout, [], { level, skill: s.skill })).figure;
    if (f.stop) { const why = `L${level} ${s.skill} leg cannot be priced yet: ${f.stop}`; mem.notCalculable.add(why); notes.push(why); break; }
    mem.scores.clear(); mem.since = 0;   // scores of the last stage are no upper bound on this one (new level, new points, new prices)
    if (s.skill === 'iceShot' && (f.kill >= K.switchAt || stalled) && !overBudget(K, t0, ev)) {
      const ctx = ctxOf(s), m = switchWithPage(s, ctx);
      ctx.notSearched.forEach((x) => notSearched.add(x));
      const e = m && m.costFE !== null ? await ev.run(s.loadout, m.changes, { level, skill: 'hoa' }) : null;
      if (e?.figure.stop) { const why = `L${level} planned switch cannot be priced yet: ${e.figure.stop}`; mem.notCalculable.add(why); notes.push(why); }
      else if (m && e) {
        const r = await resolve({ ...s, loadout: e.loadout, skill: 'hoa', fe: s.fe - m.costFE! }, ev, recon, ctx, { ...K, churn: 0, maxRounds: K.switchRounds }, e.figure, mem);
        const sp = await spendFree(r.state, ev, talentPointMoves, ctx, K, r.figure, mem);
        mem.cumFE += m.costFE!;
        const why = f.kill >= K.switchAt ? `the Ice Shot leg reached ${f.kill.toExponential(2)} (switchAt ${K.switchAt.toExponential(0)})` : 'the Ice Shot leg stalled (no step last stage)';
        steps.push({ level, move: m, triggered: [...r.taken, ...sp.taken], before: f, after: sp.figure, cumFE: mem.cumFE,
          notes: [`planned switch: ${why}; the kill average may drop here${sp.figure.target ? `; from here figures are against ${sp.figure.target}, not the Ice Shot leg's dummy` : ''}`, ...switchNote(f, sp.figure), ...(level < 93 ? ['talent points assumed'] : [])] });
        s = sp.state; f = sp.figure;
        onStep?.(snap({ partialRun: true }));
      }
    }
    // the level-up's new talent points are spent at once, free and ungated: one point is worth less than the churn gate
    const spent = await spendFree(s, ev, talentPointMoves, ctxOf(s), K, f, mem);
    if (spent.taken.length) { const per = new Map<number, number>();
      for (const m of spent.taken) for (const c of m.changes as { kind: string; node?: number }[]) if (c.kind === 'talent') per.set(c.node!, (per.get(c.node!) ?? 0) + 1);
      notes.push(`L${level}: ${spent.taken.length} new talent point(s) spent: ${[...per].map(([n, p]) => `${talentName(n)} (+${p})`).join(', ')}`); s = spent.state; f = spent.figure; }
    const before = steps.length;
    const capped = () => s.skill === 'iceShot' && f.kill >= K.switchAt;
    if (capped()) notes.push(`L${level}: the Ice Shot leg reached ${f.kill.toExponential(2)} (switchAt ${K.switchAt.toExponential(1)}): no more Ice Shot upgrades; the planned switch waits for the target talent page`);
    for (let n = 0; n < K.stepsPerStage && !capped(); n++) {
      if (overBudget(K, t0, ev)) { stopped = true; break; }
      const ctx = ctxOf(s);
      const r = await step(s, f, ev, acq, recon, ctx, K, mem, talentPointMoves);
      ctx.notSearched.forEach((x) => notSearched.add(x));
      if (!r) break;
      if (level < 93) r.step.notes = [...(r.step.notes ?? []), 'talent points assumed'];
      steps.push(r.step); s = r.state; f = r.step.after;
      onStep?.(snap({ partialRun: true }));
    }
    if (stopped || overBudget(K, t0, ev)) { stopped = true; break; }
    if (K.stepsPerStage > 0 && steps.length === before) stalled = true;   // kept until the switch is taken (it may wait for the page to fit)
    // acquisitions nobody sells: what they would add, never ranked (none for an Ice Shot leg that has ended)
    const ctx = ctxOf(s);
    const cands = capped() ? [] : unpricedAcquisitions(acq, s, ctx);
    const evs = await Promise.all(cands.map((m) => ev.run(s.loadout, m.changes, { level, skill: m.skill ?? s.skill })));
    ctx.notSearched.forEach((x) => notSearched.add(x));
    cands.map((m, i) => ({ m, e: evs[i].figure }))
      .filter(({ m, e }) => rankableMove(m, f, e) && e.kill > f.kill).sort((a, b) => b.e.kill - a.e.kill).slice(0, K.topK)
      .forEach(({ m, e }) => unpriced.push(`L${level} not on the market / unpriced: ${m.label}: ${pct(f, e)} if you get it`));
    onStep?.(snap({ partialRun: true }));
  }
  if (mem.unpriced.size) unpriced.push(`${mem.unpriced.size} distinct acquisitions had no price; the best ${K.topK} per stage are listed above`);
  return snap(stopped ? { stoppedBy: 'budget' } : {});
}

export async function runAdvise(ev: Evaluator, state: State, k: Partial<Knobs> = {}, prices?: PriceBook, onStep?: (out: GuideOut) => void): Promise<GuideOut> {
  const K = { ...DEFAULT_KNOBS, ...k };
  const books = prices ?? snapshotBook(localItems());
  const acq = [ownedGear, ...ALL.map(only(true))], recon = ALL.map(only(false));
  const base = { mode: 'advise' as const, pin: ev.pin, etor: { season: books.season, fetchedAt: books.fetchedAt }, knobs: { ...K, fight: ev.fight, fightNote: ev.fightNote, rollBudget: ev.rollBudget, target: ev.target, fe: state.fe, level: state.level, skill: state.skill },
    character: { level: state.level, skill: state.skill, fe: state.fe, owned: state.owned.length,
      gear: ((state.loadout.gear ?? []) as { slot?: string; label: string }[]).map((g) => ({ slot: g.slot ?? '', label: g.label })) } };
  const first = await ev.run(state.loadout, [], { level: state.level, skill: state.skill });
  if (first.figure.stop) {
    return { ...base, start: first.figure, inputs: first.inputs, steps: [], notSearched: [], unpriced: [],
      notCalculable: [`${state.skill} cannot be priced yet: ${first.figure.stop}`] };
  }
  const { stoppedBy, ...r } = await path(state, ev, acq, recon, (s) => ({ prices: books, level: s.level,
    notSearched: new Set(s.skill === 'iceShot' ? ['switch to Hammer of Ash: planned in the ideal guide, not searched for an Ice Shot character'] : []) }), K,
    onStep && ((p) => onStep({ ...base, knobs: { ...base.knobs, partialRun: true }, inputs: first.inputs, ...p } as GuideOut)));
  return { ...base, ...(stoppedBy ? { knobs: { ...base.knobs, stoppedBy } } : {}), inputs: first.inputs, ...r } as GuideOut;
}
