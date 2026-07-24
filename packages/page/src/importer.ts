import type {
  AnalyzedBuild,
  AnalyzedLoadout,
  GearRow,
  ImportCatalog,
  MemoryRow,
  PactRow,
  SkillRow,
  SlateRow,
  TreeRow,
  UnmatchedRow,
  PartialMetric,
  SupportSocketEvidence,
  SummonSourceEvidence,
} from "./analysis-types";
import { partialMetricsForCompendium } from "./partial-metrics";
import { supportEvidenceForCompendium } from "./support-evidence";
import {
  createLocalCaptureHandoff,
  extractInGameBuildCode,
} from "./build-code-handoff";
import { summonEvidenceForCompendium } from "./summon-evidence";
import {
  formatModifierEvidence,
  normalizeBuildSnapshot,
  type ImportDiagnostic,
  type NormalizedBuild,
  type NormalizedIdentity,
  type NormalizedLoadout,
} from "./snapshot-adapter";

let importSequence = 0;

function catalogName(identity: NormalizedIdentity, catalog: ImportCatalog) {
  const id = identity.catalogId;
  if (id) {
    if (identity.domain === "skill" && catalog.skillNames[id]) return catalog.skillNames[id];
    if (identity.domain === "pactspirit" && catalog.pactNames[id]) return catalog.pactNames[id];
    if ((identity.domain === "talent-tree" || identity.domain === "tree")
        && catalog.treeNames[id]) return catalog.treeNames[id];
    if ((identity.domain === "hero-trait" || identity.domain === "hero")
        && catalog.heroNames[id]) return catalog.heroNames[id];
  }
  return identity.label
    ?? (id ? `Unknown ${identity.domain ?? "catalog record"} · ${id.slice(0, 8)}` : null)
    ?? (identity.nativeId
      ? `Unresolved ${identity.domain ?? "game record"} · ${identity.nativeId}`
      : "Unresolved record");
}

function gearRows(loadout: NormalizedLoadout): GearRow[] {
  return loadout.gear.map((item) => ({
    slot: item.slot,
    name: item.name,
    rarity: item.rarity,
    category: item.category ?? item.subtype ?? item.itemKind,
    lines: [
      ...item.modifiers.map(formatModifierEvidence),
      ...item.diagnostics.map((value) => `Capture note: ${value}`),
    ].slice(0, 12),
    fingerprint: item.fingerprint,
  }));
}

function skillRows(loadout: NormalizedLoadout, catalog: ImportCatalog): SkillRow[] {
  return loadout.skills.map((skill) => ({
    kind: skill.kind,
    guid: skill.identity.catalogId ?? skill.identity.nativeId ?? undefined,
    name: catalogName(skill.identity, catalog),
    level: skill.level,
    enabled: skill.enabled,
    supports: [
      ...skill.supports.map((support) => ({
        guid: support.identity.catalogId ?? support.identity.nativeId ?? undefined,
        name: catalogName(support.identity, catalog),
        type: support.type,
        level: support.level,
        tier: support.tier,
        rank: support.rank,
        rollValues: support.rolls,
        fingerprint: support.fingerprint,
      })),
      ...skill.modules.map((module) => ({
        guid: module.catalogId ?? module.nativeId ?? undefined,
        name: catalogName(module, catalog),
        type: "modularization",
        level: null,
      })),
    ],
    moduleSlots: skill.moduleSlots,
    fingerprint: skill.fingerprint,
  }));
}

function treeRows(loadout: NormalizedLoadout, catalog: ImportCatalog): TreeRow[] {
  return loadout.trees.map((tree) => ({
    id: tree.treeId,
    name: catalog.treeNames[tree.treeId]
      ?? tree.identity?.label
      ?? tree.treeId.replaceAll("_", " "),
    points: Object.values(tree.nodePoints).reduce((sum, points) => sum + points, 0),
    notable12: tree.selectedNotable12,
    notable24: tree.selectedNotable24,
    hasPrism: Boolean(tree.prismFingerprint),
    nodePoints: tree.nodePoints,
    prismId: tree.prismId,
    prismFingerprint: tree.prismFingerprint,
    fingerprint: tree.fingerprint,
  }));
}

function memoryRows(loadout: NormalizedLoadout): MemoryRow[] {
  return loadout.memories.map((memory) => ({
    slot: memory.slot,
    name: memory.name,
    type: memory.type,
    affixes: memory.modifiers.length,
    lines: memory.modifiers.map(formatModifierEvidence).slice(0, 12),
    fingerprint: memory.fingerprint,
  }));
}

function slateRows(loadout: NormalizedLoadout): SlateRow[] {
  return loadout.slates.map((slate) => ({
    name: slate.name,
    god: slate.god,
    affixes: slate.affixes.length,
    lines: slate.affixes.map(formatModifierEvidence).slice(0, 12),
    fingerprint: slate.fingerprint,
  }));
}

function pactRows(loadout: NormalizedLoadout, catalog: ImportCatalog): PactRow[] {
  return loadout.pactspirits.map((pact) => ({
    name: catalogName(pact.identity, catalog),
    level: pact.level,
    nodes: pact.allocatedNodes.length,
    kismets: pact.kismets.length,
    details: [
      ...pact.allocatedNodes.map((node) => `Allocated node · ${node}`),
      ...pact.kismets.map((kismet) => [
        kismet.identity?.label ?? kismet.identity?.catalogId ?? "Kismet",
        kismet.nodeId ? `node ${kismet.nodeId}` : "",
        kismet.rolls.length ? `rolls ${kismet.rolls.join(" / ")}` : "",
      ].filter(Boolean).join(" · ")),
    ].slice(0, 12),
    fingerprint: pact.fingerprint,
  }));
}

function diagnosticRows(diagnostics: ImportDiagnostic[]): UnmatchedRow[] {
  const unique = new Map<string, ImportDiagnostic>();
  for (const issue of diagnostics) {
    unique.set(`${issue.code}\u001f${issue.path}\u001f${issue.message}`, issue);
  }
  const grouped = new Map<string, UnmatchedRow>();
  for (const issue of unique.values()) {
    const key = `${issue.code}\u001f${issue.message}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      if (!existing.sources.includes(issue.path)) existing.sources.push(issue.path);
    } else {
      grouped.set(key, {
        text: issue.message,
        count: 1,
        sources: [issue.path],
      });
    }
  }
  return [...grouped.values()];
}

function analyzedLoadout(
  loadout: NormalizedLoadout,
  build: NormalizedBuild,
  catalog: ImportCatalog,
  partialMetrics: PartialMetric[],
  supportEvidence: SupportSocketEvidence[],
  summonEvidence: SummonSourceEvidence[],
): AnalyzedLoadout {
  const diagnostics = [
    ...build.diagnostics.filter((issue) =>
      !issue.path.startsWith("build.loadouts.loadouts[")
      || issue.path.startsWith(`build.loadouts.loadouts[${loadout.index}]`)),
    ...loadout.diagnostics,
  ];
  const portable = build.sourceKind === "portable-v3";
  return {
    id: loadout.id,
    index: loadout.index,
    name: loadout.name,
    hero: loadout.hero.identity
      ? loadout.hero.identity.label ?? catalogName(loadout.hero.identity, catalog)
      : loadout.hero.name,
    isCurrent: loadout.isCurrent,
    model: null,
    partialMetrics,
    supportEvidence,
    summonEvidence,
    snapshot: null,
    gear: gearRows(loadout),
    skills: skillRows(loadout, catalog),
    trees: treeRows(loadout, catalog),
    memories: memoryRows(loadout),
    slates: slateRows(loadout),
    pactspirits: pactRows(loadout, catalog),
    unmatched: diagnosticRows(diagnostics),
    sourceNote: portable
      ? "Portable-v3 evidence imported. DPS remains uncalculated until an actor/skill compiler consumes the normalized records."
      : "Compendium structure imported from this document. DPS remains uncalculated until an actor/skill compiler supports the loadout.",
  };
}

/**
 * Import through the canonical structural adapter.
 *
 * `knownBuilds` remains in the public signature for callers compiled against
 * the original importer, but uploaded bytes are never replaced with a demo
 * fixture merely because a name or one loadout id happens to match.
 */
export function importBuild(
  value: unknown,
  catalog: ImportCatalog,
  _knownBuilds: AnalyzedBuild[] = [],
  sourceName = "Imported JSON",
): AnalyzedBuild {
  const normalized = normalizeBuildSnapshot(value);
  const source = value as any;
  const compilerSource = normalized.sourceKind === "compendium"
    ? (source?.payload?.loadouts?.loadouts ? source.payload : source)
    : null;
  importSequence += 1;
  return {
    id: `imported-${normalized.sourceKind}-${normalized.fingerprint}-${Date.now().toString(36)}-${importSequence}`,
    name: normalized.name,
    patch: normalized.patch,
    source: sourceName,
    imported: true,
    loadouts: normalized.loadouts.map((loadout) =>
      analyzedLoadout(
        loadout,
        normalized,
        catalog,
        compilerSource ? partialMetricsForCompendium(compilerSource, loadout.index) : [],
        compilerSource ? supportEvidenceForCompendium(compilerSource, loadout.index) : [],
        compilerSource ? summonEvidenceForCompendium(compilerSource, loadout.index) : [],
      )),
  };
}

export function importBuildCode(raw: string): AnalyzedBuild {
  const code = extractInGameBuildCode(raw);
  if (!code) throw new Error("No supported build code or JSON was found.");
  return {
    id: `code-${Date.now()}`,
    name: "Unresolved in-game build code",
    patch: "Live game",
    source: code,
    imported: true,
    needsResolution: true,
    loadouts: [{
      id: `code-loadout-${Date.now()}`,
      index: 0,
      name: `${code.slice(0, 8)}…${code.slice(-6)}`,
      hero: "Open this build in-game, then capture it with tli_dump",
      isCurrent: true,
      model: null,
      snapshot: null,
      gear: [],
      skills: [],
      trees: [],
      memories: [],
      slates: [],
      pactspirits: [],
      unmatched: [],
      sourceNote: "A game build code is an opaque reference, not a character payload. Resolve it from the active in-game Build Reference with a local tli_dump capture, then import that JSON here.",
      resolutionHandoff: createLocalCaptureHandoff(code),
    }],
  };
}
