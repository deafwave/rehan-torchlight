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
  GuardedEvidenceBlocker,
} from "./analysis-types";
import type { PlayerDefenseDisplayEvidenceResult } from "./player-defense-evidence";
import type { BingIntrinsicEnvelope } from "@rehan/dmg/bingIntrinsic";
import { partialMetricsForCompendium } from "./partial-metrics";
import { supportEvidenceForCompendium } from "./support-evidence";
import {
  createLocalCaptureHandoff,
  extractInGameBuildCode,
} from "./build-code-handoff";
import { summonEvidenceResultForCompendium } from "./summon-evidence";
import { playerDefenseEvidenceForCompendium } from "./player-defense-evidence";
import { bingIntrinsicEvidenceResultForCompendium } from "./bing-intrinsic-evidence";
import {
  resolveCompilerSource,
  type PortableCompilerConversion,
} from "./portable-compiler-source";
import { guardedEvidenceReadiness } from "./evidence-state";
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
    slot: skill.slot,
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
  summonEvidenceBlockers: GuardedEvidenceBlocker[],
  bingIntrinsicEvidence?: BingIntrinsicEnvelope,
  bingIntrinsicBlockers: GuardedEvidenceBlocker[] = [],
  playerDefenseEvidence?: PlayerDefenseDisplayEvidenceResult,
  portableConversion?: PortableCompilerConversion | null,
): AnalyzedLoadout {
  const diagnostics = [
    ...build.diagnostics.filter((issue) =>
      !issue.path.startsWith("build.loadouts.loadouts[")
      || issue.path.startsWith(`build.loadouts.loadouts[${loadout.index}]`)),
    ...loadout.diagnostics,
  ];
  const portable = build.sourceKind === "portable-v3"
    || build.sourceKind === "portable-converter";
  const converterWrapper = build.sourceKind === "portable-converter";
  const conversionSource = converterWrapper
    ? "tli_dump converter-result wrapper"
    : "portable-v3 → Compendium conversion";
  const conversionRows: UnmatchedRow[] = portableConversion
    ? [
        ...portableConversion.omitted.map((entry) => ({
          text: `tli_dump omitted ${entry.section}: ${entry.reason}`,
          count: entry.observedCount,
          sources: [conversionSource],
        })),
        ...(portableConversion.error
          ? [{
              text: `Portable converter validation/report failed: ${portableConversion.error}`,
              count: 1,
              sources: [conversionSource],
            }]
          : []),
        ...(portableConversion.compilerAccess.reason !== "conversion-failed"
          ? [{
              text: `Guarded formula access blocked: ${portableConversion.compilerAccess.message}`,
              count: 1,
              sources: ["portable-v3 trust boundary"],
            }]
          : []),
      ]
    : [];
  const guardedReadiness = guardedEvidenceReadiness({
    partialMetrics,
    supportEvidence,
    summonEvidence,
    summonEvidenceBlockers,
    bingIntrinsicEvidence,
    bingIntrinsicBlockers,
    playerDefenseEvidence,
  });
  const guardedEvidenceAvailable =
    guardedReadiness === "ready" || guardedReadiness === "partial";
  const guardedEvidenceBlocked =
    guardedReadiness === "blocked" || guardedReadiness === "partial";
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
    summonEvidenceBlockers,
    bingIntrinsicEvidence,
    bingIntrinsicBlockers,
    playerDefenseEvidence,
    snapshot: null,
    gear: gearRows(loadout),
    skills: skillRows(loadout, catalog),
    trees: treeRows(loadout, catalog),
    memories: memoryRows(loadout),
    slates: slateRows(loadout),
    pactspirits: pactRows(loadout, catalog),
    unmatched: [...diagnosticRows(diagnostics), ...conversionRows],
    sourceNote: portable
      ? portableConversion?.status === "failed"
        ? `${converterWrapper ? "tli_dump converter-result payload" : "Portable-v3 structure"} imported structurally, but converter validation/report failed. Guarded formula evidence remains unavailable; see Unmatched data.`
        : portableConversion
          ? converterWrapper
            ? `A complete tli_dump converter-result wrapper was imported structurally and its report was retained (${portableConversion.status}; ${portableConversion.importedCount} structurally materialized records). Its payload is not used as a formula source until the originating portable catalog metadata can be independently attested.`
            : portableConversion.compilerAccess.reason === "incompatible-source-state"
            ? `Portable-v3 structure imported and the tli_dump converter report was retained (${portableConversion.status}; ${portableConversion.importedCount} structurally materialized records). Guarded formula evidence is blocked because the capture was not both connected and layout-compatible.`
            : `Portable-v3 structure imported and the tli_dump converter report was retained (${portableConversion.status}; ${portableConversion.importedCount} structurally materialized records). Converted records are not used as formula inputs until their embedded catalog metadata can be independently attested against the pinned SS13 catalog.`
          : "Portable-v3 evidence imported. Formula evidence remains unavailable because no guarded Compendium conversion was produced."
      : guardedEvidenceAvailable
        ? `Compendium structure imported. Supported guarded source terms are shown below${guardedEvidenceBlocked ? "; blocked guarded layers remain explicit" : ""}. Unresolved runtime state and modifier pools keep total DPS/EHP uncalculated.`
        : guardedEvidenceBlocked
          ? "Compendium structure imported. Guarded formula checks ran but are blocked; blocker evidence is shown instead of source terms or invented DPS/EHP."
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
  const compilerResolution = resolveCompilerSource(value, normalized);
  const compilerSource = compilerResolution.source;
  importSequence += 1;
  return {
    id: `imported-${normalized.sourceKind}-${normalized.fingerprint}-${Date.now().toString(36)}-${importSequence}`,
    name: normalized.name,
    patch: normalized.patch,
    source: sourceName,
    imported: true,
    loadouts: normalized.loadouts.map((loadout) => {
      const summonResult = compilerSource
        ? summonEvidenceResultForCompendium(compilerSource, loadout.index)
        : null;
      const bingResult = compilerSource
        ? bingIntrinsicEvidenceResultForCompendium(compilerSource, loadout.index)
        : null;
      const summonBlockers = summonResult?.status === "not-calculated"
        ? summonResult.blockers.filter((blocker) => blocker.code !== "unsupported-actor")
        : [];
      const bingBlockers = bingResult?.status === "not-calculated"
        ? bingResult.blockers.filter((blocker) => blocker.code !== "unsupported-actor")
        : [];
      return analyzedLoadout(
        loadout,
        normalized,
        catalog,
        compilerSource ? partialMetricsForCompendium(compilerSource, loadout.index) : [],
        compilerSource ? supportEvidenceForCompendium(compilerSource, loadout.index) : [],
        summonResult?.status === "source-terms" ? summonResult.summons : [],
        summonBlockers,
        bingResult?.status === "calculated-partial" ? bingResult : undefined,
        bingBlockers,
        compilerSource
          ? playerDefenseEvidenceForCompendium(compilerSource, loadout.index, {
              catalog: catalog.defenseCatalog,
              catalogSha256: catalog.defenseCatalogSha256,
            })
          : undefined,
        compilerResolution.portableConversion,
      );
    }),
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
