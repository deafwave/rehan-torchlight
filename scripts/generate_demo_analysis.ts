import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseBuild } from "../packages/dmg/src/buildParser.js";
import { cycleDps, type Snapshot } from "../packages/dmg/src/damageModel.js";

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
const ss13CatalogPath = path.resolve(ROOT, "..", "poorchlight", "tli_dump", "data", "compendium-catalog-ss13.json");
if (fs.existsSync(ss13CatalogPath)) {
  const ss13Catalog = readJson(ss13CatalogPath);
  for (const entry of ss13Catalog.entries ?? []) {
    if (entry.domain === "skill" && entry.id && entry.label) skillNames[entry.id] = entry.label;
  }
}

const treeName = (id: string) =>
  talentBundle[`talent-tree/${id}/i18n/en`]?.tree?.name
  ?? id.replaceAll("_", " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase());

function equippedItems(loadout: any) {
  const inventory = new Map<string, any>(
    [...(loadout.gear?.inventory ?? []), ...(loadout.vorax?.inventory ?? [])]
      .map((item: any) => [item.id, item]),
  );
  return Object.entries<string | null>(loadout.gear?.equipped ?? {}).map(([slot, itemId]) => {
    const item = itemId ? inventory.get(itemId) : null;
    const lines = item
      ? [
          ...(item.legendaryMods ?? []).map((mod: any) => mod.description),
          ...(item.baseItem?.implicits ?? []).map((mod: any) => mod.description),
          ...(item.prefixes ?? []).filter(Boolean).map((mod: any) => mod.modifierDescription),
          ...(item.suffixes ?? []).filter(Boolean).map((mod: any) => mod.modifierDescription),
          ...(item.affixes ?? []).filter(Boolean).map((mod: any) => mod.modifierDescription),
          item.towerSequence?.description,
          item.baseAffix?.description,
          item.baseAffix2?.description,
          item.sweetDreamAffix?.description,
          item.corrosionImplicit?.description,
        ].filter(Boolean)
      : [];
    return {
      slot,
      name: item?.affixes?.find((affix: any) => affix?.legendaryName)?.legendaryName
        ?? item?.displayName
        ?? item?.legendaryName
        ?? item?.limbType
        ?? "Empty",
      rarity: item?.rarity ?? null,
      category: item?.gearCategory ?? null,
      lines: lines.slice(0, 12),
    };
  });
}

function skillRows(loadout: any) {
  const row = (skill: any, kind: "active" | "passive") => ({
    kind,
    name: skillNames[skill.skillGuid] ?? skill.skillGuid,
    guid: skill.skillGuid,
    level: skill.level ?? null,
    enabled: skill.enabled !== false,
    supports: [
      ...(skill.supports ?? []).filter(Boolean).map((support: any) => ({
        name: skillNames[support.supportGuid] ?? support.supportGuid,
        guid: support.supportGuid,
        type: support.type ?? "support",
        level: support.level ?? null,
      })),
      ...(skill.modifiers ?? []).filter(Boolean).map((guid: string) => ({
        name: skillNames[guid] ?? guid,
        guid,
        type: "modularization",
        level: null,
      })),
    ],
  });
  return [
    ...(loadout.skills?.activeSkills ?? []).filter(Boolean).map((skill: any) => row(skill, "active")),
    ...(loadout.skills?.passiveSkills ?? []).filter(Boolean).map((skill: any) => row(skill, "passive")),
  ];
}

function treeRows(loadout: any) {
  return (loadout.skillTree?.slots ?? []).map((slot: any) => ({
    id: slot.treeId,
    name: treeName(slot.treeId),
    points: Object.values<number>(slot.nodePoints ?? {}).reduce((sum, points) => sum + points, 0),
    notable12: slot.selectedNotable12 ?? null,
    notable24: slot.selectedNotable24 ?? null,
    hasPrism: Boolean(slot.equippedPrism?.prismId || slot.prismCoreTalentOverride),
  }));
}

function memoryRows(loadout: any) {
  const inventory = new Map<string, any>(
    (loadout.heroMemories?.inventory ?? []).map((memory: any) => [memory.id, memory]),
  );
  return Object.entries<string | null>(loadout.heroMemories?.equipped ?? {}).map(([slot, id]) => {
    const memory = id ? inventory.get(id) : null;
    return {
      slot,
      name: memory?.customName || memory?.memoryType || "Empty",
      type: memory?.memoryType ?? null,
      affixes: memory
        ? [memory.baseStat, ...(memory.fixedAffixes ?? []), ...(memory.randomAffixes ?? [])]
          .filter(Boolean).length
        : 0,
    };
  });
}

function slateRows(loadout: any) {
  const inventory = new Map<string, any>(
    (loadout.divinity?.inventory ?? []).map((slate: any) => [slate.id, slate]),
  );
  return (loadout.divinity?.placements ?? []).map((placement: any) => {
    const slate = inventory.get(placement.slateId);
    return {
      name: slate?.legendaryTemplate || slate?.type || "Divinity slate",
      god: placement.god ?? placement.godId ?? null,
      affixes: (slate?.affixes ?? []).length,
    };
  });
}

function pactRows(loadout: any) {
  return (loadout.pactspirits ?? []).map((pact: any, index: number) => ({
    name: pactBundle[pact.guid]?.name ?? pact.guid,
    level: pact.level ?? null,
    nodes: (pact.allocatedNodes ?? []).length,
    kismets: (loadout.kismets ?? []).filter((kismet: any) => kismet?.pactspritIndex === index).length,
  }));
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
  const loadouts = (build.loadouts?.loadouts ?? []).map((loadout: any, index: number) => {
    const [, report] = parseBuild(build, index);
    const skills = skillRows(loadout);
    return {
      id: loadout.id ?? `${id}-${index}`,
      index,
      name: loadout.name || `Loadout ${index + 1}`,
      hero: loadout.hero?.heroId ?? loadout.hero?.heroGuid ?? "Unknown hero",
      isCurrent: loadout.id === build.loadouts?.currentLoadoutId,
      // The current parser starts from Rehan/Spectral Slash defaults and applies Rehan
      // manual overrides. Keep the structural import and coverage evidence, but do not
      // publish its synthetic DPS as if it described these arbitrary SS13 loadouts.
      model: null,
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
      gear: equippedItems(loadout),
      skills,
      trees: treeRows(loadout),
      memories: memoryRows(loadout),
      slates: slateRows(loadout),
      pactspirits: pactRows(loadout),
      unmatched: topUnmatched(report),
      sourceNote: /summon|spirit magus|minion/i.test(
        skills.find((skill) => skill.kind === "active" && skill.enabled)?.name ?? "",
      )
        ? "Minion loadout imported. Minion base actions, quantity, AI uptime, and actor-scoped scaling are not modeled yet."
        : "Loadout imported. A guarded Bing compiler is required before this character can receive a DPS number.",
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
fs.writeFileSync(
  CATALOG_OUTPUT,
  `${JSON.stringify({ skillNames, treeNames, heroNames, pactNames }, null, 2)}\n`,
  "utf8",
);
console.log(`import catalog -> ${CATALOG_OUTPUT}`);
