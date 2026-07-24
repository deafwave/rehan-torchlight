import fs from "node:fs";
import { describe, expect, it } from "vitest";
import demoData from "../../page/src/data/demo-builds.json";
import type {
  AnalyzedLoadout,
  DemoData,
  ImportCatalog,
} from "../../page/src/analysis-types.js";
import {
  IRIS_SPIRIT_MAGUS_ARCHETYPE_ID,
  classifyComparisonContext,
  type LoadoutComparisonKind,
} from "../../page/src/comparison-context.js";
import {
  importBuild,
  importBuildCode,
} from "../../page/src/importer.js";
import {
  BING_BLAST_NOVA_ID,
  HAMMER_OF_ASH_ID,
  IRIS_VIGILANT_BREEZE_ID,
} from "../src/guardedCompiler.js";
import { fromRoot } from "../src/py.js";

const emptyCatalog: ImportCatalog = {
  skillNames: {},
  treeNames: {},
  heroNames: {},
  pactNames: {},
};

const readJson = (path: string) =>
  JSON.parse(fs.readFileSync(path, "utf8"));
const bingSource = () => readJson(fromRoot("../bing_china.json"));
const wuxiaSource = () => readJson(fromRoot("../WuxiaSS13.json"));

function symmetric(
  before: AnalyzedLoadout,
  after: AnalyzedLoadout,
  expected: LoadoutComparisonKind,
) {
  const forward = classifyComparisonContext(before, after);
  const reverse = classifyComparisonContext(after, before);
  expect(forward).toEqual(reverse);
  expect(forward.kind).toBe(expected);
  return forward;
}

describe("guarded loadout comparison context", () => {
  it("classifies same-fixture Wuxia loadouts as progression in both directions", () => {
    const build = importBuild(wuxiaSource(), emptyCatalog);
    const before = build.loadouts[7];
    const after = build.loadouts[8];

    expect(before.comparisonContext).toMatchObject({
      patch: "SS13",
      actorId: IRIS_VIGILANT_BREEZE_ID,
      archetypeId: IRIS_SPIRIT_MAGUS_ARCHETYPE_ID,
      sourceKind: "compendium",
    });
    expect(before.comparisonContext?.lineageId).toEqual(expect.any(String));
    expect(after.comparisonContext).toEqual(before.comparisonContext);
    expect(symmetric(before, after, "progression").reason).toContain(
      "lineage match",
    );
  });

  it("uses Bing's guarded skill identity as its stable archetype", () => {
    const build = importBuild(bingSource(), emptyCatalog);
    expect(build.loadouts[0].comparisonContext).toMatchObject({
      patch: "SS13",
      actorId: BING_BLAST_NOVA_ID,
      archetypeId: HAMMER_OF_ASH_ID,
      sourceKind: "compendium",
    });
    expect(build.loadouts[0].comparisonContext?.lineageId).toEqual(
      expect.any(String),
    );
    symmetric(build.loadouts[0], build.loadouts[1], "progression");
  });

  it("classifies adjacent bundled Bing and Wuxia loadouts as progression", () => {
    const fixtures = demoData as DemoData;
    for (const buildId of ["bing", "wuxia"]) {
      const build = fixtures.builds.find((candidate) =>
        candidate.id === buildId);
      if (!build) throw new Error(`missing ${buildId} fixture`);
      for (let index = 1; index < build.loadouts.length; index += 1) {
        symmetric(
          build.loadouts[index - 1],
          build.loadouts[index],
          "progression",
        );
      }
    }
  });

  it("keeps bundled fixture lineage separate from runtime imports", () => {
    const fixture = (demoData as DemoData).builds.find((candidate) =>
      candidate.id === "bing");
    if (!fixture) throw new Error("missing bing fixture");
    const runtime = importBuild(bingSource(), emptyCatalog);

    expect(fixture.loadouts[0].comparisonContext?.lineageId)
      .toMatch(/^fixture-document:/);
    expect(runtime.loadouts[0].comparisonContext?.lineageId)
      .toMatch(/^runtime-compendium-session:/);
    expect(fixture.loadouts[0].comparisonContext?.lineageId).not.toBe(
      runtime.loadouts[0].comparisonContext?.lineageId,
    );
  });

  it("falls back to the primary proven non-minion skill for an unsupported actor", () => {
    const source = bingSource();
    source.loadouts.loadouts[0].hero = {
      heroGuid: "11111111-1111-5111-8111-111111111111",
      heroId: "Unsupported test actor",
      traits: {},
    };
    const loadout = importBuild(source, emptyCatalog).loadouts[0];

    expect(loadout.comparisonContext).toMatchObject({
      patch: "SS13",
      actorId: "11111111-1111-5111-8111-111111111111",
      archetypeId: HAMMER_OF_ASH_ID,
      sourceKind: "compendium",
    });
    expect(loadout.comparisonContext?.lineageId).toEqual(expect.any(String));
  });

  it("keeps a portable capture without a proven active skill reference-only", () => {
    const source = readJson(fromRoot(
      "../poorchlight/tli_dump/ui/fixtures/rust-portable-snapshot.json",
    ));
    const loadout = importBuild(source, emptyCatalog).loadouts[0];

    expect(loadout.comparisonContext).toEqual({
      patch: "SS13",
      actorId: BING_BLAST_NOVA_ID,
      archetypeId: null,
      lineageId: null,
      sourceKind: "portable-v3",
    });
    expect(
      symmetric(loadout, loadout, "reference").reason,
    ).toContain("unresolved");
  });

  it("rejects cross-hero and cross-patch pairs symmetrically", () => {
    const bing = importBuild(bingSource(), emptyCatalog);
    const wuxia = importBuild(wuxiaSource(), emptyCatalog);
    expect(
      symmetric(bing.loadouts[0], wuxia.loadouts[0], "incompatible").reason,
    ).toContain("different actors");

    const otherPatch = bingSource();
    otherPatch.patch = "SS12";
    const ss12 = importBuild(otherPatch, emptyCatalog);
    expect(
      symmetric(bing.loadouts[0], ss12.loadouts[0], "incompatible").reason,
    ).toContain("different patches");
  });

  it("does not infer progression across separate otherwise-identical Compendium documents", () => {
    const source = bingSource();
    const independentDocument = structuredClone(source);
    independentDocument.id = `${source.id}-independent-document`;
    const first = importBuild(source, emptyCatalog).loadouts[0];
    const second = importBuild(
      independentDocument,
      emptyCatalog,
    ).loadouts[0];

    expect(first.comparisonContext?.lineageId).toEqual(expect.any(String));
    expect(second.comparisonContext?.lineageId).toEqual(expect.any(String));
    expect(first.comparisonContext?.lineageId).not.toBe(
      second.comparisonContext?.lineageId,
    );
    expect({
      ...first.comparisonContext,
      lineageId: null,
    }).toEqual({
      ...second.comparisonContext,
      lineageId: null,
    });
    expect(
      symmetric(first, second, "reference").reason,
    ).toContain("source-document lineage");
  });

  it("does not infer document lineage from identical bytes imported twice", () => {
    const source = bingSource();
    const first = importBuild(structuredClone(source), emptyCatalog);
    const second = importBuild(structuredClone(source), emptyCatalog);

    expect(first.id).not.toBe(second.id);
    expect(first.loadouts[0].comparisonContext?.lineageId).not.toBe(
      second.loadouts[0].comparisonContext?.lineageId,
    );
    expect(symmetric(
      first.loadouts[0],
      second.loadouts[0],
      "reference",
    ).reason).toContain("source-document lineage");
  });

  it("allows an explicit same-character assertion without weakening identity gates", () => {
    const firstSource = bingSource();
    const secondSource = structuredClone(firstSource);
    secondSource.id = `${firstSource.id}-later-capture`;
    const first = importBuild(firstSource, emptyCatalog).loadouts[0];
    const second = importBuild(secondSource, emptyCatalog).loadouts[0];
    expect(symmetric(first, second, "reference").reason).toContain("lineage");
    if (!first.comparisonContext || !second.comparisonContext) {
      throw new Error("missing comparison contexts");
    }
    first.comparisonContext.lineageId = "user-confirmed:test-pair";
    second.comparisonContext.lineageId = "user-confirmed:test-pair";
    first.comparisonContext.lineageEvidence = "user-confirmed-pair";
    second.comparisonContext.lineageEvidence = "user-confirmed-pair";

    expect(symmetric(first, second, "progression").reason).toContain(
      "user confirmed",
    );
    second.comparisonContext.actorId = IRIS_VIGILANT_BREEZE_ID;
    expect(symmetric(first, second, "incompatible").reason).toContain(
      "different actors",
    );
  });

  it("keeps the explicit teaching fixture reference-only beside an import", () => {
    const fixture = (demoData as DemoData).builds.find((build) =>
      build.id === "scaling-lesson");
    if (!fixture) throw new Error("missing teaching fixture");
    const teaching = fixture.loadouts[0];
    const imported = importBuild(bingSource(), emptyCatalog).loadouts[0];

    expect(teaching.comparisonContext).toEqual({
      patch: "SS13",
      actorId: BING_BLAST_NOVA_ID,
      archetypeId: HAMMER_OF_ASH_ID,
      lineageId: null,
      sourceKind: "teaching",
    });
    expect(
      symmetric(teaching, imported, "reference").reason,
    ).toContain("Teaching scenarios");

    const iris = importBuild(wuxiaSource(), emptyCatalog).loadouts[0];
    expect(
      symmetric(teaching, iris, "incompatible").reason,
    ).toContain("different actors");
  });

  it("treats archetype, missing-context, and source-family boundaries as references", () => {
    const imported = importBuild(bingSource(), emptyCatalog).loadouts[0];
    if (!imported.comparisonContext) {
      throw new Error("missing imported comparison context");
    }
    const otherArchetype: AnalyzedLoadout = {
      ...imported,
      comparisonContext: {
        ...imported.comparisonContext,
        archetypeId: "different-primary-skill",
      },
    };
    expect(
      symmetric(imported, otherArchetype, "reference").reason,
    ).toContain("different archetypes");

    const noContext: AnalyzedLoadout = { ...imported };
    delete noContext.comparisonContext;
    expect(
      symmetric(imported, noContext, "reference").reason,
    ).toContain("context is missing");

    const portable: AnalyzedLoadout = {
      ...imported,
      comparisonContext: {
        ...imported.comparisonContext,
        sourceKind: "portable-v3",
      },
    };
    const converted: AnalyzedLoadout = {
      ...imported,
      comparisonContext: {
        ...imported.comparisonContext,
        sourceKind: "portable-converter",
      },
    };
    symmetric(portable, converted, "progression");
    expect(
      symmetric(imported, portable, "reference").reason,
    ).toContain("different source families");
  });

  it("marks unresolved build codes as unknown build-code references", () => {
    const unresolved = importBuildCode(
      "2L8xV4YBEfGpdQAAAAAACw==",
    ).loadouts[0];
    const imported = importBuild(bingSource(), emptyCatalog).loadouts[0];

    expect(unresolved.comparisonContext).toEqual({
      patch: null,
      actorId: null,
      archetypeId: null,
      lineageId: null,
      sourceKind: "build-code",
    });
    expect(
      symmetric(unresolved, imported, "reference").reason,
    ).toContain("unresolved");

    const separatelyResolved = importBuildCode(
      "2L8xV4YBEfGpdQAAAAAACw==",
    ).loadouts[0];
    expect(
      symmetric(unresolved, separatelyResolved, "reference").reason,
    ).toContain("unresolved");
  });
});
