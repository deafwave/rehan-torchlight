import { compileSs13BingSupportEvidence } from "@rehan/dmg/supportEvidence";
import type { AnalyzedLoadout, SupportSocketEvidence } from "./analysis-types";

export interface SupportTermChange {
  kind: "added" | "removed" | "changed";
  supportId: string;
  supportName: string;
  before: SupportSocketEvidence | null;
  after: SupportSocketEvidence | null;
}

function signedPercent(value: number) {
  const magnitude = Number.isInteger(value) ? String(Math.abs(value)) : Math.abs(value).toFixed(1);
  return `${value < 0 ? "−" : "+"}${magnitude}%`;
}

export function supportEvidenceForCompendium(
  build: unknown,
  loadoutIndex: number,
): SupportSocketEvidence[] {
  const result = compileSs13BingSupportEvidence(build, loadoutIndex);
  if (result.status !== "source-terms") return [];
  return result.supports.map((support) => {
    if (support.status === "unsupported") {
      return {
        status: "unsupported",
        supportId: support.supportId,
        supportName: support.supportName,
        level: null,
        tier: null,
        rank: null,
        effects: [],
        blockers: support.blockers.map((blocker) => blocker.message),
        isDps: false,
        provenance: [],
      };
    }
    return {
      status: "source-terms",
      supportId: support.supportId,
      supportName: support.supportName,
      level: support.level,
      tier: support.tier,
      rank: support.rank,
      effects: support.effects.map((effect) => ({
        ...effect,
        display: signedPercent(effect.value),
      })),
      blockers: support.netDps.blockers.map((blocker) => blocker.message),
      isDps: false,
      provenance: support.provenance,
    };
  });
}

function evidenceFingerprint(value: SupportSocketEvidence) {
  return JSON.stringify({
    status: value.status,
    level: value.level,
    tier: value.tier,
    rank: value.rank,
    effects: value.effects,
    blockers: value.blockers,
  });
}

export function compareSupportTerms(
  before: AnalyzedLoadout,
  after: AnalyzedLoadout,
): SupportTermChange[] {
  const left = new Map((before.supportEvidence ?? []).map((support) => [support.supportId, support]));
  const right = new Map((after.supportEvidence ?? []).map((support) => [support.supportId, support]));
  const changes: SupportTermChange[] = [];
  for (const id of new Set([...left.keys(), ...right.keys()])) {
    const a = left.get(id) ?? null;
    const b = right.get(id) ?? null;
    if (!a && b) {
      changes.push({
        kind: "added",
        supportId: id,
        supportName: b.supportName ?? "Unknown support",
        before: null,
        after: b,
      });
    } else if (a && !b) {
      changes.push({
        kind: "removed",
        supportId: id,
        supportName: a.supportName ?? "Unknown support",
        before: a,
        after: null,
      });
    } else if (a && b && evidenceFingerprint(a) !== evidenceFingerprint(b)) {
      changes.push({
        kind: "changed",
        supportId: id,
        supportName: b.supportName ?? a.supportName ?? "Unknown support",
        before: a,
        after: b,
      });
    }
  }
  return changes;
}
