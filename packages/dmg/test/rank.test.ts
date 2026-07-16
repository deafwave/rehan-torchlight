import { describe, expect, test } from "vitest";
import { sensitivity, STANDARD_PERTURBATIONS, validateSnapshot, compareSnapshots, bump } from "../src/rank.js";
import { baseOnly } from "./helpers.js";

describe("sensitivity", () => {
  test("reports delta pct sorted", () => {
    const s = baseOnly();
    const perts: [string, string, number][] = [
      ["+50% increased physical", "increased.physical", 50],
      ["+10% additional misc", "additional.misc", 10]];
    const out = sensitivity(s, perts);
    expect(out[0].label).toBe("+50% increased physical");
    expect(out[0].delta_pct).toBeCloseTo(50.0, 1);
    expect(out[1].delta_pct).toBeCloseTo(10.0, 1);
  });

  test("additional beats equal increased when pile is fat", () => {
    const s = baseOnly();
    s.increased.physical = 200;
    const perts: [string, string, number][] = [
      ["+20% increased", "increased.physical", 20],
      ["+20% additional", "additional.misc", 20]];
    expect(sensitivity(s, perts)[0].label).toBe("+20% additional");
  });

  test("standard perturbations cover every bucket", () => {
    const paths = STANDARD_PERTURBATIONS.map(([, p]) => p);
    for (const bucket of ["increased.", "additional.", "enemy_taken.", "crit.", "penetration.", "rotation."]) {
      expect(paths.some(p => p.startsWith(bucket)), bucket).toBe(true);
    }
  });
});

describe("guards and comparison", () => {
  test("validate snapshot rejects missing high-impact stats", () => {
    const s = baseOnly();
    s.base.weapon_phys_min = s.base.weapon_phys_max = 0;
    s.base.weapon_flat_cold_min = s.base.weapon_flat_cold_max = 0;
    expect(() => validateSnapshot(s)).toThrow();
  });

  test("compare snapshots delta pct", () => {
    const a = baseOnly();
    const b = bump(a, "additional.misc", 100);
    expect(compareSnapshots(a, b)).toBeCloseTo(100.0, 1);
  });

  test("bump does not mutate original", () => {
    const a = baseOnly();
    bump(a, "increased.physical", 50);
    expect(a.increased.physical).toBe(0);
  });
});
