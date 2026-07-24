import { compileSs13BingSupportEvidence } from "@rehan/dmg/supportEvidence";
import type {
  AnalyzedLoadout,
  GuardedEvidenceBlocker,
  SupportSocketEvidence,
} from "./analysis-types";
import {
  compareSupportInstances,
  type SupportInstanceChangeKind,
} from "./support-instance-comparison";
import { rawSupportMetadata } from "./raw-support-metadata";

export type SupportEvidenceDisplayResult =
  | {
      status: "source-terms";
      supports: SupportSocketEvidence[];
      blockers: [];
    }
  | {
      status: "not-calculated" | "not-applicable";
      supports: [];
      blockers: GuardedEvidenceBlocker[];
    };

export interface SupportTermChange {
  kind: Exclude<SupportInstanceChangeKind, "unchanged">;
  actorId: string;
  actorName: string;
  skillId: string;
  skillName: string;
  socketIndex: number;
  socketId: string;
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
  return supportEvidenceResultForCompendium(build, loadoutIndex).supports;
}

export function supportEvidenceResultForCompendium(
  build: unknown,
  loadoutIndex: number,
): SupportEvidenceDisplayResult {
  const result = compileSs13BingSupportEvidence(build, loadoutIndex);
  if (result.status !== "source-terms") {
    const notApplicable = result.blockers.length > 0
      && result.blockers.every((blocker) => blocker.code === "unsupported-actor");
    return {
      status: notApplicable ? "not-applicable" : "not-calculated",
      supports: [],
      blockers: notApplicable ? [] : result.blockers.map((blocker) => ({
        ...blocker,
      })),
    };
  }
  return {
    status: "source-terms",
    blockers: [],
    supports: result.supports.map((support) => {
    const raw = rawSupportMetadata(
      build,
      loadoutIndex,
      support.skillId,
      support.socketIndex,
    );
    if (support.status === "unsupported") {
      return {
        status: "unsupported",
        actorId: support.actorId,
        actorName: support.actorName,
        skillId: support.skillId,
        skillName: support.skillName,
        socketIndex: support.socketIndex,
        socketId: support.socketId,
        supportId: support.supportId,
        supportName: support.supportName ?? raw?.supportName ?? null,
        supportType: raw?.supportType ?? null,
        level: raw?.level ?? null,
        tier: raw?.tier ?? null,
        rank: raw?.rank ?? null,
        rollValues: raw?.rollValues ?? [],
        rawFingerprint: raw?.fingerprint,
        effects: [],
        blockers: support.blockers.map((blocker) => blocker.message),
        blockerEvidence: support.blockers.map((blocker) => ({ ...blocker })),
        isDps: false,
        provenance: [],
      };
    }
    return {
      status: "source-terms",
      actorId: support.actorId,
      actorName: support.actorName,
      skillId: support.skillId,
      skillName: support.skillName,
      socketIndex: support.socketIndex,
      socketId: support.socketId,
      supportId: support.supportId,
      supportName: support.supportName,
      supportType: support.supportType,
      level: support.level,
      tier: support.tier,
      rank: support.rank,
      rollValues: raw?.rollValues ?? support.rollValues,
      rawFingerprint: raw?.fingerprint,
      effects: support.effects.map((effect) => ({
        ...effect,
        display: signedPercent(effect.value),
      })),
      blockers: support.netDps.blockers.map((blocker) => blocker.message),
      isDps: false,
      provenance: support.provenance,
    };
    }),
  };
}

function evidenceFingerprint(value: SupportSocketEvidence) {
  return JSON.stringify({
    status: value.status,
    supportId: value.supportId,
    supportName: value.supportName,
    level: value.level,
    tier: value.tier,
    rank: value.rank,
    supportType: value.supportType,
    rollValues: value.rollValues,
    rawFingerprint: value.rawFingerprint,
    effects: value.effects,
    blockers: value.blockers,
  });
}

export function supportSocketIdentity(
  value: Pick<SupportSocketEvidence, "actorId" | "skillId" | "socketId">,
) {
  return `${value.actorId}\u0000${value.skillId}\u0000${value.socketId}`;
}

export function compareSupportTerms(
  before: AnalyzedLoadout,
  after: AnalyzedLoadout,
): SupportTermChange[] {
  if (before.supportEvidenceStatus !== "source-terms"
      || after.supportEvidenceStatus !== "source-terms") {
    return [];
  }
  return compareSupportInstances(
    before.supportEvidence ?? [],
    after.supportEvidence ?? [],
    evidenceFingerprint,
  ).flatMap((change) => {
    if (change.kind === "unchanged") return [];
    const socket = change.after ?? change.before;
    if (!socket) return [];
    return [{
      kind: change.kind,
      actorId: socket.actorId,
      actorName: socket.actorName,
      skillId: socket.skillId,
      skillName: socket.skillName,
      socketIndex: socket.socketIndex,
      socketId: socket.socketId,
      supportId:
        change.after?.supportId ?? change.before?.supportId ?? "",
      supportName:
        change.after?.supportName
        ?? change.before?.supportName
        ?? "Unknown support",
      before: change.before,
      after: change.after,
    }];
  });
}
