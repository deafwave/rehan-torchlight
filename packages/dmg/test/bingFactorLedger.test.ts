import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BING_FACTOR_LEDGER_RULE_SOURCE,
  compareBingFactorLedgers,
  compileBingFactorLedger,
  SIERRA_STATIONARY_ATTACK_AFFIX_ID,
  SS13_SIERRA_STATIONARY_SOURCE,
} from "../src/bingFactorLedger.js";
import { compileBingIntrinsicEnvelope } from "../src/bingIntrinsic.js";
import { fromRoot } from "../src/py.js";

const readJson = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"));
const bing = () => readJson(fromRoot("data/builds/bing_china.json"));
const wuxia = () => readJson(fromRoot("data/builds/WuxiaSS13.json"));

function expectNoPromotedMetric(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach(expectNoPromotedMetric);
    return;
  }
  const record = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(record)) {
    expect([
      "dps",
      "dpsRatio",
      "totalHit",
      "totalHitRatio",
      "targetHits",
      "targetHitRatio",
    ]).not.toContain(key);
    if (key === "isDps"
        || key === "isTotalHit"
        || key === "isTargetHits") {
      expect(child).toBe(false);
    }
    expectNoPromotedMetric(child);
  }
}

describe("component-scoped SS13 Bing factor ledger", () => {
  it("explains the exact loadout 5 -> 6 factor changes without calling them DPS", () => {
    const result = compareBingFactorLedgers(bing(), 5, 6);
    expect(result.status).toBe("calculated-partial");
    if (result.status !== "calculated-partial") {
      throw new Error("expected component factor comparison");
    }

    expect(result).toMatchObject({
      kind: "bing-factor-ledger-comparison",
      isDps: false,
      isTotalHit: false,
      isTargetHits: false,
      factorChanges: {
        weaponFoundation: {
          status: "calculated-partial",
          beforeValue: 4832.4978,
          afterValue: 4761.207,
          direction: "loss",
        },
        stationaryAttackDamage: {
          status: "calculated-partial",
          beforeValue: 1.96,
          afterValue: 2.18,
          direction: "gain",
        },
        slowProjectileAdditionalDamage: {
          status: "calculated-partial",
          beforeValue: 1.29,
          afterValue: 1.27,
          direction: "loss",
        },
        upheavalExplosionHitDamage: {
          status: "calculated-partial",
          beforeValue: 1.37,
          afterValue: 1.46,
          direction: "gain",
        },
        sourceVisibleEmissions: {
          status: "calculated-partial",
          beforeValue: 18.9,
          afterValue: 13.5,
          direction: "loss",
        },
      },
    });

    const changes = result.factorChanges;
    expect(changes.weaponFoundation.status).toBe("calculated-partial");
    expect(changes.stationaryAttackDamage.status).toBe("calculated-partial");
    expect(changes.slowProjectileAdditionalDamage.status).toBe("calculated-partial");
    expect(changes.upheavalExplosionHitDamage.status).toBe("calculated-partial");
    expect(changes.sourceVisibleEmissions.status).toBe("calculated-partial");
    if (changes.weaponFoundation.status !== "calculated-partial"
        || changes.stationaryAttackDamage.status !== "calculated-partial"
        || changes.slowProjectileAdditionalDamage.status !== "calculated-partial"
        || changes.upheavalExplosionHitDamage.status !== "calculated-partial"
        || changes.sourceVisibleEmissions.status !== "calculated-partial") {
      throw new Error("expected all exact comparison terms");
    }
    expect(changes.weaponFoundation.ratio).toBeCloseTo(
      0.9852476290832456,
      14,
    );
    expect(changes.stationaryAttackDamage.ratio).toBeCloseTo(
      1.1122448979591837,
      14,
    );
    expect(changes.slowProjectileAdditionalDamage.ratio).toBeCloseTo(
      0.9844961240310077,
      14,
    );
    expect(changes.upheavalExplosionHitDamage.ratio).toBeCloseTo(
      1.0656934306569341,
      14,
    );
    expect(changes.sourceVisibleEmissions.ratio).toBeCloseTo(
      0.7142857142857143,
      14,
    );
    expect(result.warning).toContain("Emissions stay separate");
    expectNoPromotedMetric(result);
  });

  it("publishes four selected-hit scenarios with component scope and never composes emissions", () => {
    const result = compareBingFactorLedgers(bing(), 5, 6);
    if (result.status !== "calculated-partial") {
      throw new Error("expected component factor comparison");
    }
    const scenarios = Object.fromEntries(
      result.selectedHitScenarios.map((scenario) => [
        scenario.scenarioId,
        scenario,
      ]),
    );
    const expected = {
      "ordinary-not-stationary": 0.9699724720431953,
      "explosion-not-stationary": 1.0336932913744998,
      "ordinary-stationary": 1.0788469331909007,
      "explosion-stationary": 1.1497200893859232,
    };
    for (const [id, ratio] of Object.entries(expected)) {
      const scenario = scenarios[id];
      expect(scenario?.status).toBe("calculated-partial");
      if (!scenario || scenario.status !== "calculated-partial") {
        throw new Error(`expected calculated scenario ${id}`);
      }
      expect(scenario.ratio).toBeCloseTo(ratio, 14);
      expect(scenario.scope).toBe(
        "selected source-complete changing hit factors only",
      );
      expect(scenario.factors.map((factor) => factor.factorId))
        .not.toContain("source-visible-emissions");
      expect(scenario.warning).toContain("not a total-hit prediction");
    }
    expect(scenarios["ordinary-not-stationary"]).toMatchObject({
      component: "ordinary-hit",
      condition: "not stationary",
      direction: "loss",
    });
    expect(scenarios["explosion-stationary"]).toMatchObject({
      component: "projectile-explosion-hit",
      condition: "stationary for at least 0.1s",
      direction: "gain",
    });
  });

  it("keeps source paths, pinned hashes, and non-composed cadence/geometry effects", () => {
    const result = compileBingFactorLedger(bing(), 5);
    expect(result.status).toBe("calculated-partial");
    if (result.status !== "calculated-partial") {
      throw new Error("expected factor ledger");
    }
    const stationary = result.terms.stationaryAttackDamage;
    const slow = result.terms.slowProjectileAdditionalDamage;
    const upheaval = result.terms.upheavalExplosionHitDamage;
    expect(stationary.status).toBe("calculated-partial");
    expect(slow.status).toBe("calculated-partial");
    expect(upheaval.status).toBe("calculated-partial");
    if (stationary.status !== "calculated-partial"
        || slow.status !== "calculated-partial"
        || upheaval.status !== "calculated-partial") {
      throw new Error("expected source-complete factors");
    }
    expect(stationary.sourcePaths).toEqual([
      "loadouts.loadouts[5].gear.inventory[1].suffixes[0]",
    ]);
    expect(stationary.nonComposedEffects).toContainEqual(
      expect.objectContaining({
        id: "stationary-additional-attack-speed",
        value: -20,
      }),
    );
    expect(slow.nonComposedEffects).toContainEqual(
      expect.objectContaining({
        id: "additional-projectile-speed",
        value: -30,
      }),
    );
    expect(upheaval.nonComposedEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "additional-damage", value: 20 }),
      expect.objectContaining({ id: "explosion-base-radius", value: 30 }),
    ]));
    expect(stationary.provenance).toContainEqual(
      SS13_SIERRA_STATIONARY_SOURCE,
    );
    expect(result.provenance).toContainEqual(BING_FACTOR_LEDGER_RULE_SOURCE);
    expect(SS13_SIERRA_STATIONARY_SOURCE.sha256).toBe(
      "2a800a28c00efce144bc2da24f1efcfc944a58bc2896767c500b158f363f0b66",
    );
  });

  it("fails closed and stays order-independent for a duplicate pinned support factor", () => {
    const withDuplicateSlowProjectile = (
      firstLevel: number,
      secondLevel: number,
    ) => {
      const build = bing();
      const supports =
        build.loadouts.loadouts[5].skills.activeSkills[0].supports;
      const slowProjectile = structuredClone(supports[4]);
      supports[0] = { ...structuredClone(slowProjectile), level: firstLevel };
      supports[4] = { ...structuredClone(slowProjectile), level: secondLevel };
      return compileBingFactorLedger(build, 5);
    };

    const forward = withDuplicateSlowProjectile(10, 20);
    const reversed = withDuplicateSlowProjectile(20, 10);
    expect(forward.status).toBe("calculated-partial");
    expect(reversed.status).toBe("calculated-partial");
    if (forward.status !== "calculated-partial"
        || reversed.status !== "calculated-partial") {
      throw new Error("expected partial factor ledgers");
    }

    const forwardSlow = forward.terms.slowProjectileAdditionalDamage;
    const reversedSlow = reversed.terms.slowProjectileAdditionalDamage;
    expect(forwardSlow).toEqual(reversedSlow);
    expect(forwardSlow).toMatchObject({
      status: "not-calculated",
      factorId: "slow-projectile-additional-damage",
      blockers: [{
        code: "duplicate-pinned-support-factor",
        evidence: expect.stringMatching(/socket 1.*socket 5/),
      }],
      isDps: false,
      isTotalHit: false,
      isTargetHits: false,
    });
    expect(forwardSlow).not.toHaveProperty("inputValue");
    expect(forwardSlow).not.toHaveProperty("rawPercent");
  });

  it("records Iron Lion's node ID at its actual allocatedNodes array index", () => {
    const result = compileBingIntrinsicEnvelope(bing(), 5);
    expect(result.status).toBe("calculated-partial");
    if (result.status !== "calculated-partial"
        || result.topology.status !== "calculated-partial") {
      throw new Error("expected source-visible topology");
    }
    expect(result.topology.projectileQuantitySources).toContainEqual(
      expect.objectContaining({
        id: "iron-lion",
        quantity: 2,
        sourcePath:
          "pactspirits[0].allocatedNodes[9] (node ID 10)",
      }),
    );
  });

  it("keeps hit scenarios available when emission topology is blocked", () => {
    const build = bing();
    build.loadouts.loadouts[5].kismets[0].nodeId = "slot_0_10";
    const result = compareBingFactorLedgers(build, 5, 6);
    expect(result.status).toBe("calculated-partial");
    if (result.status !== "calculated-partial") {
      throw new Error("expected partial factor comparison");
    }
    expect(result.factorChanges.sourceVisibleEmissions).toMatchObject({
      status: "not-calculated",
      blockers: [
        expect.objectContaining({
          code: "unresolved-iron-lion-kismet-slot",
        }),
      ],
    });
    expect(result.selectedHitScenarios.every(
      (scenario) => scenario.status === "calculated-partial",
    )).toBe(true);
  });

  it("fails only stationary scenarios when the pinned affix roll is out of tier", () => {
    const build = bing();
    const mainHand = build.loadouts.loadouts[5].gear.inventory[1];
    const stationary = mainHand.suffixes.find(
      (suffix: any) =>
        suffix.affixId === SIERRA_STATIONARY_ATTACK_AFFIX_ID,
    );
    stationary.rolledValues[0].value = 101;

    const result = compareBingFactorLedgers(build, 5, 6);
    expect(result.status).toBe("calculated-partial");
    if (result.status !== "calculated-partial") {
      throw new Error("expected partial factor comparison");
    }
    expect(result.factorChanges.stationaryAttackDamage).toMatchObject({
      status: "not-calculated",
      blockers: [
        expect.objectContaining({
          code: "unsupported-stationary-attack-roll",
        }),
      ],
    });
    const scenarios = Object.fromEntries(
      result.selectedHitScenarios.map((scenario) => [
        scenario.scenarioId,
        scenario.status,
      ]),
    );
    expect(scenarios).toEqual({
      "ordinary-not-stationary": "calculated-partial",
      "explosion-not-stationary": "calculated-partial",
      "ordinary-stationary": "not-calculated",
      "explosion-stationary": "not-calculated",
    });
  });

  it("is direction-sensitive, reciprocal, and neutral for an identical loadout", () => {
    const forward = compareBingFactorLedgers(bing(), 5, 6);
    const reverse = compareBingFactorLedgers(bing(), 6, 5);
    const same = compareBingFactorLedgers(bing(), 5, 5);
    if (forward.status !== "calculated-partial"
        || reverse.status !== "calculated-partial"
        || same.status !== "calculated-partial") {
      throw new Error("expected complete selected factors");
    }
    const forwardWeapon = forward.factorChanges.weaponFoundation;
    const reverseWeapon = reverse.factorChanges.weaponFoundation;
    if (forwardWeapon.status !== "calculated-partial"
        || reverseWeapon.status !== "calculated-partial") {
      throw new Error("expected weapon ratios");
    }
    expect(forwardWeapon.ratio * reverseWeapon.ratio).toBeCloseTo(1, 14);
    for (const scenario of same.selectedHitScenarios) {
      expect(scenario.status).toBe("calculated-partial");
      if (scenario.status === "calculated-partial") {
        expect(scenario.ratio).toBeCloseTo(1, 14);
        expect(scenario.direction).toBe("unchanged");
      }
    }
  });

  it("refuses unsupported actors instead of adapting Wuxia into Bing factors", () => {
    const result = compareBingFactorLedgers(wuxia(), 0, 1);
    expect(result).toMatchObject({
      status: "not-calculated",
      kind: "bing-factor-ledger-comparison",
      isDps: false,
      isTotalHit: false,
      isTargetHits: false,
      blockers: expect.arrayContaining([
        expect.objectContaining({
          code: "unsupported-actor",
        }),
      ]),
    });
    expectNoPromotedMetric(result);
  });
});
