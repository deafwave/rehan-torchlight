import { compileWuxiaSummonEvidence } from "@rehan/dmg/minionEvidence";
import type { AnalyzedLoadout, SummonSourceEvidence } from "./analysis-types";
import { rawSupportMetadata } from "./raw-support-metadata";

export interface SummonEvidenceDisplayBlocker {
  code: string;
  message: string;
  evidence?: string;
}

export type SummonEvidenceDisplayResult =
  | {
      status: "source-terms";
      summons: SummonSourceEvidence[];
    }
  | {
      status: "not-calculated";
      summons: [];
      blockers: SummonEvidenceDisplayBlocker[];
    };

export interface SummonTermChange {
  kind: "added" | "removed" | "changed";
  skillId: string;
  skillName: string;
  before: SummonSourceEvidence | null;
  after: SummonSourceEvidence | null;
}

function compact(value: number) {
  return Number.isInteger(value)
    ? String(Math.abs(value))
    : Math.abs(value).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function termDisplay(value: number, unit: "count" | "percent") {
  if (unit === "count") return compact(value);
  return `${value < 0 ? "−" : ""}${compact(value)}%`;
}

function evidenceDisplay(
  value: number,
  unit: "percent" | "count" | "seconds" | "meters" | "stacks",
) {
  const magnitude = compact(value);
  const signed = value < 0 ? `−${magnitude}` : magnitude;
  if (unit === "percent") return `${signed}%`;
  if (unit === "seconds") return `${signed}s`;
  if (unit === "meters") return `${signed}m`;
  if (unit === "stacks") return `${signed} stacks`;
  return signed;
}

export function summonEvidenceResultForCompendium(
  build: unknown,
  loadoutIndex: number,
): SummonEvidenceDisplayResult {
  const result = compileWuxiaSummonEvidence(build, loadoutIndex);
  if (result.status !== "source-terms") {
    return {
      status: "not-calculated",
      summons: [],
      blockers: result.blockers.map((blocker) => ({ ...blocker })),
    };
  }
  const summons: SummonSourceEvidence[] = result.summons.map((summon) => ({
    status: "source-terms",
    skillId: summon.skillId,
    skillName: summon.skillName,
    level: summon.level,
    actor: summon.actor,
    damageTags: summon.damageTags,
    baseline: {
      level: summon.baseline.level,
      baseLife: summon.baseline.baseLife,
      baseDamage: summon.baseline.baseDamage,
      baseArmor: summon.baseline.baseArmor,
      resistances: summon.baseline.resistances,
      baseCriticalStrikeRating: summon.baseline.baseCriticalStrikeRating,
      baseCriticalStrikeDamagePct: summon.baseline.baseCriticalStrikeDamagePct,
      confidence: summon.baseline.confidence,
      isTotalMinionEhp: false,
    },
    actions: summon.actions.map((action) => ({
      actionId: action.actionId,
      actionName: action.actionName,
      role: action.role,
      level: action.level,
      tags: action.tags,
      castTimeSeconds: action.castTimeSeconds,
      cooldownSeconds: action.cooldownSeconds,
      foundation: action.foundation,
      terms: action.terms.map((term) => ({
        ...term,
        display: evidenceDisplay(term.value, term.unit),
      })),
      knownDamage: {
        ...action.knownDamage,
        factors: action.knownDamage.factors.map((factor) => ({
          ...factor,
          applicability: factor.applicability.kind === "all-tags"
            ? {
                ...factor.applicability,
                tags: [...factor.applicability.tags],
              }
            : { ...factor.applicability },
          provenance: factor.provenance.map((source) => ({ ...source })),
        })),
        excluded: action.knownDamage.excluded.map((blocker) => ({
          ...blocker,
        })),
        provenance: action.knownDamage.provenance.map((source) => ({
          ...source,
        })),
      },
    })),
    supports: summon.supports.map((support) => {
      const raw = rawSupportMetadata(
        build,
        loadoutIndex,
        support.skillId,
        support.socketIndex,
      );
      return {
      status: support.status,
      isDps: false,
      actorId: support.actorId,
      actorName: support.actorName,
      skillId: support.skillId,
      skillName: support.skillName,
      socketIndex: support.socketIndex,
      socketId: support.socketId,
      supportId: support.supportId,
      supportName: support.supportName ?? raw?.supportName ?? null,
      supportType: support.status === "source-terms"
        ? support.supportType
        : raw?.supportType ?? undefined,
      level: support.status === "source-terms"
        ? support.level
        : raw?.level,
      tier: support.status === "source-terms"
        ? support.tier
        : raw?.tier,
      rank: support.status === "source-terms"
        ? support.rank
        : raw?.rank,
      rollValues: support.status === "source-terms"
        ? support.rollValues
        : raw?.rollValues,
      rawFingerprint: raw?.fingerprint,
      effects: support.status === "source-terms"
        ? support.effects.map((effect) => ({
            ...effect,
            display: evidenceDisplay(effect.value, effect.unit),
          }))
        : [],
      blockers: support.status === "unsupported"
        ? support.blockers.map((blocker) => blocker.message)
        : support.netDps.blockers.map((blocker) => blocker.message),
      blockerEvidence: support.status === "unsupported"
        ? support.blockers.map((blocker) => ({ ...blocker }))
        : support.netDps.blockers.map((blocker) => ({ ...blocker })),
    };
    }),
    heroTraits: result.heroTraits.map((trait) => ({
      traitId: trait.traitId,
      traitName: trait.traitName,
      unlockLevel: trait.unlockLevel,
      terms: trait.terms.map((term) => ({
        ...term,
        display: term.values
          .map((value) => evidenceDisplay(value, term.unit))
          .join(term.selector === "constant" ? "" : " / "),
      })),
      unresolved: trait.unresolved,
      provenance: trait.provenance,
      isDps: false,
      isTotalEhp: false,
    })),
    terms: summon.terms.map((term) => ({
      ...term,
      display: termDisplay(term.value, term.unit),
    })),
    minionDps: {
      status: "not-calculated",
      blockers: summon.minionDps.blockers.map((blocker) => blocker.message),
    },
    playerEhp: {
      status: "not-calculated",
      blockers: summon.playerEhp.blockers.map((blocker) => blocker.message),
    },
    isDps: false,
    isTotalEhp: false,
    provenance: summon.provenance,
  }));
  return { status: "source-terms", summons };
}

export function summonEvidenceForCompendium(
  build: unknown,
  loadoutIndex: number,
): SummonSourceEvidence[] {
  const result = summonEvidenceResultForCompendium(build, loadoutIndex);
  return result.status === "source-terms" ? result.summons : [];
}

function evidenceFingerprint(value: SummonSourceEvidence) {
  return JSON.stringify({
    level: value.level,
    actor: value.actor,
    damageTags: value.damageTags,
    baseline: value.baseline,
    actions: value.actions,
    supports: value.supports.map(({ blockerEvidence: _blockerEvidence, ...support }) =>
      support),
    terms: value.terms,
    minionDps: value.minionDps,
    playerEhp: value.playerEhp,
  });
}

export function compareSummonTerms(
  before: AnalyzedLoadout,
  after: AnalyzedLoadout,
): SummonTermChange[] {
  const left = new Map((before.summonEvidence ?? []).map((summon) => [summon.skillId, summon]));
  const right = new Map((after.summonEvidence ?? []).map((summon) => [summon.skillId, summon]));
  const changes: SummonTermChange[] = [];
  for (const id of new Set([...left.keys(), ...right.keys()])) {
    const a = left.get(id) ?? null;
    const b = right.get(id) ?? null;
    if (!a && b) {
      changes.push({
        kind: "added",
        skillId: id,
        skillName: b.skillName,
        before: null,
        after: b,
      });
    } else if (a && !b) {
      changes.push({
        kind: "removed",
        skillId: id,
        skillName: a.skillName,
        before: a,
        after: null,
      });
    } else if (a && b && evidenceFingerprint(a) !== evidenceFingerprint(b)) {
      changes.push({
        kind: "changed",
        skillId: id,
        skillName: b.skillName,
        before: a,
        after: b,
      });
    }
  }
  return changes;
}
