import { compileWuxiaSummonEvidence } from "@rehan/dmg/minionEvidence";
import type { AnalyzedLoadout, SummonSourceEvidence } from "./analysis-types";

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

export function summonEvidenceForCompendium(
  build: unknown,
  loadoutIndex: number,
): SummonSourceEvidence[] {
  const result = compileWuxiaSummonEvidence(build, loadoutIndex);
  if (result.status !== "source-terms") return [];
  return result.summons.map((summon) => ({
    status: "source-terms",
    skillId: summon.skillId,
    skillName: summon.skillName,
    level: summon.level,
    actor: summon.actor,
    damageTags: summon.damageTags,
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
}

function evidenceFingerprint(value: SummonSourceEvidence) {
  return JSON.stringify({
    level: value.level,
    actor: value.actor,
    damageTags: value.damageTags,
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
