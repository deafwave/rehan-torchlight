/*
 * Guarded player-survival evidence for Compendium/tli_dump SS13 loadouts.
 *
 * A planner export is not a character sheet: it does not contain a
 * source-complete character Life/ES total, resistance caps, enemy hit
 * scenario, or deterministic uptime for conditional defences.  This module
 * therefore extracts and compares exact source inputs without manufacturing a
 * total EHP value.
 *
 * The optional catalog is the compact poorchlight
 * `compendium-catalog-ss13.json`.  Gear and placed divinity slates already
 * carry rendered descriptions in the imported document.  The catalog is
 * required to give hero-memory, ethereal-prism, and kismet UUIDs their SS13
 * semantics.
 */

import {
  IRIS_VIGILANT_BREEZE_ID,
  SUMMON_EROSION_MAGUS_ID,
  SUMMON_ROCK_MAGUS_ID,
  type CalculationBlocker,
  type FormulaProvenance,
} from "./guardedCompiler.js";

export const AUDITED_SS13_COMPACT_CATALOG_SHA256 =
  "c7b5392533305d5b4ed91e1c8efe01a5b5ea0e7d64d7636b9cfb8d55ae24b796";
export const AUDITED_SS13_DEFENSE_SUBSET_SHA256 =
  "c3590e05ca73602f207f3ebb6c8273796ba0987021ac589b5475fe973fe19848";

const AUDITED_SS13_COMPACT_CATALOG_CANONICAL_SHA256 =
  "5067a331721f17ffdf04f9acfa8beee609c407fe93a525d828e2704894b456e5";
const AUDITED_SS13_DEFENSE_SUBSET_CANONICAL_SHA256 =
  "106ddeba89c20b253192d4cb896028b88cec955fe872c77fb518adc0c82ae240";

export const NURTURING_BREEZE_TRAIT_ID =
  "8ed19a33-d86f-542b-8d54-c601aace483f";
export const PROTECTION_FIELD_SUPPORT_ID =
  "38b31949-b85f-5262-b765-40a0c9b7416c";
export const PRECISE_PROTECTION_FIELD_SUPPORT_ID =
  "1ec6ca61-c0b9-5772-aa9c-27128ab7df61";

export const SS13_IRIS_TRAIT_TEXT_SOURCE: FormulaProvenance = {
  source: "https://tlicompendium.com/data-bundles/SS13-hero-trait-en.json",
  locator: `hero-trait/i18n/en.heroes[${IRIS_VIGILANT_BREEZE_ID}].traits[${NURTURING_BREEZE_TRAIT_ID}].description`,
  sha256: "f8f2f155dbdc4e62056bb2f81b1e7359c21badb7d772b39f76842e3cd0b455ff",
  confidence: "source-data",
};

export const SS13_PROTECTION_FIELD_FORMULA_SOURCE: FormulaProvenance = {
  source: "https://tlicompendium.com/data-bundles/SS13-skill-master.json",
  locator: `skill/Support/master.skills[id in {${PROTECTION_FIELD_SUPPORT_ID},${PRECISE_PROTECTION_FIELD_SUPPORT_ID}}].levelProgression`,
  sha256: "91a676a558e6a7b811edc9256caec53c539398f93aac3b9a1f55c5c998d7ae91",
  confidence: "source-data",
};

export const SS13_PROTECTION_FIELD_TEXT_SOURCE: FormulaProvenance = {
  source: "https://tlicompendium.com/data-bundles/SS13-skill-en.json",
  locator: `skill/Support/i18n/en.skills[id in {${PROTECTION_FIELD_SUPPORT_ID},${PRECISE_PROTECTION_FIELD_SUPPORT_ID}}].templateDescription`,
  sha256: "10b5cf27e8f50acca7ff2ec5a7534d5eb5e8e1eee83493f86851967fc0cd7cb1",
  confidence: "source-data",
};

export type DefenseSourceKind =
  | "gear"
  | "vorax"
  | "hero-trait"
  | "hero-memory"
  | "divinity-slate"
  | "ethereal-prism"
  | "kismet"
  | "skill-support";

export type PlayerDefenseStat =
  | "max-life"
  | "max-energy-shield"
  | "armor"
  | "evasion"
  | "fire-resistance"
  | "cold-resistance"
  | "lightning-resistance"
  | "erosion-resistance"
  | "elemental-resistance"
  | "all-resistance"
  | "attack-block-chance"
  | "spell-block-chance"
  | "block-ratio"
  | "injury-buffer"
  | "armor-effective-rate-non-physical"
  | "critical-strike-damage-mitigation"
  | "additional-damage-taken"
  | "nearby-enemy-additional-damage"
  | "damage-transfer-to-minion"
  | "physical-damage-taken-conversion"
  | "life-regain"
  | "energy-shield-regain"
  | "life-regeneration-speed"
  | "energy-shield-charge-speed"
  | "energy-shield-charge-interval"
  | "minion-regain-share-to-player"
  | "tenacity-blessing-generation"
  | "barrier-shield"
  | "barrier-gain-chance"
  | "elemental-ailment-avoidance"
  | "energy-shield-from-max-life"
  | "energy-shield-fixed-zero"
  | "life-loss-per-second"
  | "energy-shield-loss-per-second"
  | "unclassified-defense";

export type PlayerDefenseOperation =
  | "add-flat"
  | "add-percentage-points"
  | "increase-percent"
  | "chance-percent"
  | "ratio-percent"
  | "additional-percent"
  | "transfer-percent"
  | "conversion-percent"
  | "recovery-percent"
  | "recovery-speed-percent"
  | "interval-percent"
  | "derive-percent"
  | "loss-flat-per-second"
  | "fixed-state"
  | "source-only";

export type PlayerDefenseScope =
  | "player-global"
  | "local-gear"
  | "player-conditional"
  | "area-talent";

export type DefenseBenefit =
  | "beneficial"
  | "harmful"
  | "context-dependent"
  | "unclassified";

export interface PlayerDefenseSource {
  kind: DefenseSourceKind;
  locator: string;
  entityId: string | null;
  modifierId: string | null;
  label: string | null;
}

export interface PlayerDefenseTerm {
  id: string;
  actor: "player";
  stat: PlayerDefenseStat;
  operation: PlayerDefenseOperation;
  value: number | null;
  /** Exact source candidates when the snapshot omits the selector. */
  candidateValues?: number[];
  unit: "flat" | "percent" | "boolean" | "text";
  scope: PlayerDefenseScope;
  condition: string | null;
  benefit: DefenseBenefit;
  text: string;
  source: PlayerDefenseSource;
  provenance: FormulaProvenance[];
  includedInSourceSum: boolean;
  isTotalEhp: false;
}

export interface DefenseSourceSum {
  key: string;
  stat: PlayerDefenseStat;
  operation: PlayerDefenseOperation;
  scope: "player-global" | "local-gear";
  sourceEntityId: string | null;
  sourceLabel: string | null;
  unit: "flat" | "percent";
  value: number;
  termIds: string[];
  isCharacterTotal: false;
}

export interface DefenseUnresolvedEvidence {
  code:
    | "missing-equipped-record"
    | "missing-catalog-entry"
    | "missing-catalog-effect"
    | "missing-roll"
    | "unrendered-defensive-modifier"
    | "unparsed-defensive-line"
    | "missing-runtime-selector"
    | "duplicate-equipped-reference"
    | "invalid-installed-reference"
    | "source-effects-not-materialized"
    | "missing-source-projection";
  source: string;
  message: string;
  evidence?: string;
}

export interface DefenseSourceCoverage {
  lines: number;
  defensiveLines: number;
  terms: number;
  unresolved: number;
}

export interface PlayerDefenseCoverage {
  method: "known-defensive-vocabulary";
  equippedGearItems: number;
  placedDivinitySlates: number;
  equippedHeroMemories: number;
  installedPactspirits: number;
  allocatedPactNodes: number;
  allocatedTalentNodes: number;
  selectedHeroTraits: number;
  catalog: {
    status: "matched-ss13" | "missing" | "unsupported";
    requiredReferences: number;
    resolvedReferences: number;
    missingReferences: number;
    missingEffectDefinitions: number;
  };
  sourceLines: number;
  defensiveLines: number;
  playerScopedTerms: number;
  unconditionalSourceSumTerms: number;
  minionOnlyLinesExcluded: number;
  offensiveLinesExcluded: number;
  unparsedDefensiveLines: number;
  bySource: Record<DefenseSourceKind, DefenseSourceCoverage>;
  unresolved: DefenseUnresolvedEvidence[];
}

export interface PlayerDefenseEvidence {
  status: "source-terms";
  patch: "SS13";
  actor: "player";
  heroId: string;
  loadoutIndex: number;
  loadoutName: string;
  isTotalEhp: false;
  terms: PlayerDefenseTerm[];
  sourceSums: DefenseSourceSum[];
  coverage: PlayerDefenseCoverage;
  playerEhp: {
    status: "not-calculated";
    blockers: CalculationBlocker[];
  };
  provenance: FormulaProvenance[];
  warning: string;
}

export interface UnavailablePlayerDefenseEvidence {
  status: "not-calculated";
  actor: "player";
  isTotalEhp: false;
  blockers: CalculationBlocker[];
}

export type PlayerDefenseEvidenceResult =
  | PlayerDefenseEvidence
  | UnavailablePlayerDefenseEvidence;

export interface DefenseSourceSumChange {
  key: string;
  stat: PlayerDefenseStat;
  operation: PlayerDefenseOperation;
  scope: "player-global" | "local-gear";
  sourceEntityId: string | null;
  sourceLabel: string | null;
  unit: "flat" | "percent";
  before: number;
  after: number;
  delta: number;
  numericDirection: "increase" | "decrease";
  isEhpDelta: false;
}

export interface PlayerDefenseEvidenceComparison {
  status: "source-terms";
  actor: "player";
  isTotalEhp: false;
  beforeIndex: number;
  afterIndex: number;
  sourceSumChanges: DefenseSourceSumChange[];
  removedTerms: PlayerDefenseTerm[];
  addedTerms: PlayerDefenseTerm[];
  provenance: FormulaProvenance[];
  warning: string;
}

export interface UnavailablePlayerDefenseComparison {
  status: "not-calculated";
  actor: "player";
  isTotalEhp: false;
  blockers: CalculationBlocker[];
}

export type PlayerDefenseEvidenceComparisonResult =
  | PlayerDefenseEvidenceComparison
  | UnavailablePlayerDefenseComparison;

export interface Ss13CompendiumCatalogEntry {
  domain?: unknown;
  kind?: unknown;
  id?: unknown;
  label?: unknown;
  metadata?: unknown;
}

export interface Ss13CompendiumCatalog {
  schemaVersion?: unknown;
  patch?: unknown;
  source?: unknown;
  entries?: unknown;
}

export interface PlayerDefenseCompileOptions {
  catalog?: Ss13CompendiumCatalog | null;
  /**
   * The caller may pass the hash of the exact serialized catalog it loaded.
   * We never attach the audited hash to an arbitrary same-patch object.
   */
  catalogSha256?: string;
}

interface SourceLine {
  text: string;
  source: PlayerDefenseSource;
  provenance: FormulaProvenance[];
  forcedScope?: "area-talent";
}

interface CatalogState {
  status: PlayerDefenseCoverage["catalog"]["status"];
  index: Map<string, Ss13CompendiumCatalogEntry>;
  sourceName: string;
  sha256?: string;
}

interface TrustedCatalogSnapshot {
  declaredSha256: string;
  index: Map<string, Ss13CompendiumCatalogEntry>;
  sourceName: string;
}

interface MutableCoverage {
  equippedGearItems: number;
  placedDivinitySlates: number;
  equippedHeroMemories: number;
  installedPactspirits: number;
  allocatedPactNodes: number;
  allocatedTalentNodes: number;
  selectedHeroTraits: number;
  catalog: PlayerDefenseCoverage["catalog"];
  sourceLines: number;
  defensiveLines: number;
  playerScopedTerms: number;
  unconditionalSourceSumTerms: number;
  minionOnlyLinesExcluded: number;
  offensiveLinesExcluded: number;
  unparsedDefensiveLines: number;
  bySource: Record<DefenseSourceKind, DefenseSourceCoverage>;
  unresolved: DefenseUnresolvedEvidence[];
}

const SOURCE_KINDS: DefenseSourceKind[] = [
  "gear",
  "vorax",
  "hero-trait",
  "hero-memory",
  "divinity-slate",
  "ethereal-prism",
  "kismet",
  "skill-support",
];

const DEFENSIVE_VOCABULARY =
  /\b(?:max(?:imum)? life|energy shield|resistance|armor|evasion|barrier|block|dodge|avoid|damage taken|damage dealt by nearby enemies|injury buffer|life regain|regenerat(?:e|ion)|restor(?:e|ation)|damage mitigation|deflection|fortitude|ward)\b/i;
const MINION_CONTEXT = /\b(?:minions?|spirit mag(?:us|i)|synthetic troop)\b/i;
const PLAYER_FROM_MINION_CONTEXT =
  /\bdamage taken is transferred to\b[^.\n]*\bminion\b|\bis also applied to you\b/i;
const OFFENSIVE_CONTEXT =
  /\bresistance penetration\b|\barmor dmg mitigation penetration\b|\bdemolisher charge restoration\b|\bdamage taken by enemies\b|\badditional damage taken by enemies\b|\benem(?:y|ies)\b[^.\n]*\bresistance\b|\bresistance\b[^.\n]*\benem(?:y|ies)\b/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PACTSPIRIT_BASE_NODE_TYPES = new Map<string, "Micro" | "Medium">([
  ["1", "Micro"],
  ["2", "Micro"],
  ["3", "Medium"],
  ["4", "Micro"],
  ["5", "Micro"],
  ["6", "Medium"],
  ["7", "Micro"],
  ["8", "Micro"],
  ["9", "Medium"],
]);

const SIMPLE_MEMORY_STAT =
  /^(?:Max Life|Max Energy Shield|Armor|Evasion|Fire Resistance|Cold Resistance|Lightning Resistance|Erosion Resistance|Elemental Resistance|Attack Block Chance|Spell Block Chance|Block Ratio|Barrier Shield|Life Regain|Energy Shield Regain)$/i;

const SOURCE_SUM_OPERATIONS = new Set<PlayerDefenseOperation>([
  "add-flat",
  "add-percentage-points",
  "increase-percent",
  "chance-percent",
  "ratio-percent",
]);

const SOURCE_SUM_STATS = new Set<PlayerDefenseStat>([
  "max-life",
  "max-energy-shield",
  "armor",
  "evasion",
  "fire-resistance",
  "cold-resistance",
  "lightning-resistance",
  "erosion-resistance",
  "elemental-resistance",
  "all-resistance",
  "attack-block-chance",
  "spell-block-chance",
  "block-ratio",
]);

function objectValue(value: unknown): Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function arrayValue(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function signedNumber(value: string): number {
  return Number(value.replace(/\s+/g, ""));
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n|<br\s*\/?>/i)
    .map((part) => part.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function uniqueProvenance(sources: FormulaProvenance[]): FormulaProvenance[] {
  const unique = new Map<string, FormulaProvenance>();
  for (const source of sources) {
    const key = `${source.source}\u0000${source.locator}\u0000${source.sha256 ?? ""}`;
    unique.set(key, source);
  }
  return [...unique.values()];
}

const SHA256_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const TRUSTED_CATALOG_CANONICAL_SHA256 = new Map<string, string>([
  [
    AUDITED_SS13_COMPACT_CATALOG_SHA256,
    AUDITED_SS13_COMPACT_CATALOG_CANONICAL_SHA256,
  ],
  [
    AUDITED_SS13_DEFENSE_SUBSET_SHA256,
    AUDITED_SS13_DEFENSE_SUBSET_CANONICAL_SHA256,
  ],
]);

const trustedCatalogSnapshotCache =
  new WeakMap<object, TrustedCatalogSnapshot>();

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .filter((key) => object[key] !== undefined)
        .map((key) => [key, canonicalJsonValue(object[key])]),
    );
  }
  return value;
}

function rotateRight(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

/**
 * Small synchronous SHA-256 implementation used only to verify the bundled
 * catalog object.  The compiler API is synchronous and is shared by Node and
 * the browser, so WebCrypto cannot be used here.
 */
function sha256Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const schedule = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      schedule[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const left = schedule[index - 15];
      const right = schedule[index - 2];
      const sigma0 =
        rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3);
      const sigma1 =
        rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10);
      schedule[index] = (
        schedule[index - 16]
        + sigma0
        + schedule[index - 7]
        + sigma1
      ) >>> 0;
    }

    let a = hash[0];
    let b = hash[1];
    let c = hash[2];
    let d = hash[3];
    let e = hash[4];
    let f = hash[5];
    let g = hash[6];
    let h = hash[7];

    for (let index = 0; index < 64; index += 1) {
      const sum1 =
        rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (
        h + sum1 + choice + SHA256_CONSTANTS[index] + schedule[index]
      ) >>> 0;
      const sum0 =
        rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  return [...hash]
    .map((value) => value.toString(16).padStart(8, "0"))
    .join("");
}

function canonicalCatalogSha256(catalog: object): string {
  return sha256Utf8(JSON.stringify(canonicalJsonValue(catalog)));
}

function initialCoverage(catalogStatus: PlayerDefenseCoverage["catalog"]["status"]): MutableCoverage {
  const bySource = Object.fromEntries(
    SOURCE_KINDS.map((kind) => [
      kind,
      { lines: 0, defensiveLines: 0, terms: 0, unresolved: 0 },
    ]),
  ) as Record<DefenseSourceKind, DefenseSourceCoverage>;
  return {
    equippedGearItems: 0,
    placedDivinitySlates: 0,
    equippedHeroMemories: 0,
    installedPactspirits: 0,
    allocatedPactNodes: 0,
    allocatedTalentNodes: 0,
    selectedHeroTraits: 0,
    catalog: {
      status: catalogStatus,
      requiredReferences: 0,
      resolvedReferences: 0,
      missingReferences: 0,
      missingEffectDefinitions: 0,
    },
    sourceLines: 0,
    defensiveLines: 0,
    playerScopedTerms: 0,
    unconditionalSourceSumTerms: 0,
    minionOnlyLinesExcluded: 0,
    offensiveLinesExcluded: 0,
    unparsedDefensiveLines: 0,
    bySource,
    unresolved: [],
  };
}

function recordMissingSourceProjections(
  loadout: any,
  coverage: MutableCoverage,
  loadoutPath: string,
): void {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const missing = (
    kind: DefenseSourceKind,
    path: string,
    message: string,
  ): void => {
    recordUnresolved(coverage, kind, {
      code: "missing-source-projection",
      source: `${loadoutPath}.${path}`,
      message,
      evidence: "Explicit empty arrays/records are accepted where the Compendium schema permits them; absent or malformed source containers are not treated as zero.",
    });
  };

  if (!isRecord(loadout?.gear)
      || !Array.isArray(loadout.gear.inventory)
      || !isRecord(loadout.gear.equipped)) {
    missing("gear", "gear", "The gear inventory/equipped projection is absent or malformed.");
  }
  if (!isRecord(loadout?.vorax)
      || !Array.isArray(loadout.vorax.inventory)
      || !isRecord(loadout.vorax.equipped)) {
    missing("vorax", "vorax", "The Vorax inventory/equipped projection is absent or malformed.");
  }
  if (!isRecord(loadout?.heroMemories)
      || !Array.isArray(loadout.heroMemories.inventory)
      || !isRecord(loadout.heroMemories.equipped)) {
    missing(
      "hero-memory",
      "heroMemories",
      "The hero-memory inventory/equipped projection is absent or malformed.",
    );
  }
  if (!isRecord(loadout?.divinity)
      || !Array.isArray(loadout.divinity.inventory)
      || !Array.isArray(loadout.divinity.placements)) {
    missing(
      "divinity-slate",
      "divinity",
      "The divinity inventory/placements projection is absent or malformed.",
    );
  }
  if (!isRecord(loadout?.etherealPrisms)
      || !Array.isArray(loadout.etherealPrisms.inventory)) {
    missing(
      "ethereal-prism",
      "etherealPrisms",
      "The ethereal-prism inventory projection is absent or malformed.",
    );
  }
  if (!isRecord(loadout?.skillTree)
      || !Array.isArray(loadout.skillTree.slots)) {
    missing(
      "ethereal-prism",
      "skillTree.slots",
      "The talent-slot projection needed to prove installed prisms is absent or malformed.",
    );
  }
  if (!Array.isArray(loadout?.kismets)) {
    missing("kismet", "kismets", "The installed-kismet projection is absent or malformed.");
  }
  if (!Array.isArray(loadout?.pactspirits)) {
    missing(
      "kismet",
      "pactspirits",
      "The pactspirit projection needed to prove kismet socket ownership is absent or malformed.",
    );
  }
  if (!isRecord(loadout?.skills)
      || !Array.isArray(loadout.skills.activeSkills)
      || loadout.skills.activeSkills.length !== 5
      || !Array.isArray(loadout.skills.passiveSkills)
      || loadout.skills.passiveSkills.length !== 4) {
    missing(
      "skill-support",
      "skills",
      "The final Compendium five-active/four-passive main-skill projection is absent or malformed.",
    );
  }
  if (!isRecord(loadout?.hero)
      || !isRecord(loadout.hero.traits)) {
    missing(
      "hero-trait",
      "hero.traits",
      "The selected hero-trait projection is absent or malformed.",
    );
  }
}

function catalogState(options: PlayerDefenseCompileOptions): CatalogState {
  const catalog = objectValue(options.catalog);
  const declaredSha256 = stringValue(options.catalogSha256);
  const cached = options.catalog && typeof options.catalog === "object"
    ? trustedCatalogSnapshotCache.get(options.catalog)
    : undefined;
  if (cached && declaredSha256 === cached.declaredSha256) {
    return {
      status: "matched-ss13",
      index: cached.index,
      sourceName: cached.sourceName,
      sha256: cached.declaredSha256,
    };
  }
  const entries = arrayValue(catalog.entries);
  const schemaSupported = catalog.patch === "SS13"
    && (catalog.schemaVersion === 2 || catalog.schemaVersion === "2")
    && entries.length > 0;
  const expectedCanonicalSha256 = declaredSha256
    ? TRUSTED_CATALOG_CANONICAL_SHA256.get(declaredSha256)
    : undefined;
  const trusted = Boolean(
    schemaSupported
    && expectedCanonicalSha256
    && canonicalCatalogSha256(catalog) === expectedCanonicalSha256,
  );
  const status: CatalogState["status"] = !options.catalog
    ? "missing"
    : trusted
      ? "matched-ss13"
      : "unsupported";
  const sourceName = stringValue(catalog.source)
    ?? "poorchlight/tli_dump/data/compendium-catalog-ss13.json";
  const catalogSnapshot = trusted
    ? JSON.parse(JSON.stringify(catalog)) as Record<string, unknown>
    : {};
  const index = trusted
    ? new Map(
        arrayValue(catalogSnapshot.entries)
          .filter((entry) => stringValue(objectValue(entry).id))
          .map((entry) => [String(objectValue(entry).id), entry as Ss13CompendiumCatalogEntry]),
      )
    : new Map<string, Ss13CompendiumCatalogEntry>();
  if (trusted && declaredSha256 && options.catalog && typeof options.catalog === "object") {
    trustedCatalogSnapshotCache.set(options.catalog, {
      declaredSha256,
      index,
      sourceName,
    });
  }
  return {
    status,
    index,
    sourceName,
    sha256: trusted ? declaredSha256 ?? undefined : undefined,
  };
}

function importedProvenance(locator: string): FormulaProvenance {
  return {
    source: "imported Compendium/tli_dump loadout",
    locator,
    confidence: "source-data",
  };
}

function catalogProvenance(
  catalog: CatalogState,
  id: string,
  locator: string,
): FormulaProvenance {
  return {
    source: catalog.sourceName,
    locator: `entries[id=${id}].${locator}`,
    sha256: catalog.sha256,
    confidence: "source-data",
  };
}

function recordUnresolved(
  coverage: MutableCoverage,
  kind: DefenseSourceKind,
  evidence: DefenseUnresolvedEvidence,
): void {
  coverage.unresolved.push(evidence);
  coverage.bySource[kind].unresolved += 1;
}

function requireCatalogEntry(
  coverage: MutableCoverage,
  catalog: CatalogState,
  kind: DefenseSourceKind,
  id: string,
  locator: string,
): Ss13CompendiumCatalogEntry | null {
  coverage.catalog.requiredReferences += 1;
  const entry = catalog.index.get(id);
  if (entry && stringValue(entry.domain) === kind) {
    coverage.catalog.resolvedReferences += 1;
    return entry;
  }
  coverage.catalog.missingReferences += 1;
  recordUnresolved(coverage, kind, {
    code: "missing-catalog-entry",
    source: locator,
    message: catalog.status === "missing"
      ? `Catalog resolution is required for ${id}, but no SS13 catalog was supplied.`
      : catalog.status === "unsupported"
        ? `Catalog resolution is required for ${id}, but the supplied catalog is not a verified SS13 schema-v2 artifact.`
        : `The compact SS13 catalog has no entry for ${id}.`,
  });
  return null;
}

function pushSourceLine(
  lines: SourceLine[],
  text: unknown,
  source: PlayerDefenseSource,
  provenance: FormulaProvenance[],
  forcedScope?: SourceLine["forcedScope"],
): void {
  if (typeof text !== "string") return;
  for (const part of splitLines(text)) {
    lines.push({ text: part, source, provenance, forcedScope });
  }
}

function fillHashes(template: unknown, rawValues: unknown): string | null {
  if (typeof template !== "string") return null;
  if (!template.includes("#")) return template;
  const values = arrayValue(rawValues)
    .map((entry) => finiteNumber(objectValue(entry).value ?? entry))
    .filter((value): value is number => value !== null);
  let index = 0;
  const rendered = template.replace(/#/g, () => {
    const value = values[index];
    index += 1;
    return value === undefined ? "__MISSING_ROLL__" : String(value);
  });
  return rendered.includes("__MISSING_ROLL__") ? null : rendered;
}

function gearLines(
  loadout: any,
  coverage: MutableCoverage,
  loadoutPath: string,
): SourceLine[] {
  const lines: SourceLine[] = [];
  const gearInventory = arrayValue(loadout?.gear?.inventory);
  const voraxInventory = arrayValue(loadout?.vorax?.inventory);
  const items = new Map<string, { item: any; kind: "gear" | "vorax" }>();
  const inventoryIdCounts = new Map<string, number>();
  for (const item of gearInventory) {
    const id = stringValue(item?.id);
    if (id) {
      items.set(id, { item, kind: "gear" });
      inventoryIdCounts.set(id, (inventoryIdCounts.get(id) ?? 0) + 1);
    }
  }
  for (const item of voraxInventory) {
    const id = stringValue(item?.id);
    if (id) {
      items.set(id, { item, kind: "vorax" });
      inventoryIdCounts.set(id, (inventoryIdCounts.get(id) ?? 0) + 1);
    }
  }

  const equipped = [
    ...Object.entries(loadout?.gear?.equipped ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && !!entry[1])
      .map(([slot, itemId]) => ({
        slot,
        itemId,
        equippedLocator: `${loadoutPath}.gear.equipped.${slot}`,
      })),
    ...Object.entries(loadout?.vorax?.equipped ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && !!entry[1])
      .map(([slot, itemId]) => ({
        slot: `vorax:${slot}`,
        itemId,
        equippedLocator: `${loadoutPath}.vorax.equipped.${slot}`,
      })),
  ];
  const equippedIdCounts = new Map<string, number>();
  for (const { itemId } of equipped) {
    equippedIdCounts.set(itemId, (equippedIdCounts.get(itemId) ?? 0) + 1);
  }
  for (const { slot, itemId, equippedLocator } of equipped) {
    const record = items.get(itemId);
    if ((equippedIdCounts.get(itemId) ?? 0) !== 1) {
      recordUnresolved(coverage, record?.kind ?? (slot.startsWith("vorax:") ? "vorax" : "gear"), {
        code: "duplicate-equipped-reference",
        source: equippedLocator,
        message: `Equipped item ${itemId} is referenced by more than one slot; every duplicate reference is rejected.`,
      });
      continue;
    }
    if ((inventoryIdCounts.get(itemId) ?? 0) > 1) {
      recordUnresolved(coverage, record?.kind ?? (slot.startsWith("vorax:") ? "vorax" : "gear"), {
        code: "duplicate-equipped-reference",
        source: equippedLocator,
        message: `Equipped item ${itemId} does not resolve to exactly one inventory record.`,
      });
      continue;
    }
    if (!record) {
      recordUnresolved(coverage, "gear", {
        code: "missing-equipped-record",
        source: equippedLocator,
        message: `Equipped item ${itemId} is absent from gear and Vorax inventory.`,
      });
      continue;
    }
    coverage.equippedGearItems += 1;
    const { item, kind } = record;
    const label = stringValue(item.displayName)
      ?? stringValue(item.legendary?.name)
      ?? stringValue(item.voraxLegendary?.name)
      ?? stringValue(item.baseItem?.name)
      ?? itemId;
    const baseLocator = kind === "vorax"
      ? `${loadoutPath}.vorax.inventory[id=${itemId}]`
      : `${loadoutPath}.gear.inventory[id=${itemId}]`;
    const add = (
      text: unknown,
      locator: string,
      modifierId: unknown = null,
    ): void => {
      pushSourceLine(
        lines,
        text,
        {
          kind,
          locator,
          entityId: itemId,
          modifierId: stringValue(modifierId),
          label: `${slot} · ${label}`,
        },
        [
          importedProvenance(equippedLocator),
          importedProvenance(locator),
        ],
      );
    };

    for (const [index, implicit] of arrayValue(item?.baseItem?.implicits).entries()) {
      const locator = `${baseLocator}.baseItem.implicits[${index}]`;
      add(implicit?.description ?? implicit?.rawText, locator, implicit?.modifierId);
    }
    for (const [index, modifier] of arrayValue(item?.legendaryMods).entries()) {
      const locator = `${baseLocator}.legendaryMods[${index}]`;
      add(
        modifier?.description ?? modifier?.rawText,
        locator,
        modifier?.modifierId ?? modifier?.id,
      );
    }
    for (const collection of ["prefixes", "suffixes", "affixes"] as const) {
      for (const [index, modifier] of arrayValue(item?.[collection]).entries()) {
        if (!modifier) continue;
        const locator = `${baseLocator}.${collection}[${index}]`;
        const template = modifier.modifierDescription
          ?? modifier.descriptionTemplate
          ?? modifier.description;
        const rendered = fillHashes(
          template,
          modifier.rolledValues ?? modifier.values,
        );
        if (rendered === null) {
          if (typeof template === "string" && DEFENSIVE_VOCABULARY.test(template)) {
            recordUnresolved(coverage, kind, {
              code: "unrendered-defensive-modifier",
              source: locator,
              message: "A defensive gear modifier template is missing one or more exact rolls.",
              evidence: template,
            });
          }
          continue;
        }
        add(rendered, locator, modifier.modifierId ?? modifier.tierId ?? modifier.affixId);
      }
    }
    for (const field of [
      "baseAffix",
      "baseAffix2",
      "sweetDreamAffix",
      "corrosionImplicit",
      "towerSequence",
    ] as const) {
      const modifier = item?.[field];
      if (!modifier) continue;
      const locator = `${baseLocator}.${field}`;
      const template = modifier.description
        ?? modifier.modifierDescription
        ?? modifier.descriptionTemplate
        ?? modifier.rawText;
      const rendered = fillHashes(template, modifier.rolledValues ?? modifier.values);
      if (rendered === null) {
        if (typeof template === "string" && DEFENSIVE_VOCABULARY.test(template)) {
          recordUnresolved(coverage, kind, {
            code: "unrendered-defensive-modifier",
            source: locator,
            message: "A defensive gear modifier template is missing one or more exact rolls.",
            evidence: template,
          });
        }
        continue;
      }
      add(rendered, locator, modifier.modifierId ?? modifier.modGuid ?? modifier.id);
    }
  }
  return lines;
}

function memoryLineText(record: any, entry: Ss13CompendiumCatalogEntry): string | null {
  const metadata = objectValue(entry.metadata);
  const description = stringValue(metadata.memoryDescription) ?? stringValue(entry.label);
  const template = stringValue(metadata.memoryTemplate)
    ?? stringValue(metadata.memoryRawText);
  const value = finiteNumber(record?.value);
  const sign = stringValue(record?.sign) ?? (value !== null && value < 0 ? "-" : "+");
  const unit = stringValue(record?.unit) ?? "";

  // Ultimate/wax-and-wane records can carry a transformed exact value while
  // retaining the base tier UUID.  For a simple stat, the imported value is
  // therefore the authoritative numeric evidence and the catalog supplies the
  // semantic label.
  if (description && SIMPLE_MEMORY_STAT.test(description) && value !== null) {
    const magnitude = Math.abs(value);
    return `${sign}${magnitude}${unit} ${description}`;
  }
  if (!template) return description;
  if (!template.includes("#")) return template;
  if (value === null) return null;
  let used = false;
  const rendered = template.replace(/#/g, () => {
    if (used) return "__MISSING_ROLL__";
    used = true;
    return String(Math.abs(value));
  });
  return rendered.includes("__MISSING_ROLL__") ? null : rendered;
}

function heroMemoryLines(
  loadout: any,
  coverage: MutableCoverage,
  catalog: CatalogState,
  loadoutPath: string,
): SourceLine[] {
  const lines: SourceLine[] = [];
  const inventoryRecords = arrayValue(loadout?.heroMemories?.inventory)
    .filter((memory) => stringValue(memory?.id));
  const inventory = new Map(
    inventoryRecords.map((memory) => [String(memory.id), memory]),
  );
  const inventoryCounts = new Map<string, number>();
  for (const memory of inventoryRecords) {
    const id = String(memory.id);
    inventoryCounts.set(id, (inventoryCounts.get(id) ?? 0) + 1);
  }
  const equippedIds = Object.entries(loadout?.heroMemories?.equipped ?? {})
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && !!entry[1]);
  const specialSlot = loadout?.heroMemories?.equipped?.slotLevel1Special;
  if (specialSlot && typeof specialSlot === "object") {
    recordUnresolved(coverage, "hero-memory", {
      code: "source-effects-not-materialized",
      source: `${loadoutPath}.heroMemories.equipped.slotLevel1Special`,
      message: "The special level-1 memory slot is a modifier relationship, not a normal equipped memory, and is not expanded by this compiler.",
    });
  }
  const equippedCounts = new Map<string, number>();
  for (const [, memoryId] of equippedIds) {
    equippedCounts.set(memoryId, (equippedCounts.get(memoryId) ?? 0) + 1);
  }

  for (const [slot, memoryId] of equippedIds) {
    if ((equippedCounts.get(memoryId) ?? 0) !== 1) {
      recordUnresolved(coverage, "hero-memory", {
        code: "duplicate-equipped-reference",
        source: `${loadoutPath}.heroMemories.equipped.${slot}`,
        message: `Hero memory ${memoryId} is referenced by more than one slot; every duplicate reference is rejected.`,
      });
      continue;
    }
    if ((inventoryCounts.get(memoryId) ?? 0) > 1) {
      recordUnresolved(coverage, "hero-memory", {
        code: "duplicate-equipped-reference",
        source: `${loadoutPath}.heroMemories.equipped.${slot}`,
        message: `Hero memory ${memoryId} does not resolve to exactly one inventory record.`,
      });
      continue;
    }
    const memory = inventory.get(memoryId);
    if (!memory) {
      recordUnresolved(coverage, "hero-memory", {
        code: "missing-equipped-record",
        source: `${loadoutPath}.heroMemories.equipped.${slot}`,
        message: `Equipped memory ${memoryId} is absent from memory inventory.`,
      });
      continue;
    }
    const expectedMemoryType = new Map([
      ["slot45", "Origin"],
      ["slot60", "Discipline"],
      ["slot75", "Progress"],
    ]).get(slot);
    if (!expectedMemoryType || stringValue(memory.memoryType) !== expectedMemoryType) {
      recordUnresolved(coverage, "hero-memory", {
        code: "invalid-installed-reference",
        source: `${loadoutPath}.heroMemories.equipped.${slot}`,
        message: `Hero memory ${memoryId} does not match the verified ${slot} memory type.`,
        evidence: expectedMemoryType
          ? `expected ${expectedMemoryType}; received ${String(memory.memoryType ?? "missing")}`
          : "unsupported memory slot",
      });
      continue;
    }
    coverage.equippedHeroMemories += 1;
    for (const field of [
      "baseStat",
      "fixedAffixes",
      "randomAffixes",
      "lunarPhaseAffix",
      "revivedAffixLunarPhase",
    ] as const) {
      const fieldValue = memory[field];
      const records = Array.isArray(fieldValue) ? fieldValue : fieldValue ? [fieldValue] : [];
      for (const [index, record] of records.entries()) {
        const id = stringValue(record?.guid);
        if (!id) continue;
        const fieldLocator = Array.isArray(fieldValue) ? `${field}[${index}]` : field;
        const locator =
          `${loadoutPath}.heroMemories.inventory[id=${memoryId}].${fieldLocator}`;
        const entry = requireCatalogEntry(
          coverage,
          catalog,
          "hero-memory",
          id,
          locator,
        );
        if (!entry) continue;
        const text = memoryLineText(record, entry);
        if (!text) {
          coverage.catalog.missingEffectDefinitions += 1;
          recordUnresolved(coverage, "hero-memory", {
            code: "missing-catalog-effect",
            source: locator,
            message: `Resolved memory ${id}, but no exact rendered effect is available.`,
          });
          continue;
        }
        pushSourceLine(
          lines,
          text,
          {
            kind: "hero-memory",
            locator,
            entityId: memoryId,
            modifierId: id,
            label: stringValue(entry.label),
          },
          [
            importedProvenance(`${loadoutPath}.heroMemories.equipped.${slot}`),
            importedProvenance(locator),
            catalogProvenance(catalog, id, "metadata.memoryTemplate"),
          ],
        );
      }
    }
  }
  return lines;
}

function divinityLines(
  loadout: any,
  coverage: MutableCoverage,
  catalog: CatalogState,
  loadoutPath: string,
): SourceLine[] {
  const lines: SourceLine[] = [];
  const inventoryRecords = arrayValue(loadout?.divinity?.inventory)
    .filter((slate) => stringValue(slate?.id));
  const inventory = new Map(
    inventoryRecords.map((slate) => [String(slate.id), slate]),
  );
  const inventoryCounts = new Map<string, number>();
  for (const slate of inventoryRecords) {
    const id = String(slate.id);
    inventoryCounts.set(id, (inventoryCounts.get(id) ?? 0) + 1);
  }
  const placements = arrayValue(loadout?.divinity?.placements);
  const placementIdCounts = new Map<string, number>();
  const placementAnchorCounts = new Map<string, number>();
  for (const placement of placements) {
    const slateId = stringValue(placement?.slateId);
    if (slateId) {
      placementIdCounts.set(slateId, (placementIdCounts.get(slateId) ?? 0) + 1);
    }
    const anchor = `${String(placement?.row)}:${String(placement?.col)}`;
    placementAnchorCounts.set(anchor, (placementAnchorCounts.get(anchor) ?? 0) + 1);
  }
  for (const [placementIndex, placement] of placements.entries()) {
    const slateId = stringValue(placement?.slateId);
    if (!slateId) continue;
    const anchor = `${String(placement?.row)}:${String(placement?.col)}`;
    if ((placementIdCounts.get(slateId) ?? 0) !== 1
        || (placementAnchorCounts.get(anchor) ?? 0) !== 1) {
      recordUnresolved(coverage, "divinity-slate", {
        code: "duplicate-equipped-reference",
        source: `${loadoutPath}.divinity.placements[${placementIndex}]`,
        message: `Divinity placement ${slateId} does not have a unique slate and board anchor; every duplicate placement is rejected.`,
      });
      continue;
    }
    if ((inventoryCounts.get(slateId) ?? 0) > 1) {
      recordUnresolved(coverage, "divinity-slate", {
        code: "duplicate-equipped-reference",
        source: `${loadoutPath}.divinity.placements[${placementIndex}]`,
        message: `Placed divinity slate ${slateId} does not resolve to exactly one inventory record.`,
      });
      continue;
    }
    const slate = inventory.get(slateId);
    if (!slate) {
      recordUnresolved(coverage, "divinity-slate", {
        code: "missing-equipped-record",
        source: `${loadoutPath}.divinity.placements[${placementIndex}]`,
        message: `Placed divinity slate ${slateId} is absent from slate inventory.`,
      });
      continue;
    }
    coverage.placedDivinitySlates += 1;
    const slateLabel = stringValue(slate.legendaryTemplate)
      ?? stringValue(slate.god)
      ?? stringValue(slate.type)
      ?? slateId;
    for (const [affixIndex, affix] of arrayValue(slate?.affixes).entries()) {
      const id = stringValue(affix?.modGuid);
      const locator =
        `${loadoutPath}.divinity.inventory[id=${slateId}].affixes[${affixIndex}]`;
      let text = stringValue(affix?.description);
      const provenance = [
        importedProvenance(`${loadoutPath}.divinity.placements[${placementIndex}].slateId`),
        importedProvenance(locator),
      ];
      if (!text && id && id !== "fixed-0") {
        const entry = requireCatalogEntry(
          coverage,
          catalog,
          "divinity-slate",
          id,
          locator,
        );
        const metadata = objectValue(entry?.metadata);
        text = stringValue(metadata.divinityDescription);
        if (entry && text) {
          provenance.push(catalogProvenance(catalog, id, "metadata.divinityDescription"));
        }
      }
      if (!text) {
        coverage.catalog.missingEffectDefinitions += 1;
        recordUnresolved(coverage, "divinity-slate", {
          code: "missing-catalog-effect",
          source: locator,
          message: "A placed divinity affix has no rendered effect text.",
          evidence: id ?? undefined,
        });
        continue;
      }
      pushSourceLine(
        lines,
        text,
        {
          kind: "divinity-slate",
          locator,
          entityId: slateId,
          modifierId: id,
          label: slateLabel,
        },
        provenance,
      );
      if (/\bcop(?:y|ies)\b[^.\n]*\badjacent slates?\b/i.test(text)) {
        recordUnresolved(coverage, "divinity-slate", {
          code: "source-effects-not-materialized",
          source: locator,
          message: "Adjacent-slate copy effects are structural and are not expanded in the imported affix list.",
          evidence: text,
        });
      }
    }
  }
  return lines;
}

function prismLines(
  loadout: any,
  coverage: MutableCoverage,
  catalog: CatalogState,
  loadoutPath: string,
): SourceLine[] {
  const lines: SourceLine[] = [];
  const inventoryRecords = arrayValue(loadout?.etherealPrisms?.inventory)
    .filter((prism) => stringValue(prism?.id));
  const inventory = new Map(
    inventoryRecords.map((prism) => [String(prism.id), prism]),
  );
  const inventoryCounts = new Map<string, number>();
  for (const prism of inventoryRecords) {
    const id = String(prism.id);
    inventoryCounts.set(id, (inventoryCounts.get(id) ?? 0) + 1);
  }
  const slots = arrayValue(loadout?.skillTree?.slots);
  const prismCounts = new Map<string, number>();
  for (const slot of slots) {
    const prismId = stringValue(slot?.prismId ?? slot?.equippedPrism?.prismId);
    if (prismId) prismCounts.set(prismId, (prismCounts.get(prismId) ?? 0) + 1);
  }
  for (const [slotIndex, slot] of slots.entries()) {
    const prismId = stringValue(slot?.prismId ?? slot?.equippedPrism?.prismId);
    if (!prismId) continue;
    if ((prismCounts.get(prismId) ?? 0) !== 1) {
      recordUnresolved(coverage, "ethereal-prism", {
        code: "duplicate-equipped-reference",
        source: `${loadoutPath}.skillTree.slots[${slotIndex}].prismId`,
        message: `Ethereal prism ${prismId} is referenced by more than one talent slot; every duplicate reference is rejected.`,
      });
      continue;
    }
    if ((inventoryCounts.get(prismId) ?? 0) > 1) {
      recordUnresolved(coverage, "ethereal-prism", {
        code: "duplicate-equipped-reference",
        source: `${loadoutPath}.skillTree.slots[${slotIndex}].prismId`,
        message: `Ethereal prism ${prismId} does not resolve to exactly one inventory record.`,
      });
      continue;
    }
    const prism = inventory.get(prismId);
    if (!prism) {
      recordUnresolved(coverage, "ethereal-prism", {
        code: "missing-equipped-record",
        source: `${loadoutPath}.skillTree.slots[${slotIndex}].prismId`,
        message: `Equipped prism ${prismId} is absent from prism inventory.`,
      });
      continue;
    }
    const affixes = [
      ...(stringValue(prism.selectedBaseAffixId)
        ? [{
            id: String(prism.selectedBaseAffixId),
            locator:
              `${loadoutPath}.etherealPrisms.inventory[id=${prismId}].selectedBaseAffixId`,
          }]
        : []),
      ...arrayValue(prism.randomAffixes)
        .map((value, index) => ({
          id: stringValue(value),
          locator:
            `${loadoutPath}.etherealPrisms.inventory[id=${prismId}].randomAffixes[${index}]`,
        }))
        .filter((entry): entry is { id: string; locator: string } => entry.id !== null),
    ];
    for (const { id, locator } of affixes) {
      const entry = requireCatalogEntry(
        coverage,
        catalog,
        "ethereal-prism",
        id,
        locator,
      );
      if (!entry) continue;
      const text = stringValue(entry.label);
      if (!text) {
        coverage.catalog.missingEffectDefinitions += 1;
        recordUnresolved(coverage, "ethereal-prism", {
          code: "missing-catalog-effect",
          source: locator,
          message: `Resolved prism affix ${id}, but the compact catalog has no effect label.`,
        });
        continue;
      }
      pushSourceLine(
        lines,
        text,
        {
          kind: "ethereal-prism",
          locator,
          entityId: prismId,
          modifierId: id,
          label: text,
        },
        [
          importedProvenance(`${loadoutPath}.skillTree.slots[${slotIndex}].prismId`),
          importedProvenance(locator),
          catalogProvenance(catalog, id, "label"),
        ],
        "area-talent",
      );
    }
  }
  return lines;
}

function kismetEffectText(effect: any, roll: unknown): string | null {
  let value = finiteNumber(roll);
  const min = finiteNumber(effect?.valueMin);
  const max = finiteNumber(effect?.valueMax);
  if (value === null && min !== null && max !== null && min === max) value = min;
  if (value === null) return null;
  const sign = stringValue(effect?.sign) ?? (value < 0 ? "-" : "+");
  const text = stringValue(effect?.text);
  if (!text) return null;
  const magnitude = Math.abs(value);
  if (/^[%+\-]/.test(text)) return `${sign}${magnitude}${text}`;
  const unit = stringValue(effect?.unit) ?? "";
  return `${sign}${magnitude}${unit} ${text}`;
}

function expectedExpansionNodeTypes(type: unknown): Array<"Micro" | "Medium"> | null {
  if (typeof type !== "string") return null;
  const micro = /^([1-5])_Micro$/.exec(type);
  if (micro) return Array(Number(micro[1])).fill("Micro") as Array<"Micro">;
  const medium = /^([1-3])_Medium$/.exec(type);
  if (medium) return Array(Number(medium[1])).fill("Medium") as Array<"Medium">;
  const mixed = new Map<string, Array<"Micro" | "Medium">>([
    ["1_Medium_1_Micro", ["Medium", "Micro"]],
    ["2_Medium_1_Micro", ["Medium", "Medium", "Micro"]],
    ["1_Medium_2_Micro", ["Medium", "Micro", "Micro"]],
  ]);
  return mixed.get(type) ?? null;
}

interface PactspiritValidation {
  pact: any | null;
  reason: string | null;
}

function validatePactspiritSlot(loadout: any, index: number): PactspiritValidation {
  const pactspirits = loadout?.pactspirits;
  if (!Array.isArray(pactspirits) || pactspirits.length !== 3) {
    return {
      pact: null,
      reason: "Installed kismets require the exact three-slot pactspirit projection.",
    };
  }
  const pact = pactspirits[index];
  if (!pact || typeof pact !== "object" || Array.isArray(pact)) {
    return {
      pact: null,
      reason: `Kismet ownership points to empty pactspirit slot ${index}.`,
    };
  }
  const guid = stringValue(pact.guid);
  const level =
    typeof pact.level === "number" && Number.isSafeInteger(pact.level)
      ? pact.level
      : null;
  const allocatedNodes = arrayValue(pact.allocatedNodes)
    .map((node) => stringValue(node))
    .filter((node): node is string => node !== null);
  const expansions = pact.expansions;
  const duplicateGuid = guid
    ? pactspirits.filter((candidate) =>
        stringValue(candidate?.guid) === guid).length !== 1
    : true;
  if (!guid
      || !UUID_PATTERN.test(guid)
      || duplicateGuid
      || level === null
      || !Number.isInteger(level)
      || level < 1
      || level > 6
      || allocatedNodes.length === 0
      || allocatedNodes.length !== arrayValue(pact.allocatedNodes).length
      || new Set(allocatedNodes).size !== allocatedNodes.length
      || allocatedNodes.some((node) => !/^(?:[1-9]|1[01])$/.test(node))
      || expansions === null
      || typeof expansions !== "object"
      || Array.isArray(expansions)) {
    return {
      pact: null,
      reason: `Pactspirit slot ${index} does not satisfy the exported identity, level, node, or expansion contract.`,
    };
  }

  for (const [baseNodeId, expansionValue] of Object.entries(expansions)) {
    const expansion = objectValue(expansionValue);
    const expectedTypes = expectedExpansionNodeTypes(expansion.type);
    const virtualNodes = arrayValue(expansion.virtualNodes);
    if (!allocatedNodes.includes(baseNodeId)
        || !expectedTypes
        || virtualNodes.length !== expectedTypes.length
        || virtualNodes.some((node, virtualIndex) => (
          stringValue(node?.nodeId) !== `virt_${index}_${baseNodeId}_${virtualIndex}`
          || stringValue(node?.type) !== expectedTypes[virtualIndex]
        ))) {
      return {
        pact: null,
        reason: `Pactspirit slot ${index} has a malformed expansion at node ${baseNodeId}.`,
      };
    }
  }
  return { pact, reason: null };
}

interface KismetSocketValidation {
  nodeType: "Micro" | "Medium" | null;
  reason: string | null;
}

function validateKismetSocket(
  kismet: any,
  pactValidation: PactspiritValidation,
): KismetSocketValidation {
  const index =
    typeof kismet?.pactspritIndex === "number"
      && Number.isSafeInteger(kismet.pactspritIndex)
      ? kismet.pactspritIndex
      : null;
  const nodeId = stringValue(kismet?.nodeId);
  const match = nodeId?.match(
    /^slot_([0-2])_(?:([1-9]\d*)|virt_([0-2])_([1-9]\d*)_(\d+))$/,
  );
  if (index === null
      || !Number.isInteger(index)
      || index < 0
      || index > 2
      || !match
      || Number(match[1]) !== index
      || (match[3] !== undefined && Number(match[3]) !== index)) {
    return {
      nodeType: null,
      reason: "Kismet slot identity does not match its pactspirit index.",
    };
  }
  if (!pactValidation.pact) {
    return { nodeType: null, reason: pactValidation.reason };
  }
  const pact = pactValidation.pact;
  const baseNodeId = match[2] ?? match[4];
  if (!arrayValue(pact.allocatedNodes).map(String).includes(baseNodeId)) {
    return {
      nodeType: null,
      reason: `Kismet socket ${nodeId} is not owned by an allocated pactspirit node.`,
    };
  }

  const expansion = objectValue(pact.expansions?.[baseNodeId]);
  if (match[2]) {
    if (Object.hasOwn(pact.expansions, baseNodeId)) {
      return {
        nodeType: null,
        reason: `Direct socket ${nodeId} was replaced by an expansion.`,
      };
    }
    const nodeType = PACTSPIRIT_BASE_NODE_TYPES.get(baseNodeId) ?? null;
    return nodeType
      ? { nodeType, reason: null }
      : {
          nodeType: null,
          reason: `Direct pactspirit node ${baseNodeId} has no verified SS13 kismet socket type.`,
        };
  }

  const unprefixedNodeId = String(nodeId).replace(/^slot_[0-2]_/, "");
  const virtualNode = arrayValue(expansion.virtualNodes)
    .find((node) => stringValue(node?.nodeId) === unprefixedNodeId);
  const nodeType = stringValue(virtualNode?.type);
  return nodeType === "Micro" || nodeType === "Medium"
    ? { nodeType, reason: null }
    : {
        nodeType: null,
        reason: `Virtual socket ${nodeId} is not owned by the pactspirit expansion.`,
      };
}

function kismetLines(
  loadout: any,
  coverage: MutableCoverage,
  catalog: CatalogState,
  loadoutPath: string,
): SourceLine[] {
  const lines: SourceLine[] = [];
  const kismets = arrayValue(loadout?.kismets);
  const nodeClaims = new Map<string, number>();
  for (const kismet of kismets) {
    const nodeId = stringValue(kismet?.nodeId);
    if (nodeId) nodeClaims.set(nodeId, (nodeClaims.get(nodeId) ?? 0) + 1);
  }
  const pactValidations = new Map<number, PactspiritValidation>();

  for (const [index, kismet] of kismets.entries()) {
    const id = stringValue(kismet?.kismetGuid);
    const locator = `${loadoutPath}.kismets[${index}]`;
    const nodeId = stringValue(kismet?.nodeId);
    const pactIndex =
      typeof kismet?.pactspritIndex === "number"
        && Number.isSafeInteger(kismet.pactspritIndex)
        ? kismet.pactspritIndex
        : null;
    if (!id || !UUID_PATTERN.test(id) || !nodeId) {
      recordUnresolved(coverage, "kismet", {
        code: "invalid-installed-reference",
        source: locator,
        message: "Installed kismet identity, node, or UUID is malformed.",
      });
      continue;
    }
    if ((nodeClaims.get(nodeId) ?? 0) !== 1) {
      recordUnresolved(coverage, "kismet", {
        code: "duplicate-equipped-reference",
        source: locator,
        message: `Kismet socket ${nodeId} has multiple claimants; every claimant is rejected.`,
      });
      continue;
    }
    if (pactIndex === null || !Number.isInteger(pactIndex)) {
      recordUnresolved(coverage, "kismet", {
        code: "invalid-installed-reference",
        source: locator,
        message: "Installed kismet has no valid pactspirit slot index.",
      });
      continue;
    }
    const pactValidation = pactValidations.get(pactIndex)
      ?? validatePactspiritSlot(loadout, pactIndex);
    pactValidations.set(pactIndex, pactValidation);
    const socket = validateKismetSocket(kismet, pactValidation);
    if (!socket.nodeType) {
      recordUnresolved(coverage, "kismet", {
        code: "invalid-installed-reference",
        source: locator,
        message: socket.reason ?? "Installed kismet socket ownership is unresolved.",
      });
      continue;
    }
    const entry = requireCatalogEntry(coverage, catalog, "kismet", id, locator);
    if (!entry) continue;
    const metadata = objectValue(entry.metadata);
    const kismetType = stringValue(metadata.kismetType);
    if (stringValue(entry.kind) !== "baseId"
        || (kismetType !== "Micro" && kismetType !== "Medium")
        || kismetType !== socket.nodeType) {
      recordUnresolved(coverage, "kismet", {
        code: "invalid-installed-reference",
        source: locator,
        message: `Kismet ${id} does not match the verified ${socket.nodeType} socket type.`,
      });
      continue;
    }
    const effects = arrayValue(metadata.kismetEffects);
    if (!effects.length) {
      coverage.catalog.missingEffectDefinitions += 1;
      recordUnresolved(coverage, "kismet", {
        code: "missing-catalog-effect",
        source: locator,
        message: `Kismet ${id} is identified as ${String(entry.label ?? id)}, but its compact catalog effect list is empty.`,
      });
      continue;
    }
    const rollsValue = kismet?.rollValues;
    const rolls = arrayValue(rollsValue);
    if ((rollsValue !== undefined && !Array.isArray(rollsValue))
        || rolls.some((roll) => typeof roll !== "number" || !Number.isFinite(roll))
        || rolls.length > effects.length) {
      recordUnresolved(coverage, "kismet", {
        code: "invalid-installed-reference",
        source: `${locator}.rollValues`,
        message: "Installed kismet rolls do not match the catalog effect list.",
      });
      continue;
    }
    for (const [effectIndex, effect] of effects.entries()) {
      const effectLocator = rolls[effectIndex] === undefined
        ? locator
        : `${locator}.rollValues[${effectIndex}]`;
      const rollValue = rolls[effectIndex];
      const roll =
        typeof rollValue === "number" && Number.isFinite(rollValue)
          ? rollValue
          : null;
      const min = finiteNumber(effect?.valueMin);
      const max = finiteNumber(effect?.valueMax);
      if (roll !== null
          && ((min !== null && roll < min) || (max !== null && roll > max))) {
        recordUnresolved(coverage, "kismet", {
          code: "invalid-installed-reference",
          source: effectLocator,
          message: `Installed kismet roll ${roll} is outside its verified catalog range.`,
          evidence: min !== null && max !== null ? `${min}–${max}` : undefined,
        });
        continue;
      }
      const text = kismetEffectText(effect, rolls[effectIndex]);
      if (!text) {
        coverage.catalog.missingEffectDefinitions += 1;
        recordUnresolved(coverage, "kismet", {
          code: "missing-roll",
          source: effectLocator,
          message: "A variable kismet effect is missing its exact installed roll.",
          evidence: stringValue(effect?.text) ?? undefined,
        });
        continue;
      }
      pushSourceLine(
        lines,
        text,
        {
          kind: "kismet",
          locator: effectLocator,
          entityId: id,
          modifierId: stringValue(objectValue(entry.metadata).kismetModifierId),
          label: stringValue(entry.label),
        },
        [
          importedProvenance(effectLocator),
          catalogProvenance(catalog, id, `metadata.kismetEffects[${effectIndex}]`),
        ],
      );
    }
  }
  return lines;
}

function guardedIrisDefenseTerms(
  loadout: any,
  coverage: MutableCoverage,
  loadoutPath: string,
): PlayerDefenseTerm[] {
  const heroId = stringValue(loadout?.hero?.heroGuid ?? loadout?.hero?.heroId);
  if (heroId !== IRIS_VIGILANT_BREEZE_ID) return [];
  const terms: PlayerDefenseTerm[] = [];
  const countTerm = (kind: "hero-trait" | "skill-support"): void => {
    coverage.sourceLines += 1;
    coverage.defensiveLines += 1;
    coverage.bySource[kind].lines += 1;
    coverage.bySource[kind].defensiveLines += 1;
    coverage.bySource[kind].terms += 1;
  };

  const heroTraits = objectValue(loadout?.hero?.traits);
  const nurturingClaims = Object.entries(heroTraits)
    .filter(([, trait]) => trait === NURTURING_BREEZE_TRAIT_ID);
  const validNurturingPlacement = nurturingClaims.length === 1
    && nurturingClaims[0][0] === "level75";
  if (nurturingClaims.length > 0 && !validNurturingPlacement) {
    recordUnresolved(coverage, "hero-trait", {
      code: "invalid-installed-reference",
      source: `${loadoutPath}.hero.traits`,
      message: "Nurturing Breeze must appear exactly once in Iris's level75 trait slot before its defensive candidates can be compiled.",
      evidence: nurturingClaims.map(([slot]) => slot).join(", "),
    });
  }
  if (validNurturingPlacement) {
    const locator = `${loadoutPath}.hero.traits.level75`;
    const candidates = [-20, -24, -28, -32, -36];
    countTerm("hero-trait");
    terms.push({
      id: `hero-trait:${locator}:additional-damage-taken:0`,
      actor: "player",
      stat: "additional-damage-taken",
      operation: "additional-percent",
      value: null,
      candidateValues: candidates,
      unit: "percent",
      scope: "player-conditional",
      condition: "while Iris is in Vigilant; the planner snapshot omits the five-rank trait enhancement selector",
      benefit: "beneficial",
      text: "Nurturing Breeze: while Vigilant, Iris has one of -20/-24/-28/-32/-36% additional damage taken.",
      source: {
        kind: "hero-trait",
        locator,
        entityId: heroId,
        modifierId: NURTURING_BREEZE_TRAIT_ID,
        label: "Nurturing Breeze",
      },
      provenance: [
        importedProvenance(locator),
        SS13_IRIS_TRAIT_TEXT_SOURCE,
      ],
      includedInSourceSum: false,
      isTotalEhp: false,
    });
    recordUnresolved(coverage, "hero-trait", {
      code: "missing-runtime-selector",
      source: locator,
      message: "Nurturing Breeze has five exact SS13 values, but the imported trait record does not encode which enhancement rank is active.",
      evidence: candidates.join(", "),
    });
  }

  const supportedOwnerIds = new Set([
    SUMMON_ROCK_MAGUS_ID,
    SUMMON_EROSION_MAGUS_ID,
  ]);
  const placements = ([
    ["activeSkills", loadout?.skills?.activeSkills],
    ["passiveSkills", loadout?.skills?.passiveSkills],
  ] as const).flatMap(([collection, rawSkills]) =>
    (Array.isArray(rawSkills) ? rawSkills : []).map((skill: any, skillIndex: number) => ({
      collection,
      skill,
      skillIndex,
      skillLocator: `${loadoutPath}.skills.${collection}[${skillIndex}]`,
      ownerId: stringValue(skill?.skillGuid),
    })));
  const ownerCounts = new Map<string, number>();
  for (const placement of placements) {
    if (placement.ownerId && supportedOwnerIds.has(placement.ownerId)) {
      ownerCounts.set(
        placement.ownerId,
        (ownerCounts.get(placement.ownerId) ?? 0) + 1,
      );
    }
  }

  for (const {
    skill,
    skillLocator,
    ownerId,
  } of placements) {
    const rawSupports = skill?.supports;
    const supportClaims = (Array.isArray(rawSupports) ? rawSupports : [])
      .map((support: any, supportIndex: number) => ({
        support,
        supportIndex,
        supportId: stringValue(support?.supportGuid),
        locator: `${skillLocator}.supports[${supportIndex}]`,
      }))
      .filter(({ supportId }) =>
        supportId === PROTECTION_FIELD_SUPPORT_ID
        || supportId === PRECISE_PROTECTION_FIELD_SUPPORT_ID);
    const isSupportedOwner = ownerId !== null && supportedOwnerIds.has(ownerId);
    if (!isSupportedOwner && !supportClaims.length) continue;

    if (!isSupportedOwner) {
      for (const claim of supportClaims) {
        recordUnresolved(coverage, "skill-support", {
          code: "invalid-installed-reference",
          source: claim.locator,
          message: "Protection Field is only source-proven when nested under an enabled Rock or Erosion Magus summon.",
          evidence: `owner ${ownerId ?? "missing"}`,
        });
      }
      continue;
    }
    if (skill?.enabled !== true) {
      for (const claim of supportClaims) {
        recordUnresolved(coverage, "skill-support", {
          code: "invalid-installed-reference",
          source: claim.locator,
          message: "Protection Field requires an explicitly enabled parent summon.",
          evidence: `enabled=${String(skill?.enabled)}`,
        });
      }
      continue;
    }
    if (!Array.isArray(rawSupports) || rawSupports.length !== 5) {
      recordUnresolved(coverage, "skill-support", {
        code: "invalid-installed-reference",
        source: `${skillLocator}.supports`,
        message: "An enabled summon must expose exactly five support socket positions before Protection Field evidence can be compiled.",
        evidence: Array.isArray(rawSupports)
          ? `received ${rawSupports.length} positions`
          : "supports is not an array",
      });
      continue;
    }
    if ((ownerCounts.get(ownerId) ?? 0) !== 1) {
      for (const claim of supportClaims) {
        recordUnresolved(coverage, "skill-support", {
          code: "duplicate-equipped-reference",
          source: claim.locator,
          message: "Protection Field evidence is withheld because this summon identity appears in multiple parent skill slots.",
          evidence: ownerId,
        });
      }
      continue;
    }
    if (supportClaims.length > 1) {
      for (const claim of supportClaims) {
        recordUnresolved(coverage, "skill-support", {
          code: "duplicate-equipped-reference",
          source: claim.locator,
          message: "Protection Field evidence is withheld because one summon parent claims multiple Protection Field sockets.",
          evidence: ownerId,
        });
      }
      continue;
    }

    for (const {
      support,
      supportId,
      locator,
    } of supportClaims) {
      if (support?.type !== "support") {
        recordUnresolved(coverage, "skill-support", {
          code: "invalid-installed-reference",
          source: locator,
          message: "Protection Field requires the ordinary SS13 support record type.",
          evidence: `type=${String(support?.type ?? "missing")}`,
        });
        continue;
      }
      const level = support?.level;
      if (typeof level !== "number"
          || !Number.isSafeInteger(level)
          || level < 1
          || level > 40) {
        recordUnresolved(coverage, "skill-support", {
          code: "invalid-installed-reference",
          source: locator,
          message: "Protection Field needs an integer SS13 support level from 1 through 40.",
          evidence: String(level),
        });
        continue;
      }
      const base = supportId === PRECISE_PROTECTION_FIELD_SUPPORT_ID ? 7.95 : 4.95;
      const value = Number((base + level * 0.05).toFixed(10));
      const name = supportId === PRECISE_PROTECTION_FIELD_SUPPORT_ID
        ? "Precise: Protection Field"
        : "Protection Field";
      countTerm("skill-support");
      terms.push({
        id: `skill-support:${locator}:damage-transfer-to-minion:0`,
        actor: "player",
        stat: "damage-transfer-to-minion",
        operation: "transfer-percent",
        value,
        unit: "percent",
        scope: "player-conditional",
        condition: "only to Minions summoned by the supported skill; summoned-minion presence and survivability are not deterministic in the snapshot",
        benefit: "beneficial",
        text: `${name} level ${level}: transfers ${value}% of damage taken to Minions summoned by the supported skill.`,
        source: {
          kind: "skill-support",
          locator,
          entityId: ownerId,
          modifierId: supportId,
          label: name,
        },
        provenance: [
          importedProvenance(locator),
          SS13_PROTECTION_FIELD_FORMULA_SOURCE,
          SS13_PROTECTION_FIELD_TEXT_SOURCE,
        ],
        includedInSourceSum: false,
        isTotalEhp: false,
      });
    }
  }
  return terms;
}

function conditionFor(text: string): string | null {
  return /\b(?:when|while|during|if|per\b|for\s+(?:each|every)|every\b|upon|after|against|at\b|with\b|without\b|in proximity|nearby|recently|on\s+(?:hit|block|taking|losing|gaining|defeat|kill|cast|use))\b/i.test(text)
    ? text
    : null;
}

function benefitFor(
  stat: PlayerDefenseStat,
  value: number | null,
  operation: PlayerDefenseOperation,
): DefenseBenefit {
  if (stat === "unclassified-defense") return "unclassified";
  if (stat === "additional-damage-taken") {
    if (value === null || value === 0) return "context-dependent";
    return value < 0 ? "beneficial" : "harmful";
  }
  if (stat === "nearby-enemy-additional-damage") {
    if (value === null || value === 0) return "context-dependent";
    return value < 0 ? "beneficial" : "harmful";
  }
  if (stat === "life-loss-per-second" || stat === "energy-shield-loss-per-second"
      || stat === "energy-shield-fixed-zero") {
    return "harmful";
  }
  if (operation === "conversion-percent") return "context-dependent";
  return value !== null && value < 0 ? "harmful" : "beneficial";
}

function parsePlayerTerms(line: SourceLine): PlayerDefenseTerm[] {
  const output: PlayerDefenseTerm[] = [];
  const seen = new Set<string>();
  const text = line.text;
  const condition = conditionFor(text);

  const add = (
    stat: PlayerDefenseStat,
    operation: PlayerDefenseOperation,
    value: number | null,
    unit: PlayerDefenseTerm["unit"],
    forcedScope?: PlayerDefenseScope,
  ): void => {
    const scope = forcedScope
      ?? line.forcedScope
      ?? (condition ? "player-conditional" : "player-global");
    const key = `${stat}\u0000${operation}\u0000${String(value)}\u0000${unit}\u0000${scope}`;
    if (seen.has(key)) return;
    seen.add(key);
    const ordinal = output.length;
    output.push({
      id: `${line.source.kind}:${line.source.locator}:${stat}:${ordinal}`,
      actor: "player",
      stat,
      operation,
      value,
      unit,
      scope,
      condition,
      benefit: benefitFor(stat, value, operation),
      text,
      source: line.source,
      provenance: line.provenance,
      includedInSourceSum: false,
      isTotalEhp: false,
    });
  };
  const matches = (
    pattern: RegExp,
    visit: (match: RegExpExecArray) => void,
  ): void => {
    const expression = new RegExp(
      pattern.source,
      pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
    );
    let match: RegExpExecArray | null;
    while ((match = expression.exec(text)) !== null) visit(match);
  };

  // One numeric source can explicitly apply to both named stats.
  matches(/([+-]?\s*\d+(?:\.\d+)?)\s*%\s+Max Life and Max Energy Shield/gi, (match) => {
    const value = signedNumber(match[1]);
    add("max-life", "increase-percent", value, "percent");
    add("max-energy-shield", "increase-percent", value, "percent");
  });
  matches(/([+-]?\s*\d+(?:\.\d+)?)\s*%\s+Max Energy Shield and Max Life/gi, (match) => {
    const value = signedNumber(match[1]);
    add("max-life", "increase-percent", value, "percent");
    add("max-energy-shield", "increase-percent", value, "percent");
  });
  matches(/([+-]?\s*\d+(?:\.\d+)?)\s+(Armor) and Evasion/gi, (match) => {
    const value = signedNumber(match[1]);
    add("armor", "add-flat", value, "flat");
    add("evasion", "add-flat", value, "flat");
  });
  matches(/([+-]?\s*\d+(?:\.\d+)?)\s*%\s+Elemental and Erosion Resistance/gi, (match) => {
    const value = signedNumber(match[1]);
    add("elemental-resistance", "add-percentage-points", value, "percent");
    add("erosion-resistance", "add-percentage-points", value, "percent");
  });
  matches(/([+-]?\s*\d+(?:\.\d+)?)\s*%\s+Life Regain and Energy Shield Regain/gi, (match) => {
    const value = signedNumber(match[1]);
    add("life-regain", "recovery-percent", value, "percent");
    add("energy-shield-regain", "recovery-percent", value, "percent");
  });
  matches(/([+-]?\s*\d+(?:\.\d+)?)\s*%\s+Attack and Spell Block Chance/gi, (match) => {
    const value = signedNumber(match[1]);
    add("attack-block-chance", "chance-percent", value, "percent");
    add("spell-block-chance", "chance-percent", value, "percent");
  });

  matches(/([+-]?\s*\d+(?:\.\d+)?)\s*(%)?\s+Max Life\b/gi, (match) => {
    add(
      "max-life",
      match[2] ? "increase-percent" : "add-flat",
      signedNumber(match[1]),
      match[2] ? "percent" : "flat",
    );
  });
  matches(/([+-]?\s*\d+(?:\.\d+)?)\s*(%)?\s+Max Energy Shield\b/gi, (match) => {
    add(
      "max-energy-shield",
      match[2] ? "increase-percent" : "add-flat",
      signedNumber(match[1]),
      match[2] ? "percent" : "flat",
    );
  });
  matches(/([+-]?\s*\d+(?:\.\d+)?)\s*(%)?\s+gear Energy Shield\b/gi, (match) => {
    add(
      "max-energy-shield",
      match[2] ? "increase-percent" : "add-flat",
      signedNumber(match[1]),
      match[2] ? "percent" : "flat",
      "local-gear",
    );
  });
  matches(/([+-]?\s*\d+(?:\.\d+)?)\s*(%)?\s+Gear Armor\b/gi, (match) => {
    add(
      "armor",
      match[2] ? "increase-percent" : "add-flat",
      signedNumber(match[1]),
      match[2] ? "percent" : "flat",
      "local-gear",
    );
  });
  matches(/([+-]?\s*\d+(?:\.\d+)?)\s*(%)?\s+gear Evasion\b/gi, (match) => {
    add(
      "evasion",
      match[2] ? "increase-percent" : "add-flat",
      signedNumber(match[1]),
      match[2] ? "percent" : "flat",
      "local-gear",
    );
  });
  matches(
    /([+-]?\s*\d+(?:\.\d+)?)\s*(%)?\s+Armor\b(?!\s+(?:Effective|DMG|Mitigation|Penetration))/gi,
    (match) => {
      add(
        "armor",
        match[2] ? "increase-percent" : "add-flat",
        signedNumber(match[1]),
        match[2] ? "percent" : "flat",
      );
    },
  );
  matches(/([+-]?\s*\d+(?:\.\d+)?)\s*(%)?\s+Evasion\b/gi, (match) => {
    add(
      "evasion",
      match[2] ? "increase-percent" : "add-flat",
      signedNumber(match[1]),
      match[2] ? "percent" : "flat",
    );
  });

  const resistancePatterns: [PlayerDefenseStat, RegExp][] = [
    ["fire-resistance", /([+-]?\s*\d+(?:\.\d+)?)\s*%\s+Fire Resistance\b/gi],
    ["cold-resistance", /([+-]?\s*\d+(?:\.\d+)?)\s*%\s+Cold Resistance\b/gi],
    ["lightning-resistance", /([+-]?\s*\d+(?:\.\d+)?)\s*%\s+Lightning Resistance\b/gi],
    ["erosion-resistance", /([+-]?\s*\d+(?:\.\d+)?)\s*%\s+Erosion Resistance\b/gi],
    ["elemental-resistance", /([+-]?\s*\d+(?:\.\d+)?)\s*%\s+Elemental Resistance\b/gi],
    ["all-resistance", /([+-]?\s*\d+(?:\.\d+)?)\s*%\s+All Resistance\b/gi],
  ];
  for (const [stat, pattern] of resistancePatterns) {
    matches(pattern, (match) => {
      add(stat, "add-percentage-points", signedNumber(match[1]), "percent");
    });
  }

  matches(/([+-]?\s*\d+(?:\.\d+)?)\s*%\s+Attack(?: and Spell)? Block Chance\b/gi, (match) => {
    const value = signedNumber(match[1]);
    add("attack-block-chance", "chance-percent", value, "percent");
    if (/Attack and Spell/i.test(match[0])) {
      add("spell-block-chance", "chance-percent", value, "percent");
    }
  });
  matches(/([+-]?\s*\d+(?:\.\d+)?)\s*%\s+Spell Block Chance\b/gi, (match) => {
    add("spell-block-chance", "chance-percent", signedNumber(match[1]), "percent");
  });
  matches(/([+-]?\s*\d+(?:\.\d+)?)\s*%\s+Block Ratio\b/gi, (match) => {
    add("block-ratio", "ratio-percent", signedNumber(match[1]), "percent");
  });
  matches(/([+-]?\s*\d+(?:\.\d+)?)\s*%\s+Injury Buffer\b/gi, (match) => {
    add("injury-buffer", "increase-percent", signedNumber(match[1]), "percent");
  });
  matches(
    /([+-]?\s*\d+(?:\.\d+)?)\s*%\s+Armor Effective Rate for Non-Physical Damage\b/gi,
    (match) => {
      add(
        "armor-effective-rate-non-physical",
        "increase-percent",
        signedNumber(match[1]),
        "percent",
      );
    },
  );
  matches(
    /([+-]?\s*\d+(?:\.\d+)?)\s*%\s+Critical Strike Damage Mitigation\b/gi,
    (match) => {
      add(
        "critical-strike-damage-mitigation",
        "increase-percent",
        signedNumber(match[1]),
        "percent",
      );
    },
  );
  matches(
    /([+-]?\s*\d+(?:\.\d+)?)\s*%\s+additional(?:\s+(?:Physical|Elemental|Hit|Damage Over Time))?\s+Damage taken\b/gi,
    (match) => {
      add("additional-damage-taken", "additional-percent", signedNumber(match[1]), "percent");
    },
  );
  matches(
    /([+-]?\s*\d+(?:\.\d+)?)\s*%\s+additional damage dealt by Nearby enemies\b/gi,
    (match) => {
      add(
        "nearby-enemy-additional-damage",
        "additional-percent",
        signedNumber(match[1]),
        "percent",
      );
    },
  );
  matches(
    /([+-]?\s*\d+(?:\.\d+)?)\s*%\s+of damage taken is transferred to (?:a )?(?:random )?Minion\b/gi,
    (match) => {
      add(
        "damage-transfer-to-minion",
        "transfer-percent",
        signedNumber(match[1]),
        "percent",
        "player-conditional",
      );
    },
  );
  matches(
    /Converts\s+([+-]?\s*\d+(?:\.\d+)?)\s*%\s+of Physical Damage taken to (?:random )?Elemental Damage\b/gi,
    (match) => {
      add(
        "physical-damage-taken-conversion",
        "conversion-percent",
        signedNumber(match[1]),
        "percent",
      );
    },
  );
  matches(/([+-]?\s*\d+(?:\.\d+)?)\s*%\s+Life Regain\b/gi, (match) => {
    add("life-regain", "recovery-percent", signedNumber(match[1]), "percent");
  });
  matches(/([+-]?\s*\d+(?:\.\d+)?)\s*%\s+Energy Shield Regain\b/gi, (match) => {
    add("energy-shield-regain", "recovery-percent", signedNumber(match[1]), "percent");
  });
  matches(/([+-]?\s*\d+(?:\.\d+)?)\s*%\s+Life Regeneration Speed\b/gi, (match) => {
    add(
      "life-regeneration-speed",
      "recovery-speed-percent",
      signedNumber(match[1]),
      "percent",
    );
  });
  matches(/([+-]?\s*\d+(?:\.\d+)?)\s*%\s+Energy Shield Charge Speed\b/gi, (match) => {
    add(
      "energy-shield-charge-speed",
      "recovery-speed-percent",
      signedNumber(match[1]),
      "percent",
    );
  });
  matches(
    /([+-]?\s*\d+(?:\.\d+)?)\s*%\s+additional Energy Shield Charge Interval\b/gi,
    (match) => {
      add(
        "energy-shield-charge-interval",
        "interval-percent",
        signedNumber(match[1]),
        "percent",
      );
    },
  );
  matches(/([+-]?\s*\d+(?:\.\d+)?)\s*%\s+Barrier Shield\b/gi, (match) => {
    add("barrier-shield", "increase-percent", signedNumber(match[1]), "percent");
  });
  matches(
    /([+-]?\s*\d+(?:\.\d+)?)\s*%\s+chance to gain a Barrier\b/gi,
    (match) => {
      add("barrier-gain-chance", "chance-percent", signedNumber(match[1]), "percent");
    },
  );
  matches(
    /([+-]?\s*\d+(?:\.\d+)?)\s*%\s+chance to avoid Elemental Ailments\b/gi,
    (match) => {
      add(
        "elemental-ailment-avoidance",
        "chance-percent",
        signedNumber(match[1]),
        "percent",
      );
    },
  );
  matches(
    /Adds\s+([+-]?\s*\d+(?:\.\d+)?)\s*%\s+of Max Life to Energy Shield\b/gi,
    (match) => {
      add(
        "energy-shield-from-max-life",
        "derive-percent",
        signedNumber(match[1]),
        "percent",
      );
    },
  );
  matches(
    /([+-]?\s*\d+(?:\.\d+)?)\s*%\s+of the Life and Energy Shield Regain Effect of Synthetic Troop Minions is also applied to you\b/gi,
    (match) => {
      add(
        "minion-regain-share-to-player",
        "derive-percent",
        signedNumber(match[1]),
        "percent",
        "player-conditional",
      );
    },
  );
  matches(
    /Gains\s+([+-]?\s*\d+(?:\.\d+)?)\s+stack\(s\) of Tenacity Blessing every\s+([+-]?\s*\d+(?:\.\d+)?)\s+s when having Barrier\b/gi,
    (match) => {
      add(
        "tenacity-blessing-generation",
        "source-only",
        signedNumber(match[1]),
        "flat",
      );
    },
  );
  if (/Max Energy Shield is fixed at 0/i.test(text)) {
    add("energy-shield-fixed-zero", "fixed-state", 0, "boolean");
  }
  matches(/([+-]?\s*\d+(?:\.\d+)?)\s+Loses\s+Life\b/gi, (match) => {
    add("life-loss-per-second", "loss-flat-per-second", signedNumber(match[1]), "flat");
  });
  matches(
    /([+-]?\s*\d+(?:\.\d+)?)\s+Energy Shield every second\b/gi,
    (match) => {
      add(
        "energy-shield-loss-per-second",
        "loss-flat-per-second",
        signedNumber(match[1]),
        "flat",
      );
    },
  );

  return output;
}

function sourceSums(terms: PlayerDefenseTerm[]): DefenseSourceSum[] {
  const sums = new Map<string, DefenseSourceSum>();
  for (const term of terms) {
    if (term.value === null
        || term.condition !== null
        || (term.scope !== "player-global" && term.scope !== "local-gear")
        || !SOURCE_SUM_OPERATIONS.has(term.operation)
        || !SOURCE_SUM_STATS.has(term.stat)
        || (term.unit !== "flat" && term.unit !== "percent")) {
      continue;
    }
    const localEntity =
      term.scope === "local-gear" ? term.source.entityId : null;
    if (term.scope === "local-gear" && !localEntity) continue;
    const key = term.scope === "local-gear"
      ? `${term.scope}:${localEntity}:${term.stat}:${term.operation}:${term.unit}`
      : `${term.scope}:${term.stat}:${term.operation}:${term.unit}`;
    const existing = sums.get(key) ?? {
      key,
      stat: term.stat,
      operation: term.operation,
      scope: term.scope,
      sourceEntityId: localEntity,
      sourceLabel: term.scope === "local-gear" ? term.source.label : null,
      unit: term.unit,
      value: 0,
      termIds: [],
      isCharacterTotal: false as const,
    };
    existing.value += term.value;
    existing.termIds.push(term.id);
    term.includedInSourceSum = true;
    sums.set(key, existing);
  }
  return [...sums.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function blockedSourceCoverage(
  loadout: any,
  coverage: MutableCoverage,
  loadoutPath: string,
): void {
  const traits = Object.values(loadout?.hero?.traits ?? {}).filter((value) => stringValue(value));
  coverage.selectedHeroTraits = traits.length;
  if (traits.length) {
    coverage.unresolved.push({
      code: "source-effects-not-materialized",
      source: `${loadoutPath}.hero.traits`,
      message: "The compact catalog identifies selected hero traits but does not retain their effect bodies.",
      evidence: `${traits.length} selected trait records`,
    });
  }

  const slots = arrayValue(loadout?.skillTree?.slots);
  coverage.allocatedTalentNodes = slots.reduce(
    (total, slot) => total + Object.values(slot?.nodePoints ?? {})
      .filter((points) => (finiteNumber(points) ?? 0) > 0).length,
    0,
  );
  if (coverage.allocatedTalentNodes) {
    coverage.unresolved.push({
      code: "source-effects-not-materialized",
      source: `${loadoutPath}.skillTree.slots[].nodePoints`,
      message: "The compact catalog retains talent-node identity and type, but not each node's stat effect body.",
      evidence: `${coverage.allocatedTalentNodes} allocated talent nodes`,
    });
  }

  const pactspirits = arrayValue(loadout?.pactspirits)
    .filter((pact) => pact !== null && typeof pact === "object" && !Array.isArray(pact));
  coverage.installedPactspirits = pactspirits.length;
  coverage.allocatedPactNodes = pactspirits.reduce(
    (total, pact) => total + arrayValue(pact?.allocatedNodes).length,
    0,
  );
  if (pactspirits.length) {
    coverage.unresolved.push({
      code: "source-effects-not-materialized",
      source: `${loadoutPath}.pactspirits`,
      message: "Installed pactspirit UUIDs and allocated node IDs have no node-effect bodies in the compact SS13 catalog.",
      evidence: `${pactspirits.length} pactspirits / ${coverage.allocatedPactNodes} allocated nodes`,
    });
  }

  const skillCount = arrayValue(loadout?.skills?.activeSkills).length
    + arrayValue(loadout?.skills?.passiveSkills).length;
  if (skillCount) {
    coverage.unresolved.push({
      code: "source-effects-not-materialized",
      source: `${loadoutPath}.skills`,
      message: "The compact catalog identifies skills, but a complete player-defence compiler still needs passive, active, support, and runtime-state effect formulas.",
      evidence: `${skillCount} installed skill records`,
    });
  }
}

function commonEhpBlockers(coverage: PlayerDefenseCoverage): CalculationBlocker[] {
  const blockers: CalculationBlocker[] = [
    {
      code: "missing-character-defence-baseline",
      message: "The planner export does not provide source-complete character base Life, Energy Shield, Armor, Evasion, resistance totals/caps, or block totals.",
      evidence: "The extracted source sums are modifier inputs and are explicitly not character totals.",
    },
    {
      code: "missing-talent-trait-pact-effects",
      message: "Talent-node, hero-trait, and pactspirit-node effect bodies are not materialized by the compact SS13 catalog.",
      evidence: `${coverage.allocatedTalentNodes} talent nodes, ${coverage.selectedHeroTraits} hero traits, and ${coverage.allocatedPactNodes} pact nodes require effect data.`,
    },
    {
      code: "missing-skill-defence-formulas",
      message: "Installed skill effects, buff values, cooldowns, trigger state, and defensive uptime are not fully compiled.",
    },
    {
      code: "missing-damage-scenario",
      message: "EHP requires an incoming damage type, hit size, enemy level, resistance-cap state, and declared conditional uptime.",
    },
  ];
  if (coverage.catalog.status !== "matched-ss13"
      || coverage.catalog.missingReferences > 0
      || coverage.catalog.missingEffectDefinitions > 0) {
    blockers.push({
      code: "incomplete-defence-catalog-coverage",
      message: "At least one equipped UUID could not be resolved to a complete SS13 effect body.",
      evidence: `${coverage.catalog.resolvedReferences}/${coverage.catalog.requiredReferences} references resolved; ${coverage.catalog.missingEffectDefinitions} resolved entries lack effect definitions.`,
    });
  }
  if (coverage.unparsedDefensiveLines > 0) {
    blockers.push({
      code: "unparsed-defensive-source-lines",
      message: "At least one player-scoped defensive-looking source line is preserved as evidence but has no typed formula input.",
      evidence: `${coverage.unparsedDefensiveLines} unparsed defensive lines`,
    });
  }
  const missingProjectionCount = coverage.unresolved.filter(
    (entry) => entry.code === "missing-source-projection",
  ).length;
  if (missingProjectionCount > 0) {
    blockers.push({
      code: "incomplete-defence-source-projection",
      message: "At least one source-bearing Compendium section is absent or malformed and cannot be treated as an empty build section.",
      evidence: `${missingProjectionCount} missing or malformed source projections`,
    });
  }
  return blockers;
}

function loadoutAt(build: any, index: number): any | null {
  const loadouts = build?.loadouts?.loadouts;
  return Array.isArray(loadouts) ? loadouts[index] ?? null : null;
}

function unavailable(...blockers: CalculationBlocker[]): UnavailablePlayerDefenseEvidence {
  return {
    status: "not-calculated",
    actor: "player",
    isTotalEhp: false,
    blockers,
  };
}

/**
 * Extracts exact SS13 player-survival source inputs.  The result deliberately
 * contains `sourceSums`, not character totals, and always leaves total EHP
 * unavailable.
 */
export function compileSs13PlayerDefenseEvidence(
  build: any,
  loadoutIndex = 0,
  options: PlayerDefenseCompileOptions = {},
): PlayerDefenseEvidenceResult {
  if (build?.patch !== "SS13") {
    return unavailable({
      code: "unsupported-patch",
      message: `Player-defence evidence is season-pinned to SS13 (received ${String(build?.patch ?? "no patch")}).`,
    });
  }
  const loadout = loadoutAt(build, loadoutIndex);
  if (!loadout) {
    return unavailable({
      code: "missing-loadout",
      message: `No loadout exists at index ${loadoutIndex}.`,
    });
  }
  const heroId = stringValue(loadout?.hero?.heroGuid ?? loadout?.hero?.heroId);
  if (!heroId) {
    return unavailable({
      code: "missing-hero-identity",
      message: "Player-scoped defence evidence requires a stable hero identity.",
    });
  }

  const catalog = catalogState(options);
  const coverage = initialCoverage(catalog.status);
  const loadoutPath = `loadouts.loadouts[${loadoutIndex}]`;
  recordMissingSourceProjections(loadout, coverage, loadoutPath);
  const lines = [
    ...gearLines(loadout, coverage, loadoutPath),
    ...heroMemoryLines(loadout, coverage, catalog, loadoutPath),
    ...divinityLines(loadout, coverage, catalog, loadoutPath),
    ...prismLines(loadout, coverage, catalog, loadoutPath),
    ...kismetLines(loadout, coverage, catalog, loadoutPath),
  ];
  blockedSourceCoverage(loadout, coverage, loadoutPath);

  const terms = guardedIrisDefenseTerms(loadout, coverage, loadoutPath);
  for (const line of lines) {
    coverage.sourceLines += 1;
    coverage.bySource[line.source.kind].lines += 1;
    if (!DEFENSIVE_VOCABULARY.test(line.text)) continue;
    coverage.defensiveLines += 1;
    coverage.bySource[line.source.kind].defensiveLines += 1;
    if (OFFENSIVE_CONTEXT.test(line.text)) {
      coverage.offensiveLinesExcluded += 1;
      continue;
    }
    if (MINION_CONTEXT.test(line.text) && !PLAYER_FROM_MINION_CONTEXT.test(line.text)) {
      coverage.minionOnlyLinesExcluded += 1;
      continue;
    }
    const parsed = parsePlayerTerms(line);
    if (!parsed.length) {
      coverage.unparsedDefensiveLines += 1;
      recordUnresolved(coverage, line.source.kind, {
        code: "unparsed-defensive-line",
        source: line.source.locator,
        message: "A player-scoped defensive-looking line is preserved but not assigned formula semantics.",
        evidence: line.text,
      });
      parsed.push({
        id: `${line.source.kind}:${line.source.locator}:unclassified-defense:0`,
        actor: "player",
        stat: "unclassified-defense",
        operation: "source-only",
        value: null,
        unit: "text",
        scope: line.forcedScope ?? (conditionFor(line.text) ? "player-conditional" : "player-global"),
        condition: conditionFor(line.text),
        benefit: "unclassified",
        text: line.text,
        source: line.source,
        provenance: line.provenance,
        includedInSourceSum: false,
        isTotalEhp: false,
      });
    }
    coverage.bySource[line.source.kind].terms += parsed.length;
    terms.push(...parsed);
  }

  const sums = sourceSums(terms);
  coverage.playerScopedTerms = terms.length;
  coverage.unconditionalSourceSumTerms = terms.filter((term) => term.includedInSourceSum).length;
  const finalCoverage: PlayerDefenseCoverage = {
    method: "known-defensive-vocabulary",
    ...coverage,
  };
  const provenance = uniqueProvenance(terms.flatMap((term) => term.provenance));

  return {
    status: "source-terms",
    patch: "SS13",
    actor: "player",
    heroId,
    loadoutIndex,
    loadoutName: String(loadout?.name ?? `Loadout ${loadoutIndex + 1}`),
    isTotalEhp: false,
    terms,
    sourceSums: sums,
    coverage: finalCoverage,
    playerEhp: {
      status: "not-calculated",
      blockers: commonEhpBlockers(finalCoverage),
    },
    provenance,
    warning: "These are exact observed modifier inputs and guarded source sums, not final character defences or EHP.",
  };
}

function termFingerprint(term: PlayerDefenseTerm): string {
  return JSON.stringify({
    stat: term.stat,
    operation: term.operation,
    value: term.value,
    candidateValues: term.candidateValues,
    unit: term.unit,
    scope: term.scope,
    condition: term.condition,
    text: term.text,
    sourceKind: term.source.kind,
  });
}

function multisetDifference(
  left: PlayerDefenseTerm[],
  right: PlayerDefenseTerm[],
): PlayerDefenseTerm[] {
  const counts = new Map<string, number>();
  for (const term of right) {
    const key = termFingerprint(term);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return left.filter((term) => {
    const key = termFingerprint(term);
    const count = counts.get(key) ?? 0;
    if (count === 0) return true;
    counts.set(key, count - 1);
    return false;
  });
}

/**
 * Compares exact source inputs.  Numeric direction is intentionally not
 * labelled as an EHP gain/loss: caps, local defence ordering, conditions, and
 * damage scenarios can reverse or nullify naive rankings.
 */
export function compareSs13PlayerDefenseEvidence(
  build: any,
  beforeIndex: number,
  afterIndex: number,
  options: PlayerDefenseCompileOptions = {},
): PlayerDefenseEvidenceComparisonResult {
  const before = compileSs13PlayerDefenseEvidence(build, beforeIndex, options);
  const after = compileSs13PlayerDefenseEvidence(build, afterIndex, options);
  if (before.status !== "source-terms" || after.status !== "source-terms") {
    return {
      status: "not-calculated",
      actor: "player",
      isTotalEhp: false,
      blockers: [
        ...(before.status === "not-calculated"
          ? before.blockers.map((blocker) => ({
              ...blocker,
              message: `Before loadout: ${blocker.message}`,
            }))
          : []),
        ...(after.status === "not-calculated"
          ? after.blockers.map((blocker) => ({
              ...blocker,
              message: `After loadout: ${blocker.message}`,
            }))
          : []),
      ],
    };
  }
  const projectionBlockers = [
    ...before.coverage.unresolved
      .filter((entry) => entry.code === "missing-source-projection")
      .map((entry): CalculationBlocker => ({
        code: "incomplete-defence-source-projection",
        message: `Before loadout: ${entry.message}`,
        evidence: entry.source,
      })),
    ...after.coverage.unresolved
      .filter((entry) => entry.code === "missing-source-projection")
      .map((entry): CalculationBlocker => ({
        code: "incomplete-defence-source-projection",
        message: `After loadout: ${entry.message}`,
        evidence: entry.source,
      })),
  ];
  if (projectionBlockers.length > 0) {
    return {
      status: "not-calculated",
      actor: "player",
      isTotalEhp: false,
      blockers: projectionBlockers,
    };
  }
  const left = new Map(before.sourceSums.map((sum) => [sum.key, sum]));
  const right = new Map(after.sourceSums.map((sum) => [sum.key, sum]));
  const sourceSumChanges: DefenseSourceSumChange[] = [];
  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const beforeValue = left.get(key)?.value ?? 0;
    const afterValue = right.get(key)?.value ?? 0;
    if (beforeValue === afterValue) continue;
    const exemplar = right.get(key) ?? left.get(key);
    if (!exemplar) continue;
    sourceSumChanges.push({
      key,
      stat: exemplar.stat,
      operation: exemplar.operation,
      scope: exemplar.scope,
      sourceEntityId: exemplar.sourceEntityId,
      sourceLabel: exemplar.sourceLabel,
      unit: exemplar.unit,
      before: beforeValue,
      after: afterValue,
      delta: afterValue - beforeValue,
      numericDirection: afterValue > beforeValue ? "increase" : "decrease",
      isEhpDelta: false,
    });
  }
  sourceSumChanges.sort((a, b) => a.key.localeCompare(b.key));

  return {
    status: "source-terms",
    actor: "player",
    isTotalEhp: false,
    beforeIndex,
    afterIndex,
    sourceSumChanges,
    removedTerms: multisetDifference(before.terms, after.terms),
    addedTerms: multisetDifference(after.terms, before.terms),
    provenance: uniqueProvenance([...before.provenance, ...after.provenance]),
    warning: "Changes are observed source-input deltas, not EHP deltas or upgrade recommendations.",
  };
}
