import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { fromRoot } from "../src/py.js";
import {
  compileIrisTraitEvidence,
  compileSpiritMagusActionSet,
  SS13_HERO_TRAIT_TEXT_SOURCE,
  SS13_SPIRIT_MAGUS_BASE_SOURCE,
  type CompiledMinionActionSet,
  type MinionSupportSourceTerms,
} from "../src/minionActionEvidence.js";
import {
  SUMMON_EROSION_MAGUS_ID,
  SUMMON_ROCK_MAGUS_ID,
} from "../src/guardedCompiler.js";

const readJson = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"));
const wuxia = () => readJson(fromRoot("../WuxiaSS13.json"));

function summon(loadout: any, id: string): any {
  return [
    ...(loadout.skills.activeSkills ?? []),
    ...(loadout.skills.passiveSkills ?? []),
  ].find((skill: any) => skill.skillGuid === id);
}

function compiled(skill: any): CompiledMinionActionSet {
  const result = compileSpiritMagusActionSet(skill, {
    patch: "SS13",
    sourceLocator: "loadouts.loadouts[0].skills.activeSkills[0]",
  });
  if ("code" in result) throw new Error(result.message);
  return result;
}

function supported(
  result: CompiledMinionActionSet,
  name: string,
): MinionSupportSourceTerms {
  const evidence = result.supports.find((support) => support.supportName === name);
  if (!evidence || evidence.status !== "source-terms") {
    throw new Error(`expected source terms for ${name}`);
  }
  return evidence;
}

describe("guarded SS13 Spirit Magus action evidence", () => {
  it("covers every supported main-summon socket in the supplied Wuxia progression", () => {
    const build = wuxia();
    for (const loadout of build.loadouts.loadouts) {
      const skills = [
        ...(loadout.skills.activeSkills ?? []),
        ...(loadout.skills.passiveSkills ?? []),
      ].filter((skill: any) =>
        skill.enabled === true
        && (skill.skillGuid === SUMMON_ROCK_MAGUS_ID
          || skill.skillGuid === SUMMON_EROSION_MAGUS_ID));
      expect(skills).toHaveLength(2);
      for (const skill of skills) {
        const result = compiled(skill);
        expect(result.isDps).toBe(false);
        expect(result.isTotalMinionEhp).toBe(false);
        expect(result.actions).toHaveLength(4);
        expect(result.supports).toHaveLength(skill.supports.filter(Boolean).length);
        expect(result.supports.every((support) => support.status === "source-terms")).toBe(true);
        expect(result.blockers.map((blocker) => blocker.code)).toContain("missing-minion-ai-rotation");
      }
    }
  });

  it("computes raw Rock action foundations from exact level tables without calling them DPS", () => {
    const build = wuxia();
    const early = compiled(summon(build.loadouts.loadouts[0], SUMMON_ROCK_MAGUS_ID));
    const later = compiled(summon(build.loadouts.loadouts[1], SUMMON_ROCK_MAGUS_ID));

    expect(early.baseline).toMatchObject({
      level: 1,
      baseLife: 150,
      baseDamage: 10,
      baseArmor: 18_750,
      confidence: "inferred-partial",
      isTotalMinionEhp: false,
    });
    expect(early.baseline.provenance).toContainEqual(SS13_SPIRIT_MAGUS_BASE_SOURCE);
    const earlyByName = new Map(early.actions.map((action) => [action.actionName, action]));
    expect(earlyByName.get("Shattered Stone")?.foundation).toMatchObject({
      baseDamagePctPerContact: 107,
      rawDamagePerContact: 10.7,
      rawDamageAtDeterministicFullContact: 10.7,
      isDps: false,
    });
    expect(earlyByName.get("Rock Blast")?.foundation).toMatchObject({
      baseDamagePctPerContact: 31,
      deterministicContacts: null,
      rawDamagePerContact: 3.1,
      rawDamageAtDeterministicFullContact: null,
      scope: expect.stringContaining("same-target contacts are unresolved"),
    });
    expect(earlyByName.get("Rock Blast")?.terms).toContainEqual(
      expect.objectContaining({
        id: "strikes-per-use",
        value: 3,
        application: "geometry-input",
      }),
    );
    expect(earlyByName.get("Towering Mountains")?.foundation).toMatchObject({
      baseDamagePctPerContact: 152,
      rawDamagePerContact: 15.2,
    });

    expect(later.baseline).toMatchObject({
      level: 20,
      baseLife: 4_500,
      baseDamage: 300,
      baseArmor: 39_130,
    });
    const laterByName = new Map(later.actions.map((action) => [action.actionName, action]));
    expect(laterByName.get("Shattered Stone")?.foundation.rawDamagePerContact).toBe(321);
    expect(laterByName.get("Rock Blast")?.foundation).toMatchObject({
      deterministicContacts: null,
      rawDamagePerContact: 141,
      rawDamageAtDeterministicFullContact: null,
    });
    expect(laterByName.get("Towering Mountains")?.foundation.rawDamagePerContact).toBe(1_707);
    expect(later.actions.every((action) => action.foundation.isDps === false)).toBe(true);
  });

  it("exposes the Erosion action topology and leaves same-target overlap unresolved", () => {
    const build = wuxia();
    const result = compiled(summon(build.loadouts.loadouts[8], SUMMON_EROSION_MAGUS_ID));
    expect(result.baseline).toMatchObject({
      level: 21,
      baseDamage: 300,
      baseArmor: 43_649,
      confidence: "confirmed-partial",
    });
    const byName = new Map(result.actions.map((action) => [action.actionName, action]));
    expect(byName.get("Scattered Mud")?.foundation.rawDamagePerContact).toBe(300);
    expect(byName.get("Bleak Grass")?.foundation).toMatchObject({
      baseDamagePctPerContact: 162,
      deterministicContacts: 2,
      rawDamagePerContact: 486,
      rawDamageAtDeterministicFullContact: 972,
    });
    expect(byName.get("Bleak Grass")?.terms).toContainEqual(expect.objectContaining({
      id: "stage-three-erosion-damage-taken",
      value: 4,
      condition: expect.stringContaining("stacks up to 4"),
    }));
    expect(byName.get("World of Thorns")?.foundation).toMatchObject({
      baseDamagePctPerContact: 2_298,
      deterministicContacts: null,
      rawDamagePerContact: 6_894,
      rawDamageAtDeterministicFullContact: null,
      isTotalDamage: false,
    });
    expect(byName.get("World of Thorns")?.terms).toContainEqual(expect.objectContaining({
      id: "shotgun-falloff",
      value: 95,
    }));
  });

  it("compiles exact level, condition, and rolled support terms for both summon actors", () => {
    const loadout = wuxia().loadouts.loadouts[8];
    const rock = compiled(summon(loadout, SUMMON_ROCK_MAGUS_ID));
    expect(supported(rock, "Precise: Superpower").effects).toContainEqual(expect.objectContaining({
      id: "origin-effect",
      value: 52,
    }));
    expect(supported(rock, "Precise: Protection Field").effects).toContainEqual(expect.objectContaining({
      id: "damage-transfer",
      value: 8.95,
    }));

    const erosion = compiled(summon(loadout, SUMMON_EROSION_MAGUS_ID));
    expect(supported(erosion, "Elemental Duo").effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "maximum-summonable-minions", value: 1 }),
      expect.objectContaining({ id: "additional-minion-damage", value: 25 }),
    ]));
    expect(supported(erosion, "Quick Decision").effects).toContainEqual(expect.objectContaining({
      id: "additional-attack-cast-speed",
      value: 24.5,
    }));
    expect(supported(
      erosion,
      "Summon Erosion Magus: Frequent Quake (Magnificent)",
    ).effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "additional-minion-damage", value: 20 }),
      expect.objectContaining({ id: "empower-auto-trigger-interval", value: 0.4 }),
      expect.objectContaining({ id: "empower-duration", value: -9 }),
    ]));
    expect(supported(erosion, "Ailment Termination").effects).toContainEqual(
      expect.objectContaining({ id: "additional-damage-per-ailment", value: 8.6 }),
    );
    expect(supported(
      erosion,
      "Summon Erosion Magus: Malady (Noble)",
    ).effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "additional-minion-damage-fixed", value: 20 }),
      expect.objectContaining({ id: "enhanced-skill-cast-speed", value: -20 }),
      expect.objectContaining({ id: "additional-minion-damage-roll", value: 26 }),
    ]));

    const earlyErosion = compiled(summon(
      wuxia().loadouts.loadouts[0],
      SUMMON_EROSION_MAGUS_ID,
    ));
    expect(supported(earlyErosion, "Spell Concentration").effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "skill-area", value: -30 }),
        expect.objectContaining({ id: "additional-damage", value: 32 }),
      ]),
    );
    expect(supported(earlyErosion, "Servant Damage").effects).toContainEqual(
      expect.objectContaining({ id: "additional-minion-damage", value: 24 }),
    );
  });

  it("shows Iris trait constants and candidate values while preserving the missing selector", () => {
    const loadout = wuxia().loadouts.loadouts[8];
    const traits = compileIrisTraitEvidence(loadout);
    expect(traits).toHaveLength(4);
    expect(traits.every((trait) => trait.provenance[0].sha256
      === SS13_HERO_TRAIT_TEXT_SOURCE.sha256)).toBe(true);

    const whirlwind = traits.find((trait) => trait.traitName === "Whirlwind Tango");
    expect(whirlwind?.terms).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "ultimate-cooldown",
        values: [0],
        selector: "constant",
      }),
      expect.objectContaining({
        id: "additional-spirit-magus-skill-damage",
        values: [-60],
      }),
      expect.objectContaining({
        id: "ultimate-life-consumption",
        values: [10, 9, 8, 7, 6],
        selector: "unresolved-trait-enhancement",
      }),
    ]));

    const reunion = traits.find((trait) => trait.traitName === "Happiest Reunion");
    expect(reunion?.terms).toContainEqual(expect.objectContaining({
      id: "per-spirit-magus-additional-damage",
      values: [1, 2, 3, 4, 5],
      selector: "unresolved-trait-enhancement",
    }));
    const nurturing = traits.find((trait) => trait.traitName === "Nurturing Breeze");
    expect(nurturing?.terms).toContainEqual(expect.objectContaining({
      id: "player-additional-damage-taken",
      values: [-20, -24, -28, -32, -36],
      isTotalEhp: false,
    }));
  });

  it("only compiles each Iris trait from its verified unlock slot", () => {
    const misplaced = structuredClone(wuxia().loadouts.loadouts[8]);
    const nurturing = misplaced.hero.traits.level75;
    delete misplaced.hero.traits.level75;
    misplaced.hero.traits.level45 = nurturing;
    expect(compileIrisTraitEvidence(misplaced).some((trait) =>
      trait.traitName === "Nurturing Breeze")).toBe(false);

    const duplicated = structuredClone(wuxia().loadouts.loadouts[8]);
    duplicated.hero.traits.level45 = duplicated.hero.traits.level75;
    expect(compileIrisTraitEvidence(duplicated).some((trait) =>
      trait.traitName === "Nurturing Breeze")).toBe(false);
  });

  it("rejects unsupported actors and out-of-table levels", () => {
    expect(compileSpiritMagusActionSet({
      skillGuid: "not-a-spirit-magus",
      enabled: true,
      level: 20,
      supports: [null, null, null, null, null],
    }, {
      patch: "SS13",
      sourceLocator: "test.skill",
    })).toMatchObject({ code: "unsupported-summon-action-set" });
    expect(compileSpiritMagusActionSet({
      skillGuid: SUMMON_ROCK_MAGUS_ID,
      enabled: true,
      level: 0,
      supports: [null, null, null, null, null],
    }, {
      patch: "SS13",
      sourceLocator: "test.skill",
    })).toMatchObject({ code: "unsupported-summon-action-level" });
    expect(compileSpiritMagusActionSet({
      skillGuid: SUMMON_ROCK_MAGUS_ID,
      enabled: true,
      level: 20,
      supports: [null, null, null, null, null],
    }, {
      patch: "SS14",
      sourceLocator: "test.skill",
    })).toMatchObject({ code: "unsupported-patch" });
    expect(compileIrisTraitEvidence({
      hero: { heroGuid: "another-hero", traits: {} },
    })).toEqual([]);
  });

  it("requires an explicitly enabled parent summon", () => {
    for (const enabled of [false, undefined]) {
      const skill = structuredClone(
        summon(wuxia().loadouts.loadouts[8], SUMMON_ROCK_MAGUS_ID),
      );
      if (enabled === undefined) delete skill.enabled;
      else skill.enabled = enabled;
      expect(compileSpiritMagusActionSet(skill, {
        patch: "SS13",
        sourceLocator: "test.skill",
      })).toMatchObject({ code: "disabled-summon-skill" });
    }
  });

  it("withholds malformed support sockets without throwing or fabricating a sixth", () => {
    for (const supports of [
      null,
      {},
      [null, null, null, null],
      [null, null, null, null, null, {
        supportGuid: "sixth",
        type: "support",
        level: 20,
      }],
    ]) {
      const skill = structuredClone(
        summon(wuxia().loadouts.loadouts[8], SUMMON_ROCK_MAGUS_ID),
      );
      skill.supports = supports;
      const result = compileSpiritMagusActionSet(skill, {
        patch: "SS13",
        sourceLocator: "test.skill",
      });
      expect(result).not.toHaveProperty("code");
      if ("code" in result) throw new Error(result.message);
      expect(result.actions).toHaveLength(4);
      expect(result.supports).toEqual([
        expect.objectContaining({
          status: "unsupported",
          blockers: [
            expect.objectContaining({ code: "malformed-minion-support-sockets" }),
          ],
        }),
      ]);
    }

    const primitive = structuredClone(
      summon(wuxia().loadouts.loadouts[8], SUMMON_ROCK_MAGUS_ID),
    );
    primitive.supports = [42, null, null, null, null];
    const primitiveResult = compiled(primitive);
    expect(primitiveResult.supports).toEqual([
      expect.objectContaining({
        status: "unsupported",
        blockers: [
          expect.objectContaining({
            code: "malformed-minion-support-record",
            evidence: "loadouts.loadouts[0].skills.activeSkills[0].supports[0]",
          }),
        ],
      }),
    ]);
  });

  it("rejects spoofed support types, levels, and roll projections", () => {
    const ordinary = structuredClone(
      summon(wuxia().loadouts.loadouts[8], SUMMON_ROCK_MAGUS_ID),
    );
    ordinary.supports[0].type = "magnificent_support";
    let result = compiled(ordinary);
    expect(result.supports[0]).toMatchObject({
      status: "unsupported",
      blockers: [{ code: "invalid-minion-support-installation" }],
    });

    ordinary.supports[0].type = "support";
    ordinary.supports[0].level = "20";
    result = compiled(ordinary);
    expect(result.supports[0]).toMatchObject({
      status: "unsupported",
      blockers: [{ code: "unsupported-support-level" }],
    });

    const erosion = structuredClone(
      summon(wuxia().loadouts.loadouts[8], SUMMON_EROSION_MAGUS_ID),
    );
    erosion.supports[2].rollValues = "not-an-array";
    result = compiled(erosion);
    expect(result.supports[2]).toMatchObject({
      status: "unsupported",
      blockers: [{ code: "malformed-minion-support-rolls" }],
    });

    for (const supportIndex of [2, 4]) {
      const spoofed = structuredClone(
        summon(wuxia().loadouts.loadouts[8], SUMMON_EROSION_MAGUS_ID),
      );
      spoofed.supports[supportIndex].type = "support";
      const spoofedResult = compiled(spoofed);
      expect(spoofedResult.supports[supportIndex]).toMatchObject({
        status: "unsupported",
        blockers: [{ code: "invalid-minion-support-installation" }],
      });
    }
  });

  it("rejects level-support roll metadata and special-support level metadata", () => {
    for (const metadata of [
      { tier: 99 },
      { rank: 99 },
      { rollValues: [999] },
    ]) {
      const skill = structuredClone(
        summon(wuxia().loadouts.loadouts[8], SUMMON_ROCK_MAGUS_ID),
      );
      Object.assign(skill.supports[0], metadata);
      expect(compiled(skill).supports[0]).toMatchObject({
        status: "unsupported",
        blockers: [{
          code: "invalid-minion-support-encoding",
          evidence: "loadouts.loadouts[0].skills.activeSkills[0].supports[0]",
        }],
      });
    }

    const special = structuredClone(
      summon(wuxia().loadouts.loadouts[8], SUMMON_EROSION_MAGUS_ID),
    );
    special.supports[2].level = 20;
    expect(compiled(special).supports[2]).toMatchObject({
      status: "unsupported",
      blockers: [{ code: "invalid-minion-support-encoding" }],
    });
  });

  it("guards special-support rank, tier, range, and single-roll shape", () => {
    for (const mutate of [
      (support: any) => { support.rank = 2; },
      (support: any) => { support.tier = 99; },
      (support: any) => { support.rollValues = [-99]; },
      (support: any) => { support.rollValues = [-9, -10]; },
    ]) {
      const skill = structuredClone(
        summon(wuxia().loadouts.loadouts[8], SUMMON_EROSION_MAGUS_ID),
      );
      mutate(skill.supports[2]);
      expect(compiled(skill).supports[2]).toMatchObject({
        status: "unsupported",
        blockers: [{
          code: "unsupported-frequent-quake-roll",
          evidence: "loadouts.loadouts[0].skills.activeSkills[0].supports[2]",
        }],
      });
    }
    for (const mutate of [
      (support: any) => { support.rank = 0; },
      (support: any) => { support.tier = -1; },
      (support: any) => { support.rollValues = [999]; },
      (support: any) => { support.rollValues = [26, 27]; },
    ]) {
      const skill = structuredClone(
        summon(wuxia().loadouts.loadouts[8], SUMMON_EROSION_MAGUS_ID),
      );
      mutate(skill.supports[4]);
      expect(compiled(skill).supports[4]).toMatchObject({
        status: "unsupported",
        blockers: [{
          code: "unsupported-malady-roll",
          evidence: "loadouts.loadouts[0].skills.activeSkills[0].supports[4]",
        }],
      });
    }
  });

  it("uses socket presence rather than a non-schema support enabled flag", () => {
    const skill = structuredClone(
      summon(wuxia().loadouts.loadouts[8], SUMMON_ROCK_MAGUS_ID),
    );
    skill.supports[0].enabled = false;
    expect(compiled(skill).supports[0]).toMatchObject({
      status: "source-terms",
      supportName: "Precise: Superpower",
    });
  });

  it("rejects summon-specific magnificent and noble supports on the wrong actor", () => {
    const erosion = summon(
      wuxia().loadouts.loadouts[8],
      SUMMON_EROSION_MAGUS_ID,
    );
    for (const supportIndex of [2, 4]) {
      const rock = structuredClone(
        summon(wuxia().loadouts.loadouts[8], SUMMON_ROCK_MAGUS_ID),
      );
      rock.supports[0] = structuredClone(erosion.supports[supportIndex]);
      const result = compiled(rock);
      expect(result.supports[0]).toMatchObject({
        status: "unsupported",
        blockers: [{
          code: supportIndex === 2
            ? "wrong-summon-for-frequent-quake"
            : "wrong-summon-for-malady",
        }],
      });
    }
  });
});
