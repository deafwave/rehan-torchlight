import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SUMMON_EROSION_MAGUS_ID,
  SUMMON_ROCK_MAGUS_ID,
} from "../src/guardedCompiler.js";
import {
  compileIrisTraitEvidence,
  compileSpiritMagusActionSet,
} from "../src/minionActionEvidence.js";
import {
  compileKnownMinionDamageActions,
} from "../src/minionDamageEnvelope.js";
import {
  compareWuxiaSummonEvidence,
  compileWuxiaSummonEvidence,
} from "../src/minionEvidence.js";
import { fromRoot } from "../src/py.js";

const readJson = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"));
const wuxia = () => readJson(fromRoot("data/builds/WuxiaSS13.json"));

function summon(loadout: any, id: string): any {
  return [
    ...(loadout.skills.activeSkills ?? []),
    ...(loadout.skills.passiveSkills ?? []),
  ].find((skill: any) => skill.skillGuid === id);
}

function erosionAt(index: number) {
  const result = compileWuxiaSummonEvidence(wuxia(), index);
  if (result.status !== "source-terms") {
    throw new Error(result.blockers.map((blocker) => blocker.message).join(" "));
  }
  const erosion = result.summons.find((entry) =>
    entry.skillId === SUMMON_EROSION_MAGUS_ID);
  if (!erosion) throw new Error("missing Erosion Magus");
  return erosion;
}

describe("confirmed Spirit Magus per-contact damage envelope", () => {
  it("quantifies the exact 15T to 15T SS20 Malady roll without calling it DPS", () => {
    const before = erosionAt(7);
    const after = erosionAt(8);
    const beforeByName = new Map(before.actions.map((action) =>
      [action.actionName, action.knownDamage]));
    const afterByName = new Map(after.actions.map((action) =>
      [action.actionName, action.knownDamage]));

    const beforeScattered = beforeByName.get("Scattered Mud");
    const afterScattered = afterByName.get("Scattered Mud");
    expect(beforeScattered).toMatchObject({
      status: "calculated-partial",
      metric: "known-unmitigated-damage-per-contact",
      isDps: false,
      isTotalDamage: false,
      rawPerContact: 300,
      deterministicContacts: 1,
      multiplier: 0.8784,
      knownPerContact: 263.52,
      knownDeterministicFullContact: 263.52,
    });
    expect(afterScattered).toMatchObject({
      status: "calculated-partial",
      isDps: false,
      isTotalDamage: false,
      multiplier: 0.9072,
      knownPerContact: 272.16,
      knownDeterministicFullContact: 272.16,
    });

    expect(beforeScattered?.factors.map((factor) => [
      factor.sourceName,
      factor.termId,
      factor.valuePct,
      factor.multiplier,
    ])).toEqual([
      ["Elemental Duo", "additional-minion-damage", 25, 1.25],
      [
        "Summon Erosion Magus: Frequent Quake (Magnificent)",
        "additional-minion-damage",
        20,
        1.2,
      ],
      [
        "Summon Erosion Magus: Malady (Noble)",
        "additional-minion-damage-fixed",
        20,
        1.2,
      ],
      [
        "Summon Erosion Magus: Malady (Noble)",
        "additional-minion-damage-roll",
        22,
        1.22,
      ],
      [
        "Whirlwind Tango",
        "additional-spirit-magus-skill-damage",
        -60,
        0.4,
      ],
    ]);
    expect(afterScattered?.factors.find((factor) =>
      factor.termId === "additional-minion-damage-roll")).toMatchObject({
        valuePct: 26,
        multiplier: 1.26,
      });

    expect(beforeByName.get("Bleak Grass")).toMatchObject({
      rawPerContact: 486,
      rawDeterministicFullContact: 972,
      knownPerContact: 426.9024,
      knownDeterministicFullContact: 853.8048,
    });
    expect(afterByName.get("Bleak Grass")).toMatchObject({
      knownPerContact: 440.8992,
      knownDeterministicFullContact: 881.7984,
    });
    expect(beforeByName.get("World of Thorns")).toMatchObject({
      rawPerContact: 6_894,
      knownPerContact: 6_055.6896,
      knownDeterministicFullContact: null,
    });
    expect(afterByName.get("World of Thorns")).toMatchObject({
      knownPerContact: 6_254.2368,
      knownDeterministicFullContact: null,
    });
    expect(beforeByName.get("Withering Payback")).toMatchObject({
      status: "not-damaging",
      knownPerContact: null,
      isDps: false,
      isTotalDamage: false,
    });
  });

  it("attributes and reconciles the isolated +3.2787% Malady change", () => {
    const comparison = compareWuxiaSummonEvidence(wuxia(), 7, 8);
    if (comparison.status !== "source-terms") {
      throw new Error("expected source terms");
    }
    const erosionChanges = comparison.actionDamageChanges.filter((change) =>
      change.skillId === SUMMON_EROSION_MAGUS_ID);
    expect(erosionChanges.map((change) => change.actionName)).toEqual([
      "Scattered Mud",
      "Bleak Grass",
      "World of Thorns",
    ]);
    for (const change of erosionChanges) {
      expect(change.isDps).toBe(false);
      expect(change.isTotalDamage).toBe(false);
      expect(change.foundationRatio).toBe(1);
      expect(change.ratio).toBeCloseTo(1.26 / 1.22, 12);
      expect(change.deltaPct).toBeCloseTo(3.27868852459, 10);
      expect(change.factorChanges).toHaveLength(1);
      expect(change.factorChanges[0]).toMatchObject({
        sourceName: "Summon Erosion Magus: Malady (Noble)",
        termId: "additional-minion-damage-roll",
        beforeValuePct: 22,
        afterValuePct: 26,
        beforeMultiplier: 1.22,
        afterMultiplier: 1.26,
      });
      const reconciled = (change.foundationRatio ?? 1)
        * change.factorChanges.reduce(
          (product, factor) => product * (factor.ratio ?? 1),
          1,
        );
      expect(reconciled).toBeCloseTo(change.ratio ?? 0, 12);
    }
  });

  it("keeps conditional, cadence, and non-multiplier inputs out of the product", () => {
    const evidence = erosionAt(8);
    const scattered = evidence.actions.find((action) =>
      action.actionName === "Scattered Mud");
    expect(scattered?.knownDamage.factors.map((factor) =>
      factor.sourceName)).not.toContain("Ailment Termination");
    expect(scattered?.knownDamage.factors.map((factor) =>
      factor.sourceName)).not.toContain("Quick Decision");
    expect(scattered?.knownDamage.excluded.map((blocker) =>
      blocker.code)).toEqual(expect.arrayContaining([
        "conditional-minion-damage-factor",
        "missing-minion-runtime-state",
        "missing-minion-ai-rotation",
        "unsupported-minion-modifier-pools",
      ]));

    const build = wuxia();
    const earlyRock = compileWuxiaSummonEvidence(build, 0);
    if (earlyRock.status !== "source-terms") throw new Error("expected terms");
    const rock = earlyRock.summons.find((entry) =>
      entry.skillId === SUMMON_ROCK_MAGUS_ID);
    const shattered = rock?.actions.find((action) =>
      action.actionName === "Shattered Stone");
    expect(shattered?.knownDamage.factors.map((factor) =>
      factor.sourceName)).not.toContain("Recklessness");
    expect(shattered?.knownDamage.excluded.map((blocker) =>
      blocker.code)).toContain("non-multiplicative-minion-damage-input");
  });

  it("uses exact action tags for ordinary support factors", () => {
    const build = wuxia();
    const loadoutZero = compileWuxiaSummonEvidence(build, 0);
    const loadoutOne = compileWuxiaSummonEvidence(build, 1);
    if (loadoutZero.status !== "source-terms"
        || loadoutOne.status !== "source-terms") {
      throw new Error("expected source terms");
    }
    const erosion = loadoutZero.summons.find((entry) =>
      entry.skillId === SUMMON_EROSION_MAGUS_ID);
    const erosionFactors = erosion?.actions.find((action) =>
      action.actionName === "Scattered Mud")?.knownDamage.factors ?? [];
    expect(erosionFactors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceName: "Spell Concentration",
        valuePct: 32,
        applicability: { kind: "all-tags", tags: ["spell", "area"] },
      }),
      expect.objectContaining({
        sourceName: "Servant Damage",
        valuePct: 24,
      }),
    ]));

    const rock = loadoutOne.summons.find((entry) =>
      entry.skillId === SUMMON_ROCK_MAGUS_ID);
    const rockFactors = rock?.actions.find((action) =>
      action.actionName === "Shattered Stone")?.knownDamage.factors ?? [];
    expect(rockFactors).toContainEqual(expect.objectContaining({
      sourceName: "Precision Strike",
      valuePct: 21,
      applicability: {
        kind: "all-tags",
        tags: ["melee", "attack", "area"],
      },
    }));
  });

  it("fails closed when one minion damage-factor support occupies two sockets", () => {
    const build = wuxia();
    const skill = summon(
      build.loadouts.loadouts[8],
      SUMMON_EROSION_MAGUS_ID,
    );
    skill.supports[1] = structuredClone(skill.supports[0]);

    const result = compileWuxiaSummonEvidence(build, 8);
    if (result.status !== "source-terms") {
      throw new Error(result.blockers.map((blocker) => blocker.message).join(" "));
    }
    const erosion = result.summons.find((entry) =>
      entry.skillId === SUMMON_EROSION_MAGUS_ID);
    const scattered = erosion?.actions.find((action) =>
      action.actionName === "Scattered Mud");
    const duplicateId = skill.supports[0].supportGuid;

    expect(erosion?.supports.filter((support) =>
      support.supportId === duplicateId)).toMatchObject([
      { socketIndex: 0, socketId: "support:0" },
      { socketIndex: 1, socketId: "support:1" },
    ]);
    expect(scattered?.knownDamage.factors.some((factor) =>
      factor.sourceId === duplicateId)).toBe(false);
    expect(scattered?.knownDamage.excluded).toContainEqual(
      expect.objectContaining({
        code: "duplicate-minion-damage-factor-support",
        evidence: expect.stringMatching(/socket 1.*socket 2/),
      }),
    );
    expect(scattered?.knownDamage.isDps).toBe(false);
    expect(scattered?.knownDamage.isTotalDamage).toBe(false);
  });

  it("does not turn a newly ambiguous duplicate factor into an apparent damage loss", () => {
    const build = wuxia();
    build.loadouts.loadouts[7] =
      structuredClone(build.loadouts.loadouts[8]);
    build.loadouts.loadouts[8] =
      structuredClone(build.loadouts.loadouts[7]);
    const afterSkill = summon(
      build.loadouts.loadouts[8],
      SUMMON_EROSION_MAGUS_ID,
    );
    afterSkill.supports[1] = structuredClone(afterSkill.supports[0]);

    const comparison = compareWuxiaSummonEvidence(build, 7, 8);
    if (comparison.status !== "source-terms") {
      throw new Error("expected source-term comparison");
    }
    const erosionChanges = comparison.actionDamageChanges.filter((change) =>
      change.skillId === SUMMON_EROSION_MAGUS_ID);

    expect(erosionChanges).toEqual([]);
    expect(comparison.changes.find((change) =>
      change.skillId === SUMMON_EROSION_MAGUS_ID)?.after?.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          knownDamage: expect.objectContaining({
            excluded: expect.arrayContaining([
              expect.objectContaining({
                code: "duplicate-minion-damage-factor-support",
              }),
            ]),
          }),
        }),
      ]),
    );
  });

  it("rejects invalid factor values instead of producing zero or negative damage", () => {
    const build = wuxia();
    const loadout = build.loadouts.loadouts[8];
    const skill = summon(loadout, SUMMON_EROSION_MAGUS_ID);
    const actionSet = compileSpiritMagusActionSet(skill, {
      patch: "SS13",
      sourceLocator: "loadouts.loadouts[8].skills.activeSkills[2]",
    });
    if ("code" in actionSet) throw new Error(actionSet.message);
    const malady = actionSet.supports.find((support) =>
      support.supportName === "Summon Erosion Magus: Malady (Noble)");
    if (!malady || malady.status !== "source-terms") {
      throw new Error("expected Malady source terms");
    }
    const roll = malady.effects.find((term) =>
      term.id === "additional-minion-damage-roll");
    if (!roll) throw new Error("expected rolled term");
    roll.value = -100;

    const actions = compileKnownMinionDamageActions(
      actionSet.actions,
      actionSet.supports,
      compileIrisTraitEvidence(loadout),
      actionSet.blockers,
    );
    const scattered = actions.find((action) =>
      action.actionName === "Scattered Mud");
    expect(scattered?.knownDamage.factors.some((factor) =>
      factor.termId === "additional-minion-damage-roll")).toBe(false);
    expect(scattered?.knownDamage.excluded).toContainEqual(
      expect.objectContaining({ code: "invalid-minion-damage-factor" }),
    );
    expect(scattered?.knownDamage.multiplier).toBeGreaterThan(0);
  });
});
