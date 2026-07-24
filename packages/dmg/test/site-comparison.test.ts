import { describe, expect, it } from "vitest";
import demoData from "../../page/src/data/demo-builds.json";
import { buildWaterfall } from "../../page/src/analysis.js";
import { importBuild, importBuildCode } from "../../page/src/importer.js";
import type { ImportCatalog } from "../../page/src/analysis-types.js";

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

  it("treats an in-game build code as an unresolved identifier", () => {
    const build = importBuildCode("2L8xV4YBEfGpdQAAAAAACw==");
    expect(build.needsResolution).toBe(true);
    expect(build.loadouts[0].model).toBeNull();
    expect(build.loadouts[0].sourceNote).toContain("does not contain the loadout");
  });
});
