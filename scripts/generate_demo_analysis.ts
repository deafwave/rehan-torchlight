import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseBuild } from "../packages/dmg/src/buildParser.js";
import { cycleDps, type Snapshot } from "../packages/dmg/src/damageModel.js";
import {
  BING_BLAST_NOVA_ID,
  HAMMER_OF_ASH_ID,
} from "../packages/dmg/src/guardedCompiler.js";
import { importBuild } from "../packages/page/src/importer.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".claude", "skills", "tli-build", "cache");
const OUTPUT = path.join(ROOT, "packages", "page", "src", "data", "demo-builds.json");
const CATALOG_OUTPUT = path.join(ROOT, "packages", "page", "src", "data", "import-catalog.json");

const readJson = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));

const skillsBundle = readJson(path.join(CACHE, "SS12.5-skill-en.json"));
const talentBundle = readJson(path.join(CACHE, "SS12.5-talent-tree-en.json"));
const pactBundle = readJson(path.join(CACHE, "SS12.5-pactspirit-en.json"))
  ["pactspirit/i18n/en"]?.pactspirits ?? {};
const heroBundle = readJson(path.join(CACHE, "SS12.5-hero-trait-en.json"))
  ["hero-trait/i18n/en"]?.heroes ?? {};

const skillNames: Record<string, string> = {};
for (const category of Object.values<any>(skillsBundle)) {
  for (const [guid, skill] of Object.entries<any>(category?.skills ?? {})) {
    skillNames[guid] = skill.name ?? guid;
  }
}

const treeName = (id: string) =>
  talentBundle[`talent-tree/${id}/i18n/en`]?.tree?.name
  ?? id.replaceAll("_", " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase());

const treeNames: Record<string, string> = {};
for (const key of Object.keys(talentBundle)) {
  const match = /^talent-tree\/(.+)\/i18n\/en$/.exec(key);
  if (match) treeNames[match[1]] = talentBundle[key]?.tree?.name ?? treeName(match[1]);
}
const heroNames = Object.fromEntries(
  Object.entries<any>(heroBundle).map(([guid, hero]) => [
    guid,
    hero.characterName ?? hero.characterClass ?? guid,
  ]),
);
const pactNames = Object.fromEntries(
  Object.entries<any>(pactBundle).map(([guid, pact]) => [guid, pact.name ?? guid]),
);

const ss13CatalogPath = path.resolve(ROOT, "..", "poorchlight", "tli_dump", "data", "compendium-catalog-ss13.json");
if (fs.existsSync(ss13CatalogPath)) {
  const ss13Catalog = readJson(ss13CatalogPath);
  for (const entry of ss13Catalog.entries ?? []) {
    if (entry.domain === "skill" && entry.id && entry.label) skillNames[entry.id] = entry.label;
    if (entry.domain === "pactspirit" && entry.id && entry.label) {
      pactNames[entry.id] = entry.label;
    }
  }
}

// Keep the committed trusted defense subset (matched-ss13 allowlist). Do not rebuild
// it with a mutated source string — that marks every player-defense compile unsupported.
const committedCatalog = fs.existsSync(CATALOG_OUTPUT) ? readJson(CATALOG_OUTPUT) : {};
const importCatalog = {
  skillNames: { ...committedCatalog.skillNames, ...skillNames },
  treeNames: { ...committedCatalog.treeNames, ...treeNames },
  heroNames: { ...committedCatalog.heroNames, ...heroNames },
  pactNames: { ...committedCatalog.pactNames, ...pactNames },
  defenseCatalog: committedCatalog.defenseCatalog,
  defenseCatalogSha256: committedCatalog.defenseCatalogSha256,
};

function topUnmatched(
  report: any,
  structuralRows: Array<{ text: string; count: number; sources: string[] }> = [],
) {
  const counts = new Map<string, { text: string; count: number; sources: string[] }>();
  const structuralKeys = new Set<string>();
  const keyFor = (text: string) =>
    text.replace(/[+-]?\d+(?:\.\d+)?/g, "#").toLowerCase();
  const add = (textValue: unknown, countValue: unknown, sourceValues: unknown[]): void => {
    const text = String(textValue ?? "").replace(/\s+/g, " ").trim();
    if (!text) return;
    const key = keyFor(text);
    const entry = counts.get(key) ?? { text, count: 0, sources: [] };
    const count = typeof countValue === "number" && Number.isSafeInteger(countValue)
      && countValue > 0
      ? countValue
      : 1;
    entry.count += count;
    for (const source of sourceValues) {
      if (typeof source === "string"
          && source
          && entry.sources.length < 3
          && !entry.sources.includes(source)) {
        entry.sources.push(source);
      }
    }
    counts.set(key, entry);
  };
  for (const line of report.unmatched ?? []) {
    add(line.text, 1, [line.source]);
  }
  for (const row of structuralRows) {
    add(row.text, row.count, row.sources);
    structuralKeys.add(keyFor(String(row.text ?? "").replace(/\s+/g, " ").trim()));
  }
  const ranked = [...counts.values()]
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
  const structural = ranked
    .filter((entry) => structuralKeys.has(keyFor(entry.text)))
    .slice(0, 6);
  const remaining = ranked
    .filter((entry) => !structuralKeys.has(keyFor(entry.text)))
    .slice(0, 18 - structural.length);
  return [...structural, ...remaining];
}

function analyzeBuild(file: string, id: string) {
  const build = readJson(file);
  const structural = importBuild(
    build,
    importCatalog,
    [],
    path.basename(file),
  );
  const loadouts = (build.loadouts?.loadouts ?? []).map((loadout: any, index: number) => {
    // Same dummy math on every loadout: parse → cycleDps. The parser is still
    // Rehan-biased (manual overrides, Spectral Slash supports), so the absolute
    // number is a shared scenario for formula testing — not a map promise.
    const [snapshot, report] = parseBuild(build, index);
    const dps = cycleDps(snapshot);
    const imported = structural.loadouts[index];
    if (!imported) throw new Error(`Canonical import omitted ${id} loadout ${index}.`);
    const coverage = {
      observed: report.matched.length + report.ignored.length + report.unmatched.length,
      classified: report.matched.length,
      ignored: report.ignored.length,
      unsupported: report.unmatched.length,
      classificationRate: report.matched.length + report.unmatched.length
        ? report.matched.length / (report.matched.length + report.unmatched.length)
        : 0,
    };
    return {
      id: imported.id ?? loadout.id ?? `${id}-${index}`,
      index,
      name: imported.name,
      hero: imported.hero,
      isCurrent: imported.isCurrent,
      comparisonContext: imported.comparisonContext
        ? {
            ...imported.comparisonContext,
            lineageId: imported.comparisonContext.lineageId
              ? `fixture-document:${id}`
              : null,
          }
        : undefined,
      model: {
        modelId: "shared-cycle-dps",
        modelVersion: "1",
        scenarioFingerprint: "dummy-shared-cycle-dps-v1",
        actorId: imported.comparisonContext?.actorId ?? id,
        skillId: imported.comparisonContext?.archetypeId ?? "main-skill",
        dps: dps.dps,
        deteriorationDps: dps.deterioration_dps,
        cycleTime: dps.cycle_time,
        modeled: coverage.classified,
        ignored: coverage.ignored,
        unmodeled: coverage.unsupported,
        coverage: coverage.classificationRate,
        confidence: "experimental" as const,
      },
      partialMetrics: imported.partialMetrics,
      supportEvidenceStatus: imported.supportEvidenceStatus,
      supportEvidence: imported.supportEvidence,
      supportEvidenceBlockers: imported.supportEvidenceBlockers,
      summonEvidence: imported.summonEvidence,
      summonEvidenceBlockers: imported.summonEvidenceBlockers,
      bingIntrinsicEvidence: imported.bingIntrinsicEvidence,
      bingIntrinsicBlockers: imported.bingIntrinsicBlockers,
      bingFactorLedger: imported.bingFactorLedger,
      playerDefenseEvidence: imported.playerDefenseEvidence,
      coverage,
      snapshot,
      gear: imported.gear,
      skills: imported.skills,
      trees: imported.trees,
      memories: imported.memories,
      slates: imported.slates,
      pactspirits: imported.pactspirits,
      unmatched: topUnmatched(report, imported.unmatched),
      sourceNote:
        `Dummy DPS from the shared cycleDps formula (${(coverage.classificationRate * 100).toFixed(0)}% affix coverage). Absolute map DPS is not claimed.`,
    };
  });
  return {
    id,
    name: build.name ?? path.basename(file, ".json"),
    patch: build.patch ?? "Unknown patch",
    source: path.basename(file),
    loadouts,
  };
}

function teachingLoadout(
  id: string,
  name: string,
  snapshot: Snapshot,
  gearName: string,
  supportName: string,
  index: number,
) {
  const result = cycleDps(snapshot);
  return {
    id,
    index,
    name,
    hero: "Bing: Blast Nova",
    isCurrent: index === 1,
    comparisonContext: {
      patch: "SS13",
      actorId: BING_BLAST_NOVA_ID,
      archetypeId: HAMMER_OF_ASH_ID,
      lineageId: null,
      sourceKind: "teaching",
    },
    model: {
      modelId: "shared-cycle-dps",
      modelVersion: "1",
      scenarioFingerprint: "dummy-shared-cycle-dps-v1",
      actorId: "bing-blast-nova",
      skillId: "hammer-of-ash",
      dps: result.dps,
      deteriorationDps: result.deterioration_dps,
      cycleTime: result.cycle_time,
      modeled: 1,
      ignored: 0,
      unmodeled: 0,
      coverage: 1,
      confidence: "partial",
    },
    coverage: {
      observed: 1,
      classified: 1,
      ignored: 0,
      unsupported: 0,
      classificationRate: 1,
    },
    snapshot,
    gear: [{
      slot: "scalingChoice",
      name: gearName,
      rarity: "Teaching example",
      category: "formula",
      lines: [supportName],
    }],
    skills: [{
      slot: "active:0",
      kind: "active",
      name: "Hammer of Ash",
      level: 20,
      enabled: true,
      supports: [{
        slot: "0",
        name: supportName,
        type: "support",
        level: 20,
      }],
    }],
    trees: [],
    memories: [],
    slates: [],
    pactspirits: [],
    unmatched: [],
    // Prefix must stay "Calibrated teaching" — action-plan modeledScenarioCompatible
    // keys teaching pairs on that exact start.
    sourceNote:
      "Calibrated teaching scenario. Dummy DPS from the shared cycleDps formula; not an imported character.",
  };
}

const teachingBefore = readJson(path.join(ROOT, "packages", "page", "src", "data", "bing-snapshot.json")) as Snapshot;
const teachingAfter = structuredClone(teachingBefore);
teachingAfter.additional.slow_projectile = 0;
teachingAfter.increased.projectile = (teachingAfter.increased.projectile ?? 0) + 60;
const teachingBuild = {
  id: "scaling-lesson",
  name: "Why a bigger number can lose DPS",
  patch: "SS13 formula",
  source: "Calibrated teaching scenario",
  loadouts: [
    teachingLoadout(
      "lesson-before",
      "Before · separate additional layer",
      teachingBefore,
      "31.5% additional projectile damage",
      "Slow Projectile · separate ×1.315 layer",
      0,
    ),
    teachingLoadout(
      "lesson-after",
      "After · larger increased roll",
      teachingAfter,
      "+60% increased projectile damage",
      "+60% joins the existing increased pool",
      1,
    ),
  ],
};

/** Stable ids for files under data/builds (Supported tab + tests). */
const BUILD_FILE_IDS: Record<string, string> = {
  "bing_china.json": "bing",
  "WuxiaSS13.json": "wuxia",
  "bing1_FurryLover3.json": "bing1-furrylover3",
  "moto2_FurryLover3.json": "moto2-furrylover3",
};

const BUILDS_DIR = path.join(ROOT, "data", "builds");
const files = fs.readdirSync(BUILDS_DIR)
  .filter((name) => name.endsWith(".json"))
  .sort((a, b) => a.localeCompare(b))
  .map((name) => ({
    id: BUILD_FILE_IDS[name] ?? path.basename(name, ".json"),
    file: path.join(BUILDS_DIR, name),
  }));

if (!files.length) {
  throw new Error(`No Compendium builds found in ${BUILDS_DIR}`);
}

const output = {
  modelNotice:
    "Every loadout uses the same cycleDps dummy scenario. Guarded partials (weapon foundation, emissions, minion contacts) are secondary evidence — not a second primary DPS.",
  builds: [teachingBuild, ...files.map(({ id, file }) => analyzeBuild(file, id))],
};

fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`demo analysis -> ${OUTPUT}`);

// Refresh name maps; leave the trusted defense subset untouched if already present.
fs.writeFileSync(
  CATALOG_OUTPUT,
  `${JSON.stringify(importCatalog, null, 2)}\n`,
  "utf8",
);
console.log(`import catalog -> ${CATALOG_OUTPUT}`);
