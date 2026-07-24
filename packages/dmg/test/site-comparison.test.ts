import fs from "node:fs";
import { describe, expect, it } from "vitest";
import demoData from "../../page/src/data/demo-builds.json";
import {
  buildRollbackEvaluations,
  buildWaterfall,
  percentChange,
  signedPercent,
} from "../../page/src/analysis.js";
import {
  actionPlanReport,
  buildComparisonActionPlan,
} from "../../page/src/action-plan.js";
import { summarizeTradeoff } from "../../page/src/diagnosis.js";
import { compareDefense, extractDefenseEvidence } from "../../page/src/defense-analysis.js";
import { importBuild, importBuildCode } from "../../page/src/importer.js";
import { compareStructure } from "../../page/src/structural-analysis.js";
import { compareSupportTerms } from "../../page/src/support-evidence.js";
import { compareSummonTerms } from "../../page/src/summon-evidence.js";
import { guardedEvidenceReadiness } from "../../page/src/evidence-state.js";
import {
  presentedChangeKind,
  skillDisplay,
} from "../../page/src/change-presentation.js";
import type { ImportCatalog } from "../../page/src/analysis-types.js";
import {
  IRIS_VIGILANT_BREEZE_ID,
  SUMMON_EROSION_MAGUS_ID,
  SUMMON_ROCK_MAGUS_ID,
} from "../src/guardedCompiler.js";
import { fromRoot } from "../src/py.js";

const emptyCatalog: ImportCatalog = {
  skillNames: {},
  treeNames: {},
  heroNames: {},
  pactNames: {},
};

describe("comparison website model", () => {
  it("reconciles the fixed-order waterfall to the exact DPS delta", () => {
    const [before, after] = (demoData as any).builds
      .find((build: any) => build.id === "scaling-lesson").loadouts;
    const steps = buildWaterfall(before.snapshot, after.snapshot);
    const replayDelta = steps.reduce((sum, step) => sum + step.delta, 0);

    expect(replayDelta).toBeCloseTo(after.model.dps - before.model.dps, 3);
    expect(steps.find((step) => step.id === "increased")!.delta).toBeGreaterThan(0);
    expect(steps.find((step) => step.id === "additional")!.delta).toBeLessThan(0);
  });

  it("turns formula movement into an exact gains-versus-losses explanation", () => {
    const [before, after] = (demoData as any).builds
      .find((build: any) => build.id === "scaling-lesson").loadouts;
    const summary = summarizeTradeoff(buildWaterfall(before.snapshot, after.snapshot));

    expect(summary.primaryLoss?.id).toBe("additional");
    expect(summary.primaryGain?.id).toBe("increased");
    expect(summary.totalGain - summary.totalLoss).toBeCloseTo(summary.netDelta, 3);
    expect(summary.netDelta).toBeCloseTo(after.model.dps - before.model.dps, 3);
  });

  it("evaluates every modeled rollback from the same after-state", () => {
    const [before, after] = (demoData as any).builds
      .find((build: any) => build.id === "scaling-lesson").loadouts;
    const rollbacks = buildRollbackEvaluations(
      before.snapshot,
      after.snapshot,
    );

    expect(rollbacks.every((rollback) =>
      rollback.afterDps === after.model.dps)).toBe(true);
    expect(rollbacks.find((rollback) => rollback.id === "additional")?.delta)
      .toBeGreaterThan(0);
    expect(rollbacks.find((rollback) => rollback.id === "increased")?.delta)
      .toBeLessThan(0);
  });

  it("prioritizes the real Bing support and tree changes before assigning DPS", () => {
    const build = (demoData as any).builds.find((item: any) => item.id === "bing");
    const comparison = compareStructure(build.loadouts[2], build.loadouts[3]);

    expect(comparison.changedSystems).toContain("skills");
    expect(comparison.changedSystems).toContain("trees");
    expect(comparison.insights[0].id).toBe("main-support-swap");
    expect(comparison.insights[0].evidence.join(" ")).toContain("Slow Projectile");
    expect(comparison.insights.some((insight) => insight.id === "tree-swap")).toBe(true);
    expect(build.loadouts[3].model).toBeNull();
  });

  it("publishes the guarded Bing weapon foundation only as a non-DPS metric", () => {
    const build = (demoData as any).builds.find((item: any) => item.id === "bing");
    const metric = build.loadouts[3].partialMetrics.find(
      (item: any) => item.id === "bing-weapon-hit-foundation",
    );

    expect(metric.isDps).toBe(false);
    expect(metric.value).toBeCloseTo(5657.4342, 6);
    expect(metric.inputs[1].display).toBe("369%");
    expect(metric.excluded.join(" ")).toContain("bomb quantity");
    expect(build.loadouts[3].model).toBeNull();
  });

  it("formats guarded relative movement as percentage points, not a raw ratio", () => {
    const build = (demoData as any).builds.find((item: any) => item.id === "bing");
    const before = build.loadouts[2].partialMetrics.find(
      (item: any) => item.id === "bing-weapon-hit-foundation",
    );
    const after = build.loadouts[3].partialMetrics.find(
      (item: any) => item.id === "bing-weapon-hit-foundation",
    );
    const movement = percentChange(before.value, after.value);

    expect(movement).toBeCloseTo(138.87, 2);
    expect(signedPercent(movement!)).toBe("+138.9%");
  });

  it("does not disguise a newly nonzero metric as a zero-percent change", () => {
    expect(percentChange(0, 25)).toBeNull();
    expect(percentChange(0, 0)).toBe(0);
    expect(percentChange(25, 0)).toBe(-100);
  });

  it("keeps Bing per-hit damage and Blast Nova emissions as separate guarded evidence", () => {
    const build = (demoData as any).builds.find((item: any) => item.id === "bing");
    const evidence = build.loadouts[3].bingIntrinsicEvidence;

    expect(evidence).toMatchObject({
      status: "calculated-partial",
      isDps: false,
      isTotalHit: false,
      normalWeaponSourcedPerHit: {
        total: { average: 5657.4342 },
      },
      demolisherChargedWeaponSourcedPerHit: {
        total: { average: 17820.91773 },
      },
      topology: {
        status: "calculated-partial",
        isDps: false,
        isTargetHits: false,
        projectilesPerBomb: 9,
        expectedEmittedProjectilesPerThrow: 22.5,
      },
      actualDps: { status: "not-calculated", isDps: false },
    });
    expect(evidence.effectiveTargetHits.status).toBe("not-calculated");
  });

  it("attaches and compares the component-scoped Bing factor ledger through the real importer", () => {
    const source = JSON.parse(
      fs.readFileSync(fromRoot("data/builds/bing_china.json"), "utf8"),
    );
    const imported = importBuild(source, emptyCatalog);
    expect(imported.loadouts[5].bingFactorLedger?.status)
      .toBe("calculated-partial");
    const plan = buildComparisonActionPlan(
      imported.loadouts[5],
      imported.loadouts[6],
    );
    const ordinary = plan.findings.find((finding) =>
      finding.id === "bing-factor-ledger:ordinary-hit");
    const explosion = plan.findings.find((finding) =>
      finding.id === "bing-factor-ledger:projectile-explosion-hit");

    expect(plan.summary.comparisonKind).toBe("progression");
    expect(ordinary?.evidence.join(" ")).not.toContain("Upheaval");
    expect(explosion?.evidence.join(" ")).toContain("Upheaval");
    expect(ordinary?.evidence.join(" ")).toContain(
      "emissions remain a separate lane",
    );
    expect(ordinary?.claims).toEqual({ isNetDps: false, isEhp: false });
  });

  it("generates bundled examples through the exact-roll structural importer", () => {
    const build = (demoData as any).builds.find((item: any) => item.id === "bing");
    const allGearLines = build.loadouts.flatMap((loadout: any) =>
      loadout.gear.flatMap((item: any) => item.lines));

    expect(allGearLines.some((line: string) => line.includes("#"))).toBe(false);
    expect(build.loadouts[0].gear
      .find((item: any) => item.slot === "mainHand").lines.join(" ")).toContain("+47%");
    expect(build.loadouts[0].memories[0].lines[0]).toContain("Base Stat");
    expect(build.loadouts[0].slates[0].lines.length).toBeGreaterThan(0);
  });

  it("explains Bing support swaps with source terms but no aggregate DPS", () => {
    const build = (demoData as any).builds.find((item: any) => item.id === "bing");
    const changes = compareSupportTerms(build.loadouts[2], build.loadouts[3]);
    const swap = changes.find((change) => change.socketIndex === 2);

    expect(changes).toHaveLength(4);
    expect(changes.map((change) => change.kind).sort()).toEqual([
      "changed",
      "moved",
      "moved",
      "replaced",
    ]);
    expect(swap?.socketIndex).toBe(2);
    expect(swap?.before?.supportName).toBe("Slow Projectile");
    expect(swap?.before?.effects.map((effect) => effect.display)).toEqual(["−30%", "+29%"]);
    expect(swap?.after?.supportName).toBe(
      "Hammer of Ash: Upheaval (Magnificent)",
    );
    expect(swap?.after?.effects.some((effect) =>
      effect.scope.includes("explosion"))).toBe(true);
    expect(swap?.after?.isDps).toBe(false);
  });

  it("treats an unchanged support reorder as one layout event", () => {
    const build = (demoData as any).builds.find((item: any) =>
      item.id === "bing");
    const plan = buildComparisonActionPlan(
      build.loadouts[2],
      build.loadouts[3],
    );
    const reorder = plan.findings.find((finding) =>
      finding.id.startsWith("support:reordered:"));

    expect(reorder).toMatchObject({
      proof: "source-term",
      direction: "neutral",
      claims: { isNetDps: false, isEhp: false },
    });
    expect(reorder?.evidence).toEqual(expect.arrayContaining([
      "Melee Knockback: socket 1 → socket 5",
      "Elemental Fusion: socket 5 → socket 1",
      "Compiled support terms, type, level, tier, rank, and rolls are unchanged.",
    ]));
    expect(reorder?.nextExperiment).toContain(
      "entire before socket layout",
    );
    expect(plan.findings.some((finding) =>
      finding.title.includes("Melee Knockback → Elemental Fusion")
      || finding.title.includes("Elemental Fusion → Melee Knockback")))
      .toBe(false);
    expect(plan.findings.some((finding) =>
      finding.id === "structural:main-support-swap"
      || finding.id === "structural:main-support-swap:unresolved"))
      .toBe(false);
  });

  it("separates moved support instances from their configuration changes", () => {
    const build = (demoData as any).builds.find((item: any) =>
      item.id === "bing");
    const plan = buildComparisonActionPlan(
      build.loadouts[5],
      build.loadouts[6],
    );

    expect(plan.findings).toContainEqual(expect.objectContaining({
      proof: "source-term",
      direction: "weaker-input",
      title: expect.stringContaining(
        "Slow Projectile moved from socket 5 to socket 1 and lost strength",
      ),
      evidence: expect.arrayContaining([
        "Moved: socket 5 → socket 1",
        expect.stringContaining("After: −30% additional Projectile Speed · +27%"),
      ]),
    }));
    expect(plan.findings).toContainEqual(expect.objectContaining({
      proof: "source-term",
      direction: "neutral",
      title: expect.stringContaining(
        "1 unchanged support moved between sockets",
      ),
      evidence: expect.arrayContaining([
        "Elemental Fusion: socket 1 → socket 5",
      ]),
    }));
    expect(plan.findings.some((finding) =>
      finding.title.includes("Elemental Fusion → Slow Projectile")
      || finding.title.includes("Slow Projectile → Elemental Fusion")))
      .toBe(false);
  });

  it("does not recommend holding a slot-constrained support in an illegal socket", () => {
    const source = JSON.parse(
      fs.readFileSync(fromRoot("data/builds/bing_china.json"), "utf8"),
    );
    const before = structuredClone(source.loadouts.loadouts[3]);
    const after = structuredClone(source.loadouts.loadouts[3]);
    before.id = "legal-upheaval";
    before.name = "Legal Upheaval";
    after.id = "illegal-upheaval";
    after.name = "Illegal Upheaval";
    [
      after.skills.activeSkills[0].supports[0],
      after.skills.activeSkills[0].supports[2],
    ] = [
      after.skills.activeSkills[0].supports[2],
      after.skills.activeSkills[0].supports[0],
    ];
    source.loadouts.loadouts = [before, after];
    source.loadouts.currentLoadoutId = after.id;

    const imported = importBuild(source, emptyCatalog);
    const plan = buildComparisonActionPlan(
      imported.loadouts[0],
      imported.loadouts[1],
    );
    const upheaval = plan.findings.find((finding) =>
      finding.title.includes("Upheaval"));

    expect(upheaval).toMatchObject({
      direction: "risk",
      title: expect.stringContaining(
        "became unavailable to the guarded compiler",
      ),
      nextExperiment: expect.stringContaining("previously compiled socket 3"),
      claims: { isNetDps: false, isEhp: false },
    });
    expect(upheaval?.nextExperiment).not.toContain(
      "keeping it in socket 1",
    );
    expect(upheaval?.evidence.join(" ")).toContain(
      "Compiler coverage: source-terms → unsupported",
    );
    expect(plan.blockers).toContainEqual(expect.objectContaining({
      code: "invalid-bing-support-socket",
      side: "after",
    }));
  });

  it("keeps an unsupported support move distinct from a compiled removal", () => {
    const source = JSON.parse(
      fs.readFileSync(fromRoot("data/builds/bing_china.json"), "utf8"),
    );
    const before = structuredClone(source.loadouts.loadouts[3]);
    const after = structuredClone(source.loadouts.loadouts[3]);
    const unknown = {
      supportGuid: "unsupported-moving-support",
      type: "support",
      level: 20,
    };
    before.id = "unsupported-move-before";
    before.name = "Unsupported move before";
    before.skills.activeSkills[0].supports[0] = structuredClone(unknown);
    after.id = "unsupported-move-after";
    after.name = "Unsupported move after";
    after.skills.activeSkills[0].supports[0] = null;
    after.skills.activeSkills[0].supports[1] = structuredClone(unknown);
    source.loadouts.loadouts = [before, after];
    source.loadouts.currentLoadoutId = after.id;

    const imported = importBuild(source, emptyCatalog);
    const plan = buildComparisonActionPlan(
      imported.loadouts[0],
      imported.loadouts[1],
    );
    const unknownMove = plan.findings.find((finding) =>
      finding.id.startsWith("support:unresolved-move:"));

    expect(unknownMove).toMatchObject({
      proof: "structural",
      direction: "neutral",
      title: expect.stringContaining("moved from socket 1 to socket 2"),
      claims: { isNetDps: false, isEhp: false },
    });
    expect(plan.findings).toContainEqual(expect.objectContaining({
      proof: "source-term",
      title: expect.stringContaining("Passivation was removed"),
    }));
    expect(plan.findings.some((finding) =>
      finding.proof === "structural"
      && finding.evidence.some((line) =>
        line.includes("Removed from socket 1")
        && line.includes("unsupported-moving-support")))).toBe(false);
  });

  it("retains an unsupported occupant removal when a compiled support moves in", () => {
    const source = JSON.parse(
      fs.readFileSync(fromRoot("data/builds/bing_china.json"), "utf8"),
    );
    const before = structuredClone(source.loadouts.loadouts[3]);
    const after = structuredClone(source.loadouts.loadouts[3]);
    const unknown = {
      supportGuid: "unsupported-displaced-support",
      type: "support",
      level: 20,
    };
    before.id = "unsupported-occupant-before";
    before.name = "Unsupported occupant before";
    before.skills.activeSkills[0].supports[1] = structuredClone(unknown);
    after.id = "unsupported-occupant-after";
    after.name = "Unsupported occupant after";
    after.skills.activeSkills[0].supports[0] = null;
    after.skills.activeSkills[0].supports[1] =
      structuredClone(before.skills.activeSkills[0].supports[0]);
    source.loadouts.loadouts = [before, after];
    source.loadouts.currentLoadoutId = after.id;

    const imported = importBuild(source, emptyCatalog);
    const plan = buildComparisonActionPlan(
      imported.loadouts[0],
      imported.loadouts[1],
    );
    const unresolved = plan.findings.find((finding) =>
      finding.id === "structural:main-support-swap:unresolved");

    expect(plan.findings).toContainEqual(expect.objectContaining({
      proof: "source-term",
      direction: "neutral",
      title: expect.stringContaining(
        "1 unchanged support moved between sockets",
      ),
    }));
    expect(unresolved).toMatchObject({
      proof: "structural",
      evidence: expect.arrayContaining([
        expect.stringMatching(
          /Removed from socket 2: Unknown .*unsuppor/,
        ),
      ]),
      claims: { isNetDps: false, isEhp: false },
    });
  });

  it("keeps a changed unsupported support move as one unresolved movement", () => {
    const source = JSON.parse(
      fs.readFileSync(fromRoot("data/builds/bing_china.json"), "utf8"),
    );
    const before = structuredClone(source.loadouts.loadouts[3]);
    const after = structuredClone(source.loadouts.loadouts[3]);
    const upheaval =
      structuredClone(before.skills.activeSkills[0].supports[2]);
    before.id = "invalid-upheaval-before";
    before.name = "Invalid Upheaval before";
    before.skills.activeSkills[0].supports[0] = structuredClone(upheaval);
    before.skills.activeSkills[0].supports[1] = null;
    before.skills.activeSkills[0].supports[2] = null;
    after.id = "invalid-upheaval-after";
    after.name = "Invalid Upheaval after";
    after.skills.activeSkills[0].supports[0] = null;
    after.skills.activeSkills[0].supports[1] = structuredClone(upheaval);
    after.skills.activeSkills[0].supports[2] = null;
    source.loadouts.loadouts = [before, after];
    source.loadouts.currentLoadoutId = after.id;

    const imported = importBuild(source, emptyCatalog);
    const plan = buildComparisonActionPlan(
      imported.loadouts[0],
      imported.loadouts[1],
    );
    const move = plan.findings.find((finding) =>
      finding.id.startsWith("support:unresolved-move:"));

    expect(move).toMatchObject({
      proof: "structural",
      title: expect.stringContaining("moved from socket 1 to socket 2"),
      evidence: expect.arrayContaining([
        "Compiler coverage: unsupported → unsupported",
      ]),
      claims: { isNetDps: false, isEhp: false },
    });
    expect(move?.nextExperiment).toContain(
      "socket accepted by the guarded compiler",
    );
    expect(move?.nextExperiment).not.toContain("A/B test the full move");
    expect(plan.findings.some((finding) =>
      finding.id.startsWith("structural:main-support-swap"))).toBe(false);
  });

  it("preserves raw configuration changes on an unsupported support move", () => {
    const source = JSON.parse(
      fs.readFileSync(fromRoot("data/builds/bing_china.json"), "utf8"),
    );
    const before = structuredClone(source.loadouts.loadouts[3]);
    const after = structuredClone(source.loadouts.loadouts[3]);
    const beforeUnknown = {
      supportGuid: "unsupported-configured-mover",
      type: "support",
      level: 20,
    };
    const afterUnknown = {
      ...beforeUnknown,
      type: "noble_support",
    };
    before.id = "unsupported-config-before";
    before.name = "Unsupported config before";
    before.skills.activeSkills[0].supports[0] = beforeUnknown;
    before.skills.activeSkills[0].supports[1] = null;
    after.id = "unsupported-config-after";
    after.name = "Unsupported config after";
    after.skills.activeSkills[0].supports[0] = null;
    after.skills.activeSkills[0].supports[1] = afterUnknown;
    source.loadouts.loadouts = [before, after];
    source.loadouts.currentLoadoutId = after.id;

    const imported = importBuild(source, emptyCatalog);
    const plan = buildComparisonActionPlan(
      imported.loadouts[0],
      imported.loadouts[1],
    );
    const termChange = compareSupportTerms(
      imported.loadouts[0],
      imported.loadouts[1],
    ).find((change) =>
      change.supportId === "unsupported-configured-mover");
    const move = plan.findings.find((finding) =>
      finding.id.startsWith("support:unresolved-move:"));

    expect(termChange).toMatchObject({
      kind: "moved-and-changed",
      before: { level: 20, supportType: "support" },
      after: { level: 20, supportType: "noble_support" },
    });
    expect(move).toMatchObject({
      title: expect.stringContaining(
        "moved from socket 1 to socket 2 and changed unresolved configuration",
      ),
      evidence: expect.arrayContaining([
        expect.stringContaining("Before configuration: L20 · type support"),
        expect.stringContaining(
          "After configuration: L20 · type noble_support",
        ),
      ]),
      nextExperiment: expect.stringContaining("separate duplicate loadouts"),
    });
    expect(move?.nextExperiment).not.toContain("full move");
  });

  it("narrates supported and unsupported same-socket replacements as swaps", () => {
    const source = JSON.parse(
      fs.readFileSync(fromRoot("data/builds/bing_china.json"), "utf8"),
    );
    const original = source.loadouts.loadouts[3];
    const unknown = {
      supportGuid: "unsupported-replacement",
      type: "support",
      level: 20,
    };
    const buildPlan = (reverse: boolean) => {
      const before = structuredClone(original);
      const after = structuredClone(original);
      before.id = reverse ? "compiled-before" : "unsupported-before";
      after.id = reverse ? "unsupported-after" : "compiled-after";
      if (reverse) {
        after.skills.activeSkills[0].supports[0] = structuredClone(unknown);
      } else {
        before.skills.activeSkills[0].supports[0] =
          structuredClone(unknown);
      }
      const fixture = structuredClone(source);
      fixture.loadouts.loadouts = [before, after];
      fixture.loadouts.currentLoadoutId = after.id;
      const imported = importBuild(fixture, emptyCatalog);
      return buildComparisonActionPlan(
        imported.loadouts[0],
        imported.loadouts[1],
      );
    };

    for (const plan of [buildPlan(false), buildPlan(true)]) {
      const swap = plan.findings.find((finding) =>
        finding.evidence.some((line) => line.startsWith("Support swap:")));
      expect(swap?.title).toContain("→");
      expect(swap?.title).not.toContain("entered guarded coverage");
      expect(swap?.title).not.toContain("became unavailable");
      expect(swap?.nextExperiment).toContain("swap in socket 1");
      expect(swap?.nextExperiment).not.toContain("source-record correction");
    }
  });

  it("keeps duplicate support IDs distinct in structural socket evidence", () => {
    const fixture = (demoData as any).builds.find((item: any) =>
      item.id === "bing").loadouts[3];
    const before = structuredClone(fixture);
    const after = structuredClone(fixture);
    const duplicateSupports = () => [
      {
        slot: "0",
        guid: "duplicate-support",
        name: "Duplicate support",
        type: "support",
        level: 20,
      },
      {
        slot: "1",
        guid: "duplicate-support",
        name: "Duplicate support",
        type: "support",
        level: 20,
      },
    ];
    before.skills.find((skill: any) =>
      skill.name === "Hammer of Ash").supports = duplicateSupports();
    after.skills.find((skill: any) =>
      skill.name === "Hammer of Ash").supports = duplicateSupports();
    after.skills.find((skill: any) =>
      skill.name === "Hammer of Ash").supports[1].level = 21;

    const insight = compareStructure(before, after).insights.find(
      (candidate) => candidate.id === "main-support-swap",
    );

    expect(insight?.evidence).toEqual([
      "socket 2 · Duplicate support: level 20 → 21",
    ]);
    expect(insight?.changeRefs).toEqual([expect.objectContaining({
      key: expect.stringContaining("\u0000support:1"),
      evidence: "socket 2 · Duplicate support: level 20 → 21",
    })]);
  });

  it("keeps Wuxia insight evidence actor-scoped while minion DPS is unavailable", () => {
    const build = (demoData as any).builds.find((item: any) => item.id === "wuxia");
    const comparison = compareStructure(build.loadouts[5], build.loadouts[8]);
    const support = comparison.insights.find((insight) =>
      insight.id.startsWith("minion-support-swap:")
      && insight.title.includes("Summon Rock Magus"));

    expect(support?.explanation).toContain("summoned actor");
    expect(support?.evidence.join(" ")).toContain("Friend of Spirit Magi");
    expect(build.loadouts[8].model).toBeNull();
  });

  it("tracks every enabled Wuxia summon actor without treating the player weapon as its base", () => {
    const build = (demoData as any).builds.find((item: any) => item.id === "wuxia");
    const comparison = compareStructure(build.loadouts[5], build.loadouts[8]);

    expect(comparison.insights.some((insight) =>
      insight.id === "minion-skill-roster")).toBe(false);
    expect(comparison.insights.some((insight) =>
      insight.id.startsWith("minion-support-swap:")
      && insight.title.includes("Summon Erosion Magus"))).toBe(true);
    expect(comparison.insights.find((insight) =>
      insight.id === "player-weapon-change")).toMatchObject({
      tone: "neutral",
      section: "gear",
    });
    expect(comparison.insights.find((insight) =>
      insight.id === "player-weapon-change")?.explanation).toContain(
      "player's weapon base does not automatically feed",
    );
    expect(comparison.insights.some((insight) =>
      insight.id.startsWith("player-main-"))).toBe(false);
    const moduleChange = comparison.insights.find((insight) =>
      insight.id === "actor-module-change");
    const otherSkills = comparison.insights.find((insight) =>
      insight.id === "other-skill-change");
    expect(moduleChange?.evidence.join(" ")).toContain("Module: Trog Mage");
    expect(moduleChange?.evidence.join(" ")).not.toContain("Dazzling Bloom");
    expect(otherSkills?.evidence.join(" ")).toContain("Dazzling Bloom");
    expect(otherSkills?.evidence.join(" ")).not.toContain("Module: Trog Mage");
  });

  it("builds a proof-ranked action plan without relabeling partial evidence as DPS", () => {
    const build = (demoData as any).builds.find((item: any) => item.id === "bing");
    const plan = buildComparisonActionPlan(build.loadouts[3], build.loadouts[4]);
    const hit = plan.findings.find((finding) =>
      finding.id === "bing:weapon-sourced-hit");
    const emissions = plan.findings.find((finding) =>
      finding.id === "bing:emitted-projectiles");

    expect(plan.summary).toMatchObject({
      guardedPartial: 4,
      netDpsAvailable: false,
      ehpAvailable: false,
    });
    expect(hit).toMatchObject({
      proof: "guarded-partial",
      direction: "loss",
      claims: { isNetDps: false, isEhp: false },
    });
    expect(hit?.metric?.relativeDelta).toBeCloseTo(-0.14581458, 7);
    expect(emissions?.metric?.relativeDelta).toBeCloseTo(-0.22222222, 7);
    expect(plan.findings.every((finding) =>
      finding.claims.isNetDps === false && finding.claims.isEhp === false)).toBe(true);
  });

  it("withholds stronger-support claims when compiled effect sets are not comparable", () => {
    const fixture = (demoData as any).builds.find(
      (item: any) => item.id === "bing",
    ).loadouts[3];
    const before = structuredClone(fixture);
    const after = structuredClone(fixture);
    const effect = (
      id: string,
      value: number,
    ) => ({
      id,
      label: `${id} additional damage`,
      value,
      display: `${value}%`,
      application: "additional-damage-input",
      scope: "supported player skill",
      condition: null,
      isNetDps: false,
    });
    const socket = (effects: any[]) => ({
      status: "source-terms",
      supportId: "synthetic-support",
      supportName: "Synthetic support",
      level: 20,
      tier: 1,
      rank: 1,
      effects,
      blockers: [],
      isDps: false,
      provenance: [],
    });
    before.supportEvidenceStatus = "source-terms";
    after.supportEvidenceStatus = "source-terms";
    before.supportEvidence = [socket([effect("A", 10), effect("B", 50)])];
    after.supportEvidence = [socket([effect("A", 11)])];
    const changed = buildComparisonActionPlan(before, after).findings.find(
      (finding) => finding.id.includes("synthetic-support"),
    );

    expect(changed?.direction).toBe("risk");

    after.supportEvidenceStatus = "not-calculated";
    after.supportEvidence = [];
    expect(buildComparisonActionPlan(before, after).findings.some(
      (finding) => finding.id.includes("synthetic-support"),
    )).toBe(false);
  });

  it("turns Wuxia support and defense changes into scoped experiments, not optimizer claims", () => {
    const build = (demoData as any).builds.find((item: any) => item.id === "wuxia");
    const plan = buildComparisonActionPlan(build.loadouts[5], build.loadouts[8]);

    expect(plan.findings).toContainEqual(expect.objectContaining({
      proof: "source-term",
      direction: "risk",
      title: expect.stringContaining(
        "Quick Decision was removed from Summon Rock Magus",
      ),
      claims: { isNetDps: false, isEhp: false },
    }));
    expect(plan.findings).toContainEqual(expect.objectContaining({
      proof: "source-term",
      direction: "neutral",
      title: expect.stringContaining(
        "1 unchanged support moved between sockets on Summon Rock Magus",
      ),
      evidence: expect.arrayContaining([
        "Precise: Superpower: socket 4 → socket 1",
      ]),
    }));
    expect(plan.findings.some((finding) =>
      finding.title.includes(
        "Precise: Superpower was removed from Summon Rock Magus",
      ))).toBe(false);
    expect(plan.findings).toContainEqual(expect.objectContaining({
      proof: "source-term",
      domain: "survival",
      title: expect.stringContaining(
        "Friend of Spirit Magi → Precise: Protection Field on Summon Rock Magus",
      ),
      evidence: expect.arrayContaining([
        expect.stringContaining("required simultaneous Spirit Magus types"),
      ]),
    }));
    expect(plan.findings).toContainEqual(expect.objectContaining({
      proof: "source-term",
      direction: "stronger-input",
      title: expect.stringContaining("Malady"),
    }));
    expect(plan.findings).toContainEqual(expect.objectContaining({
      domain: "survival",
      direction: "weaker-input",
      title: "Additive percentage points Fire Resistance source input fell",
      claims: { isNetDps: false, isEhp: false },
    }));
    expect(plan.summary.netDpsAvailable).toBe(false);
    expect(plan.summary.ehpAvailable).toBe(false);
  });

  it("surfaces duplicate minion factor blockers without publishing a numeric action change", () => {
    const source = JSON.parse(
      fs.readFileSync(fromRoot("data/builds/WuxiaSS13.json"), "utf8"),
    );
    const before = structuredClone(source.loadouts.loadouts[8]);
    const after = structuredClone(source.loadouts.loadouts[8]);
    before.id = "duplicate-factor-before";
    before.name = "Before duplicate factor";
    after.id = "duplicate-factor-after";
    after.name = "After duplicate factor";
    const erosion = after.skills.activeSkills.find((skill: any) =>
      skill?.skillGuid === SUMMON_EROSION_MAGUS_ID);
    expect(erosion).toBeTruthy();
    erosion.supports[1] = structuredClone(erosion.supports[0]);
    source.loadouts.loadouts = [before, after];
    source.loadouts.currentLoadoutId = after.id;

    const imported = importBuild(source, emptyCatalog);
    const plan = buildComparisonActionPlan(
      imported.loadouts[0],
      imported.loadouts[1],
    );
    const blocker = plan.blockers.find((candidate) =>
      candidate.code === "duplicate-minion-damage-factor-support");

    expect(plan.findings.some((finding) =>
      finding.id === `minion-foundation:${SUMMON_EROSION_MAGUS_ID}`))
      .toBe(false);
    expect(blocker).toMatchObject({
      side: "after",
      domain: "damage",
    });
    expect(blocker?.contexts?.join(" ")).toContain("Summon Erosion Magus");
    expect(blocker?.contexts?.join(" ")).toContain("socket 1");
    expect(blocker?.contexts?.join(" ")).toContain("socket 2");
  });

  it("preserves raw configuration on an unsupported minion support move", () => {
    const source = JSON.parse(
      fs.readFileSync(fromRoot("data/builds/WuxiaSS13.json"), "utf8"),
    );
    const before = structuredClone(source.loadouts.loadouts[8]);
    const after = structuredClone(source.loadouts.loadouts[8]);
    const beforeUnknown = {
      supportGuid: "unsupported-minion-mover",
      type: "support",
      level: 20,
    };
    const afterUnknown = {
      ...beforeUnknown,
      level: 21,
    };
    before.id = "unsupported-minion-before";
    before.name = "Unsupported minion before";
    before.skills.activeSkills[0].supports[0] = beforeUnknown;
    before.skills.activeSkills[0].supports[1] = null;
    after.id = "unsupported-minion-after";
    after.name = "Unsupported minion after";
    after.skills.activeSkills[0].supports[0] = null;
    after.skills.activeSkills[0].supports[1] = afterUnknown;
    source.loadouts.loadouts = [before, after];
    source.loadouts.currentLoadoutId = after.id;

    const imported = importBuild(source, emptyCatalog);
    const plan = buildComparisonActionPlan(
      imported.loadouts[0],
      imported.loadouts[1],
    );
    const move = plan.findings.find((finding) =>
      finding.id.startsWith("support:unresolved-move:"));

    expect(move).toMatchObject({
      title: expect.stringContaining(
        "moved from socket 1 to socket 2 and changed unresolved configuration",
      ),
      evidence: expect.arrayContaining([
        expect.stringContaining("Before configuration: L20"),
        expect.stringContaining("After configuration: L21"),
      ]),
      claims: { isNetDps: false, isEhp: false },
    });
    expect(plan.findings.some((finding) =>
      finding.id.startsWith("structural:minion-support-swap"))).toBe(false);
  });

  it("produces a shareable action report with honest metric boundaries", () => {
    const lesson = (demoData as any).builds.find(
      (item: any) => item.id === "scaling-lesson",
    );
    const lessonPlan = buildComparisonActionPlan(
      lesson.loadouts[0],
      lesson.loadouts[1],
    );
    expect(lessonPlan.findings[0]).toMatchObject({
      id: "modeled:additional",
      direction: "loss",
      claims: { isNetDps: false, isEhp: false },
    });
    expect(lessonPlan.summary.netDpsAvailable).toBe(true);
    expect(lessonPlan.findings[0].nextExperiment).toContain(
      "Teaching exercise",
    );
    expect(lessonPlan.findings[0].explanation).toContain(
      "Starting from the after-state",
    );
    expect(lessonPlan.findings[0].evidence.join(" ")).toContain(
      "complete layer alone is rolled back",
    );

    const mismatchedScenario = structuredClone(lesson.loadouts[1]);
    mismatchedScenario.model.scenarioFingerprint = "different-target";
    const mismatchedPlan = buildComparisonActionPlan(
      lesson.loadouts[0],
      mismatchedScenario,
    );
    expect(mismatchedPlan.findings.some((finding) =>
      finding.proof === "modeled-scenario")).toBe(false);
    expect(mismatchedPlan.summary.netDpsAvailable).toBe(false);

    const bing = (demoData as any).builds.find((item: any) => item.id === "bing");
    const report = actionPlanReport(
      bing.loadouts[2],
      bing.loadouts[3],
    );
    expect(report).toContain("DPS status: not calculated");
    expect(report).toContain("+138.9%");
    expect(report).toContain("not total hit or DPS");
  });

  it("keeps every bundled action-plan pair finite, uniquely identified, and context-gated", () => {
    for (const build of (demoData as any).builds) {
      for (const before of build.loadouts) {
        for (const after of build.loadouts) {
          const plan = buildComparisonActionPlan(before, after);
          expect(new Set(plan.findings.map((finding) => finding.id)).size)
            .toBe(plan.findings.length);
          expect(new Set(plan.blockers.map((blocker) => blocker.id)).size)
            .toBe(plan.blockers.length);
          for (const metric of plan.findings.flatMap((finding) =>
            finding.metric ? [finding.metric] : [])) {
            expect([
              metric.before,
              metric.after,
              metric.delta,
            ].every(Number.isFinite)).toBe(true);
          }
        }
      }
    }
    const bing = (demoData as any).builds.find((build: any) =>
      build.id === "bing");
    const wuxia = (demoData as any).builds.find((build: any) =>
      build.id === "wuxia");
    const crossActor = buildComparisonActionPlan(
      bing.loadouts[0],
      wuxia.loadouts[0],
    );
    expect(crossActor.summary.comparisonKind).toBe("incompatible");
    expect(crossActor.findings).toHaveLength(0);
  });

  it("publishes Wuxia summon and Origin terms without labeling them DPS or EHP", () => {
    const build = (demoData as any).builds.find((item: any) => item.id === "wuxia");
    expect(build.loadouts.every((loadout: any) =>
      Array.isArray(loadout.summonEvidenceBlockers)
      && Array.isArray(loadout.bingIntrinsicBlockers))).toBe(true);
    expect(build.loadouts.every((loadout: any) =>
      loadout.summonEvidence.length === 2)).toBe(true);
    const evidence = build.loadouts[8].summonEvidence;
    expect(evidence.map((summon: any) => summon.skillName)).toEqual([
      "Summon Rock Magus",
      "Summon Erosion Magus",
    ]);
    const erosion = evidence.find((summon: any) => summon.skillName === "Summon Erosion Magus");
    const rock = evidence.find((summon: any) => summon.skillName === "Summon Rock Magus");

    expect(erosion.level).toBe(21);
    expect(erosion.isDps).toBe(false);
    expect(erosion.isTotalEhp).toBe(false);
    expect(erosion.minionDps.status).toBe("not-calculated");
    expect(erosion.playerEhp.status).toBe("not-calculated");
    expect(erosion.terms).toContainEqual(expect.objectContaining({
      id: "physical-to-erosion-conversion",
      display: "100%",
      scope: "summoned-actor",
      isDps: false,
    }));
    expect(erosion.terms).toContainEqual(expect.objectContaining({
      id: "origin-additional-dot-damage-taken",
      display: "−9.3%",
      scope: "player",
      isTotalEhp: false,
    }));
    expect(erosion.baseline).toMatchObject({
      baseDamage: 300,
      baseLife: 4500,
      isTotalMinionEhp: false,
    });
    expect(erosion.actions).toHaveLength(4);
    expect(erosion.actions).toContainEqual(expect.objectContaining({
      actionName: "World of Thorns",
      foundation: expect.objectContaining({
        rawDamagePerContact: 6894,
        rawDamageAtDeterministicFullContact: null,
        isDps: false,
        isTotalDamage: false,
      }),
    }));
    expect(rock.actions).toContainEqual(expect.objectContaining({
      actionName: "Rock Blast",
      foundation: expect.objectContaining({
        deterministicContacts: null,
        rawDamageAtDeterministicFullContact: null,
        isDps: false,
        isTotalDamage: false,
      }),
    }));
    expect(erosion.supports.every((support: any) => support.isDps === false)).toBe(true);
    expect(erosion.heroTraits).toHaveLength(4);
    expect(build.loadouts[8].sourceNote).toContain("total player EHP");
  });

  it("compares Wuxia source terms without manufacturing a minion total", () => {
    const build = (demoData as any).builds.find((item: any) => item.id === "wuxia");
    const levelChange = compareSummonTerms(build.loadouts[0], build.loadouts[1]);
    const rock = levelChange.find((change) => change.skillName === "Summon Rock Magus");

    expect(rock?.kind).toBe("changed");
    expect(rock?.before?.level).toBe(1);
    expect(rock?.after?.level).toBe(20);
    expect(rock?.before?.terms.find((term) =>
      term.id === "origin-additional-hit-damage-taken")?.display).toBe("−5.2%");
    expect(rock?.after?.terms.find((term) =>
      term.id === "origin-additional-hit-damage-taken")?.display).toBe("−8.05%");
    expect(rock?.after?.minionDps.status).toBe("not-calculated");
    expect(rock?.after?.playerEhp.status).toBe("not-calculated");
  });

  it("shows defensive lines as evidence without collapsing them into fake EHP", () => {
    const build = (demoData as any).builds.find((item: any) => item.id === "wuxia");
    const comparison = compareDefense(build.loadouts[5], build.loadouts[8]);

    expect(comparison.removed).toBeGreaterThan(0);
    expect(comparison.added).toBeGreaterThan(0);
    expect(comparison.categories.some((row) => row.category === "resistance")).toBe(true);
    expect(build.loadouts[8].model).toBeNull();
  });

  it("publishes typed player-defense inputs and source sums without calling them EHP", () => {
    const build = (demoData as any).builds.find((item: any) => item.id === "wuxia");
    const evidence = build.loadouts[8].playerDefenseEvidence;

    expect(evidence).toMatchObject({
      status: "source-terms",
      actor: "player",
      isTotalEhp: false,
      guards: {
        isTotalEhp: false,
        sourceSumsAreCharacterTotals: false,
        comparisonValuesAreEhpDeltas: false,
        recommendationReady: false,
      },
      coverage: {
        playerScopedTerms: 45,
        unparsedDefensiveLines: 0,
        catalog: {
          status: "matched-ss13",
          requiredReferences: 32,
          resolvedReferences: 32,
        },
      },
      playerEhp: { status: "not-calculated" },
    });
    expect(evidence.sourceSums.every((sum: any) =>
      sum.isCharacterTotal === false && sum.isEhp === false)).toBe(true);
    expect(evidence.terms).toContainEqual(expect.objectContaining({
      stat: "additional-damage-taken",
      candidateValues: [-20, -24, -28, -32, -36],
      isTotalEhp: false,
    }));
  });

  it("does not mislabel minion defenses as player survival evidence", () => {
    const evidence = extractDefenseEvidence({
      gear: [{
        slot: "helmet",
        name: "Test",
        rarity: null,
        category: null,
        lines: [
          "+20% Minion Elemental Resistance",
          "+100 Max Life\n+15% Minion Max Life",
          "+40% Spirit Magus Armor",
          "Nearby Enemies have −12% Elemental Resistance",
        ],
      }],
    } as any);

    expect(evidence.map((row) => row.text)).toEqual(["+100 Max Life"]);
  });

  it("keeps recovery and mitigation separate from generic Life or Energy pools", () => {
    const evidence = extractDefenseEvidence({
      gear: [{
        slot: "chest",
        name: "Test",
        rarity: null,
        category: null,
        lines: [
          "Regain 4% Life per second",
          "−12% additional Hit Damage taken while Energy Shield is active",
          "+100 Max Life",
        ],
      }],
    } as any);

    expect(evidence.map((row) => row.category)).toEqual([
      "recovery",
      "mitigation",
      "life",
    ]);
  });

  it("imports Compendium structure without inventing DPS", () => {
    const build = importBuild({
      name: "Player build",
      patch: "SS13",
      loadouts: {
        currentLoadoutId: "one",
        loadouts: [{
          id: "one",
          name: "Current",
          hero: { heroId: "Example hero" },
          gear: { inventory: [], equipped: { helmet: null } },
          vorax: { inventory: [] },
          skills: { activeSkills: [], passiveSkills: [] },
          skillTree: { slots: [] },
          heroMemories: { inventory: [], equipped: {} },
          divinity: { inventory: [], placements: [] },
          pactspirits: [],
          kismets: [],
        }],
      },
    }, emptyCatalog, []);

    expect(build.loadouts).toHaveLength(1);
    expect(build.loadouts[0].model).toBeNull();
    expect(build.loadouts[0].gear[0].name).toBe("Empty");
  });

  it("keeps guarded source evidence distinct from blocker-only checks", () => {
    expect(guardedEvidenceReadiness({
      playerDefenseEvidence: {
        status: "not-calculated",
        blockers: [{ code: "unsupported-patch", message: "Wrong patch." }],
      } as any,
    })).toBe("blocked");
    expect(guardedEvidenceReadiness({
      partialMetrics: [{ id: "one" }] as any,
      bingIntrinsicBlockers: [{
        code: "missing-source",
        message: "A guarded input is missing.",
      }],
    })).toBe("partial");
    expect(guardedEvidenceReadiness({
      supportEvidence: [{
        status: "source-terms",
      }] as any,
    })).toBe("ready");
  });

  it("labels detail-only changes and skill enablement truthfully", () => {
    expect(presentedChangeKind("Same item", "Same item", true)).toBe("changed");
    expect(presentedChangeKind("Same item", "Same item", false)).toBe("same");
    expect(skillDisplay({
      slot: "active:0",
      kind: "active",
      name: "Summon Rock Magus",
      level: 20,
      enabled: false,
      supports: [],
    })).toBe("Summon Rock Magus · L20 · disabled");
  });

  it("attaches guarded summon evidence during a Compendium import", () => {
    const build = importBuild({
      name: "Iris import",
      patch: "SS13",
      loadouts: {
        currentLoadoutId: "iris-one",
        loadouts: [{
          id: "iris-one",
          name: "Current",
          hero: { heroId: IRIS_VIGILANT_BREEZE_ID },
          gear: { inventory: [], equipped: {} },
          vorax: { inventory: [] },
          skills: {
            activeSkills: [{
              skillGuid: SUMMON_ROCK_MAGUS_ID,
              level: 20,
              enabled: true,
              supports: [null, null, null, null, null],
            }, null, null, null, null],
            passiveSkills: [null, null, null, null],
          },
          skillTree: { slots: [] },
          heroMemories: { inventory: [], equipped: {} },
          divinity: { inventory: [], placements: [] },
          pactspirits: [],
          kismets: [],
        }],
      },
    }, emptyCatalog, []);

    expect(build.loadouts[0].model).toBeNull();
    expect(build.loadouts[0].summonEvidence).toHaveLength(1);
    expect(build.loadouts[0].summonEvidence?.[0]).toMatchObject({
      skillName: "Summon Rock Magus",
      level: 20,
      isDps: false,
      isTotalEhp: false,
      minionDps: { status: "not-calculated" },
      playerEhp: { status: "not-calculated" },
    });
    expect(build.loadouts[0].sourceNote).toContain("guarded source terms");
    expect(build.loadouts[0].sourceNote).not.toContain(
      "until an actor/skill compiler supports",
    );
  });

  it("does not surface irrelevant Bing or Iris season blockers for another actor", () => {
    const build = importBuild({
      name: "Future unrelated import",
      patch: "SS14",
      loadouts: {
        currentLoadoutId: "other",
        loadouts: [{
          id: "other",
          name: "Current",
          hero: { heroId: "unrelated-hero" },
          gear: { inventory: [], equipped: {} },
          vorax: { inventory: [] },
          skills: {
            activeSkills: [null, null, null, null, null],
            passiveSkills: [null, null, null, null],
          },
          skillTree: { slots: [] },
          heroMemories: { inventory: [], equipped: {} },
          divinity: { inventory: [], placements: [] },
          pactspirits: [],
          kismets: [],
        }],
      },
    }, emptyCatalog, []);

    expect(build.loadouts[0].bingIntrinsicBlockers).toEqual([]);
    expect(build.loadouts[0].summonEvidenceBlockers).toEqual([]);
    expect(build.loadouts[0].playerDefenseEvidence).toMatchObject({
      status: "not-calculated",
      blockers: [{ code: "unsupported-patch" }],
    });
    expect(build.loadouts[0].sourceNote).toContain("checks ran but are blocked");
    expect(build.loadouts[0].sourceNote).not.toContain(
      "Supported guarded source terms are shown",
    );
  });

  it("treats an in-game build code as an unresolved identifier", () => {
    const build = importBuildCode("2L8xV4YBEfGpdQAAAAAACw==");
    expect(build.needsResolution).toBe(true);
    expect(build.loadouts[0].model).toBeNull();
    expect(build.loadouts[0].sourceNote).toContain("opaque reference");
    expect(build.loadouts[0].sourceNote).toContain("tli_dump capture");
  });
});
