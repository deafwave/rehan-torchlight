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
  it("a target buff's resolved uptime (IN1) is a statement; one not derived is an omission (dps-debug figure.ts 548 / 550)", () => {
    expect(isPiece("the target's buff (IN1): buff 330 (103010083 row 1): 5.12863 adds/s x 1 stack(s), life 3 s, cap 1 (policy 1): P(fewer than 1 adds in one life) = 2.08e-7 -> steady at 1")).toBe(false);
    expect(isPiece("the target's buff (IN1): buff 3441 (885067264 row 1): never added in this fight (event 1000030 0.00000/s x 100 %)")).toBe(false);
    expect(isPiece("the target's buff not derived (IN1): buff 330 (103010083 row 1)")).toBe(true);
  });
  it("AIM1's derived re-cast buff and its held / not-held split are statements; a Boss-medium skill with no derived buff is an omission (dps-debug ed320b33)", () => {
    expect(isPiece("the build's buff 10320 (s_miaozhun) from skill 1790's AddBuff (AIM1): level 21, 6 s (the AddBuff's literal) x duration modifiers = 8.40000 s = 252 frames present each cast, cast every 8.03213 s: held 100.00 % of the time")).toBe(false);
    expect(isPiece("the build's buff 10320 (s_miaozhun) slows the auto-throw from 20 to 22 frames while held (AIM1): the figure is its held state (83.75 %, the steady rules at 22 frames) and its not-held state (at 20) priced apart and weighted")).toBe(false);
    expect(isPiece("the build's Activation Medium: Boss skill 1234 adds no buff the figure derives (no battlecry action 0xc2f0d, no AddBuff 0x68a7a, no carried row): not in this figure")).toBe(true);
  });
});
