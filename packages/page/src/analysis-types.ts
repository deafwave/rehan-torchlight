import type { Snapshot } from "@rehan/dmg/damageModel";
import type { BingIntrinsicEnvelope } from "@rehan/dmg/bingIntrinsic";
import type { PlayerDefenseDisplayEvidenceResult } from "./player-defense-evidence";

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
  /** Stable source position such as `active:0` or `passive:2`. */
  slot: string;
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

export type MinionEvidenceUnit =
  | "percent"
  | "count"
  | "seconds"
  | "meters"
  | "stacks";

export interface MinionBaselineEvidence {
  level: number;
  baseLife: number;
  baseDamage: number;
  baseArmor: number;
  resistances: {
    fire: number;
    cold: number;
    lightning: number;
    erosion: number;
  };
  baseCriticalStrikeRating: number;
  baseCriticalStrikeDamagePct: number;
  confidence: "confirmed-partial" | "inferred-partial";
  isTotalMinionEhp: false;
}

export interface MinionActionTermEvidence {
  id: string;
  label: string;
  value: number;
  display: string;
  unit: MinionEvidenceUnit;
  application: string;
  condition: string | null;
  isDps: false;
}

export interface MinionActionSourceEvidence {
  actionId: string;
  actionName: string;
  role: "base" | "empower" | "enhanced" | "ultimate";
  level: number;
  tags: string[];
  castTimeSeconds: number;
  cooldownSeconds: number | null;
  foundation: {
    status: "calculated-partial" | "not-damaging";
    isDps: false;
    isTotalDamage: false;
    baseDamagePctPerContact: number | null;
    deterministicContacts: number | null;
    rawDamagePerContact: number | null;
    rawDamageAtDeterministicFullContact: number | null;
    scope: string;
    excluded: string[];
  };
  terms: MinionActionTermEvidence[];
}

export interface MinionSupportTermEvidence {
  id: string;
  label: string;
  value: number;
  display: string;
  unit: MinionEvidenceUnit;
  application: string;
  scope: string;
  condition: string | null;
  isNetDps: false;
}

export interface MinionSupportSourceEvidence {
  status: "source-terms" | "unsupported";
  isDps: false;
  supportId: string;
  supportName: string | null;
  supportType?: string;
  level?: number | null;
  tier?: number | null;
  rank?: number | null;
  rollValues?: number[];
  effects: MinionSupportTermEvidence[];
  blockers: string[];
  blockerEvidence?: GuardedEvidenceBlocker[];
}

export interface IrisTraitTermEvidence {
  id: string;
  label: string;
  values: number[];
  display: string;
  unit: MinionEvidenceUnit;
  scope: "spirit-magi" | "merged-spirit-magi" | "player";
  condition: string | null;
  selector: "constant" | "unresolved-trait-enhancement";
  application: string;
  isDps: false;
  isTotalEhp: false;
}

export interface IrisTraitSourceEvidence {
  traitId: string;
  traitName: string;
  unlockLevel: 1 | 45 | 60 | 75;
  terms: IrisTraitTermEvidence[];
  unresolved: string[];
  provenance: PartialMetricSource[];
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
  baseline: MinionBaselineEvidence;
  actions: MinionActionSourceEvidence[];
  supports: MinionSupportSourceEvidence[];
  heroTraits: IrisTraitSourceEvidence[];
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

export interface GuardedEvidenceBlocker {
  code: string;
  message: string;
  evidence?: string;
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
  summonEvidenceBlockers?: GuardedEvidenceBlocker[];
  bingIntrinsicEvidence?: BingIntrinsicEnvelope;
  bingIntrinsicBlockers?: GuardedEvidenceBlocker[];
  playerDefenseEvidence?: PlayerDefenseDisplayEvidenceResult;
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
  modelNotice: string;
  builds: AnalyzedBuild[];
}

export interface ImportCatalog {
  skillNames: Record<string, string>;
  treeNames: Record<string, string>;
  heroNames: Record<string, string>;
  pactNames: Record<string, string>;
  /** Defensive-resolution subset of poorchlight's SS13 schema-v2 catalog. */
  defenseCatalog?: unknown;
  /** SHA-256 of the exact canonical JSON object above. */
  defenseCatalogSha256?: string;
}
