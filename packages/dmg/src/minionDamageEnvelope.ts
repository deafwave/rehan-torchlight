/*
 * Confirmed, speed-independent Spirit Magus damage factors.
 *
 * This module deliberately stops at an unmitigated per-contact partial value:
 *
 *   actor base × action coefficient × confirmed unconditional additional factors
 *
 * It does not infer action cadence, AI selection, target overlap, conditional
 * uptime, Growth/Breeze state, critical strikes, mitigation, or total DPS.
 */

import {
  ELEMENTAL_DUO_ID,
  FREQUENT_QUAKE_ID,
  MALADY_ID,
  PRECISION_STRIKE_ID,
  SERVANT_DAMAGE_ID,
  SPELL_CONCENTRATION_ID,
  WHIRLWIND_TANGO_TRAIT_ID,
  type IrisTraitEvidence,
  type MinionActionEvidence,
  type MinionSupportEvidence,
} from "./minionActionEvidence.js";
import type {
  CalculationBlocker,
  FormulaProvenance,
} from "./guardedCompiler.js";

export const ADDITIONAL_DAMAGE_PRODUCT_SOURCE: FormulaProvenance = {
  source: "rehan_guide/docs/mechanics.md",
  locator: "#additional — each additional-damage line is its own (1 + value / 100) factor",
  confidence: "confirmed-mechanic",
};

export type MinionDamageFactorApplicability =
  | { kind: "all-spirit-magus-actions" }
  | { kind: "all-tags"; tags: string[] }
  | { kind: "role"; role: MinionActionEvidence["role"] };

export interface MinionDamageFactor {
  key: string;
  sourceKind: "support" | "hero-trait";
  sourceId: string;
  sourceName: string;
  termId: string;
  label: string;
  valuePct: number;
  multiplier: number;
  operation: "additional-multiplier";
  applicability: MinionDamageFactorApplicability;
  condition: null;
  provenance: FormulaProvenance[];
}

export interface MinionKnownDamageEnvelope {
  status: "calculated-partial" | "not-damaging";
  metric: "known-unmitigated-damage-per-contact";
  scope: "actor-foundation-and-confirmed-unconditional-additional-factors";
  isDps: false;
  isTotalDamage: false;
  rawPerContact: number | null;
  deterministicContacts: number | null;
  rawDeterministicFullContact: number | null;
  factors: MinionDamageFactor[];
  multiplier: number | null;
  knownPerContact: number | null;
  knownDeterministicFullContact: number | null;
  excluded: CalculationBlocker[];
  provenance: FormulaProvenance[];
}

export interface MinionActionWithKnownDamageEvidence
  extends MinionActionEvidence {
  knownDamage: MinionKnownDamageEnvelope;
}

export interface MinionDamageFactorChange {
  key: string;
  sourceKind: MinionDamageFactor["sourceKind"];
  sourceId: string;
  sourceName: string;
  termId: string;
  label: string;
  beforeValuePct: number | null;
  afterValuePct: number | null;
  beforeMultiplier: number;
  afterMultiplier: number;
  ratio: number | null;
  deltaPct: number | null;
  provenance: FormulaProvenance[];
}

export interface MinionActionKnownDamageChange {
  skillId: string;
  skillName: string;
  actionId: string;
  actionName: string;
  before: MinionKnownDamageEnvelope;
  after: MinionKnownDamageEnvelope;
  foundationRatio: number | null;
  foundationDeltaPct: number | null;
  ratio: number | null;
  deltaPct: number | null;
  factorChanges: MinionDamageFactorChange[];
  isDps: false;
  isTotalDamage: false;
}

interface SupportFactorRule {
  supportId: string;
  termId: string;
  applicability: MinionDamageFactorApplicability;
}

const ALL_ACTIONS: MinionDamageFactorApplicability = {
  kind: "all-spirit-magus-actions",
};

const SUPPORT_FACTOR_RULES: readonly SupportFactorRule[] = [
  {
    supportId: SPELL_CONCENTRATION_ID,
    termId: "additional-damage",
    applicability: { kind: "all-tags", tags: ["spell", "area"] },
  },
  {
    supportId: SERVANT_DAMAGE_ID,
    termId: "additional-minion-damage",
    applicability: ALL_ACTIONS,
  },
  {
    supportId: PRECISION_STRIKE_ID,
    termId: "additional-area-damage",
    applicability: {
      kind: "all-tags",
      tags: ["melee", "attack", "area"],
    },
  },
  {
    supportId: ELEMENTAL_DUO_ID,
    termId: "additional-minion-damage",
    applicability: ALL_ACTIONS,
  },
  {
    supportId: FREQUENT_QUAKE_ID,
    termId: "additional-minion-damage",
    applicability: ALL_ACTIONS,
  },
  {
    supportId: MALADY_ID,
    termId: "additional-minion-damage-fixed",
    applicability: ALL_ACTIONS,
  },
  {
    supportId: MALADY_ID,
    termId: "additional-minion-damage-roll",
    applicability: ALL_ACTIONS,
  },
] as const;

const CONTEXTUAL_SUPPORT_FACTOR_TERM_IDS = new Set([
  "additional-damage-to-cursed",
  "additional-damage-per-ailment",
]);

function round(value: number): number {
  return Number(value.toFixed(10));
}

function uniqueProvenance(
  sources: readonly FormulaProvenance[],
): FormulaProvenance[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.source}\u0000${source.locator}\u0000${source.sha256 ?? ""}\u0000${source.confidence ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((source) => ({ ...source }));
}

function uniqueBlockers(
  blockers: readonly CalculationBlocker[],
): CalculationBlocker[] {
  const seen = new Set<string>();
  return blockers.filter((blocker) => {
    const key = `${blocker.code}\u0000${blocker.message}\u0000${blocker.evidence ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((blocker) => ({ ...blocker }));
}

function appliesTo(
  applicability: MinionDamageFactorApplicability,
  action: MinionActionEvidence,
): boolean {
  if (applicability.kind === "all-spirit-magus-actions") return true;
  if (applicability.kind === "role") return action.role === applicability.role;
  return applicability.tags.every((tag) => action.tags.includes(tag));
}

function factorValue(
  valuePct: number,
  evidence: string,
): number | CalculationBlocker {
  if (!Number.isFinite(valuePct) || valuePct <= -100) {
    return {
      code: "invalid-minion-damage-factor",
      message: "An additional-damage factor must be finite and greater than -100%.",
      evidence,
    };
  }
  return round(1 + valuePct / 100);
}

function supportFactorsFor(
  action: MinionActionEvidence,
  supports: readonly MinionSupportEvidence[],
): {
  factors: MinionDamageFactor[];
  blockers: CalculationBlocker[];
} {
  const factors: MinionDamageFactor[] = [];
  const blockers: CalculationBlocker[] = [];
  const factorSupportIds = new Set(
    SUPPORT_FACTOR_RULES.map((rule) => rule.supportId),
  );
  const instancesBySupport = new Map<string, MinionSupportEvidence[]>();
  for (const support of supports) {
    if (!factorSupportIds.has(support.supportId)) continue;
    const instances = instancesBySupport.get(support.supportId) ?? [];
    instances.push(support);
    instancesBySupport.set(support.supportId, instances);
  }
  const ambiguousSupportIds = new Set<string>();
  for (const [supportId, instances] of instancesBySupport) {
    if (instances.length <= 1) continue;
    ambiguousSupportIds.add(supportId);
    blockers.push({
      code: "duplicate-minion-damage-factor-support",
      message:
        "A guarded minion damage factor appears in more than one support socket; its stacking and installation legality are not assumed.",
      evidence: instances
        .map((support) =>
          `${support.skillName} socket ${support.socketIndex + 1}: ${support.supportName ?? support.supportId}`)
        .join(" · "),
    });
  }

  for (const support of supports) {
    if (support.status === "unsupported") {
      blockers.push(...support.blockers);
      continue;
    }
    if (ambiguousSupportIds.has(support.supportId)) continue;
    for (const rule of SUPPORT_FACTOR_RULES) {
      if (rule.supportId !== support.supportId
          || !appliesTo(rule.applicability, action)) {
        continue;
      }
      const term = support.effects.find((effect) => effect.id === rule.termId);
      const evidence = `${support.supportName}.${rule.termId}`;
      if (!term) {
        blockers.push({
          code: "missing-minion-damage-factor-term",
          message: `${support.supportName} is missing its guarded ${rule.termId} term.`,
          evidence,
        });
        continue;
      }
      if (term.unit !== "percent"
          || term.application !== "additional-damage-input"
          || term.condition !== null) {
        blockers.push({
          code: "ineligible-minion-damage-factor-term",
          message: `${support.supportName}'s ${term.label} term is not an unconditional additional-damage multiplier.`,
          evidence,
        });
        continue;
      }
      const multiplier = factorValue(term.value, evidence);
      if (typeof multiplier !== "number") {
        blockers.push(multiplier);
        continue;
      }
      factors.push({
        key: `support:${support.supportId}:${term.id}`,
        sourceKind: "support",
        sourceId: support.supportId,
        sourceName: support.supportName,
        termId: term.id,
        label: term.label,
        valuePct: term.value,
        multiplier,
        operation: "additional-multiplier",
        applicability: rule.applicability.kind === "all-tags"
          ? { ...rule.applicability, tags: [...rule.applicability.tags] }
          : { ...rule.applicability },
        condition: null,
        provenance: uniqueProvenance(support.provenance),
      });
    }
  }

  return { factors, blockers };
}

function traitFactorsFor(
  traits: readonly IrisTraitEvidence[],
): {
  factors: MinionDamageFactor[];
  blockers: CalculationBlocker[];
} {
  const factors: MinionDamageFactor[] = [];
  const blockers: CalculationBlocker[] = [];
  const whirlwind = traits.find((trait) =>
    trait.traitId === WHIRLWIND_TANGO_TRAIT_ID);
  if (!whirlwind) return { factors, blockers };

  const term = whirlwind.terms.find((candidate) =>
    candidate.id === "additional-spirit-magus-skill-damage");
  const evidence =
    `${whirlwind.traitName}.additional-spirit-magus-skill-damage`;
  if (!term
      || term.unit !== "percent"
      || term.application !== "additional-damage-input"
      || term.selector !== "constant"
      || term.condition !== null
      || term.values.length !== 1) {
    blockers.push({
      code: "ineligible-minion-trait-damage-factor",
      message: "Whirlwind Tango does not expose one exact unconditional Spirit Magus additional-damage value.",
      evidence,
    });
    return { factors, blockers };
  }
  const [valuePct] = term.values;
  const multiplier = factorValue(valuePct, evidence);
  if (typeof multiplier !== "number") {
    blockers.push(multiplier);
    return { factors, blockers };
  }
  factors.push({
    key: `hero-trait:${whirlwind.traitId}:${term.id}`,
    sourceKind: "hero-trait",
    sourceId: whirlwind.traitId,
    sourceName: whirlwind.traitName,
    termId: term.id,
    label: term.label,
    valuePct,
    multiplier,
    operation: "additional-multiplier",
    applicability: { kind: "all-spirit-magus-actions" },
    condition: null,
    provenance: uniqueProvenance(whirlwind.provenance),
  });
  return { factors, blockers };
}

function contextualDamageBlockers(
  action: MinionActionEvidence,
  supports: readonly MinionSupportEvidence[],
  traits: readonly IrisTraitEvidence[],
): CalculationBlocker[] {
  const blockers: CalculationBlocker[] = [];
  for (const support of supports) {
    if (support.status !== "source-terms") continue;
    for (const term of support.effects) {
      if (CONTEXTUAL_SUPPORT_FACTOR_TERM_IDS.has(term.id)) {
        blockers.push({
          code: "conditional-minion-damage-factor",
          message: `${support.supportName}: ${term.label} is excluded because ${term.condition ?? "its runtime condition is unresolved"}.`,
          evidence: `${support.supportName}.${term.id}`,
        });
      } else if (term.application === "additional-damage-input"
          && !SUPPORT_FACTOR_RULES.some((rule) =>
            rule.supportId === support.supportId && rule.termId === term.id)) {
        blockers.push({
          code: "non-multiplicative-minion-damage-input",
          message: `${support.supportName}: ${term.label} is a damage input, but not a confirmed unconditional multiplier for this envelope.`,
          evidence: `${support.supportName}.${term.id}`,
        });
      }
    }
  }
  for (const term of action.terms) {
    if (term.application === "additional-damage-input"
        || term.application === "enemy-damage-taken-input") {
      blockers.push({
        code: "conditional-action-damage-input",
        message: `${action.actionName}: ${term.label} is excluded${term.condition ? ` because ${term.condition}` : " from the unconditional actor envelope"}.`,
        evidence: `${action.actionName}.${term.id}`,
      });
    }
  }
  for (const trait of traits) {
    for (const term of trait.terms) {
      if (term.application !== "additional-damage-input"
          || (trait.traitId === WHIRLWIND_TANGO_TRAIT_ID
            && term.id === "additional-spirit-magus-skill-damage")) {
        continue;
      }
      blockers.push({
        code: "unresolved-minion-trait-damage-factor",
        message: `${trait.traitName}: ${term.label} is excluded because its selector or runtime condition is unresolved.`,
        evidence: `${trait.traitName}.${term.id}`,
      });
    }
  }
  return blockers;
}

export function compileKnownMinionDamageEnvelope(
  action: MinionActionEvidence,
  supports: readonly MinionSupportEvidence[],
  traits: readonly IrisTraitEvidence[],
  globalBlockers: readonly CalculationBlocker[] = [],
): MinionKnownDamageEnvelope {
  const support = supportFactorsFor(action, supports);
  const trait = traitFactorsFor(traits);
  const factors = [...support.factors, ...trait.factors];
  const excluded = uniqueBlockers([
    ...globalBlockers,
    ...support.blockers,
    ...trait.blockers,
    ...contextualDamageBlockers(action, supports, traits),
  ]);
  const provenance = uniqueProvenance([
    ...action.provenance,
    ...factors.flatMap((factor) => factor.provenance),
    ADDITIONAL_DAMAGE_PRODUCT_SOURCE,
  ]);
  const foundation = action.foundation;
  if (foundation.status === "not-damaging"
      || foundation.rawDamagePerContact === null) {
    return {
      status: "not-damaging",
      metric: "known-unmitigated-damage-per-contact",
      scope: "actor-foundation-and-confirmed-unconditional-additional-factors",
      isDps: false,
      isTotalDamage: false,
      rawPerContact: null,
      deterministicContacts: foundation.deterministicContacts,
      rawDeterministicFullContact: null,
      factors,
      multiplier: null,
      knownPerContact: null,
      knownDeterministicFullContact: null,
      excluded,
      provenance,
    };
  }
  const multiplier = round(
    factors.reduce((product, factor) => product * factor.multiplier, 1),
  );
  return {
    status: "calculated-partial",
    metric: "known-unmitigated-damage-per-contact",
    scope: "actor-foundation-and-confirmed-unconditional-additional-factors",
    isDps: false,
    isTotalDamage: false,
    rawPerContact: foundation.rawDamagePerContact,
    deterministicContacts: foundation.deterministicContacts,
    rawDeterministicFullContact:
      foundation.rawDamageAtDeterministicFullContact,
    factors,
    multiplier,
    knownPerContact: round(foundation.rawDamagePerContact * multiplier),
    knownDeterministicFullContact:
      foundation.rawDamageAtDeterministicFullContact === null
        ? null
        : round(
            foundation.rawDamageAtDeterministicFullContact * multiplier,
          ),
    excluded,
    provenance,
  };
}

export function compileKnownMinionDamageActions(
  actions: readonly MinionActionEvidence[],
  supports: readonly MinionSupportEvidence[],
  traits: readonly IrisTraitEvidence[],
  globalBlockers: readonly CalculationBlocker[] = [],
): MinionActionWithKnownDamageEvidence[] {
  return actions.map((action) => ({
    ...action,
    knownDamage: compileKnownMinionDamageEnvelope(
      action,
      supports,
      traits,
      globalBlockers,
    ),
  }));
}

function ratioOf(after: number, before: number): number | null {
  return before === 0 ? null : after / before;
}

function deltaPctOf(ratio: number | null): number | null {
  return ratio === null ? null : (ratio - 1) * 100;
}

function blockerSetFingerprint(
  blockers: readonly CalculationBlocker[],
): string {
  return JSON.stringify(
    blockers
      .map((blocker) => ({
        code: blocker.code,
        message: blocker.message,
        evidence: blocker.evidence ?? null,
      }))
      .sort((left, right) =>
        left.code.localeCompare(right.code)
        || left.message.localeCompare(right.message)
        || String(left.evidence).localeCompare(String(right.evidence))),
  );
}

export function knownMinionDamageCoverageMatches(
  before: Pick<MinionKnownDamageEnvelope, "status" | "excluded">,
  after: Pick<MinionKnownDamageEnvelope, "status" | "excluded">,
): boolean {
  return before.status === after.status
    && blockerSetFingerprint(before.excluded)
      === blockerSetFingerprint(after.excluded);
}

function factorChanges(
  before: MinionKnownDamageEnvelope,
  after: MinionKnownDamageEnvelope,
): MinionDamageFactorChange[] {
  const left = new Map(before.factors.map((factor) => [factor.key, factor]));
  const right = new Map(after.factors.map((factor) => [factor.key, factor]));
  const changes: MinionDamageFactorChange[] = [];
  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const a = left.get(key) ?? null;
    const b = right.get(key) ?? null;
    if (a?.valuePct === b?.valuePct) continue;
    const beforeMultiplier = a?.multiplier ?? 1;
    const afterMultiplier = b?.multiplier ?? 1;
    const ratio = ratioOf(afterMultiplier, beforeMultiplier);
    const reference = b ?? a;
    if (!reference) continue;
    changes.push({
      key,
      sourceKind: reference.sourceKind,
      sourceId: reference.sourceId,
      sourceName: reference.sourceName,
      termId: reference.termId,
      label: reference.label,
      beforeValuePct: a?.valuePct ?? null,
      afterValuePct: b?.valuePct ?? null,
      beforeMultiplier,
      afterMultiplier,
      ratio,
      deltaPct: deltaPctOf(ratio),
      provenance: uniqueProvenance([
        ...(a?.provenance ?? []),
        ...(b?.provenance ?? []),
        ADDITIONAL_DAMAGE_PRODUCT_SOURCE,
      ]),
    });
  }
  return changes;
}

export function compareKnownMinionDamageActions(
  skillId: string,
  skillName: string,
  before: readonly MinionActionWithKnownDamageEvidence[],
  after: readonly MinionActionWithKnownDamageEvidence[],
): MinionActionKnownDamageChange[] {
  const left = new Map(before.map((action) => [action.actionId, action]));
  const changes: MinionActionKnownDamageChange[] = [];
  for (const action of after) {
    const earlier = left.get(action.actionId);
    if (!earlier) continue;
    if (!knownMinionDamageCoverageMatches(
      earlier.knownDamage,
      action.knownDamage,
    )) {
      continue;
    }
    if (earlier.knownDamage.status === "not-damaging"
        && action.knownDamage.status === "not-damaging") {
      continue;
    }
    const beforeKnown = earlier.knownDamage.knownPerContact;
    const afterKnown = action.knownDamage.knownPerContact;
    const factors = factorChanges(earlier.knownDamage, action.knownDamage);
    const changed = beforeKnown !== afterKnown || factors.length > 0;
    if (!changed) continue;
    const ratio = beforeKnown === null || afterKnown === null
      ? null
      : ratioOf(afterKnown, beforeKnown);
    const foundationRatio =
      earlier.knownDamage.rawPerContact === null
      || action.knownDamage.rawPerContact === null
        ? null
        : ratioOf(
            action.knownDamage.rawPerContact,
            earlier.knownDamage.rawPerContact,
          );
    changes.push({
      skillId,
      skillName,
      actionId: action.actionId,
      actionName: action.actionName,
      before: earlier.knownDamage,
      after: action.knownDamage,
      foundationRatio,
      foundationDeltaPct: deltaPctOf(foundationRatio),
      ratio,
      deltaPct: deltaPctOf(ratio),
      factorChanges: factors,
      isDps: false,
      isTotalDamage: false,
    });
  }
  return changes;
}
