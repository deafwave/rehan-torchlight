/** Applies `changes` in order: each run of consecutive Changes through `applyChanges`, each LoadoutPatch through `applyPatch`. */
import type { LoadoutPatch } from '../patches';
import type { Change, Loadout } from '../types';

export interface Appliers {
  isPatch(c: Change | LoadoutPatch): c is LoadoutPatch;
  applyPatch(lo: Loadout, p: LoadoutPatch): Loadout;
  applyChanges(lo: Loadout, cs: Change[]): { loadout: Loadout; dropped: string[] };
}

export function applyInOrder(lo: Loadout, changes: (Change | LoadoutPatch)[], a: Appliers): { loadout: Loadout; dropped: string[] } {
  const dropped: string[] = [];
  for (let i = 0; i < changes.length;) {
    const c = changes[i];
    if (a.isPatch(c)) { lo = a.applyPatch(lo, c); i++; continue; }
    let j = i;
    while (j < changes.length && !a.isPatch(changes[j])) j++;
    const r = a.applyChanges(lo, changes.slice(i, j) as Change[]);
    lo = r.loadout; dropped.push(...r.dropped); i = j;
  }
  return { loadout: lo, dropped };
}

/** Fight inputs stated only when a figure names them in its stop, so every other figure keeps its memo key. Old King's Armor's movement-speed bonus (chest
 *  3010, modifier 51416041; dps-debug GF1: 100 at a consume, -5 per 0.1 s) only writes movement speed: the l100 capture is bit-equal at 0 and 100 (2026-10-15). */
/** dps-debug figure.ts RESOURCE1_KEY: Fighting Will (comp 0x26 resource key 1), which Opening Heart's crit rating reads; its in-fight gains are not ported, so it is stated:
 *  the middle of 0..100 (0 -> 100 is x1.068 on the owner's build, dps-debug 2026-10-16) */
export const RESOURCE1_KEY = 'comp 0x26 resource key 1 (counter 0x2d: Fighting Will, buff 390, 0..100)';
/** Fighting Will (OH1, RESOURCE1_KEY) too: stated on a build with a fixed rating (the probuild belt's 67) it stops the figure ("how a fight value and a fixed
 *  rating combine is not traced"), so only a build with no rating gets it */
/** Lich 54070400 "additional damage when having both Sealed Mana and Life" gates on comp 0x6f resource 1001 > 0 and 1301 > 0 (class 97720264, getter 76, cond 300):
 *  stated true (1) when a figure asks - the owner's build seals Life (Seal Conversion) and Mana. dps-debug HANDOFF H1641: on another character the engine's gate was
 *  false while the UI showed both, so this is a statement to check on the dummy, not a derived value */
export const ON_ASK: Record<string, number> = { 'affix class 782097792 var 1': 0, [RESOURCE1_KEY]: 50, 'resource 1001 value': 1, 'resource 1301 value': 1 };
const ASKED = /the scenario did not supply the fight input (.+?)(?: \(|$)|the fight input '(.+?)' is not given/;
/** price with the inputs earlier figures asked (`learned`, filled here); while the figure stops naming an ON_ASK input not yet given, price again with it. A figure
 *  that still stops is priced afresh from no input, as one stated anyway can stop it (Fighting Will on a fixed rating). The owner's build asks three: one figure
 *  instead of four (2026-10-17: 4.3 s -> about 1.1 s a candidate). */
export function withAsked<R extends { stop?: string }>(figure: (extra: Record<string, number>) => R, learned: Record<string, number> = {}): R {
  const from = (extra: Record<string, number>) => {
    let r = figure(extra);
    for (let m = r.stop ? ASKED.exec(r.stop) : null, k = m && (m[1] ?? m[2]); k && k in ON_ASK && !(k in extra); m = r.stop ? ASKED.exec(r.stop) : null, k = m && (m[1] ?? m[2])) {
      extra = { ...extra, [k]: ON_ASK[k] };
      r = figure(extra);
    }
    return { r, extra };
  };
  let got = from({ ...learned });
  if (got.r.stop && Object.keys(learned).length) got = from({});
  if (!got.r.stop) Object.assign(learned, got.extra);
  return got.r;
}

/** dps-debug's two "exceeds the budget … price is not affine" stops (calc.ts) */
const NOT_AFFINE = /exceeds the (?:enumeration )?budget(?: \d+)? and the price is not affine/;

/** The first pricing's roll budget: above it a price takes AQ1's affine closed form (about 11 evaluations, checked within the Life quantum) instead of
 *  enumerating every joint roll - dps-debug's coordinator, 2026-10-15: 40.3 s -> 2.6 s on a Hammer of Ash figure, equal to 7e-7 */
export const FIRST_ROLL_BUDGET = 4096;
/** Prices at FIRST_ROLL_BUDGET; only a "not affine" stop is re-priced with the large `rollBudget`. */
export function figureDefaultFirst<R extends { stop?: string }>(figure: (o: { rollBudget?: number }) => R, rollBudget: number): R {
  const r = figure({ rollBudget: FIRST_ROLL_BUDGET });
  return r.stop && NOT_AFFINE.test(r.stop) ? figure({ rollBudget }) : r;
}
