import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { fromRoot } from "../src/py.js";
import {
  compareSs13BingSupportEvidence,
  compileSs13BingSupportEvidence,
  SS13_SKILL_TEXT_SOURCE,
  SS13_SUPPORT_FORMULA_SOURCE,
} from "../src/supportEvidence.js";

const readJson = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"));
const bing = () => readJson(fromRoot("../bing_china.json"));
const wuxia = () => readJson(fromRoot("../WuxiaSS13.json"));

describe("guarded SS13 support source terms", () => {
  it("covers every Hammer support present across the supplied Bing progression", () => {
    const build = bing();
    for (let index = 0; index < build.loadouts.loadouts.length; index += 1) {
      const evidence = compileSs13BingSupportEvidence(build, index);
      expect(evidence.status).toBe("source-terms");
      if (evidence.status !== "source-terms") throw new Error("expected source terms");
      expect(evidence.supports).toHaveLength(5);
      expect(evidence.supports.every((support) => support.status === "source-terms")).toBe(true);
    }

    const first = compileSs13BingSupportEvidence(build, 0);
    if (first.status !== "source-terms") throw new Error("expected source terms");
    const byName = new Map(first.supports.map((support) => [support.supportName, support]));
    const values = (name: string) => {
      const support = byName.get(name);
      return support?.status === "source-terms"
        ? support.effects.map((effect) => effect.value)
        : [];
    };
    expect(values("Activation Medium: Motionless")).toEqual([14]);
    expect(values("Melee Knockback")).toEqual([37, 24, 57]);
    expect(values("Critical Strike Damage Increase")).toEqual([34]);
    expect(values("Steamroll")).toEqual([40.5, 40.5, -15]);
    expect(values("Elemental Fusion")).toEqual([35]);
  });

  it("extracts exact level and roll terms without producing DPS", () => {
    const evidence = compileSs13BingSupportEvidence(bing(), 3);
    expect(evidence.status).toBe("source-terms");
    if (evidence.status !== "source-terms") throw new Error("expected source terms");

    expect(evidence.isDps).toBe(false);
    expect(evidence.provenance).toEqual([
      SS13_SUPPORT_FORMULA_SOURCE,
      SS13_SKILL_TEXT_SOURCE,
    ]);
    const passivation = evidence.supports.find((support) =>
      support.supportName === "Passivation");
    expect(passivation?.status).toBe("source-terms");
    if (!passivation || passivation.status !== "source-terms") {
      throw new Error("expected Passivation terms");
    }
    expect(passivation.effects).toContainEqual(expect.objectContaining({
      id: "maximum-additional-erosion-damage",
      value: 60,
      isNetDps: false,
    }));
    expect(passivation.effects[0].condition).toContain("enemy Life");
    expect(passivation.netDps.status).toBe("not-calculated");

    const upheaval = evidence.supports.find((support) =>
      support.supportName === "Hammer of Ash: Upheaval (Magnificent)");
    expect(upheaval?.status).toBe("source-terms");
    if (!upheaval || upheaval.status !== "source-terms") {
      throw new Error("expected Upheaval terms");
    }
    expect(upheaval.effects.map(({ id, value }) => ({ id, value }))).toEqual([
      { id: "additional-damage", value: 20 },
      { id: "explosion-base-radius", value: 30 },
      { id: "additional-explosion-hit-damage", value: 37 },
    ]);
  });

  it("resolves support levels from the actual fixture rather than a level-20 default", () => {
    const evidence = compileSs13BingSupportEvidence(bing(), 6);
    expect(evidence.status).toBe("source-terms");
    if (evidence.status !== "source-terms") throw new Error("expected source terms");
    const slow = evidence.supports.find((support) =>
      support.supportName === "Slow Projectile");
    expect(slow?.status).toBe("source-terms");
    if (!slow || slow.status !== "source-terms") throw new Error("expected Slow Projectile");
    expect(slow.level).toBe(16);
    expect(slow.effects).toContainEqual(expect.objectContaining({
      id: "additional-damage",
      value: 27,
    }));
  });

  it("compares added, removed, and level-changed terms without aggregating them", () => {
    const comparison = compareSs13BingSupportEvidence(bing(), 2, 3);
    expect(comparison.status).toBe("source-terms");
    if (comparison.status !== "source-terms") throw new Error("expected source terms");

    expect(comparison.isDps).toBe(false);
    expect(comparison.changes.map((change) => [
      change.kind,
      change.supportName,
    ])).toEqual(expect.arrayContaining([
      ["removed", "Slow Projectile"],
      ["added", "Hammer of Ash: Upheaval (Magnificent)"],
      ["changed", "Passivation"],
    ]));
    expect(comparison.warning).toContain("without assigning net DPS");
    expect("dps" in comparison).toBe(false);
  });

  it("fails closed for Wuxia instead of applying player support terms to minions", () => {
    expect(compileSs13BingSupportEvidence(wuxia(), 8)).toMatchObject({
      status: "not-calculated",
      isDps: false,
      blockers: [{ code: "unsupported-actor" }],
    });
    const comparison = compareSs13BingSupportEvidence(wuxia(), 7, 8);
    expect(comparison.status).toBe("not-calculated");
    if (comparison.status === "not-calculated") {
      expect(comparison.blockers.map((blocker) => blocker.code)).toEqual([
        "unsupported-actor",
        "unsupported-actor",
      ]);
    }
  });
});
