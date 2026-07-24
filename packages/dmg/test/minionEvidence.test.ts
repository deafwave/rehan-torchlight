import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { fromRoot } from "../src/py.js";
import {
  compareWuxiaSummonEvidence,
  compileWuxiaSummonEvidence,
} from "../src/minionEvidence.js";

const readJson = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"));
const bing = () => readJson(fromRoot("../bing_china.json"));
const wuxia = () => readJson(fromRoot("../WuxiaSS13.json"));

describe("guarded Wuxia summon evidence", () => {
  it("covers the supplied progression while keeping DPS and total EHP unavailable", () => {
    const build = wuxia();
    for (let index = 0; index < build.loadouts.loadouts.length; index += 1) {
      const evidence = compileWuxiaSummonEvidence(build, index);
      expect(evidence.status).toBe("source-terms");
      if (evidence.status !== "source-terms") throw new Error("expected source terms");
      expect(evidence.isDps).toBe(false);
      expect(evidence.isTotalEhp).toBe(false);
      expect(evidence.summons.length).toBeGreaterThan(0);
      for (const summon of evidence.summons) {
        expect(summon.minionDps.status).toBe("not-calculated");
        expect(summon.playerEhp.status).toBe("not-calculated");
      }
    }
  });

  it("reads the actual Rock Magus level progression", () => {
    const early = compileWuxiaSummonEvidence(wuxia(), 0);
    const later = compileWuxiaSummonEvidence(wuxia(), 1);
    if (early.status !== "source-terms" || later.status !== "source-terms") {
      throw new Error("expected source terms");
    }
    const origin = (evidence: typeof early) =>
      evidence.summons[0].terms.find((term) =>
        term.id === "origin-additional-hit-damage-taken")?.value;
    expect(early.summons[0].level).toBe(1);
    expect(origin(early)).toBeCloseTo(-5.2, 9);
    expect(later.summons[0].level).toBe(20);
    expect(origin(later)).toBeCloseTo(-8.05, 9);
  });

  it("preserves Erosion Magus conversion and Origin terms without inventing attacks", () => {
    const evidence = compileWuxiaSummonEvidence(wuxia(), 8);
    expect(evidence.status).toBe("source-terms");
    if (evidence.status !== "source-terms") throw new Error("expected source terms");
    const erosion = evidence.summons.find((summon) =>
      summon.skillName === "Summon Erosion Magus");
    expect(erosion?.level).toBe(21);
    expect(erosion?.terms).toContainEqual(expect.objectContaining({
      id: "physical-to-erosion-conversion",
      value: 100,
      scope: "summoned-actor",
    }));
    expect(erosion?.terms).toContainEqual(expect.objectContaining({
      id: "origin-additional-dot-damage-taken",
      value: -9.3,
      scope: "player",
    }));
    expect(erosion?.minionDps.blockers[0].code).toBe("missing-minion-action-formula");
  });

  it("compares source terms while rejecting player-actor reuse", () => {
    const levelChange = compareWuxiaSummonEvidence(wuxia(), 0, 1);
    expect(levelChange.status).toBe("source-terms");
    if (levelChange.status !== "source-terms") throw new Error("expected source terms");
    expect(levelChange.changes).toContainEqual(expect.objectContaining({
      kind: "changed",
      skillName: "Summon Rock Magus",
    }));
    expect(levelChange.isDps).toBe(false);
    expect(levelChange.isTotalEhp).toBe(false);

    expect(compileWuxiaSummonEvidence(bing(), 0)).toMatchObject({
      status: "not-calculated",
      isDps: false,
      isTotalEhp: false,
      blockers: [{ code: "unsupported-actor" }],
    });
  });
});
