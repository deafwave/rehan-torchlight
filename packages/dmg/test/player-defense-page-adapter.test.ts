import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { fromRoot } from "../src/py.js";
import { AUDITED_SS13_COMPACT_CATALOG_SHA256 } from "../src/playerDefenseEvidence.js";
import {
  comparePlayerDefenseEvidenceForCompendium,
  playerDefenseEvidenceFingerprint,
  playerDefenseEvidenceForCompendium,
} from "../../page/src/player-defense-evidence.js";

const readJson = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"));
const catalog = readJson(
  fromRoot("../poorchlight/tli_dump/data/compendium-catalog-ss13.json"),
);
const options = {
  catalog,
  catalogSha256: AUDITED_SS13_COMPACT_CATALOG_SHA256,
};
const bing = () => readJson(fromRoot("../bing_china.json"));
const wuxia = () => readJson(fromRoot("../WuxiaSS13.json"));

describe("page player-defence evidence adapter", () => {
  it("maps exact terms, source sums, coverage, and blockers without weakening guards", () => {
    const evidence = playerDefenseEvidenceForCompendium(wuxia(), 8, options);
    expect(evidence.status).toBe("source-terms");
    if (evidence.status !== "source-terms") throw new Error("expected source terms");

    expect(evidence).toMatchObject({
      actor: "player",
      isTotalEhp: false,
      guards: {
        isTotalEhp: false,
        sourceSumsAreCharacterTotals: false,
        comparisonValuesAreEhpDeltas: false,
        recommendationReady: false,
      },
      coverage: {
        sourceLines: 156,
        defensiveLines: 48,
        playerScopedTerms: 45,
        unparsedDefensiveLines: 0,
        catalog: {
          status: "matched-ss13",
          requiredReferences: 32,
          resolvedReferences: 32,
          missingEffectDefinitions: 5,
        },
      },
      playerEhp: { status: "not-calculated" },
    });
    expect(evidence.playerEhp.blockers.map((row) => row.code)).toContain(
      "missing-character-defence-baseline",
    );
    expect(evidence.terms.every((term) =>
      term.actor === "player"
      && term.isTotalEhp === false
      && term.provenance.length > 0)).toBe(true);
    expect(evidence.sourceSums.every((sum) =>
      sum.isCharacterTotal === false && sum.isEhp === false)).toBe(true);
  });

  it("preserves candidate values and provides deterministic display strings", () => {
    const evidence = playerDefenseEvidenceForCompendium(wuxia(), 8, options);
    if (evidence.status !== "source-terms") throw new Error("expected source terms");

    expect(evidence.terms).toContainEqual(expect.objectContaining({
      stat: "additional-damage-taken",
      statLabel: "Additional Damage Taken",
      value: null,
      candidateValues: [-20, -24, -28, -32, -36],
      display: "−20% / −24% / −28% / −32% / −36%",
      scope: "player-conditional",
      includedInSourceSum: false,
    }));
    expect(evidence.terms).toContainEqual(expect.objectContaining({
      stat: "damage-transfer-to-minion",
      value: 8.95,
      display: "+8.95%",
      source: expect.objectContaining({
        kind: "skill-support",
        kindLabel: "Skill support",
      }),
    }));
    expect(evidence.terms).toContainEqual(expect.objectContaining({
      stat: "injury-buffer",
      value: 26,
      display: "+26%",
    }));
    expect(evidence.sourceSums).toContainEqual(expect.objectContaining({
      key: expect.stringMatching(
        /^local-gear:[^:]+:max-energy-shield:add-flat:flat$/,
      ),
      value: 254,
      display: "+254",
      isCharacterTotal: false,
    }));
  });

  it("maps guarded comparisons as numeric source changes, never EHP deltas", () => {
    const comparison = comparePlayerDefenseEvidenceForCompendium(
      wuxia(),
      7,
      8,
      options,
    );
    expect(comparison.status).toBe("source-terms");
    if (comparison.status !== "source-terms") throw new Error("expected source terms");

    expect(comparison.isTotalEhp).toBe(false);
    expect(comparison.guards.comparisonValuesAreEhpDeltas).toBe(false);
    expect(comparison.sourceSumChanges.length).toBeGreaterThan(0);
    expect(comparison.sourceSumChanges.every((change) =>
      change.isEhpDelta === false
      && change.deltaDisplay.length > 0
      && change.statLabel.length > 0)).toBe(true);
    expect(comparison.warning).toContain("not EHP deltas");
    expect(comparison.addedTerms.some((term) =>
      term.source.kind === "skill-support" && term.value === 8.95)).toBe(true);
  });

  it("has a key-order-stable fingerprint that includes candidate ranges", () => {
    const first = playerDefenseEvidenceForCompendium(wuxia(), 8, options);
    const second = playerDefenseEvidenceForCompendium(wuxia(), 8, options);
    expect(playerDefenseEvidenceFingerprint(first)).toBe(
      playerDefenseEvidenceFingerprint(second),
    );

    const reordered = Object.fromEntries(
      Object.entries(first).reverse(),
    ) as typeof first;
    expect(playerDefenseEvidenceFingerprint(reordered)).toBe(
      playerDefenseEvidenceFingerprint(first),
    );

    if (second.status !== "source-terms") throw new Error("expected source terms");
    const trait = second.terms.find((term) => term.candidateValues.length > 0);
    if (!trait) throw new Error("expected a ranged trait term");
    trait.candidateValues = [-20, -24];
    expect(playerDefenseEvidenceFingerprint(second)).not.toBe(
      playerDefenseEvidenceFingerprint(first),
    );
  });

  it("keeps unavailable seasons and missing catalogs explicit", () => {
    const wrongPatch = bing();
    wrongPatch.patch = "SS14";
    expect(playerDefenseEvidenceForCompendium(wrongPatch, 0, options)).toMatchObject({
      status: "not-calculated",
      actor: "player",
      terms: [],
      sourceSums: [],
      blockers: [{ code: "unsupported-patch" }],
      isTotalEhp: false,
    });

    const noCatalog = playerDefenseEvidenceForCompendium(bing(), 0);
    expect(noCatalog.status).toBe("source-terms");
    if (noCatalog.status !== "source-terms") throw new Error("expected source terms");
    expect(noCatalog.coverage.catalog).toMatchObject({
      status: "missing",
      resolvedReferences: 0,
      display: "SS13 catalog not supplied",
    });
    expect(noCatalog.playerEhp.blockers.map((row) => row.code)).toContain(
      "incomplete-defence-catalog-coverage",
    );
  });

  it("does not expose source sums when a source-bearing projection is missing", () => {
    const build = wuxia();
    const truncated = structuredClone(build.loadouts.loadouts[8]);
    delete truncated.gear;
    build.loadouts.loadouts.push(truncated);
    const truncatedIndex = build.loadouts.loadouts.length - 1;

    expect(playerDefenseEvidenceForCompendium(
      build,
      truncatedIndex,
      options,
    )).toMatchObject({
      status: "not-calculated",
      actor: "player",
      terms: [],
      sourceSums: [],
      blockers: [{
        code: "incomplete-defence-source-projection",
        evidence: `loadouts.loadouts[${truncatedIndex}].gear`,
      }],
      isTotalEhp: false,
    });

    expect(playerDefenseEvidenceForCompendium(
      build,
      8,
      options,
    ).status).toBe("source-terms");
  });
});
