import { describe, expect, it } from 'vitest';
import { pieceKey, rankable } from '../src/search';
import { isPiece } from '../src/engine/pool';

describe('pieceKey / rankable (dps-debug coordinator, 2026-10-16)', () => {
  it('"held buffs left off" is the same omission whatever the carried list (it names every buff a piece adds)', () => {
    expect(pieceKey('held buffs left off: 11210 (carried: 10, 380, 15101)')).toBe(pieceKey('held buffs left off: 11210 (carried: 10, 15101, 15103)'));
    expect(pieceKey('held buffs left off: 11210 (carried: 10)')).not.toBe(pieceKey('held buffs left off: 320 (carried: 10)'));
  });
  it("U2-IS's cast-rate line is a statement, so a faster build still ranks", () => {
    expect(isPiece("U2-IS: the uptime rules over the figure's own hit rates (2 hit classes at 6.25000 casts / s; event 1000060 not stated)")).toBe(false);
    const f = (partial: string[], kill = 1) => ({ life100: kill, life0: kill, kill, partial });
    expect(rankable(f(['held buffs left off: 11210 (carried: 10, 15101)']), f(['held buffs left off: 11210 (carried: 10, 320, 15101)'], 2))).toBe(true);
  });
});
