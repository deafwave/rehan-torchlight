import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseBuild } from "../packages/dmg/src/buildParser.js";
import { cycleDps, type Snapshot } from "../packages/dmg/src/damageModel.js";
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
  }
}

function topUnmatched(report: any) {
  const counts = new Map<string, { text: string; count: number; sources: string[] }>();
  for (const line of report.unmatched ?? []) {
    const text = String(line.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const key = text.replace(/[+-]?\d+(?:\.\d+)?/g, "#").toLowerCase();
    const entry = counts.get(key) ?? { text, count: 0, sources: [] };
    entry.count += 1;
    if (line.source && entry.sources.length < 3) entry.sources.push(line.source);
    counts.set(key, entry);
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
    .slice(0, 18);
}

function analyzeBuild(file: string, id: string) {
  const build = readJson(file);
  const structural = importBuild(
    build,
    { skillNames, treeNames, heroNames, pactNames },
    [],
    path.basename(file),
  );
  const loadouts = (build.loadouts?.loadouts ?? []).map((loadout: any, index: number) => {
    const [, report] = parseBuild(build, index);
    const imported = structural.loadouts[index];
    if (!imported) throw new Error(`Canonical import omitted ${id} loadout ${index}.`);
    return {
      id: imported.id ?? loadout.id ?? `${id}-${index}`,
      index,
      name: imported.name,
      hero: imported.hero,
      isCurrent: imported.isCurrent,
      // The current parser starts from Rehan/Spectral Slash defaults and applies Rehan
      // manual overrides. Keep the structural import and coverage evidence, but do not
      // publish its synthetic DPS as if it described these arbitrary SS13 loadouts.
      model: null,
      partialMetrics: imported.partialMetrics,
      supportEvidence: imported.supportEvidence,
      summonEvidence: imported.summonEvidence,
      coverage: {
        observed: report.matched.length + report.ignored.length + report.unmatched.length,
        classified: report.matched.length,
        ignored: report.ignored.length,
        unsupported: report.unmatched.length,
        classificationRate: report.matched.length + report.unmatched.length
          ? report.matched.length / (report.matched.length + report.unmatched.length)
          : 0,
      },
      snapshot: null,
      gear: imported.gear,
      skills: imported.skills,
      trees: imported.trees,
      memories: imported.memories,
      slates: imported.slates,
      pactspirits: imported.pactspirits,
      unmatched: topUnmatched(report),
      sourceNote: id === "wuxia"
        ? "Summon and Origin source terms are available. Minion attack bases, action coefficients, cooldowns, AI, Growth/merge state, and total player EHP are not calculated."
        : "Guarded equipped-weapon and support source evidence is available. Full DPS remains uncalculated until Blast Nova rotation, bomb geometry, actor scaling, enemy state, and uptime are modeled.",
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
    model: {
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
      kind: "active",
      name: "Hammer of Ash",
      level: 20,
      enabled: true,
      supports: [{ name: supportName, type: "support", level: 20 }],
    }],
    trees: [],
    memories: [],
    slates: [],
    pactspirits: [],
    unmatched: [],
    sourceNote: "Calibrated teaching scenario. It demonstrates formula behavior; it is not an imported character.",
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

const files = [
  { id: "bing", file: path.resolve(ROOT, "..", "bing_china.json") },
  { id: "wuxia", file: path.resolve(ROOT, "..", "WuxiaSS13.json") },
];

const output = {
  generatedAt: new Date().toISOString(),
  modelNotice: "Directional model output. Unsupported mechanics are excluded and reported per loadout.",
  builds: [teachingBuild, ...files.map(({ id, file }) => analyzeBuild(file, id))],
};

fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`demo analysis -> ${OUTPUT}`);

fs.writeFileSync(
  CATALOG_OUTPUT,
  `${JSON.stringify({ skillNames, treeNames, heroNames, pactNames }, null, 2)}\n`,
  "utf8",
);
console.log(`import catalog -> ${CATALOG_OUTPUT}`);
