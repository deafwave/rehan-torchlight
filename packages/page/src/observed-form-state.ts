import type {
  ObservedDamageMeasurement,
  ObservedMeasurementScope,
} from "./observed-measurement";

export interface ObservedMetadataConflict {
  label: string;
  before: string;
  after: string;
}

function canonicalText(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en-US");
}

function canonicalOptionalText(value: string | null | undefined) {
  return value == null ? null : canonicalText(value);
}

function canonicalConditions(values: readonly string[]) {
  return [...new Set(values.map(canonicalText))].sort();
}

function displayValue(value: unknown) {
  return Array.isArray(value)
    ? value.join("; ")
    : String(value ?? "blank");
}

/**
 * Scope-less observations can exist in session state created by an older page
 * revision. Keep the editor aligned with the parser's fail-closed legacy
 * default instead of presenting those records as a different scope.
 */
export function observedFormScope(
  value: ObservedMeasurementScope | null | undefined,
): ObservedMeasurementScope {
  return value ?? "actor-skill";
}

export function sharedObservedFormText(
  beforeValue: string | null | undefined,
  afterValue: string | null | undefined,
  fallback: string,
) {
  if (beforeValue && afterValue) {
    return canonicalText(beforeValue) === canonicalText(afterValue)
      ? beforeValue
      : "";
  }
  return beforeValue ?? afterValue ?? fallback;
}

export function sharedObservedFormDuration(
  before: ObservedDamageMeasurement | undefined,
  after: ObservedDamageMeasurement | undefined,
) {
  if (before && after) {
    return before.sampleDurationSeconds === after.sampleDurationSeconds
      ? before.sampleDurationSeconds ?? ""
      : "";
  }
  return before?.sampleDurationSeconds
    ?? after?.sampleDurationSeconds
    ?? "";
}

export function sharedObservedFormConditions(
  before: ObservedDamageMeasurement | undefined,
  after: ObservedDamageMeasurement | undefined,
) {
  if (before && after) {
    return JSON.stringify(canonicalConditions(before.conditions))
      === JSON.stringify(canonicalConditions(after.conditions))
      ? before.conditions.join("; ")
      : "";
  }
  return (before?.conditions ?? after?.conditions ?? []).join("; ");
}

export function observedMetadataConflicts(
  before: ObservedDamageMeasurement | undefined,
  after: ObservedDamageMeasurement | undefined,
): ObservedMetadataConflict[] {
  if (!before || !after) return [];
  const values: Array<{
    label: string;
    before: unknown;
    after: unknown;
    equal: boolean;
  }> = [
    {
      label: "Metric",
      before: before.metric,
      after: after.metric,
      equal: before.metric === after.metric,
    },
    {
      label: "Scope",
      before: observedFormScope(before.scope),
      after: observedFormScope(after.scope),
      equal:
        observedFormScope(before.scope) === observedFormScope(after.scope),
    },
    {
      label: "Actor",
      before: before.actorId,
      after: after.actorId,
      equal:
        canonicalOptionalText(before.actorId)
        === canonicalOptionalText(after.actorId),
    },
    {
      label: "Skill",
      before: before.skillId,
      after: after.skillId,
      equal:
        canonicalOptionalText(before.skillId)
        === canonicalOptionalText(after.skillId),
    },
    {
      label: "Target",
      before: before.targetLabel,
      after: after.targetLabel,
      equal: canonicalText(before.targetLabel)
        === canonicalText(after.targetLabel),
    },
    {
      label: "Test setup",
      before: before.scenarioLabel,
      after: after.scenarioLabel,
      equal: canonicalText(before.scenarioLabel)
        === canonicalText(after.scenarioLabel),
    },
    {
      label: "Sample seconds",
      before: before.sampleDurationSeconds,
      after: after.sampleDurationSeconds,
      equal:
        before.sampleDurationSeconds === after.sampleDurationSeconds,
    },
    {
      label: "Conditions",
      before: before.conditions,
      after: after.conditions,
      equal:
        JSON.stringify(canonicalConditions(before.conditions))
        === JSON.stringify(canonicalConditions(after.conditions)),
    },
  ];
  return values.flatMap((value) =>
    value.equal
      ? []
      : [{
          label: value.label,
          before: displayValue(value.before),
          after: displayValue(value.after),
        }]);
}
