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
