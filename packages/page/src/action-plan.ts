import { knownMinionDamageCoverageMatches } from "@rehan/dmg/minionDamageEnvelope";
import {
  buildRollbackEvaluations,
  compactNumber,
  signedPercent,
} from "./analysis";
import type {
  AnalyzedLoadout,
  MinionSupportSourceEvidence,
  SupportEffectEvidence,
  SupportSocketEvidence,
} from "./analysis-types";
import {
  compareStructure,
  type BuildSystem,
  type StructuralInsight,
} from "./structural-analysis";
import {
  classifyComparisonContext,
  type LoadoutComparisonClassification,
  type LoadoutComparisonKind,
} from "./comparison-context";
import { compareBingFactorLedgerLoadoutDisplays } from "./bing-factor-evidence";
import { supportSocketIdentity } from "./support-evidence";
import {
  compareSupportInstances,
  supportInstanceEvidenceRef,
  type SupportInstanceChange,
} from "./support-instance-comparison";
import {
  compareObservedDamageMeasurements,
  type ObservedDamageComparison,
  type ObservedDamageMeasurement,
  type ObservedMeasurementScope,
} from "./observed-measurement";

export type ActionProof =
  | "observed-result"
  | "modeled-scenario"
  | "guarded-partial"
  | "source-term"
  | "structural";

export type ActionDomain = "damage" | "survival" | "build" | "capture";
export type ActionDirection =
  | "loss"
  | "gain"
  | "tradeoff"
  | "risk"
  | "neutral"
  | "weaker-input"
  | "stronger-input";
export type ActionTargetView =
  | "diagnosis"
  | "changes"
  | "formula"
  | "survival"
  | "coverage";

export interface ActionMetric {
  label: string;
  before: number;
  after: number;
  delta: number;
  relativeDelta: number | null;
  unit: string;
}

export interface ActionTarget {
  view: ActionTargetView;
  section?: BuildSystem;
}

export interface ActionFinding {
  id: string;
  priority: number;
  proof: ActionProof;
  domain: ActionDomain;
  direction: ActionDirection;
  label: string;
  title: string;
  explanation: string;
  nextExperiment: string;
  evidence: string[];
  evidenceRefs?: string[];
  evidenceScope?: {
    actorId: string;
    skillId: string;
    actionIds?: string[];
  };
  metric?: ActionMetric;
  target: ActionTarget;
  claims: {
    isNetDps: boolean;
    isEhp: false;
  };
}

export interface ActionBlocker {
  id: string;
  code: string;
  side: "before" | "after" | "both";
  priority: number;
  domain: ActionDomain;
  title: string;
  detail: string;
  evidence?: string;
  contexts?: string[];
}

export interface ComparisonActionPlan {
  findings: ActionFinding[];
  blockers: ActionBlocker[];
  summary: {
    /** Number of direct aligned observation results, excluding reconciliations. */
    observed: number;
    /**
     * True only when an explicit whole-loadout observed DPS result is
     * available. Actor/skill observations are exposed through
     * `observedDpsScope` without being promoted to net build DPS.
     */
    observedDpsAvailable: boolean;
    observedDpsScope: ObservedMeasurementScope | null;
    modeled: number;
    guardedPartial: number;
    sourceTerms: number;
    structural: number;
    damage: number;
    survival: number;
    netDpsAvailable: boolean;
    ehpAvailable: false;
    comparisonKind: LoadoutComparisonKind;
    comparisonReason: string;
  };
}

export interface ObservedMeasurementPair {
  before: unknown;
  after: unknown;
}

export interface ComparisonActionPlanOptions {
  observedMeasurements?: ObservedMeasurementPair;
}

interface FlatEffect {
  id: string;
  label: string;
  value: number;
  display: string;
  application: string;
  scope: string;
  condition: string | null;
}

interface FlatSupport {
  key: string;
  actorId: string;
  actor: string;
  skillId: string;
  skill: string;
  socketIndex: number;
  socketId: string;
  supportId: string;
  supportName: string;
  supportType: string;
  status: "source-terms" | "unsupported";
  level: number | null;
  tier: number | null;
  rank: number | null;
  rollValues: Array<number | string>;
  rawFingerprint: string | null;
  effects: FlatEffect[];
  blockers: string[];
}

const EPSILON = 1e-9;

const PROOF_ORDER: Record<ActionProof, number> = {
  "observed-result": 5,
  "modeled-scenario": 4,
  "guarded-partial": 3,
  "source-term": 2,
  structural: 1,
};

const MODELED_EXPERIMENTS: Record<string, string> = {
  base:
    "Restore the stronger weapon and flat-damage base in a duplicate loadout, then compare again before changing another layer.",
  increased:
    "Check that every increased-damage line still matches the skill tags and final damage type.",
  additional:
    "Restore the removed separately multiplying additional layer first and hold the additive pool constant.",
  conversion:
    "Trace every converted damage portion and verify that the destination damage type still receives the intended bonuses.",
  crit:
    "Restore critical reliability before buying more critical damage; test chance and multiplier as separate edits.",
  enemy:
    "Restore the lost penetration or target debuff and compare under the same enemy resistance scenario.",
  rotation:
    "Hold the hit formula constant and test cadence, projectile contact, overlap, and uptime independently.",
  dot:
    "Verify the feeding hit, application chance, duration, and tick cadence before changing DoT magnitude.",
};

const OFFENSIVE_APPLICATIONS = new Set([
  "additional-layer-input",
  "additional-damage-input",
  "attack-speed-input",
  "speed-input",
  "projectile-geometry-input",
  "area-geometry-input",
  "geometry-input",
  "rotation-input",
  "ailment-input",
]);

const MONOTONIC_OFFENSIVE_APPLICATIONS = new Set([
  "additional-layer-input",
  "additional-damage-input",
  "attack-speed-input",
  "speed-input",
]);

const SURVIVAL_APPLICATIONS = new Set([
  "survival-transfer-input",
  "origin-effect-input",
]);

const CORE_DEFENSE_STATS = new Set([
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
  "injury-buffer",
  "critical-strike-damage-mitigation",
  "life-regain",
  "energy-shield-regain",
  "barrier-shield",
  "elemental-ailment-avoidance",
]);

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function signed(value: number, unit = "") {
  const prefix = value > EPSILON ? "+" : value < -EPSILON ? "−" : "";
  return `${prefix}${compactNumber(Math.abs(value))}${unit}`;
}

function relativeDelta(before: number, after: number) {
  return Math.abs(before) < EPSILON ? null : (after - before) / Math.abs(before);
}

function metricEvidence(metric: ActionMetric) {
  const relative = metric.relativeDelta == null
    ? ""
    : ` (${signedPercent(metric.relativeDelta * 100)})`;
  return `${metric.label}: ${compactNumber(metric.before)} → ${compactNumber(metric.after)} ${metric.unit}${relative}`;
}

function observedScenarioEvidence(measurement: ObservedDamageMeasurement) {
  const conditions = measurement.conditions.length
    ? ` · ${measurement.conditions.join(" · ")}`
    : "";
  const duration = measurement.sampleDurationSeconds === null
    ? ""
    : ` · ${compactNumber(measurement.sampleDurationSeconds)}s sample`;
  return `${measurement.targetLabel} · ${measurement.scenarioLabel}${duration}${conditions}`;
}

function observedMeasurementContext(
  side: "Before" | "After",
  measurement: ObservedDamageMeasurement,
) {
  const metric = measurement.metric === "dps"
    ? "DPS"
    : "damage per hit";
  const duration = measurement.sampleDurationSeconds === null
    ? "sample duration not declared"
    : `${measurement.sampleDurationSeconds}s sample`;
  const conditions = measurement.conditions.length
    ? measurement.conditions.join("; ")
    : "no extra conditions declared";
  return `${side} observation: value ${measurement.value} ${metric} · scope ${measurement.scope} · actor ${measurement.actorId ?? "missing"} · skill ${measurement.skillId ?? "missing"} · target ${measurement.targetLabel} · scenario ${measurement.scenarioLabel} · ${duration} · conditions ${conditions} · confidence ${measurement.confidence} · source ${measurement.source}`;
}

function observedMeasurementContexts(
  before: ObservedDamageMeasurement,
  after: ObservedDamageMeasurement,
) {
  return [
    observedMeasurementContext("Before", before),
    observedMeasurementContext("After", after),
  ];
}

function canonicalObservedIdentity(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

interface ObservedIdentityScope {
  kind: ObservedMeasurementScope;
  actorId: string;
  skillId: string;
}

function observedIdentityPairs(
  loadout: AnalyzedLoadout,
  scope: ObservedMeasurementScope,
) {
  const pairs = new Map<string, ObservedIdentityScope>();
  const addPair = (
    actor: string | null | undefined,
    skill: string | null | undefined,
  ) => {
    if (!actor?.trim() || !skill?.trim()) return;
    const key =
      `${canonicalObservedIdentity(actor)}\u0000${canonicalObservedIdentity(skill)}`;
    if (!pairs.has(key)) pairs.set(key, {
      kind: scope,
      actorId: actor,
      skillId: skill,
    });
  };

  addPair(
    loadout.comparisonContext?.actorId,
    loadout.comparisonContext?.archetypeId,
  );
  if (scope === "whole-loadout") return pairs;

  addPair(loadout.model?.actorId, loadout.model?.skillId);

  for (const support of loadout.supportEvidence ?? []) {
    addPair(support.actorId, support.skillId);
    addPair(support.actorName, support.skillName);
  }
  for (const summon of loadout.summonEvidence ?? []) {
    addPair(summon.skillId, summon.skillId);
    addPair(summon.skillId, summon.skillName);
    addPair(summon.skillName, summon.skillId);
    addPair(summon.skillName, summon.skillName);
    for (const action of summon.actions) {
      addPair(summon.skillId, action.actionId);
      addPair(summon.skillId, action.actionName);
      addPair(summon.skillName, action.actionId);
      addPair(summon.skillName, action.actionName);
    }
    for (const support of summon.supports) {
      addPair(support.actorId, support.skillId);
      addPair(support.actorName, support.skillName);
    }
  }
  return pairs;
}

function observedIdentityMatch(
  loadout: AnalyzedLoadout,
  measurement: ObservedDamageMeasurement,
) {
  if (!measurement.actorId || !measurement.skillId) return null;
  const key =
    `${canonicalObservedIdentity(measurement.actorId)}\u0000${canonicalObservedIdentity(measurement.skillId)}`;
  return observedIdentityPairs(loadout, measurement.scope).get(key) ?? null;
}

function observedFinding(
  comparison: Extract<ObservedDamageComparison, { status: "comparable" }>,
  scope: ObservedIdentityScope,
): ActionFinding {
  const isDps = comparison.metric === "dps";
  const isWholeLoadout = scope.kind === "whole-loadout";
  const isNetDps = isDps && isWholeLoadout;
  const direction: ActionDirection =
    comparison.direction === "decrease"
      ? "loss"
      : comparison.direction === "increase"
        ? "gain"
        : "neutral";
  const metricLabel = isDps
    ? isWholeLoadout
      ? "Observed whole-loadout DPS"
      : "Observed actor/skill DPS"
    : isWholeLoadout
      ? "Observed whole-loadout damage per hit"
      : "Observed actor/skill damage per hit";
  const directionWord =
    comparison.direction === "decrease"
      ? "fell"
      : comparison.direction === "increase"
        ? "rose"
        : "was unchanged";
  const magnitude = Math.abs(comparison.percentChange);
  const title = comparison.direction === "unchanged"
    ? `${metricLabel} was unchanged`
    : `${metricLabel} ${directionWord} by ${compactNumber(magnitude)}%`;
  const metric: ActionMetric = {
    label: metricLabel,
    before: comparison.beforeObservedValue,
    after: comparison.afterObservedValue,
    delta: comparison.absoluteObservedChange,
    relativeDelta: comparison.ratio - 1,
    unit: isDps
      ? isWholeLoadout
        ? "observed whole-loadout DPS"
        : "observed actor/skill DPS"
      : isWholeLoadout
        ? "observed whole-loadout damage / hit"
        : "observed actor/skill damage / hit",
  };
  return {
    id: `observed:${comparison.metric}`,
    priority: 500,
    proof: "observed-result",
    domain: "damage",
    direction,
    label: isDps
      ? isWholeLoadout
        ? "Aligned whole-loadout DPS result"
        : "Aligned actor/skill DPS result"
      : "Aligned observed hit result",
    title,
    explanation: isDps
      ? isWholeLoadout
        ? "These user-recorded DPS values explicitly declare whole-loadout scope and use the same actor, archetype, target, and scenario. They establish the measured direction and magnitude only; they do not identify which build change caused it."
        : "These user-recorded DPS values use the same declared actor, skill, target, and scenario. They establish direction and magnitude for that actor/skill only, not whole-loadout DPS or which build change caused it."
      : "These user-recorded per-hit values use the same metric, actor, skill, target, and scenario. They establish a hit-result change only and are never converted into DPS or attributed to a build layer.",
    nextExperiment: isDps
      ? "Repeat this exact observed scenario after one isolated build change, using the same target, conditions, and sample duration."
      : "Repeat the same hit observation after one isolated build change; measure cadence separately if DPS is the question.",
    evidence: [
      metricEvidence(metric),
      `Identity: actor ${comparison.before.actorId} · skill ${comparison.before.skillId} · scope ${scope.kind === "whole-loadout" ? "explicit whole loadout" : "specific actor/skill"}`,
      `Matched scenario: ${observedScenarioEvidence(comparison.before)}`,
      `Before: ${comparison.before.confidence} observation from ${comparison.before.source}`,
      `After: ${comparison.after.confidence} observation from ${comparison.after.source}`,
      isDps
        ? isWholeLoadout
          ? "Observed whole-loadout result; no formula-layer attribution."
          : "Observed actor/skill result only; no whole-loadout DPS or formula-layer attribution."
        : "Observed hit result only; no DPS conversion.",
    ],
    metric,
    target: { view: "diagnosis" },
    claims: { isNetDps, isEhp: false },
  };
}

const OBSERVED_REFERENCE_REASONS: Record<
  Extract<ObservedDamageComparison, { status: "reference-only" }>["reasons"][number],
  string
> = {
  "metric-mismatch": "the metrics differ",
  "scope-mismatch": "the declared observation scopes differ",
  "actor-unknown": "an actor identifier is missing",
  "actor-mismatch": "the actor identifiers differ",
  "skill-unknown": "a skill identifier is missing",
  "skill-mismatch": "the skill identifiers differ",
  "scenario-mismatch": "the target, conditions, or sample scenario differs",
};

interface ObservedActionEvidence {
  comparison: ObservedDamageComparison | null;
  identityScope: ObservedIdentityScope | null;
  findings: ActionFinding[];
  blockers: ActionBlocker[];
  observedDpsAvailable: boolean;
  observedDpsScope: ObservedMeasurementScope | null;
}

function observedActionEvidence(
  pair: ObservedMeasurementPair | undefined,
  beforeLoadout: AnalyzedLoadout,
  afterLoadout: AnalyzedLoadout,
): ObservedActionEvidence {
  if (!pair) {
    return {
      comparison: null,
      identityScope: null,
      findings: [],
      blockers: [],
      observedDpsAvailable: false,
      observedDpsScope: null,
    };
  }
  if (beforeLoadout === afterLoadout) {
    return {
      comparison: null,
      identityScope: null,
      findings: [],
      observedDpsAvailable: false,
      observedDpsScope: null,
      blockers: [{
        id: "blocker:both:observed-same-loadout",
        code: "observed-same-loadout",
        side: "both",
        priority: 455,
        domain: "capture",
        title: "Observed comparison needs two distinct snapshots",
        detail:
          "The same loadout object is selected on both sides, so its one session-local observation cannot establish a before/after result.",
      }],
    };
  }
  const comparison = compareObservedDamageMeasurements(
    pair.before,
    pair.after,
  );
  if (comparison.status === "comparable") {
    const beforeMatch = observedIdentityMatch(
      beforeLoadout,
      comparison.before,
    );
    const afterMatch = observedIdentityMatch(afterLoadout, comparison.after);
    const identityMismatches = [
      ...(!beforeMatch
        ? [{ side: "before" as const, measurement: comparison.before }]
        : []),
      ...(!afterMatch
        ? [{ side: "after" as const, measurement: comparison.after }]
        : []),
    ];
    if (identityMismatches.length) {
      const contexts = identityMismatches.map(({ side, measurement }) =>
        `${side}: actor ${measurement.actorId ?? "missing"} · skill ${measurement.skillId ?? "missing"}`);
      return {
        comparison: null,
        identityScope: null,
        findings: [],
        observedDpsAvailable: false,
        observedDpsScope: null,
        blockers: [{
          id:
            `blocker:both:observed-loadout-identity-mismatch:${stableToken(contexts.join("\u0000"))}`,
          code: "observed-loadout-identity-mismatch",
          side: identityMismatches.length === 2
            ? "both"
            : identityMismatches[0].side,
          priority: 445,
          domain: "capture",
          title: "Observed identity does not belong to the selected loadout",
          detail:
            "The declared actor/skill pair is not present in the corresponding imported or compiled loadout evidence, so no observed delta is attached to this build comparison.",
          contexts: [
            ...contexts,
            ...observedMeasurementContexts(
              comparison.before,
              comparison.after,
            ),
          ],
        }],
      };
    }
    const identityScope: ObservedIdentityScope = {
      kind: comparison.scope,
      actorId: comparison.before.actorId!,
      skillId: comparison.before.skillId!,
    };
    return {
      comparison,
      identityScope,
      findings: [observedFinding(comparison, identityScope)],
      blockers: [],
      observedDpsAvailable:
        comparison.metric === "dps"
        && comparison.scope === "whole-loadout",
      observedDpsScope:
        comparison.metric === "dps" ? comparison.scope : null,
    };
  }
  if (comparison.status === "reference-only") {
    const contexts = comparison.reasons.map((reason) =>
      OBSERVED_REFERENCE_REASONS[reason]);
    return {
      comparison,
      identityScope: null,
      findings: [],
      observedDpsAvailable: false,
      observedDpsScope: null,
      blockers: [{
        id:
          `blocker:both:observed-measurement-reference-only:${stableToken(contexts.join("\u0000"))}`,
        code: "observed-measurement-reference-only",
        side: "both",
        priority: 440,
        domain: "capture",
        title: "Observed results are reference-only",
        detail:
          `No observed direction, ratio, or percentage was calculated because ${contexts.join("; ")}.`,
        contexts: [
          ...contexts,
          ...observedMeasurementContexts(
            comparison.before,
            comparison.after,
          ),
        ],
      }],
    };
  }
  const blockers = comparison.issues.map(({ side, issues }) => {
    const contexts = issues.map((value) =>
      `${value.field}: ${value.message}`);
    return {
      id:
        `blocker:${side}:observed-measurement-invalid:${stableToken(contexts.join("\u0000"))}`,
      code: "observed-measurement-invalid",
      side,
      priority: 450,
      domain: "capture" as const,
      title: `${side === "before" ? "Before" : "After"} observed result is invalid`,
      detail:
        "This entry was excluded; no observed direction, ratio, or percentage was calculated.",
      contexts,
    };
  });
  return {
    comparison,
    identityScope: null,
    findings: [],
    blockers,
    observedDpsAvailable: false,
    observedDpsScope: null,
  };
}

function incompatibleObservedComparisonBlocker(
  comparison: ObservedDamageComparison | null,
): ActionBlocker | null {
  if (comparison?.status !== "comparable") return null;
  const contexts = observedMeasurementContexts(
    comparison.before,
    comparison.after,
  );
  return {
    id:
      `blocker:both:observed-comparison-context-incompatible:${stableToken(contexts.join("\u0000"))}`,
    code: "observed-comparison-context-incompatible",
    side: "both",
    priority: 443,
    domain: "capture",
    title: "Observed entries retained as incompatible references",
    detail:
      "Both validated observations are preserved below, but the imported loadouts are incompatible, so no observed direction, percentage, or build-level claim is attached to this comparison.",
    contexts,
  };
}

function observedPartialReconciliation(
  observed: ObservedDamageComparison | null,
  observedScope: ObservedIdentityScope | null,
  guardedFindings: readonly ActionFinding[],
): ActionFinding[] {
  if (
    observed?.status !== "comparable"
    || observed.metric !== "dps"
    || observed.direction !== "decrease"
    || !observedScope
  ) {
    return [];
  }
  const wholeLoadout = observedScope.kind === "whole-loadout";
  const guardedGains = guardedFindings.filter((finding) =>
    finding.proof === "guarded-partial"
    && finding.domain === "damage"
    && finding.direction === "gain"
    && (
      wholeLoadout
      || (
        finding.evidenceScope
        && canonicalObservedIdentity(finding.evidenceScope.actorId)
          === canonicalObservedIdentity(observedScope.actorId)
        && (
          canonicalObservedIdentity(finding.evidenceScope.skillId)
            === canonicalObservedIdentity(observedScope.skillId)
          || (finding.evidenceScope.actionIds ?? []).some((actionId) =>
            canonicalObservedIdentity(actionId)
              === canonicalObservedIdentity(observedScope.skillId))
        )
      )
    ));
  if (!guardedGains.length) return [];
  const observedMetric: ActionMetric = {
    label: wholeLoadout
      ? "Observed whole-loadout DPS"
      : "Observed actor/skill DPS",
    before: observed.beforeObservedValue,
    after: observed.afterObservedValue,
    delta: observed.absoluteObservedChange,
    relativeDelta: observed.ratio - 1,
    unit: wholeLoadout
      ? "observed whole-loadout DPS"
      : "observed actor/skill DPS",
  };
  return [{
    id: "observed:reconcile:guarded-component-gain",
    priority: 490,
    proof: "observed-result",
    domain: "damage",
    direction: "tradeoff",
    label: wholeLoadout
      ? "Observed whole loadout vs guarded component"
      : "Observed actor/skill vs guarded component",
    title: wholeLoadout
      ? "Observed whole-loadout DPS fell while a guarded component improved"
      : "Observed actor/skill DPS fell while a matching guarded component improved",
    explanation:
      wholeLoadout
        ? "The explicitly whole-loadout observation proves that measured whole-loadout DPS fell. The guarded evidence proves only that one or more scoped components rose. Those facts can coexist; neither identifies the cause of the whole-loadout loss or quantifies how much the component contributed."
        : "The aligned observation proves that DPS for the declared actor/skill fell. Matching guarded evidence proves only that a component inside that same scope rose. Those facts can coexist; neither establishes whole-loadout DPS nor identifies the cause of the scoped loss.",
    nextExperiment:
      wholeLoadout
        ? "Keep the improved guarded component fixed, reverse one other changed layer at a time, and repeat the identical whole-loadout DPS scenario."
        : "Keep the improved matching component fixed, reverse one other change in the same actor/skill scope at a time, and repeat the identical scoped DPS scenario.",
    evidence: [
      metricEvidence(observedMetric),
      `Reconciliation scope: ${wholeLoadout ? "explicit whole loadout" : `actor ${observedScope.actorId} · skill ${observedScope.skillId}`}`,
      ...guardedGains.slice(0, 3).map((finding) =>
        finding.metric
          ? `${finding.title}: ${metricEvidence(finding.metric)}`
          : `${finding.title}: guarded component direction is gain`),
      "Reconciliation only; no causal attribution and no multiplication of partial evidence into observed DPS.",
    ],
    metric: observedMetric,
    target: { view: "diagnosis" },
    claims: { isNetDps: wholeLoadout, isEhp: false },
  }];
}

function modeledFindings(
  before: AnalyzedLoadout,
  after: AnalyzedLoadout,
): ActionFinding[] {
  const beforeSnapshot = before.snapshot;
  const afterSnapshot = after.snapshot;
  if (!beforeSnapshot
      || !afterSnapshot
      || !modeledScenarioCompatible(before, after)) {
    return [];
  }
  const steps = buildRollbackEvaluations(beforeSnapshot, afterSnapshot)
    .filter((step) => Math.abs(step.delta) >= 0.5)
    .sort((left, right) =>
      Math.abs(right.delta) - Math.abs(left.delta)
      || left.id.localeCompare(right.id));
  return steps.map((step, index) => {
    const direction = step.delta > 0 ? "loss" as const : "gain" as const;
    const fields = step.fields.map((field) =>
      `${field.label}: ${compactNumber(field.before)} → ${compactNumber(field.after)}`);
    return {
      id: `modeled:${step.id}`,
      priority: 300 - index,
      proof: "modeled-scenario",
      domain: "damage",
      direction,
      label: "Modeled DPS layer",
      title: direction === "loss"
        ? `${step.label} is a modeled rollback candidate`
        : `${step.label} is a modeled gain worth protecting`,
      explanation:
        `${step.description} Starting from the after-state, this counterfactual restores only the complete ${step.label.toLocaleLowerCase()} layer from before. It is independent of waterfall display order, but grouped edits can still be coupled or illegal in game.`,
      nextExperiment: direction === "loss"
        ? MODELED_EXPERIMENTS[step.id]
          ?? "Change this formula layer by itself and repeat the same shared scenario."
        : `Keep the after-state ${step.label.toLocaleLowerCase()} fixed while testing each recovery candidate separately.`,
      evidence: [
        `${signed(step.delta)} DPS when this complete layer alone is rolled back`,
        ...fields,
        "Fixed shared scenario; not an observed result or a claim that every grouped field can be reverted independently.",
      ],
      metric: {
        label: step.label,
        before: step.afterDps,
        after: step.rollbackDps,
        delta: step.delta,
        relativeDelta: relativeDelta(step.afterDps, step.rollbackDps),
        unit: "fixed-scenario rollback DPS",
      },
      target: { view: "formula" },
      claims: { isNetDps: false, isEhp: false },
    };
  });
}

function primaryActorSkill(loadout: AnalyzedLoadout) {
  return loadout.skills.find((skill) =>
    skill.kind === "active" && skill.enabled)
    ?? loadout.skills.find((skill) => skill.kind === "active")
    ?? null;
}

function modeledScenarioCompatible(
  before: AnalyzedLoadout,
  after: AnalyzedLoadout,
) {
  if (!before.snapshot || !after.snapshot || !before.model || !after.model) {
    return false;
  }
  const leftSkill = primaryActorSkill(before);
  const rightSkill = primaryActorSkill(after);
  const sameSkill = leftSkill && rightSkill
    ? (leftSkill.guid || leftSkill.name) === (rightSkill.guid || rightSkill.name)
    : leftSkill === rightSkill;
  const canonicalEnemy = (value: Record<string, number>) =>
    JSON.stringify(Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right)));
  return before.hero === after.hero
    && before.model.confidence === after.model.confidence
    && before.model.modelId === after.model.modelId
    && before.model.modelVersion === after.model.modelVersion
    && before.model.scenarioFingerprint === after.model.scenarioFingerprint
    && before.model.actorId === after.model.actorId
    && before.model.skillId === after.model.skillId
    && canonicalEnemy(before.snapshot.enemy)
      === canonicalEnemy(after.snapshot.enemy)
    && sameSkill
    && before.sourceNote?.startsWith("Calibrated teaching") === true
    && after.sourceNote?.startsWith("Calibrated teaching") === true;
}

function bingFindings(
  before: AnalyzedLoadout,
  after: AnalyzedLoadout,
): ActionFinding[] {
  const left = before.bingIntrinsicEvidence;
  const right = after.bingIntrinsicEvidence;
  if (!left || !right) return [];

  const findings: ActionFinding[] = [];
  const hitMetric: ActionMetric = {
    label: "Normal weapon-sourced Hammer hit",
    before: left.normalWeaponSourcedPerHit.total.average,
    after: right.normalWeaponSourcedPerHit.total.average,
    delta:
      right.normalWeaponSourcedPerHit.total.average
      - left.normalWeaponSourcedPerHit.total.average,
    relativeDelta: relativeDelta(
      left.normalWeaponSourcedPerHit.total.average,
      right.normalWeaponSourcedPerHit.total.average,
    ),
    unit: "raw damage / instance",
  };
  const hitDirection = hitMetric.delta < -EPSILON
    ? "loss" as const
    : hitMetric.delta > EPSILON
      ? "gain" as const
      : "neutral" as const;
  if (hitDirection !== "neutral") {
    findings.push({
      id: "bing:weapon-sourced-hit",
      priority: hitDirection === "loss" ? 240 : 185,
      proof: "guarded-partial",
      domain: "damage",
      direction: hitDirection,
      label: "Guarded per-hit slice",
      title: hitDirection === "loss"
        ? "The weapon-sourced Hammer foundation fell"
        : "The weapon-sourced Hammer foundation rose",
      explanation:
        "This is equipped-weapon damage after Hammer's skill coefficient and intrinsic conversion. It feeds each matching Hammer hit instance, but excludes global modifiers, critical strikes, target mitigation, contact count, and cadence.",
      nextExperiment: hitDirection === "loss"
        ? "A/B test the weapon base and local weapon affixes first, with the skill level and every other loadout system held constant."
        : "Keep this stronger per-hit foundation fixed while testing projectile quantity, supports, and cadence one at a time.",
      evidence: [
        metricEvidence(hitMetric),
        `Charged slice: ${compactNumber(left.demolisherChargedWeaponSourcedPerHit.total.average)} → ${compactNumber(right.demolisherChargedWeaponSourcedPerHit.total.average)} raw damage / instance`,
        "Weapon-sourced slice only; not total hit or DPS.",
      ],
      evidenceScope: {
        actorId: right.heroId,
        skillId: right.skillId,
      },
      metric: hitMetric,
      target: { view: "formula" },
      claims: { isNetDps: false, isEhp: false },
    });
  }

  const leftTopology = left.topology;
  const rightTopology = right.topology;
  if (leftTopology.status === "calculated-partial"
      && rightTopology.status === "calculated-partial") {
    const emissionMetric: ActionMetric = {
      label: "Source-visible emitted projectiles",
      before: leftTopology.expectedEmittedProjectilesPerThrow,
      after: rightTopology.expectedEmittedProjectilesPerThrow,
      delta:
        rightTopology.expectedEmittedProjectilesPerThrow
        - leftTopology.expectedEmittedProjectilesPerThrow,
      relativeDelta: relativeDelta(
        leftTopology.expectedEmittedProjectilesPerThrow,
        rightTopology.expectedEmittedProjectilesPerThrow,
      ),
      unit: "emitted / throw",
    };
    const emissionDirection = emissionMetric.delta < -EPSILON
      ? "loss" as const
      : emissionMetric.delta > EPSILON
        ? "gain" as const
        : "neutral" as const;
    if (emissionDirection !== "neutral") {
      findings.push({
        id: "bing:emitted-projectiles",
        priority: emissionDirection === "loss" ? 230 : 180,
        proof: "guarded-partial",
        domain: "damage",
        direction: emissionDirection,
        label: "Guarded emission slice",
        title: emissionDirection === "loss"
          ? "Blast Nova emits fewer projectiles per throw"
          : "Blast Nova emits more projectiles per throw",
        explanation:
          "The season trait and installed quantity sources prove emission count. Emitted projectiles are not the same as projectiles that hit one target, so this direction is never relabeled as DPS.",
        nextExperiment:
          "Test target size, distance, projectile spread, and overlap before valuing this quantity as landed hits; keep the per-hit foundation unchanged during that test.",
        evidence: [
          metricEvidence(emissionMetric),
          `${compactNumber(leftTopology.expectedBombsPerThrow)} → ${compactNumber(rightTopology.expectedBombsPerThrow)} expected bombs / throw`,
          `${compactNumber(leftTopology.projectilesPerBomb)} → ${compactNumber(rightTopology.projectilesPerBomb)} projectiles / bomb`,
          "Emissions only; target contacts and Shotgun application are unresolved.",
        ],
        evidenceScope: {
          actorId: right.heroId,
          skillId: right.skillId,
        },
        metric: emissionMetric,
        target: { view: "formula" },
        claims: { isNetDps: false, isEhp: false },
      });
    }
    if (hitDirection !== "neutral"
        && emissionDirection !== "neutral"
        && hitDirection !== emissionDirection) {
      findings.push({
        id: "bing:hit-emission-tradeoff",
        priority: 260,
        proof: "guarded-partial",
        domain: "damage",
        direction: "tradeoff",
        label: "Competing guarded slices",
        title: "Per-hit damage and emitted quantity moved in opposite directions",
        explanation:
          "Neither slice can settle the trade alone. Multiplying emissions by the per-hit value would silently assume that every emitted projectile lands and that component overlap is fixed.",
        nextExperiment:
          "Hold the weapon-sourced hit constant and measure effective single-target contacts, then hold geometry constant and compare the hit foundation.",
        evidence: [
          metricEvidence(hitMetric),
          metricEvidence(emissionMetric),
          "Landed-hit geometry is the missing bridge.",
        ],
        evidenceScope: {
          actorId: right.heroId,
          skillId: right.skillId,
        },
        target: { view: "formula" },
        claims: { isNetDps: false, isEhp: false },
      });
    }
  }
  return findings;
}

function bingFactorLedgerFindings(
  before: AnalyzedLoadout,
  after: AnalyzedLoadout,
): ActionFinding[] {
  if (!before.bingFactorLedger || !after.bingFactorLedger) return [];
  const comparison = compareBingFactorLedgerLoadoutDisplays(
    before.bingFactorLedger,
    after.bingFactorLedger,
  );
  if (comparison.status !== "calculated-partial") return [];
  const findings: ActionFinding[] = [];
  for (const component of [
    "ordinary-hit",
    "projectile-explosion-hit",
  ] as const) {
    const rows = comparison.hitScenarioRows.flatMap((row) =>
      row.status === "calculated-partial"
      && row.component === component
      && row.direction !== "unchanged"
        ? [row]
        : []);
    const unavailableConditions = comparison.hitScenarioRows.flatMap((row) =>
      row.status === "not-calculated" && row.component === component
        ? row.blockers.map((blocker) =>
            `${row.condition} unavailable: ${blocker.message}${blocker.evidence ? ` (${blocker.evidence})` : ""}`)
        : []);
    if (!rows.length) continue;
    const usedFactorLabels = new Set(
      rows.flatMap((row) => row.factorLabels),
    );
    const factorEvidence = comparison.factorRows
      .flatMap((row) =>
        row.status === "calculated-partial"
        && row.factorId !== "source-visible-emissions"
        && row.direction !== "unchanged"
        && usedFactorLabels.has(row.label)
          ? [row]
          : [])
      .map((row) =>
        `${row.label}: ${row.before.formatted} → ${row.after.formatted} (${row.deltaLabel})`);
    const directions = new Set(rows.map((row) => row.direction));
    const direction = directions.size > 1
      ? "tradeoff" as const
      : rows[0].direction === "loss"
        ? "loss" as const
        : "gain" as const;
    const componentLabel = component === "ordinary-hit"
      ? "ordinary Hammer hit component"
      : "projectile-explosion hit component";
    findings.push({
      id: `bing-factor-ledger:${component}`,
      priority: direction === "loss" ? 252 : direction === "tradeoff" ? 248 : 192,
      proof: "guarded-partial",
      domain: "damage",
      direction,
      label: "Component-scoped factor ledger",
      title: direction === "tradeoff"
        ? `The ${componentLabel} trades non-stationary damage for stationary damage`
        : direction === "loss"
          ? `Known factors lower the ${componentLabel}`
          : `Known factors raise the ${componentLabel}`,
      explanation:
        "This ratio composes only the weapon foundation and confirmed factors that apply to this exact hit component and stationary condition. Emitted projectile count is deliberately excluded, and the result is neither a complete hit nor target DPS.",
      nextExperiment:
        "Measure stationary uptime separately, then compare ordinary and explosion contacts with the same target size, distance, and projectile geometry.",
      evidence: [
        ...rows.map((row) =>
          `${row.condition}: ×${compactNumber(row.ratio)} (${row.deltaLabel}); ${row.factorLabels.join(" × ")}`),
        ...factorEvidence,
        ...unavailableConditions,
        "Source-visible emissions remain a separate lane and are never multiplied into these hit ratios.",
      ],
      evidenceScope: {
        actorId: comparison.evidence.after.heroId,
        skillId: comparison.evidence.after.skillId,
      },
      target: { view: "formula" },
      claims: { isNetDps: false, isEhp: false },
    });
  }
  return findings;
}

function actionDamagePair(
  before: {
    foundation: {
      rawDamageAtDeterministicFullContact: number | null;
      rawDamagePerContact: number | null;
    };
    knownDamage: {
      status: "calculated-partial" | "not-damaging";
      knownDeterministicFullContact: number | null;
      knownPerContact: number | null;
      factors: Array<{ sourceName: string; label: string; multiplier: number }>;
      excluded: Array<{ code: string; message: string; evidence?: string }>;
    };
  },
  after: {
    foundation: {
      rawDamageAtDeterministicFullContact: number | null;
      rawDamagePerContact: number | null;
    };
    knownDamage: {
      status: "calculated-partial" | "not-damaging";
      knownDeterministicFullContact: number | null;
      knownPerContact: number | null;
      factors: Array<{ sourceName: string; label: string; multiplier: number }>;
      excluded: Array<{ code: string; message: string; evidence?: string }>;
    };
  },
) {
  if (!knownMinionDamageCoverageMatches(
    before.knownDamage,
    after.knownDamage,
  ) || before.knownDamage.status !== "calculated-partial") {
    return null;
  }
  const beforeKnownFull = before.knownDamage.knownDeterministicFullContact;
  const afterKnownFull = after.knownDamage.knownDeterministicFullContact;
  if (beforeKnownFull != null && afterKnownFull != null) {
    return {
      beforeValue: beforeKnownFull,
      afterValue: afterKnownFull,
      contactScope: "known deterministic contacts",
      basis: "known-envelope" as const,
      beforeFactors: before.knownDamage.factors,
      afterFactors: after.knownDamage.factors,
    };
  }
  const beforeKnownContact = before.knownDamage.knownPerContact;
  const afterKnownContact = after.knownDamage.knownPerContact;
  if (beforeKnownContact == null || afterKnownContact == null) return null;
  return {
    beforeValue: beforeKnownContact,
    afterValue: afterKnownContact,
    contactScope: "per contact",
    basis: "known-envelope" as const,
    beforeFactors: before.knownDamage.factors,
    afterFactors: after.knownDamage.factors,
  };
}

function minionFoundationFindings(
  before: AnalyzedLoadout,
  after: AnalyzedLoadout,
): ActionFinding[] {
  const left = new Map(
    (before.summonEvidence ?? []).map((summon) => [summon.skillId, summon]),
  );
  const findings: ActionFinding[] = [];
  for (const summon of after.summonEvidence ?? []) {
    const earlier = left.get(summon.skillId);
    if (!earlier) continue;
    const earlierActions = new Map(
      earlier.actions.map((action) => [action.actionId, action]),
    );
    const changes = summon.actions.flatMap((action) => {
      const previous = earlierActions.get(action.actionId);
      if (!previous) return [];
      const pair = actionDamagePair(previous, action);
      if (!pair
          || pair.beforeValue == null
          || pair.afterValue == null
          || Math.abs(pair.afterValue - pair.beforeValue) < EPSILON) {
        return [];
      }
      return [{
        actionId: action.actionId,
        actionName: action.actionName,
        beforeValue: pair.beforeValue,
        afterValue: pair.afterValue,
        relative: relativeDelta(pair.beforeValue, pair.afterValue),
        contactScope: pair.contactScope,
        basis: pair.basis,
        beforeFactors: pair.beforeFactors,
        afterFactors: pair.afterFactors,
      }];
    });
    if (!changes.length) continue;
    const losses = changes.filter((change) => change.afterValue < change.beforeValue);
    const gains = changes.filter((change) => change.afterValue > change.beforeValue);
    const direction = losses.length && gains.length
      ? "tradeoff" as const
      : losses.length
        ? "loss" as const
        : "gain" as const;
    const representative = [...changes].sort((leftChange, rightChange) =>
      Math.abs(rightChange.relative ?? 0) - Math.abs(leftChange.relative ?? 0))[0];
    const beforeFactorMap = new Map(
      representative.beforeFactors.map((factor) => [
        `${factor.sourceName}\u0000${factor.label}`,
        factor,
      ]),
    );
    const changedFactors = representative.afterFactors.flatMap((factor) => {
      const earlier = beforeFactorMap.get(
        `${factor.sourceName}\u0000${factor.label}`,
      );
      return earlier
        && Math.abs(earlier.multiplier - factor.multiplier) > EPSILON
        ? [{ before: earlier, after: factor }]
        : [];
    });
    findings.push({
      id: `minion-foundation:${summon.skillId}`,
      priority: direction === "loss" ? 235 : direction === "tradeoff" ? 225 : 175,
      proof: "guarded-partial",
      domain: "damage",
      direction,
      label: "Guarded minion action slice",
      title: direction === "loss"
        ? `${summon.skillName} known action components fell`
        : direction === "gain"
          ? `${summon.skillName} known action components rose`
          : `${summon.skillName} known action components traded off`,
      explanation:
        representative.basis === "known-envelope"
          ? "This slice multiplies the source-pinned minion actor/action foundation by confirmed unconditional additional factors that apply to that action. It still excludes uncompiled supports, inherited pools, AI frequency, Growth/Breeze state, target mitigation, and overlap."
          : "This fallback slice is the source-pinned minion actor base multiplied by each action coefficient. It excludes supports, inherited modifier pools, AI frequency, Growth/Breeze state, target mitigation, and overlap.",
      nextExperiment:
        changedFactors.length === 1
          ? `Duplicate the loadout and test only ${changedFactors[0].after.sourceName} (${changedFactors[0].after.label}: ×${compactNumber(changedFactors[0].before.multiplier)} → ×${compactNumber(changedFactors[0].after.multiplier)}), with every other socket and runtime condition held constant.`
          : "Hold supports and runtime state constant while testing the summon level or action source that changed, then re-import the duplicate loadout.",
      evidence: [
        ...changes.slice(0, 4).map((change) =>
          `${change.actionName}: ${compactNumber(change.beforeValue)} → ${compactNumber(change.afterValue)} ${change.basis === "known-envelope" ? "known unmitigated component" : "raw foundation"} · ${change.contactScope}${change.relative == null ? "" : ` (${signedPercent(change.relative * 100)})`}`),
        ...(representative.basis === "known-envelope"
          ? [
              `Before factors: ${representative.beforeFactors.map((factor) => `${factor.sourceName} ${factor.label} ×${compactNumber(factor.multiplier)}`).join(" · ") || "none"}`,
              `After factors: ${representative.afterFactors.map((factor) => `${factor.sourceName} ${factor.label} ×${compactNumber(factor.multiplier)}`).join(" · ") || "none"}`,
            ]
          : []),
        "Known unmitigated component only; not total minion hit damage or DPS.",
      ],
      evidenceScope: {
        actorId: summon.skillId,
        skillId: summon.skillId,
        actionIds: changes.map((change) => change.actionId),
      },
      metric: {
        label: `${summon.skillName} · ${representative.actionName}`,
        before: representative.beforeValue,
        after: representative.afterValue,
        delta: representative.afterValue - representative.beforeValue,
        relativeDelta: representative.relative,
        unit: representative.basis === "known-envelope"
          ? `known unmitigated component · ${representative.contactScope}`
          : `raw foundation · ${representative.contactScope}`,
      },
      target: { view: "formula" },
      claims: { isNetDps: false, isEhp: false },
    });
  }
  return findings;
}

function flatEffect(effect: SupportEffectEvidence): FlatEffect {
  return {
    id: effect.id,
    label: effect.label,
    value: effect.value,
    display: effect.display,
    application: effect.application,
    scope: effect.scope,
    condition: effect.condition,
  };
}

function flatMinionEffect(
  effect: MinionSupportSourceEvidence["effects"][number],
): FlatEffect {
  return {
    id: effect.id,
    label: effect.label,
    value: effect.value,
    display: effect.display,
    application: effect.application,
    scope: effect.scope,
    condition: effect.condition,
  };
}

function flattenSupports(
  loadout: AnalyzedLoadout,
  includePlayerSupports: boolean,
  minionActorIds: ReadonlySet<string> | null,
): FlatSupport[] {
  const rawSupport = (
    skillId: string,
    skillName: string,
    socketIndex: number,
    socketId: string,
  ) => {
    const skill = loadout.skills.find((candidate) =>
      candidate.guid === skillId
      || candidate.name === skillName);
    return skill?.supports.find((candidate, index) => {
      const slot = candidate.slot?.trim() ?? String(index);
      return slot === String(socketIndex)
        || slot === socketId
        || `support:${slot}` === socketId;
    });
  };
  const supports: FlatSupport[] = (includePlayerSupports
    ? loadout.supportEvidence ?? []
    : []).map((support: SupportSocketEvidence) => {
    const raw = rawSupport(
      support.skillId,
      support.skillName,
      support.socketIndex,
      support.socketId,
    );
    return {
      key: supportSocketIdentity(support),
      actorId: support.actorId,
      actor: support.actorName,
      skillId: support.skillId,
      skill: support.skillName,
      socketIndex: support.socketIndex,
      socketId: support.socketId,
      supportId: support.supportId,
      supportName: support.supportName ?? "Unknown support",
      supportType: raw?.type ?? "unknown",
      status: support.status,
      level: support.level ?? raw?.level ?? null,
      tier: support.tier ?? raw?.tier ?? null,
      rank: support.rank ?? raw?.rank ?? null,
      rollValues: [
        ...(support.rollValues ?? raw?.rollValues ?? []),
      ],
      rawFingerprint:
        support.rawFingerprint
        ?? null,
      effects: support.effects.map(flatEffect),
      blockers: [...support.blockers],
    };
  });
  for (const summon of loadout.summonEvidence ?? []) {
    if (!minionActorIds?.has(summon.skillId)) continue;
    for (const support of summon.supports) {
      const raw = rawSupport(
        support.skillId,
        support.skillName,
        support.socketIndex,
        support.socketId,
      );
      supports.push({
        key: supportSocketIdentity(support),
        actorId: support.actorId,
        actor: support.actorName,
        skillId: support.skillId,
        skill: support.skillName,
        socketIndex: support.socketIndex,
        socketId: support.socketId,
        supportId: support.supportId,
        supportName: support.supportName ?? "Unknown support",
        supportType:
          support.supportType
          ?? raw?.type
          ?? "unknown",
        status: support.status,
        level: support.level ?? raw?.level ?? null,
        tier: support.tier ?? raw?.tier ?? null,
        rank: support.rank ?? raw?.rank ?? null,
        rollValues: [
          ...(support.rollValues ?? raw?.rollValues ?? []),
        ],
        rawFingerprint:
          support.rawFingerprint
          ?? null,
        effects: support.effects.map(flatMinionEffect),
        blockers: [...support.blockers],
      });
    }
  }
  return supports;
}

function supportFingerprint(support: FlatSupport) {
  return JSON.stringify({
    supportId: support.supportId,
    supportName: support.supportName,
    supportType: support.supportType,
    status: support.status,
    level: support.level,
    tier: support.tier,
    rank: support.rank,
    rollValues: support.rollValues,
    rawFingerprint: support.rawFingerprint,
    effects: support.effects,
    blockers: support.blockers,
  });
}

function supportConfigurationFingerprint(support: FlatSupport) {
  return JSON.stringify({
    supportId: support.supportId,
    supportType: support.supportType,
    level: support.level,
    tier: support.tier,
    rank: support.rank,
    rollValues: support.rollValues,
    rawFingerprint: support.rawFingerprint,
  });
}

function supportConfigurationLabel(support: FlatSupport) {
  return [
    support.level == null ? "" : `L${support.level}`,
    support.supportType === "unknown"
      ? ""
      : `type ${support.supportType}`,
    support.tier == null ? "" : `tier ${support.tier}`,
    support.rank == null ? "" : `rank ${support.rank}`,
    support.rollValues.length
      ? `rolls [${support.rollValues.join(", ")}]`
      : "",
  ].filter(Boolean).join(" · ")
    || "no imported type, level, tier, rank, or rolls";
}

function supportMoveFindings(
  moves: Array<SupportInstanceChange<FlatSupport>>,
): ActionFinding[] {
  const groups = new Map<
    string,
    Array<{ before: FlatSupport; after: FlatSupport }>
  >();
  for (const move of moves) {
    if (!move.before
        || !move.after
        || move.before.status !== "source-terms"
        || move.after.status !== "source-terms") {
      continue;
    }
    const key = `${move.before.actorId}\u0000${move.before.skillId}`;
    groups.set(key, [
      ...(groups.get(key) ?? []),
      { before: move.before, after: move.after },
    ]);
  }
  return [...groups.entries()].flatMap(([key, group]) => {
    const reference = group[0]?.after;
    if (!reference) return [];
    const effects = group.flatMap((move) => move.before.effects);
    const offensive = effects.some((effect) =>
      OFFENSIVE_APPLICATIONS.has(effect.application));
    const survival = effects.some((effect) =>
      SURVIVAL_APPLICATIONS.has(effect.application));
    const domain: ActionDomain = offensive
      ? "damage"
      : survival
        ? "survival"
        : "build";
    const actorSkill = reference.actor === reference.skill
      ? reference.actor
      : `${reference.skill} (${reference.actor})`;
    const ordered = [...group].sort((a, b) =>
      a.before.socketIndex - b.before.socketIndex
      || a.before.supportName.localeCompare(b.before.supportName));
    const count = ordered.length;
    return [{
      id: `support:reordered:${stableToken(key)}:${ordered
        .map((move) =>
          `${move.before.socketIndex}-${move.after.socketIndex}-${move.before.supportId}`)
        .join(":")}`,
      priority: offensive ? 108 : survival ? 88 : 82,
      proof: "source-term" as const,
      domain,
      direction: "neutral" as const,
      label: "Compiled support socket layout",
      title:
        `${count} unchanged support${count === 1 ? " moved" : "s moved"} between sockets on ${actorSkill}`,
      explanation:
        "The compiled support terms and source configuration are identical before and after; only socket placement changed. Treat the layout as one edit. A position-dependent interaction outside the compiled table remains possible, so this is not a DPS or EHP result.",
      nextExperiment:
        "Restore the entire before socket layout in one duplicate-loadout test. If the observed result changes, investigate a socket-position or support-interaction mechanic instead of attributing it to the unchanged source-term values.",
      evidence: [
        ...ordered.map((move) =>
          `${move.before.supportName}: socket ${move.before.socketIndex + 1} → socket ${move.after.socketIndex + 1}`),
        "Compiled support terms, type, level, tier, rank, and rolls are unchanged.",
      ],
      evidenceRefs: [...new Set(ordered.flatMap((move) => [
        supportInstanceEvidenceRef("before", move.before),
        supportInstanceEvidenceRef("after", move.after),
      ]))],
      target: { view: "changes" as const, section: "skills" as const },
      claims: { isNetDps: false, isEhp: false as const },
    }];
  });
}

function unresolvedSupportMoveFindings(
  moves: Array<SupportInstanceChange<FlatSupport>>,
): ActionFinding[] {
  return moves.flatMap((move) => {
    if (!move.before
        || !move.after
        || move.before.status === "source-terms"
        || move.after.status === "source-terms") {
      return [];
    }
    const reference = move.after;
    const actorSkill = reference.actor === reference.skill
      ? reference.actor
      : `${reference.skill} (${reference.actor})`;
    const blockers = [...new Set([
      ...move.before.blockers,
      ...move.after.blockers,
    ])];
    const configurationChanged =
      supportConfigurationFingerprint(move.before)
      !== supportConfigurationFingerprint(move.after);
    return [{
      id:
        `support:unresolved-move:${stableToken([
          move.before.key,
          move.after.key,
          reference.supportId,
        ].join("\u0000"))}`,
      priority: 105,
      proof: "structural" as const,
      domain: "build" as const,
      direction: "neutral" as const,
      label: "Unresolved support socket layout",
      title:
        `${reference.supportName} moved from socket ${move.before.socketIndex + 1} to socket ${move.after.socketIndex + 1}${
          configurationChanged ? " and changed unresolved configuration" : ""
        } on ${actorSkill}`,
      explanation:
        `The imported identity is unchanged, so this is one support move rather than a removal plus an addition.${configurationChanged ? " Its raw support configuration also changed." : ""} Its source terms are outside guarded coverage, so no damage or survival direction is assigned.`,
      nextExperiment:
        configurationChanged
          ? "Resolve guarded compiler coverage first. Then use separate duplicate loadouts to test the raw configuration in one fixed legal socket and the socket move with configuration held fixed."
          : "Restore or place the support in a socket accepted by the guarded compiler first. Test position only if both candidate sockets are legal; an invalid destination is unavailable evidence, not an A/B experiment.",
      evidence: [
        `Moved: socket ${move.before.socketIndex + 1} → socket ${move.after.socketIndex + 1}`,
        `Compiler coverage: ${move.before.status} → ${move.after.status}`,
        ...(configurationChanged
          ? [
              `Before configuration: ${supportConfigurationLabel(move.before)}`,
              `After configuration: ${supportConfigurationLabel(move.after)}`,
            ]
          : []),
        ...blockers.map((blocker) => `Blocker: ${blocker}`),
        "Imported identity only; no compiled source-term or DPS claim.",
      ],
      evidenceRefs: [
        supportInstanceEvidenceRef("before", move.before),
        supportInstanceEvidenceRef("after", move.after),
      ],
      target: { view: "changes" as const, section: "skills" as const },
      claims: { isNetDps: false, isEhp: false as const },
    }];
  });
}

function effectEvidence(label: string, effects: FlatEffect[]) {
  if (!effects.length) return `${label}: no compiled source terms`;
  return `${label}: ${effects.map((effect) =>
    `${effect.display} ${effect.label}${effect.condition ? ` (${effect.condition})` : ""}`).join(" · ")}`;
}

function comparableSupportDirection(
  before: FlatSupport,
  after: FlatSupport,
): "weaker-input" | "stronger-input" | "risk" {
  if (before.effects.length !== after.effects.length) return "risk";
  const left = new Map(before.effects.map((effect) => [effect.id, effect]));
  const deltas = after.effects.flatMap((effect) => {
    const earlier = left.get(effect.id);
    if (!earlier
        || earlier.application !== effect.application
        || earlier.scope !== effect.scope
        || earlier.condition !== effect.condition
        || earlier.label !== effect.label) {
      return [Number.NaN];
    }
    if (Math.abs(effect.value - earlier.value) < EPSILON) {
      return [];
    }
    if (!MONOTONIC_OFFENSIVE_APPLICATIONS.has(effect.application)) {
      return [Number.NaN];
    }
    return [effect.value - earlier.value];
  });
  if (!deltas.length || deltas.some((delta) => !Number.isFinite(delta))) {
    return "risk";
  }
  if (deltas.every((delta) => delta > 0)) return "stronger-input";
  if (deltas.every((delta) => delta < 0)) return "weaker-input";
  return "risk";
}

function supportFindings(
  before: AnalyzedLoadout,
  after: AnalyzedLoadout,
): ActionFinding[] {
  const comparePlayerSupports =
    before.supportEvidenceStatus === "source-terms"
    && after.supportEvidenceStatus === "source-terms";
  const beforeMinionIds = new Set(
    (before.summonEvidence ?? []).map((summon) => summon.skillId),
  );
  const afterMinionIds = new Set(
    (after.summonEvidence ?? []).map((summon) => summon.skillId),
  );
  const commonMinionIds = new Set(
    [...beforeMinionIds].filter((skillId) => afterMinionIds.has(skillId)),
  );
  const changes = compareSupportInstances(
    flattenSupports(before, comparePlayerSupports, commonMinionIds),
    flattenSupports(after, comparePlayerSupports, commonMinionIds),
    supportFingerprint,
  );
  const moves = changes.filter((change) =>
    change.kind === "moved"
    || change.kind === "moved-and-changed");
  const findings: ActionFinding[] = [
    ...supportMoveFindings(
      moves.filter((change) => change.kind === "moved"),
    ),
    ...unresolvedSupportMoveFindings(moves),
  ];
  for (const change of changes) {
    if (change.kind === "unchanged" || change.kind === "moved") continue;
    const earlier = change.before ?? undefined;
    const current = change.after ?? undefined;
    const reference = current ?? earlier;
    if (!reference) continue;
    const effects = [...(earlier?.effects ?? []), ...(current?.effects ?? [])];
    const offensive = effects.filter((effect) =>
      OFFENSIVE_APPLICATIONS.has(effect.application));
    const survival = effects.filter((effect) =>
      SURVIVAL_APPLICATIONS.has(effect.application));
    if (!offensive.length && !survival.length) continue;
    const domain = offensive.length ? "damage" as const : "survival" as const;
    const direction = earlier && current
      && earlier.supportId === current.supportId
      ? comparableSupportDirection(earlier, current)
      : "risk" as const;
    const actorSkill = reference.actor === reference.skill
      ? reference.actor
      : `${reference.skill} (${reference.actor})`;
    const isSocketSwap = change.kind === "replaced";
    const movedAndChanged = change.kind === "moved-and-changed";
    const compilationTransition = earlier && current
      && earlier.supportId === current.supportId
      && earlier.status !== current.status
      ? current.status === "unsupported"
        ? "became-unsupported" as const
        : "became-supported" as const
      : null;
    const supportTransition = isSocketSwap
      ? `${earlier!.supportName} → ${current!.supportName}`
      : reference.supportName;
    const socketLabel = `socket ${reference.socketIndex + 1}`;
    const title = compilationTransition === "became-unsupported"
      ? movedAndChanged
        ? `${reference.supportName} moved from socket ${earlier!.socketIndex + 1} to socket ${current!.socketIndex + 1} and became unavailable to the guarded compiler on ${actorSkill}`
        : `${reference.supportName} became unavailable to the guarded compiler on ${actorSkill}`
      : compilationTransition === "became-supported"
        ? movedAndChanged
          ? `${reference.supportName} moved from socket ${earlier!.socketIndex + 1} to socket ${current!.socketIndex + 1} and entered guarded coverage on ${actorSkill}`
          : `${reference.supportName} entered guarded coverage on ${actorSkill}`
      : isSocketSwap
      ? `${supportTransition} on ${actorSkill}`
      : movedAndChanged
        ? `${reference.supportName} moved from socket ${earlier!.socketIndex + 1} to socket ${current!.socketIndex + 1} and ${
          direction === "stronger-input"
            ? "gained strength"
            : direction === "weaker-input"
              ? "lost strength"
              : "changed configuration"
        } on ${actorSkill}`
      : change.kind === "added"
        ? `${reference.supportName} was added to ${actorSkill}`
        : change.kind === "removed"
          ? `${reference.supportName} was removed from ${actorSkill}`
          : direction === "stronger-input"
            ? `${reference.supportName} gained a stronger compiled source term on ${actorSkill}`
            : direction === "weaker-input"
              ? `${reference.supportName} lost strength in a compiled source term on ${actorSkill}`
              : `${reference.supportName} changed on ${actorSkill}`;
    const nextExperiment = compilationTransition === "became-unsupported"
      ? movedAndChanged
        ? `Return ${reference.supportName} to its previously compiled socket ${earlier!.socketIndex + 1} and re-import. The guarded compiler rejected socket ${current!.socketIndex + 1}, so do not test its configuration while holding that illegal destination.`
        : `Restore ${reference.supportName}'s previously compiled source record in ${socketLabel} and re-import before assigning any damage or survival direction.`
      : compilationTransition === "became-supported"
        ? movedAndChanged
          ? `Keep ${reference.supportName} in the newly compiled socket ${current!.socketIndex + 1}, then compare it against a duplicate with the prior layout. Treat the coverage change itself as unresolved until an in-game result is recorded.`
          : `Duplicate the loadout and test only the source-record correction that brought ${reference.supportName} into guarded coverage.`
      : isSocketSwap
      ? `A/B test only the ${supportTransition} swap in ${socketLabel} on ${actorSkill}; keep every other socket and actor condition fixed.`
      : movedAndChanged
        ? `First restore ${reference.supportName}'s before configuration while keeping it in socket ${current!.socketIndex + 1}; then test its socket position separately with the configuration fixed.`
      : change.kind === "removed"
        ? `A/B test restoring ${reference.supportName} on ${actorSkill} while holding the other sockets and actor state constant.`
        : change.kind === "added"
          ? `A/B test ${reference.supportName} by itself on ${actorSkill} before keeping the rest of the loadout changes.`
          : `Compare only the changed level, tier, rank, or roll on ${reference.supportName} in ${socketLabel}; do not change another socket in the same test.`;
    const findingSupportId = isSocketSwap
      ? `${earlier!.supportId}->${current!.supportId}`
      : reference.supportId;
    const referenceKeys = [...new Set([
      ...(earlier
        ? [supportInstanceEvidenceRef("before", earlier)]
        : []),
      ...(current
        ? [supportInstanceEvidenceRef("after", current)]
        : []),
    ])];
    const eventKey = [
      change.kind,
      earlier?.key ?? "",
      current?.key ?? "",
    ].join("\u0000");
    findings.push({
      id:
        `support:${change.kind}:${stableToken(eventKey)}:${findingSupportId}`,
      priority:
        domain === "damage"
          ? change.kind === "removed"
            ? 220
            : direction === "weaker-input"
              ? 215
              : change.kind === "changed"
                  || change.kind === "moved-and-changed"
                ? 170
                : 160
          : change.kind === "removed" ? 150 : 120,
      proof: "source-term",
      domain,
      direction,
      label: domain === "damage"
        ? "Compiled support source terms"
        : "Compiled survival source terms",
      title,
      explanation: compilationTransition
        ? "Guarded compiler coverage changed between the two sockets. Missing compiled terms are unavailable evidence, not zero-valued effects or proof of a configuration loss; follow the emitted blocker before interpreting this support."
        : domain === "damage"
        ? "The season support table proves these socket terms and their actor scope. Net value still depends on action selection, target state, geometry, cadence, and uptime."
        : "The season support table proves this defensive source input and its actor scope. It is not a player or minion EHP calculation.",
      nextExperiment,
      evidence: [
        `Socket ${reference.socketIndex + 1} · ${actorSkill}`,
        ...(isSocketSwap
          ? [`Support swap: ${supportTransition}`]
          : []),
        ...(movedAndChanged
          ? [
              `Moved: socket ${earlier!.socketIndex + 1} → socket ${current!.socketIndex + 1}`,
            ]
          : []),
        ...(compilationTransition
          ? [
              `Compiler coverage: ${earlier!.status} → ${current!.status}`,
              ...(current!.blockers.map((blocker) =>
                `After blocker: ${blocker}`)),
              ...(earlier!.blockers.map((blocker) =>
                `Before blocker: ${blocker}`)),
            ]
          : []),
        effectEvidence("Before", earlier?.effects ?? []),
        effectEvidence("After", current?.effects ?? []),
        domain === "damage"
          ? "Exact support text; not net DPS."
          : "Exact support text; not total EHP.",
      ],
      evidenceRefs: referenceKeys,
      target: { view: "changes", section: "skills" },
      claims: { isNetDps: false, isEhp: false },
    });
  }
  return findings;
}

interface DefenseAggregate {
  key: string;
  stat: string;
  statLabel: string;
  operation: string;
  operationLabel: string;
  unit: "flat" | "percent";
  value: number;
}

function defenseAggregates(loadout: AnalyzedLoadout): Map<string, DefenseAggregate> {
  const evidence = loadout.playerDefenseEvidence;
  if (!evidence || evidence.status !== "source-terms") return new Map();
  const aggregates = new Map<string, DefenseAggregate>();
  for (const sourceSum of evidence.sourceSums) {
    if (sourceSum.scope !== "player-global"
        || !CORE_DEFENSE_STATS.has(sourceSum.stat)
        || !finite(sourceSum.value)) {
      continue;
    }
    const key = `${sourceSum.stat}:${sourceSum.operation}:${sourceSum.unit}`;
    const existing = aggregates.get(key);
    if (existing) {
      existing.value += sourceSum.value;
    } else {
      aggregates.set(key, {
        key,
        stat: sourceSum.stat,
        statLabel: sourceSum.statLabel,
        operation: sourceSum.operation,
        operationLabel: sourceSum.operationLabel,
        unit: sourceSum.unit,
        value: sourceSum.value,
      });
    }
  }
  return aggregates;
}

function defenseFindings(
  before: AnalyzedLoadout,
  after: AnalyzedLoadout,
): ActionFinding[] {
  if (before.playerDefenseEvidence?.status !== "source-terms"
      || after.playerDefenseEvidence?.status !== "source-terms") {
    return [];
  }
  const left = defenseAggregates(before);
  const right = defenseAggregates(after);
  const findings: ActionFinding[] = [];
  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const earlier = left.get(key);
    const current = right.get(key);
    const reference = current ?? earlier;
    if (!reference) continue;
    const beforeValue = earlier?.value ?? 0;
    const afterValue = current?.value ?? 0;
    if (Math.abs(afterValue - beforeValue) < EPSILON) {
      continue;
    }
    const delta = afterValue - beforeValue;
    const direction = delta < 0
      ? "weaker-input" as const
      : "stronger-input" as const;
    const unit = reference.unit === "percent" ? " pp" : "";
    const metric: ActionMetric = {
      label: `${reference.statLabel} · ${reference.operationLabel}`,
      before: beforeValue,
      after: afterValue,
      delta,
      relativeDelta: relativeDelta(beforeValue, afterValue),
      unit: reference.unit === "percent"
        ? "percentage-point source input"
        : "flat source input",
    };
    findings.push({
      id: `defense:${key}`,
      priority: direction === "weaker-input" ? 145 : 95,
      proof: "source-term",
      domain: "survival",
      direction,
      label: "Compiled player-defense input",
      title: direction === "weaker-input"
        ? `${reference.operationLabel} ${reference.statLabel} source input fell`
        : `${reference.operationLabel} ${reference.statLabel} source input rose`,
      explanation:
        "Only compatible unconditional player-global source terms are compared here. Base character pools, local item math, caps, conditional state, enemy damage, recovery windows, and mitigation order are still outside the result.",
      nextExperiment: direction === "weaker-input"
        ? "Check the in-game total and cap for this layer. If the change opened a real gap, restore one source at a time and re-import."
        : "Confirm the in-game total actually benefits from this source input before trading away another survival layer.",
      evidence: [
        `${reference.operationLabel}: ${signed(beforeValue, unit)} → ${signed(afterValue, unit)} (${signed(delta, unit)})`,
        "An absent compiled source bucket is zero source input here, not a zero character stat or EHP delta.",
      ],
      metric,
      target: { view: "survival" },
      claims: { isNetDps: false, isEhp: false },
    });
  }
  return findings;
}

function structuralFinding(insight: StructuralInsight): ActionFinding {
  return {
    id: `structural:${insight.id}`,
    priority: 60 + insight.priority / 10,
    proof: "structural",
    domain: "build",
    direction: insight.tone === "risk" ? "risk" : "neutral",
    label: insight.label,
    title: insight.title,
    explanation: insight.explanation,
    nextExperiment:
      `Open ${insight.section} changes, isolate this edit in a duplicate loadout, and compare again before assigning a DPS direction.`,
    evidence: insight.evidence,
    target: { view: "changes", section: insight.section },
    claims: { isNetDps: false, isEhp: false },
  };
}

function residualStructuralInsights(
  insights: StructuralInsight[],
  sourceFindings: ActionFinding[],
) {
  const covered = new Set(
    sourceFindings.flatMap((finding) => finding.evidenceRefs ?? []),
  );
  return insights.flatMap((insight) => {
    if (!insight.changeRefs?.length) return [insight];
    const remaining = insight.changeRefs.filter((change) =>
      !covered.has(change.key));
    if (!remaining.length) return [];
    if (remaining.length === insight.changeRefs.length) return [insight];
    return [{
      ...insight,
      id: `${insight.id}:unresolved`,
      label: "Unresolved support changes",
      title:
        `${remaining.length} support change${remaining.length === 1 ? " still needs" : "s still need"} source evidence`,
      explanation:
        "Compiled socket changes are ranked separately. These remaining actor-scoped changes could not be reduced to comparable source terms, so their direction stays unknown.",
      evidence: remaining.map((change) => change.evidence),
      changeRefs: remaining,
    }];
  });
}

function contextBlocker(
  context: LoadoutComparisonClassification,
): ActionBlocker | null {
  if (context.kind === "progression") return null;
  const code = context.kind === "incompatible"
    ? "comparison-context-incompatible"
    : "comparison-context-reference-only";
  return {
    id: `blocker:both:${code}:${stableToken(context.reason)}`,
    code,
    side: "both",
    priority: context.kind === "incompatible" ? 400 : 350,
    domain: "capture",
    title: context.kind === "incompatible"
      ? "This pair cannot support progression advice"
      : "This pair is a reference comparison",
    detail: context.reason,
  };
}

function referenceOnlyFinding(finding: ActionFinding): ActionFinding {
  return {
    ...finding,
    explanation:
      `Reference contrast only: these values differ, but this pair does not prove a before/after change to one character. ${finding.explanation}`,
    nextExperiment:
      "To test this causally, import two loadouts from the same source document or make one isolated edit in a duplicate loadout, then compare that proven pair.",
  };
}

function teachingReferenceFinding(finding: ActionFinding): ActionFinding {
  return {
    ...finding,
    explanation:
      `Teaching demonstration: this contrast is modeled or compiled for the lesson, not attributed to an imported character’s progression. ${finding.explanation}`,
    nextExperiment: `Teaching exercise: ${finding.nextExperiment}`,
  };
}

function blockerPriority(code: string, message: string) {
  const value = `${code} ${message}`;
  if (/capture|catalog|attestation|source projection|unsupported patch/i.test(value)) return 130;
  if (/modifier pool|full hit envelope/i.test(value)) return 120;
  if (/rotation|geometry|overlap|target hits/i.test(value)) return 110;
  if (/attack speed|cadence|uptime|runtime state/i.test(value)) return 100;
  if (/enemy state|mitigation|resistance/i.test(value)) return 90;
  return 60;
}

function stableToken(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function collectBlockers(
  before: AnalyzedLoadout,
  after: AnalyzedLoadout,
): ActionBlocker[] {
  const values: ActionBlocker[] = [];
  const add = (
    side: "before" | "after",
    id: string,
    domain: ActionDomain,
    title: string,
    detail: string,
    evidence?: string,
  ) => {
    values.push({
      id,
      code: id,
      side,
      priority: blockerPriority(id, `${title} ${detail}`),
      domain,
      title,
      detail,
      ...(evidence ? { evidence } : {}),
      contexts: [...new Set([detail, evidence].filter(
        (value): value is string => Boolean(value),
      ))],
    });
  };
  for (const [side, loadout] of [
    ["before", before],
    ["after", after],
  ] as const) {
    if (loadout.resolutionHandoff) {
      add(
        side,
        "local-capture-required",
        "capture",
        "Resolve the in-game build code locally",
        "The code is an opaque reference. Open the build in game and export it through tli_dump before any loadout comparison can run.",
        loadout.resolutionHandoff.buildCode,
      );
    }
    for (const blocker of loadout.supportEvidenceBlockers ?? []) {
      add(side, blocker.code, "damage", blocker.message, blocker.evidence ?? "");
    }
    for (const support of loadout.supportEvidence ?? []) {
      if (support.status !== "unsupported") continue;
      const blockers: Array<{
        code: string;
        message: string;
        evidence?: string;
      }> = support.blockerEvidence?.length
        ? support.blockerEvidence
        : support.blockers.map((message) => ({
            code: "unsupported-main-skill-support",
            message,
          }));
      for (const blocker of blockers) {
        add(
          side,
          blocker.code,
          "damage",
          blocker.message,
          blocker.evidence ?? support.supportName ?? support.supportId,
        );
      }
    }
    for (const blocker of loadout.bingIntrinsicBlockers ?? []) {
      add(side, blocker.code, "damage", blocker.message, blocker.evidence ?? "");
    }
    const factorLedger = loadout.bingFactorLedger;
    if (factorLedger?.status === "not-calculated") {
      for (const blocker of factorLedger.blockers) {
        add(side, blocker.code, "damage", blocker.message, blocker.evidence ?? "");
      }
    } else if (factorLedger?.status === "calculated-partial") {
      for (const row of factorLedger.factorRows) {
        if (row.status !== "not-calculated") continue;
        for (const blocker of row.blockers) {
          add(side, blocker.code, "damage", blocker.message, blocker.evidence ?? row.label);
        }
      }
    }
    const bing = loadout.bingIntrinsicEvidence;
    if (bing) {
      for (const blocker of bing.actualDps.blockers) {
        add(side, blocker.code, "damage", blocker.message, blocker.evidence ?? "");
      }
    }
    for (const blocker of loadout.summonEvidenceBlockers ?? []) {
      add(side, blocker.code, "damage", blocker.message, blocker.evidence ?? "");
    }
    for (const summon of loadout.summonEvidence ?? []) {
      for (const support of summon.supports) {
        if (support.status !== "unsupported") continue;
        const blockers: Array<{
          code: string;
          message: string;
          evidence?: string;
        }> = support.blockerEvidence?.length
          ? support.blockerEvidence
          : support.blockers.map((message) => ({
              code: "unsupported-minion-support",
              message,
            }));
        for (const blocker of blockers) {
          add(
            side,
            blocker.code,
            "damage",
            blocker.message,
            blocker.evidence ?? `${summon.skillName} · ${support.supportName ?? support.supportId}`,
          );
        }
      }
      for (const message of summon.minionDps.blockers) {
        add(side, "minion-dps-blocker", "damage", message, `Actor: ${summon.skillName}`);
      }
      for (const action of summon.actions) {
        for (const blocker of action.knownDamage.excluded) {
          add(
            side,
            blocker.code,
            "damage",
            blocker.message,
            [
              `${summon.skillName} · ${action.actionName}`,
              blocker.evidence,
            ].filter(Boolean).join(" · "),
          );
        }
      }
      for (const message of summon.playerEhp.blockers) {
        add(side, "minion-ehp-blocker", "survival", message, `Actor: ${summon.skillName}`);
      }
    }
    const defense = loadout.playerDefenseEvidence;
    if (defense?.status === "source-terms") {
      for (const blocker of defense.playerEhp.blockers) {
        add(side, blocker.code, "survival", blocker.message, blocker.evidence ?? "");
      }
    } else if (defense?.status === "not-calculated") {
      for (const blocker of defense.blockers) {
        add(side, blocker.code, "survival", blocker.message, blocker.evidence ?? "");
      }
    }
  }
  const deduped = new Map<string, ActionBlocker>();
  for (const blocker of values) {
    const key =
      `${blocker.domain}\u0000${blocker.code}\u0000${blocker.title}`;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, { ...blocker });
      continue;
    }
    existing.priority = Math.max(existing.priority, blocker.priority);
    if (existing.side !== blocker.side) existing.side = "both";
    existing.contexts = [...new Set([
      ...(existing.contexts ?? []),
      ...(blocker.contexts ?? []),
    ])];
  }
  return [...deduped.values()]
    .sort((left, right) =>
      right.priority - left.priority
      || left.title.localeCompare(right.title))
    .map((blocker) => {
      const contexts = [...new Set(blocker.contexts ?? [])].sort();
      return {
        ...blocker,
        contexts,
        detail: contexts.length > 1
          ? `${contexts.length} affected contexts are grouped below.`
          : blocker.detail,
        id:
          `blocker:${blocker.side}:${blocker.code}:${stableToken([
            blocker.domain,
            blocker.title,
            ...contexts,
          ].join("\u0000"))}`,
      };
    });
}

function uniqueFindings(findings: ActionFinding[]) {
  const values = new Map<string, ActionFinding>();
  for (const finding of findings) {
    if (!values.has(finding.id)) values.set(finding.id, finding);
  }
  return [...values.values()];
}

export function buildComparisonActionPlan(
  before: AnalyzedLoadout,
  after: AnalyzedLoadout,
  options: ComparisonActionPlanOptions = {},
): ComparisonActionPlan {
  const context = classifyComparisonContext(before, after);
  const observedPair = options.observedMeasurements
    ?? (before.observedDamage || after.observedDamage
      ? {
          before: before.observedDamage,
          after: after.observedDamage,
        }
      : undefined);
  const observed = observedActionEvidence(observedPair, before, after);
  const baseBlockers = collectBlockers(before, after);
  const comparisonBlocker = contextBlocker(context);
  if (context.kind === "incompatible") {
    const observedReference = incompatibleObservedComparisonBlocker(
      observed.comparison,
    );
    return {
      findings: [],
      blockers: [
        ...(comparisonBlocker ? [comparisonBlocker] : []),
        ...(observedReference ? [observedReference] : []),
        ...observed.blockers,
        ...baseBlockers,
      ],
      summary: {
        observed: 0,
        observedDpsAvailable: false,
        observedDpsScope: null,
        modeled: 0,
        guardedPartial: 0,
        sourceTerms: 0,
        structural: 0,
        damage: 0,
        survival: 0,
        netDpsAvailable: false,
        ehpAvailable: false,
        comparisonKind: context.kind,
        comparisonReason: context.reason,
      },
    };
  }
  const modeled = modeledFindings(before, after);
  const bing = bingFindings(before, after);
  const bingFactors = bingFactorLedgerFindings(before, after);
  const minion = minionFoundationFindings(before, after);
  const supports = supportFindings(before, after);
  const defense = defenseFindings(before, after);
  const hasBingHitFinding = bing.some((finding) =>
    finding.id === "bing:weapon-sourced-hit");
  const structural = residualStructuralInsights(
    compareStructure(before, after).insights,
    supports,
  )
    .filter((insight) =>
      !(hasBingHitFinding && insight.id === "weapon-change"))
    .slice(0, 4)
    .map(structuralFinding);
  const reconciliations = context.kind === "progression"
    ? observedPartialReconciliation(
        observed.comparison,
        observed.identityScope,
        [
        ...bing,
        ...bingFactors,
        ...minion,
        ],
      )
    : [];
  const rankedFindings = uniqueFindings([
    ...observed.findings,
    ...reconciliations,
    ...modeled,
    ...bing,
    ...bingFactors,
    ...minion,
    ...supports,
    ...defense,
    ...structural,
  ]).sort((left, right) =>
    right.priority - left.priority
    || PROOF_ORDER[right.proof] - PROOF_ORDER[left.proof]
    || left.title.localeCompare(right.title));
  const teachingPair =
    before.comparisonContext?.sourceKind === "teaching"
    && after.comparisonContext?.sourceKind === "teaching";
  const findings = context.kind === "reference"
    ? rankedFindings.map((finding) =>
        finding.proof === "observed-result"
          ? finding
          : teachingPair
            ? teachingReferenceFinding(finding)
            : referenceOnlyFinding(finding))
    : rankedFindings;
  return {
    findings,
    blockers: [
      ...(comparisonBlocker ? [comparisonBlocker] : []),
      ...observed.blockers,
      ...baseBlockers,
    ],
    summary: {
      observed: observed.findings.length,
      observedDpsAvailable: observed.observedDpsAvailable,
      observedDpsScope: observed.observedDpsScope,
      modeled: findings.filter((finding) =>
        finding.proof === "modeled-scenario").length,
      guardedPartial: findings.filter((finding) =>
        finding.proof === "guarded-partial").length,
      sourceTerms: findings.filter((finding) =>
        finding.proof === "source-term").length,
      structural: findings.filter((finding) =>
        finding.proof === "structural").length,
      damage: findings.filter((finding) => finding.domain === "damage").length,
      survival: findings.filter((finding) =>
        finding.domain === "survival").length,
      netDpsAvailable: modeledScenarioCompatible(before, after),
      ehpAvailable: false,
      comparisonKind: context.kind,
      comparisonReason: context.reason,
    },
  };
}

export function actionPlanReport(
  before: AnalyzedLoadout,
  after: AnalyzedLoadout,
  plan = buildComparisonActionPlan(before, after),
) {
  const lines = [
    `TLI Lens comparison: ${before.name} → ${after.name}`,
    `Comparison mode: ${plan.summary.comparisonKind} — ${plan.summary.comparisonReason}`,
    plan.summary.observedDpsAvailable
      ? "DPS status: whole-loadout DPS observed from aligned user measurements; direction and magnitude are available, but formula attribution is not"
      : plan.summary.observedDpsScope === "actor-skill"
        ? "DPS status: observed for the declared actor/skill only; direction and magnitude are available in that scope, but whole-loadout DPS and formula attribution are not"
      : plan.summary.netDpsAvailable
        ? "DPS status: modeled in the site's shared scenario"
        : plan.findings.some((finding) =>
            finding.id === "observed:damage-per-hit")
          ? "DPS status: not calculated; aligned observed damage per hit is available but is not DPS"
          : plan.summary.guardedPartial || plan.summary.sourceTerms
            ? "DPS status: not calculated; guarded slices and source terms only"
        : plan.summary.structural
          ? "DPS status: not calculated; structural differences only"
          : "DPS status: not calculated; no compatible damage evidence",
    "EHP status: not calculated",
    "",
    "Ranked evidence and next experiments",
    ...plan.findings.slice(0, 8).flatMap((finding, index) => [
      `${index + 1}. [${finding.proof}] ${finding.title}`,
      `   ${finding.explanation}`,
      `   Next: ${finding.nextExperiment}`,
      ...(finding.proof === "observed-result"
        ? finding.evidence
        : finding.evidence.slice(0, 3))
        .map((line) => `   Evidence: ${line}`),
    ]),
  ];
  if (plan.blockers.length) {
    lines.push(
      "",
      "What still blocks a complete score",
      ...plan.blockers.slice(0, 6).map((blocker) =>
        `- [${blocker.side}] ${blocker.title}${blocker.detail ? ` — ${blocker.detail}` : ""}${blocker.contexts?.length ? ` (${blocker.contexts.join(" | ")})` : ""}`),
    );
  }
  return lines.join("\n");
}
