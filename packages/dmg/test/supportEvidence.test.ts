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
const bing = () => readJson(fromRoot("data/builds/bing_china.json"));
const wuxia = () => readJson(fromRoot("data/builds/WuxiaSS13.json"));

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

  it("compares support swaps and level changes by stable socket without aggregating them", () => {
    const comparison = compareSs13BingSupportEvidence(bing(), 2, 3);
    expect(comparison.status).toBe("source-terms");
    if (comparison.status !== "source-terms") throw new Error("expected source terms");

    expect(comparison.isDps).toBe(false);
    expect(comparison.changes.map((change) => [
      change.kind,
      change.socketIndex,
      change.before?.supportName ?? null,
      change.supportName,
    ])).toEqual(expect.arrayContaining([
      ["changed", 2, "Slow Projectile", "Hammer of Ash: Upheaval (Magnificent)"],
      ["changed", 1, "Passivation", "Passivation"],
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

  it("requires the exact enabled Hammer parent and five guarded support sockets", () => {
    const implicitParent = bing();
    const implicitHammer = implicitParent.loadouts.loadouts[0].skills.activeSkills.find(
      (skill: any) => skill.skillGuid === "6f020b6a-022b-50eb-8299-e5fc7492ea8f",
    );
    delete implicitHammer.enabled;
    expect(compileSs13BingSupportEvidence(implicitParent, 0)).toMatchObject({
      status: "not-calculated",
      blockers: [{ code: "disabled-hammer-of-ash" }],
    });

    const duplicateParent = bing();
    duplicateParent.loadouts.loadouts[0].skills.activeSkills[1] =
      structuredClone(duplicateParent.loadouts.loadouts[0].skills.activeSkills[0]);
    expect(compileSs13BingSupportEvidence(duplicateParent, 0)).toMatchObject({
      status: "not-calculated",
      blockers: [{ code: "duplicate-hammer-of-ash" }],
    });

    for (const supports of [
      {},
      [null, null, null, null],
      [null, null, null, null, null, null],
    ]) {
      const malformed = bing();
      const hammer = malformed.loadouts.loadouts[0].skills.activeSkills.find(
        (skill: any) => skill.skillGuid === "6f020b6a-022b-50eb-8299-e5fc7492ea8f",
      );
      hammer.supports = supports;
      expect(() => compileSs13BingSupportEvidence(malformed, 0)).not.toThrow();
      expect(compileSs13BingSupportEvidence(malformed, 0)).toMatchObject({
        status: "not-calculated",
        blockers: [{ code: "malformed-support-sockets" }],
      });
    }

    const duplicateSupport = bing();
    const supports = duplicateSupport.loadouts.loadouts[0].skills.activeSkills[0].supports;
    supports[1] = structuredClone(supports[0]);
    const duplicateEvidence = compileSs13BingSupportEvidence(duplicateSupport, 0);
    expect(duplicateEvidence.status).toBe("source-terms");
    if (duplicateEvidence.status !== "source-terms") throw new Error("expected socket evidence");
    expect(duplicateEvidence.supports.slice(0, 2)).toMatchObject([
      {
        actorId: "c89dce15-cbeb-562d-83ec-993059bbf0ec",
        actorName: "Bing: Blast Nova",
        skillId: "6f020b6a-022b-50eb-8299-e5fc7492ea8f",
        skillName: "Hammer of Ash",
        socketIndex: 0,
        socketId: "support:0",
        supportId: "2a5b5be6-f54e-58fc-9acb-47facff516e0",
      },
      {
        actorId: "c89dce15-cbeb-562d-83ec-993059bbf0ec",
        actorName: "Bing: Blast Nova",
        skillId: "6f020b6a-022b-50eb-8299-e5fc7492ea8f",
        skillName: "Hammer of Ash",
        socketIndex: 1,
        socketId: "support:1",
        supportId: "2a5b5be6-f54e-58fc-9acb-47facff516e0",
      },
    ]);
  });

  it("compares duplicate support IDs by actor, skill, and socket identity", () => {
    const build = bing();
    build.loadouts.loadouts[1] = structuredClone(build.loadouts.loadouts[0]);
    const beforeSupports = build.loadouts.loadouts[0].skills.activeSkills[0].supports;
    const afterSupports = build.loadouts.loadouts[1].skills.activeSkills[0].supports;
    beforeSupports[2] = structuredClone(beforeSupports[1]);
    afterSupports[2] = structuredClone(afterSupports[1]);
    afterSupports[2].level = beforeSupports[2].level + 1;

    const comparison = compareSs13BingSupportEvidence(build, 0, 1);
    expect(comparison.status).toBe("source-terms");
    if (comparison.status !== "source-terms") throw new Error("expected source terms");
    expect(comparison.changes).toMatchObject([{
      kind: "changed",
      actorName: "Bing: Blast Nova",
      skillName: "Hammer of Ash",
      socketIndex: 2,
      socketId: "support:2",
      supportId: "2d9474fd-8923-56ef-9f5c-f6444898c5f9",
    }]);
  });

  it("fails closed when Motionless or Upheaval is moved out of its typed socket", () => {
    const movedMotionless = bing();
    const motionlessSockets =
      movedMotionless.loadouts.loadouts[0].skills.activeSkills[0].supports;
    [motionlessSockets[0], motionlessSockets[1]] = [
      motionlessSockets[1],
      motionlessSockets[0],
    ];
    const motionlessEvidence =
      compileSs13BingSupportEvidence(movedMotionless, 0);
    expect(motionlessEvidence.status).toBe("source-terms");
    if (motionlessEvidence.status !== "source-terms") {
      throw new Error("expected socket evidence");
    }
    expect(motionlessEvidence.supports[1]).toMatchObject({
      status: "unsupported",
      supportName: "Activation Medium: Motionless",
      socketIndex: 1,
      socketId: "support:1",
      blockers: [{
        code: "invalid-bing-support-socket",
        evidence:
          "loadouts.loadouts[0].skills.activeSkills[0].supports[1]",
      }],
    });

    const movedUpheaval = bing();
    const upheavalSockets =
      movedUpheaval.loadouts.loadouts[3].skills.activeSkills[0].supports;
    [upheavalSockets[2], upheavalSockets[4]] = [
      upheavalSockets[4],
      upheavalSockets[2],
    ];
    const upheavalEvidence =
      compileSs13BingSupportEvidence(movedUpheaval, 3);
    expect(upheavalEvidence.status).toBe("source-terms");
    if (upheavalEvidence.status !== "source-terms") {
      throw new Error("expected socket evidence");
    }
    expect(upheavalEvidence.supports[4]).toMatchObject({
      status: "unsupported",
      supportName: "Hammer of Ash: Upheaval (Magnificent)",
      socketIndex: 4,
      socketId: "support:4",
      blockers: [{
        code: "invalid-bing-support-socket",
        evidence:
          "loadouts.loadouts[3].skills.activeSkills[0].supports[4]",
      }],
    });
  });

  it("rejects spoofed support type and coercible numeric metadata", () => {
    const wrongType = bing();
    wrongType.loadouts.loadouts[0].skills.activeSkills[0].supports[0].type =
      "support";
    let evidence = compileSs13BingSupportEvidence(wrongType, 0);
    expect(evidence.status).toBe("source-terms");
    if (evidence.status !== "source-terms") throw new Error("expected socket evidence");
    expect(evidence.supports[0]).toMatchObject({
      status: "unsupported",
      blockers: [{
        code: "invalid-support-installation",
        evidence: expect.stringContaining("supports[0]"),
      }],
    });

    const stringLevel = bing();
    stringLevel.loadouts.loadouts[0].skills.activeSkills[0].supports[1].level =
      "18";
    evidence = compileSs13BingSupportEvidence(stringLevel, 0);
    expect(evidence.status).toBe("source-terms");
    if (evidence.status !== "source-terms") throw new Error("expected socket evidence");
    expect(evidence.supports[1]).toMatchObject({
      status: "unsupported",
      blockers: [{ code: "unsupported-support-level" }],
    });

    const extraRoll = bing();
    extraRoll.loadouts.loadouts[0].skills.activeSkills[0].supports[0].rollValues =
      [14, 15];
    evidence = compileSs13BingSupportEvidence(extraRoll, 0);
    expect(evidence.status).toBe("source-terms");
    if (evidence.status !== "source-terms") throw new Error("expected socket evidence");
    expect(evidence.supports[0]).toMatchObject({
      status: "unsupported",
      blockers: [{ code: "unsupported-motionless-roll" }],
    });
  });
});
