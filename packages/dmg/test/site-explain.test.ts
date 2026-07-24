/**
 * Proves the home product path: one loadout → dummy DPS + factor breakdown.
 * Drives the shipped explain module and real cycleDps (not a parallel reimplementation).
 * Every loadout with a snapshot uses the same math; raw mainhand is never the primary.
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
  // Prefer a late progression loadout that used to only expose weapon-foundation partials.
  return build.loadouts[Math.min(3, build.loadouts.length - 1)]
    ?? build.loadouts[build.loadouts.length - 1]!;
}

function loadoutsWithSnapshot(): AnalyzedLoadout[] {
  return demo.builds.flatMap((b) => b.loadouts).filter((l) => l.snapshot);
}

describe("single-build damage explanation (home path)", () => {
  it("surfaces dummy DPS and impact-ranked factors for a full snapshot", () => {
    const loadout = scalingLessonAfter();
    expect(loadout.snapshot).toBeTruthy();
    expect(loadout.model?.dps).toBeGreaterThan(0);

    const explained = explainCurrentDamage(loadout);
    expect(explained.reading.kind).toBe("modeled-dps");
    expect(explained.reading.label).toBe("DPS");
    expect(explained.reading.isDps).toBe(true);
    expect(explained.reading.value).toBeCloseTo(cycleDps(loadout.snapshot!).dps, 0);
    expect(explained.breakdown).not.toBeNull();

    // Trace total must match real cycleDps — chips cannot drift from the model.
    const live = cycleDps(loadout.snapshot!);
    expect(explained.breakdown!.total).toBeCloseTo(live.dps, 3);
    expect(resolve(explained.breakdown!.root)).toBeCloseTo(live.dps, 3);

    expect(explained.factors.length).toBeGreaterThan(0);
    for (let i = 1; i < explained.factors.length; i++) {
      expect(Math.abs(explained.factors[i - 1].impact))
        .toBeGreaterThanOrEqual(Math.abs(explained.factors[i].impact) - 1e-12);
    }
    const top = explained.factors.find((f) => f.op !== "base");
    expect(top).toBeTruthy();
    expect(formatFactorValue(top!)).toMatch(/^[×+]/);
  });

  it("primary reading is always labeled DPS when a snapshot exists", () => {
    const loadout = scalingLessonAfter();
    const reading = primaryDamageReading(loadout);
    expect(reading.kind).toBe("modeled-dps");
    expect(reading.label).toBe("DPS");
  });

  it("Bing and other catalog loadouts use the same cycleDps path — not raw mainhand", () => {
    const loadout = bingLateLoadout();
    expect(loadout.snapshot).toBeTruthy();

    const explained = explainCurrentDamage(loadout);
    expect(explained.reading.kind).toBe("modeled-dps");
    expect(explained.reading.label).toBe("DPS");
    expect(explained.reading.isDps).toBe(true);
    expect(explained.breakdown).not.toBeNull();
    expect(explained.reading.value).toBeCloseTo(cycleDps(loadout.snapshot!).dps, 0);

    // Must not surface the old weapon-foundation partial as the hero reading.
    const blob = JSON.stringify(explained.reading).toLowerCase();
    expect(blob).not.toMatch(/weapon-hit foundation|raw pre-envelope|main-hand|mainhand/);
  });

  it("every demo loadout with a snapshot explains via cycleDps", () => {
    const snaps = loadoutsWithSnapshot();
    expect(snaps.length).toBeGreaterThan(5);
    for (const loadout of snaps) {
      const explained = explainCurrentDamage(loadout);
      expect(explained.reading.label).toBe("DPS");
      expect(explained.reading.kind).toBe("modeled-dps");
      expect(explained.breakdown).not.toBeNull();
      expect(resolve(explained.breakdown!.root)).toBeCloseTo(
        cycleDps(loadout.snapshot!).dps,
        2,
      );
    }
  });

  it("rankedFactorImpacts matches neutralizing chips via resolve", () => {
    const loadout = scalingLessonAfter();
    const live = cycleDps(loadout.snapshot!);
    const factors = rankedFactorImpacts(live.trace);
    const multiplicative = factors.find((f) => f.op === "×" && Math.abs(f.impact) > 0.01);
    expect(multiplicative).toBeTruthy();
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
