/*
 * Component-scoped, fail-closed factor evidence for Bing build comparisons.
 *
 * This module intentionally does not calculate DPS, total hit damage, or
 * target hits. It compares a small set of season-pinned, source-complete
 * factors and builds explicitly partial selected-factor scenarios. Emitted
 * projectiles are reported beside hit factors and are never multiplied into
 * them because emitted projectiles are not landed target hits.
 */

import {
  compileBingIntrinsicEnvelope,
  type BingIntrinsicEnvelope,
} from "./bingIntrinsic.js";
import {
  BING_BLAST_NOVA_ID,
  HAMMER_OF_ASH_ID,
  type CalculationBlocker,
  type FormulaProvenance,
} from "./guardedCompiler.js";
import {
  compileSs13BingSupportEvidence,
  type MainSkillSupportEvidenceResult,
  type SupportEffectTerm,
  type SupportSourceTerms,
} from "./supportEvidence.js";

export const SIERRA_STATIONARY_ATTACK_AFFIX_ID =
  "eb8e123a-88be-51ca-bba7-4f2d23a523a7";
export const SLOW_PROJECTILE_SUPPORT_ID =
  "56c49853-7d67-5a43-bfe7-0cfe5c7e3d84";
export const UPHEAVAL_MAGNIFICENT_SUPPORT_ID =
  "4ba9d077-d4f6-5a60-bd8e-423319a27f97";

export const SS13_SIERRA_STATIONARY_SOURCE: FormulaProvenance = {
  source: "https://tlicompendium.com/data-bundles/SS13-gear-en.json",
  locator:
    "gear/two_handed/two-handed_hammer/i18n/en.craftSuffix.eb8e123a-88be-51ca-bba7-4f2d23a523a7",
  sha256: "2a800a28c00efce144bc2da24f1efcfc944a58bc2896767c500b158f363f0b66",
  confidence: "source-data",
};

export const BING_FACTOR_LEDGER_RULE_SOURCE: FormulaProvenance = {
  source: "rehan_guide/docs/mechanics.md",
  locator: "#guarded-bing-factor-ledger",
  confidence: "confirmed-mechanic",
};

export type BingFactorId =
  | "weapon-foundation"
  | "stationary-attack-damage"
  | "slow-projectile-additional-damage"
  | "upheaval-explosion-hit-damage"
  | "source-visible-emissions";

export type BingFactorValueKind =
  | "average-weapon-sourced-hit"
  | "multiplier"
  | "emitted-projectiles-per-throw";

export interface BingNonComposedEffect {
  id: string;
  label: string;
  value: number;
  unit: "percent";
  scope: string;
  condition: string | null;
  reason: string;
  sourcePath: string;
}

export interface CalculatedBingFactorTerm {
  status: "calculated-partial";
  factorId: BingFactorId;
  label: string;
  scope: string;
  condition: string | null;
  inputValue: number;
  inputKind: BingFactorValueKind;
  rawPercent: number | null;
  sourcePaths: string[];
  nonComposedEffects: BingNonComposedEffect[];
  provenance: FormulaProvenance[];
  isDps: false;
  isTotalHit: false;
  isTargetHits: false;
}

export interface UnavailableBingFactorTerm {
  status: "not-calculated";
  factorId: BingFactorId;
  label: string;
  scope: string;
  condition: string | null;
  blockers: CalculationBlocker[];
  isDps: false;
  isTotalHit: false;
  isTargetHits: false;
}

export type BingFactorTerm =
  | CalculatedBingFactorTerm
  | UnavailableBingFactorTerm;

export interface BingFactorTerms {
  weaponFoundation: CalculatedBingFactorTerm;
  stationaryAttackDamage: BingFactorTerm;
  slowProjectileAdditionalDamage: BingFactorTerm;
  upheavalExplosionHitDamage: BingFactorTerm;
  sourceVisibleEmissions: BingFactorTerm;
}

export interface BingFactorLedger {
  status: "calculated-partial";
  kind: "bing-factor-ledger";
  patch: "SS13";
  heroId: typeof BING_BLAST_NOVA_ID;
  skillId: typeof HAMMER_OF_ASH_ID;
  loadoutIndex: number;
  loadoutName: string;
  terms: BingFactorTerms;
  provenance: FormulaProvenance[];
  excludedFromComposition: string[];
  warning: string;
  isDps: false;
  isTotalHit: false;
  isTargetHits: false;
}

export interface UnavailableBingFactorLedger {
  status: "not-calculated";
  kind: "bing-factor-ledger";
  blockers: CalculationBlocker[];
  isDps: false;
  isTotalHit: false;
  isTargetHits: false;
}

export type BingFactorLedgerResult =
  | BingFactorLedger
  | UnavailableBingFactorLedger;

export type BingFactorDirection = "gain" | "loss" | "unchanged";

export interface CalculatedBingFactorChange {
  status: "calculated-partial";
  factorId: BingFactorId;
  label: string;
  scope: string;
  condition: string | null;
  inputKind: BingFactorValueKind;
  beforeValue: number;
  afterValue: number;
  ratio: number;
  deltaPct: number;
  direction: BingFactorDirection;
  before: CalculatedBingFactorTerm;
  after: CalculatedBingFactorTerm;
  isDps: false;
  isTotalHit: false;
  isTargetHits: false;
}

export interface UnavailableBingFactorChange {
  status: "not-calculated";
  factorId: BingFactorId;
  label: string;
  scope: string;
  condition: string | null;
  blockers: CalculationBlocker[];
  isDps: false;
  isTotalHit: false;
  isTargetHits: false;
}

export type BingFactorChange =
  | CalculatedBingFactorChange
  | UnavailableBingFactorChange;

export interface BingFactorChanges {
  weaponFoundation: BingFactorChange;
  stationaryAttackDamage: BingFactorChange;
  slowProjectileAdditionalDamage: BingFactorChange;
  upheavalExplosionHitDamage: BingFactorChange;
  sourceVisibleEmissions: BingFactorChange;
}

export type BingSelectedHitScenarioId =
  | "ordinary-not-stationary"
  | "explosion-not-stationary"
  | "ordinary-stationary"
  | "explosion-stationary";

export interface BingScenarioFactorRatio {
  factorId: Exclude<BingFactorId, "source-visible-emissions">;
  label: string;
  ratio: number;
}

export interface CalculatedBingSelectedHitScenario {
  status: "calculated-partial";
  scenarioId: BingSelectedHitScenarioId;
  label: string;
  component: "ordinary-hit" | "projectile-explosion-hit";
  condition: "not stationary" | "stationary for at least 0.1s";
  scope: "selected source-complete changing hit factors only";
  factors: BingScenarioFactorRatio[];
  ratio: number;
  deltaPct: number;
  direction: BingFactorDirection;
  warning: string;
  isDps: false;
  isTotalHit: false;
  isTargetHits: false;
}

export interface UnavailableBingSelectedHitScenario {
  status: "not-calculated";
  scenarioId: BingSelectedHitScenarioId;
  label: string;
  component: "ordinary-hit" | "projectile-explosion-hit";
  condition: "not stationary" | "stationary for at least 0.1s";
  scope: "selected source-complete changing hit factors only";
  blockers: CalculationBlocker[];
  isDps: false;
  isTotalHit: false;
  isTargetHits: false;
}

export type BingSelectedHitScenario =
  | CalculatedBingSelectedHitScenario
  | UnavailableBingSelectedHitScenario;

export interface BingFactorLedgerComparison {
  status: "calculated-partial";
  kind: "bing-factor-ledger-comparison";
  before: BingFactorLedger;
  after: BingFactorLedger;
  factorChanges: BingFactorChanges;
  selectedHitScenarios: BingSelectedHitScenario[];
  provenance: FormulaProvenance[];
  excludedFromComposition: string[];
  warning: string;
  isDps: false;
  isTotalHit: false;
  isTargetHits: false;
}

export interface UnavailableBingFactorLedgerComparison {
  status: "not-calculated";
  kind: "bing-factor-ledger-comparison";
  blockers: CalculationBlocker[];
  isDps: false;
  isTotalHit: false;
  isTargetHits: false;
}

export type BingFactorLedgerComparisonResult =
  | BingFactorLedgerComparison
  | UnavailableBingFactorLedgerComparison;

interface FactorSpec {
  factorId: BingFactorId;
  label: string;
  scope: string;
  condition: string | null;
}

const FACTOR_SPECS: Record<BingFactorId, FactorSpec> = {
  "weapon-foundation": {
    factorId: "weapon-foundation",
    label: "Weapon foundation",
    scope: "one weapon-sourced Hammer of Ash hit instance",
    condition: null,
  },
  "stationary-attack-damage": {
    factorId: "stationary-attack-damage",
    label: "Sierra stationary additional Attack Damage",
    scope: "all Attack hit components while the pinned suffix is active",
    condition: "after standing still for 0.1s",
  },
  "slow-projectile-additional-damage": {
    factorId: "slow-projectile-additional-damage",
    label: "Slow Projectile additional damage",
    scope: "hit components of the supported Hammer of Ash skill",
    condition: null,
  },
  "upheaval-explosion-hit-damage": {
    factorId: "upheaval-explosion-hit-damage",
    label: "Upheaval additional explosion Hit Damage",
    scope: "projectile explosion hits only",
    condition: null,
  },
  "source-visible-emissions": {
    factorId: "source-visible-emissions",
    label: "Source-visible emitted projectiles per throw",
    scope: "emissions before target landing, overlap, and Shotgun geometry",
    condition: null,
  },
};

const STATIONARY_TEMPLATE =
  "+#% additional Attack Damage after standing still for #.#s. -#% additional Attack Speed";

const STATIONARY_TIERS = new Map<string, { min: number; max: number }>([
  [SIERRA_STATIONARY_ATTACK_AFFIX_ID, { min: 143, max: 153 }],
  ["54e4f1e3-49d9-5023-b284-802351514f11", { min: 101, max: 124 }],
  ["9ac5afa8-cdbf-5b9e-909d-3e6763f8e37d", { min: 80, max: 100 }],
  ["374ffec9-165a-5794-978b-3f7ce4b60774", { min: 59, max: 79 }],
]);

function loadoutAt(build: any, loadoutIndex: number): any | null {
  const loadouts = build?.loadouts?.loadouts;
  return Array.isArray(loadouts) ? loadouts[loadoutIndex] ?? null : null;
}

function uniqueProvenance(values: FormulaProvenance[]): FormulaProvenance[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = [
      value.source,
      value.locator,
      value.sha256 ?? "",
      value.confidence ?? "",
    ].join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unavailableTerm(
  spec: FactorSpec,
  ...blockers: CalculationBlocker[]
): UnavailableBingFactorTerm {
  return {
    status: "not-calculated",
    ...spec,
    blockers,
    isDps: false,
    isTotalHit: false,
    isTargetHits: false,
  };
}

function importedSource(path: string): FormulaProvenance {
  return {
    source: "imported Compendium/tli_dump loadout",
    locator: path,
    confidence: "source-data",
  };
}

function percentMultiplier(value: number): number {
  return Number((1 + value / 100).toFixed(12));
}

function exactRoll(
  roll: any,
  expected: {
    min: number;
    max: number;
    sign?: "+" | "-";
    unit?: "%";
    exactValue?: number;
  },
): number | null {
  if (!roll || typeof roll !== "object" || Array.isArray(roll)) return null;
  const value = roll.value;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (roll.minValue !== expected.min || roll.maxValue !== expected.max) return null;
  if (expected.sign !== undefined && roll.sign !== expected.sign) return null;
  if (expected.unit !== undefined && roll.unit !== expected.unit) return null;
  if (expected.exactValue !== undefined && value !== expected.exactValue) return null;
  if (value < expected.min || value > expected.max) return null;
  return value;
}

function stationaryAttackTerm(
  build: any,
  loadoutIndex: number,
): BingFactorTerm {
  const spec = FACTOR_SPECS["stationary-attack-damage"];
  const loadout = loadoutAt(build, loadoutIndex);
  if (!loadout) {
    return unavailableTerm(spec, {
      code: "missing-loadout",
      message: `No loadout exists at index ${loadoutIndex}.`,
    });
  }
  const inventory = loadout?.gear?.inventory;
  const mainHandId = loadout?.gear?.equipped?.mainHand;
  if (!Array.isArray(inventory) || typeof mainHandId !== "string") {
    return unavailableTerm(spec, {
      code: "missing-stationary-affix-projection",
      message: "The equipped gear inventory/main-hand projection is required to audit Sierra's stationary suffix.",
    });
  }
  const mainHandClaims = inventory
    .map((item: any, inventoryIndex: number) => ({ item, inventoryIndex }))
    .filter(({ item }) => item?.id === mainHandId);
  if (mainHandClaims.length !== 1) {
    return unavailableTerm(spec, {
      code: mainHandClaims.length > 1
        ? "duplicate-stationary-main-hand"
        : "unresolved-stationary-main-hand",
      message: "Sierra's stationary suffix requires exactly one equipped main-hand record in gear.inventory.",
      evidence: `gear.equipped.mainHand=${mainHandId}; matching inventory records=${mainHandClaims.length}`,
    });
  }
  const [{ item: mainHand, inventoryIndex }] = mainHandClaims;
  const suffixes = mainHand?.suffixes;
  const suffixCollectionPath =
    `loadouts.loadouts[${loadoutIndex}].gear.inventory[${inventoryIndex}].suffixes`;
  if (!Array.isArray(suffixes)) {
    return unavailableTerm(spec, {
      code: "missing-stationary-suffix-projection",
      message: "An explicit suffix array is required to prove whether Sierra's stationary layer is installed.",
      evidence: suffixCollectionPath,
    });
  }
  const malformedIndex = suffixes.findIndex(
    (suffix: unknown) =>
      suffix === null || typeof suffix !== "object" || Array.isArray(suffix),
  );
  if (malformedIndex >= 0) {
    return unavailableTerm(spec, {
      code: "malformed-stationary-suffix-record",
      message: "The main-hand suffix projection contains a malformed record.",
      evidence: `${suffixCollectionPath}[${malformedIndex}]`,
    });
  }
  const claims = suffixes
    .map((suffix: any, suffixIndex: number) => ({ suffix, suffixIndex }))
    .filter(({ suffix }) => suffix.affixId === SIERRA_STATIONARY_ATTACK_AFFIX_ID);
  if (claims.length > 1) {
    return unavailableTerm(spec, {
      code: "duplicate-stationary-attack-affix",
      message: "Sierra's stationary Attack Damage affix appears more than once; duplicate source parents are rejected.",
      evidence: claims
        .map(({ suffixIndex }) => `${suffixCollectionPath}[${suffixIndex}]`)
        .join("; "),
    });
  }
  if (claims.length === 0) {
    return {
      status: "calculated-partial",
      ...spec,
      inputValue: 1,
      inputKind: "multiplier",
      rawPercent: 0,
      sourcePaths: [suffixCollectionPath],
      nonComposedEffects: [],
      provenance: uniqueProvenance([
        importedSource(suffixCollectionPath),
        SS13_SIERRA_STATIONARY_SOURCE,
        BING_FACTOR_LEDGER_RULE_SOURCE,
      ]),
      isDps: false,
      isTotalHit: false,
      isTargetHits: false,
    };
  }

  const [{ suffix, suffixIndex }] = claims;
  const sourcePath = `${suffixCollectionPath}[${suffixIndex}]`;
  const tier = typeof suffix.tierId === "string"
    ? STATIONARY_TIERS.get(suffix.tierId)
    : null;
  const rolls = suffix.rolledValues;
  if (suffix.modifierDescription !== STATIONARY_TEMPLATE
      || !tier
      || !Array.isArray(rolls)
      || rolls.length !== 3) {
    return unavailableTerm(spec, {
      code: "unsupported-stationary-attack-affix",
      message: "The stationary suffix no longer matches the pinned SS13 definition, tier table, and three-roll schema.",
      evidence: sourcePath,
    });
  }
  const attackDamagePct = exactRoll(rolls[0], {
    ...tier,
    sign: "+",
    unit: "%",
  });
  const standingSeconds = exactRoll(rolls[1], {
    min: 0.1,
    max: 0.1,
    exactValue: 0.1,
  });
  const attackSpeedPct = exactRoll(rolls[2], {
    min: 20,
    max: 20,
    sign: "-",
    unit: "%",
    exactValue: 20,
  });
  if (attackDamagePct === null
      || standingSeconds === null
      || attackSpeedPct === null) {
    return unavailableTerm(spec, {
      code: "unsupported-stationary-attack-roll",
      message: "The stationary suffix's imported values or bounds differ from its pinned SS13 tier.",
      evidence: sourcePath,
    });
  }

  return {
    status: "calculated-partial",
    ...spec,
    condition: `after standing still for ${standingSeconds}s`,
    inputValue: percentMultiplier(attackDamagePct),
    inputKind: "multiplier",
    rawPercent: attackDamagePct,
    sourcePaths: [sourcePath],
    nonComposedEffects: [{
      id: "stationary-additional-attack-speed",
      label: "additional Attack Speed",
      value: -attackSpeedPct,
      unit: "percent",
      scope: "attack cadence while the stationary suffix is active",
      condition: `after standing still for ${standingSeconds}s`,
      reason: "Actual throw cadence is unresolved, so this speed term is not composed with hit factors.",
      sourcePath,
    }],
    provenance: uniqueProvenance([
      importedSource(sourcePath),
      SS13_SIERRA_STATIONARY_SOURCE,
      BING_FACTOR_LEDGER_RULE_SOURCE,
    ]),
    isDps: false,
    isTotalHit: false,
    isTargetHits: false,
  };
}

interface SupportFactorSpec extends FactorSpec {
  supportId: string;
  effectId: string;
}

function supportSourcePath(support: SupportSourceTerms): string {
  return support.provenance.find((source) =>
    source.source === "imported Compendium/tli_dump loadout")?.locator
    ?? `support[id=${support.supportId}]`;
}

function nonComposedSupportEffects(
  support: SupportSourceTerms,
  selectedEffectId: string,
  sourcePath: string,
): BingNonComposedEffect[] {
  return support.effects
    .filter((effect) => effect.id !== selectedEffectId)
    .map((effect): BingNonComposedEffect => ({
      id: effect.id,
      label: effect.label,
      value: effect.value,
      unit: effect.unit,
      scope: effect.scope,
      condition: effect.condition,
      reason: effect.application === "additional-layer-input"
        ? "This source term is unchanged or outside this factor's component scope; it is not part of the selected changing-factor scenario."
        : "Cadence, geometry, and utility terms are reported but never composed into a hit-factor ratio.",
      sourcePath,
    }));
}

function supportFactorTerm(
  evidence: MainSkillSupportEvidenceResult,
  factor: SupportFactorSpec,
): BingFactorTerm {
  if (evidence.status !== "source-terms") {
    return unavailableTerm(factor, ...evidence.blockers);
  }
  const installedClaims = evidence.supports.filter(
    (support) => support.supportId === factor.supportId,
  );
  if (installedClaims.length > 1) {
    return unavailableTerm(factor, {
      code: "duplicate-pinned-support-factor",
      message:
        "The pinned support factor appears in more than one socket; stacking and installation legality are not assumed.",
      evidence: installedClaims.map((support) =>
        `${support.skillName} socket ${support.socketIndex + 1}`)
        .join(" · "),
    });
  }
  const [installed] = installedClaims;
  if (!installed) {
    const socketPath =
      `loadouts.loadouts[${evidence.loadoutIndex}].skills.activeSkills[Hammer of Ash].supports`;
    return {
      status: "calculated-partial",
      ...factor,
      inputValue: 1,
      inputKind: "multiplier",
      rawPercent: 0,
      sourcePaths: [socketPath],
      nonComposedEffects: [],
      provenance: uniqueProvenance([
        importedSource(socketPath),
        ...evidence.provenance,
        BING_FACTOR_LEDGER_RULE_SOURCE,
      ]),
      isDps: false,
      isTotalHit: false,
      isTargetHits: false,
    };
  }
  if (installed.status !== "source-terms") {
    return unavailableTerm(factor, ...installed.blockers);
  }
  const selected = installed.effects.filter(
    (effect: SupportEffectTerm) => effect.id === factor.effectId,
  );
  if (selected.length !== 1) {
    return unavailableTerm(factor, {
      code: "missing-pinned-support-effect",
      message: "The installed support no longer exposes exactly one pinned factor effect.",
      evidence: `${installed.supportName}:${factor.effectId}`,
    });
  }
  const [effect] = selected;
  const multiplier = percentMultiplier(effect.value);
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    return unavailableTerm(factor, {
      code: "invalid-pinned-support-factor",
      message: "The selected support effect does not produce a positive finite factor.",
      evidence: `${effect.value}%`,
    });
  }
  const sourcePath = supportSourcePath(installed);
  return {
    status: "calculated-partial",
    ...factor,
    condition: effect.condition,
    inputValue: multiplier,
    inputKind: "multiplier",
    rawPercent: effect.value,
    sourcePaths: [sourcePath],
    nonComposedEffects: nonComposedSupportEffects(
      installed,
      factor.effectId,
      sourcePath,
    ),
    provenance: uniqueProvenance([
      ...installed.provenance,
      BING_FACTOR_LEDGER_RULE_SOURCE,
    ]),
    isDps: false,
    isTotalHit: false,
    isTargetHits: false,
  };
}

function weaponFoundationTerm(
  envelope: BingIntrinsicEnvelope,
): CalculatedBingFactorTerm {
  const spec = FACTOR_SPECS["weapon-foundation"];
  return {
    status: "calculated-partial",
    ...spec,
    inputValue: envelope.normalWeaponSourcedPerHit.total.average,
    inputKind: "average-weapon-sourced-hit",
    rawPercent: null,
    sourcePaths: envelope.provenance
      .filter((source) =>
        source.source === "imported loadout"
        || source.source === "imported Compendium/tli_dump loadout")
      .map((source) => source.locator),
    nonComposedEffects: [],
    provenance: envelope.provenance,
    isDps: false,
    isTotalHit: false,
    isTargetHits: false,
  };
}

function emissionsTerm(envelope: BingIntrinsicEnvelope): BingFactorTerm {
  const spec = FACTOR_SPECS["source-visible-emissions"];
  if (envelope.topology.status !== "calculated-partial") {
    return unavailableTerm(spec, ...envelope.topology.blockers);
  }
  return {
    status: "calculated-partial",
    ...spec,
    inputValue: envelope.topology.expectedEmittedProjectilesPerThrow,
    inputKind: "emitted-projectiles-per-throw",
    rawPercent: null,
    sourcePaths: [
      ...envelope.topology.projectileQuantitySources.map(
        (source) => source.sourcePath,
      ),
      ...envelope.topology.heroTraitLevelSources.map(
        (source) => source.sourcePath,
      ),
    ],
    nonComposedEffects: [],
    provenance: envelope.provenance,
    isDps: false,
    isTotalHit: false,
    isTargetHits: false,
  };
}

export function compileBingFactorLedger(
  build: any,
  loadoutIndex = 0,
): BingFactorLedgerResult {
  const envelope = compileBingIntrinsicEnvelope(build, loadoutIndex);
  if (envelope.status !== "calculated-partial") {
    return {
      status: "not-calculated",
      kind: "bing-factor-ledger",
      blockers: envelope.blockers,
      isDps: false,
      isTotalHit: false,
      isTargetHits: false,
    };
  }
  const supportEvidence = compileSs13BingSupportEvidence(build, loadoutIndex);
  const stationary = stationaryAttackTerm(build, loadoutIndex);
  const slow = supportFactorTerm(supportEvidence, {
    ...FACTOR_SPECS["slow-projectile-additional-damage"],
    supportId: SLOW_PROJECTILE_SUPPORT_ID,
    effectId: "additional-damage",
  });
  const upheaval = supportFactorTerm(supportEvidence, {
    ...FACTOR_SPECS["upheaval-explosion-hit-damage"],
    supportId: UPHEAVAL_MAGNIFICENT_SUPPORT_ID,
    effectId: "additional-explosion-hit-damage",
  });
  const terms: BingFactorTerms = {
    weaponFoundation: weaponFoundationTerm(envelope),
    stationaryAttackDamage: stationary,
    slowProjectileAdditionalDamage: slow,
    upheavalExplosionHitDamage: upheaval,
    sourceVisibleEmissions: emissionsTerm(envelope),
  };
  const termProvenance = Object.values(terms).flatMap(
    (term) => term.status === "calculated-partial" ? term.provenance : [],
  );

  return {
    status: "calculated-partial",
    kind: "bing-factor-ledger",
    patch: "SS13",
    heroId: BING_BLAST_NOVA_ID,
    skillId: HAMMER_OF_ASH_ID,
    loadoutIndex,
    loadoutName: envelope.loadoutName,
    terms,
    provenance: uniqueProvenance([
      ...envelope.provenance,
      ...termProvenance,
      BING_FACTOR_LEDGER_RULE_SOURCE,
    ]),
    excludedFromComposition: [
      "source-visible emissions are not landed target hits and never multiply hit-factor scenarios",
      "actual attack/throw cadence, including Sierra's -20% additional Attack Speed",
      "projectile speed/size, area, target geometry, overlap, and Shotgun application",
      "all uncompiled or unchanged support, gear, talent, trait, memory, slate, pactspirit, kismet, buff, curse, and enemy-state terms",
      "critical strikes, mitigation, penetration, Deterioration, and other damage over time",
      "Demolisher empowered share and any total blend of ordinary versus empowered hits",
    ],
    warning: "This ledger contains component-scoped source factors and emissions evidence; it is not total hit damage, target hits, or DPS.",
    isDps: false,
    isTotalHit: false,
    isTargetHits: false,
  };
}

function direction(ratio: number): BingFactorDirection {
  if (Math.abs(ratio - 1) < 1e-12) return "unchanged";
  return ratio > 1 ? "gain" : "loss";
}

function prefixedBlockers(
  side: "Before" | "After",
  blockers: CalculationBlocker[],
): CalculationBlocker[] {
  return blockers.map((blocker) => ({
    ...blocker,
    message: `${side} loadout: ${blocker.message}`,
  }));
}

function compareFactorTerms(
  before: BingFactorTerm,
  after: BingFactorTerm,
): BingFactorChange {
  const spec = FACTOR_SPECS[before.factorId];
  if (before.factorId !== after.factorId) {
    return {
      status: "not-calculated",
      ...spec,
      blockers: [{
        code: "mismatched-factor-identity",
        message: "The before/after factor identities differ.",
        evidence: `${before.factorId} -> ${after.factorId}`,
      }],
      isDps: false,
      isTotalHit: false,
      isTargetHits: false,
    };
  }
  if (before.status !== "calculated-partial"
      || after.status !== "calculated-partial") {
    return {
      status: "not-calculated",
      ...spec,
      blockers: [
        ...(before.status === "not-calculated"
          ? prefixedBlockers("Before", before.blockers)
          : []),
        ...(after.status === "not-calculated"
          ? prefixedBlockers("After", after.blockers)
          : []),
      ],
      isDps: false,
      isTotalHit: false,
      isTargetHits: false,
    };
  }
  if (before.inputKind !== after.inputKind
      || !Number.isFinite(before.inputValue)
      || !Number.isFinite(after.inputValue)
      || before.inputValue <= 0
      || after.inputValue <= 0) {
    return {
      status: "not-calculated",
      ...spec,
      blockers: [{
        code: "invalid-factor-ratio-input",
        message: "A factor ratio requires matching input kinds and positive finite before/after values.",
        evidence: `${before.inputKind}:${before.inputValue} -> ${after.inputKind}:${after.inputValue}`,
      }],
      isDps: false,
      isTotalHit: false,
      isTargetHits: false,
    };
  }
  const ratio = after.inputValue / before.inputValue;
  return {
    status: "calculated-partial",
    ...spec,
    inputKind: before.inputKind,
    beforeValue: before.inputValue,
    afterValue: after.inputValue,
    ratio,
    deltaPct: (ratio - 1) * 100,
    direction: direction(ratio),
    before,
    after,
    isDps: false,
    isTotalHit: false,
    isTargetHits: false,
  };
}

interface ScenarioSpec {
  scenarioId: BingSelectedHitScenarioId;
  label: string;
  component: "ordinary-hit" | "projectile-explosion-hit";
  condition: "not stationary" | "stationary for at least 0.1s";
  factorKeys: Array<
    Exclude<keyof BingFactorChanges, "sourceVisibleEmissions">
  >;
}

const SCENARIOS: ScenarioSpec[] = [
  {
    scenarioId: "ordinary-not-stationary",
    label: "Ordinary hit, not stationary",
    component: "ordinary-hit",
    condition: "not stationary",
    factorKeys: [
      "weaponFoundation",
      "slowProjectileAdditionalDamage",
    ],
  },
  {
    scenarioId: "explosion-not-stationary",
    label: "Projectile explosion hit, not stationary",
    component: "projectile-explosion-hit",
    condition: "not stationary",
    factorKeys: [
      "weaponFoundation",
      "slowProjectileAdditionalDamage",
      "upheavalExplosionHitDamage",
    ],
  },
  {
    scenarioId: "ordinary-stationary",
    label: "Ordinary hit after standing still",
    component: "ordinary-hit",
    condition: "stationary for at least 0.1s",
    factorKeys: [
      "weaponFoundation",
      "stationaryAttackDamage",
      "slowProjectileAdditionalDamage",
    ],
  },
  {
    scenarioId: "explosion-stationary",
    label: "Projectile explosion hit after standing still",
    component: "projectile-explosion-hit",
    condition: "stationary for at least 0.1s",
    factorKeys: [
      "weaponFoundation",
      "stationaryAttackDamage",
      "slowProjectileAdditionalDamage",
      "upheavalExplosionHitDamage",
    ],
  },
];

function scenario(
  spec: ScenarioSpec,
  changes: BingFactorChanges,
): BingSelectedHitScenario {
  const selected = spec.factorKeys.map((key) => changes[key]);
  const unavailable = selected.filter(
    (change): change is UnavailableBingFactorChange =>
      change.status === "not-calculated",
  );
  if (unavailable.length > 0) {
    return {
      status: "not-calculated",
      scenarioId: spec.scenarioId,
      label: spec.label,
      component: spec.component,
      condition: spec.condition,
      scope: "selected source-complete changing hit factors only",
      blockers: unavailable.flatMap((change) => change.blockers),
      isDps: false,
      isTotalHit: false,
      isTargetHits: false,
    };
  }
  const calculated = selected as CalculatedBingFactorChange[];
  const ratio = calculated.reduce((product, change) => product * change.ratio, 1);
  return {
    status: "calculated-partial",
    scenarioId: spec.scenarioId,
    label: spec.label,
    component: spec.component,
    condition: spec.condition,
    scope: "selected source-complete changing hit factors only",
    factors: calculated.map((change) => ({
      factorId: change.factorId as Exclude<BingFactorId, "source-visible-emissions">,
      label: change.label,
      ratio: change.ratio,
    })),
    ratio,
    deltaPct: (ratio - 1) * 100,
    direction: direction(ratio),
    warning: "This is a product of the listed changing hit factors only; unchanged and uncompiled factors are not a total-hit prediction.",
    isDps: false,
    isTotalHit: false,
    isTargetHits: false,
  };
}

/**
 * Compares two already-compiled per-loadout ledgers.
 *
 * Importers can compile each loadout exactly once, store that O(n) evidence,
 * and defer direction-sensitive pair selection to the page. No raw parent
 * build is required at comparison time.
 */
export function compareBingFactorLedgerResults(
  before: BingFactorLedgerResult,
  after: BingFactorLedgerResult,
): BingFactorLedgerComparisonResult {
  if (before.status !== "calculated-partial"
      || after.status !== "calculated-partial") {
    return {
      status: "not-calculated",
      kind: "bing-factor-ledger-comparison",
      blockers: [
        ...(before.status === "not-calculated"
          ? prefixedBlockers("Before", before.blockers)
          : []),
        ...(after.status === "not-calculated"
          ? prefixedBlockers("After", after.blockers)
          : []),
      ],
      isDps: false,
      isTotalHit: false,
      isTargetHits: false,
    };
  }
  const factorChanges: BingFactorChanges = {
    weaponFoundation: compareFactorTerms(
      before.terms.weaponFoundation,
      after.terms.weaponFoundation,
    ),
    stationaryAttackDamage: compareFactorTerms(
      before.terms.stationaryAttackDamage,
      after.terms.stationaryAttackDamage,
    ),
    slowProjectileAdditionalDamage: compareFactorTerms(
      before.terms.slowProjectileAdditionalDamage,
      after.terms.slowProjectileAdditionalDamage,
    ),
    upheavalExplosionHitDamage: compareFactorTerms(
      before.terms.upheavalExplosionHitDamage,
      after.terms.upheavalExplosionHitDamage,
    ),
    sourceVisibleEmissions: compareFactorTerms(
      before.terms.sourceVisibleEmissions,
      after.terms.sourceVisibleEmissions,
    ),
  };

  return {
    status: "calculated-partial",
    kind: "bing-factor-ledger-comparison",
    before,
    after,
    factorChanges,
    selectedHitScenarios: SCENARIOS.map((spec) =>
      scenario(spec, factorChanges)),
    provenance: uniqueProvenance([
      ...before.provenance,
      ...after.provenance,
      BING_FACTOR_LEDGER_RULE_SOURCE,
    ]),
    excludedFromComposition: [
      ...new Set([
        ...before.excludedFromComposition,
        ...after.excludedFromComposition,
      ]),
    ],
    warning: "Factor deltas explain selected component inputs only. Emissions stay separate and no value in this payload is DPS, total hit damage, or target hits.",
    isDps: false,
    isTotalHit: false,
    isTargetHits: false,
  };
}

/**
 * Convenience boundary for callers that still hold one raw build document.
 * New importer integrations should store `compileBingFactorLedger` once per
 * loadout and call `compareBingFactorLedgerResults` after selection.
 */
export function compareBingFactorLedgers(
  build: any,
  beforeIndex: number,
  afterIndex: number,
): BingFactorLedgerComparisonResult {
  return compareBingFactorLedgerResults(
    compileBingFactorLedger(build, beforeIndex),
    compileBingFactorLedger(build, afterIndex),
  );
}
