/**
 * Single-loadout damage explanation — the product's primary job.
 *
 * Given one analyzed loadout, surface dummy DPS from the shared cycleDps
 * formula and a factor decomposition. Comparison/diff logic does not live here.
 * Raw mainhand / guarded partials are never the primary reading.
 */

import {
  cycleDps,
  resolve,
  type Breakdown,
  type Chip,
  type Snapshot,
} from "@rehan/dmg/damageModel";
import type { AnalyzedLoadout } from "./analysis-types";

export type DamageReadingKind = "modeled-dps" | "unavailable";

export interface DamageReading {
  kind: DamageReadingKind;
  /** Display title for the number — always "DPS" when calculated. */
  label: string;
  /** Numeric value when available; null only for unavailable. */
  value: number | null;
  /** Preformatted display (compact or partial display string). */
  display: string;
  unit: string;
  /** One-line trust / scope note under the number. */
  note: string;
  /** True when this is cycleDps output under the shared dummy scenario. */
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

function dpsNote(loadout: AnalyzedLoadout): string {
  if (loadout.model?.confidence === "experimental") {
    return "Same cycleDps formula on every loadout (experimental coverage). Dummy scenario for formula testing — not a map promise.";
  }
  return "Same cycleDps formula on every loadout under the shared dummy scenario.";
}

/** Snapshot that can run the shared dummy DPS model. */
export function dpsSnapshot(loadout: AnalyzedLoadout): Snapshot | null {
  return loadout.snapshot ?? null;
}

/**
 * Primary reading is always shared cycleDps when a snapshot exists.
 * Never promote raw mainhand / guarded partials into the hero number.
 */
export function primaryDamageReading(loadout: AnalyzedLoadout): DamageReading {
  const snap = dpsSnapshot(loadout);
  if (snap) {
    const dps = loadout.model?.dps ?? cycleDps(snap).dps;
    return {
      kind: "modeled-dps",
      label: "DPS",
      value: dps,
      display: compact.format(dps),
      unit: "dummy scenario",
      note: dpsNote(loadout),
      isDps: true,
    };
  }

  const gaps = explanationGaps(loadout);
  return {
    kind: "unavailable",
    label: "DPS",
    value: null,
    display: "—",
    unit: "not calculated",
    note: gaps[0]
      ?? loadout.sourceNote
      ?? "Import a loadout with a damage snapshot to run the shared dummy DPS formula.",
    isDps: false,
  };
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
  if (!loadout.snapshot) {
    gaps.push("No damage snapshot is attached — dummy cycleDps cannot run yet.");
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
  if (loadout.bingIntrinsicEvidence?.actualDps?.blockers?.length) {
    for (const blocker of loadout.bingIntrinsicEvidence.actualDps.blockers) {
      gaps.push(blocker.message);
    }
  }
  if (!loadout.snapshot && loadout.sourceNote) gaps.push(loadout.sourceNote);
  // de-dupe
  return [...new Set(gaps)];
}

/**
 * Full single-loadout explanation: dummy DPS + cycleDps breakdown chips.
 * Guarded partials (weapon foundation, etc.) are never the primary product.
 */
export function explainCurrentDamage(loadout: AnalyzedLoadout): DamageExplanation {
  const gaps = explanationGaps(loadout);
  const snap = dpsSnapshot(loadout);

  if (snap) {
    const result = cycleDps(snap);
    const breakdown = result.trace;
    return {
      reading: {
        kind: "modeled-dps",
        label: "DPS",
        value: result.dps,
        display: compact.format(result.dps),
        unit: "dummy scenario",
        note: dpsNote(loadout),
        isDps: true,
      },
      breakdown,
      factors: rankedFactorImpacts(breakdown),
      gaps,
    };
  }

  return {
    reading: primaryDamageReading(loadout),
    breakdown: null,
    factors: [],
    gaps,
  };
}
