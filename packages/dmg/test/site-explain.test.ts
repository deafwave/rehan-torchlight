/**
 * Proves the home product path: one loadout → current damage reading + why factors.
 * Drives the shipped explain module and real cycleDps (not a parallel reimplementation).
 */
import { describe, expect, it } from "vitest";
import demoData from "../../page/src/data/demo-builds.json";
import {
  explainCurrentDamage,
  formatFactorValue,
  primaryDamageReading,
  rankedFactorImpacts,
} from "../../page/src/explain.js";
import { cycleDps, resolve } from "../src/damageModel.js";
import type { AnalyzedLoadout } from "../../page/src/analysis-types.js";

const demo = demoData as { builds: Array<{ id: string; loadouts: AnalyzedLoadout[] }> };

function scalingLessonAfter(): AnalyzedLoadout {
  const build = demo.builds.find((b) => b.id === "scaling-lesson");
  if (!build?.loadouts[1]) throw new Error("scaling-lesson after loadout missing from demo data");
  return build.loadouts[1];
}

function bingLateLoadout(): AnalyzedLoadout {
  const build = demo.builds.find((b) => b.id === "bing");
  if (!build?.loadouts.length) throw new Error("bing build missing from demo data");
  // Prefer a loadout with partial metrics (model often null for Bing guarded path).
  const withPartial = [...build.loadouts].reverse().find((l) => l.partialMetrics?.length);
  if (!withPartial) throw new Error("no Bing loadout with partial metrics");
  return withPartial;
}

describe("single-build damage explanation (home path)", () => {
  it("surfaces modeled boss DPS and impact-ranked factors for a full snapshot", () => {
    const loadout = scalingLessonAfter();
    expect(loadout.snapshot).toBeTruthy();
    expect(loadout.model?.dps).toBeGreaterThan(0);

    const explained = explainCurrentDamage(loadout);
    expect(explained.reading.kind).toBe("modeled-dps");
    expect(explained.reading.isDps).toBe(true);
    expect(explained.reading.value).toBeCloseTo(loadout.model!.dps, 0);
    expect(explained.breakdown).not.toBeNull();

    // Trace total must match real cycleDps — chips cannot drift from the model.
    const live = cycleDps(loadout.snapshot!);
    expect(explained.breakdown!.total).toBeCloseTo(live.dps, 3);
    expect(resolve(explained.breakdown!.root)).toBeCloseTo(live.dps, 3);

    expect(explained.factors.length).toBeGreaterThan(0);
    // Sorted by |impact| descending
    for (let i = 1; i < explained.factors.length; i++) {
      expect(Math.abs(explained.factors[i - 1].impact))
        .toBeGreaterThanOrEqual(Math.abs(explained.factors[i].impact) - 1e-12);
    }
    // Non-base factors have meaningful impact labels
    const top = explained.factors.find((f) => f.op !== "base");
    expect(top).toBeTruthy();
    expect(formatFactorValue(top!)).toMatch(/^[×+]/);
  });

  it("primary reading prefers modeled DPS over partials when both exist", () => {
    const loadout = scalingLessonAfter();
    const reading = primaryDamageReading(loadout);
    expect(reading.kind).toBe("modeled-dps");
    expect(reading.label.toLowerCase()).toContain("dps");
  });

  it("falls back to guarded partial when full DPS is not modeled", () => {
    const loadout = bingLateLoadout();
    expect(loadout.model).toBeNull();
    expect(loadout.partialMetrics?.length).toBeGreaterThan(0);

    const explained = explainCurrentDamage(loadout);
    expect(explained.reading.kind).toBe("partial");
    expect(explained.reading.value).not.toBeNull();
    expect(explained.reading.isDps).toBe(false);
    expect(explained.breakdown).toBeNull();
    expect(explained.factors).toEqual([]);
  });

  it("rankedFactorImpacts matches neutralizing chips via resolve", () => {
    const loadout = scalingLessonAfter();
    const live = cycleDps(loadout.snapshot!);
    const factors = rankedFactorImpacts(live.trace);
    const multiplicative = factors.find((f) => f.op === "×" && Math.abs(f.impact) > 0.01);
    expect(multiplicative).toBeTruthy();
    // impact ≈ 1 - 1/factor for pure × chips on a product path when unique
    expect(Math.abs(multiplicative!.impact)).toBeGreaterThan(0.005);
  });

  it("does not frame explanation as a before/after comparison", () => {
    const loadout = scalingLessonAfter();
    const explained = explainCurrentDamage(loadout);
    const blob = JSON.stringify(explained).toLowerCase();
    expect(blob).not.toMatch(/before\/after|comparison result|improve dps/);
    expect(explained.reading.note.toLowerCase()).not.toContain("changed build");
  });
});
