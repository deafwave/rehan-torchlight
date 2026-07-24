import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { fromRoot } from "../src/py.js";
import {
  assessCompendiumBuild,
  BING_BLAST_NOVA_ID,
  compareBingWeaponFoundations,
  compileBingWeaponFoundation,
  HAMMER_OF_ASH_ID,
  IRIS_VIGILANT_BREEZE_ID,
  ss13HammerOfAshFormula,
  SS13_HAMMER_FORMULA_SOURCE,
  WEAPON_FOUNDATION_RULE_SOURCE,
} from "../src/guardedCompiler.js";

const readJson = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"));
const bing = () => readJson(fromRoot("data/builds/bing_china.json"));
const wuxia = () => readJson(fromRoot("data/builds/WuxiaSS13.json"));

describe("SS13 formula evidence", () => {
  it("uses the exact Hammer of Ash level table without extrapolating past its range", () => {
    expect(ss13HammerOfAshFormula(1)?.weaponAttackDamagePct).toBe(126);
    expect(ss13HammerOfAshFormula(19)?.weaponAttackDamagePct).toBe(352);
    expect(ss13HammerOfAshFormula(20)?.weaponAttackDamagePct).toBe(369);
    expect(ss13HammerOfAshFormula(40)?.weaponAttackDamagePct).toBe(369);
    expect(ss13HammerOfAshFormula(0)).toBeNull();
    expect(ss13HammerOfAshFormula(20.5)).toBeNull();
    expect(ss13HammerOfAshFormula(41)).toBeNull();
    expect(SS13_HAMMER_FORMULA_SOURCE.sha256).toHaveLength(64);
  });

  it("pins the formula IDs to the poorchlight SS13 identity catalog", () => {
    const catalog = readJson(fromRoot("../poorchlight/tli_dump/data/compendium-catalog-ss13.json"));
    const hammer = catalog.entries.find((entry: any) => entry.id === HAMMER_OF_ASH_ID);
    const bingHero = catalog.entries.find((entry: any) => entry.id === BING_BLAST_NOVA_ID);

    expect(hammer).toMatchObject({
      domain: "skill",
      gameId: "7006",
      label: "Hammer of Ash",
    });
    expect(bingHero).toMatchObject({
      domain: "hero-trait",
      gameId: "4001",
      label: "Bing: Blast Nova",
    });
  });
});

describe("guarded Bing weapon foundation", () => {
  it("computes an exact partial hit foundation while refusing to label it DPS", () => {
    const result = compileBingWeaponFoundation(bing(), 0);
    expect(result.status).toBe("calculated-partial");
    if (result.status !== "calculated-partial") throw new Error("expected a partial result");

    expect(result.isDps).toBe(false);
    expect(result.heroId).toBe(BING_BLAST_NOVA_ID);
    expect(result.skillId).toBe(HAMMER_OF_ASH_ID);
    expect(result.skillWeaponAttackDamagePct).toBe(369);
    expect(result.confidence).toBe("inferred-partial");
    expect(result.weaponPhysical.average).toBeCloseTo(349.86, 9);
    expect(result.weaponElemental.fire.average).toBeCloseTo(70, 9);
    expect(result.weaponTotal.average).toBeCloseTo(419.86, 9);
    expect(result.rawWeaponSourcedHit.average).toBeCloseTo(1549.2834, 9);
    expect(result.localWeaponAttackRate).toBeCloseTo(1.5, 9);
    expect(result.excludedFromMetric.join(" ")).toContain("Blast Nova");
  });

  it("includes explicit off-slot main-hand additions and local attack-rate rolls", () => {
    const result = compileBingWeaponFoundation(bing(), 3);
    expect(result.status).toBe("calculated-partial");
    if (result.status !== "calculated-partial") throw new Error("expected a partial result");

    // Base 220-220 + base affix 68-81 + two crafted flat ranges
    // + Fool's Crown 102-136, all scaled by +176% Gear Physical Damage.
    expect(result.weaponPhysical.min).toBeCloseTo(1429.68, 9);
    expect(result.weaponPhysical.max).toBeCloseTo(1636.68, 9);
    expect(result.weaponPhysical.average).toBeCloseTo(1533.18, 9);
    expect(result.rawWeaponSourcedHit.average).toBeCloseTo(5657.4342, 9);
    expect(result.localWeaponAttackRate).toBeCloseTo(1.74, 9);
    expect(result.confidence).toBe("confirmed-partial");
    expect(result.provenance.some((source) =>
      source.locator.includes("Adds 102 - 136 Physical Damage to the Main-Hand Weapon"))).toBe(true);
    expect(result.provenance).toContainEqual(WEAPON_FOUNDATION_RULE_SOURCE);
  });

  it("scans explicitly equipped Vorax items with the same guarded main-hand rules", () => {
    const baseline = compileBingWeaponFoundation(bing(), 0);
    const build = bing();
    const loadout = build.loadouts.loadouts[0];
    loadout.vorax.inventory.push({
      id: "test-vorax-main-hand-modifier",
      affixes: [
        {
          modifierDescription: "Adds 10 - 20 Physical Damage to the Main-Hand Weapon",
          rolledValues: [],
        },
        {
          modifierDescription: "+10% Main-Hand Weapon Attack Speed",
          rolledValues: [],
        },
      ],
    });
    loadout.vorax.equipped.digits = "test-vorax-main-hand-modifier";

    const result = compileBingWeaponFoundation(build, 0);
    expect(baseline.status).toBe("calculated-partial");
    expect(result.status).toBe("calculated-partial");
    if (baseline.status !== "calculated-partial"
        || result.status !== "calculated-partial") {
      throw new Error("expected guarded weapon foundations");
    }

    expect(result.weaponPhysical.average - baseline.weaponPhysical.average)
      .toBeCloseTo(22.05, 9);
    expect(result.rawWeaponSourcedHit.average - baseline.rawWeaponSourcedHit.average)
      .toBeCloseTo(81.3645, 9);
    expect(result.localWeaponAttackRate).toBeCloseTo(1.65, 9);
    expect(result.provenance).toEqual(expect.arrayContaining([
      expect.objectContaining({
        locator: expect.stringContaining(
          "vorax.digits.affixes[0]: Adds 10 - 20 Physical Damage to the Main-Hand Weapon",
        ),
      }),
      expect.objectContaining({
        locator: expect.stringContaining(
          "vorax.digits.affixes[1]: +10% Main-Hand Weapon Attack Speed",
        ),
      }),
    ]));
  });

  it("distinguishes an explicit empty Vorax projection from a truncated one", () => {
    const explicitEmpty = bing();
    explicitEmpty.loadouts.loadouts[0].vorax = {
      inventory: [],
      equipped: {},
    };
    expect(compileBingWeaponFoundation(explicitEmpty, 0).status)
      .toBe("calculated-partial");

    const truncated = bing();
    delete truncated.loadouts.loadouts[0].vorax;
    expect(compileBingWeaponFoundation(truncated, 0)).toMatchObject({
      status: "not-calculated",
      blockers: [{ code: "missing-vorax-equipment-projection" }],
    });

    const malformed = bing();
    malformed.loadouts.loadouts[0].vorax.inventory = {};
    expect(compileBingWeaponFoundation(malformed, 0)).toMatchObject({
      status: "not-calculated",
      blockers: [{ code: "missing-vorax-equipment-projection" }],
    });
  });

  it("fails malformed or ambiguous parent and equipped-item projections closed", () => {
    const malformedSkills = bing();
    malformedSkills.loadouts.loadouts[0].skills.activeSkills = {};
    expect(() => compileBingWeaponFoundation(malformedSkills, 0)).not.toThrow();
    expect(compileBingWeaponFoundation(malformedSkills, 0)).toMatchObject({
      status: "not-calculated",
      blockers: [{ code: "malformed-active-skill-projection" }],
    });

    const truncatedSkills = bing();
    truncatedSkills.loadouts.loadouts[0].skills.activeSkills.pop();
    expect(compileBingWeaponFoundation(truncatedSkills, 0)).toMatchObject({
      status: "not-calculated",
      blockers: [{ code: "malformed-active-skill-projection" }],
    });

    const implicitParent = bing();
    delete implicitParent.loadouts.loadouts[0].skills.activeSkills[0].enabled;
    expect(compileBingWeaponFoundation(implicitParent, 0)).toMatchObject({
      status: "not-calculated",
      blockers: [{ code: "missing-hammer-of-ash" }],
    });

    const duplicateParent = bing();
    duplicateParent.loadouts.loadouts[0].skills.activeSkills[1] =
      structuredClone(duplicateParent.loadouts.loadouts[0].skills.activeSkills[0]);
    expect(compileBingWeaponFoundation(duplicateParent, 0)).toMatchObject({
      status: "not-calculated",
      blockers: [{ code: "duplicate-hammer-of-ash" }],
    });

    for (const mutate of [
      (weapon: any) => { weapon.baseItem.implicits = {}; },
      (weapon: any) => { weapon.prefixes = {}; },
      (weapon: any) => { weapon.legendaryMods = {}; },
    ]) {
      const malformedItem = bing();
      const loadout = malformedItem.loadouts.loadouts[0];
      const weapon = loadout.gear.inventory.find(
        (item: any) => item.id === loadout.gear.equipped.mainHand,
      );
      mutate(weapon);
      expect(() => compileBingWeaponFoundation(malformedItem, 0)).not.toThrow();
      expect(compileBingWeaponFoundation(malformedItem, 0)).toMatchObject({
        status: "not-calculated",
        blockers: [{ code: "malformed-equipped-item-projection" }],
      });
    }
  });

  it("can prove a weapon-foundation loss without claiming a total DPS loss", () => {
    const before = compileBingWeaponFoundation(bing(), 3);
    const after = compileBingWeaponFoundation(bing(), 4);
    expect(before.status).toBe("calculated-partial");
    expect(after.status).toBe("calculated-partial");
    if (before.status !== "calculated-partial" || after.status !== "calculated-partial") {
      throw new Error("expected partial results");
    }

    const ratio = after.rawWeaponSourcedHit.average / before.rawWeaponSourcedHit.average;
    expect(ratio).toBeCloseTo(0.8541854185, 9);
    expect(before.isDps).toBe(false);
    expect(after.isDps).toBe(false);
  });

  it("exports a provenance-carrying A/B payload suitable for a generator", () => {
    const comparison = compareBingWeaponFoundations(bing(), 3, 4);
    expect(comparison.status).toBe("calculated-partial");
    if (comparison.status !== "calculated-partial") {
      throw new Error("expected a partial comparison");
    }

    expect(comparison.isDps).toBe(false);
    expect(comparison.kind).toBe("weapon-hit-foundation-comparison");
    expect(comparison.before.loadoutIndex).toBe(3);
    expect(comparison.after.loadoutIndex).toBe(4);
    expect(comparison.change).toMatchObject({ direction: "loss" });
    expect(comparison.change.rawHitDelta).toBeCloseTo(-824.9364, 7);
    expect(comparison.change.rawHitDeltaPct).toBeCloseTo(-14.58145815, 7);
    expect(comparison.warning).toContain("not total hit damage or DPS");
    expect(comparison.provenance).toContainEqual(SS13_HAMMER_FORMULA_SOURCE);
  });

  it("fails closed for another actor, patch, skill, or weapon class", () => {
    const wrongActor = compileBingWeaponFoundation(wuxia(), 0);
    expect(wrongActor.status).toBe("not-calculated");
    if (wrongActor.status === "not-calculated") {
      expect(wrongActor.blockers[0].code).toBe("unsupported-actor");
    }

    const wrongPatch = bing();
    wrongPatch.patch = "SS14";
    expect(compileBingWeaponFoundation(wrongPatch, 0)).toMatchObject({
      status: "not-calculated",
      blockers: [{ code: "unsupported-patch" }],
    });

    const wrongSkill = bing();
    wrongSkill.loadouts.loadouts[0].skills.activeSkills[0].skillGuid = "unknown";
    expect(compileBingWeaponFoundation(wrongSkill, 0)).toMatchObject({
      status: "not-calculated",
      blockers: [{ code: "missing-hammer-of-ash" }],
    });

    const wrongWeapon = bing();
    const loadout = wrongWeapon.loadouts.loadouts[0];
    const weapon = loadout.gear.inventory.find((item: any) =>
      item.id === loadout.gear.equipped.mainHand);
    weapon.rarity = "Legendary";
    expect(compileBingWeaponFoundation(wrongWeapon, 0)).toMatchObject({
      status: "not-calculated",
      blockers: [{ code: "unsupported-main-hand-class" }],
    });

    const unavailable = compareBingWeaponFoundations(wuxia(), 0, 1);
    expect(unavailable).toMatchObject({
      status: "not-calculated",
      isDps: false,
    });
    expect(unavailable.status === "not-calculated"
      ? unavailable.blockers.map((blocker) => blocker.code)
      : []).toEqual(["unsupported-actor", "unsupported-actor"]);
  });
});

describe("full-calculation safety assessment", () => {
  it("keeps Bing total DPS and EHP unavailable even when the partial foundation exists", () => {
    const assessment = assessCompendiumBuild(bing(), 3);
    expect(assessment.actor).toBe("player");
    expect(assessment.heroId).toBe(BING_BLAST_NOVA_ID);
    expect(assessment.dps.status).toBe("not-calculated");
    expect(assessment.ehp.status).toBe("not-calculated");
    expect(assessment.weaponFoundation.status).toBe("calculated-partial");
    expect(assessment.dps.blockers.map((blocker) => blocker.code)).toContain(
      "missing-blast-nova-rotation",
    );
  });

  it("keeps Wuxia actor-scoped and exposes no player-weapon proxy DPS", () => {
    const assessment = assessCompendiumBuild(wuxia(), 8);
    expect(assessment.actor).toBe("minion");
    expect(assessment.heroId).toBe(IRIS_VIGILANT_BREEZE_ID);
    expect(assessment.dps.status).toBe("not-calculated");
    expect(assessment.ehp.status).toBe("not-calculated");
    expect(assessment.weaponFoundation.status).toBe("not-calculated");
    expect(assessment.dps.blockers.map((blocker) => blocker.code)).toContain(
      "missing-minion-ai-rotation",
    );
    expect(assessment.weaponFoundation.isDps).toBe(false);
  });
});
