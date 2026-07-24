import fs from "node:fs";
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { fromRoot } from "../src/py.js";
import {
  SUMMON_EROSION_MAGUS_ID,
  SUMMON_ROCK_MAGUS_ID,
} from "../src/guardedCompiler.js";
import {
  AUDITED_SS13_COMPACT_CATALOG_SHA256,
  compareSs13PlayerDefenseEvidence,
  compileSs13PlayerDefenseEvidence,
  NURTURING_BREEZE_TRAIT_ID,
  PRECISE_PROTECTION_FIELD_SUPPORT_ID,
  PROTECTION_FIELD_SUPPORT_ID,
  type PlayerDefenseEvidence,
} from "../src/playerDefenseEvidence.js";

const readJson = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"));
const catalogPath = fromRoot("../poorchlight/tli_dump/data/compendium-catalog-ss13.json");
const catalogText = fs.readFileSync(catalogPath, "utf8");
const catalog = JSON.parse(catalogText);
const options = {
  catalog,
  catalogSha256: AUDITED_SS13_COMPACT_CATALOG_SHA256,
};
const bing = () => readJson(fromRoot("../bing_china.json"));
const wuxia = () => readJson(fromRoot("../WuxiaSS13.json"));

function compileAll(build: any): PlayerDefenseEvidence[] {
  return build.loadouts.loadouts.map((_: unknown, index: number) => {
    const result = compileSs13PlayerDefenseEvidence(build, index, options);
    expect(result.status).toBe("source-terms");
    if (result.status !== "source-terms") throw new Error("expected source terms");
    return result;
  });
}

function protectionTerms(evidence: PlayerDefenseEvidence) {
  return evidence.terms.filter((term) =>
    term.source.modifierId === PROTECTION_FIELD_SUPPORT_ID
    || term.source.modifierId === PRECISE_PROTECTION_FIELD_SUPPORT_ID);
}

describe("guarded SS13 player-defence evidence", () => {
  it("pins the compact SS13 identity/effect catalog used for fixture coverage", () => {
    expect(catalog).toMatchObject({ schemaVersion: 2, patch: "SS13" });
    expect(crypto.createHash("sha256").update(catalogText).digest("hex")).toBe(
      AUDITED_SS13_COMPACT_CATALOG_SHA256,
    );
  });

  it("covers all 7 Bing and 9 Wuxia loadouts without manufacturing EHP", () => {
    const bingEvidence = compileAll(bing());
    const wuxiaEvidence = compileAll(wuxia());

    expect(bingEvidence).toHaveLength(7);
    expect(wuxiaEvidence).toHaveLength(9);
    for (const evidence of [...bingEvidence, ...wuxiaEvidence]) {
      expect(evidence.actor).toBe("player");
      expect(evidence.isTotalEhp).toBe(false);
      expect(evidence.playerEhp.status).toBe("not-calculated");
      expect(evidence.terms.length).toBeGreaterThan(0);
      expect(evidence.sourceSums.every((sum) => sum.isCharacterTotal === false)).toBe(true);
      expect(evidence.playerEhp.blockers.map((blocker) => blocker.code)).toContain(
        "missing-character-defence-baseline",
      );
      for (const term of evidence.terms) {
        expect(term.actor).toBe("player");
        expect(term.isTotalEhp).toBe(false);
        expect(term.provenance.length).toBeGreaterThan(0);
        expect(term.provenance.every((source) =>
          source.source.length > 0 && source.locator.length > 0)).toBe(true);
      }
    }
  });

  it("locks exact known-vocabulary coverage across the supplied progressions", () => {
    const project = (evidence: PlayerDefenseEvidence) => ({
      terms: evidence.terms.length,
      defensiveLines: evidence.coverage.defensiveLines,
      minionExcluded: evidence.coverage.minionOnlyLinesExcluded,
      offensiveExcluded: evidence.coverage.offensiveLinesExcluded,
      catalogRefs: evidence.coverage.catalog.requiredReferences,
      catalogMissingEffects: evidence.coverage.catalog.missingEffectDefinitions,
      unparsed: evidence.coverage.unparsedDefensiveLines,
    });

    expect(compileAll(bing()).map(project)).toEqual([
      { terms: 15, defensiveLines: 18, minionExcluded: 0, offensiveExcluded: 3, catalogRefs: 12, catalogMissingEffects: 0, unparsed: 0 },
      { terms: 13, defensiveLines: 14, minionExcluded: 0, offensiveExcluded: 1, catalogRefs: 23, catalogMissingEffects: 2, unparsed: 0 },
      { terms: 13, defensiveLines: 15, minionExcluded: 0, offensiveExcluded: 2, catalogRefs: 24, catalogMissingEffects: 2, unparsed: 0 },
      { terms: 16, defensiveLines: 20, minionExcluded: 0, offensiveExcluded: 5, catalogRefs: 23, catalogMissingEffects: 2, unparsed: 0 },
      { terms: 16, defensiveLines: 20, minionExcluded: 0, offensiveExcluded: 5, catalogRefs: 25, catalogMissingEffects: 2, unparsed: 0 },
      { terms: 13, defensiveLines: 18, minionExcluded: 0, offensiveExcluded: 5, catalogRefs: 28, catalogMissingEffects: 2, unparsed: 0 },
      { terms: 20, defensiveLines: 24, minionExcluded: 1, offensiveExcluded: 4, catalogRefs: 31, catalogMissingEffects: 4, unparsed: 0 },
    ]);
    expect(compileAll(wuxia()).map(project)).toEqual([
      { terms: 33, defensiveLines: 35, minionExcluded: 2, offensiveExcluded: 0, catalogRefs: 6, catalogMissingEffects: 0, unparsed: 0 },
      { terms: 38, defensiveLines: 42, minionExcluded: 4, offensiveExcluded: 0, catalogRefs: 11, catalogMissingEffects: 0, unparsed: 0 },
      { terms: 41, defensiveLines: 45, minionExcluded: 4, offensiveExcluded: 0, catalogRefs: 16, catalogMissingEffects: 0, unparsed: 0 },
      { terms: 38, defensiveLines: 42, minionExcluded: 5, offensiveExcluded: 0, catalogRefs: 21, catalogMissingEffects: 0, unparsed: 0 },
      { terms: 40, defensiveLines: 46, minionExcluded: 4, offensiveExcluded: 3, catalogRefs: 22, catalogMissingEffects: 0, unparsed: 0 },
      { terms: 41, defensiveLines: 48, minionExcluded: 4, offensiveExcluded: 5, catalogRefs: 25, catalogMissingEffects: 2, unparsed: 0 },
      { terms: 39, defensiveLines: 44, minionExcluded: 5, offensiveExcluded: 2, catalogRefs: 25, catalogMissingEffects: 2, unparsed: 0 },
      { terms: 31, defensiveLines: 35, minionExcluded: 3, offensiveExcluded: 2, catalogRefs: 19, catalogMissingEffects: 0, unparsed: 0 },
      { terms: 45, defensiveLines: 48, minionExcluded: 2, offensiveExcluded: 2, catalogRefs: 32, catalogMissingEffects: 5, unparsed: 0 },
    ]);
  });

  it("guards Iris trait and Protection Field survival inputs by identity and level", () => {
    const build = wuxia();
    const level16 = compileSs13PlayerDefenseEvidence(build, 5, options);
    const level20 = compileSs13PlayerDefenseEvidence(build, 6, options);
    const precise = compileSs13PlayerDefenseEvidence(build, 8, options);
    if (level16.status !== "source-terms"
        || level20.status !== "source-terms"
        || precise.status !== "source-terms") {
      throw new Error("expected source terms");
    }

    const protection = (evidence: PlayerDefenseEvidence) =>
      protectionTerms(evidence)[0];
    expect(protection(level16)).toMatchObject({
      stat: "damage-transfer-to-minion",
      value: 5.75,
      scope: "player-conditional",
      includedInSourceSum: false,
      source: {
        entityId: SUMMON_ROCK_MAGUS_ID,
        locator: "loadouts.loadouts[5].skills.activeSkills[0].supports[2]",
      },
    });
    expect(protection(level20)?.value).toBe(5.95);
    expect(protection(precise)).toMatchObject({
      value: 8.95,
      source: {
        entityId: SUMMON_ROCK_MAGUS_ID,
        modifierId: PRECISE_PROTECTION_FIELD_SUPPORT_ID,
        locator: "loadouts.loadouts[8].skills.activeSkills[0].supports[1]",
      },
    });

    const trait = precise.terms.find((term) =>
      term.source.modifierId === NURTURING_BREEZE_TRAIT_ID);
    expect(trait).toMatchObject({
      stat: "additional-damage-taken",
      value: null,
      candidateValues: [-20, -24, -28, -32, -36],
      scope: "player-conditional",
      includedInSourceSum: false,
    });
    expect(precise.coverage.unresolved).toContainEqual(expect.objectContaining({
      code: "missing-runtime-selector",
      source: expect.stringContaining("hero.traits.level75"),
    }));
  });

  it("rejects misplaced or duplicate Iris defensive trait claims", () => {
    for (const mutate of [
      (traits: any) => {
        traits.level45 = traits.level75;
        delete traits.level75;
      },
      (traits: any) => {
        traits.level45 = traits.level75;
      },
    ]) {
      const build = wuxia();
      mutate(build.loadouts.loadouts[8].hero.traits);
      const result = compileSs13PlayerDefenseEvidence(build, 8, options);
      if (result.status !== "source-terms") throw new Error("expected source terms");
      expect(result.terms.some((term) =>
        term.source.modifierId === NURTURING_BREEZE_TRAIT_ID)).toBe(false);
      expect(result.coverage.unresolved).toContainEqual(expect.objectContaining({
        code: "invalid-installed-reference",
        source: "loadouts.loadouts[8].hero.traits",
        message: expect.stringContaining("level75"),
      }));
    }
  });

  it("rejects Protection Field without an explicitly enabled summon owner", () => {
    for (const enabled of [false, undefined]) {
      const build = wuxia();
      const rock = build.loadouts.loadouts[5].skills.activeSkills[0];
      if (enabled === undefined) delete rock.enabled;
      else rock.enabled = enabled;
      const result = compileSs13PlayerDefenseEvidence(build, 5, options);
      if (result.status !== "source-terms") throw new Error("expected source terms");
      expect(protectionTerms(result)).toEqual([]);
      expect(result.coverage.unresolved).toContainEqual(expect.objectContaining({
        code: "invalid-installed-reference",
        source: "loadouts.loadouts[5].skills.activeSkills[0].supports[2]",
        message: expect.stringContaining("explicitly enabled"),
      }));
    }

    const wrongOwner = wuxia();
    wrongOwner.loadouts.loadouts[5].skills.activeSkills[0].skillGuid =
      "64990a8c-aab4-50c3-b74d-10dee65172e2";
    const wrongOwnerResult =
      compileSs13PlayerDefenseEvidence(wrongOwner, 5, options);
    if (wrongOwnerResult.status !== "source-terms") {
      throw new Error("expected source terms");
    }
    expect(protectionTerms(wrongOwnerResult)).toEqual([]);
    expect(wrongOwnerResult.coverage.unresolved).toContainEqual(
      expect.objectContaining({
        code: "invalid-installed-reference",
        message: expect.stringContaining("Rock or Erosion Magus"),
      }),
    );
  });

  it("accepts Protection Field under a verified passive-bar Erosion summon", () => {
    const build = wuxia();
    const loadout = build.loadouts.loadouts[6];
    const field = loadout.skills.activeSkills[0].supports[2];
    loadout.skills.activeSkills[0].supports[2] = null;
    loadout.skills.passiveSkills[0].supports[2] = field;
    const result = compileSs13PlayerDefenseEvidence(build, 6, options);
    if (result.status !== "source-terms") throw new Error("expected source terms");
    expect(protectionTerms(result)).toEqual([
      expect.objectContaining({
        value: 5.95,
        source: expect.objectContaining({
          entityId: SUMMON_EROSION_MAGUS_ID,
          locator: "loadouts.loadouts[6].skills.passiveSkills[0].supports[2]",
        }),
      }),
    ]);
  });

  it("fails malformed Protection Field socket records closed without throwing", () => {
    for (const supports of [
      null,
      [null, null, null, null],
      [null, null, {
        supportGuid: PROTECTION_FIELD_SUPPORT_ID,
        type: "support",
        level: 20,
      }, null, null, null],
    ]) {
      const build = wuxia();
      build.loadouts.loadouts[5].skills.activeSkills[0].supports = supports;
      const result = compileSs13PlayerDefenseEvidence(build, 5, options);
      if (result.status !== "source-terms") throw new Error("expected source terms");
      expect(protectionTerms(result)).toEqual([]);
      expect(result.coverage.unresolved).toContainEqual(expect.objectContaining({
        code: "invalid-installed-reference",
        source: "loadouts.loadouts[5].skills.activeSkills[0].supports",
        message: expect.stringContaining("exactly five"),
      }));
    }

    for (const mutation of [
      { type: "magnificent_support", level: 20 },
      { type: undefined, level: 20 },
      { type: "support", level: "20" },
      { type: "support", level: 20.5 },
      { type: "support", level: 0 },
      { type: "support", level: 41 },
      { type: "support", level: Number.NaN },
      { type: "support", level: Number.POSITIVE_INFINITY },
    ]) {
      const build = wuxia();
      const support =
        build.loadouts.loadouts[5].skills.activeSkills[0].supports[2];
      if (mutation.type === undefined) delete support.type;
      else support.type = mutation.type;
      support.level = mutation.level;
      const result = compileSs13PlayerDefenseEvidence(build, 5, options);
      if (result.status !== "source-terms") throw new Error("expected source terms");
      expect(protectionTerms(result)).toEqual([]);
      expect(result.coverage.unresolved).toContainEqual(expect.objectContaining({
        code: "invalid-installed-reference",
        source: "loadouts.loadouts[5].skills.activeSkills[0].supports[2]",
      }));
    }
  });

  it("rejects duplicate summon parents and duplicate Protection Field sockets", () => {
    const duplicateOwner = wuxia();
    const active = duplicateOwner.loadouts.loadouts[5].skills.activeSkills;
    active[1] = structuredClone(active[0]);
    const ownerResult =
      compileSs13PlayerDefenseEvidence(duplicateOwner, 5, options);
    if (ownerResult.status !== "source-terms") throw new Error("expected source terms");
    expect(protectionTerms(ownerResult)).toEqual([]);
    expect(ownerResult.coverage.unresolved.filter((entry) =>
      entry.code === "duplicate-equipped-reference"
      && entry.message.includes("multiple parent"))).toHaveLength(2);

    const duplicateSupport = wuxia();
    const supports =
      duplicateSupport.loadouts.loadouts[5].skills.activeSkills[0].supports;
    supports[3] = structuredClone(supports[2]);
    const supportResult =
      compileSs13PlayerDefenseEvidence(duplicateSupport, 5, options);
    if (supportResult.status !== "source-terms") throw new Error("expected source terms");
    expect(protectionTerms(supportResult)).toEqual([]);
    expect(supportResult.coverage.unresolved.filter((entry) =>
      entry.code === "duplicate-equipped-reference"
      && entry.message.includes("multiple Protection Field"))).toHaveLength(2);
  });

  it("uses imported transformed memory values instead of stale base-tier text", () => {
    const result = compileSs13PlayerDefenseEvidence(wuxia(), 8, options);
    if (result.status !== "source-terms") throw new Error("expected source terms");
    expect(result.terms).toContainEqual(expect.objectContaining({
      stat: "armor",
      operation: "add-flat",
      value: 5280,
      source: expect.objectContaining({ kind: "hero-memory" }),
    }));
    expect(result.terms).not.toContainEqual(expect.objectContaining({
      stat: "armor",
      operation: "add-flat",
      value: 4320,
      source: expect.objectContaining({ kind: "hero-memory" }),
    }));
    expect(result.provenance.some((source) =>
      source.sha256 === AUDITED_SS13_COMPACT_CATALOG_SHA256)).toBe(true);
  });

  it("keeps local gear defence separate and exposes exact conditional mitigation", () => {
    const result = compileSs13PlayerDefenseEvidence(wuxia(), 8, options);
    if (result.status !== "source-terms") throw new Error("expected source terms");

    expect(result.terms).toContainEqual(expect.objectContaining({
      stat: "max-energy-shield",
      operation: "add-flat",
      value: 254,
      scope: "local-gear",
    }));
    expect(result.terms).toContainEqual(expect.objectContaining({
      stat: "injury-buffer",
      value: 26,
      scope: "player-conditional",
      condition: expect.stringContaining("50000"),
      source: expect.objectContaining({ kind: "vorax" }),
    }));
    expect(result.sourceSums).toContainEqual(expect.objectContaining({
      key: "player-global:block-ratio:ratio-percent:percent",
      value: 29,
      isCharacterTotal: false,
    }));
    expect(result.sourceSums).toContainEqual(expect.objectContaining({
      key: expect.stringMatching(
        /^local-gear:[^:]+:max-energy-shield:add-flat:flat$/,
      ),
      value: 254,
      isCharacterTotal: false,
    }));
  });

  it("never sums per-level or runtime-conditional defence text as unconditional", () => {
    const build = wuxia();
    const base = compileSs13PlayerDefenseEvidence(build, 0, options);
    if (base.status !== "source-terms") throw new Error("expected source terms");
    const perLevel = base.terms.find((term) =>
      term.text.includes("+5 Max Life per 1 levels"));
    expect(perLevel).toMatchObject({
      stat: "max-life",
      value: 5,
      scope: "player-conditional",
      condition: expect.stringContaining("per 1 levels"),
      includedInSourceSum: false,
    });
    expect(base.sourceSums.some((sum) =>
      perLevel ? sum.termIds.includes(perLevel.id) : false)).toBe(false);

    const equippedId = Object.values(build.loadouts.loadouts[0].gear.equipped)
      .find((value): value is string => typeof value === "string" && value.length > 0);
    const equipped = build.loadouts.loadouts[0].gear.inventory
      .find((item: any) => item.id === equippedId);
    equipped.prefixes.push({ description: "+20% Fire Resistance during Barrier" });
    const conditional = compileSs13PlayerDefenseEvidence(build, 0, options);
    if (conditional.status !== "source-terms") throw new Error("expected source terms");
    const barrier = conditional.terms.find((term) =>
      term.text === "+20% Fire Resistance during Barrier");
    expect(barrier).toMatchObject({
      stat: "fire-resistance",
      operation: "add-percentage-points",
      value: 20,
      scope: "player-conditional",
      condition: "+20% Fire Resistance during Barrier",
      includedInSourceSum: false,
    });
  });

  it("fails catalog-backed resolution closed when the supplied object does not match its hash", () => {
    const mutatedCatalog = structuredClone(catalog);
    mutatedCatalog.entries[0].label = "mutated catalog entry";
    const result = compileSs13PlayerDefenseEvidence(wuxia(), 8, {
      catalog: mutatedCatalog,
      catalogSha256: AUDITED_SS13_COMPACT_CATALOG_SHA256,
    });
    if (result.status !== "source-terms") throw new Error("expected source terms");
    expect(result.coverage.catalog.status).toBe("unsupported");
    expect(result.coverage.catalog.resolvedReferences).toBe(0);
    expect(result.coverage.catalog.missingReferences).toBe(
      result.coverage.catalog.requiredReferences,
    );
    expect(result.provenance.some((source) =>
      source.sha256 === AUDITED_SS13_COMPACT_CATALOG_SHA256)).toBe(false);
  });

  it("keeps a verified immutable catalog snapshot if the caller mutates its object later", () => {
    const mutableCatalog = structuredClone(catalog);
    const mutableOptions = {
      catalog: mutableCatalog,
      catalogSha256: AUDITED_SS13_COMPACT_CATALOG_SHA256,
    };
    const first = compileSs13PlayerDefenseEvidence(wuxia(), 8, mutableOptions);
    if (first.status !== "source-terms") throw new Error("expected source terms");
    const armorMemory = first.terms.find((term) =>
      term.source.kind === "hero-memory"
      && term.stat === "armor"
      && term.value === 5280);
    expect(armorMemory).toBeDefined();
    const entry = mutableCatalog.entries.find((candidate: any) =>
      candidate.id === armorMemory?.source.modifierId);
    entry.metadata.memoryDescription = "Max Life";
    entry.metadata.memoryTemplate = "+# Max Life";

    const second = compileSs13PlayerDefenseEvidence(wuxia(), 8, mutableOptions);
    if (second.status !== "source-terms") throw new Error("expected source terms");
    expect(second.terms).toContainEqual(expect.objectContaining({
      stat: "armor",
      value: 5280,
      source: expect.objectContaining({ kind: "hero-memory" }),
    }));
    expect(second.terms).not.toContainEqual(expect.objectContaining({
      stat: "max-life",
      value: 5280,
      source: expect.objectContaining({ kind: "hero-memory" }),
    }));
  });

  it("rejects malformed kismet ownership and out-of-range rolls before source sums", () => {
    const build = wuxia();
    const loadout = build.loadouts.loadouts[8];
    const lightning = loadout.kismets.find((kismet: any) =>
      kismet.kismetGuid === "0f0beb63-229a-5712-985d-f1fe11a0f1b1");
    expect(lightning).toBeDefined();
    lightning.rollValues[0] = 999;
    const result = compileSs13PlayerDefenseEvidence(build, 8, options);
    if (result.status !== "source-terms") throw new Error("expected source terms");
    expect(result.terms).not.toContainEqual(expect.objectContaining({
      value: 999,
      source: expect.objectContaining({
        kind: "kismet",
        entityId: "0f0beb63-229a-5712-985d-f1fe11a0f1b1",
      }),
    }));
    expect(result.coverage.unresolved).toContainEqual(expect.objectContaining({
      code: "invalid-installed-reference",
      message: expect.stringContaining("outside its verified catalog range"),
    }));

    const malformed = wuxia();
    malformed.loadouts.loadouts[8].kismets[0].pactspritIndex = "0";
    const malformedResult = compileSs13PlayerDefenseEvidence(malformed, 8, options);
    if (malformedResult.status !== "source-terms") throw new Error("expected source terms");
    expect(malformedResult.coverage.unresolved).toContainEqual(expect.objectContaining({
      code: "invalid-installed-reference",
      message: expect.stringContaining("pactspirit slot index"),
    }));
  });

  it("rejects every duplicate equipment claimant and mismatched memory slot", () => {
    const duplicated = wuxia();
    const loadout = duplicated.loadouts.loadouts[8];
    const duplicateMemoryId = loadout.heroMemories.equipped.slot45;
    loadout.heroMemories.equipped.slot60 = duplicateMemoryId;
    const duplicateSlate = structuredClone(loadout.divinity.placements[0]);
    duplicateSlate.row = 99;
    duplicateSlate.col = 99;
    loadout.divinity.placements.push(duplicateSlate);
    const duplicateNodeKismet = structuredClone(loadout.kismets[0]);
    loadout.kismets.push(duplicateNodeKismet);

    const result = compileSs13PlayerDefenseEvidence(duplicated, 8, options);
    if (result.status !== "source-terms") throw new Error("expected source terms");
    expect(result.terms.some((term) =>
      term.source.kind === "hero-memory"
      && term.source.entityId === duplicateMemoryId)).toBe(false);
    expect(result.terms.some((term) =>
      term.source.kind === "divinity-slate"
      && term.source.entityId === duplicateSlate.slateId)).toBe(false);
    expect(result.terms.some((term) =>
      term.source.kind === "kismet"
      && (
        term.source.locator.includes(".kismets[0]")
        || term.source.locator.includes(`.kismets[${loadout.kismets.length - 1}]`)
      ))).toBe(false);
    expect(result.coverage.unresolved.filter((entry) =>
      entry.code === "duplicate-equipped-reference").length).toBeGreaterThanOrEqual(6);

    const swapped = wuxia();
    const originId = swapped.loadouts.loadouts[8].heroMemories.equipped.slot45;
    const disciplineId = swapped.loadouts.loadouts[8].heroMemories.equipped.slot60;
    swapped.loadouts.loadouts[8].heroMemories.equipped.slot45 = disciplineId;
    swapped.loadouts.loadouts[8].heroMemories.equipped.slot60 = originId;
    const swappedResult = compileSs13PlayerDefenseEvidence(swapped, 8, options);
    if (swappedResult.status !== "source-terms") throw new Error("expected source terms");
    expect(swappedResult.terms.some((term) =>
      term.source.kind === "hero-memory"
      && (term.source.entityId === originId || term.source.entityId === disciplineId)))
      .toBe(false);
    expect(swappedResult.coverage.unresolved).toContainEqual(expect.objectContaining({
      code: "invalid-installed-reference",
      message: expect.stringContaining("memory type"),
    }));
  });

  it("excludes minion-only defences while retaining player damage transfer", () => {
    const result = compileSs13PlayerDefenseEvidence(wuxia(), 5, options);
    if (result.status !== "source-terms") throw new Error("expected source terms");

    expect(result.coverage.minionOnlyLinesExcluded).toBeGreaterThan(0);
    expect(result.terms.some((term) =>
      /Minion Elemental Resistance|additional damage taken by Spirit Magi/i.test(term.text)))
      .toBe(false);
    expect(result.terms).toContainEqual(expect.objectContaining({
      actor: "player",
      stat: "damage-transfer-to-minion",
      operation: "transfer-percent",
      value: 24,
      condition: expect.stringContaining("Bond"),
    }));
  });

  it("fails closed by season and reports every missing catalog-backed source", () => {
    const wrongPatch = bing();
    wrongPatch.patch = "SS14";
    expect(compileSs13PlayerDefenseEvidence(wrongPatch, 0, options)).toMatchObject({
      status: "not-calculated",
      actor: "player",
      isTotalEhp: false,
      blockers: [{ code: "unsupported-patch" }],
    });

    const withoutCatalog = compileSs13PlayerDefenseEvidence(wuxia(), 8);
    expect(withoutCatalog.status).toBe("source-terms");
    if (withoutCatalog.status !== "source-terms") throw new Error("expected source terms");
    expect(withoutCatalog.coverage.catalog.status).toBe("missing");
    expect(withoutCatalog.coverage.catalog.resolvedReferences).toBe(0);
    expect(withoutCatalog.coverage.catalog.missingReferences).toBe(
      withoutCatalog.coverage.catalog.requiredReferences,
    );
    expect(withoutCatalog.playerEhp.blockers.map((blocker) => blocker.code)).toContain(
      "incomplete-defence-catalog-coverage",
    );
  });

  it("does not interpret missing source projections as empty comparison sides", () => {
    const build = wuxia();
    const truncated = structuredClone(build.loadouts.loadouts[8]);
    delete truncated.gear;
    build.loadouts.loadouts.push(truncated);
    const truncatedIndex = build.loadouts.loadouts.length - 1;

    const evidence = compileSs13PlayerDefenseEvidence(
      build,
      truncatedIndex,
      options,
    );
    if (evidence.status !== "source-terms") throw new Error("expected guarded terms");
    expect(evidence.coverage.unresolved).toContainEqual(expect.objectContaining({
      code: "missing-source-projection",
      source: `loadouts.loadouts[${truncatedIndex}].gear`,
    }));
    expect(evidence.playerEhp.blockers).toContainEqual(expect.objectContaining({
      code: "incomplete-defence-source-projection",
    }));

    expect(compareSs13PlayerDefenseEvidence(
      build,
      8,
      truncatedIndex,
      options,
    )).toMatchObject({
      status: "not-calculated",
      blockers: [{
        code: "incomplete-defence-source-projection",
        message: expect.stringContaining("After loadout"),
      }],
    });
  });

  it("compares source sums without calling their direction an EHP change", () => {
    const comparison = compareSs13PlayerDefenseEvidence(wuxia(), 7, 8, options);
    expect(comparison.status).toBe("source-terms");
    if (comparison.status !== "source-terms") throw new Error("expected source terms");
    expect(comparison.actor).toBe("player");
    expect(comparison.isTotalEhp).toBe(false);
    expect(comparison.sourceSumChanges.length).toBeGreaterThan(0);
    expect(comparison.sourceSumChanges.every((change) => change.isEhpDelta === false)).toBe(true);
    expect(comparison.warning).toContain("not EHP deltas");
  });
});
