import type { AnalyzedLoadout } from "./analysis-types";

export type GuardedEvidenceReadiness = "none" | "ready" | "blocked" | "partial";

type GuardedEvidenceFields = Pick<
  AnalyzedLoadout,
  | "partialMetrics"
  | "supportEvidenceStatus"
  | "supportEvidence"
  | "supportEvidenceBlockers"
  | "summonEvidence"
  | "summonEvidenceBlockers"
  | "bingIntrinsicEvidence"
  | "bingIntrinsicBlockers"
  | "bingFactorLedger"
  | "playerDefenseEvidence"
>;

/**
 * Distinguishes source terms that actually compiled from guarded checks that
 * only produced blockers. Downstream DPS/EHP blockers do not make an otherwise
 * valid source slice "blocked"; this state describes the source-evidence pass.
 */
export function guardedEvidenceReadiness(
  loadout: Partial<GuardedEvidenceFields>,
): GuardedEvidenceReadiness {
  const supportEvidence = loadout.supportEvidence ?? [];
  const summonEvidence = loadout.summonEvidence ?? [];
  const bingEvidence = loadout.bingIntrinsicEvidence;
  const bingFactors = loadout.bingFactorLedger;
  const defenseEvidence = loadout.playerDefenseEvidence;
  const ready = Boolean(
    loadout.partialMetrics?.length
    || supportEvidence.some((support) => support.status === "source-terms")
    || summonEvidence.length
    || bingEvidence
    || bingFactors?.status === "calculated-partial"
    || defenseEvidence?.status === "source-terms"
  );
  const blocked = Boolean(
    supportEvidence.some((support) => support.status === "unsupported")
    || loadout.supportEvidenceBlockers?.length
    || summonEvidence.some((summon) =>
      summon.supports.some((support) => support.status === "unsupported"))
    || loadout.summonEvidenceBlockers?.length
    || loadout.bingIntrinsicBlockers?.length
    || bingFactors?.status === "not-calculated"
    || (bingFactors?.status === "calculated-partial"
      && bingFactors.factorRows.some((factor) =>
        factor.status === "not-calculated"))
    || (bingEvidence && bingEvidence.topology.status !== "calculated-partial")
    || (defenseEvidence?.status === "source-terms"
      && defenseEvidence.coverage.unparsedDefensiveLines > 0)
    || defenseEvidence?.status === "not-calculated"
  );
  if (ready && blocked) return "partial";
  if (ready) return "ready";
  if (blocked) return "blocked";
  return "none";
}
