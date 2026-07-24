import { describe, expect, it } from "vitest";
import {
  compareObservedDamageMeasurements,
  observedScenarioFingerprint,
  parseObservedDamageMeasurement,
  validateObservedDamageMeasurement,
  type ObservedDamageMeasurement,
  type ObservedDamageMeasurementForm,
} from "../../page/src/observed-measurement.js";

const shared: ObservedDamageMeasurementForm = {
  metric: "DPS",
  confidence: "exact",
  actorId: "bing-blast-nova",
  skillId: "hammer-of-ash",
  targetLabel: "Level 90 training dummy",
  scenarioLabel: "Standing still, full configured uptime",
  sampleDurationSeconds: "10",
  conditions: ["Boss target", "No party buffs"],
  source: "in-game training dummy",
};

function parse(
  overrides: ObservedDamageMeasurementForm = {},
): ObservedDamageMeasurement {
  const result = parseObservedDamageMeasurement({
    ...shared,
    ...overrides,
  });
  if (result.status === "invalid") {
    throw new Error(JSON.stringify(result.issues));
  }
  return result.measurement;
}

describe("user-observed damage measurements", () => {
  it("compares the core roughly-1T-before workflow without calling it modeled", () => {
    const before = parse({
      value: "~1T",
      confidence: "approximate",
    });
    const after = parse({
      value: "750B",
      confidence: "exact",
    });

    expect(before).toMatchObject({
      basis: "user-observed",
      isObserved: true,
      isModeled: false,
      metric: "dps",
      value: 1_000_000_000_000,
      confidence: "approximate",
      scope: "actor-skill",
    });
    const comparison = compareObservedDamageMeasurements(before, after);
    expect(comparison).toMatchObject({
      status: "comparable",
      basis: "user-observed",
      isObserved: true,
      isModeled: false,
      metric: "dps",
      scope: "actor-skill",
      confidence: "approximate",
      direction: "decrease",
      beforeObservedValue: 1_000_000_000_000,
      afterObservedValue: 750_000_000_000,
      absoluteObservedChange: -250_000_000_000,
      ratio: 0.75,
      percentChange: -25,
    });
  });

  it("defaults legacy observations to actor/skill scope and requires an explicit whole-loadout declaration", () => {
    const narrow = parse({ value: "1T" });
    const wholeLoadout = parse({
      value: "900B",
      scope: "whole-loadout",
    });
    const legacy: Record<string, unknown> = { ...narrow };
    delete legacy.scope;

    expect(narrow.scope).toBe("actor-skill");
    expect(wholeLoadout.scope).toBe("whole-loadout");
    expect(validateObservedDamageMeasurement(legacy)).toMatchObject({
      status: "valid",
      measurement: {
        scope: "actor-skill",
      },
    });
    expect(parseObservedDamageMeasurement({
      ...shared,
      value: "800B",
      scope: "entire-build-maybe",
    })).toMatchObject({
      status: "invalid",
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: "invalid-scope",
          field: "scope",
        }),
      ]),
    });
  });

  it("parses K/M/B/T suffixes but rejects zero, negative, NaN, and pathological values", () => {
    expect(parse({ value: "1.5K" }).value).toBe(1_500);
    expect(parse({ value: "2M" }).value).toBe(2_000_000);
    expect(parse({ value: "3.25B" }).value).toBe(3_250_000_000);
    expect(parse({ value: "1T" }).value).toBe(1_000_000_000_000);

    for (const value of [
      "0",
      "-1",
      "NaN",
      "Infinity",
      "1e309",
      "9999999999999999T",
      "1,,000",
      "1T garbage",
      "9".repeat(100),
    ]) {
      const result = parseObservedDamageMeasurement({ ...shared, value });
      expect(result.status, value).toBe("invalid");
    }
  });

  it("returns reference-only and no numeric delta when metric, actor, skill, or scenario differ", () => {
    const baseline = parse({ value: "1T" });
    const mismatches: Array<[
      ObservedDamageMeasurement,
      string,
    ]> = [
      [
        parse({
          value: "900B",
          metric: "damage per hit",
          sampleDurationSeconds: "",
        }),
        "metric-mismatch",
      ],
      [
        parse({ value: "900B", scope: "whole-loadout" }),
        "scope-mismatch",
      ],
      [
        parse({ value: "900B", actorId: "iris-vigilant-breeze" }),
        "actor-mismatch",
      ],
      [
        parse({ value: "900B", skillId: "scattered-mud" }),
        "skill-mismatch",
      ],
      [
        parse({ value: "900B", targetLabel: "Map boss" }),
        "scenario-mismatch",
      ],
      [
        parse({ value: "900B", sampleDurationSeconds: "20" }),
        "scenario-mismatch",
      ],
    ];

    for (const [candidate, reason] of mismatches) {
      const comparison = compareObservedDamageMeasurements(
        baseline,
        candidate,
      );
      expect(comparison.status, reason).toBe("reference-only");
      if (comparison.status !== "reference-only") continue;
      expect(comparison.reasons).toContain(reason);
      expect("direction" in comparison).toBe(false);
      expect("ratio" in comparison).toBe(false);
      expect("percentChange" in comparison).toBe(false);
    }
  });

  it("keeps unknown actor or skill identifiers as references rather than guessing", () => {
    const noActor = parse({ value: "1T", actorId: "" });
    const noSkill = parse({ value: "900B", skillId: "" });
    const comparison = compareObservedDamageMeasurements(noActor, noSkill);

    expect(comparison.status).toBe("reference-only");
    if (comparison.status !== "reference-only") return;
    expect(comparison.reasons).toEqual(
      expect.arrayContaining(["actor-unknown", "skill-unknown"]),
    );
    expect("ratio" in comparison).toBe(false);
  });

  it("makes scenario fingerprints deterministic across condition order and casing", () => {
    const first = parse({
      value: "1T",
      targetLabel: "  TRAINING   Dummy ",
      scenarioLabel: "Boss test",
      conditions: ["Stationary", "No Party Buffs", "stationary"],
    });
    const second = parse({
      value: "900B",
      targetLabel: "training dummy",
      scenarioLabel: "BOSS TEST",
      conditions: ["no party buffs", "STATIONARY"],
    });

    expect(first.scenarioFingerprint).toBe(second.scenarioFingerprint);
    expect(first.conditions).toEqual(["No Party Buffs", "Stationary"]);
    expect(
      observedScenarioFingerprint({
        targetLabel: first.targetLabel,
        scenarioLabel: first.scenarioLabel,
        sampleDurationSeconds: first.sampleDurationSeconds,
        conditions: [...first.conditions].reverse(),
      }),
    ).toBe(first.scenarioFingerprint);
    expect(compareObservedDamageMeasurements(first, second).status).toBe(
      "comparable",
    );
  });

  it("never converts a damage-per-hit observation into DPS", () => {
    const hit = parse({
      metric: "damage-per-hit",
      value: "2B",
      sampleDurationSeconds: "",
    });
    const dps = parse({ metric: "dps", value: "200B" });
    const comparison = compareObservedDamageMeasurements(hit, dps);

    expect(hit.metric).toBe("damage-per-hit");
    expect(comparison.status).toBe("reference-only");
    if (comparison.status !== "reference-only") return;
    expect(comparison.reasons).toContain("metric-mismatch");
    expect("ratio" in comparison).toBe(false);

    const attemptedConversion = parseObservedDamageMeasurement({
      ...shared,
      metric: "damage-per-hit",
      value: "2B",
      sampleDurationSeconds: "10",
    });
    expect(attemptedConversion).toMatchObject({
      status: "invalid",
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: "sample-duration-not-applicable",
        }),
      ]),
    });
  });

  it("revalidates stored observations and fails closed on forged values", () => {
    const valid = parse({ value: "1T" });
    const forged = {
      ...valid,
      value: Number.POSITIVE_INFINITY,
      scenarioFingerprint: valid.scenarioFingerprint,
    };
    const validation = validateObservedDamageMeasurement(forged);
    expect(validation.status).toBe("invalid");

    const comparison = compareObservedDamageMeasurements(valid, forged);
    expect(comparison.status).toBe("invalid");
    if (comparison.status !== "invalid") return;
    expect(comparison.issues).toEqual([
      expect.objectContaining({ side: "after" }),
    ]);
    expect("ratio" in comparison).toBe(false);
    expect("percentChange" in comparison).toBe(false);
  });
});
