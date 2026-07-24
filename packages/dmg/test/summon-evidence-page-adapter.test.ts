import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { fromRoot } from "../src/py.js";
import { compileWuxiaSummonEvidence } from "../src/minionEvidence.js";
import {
  compareSummonTerms,
  summonEvidenceForCompendium,
  summonEvidenceResultForCompendium,
} from "../../page/src/summon-evidence.js";

const readJson = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"));
const wuxia = () => readJson(fromRoot("../WuxiaSS13.json"));
const bing = () => readJson(fromRoot("../bing_china.json"));

describe("page summon evidence adapter", () => {
  it("preserves guarded Rock Blast contact semantics and hero-trait provenance", () => {
    const build = wuxia();
    const compiled = compileWuxiaSummonEvidence(build, 8);
    const adapted = summonEvidenceForCompendium(build, 8);
    expect(compiled.status).toBe("source-terms");
    if (compiled.status !== "source-terms") throw new Error("expected source terms");

    const rock = adapted.find((summon) => summon.skillName === "Summon Rock Magus");
    const rockBlast = rock?.actions.find((action) => action.actionName === "Rock Blast");
    expect(rockBlast?.foundation).toMatchObject({
      deterministicContacts: null,
      rawDamageAtDeterministicFullContact: null,
      scope: expect.stringContaining("same-target contacts are unresolved"),
    });
    expect(rockBlast?.terms).toContainEqual(expect.objectContaining({
      id: "strikes-per-use",
      value: 3,
      display: "3",
    }));

    expect(rock?.heroTraits).toHaveLength(compiled.heroTraits.length);
    expect(rock?.heroTraits[0].provenance).toEqual(
      compiled.heroTraits[0].provenance,
    );
    expect(rock?.heroTraits.every((trait) =>
      trait.provenance.length > 0
      && trait.provenance.every((source) =>
        source.source.length > 0 && source.locator.length > 0))).toBe(true);
  });

  it("preserves compiler refusal reasons instead of converting them to an empty list", () => {
    expect(summonEvidenceResultForCompendium(bing(), 0)).toMatchObject({
      status: "not-calculated",
      summons: [],
      blockers: [{ code: "unsupported-actor" }],
    });
    expect(summonEvidenceForCompendium(bing(), 0)).toEqual([]);
  });

  it("keeps hero-trait-only changes out of each summon fingerprint", () => {
    const build = wuxia();
    const before = summonEvidenceForCompendium(build, 8);
    delete build.loadouts.loadouts[8].hero.traits.level75;
    const after = summonEvidenceForCompendium(build, 8);
    expect(compareSummonTerms(
      { summonEvidence: before } as any,
      { summonEvidence: after } as any,
    )).toEqual([]);
    expect(before[0].heroTraits).toHaveLength(4);
    expect(after[0].heroTraits).toHaveLength(3);
  });

  it("preserves an unsupported support's exact imported socket locator", () => {
    const build = wuxia();
    build.loadouts.loadouts[8].skills.activeSkills[2].supports[2].type =
      "support";
    const adapted = summonEvidenceForCompendium(build, 8);
    const support = adapted
      .find((summon) => summon.skillName === "Summon Erosion Magus")
      ?.supports.find((entry) => entry.supportName?.includes("Frequent Quake"));
    expect(support).toMatchObject({
      status: "unsupported",
      blockerEvidence: [{
        code: "invalid-minion-support-installation",
        evidence: "loadouts.loadouts[8].skills.activeSkills[2].supports[2]",
      }],
    });
  });
});
