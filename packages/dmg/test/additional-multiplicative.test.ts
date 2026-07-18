import { describe, expect, test } from "vitest";
import { cycleDps, averageHit, DEFAULT_SNAPSHOT, type Snapshot } from "../src/damageModel.js";
import { deepCopy } from "../src/py.js";

/* mechanics.md#additional: the in-game "Additional Damage Bonus" is a PRODUCT of every
   additional-damage source, not a summed pool. User toggle 2026-07-17: removing a +12%
   line moved the sheet 2165% → 1922% (÷1.12), i.e. ∏(1+aᵢ), not (1+Σaᵢ). */
describe("additional damage is multiplicative across sources", () => {
  const zeroAdditional = (s: Snapshot): Snapshot => {
    for (const k of Object.keys(s.additional)) s.additional[k] = 0;
    return s;
  };

  test("two +100% additional sources multiply to ×4, not sum to ×3", () => {
    const base = zeroAdditional(deepCopy(DEFAULT_SNAPSHOT));
    const both = zeroAdditional(deepCopy(DEFAULT_SNAPSHOT));
    both.additional.strength = 100;
    both.additional.misc = 100;
    expect(averageHit(both) / averageHit(base)).toBeCloseTo(4, 6);   // 2 × 2, not 1 + 2
  });

  test("a +12% additional line is worth ~+12% DPS even into a huge existing pool", () => {
    const base = deepCopy(DEFAULT_SNAPSHOT);
    base.additional.fervor = 465;      // seed a large pool: the old summed model diluted
    base.additional.precise_auras = 201;   // a +12% line here to +0.4%
    const withHaze = deepCopy(base);
    withHaze.additional.misc = ((1 + base.additional.misc / 100) * 1.12 - 1) * 100;
    expect(cycleDps(withHaze).dps / cycleDps(base).dps).toBeCloseTo(1.12, 6);
  });
});
