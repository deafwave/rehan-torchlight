import {
  compareSs13PlayerDefenseEvidence,
  compileSs13PlayerDefenseEvidence,
  type DefenseSourceKind,
  type PlayerDefenseCompileOptions,
  type PlayerDefenseEvidence,
  type PlayerDefenseTerm,
} from "@rehan/dmg/playerDefenseEvidence";

/*
 * Self-contained page boundary for the guarded player-defence compiler.
 *
 * No exported type in this module depends on analysis-types.ts or on a dmg
 * package type.  The literal false guards are deliberately repeated on display
 * payloads so a UI cannot silently relabel source-input evidence as EHP.
 */

export type PlayerDefenseDisplayStatus = "source-terms" | "not-calculated";

export type PlayerDefenseDisplaySourceKind =
  | "gear"
  | "vorax"
  | "hero-trait"
  | "hero-memory"
  | "divinity-slate"
  | "ethereal-prism"
  | "kismet"
  | "skill-support";

export type PlayerDefenseDisplayStat =
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

export type PlayerDefenseDisplayOperation =
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

export type PlayerDefenseDisplayScope =
  | "player-global"
  | "local-gear"
  | "player-conditional"
  | "area-talent";

export type PlayerDefenseDisplayBenefit =
  | "beneficial"
  | "harmful"
  | "context-dependent"
  | "unclassified";

export interface PlayerDefenseDisplayProvenance {
  source: string;
  locator: string;
  sha256?: string;
  confidence?: "source-data" | "confirmed-mechanic" | "inferred-mechanic";
}

export interface PlayerDefenseDisplayBlocker {
  code: string;
  message: string;
  evidence: string | null;
}

export interface PlayerDefenseDisplaySource {
  kind: PlayerDefenseDisplaySourceKind;
  kindLabel: string;
  locator: string;
  entityId: string | null;
  modifierId: string | null;
  label: string | null;
}

export interface PlayerDefenseDisplayTerm {
  id: string;
  actor: "player";
  stat: PlayerDefenseDisplayStat;
  statLabel: string;
  operation: PlayerDefenseDisplayOperation;
  operationLabel: string;
  value: number | null;
  candidateValues: number[];
  unit: "flat" | "percent" | "boolean" | "text";
  display: string;
  scope: PlayerDefenseDisplayScope;
  scopeLabel: string;
  condition: string | null;
  benefit: PlayerDefenseDisplayBenefit;
  benefitLabel: string;
  text: string;
  source: PlayerDefenseDisplaySource;
  provenance: PlayerDefenseDisplayProvenance[];
  includedInSourceSum: boolean;
  isTotalEhp: false;
}

export interface PlayerDefenseDisplaySourceSum {
  key: string;
  stat: PlayerDefenseDisplayStat;
  statLabel: string;
  operation: PlayerDefenseDisplayOperation;
  operationLabel: string;
  scope: "player-global" | "local-gear";
  scopeLabel: string;
  sourceEntityId: string | null;
  sourceLabel: string | null;
  unit: "flat" | "percent";
  value: number;
  display: string;
  termIds: string[];
  isCharacterTotal: false;
  isEhp: false;
}

export interface PlayerDefenseDisplayCatalogCoverage {
  status: "matched-ss13" | "missing" | "unsupported";
  requiredReferences: number;
  resolvedReferences: number;
  missingReferences: number;
  missingEffectDefinitions: number;
  display: string;
}

export interface PlayerDefenseDisplaySourceCoverage {
  kind: PlayerDefenseDisplaySourceKind;
  label: string;
  lines: number;
  defensiveLines: number;
  terms: number;
  unresolved: number;
}

export interface PlayerDefenseDisplayUnresolved {
  code: string;
  source: string;
  message: string;
  evidence: string | null;
}

export interface PlayerDefenseDisplayCoverage {
  method: "known-defensive-vocabulary";
  summary: string;
  equippedGearItems: number;
  placedDivinitySlates: number;
  equippedHeroMemories: number;
  installedPactspirits: number;
  allocatedPactNodes: number;
  allocatedTalentNodes: number;
  selectedHeroTraits: number;
  sourceLines: number;
  defensiveLines: number;
  playerScopedTerms: number;
  unconditionalSourceSumTerms: number;
  minionOnlyLinesExcluded: number;
  offensiveLinesExcluded: number;
  unparsedDefensiveLines: number;
  catalog: PlayerDefenseDisplayCatalogCoverage;
  sources: PlayerDefenseDisplaySourceCoverage[];
  unresolved: PlayerDefenseDisplayUnresolved[];
}

export interface PlayerDefenseDisplayGuards {
  isTotalEhp: false;
  sourceSumsAreCharacterTotals: false;
  comparisonValuesAreEhpDeltas: false;
  recommendationReady: false;
}

export interface PlayerDefenseDisplayEvidence {
  status: "source-terms";
  patch: "SS13";
  actor: "player";
  heroId: string;
  loadoutIndex: number;
  loadoutName: string;
  terms: PlayerDefenseDisplayTerm[];
  sourceSums: PlayerDefenseDisplaySourceSum[];
  coverage: PlayerDefenseDisplayCoverage;
  playerEhp: {
    status: "not-calculated";
    blockers: PlayerDefenseDisplayBlocker[];
  };
  provenance: PlayerDefenseDisplayProvenance[];
  guards: PlayerDefenseDisplayGuards;
  warning: string;
  isTotalEhp: false;
}

export interface UnavailablePlayerDefenseDisplayEvidence {
  status: "not-calculated";
  actor: "player";
  terms: [];
  sourceSums: [];
  blockers: PlayerDefenseDisplayBlocker[];
  guards: PlayerDefenseDisplayGuards;
  isTotalEhp: false;
}

export type PlayerDefenseDisplayEvidenceResult =
  | PlayerDefenseDisplayEvidence
  | UnavailablePlayerDefenseDisplayEvidence;

export interface PlayerDefenseDisplaySourceSumChange {
  key: string;
  stat: PlayerDefenseDisplayStat;
  statLabel: string;
  operation: PlayerDefenseDisplayOperation;
  operationLabel: string;
  scope: "player-global" | "local-gear";
  scopeLabel: string;
  sourceEntityId: string | null;
  sourceLabel: string | null;
  unit: "flat" | "percent";
  before: number;
  beforeDisplay: string;
  after: number;
  afterDisplay: string;
  delta: number;
  deltaDisplay: string;
  numericDirection: "increase" | "decrease";
  isEhpDelta: false;
}

export interface PlayerDefenseDisplayComparison {
  status: "source-terms";
  actor: "player";
  beforeIndex: number;
  afterIndex: number;
  sourceSumChanges: PlayerDefenseDisplaySourceSumChange[];
  removedTerms: PlayerDefenseDisplayTerm[];
  addedTerms: PlayerDefenseDisplayTerm[];
  provenance: PlayerDefenseDisplayProvenance[];
  guards: PlayerDefenseDisplayGuards;
  warning: string;
  isTotalEhp: false;
}

export interface UnavailablePlayerDefenseDisplayComparison {
  status: "not-calculated";
  actor: "player";
  blockers: PlayerDefenseDisplayBlocker[];
  guards: PlayerDefenseDisplayGuards;
  isTotalEhp: false;
}

export type PlayerDefenseDisplayComparisonResult =
  | PlayerDefenseDisplayComparison
  | UnavailablePlayerDefenseDisplayComparison;

export interface PlayerDefenseDisplayOptions {
  /** Parsed poorchlight compendium-catalog-ss13.json. */
  catalog?: unknown;
  /** Hash of the exact serialized catalog supplied above, when known. */
  catalogSha256?: string;
}

const SOURCE_ORDER: PlayerDefenseDisplaySourceKind[] = [
  "gear",
  "vorax",
  "hero-trait",
  "hero-memory",
  "divinity-slate",
  "ethereal-prism",
  "kismet",
  "skill-support",
];

const SOURCE_LABELS: Record<PlayerDefenseDisplaySourceKind, string> = {
  gear: "Gear",
  vorax: "Vorax gear",
  "hero-trait": "Hero trait",
  "hero-memory": "Hero memory",
  "divinity-slate": "Divinity slate",
  "ethereal-prism": "Ethereal prism",
  kismet: "Kismet",
  "skill-support": "Skill support",
};

const STAT_LABELS: Record<PlayerDefenseDisplayStat, string> = {
  "max-life": "Max Life",
  "max-energy-shield": "Max Energy Shield",
  armor: "Armor",
  evasion: "Evasion",
  "fire-resistance": "Fire Resistance",
  "cold-resistance": "Cold Resistance",
  "lightning-resistance": "Lightning Resistance",
  "erosion-resistance": "Erosion Resistance",
  "elemental-resistance": "Elemental Resistance",
  "all-resistance": "All Resistance",
  "attack-block-chance": "Attack Block Chance",
  "spell-block-chance": "Spell Block Chance",
  "block-ratio": "Block Ratio",
  "injury-buffer": "Injury Buffer",
  "armor-effective-rate-non-physical": "Armor Effective Rate for Non-Physical Damage",
  "critical-strike-damage-mitigation": "Critical Strike Damage Mitigation",
  "additional-damage-taken": "Additional Damage Taken",
  "nearby-enemy-additional-damage": "Nearby Enemy Additional Damage",
  "damage-transfer-to-minion": "Damage Transferred to Minions",
  "physical-damage-taken-conversion": "Physical Damage Taken Conversion",
  "life-regain": "Life Regain",
  "energy-shield-regain": "Energy Shield Regain",
  "life-regeneration-speed": "Life Regeneration Speed",
  "energy-shield-charge-speed": "Energy Shield Charge Speed",
  "energy-shield-charge-interval": "Energy Shield Charge Interval",
  "minion-regain-share-to-player": "Minion Regain Shared to Player",
  "tenacity-blessing-generation": "Tenacity Blessing Generation",
  "barrier-shield": "Barrier Shield",
  "barrier-gain-chance": "Barrier Gain Chance",
  "elemental-ailment-avoidance": "Elemental Ailment Avoidance",
  "energy-shield-from-max-life": "Energy Shield from Max Life",
  "energy-shield-fixed-zero": "Energy Shield Fixed at Zero",
  "life-loss-per-second": "Life Lost per Second",
  "energy-shield-loss-per-second": "Energy Shield Lost per Second",
  "unclassified-defense": "Unclassified Defensive Source",
};

const OPERATION_LABELS: Record<PlayerDefenseDisplayOperation, string> = {
  "add-flat": "Flat input",
  "add-percentage-points": "Additive percentage points",
  "increase-percent": "Percent input",
  "chance-percent": "Chance input",
  "ratio-percent": "Ratio input",
  "additional-percent": "Additional modifier",
  "transfer-percent": "Damage transfer",
  "conversion-percent": "Damage conversion",
  "recovery-percent": "Recovery input",
  "recovery-speed-percent": "Recovery speed",
  "interval-percent": "Interval modifier",
  "derive-percent": "Derived from another pool",
  "loss-flat-per-second": "Loss per second",
  "fixed-state": "Fixed state",
  "source-only": "Source-only mechanic",
};

const SCOPE_LABELS: Record<PlayerDefenseDisplayScope, string> = {
  "player-global": "Player · unconditional source",
  "local-gear": "Local gear input",
  "player-conditional": "Player · conditional",
  "area-talent": "Prism area · structural",
};

const BENEFIT_LABELS: Record<PlayerDefenseDisplayBenefit, string> = {
  beneficial: "Potentially defensive",
  harmful: "Potentially harmful",
  "context-dependent": "Context-dependent",
  unclassified: "Not yet classified",
};

const GUARDS: PlayerDefenseDisplayGuards = {
  isTotalEhp: false,
  sourceSumsAreCharacterTotals: false,
  comparisonValuesAreEhpDeltas: false,
  recommendationReady: false,
};

function compactNumber(value: number): string {
  if (Object.is(value, -0) || value === 0) return "0";
  if (Number.isInteger(value)) return Math.abs(value).toLocaleString("en-US");
  return Math.abs(value)
    .toLocaleString("en-US", { maximumFractionDigits: 4 })
    .replace(/\.?0+$/, "");
}

function signed(value: number, unit: "flat" | "percent"): string {
  const prefix = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${prefix}${compactNumber(value)}${unit === "percent" ? "%" : ""}`;
}

function termDisplay(term: PlayerDefenseTerm): string {
  if (term.candidateValues?.length) {
    return term.candidateValues
      .map((value) => signed(value, term.unit === "percent" ? "percent" : "flat"))
      .join(" / ");
  }
  if (term.operation === "fixed-state") return "Fixed at 0";
  if (term.operation === "loss-flat-per-second" && term.value !== null) {
    return `−${compactNumber(term.value)}/s`;
  }
  if (term.value === null) return "Source text only";
  if (term.unit === "boolean") return term.value ? "Active" : "Inactive";
  if (term.unit === "text") return "Source text only";
  return signed(term.value, term.unit);
}

function provenance(
  value: PlayerDefenseTerm["provenance"][number],
): PlayerDefenseDisplayProvenance {
  return {
    source: value.source,
    locator: value.locator,
    ...(value.sha256 ? { sha256: value.sha256 } : {}),
    ...(value.confidence ? { confidence: value.confidence } : {}),
  };
}

function blocker(value: {
  code: string;
  message: string;
  evidence?: string;
}): PlayerDefenseDisplayBlocker {
  return {
    code: value.code,
    message: value.message,
    evidence: value.evidence ?? null,
  };
}

function displayTerm(term: PlayerDefenseTerm): PlayerDefenseDisplayTerm {
  const stat = term.stat as PlayerDefenseDisplayStat;
  const operation = term.operation as PlayerDefenseDisplayOperation;
  const scope = term.scope as PlayerDefenseDisplayScope;
  const benefit = term.benefit as PlayerDefenseDisplayBenefit;
  const sourceKind = term.source.kind as PlayerDefenseDisplaySourceKind;
  return {
    id: term.id,
    actor: "player",
    stat,
    statLabel: STAT_LABELS[stat],
    operation,
    operationLabel: OPERATION_LABELS[operation],
    value: term.value,
    candidateValues: [...(term.candidateValues ?? [])],
    unit: term.unit,
    display: termDisplay(term),
    scope,
    scopeLabel: SCOPE_LABELS[scope],
    condition: term.condition,
    benefit,
    benefitLabel: BENEFIT_LABELS[benefit],
    text: term.text,
    source: {
      kind: sourceKind,
      kindLabel: SOURCE_LABELS[sourceKind],
      locator: term.source.locator,
      entityId: term.source.entityId,
      modifierId: term.source.modifierId,
      label: term.source.label,
    },
    provenance: term.provenance.map(provenance),
    includedInSourceSum: term.includedInSourceSum,
    isTotalEhp: false,
  };
}

function displayCoverage(
  evidence: PlayerDefenseEvidence,
): PlayerDefenseDisplayCoverage {
  const value = evidence.coverage;
  const catalogDisplay = value.catalog.status === "matched-ss13"
    ? `${value.catalog.resolvedReferences}/${value.catalog.requiredReferences} SS13 references resolved`
    : value.catalog.status === "missing"
      ? "SS13 catalog not supplied"
      : "Supplied catalog is unverified or not supported SS13 schema v2";
  const sources = SOURCE_ORDER.map((kind) => {
    const row = value.bySource[kind as DefenseSourceKind];
    return {
      kind,
      label: SOURCE_LABELS[kind],
      lines: row?.lines ?? 0,
      defensiveLines: row?.defensiveLines ?? 0,
      terms: row?.terms ?? 0,
      unresolved: row?.unresolved ?? 0,
    };
  });
  return {
    method: value.method,
    summary:
      `${value.playerScopedTerms} player terms from ${value.defensiveLines} defensive lines; `
      + `${value.unparsedDefensiveLines} left unparsed`,
    equippedGearItems: value.equippedGearItems,
    placedDivinitySlates: value.placedDivinitySlates,
    equippedHeroMemories: value.equippedHeroMemories,
    installedPactspirits: value.installedPactspirits,
    allocatedPactNodes: value.allocatedPactNodes,
    allocatedTalentNodes: value.allocatedTalentNodes,
    selectedHeroTraits: value.selectedHeroTraits,
    sourceLines: value.sourceLines,
    defensiveLines: value.defensiveLines,
    playerScopedTerms: value.playerScopedTerms,
    unconditionalSourceSumTerms: value.unconditionalSourceSumTerms,
    minionOnlyLinesExcluded: value.minionOnlyLinesExcluded,
    offensiveLinesExcluded: value.offensiveLinesExcluded,
    unparsedDefensiveLines: value.unparsedDefensiveLines,
    catalog: {
      ...value.catalog,
      display: catalogDisplay,
    },
    sources,
    unresolved: value.unresolved.map((entry) => ({
      code: entry.code,
      source: entry.source,
      message: entry.message,
      evidence: entry.evidence ?? null,
    })),
  };
}

function compilerOptions(
  options: PlayerDefenseDisplayOptions,
): PlayerDefenseCompileOptions {
  return {
    ...(options.catalog
      ? { catalog: options.catalog as PlayerDefenseCompileOptions["catalog"] }
      : {}),
    ...(options.catalogSha256 ? { catalogSha256: options.catalogSha256 } : {}),
  };
}

function missingProjectionBlockers(
  result: PlayerDefenseEvidence,
): PlayerDefenseDisplayBlocker[] {
  return result.coverage.unresolved
    .filter((entry) => entry.code === "missing-source-projection")
    .map((entry) => blocker({
      code: "incomplete-defence-source-projection",
      message: entry.message,
      evidence: entry.source,
    }));
}

export function playerDefenseEvidenceForCompendium(
  build: unknown,
  loadoutIndex: number,
  options: PlayerDefenseDisplayOptions = {},
): PlayerDefenseDisplayEvidenceResult {
  const result = compileSs13PlayerDefenseEvidence(
    build,
    loadoutIndex,
    compilerOptions(options),
  );
  if (result.status !== "source-terms") {
    return {
      status: "not-calculated",
      actor: "player",
      terms: [],
      sourceSums: [],
      blockers: result.blockers.map(blocker),
      guards: { ...GUARDS },
      isTotalEhp: false,
    };
  }
  const projectionBlockers = missingProjectionBlockers(result);
  if (projectionBlockers.length > 0) {
    return {
      status: "not-calculated",
      actor: "player",
      terms: [],
      sourceSums: [],
      blockers: projectionBlockers,
      guards: { ...GUARDS },
      isTotalEhp: false,
    };
  }
  return {
    status: "source-terms",
    patch: "SS13",
    actor: "player",
    heroId: result.heroId,
    loadoutIndex: result.loadoutIndex,
    loadoutName: result.loadoutName,
    terms: result.terms.map(displayTerm),
    sourceSums: result.sourceSums.map((sum) => {
      const stat = sum.stat as PlayerDefenseDisplayStat;
      const operation = sum.operation as PlayerDefenseDisplayOperation;
      const scope = sum.scope as "player-global" | "local-gear";
      return {
        key: sum.key,
        stat,
        statLabel: STAT_LABELS[stat],
        operation,
        operationLabel: OPERATION_LABELS[operation],
        scope,
        scopeLabel: scope === "local-gear" && sum.sourceLabel
          ? `${SCOPE_LABELS[scope]} · ${sum.sourceLabel}`
          : SCOPE_LABELS[scope],
        sourceEntityId: sum.sourceEntityId,
        sourceLabel: sum.sourceLabel,
        unit: sum.unit,
        value: sum.value,
        display: signed(sum.value, sum.unit),
        termIds: [...sum.termIds],
        isCharacterTotal: false,
        isEhp: false,
      };
    }),
    coverage: displayCoverage(result),
    playerEhp: {
      status: "not-calculated",
      blockers: result.playerEhp.blockers.map(blocker),
    },
    provenance: result.provenance.map(provenance),
    guards: { ...GUARDS },
    warning: result.warning,
    isTotalEhp: false,
  };
}

export function comparePlayerDefenseEvidenceForCompendium(
  build: unknown,
  beforeIndex: number,
  afterIndex: number,
  options: PlayerDefenseDisplayOptions = {},
): PlayerDefenseDisplayComparisonResult {
  const result = compareSs13PlayerDefenseEvidence(
    build,
    beforeIndex,
    afterIndex,
    compilerOptions(options),
  );
  if (result.status !== "source-terms") {
    return {
      status: "not-calculated",
      actor: "player",
      blockers: result.blockers.map(blocker),
      guards: { ...GUARDS },
      isTotalEhp: false,
    };
  }
  return {
    status: "source-terms",
    actor: "player",
    beforeIndex: result.beforeIndex,
    afterIndex: result.afterIndex,
    sourceSumChanges: result.sourceSumChanges.map((change) => {
      const stat = change.stat as PlayerDefenseDisplayStat;
      const operation = change.operation as PlayerDefenseDisplayOperation;
      const scope = change.scope as "player-global" | "local-gear";
      return {
        key: change.key,
        stat,
        statLabel: STAT_LABELS[stat],
        operation,
        operationLabel: OPERATION_LABELS[operation],
        scope,
        scopeLabel: scope === "local-gear" && change.sourceLabel
          ? `${SCOPE_LABELS[scope]} · ${change.sourceLabel}`
          : SCOPE_LABELS[scope],
        sourceEntityId: change.sourceEntityId,
        sourceLabel: change.sourceLabel,
        unit: change.unit,
        before: change.before,
        beforeDisplay: signed(change.before, change.unit),
        after: change.after,
        afterDisplay: signed(change.after, change.unit),
        delta: change.delta,
        deltaDisplay: signed(change.delta, change.unit),
        numericDirection: change.numericDirection,
        isEhpDelta: false,
      };
    }),
    removedTerms: result.removedTerms.map(displayTerm),
    addedTerms: result.addedTerms.map(displayTerm),
    provenance: result.provenance.map(provenance),
    guards: { ...GUARDS },
    warning: result.warning,
    isTotalEhp: false,
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

/**
 * Deterministic semantic/UI fingerprint. This is intentionally transparent
 * canonical JSON rather than a cryptographic digest so tests and consumers can
 * inspect exactly which guarded evidence changed.
 */
export function playerDefenseEvidenceFingerprint(
  value: PlayerDefenseDisplayEvidenceResult | PlayerDefenseDisplayComparisonResult,
): string {
  return JSON.stringify(canonicalize(value));
}
