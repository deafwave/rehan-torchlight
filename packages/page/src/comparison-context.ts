import type {
  AnalyzedLoadout,
  LoadoutComparisonContext,
  LoadoutComparisonSourceKind,
} from "./analysis-types";

export const IRIS_SPIRIT_MAGUS_ARCHETYPE_ID = "iris-spirit-magus";

export type LoadoutComparisonKind =
  | "progression"
  | "reference"
  | "incompatible";

export interface LoadoutComparisonClassification {
  kind: LoadoutComparisonKind;
  reason: string;
}

type SourceFamily = "teaching" | "compendium" | "portable";

function sourceFamily(
  sourceKind: LoadoutComparisonSourceKind,
): SourceFamily | null {
  if (sourceKind === "teaching") return "teaching";
  if (sourceKind === "compendium") return "compendium";
  if (sourceKind === "portable-v3"
      || sourceKind === "portable-converter") {
    return "portable";
  }
  return null;
}

function knownValue(value: string | null): string | null {
  if (value === null || !value.trim()) return null;
  const normalized = value.trim().toLowerCase();
  return normalized !== "unknown"
    && normalized !== "unknown patch"
    && normalized !== "live game"
    && normalized !== "n/a"
    ? value.trim()
    : null;
}

function samePatch(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function sameIdentity(left: string, right: string): boolean {
  return left.trim() === right.trim();
}

function contextOf(
  loadout: AnalyzedLoadout,
): LoadoutComparisonContext | null {
  return loadout.comparisonContext ?? null;
}

/**
 * Establish whether a pair is safe to describe as character progression.
 *
 * The result is symmetric: reversing before/after never changes its kind or
 * reason. Reference comparisons may still teach or contrast, but must not be
 * narrated as upgrades to the same character.
 */
export function classifyComparisonContext(
  before: AnalyzedLoadout,
  after: AnalyzedLoadout,
): LoadoutComparisonClassification {
  const left = contextOf(before);
  const right = contextOf(after);
  if (!left || !right) {
    return {
      kind: "reference",
      reason: "Comparison context is missing on one or both loadouts; the pair is reference-only.",
    };
  }

  const leftFamily = sourceFamily(left.sourceKind);
  const rightFamily = sourceFamily(right.sourceKind);
  const leftPatch = knownValue(left.patch);
  const rightPatch = knownValue(right.patch);
  const leftActor = knownValue(left.actorId);
  const rightActor = knownValue(right.actorId);
  const leftArchetype = knownValue(left.archetypeId);
  const rightArchetype = knownValue(right.archetypeId);
  const leftLineage = knownValue(left.lineageId);
  const rightLineage = knownValue(right.lineageId);
  if (leftPatch !== null
      && rightPatch !== null
      && !samePatch(leftPatch, rightPatch)) {
    return {
      kind: "incompatible",
      reason: "The loadouts declare different patches; progression attribution is incompatible across patches.",
    };
  }
  if (leftActor !== null
      && rightActor !== null
      && !sameIdentity(leftActor, rightActor)) {
    return {
      kind: "incompatible",
      reason: "The loadouts resolve to different actors; progression attribution is incompatible across actors.",
    };
  }

  if (leftFamily === "teaching" || rightFamily === "teaching") {
    return {
      kind: "reference",
      reason: "Teaching scenarios are reference-only and cannot establish imported-build progression.",
    };
  }

  if (leftPatch === null
      || rightPatch === null
      || leftActor === null
      || rightActor === null
      || leftArchetype === null
      || rightArchetype === null
      || leftFamily === null
      || rightFamily === null) {
    return {
      kind: "reference",
      reason: "Patch, actor, archetype, or imported source identity is unresolved; the pair is reference-only.",
    };
  }

  if (!sameIdentity(leftArchetype, rightArchetype)) {
    return {
      kind: "reference",
      reason: "The loadouts resolve to different archetypes; they may be compared only as references.",
    };
  }
  if (leftFamily !== rightFamily) {
    return {
      kind: "reference",
      reason: "The loadouts come from different source families; they may be compared only as references.",
    };
  }
  if (leftLineage === null
      || rightLineage === null
      || !sameIdentity(leftLineage, rightLineage)) {
    return {
      kind: "reference",
      reason: "The loadouts do not share one proven source-document lineage; they may be compared only as references.",
    };
  }

  return {
    kind: "progression",
    reason:
      left.lineageEvidence === "user-confirmed-pair"
      && right.lineageEvidence === "user-confirmed-pair"
        ? "The user confirmed these loadouts are two states of the same character; patch, actor, archetype, and source family also match."
        : "Patch, actor, archetype, non-teaching source family, and source-document lineage match.",
  };
}
