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
} from "./analysis-types";

const asArray = <T = any>(value: unknown): T[] => Array.isArray(value) ? value : [];
const asObject = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

const friendlyId = (value: unknown, fallback: string) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
};

function gearRows(loadout: any): GearRow[] {
  const inventory = new Map<string, any>(
    [...asArray(loadout.gear?.inventory), ...asArray(loadout.vorax?.inventory)]
      .map((item) => [item.id, item]),
  );
  return Object.entries<string | null>(asObject(loadout.gear?.equipped)).map(([slot, id]) => {
    const item = id ? inventory.get(id) : null;
    return {
      slot,
      name: asArray(item?.affixes).find((affix) => affix?.legendaryName)?.legendaryName
        ?? item?.displayName
        ?? item?.legendaryName
        ?? item?.limbType
        ?? "Empty",
      rarity: item?.rarity ?? null,
      category: item?.gearCategory ?? null,
      lines: item
        ? [
            ...asArray(item.legendaryMods).map((mod) => mod.description),
            ...asArray(item.baseItem?.implicits).map((mod) => mod.description),
            ...asArray(item.prefixes).filter(Boolean).map((mod) => mod.modifierDescription),
            ...asArray(item.suffixes).filter(Boolean).map((mod) => mod.modifierDescription),
            ...asArray(item.affixes).filter(Boolean).map((mod) => mod.modifierDescription),
          ].filter(Boolean).slice(0, 12)
        : [],
    };
  });
}

function skillRows(loadout: any, catalog: ImportCatalog): SkillRow[] {
  const row = (skill: any, kind: "active" | "passive"): SkillRow => ({
    kind,
    guid: skill.skillGuid,
    name: catalog.skillNames[skill.skillGuid] ?? `Unknown skill · ${String(skill.skillGuid).slice(0, 8)}`,
    level: Number.isFinite(skill.level) ? skill.level : null,
    enabled: skill.enabled !== false,
    supports: [
      ...asArray(skill.supports).filter(Boolean).map((support) => ({
        guid: support.supportGuid,
        name: catalog.skillNames[support.supportGuid]
          ?? `Unknown support · ${String(support.supportGuid).slice(0, 8)}`,
        type: support.type ?? "support",
        level: Number.isFinite(support.level) ? support.level : null,
      })),
      ...asArray<string>(skill.modifiers).filter(Boolean).map((guid) => ({
        guid,
        name: catalog.skillNames[guid] ?? `Unknown module · ${String(guid).slice(0, 8)}`,
        type: "modularization",
        level: null,
      })),
    ],
  });
  return [
    ...asArray(loadout.skills?.activeSkills).filter(Boolean).map((skill) => row(skill, "active")),
    ...asArray(loadout.skills?.passiveSkills).filter(Boolean).map((skill) => row(skill, "passive")),
  ];
}

function treeRows(loadout: any, catalog: ImportCatalog): TreeRow[] {
  return asArray(loadout.skillTree?.slots).map((slot) => ({
    id: friendlyId(slot.treeId, "unknown-tree"),
    name: catalog.treeNames[slot.treeId]
      ?? friendlyId(slot.treeId, "Unknown tree").replaceAll("_", " "),
    points: Object.values<number>(asObject(slot.nodePoints)).reduce((sum, points) => sum + points, 0),
    notable12: slot.selectedNotable12 ?? null,
    notable24: slot.selectedNotable24 ?? null,
    hasPrism: Boolean(slot.equippedPrism?.prismId || slot.prismCoreTalentOverride),
  }));
}

function memoryRows(loadout: any): MemoryRow[] {
  const inventory = new Map<string, any>(
    asArray(loadout.heroMemories?.inventory).map((memory) => [memory.id, memory]),
  );
  return Object.entries<string | null>(asObject(loadout.heroMemories?.equipped)).map(([slot, id]) => {
    const memory = id ? inventory.get(id) : null;
    return {
      slot,
      name: memory?.customName || memory?.memoryType || "Empty",
      type: memory?.memoryType ?? null,
      affixes: memory
        ? [memory.baseStat, ...asArray(memory.fixedAffixes), ...asArray(memory.randomAffixes)]
          .filter(Boolean).length
        : 0,
    };
  });
}

function slateRows(loadout: any): SlateRow[] {
  const inventory = new Map<string, any>(
    asArray(loadout.divinity?.inventory).map((slate) => [slate.id, slate]),
  );
  return asArray(loadout.divinity?.placements).map((placement) => {
    const slate = inventory.get(placement.slateId);
    return {
      name: slate?.legendaryTemplate || slate?.type || "Divinity slate",
      god: placement.god ?? placement.godId ?? null,
      affixes: asArray(slate?.affixes).length,
    };
  });
}

function pactRows(loadout: any, catalog: ImportCatalog): PactRow[] {
  return asArray(loadout.pactspirits).map((pact, index) => ({
    name: catalog.pactNames[pact.guid] ?? friendlyId(pact.guid, "Unknown pactspirit"),
    level: Number.isFinite(pact.level) ? pact.level : null,
    nodes: asArray(pact.allocatedNodes).length,
    kismets: asArray(loadout.kismets).filter((kismet) => kismet?.pactspritIndex === index).length,
  }));
}

function compendiumLoadout(
  loadout: any,
  index: number,
  currentId: string | null,
  catalog: ImportCatalog,
): AnalyzedLoadout {
  const heroGuid = loadout.hero?.heroGuid;
  return {
    id: friendlyId(loadout.id, `imported-${index}`),
    index,
    name: friendlyId(loadout.name, `Loadout ${index + 1}`),
    hero: friendlyId(loadout.hero?.heroId, catalog.heroNames[heroGuid] ?? heroGuid ?? "Unknown hero"),
    isCurrent: loadout.id === currentId,
    model: null,
    snapshot: null,
    gear: gearRows(loadout),
    skills: skillRows(loadout, catalog),
    trees: treeRows(loadout, catalog),
    memories: memoryRows(loadout),
    slates: slateRows(loadout),
    pactspirits: pactRows(loadout, catalog),
    unmatched: [],
    sourceNote: "The loadout imported successfully. Calculation is waiting for the season parser.",
  };
}

function portableSectionItems(section: unknown) {
  return asArray(asObject(section).items);
}

function portableSectionRecords(section: unknown) {
  return asArray(asObject(section).records);
}

function identityLabel(value: unknown, fallback: string) {
  const identity = asObject(value);
  return friendlyId(identity.label, friendlyId(identity.compendiumId, fallback));
}

function portableLoadout(value: any, catalog: ImportCatalog): AnalyzedLoadout {
  const source = asObject(value.proBuild?.loadout);
  const gear: GearRow[] = portableSectionItems(source.gear).map((item, index) => ({
    slot: String(item.location?.equipSlot ?? item.location?.slot ?? index + 1),
    name: identityLabel(item.identity?.special ?? item.identity?.base, `Imported gear ${index + 1}`),
    rarity: item.rarity == null ? null : String(item.rarity),
    category: item.identity?.base?.domain ?? null,
    lines: asArray(item.diagnostics).slice(0, 8),
  }));
  const skills: SkillRow[] = portableSectionItems(source.skills).map((item, index) => {
    const guid = item.identity?.special?.compendiumId ?? item.identity?.base?.compendiumId;
    return {
      kind: /passive/i.test(item.identity?.special?.metadata?.skillType ?? "") ? "passive" : "active",
      guid,
      name: identityLabel(item.identity?.special ?? item.identity?.base, `Imported skill ${index + 1}`),
      level: Number.isFinite(item.itemLevel) ? item.itemLevel : null,
      enabled: true,
      supports: [],
    };
  });
  const trees: TreeRow[] = portableSectionRecords(source.skillTree).map((record, index) => {
    const treeId = record.identity?.metadata?.treeId ?? record.identity?.compendiumId ?? `tree-${index + 1}`;
    return {
      id: treeId,
      name: catalog.treeNames[treeId] ?? identityLabel(record.identity, `Talent tree ${index + 1}`),
      points: Object.values<number>(asObject(record.data?.nodePoints)).reduce((sum, points) => sum + points, 0),
      notable12: record.data?.selectedNotable12 ?? null,
      notable24: record.data?.selectedNotable24 ?? null,
      hasPrism: false,
    };
  });
  const memories: MemoryRow[] = portableSectionItems(source.heroMemories).map((item, index) => ({
    slot: String(item.location?.equipSlot ?? index + 1),
    name: identityLabel(item.identity?.special ?? item.identity?.base, `Hero memory ${index + 1}`),
    type: item.identity?.special?.metadata?.memoryType ?? null,
    affixes: Object.values(asObject(item.affixes)).filter(Boolean).length,
  }));
  const slates: SlateRow[] = portableSectionRecords(source.divinity).map((record, index) => ({
    name: identityLabel(record.identity, `Divinity slate ${index + 1}`),
    god: record.identity?.metadata?.divinityGod ?? null,
    affixes: asArray(record.data?.affixes).length,
  }));
  const pactspirits: PactRow[] = portableSectionRecords(source.pactspirits).map((record, index) => ({
    name: identityLabel(record.identity, `Pactspirit ${index + 1}`),
    level: Number.isFinite(record.data?.level) ? record.data.level : null,
    nodes: asArray(record.data?.allocatedNodes).length,
    kismets: 0,
  }));
  const issueRows = asArray(value.mappingIssues).map((issue) => ({
    text: friendlyId(issue.message, friendlyId(issue.kind, "Unresolved portable record")),
    count: 1,
    sources: [friendlyId(issue.sourcePath, friendlyId(issue.path, "portable snapshot"))],
  }));
  return {
    id: friendlyId(value.proBuild?.id, "portable-loadout"),
    index: 0,
    name: friendlyId(value.proBuild?.name, "Live tli_dump snapshot"),
    hero: identityLabel(source.hero?.identity, friendlyId(source.hero?.sourceName, "Unknown hero")),
    isCurrent: true,
    model: null,
    snapshot: null,
    gear,
    skills,
    trees,
    memories,
    slates,
    pactspirits,
    unmatched: issueRows,
    sourceNote: "Portable snapshot imported. Catalog-backed calculation is not connected in the browser yet.",
  };
}

export function importBuild(
  value: unknown,
  catalog: ImportCatalog,
  knownBuilds: AnalyzedBuild[],
  sourceName = "Imported JSON",
): AnalyzedBuild {
  const object = asObject(value);
  if (asObject(object.portable).schemaVersion === 3) {
    return importBuild(object.portable, catalog, knownBuilds, sourceName);
  }
  if (object.loadouts?.loadouts && Array.isArray(object.loadouts.loadouts)) {
    const known = knownBuilds.find((build) =>
      build.name === object.name
      || build.loadouts.some((loadout) => object.loadouts.loadouts.some((item: any) => item.id === loadout.id)),
    );
    if (known) {
      return {
        ...structuredClone(known),
        id: `imported-${known.id}-${Date.now()}`,
        source: sourceName,
        imported: true,
      };
    }
    const currentId = typeof object.loadouts.currentLoadoutId === "string"
      ? object.loadouts.currentLoadoutId
      : null;
    return {
      id: `imported-${Date.now()}`,
      name: friendlyId(object.name, sourceName.replace(/\.json$/i, "")),
      patch: friendlyId(object.patch, "Unknown patch"),
      source: sourceName,
      imported: true,
      loadouts: object.loadouts.loadouts.map((loadout: any, index: number) =>
        compendiumLoadout(loadout, index, currentId, catalog)),
    };
  }
  if (object.schemaVersion === 3 && object.proBuild?.loadout) {
    return {
      id: `portable-${Date.now()}`,
      name: friendlyId(object.proBuild.name, "Live tli_dump snapshot"),
      patch: friendlyId(object.source?.catalogPatch, "Unknown patch"),
      source: sourceName,
      imported: true,
      loadouts: [portableLoadout(object, catalog)],
    };
  }
  throw new Error("This JSON is not a TLI Compendium build or a tli_dump portable snapshot.");
}

export function importBuildCode(raw: string): AnalyzedBuild {
  const value = raw.trim();
  const match = value.match(/[A-Za-z0-9+/]{20,}={0,2}/);
  if (!match) throw new Error("No supported build code or JSON was found.");
  const code = match[0];
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
      sourceNote: "A game build code identifies a remote character; it does not contain the loadout. tli_dump must resolve it while the build is open in-game.",
    }],
  };
}
