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
      expect(evidence.summons).toHaveLength(2);
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

  it("preserves Erosion conversion and exposes guarded action foundations without inventing DPS", () => {
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
    expect(erosion?.actions.map((action) => action.actionName)).toEqual([
      "Scattered Mud",
      "Withering Payback",
      "Bleak Grass",
      "World of Thorns",
    ]);
    expect(erosion?.actions.every((action) => action.foundation.isDps === false)).toBe(true);
    expect(erosion?.minionDps.blockers.map((blocker) => blocker.code)).toEqual(
      expect.arrayContaining([
        "missing-minion-runtime-state",
        "missing-minion-ai-rotation",
      ]),
    );
    expect(erosion?.provenance).toContainEqual(expect.objectContaining({
      source: "imported Compendium/tli_dump loadout",
      locator: "loadouts.loadouts[8].skills.activeSkills[2]",
    }));
  });

  it("preserves the actual passive- and active-bar summon provenance", () => {
    const early = compileWuxiaSummonEvidence(wuxia(), 6);
    const late = compileWuxiaSummonEvidence(wuxia(), 8);
    if (early.status !== "source-terms" || late.status !== "source-terms") {
      throw new Error("expected source terms");
    }
    expect(early.summons.find((summon) =>
      summon.skillName === "Summon Erosion Magus")?.provenance).toContainEqual(
      expect.objectContaining({
        locator: "loadouts.loadouts[6].skills.passiveSkills[0]",
      }),
    );
    expect(late.summons.find((summon) =>
      summon.skillName === "Summon Erosion Magus")?.provenance).toContainEqual(
      expect.objectContaining({
        locator: "loadouts.loadouts[8].skills.activeSkills[2]",
      }),
    );
    expect(early.summons.find((summon) =>
      summon.skillName === "Summon Erosion Magus")?.supports
      .find((support) => support.supportName?.includes("Frequent Quake"))).toMatchObject({
      status: "source-terms",
      provenance: [
        expect.objectContaining({
          locator: "loadouts.loadouts[6].skills.passiveSkills[0].supports[2]",
        }),
        expect.anything(),
        expect.anything(),
      ],
    });
    expect(late.summons.find((summon) =>
      summon.skillName === "Summon Erosion Magus")?.supports
      .find((support) => support.supportName?.includes("Malady"))).toMatchObject({
      status: "source-terms",
      provenance: [
        expect.objectContaining({
          locator: "loadouts.loadouts[8].skills.activeSkills[2].supports[4]",
        }),
        expect.anything(),
        expect.anything(),
      ],
    });
  });

  it("does not compile a disabled or implicit-enabled summon parent", () => {
    for (const enabled of [false, undefined]) {
      const build = wuxia();
      const rock = build.loadouts.loadouts[8].skills.activeSkills[0];
      if (enabled === undefined) delete rock.enabled;
      else rock.enabled = enabled;
      const result = compileWuxiaSummonEvidence(build, 8);
      if (result.status !== "source-terms") throw new Error("expected source terms");
      expect(result.summons.map((summon) => summon.skillName)).toEqual([
        "Summon Erosion Magus",
      ]);
      expect(result.provenance.some((source) =>
        source.locator.includes("activeSkills[0].supports"))).toBe(false);
      expect(result.summons.flatMap((summon) => summon.supports).some((support) =>
        support.supportName?.includes("Protection Field"))).toBe(false);
    }
  });

  it("rejects every duplicate enabled summon parent", () => {
    const build = wuxia();
    const active = build.loadouts.loadouts[8].skills.activeSkills;
    active[1] = structuredClone(active[0]);
    expect(compileWuxiaSummonEvidence(build, 8)).toMatchObject({
      status: "not-calculated",
      blockers: [{
        code: "duplicate-supported-summon",
        message: expect.stringContaining("appears in more than one"),
      }],
    });
  });

  it("rejects truncated Compendium main-skill containers", () => {
    for (const [collection, length] of [
      ["activeSkills", 4],
      ["passiveSkills", 3],
    ] as const) {
      const build = wuxia();
      build.loadouts.loadouts[8].skills[collection].length = length;
      expect(compileWuxiaSummonEvidence(build, 8)).toMatchObject({
        status: "not-calculated",
        blockers: [{
          code: "malformed-main-skill-layout",
          evidence: expect.stringContaining(`${collection === "activeSkills" ? "active" : "passive"}=${length}`),
        }],
      });
    }
  });

  it("compares source terms while rejecting player-actor reuse", () => {
    const levelChange = compareWuxiaSummonEvidence(wuxia(), 0, 1);
    expect(levelChange.status).toBe("source-terms");
    if (levelChange.status !== "source-terms") throw new Error("expected source terms");
    expect(levelChange.changes).toContainEqual(expect.objectContaining({
      kind: "changed",
      skillName: "Summon Rock Magus",
    }));
    expect(levelChange.heroTraitsChanged).toBe(false);
    expect(levelChange.beforeHeroTraits).toHaveLength(4);
    expect(levelChange.afterHeroTraits).toHaveLength(4);
    expect(levelChange.isDps).toBe(false);
    expect(levelChange.isTotalEhp).toBe(false);

    expect(compileWuxiaSummonEvidence(bing(), 0)).toMatchObject({
      status: "not-calculated",
      isDps: false,
      isTotalEhp: false,
      blockers: [{ code: "unsupported-actor" }],
    });
  });

  it("reports a hero-trait-only change even when summon evidence is unchanged", () => {
    const build = wuxia();
    const clonedLoadout = structuredClone(build.loadouts.loadouts[8]);
    clonedLoadout.name = "trait-only comparison";
    delete clonedLoadout.hero.traits.level75;
    build.loadouts.loadouts.push(clonedLoadout);
    const afterIndex = build.loadouts.loadouts.length - 1;

    const comparison = compareWuxiaSummonEvidence(build, 8, afterIndex);
    expect(comparison.status).toBe("source-terms");
    if (comparison.status !== "source-terms") throw new Error("expected source terms");

    expect(comparison.changes).toEqual([]);
    expect(comparison.heroTraitsChanged).toBe(true);
    expect(comparison.beforeHeroTraits).toHaveLength(4);
    expect(comparison.afterHeroTraits).toHaveLength(3);
    expect(comparison.beforeHeroTraits.map((trait) => trait.traitName)).toContain(
      "Nurturing Breeze",
    );
    expect(comparison.afterHeroTraits.map((trait) => trait.traitName)).not.toContain(
      "Nurturing Breeze",
    );
  });

  it("does not treat an unsupported socket's loadout locator as a semantic change", () => {
    const build = wuxia();
    build.loadouts.loadouts[8].skills.activeSkills[2].supports[2].type =
      "support";
    const clonedLoadout = structuredClone(build.loadouts.loadouts[8]);
    clonedLoadout.id = "same-invalid-socket";
    build.loadouts.loadouts.push(clonedLoadout);
    const comparison = compareWuxiaSummonEvidence(
      build,
      8,
      build.loadouts.loadouts.length - 1,
    );
    if (comparison.status !== "source-terms") throw new Error("expected source terms");
    expect(comparison.changes).toEqual([]);
  });
});
