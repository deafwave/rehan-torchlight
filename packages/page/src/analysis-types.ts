import type { Snapshot } from "@rehan/dmg/damageModel";

export interface GearRow {
  slot: string;
  name: string;
  rarity: string | null;
  category: string | null;
  lines: string[];
}

export interface SupportRow {
  name: string;
  guid?: string;
  type: string;
  level: number | null;
}

export interface SkillRow {
  kind: "active" | "passive";
  name: string;
  guid?: string;
  level: number | null;
  enabled: boolean;
  supports: SupportRow[];
}

export interface TreeRow {
  id: string;
  name: string;
  points: number;
  notable12: string | null;
  notable24: string | null;
  hasPrism: boolean;
}

export interface MemoryRow {
  slot: string;
  name: string;
  type: string | null;
  affixes: number;
}

export interface SlateRow {
  name: string;
  god: string | number | null;
  affixes: number;
}

export interface PactRow {
  name: string;
  level: number | null;
  nodes: number;
  kismets: number;
}

export interface UnmatchedRow {
  text: string;
  count: number;
  sources: string[];
}

export interface ModelSummary {
  dps: number;
  deteriorationDps: number;
  cycleTime: number;
  modeled: number;
  ignored: number;
  unmodeled: number;
  coverage: number;
  confidence: "partial" | "experimental";
}

export interface CoverageSummary {
  observed: number;
  classified: number;
  ignored: number;
  unsupported: number;
  classificationRate: number;
}

export interface AnalyzedLoadout {
  id: string;
  index: number;
  name: string;
  hero: string;
  isCurrent: boolean;
  model: ModelSummary | null;
  coverage?: CoverageSummary;
  snapshot: Snapshot | null;
  gear: GearRow[];
  skills: SkillRow[];
  trees: TreeRow[];
  memories: MemoryRow[];
  slates: SlateRow[];
  pactspirits: PactRow[];
  unmatched: UnmatchedRow[];
  sourceNote?: string;
}

export interface AnalyzedBuild {
  id: string;
  name: string;
  patch: string;
  source: string;
  loadouts: AnalyzedLoadout[];
  imported?: boolean;
  needsResolution?: boolean;
}

export interface DemoData {
  generatedAt: string;
  modelNotice: string;
  builds: AnalyzedBuild[];
}

export interface ImportCatalog {
  skillNames: Record<string, string>;
  treeNames: Record<string, string>;
  heroNames: Record<string, string>;
  pactNames: Record<string, string>;
}
