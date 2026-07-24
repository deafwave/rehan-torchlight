import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { fromRoot } from "../src/py.js";
import { compileBingIntrinsicEnvelope } from "../src/bingIntrinsic.js";
import {
  bingIntrinsicEvidenceFingerprint,
  bingIntrinsicEvidenceForCompendium,
  bingIntrinsicEvidenceResultForCompendium,
  compareBingIntrinsicEvidenceForCompendium,
} from "../../page/src/bing-intrinsic-evidence.js";

const readJson = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"));
const bing = () => readJson(fromRoot("data/builds/bing_china.json"));
const wuxia = () => readJson(fromRoot("data/builds/WuxiaSS13.json"));

describe("page Bing intrinsic evidence adapter", () => {
  it("returns the exact guarded partial envelope without weakening guards or provenance", () => {
    const build = bing();
    const expected = compileBingIntrinsicEnvelope(build, 3);
    const evidence = bingIntrinsicEvidenceForCompendium(build, 3);

    expect(expected.status).toBe("calculated-partial");
    expect(evidence).toEqual(expected);
    expect(evidence).toMatchObject({
      status: "calculated-partial",
      kind: "bing-intrinsic-envelope",
      isDps: false,
      isTotalHit: false,
      topology: {
        status: "calculated-partial",
        isDps: false,
        isTargetHits: false,
        projectilesPerBomb: 9,
        expectedEmittedProjectilesPerThrow: 22.5,
      },
      actualDps: {
        status: "not-calculated",
        isDps: false,
      },
    });
    expect(evidence?.provenance).toEqual(expected.status === "calculated-partial"
      ? expected.provenance
      : []);
  });

  it("returns null whenever the guarded compiler refuses the envelope", () => {
    const wrongPatch = bing();
    wrongPatch.patch = "SS14";
    expect(bingIntrinsicEvidenceForCompendium(wrongPatch, 0)).toBeNull();
    expect(bingIntrinsicEvidenceForCompendium(wuxia(), 0)).toBeNull();
    expect(bingIntrinsicEvidenceForCompendium(bing(), 99)).toBeNull();
  });

  it("preserves actionable refusal blockers for importer and UI boundaries", () => {
    const wrongPatch = bing();
    wrongPatch.patch = "SS14";
    expect(bingIntrinsicEvidenceResultForCompendium(wrongPatch, 0)).toMatchObject({
      status: "not-calculated",
      isDps: false,
      isTotalHit: false,
      blockers: [{ code: "unsupported-patch" }],
    });
    expect(bingIntrinsicEvidenceResultForCompendium(wuxia(), 0)).toMatchObject({
      status: "not-calculated",
      blockers: [{ code: "unsupported-actor" }],
    });
  });

  it("has a deterministic semantic fingerprint independent of key order and loadout labels", () => {
    const first = bingIntrinsicEvidenceForCompendium(bing(), 3);
    const second = bingIntrinsicEvidenceForCompendium(bing(), 3);
    if (!first || !second) throw new Error("expected Bing evidence");

    expect(bingIntrinsicEvidenceFingerprint(first)).toBe(
      bingIntrinsicEvidenceFingerprint(second),
    );
    const reordered = Object.fromEntries(
      Object.entries(first).reverse(),
    ) as typeof first;
    expect(bingIntrinsicEvidenceFingerprint(reordered)).toBe(
      bingIntrinsicEvidenceFingerprint(first),
    );

    second.loadoutIndex = 99;
    second.loadoutName = "renamed";
    expect(bingIntrinsicEvidenceFingerprint(second)).toBe(
      bingIntrinsicEvidenceFingerprint(first),
    );

    if (second.topology.status !== "calculated-partial") {
      throw new Error("expected emission topology");
    }
    second.topology.expectedEmittedProjectilesPerThrow = 999;
    expect(bingIntrinsicEvidenceFingerprint(second)).not.toBe(
      bingIntrinsicEvidenceFingerprint(first),
    );
  });

  it("builds a stable direction-sensitive before/after comparison without calling deltas DPS", () => {
    const build = bing();
    const comparison = compareBingIntrinsicEvidenceForCompendium(build, 2, 3);
    const repeated = compareBingIntrinsicEvidenceForCompendium(build, 2, 3);
    expect(comparison).not.toBeNull();
    expect(repeated).not.toBeNull();
    if (!comparison || !repeated) throw new Error("expected comparison");

    expect(comparison).toMatchObject({
      status: "calculated-partial",
      kind: "bing-intrinsic-evidence-comparison",
      isDps: false,
      isTotalHit: false,
      isTargetHits: false,
      changed: true,
      topologyChanged: true,
      before: {
        loadoutIndex: 2,
        evidence: { isDps: false, isTotalHit: false },
      },
      after: {
        loadoutIndex: 3,
        evidence: { isDps: false, isTotalHit: false },
      },
      weaponSourcedPerHitDelta: {
        scope: "weapon-sourced per-hit only",
        normalAverage: 3289.06305,
        demolisherChargedAverage: 10360.5486075,
        isDps: false,
        isTotalHit: false,
      },
    });
    expect(comparison.fingerprint).toBe(repeated.fingerprint);
    expect(comparison.provenance.length).toBeGreaterThan(0);
    expect(comparison.warning).toContain("not DPS");

    const reversed = compareBingIntrinsicEvidenceForCompendium(build, 3, 2);
    expect(reversed?.fingerprint).not.toBe(comparison.fingerprint);
    expect(reversed?.weaponSourcedPerHitDelta.normalAverage)
      .toBe(-comparison.weaponSourcedPerHitDelta.normalAverage);
  });

  it("reports no semantic change when comparing a guarded envelope with itself", () => {
    const comparison = compareBingIntrinsicEvidenceForCompendium(bing(), 5, 5);
    expect(comparison).toMatchObject({
      changed: false,
      topologyChanged: false,
      weaponSourcedPerHitDelta: {
        normalAverage: 0,
        demolisherChargedAverage: 0,
        isDps: false,
        isTotalHit: false,
      },
    });
  });
});
