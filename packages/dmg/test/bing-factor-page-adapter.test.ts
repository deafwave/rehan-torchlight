import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { compareBingFactorLedgers } from "../src/bingFactorLedger.js";
import { fromRoot } from "../src/py.js";
import {
  bingFactorLedgerDisplayForCompendium,
  bingFactorLedgerDisplayResultForCompendium,
} from "../../page/src/bing-factor-evidence.js";

const readJson = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"));
const bing = () => readJson(fromRoot("data/builds/bing_china.json"));
const wuxia = () => readJson(fromRoot("data/builds/WuxiaSS13.json"));

describe("page Bing component-factor adapter", () => {
  it("formats the guarded 5 -> 6 evidence while retaining the raw comparison", () => {
    const build = bing();
    const expected = compareBingFactorLedgers(build, 5, 6);
    const display = bingFactorLedgerDisplayForCompendium(build, 5, 6);
    expect(expected.status).toBe("calculated-partial");
    expect(display).not.toBeNull();
    if (!display) throw new Error("expected factor display");

    expect(display).toMatchObject({
      status: "calculated-partial",
      kind: "bing-factor-ledger-display",
      beforeIndex: 5,
      afterIndex: 6,
      emissionsAreSeparate: true,
      isDps: false,
      isTotalHit: false,
      isTargetHits: false,
    });
    expect(display.evidence).toEqual(expected);
    expect(display.factorRows).toHaveLength(5);
    expect(display.factorRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        factorId: "weapon-foundation",
        before: {
          raw: 4832.4978,
          kind: "average-weapon-sourced-hit",
          formatted: "4,832.4978",
        },
        after: {
          raw: 4761.207,
          kind: "average-weapon-sourced-hit",
          formatted: "4,761.207",
        },
        deltaLabel: "-1.48%",
      }),
      expect.objectContaining({
        factorId: "stationary-attack-damage",
        before: {
          raw: 1.96,
          kind: "multiplier",
          formatted: "×1.96",
        },
        after: {
          raw: 2.18,
          kind: "multiplier",
          formatted: "×2.18",
        },
        deltaLabel: "+11.22%",
      }),
      expect.objectContaining({
        factorId: "source-visible-emissions",
        before: {
          raw: 18.9,
          kind: "emitted-projectiles-per-throw",
          formatted: "18.9 emitted / throw",
        },
        after: {
          raw: 13.5,
          kind: "emitted-projectiles-per-throw",
          formatted: "13.5 emitted / throw",
        },
        deltaLabel: "-28.57%",
      }),
    ]));
    expect(display.hitScenarioRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scenarioId: "ordinary-not-stationary",
        deltaLabel: "-3.00%",
      }),
      expect.objectContaining({
        scenarioId: "explosion-stationary",
        deltaLabel: "+14.97%",
      }),
    ]));
  });

  it("preserves refusal blockers instead of manufacturing display rows", () => {
    const result = bingFactorLedgerDisplayResultForCompendium(
      wuxia(),
      0,
      1,
    );
    expect(result).toMatchObject({
      status: "not-calculated",
      kind: "bing-factor-ledger-display",
      isDps: false,
      isTotalHit: false,
      isTargetHits: false,
      blockers: expect.arrayContaining([
        expect.objectContaining({
          code: "unsupported-actor",
        }),
      ]),
      evidence: {
        status: "not-calculated",
        kind: "bing-factor-ledger-comparison",
      },
    });
    expect(bingFactorLedgerDisplayForCompendium(wuxia(), 0, 1)).toBeNull();
  });

  it("renders an unavailable emissions row without suppressing hit scenarios", () => {
    const build = bing();
    build.loadouts.loadouts[5].kismets[0].nodeId = "slot_0_10";
    const display = bingFactorLedgerDisplayForCompendium(build, 5, 6);
    expect(display).not.toBeNull();
    if (!display) throw new Error("expected partial display");

    expect(display.factorRows.find(
      (row) => row.factorId === "source-visible-emissions",
    )).toMatchObject({
      status: "not-calculated",
      blockers: [
        expect.objectContaining({
          code: "unresolved-iron-lion-kismet-slot",
        }),
      ],
    });
    expect(display.hitScenarioRows.every(
      (row) => row.status === "calculated-partial",
    )).toBe(true);
    expect(display.emissionsAreSeparate).toBe(true);
  });
});
