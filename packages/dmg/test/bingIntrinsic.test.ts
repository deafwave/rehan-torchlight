import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { fromRoot } from "../src/py.js";
import {
  BLAST_BARRAGE_TRAIT_ID,
  BLAST_NOVA_BASE_TRAIT_ID,
  compileBingIntrinsicEnvelope,
  HERO_TRAIT_LEVEL_MEMORY_MOD_IDS,
  IRON_LION_ID,
  MULTIPLE_PROJECTILES_SUPPORT_ID,
} from "../src/bingIntrinsic.js";

const readJson = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"));
const bing = () => readJson(fromRoot("../bing_china.json"));
const wuxia = () => readJson(fromRoot("../WuxiaSS13.json"));

describe("guarded SS13 Bing intrinsic envelope", () => {
  it("covers all seven supplied loadouts without publishing a total hit or DPS", () => {
    const build = bing();
    const normalAverages = [
      1549.2834,
      2368.37115,
      2368.37115,
      5657.4342,
      4832.4978,
      4832.4978,
      4761.207,
    ];
    const chargedAverages = [
      4880.24271,
      7460.3691225,
      7460.3691225,
      17820.91773,
      15222.36807,
      15222.36807,
      14997.80205,
    ];

    for (let index = 0; index < build.loadouts.loadouts.length; index += 1) {
      const result = compileBingIntrinsicEnvelope(build, index);
      expect(result.status).toBe("calculated-partial");
      if (result.status !== "calculated-partial") throw new Error("expected guarded envelope");
      expect(result.isDps).toBe(false);
      expect(result.isTotalHit).toBe(false);
      expect(result.normalWeaponSourcedPerHit.total.average)
        .toBeCloseTo(normalAverages[index], 7);
      expect(result.demolisherChargedWeaponSourcedPerHit.total.average)
        .toBeCloseTo(chargedAverages[index], 7);
      expect(result.topology.status).toBe(index < 2
        ? "not-calculated"
        : "calculated-partial");
      expect(result.effectiveTargetHits.status).toBe("not-calculated");
      expect(result.actualDps.status).toBe("not-calculated");
    }
  });

  it("routes the imported weapon portions through Hammer's exact conversion", () => {
    const result = compileBingIntrinsicEnvelope(bing(), 0);
    expect(result.status).toBe("calculated-partial");
    if (result.status !== "calculated-partial") throw new Error("expected guarded envelope");

    expect(result.normalWeaponSourcedPerHit.portions).toMatchObject({
      physical: { average: 0 },
      cold: { average: 0 },
      fire: { average: 1549.2834 },
      lightning: { average: 0 },
      erosion: { average: 0 },
    });
    expect(result.normalWeaponSourcedPerHit.total.average).toBeCloseTo(1549.2834, 7);
    expect(result.demolisherChargedWeaponSourcedPerHit.multiplier).toBe(3.15);
    expect(result.demolisherChargedWeaponSourcedPerHit.total.average)
      .toBeCloseTo(4880.24271, 7);
    expect(result.conversion).toEqual([{
      from: "physical",
      to: "fire",
      percent: 100,
    }]);
    expect(result.topology).toMatchObject({
      status: "not-calculated",
      isDps: false,
      isTargetHits: false,
      blockers: [{ code: "missing-recorded-blast-nova-trait" }],
    });
  });

  it("proves the source-visible emission distribution but leaves target geometry unresolved", () => {
    const result = compileBingIntrinsicEnvelope(bing(), 3);
    expect(result.status).toBe("calculated-partial");
    if (result.status !== "calculated-partial") throw new Error("expected guarded envelope");

    expect(result.heroBaseTraitId).toBe(BLAST_NOVA_BASE_TRAIT_ID);
    expect(result.topology).toMatchObject({
      status: "calculated-partial",
      scope: "source-visible emitted projectiles per throw",
      isDps: false,
      isTargetHits: false,
      heroTraitLevels: {
        level1: 1,
        level45: 2,
        level60: 2,
        level75: 2,
      },
      blastNovaAdditionalBombDamagePct: 0,
      firepowerMovingThrowSpeedAdditionalPct: -37,
      blastBarrageAdditionalBombChancePct: 25,
      frenzyHoundNearbyAdditionalDamagePct: 40,
      intrinsicBombsPerThrow: 2,
      intrinsicProjectilesPerBomb: 5,
      projectileQuantitySources: [
        expect.objectContaining({ id: "hammer-of-ash", quantity: 3 }),
        expect.objectContaining({ id: "blast-nova", quantity: 2 }),
        expect.objectContaining({ id: "iron-lion", quantity: 2 }),
        expect.objectContaining({ id: "placed-divinity-slate", quantity: 2 }),
      ],
      projectilesPerBomb: 9,
      bombCountOutcomes: [
        { bombs: 2, probability: 0.75 },
        { bombs: 4, probability: 0.25 },
      ],
      expectedBombsPerThrow: 2.5,
      emittedProjectilesPerThrowOutcomes: [
        { bombs: 2, projectiles: 18, probability: 0.75 },
        { bombs: 4, projectiles: 36, probability: 0.25 },
      ],
      expectedEmittedProjectilesPerThrow: 22.5,
      baseBombThrowRatePerSecond: 1,
      maximumUndetonatedBombs: 10,
      baseDetonationDelaySeconds: 1,
      detonatesImmediatelyAfterLanding: true,
      demolisherChargeIntervalSeconds: 3,
      demolisherAdditionalHitDamagePct: 215,
      shotgunFalloffPct: 70,
    });
    expect(result.recordedTraitIds).toContain(BLAST_BARRAGE_TRAIT_ID);
    expect(result.actualBombsPerThrow).toMatchObject({
      status: "not-calculated",
      blockers: [{ code: "emissions-are-not-landed-hits" }],
    });
    expect(result.effectiveTargetHits.blockers).toContainEqual(expect.objectContaining({
      code: "unresolved-projectile-geometry",
    }));
    expect(result.actualTotalHit.blockers).not.toContainEqual(expect.objectContaining({
      code: "missing-frenzy-hound-tier",
    }));
  });

  it("resolves every complete supplied loadout's exact source-visible emission outcomes", () => {
    const build = bing();
    const expected = [
      {
        projectilesPerBomb: 7,
        traitLevels: [1, 2, 2, 2],
        chance: 25,
        emissions: [14, 28],
        expectedEmissions: 17.5,
      },
      {
        projectilesPerBomb: 9,
        traitLevels: [1, 2, 2, 2],
        chance: 25,
        emissions: [18, 36],
        expectedEmissions: 22.5,
      },
      {
        projectilesPerBomb: 7,
        traitLevels: [1, 2, 2, 2],
        chance: 25,
        emissions: [14, 28],
        expectedEmissions: 17.5,
      },
      {
        projectilesPerBomb: 7,
        traitLevels: [1, 2, 4, 2],
        chance: 35,
        emissions: [14, 28],
        expectedEmissions: 18.9,
      },
      {
        projectilesPerBomb: 5,
        traitLevels: [1, 2, 4, 2],
        chance: 35,
        emissions: [10, 20],
        expectedEmissions: 13.5,
      },
    ];

    for (const [offset, profile] of expected.entries()) {
      const result = compileBingIntrinsicEnvelope(build, offset + 2);
      expect(result.status).toBe("calculated-partial");
      if (result.status !== "calculated-partial") throw new Error("expected guarded envelope");
      expect(result.topology.status).toBe("calculated-partial");
      if (result.topology.status !== "calculated-partial") {
        throw new Error("expected source-visible emission topology");
      }
      expect(Object.values(result.topology.heroTraitLevels)).toEqual(profile.traitLevels);
      expect(result.topology.blastBarrageAdditionalBombChancePct).toBe(profile.chance);
      expect(result.topology.projectilesPerBomb).toBe(profile.projectilesPerBomb);
      expect(result.topology.emittedProjectilesPerThrowOutcomes.map(
        (outcome) => outcome.projectiles,
      )).toEqual(profile.emissions);
      expect(result.topology.expectedEmittedProjectilesPerThrow)
        .toBeCloseTo(profile.expectedEmissions, 10);
      expect(result.topology.isDps).toBe(false);
      expect(result.topology.isTargetHits).toBe(false);
    }
  });

  it("counts only placed slates and fails closed if a kismet appears to replace Iron Lion's notable", () => {
    const withoutPlacedSlate = bing();
    withoutPlacedSlate.loadouts.loadouts[3].divinity.placements =
      withoutPlacedSlate.loadouts.loadouts[3].divinity.placements.slice(1);
    const withoutSlateResult = compileBingIntrinsicEnvelope(withoutPlacedSlate, 3);
    expect(withoutSlateResult.status).toBe("calculated-partial");
    if (withoutSlateResult.status !== "calculated-partial"
        || withoutSlateResult.topology.status !== "calculated-partial") {
      throw new Error("expected guarded topology");
    }
    expect(withoutSlateResult.topology.projectilesPerBomb).toBe(7);
    expect(withoutSlateResult.topology.projectileQuantitySources)
      .not.toContainEqual(expect.objectContaining({ id: "placed-divinity-slate" }));

    const replacedNotable = bing();
    replacedNotable.loadouts.loadouts[2].kismets[0].nodeId = "slot_0_10";
    const replacedNotableResult = compileBingIntrinsicEnvelope(replacedNotable, 2);
    expect(replacedNotableResult.status).toBe("calculated-partial");
    if (replacedNotableResult.status !== "calculated-partial") {
      throw new Error("weapon slice should remain available");
    }
    expect(replacedNotableResult.topology).toMatchObject({
      status: "not-calculated",
      blockers: [{ code: "unresolved-iron-lion-kismet-slot" }],
    });
  });

  it("fails the topology closed when a source-bearing loadout projection is absent", () => {
    const cases: Array<{
      path: string;
      mutate: (loadout: any) => void;
    }> = [
      {
        path: "heroMemories",
        mutate: (loadout) => {
          delete loadout.heroMemories;
        },
      },
      {
        path: "divinity",
        mutate: (loadout) => {
          delete loadout.divinity;
        },
      },
      {
        path: "pactspirits",
        mutate: (loadout) => {
          delete loadout.pactspirits;
        },
      },
      {
        path: "kismets",
        mutate: (loadout) => {
          delete loadout.kismets;
        },
      },
      {
        path: "gear.inventory",
        mutate: (loadout) => {
          loadout.vorax.inventory.push(...loadout.gear.inventory);
          delete loadout.gear.inventory;
        },
      },
    ];

    for (const testCase of cases) {
      const build = bing();
      testCase.mutate(build.loadouts.loadouts[2]);
      const result = compileBingIntrinsicEnvelope(build, 2);
      expect(result.status, testCase.path).toBe("calculated-partial");
      if (result.status !== "calculated-partial") {
        throw new Error(`weapon slice should remain available for ${testCase.path}`);
      }
      expect(result.topology, testCase.path).toMatchObject({
        status: "not-calculated",
        isDps: false,
        isTargetHits: false,
      });
      if (result.topology.status !== "not-calculated") {
        throw new Error(`topology should fail closed for ${testCase.path}`);
      }
      expect(result.topology.blockers).toContainEqual(expect.objectContaining({
        code: "missing-topology-projection",
        evidence: expect.stringContaining(testCase.path),
      }));
    }
  });

  it("accepts explicit empty projections instead of treating them as truncated", () => {
    const build = bing();
    const loadout = build.loadouts.loadouts[2];
    loadout.heroMemories = { inventory: [], equipped: {} };
    loadout.divinity = { inventory: [], placements: [] };
    loadout.pactspirits = [];
    loadout.kismets = [];
    loadout.vorax = { inventory: [], equipped: {} };

    const result = compileBingIntrinsicEnvelope(build, 2);
    expect(result.status).toBe("calculated-partial");
    if (result.status !== "calculated-partial"
        || result.topology.status !== "calculated-partial") {
      throw new Error("explicit empty source projections should be auditable");
    }
    expect(result.topology.heroTraitLevels).toEqual({
      level1: 1,
      level45: 1,
      level60: 1,
      level75: 1,
    });
    expect(result.topology.projectileQuantitySources).toEqual([
      expect.objectContaining({ id: "hammer-of-ash", quantity: 3 }),
      expect.objectContaining({ id: "blast-nova", quantity: 2 }),
    ]);

    const inventoryEmpty = bing();
    const inventoryEmptyLoadout = inventoryEmpty.loadouts.loadouts[2];
    inventoryEmptyLoadout.vorax.inventory.push(...inventoryEmptyLoadout.gear.inventory);
    inventoryEmptyLoadout.gear.inventory = [];
    const inventoryEmptyResult = compileBingIntrinsicEnvelope(inventoryEmpty, 2);
    expect(inventoryEmptyResult.status).toBe("calculated-partial");
    if (inventoryEmptyResult.status !== "calculated-partial") {
      throw new Error("weapon slice should resolve from the union inventory");
    }
    expect(inventoryEmptyResult.topology.status).toBe("calculated-partial");
  });

  it("requires the explicit Vorax and Hammer-support projections", () => {
    const missingVorax = bing();
    delete missingVorax.loadouts.loadouts[2].vorax;
    expect(compileBingIntrinsicEnvelope(missingVorax, 2)).toMatchObject({
      status: "not-calculated",
      blockers: [{ code: "missing-vorax-equipment-projection" }],
    });

    const missingSupports = bing();
    const hammer = missingSupports.loadouts.loadouts[2].skills.activeSkills.find(
      (skill: any) => skill.skillGuid === "6f020b6a-022b-50eb-8299-e5fc7492ea8f",
    );
    delete hammer.supports;
    const missingSupportsResult = compileBingIntrinsicEnvelope(missingSupports, 2);
    expect(missingSupportsResult.status).toBe("calculated-partial");
    if (missingSupportsResult.status !== "calculated-partial") {
      throw new Error("weapon slice should remain available");
    }
    expect(missingSupportsResult.topology).toMatchObject({
      status: "not-calculated",
      blockers: [{
        code: "missing-topology-projection",
        evidence: expect.stringContaining("Hammer of Ash].supports"),
      }],
    });

    const explicitEmptySupports = bing();
    const explicitEmptyHammer = explicitEmptySupports.loadouts.loadouts[2].skills.activeSkills.find(
      (skill: any) => skill.skillGuid === "6f020b6a-022b-50eb-8299-e5fc7492ea8f",
    );
    explicitEmptyHammer.supports = [null, null, null, null, null];
    const explicitEmptyResult = compileBingIntrinsicEnvelope(explicitEmptySupports, 2);
    expect(explicitEmptyResult.status).toBe("calculated-partial");
    if (explicitEmptyResult.status !== "calculated-partial") {
      throw new Error("weapon slice should remain available");
    }
    expect(explicitEmptyResult.topology.status).toBe("calculated-partial");

    const truncatedSockets = bing();
    const truncatedHammer = truncatedSockets.loadouts.loadouts[2].skills.activeSkills.find(
      (skill: any) => skill.skillGuid === "6f020b6a-022b-50eb-8299-e5fc7492ea8f",
    );
    truncatedHammer.supports = [];
    const truncatedResult = compileBingIntrinsicEnvelope(truncatedSockets, 2);
    expect(truncatedResult.status).toBe("calculated-partial");
    if (truncatedResult.status !== "calculated-partial") {
      throw new Error("weapon slice should remain available");
    }
    expect(truncatedResult.topology).toMatchObject({
      status: "not-calculated",
      blockers: [{ code: "invalid-topology-projection" }],
    });
  });

  it("audits Projectile Quantity on explicitly equipped Vorax items", () => {
    const build = bing();
    const loadout = build.loadouts.loadouts[2];
    loadout.vorax.inventory.push({
      id: "test-vorax-projectile-quantity",
      affixes: [{
        modifierDescription: "Projectile Quantity +1",
        rolledValues: [],
      }],
    });
    loadout.vorax.equipped.digits = "test-vorax-projectile-quantity";

    const result = compileBingIntrinsicEnvelope(build, 2);
    expect(result.status).toBe("calculated-partial");
    if (result.status !== "calculated-partial") {
      throw new Error("weapon slice should remain available");
    }
    expect(result.topology).toMatchObject({
      status: "not-calculated",
      blockers: [{
        code: "uncompiled-equipped-projectile-quantity",
        evidence: "vorax.equipped.digits=test-vorax-projectile-quantity",
      }],
    });
  });

  it("rejects malformed or duplicate topology relationships before counting them", () => {
    const topologyBlockers = (build: any, index: number) => {
      const result = compileBingIntrinsicEnvelope(build, index);
      expect(result.status).toBe("calculated-partial");
      if (result.status !== "calculated-partial") {
        throw new Error("weapon slice should remain available");
      }
      expect(result.topology.status).toBe("not-calculated");
      return result.topology.status === "not-calculated"
        ? result.topology.blockers
        : [];
    };

    const wrongType = bing();
    const wrongTypeHammer = wrongType.loadouts.loadouts[3].skills.activeSkills.find(
      (skill: any) => skill.skillGuid === "6f020b6a-022b-50eb-8299-e5fc7492ea8f",
    );
    wrongTypeHammer.supports[0] = {
      supportGuid: MULTIPLE_PROJECTILES_SUPPORT_ID,
      type: "magnificent_support",
      tier: 0,
      rank: 1,
      rollValues: [2],
    };
    expect(topologyBlockers(wrongType, 3)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalid-multiple-projectiles-installation" }),
    ]));

    const duplicateSupport = bing();
    const duplicateHammer = duplicateSupport.loadouts.loadouts[3].skills.activeSkills.find(
      (skill: any) => skill.skillGuid === "6f020b6a-022b-50eb-8299-e5fc7492ea8f",
    );
    duplicateHammer.supports[0] = {
      supportGuid: MULTIPLE_PROJECTILES_SUPPORT_ID,
      type: "support",
      level: 20,
    };
    duplicateHammer.supports[1] = structuredClone(duplicateHammer.supports[0]);
    expect(topologyBlockers(duplicateSupport, 3)).toContainEqual(
      expect.objectContaining({
        code: "duplicate-projectile-quantity-support",
      }),
    );

    const duplicateUnrelatedSupport = bing();
    const unrelatedHammer =
      duplicateUnrelatedSupport.loadouts.loadouts[3].skills.activeSkills.find(
        (skill: any) =>
          skill.skillGuid === "6f020b6a-022b-50eb-8299-e5fc7492ea8f",
      );
    unrelatedHammer.supports[4] = structuredClone(
      unrelatedHammer.supports[1],
    );
    const unrelatedResult = compileBingIntrinsicEnvelope(
      duplicateUnrelatedSupport,
      3,
    );
    expect(unrelatedResult.status).toBe("calculated-partial");
    if (unrelatedResult.status !== "calculated-partial") {
      throw new Error("weapon slice should remain available");
    }
    expect(unrelatedResult.topology.status).toBe("calculated-partial");

    const duplicateIronLion = bing();
    const duplicatePacts = duplicateIronLion.loadouts.loadouts[3].pactspirits;
    const ironLion = duplicatePacts.find((pact: any) => pact?.guid === IRON_LION_ID);
    duplicatePacts[1] = structuredClone(ironLion);
    expect(topologyBlockers(duplicateIronLion, 3)).toContainEqual(
      expect.objectContaining({ code: "duplicate-iron-lion-pactspirit" }),
    );

    const invalidTraitRoll = bing();
    const traitLoadout = invalidTraitRoll.loadouts.loadouts[5];
    const memoryId = traitLoadout.heroMemories.equipped.slot60;
    const memory = traitLoadout.heroMemories.inventory.find(
      (candidate: any) => candidate.id === memoryId,
    );
    const traitAffix = memory.fixedAffixes.find((affix: any) =>
      HERO_TRAIT_LEVEL_MEMORY_MOD_IDS.has(affix.guid));
    traitAffix.value = 999;
    expect(topologyBlockers(invalidTraitRoll, 5)).toContainEqual(
      expect.objectContaining({ code: "invalid-hero-trait-level-memory-roll" }),
    );
  });

  it("derives each trait slot independently from the equipped memory base tier and fixed affix", () => {
    const build = bing();
    const result = compileBingIntrinsicEnvelope(build, 5);
    expect(result.status).toBe("calculated-partial");
    if (result.status !== "calculated-partial"
        || result.topology.status !== "calculated-partial") {
      throw new Error("expected guarded topology");
    }
    expect(result.topology.heroTraitLevels).toEqual({
      level1: 1,
      level45: 2,
      level60: 4,
      level75: 2,
    });
    expect(result.topology.heroTraitLevelSources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "base-trait-level",
        traitSlot: "level60",
        levels: 2,
      }),
      expect.objectContaining({
        id: "equipped-hero-memory",
        traitSlot: "level60",
        levels: 2,
      }),
    ]));

    build.loadouts.loadouts[5].heroMemories.inventory[1].baseStat.tier = 12;
    const lowerBaseTier = compileBingIntrinsicEnvelope(build, 5);
    expect(lowerBaseTier.status).toBe("calculated-partial");
    if (lowerBaseTier.status !== "calculated-partial"
        || lowerBaseTier.topology.status !== "calculated-partial") {
      throw new Error("expected guarded topology");
    }
    expect(lowerBaseTier.topology.heroTraitLevels.level60).toBe(3);
    expect(lowerBaseTier.topology.blastBarrageAdditionalBombChancePct).toBe(30);
  });

  it("keeps the exact source component coefficients separate from hit count", () => {
    const result = compileBingIntrinsicEnvelope(bing(), 2);
    expect(result.status).toBe("calculated-partial");
    if (result.status !== "calculated-partial") throw new Error("expected guarded envelope");

    expect(result.components).toEqual([
      {
        id: "pummel",
        label: "Pummel",
        weaponAttackDamagePct: 369,
        condition: null,
      },
      {
        id: "ember-projectile",
        label: "Ember Projectile",
        weaponAttackDamagePct: 369,
        condition: null,
      },
      {
        id: "explosion",
        label: "Explosion",
        weaponAttackDamagePct: 369,
        condition: "Hammer of Ash consumes Demolisher Charge",
      },
    ]);
    expect(result.effectiveTargetHits.status).toBe("not-calculated");
  });

  it("fails closed outside the season, actor, skill, and proven weapon scope", () => {
    const wrongPatch = bing();
    wrongPatch.patch = "SS14";
    expect(compileBingIntrinsicEnvelope(wrongPatch, 0)).toMatchObject({
      status: "not-calculated",
      isDps: false,
      isTotalHit: false,
      blockers: [{ code: "unsupported-patch" }],
    });
    expect(compileBingIntrinsicEnvelope(wuxia(), 0)).toMatchObject({
      status: "not-calculated",
      blockers: [{ code: "unsupported-actor" }],
    });

    const wrongSkill = bing();
    wrongSkill.loadouts.loadouts[0].skills.activeSkills =
      wrongSkill.loadouts.loadouts[0].skills.activeSkills.filter(
        (skill: any) => skill.skillGuid !== "6f020b6a-022b-50eb-8299-e5fc7492ea8f",
      );
    expect(compileBingIntrinsicEnvelope(wrongSkill, 0)).toMatchObject({
      status: "not-calculated",
      blockers: [{ code: "malformed-active-skill-projection" }],
    });

    const missingMemory = bing();
    missingMemory.loadouts.loadouts[5].heroMemories.inventory =
      missingMemory.loadouts.loadouts[5].heroMemories.inventory.filter(
        (memory: any) => memory.id !== "tli_dump_memory_3111pv",
      );
    const missingMemoryResult = compileBingIntrinsicEnvelope(missingMemory, 5);
    expect(missingMemoryResult.status).toBe("calculated-partial");
    if (missingMemoryResult.status !== "calculated-partial") {
      throw new Error("weapon slice should remain available");
    }
    expect(missingMemoryResult.topology).toMatchObject({
      status: "not-calculated",
      blockers: [{ code: "unresolved-equipped-hero-memory" }],
    });
  });

  it("pins every external formula source by hash and locator", () => {
    const result = compileBingIntrinsicEnvelope(bing(), 3);
    expect(result.status).toBe("calculated-partial");
    if (result.status !== "calculated-partial") throw new Error("expected guarded envelope");

    expect(result.provenance).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: "https://tlicompendium.com/data-bundles/SS13-skill-master.json",
        sha256: "91a676a558e6a7b811edc9256caec53c539398f93aac3b9a1f55c5c998d7ae91",
      }),
      expect.objectContaining({
        source: "https://tlicompendium.com/data-bundles/SS13-skill-en.json",
        sha256: "10b5cf27e8f50acca7ff2ec5a7534d5eb5e8e1eee83493f86851967fc0cd7cb1",
      }),
      expect.objectContaining({
        source: "https://tlicompendium.com/data-bundles/SS13-hero-trait-master.json",
        sha256: "f56051f4c17b5b7c0cbd2f95f613b0ba95cdded0686d789136b556b70470042a",
      }),
      expect.objectContaining({
        source: "https://tlicompendium.com/data-bundles/SS13-hero-trait-en.json",
        sha256: "f8f2f155dbdc4e62056bb2f81b1e7359c21badb7d772b39f76842e3cd0b455ff",
      }),
      expect.objectContaining({
        source: "https://tlicompendium.com/data-bundles/SS13-pactspirit-master.json",
        sha256: "a135189f802e7308d2b15033f1aff6b91fd4f35a5c41ae3008bd44c7c957bcfc",
      }),
      expect.objectContaining({
        source: "https://tlicompendium.com/data-bundles/SS13-pactspirit-en.json",
        sha256: "5f911041dc1691b4d51be84952498e58d682b3ec828547965938538d8cd8d082",
      }),
      expect.objectContaining({
        source: "https://tlicompendium.com/data-bundles/SS13-hero-memory-master.json",
        sha256: "f8aeede9d9a6785859ec6c1f07fc895505ffcbb812be15da1d1a4286f0f4c249",
      }),
      expect.objectContaining({
        source: "https://tlicompendium.com/data-bundles/SS13-hero-memory-en.json",
        sha256: "eab809b76569450c542ed953a861ca0cf328d6e661aa418e7e982be15862f465",
      }),
      expect.objectContaining({
        source: "https://tlicompendium.com/data-bundles/SS13-kismet-master.json",
        sha256: "684022248437ce49bcd7e1cc03797081ee2c3fabdd28884a744014c3228b5b54",
      }),
      expect.objectContaining({
        source: "https://tlicompendium.com/data-bundles/SS13-talent-tree-en.json",
        sha256: "cefe8ecf06a8a0876f9c0d048fd14caaa0f6204bade79ac6cf35672f24e00233",
      }),
      expect.objectContaining({
        source: "https://tlicompendium.com/assets/app-Dt7HnEFg.js",
        sha256: "4b8def40325b5b35402375a2c299a9cd82967b97412f7f13579645f29eb11150",
      }),
      expect.objectContaining({
        source: "https://tlicompendium.com/assets/TalentTreePlaybackSlider-DcRE_ib_.js",
        sha256: "3542ac817259807ff133b6e19812d4e65b60c41cd302e5508672bdd85e3dddfb",
      }),
      expect.objectContaining({
        source: "https://tlicompendium.com/assets/ManageLoadoutsModal-r6FwZQxS.js",
        sha256: "d83da97af0bdeba0f404408c1686038d6e6ae6b794659d0de8e0cc5ddfb7b7a6",
      }),
      expect.objectContaining({
        source: "poorchlight/tli_dump/data/compendium-catalog-ss13.json",
        sha256: "c7b5392533305d5b4ed91e1c8efe01a5b5ea0e7d64d7636b9cfb8d55ae24b796",
      }),
      expect.objectContaining({
        source: "poorchlight/tli_dump/ui/compendium-export.mjs",
        sha256: "f4ec95ee3b892299b5de5e1d6e16f2ef448b8c1b8c665afbd673788a9e60482d",
      }),
    ]));
    for (const source of result.provenance.filter(
      (entry) => entry.source.startsWith("https://")
        || entry.source.startsWith("poorchlight/"),
    )) {
      expect(source.locator.length).toBeGreaterThan(0);
      expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
