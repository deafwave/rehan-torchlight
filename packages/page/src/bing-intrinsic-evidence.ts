import {
  compileBingIntrinsicEnvelope,
  type BingIntrinsicEnvelope,
  type BingIntrinsicEnvelopeResult,
} from "@rehan/dmg/bingIntrinsic";

/*
 * Thin page boundary for the guarded Bing compiler.
 *
 * The successful envelope is returned unchanged. In particular, this adapter
 * does not flatten blockers, discard provenance, multiply emissions by damage,
 * or relabel a partial weapon-sourced hit as DPS.
 */

export interface BingIntrinsicEvidenceComparisonSide {
  loadoutIndex: number;
  loadoutName: string;
  fingerprint: string;
  evidence: BingIntrinsicEnvelope;
}

export interface BingIntrinsicEvidenceComparison {
  status: "calculated-partial";
  kind: "bing-intrinsic-evidence-comparison";
  isDps: false;
  isTotalHit: false;
  isTargetHits: false;
  before: BingIntrinsicEvidenceComparisonSide;
  after: BingIntrinsicEvidenceComparisonSide;
  changed: boolean;
  topologyChanged: boolean;
  weaponSourcedPerHitDelta: {
    scope: "weapon-sourced per-hit only";
    normalAverage: number;
    demolisherChargedAverage: number;
    isDps: false;
    isTotalHit: false;
  };
  provenance: BingIntrinsicEnvelope["provenance"];
  fingerprint: string;
  warning: string;
}

export function bingIntrinsicEvidenceForCompendium(
  build: unknown,
  loadoutIndex: number,
): BingIntrinsicEnvelope | null {
  const result = bingIntrinsicEvidenceResultForCompendium(build, loadoutIndex);
  return result.status === "calculated-partial" ? result : null;
}

/**
 * Full guarded result for callers that need to surface why compilation was
 * refused. The convenience function above remains for successful-envelope
 * consumers, but importer/UI boundaries should use this result.
 */
export function bingIntrinsicEvidenceResultForCompendium(
  build: unknown,
  loadoutIndex: number,
): BingIntrinsicEnvelopeResult {
  return compileBingIntrinsicEnvelope(build, loadoutIndex);
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return "null";
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function semanticEvidence(value: BingIntrinsicEnvelope): Record<string, unknown> {
  const semantic = Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => key !== "loadoutIndex" && key !== "loadoutName",
    ),
  );
  semantic.recordedTraitIds = [...value.recordedTraitIds].sort();
  semantic.excludedFromMetric = [...value.excludedFromMetric].sort();
  semantic.provenance = [...value.provenance].sort((left, right) =>
    canonicalJson(left).localeCompare(canonicalJson(right)));
  if (value.topology.status === "calculated-partial") {
    semantic.topology = {
      ...value.topology,
      heroTraitLevelSources: [...value.topology.heroTraitLevelSources]
        .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right))),
      projectileQuantitySources: [...value.topology.projectileQuantitySources]
        .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right))),
    };
  }
  return semantic;
}

/**
 * Versioned deterministic semantic fingerprint for UI comparison keys.
 *
 * Loadout position/name are intentionally excluded; provenance, blockers,
 * guards, source terms, and calculated partial values remain in the key.
 */
export function bingIntrinsicEvidenceFingerprint(
  value: BingIntrinsicEnvelope,
): string {
  return `bing-intrinsic-v1-${fnv1a(canonicalJson(semanticEvidence(value)))}`;
}

function topologyFingerprint(value: BingIntrinsicEnvelope): string {
  return fnv1a(canonicalJson(value.topology));
}

function roundedDelta(after: number, before: number): number {
  return Number((after - before).toFixed(10));
}

function uniqueProvenance(
  values: BingIntrinsicEnvelope["provenance"],
): BingIntrinsicEnvelope["provenance"] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = canonicalJson(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Builds a direction-sensitive before/after payload only when both guarded
 * envelopes are available. Numeric deltas are weapon-sourced per-hit deltas,
 * never total-hit or DPS deltas.
 */
export function compareBingIntrinsicEvidenceForCompendium(
  build: unknown,
  beforeIndex: number,
  afterIndex: number,
): BingIntrinsicEvidenceComparison | null {
  const before = bingIntrinsicEvidenceForCompendium(build, beforeIndex);
  const after = bingIntrinsicEvidenceForCompendium(build, afterIndex);
  if (!before || !after) return null;

  const beforeFingerprint = bingIntrinsicEvidenceFingerprint(before);
  const afterFingerprint = bingIntrinsicEvidenceFingerprint(after);
  const comparisonFingerprint = `bing-intrinsic-comparison-v1-${fnv1a(canonicalJson({
    before: beforeFingerprint,
    after: afterFingerprint,
  }))}`;

  return {
    status: "calculated-partial",
    kind: "bing-intrinsic-evidence-comparison",
    isDps: false,
    isTotalHit: false,
    isTargetHits: false,
    before: {
      loadoutIndex: before.loadoutIndex,
      loadoutName: before.loadoutName,
      fingerprint: beforeFingerprint,
      evidence: before,
    },
    after: {
      loadoutIndex: after.loadoutIndex,
      loadoutName: after.loadoutName,
      fingerprint: afterFingerprint,
      evidence: after,
    },
    changed: beforeFingerprint !== afterFingerprint,
    topologyChanged: topologyFingerprint(before) !== topologyFingerprint(after),
    weaponSourcedPerHitDelta: {
      scope: "weapon-sourced per-hit only",
      normalAverage: roundedDelta(
        after.normalWeaponSourcedPerHit.total.average,
        before.normalWeaponSourcedPerHit.total.average,
      ),
      demolisherChargedAverage: roundedDelta(
        after.demolisherChargedWeaponSourcedPerHit.total.average,
        before.demolisherChargedWeaponSourcedPerHit.total.average,
      ),
      isDps: false,
      isTotalHit: false,
    },
    provenance: uniqueProvenance([
      ...before.provenance,
      ...after.provenance,
    ]),
    fingerprint: comparisonFingerprint,
    warning: "These are guarded weapon-sourced per-hit and emission-evidence changes, not DPS or total-hit changes.",
  };
}
