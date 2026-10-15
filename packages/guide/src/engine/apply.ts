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

/** dps-debug's two "exceeds the budget … price is not affine" stops (calc.ts) */
const NOT_AFFINE = /exceeds the (?:enumeration )?budget(?: \d+)? and the price is not affine/;

/** Prices at dps-debug's default roll budget; only a "not affine" stop is re-priced with the large `rollBudget`. */
export function figureDefaultFirst<R extends { stop?: string }>(figure: (o: { rollBudget?: number }) => R, rollBudget: number): R {
  const r = figure({});
  return r.stop && NOT_AFFINE.test(r.stop) ? figure({ rollBudget }) : r;
}
