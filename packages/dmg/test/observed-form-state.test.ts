import { describe, expect, it } from "vitest";
import {
  observedFormScope,
  observedMetadataConflicts,
  sharedObservedFormConditions,
  sharedObservedFormDuration,
  sharedObservedFormText,
} from "../../page/src/observed-form-state.js";
import {
  parseObservedDamageMeasurement,
  type ObservedDamageMeasurement,
  type ObservedDamageMeasurementForm,
} from "../../page/src/observed-measurement.js";

function measurement(
  overrides: ObservedDamageMeasurementForm = {},
): ObservedDamageMeasurement {
  const result = parseObservedDamageMeasurement({
    metric: "dps",
    value: "1T",
    confidence: "exact",
    actorId: "Bing",
    skillId: "Hammer of Ash",
    targetLabel: "Training Dummy",
    scenarioLabel: "Stationary Test",
    sampleDurationSeconds: "10",
    conditions: ["Target slowed", "No party buffs"],
    source: "Dummy log A",
    ...overrides,
  });
  if (result.status === "invalid") {
    throw new Error(JSON.stringify(result.issues));
  }
  return result.measurement;
}

describe("observed form state", () => {
  it("prefills optional scenario metadata from a one-sided observation", () => {
    const before = measurement();

    expect(sharedObservedFormDuration(before, undefined)).toBe(10);
    expect(sharedObservedFormConditions(before, undefined)).toBe(
      "No party buffs; Target slowed",
    );
  });

  it("does not treat valid per-side confidence and provenance as conflicts", () => {
    const before = measurement({
      confidence: "exact",
      source: "Dummy log A",
    });
    const after = measurement({
      confidence: "approximate",
      source: "Video capture B",
    });

    expect(observedMetadataConflicts(before, after)).toEqual([]);
  });

  it("uses the same canonical equality rules as observed comparison", () => {
    const before = measurement();
    const after = measurement({
      actorId: "  BING ",
      skillId: "hammer   of ash",
      targetLabel: "training dummy",
      scenarioLabel: "STATIONARY TEST",
      conditions: ["no party buffs", "TARGET SLOWED"],
    });

    expect(observedMetadataConflicts(before, after)).toEqual([]);
    expect(sharedObservedFormText(
      before.actorId,
      after.actorId,
      "",
    )).toBe("Bing");
  });

  it("keeps conflicting optional fields blank until overwrite is confirmed", () => {
    const before = measurement({
      sampleDurationSeconds: "10",
      conditions: ["Stationary"],
    });
    const after = measurement({
      sampleDurationSeconds: "20",
      conditions: ["Moving"],
    });

    expect(sharedObservedFormDuration(before, after)).toBe("");
    expect(sharedObservedFormConditions(before, after)).toBe("");
    expect(observedMetadataConflicts(before, after).map((row) => row.label))
      .toEqual(["Sample seconds", "Conditions"]);
  });

  it("requires unlike declared scopes to be resolved explicitly", () => {
    const before = measurement({ scope: "whole-loadout" });
    const after = measurement({ scope: "actor-skill" });

    expect(observedMetadataConflicts(before, after)).toContainEqual({
      label: "Scope",
      before: "whole-loadout",
      after: "actor-skill",
    });
  });

  it("treats a legacy missing scope as the fail-closed actor/skill default", () => {
    const before = measurement({ scope: "actor-skill" });
    const after = measurement({ scope: "actor-skill" });
    delete (after as Partial<ObservedDamageMeasurement>).scope;

    expect(observedFormScope(after.scope)).toBe("actor-skill");
    expect(observedMetadataConflicts(before, after)).toEqual([]);
  });
});
