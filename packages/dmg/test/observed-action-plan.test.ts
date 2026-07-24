import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  actionPlanReport,
  buildComparisonActionPlan,
} from "../../page/src/action-plan.js";
import type {
  AnalyzedBuild,
  AnalyzedLoadout,
  ImportCatalog,
} from "../../page/src/analysis-types.js";
import {
  parseObservedDamageMeasurement,
  type ObservedDamageMeasurement,
  type ObservedDamageMeasurementForm,
} from "../../page/src/observed-measurement.js";
import { importBuild } from "../../page/src/importer.js";
import { fromRoot } from "../src/py.js";

const emptyCatalog: ImportCatalog = {
  skillNames: {},
  treeNames: {},
  heroNames: {},
  pactNames: {},
};

function bing(): AnalyzedBuild {
  return importBuild(
    JSON.parse(fs.readFileSync(fromRoot("data/builds/bing_china.json"), "utf8")),
    emptyCatalog,
  );
}

function wuxia(): AnalyzedBuild {
  return importBuild(
    JSON.parse(fs.readFileSync(fromRoot("data/builds/WuxiaSS13.json"), "utf8")),
    emptyCatalog,
  );
}

function observed(
  loadout: AnalyzedLoadout,
  overrides: ObservedDamageMeasurementForm,
): ObservedDamageMeasurement {
  const result = parseObservedDamageMeasurement({
    metric: "dps",
    value: "1T",
    confidence: "exact",
    scope: "whole-loadout",
    actorId: loadout.comparisonContext?.actorId,
    skillId: loadout.comparisonContext?.archetypeId,
    targetLabel: "Level 90 training dummy",
    scenarioLabel: "Stationary boss test",
    sampleDurationSeconds: "10",
    conditions: ["No party buffs", "Full configured uptime"],
    source: "in-game training dummy",
    ...overrides,
  });
  if (result.status === "invalid") {
    throw new Error(JSON.stringify(result.issues));
  }
  return result.measurement;
}

describe("observed evidence in the action plan", () => {
  it("reads explicit whole-loadout observations attached to loadouts", () => {
    const build = bing();
    const before = build.loadouts[5];
    const after = build.loadouts[6];
    before.observedDamage = observed(before, { value: "1T" });
    after.observedDamage = observed(after, { value: "900B" });

    const plan = buildComparisonActionPlan(before, after);

    expect(plan.summary.observedDpsAvailable).toBe(true);
    expect(plan.findings[0]).toMatchObject({
      id: "observed:dps",
      proof: "observed-result",
    });
    expect(plan.findings[0].metric?.relativeDelta).toBeCloseTo(-0.1, 12);
    expect(actionPlanReport(before, after)).toContain(
      "DPS status: whole-loadout DPS observed from aligned user measurements",
    );
  });

  it("does not let an observed form override an incompatible imported pair", () => {
    const build = bing();
    const before = build.loadouts[5];
    const after = structuredClone(build.loadouts[6]);
    after.comparisonContext!.patch = "SS14";
    before.observedDamage = observed(before, {
      value: "1T",
      source: "before training log",
    });
    after.observedDamage = observed(after, {
      value: "900B",
      confidence: "approximate",
      source: "after training log",
    });

    const plan = buildComparisonActionPlan(before, after);

    expect(plan.summary).toMatchObject({
      comparisonKind: "incompatible",
      observed: 0,
      observedDpsAvailable: false,
    });
    expect(plan.findings).toEqual([]);
    expect(plan.blockers).toContainEqual(expect.objectContaining({
      code: "comparison-context-incompatible",
    }));
    expect(plan.blockers).toContainEqual(expect.objectContaining({
      code: "observed-comparison-context-incompatible",
      contexts: expect.arrayContaining([
        expect.stringContaining(
          "Before observation: value 1000000000000 DPS",
        ),
        expect.stringContaining(
          "After observation: value 900000000000 DPS",
        ),
        expect.stringContaining("source before training log"),
        expect.stringContaining("source after training log"),
      ]),
    }));
    const report = actionPlanReport(before, after, plan);
    expect(report).toContain(
      "Before observation: value 1000000000000 DPS",
    );
    expect(report).toContain(
      "After observation: value 900000000000 DPS",
    );
    expect(report).toContain("scope whole-loadout");
    expect(report).toContain("confidence approximate");
    expect(report).toContain("source before training log");
    expect(report).toContain("source after training log");
  });

  it("rejects mutually aligned observations that do not belong to the selected actor and skill", () => {
    const build = bing();
    const before = build.loadouts[5];
    const after = build.loadouts[6];
    before.observedDamage = observed(before, {
      value: "1T",
      actorId: "iris-not-bing",
      skillId: "summon-rock-not-hammer",
    });
    after.observedDamage = observed(after, {
      value: "800B",
      actorId: "iris-not-bing",
      skillId: "summon-rock-not-hammer",
    });

    const plan = buildComparisonActionPlan(before, after);

    expect(plan.summary).toMatchObject({
      observed: 0,
      observedDpsAvailable: false,
    });
    expect(plan.findings.some((finding) =>
      finding.proof === "observed-result"
      || finding.id === "observed:reconcile:guarded-component-gain")).toBe(
      false,
    );
    expect(plan.blockers).toContainEqual(expect.objectContaining({
      code: "observed-loadout-identity-mismatch",
      side: "both",
      contexts: expect.arrayContaining([
        expect.stringContaining(
          "before: actor iris-not-bing · skill summon-rock-not-hammer",
        ),
        expect.stringContaining(
          "after: actor iris-not-bing · skill summon-rock-not-hammer",
        ),
      ]),
    }));
  });

  it("does not accept an unrelated enabled skill as the measured damage identity", () => {
    const build = bing();
    const before = build.loadouts[5];
    const after = build.loadouts[6];
    const auxiliarySkill = before.skills.filter((skill) =>
      skill.kind === "active" && skill.enabled)[1]?.guid;
    expect(auxiliarySkill).toBeTruthy();
    before.observedDamage = observed(before, {
      value: "1T",
      skillId: auxiliarySkill,
    });
    after.observedDamage = observed(after, {
      value: "800B",
      skillId: auxiliarySkill,
    });

    const plan = buildComparisonActionPlan(before, after);

    expect(plan.findings.some((finding) =>
      finding.proof === "observed-result")).toBe(false);
    expect(plan.blockers).toContainEqual(expect.objectContaining({
      code: "observed-loadout-identity-mismatch",
      side: "both",
    }));
  });

  it("does not reconcile a specific summon observation with another summon actor", () => {
    const build = wuxia();
    const before = build.loadouts[5];
    const after = build.loadouts[8];
    const rock = before.summonEvidence?.find((summon) =>
      summon.skillName === "Summon Rock Magus");
    expect(rock).toBeDefined();
    const pair = {
      before: observed(before, {
        value: "1T",
        scope: "actor-skill",
        actorId: rock!.skillId,
        skillId: rock!.skillId,
      }),
      after: observed(after, {
        value: "800B",
        scope: "actor-skill",
        actorId: rock!.skillId,
        skillId: rock!.skillId,
      }),
    };

    const plan = buildComparisonActionPlan(before, after, {
      observedMeasurements: pair,
    });

    expect(plan.findings).toContainEqual(expect.objectContaining({
      id: "observed:dps",
      proof: "observed-result",
      claims: { isNetDps: false, isEhp: false },
    }));
    expect(plan.summary).toMatchObject({
      observed: 1,
      observedDpsAvailable: false,
      observedDpsScope: "actor-skill",
    });
    expect(actionPlanReport(before, after, plan)).toContain(
      "observed for the declared actor/skill only",
    );
    expect(plan.findings.some((finding) =>
      finding.id === "observed:reconcile:guarded-component-gain")).toBe(false);
    expect(plan.findings.some((finding) =>
      finding.id === "minion-foundation:95109085-5149-578b-b165-e38facc3cbaa"
      && finding.direction === "gain")).toBe(true);
  });

  it("never infers whole-loadout scope from a matching comparison-context identity", () => {
    const build = wuxia();
    const before = build.loadouts[5];
    const after = build.loadouts[8];
    const pair = (scope: "actor-skill" | "whole-loadout") => ({
      before: observed(before, { value: "1T", scope }),
      after: observed(after, { value: "800B", scope }),
    });

    const narrow = buildComparisonActionPlan(before, after, {
      observedMeasurements: pair("actor-skill"),
    });
    const wholeLoadout = buildComparisonActionPlan(before, after, {
      observedMeasurements: pair("whole-loadout"),
    });
    const narrowResult = narrow.findings.find((finding) =>
      finding.id === "observed:dps");
    const wholeResult = wholeLoadout.findings.find((finding) =>
      finding.id === "observed:dps");

    expect(narrowResult).toMatchObject({
      claims: { isNetDps: false, isEhp: false },
      metric: { unit: "observed actor/skill DPS" },
    });
    expect(narrowResult?.evidence.join(" ")).toContain(
      "no whole-loadout DPS",
    );
    expect(narrow.summary).toMatchObject({
      observed: 1,
      observedDpsAvailable: false,
      observedDpsScope: "actor-skill",
    });
    expect(narrow.findings.some((finding) =>
      finding.id === "observed:reconcile:guarded-component-gain")).toBe(false);

    expect(wholeResult).toMatchObject({
      claims: { isNetDps: true, isEhp: false },
      metric: { unit: "observed whole-loadout DPS" },
    });
    expect(wholeLoadout.summary).toMatchObject({
      observed: 1,
      observedDpsAvailable: true,
      observedDpsScope: "whole-loadout",
    });
    expect(wholeLoadout.findings).toContainEqual(expect.objectContaining({
      id: "observed:reconcile:guarded-component-gain",
      claims: { isNetDps: true, isEhp: false },
    }));
    expect(wholeLoadout.summary.observed).toBe(1);
  });

  it("keeps unlike declared scopes reference-only", () => {
    const build = bing();
    const before = build.loadouts[5];
    const after = build.loadouts[6];
    const plan = buildComparisonActionPlan(before, after, {
      observedMeasurements: {
        before: observed(before, {
          value: "1T",
          scope: "whole-loadout",
        }),
        after: observed(after, {
          value: "900B",
          scope: "actor-skill",
        }),
      },
    });

    expect(plan.summary).toMatchObject({
      observed: 0,
      observedDpsAvailable: false,
      observedDpsScope: null,
    });
    expect(plan.findings.some((finding) =>
      finding.proof === "observed-result")).toBe(false);
    expect(plan.blockers).toContainEqual(expect.objectContaining({
      code: "observed-measurement-reference-only",
      contexts: expect.arrayContaining([
        "the declared observation scopes differ",
        expect.stringContaining("scope whole-loadout"),
        expect.stringContaining("scope actor-skill"),
      ]),
    }));
  });

  it("does not compare one session-local observation to itself", () => {
    const build = bing();
    const loadout = build.loadouts[5];
    loadout.observedDamage = observed(loadout, { value: "1T" });

    const plan = buildComparisonActionPlan(loadout, loadout);

    expect(plan.summary).toMatchObject({
      observed: 0,
      observedDpsAvailable: false,
    });
    expect(plan.findings.some((finding) =>
      finding.proof === "observed-result")).toBe(false);
    expect(plan.blockers).toContainEqual(expect.objectContaining({
      code: "observed-same-loadout",
      side: "both",
    }));
  });

  it("ranks an aligned observed DPS loss above modeled and partial evidence", () => {
    const build = bing();
    const before = build.loadouts[5];
    const after = build.loadouts[6];
    const pair = {
      before: observed(before, {
        value: "~1T",
        confidence: "approximate",
      }),
      after: observed(after, { value: "750B" }),
    };
    const plan = buildComparisonActionPlan(before, after, {
      observedMeasurements: pair,
    });
    const result = plan.findings.find((finding) =>
      finding.id === "observed:dps");

    expect(plan.findings[0].proof).toBe("observed-result");
    expect(result).toMatchObject({
      proof: "observed-result",
      direction: "loss",
      claims: { isNetDps: true, isEhp: false },
      metric: {
        before: 1_000_000_000_000,
        after: 750_000_000_000,
        relativeDelta: -0.25,
        unit: "observed whole-loadout DPS",
      },
    });
    expect(result?.explanation).toContain("do not identify");
    expect(plan.summary).toMatchObject({
      observedDpsAvailable: true,
    });
    expect(plan.summary.observed).toBe(1);

    const report = actionPlanReport(before, after, plan);
    expect(report).toContain(
      "DPS status: whole-loadout DPS observed from aligned user measurements",
    );
    expect(report).toContain("[observed-result]");
    expect(report).toContain("formula attribution is not");
  });

  it("retains metric, actor/skill identity, and matched scenario in the shared report", () => {
    const build = bing();
    const before = build.loadouts[5];
    const after = build.loadouts[6];
    before.observedDamage = observed(before, { value: "1T" });
    after.observedDamage = observed(after, { value: "900B" });

    const report = actionPlanReport(before, after);
    const actorId = before.comparisonContext?.actorId;
    const skillId = before.comparisonContext?.archetypeId;

    expect(report).toContain(
      "Evidence: Observed whole-loadout DPS: 1T → 900B observed whole-loadout DPS",
    );
    expect(report).toContain(
      `Evidence: Identity: actor ${actorId} · skill ${skillId}`,
    );
    expect(report).toContain(
      "Evidence: Matched scenario: Level 90 training dummy · Stationary boss test · 10s sample",
    );
    expect(report).toContain("Full configured uptime");
    expect(report).toContain("No party buffs");
    expect(report).toContain(
      "Before: exact observation from in-game training dummy",
    );
    expect(report).toContain(
      "After: exact observation from in-game training dummy",
    );
  });

  it("keeps aligned observed damage per hit separate from DPS", () => {
    const build = bing();
    const before = build.loadouts[5];
    const after = build.loadouts[6];
    const pair = {
      before: observed(before, {
        metric: "damage-per-hit",
        value: "2B",
        sampleDurationSeconds: "",
      }),
      after: observed(after, {
        metric: "damage-per-hit",
        value: "1.5B",
        sampleDurationSeconds: "",
      }),
    };
    const plan = buildComparisonActionPlan(before, after, {
      observedMeasurements: pair,
    });
    const result = plan.findings.find((finding) =>
      finding.id === "observed:damage-per-hit");

    expect(result).toMatchObject({
      proof: "observed-result",
      claims: { isNetDps: false, isEhp: false },
      metric: { unit: "observed whole-loadout damage / hit" },
    });
    expect(result?.evidence.join(" ")).toContain("no DPS conversion");
    expect(plan.summary.observedDpsAvailable).toBe(false);
    expect(plan.findings.some((finding) =>
      finding.id.startsWith("observed:reconcile"))).toBe(false);
    expect(actionPlanReport(before, after, plan)).toContain(
      "observed damage per hit is available but is not DPS",
    );
  });

  it("turns invalid and reference-only observed pairs into blockers with no delta finding", () => {
    const build = bing();
    const before = build.loadouts[5];
    const after = build.loadouts[6];
    const valid = observed(after, {
      value: "900B",
      source: "before reference log",
    });
    const invalidPlan = buildComparisonActionPlan(before, after, {
      observedMeasurements: {
        before: { ...valid, value: 0 },
        after: valid,
      },
    });

    expect(invalidPlan.findings.some((finding) =>
      finding.proof === "observed-result")).toBe(false);
    expect(invalidPlan.blockers).toContainEqual(expect.objectContaining({
      code: "observed-measurement-invalid",
      side: "before",
    }));
    expect(invalidPlan.summary.observedDpsAvailable).toBe(false);

    const otherTarget = observed(after, {
      value: "850B",
      confidence: "approximate",
      targetLabel: "Map boss",
      source: "after reference log",
    });
    const referencePlan = buildComparisonActionPlan(before, after, {
      observedMeasurements: {
        before: valid,
        after: otherTarget,
      },
    });
    const blocker = referencePlan.blockers.find((candidate) =>
      candidate.code === "observed-measurement-reference-only");
    expect(blocker?.detail).toContain(
      "No observed direction, ratio, or percentage was calculated",
    );
    expect(blocker?.contexts).toContain(
      "the target, conditions, or sample scenario differs",
    );
    expect(referencePlan.findings.some((finding) =>
      finding.proof === "observed-result")).toBe(false);
    const referenceReport = actionPlanReport(before, after, referencePlan);
    expect(referenceReport).toContain(
      "Before observation: value 900000000000 DPS",
    );
    expect(referenceReport).toContain(
      "After observation: value 850000000000 DPS",
    );
    expect(referenceReport).toContain("scope whole-loadout");
    expect(referenceReport).toContain(
      `actor ${after.comparisonContext?.actorId}`,
    );
    expect(referenceReport).toContain(
      `skill ${after.comparisonContext?.archetypeId}`,
    );
    expect(referenceReport).toContain(
      "target Level 90 training dummy",
    );
    expect(referenceReport).toContain("target Map boss");
    expect(referenceReport).toContain("scenario Stationary boss test");
    expect(referenceReport).toContain("10s sample");
    expect(referenceReport).toContain("conditions Full configured uptime");
    expect(referenceReport).toContain("No party buffs");
    expect(referenceReport).toContain("confidence exact");
    expect(referenceReport).toContain("confidence approximate");
    expect(referenceReport).toContain("source before reference log");
    expect(referenceReport).toContain("source after reference log");
  });

  it("reconciles an explicit whole-loadout loss without double-counting the observation", () => {
    const build = bing();
    const before = build.loadouts[5];
    const after = build.loadouts[6];
    const plan = buildComparisonActionPlan(before, after, {
      observedMeasurements: {
        before: observed(before, { value: "1T" }),
        after: observed(after, { value: "800B" }),
      },
    });
    const guardedGain = plan.findings.find((finding) =>
      finding.proof === "guarded-partial"
      && finding.direction === "gain");
    const reconciliation = plan.findings.find((finding) =>
      finding.id === "observed:reconcile:guarded-component-gain");

    expect(guardedGain).toBeDefined();
    expect(reconciliation).toMatchObject({
      proof: "observed-result",
      direction: "tradeoff",
      claims: { isNetDps: true, isEhp: false },
    });
    expect(reconciliation?.title).toBe(
      "Observed whole-loadout DPS fell while a guarded component improved",
    );
    expect(reconciliation?.explanation).toContain(
      "neither identifies the cause",
    );
    expect(reconciliation?.evidence.join(" ")).toContain(
      "no causal attribution",
    );
    expect(plan.summary.observed).toBe(1);
  });

  it("uses actor, skill, and socket identity for player support swaps", () => {
    const build = bing();
    const plan = buildComparisonActionPlan(
      build.loadouts[2],
      build.loadouts[3],
    );
    const swap = plan.findings.find((finding) =>
      finding.title.includes(
        "Slow Projectile → Hammer of Ash: Upheaval (Magnificent)",
      ));

    expect(swap?.title).toContain("Hammer of Ash (Bing: Blast Nova)");
    expect(swap?.evidence).toEqual(expect.arrayContaining([
      expect.stringContaining("Socket 3"),
      expect.stringContaining(
        "Slow Projectile → Hammer of Ash: Upheaval (Magnificent)",
      ),
    ]));
    expect(swap?.nextExperiment).toContain("only the");
    expect(swap?.id).not.toContain("\u0000");
    expect(swap?.id).toContain(
      "56c49853-7d67-5a43-bfe7-0cfe5c7e3d84->4ba9d077-d4f6-5a60-bd8e-423319a27f97",
    );
  });
});
