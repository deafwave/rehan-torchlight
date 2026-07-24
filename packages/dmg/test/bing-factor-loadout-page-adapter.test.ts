import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compareBingFactorLedgerResults,
  compareBingFactorLedgers,
  compileBingFactorLedger,
} from "../src/bingFactorLedger.js";
import { fromRoot } from "../src/py.js";
import {
  bingFactorLedgerDisplayResultForCompendium,
  bingFactorLedgerLoadoutDisplayForCompendium,
  bingFactorLedgerLoadoutDisplayResultForCompendium,
  compareBingFactorLedgerLoadoutDisplays,
} from "../../page/src/bing-factor-evidence.js";

const readJson = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"));
const bing = () => readJson(fromRoot("../bing_china.json"));
const wuxia = () => readJson(fromRoot("../WuxiaSS13.json"));

function expectGuardFlags(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach(expectGuardFlags);
    return;
  }
  for (const [key, child] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (key === "isDps"
        || key === "isTotalHit"
        || key === "isTargetHits") {
      expect(child).toBe(false);
    }
    expectGuardFlags(child);
  }
}

describe("per-loadout Bing factor display seam", () => {
  it("compiles one guarded loadout into ordered, source-preserving display rows", () => {
    const build = bing();
    const evidence = compileBingFactorLedger(build, 5);
    const display = bingFactorLedgerLoadoutDisplayForCompendium(build, 5);
    expect(evidence.status).toBe("calculated-partial");
    expect(display).not.toBeNull();
    if (!display) throw new Error("expected per-loadout factor display");

    expect(display).toMatchObject({
      status: "calculated-partial",
      kind: "bing-factor-ledger-loadout-display",
      loadoutIndex: 5,
      emissionsAreSeparate: true,
      isDps: false,
      isTotalHit: false,
      isTargetHits: false,
    });
    expect(display.evidence).toEqual(evidence);
    expect(display.provenance).toEqual(
      evidence.status === "calculated-partial" ? evidence.provenance : [],
    );
    expect(display.factorRows.map((row) => row.factorId)).toEqual([
      "weapon-foundation",
      "stationary-attack-damage",
      "slow-projectile-additional-damage",
      "upheaval-explosion-hit-damage",
      "source-visible-emissions",
    ]);
    expect(display.factorRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: "calculated-partial",
        factorId: "weapon-foundation",
        value: {
          raw: 4832.4978,
          kind: "average-weapon-sourced-hit",
          formatted: "4,832.4978",
        },
      }),
      expect.objectContaining({
        status: "calculated-partial",
        factorId: "stationary-attack-damage",
        value: {
          raw: 1.96,
          kind: "multiplier",
          formatted: "×1.96",
        },
        rawPercent: 96,
        sourcePaths: [
          "loadouts.loadouts[5].gear.inventory[1].suffixes[0]",
        ],
        nonComposedEffects: [
          expect.objectContaining({
            id: "stationary-additional-attack-speed",
            value: -20,
          }),
        ],
        provenance: expect.arrayContaining([
          expect.objectContaining({
            source:
              "https://tlicompendium.com/data-bundles/SS13-gear-en.json",
          }),
        ]),
      }),
      expect.objectContaining({
        status: "calculated-partial",
        factorId: "source-visible-emissions",
        value: {
          raw: 18.9,
          kind: "emitted-projectiles-per-throw",
          formatted: "18.9 emitted / throw",
        },
      }),
    ]));
    expect("beforeIndex" in display).toBe(false);
    expect("afterIndex" in display).toBe(false);
    expectGuardFlags(display);
  });

  it("retains a factor-local topology blocker without refusing other loadout terms", () => {
    const display =
      bingFactorLedgerLoadoutDisplayResultForCompendium(bing(), 0);
    expect(display.status).toBe("calculated-partial");
    if (display.status !== "calculated-partial") {
      throw new Error("expected partial per-loadout display");
    }
    expect(display.factorRows.find(
      (row) => row.factorId === "source-visible-emissions",
    )).toMatchObject({
      status: "not-calculated",
      blockers: [
        expect.objectContaining({
          code: "missing-recorded-blast-nova-trait",
        }),
      ],
      isDps: false,
      isTotalHit: false,
      isTargetHits: false,
    });
    expect(display.factorRows.filter(
      (row) => row.factorId !== "source-visible-emissions",
    ).every((row) => row.status === "calculated-partial")).toBe(true);
  });

  it("preserves a top-level refusal as a per-loadout result", () => {
    const display =
      bingFactorLedgerLoadoutDisplayResultForCompendium(wuxia(), 0);
    expect(display).toMatchObject({
      status: "not-calculated",
      kind: "bing-factor-ledger-loadout-display",
      loadoutIndex: 0,
      loadoutName: null,
      emissionsAreSeparate: true,
      blockers: [
        expect.objectContaining({
          code: "unsupported-actor",
        }),
      ],
      evidence: {
        status: "not-calculated",
        kind: "bing-factor-ledger",
      },
      isDps: false,
      isTotalHit: false,
      isTargetHits: false,
    });
    expect(bingFactorLedgerLoadoutDisplayForCompendium(wuxia(), 0))
      .toBeNull();
  });

  it("compares two independently stored display values without the raw build", () => {
    const before =
      bingFactorLedgerLoadoutDisplayResultForCompendium(bing(), 5);
    const after =
      bingFactorLedgerLoadoutDisplayResultForCompendium(bing(), 6);
    const storedBefore = JSON.parse(JSON.stringify(before)) as typeof before;
    const storedAfter = JSON.parse(JSON.stringify(after)) as typeof after;
    const comparison = compareBingFactorLedgerLoadoutDisplays(
      storedBefore,
      storedAfter,
    );
    expect(comparison.status).toBe("calculated-partial");
    if (comparison.status !== "calculated-partial") {
      throw new Error("expected stored-display comparison");
    }

    expect(comparison.factorRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        factorId: "weapon-foundation",
        ratio: expect.closeTo(0.9852476290832456, 14),
        deltaLabel: "-1.48%",
      }),
      expect.objectContaining({
        factorId: "stationary-attack-damage",
        ratio: expect.closeTo(1.1122448979591837, 14),
        deltaLabel: "+11.22%",
      }),
      expect.objectContaining({
        factorId: "source-visible-emissions",
        ratio: expect.closeTo(0.7142857142857143, 14),
        deltaLabel: "-28.57%",
      }),
    ]));
    expect(comparison.hitScenarioRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scenarioId: "ordinary-not-stationary",
        ratio: expect.closeTo(0.9699724720431953, 14),
      }),
      expect.objectContaining({
        scenarioId: "explosion-stationary",
        ratio: expect.closeTo(1.1497200893859232, 14),
      }),
    ]));
    expect(comparison.emissionsAreSeparate).toBe(true);
    for (const scenario of comparison.evidence.selectedHitScenarios) {
      if (scenario.status === "calculated-partial") {
        expect(scenario.factors.map((factor) => factor.factorId))
          .not.toContain("source-visible-emissions");
      }
    }
    expectGuardFlags(comparison);
  });

  it("keeps the raw-build compatibility helper identical to stored-result comparison", () => {
    const build = bing();
    const beforeEvidence = compileBingFactorLedger(build, 5);
    const afterEvidence = compileBingFactorLedger(build, 6);
    expect(compareBingFactorLedgerResults(
      beforeEvidence,
      afterEvidence,
    )).toEqual(compareBingFactorLedgers(build, 5, 6));

    const beforeDisplay =
      bingFactorLedgerLoadoutDisplayResultForCompendium(build, 5);
    const afterDisplay =
      bingFactorLedgerLoadoutDisplayResultForCompendium(build, 6);
    expect(compareBingFactorLedgerLoadoutDisplays(
      beforeDisplay,
      afterDisplay,
    )).toEqual(
      bingFactorLedgerDisplayResultForCompendium(build, 5, 6),
    );
  });

  it("propagates an unavailable stored side instead of creating a pair estimate", () => {
    const before =
      bingFactorLedgerLoadoutDisplayResultForCompendium(wuxia(), 0);
    const after =
      bingFactorLedgerLoadoutDisplayResultForCompendium(bing(), 6);
    const comparison = compareBingFactorLedgerLoadoutDisplays(before, after);
    expect(comparison).toMatchObject({
      status: "not-calculated",
      kind: "bing-factor-ledger-display",
      blockers: [
        expect.objectContaining({
          code: "unsupported-actor",
          message: expect.stringContaining("Before loadout:"),
        }),
      ],
      evidence: {
        status: "not-calculated",
        kind: "bing-factor-ledger-comparison",
      },
      isDps: false,
      isTotalHit: false,
      isTargetHits: false,
    });
    expectGuardFlags(comparison);
  });
});
