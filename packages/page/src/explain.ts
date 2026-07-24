/**
 * Single-loadout damage explanation — the product's primary job.
 *
 * Given one analyzed loadout, surface the best current damage reading and a
 * factor decomposition with marginal impact. Comparison/diff logic does not
 * live here.
 */

import {
  cycleDps,
  resolve,
  type Breakdown,
  type Chip,
} from "@rehan/dmg/damageModel";
import type { AnalyzedLoadout, PartialMetric } from "./analysis-types";

export type DamageReadingKind = "modeled-dps" | "partial" | "unavailable";

export interface DamageReading {
  kind: DamageReadingKind;
  /** Display title for the number (e.g. "Boss DPS", partial label). */
  label: string;
  /** Numeric value when available; null only for unavailable. */
  value: number | null;
  /** Preformatted display (compact or partial display string). */
  display: string;
  unit: string;
  /** One-line trust / scope note under the number. */
  note: string;
  /** True when this is full supported boss DPS from the model. */
  isDps: boolean;
}

export interface FactorImpact {
  kind: Chip["kind"];
  label: string;
  op: Chip["op"];
  factor: number;
  /** Fraction of total DPS lost if this factor is neutralized (can be negative). */
  impact: number;
}

export interface DamageExplanation {
  reading: DamageReading;
  /** Present only when a full modeled snapshot can run cycleDps. */
  breakdown: Breakdown | null;
  /** Factors ranked by |impact|, largest first. Empty when no breakdown. */
  factors: FactorImpact[];
  /** Short reasons the full number is incomplete. */
  gaps: string[];
}

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

function formatFactor(chip: Chip): string {
  if (chip.op === "base") return compact.format(chip.factor);
  if (chip.op === "+") return `+${Math.round(chip.factor * 1000) / 10}%`;
  return `×${chip.factor.toFixed(2)}`;
}

/** Prefer the strongest current number: modeled DPS > best partial > unavailable. */
export function primaryDamageReading(loadout: AnalyzedLoadout): DamageReading {
  if (loadout.snapshot && loadout.model) {
    return {
      kind: "modeled-dps",
      label: "Boss DPS",
      value: loadout.model.dps,
      display: compact.format(loadout.model.dps),
      unit: "supported boss DPS",
      note: loadout.model.confidence === "experimental"
        ? "Experimental model coverage under the shared boss scenario."
        : "Supported boss DPS under the shared scenario — not a dummy or map promise.",
      isDps: true,
    };
  }

  const partial = bestPartialMetric(loadout);
  if (partial) {
    return {
      kind: "partial",
      label: partial.label,
      value: partial.value,
      display: partial.display,
      unit: partial.unit,
      note: partial.isDps
        ? "Partial DPS-style metric from guarded sources."
        : "Guarded partial arithmetic — not total hit damage or DPS.",
      isDps: partial.isDps,
    };
  }

  if (loadout.summonEvidence?.length) {
    const first = loadout.summonEvidence[0];
    const base = first.baseline.baseDamage;
    return {
      kind: "partial",
      label: `${first.skillName} base damage`,
      value: base,
      display: compact.format(base),
      unit: "actor base (not DPS)",
      note: "Minion actor table only — contacts, cadence, and mitigation are not included.",
      isDps: false,
    };
  }

  const gaps = explanationGaps(loadout);
  return {
    kind: "unavailable",
    label: "Damage not calculated",
    value: null,
    display: "—",
    unit: "no supported total yet",
    note: gaps[0]
      ?? loadout.sourceNote
      ?? "Import a loadout connected to a damage model or guarded partial.",
    isDps: false,
  };
}

function bestPartialMetric(loadout: AnalyzedLoadout): PartialMetric | null {
  const metrics = loadout.partialMetrics ?? [];
  if (!metrics.length) return null;
  // Prefer non-DPS foundations that are still the best proven number for Bing.
  const foundation = metrics.find((m) => m.id === "bing-weapon-hit-foundation");
  if (foundation) return foundation;
  return metrics[0] ?? null;
}

/** Collapse identical chips and rank by absolute marginal impact on total DPS. */
export function rankedFactorImpacts(breakdown: Breakdown): FactorImpact[] {
  const all: Chip[] = [];
  const collect = (node: Breakdown["root"]) => {
    all.push(...node.chips);
    node.children?.forEach(collect);
  };
  collect(breakdown.root);

  const groups = new Map<string, Chip[]>();
  for (const chip of all) {
    const key = `${chip.kind}|${chip.label}|${chip.factor}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(chip);
  }

  const total = resolve(breakdown.root);
  const factors: FactorImpact[] = [];
  for (const insts of groups.values()) {
    const chip = insts[0];
    if (chip.op === "base") {
      factors.push({
        kind: chip.kind,
        label: chip.label,
        op: chip.op,
        factor: chip.factor,
        impact: 0,
      });
      continue;
    }
    const without = resolve(breakdown.root, new Set(insts));
    const impact = total === 0 ? 0 : 1 - without / total;
    if (Math.abs(impact) < 0.005) continue;
    factors.push({
      kind: chip.kind,
      label: chip.label,
      op: chip.op,
      factor: chip.factor,
      impact,
    });
  }

  return factors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
}

export function formatFactorValue(factor: FactorImpact): string {
  return formatFactor({
    kind: factor.kind,
    label: factor.label,
    op: factor.op,
    factor: factor.factor,
  });
}

export function explanationGaps(loadout: AnalyzedLoadout): string[] {
  const gaps: string[] = [];
  if (loadout.resolutionHandoff) {
    gaps.push("Local tli_dump capture is still required for this build code.");
  }
  for (const blocker of loadout.bingIntrinsicBlockers ?? []) {
    gaps.push(blocker.message);
  }
  for (const blocker of loadout.summonEvidenceBlockers ?? []) {
    gaps.push(blocker.message);
  }
  for (const blocker of loadout.supportEvidenceBlockers ?? []) {
    gaps.push(blocker.message);
  }
  if (loadout.bingIntrinsicEvidence?.topology.status !== "calculated-partial"
      && loadout.bingIntrinsicEvidence) {
    // topology may still list blockers on the envelope
  }
  if (loadout.bingIntrinsicEvidence?.actualDps?.blockers?.length) {
    for (const blocker of loadout.bingIntrinsicEvidence.actualDps.blockers) {
      gaps.push(blocker.message);
    }
  }
  if (!loadout.model && !loadout.partialMetrics?.length && !loadout.summonEvidence?.length) {
    if (loadout.sourceNote) gaps.push(loadout.sourceNote);
  }
  // de-dupe
  return [...new Set(gaps)];
}

/**
 * Full single-loadout explanation: current reading + optional model breakdown
 * + impact-ranked factors. This is the home-path contract.
 */
export function explainCurrentDamage(loadout: AnalyzedLoadout): DamageExplanation {
  const reading = primaryDamageReading(loadout);
  const gaps = explanationGaps(loadout);

  if (loadout.snapshot && loadout.model) {
    const result = cycleDps(loadout.snapshot);
    const breakdown = result.trace;
    // Keep the displayed total aligned with the model summary when present.
    if (Math.abs(breakdown.total - loadout.model.dps) > 1) {
      // Prefer cycleDps as source of truth for chips; reading already uses model.dps.
    }
    return {
      reading: {
        ...reading,
        value: result.dps,
        display: compact.format(result.dps),
      },
      breakdown,
      factors: rankedFactorImpacts(breakdown),
      gaps,
    };
  }

  return {
    reading,
    breakdown: null,
    factors: [],
    gaps,
  };
}
