import { describe, expect, it } from "vitest";
import demoData from "../../page/src/data/demo-builds.json";
import { buildWaterfall } from "../../page/src/analysis.js";
import { summarizeTradeoff } from "../../page/src/diagnosis.js";
import { compareDefense, extractDefenseEvidence } from "../../page/src/defense-analysis.js";
import { importBuild, importBuildCode } from "../../page/src/importer.js";
import { compareStructure } from "../../page/src/structural-analysis.js";
import { compareSupportTerms } from "../../page/src/support-evidence.js";
import { compareSummonTerms } from "../../page/src/summon-evidence.js";
import type { ImportCatalog } from "../../page/src/analysis-types.js";
import {
  IRIS_VIGILANT_BREEZE_ID,
  SUMMON_ROCK_MAGUS_ID,
} from "../src/guardedCompiler.js";

const emptyCatalog: ImportCatalog = {
  skillNames: {},
  treeNames: {},
  heroNames: {},
  pactNames: {},
};

describe("comparison website model", () => {
  it("reconciles the fixed-order waterfall to the exact DPS delta", () => {
    const [before, after] = (demoData as any).builds
      .find((build: any) => build.id === "scaling-lesson").loadouts;
    const steps = buildWaterfall(before.snapshot, after.snapshot);
    const replayDelta = steps.reduce((sum, step) => sum + step.delta, 0);

    expect(replayDelta).toBeCloseTo(after.model.dps - before.model.dps, 3);
    expect(steps.find((step) => step.id === "increased")!.delta).toBeGreaterThan(0);
    expect(steps.find((step) => step.id === "additional")!.delta).toBeLessThan(0);
  });

  it("turns formula movement into an exact gains-versus-losses explanation", () => {
    const [before, after] = (demoData as any).builds
      .find((build: any) => build.id === "scaling-lesson").loadouts;
    const summary = summarizeTradeoff(buildWaterfall(before.snapshot, after.snapshot));

    expect(summary.primaryLoss?.id).toBe("additional");
    expect(summary.primaryGain?.id).toBe("increased");
    expect(summary.totalGain - summary.totalLoss).toBeCloseTo(summary.netDelta, 3);
    expect(summary.netDelta).toBeCloseTo(after.model.dps - before.model.dps, 3);
  });

  it("prioritizes the real Bing support and tree changes before assigning DPS", () => {
    const build = (demoData as any).builds.find((item: any) => item.id === "bing");
    const comparison = compareStructure(build.loadouts[2], build.loadouts[3]);

    expect(comparison.changedSystems).toContain("skills");
    expect(comparison.changedSystems).toContain("trees");
    expect(comparison.insights[0].id).toBe("main-support-swap");
    expect(comparison.insights[0].evidence.join(" ")).toContain("Slow Projectile");
    expect(comparison.insights.some((insight) => insight.id === "tree-swap")).toBe(true);
    expect(build.loadouts[3].model).toBeNull();
  });

  it("publishes the guarded Bing weapon foundation only as a non-DPS metric", () => {
    const build = (demoData as any).builds.find((item: any) => item.id === "bing");
    const metric = build.loadouts[3].partialMetrics.find(
      (item: any) => item.id === "bing-weapon-hit-foundation",
    );

    expect(metric.isDps).toBe(false);
    expect(metric.value).toBeCloseTo(5657.4342, 6);
    expect(metric.inputs[1].display).toBe("369%");
    expect(metric.excluded.join(" ")).toContain("bomb quantity");
    expect(build.loadouts[3].model).toBeNull();
  });

  it("generates bundled examples through the exact-roll structural importer", () => {
    const build = (demoData as any).builds.find((item: any) => item.id === "bing");
    const allGearLines = build.loadouts.flatMap((loadout: any) =>
      loadout.gear.flatMap((item: any) => item.lines));

    expect(allGearLines.some((line: string) => line.includes("#"))).toBe(false);
    expect(build.loadouts[0].gear
      .find((item: any) => item.slot === "mainHand").lines.join(" ")).toContain("+47%");
    expect(build.loadouts[0].memories[0].lines[0]).toContain("Base Stat");
    expect(build.loadouts[0].slates[0].lines.length).toBeGreaterThan(0);
  });

  it("explains Bing support swaps with source terms but no aggregate DPS", () => {
    const build = (demoData as any).builds.find((item: any) => item.id === "bing");
    const changes = compareSupportTerms(build.loadouts[2], build.loadouts[3]);
    const removed = changes.find((change) => change.kind === "removed");
    const added = changes.find((change) => change.kind === "added");

    expect(removed?.supportName).toBe("Slow Projectile");
    expect(removed?.before?.effects.map((effect) => effect.display)).toEqual(["−30%", "+29%"]);
    expect(added?.supportName).toBe("Hammer of Ash: Upheaval (Magnificent)");
    expect(added?.after?.effects.some((effect) => effect.scope.includes("explosion"))).toBe(true);
    expect(added?.after?.isDps).toBe(false);
  });

  it("keeps Wuxia insight evidence actor-scoped while minion DPS is unavailable", () => {
    const build = (demoData as any).builds.find((item: any) => item.id === "wuxia");
    const comparison = compareStructure(build.loadouts[5], build.loadouts[8]);
    const support = comparison.insights.find((insight) => insight.id === "main-support-swap");

    expect(support?.explanation).toContain("summoned actor");
    expect(support?.evidence.join(" ")).toContain("Friend of Spirit Magi");
    expect(build.loadouts[8].model).toBeNull();
  });

  it("publishes Wuxia summon and Origin terms without labeling them DPS or EHP", () => {
    const build = (demoData as any).builds.find((item: any) => item.id === "wuxia");
    const evidence = build.loadouts[8].summonEvidence;
    const erosion = evidence.find((summon: any) => summon.skillName === "Summon Erosion Magus");

    expect(erosion.level).toBe(21);
    expect(erosion.isDps).toBe(false);
    expect(erosion.isTotalEhp).toBe(false);
    expect(erosion.minionDps.status).toBe("not-calculated");
    expect(erosion.playerEhp.status).toBe("not-calculated");
    expect(erosion.terms).toContainEqual(expect.objectContaining({
      id: "physical-to-erosion-conversion",
      display: "100%",
      scope: "summoned-actor",
      isDps: false,
    }));
    expect(erosion.terms).toContainEqual(expect.objectContaining({
      id: "origin-additional-dot-damage-taken",
      display: "−9.3%",
      scope: "player",
      isTotalEhp: false,
    }));
    expect(build.loadouts[8].sourceNote).toContain("total player EHP");
  });

  it("compares Wuxia source terms without manufacturing a minion total", () => {
    const build = (demoData as any).builds.find((item: any) => item.id === "wuxia");
    const levelChange = compareSummonTerms(build.loadouts[0], build.loadouts[1]);
    const rock = levelChange.find((change) => change.skillName === "Summon Rock Magus");

    expect(rock?.kind).toBe("changed");
    expect(rock?.before?.level).toBe(1);
    expect(rock?.after?.level).toBe(20);
    expect(rock?.before?.terms.find((term) =>
      term.id === "origin-additional-hit-damage-taken")?.display).toBe("−5.2%");
    expect(rock?.after?.terms.find((term) =>
      term.id === "origin-additional-hit-damage-taken")?.display).toBe("−8.05%");
    expect(rock?.after?.minionDps.status).toBe("not-calculated");
    expect(rock?.after?.playerEhp.status).toBe("not-calculated");
  });

  it("shows defensive lines as evidence without collapsing them into fake EHP", () => {
    const build = (demoData as any).builds.find((item: any) => item.id === "wuxia");
    const comparison = compareDefense(build.loadouts[5], build.loadouts[8]);

    expect(comparison.removed).toBeGreaterThan(0);
    expect(comparison.added).toBeGreaterThan(0);
    expect(comparison.categories.some((row) => row.category === "resistance")).toBe(true);
    expect(build.loadouts[8].model).toBeNull();
  });

  it("does not mislabel minion defenses as player survival evidence", () => {
    const evidence = extractDefenseEvidence({
      gear: [{
        slot: "helmet",
        name: "Test",
        rarity: null,
        category: null,
        lines: [
          "+20% Minion Elemental Resistance",
          "+100 Max Life\n+15% Minion Max Life",
          "+40% Spirit Magus Armor",
          "Nearby Enemies have −12% Elemental Resistance",
        ],
      }],
    } as any);

    expect(evidence.map((row) => row.text)).toEqual(["+100 Max Life"]);
  });

  it("keeps recovery and mitigation separate from generic Life or Energy pools", () => {
    const evidence = extractDefenseEvidence({
      gear: [{
        slot: "chest",
        name: "Test",
        rarity: null,
        category: null,
        lines: [
          "Regain 4% Life per second",
          "−12% additional Hit Damage taken while Energy Shield is active",
          "+100 Max Life",
        ],
      }],
    } as any);

    expect(evidence.map((row) => row.category)).toEqual([
      "recovery",
      "mitigation",
      "life",
    ]);
  });

  it("imports Compendium structure without inventing DPS", () => {
    const build = importBuild({
      name: "Player build",
      patch: "SS13",
      loadouts: {
        currentLoadoutId: "one",
        loadouts: [{
          id: "one",
          name: "Current",
          hero: { heroId: "Example hero" },
          gear: { inventory: [], equipped: { helmet: null } },
          vorax: { inventory: [] },
          skills: { activeSkills: [], passiveSkills: [] },
          skillTree: { slots: [] },
          heroMemories: { inventory: [], equipped: {} },
          divinity: { inventory: [], placements: [] },
          pactspirits: [],
          kismets: [],
        }],
      },
    }, emptyCatalog, []);

    expect(build.loadouts).toHaveLength(1);
    expect(build.loadouts[0].model).toBeNull();
    expect(build.loadouts[0].gear[0].name).toBe("Empty");
  });

  it("attaches guarded summon evidence during a Compendium import", () => {
    const build = importBuild({
      name: "Iris import",
      patch: "SS13",
      loadouts: {
        currentLoadoutId: "iris-one",
        loadouts: [{
          id: "iris-one",
          name: "Current",
          hero: { heroId: IRIS_VIGILANT_BREEZE_ID },
          gear: { inventory: [], equipped: {} },
          vorax: { inventory: [] },
          skills: {
            activeSkills: [{
              skillGuid: SUMMON_ROCK_MAGUS_ID,
              level: 20,
              enabled: true,
              supports: [],
            }],
            passiveSkills: [],
          },
          skillTree: { slots: [] },
          heroMemories: { inventory: [], equipped: {} },
          divinity: { inventory: [], placements: [] },
          pactspirits: [],
          kismets: [],
        }],
      },
    }, emptyCatalog, []);

    expect(build.loadouts[0].model).toBeNull();
    expect(build.loadouts[0].summonEvidence).toHaveLength(1);
    expect(build.loadouts[0].summonEvidence?.[0]).toMatchObject({
      skillName: "Summon Rock Magus",
      level: 20,
      isDps: false,
      isTotalEhp: false,
      minionDps: { status: "not-calculated" },
      playerEhp: { status: "not-calculated" },
    });
  });

  it("treats an in-game build code as an unresolved identifier", () => {
    const build = importBuildCode("2L8xV4YBEfGpdQAAAAAACw==");
    expect(build.needsResolution).toBe(true);
    expect(build.loadouts[0].model).toBeNull();
    expect(build.loadouts[0].sourceNote).toContain("opaque reference");
    expect(build.loadouts[0].sourceNote).toContain("tli_dump capture");
  });
});
