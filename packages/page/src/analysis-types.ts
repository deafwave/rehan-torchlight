import type { Snapshot } from "@rehan/dmg/damageModel";

export interface GearRow {
  slot: string;
  name: string;
  rarity: string | null;
  category: string | null;
  lines: string[];
  fingerprint?: string;
}

export interface SupportRow {
  name: string;
  guid?: string;
  type: string;
  level: number | null;
  tier?: number | null;
  rank?: number | null;
  rollValues?: Array<number | string>;
  fingerprint?: string;
}

export interface SkillRow {
  kind: "active" | "passive" | "support" | "unknown";
  name: string;
  guid?: string;
  level: number | null;
  enabled: boolean;
  supports: SupportRow[];
  moduleSlots?: Array<string | null>;
  fingerprint?: string;
}

export interface TreeRow {
  id: string;
  name: string;
  points: number;
  notable12: string | null;
  notable24: string | null;
  hasPrism: boolean;
  nodePoints?: Record<string, number>;
  prismId?: string | null;
  prismFingerprint?: string | null;
  fingerprint?: string;
}

export interface MemoryRow {
  slot: string;
  name: string;
  type: string | null;
  affixes: number;
  lines?: string[];
  fingerprint?: string;
}

export interface SlateRow {
  name: string;
  god: string | number | null;
  affixes: number;
  lines?: string[];
  fingerprint?: string;
}

export interface PactRow {
  name: string;
  level: number | null;
  nodes: number;
  kismets: number;
  details?: string[];
  fingerprint?: string;
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

export interface PartialMetricInput {
  label: string;
  value: number;
  display: string;
}

export interface PartialMetricSource {
  source: string;
  locator: string;
  confidence?: "source-data" | "confirmed-mechanic" | "inferred-mechanic";
}

export interface PartialMetric {
  id: string;
  label: string;
  value: number;
  display: string;
  unit: string;
  isDps: false;
  confidence: "confirmed-partial" | "inferred-partial";
  scope: string;
  inputs: PartialMetricInput[];
  provenance: PartialMetricSource[];
  excluded: string[];
}

export interface SupportEffectEvidence {
  id: string;
  label: string;
  value: number;
  display: string;
  application: string;
  scope: string;
  condition: string | null;
  isNetDps: false;
}

export interface SupportSocketEvidence {
  status: "source-terms" | "unsupported";
  supportId: string;
  supportName: string | null;
  level: number | null;
  tier: number | null;
  rank: number | null;
  effects: SupportEffectEvidence[];
  blockers: string[];
  isDps: false;
  provenance: PartialMetricSource[];
}

export interface SummonTermEvidence {
  id: string;
  label: string;
  value: number;
  display: string;
  unit: "count" | "percent";
  scope: "summoned-actor" | "player";
  condition: string | null;
  isDps: false;
  isTotalEhp: false;
}

export interface SummonSourceEvidence {
  status: "source-terms";
  skillId: string;
  skillName: string;
  level: number;
  actor: "minion";
  damageTags: string[];
  terms: SummonTermEvidence[];
  minionDps: {
    status: "not-calculated";
    blockers: string[];
  };
  playerEhp: {
    status: "not-calculated";
    blockers: string[];
  };
  isDps: false;
  isTotalEhp: false;
  provenance: PartialMetricSource[];
}

export interface LocalCaptureStep {
  title: string;
  detail: string;
}

/**
 * An in-game code is only an identifier. The browser cannot safely attach to
 * Torchlight: Infinite, so resolving it is an explicit local handoff.
 */
export interface LocalCaptureHandoff {
  kind: "tli-dump-local-capture";
  buildCode: string;
  resolver: "tli_dump";
  privacy: "local-export";
  steps: LocalCaptureStep[];
  acceptedDocuments: Array<"tli_dump portable-v3 JSON" | "TLI Compendium build JSON">;
}

export interface AnalyzedLoadout {
  id: string;
  index: number;
  name: string;
  hero: string;
  isCurrent: boolean;
  model: ModelSummary | null;
  coverage?: CoverageSummary;
  partialMetrics?: PartialMetric[];
  supportEvidence?: SupportSocketEvidence[];
  summonEvidence?: SummonSourceEvidence[];
  snapshot: Snapshot | null;
  gear: GearRow[];
  skills: SkillRow[];
  trees: TreeRow[];
  memories: MemoryRow[];
  slates: SlateRow[];
  pactspirits: PactRow[];
  unmatched: UnmatchedRow[];
  sourceNote?: string;
  resolutionHandoff?: LocalCaptureHandoff;
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
