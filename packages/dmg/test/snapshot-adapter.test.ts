import fs from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fromRoot } from "../src/py.js";
import {
  SnapshotAdapterError,
  formatModifierEvidence,
  normalizeBuildSnapshot,
} from "../../page/src/snapshot-adapter.js";
import { resolveCompilerSource } from "../../page/src/portable-compiler-source.js";
import { createCompendiumExport } from "../../page/src/vendor/tli_dump/compendium-export.mjs";
import { importBuild } from "../../page/src/importer.js";
import {
  changedRowsBySystem,
  compareStructure,
} from "../../page/src/structural-analysis.js";
import type {
  AnalyzedBuild,
  ImportCatalog,
} from "../../page/src/analysis-types.js";

const ids = {
  hero: "d397380a-d947-5f11-b25e-381cf6311f04",
  skill: "2ad962ee-319f-590b-b49f-29fe40ed868c",
  support: "33b9e2f7-ca2b-51ef-949b-885add3142e3",
  module: "1f2860d8-9f25-59fd-aeb0-7e67f57f1298",
  gear: "b99a2bb9-e7e8-5b82-93ab-c08af9f8ac63",
  pact: "c1fd3e7d-fa85-5ea8-bef4-8d4c2a5da26e",
  kismet: "f6b3d90d-88ec-5537-ba9e-6f8cd2021379",
  memory: "510b7e22-a1a5-5de6-a755-3b98e96b31e1",
  slate: "10e9d7b4-8b2e-59b6-89c4-988b5a0da7ef",
  prism: "ff7dac44-1bcc-564a-88e9-d39a2d46d269",
};

const emptyCatalog: ImportCatalog = {
  skillNames: {
    [ids.skill]: "Summon Spirit Magus: Thunder",
    [ids.support]: "Spell Concentration",
    [ids.module]: "Restoration Protocol",
  },
  treeNames: { god_of_machines: "God of Machines" },
  heroNames: { [ids.hero]: "Iris" },
  pactNames: { [ids.pact]: "Kitty Express" },
};

function compendiumLoadout(id: string, roll = 26) {
  return {
    id,
    name: id === "before" ? "Before" : "After",
    hero: {
      heroGuid: ids.hero,
      heroId: "Iris: Vigilant Breeze",
      traits: { level1: null, level45: "trait-45" },
    },
    gear: {
      equipped: {
        helmet: null,
        chest: "vorax-chest",
        gloves: null,
        boots: null,
        belt: null,
        ring1: null,
        ring2: null,
        necklace: null,
        mainHand: null,
        offHand: null,
      },
      inventory: [],
    },
    vorax: {
      equipped: {},
      inventory: [{
        id: "vorax-chest",
        limbType: "chest",
        displayName: "Chest",
        affixes: [{
          affixId: "affix-one",
          legendaryId: ids.gear,
          legendaryName: "Mere Eternity",
          modifierDescription: `When Armor is no lower than 50000, +${roll}% Injury Buffer`,
          rolledValues: [
            { value: 50000, minValue: 50000, maxValue: 50000 },
            { value: roll, minValue: 20, maxValue: 30, sign: "+", unit: "%" },
          ],
          tier: "1",
        }],
      }],
    },
    skills: {
      activeSkills: [{
        skillGuid: ids.skill,
        enabled: true,
        level: 20,
        supports: [{
          supportGuid: ids.support,
          type: "support",
          level: 20,
          tier: 1,
          rollValues: [18],
        }, null],
        modifiers: [ids.module, null, null],
      }],
      passiveSkills: [],
    },
    skillTree: {
      slots: [{
        treeId: "god_of_machines",
        nodePoints: { "node-a": 3 },
        selectedNotable12: "notable-12",
        selectedNotable24: null,
        prismId: "prism-one",
        equippedPrism: {
          prismId: "prism-one",
          nodeId: "node-b",
          affectedNodeIds: ["node-b"],
          replacesCoreTalent: false,
        },
        prismCoreTalentOverride: null,
        inverseImageState: null,
      }],
    },
    heroMemories: {
      equipped: {
        slot45: "memory-one",
        slot60: null,
        slot75: null,
        slotLevel1Special: {
          memoryId: "memory-one",
          sourceSlot: 45,
          modifierPercent: 50,
        },
      },
      inventory: [{
        id: "memory-one",
        memoryType: "Origin",
        rarity: "Ultimate",
        baseStat: { guid: ids.memory, value: 110, tier: 1, sign: "+", unit: null },
        fixedAffixes: [],
        randomAffixes: [],
        revivedAffixLunarPhase: { guid: "revived", name: "Blowing Breeze" },
      }],
    },
    etherealPrisms: {
      equipped: { slot1: "prism-one", slot2: null, slot3: null },
      inventory: [{
        id: "prism-one",
        baseId: ids.prism,
        prismType: "ethereal",
        selectedBaseAffixId: "base-affix",
        randomAffixes: [],
      }],
    },
    divinity: {
      inventory: [{
        id: "slate-one",
        type: "legendary",
        legendaryTemplateId: ids.slate,
        legendaryTemplate: "Fallen Starlight",
        affixes: [{
          modGuid: "slate-affix",
          description: "+1 Minion Skill Level",
          slotIndex: 0,
        }],
      }],
      placements: [{ row: 2, col: 3, slateId: "slate-one" }],
    },
    pactspirits: [{
      guid: ids.pact,
      level: 6,
      allocatedNodes: ["1", "2"],
      expansions: {},
    }],
    kismets: [{
      kismetGuid: ids.kismet,
      nodeId: "slot_0_1",
      pactspritIndex: 0,
      rollValues: [roll],
    }],
    scentBottle: null,
  };
}

function compendiumFixture() {
  return {
    id: "fixture-build",
    name: "Fixture progression",
    patch: "SS13",
    loadouts: {
      currentLoadoutId: "after",
      loadouts: [compendiumLoadout("before", 20), compendiumLoadout("after", 26)],
    },
  };
}

function emptyItemSection() {
  return { sourceCollection: null, items: [] };
}

function emptyRecordSection() {
  return { sourceCollection: null, records: [] };
}

function portableItem() {
  return {
    source: { collection: "WearItems", key: "chest" },
    instanceId: "portable-chest",
    identity: {
      base: {
        gameId: "1019",
        domain: "gear",
        compendiumId: ids.gear,
        label: "Sierra Reverberation Maul",
        metadata: {
          category: "two_handed",
          subtype: "two-handed_hammer",
          prefixAffixes: [{
            affixId: "prefix-affix",
            tierId: "prefix-tier",
            modifierId: "107110001",
            descriptionTemplate: "+#% Gear Physical Damage",
            rawText: "+(49–80)% Gear Physical Damage",
            tier: "1",
          }],
        },
      },
      special: null,
    },
    location: { bag: 1, equipSlot: 4, page: -1, slot: 4 },
    itemLevel: 90,
    rarity: 4,
    quality: null,
    corroded: false,
    affixes: {
      bAffixInfoList: null,
      baseAttrInfoList: null,
      fixedBaseAffix: null,
      prefixInfoList: [{ Id: 107110001, DynArgs: [62] }],
      suffixInfoList: [],
      enchantAffixList: null,
      chipAffixList: null,
    },
    data: {},
    diagnostics: [],
  };
}

function portableFixture() {
  return {
    schemaVersion: 3,
    capturedAt: "2026-07-22T12:34:56.789Z",
    source: {
      kind: "liveMemory",
      executable: "torchlight_infinite.exe",
      profile: "steam-ss13-fixture",
      catalogPatch: "SS13",
      layoutCompatible: true,
      processState: "connected",
    },
    compendiumImportable: false,
    player: { playerId: null, teamPlayerIds: [], items: [] },
    proBuild: {
      id: "portable-build",
      name: "Portable fixture",
      sourcePage: "ViewPlayerBDReference",
      loadout: {
        hero: {
          identity: {
            gameId: "4001",
            domain: "hero-trait",
            compendiumId: ids.hero,
            label: "Iris: Vigilant Breeze",
          },
          sourceName: "Iris",
          level: 95,
          sourceData: {},
        },
        heroMemories: emptyItemSection(),
        etherealPrisms: emptyItemSection(),
        gear: { sourceCollection: "WearItems", items: [portableItem()] },
        vorax: emptyItemSection(),
        skills: emptyItemSection(),
        skillTree: emptyRecordSection(),
        divinity: emptyRecordSection(),
        pactspirits: emptyRecordSection(),
        kismets: emptyRecordSection(),
        scentBottle: emptyRecordSection(),
        unmappedSourceCollections: {
          unclassifiedWearItems: emptyItemSection(),
          otherWearItems: emptyItemSection(),
          jewelItems: emptyItemSection(),
          heroCharacterItems: emptyItemSection(),
        },
      },
    },
    mappingIssues: [{
      kind: "sourcePartial",
      path: "proBuild.loadout.skills",
      sourcePath: "SkillGroups",
      message: "Skill placement is incomplete.",
    }],
  };
}

function rustPortableFixture(): any {
  return JSON.parse(fs.readFileSync(
    fromRoot("../poorchlight/tli_dump/ui/fixtures/rust-portable-snapshot.json"),
    "utf8",
  ));
}

describe("canonical snapshot adapter", () => {
  it("pins the authoritative tli_dump converter bytes used by the website", () => {
    const sha256 = (file: string) => createHash("sha256")
      .update(fs.readFileSync(fromRoot(file)))
      .digest("hex");

    expect(sha256("packages/page/src/vendor/tli_dump/compendium-export.mjs"))
      .toBe("f4ec95ee3b892299b5de5e1d6e16f2ef448b8c1b8c665afbd673788a9e60482d");
    expect(sha256("packages/page/src/vendor/tli_dump/dom.js"))
      .toBe("eaec9905bf17e30b9bdc8104ee0c4647712c98e8413b3661058dc89769187fb5");
  });

  it("normalizes the two supplied builds and the real portable-v3 fixture", () => {
    const read = (file: string) => JSON.parse(fs.readFileSync(fromRoot(file), "utf8"));
    const bingSource = read("../bing_china.json");
    const wuxiaSource = read("../WuxiaSS13.json");
    const portableSource = read("../poorchlight/tli_dump/ui/fixtures/rust-portable-snapshot.json");
    const bing = normalizeBuildSnapshot(bingSource);
    const wuxia = normalizeBuildSnapshot(wuxiaSource);
    const portable = normalizeBuildSnapshot(portableSource);

    expect(bing).toMatchObject({ sourceKind: "compendium", loadouts: { length: 7 } });
    expect(wuxia).toMatchObject({ sourceKind: "compendium", loadouts: { length: 9 } });
    expect(portable).toMatchObject({
      sourceKind: "portable-v3",
      sourceSchemaVersion: 3,
      loadouts: { length: 1 },
    });
    expect(portable.loadouts[0].hero.name).toBe("Bing: Blast Nova");

    const importedBing = importBuild(bingSource, emptyCatalog);
    const importedWuxia = importBuild(wuxiaSource, emptyCatalog);
    const importedPortable = importBuild(portableSource, emptyCatalog);
    expect(importedBing.loadouts[0]).toMatchObject({
      model: null,
      partialMetrics: { length: 1 },
      supportEvidence: { length: 5 },
      summonEvidence: { length: 0 },
    });
    expect(importedWuxia.loadouts[8]).toMatchObject({
      model: null,
      partialMetrics: { length: 0 },
      supportEvidence: { length: 0 },
      summonEvidence: { length: 2 },
    });
    expect(importedBing.loadouts[0].gear
      .find((item) => item.slot === "mainHand")?.lines.join(" ")).not.toContain("#");
    expect(importedBing.loadouts[0].memories[0].lines?.[0]).toContain("Base Stat");
    expect(importedBing.loadouts[0].slates[0].lines?.length).toBeGreaterThan(0);
    expect(importedBing.loadouts[0].pactspirits[0].details?.[0]).toContain("Allocated node");
    expect(importedPortable.loadouts[0]).toMatchObject({
      model: null,
      gear: { length: 1 },
      skills: { length: 1 },
      partialMetrics: [],
      supportEvidence: [],
      summonEvidence: [],
      bingIntrinsicEvidence: undefined,
      playerDefenseEvidence: undefined,
    });
    expect(importedPortable.loadouts[0].sourceNote).toContain(
      "converter report was retained (partial; 3 structurally materialized records)",
    );
    expect(importedPortable.loadouts[0].sourceNote).toContain(
      "not used as formula inputs",
    );
    expect(importedPortable.loadouts[0].unmatched.some((row) =>
      row.text.startsWith("tli_dump omitted skillSupports:"))).toBe(true);
    expect(importedPortable.loadouts[0].unmatched.some((row) =>
      row.text.startsWith("Guarded formula access blocked:"))).toBe(true);
  });

  it("uses the pinned converter for validation/reporting but never as a formula source", () => {
    const source = rustPortableFixture();
    const normalized = normalizeBuildSnapshot(source);
    const resolved = resolveCompilerSource(source, normalized);

    expect(resolved.portableConversion).toMatchObject({
      status: "partial",
      importedCount: 3,
      error: null,
      compilerAccess: {
        status: "blocked",
        reason: "catalog-attestation-required",
      },
    });
    expect(resolved.portableConversion?.included.map((entry) => entry.section))
      .toEqual(["hero", "gear", "pactspirits"]);
    expect(resolved.portableConversion?.omitted.map((entry) => entry.section))
      .toEqual(["gearPlacement", "skillSupports", "skillTree"]);
    expect(resolved.source).toBeNull();
  });

  it.each([
    {
      label: "incompatible layout",
      layoutCompatible: false,
      processState: "connected",
    },
    {
      label: "non-connected process",
      layoutCompatible: true,
      processState: "incompatible",
    },
  ])("flags $label and keeps guarded formula access closed", ({
    layoutCompatible,
    processState,
  }) => {
    const source = rustPortableFixture();
    source.source.layoutCompatible = layoutCompatible;
    source.source.processState = processState;
    const normalized = normalizeBuildSnapshot(source);
    const resolved = resolveCompilerSource(source, normalized);
    const imported = importBuild(source, emptyCatalog);

    expect(resolved).toMatchObject({
      source: null,
      portableConversion: {
        status: "partial",
        importedCount: 3,
        error: null,
        compilerAccess: {
          status: "blocked",
          reason: "incompatible-source-state",
        },
      },
    });
    expect(imported.loadouts[0]).toMatchObject({
      partialMetrics: [],
      supportEvidence: [],
      summonEvidence: [],
      bingIntrinsicEvidence: undefined,
      playerDefenseEvidence: undefined,
    });
    expect(imported.loadouts[0].sourceNote).toContain(
      "capture was not both connected and layout-compatible",
    );
  });

  it("blocks forged portable weapon metadata from the Bing compiler boundary", () => {
    const source = rustPortableFixture();
    const gear = source.proBuild.loadout.gear.items[0];
    gear.location = { bag: 1, equipSlot: 2, page: -1, slot: 2 };
    const physicalImplicit = gear.identity.base.metadata.implicits[0];
    physicalImplicit.description = "999999 - 999999 Physical Damage";
    physicalImplicit.rawText = physicalImplicit.description;
    physicalImplicit.values = [
      { minValue: 999999, maxValue: 999999, value: 999999 },
      { minValue: 999999, maxValue: 999999, value: 999999 },
    ];

    const skill = source.proBuild.loadout.skills.items[0];
    skill.identity.base = {
      gameId: "forged-hammer",
      domain: "skill",
      compendiumId: "6f020b6a-022b-50eb-8299-e5fc7492ea8f",
      label: "Hammer of Ash",
      metadata: {
        skillType: "active",
        icon: "/forged-hammer.webp",
      },
    };
    skill.itemLevel = 20;
    skill.data = {
      compendiumPlacement: { kind: "active", slot: 0, groupSize: 1 },
    };

    const normalized = normalizeBuildSnapshot(source);
    const resolved = resolveCompilerSource(source, normalized);
    const imported = importBuild(source, emptyCatalog);

    expect(imported.loadouts[0].gear
      .find((item) => item.slot === "mainHand")?.lines.join(" "))
      .toContain("999999 - 999999 Physical Damage");
    expect(resolved.portableConversion).toMatchObject({
      status: "partial",
      compilerAccess: {
        status: "blocked",
        reason: "catalog-attestation-required",
      },
    });
    expect(resolved.source).toBeNull();
    expect(imported.loadouts[0]).toMatchObject({
      partialMetrics: [],
      bingIntrinsicEvidence: undefined,
      playerDefenseEvidence: undefined,
    });
  });

  it("blocks forged +999999 Life gear metadata from defence source sums", () => {
    const source = rustPortableFixture();
    const gear = source.proBuild.loadout.gear.items[0];
    gear.location = { bag: 1, equipSlot: 2, page: -1, slot: 2 };
    const prefix = gear.identity.base.metadata.prefixAffixes[0];
    prefix.descriptionTemplate = "+# Max Life";
    prefix.rawText = "+# Max Life";
    prefix.values = [{
      minValue: 1,
      maxValue: 999999,
      sign: "+",
      unit: "",
    }];
    gear.affixes.prefixInfoList[0].DynArgs = [999999];

    const normalized = normalizeBuildSnapshot(source);
    const resolved = resolveCompilerSource(source, normalized);
    const imported = importBuild(source, emptyCatalog);

    expect(imported.loadouts[0].gear
      .find((item) => item.slot === "mainHand")?.lines.join(" "))
      .toContain("+999999 Max Life");
    expect(resolved.source).toBeNull();
    expect(resolved.portableConversion?.compilerAccess).toMatchObject({
      status: "blocked",
      reason: "catalog-attestation-required",
    });
    expect(imported.loadouts[0]).toMatchObject({
      partialMetrics: [],
      supportEvidence: [],
      summonEvidence: [],
      bingIntrinsicEvidence: undefined,
      playerDefenseEvidence: undefined,
    });
  });

  it("rejects converted portable evidence if loadout order or hero identity diverges", () => {
    const source = rustPortableFixture();
    const renamed = structuredClone(normalizeBuildSnapshot(source));
    renamed.loadouts[0].name = "different validated loadout";
    expect(resolveCompilerSource(source, renamed)).toMatchObject({
      source: null,
      portableConversion: {
        status: "failed",
        error: expect.stringContaining("loadout order/name"),
      },
    });

    const wrongHero = structuredClone(normalizeBuildSnapshot(source));
    if (!wrongHero.loadouts[0].hero.identity) {
      throw new Error("fixture should resolve a hero identity");
    }
    wrongHero.loadouts[0].hero.identity.catalogId =
      "00000000-0000-4000-8000-000000000000";
    expect(resolveCompilerSource(source, wrongHero)).toMatchObject({
      source: null,
      portableConversion: {
        status: "failed",
        error: expect.stringContaining("hero identity"),
      },
    });
  });

  it("keeps portable imports structural when the converter cannot materialize the patch", () => {
    const source = portableFixture();
    source.source.catalogPatch = "SS12.5";
    const normalized = normalizeBuildSnapshot(source);
    const resolved = resolveCompilerSource(source, normalized);
    const imported = importBuild(source, emptyCatalog);

    expect(resolved).toMatchObject({
      source: null,
      portableConversion: {
        status: "failed",
        importedCount: 0,
        included: [],
        omitted: [],
      },
    });
    expect(resolved.portableConversion?.error).toContain(
      "no materialization catalog for patch SS12.5",
    );
    expect(imported.loadouts[0]).toMatchObject({
      partialMetrics: [],
      supportEvidence: [],
      summonEvidence: [],
      bingIntrinsicEvidence: undefined,
      playerDefenseEvidence: undefined,
    });
    expect(imported.loadouts[0].sourceNote).toContain(
      "converter validation/report failed",
    );
    expect(imported.loadouts[0].unmatched.some((row) =>
      row.text.includes("no materialization catalog for patch SS12.5"))).toBe(true);
  });

  it("normalizes Compendium actor structure and detects roll-only upgrades", () => {
    const build = normalizeBuildSnapshot(compendiumFixture());
    const [before, after] = build.loadouts;

    expect(build.sourceKind).toBe("compendium");
    expect(build.loadouts).toHaveLength(2);
    expect(after.isCurrent).toBe(true);
    expect(after.hero.identity?.catalogId).toBe(ids.hero);
    expect(after.gear.find((item) => item.slot === "chest")?.name).toBe("Mere Eternity");
    expect(after.skills[0].supports[0].identity.catalogId).toBe(ids.support);
    expect(after.skills[0].modules[0].catalogId).toBe(ids.module);
    expect(after.trees[0].prismFingerprint).not.toBeNull();
    expect(after.memories.find((item) => item.slot === "slotLevel1Special")?.instanceId)
      .toBe("memory-one");
    expect(after.slates[0].position).toBe("2:3");
    expect(after.pactspirits[0].kismets).toHaveLength(1);
    expect(after.prisms).toHaveLength(1);
    expect(after.fingerprint).not.toBe(before.fingerprint);

    const line = formatModifierEvidence(
      after.gear.find((item) => item.slot === "chest")!.modifiers[0],
    );
    expect(line).toContain("+26%");
    expect(line).toContain("[20–30]");
  });

  it("keeps deterministic semantic fingerprints and ignores presentation renames", () => {
    const source = compendiumFixture();
    const first = normalizeBuildSnapshot(source);
    const renamed = structuredClone(source);
    renamed.name = "Renamed build";
    renamed.loadouts.loadouts[0].hero.heroId = "Translated Iris label";
    renamed.loadouts.loadouts[0].vorax.inventory[0].displayName = "Translated chest label";
    const second = normalizeBuildSnapshot(renamed);

    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.loadouts[0].fingerprint).toBe(first.loadouts[0].fingerprint);
  });

  it("surfaces missing equipped references instead of calling them Empty", () => {
    const source = compendiumFixture();
    source.loadouts.loadouts[0].gear.equipped.chest = "missing-item";
    const build = normalizeBuildSnapshot(source);
    const chest = build.loadouts[0].gear.find((item) => item.slot === "chest");

    expect(chest?.name).toBe("Missing item reference");
    expect(chest?.missingReference).toBe(true);
    expect(build.diagnostics.some((issue) => issue.code === "equipped_reference_missing"))
      .toBe(true);
  });

  it("keeps a generic payload envelope as user-asserted Compendium state", () => {
    const source = compendiumFixture();
    const normalized = normalizeBuildSnapshot({ payload: source });
    const fakeKnown = {
      id: "known",
      name: source.name,
      patch: "SS13",
      source: "demo",
      loadouts: Array.from({ length: 7 }, (_, index) => ({
        id: `known-${index}`,
        index,
        name: `Known ${index}`,
      })),
    } as unknown as AnalyzedBuild;
    const imported = importBuild({ payload: source }, emptyCatalog, [fakeKnown], "upload.json");

    expect(normalized.sourceKind).toBe("compendium");
    expect(normalized.loadouts).toHaveLength(2);
    expect(imported.loadouts).toHaveLength(2);
    expect(imported.loadouts[1].model).toBeNull();
    expect(imported.loadouts[1].hero).toBe("Iris: Vigilant Breeze");
    expect(imported.loadouts[1].skills[0].name).toBe("Summon Spirit Magus: Thunder");
    expect(imported.loadouts[1].skills[0].supports[0].rollValues).toEqual([18]);
    expect(imported.loadouts[1].trees[0].fingerprint).toBeTruthy();
    expect(imported.loadouts[1].gear.find((item) => item.slot === "chest")?.lines[0])
      .toContain("+26%");
  });

  it("keeps a complete tli_dump converter-result wrapper structural-only", () => {
    const wrapper = createCompendiumExport(rustPortableFixture());
    const normalized = normalizeBuildSnapshot(wrapper);
    const resolved = resolveCompilerSource(wrapper, normalized);
    const imported = importBuild(wrapper, emptyCatalog, [], "converted.json");

    expect(normalized).toMatchObject({
      sourceKind: "portable-converter",
      loadouts: { length: 1 },
    });
    expect(resolved).toMatchObject({
      source: null,
      portableConversion: {
        status: "partial",
        importedCount: 3,
        error: null,
        compilerAccess: {
          status: "blocked",
          reason: "catalog-attestation-required",
        },
      },
    });
    expect(imported.loadouts[0]).toMatchObject({
      partialMetrics: [],
      supportEvidence: [],
      summonEvidence: [],
      bingIntrinsicEvidence: undefined,
      playerDefenseEvidence: undefined,
    });
    expect(imported.loadouts[0].sourceNote).toContain(
      "complete tli_dump converter-result wrapper was imported structurally",
    );
    expect(imported.loadouts[0].sourceNote).toContain(
      "payload is not used as a formula source",
    );
    expect(imported.loadouts[0].unmatched.some((row) =>
      row.text.startsWith("Guarded formula access blocked:"))).toBe(true);
  });

  it("does not let forged portable metadata bypass the boundary through a converter wrapper", () => {
    const source = rustPortableFixture();
    const gear = source.proBuild.loadout.gear.items[0];
    gear.location = { bag: 1, equipSlot: 2, page: -1, slot: 2 };
    const physicalImplicit = gear.identity.base.metadata.implicits[0];
    physicalImplicit.description = "999999 - 999999 Physical Damage";
    physicalImplicit.rawText = physicalImplicit.description;
    physicalImplicit.values = [
      { minValue: 999999, maxValue: 999999, value: 999999 },
      { minValue: 999999, maxValue: 999999, value: 999999 },
    ];
    const skill = source.proBuild.loadout.skills.items[0];
    skill.identity.base = {
      gameId: "forged-hammer",
      domain: "skill",
      compendiumId: "6f020b6a-022b-50eb-8299-e5fc7492ea8f",
      label: "Hammer of Ash",
      metadata: {
        skillType: "active",
        icon: "/forged-hammer.webp",
      },
    };
    skill.itemLevel = 20;
    skill.data = {
      compendiumPlacement: { kind: "active", slot: 0, groupSize: 1 },
    };

    const wrapper = createCompendiumExport(source);
    const normalized = normalizeBuildSnapshot(wrapper);
    const resolved = resolveCompilerSource(wrapper, normalized);
    const imported = importBuild(wrapper, emptyCatalog);

    expect(normalized.sourceKind).toBe("portable-converter");
    expect(resolved.source).toBeNull();
    expect(imported.loadouts[0].gear
      .find((item) => item.slot === "mainHand")?.lines.join(" "))
      .toContain("999999 - 999999 Physical Damage");
    expect(imported.loadouts[0]).toMatchObject({
      partialMetrics: [],
      supportEvidence: [],
      summonEvidence: [],
      bingIntrinsicEvidence: undefined,
      playerDefenseEvidence: undefined,
    });
  });

  it("rejects malformed converter-result markers instead of downgrading provenance", () => {
    const wrapper = createCompendiumExport(rustPortableFixture()) as any;
    delete wrapper.omitted;

    expect(() => normalizeBuildSnapshot(wrapper)).toThrowError(
      expect.objectContaining<Partial<SnapshotAdapterError>>({
        code: "invalid_portable_converter",
        path: "document",
      }),
    );
  });

  it("preserves a roll-only support change through the comparison model", () => {
    const source = compendiumFixture();
    source.loadouts.loadouts = [
      compendiumLoadout("before", 26),
      compendiumLoadout("after", 26),
    ];
    (source.loadouts.loadouts[0].skills.activeSkills[0].supports[0] as any)
      .rollValues = [18];
    (source.loadouts.loadouts[1].skills.activeSkills[0].supports[0] as any)
      .rollValues = [19];

    const normalized = normalizeBuildSnapshot(source);
    expect(normalized.loadouts[0].gear.map((item) => item.fingerprint))
      .toEqual(normalized.loadouts[1].gear.map((item) => item.fingerprint));
    expect(normalized.loadouts[0].skills[0].supports[0].fingerprint)
      .not.toBe(normalized.loadouts[1].skills[0].supports[0].fingerprint);

    const imported = importBuild(source, emptyCatalog);
    expect(imported.loadouts[0].skills[0].supports[0]).toMatchObject({
      tier: 1,
      rollValues: [18],
    });
    expect(imported.loadouts[1].skills[0].supports[0]).toMatchObject({
      tier: 1,
      rollValues: [19],
    });
    expect(changedRowsBySystem(imported.loadouts[0], imported.loadouts[1]).skills)
      .toBe(1);
    const insight = compareStructure(imported.loadouts[0], imported.loadouts[1]).insights[0];
    expect(insight.id).toBe("main-support-swap");
    expect(insight.title).toContain("configuration changed");
    expect(insight.evidence.join(" ")).toContain("rolls [18] → [19]");
  });

  it("preserves main-bar slot identity instead of collapsing or reindexing skills", () => {
    const source = compendiumFixture();
    const moved = source.loadouts.loadouts[1].skills.activeSkills[0];
    source.loadouts.loadouts[1].skills.activeSkills = [null as any, moved];
    const imported = importBuild(source, emptyCatalog);

    expect(imported.loadouts[0].skills.map((skill) => skill.slot))
      .toEqual(["active:0"]);
    expect(imported.loadouts[1].skills.map((skill) => skill.slot))
      .toEqual(["active:1"]);
    expect(changedRowsBySystem(imported.loadouts[0], imported.loadouts[1]).skills)
      .toBe(2);
  });

  it("normalizes a GUI-wrapped portable-v3 snapshot with raw affix evidence", () => {
    const build = normalizeBuildSnapshot({
      captured_at: "ignored GUI field",
      portable: portableFixture(),
    });
    const gear = build.loadouts[0].gear[0];

    expect(build.sourceKind).toBe("portable-v3");
    expect(build.sourceSchemaVersion).toBe(3);
    expect(gear.slot).toBe("chest");
    expect(gear.identity?.nativeId).toBe("1019");
    expect(formatModifierEvidence(gear.modifiers[0])).toContain("62");
    expect(build.diagnostics[0].code).toBe("sourcePartial");
  });

  it("does not invent installed skills or pactspirits from unplaced portable evidence", () => {
    const source: any = portableFixture();
    const unplacedSkill: any = portableItem();
    unplacedSkill.source = { collection: "Skills", key: "inventory_skill_1" };
    unplacedSkill.instanceId = "unplaced-skill";
    unplacedSkill.identity.base = {
      gameId: "7006",
      domain: "skill",
      compendiumId: ids.skill,
      label: "Summon Spirit Magus: Thunder",
      metadata: { skillType: "active" },
    } as any;
    unplacedSkill.location = { bag: null, equipSlot: null, page: 101, slot: 2 };
    source.proBuild.loadout.skills = {
      sourceCollection: "Skills",
      items: [unplacedSkill],
    };
    source.proBuild.loadout.pactspirits = {
      sourceCollection: "PetDatas",
      records: [{
        sourceKey: "[-1]",
        identity: null,
        data: {
          PetConfigId: -1,
          InstallServantType: -1,
          Name: null,
          Icon: null,
        },
      }],
    };

    const build = normalizeBuildSnapshot(source);
    expect(build.loadouts[0].skills[0]).toMatchObject({
      kind: "unknown",
      enabled: false,
    });
    expect(build.loadouts[0].pactspirits).toHaveLength(0);
    expect(build.diagnostics.some((issue) => issue.code === "portable_skill_unplaced"))
      .toBe(true);
  });

  it("rejects unsupported portable versions with an actionable error", () => {
    const source = portableFixture();
    source.schemaVersion = 4;

    expect(() => normalizeBuildSnapshot(source)).toThrowError(
      expect.objectContaining<Partial<SnapshotAdapterError>>({
        code: "unsupported_portable_version",
        path: "portable.schemaVersion",
      }),
    );
  });

  it("rejects pathological object graphs before recursive fingerprinting", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => normalizeBuildSnapshot(cyclic)).toThrow(
      /cyclic or repeated object reference/,
    );

    let deeplyNested: Record<string, unknown> = {};
    for (let depth = 0; depth < 70; depth += 1) {
      deeplyNested = { child: deeplyNested };
    }
    expect(() => normalizeBuildSnapshot(deeplyNested)).toThrow(
      /nested more than 64 levels deep/,
    );
  });

  it("rejects malformed portable-v3 records rather than silently dropping them", () => {
    const source = portableFixture();
    (source.proBuild.loadout.gear.items[0] as any).location.equipSlot = "4";

    expect(() => normalizeBuildSnapshot(source)).toThrowError(
      expect.objectContaining<Partial<SnapshotAdapterError>>({
        code: "invalid_portable_v3",
        path: "portable.proBuild.loadout.gear.items[0].location.equipSlot",
      }),
    );
  });

  it("keeps a lenient Compendium boundary but reports malformed optional sections", () => {
    const source = compendiumFixture();
    (source.loadouts.loadouts[0].skills as any).activeSkills = "not-an-array";
    const build = normalizeBuildSnapshot(source);

    expect(build.loadouts[0].skills).toHaveLength(0);
    expect(build.diagnostics.some((issue) =>
      issue.code === "section_malformed"
      && issue.path.endsWith(".skills.activeSkills"))).toBe(true);
  });

  it("does not treat JSON object-key ordering as a build change", () => {
    const source = compendiumFixture();
    const first = normalizeBuildSnapshot(source);
    const reordered = structuredClone(source);
    const equipped = reordered.loadouts.loadouts[0].gear.equipped;
    reordered.loadouts.loadouts[0].gear.equipped = Object.fromEntries(
      Object.entries(equipped).reverse(),
    ) as typeof equipped;

    expect(normalizeBuildSnapshot(reordered).loadouts[0].fingerprint)
      .toBe(first.loadouts[0].fingerprint);
  });
});
