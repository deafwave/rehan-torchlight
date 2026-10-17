import { describe, expect, it } from 'vitest';
import { talentName } from '../src/names';

describe('talentName', () => {
  it("names every effect of a node, not only its first (owner, 2026-10-16: the line is '+8% additional Deterioration Damage / +5% additional Deterioration Duration')", () => {
    const n = talentName(51070200);
    expect(n).toMatch(/^Shadowmaster: .*additional Deterioration Damage/);
    expect(n).toMatch(/Deterioration Duration/);
  });
});
