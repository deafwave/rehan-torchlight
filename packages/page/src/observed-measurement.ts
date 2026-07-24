export type ObservedDamageMetric = "dps" | "damage-per-hit";
export type ObservedMeasurementConfidence = "approximate" | "exact";
export type ObservedMeasurementScope = "whole-loadout" | "actor-skill";

/**
 * Raw values from an HTML form or another untrusted boundary. Every field is
 * deliberately `unknown`: callers must go through the parser before a value
 * can be compared.
 */
export interface ObservedDamageMeasurementForm {
  metric?: unknown;
  value?: unknown;
  confidence?: unknown;
  scope?: unknown;
  actorId?: unknown;
  skillId?: unknown;
  targetLabel?: unknown;
  scenarioLabel?: unknown;
  sampleDurationSeconds?: unknown;
  conditions?: unknown;
  source?: unknown;
}

/**
 * A user-reported in-game observation. It is intentionally distinct from a
 * modeled Snapshot and cannot be silently substituted for modeled DPS.
 */
export interface ObservedDamageMeasurement {
  kind: "observed-damage-measurement";
  basis: "user-observed";
  isObserved: true;
  isModeled: false;
  metric: ObservedDamageMetric;
  value: number;
  confidence: ObservedMeasurementConfidence;
  /**
   * `actor-skill` is the fail-closed default for legacy observations. A
   * measurement is whole-loadout evidence only when the user declares it.
   */
  scope: ObservedMeasurementScope;
  actorId: string | null;
  skillId: string | null;
  targetLabel: string;
  scenarioLabel: string;
  sampleDurationSeconds: number | null;
  conditions: string[];
  source: string;
  scenarioFingerprint: string;
}

export type ObservedMeasurementIssueCode =
  | "not-an-object"
  | "invalid-metric"
  | "invalid-value"
  | "non-positive-value"
  | "value-too-large"
  | "invalid-confidence"
  | "invalid-scope"
  | "approximation-conflict"
  | "missing-target"
  | "missing-scenario"
  | "missing-source"
  | "invalid-text"
  | "too-many-conditions"
  | "invalid-conditions"
  | "invalid-sample-duration"
  | "sample-duration-not-applicable";

export interface ObservedMeasurementIssue {
  code: ObservedMeasurementIssueCode;
  field: string;
  message: string;
}

export type ObservedMeasurementParseResult =
  | {
      status: "valid";
      measurement: ObservedDamageMeasurement;
      issues: [];
    }
  | {
      status: "invalid";
      measurement: null;
      issues: ObservedMeasurementIssue[];
    };

export type ObservedComparisonReferenceReason =
  | "metric-mismatch"
  | "scope-mismatch"
  | "actor-unknown"
  | "actor-mismatch"
  | "skill-unknown"
  | "skill-mismatch"
  | "scenario-mismatch";

interface ObservedComparisonBase {
  kind: "observed-damage-comparison";
  basis: "user-observed";
  isObserved: true;
  isModeled: false;
}

export type ObservedDamageComparison =
  | (ObservedComparisonBase & {
      status: "invalid";
      issues: {
        side: "before" | "after";
        issues: ObservedMeasurementIssue[];
      }[];
    })
  | (ObservedComparisonBase & {
      status: "reference-only";
      reasons: ObservedComparisonReferenceReason[];
      before: ObservedDamageMeasurement;
      after: ObservedDamageMeasurement;
    })
  | (ObservedComparisonBase & {
      status: "comparable";
      metric: ObservedDamageMetric;
      scope: ObservedMeasurementScope;
      scenarioFingerprint: string;
      confidence: ObservedMeasurementConfidence;
      direction: "increase" | "decrease" | "unchanged";
      beforeObservedValue: number;
      afterObservedValue: number;
      absoluteObservedChange: number;
      ratio: number;
      percentChange: number;
      before: ObservedDamageMeasurement;
      after: ObservedDamageMeasurement;
    });

const MAX_VALUE = Number.MAX_SAFE_INTEGER;
const MAX_TEXT_LENGTH = 160;
const MAX_IDENTIFIER_LENGTH = 128;
const MAX_CONDITIONS = 32;
const MAX_SAMPLE_DURATION_SECONDS = 86_400;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const NUMBER_WITH_OPTIONAL_SUFFIX =
  /^(~)?\s*(\+?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+))\s*([kmbt])?\s*$/iu;

const suffixMultipliers: Readonly<Record<string, number>> = {
  "": 1,
  k: 1_000,
  m: 1_000_000,
  b: 1_000_000_000,
  t: 1_000_000_000_000,
};

function issue(
  code: ObservedMeasurementIssueCode,
  field: string,
  message: string,
): ObservedMeasurementIssue {
  return { code, field, message };
}

function normalizedText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function canonicalText(value: string): string {
  return normalizedText(value).toLocaleLowerCase("en-US");
}

function safeText(
  value: unknown,
  field: string,
  options: {
    required: boolean;
    maxLength?: number;
  },
): { value: string | null; issue?: ObservedMeasurementIssue } {
  if (typeof value !== "string") {
    if (!options.required && (value === undefined || value === null)) {
      return { value: null };
    }
    return {
      value: null,
      issue: issue(
        "invalid-text",
        field,
        `${field} must be text.`,
      ),
    };
  }
  const text = normalizedText(value);
  if (text.length === 0) {
    if (!options.required) return { value: null };
    const missingCode =
      field === "targetLabel"
        ? "missing-target"
        : field === "scenarioLabel"
          ? "missing-scenario"
          : field === "source"
            ? "missing-source"
            : "invalid-text";
    return {
      value: null,
      issue: issue(missingCode, field, `${field} is required.`),
    };
  }
  if (
    text.length > (options.maxLength ?? MAX_TEXT_LENGTH)
    || CONTROL_CHARACTERS.test(text)
  ) {
    return {
      value: null,
      issue: issue(
        "invalid-text",
        field,
        `${field} is too long or contains control characters.`,
      ),
    };
  }
  return { value: text };
}

function parseMetric(value: unknown): ObservedDamageMetric | null {
  if (typeof value !== "string") return null;
  switch (canonicalText(value).replace(/_/gu, "-")) {
    case "dps":
    case "damage per second":
    case "damage-per-second":
      return "dps";
    case "hit":
    case "damage per hit":
    case "damage-per-hit":
      return "damage-per-hit";
    default:
      return null;
  }
}

function parseConfidence(
  value: unknown,
): ObservedMeasurementConfidence | null {
  if (typeof value !== "string") return null;
  const normalized = canonicalText(value);
  if (normalized === "approximate" || normalized === "exact") {
    return normalized;
  }
  return null;
}

function parseScope(value: unknown): ObservedMeasurementScope | null {
  if (value === undefined || value === null || value === "") {
    return "actor-skill";
  }
  if (typeof value !== "string") return null;
  switch (canonicalText(value).replace(/[_\s]+/gu, "-")) {
    case "whole-loadout":
      return "whole-loadout";
    case "actor-skill":
      return "actor-skill";
    default:
      return null;
  }
}

function parseObservedNumber(value: unknown): {
  value: number | null;
  approximateMarker: boolean;
  issue?: ObservedMeasurementIssue;
} {
  if (typeof value !== "string" || value.length > 64) {
    return {
      value: null,
      approximateMarker: false,
      issue: issue(
        "invalid-value",
        "value",
        "Observed value must be a short decimal with an optional K/M/B/T suffix.",
      ),
    };
  }
  const match = NUMBER_WITH_OPTIONAL_SUFFIX.exec(value);
  if (!match) {
    return {
      value: null,
      approximateMarker: false,
      issue: issue(
        "invalid-value",
        "value",
        "Observed value must be a decimal with an optional K/M/B/T suffix.",
      ),
    };
  }
  const numeric = Number(match[2].replace(/,/gu, ""));
  const multiplier = suffixMultipliers[(match[3] ?? "").toLowerCase()];
  const parsed = numeric * multiplier;
  if (!Number.isFinite(parsed)) {
    return {
      value: null,
      approximateMarker: Boolean(match[1]),
      issue: issue(
        "invalid-value",
        "value",
        "Observed value must be finite.",
      ),
    };
  }
  if (parsed <= 0) {
    return {
      value: null,
      approximateMarker: Boolean(match[1]),
      issue: issue(
        "non-positive-value",
        "value",
        "Observed value must be greater than zero.",
      ),
    };
  }
  if (parsed > MAX_VALUE) {
    return {
      value: null,
      approximateMarker: Boolean(match[1]),
      issue: issue(
        "value-too-large",
        "value",
        "Observed value is above the safe numeric comparison limit.",
      ),
    };
  }
  return {
    value: parsed,
    approximateMarker: Boolean(match[1]),
  };
}

function parseSampleDuration(
  value: unknown,
  metric: ObservedDamageMetric | null,
): {
  value: number | null;
  issue?: ObservedMeasurementIssue;
} {
  if (value === undefined || value === null) return { value: null };
  if (typeof value !== "string") {
    return {
      value: null,
      issue: issue(
        "invalid-sample-duration",
        "sampleDurationSeconds",
        "Sample duration must be entered as seconds.",
      ),
    };
  }
  const trimmed = value.trim();
  if (trimmed === "") return { value: null };
  if (metric === "damage-per-hit") {
    return {
      value: null,
      issue: issue(
        "sample-duration-not-applicable",
        "sampleDurationSeconds",
        "A per-hit observation cannot be converted to DPS with a sample duration.",
      ),
    };
  }
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/u.test(trimmed)) {
    return {
      value: null,
      issue: issue(
        "invalid-sample-duration",
        "sampleDurationSeconds",
        "Sample duration must be a positive decimal number of seconds.",
      ),
    };
  }
  const parsed = Number(trimmed);
  if (
    !Number.isFinite(parsed)
    || parsed <= 0
    || parsed > MAX_SAMPLE_DURATION_SECONDS
  ) {
    return {
      value: null,
      issue: issue(
        "invalid-sample-duration",
        "sampleDurationSeconds",
        "Sample duration must be between 0 and 86,400 seconds.",
      ),
    };
  }
  return { value: parsed };
}

function parseConditions(value: unknown): {
  value: string[];
  issue?: ObservedMeasurementIssue;
} {
  let raw: unknown[];
  if (value === undefined || value === null || value === "") {
    return { value: [] };
  }
  if (typeof value === "string") {
    raw = value.split(/\r?\n|;/u);
  } else if (Array.isArray(value)) {
    raw = value;
  } else {
    return {
      value: [],
      issue: issue(
        "invalid-conditions",
        "conditions",
        "Conditions must be text or a list of text values.",
      ),
    };
  }
  if (raw.length > MAX_CONDITIONS) {
    return {
      value: [],
      issue: issue(
        "too-many-conditions",
        "conditions",
        `At most ${MAX_CONDITIONS} conditions may be compared.`,
      ),
    };
  }

  const unique = new Map<string, string>();
  for (const candidate of raw) {
    if (typeof candidate !== "string") {
      return {
        value: [],
        issue: issue(
          "invalid-conditions",
          "conditions",
          "Every condition must be text.",
        ),
      };
    }
    const text = normalizedText(candidate);
    if (text.length === 0) continue;
    if (text.length > MAX_TEXT_LENGTH || CONTROL_CHARACTERS.test(text)) {
      return {
        value: [],
        issue: issue(
          "invalid-conditions",
          "conditions",
          "A condition is too long or contains control characters.",
        ),
      };
    }
    const key = canonicalText(text);
    if (!unique.has(key)) unique.set(key, text);
  }

  return {
    value: [...unique.entries()]
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([, text]) => text),
  };
}

interface ScenarioFingerprintInput {
  targetLabel: string;
  scenarioLabel: string;
  sampleDurationSeconds: number | null;
  conditions: readonly string[];
}

/**
 * This fingerprint uses an injective canonical encoding instead of a compact,
 * collision-prone checksum. The parser bounds every component first.
 */
export function observedScenarioFingerprint(
  input: ScenarioFingerprintInput,
): string {
  const canonical = JSON.stringify({
    version: 1,
    target: canonicalText(input.targetLabel),
    scenario: canonicalText(input.scenarioLabel),
    sampleDurationSeconds: input.sampleDurationSeconds,
    conditions: [...new Set(input.conditions.map(canonicalText))]
      .sort((left, right) => left < right ? -1 : left > right ? 1 : 0),
  });
  return `observed-scenario-v1:${encodeURIComponent(canonical)}`;
}

function parseForm(input: unknown): ObservedMeasurementParseResult {
  if (
    typeof input !== "object"
    || input === null
    || Array.isArray(input)
  ) {
    return {
      status: "invalid",
      measurement: null,
      issues: [
        issue(
          "not-an-object",
          "form",
          "Observed measurement input must be a form object.",
        ),
      ],
    };
  }
  const form = input as ObservedDamageMeasurementForm;
  const issues: ObservedMeasurementIssue[] = [];
  const metric = parseMetric(form.metric);
  if (!metric) {
    issues.push(issue(
      "invalid-metric",
      "metric",
      "Metric must be DPS or damage per hit.",
    ));
  }
  const observedValue = parseObservedNumber(form.value);
  if (observedValue.issue) issues.push(observedValue.issue);
  const confidence = parseConfidence(form.confidence);
  if (!confidence) {
    issues.push(issue(
      "invalid-confidence",
      "confidence",
      "Confidence must be approximate or exact.",
    ));
  } else if (observedValue.approximateMarker && confidence === "exact") {
    issues.push(issue(
      "approximation-conflict",
      "confidence",
      "A value prefixed with ~ must use approximate confidence.",
    ));
  }
  const scope = parseScope(form.scope);
  if (!scope) {
    issues.push(issue(
      "invalid-scope",
      "scope",
      "Scope must be whole loadout or actor/skill.",
    ));
  }

  const actor = safeText(form.actorId, "actorId", {
    required: false,
    maxLength: MAX_IDENTIFIER_LENGTH,
  });
  const skill = safeText(form.skillId, "skillId", {
    required: false,
    maxLength: MAX_IDENTIFIER_LENGTH,
  });
  const target = safeText(form.targetLabel, "targetLabel", {
    required: true,
  });
  const scenario = safeText(form.scenarioLabel, "scenarioLabel", {
    required: true,
  });
  const source = safeText(form.source, "source", { required: true });
  for (const parsed of [actor, skill, target, scenario, source]) {
    if (parsed.issue) issues.push(parsed.issue);
  }
  const conditions = parseConditions(form.conditions);
  if (conditions.issue) issues.push(conditions.issue);
  const sampleDuration = parseSampleDuration(
    form.sampleDurationSeconds,
    metric,
  );
  if (sampleDuration.issue) issues.push(sampleDuration.issue);

  if (
    issues.length > 0
    || metric === null
    || observedValue.value === null
    || confidence === null
    || scope === null
    || target.value === null
    || scenario.value === null
    || source.value === null
  ) {
    return {
      status: "invalid",
      measurement: null,
      issues,
    };
  }

  const fingerprintInput: ScenarioFingerprintInput = {
    targetLabel: target.value,
    scenarioLabel: scenario.value,
    sampleDurationSeconds: sampleDuration.value,
    conditions: conditions.value,
  };
  return {
    status: "valid",
    issues: [],
    measurement: {
      kind: "observed-damage-measurement",
      basis: "user-observed",
      isObserved: true,
      isModeled: false,
      metric,
      value: observedValue.value,
      confidence,
      scope,
      actorId: actor.value,
      skillId: skill.value,
      targetLabel: target.value,
      scenarioLabel: scenario.value,
      sampleDurationSeconds: sampleDuration.value,
      conditions: conditions.value,
      source: source.value,
      scenarioFingerprint: observedScenarioFingerprint(fingerprintInput),
    },
  };
}

export function parseObservedDamageMeasurement(
  input: unknown,
): ObservedMeasurementParseResult {
  return parseForm(input);
}

function formFromMeasurement(
  input: ObservedDamageMeasurement,
): ObservedDamageMeasurementForm {
  return {
    metric: input.metric,
    value: String(input.value),
    confidence: input.confidence,
    scope: input.scope,
    actorId: input.actorId,
    skillId: input.skillId,
    targetLabel: input.targetLabel,
    scenarioLabel: input.scenarioLabel,
    sampleDurationSeconds:
      input.sampleDurationSeconds === null
        ? undefined
        : String(input.sampleDurationSeconds),
    conditions: input.conditions,
    source: input.source,
  };
}

/**
 * Revalidates a stored measurement instead of trusting its TypeScript type.
 * The canonical fingerprint is recomputed, so a forged or stale fingerprint
 * cannot make two scenarios comparable.
 */
export function validateObservedDamageMeasurement(
  input: unknown,
): ObservedMeasurementParseResult {
  if (
    typeof input !== "object"
    || input === null
    || Array.isArray(input)
    || (input as Partial<ObservedDamageMeasurement>).kind
      !== "observed-damage-measurement"
    || (input as Partial<ObservedDamageMeasurement>).basis !== "user-observed"
    || (input as Partial<ObservedDamageMeasurement>).isObserved !== true
    || (input as Partial<ObservedDamageMeasurement>).isModeled !== false
  ) {
    return {
      status: "invalid",
      measurement: null,
      issues: [
        issue(
          "not-an-object",
          "measurement",
          "Value is not a user-observed damage measurement.",
        ),
      ],
    };
  }
  return parseForm(formFromMeasurement(input as ObservedDamageMeasurement));
}

function canonicalIdentifier(value: string): string {
  return canonicalText(value);
}

/**
 * Computes a delta only when the two observations prove the same metric,
 * declared scope, actor, skill, and scenario. Valid but unaligned observations
 * remain useful as references, but receive no ratio, percent, or direction
 * fields.
 */
export function compareObservedDamageMeasurements(
  beforeInput: unknown,
  afterInput: unknown,
): ObservedDamageComparison {
  const beforeResult = validateObservedDamageMeasurement(beforeInput);
  const afterResult = validateObservedDamageMeasurement(afterInput);
  const invalidIssues: {
    side: "before" | "after";
    issues: ObservedMeasurementIssue[];
  }[] = [];
  if (beforeResult.status === "invalid") {
    invalidIssues.push({ side: "before", issues: beforeResult.issues });
  }
  if (afterResult.status === "invalid") {
    invalidIssues.push({ side: "after", issues: afterResult.issues });
  }
  const base: ObservedComparisonBase = {
    kind: "observed-damage-comparison",
    basis: "user-observed",
    isObserved: true,
    isModeled: false,
  };
  if (
    invalidIssues.length > 0
    || beforeResult.status === "invalid"
    || afterResult.status === "invalid"
  ) {
    return {
      ...base,
      status: "invalid",
      issues: invalidIssues,
    };
  }

  const before = beforeResult.measurement;
  const after = afterResult.measurement;
  const reasons: ObservedComparisonReferenceReason[] = [];
  if (before.metric !== after.metric) reasons.push("metric-mismatch");
  if (before.scope !== after.scope) reasons.push("scope-mismatch");
  if (!before.actorId || !after.actorId) {
    reasons.push("actor-unknown");
  } else if (
    canonicalIdentifier(before.actorId)
    !== canonicalIdentifier(after.actorId)
  ) {
    reasons.push("actor-mismatch");
  }
  if (!before.skillId || !after.skillId) {
    reasons.push("skill-unknown");
  } else if (
    canonicalIdentifier(before.skillId)
    !== canonicalIdentifier(after.skillId)
  ) {
    reasons.push("skill-mismatch");
  }
  if (before.scenarioFingerprint !== after.scenarioFingerprint) {
    reasons.push("scenario-mismatch");
  }
  if (reasons.length > 0) {
    return {
      ...base,
      status: "reference-only",
      reasons,
      before,
      after,
    };
  }

  const ratio = after.value / before.value;
  const absoluteObservedChange = after.value - before.value;
  return {
    ...base,
    status: "comparable",
    metric: before.metric,
    scope: before.scope,
    scenarioFingerprint: before.scenarioFingerprint,
    confidence:
      before.confidence === "exact" && after.confidence === "exact"
        ? "exact"
        : "approximate",
    direction:
      absoluteObservedChange > 0
        ? "increase"
        : absoluteObservedChange < 0
          ? "decrease"
          : "unchanged",
    beforeObservedValue: before.value,
    afterObservedValue: after.value,
    absoluteObservedChange,
    ratio,
    percentChange: (ratio - 1) * 100,
    before,
    after,
  };
}
