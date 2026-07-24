import {
  compareBingFactorLedgerResults,
  compileBingFactorLedger,
  type BingFactorChange,
  type BingFactorId,
  type BingFactorLedger,
  type BingFactorLedgerComparison,
  type BingFactorLedgerComparisonResult,
  type BingFactorLedgerResult,
  type BingFactorTerm,
  type BingNonComposedEffect,
  type BingFactorValueKind,
  type BingSelectedHitScenario,
  type BingSelectedHitScenarioId,
} from "@rehan/dmg/bingFactorLedger";

/*
 * Page-facing adapter for the component-scoped Bing factor ledger.
 *
 * It deliberately has no dependency on analysis-types.ts, so the importer can
 * integrate it after the shared analysis shape settles. The raw guarded
 * evidence remains attached to every successful or refused display result.
 */

export interface BingFactorDisplayValue {
  raw: number;
  kind: BingFactorValueKind;
  formatted: string;
}

export interface CalculatedBingFactorLoadoutDisplayRow {
  status: "calculated-partial";
  factorId: BingFactorId;
  label: string;
  scope: string;
  condition: string | null;
  value: BingFactorDisplayValue;
  rawPercent: number | null;
  sourcePaths: string[];
  nonComposedEffects: BingNonComposedEffect[];
  provenance: BingFactorLedger["provenance"];
  isDps: false;
  isTotalHit: false;
  isTargetHits: false;
}

export interface UnavailableBingFactorLoadoutDisplayRow {
  status: "not-calculated";
  factorId: BingFactorId;
  label: string;
  scope: string;
  condition: string | null;
  blockers: Array<{
    code: string;
    message: string;
    evidence?: string;
  }>;
  isDps: false;
  isTotalHit: false;
  isTargetHits: false;
}

export type BingFactorLoadoutDisplayRow =
  | CalculatedBingFactorLoadoutDisplayRow
  | UnavailableBingFactorLoadoutDisplayRow;

export interface BingFactorLedgerLoadoutDisplay {
  status: "calculated-partial";
  kind: "bing-factor-ledger-loadout-display";
  loadoutIndex: number;
  loadoutName: string;
  factorRows: BingFactorLoadoutDisplayRow[];
  emissionsAreSeparate: true;
  evidence: BingFactorLedger;
  provenance: BingFactorLedger["provenance"];
  excludedFromComposition: string[];
  warning: string;
  isDps: false;
  isTotalHit: false;
  isTargetHits: false;
}

export interface UnavailableBingFactorLedgerLoadoutDisplay {
  status: "not-calculated";
  kind: "bing-factor-ledger-loadout-display";
  loadoutIndex: number;
  loadoutName: null;
  blockers: Array<{
    code: string;
    message: string;
    evidence?: string;
  }>;
  emissionsAreSeparate: true;
  evidence: BingFactorLedgerResult;
  isDps: false;
  isTotalHit: false;
  isTargetHits: false;
}

export type BingFactorLedgerLoadoutDisplayResult =
  | BingFactorLedgerLoadoutDisplay
  | UnavailableBingFactorLedgerLoadoutDisplay;

export interface CalculatedBingFactorDisplayRow {
  status: "calculated-partial";
  factorId: BingFactorId;
  label: string;
  scope: string;
  condition: string | null;
  before: BingFactorDisplayValue;
  after: BingFactorDisplayValue;
  ratio: number;
  deltaPct: number;
  deltaLabel: string;
  direction: "gain" | "loss" | "unchanged";
  isDps: false;
  isTotalHit: false;
  isTargetHits: false;
}

export interface UnavailableBingFactorDisplayRow {
  status: "not-calculated";
  factorId: BingFactorId;
  label: string;
  scope: string;
  condition: string | null;
  blockers: Array<{
    code: string;
    message: string;
    evidence?: string;
  }>;
  isDps: false;
  isTotalHit: false;
  isTargetHits: false;
}

export type BingFactorDisplayRow =
  | CalculatedBingFactorDisplayRow
  | UnavailableBingFactorDisplayRow;

export interface CalculatedBingScenarioDisplayRow {
  status: "calculated-partial";
  scenarioId: BingSelectedHitScenarioId;
  label: string;
  component: "ordinary-hit" | "projectile-explosion-hit";
  condition: "not stationary" | "stationary for at least 0.1s";
  factorLabels: string[];
  ratio: number;
  deltaPct: number;
  deltaLabel: string;
  direction: "gain" | "loss" | "unchanged";
  isDps: false;
  isTotalHit: false;
  isTargetHits: false;
}

export interface UnavailableBingScenarioDisplayRow {
  status: "not-calculated";
  scenarioId: BingSelectedHitScenarioId;
  label: string;
  component: "ordinary-hit" | "projectile-explosion-hit";
  condition: "not stationary" | "stationary for at least 0.1s";
  blockers: Array<{
    code: string;
    message: string;
    evidence?: string;
  }>;
  isDps: false;
  isTotalHit: false;
  isTargetHits: false;
}

export type BingScenarioDisplayRow =
  | CalculatedBingScenarioDisplayRow
  | UnavailableBingScenarioDisplayRow;

export interface BingFactorLedgerDisplay {
  status: "calculated-partial";
  kind: "bing-factor-ledger-display";
  beforeIndex: number;
  beforeName: string;
  afterIndex: number;
  afterName: string;
  factorRows: BingFactorDisplayRow[];
  hitScenarioRows: BingScenarioDisplayRow[];
  emissionsAreSeparate: true;
  evidence: BingFactorLedgerComparison;
  warning: string;
  isDps: false;
  isTotalHit: false;
  isTargetHits: false;
}

export interface UnavailableBingFactorLedgerDisplay {
  status: "not-calculated";
  kind: "bing-factor-ledger-display";
  blockers: Array<{
    code: string;
    message: string;
    evidence?: string;
  }>;
  evidence: BingFactorLedgerComparisonResult;
  isDps: false;
  isTotalHit: false;
  isTargetHits: false;
}

export type BingFactorLedgerDisplayResult =
  | BingFactorLedgerDisplay
  | UnavailableBingFactorLedgerDisplay;

const DISPLAY_NUMBER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
});

function formatInput(value: number, kind: BingFactorValueKind): string {
  if (kind === "multiplier") return `×${DISPLAY_NUMBER.format(value)}`;
  if (kind === "emitted-projectiles-per-throw") {
    return `${DISPLAY_NUMBER.format(value)} emitted / throw`;
  }
  return DISPLAY_NUMBER.format(value);
}

function deltaLabel(deltaPct: number): string {
  const normalized = Math.abs(deltaPct) < 0.00005 ? 0 : deltaPct;
  const sign = normalized > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(normalized)}%`;
}

function loadoutFactorRow(
  term: BingFactorTerm,
): BingFactorLoadoutDisplayRow {
  if (term.status !== "calculated-partial") {
    return {
      status: "not-calculated",
      factorId: term.factorId,
      label: term.label,
      scope: term.scope,
      condition: term.condition,
      blockers: term.blockers,
      isDps: false,
      isTotalHit: false,
      isTargetHits: false,
    };
  }
  return {
    status: "calculated-partial",
    factorId: term.factorId,
    label: term.label,
    scope: term.scope,
    condition: term.condition,
    value: {
      raw: term.inputValue,
      kind: term.inputKind,
      formatted: formatInput(term.inputValue, term.inputKind),
    },
    rawPercent: term.rawPercent,
    sourcePaths: term.sourcePaths,
    nonComposedEffects: term.nonComposedEffects,
    provenance: term.provenance,
    isDps: false,
    isTotalHit: false,
    isTargetHits: false,
  };
}

function factorRow(change: BingFactorChange): BingFactorDisplayRow {
  if (change.status !== "calculated-partial") {
    return {
      status: "not-calculated",
      factorId: change.factorId,
      label: change.label,
      scope: change.scope,
      condition: change.condition,
      blockers: change.blockers,
      isDps: false,
      isTotalHit: false,
      isTargetHits: false,
    };
  }
  return {
    status: "calculated-partial",
    factorId: change.factorId,
    label: change.label,
    scope: change.scope,
    condition: change.condition,
    before: {
      raw: change.beforeValue,
      kind: change.inputKind,
      formatted: formatInput(change.beforeValue, change.inputKind),
    },
    after: {
      raw: change.afterValue,
      kind: change.inputKind,
      formatted: formatInput(change.afterValue, change.inputKind),
    },
    ratio: change.ratio,
    deltaPct: change.deltaPct,
    deltaLabel: deltaLabel(change.deltaPct),
    direction: change.direction,
    isDps: false,
    isTotalHit: false,
    isTargetHits: false,
  };
}

function scenarioRow(
  value: BingSelectedHitScenario,
): BingScenarioDisplayRow {
  if (value.status !== "calculated-partial") {
    return {
      status: "not-calculated",
      scenarioId: value.scenarioId,
      label: value.label,
      component: value.component,
      condition: value.condition,
      blockers: value.blockers,
      isDps: false,
      isTotalHit: false,
      isTargetHits: false,
    };
  }
  return {
    status: "calculated-partial",
    scenarioId: value.scenarioId,
    label: value.label,
    component: value.component,
    condition: value.condition,
    factorLabels: value.factors.map((factor) => factor.label),
    ratio: value.ratio,
    deltaPct: value.deltaPct,
    deltaLabel: deltaLabel(value.deltaPct),
    direction: value.direction,
    isDps: false,
    isTotalHit: false,
    isTargetHits: false,
  };
}

function displayFromComparisonEvidence(
  evidence: BingFactorLedgerComparisonResult,
): BingFactorLedgerDisplayResult {
  if (evidence.status !== "calculated-partial") {
    return {
      status: "not-calculated",
      kind: "bing-factor-ledger-display",
      blockers: evidence.blockers,
      evidence,
      isDps: false,
      isTotalHit: false,
      isTargetHits: false,
    };
  }
  const changes = evidence.factorChanges;
  return {
    status: "calculated-partial",
    kind: "bing-factor-ledger-display",
    beforeIndex: evidence.before.loadoutIndex,
    beforeName: evidence.before.loadoutName,
    afterIndex: evidence.after.loadoutIndex,
    afterName: evidence.after.loadoutName,
    factorRows: [
      factorRow(changes.weaponFoundation),
      factorRow(changes.stationaryAttackDamage),
      factorRow(changes.slowProjectileAdditionalDamage),
      factorRow(changes.upheavalExplosionHitDamage),
      factorRow(changes.sourceVisibleEmissions),
    ],
    hitScenarioRows: evidence.selectedHitScenarios.map(scenarioRow),
    emissionsAreSeparate: true,
    evidence,
    warning: evidence.warning,
    isDps: false,
    isTotalHit: false,
    isTargetHits: false,
  };
}

/**
 * O(n) importer boundary: compile and format one loadout exactly once.
 *
 * The successful shape retains the complete guarded ledger plus factor-local
 * blockers/provenance in ordered rows. An unavailable actor/loadout stays a
 * typed result so importers can preserve the refusal reason.
 */
export function bingFactorLedgerLoadoutDisplayResultForCompendium(
  build: unknown,
  loadoutIndex: number,
): BingFactorLedgerLoadoutDisplayResult {
  const evidence = compileBingFactorLedger(build, loadoutIndex);
  if (evidence.status !== "calculated-partial") {
    return {
      status: "not-calculated",
      kind: "bing-factor-ledger-loadout-display",
      loadoutIndex,
      loadoutName: null,
      blockers: evidence.blockers,
      emissionsAreSeparate: true,
      evidence,
      isDps: false,
      isTotalHit: false,
      isTargetHits: false,
    };
  }
  const terms = evidence.terms;
  return {
    status: "calculated-partial",
    kind: "bing-factor-ledger-loadout-display",
    loadoutIndex: evidence.loadoutIndex,
    loadoutName: evidence.loadoutName,
    factorRows: [
      loadoutFactorRow(terms.weaponFoundation),
      loadoutFactorRow(terms.stationaryAttackDamage),
      loadoutFactorRow(terms.slowProjectileAdditionalDamage),
      loadoutFactorRow(terms.upheavalExplosionHitDamage),
      loadoutFactorRow(terms.sourceVisibleEmissions),
    ],
    emissionsAreSeparate: true,
    evidence,
    provenance: evidence.provenance,
    excludedFromComposition: evidence.excludedFromComposition,
    warning: evidence.warning,
    isDps: false,
    isTotalHit: false,
    isTargetHits: false,
  };
}

export function bingFactorLedgerLoadoutDisplayForCompendium(
  build: unknown,
  loadoutIndex: number,
): BingFactorLedgerLoadoutDisplay | null {
  const result = bingFactorLedgerLoadoutDisplayResultForCompendium(
    build,
    loadoutIndex,
  );
  return result.status === "calculated-partial" ? result : null;
}

/**
 * Selection-time boundary: compare two stored per-loadout display results.
 *
 * This needs neither raw build nor sibling loadouts. The damage compiler owns
 * all ratio/scenario math; this adapter only formats its guarded comparison.
 */
export function compareBingFactorLedgerLoadoutDisplays(
  before: BingFactorLedgerLoadoutDisplayResult,
  after: BingFactorLedgerLoadoutDisplayResult,
): BingFactorLedgerDisplayResult {
  return displayFromComparisonEvidence(compareBingFactorLedgerResults(
    before.evidence,
    after.evidence,
  ));
}

/**
 * Full adapter result for importer/UI boundaries that need refusal blockers.
 *
 * This compatibility helper now compiles two independent per-loadout results
 * and delegates to the same stored-display comparator used after import.
 */
export function bingFactorLedgerDisplayResultForCompendium(
  build: unknown,
  beforeIndex: number,
  afterIndex: number,
): BingFactorLedgerDisplayResult {
  return compareBingFactorLedgerLoadoutDisplays(
    bingFactorLedgerLoadoutDisplayResultForCompendium(
      build,
      beforeIndex,
    ),
    bingFactorLedgerLoadoutDisplayResultForCompendium(
      build,
      afterIndex,
    ),
  );
}

/**
 * Convenience boundary for renderers that only consume successful evidence.
 */
export function bingFactorLedgerDisplayForCompendium(
  build: unknown,
  beforeIndex: number,
  afterIndex: number,
): BingFactorLedgerDisplay | null {
  const result = bingFactorLedgerDisplayResultForCompendium(
    build,
    beforeIndex,
    afterIndex,
  );
  return result.status === "calculated-partial" ? result : null;
}
