/*
 * Season-pinned, fail-closed intrinsic Bing/Hammer slice.
 *
 * This module intentionally stops before a total hit or DPS.  It proves the
 * weapon-sourced per-instance damage after Hammer of Ash's intrinsic
 * conversion, the per-instance Demolisher modifier, and the intrinsic
 * Blast-Nova emission topology.  It does not turn emitted projectiles into
 * target hits or reuse the calibrated Bing snapshot as if it described an
 * arbitrary imported loadout.
 */

import {
  BING_BLAST_NOVA_ID,
  HAMMER_OF_ASH_ID,
  SS13_HAMMER_FORMULA_SOURCE,
  compileBingWeaponFoundation,
  ss13HammerOfAshFormula,
  type CalculationBlocker,
  type FormulaProvenance,
  type WeaponDamageRange,
} from "./guardedCompiler.js";

export const BLAST_NOVA_BASE_TRAIT_ID = "7eb1ad5c-35ab-5ae8-a003-ba6cde830ade";
export const FIREPOWER_COVERAGE_TRAIT_ID = "4fbc0d8e-39e8-5033-bb23-c0352e019946";
export const BLAST_BARRAGE_TRAIT_ID = "837b91e7-cf64-5e20-bb97-98d247d24906";
export const FRENZY_HOUND_TRAIT_ID = "e5c77ce6-703d-582a-a21a-327d918f5a85";
export const HERO_TRAIT_LEVEL_MEMORY_MOD_IDS = new Set([
  "74429046-31da-548f-8240-3bb4fc49427f",
  "b9756e76-fab4-520d-b3ab-40c2e4a16c20",
  "d04edb43-c571-5b70-b127-f018b512d38c",
]);
export const IRON_LION_ID = "f3abd1bc-addd-5d34-8d40-d9996f62181c";
export const IRON_LION_PROJECTILE_NODE_ID = "10";
export const THREE_BIRDS_SLATE_MOD_ID = "6b76d9bd-aa42-52d0-83e6-cb864c53eb64";
export const THREE_BIRDS_TALENT_ID = "7c5c0738-ca24-5513-afe2-a69f46072475";
export const MULTIPLE_PROJECTILES_SUPPORT_ID = "faa709b0-6a3a-5158-9db6-5e6c442bd106";
export const SPIRAL_STRIKE_SKILL_ID = "f7927f48-4bb4-5f34-8a2f-194f67f9aca4";

export const SS13_HAMMER_TEXT_SOURCE: FormulaProvenance = {
  source: "https://tlicompendium.com/data-bundles/SS13-skill-en.json",
  locator: "skill/Active/i18n/en.skills[id=6f020b6a-022b-50eb-8299-e5fc7492ea8f].{templateDescription,templateDescriptionSimple,templateDescriptionDetail}",
  sha256: "10b5cf27e8f50acca7ff2ec5a7534d5eb5e8e1eee83493f86851967fc0cd7cb1",
  confidence: "source-data",
};

export const SS13_BING_HERO_MASTER_SOURCE: FormulaProvenance = {
  source: "https://tlicompendium.com/data-bundles/SS13-hero-trait-master.json",
  locator: "hero-trait/master.heroes[id=c89dce15-cbeb-562d-83ec-993059bbf0ec]",
  sha256: "f56051f4c17b5b7c0cbd2f95f613b0ba95cdded0686d789136b556b70470042a",
  confidence: "source-data",
};

export const SS13_BING_HERO_TEXT_SOURCE: FormulaProvenance = {
  source: "https://tlicompendium.com/data-bundles/SS13-hero-trait-en.json",
  locator: "hero-trait/i18n/en.heroes[c89dce15-cbeb-562d-83ec-993059bbf0ec].traits",
  sha256: "f8f2f155dbdc4e62056bb2f81b1e7359c21badb7d772b39f76842e3cd0b455ff",
  confidence: "source-data",
};

export const SS13_PACTSPIRIT_MASTER_SOURCE: FormulaProvenance = {
  source: "https://tlicompendium.com/data-bundles/SS13-pactspirit-master.json",
  locator: `pactspirit/master.pactspirits[id=${IRON_LION_ID}].nodes[nodeId=10]`,
  sha256: "a135189f802e7308d2b15033f1aff6b91fd4f35a5c41ae3008bd44c7c957bcfc",
  confidence: "source-data",
};

export const SS13_PACTSPIRIT_TEXT_SOURCE: FormulaProvenance = {
  source: "https://tlicompendium.com/data-bundles/SS13-pactspirit-en.json",
  locator: `pactspirit/i18n/en.pactspirits[${IRON_LION_ID}].nodes[10]`,
  sha256: "5f911041dc1691b4d51be84952498e58d682b3ec828547965938538d8cd8d082",
  confidence: "source-data",
};

export const SS13_KISMET_MASTER_SOURCE: FormulaProvenance = {
  source: "https://tlicompendium.com/data-bundles/SS13-kismet-master.json",
  locator: "kismet/master.kismets[*].type (season set: Micro, Medium, Undetermined Fate; no Notable)",
  sha256: "684022248437ce49bcd7e1cc03797081ee2c3fabdd28884a744014c3228b5b54",
  confidence: "source-data",
};

export const POORCHLIGHT_KISMET_SLOT_SOURCE: FormulaProvenance = {
  source: "poorchlight/tli_dump/ui/compendium-export.mjs",
  locator: "validKismet(): slot_<pact index>_<base node ID> schema and type match",
  sha256: "f4ec95ee3b892299b5de5e1d6e16f2ef448b8c1b8c665afbd673788a9e60482d",
  confidence: "source-data",
};

export const SS13_TALENT_TEXT_SOURCE: FormulaProvenance = {
  source: "https://tlicompendium.com/data-bundles/SS13-talent-tree-en.json",
  locator: `talent-tree/goddess_of_hunting/i18n/en.tree.notables[${THREE_BIRDS_TALENT_ID}]`,
  sha256: "cefe8ecf06a8a0876f9c0d048fd14caaa0f6204bade79ac6cf35672f24e00233",
  confidence: "source-data",
};

export const SS13_HERO_MEMORY_MASTER_SOURCE: FormulaProvenance = {
  source: "https://tlicompendium.com/data-bundles/SS13-hero-memory-master.json",
  locator: "hero-memory/master.{baseStats,fixedAffixes[modifierId in {402151201,402153101,402155001}]}",
  sha256: "f8aeede9d9a6785859ec6c1f07fc895505ffcbb812be15da1d1a4286f0f4c249",
  confidence: "source-data",
};

export const SS13_HERO_MEMORY_TEXT_SOURCE: FormulaProvenance = {
  source: "https://tlicompendium.com/data-bundles/SS13-hero-memory-en.json",
  locator: "hero-memory/i18n/en.fixedAffixes[modifierId in {402151201,402153101,402155001}]",
  sha256: "eab809b76569450c542ed953a861ca0cf328d6e661aa418e7e982be15862f465",
  confidence: "source-data",
};

export const TLI_COMPENDIUM_MEMORY_LEVEL_RUNTIME_SOURCE: FormulaProvenance = {
  source: "https://tlicompendium.com/assets/app-Dt7HnEFg.js",
  locator: "chars 90617+: U9(tier)=41-tier; K9(level)=level>=50?3:level>=30?2:1",
  sha256: "4b8def40325b5b35402375a2c299a9cd82967b97412f7f13579645f29eb11150",
  confidence: "source-data",
};

export const TLI_COMPENDIUM_EFFECTIVE_TRAIT_LEVEL_RUNTIME_SOURCE: FormulaProvenance = {
  source: "https://tlicompendium.com/assets/TalentTreePlaybackSlider-DcRE_ib_.js",
  locator: "chars 16290+: kt modifier-ID set; At/Lt base level; _n = base + fixed-affix levels",
  sha256: "3542ac817259807ff133b6e19812d4e65b60c41cd302e5508672bdd85e3dddfb",
  confidence: "source-data",
};

export const TLI_COMPENDIUM_TRAIT_SLOT_RUNTIME_SOURCE: FormulaProvenance = {
  source: "https://tlicompendium.com/assets/ManageLoadoutsModal-r6FwZQxS.js",
  locator: "chars 98683+: unlock levels 1/45/60/75 map to slotLevel1Special/slot45/slot60/slot75",
  sha256: "d83da97af0bdeba0f404408c1686038d6e6ae6b794659d0de8e0cc5ddfb7b7a6",
  confidence: "source-data",
};

export const POORCHLIGHT_SS13_IDENTITY_SOURCE: FormulaProvenance = {
  source: "poorchlight/tli_dump/data/compendium-catalog-ss13.json",
  locator: `entries[id in {${BING_BLAST_NOVA_ID},${HAMMER_OF_ASH_ID},${BLAST_NOVA_BASE_TRAIT_ID},${FIREPOWER_COVERAGE_TRAIT_ID},${BLAST_BARRAGE_TRAIT_ID},${FRENZY_HOUND_TRAIT_ID},${[...HERO_TRAIT_LEVEL_MEMORY_MOD_IDS].join(",")},${IRON_LION_ID},${THREE_BIRDS_SLATE_MOD_ID},${THREE_BIRDS_TALENT_ID},${MULTIPLE_PROJECTILES_SUPPORT_ID}}]`,
  sha256: "c7b5392533305d5b4ed91e1c8efe01a5b5ea0e7d64d7636b9cfb8d55ae24b796",
  confidence: "source-data",
};

export const GUARDED_INTRINSIC_RULE_SOURCE: FormulaProvenance = {
  source: "rehan_guide/docs/mechanics.md",
  locator: "#guarded-bing-intrinsic",
  confidence: "confirmed-mechanic",
};

export type IntrinsicDamageType =
  | "physical"
  | "cold"
  | "fire"
  | "lightning"
  | "erosion";

export interface WeaponSourcedPerHit {
  scope: "one weapon-sourced Hammer of Ash hit instance";
  multiplier: number;
  portions: Record<IntrinsicDamageType, WeaponDamageRange>;
  total: WeaponDamageRange;
}

export interface IntrinsicSkillComponent {
  id: "pummel" | "ember-projectile" | "explosion";
  label: string;
  weaponAttackDamagePct: number;
  condition: string | null;
}

export interface ProjectileQuantitySource {
  id:
    | "hammer-of-ash"
    | "blast-nova"
    | "multiple-projectiles"
    | "three-birds-talent"
    | "iron-lion"
    | "placed-divinity-slate";
  quantity: number;
  sourcePath: string;
}

export interface HeroTraitLevelSource {
  id: "base-trait-level" | "equipped-hero-memory";
  traitSlot: "level1" | "level45" | "level60" | "level75";
  levels: number;
  sourcePath: string;
}

export interface BingHeroTraitLevels {
  level1: number;
  level45: number;
  level60: number;
  level75: number;
}

export interface BombCountOutcome {
  bombs: number;
  probability: number;
}

export interface ProjectileEmissionOutcome extends BombCountOutcome {
  projectiles: number;
}

export interface BingIntrinsicTopology {
  status: "calculated-partial";
  scope: "source-visible emitted projectiles per throw";
  isDps: false;
  isTargetHits: false;
  heroTraitLevels: BingHeroTraitLevels;
  heroTraitLevelSources: HeroTraitLevelSource[];
  blastNovaAdditionalBombDamagePct: number;
  firepowerMovingThrowSpeedAdditionalPct: number;
  blastBarrageAdditionalBombChancePct: number;
  frenzyHoundNearbyAdditionalDamagePct: number;
  intrinsicBombsPerThrow: 2;
  intrinsicProjectilesPerBomb: 5;
  projectileQuantitySources: ProjectileQuantitySource[];
  projectilesPerBomb: number;
  bombCountOutcomes: BombCountOutcome[];
  expectedBombsPerThrow: number;
  emittedProjectilesPerThrowOutcomes: ProjectileEmissionOutcome[];
  expectedEmittedProjectilesPerThrow: number;
  baseBombThrowRatePerSecond: 1;
  maximumUndetonatedBombs: 10;
  baseDetonationDelaySeconds: 1;
  detonatesImmediatelyAfterLanding: true;
  demolisherChargeIntervalSeconds: number;
  demolisherAdditionalHitDamagePct: number;
  physicalToFireConversionPct: number;
  shotgunFalloffPct: number;
  pummelAndExplosionCanHitSameEnemy: true;
}

export interface GuardedUnknown {
  status: "not-calculated";
  blockers: CalculationBlocker[];
}

export interface GuardedDpsUnknown extends GuardedUnknown {
  isDps: false;
}

export interface BingIntrinsicTopologyUnavailable extends GuardedUnknown {
  isDps: false;
  isTargetHits: false;
}

export type BingIntrinsicTopologyResult =
  | BingIntrinsicTopology
  | BingIntrinsicTopologyUnavailable;

export interface BingIntrinsicEnvelope {
  status: "calculated-partial";
  kind: "bing-intrinsic-envelope";
  isDps: false;
  isTotalHit: false;
  patch: "SS13";
  heroId: typeof BING_BLAST_NOVA_ID;
  heroBaseTraitId: typeof BLAST_NOVA_BASE_TRAIT_ID;
  skillId: typeof HAMMER_OF_ASH_ID;
  skillLevel: number;
  loadoutIndex: number;
  loadoutName: string;
  confidence: "confirmed-partial" | "inferred-partial";
  recordedTraitIds: string[];
  conversion: Array<{
    from: "physical";
    to: "fire";
    percent: 100;
  }>;
  components: IntrinsicSkillComponent[];
  normalWeaponSourcedPerHit: WeaponSourcedPerHit;
  demolisherChargedWeaponSourcedPerHit: WeaponSourcedPerHit;
  topology: BingIntrinsicTopologyResult;
  actualBombsPerThrow: GuardedUnknown;
  actualProjectilesPerBomb: GuardedUnknown;
  actualThrowRate: GuardedUnknown;
  actualDemolisherEmpoweredShare: GuardedUnknown;
  effectiveTargetHits: GuardedUnknown;
  actualTotalHit: GuardedUnknown;
  actualDps: GuardedDpsUnknown;
  provenance: FormulaProvenance[];
  excludedFromMetric: string[];
}

export interface BingIntrinsicUnavailable {
  status: "not-calculated";
  kind: "bing-intrinsic-envelope";
  isDps: false;
  isTotalHit: false;
  blockers: CalculationBlocker[];
}

export type BingIntrinsicEnvelopeResult =
  | BingIntrinsicEnvelope
  | BingIntrinsicUnavailable;

function loadoutAt(build: any, index: number): any | null {
  const loadouts = build?.loadouts?.loadouts;
  return Array.isArray(loadouts) ? loadouts[index] ?? null : null;
}

function unavailable(blockers: CalculationBlocker[]): BingIntrinsicUnavailable {
  return {
    status: "not-calculated",
    kind: "bing-intrinsic-envelope",
    isDps: false,
    isTotalHit: false,
    blockers,
  };
}

function range(min: number, max: number): WeaponDamageRange {
  const normalizedMin = Number(min.toFixed(10));
  const normalizedMax = Number(max.toFixed(10));
  return {
    min: normalizedMin,
    max: normalizedMax,
    average: Number(((normalizedMin + normalizedMax) / 2).toFixed(10)),
  };
}

function scale(value: WeaponDamageRange, multiplier: number): WeaponDamageRange {
  return range(value.min * multiplier, value.max * multiplier);
}

function add(...values: WeaponDamageRange[]): WeaponDamageRange {
  return range(
    values.reduce((sum, value) => sum + value.min, 0),
    values.reduce((sum, value) => sum + value.max, 0),
  );
}

function perHit(
  portions: Record<IntrinsicDamageType, WeaponDamageRange>,
  multiplier: number,
): WeaponSourcedPerHit {
  const scaled = {
    physical: scale(portions.physical, multiplier),
    cold: scale(portions.cold, multiplier),
    fire: scale(portions.fire, multiplier),
    lightning: scale(portions.lightning, multiplier),
    erosion: scale(portions.erosion, multiplier),
  };
  return {
    scope: "one weapon-sourced Hammer of Ash hit instance",
    multiplier,
    portions: scaled,
    total: add(...Object.values(scaled)),
  };
}

function unknown(...blockers: CalculationBlocker[]): GuardedUnknown {
  return { status: "not-calculated", blockers };
}

function uniqueProvenance(values: FormulaProvenance[]): FormulaProvenance[] {
  const sources = new Map<string, FormulaProvenance>();
  for (const value of values) {
    sources.set(
      `${value.source}\u0000${value.locator}\u0000${value.sha256 ?? ""}`,
      value,
    );
  }
  return [...sources.values()];
}

function arrayValue(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function recordValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function topologyProjectionBlocker(
  path: string,
  malformed = false,
): CalculationBlocker {
  return {
    code: malformed
      ? "invalid-topology-projection"
      : "missing-topology-projection",
    message: malformed
      ? `The imported ${path} projection is malformed, so omitted projectile-quantity sources cannot be ruled out.`
      : `The imported loadout omits ${path}, so omitted projectile-quantity sources cannot be ruled out.`,
    evidence: `${path}: explicit empty sections are accepted; absent or malformed projections fail closed`,
  };
}

function validateTopologyProjections(loadout: any): CalculationBlocker[] {
  const blockers: CalculationBlocker[] = [];
  const requireArray = (owner: any, field: string, path: string): void => {
    if (!recordValue(owner) || !Object.prototype.hasOwnProperty.call(owner, field)) {
      blockers.push(topologyProjectionBlocker(path));
    } else if (!Array.isArray(owner[field])) {
      blockers.push(topologyProjectionBlocker(path, true));
    }
  };
  const requireRecord = (owner: any, field: string, path: string): void => {
    if (!recordValue(owner) || !Object.prototype.hasOwnProperty.call(owner, field)) {
      blockers.push(topologyProjectionBlocker(path));
    } else if (!recordValue(owner[field])) {
      blockers.push(topologyProjectionBlocker(path, true));
    }
  };

  requireRecord(loadout, "heroMemories", "heroMemories");
  if (recordValue(loadout?.heroMemories)) {
    requireArray(loadout.heroMemories, "inventory", "heroMemories.inventory");
    requireRecord(loadout.heroMemories, "equipped", "heroMemories.equipped");
  }

  requireRecord(loadout, "divinity", "divinity");
  if (recordValue(loadout?.divinity)) {
    requireArray(loadout.divinity, "inventory", "divinity.inventory");
    requireArray(loadout.divinity, "placements", "divinity.placements");
  }

  requireArray(loadout, "pactspirits", "pactspirits");
  requireArray(loadout, "kismets", "kismets");

  for (const [index, pact] of arrayValue(loadout?.pactspirits).entries()) {
    if (!recordValue(pact)
        || typeof pact.guid !== "string"
        || !Array.isArray(pact.allocatedNodes)) {
      blockers.push(topologyProjectionBlocker(`pactspirits[${index}]`, true));
    }
  }
  for (const [index, kismet] of arrayValue(loadout?.kismets).entries()) {
    const pactIndex = finiteInteger(kismet?.pactspritIndex);
    if (!recordValue(kismet)
        || pactIndex === null
        || pactIndex < 0
        || pactIndex > 2
        || typeof kismet.nodeId !== "string") {
      blockers.push(topologyProjectionBlocker(`kismets[${index}]`, true));
    }
  }

  for (const projection of ["gear", "vorax"] as const) {
    requireRecord(loadout, projection, projection);
    if (recordValue(loadout?.[projection])) {
      requireArray(loadout[projection], "inventory", `${projection}.inventory`);
      requireRecord(loadout[projection], "equipped", `${projection}.equipped`);
    }
  }

  requireRecord(loadout, "skillTree", "skillTree");
  if (recordValue(loadout?.skillTree)) {
    requireArray(loadout.skillTree, "slots", "skillTree.slots");
  }
  if (!recordValue(loadout)
      || !Object.prototype.hasOwnProperty.call(loadout, "scentBottle")) {
    blockers.push(topologyProjectionBlocker("scentBottle"));
  } else if (loadout.scentBottle !== null && !recordValue(loadout.scentBottle)) {
    blockers.push(topologyProjectionBlocker("scentBottle", true));
  }

  return blockers;
}

function topologyUnavailable(
  ...blockers: CalculationBlocker[]
): BingIntrinsicTopologyUnavailable {
  return {
    status: "not-calculated",
    isDps: false,
    isTargetHits: false,
    blockers,
  };
}

function modifierId(value: any): string | null {
  for (const key of ["guid", "modifierId", "modGuid", "id"]) {
    if (typeof value?.[key] === "string") return value[key];
  }
  return null;
}

function finiteInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : null;
}

function normalizedProbability(value: number): number {
  return Number(value.toFixed(10));
}

interface TraitLevelResolution {
  status: "calculated";
  levels: BingHeroTraitLevels;
  sources: HeroTraitLevelSource[];
}

interface TraitLevelUnavailable {
  status: "not-calculated";
  blockers: CalculationBlocker[];
}

function resolveHeroTraitLevels(
  loadout: any,
): TraitLevelResolution | TraitLevelUnavailable {
  const inventory = new Map<string, any>();
  const inventoryCounts = new Map<string, number>();
  for (const memory of arrayValue(loadout?.heroMemories?.inventory)) {
    if (typeof memory?.id === "string") {
      inventory.set(memory.id, memory);
      inventoryCounts.set(
        memory.id,
        (inventoryCounts.get(memory.id) ?? 0) + 1,
      );
    }
  }
  const seenMemoryIds = new Set<string>();
  const sources: HeroTraitLevelSource[] = [];
  const levels: BingHeroTraitLevels = {
    level1: 1,
    level45: 1,
    level60: 1,
    level75: 1,
  };
  const slotMapping = [
    ["level1", "slotLevel1Special", null, null],
    ["level45", "slot45", "Origin", "74429046-31da-548f-8240-3bb4fc49427f"],
    ["level60", "slot60", "Discipline", "b9756e76-fab4-520d-b3ab-40c2e4a16c20"],
    ["level75", "slot75", "Progress", "d04edb43-c571-5b70-b127-f018b512d38c"],
  ] as const;

  for (const [
    traitSlot,
    memorySlot,
    expectedMemoryType,
    expectedTraitLevelModifier,
  ] of slotMapping) {
    const rawMemoryId = loadout?.heroMemories?.equipped?.[memorySlot];
    if (rawMemoryId == null) {
      sources.push({
        id: "base-trait-level",
        traitSlot,
        levels: 1,
        sourcePath: `heroMemories.equipped.${memorySlot}=null`,
      });
      continue;
    }
    if (typeof rawMemoryId !== "string") {
      return {
        status: "not-calculated",
        blockers: [{
          code: "invalid-equipped-hero-memory-reference",
          message: `Hero-memory slot ${memorySlot} is not a string ID or null.`,
        }],
      };
    }
    const memory = inventory.get(rawMemoryId);
    if (!memory) {
      return {
        status: "not-calculated",
        blockers: [{
          code: "unresolved-equipped-hero-memory",
          message: "An equipped hero memory could not be resolved from the imported inventory.",
          evidence: `heroMemories.equipped.${memorySlot}=${rawMemoryId}`,
        }],
      };
    }
    if ((inventoryCounts.get(rawMemoryId) ?? 0) !== 1) {
      return {
        status: "not-calculated",
        blockers: [{
          code: "duplicate-hero-memory-inventory-id",
          message: "An equipped hero memory does not resolve to exactly one imported inventory record.",
          evidence: rawMemoryId,
        }],
      };
    }
    if (seenMemoryIds.has(rawMemoryId)) {
      return {
        status: "not-calculated",
        blockers: [{
          code: "duplicate-equipped-hero-memory",
          message: "The same hero-memory inventory item is referenced by multiple equipped slots.",
          evidence: rawMemoryId,
        }],
      };
    }
    seenMemoryIds.add(rawMemoryId);
    if (expectedMemoryType === null
        || memory?.memoryType !== expectedMemoryType) {
      return {
        status: "not-calculated",
        blockers: [{
          code: "invalid-hero-memory-slot-type",
          message: `Hero-memory slot ${memorySlot} does not contain its verified SS13 memory type.`,
          evidence: expectedMemoryType
            ? `expected ${expectedMemoryType}; received ${String(memory?.memoryType ?? "missing")}`
            : "The level-1 special slot is not compiled as a normal equipped memory.",
        }],
      };
    }
    if (!Array.isArray(memory?.fixedAffixes)) {
      return {
        status: "not-calculated",
        blockers: [{
          code: "invalid-hero-memory-affix-projection",
          message: "An equipped hero memory omits its exact fixedAffixes array.",
          evidence: `heroMemories.inventory[id=${rawMemoryId}].fixedAffixes`,
        }],
      };
    }

    const baseTier = finiteInteger(memory?.baseStat?.tier);
    if (baseTier === null || baseTier < 1 || baseTier > 40) {
      return {
        status: "not-calculated",
        blockers: [{
          code: "invalid-hero-memory-base-tier",
          message: "An equipped hero memory lacks the valid base-stat tier needed to derive its trait level.",
          evidence: `heroMemories.inventory[id=${rawMemoryId}].baseStat.tier=${String(memory?.baseStat?.tier)}`,
        }],
      };
    }
    const enhancementLevel = 41 - baseTier;
    const baseTraitLevel = enhancementLevel >= 50
      ? 3
      : enhancementLevel >= 30
        ? 2
        : 1;
    let effectiveLevel = baseTraitLevel;
    sources.push({
      id: "base-trait-level",
      traitSlot,
      levels: baseTraitLevel,
      sourcePath: `heroMemories.equipped.${memorySlot} -> inventory[id=${rawMemoryId}].baseStat.tier=${baseTier}`,
    });

    const traitLevelAffixes = memory.fixedAffixes.filter((affix: any) =>
      HERO_TRAIT_LEVEL_MEMORY_MOD_IDS.has(String(modifierId(affix))));
    if (traitLevelAffixes.length > 1) {
      return {
        status: "not-calculated",
        blockers: [{
          code: "duplicate-hero-trait-level-memory-modifier",
          message: "An equipped hero memory claims more than one +Hero Trait Level fixed affix.",
          evidence: `heroMemories.inventory[id=${rawMemoryId}].fixedAffixes`,
        }],
      };
    }
    for (const affix of traitLevelAffixes) {
      const affixId = modifierId(affix);
      if (affixId !== expectedTraitLevelModifier) {
        return {
          status: "not-calculated",
          blockers: [{
            code: "invalid-hero-trait-level-memory-modifier",
            message: "A +Hero Trait Level fixed affix does not match the equipped memory type.",
            evidence: `expected ${expectedTraitLevelModifier}; received ${String(affixId)}`,
          }],
        };
      }
      const value = finiteInteger(affix?.value
        ?? arrayValue(affix?.values)[0]?.value
        ?? arrayValue(affix?.rollValues)[0]);
      if (affix?.sign !== "+" || value !== 2) {
        return {
          status: "not-calculated",
          blockers: [{
            code: "invalid-hero-trait-level-memory-roll",
            message: "The season-pinned +Hero Trait Level modifier must carry its exact +2 imported roll.",
            evidence: `heroMemories.inventory[id=${rawMemoryId}]`,
          }],
        };
      }
      effectiveLevel += value;
      sources.push({
        id: "equipped-hero-memory",
        traitSlot,
        levels: value,
        sourcePath: `heroMemories.equipped.${memorySlot} -> inventory[id=${rawMemoryId}].fixedAffixes`,
      });
    }
    if (effectiveLevel < 1 || effectiveLevel > 5) {
      return {
        status: "not-calculated",
        blockers: [{
          code: "unsupported-hero-trait-level",
          message: "A resolved SS13 Bing hero-trait level is outside the source table's 1-5 range.",
          evidence: `${traitSlot}: ${effectiveLevel}`,
        }],
      };
    }
    levels[traitSlot] = effectiveLevel;
  }
  return { status: "calculated", levels, sources };
}

interface QuantityResolution {
  status: "calculated";
  sources: ProjectileQuantitySource[];
}

interface QuantityUnavailable {
  status: "not-calculated";
  blockers: CalculationBlocker[];
}

function containsPositiveProjectileQuantity(value: unknown): boolean {
  if (typeof value === "string") {
    return /(?:Projectile Quantity(?: of (?:this|the supported) skill)?\s*\+\d+|\+\d+\s+(?:Base )?Projectile Quantity)/i
      .test(value.replace(/<[^>]+>/g, " "));
  }
  if (Array.isArray(value)) return value.some(containsPositiveProjectileQuantity);
  if (value && typeof value === "object") {
    return Object.values(value).some(containsPositiveProjectileQuantity);
  }
  return false;
}

function validateHammerSupportSockets(
  hammer: any,
): CalculationBlocker[] {
  const blockers: CalculationBlocker[] = [];
  if (!Array.isArray(hammer?.supports) || hammer.supports.length !== 5) {
    return [topologyProjectionBlocker(
      "skills.activeSkills[Hammer of Ash].supports",
      hammer?.supports !== undefined,
    )];
  }
  const multipleProjectilePaths: string[] = [];
  for (const [index, support] of hammer.supports.entries()) {
    if (support == null) continue;
    const path = `skills.activeSkills[Hammer of Ash].supports[${index}]`;
    if (!recordValue(support)
        || typeof support.supportGuid !== "string"
        || !support.supportGuid) {
      blockers.push({
        code: "invalid-hammer-support-installation",
        message: "A non-empty Hammer support socket has no valid support record identity.",
        evidence: path,
      });
      continue;
    }
    const supportType = support.type;
    const rolls = support.rollValues;
    const rollsValid = rolls === undefined
      || (Array.isArray(rolls)
        && rolls.every((roll: unknown) =>
          typeof roll === "number" && Number.isFinite(roll)));
    if (!rollsValid) {
      blockers.push({
        code: "invalid-hammer-support-installation",
        message: "A Hammer support has a malformed rollValues projection.",
        evidence: path,
      });
      continue;
    }
    if (supportType === "support") {
      const supportLevel = finiteInteger(support.level);
      if (supportLevel === null
          || supportLevel < 1
          || supportLevel > 40
          || support.tier !== undefined
          || support.rank !== undefined
          || support.rollValues !== undefined) {
        blockers.push({
          code: "invalid-hammer-support-installation",
          message: "An ordinary Hammer support must have an exact integer level 1-40 and no rolled-special metadata.",
          evidence: path,
        });
      }
    } else if (supportType === "activation_medium") {
      if (support.level !== undefined
          || finiteInteger(support.tier) === null
          || support.rank !== undefined
          || !Array.isArray(rolls)
          || rolls.length !== 1) {
        blockers.push({
          code: "invalid-hammer-support-installation",
          message: "A Hammer activation medium has malformed tier/rank/roll metadata.",
          evidence: path,
        });
      }
    } else if (supportType === "magnificent_support"
        || supportType === "noble_support") {
      if (support.level !== undefined
          || finiteInteger(support.tier) === null
          || finiteInteger(support.rank) === null
          || !Array.isArray(rolls)
          || rolls.length !== 1) {
        blockers.push({
          code: "invalid-hammer-support-installation",
          message: "A rolled special Hammer support has malformed tier/rank/roll metadata.",
          evidence: path,
        });
      }
    } else {
      blockers.push({
        code: "invalid-hammer-support-installation",
        message: `Hammer support type ${String(supportType ?? "missing")} is not part of the verified Compendium socket schema.`,
        evidence: path,
      });
    }
    if (support.supportGuid === MULTIPLE_PROJECTILES_SUPPORT_ID
        && supportType !== "support") {
      blockers.push({
        code: "invalid-multiple-projectiles-installation",
        message: "Multiple Projectiles must be installed as an ordinary level support.",
        evidence: path,
      });
    }
    if (support.supportGuid === MULTIPLE_PROJECTILES_SUPPORT_ID) {
      multipleProjectilePaths.push(path);
    }
  }
  if (multipleProjectilePaths.length > 1) {
    blockers.push({
      code: "duplicate-projectile-quantity-support",
      message:
        "Multiple Projectiles appears in more than one Hammer socket; its quantity stacking and installation legality are not assumed.",
      evidence: multipleProjectilePaths.join(" · "),
    });
  }
  return blockers;
}

function resolveProjectileQuantitySources(
  loadout: any,
  formula: NonNullable<ReturnType<typeof ss13HammerOfAshFormula>>,
): QuantityResolution | QuantityUnavailable {
  const sources: ProjectileQuantitySource[] = [
    {
      id: "hammer-of-ash",
      quantity: formula.baseProjectileQuantity + formula.addedProjectileQuantity,
      sourcePath: "skills.activeSkills[Hammer of Ash]",
    },
    {
      id: "blast-nova",
      quantity: 2,
      sourcePath: "hero.traits.level1",
    },
  ];

  const hammer = arrayValue(loadout?.skills?.activeSkills).find(
    (skill) => skill?.enabled === true && skill?.skillGuid === HAMMER_OF_ASH_ID,
  );
  if (!hammer) {
    return {
      status: "not-calculated",
      blockers: [{
        code: "missing-hammer-of-ash",
        message: "The enabled Hammer of Ash record disappeared while resolving projectile quantity.",
      }],
    };
  }
  const supportBlockers = validateHammerSupportSockets(hammer);
  if (supportBlockers.length > 0) {
    return {
      status: "not-calculated",
      blockers: supportBlockers,
    };
  }
  for (const [index, support] of hammer.supports.entries()) {
    if (support?.supportGuid !== MULTIPLE_PROJECTILES_SUPPORT_ID) continue;
    sources.push({
      id: "multiple-projectiles",
      quantity: 2,
      sourcePath: `skills.activeSkills[Hammer of Ash].supports[${index}]`,
    });
  }

  const conditionalQuantitySkill = arrayValue(loadout?.skills?.activeSkills)
    .find((skill) => skill?.enabled !== false && skill?.skillGuid === SPIRAL_STRIKE_SKILL_ID);
  if (conditionalQuantitySkill) {
    return {
      status: "not-calculated",
      blockers: [{
        code: "conditional-projectile-quantity-buff",
        message: "Spiral Strike can conditionally add Projectile Quantity, but its runtime buff state is not recorded.",
      }],
    };
  }

  for (const [slotIndex, slot] of arrayValue(loadout?.skillTree?.slots).entries()) {
    for (const field of ["selectedNotable12", "selectedNotable24"]) {
      if (slot?.[field] !== THREE_BIRDS_TALENT_ID) continue;
      sources.push({
        id: "three-birds-talent",
        quantity: 2,
        sourcePath: `skillTree.slots[${slotIndex}].${field}`,
      });
    }
    const override = slot?.prismCoreTalentOverride;
    if (override === THREE_BIRDS_TALENT_ID
        || override?.nodeId === THREE_BIRDS_TALENT_ID
        || override?.id === THREE_BIRDS_TALENT_ID) {
      return {
        status: "not-calculated",
        blockers: [{
          code: "unresolved-prism-core-talent-state",
          message: "A prism override references Three Birds with One Stone; replacement/addition semantics need a dedicated compiler.",
          evidence: `skillTree.slots[${slotIndex}].prismCoreTalentOverride`,
        }],
      };
    }
  }

  const pactspirits = arrayValue(loadout?.pactspirits);
  const ironLionClaims = pactspirits.filter((pact) =>
    pact?.guid === IRON_LION_ID);
  if (ironLionClaims.length > 1) {
    return {
      status: "not-calculated",
      blockers: [{
        code: "duplicate-iron-lion-pactspirit",
        message: "Iron Lion appears in more than one pactspirit slot; every duplicate parent is rejected.",
        evidence: `${ironLionClaims.length} installed claims`,
      }],
    };
  }
  for (const [pactIndex, pact] of pactspirits.entries()) {
    if (pact?.guid !== IRON_LION_ID) continue;
    const nodes = arrayValue(pact?.allocatedNodes).map(String);
    const projectileNodeIndex = nodes.indexOf(IRON_LION_PROJECTILE_NODE_ID);
    if (projectileNodeIndex < 0) continue;
    const level = finiteInteger(pact?.level);
    if (level === null || level < 1 || level > 6) {
      return {
        status: "not-calculated",
        blockers: [{
          code: "invalid-iron-lion-level",
          message: "Iron Lion's exported level is outside the season-pinned 1-6 progression.",
          evidence: `pactspirits[${pactIndex}].level=${String(pact?.level)}`,
        }],
      };
    }
    for (const kismet of arrayValue(loadout?.kismets)) {
      if (Number(kismet?.pactspritIndex) !== pactIndex) continue;
      const nodeAddress = String(kismet?.nodeId);
      const address = /^slot_([0-2])_(?:([1-9]\d*)|virt_([0-2])_([1-9]\d*)_(\d+))$/
        .exec(nodeAddress);
      const addressPactIndex = address ? Number(address[1]) : null;
      const virtualPactIndex = address?.[3] ? Number(address[3]) : null;
      const baseNodeId = address?.[2] ?? address?.[4] ?? null;
      if (!address
          || addressPactIndex !== pactIndex
          || (virtualPactIndex !== null && virtualPactIndex !== pactIndex)
          || baseNodeId === IRON_LION_PROJECTILE_NODE_ID) {
        return {
          status: "not-calculated",
          blockers: [{
            code: "unresolved-iron-lion-kismet-slot",
            message: "An Iron Lion kismet uses an unrecognized slot address, so notable-node survival is not proven.",
            evidence: nodeAddress,
          }],
        };
      }
    }
    sources.push({
      id: "iron-lion",
      quantity: 2,
      sourcePath: `pactspirits[${pactIndex}].allocatedNodes[${projectileNodeIndex}] (node ID ${IRON_LION_PROJECTILE_NODE_ID})`,
    });
  }

  const slateInventory = new Map<string, any>();
  for (const slate of arrayValue(loadout?.divinity?.inventory)) {
    if (typeof slate?.id === "string") slateInventory.set(slate.id, slate);
  }
  const placedSlateIds = new Set<string>();
  for (const [placementIndex, placement] of arrayValue(loadout?.divinity?.placements).entries()) {
    const slateId = placement?.slateId;
    if (typeof slateId !== "string" || !slateInventory.has(slateId)) {
      return {
        status: "not-calculated",
        blockers: [{
          code: "unresolved-placed-divinity-slate",
          message: "A placed divinity slate could not be resolved from inventory.",
          evidence: `divinity.placements[${placementIndex}].slateId=${String(slateId)}`,
        }],
      };
    }
    if (placedSlateIds.has(slateId)) {
      return {
        status: "not-calculated",
        blockers: [{
          code: "duplicate-placed-divinity-slate",
          message: "One divinity inventory item is referenced by multiple placements.",
          evidence: slateId,
        }],
      };
    }
    placedSlateIds.add(slateId);
    const slate = slateInventory.get(slateId);
    for (const [affixIndex, affix] of arrayValue(slate?.affixes).entries()) {
      const text = String(affix?.description ?? "");
      const match = /(?:^|\n)Projectile Quantity\s*\+(\d+)(?:\n|$)/i.exec(text);
      if (!match) continue;
      const quantity = Number(match[1]);
      if (modifierId(affix) !== THREE_BIRDS_SLATE_MOD_ID || quantity !== 2) {
        return {
          status: "not-calculated",
          blockers: [{
            code: "unrecognized-divinity-projectile-quantity",
            message: "A placed slate has Projectile Quantity outside the pinned Three Birds rule.",
            evidence: `divinity.inventory[id=${slateId}].affixes[${affixIndex}]: ${text}`,
          }],
        };
      }
      sources.push({
        id: "placed-divinity-slate",
        quantity,
        sourcePath: `divinity.placements[${placementIndex}] -> inventory[id=${slateId}].affixes[${affixIndex}]`,
      });
    }
  }

  const divinityQuantitySources = sources.filter(
    (source) => source.id === "three-birds-talent"
      || source.id === "placed-divinity-slate",
  );
  if (divinityQuantitySources.length > 1) {
    return {
      status: "not-calculated",
      blockers: [{
        code: "unresolved-max-divinity-effect",
        message: "Multiple Three Birds sources are present, but its Max Divinity Effect of 1 prevents naïve addition.",
        evidence: divinityQuantitySources.map((source) => source.sourcePath).join("; "),
      }],
    };
  }

  const itemInventory = new Map<string, any>();
  for (const section of [loadout?.gear?.inventory, loadout?.vorax?.inventory]) {
    for (const item of arrayValue(section)) {
      if (typeof item?.id === "string") itemInventory.set(item.id, item);
    }
  }
  for (const projection of ["gear", "vorax"] as const) {
    for (const [slot, rawItemId] of Object.entries(loadout[projection].equipped)) {
      if (rawItemId == null) continue;
      if (typeof rawItemId !== "string" || !itemInventory.has(rawItemId)) {
        return {
          status: "not-calculated",
          blockers: [{
            code: "unresolved-equipped-item",
            message: "An equipped item could not be resolved while auditing Projectile Quantity.",
            evidence: `${projection}.equipped.${slot}=${String(rawItemId)}`,
          }],
        };
      }
      if (containsPositiveProjectileQuantity(itemInventory.get(rawItemId))) {
        return {
          status: "not-calculated",
          blockers: [{
            code: "uncompiled-equipped-projectile-quantity",
            message: "An equipped item contains an additional Projectile Quantity rule outside this guarded slice.",
            evidence: `${projection}.equipped.${slot}=${rawItemId}`,
          }],
        };
      }
    }
  }

  if (containsPositiveProjectileQuantity(loadout?.scentBottle)) {
    return {
      status: "not-calculated",
      blockers: [{
        code: "uncompiled-scent-projectile-quantity",
        message: "The scent-bottle state contains a Projectile Quantity rule outside this guarded slice.",
      }],
    };
  }

  return { status: "calculated", sources };
}

function compileEmissionTopology(
  loadout: any,
  formula: NonNullable<ReturnType<typeof ss13HammerOfAshFormula>>,
): BingIntrinsicTopologyResult {
  const projectionBlockers = validateTopologyProjections(loadout);
  if (projectionBlockers.length > 0) {
    return topologyUnavailable(...projectionBlockers);
  }
  const traits = loadout?.hero?.traits ?? {};
  if (traits.level1 == null) {
    return topologyUnavailable({
      code: "missing-recorded-blast-nova-trait",
      message: "Hero identity alone does not prove that Blast Nova is selected; the imported level-1 trait is null.",
    });
  }
  const expectedTraits = [
    ["level1", BLAST_NOVA_BASE_TRAIT_ID],
    ["level45", FIREPOWER_COVERAGE_TRAIT_ID],
    ["level60", BLAST_BARRAGE_TRAIT_ID],
    ["level75", FRENZY_HOUND_TRAIT_ID],
  ] as const;
  for (const [slot, expected] of expectedTraits) {
    if (traits[slot] === expected) continue;
    return topologyUnavailable({
      code: "missing-or-mismatched-recorded-bing-trait",
      message: `The source-complete emission slice requires Bing's recorded ${slot} trait.`,
      evidence: `Expected ${expected}; observed ${String(traits[slot] ?? "missing")}`,
    });
  }

  const traitLevels = resolveHeroTraitLevels(loadout);
  if (traitLevels.status === "not-calculated") {
    return topologyUnavailable(...traitLevels.blockers);
  }
  const quantity = resolveProjectileQuantitySources(loadout, formula);
  if (quantity.status === "not-calculated") {
    return topologyUnavailable(...quantity.blockers);
  }

  const intrinsicProjectilesPerBomb =
    formula.baseProjectileQuantity + formula.addedProjectileQuantity + 2;
  if (intrinsicProjectilesPerBomb !== 5) {
    return topologyUnavailable({
      code: "source-topology-mismatch",
      message: "The season-pinned Hammer and Blast Nova projectile terms no longer total 5.",
      evidence: `Observed intrinsic total: ${intrinsicProjectilesPerBomb}`,
    });
  }

  const blastNovaLevelIndex = traitLevels.levels.level1 - 1;
  const firepowerLevelIndex = traitLevels.levels.level45 - 1;
  const blastBarrageLevelIndex = traitLevels.levels.level60 - 1;
  const frenzyHoundLevelIndex = traitLevels.levels.level75 - 1;
  const blastBarrageChance = [20, 25, 30, 35, 40][blastBarrageLevelIndex];
  const bonusBombProbability = blastBarrageChance / 100;
  const baseBombProbability = 1 - bonusBombProbability;
  const projectilesPerBomb = quantity.sources.reduce(
    (sum, source) => sum + source.quantity,
    0,
  );
  const bombCountOutcomes: BombCountOutcome[] = [
    { bombs: 2, probability: normalizedProbability(baseBombProbability) },
    { bombs: 4, probability: normalizedProbability(bonusBombProbability) },
  ];
  const expectedBombsPerThrow = normalizedProbability(
    bombCountOutcomes.reduce(
      (sum, outcome) => sum + outcome.bombs * outcome.probability,
      0,
    ),
  );
  const emittedProjectilesPerThrowOutcomes = bombCountOutcomes.map(
    (outcome): ProjectileEmissionOutcome => ({
      ...outcome,
      projectiles: outcome.bombs * projectilesPerBomb,
    }),
  );
  const expectedEmittedProjectilesPerThrow = normalizedProbability(
    emittedProjectilesPerThrowOutcomes.reduce(
      (sum, outcome) => sum + outcome.projectiles * outcome.probability,
      0,
    ),
  );

  return {
    status: "calculated-partial",
    scope: "source-visible emitted projectiles per throw",
    isDps: false,
    isTargetHits: false,
    heroTraitLevels: traitLevels.levels,
    heroTraitLevelSources: traitLevels.sources,
    blastNovaAdditionalBombDamagePct: [0, 5, 10, 15, 20][blastNovaLevelIndex],
    firepowerMovingThrowSpeedAdditionalPct: [-40, -37, -34, -31, -27][firepowerLevelIndex],
    blastBarrageAdditionalBombChancePct: blastBarrageChance,
    frenzyHoundNearbyAdditionalDamagePct: [35, 40, 45, 50, 55][frenzyHoundLevelIndex],
    intrinsicBombsPerThrow: 2,
    intrinsicProjectilesPerBomb,
    projectileQuantitySources: quantity.sources,
    projectilesPerBomb,
    bombCountOutcomes,
    expectedBombsPerThrow,
    emittedProjectilesPerThrowOutcomes,
    expectedEmittedProjectilesPerThrow,
    baseBombThrowRatePerSecond: 1,
    maximumUndetonatedBombs: 10,
    baseDetonationDelaySeconds: 1,
    detonatesImmediatelyAfterLanding: true,
    demolisherChargeIntervalSeconds: formula.demolisherChargeIntervalSeconds,
    demolisherAdditionalHitDamagePct: formula.demolisherAdditionalHitDamagePct,
    physicalToFireConversionPct: formula.physicalToFireConversionPct,
    shotgunFalloffPct: formula.shotgunFalloffPct,
    pummelAndExplosionCanHitSameEnemy: true,
  };
}

/**
 * Extends the guarded weapon foundation through exact intrinsic SS13
 * conversion, Demolisher per-instance damage, and Blast Nova emissions.
 *
 * The output is deliberately not a full hit or DPS.  Anything that needs
 * target hit count, build-wide modifiers, actual cadence, or runtime state
 * remains a typed blocker.
 */
export function compileBingIntrinsicEnvelope(
  build: any,
  loadoutIndex = 0,
): BingIntrinsicEnvelopeResult {
  const foundation = compileBingWeaponFoundation(build, loadoutIndex);
  if (foundation.status !== "calculated-partial") {
    return unavailable(foundation.blockers);
  }
  const loadout = loadoutAt(build, loadoutIndex);
  if (!loadout) {
    return unavailable([{
      code: "missing-loadout",
      message: `No loadout exists at index ${loadoutIndex}.`,
    }]);
  }
  const formula = ss13HammerOfAshFormula(foundation.skillLevel);
  if (!formula) {
    return unavailable([{
      code: "unsupported-skill-level",
      message: `Hammer of Ash level ${foundation.skillLevel} is outside the SS13 table.`,
    }]);
  }

  const recordedLevelOneTrait = loadout?.hero?.traits?.level1;
  if (recordedLevelOneTrait != null
      && recordedLevelOneTrait !== BLAST_NOVA_BASE_TRAIT_ID) {
    return unavailable([{
      code: "mismatched-base-trait",
      message: "The imported level-1 trait conflicts with the SS13 Blast Nova hero record.",
      evidence: `Observed level-1 trait: ${String(recordedLevelOneTrait)}`,
    }]);
  }
  const recordedTraitIds = Object.values(loadout?.hero?.traits ?? {})
    .filter((value): value is string => typeof value === "string");
  const hasFirepowerCoverage = recordedTraitIds.includes(FIREPOWER_COVERAGE_TRAIT_ID);
  const topology = compileEmissionTopology(loadout, formula);

  const wad = formula.weaponAttackDamagePct / 100;
  const zero = range(0, 0);
  const normalPortions: Record<IntrinsicDamageType, WeaponDamageRange> = {
    physical: zero,
    cold: scale(foundation.weaponElemental.cold, wad),
    fire: add(
      scale(foundation.weaponPhysical, wad),
      scale(foundation.weaponElemental.fire, wad),
    ),
    lightning: scale(foundation.weaponElemental.lightning, wad),
    erosion: scale(foundation.weaponElemental.erosion, wad),
  };
  const normal = perHit(normalPortions, 1);
  const demolisherMultiplier = 1 + formula.demolisherAdditionalHitDamagePct / 100;
  const charged = perHit(normalPortions, demolisherMultiplier);

  const emissionBlockers: CalculationBlocker[] = [{
    code: "emissions-are-not-landed-hits",
    message: "The guarded topology reports bombs/projectiles emitted per throw, not bombs that land or projectiles that hit one target.",
  }];
  if (topology.status === "not-calculated") {
    emissionBlockers.push(...topology.blockers);
  }

  const throwRateBlockers: CalculationBlocker[] = [{
    code: "uncompiled-attack-speed",
    message: "Actual throwing speed needs the complete player Attack Speed pool and all additional speed modifiers.",
  }];
  if (hasFirepowerCoverage) {
    throwRateBlockers.push({
      code: "unresolved-firepower-coverage-state",
      message: "Firepower Coverage is selected, but movement state and automatic-throw timing are not deterministic in the dump.",
    });
  }

  const targetHitBlockers: CalculationBlocker[] = [
    {
      code: "unresolved-projectile-geometry",
      message: "A source-visible emitted-projectile count does not prove how many connect with one target.",
      evidence: "Projectile direction, target size, distance, projectile size/speed, and the 70% Shotgun falloff all affect target hits.",
    },
    {
      code: "unresolved-component-overlap",
      message: "Pummel/projectile/explosion instance counts and overlap under Blast Nova are not source-complete for a target.",
    },
  ];
  const totalHitBlockers: CalculationBlocker[] = [
    {
      code: "uncompiled-full-hit-envelope",
      message: "The guarded number includes only equipped-weapon damage and intrinsic WAD/conversion.",
      evidence: "Global flat damage, increases, additional multipliers, critical strikes, supports, traits, talents, memories, slates, pacts, buffs, and enemy state are excluded.",
    },
    ...(topology.status === "not-calculated" ? topology.blockers : []),
    ...targetHitBlockers,
  ];
  const demolisherShareBlockers: CalculationBlocker[] = [{
    code: "unresolved-demolisher-cadence",
    message: "The 3s intrinsic charge interval does not determine the empowered share after restoration speed, sentry charge engines, throwing rate, and initial state.",
  }];

  return {
    status: "calculated-partial",
    kind: "bing-intrinsic-envelope",
    isDps: false,
    isTotalHit: false,
    patch: "SS13",
    heroId: BING_BLAST_NOVA_ID,
    heroBaseTraitId: BLAST_NOVA_BASE_TRAIT_ID,
    skillId: HAMMER_OF_ASH_ID,
    skillLevel: foundation.skillLevel,
    loadoutIndex,
    loadoutName: String(loadout.name ?? `Loadout ${loadoutIndex + 1}`),
    confidence: foundation.confidence,
    recordedTraitIds,
    conversion: [{ from: "physical", to: "fire", percent: 100 }],
    components: [
      {
        id: "pummel",
        label: "Pummel",
        weaponAttackDamagePct: formula.weaponAttackDamagePct,
        condition: null,
      },
      {
        id: "ember-projectile",
        label: "Ember Projectile",
        weaponAttackDamagePct: formula.weaponAttackDamagePct,
        condition: null,
      },
      {
        id: "explosion",
        label: "Explosion",
        weaponAttackDamagePct: formula.weaponAttackDamagePct,
        condition: "Hammer of Ash consumes Demolisher Charge",
      },
    ],
    normalWeaponSourcedPerHit: normal,
    demolisherChargedWeaponSourcedPerHit: charged,
    topology,
    actualBombsPerThrow: unknown(...emissionBlockers),
    actualProjectilesPerBomb: unknown(...emissionBlockers),
    actualThrowRate: unknown(...throwRateBlockers),
    actualDemolisherEmpoweredShare: unknown(...demolisherShareBlockers),
    effectiveTargetHits: unknown(...targetHitBlockers),
    actualTotalHit: unknown(...totalHitBlockers),
    actualDps: {
      status: "not-calculated",
      isDps: false,
      blockers: [
        ...totalHitBlockers,
        ...emissionBlockers,
        ...throwRateBlockers,
        ...demolisherShareBlockers,
        {
          code: "unresolved-enemy-state",
          message: "DPS additionally needs target resistance/armor, penetration, curses, ailments, and conditional uptime.",
        },
      ],
    },
    provenance: uniqueProvenance([
      ...foundation.provenance,
      SS13_HAMMER_FORMULA_SOURCE,
      SS13_HAMMER_TEXT_SOURCE,
      SS13_BING_HERO_MASTER_SOURCE,
      SS13_BING_HERO_TEXT_SOURCE,
      SS13_HERO_MEMORY_MASTER_SOURCE,
      SS13_HERO_MEMORY_TEXT_SOURCE,
      TLI_COMPENDIUM_MEMORY_LEVEL_RUNTIME_SOURCE,
      TLI_COMPENDIUM_EFFECTIVE_TRAIT_LEVEL_RUNTIME_SOURCE,
      TLI_COMPENDIUM_TRAIT_SLOT_RUNTIME_SOURCE,
      SS13_PACTSPIRIT_MASTER_SOURCE,
      SS13_PACTSPIRIT_TEXT_SOURCE,
      SS13_KISMET_MASTER_SOURCE,
      POORCHLIGHT_KISMET_SLOT_SOURCE,
      SS13_TALENT_TEXT_SOURCE,
      POORCHLIGHT_SS13_IDENTITY_SOURCE,
      GUARDED_INTRINSIC_RULE_SOURCE,
    ]),
    excludedFromMetric: [
      "all non-weapon flat added damage",
      "global increased-damage pools",
      "all support, trait, talent, memory, slate, pactspirit, kismet, curse, aura, and conditional multipliers",
      "critical strikes, double damage, mitigation, and penetration",
      "landed bomb/projectile count, throwing cadence, and Demolisher empowered share",
      "target hit count, projectile geometry, component overlap, and Shotgun application",
      "Deterioration and all damage over time",
    ],
  };
}
