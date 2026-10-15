/** Kill speed, in DPS units (max Life / kill speed = the time to kill): the fight runs from 100 % Life down to the cull threshold `cull` (0 = none), the DPS at
 *  Life fraction l is the line between d0 and d100, at most `lock` (the damage lock's ceiling) at every instant. No lock, no cull: the kill average
 *  (d100 - d0) / ln(d100 / d0); equal ends -> d100; any end <= 0 -> 0. */
export function killSpeed(d100: number, d0: number, lock = Infinity, cull = 0): number {
  if (!(d100 > 0) || !(d0 > 0)) return 0;
  const D = d100 - d0, d = (l: number) => d0 + D * l;
  // the time per unit of max Life over [a, b]: at the lock, or under the line
  const part = (a: number, b: number): number => !(b > a) ? 0 : d((a + b) / 2) >= lock ? (b - a) / lock : D === 0 ? (b - a) / d0 : Math.log(d(b) / d(a)) / D;
  const x = D === 0 ? -1 : (lock - d0) / D;   // where the line meets the lock
  return 1 / (x > cull && x < 1 ? part(cull, x) + part(x, 1) : part(cull, 1));
}

/** Cull sources dps-debug's CULL1 does not count on a Hammer of Ash figure, with why (its coordinator, 2026-10-15); the Elimination core (talent 10001100,
 *  18 % on Attack hits) and the slates' culls are counted */
export const CULL_NOT_COUNTED = [
  "cull: Machine Lord's helmet culls only on its minions' hits, which the figure does not simulate; not counted",
  'cull: Ill Omen / Ominous is no cull: a once-per-boss 20 % max-Life hit after 50 % of max Life dealt as DoT, Reap or Spacetime damage, which Hammer of Ash does not deal',
];
