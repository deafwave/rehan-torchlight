/*
 * Source-complete intrinsic summon evidence for the supplied Iris progression.
 *
 * Compendium's summon-skill records describe the act of summoning and the
 * player-facing Origin defensive line.  They do not describe the summoned
 * actor's attacks, cooldowns, AI, Growth scaling, or merged-state rotation.
 * This module therefore emits formula inputs only and never a minion DPS/EHP
 * proxy.
 */

import {
  IRIS_VIGILANT_BREEZE_ID,
  SUMMON_EROSION_MAGUS_ID,
  SUMMON_ROCK_MAGUS_ID,
  type CalculationBlocker,
  type FormulaProvenance,
} from "./guardedCompiler.js";
import {
  SS13_SKILL_TEXT_SOURCE,
  SS13_SUPPORT_FORMULA_SOURCE,
} from "./supportEvidence.js";

export interface SummonFormulaTerm {
  id: string;
  label: string;
  value: number;
  unit: "count" | "percent";
  scope: "summoned-actor" | "player";
  condition: string | null;
  isDps: false;
  isTotalEhp: false;
}

export interface SummonSkillEvidence {
  status: "source-terms";
  isDps: false;
  isTotalEhp: false;
  skillId: string;
  skillName: string;
  level: number;
  actor: "minion";
  damageTags: string[];
  terms: SummonFormulaTerm[];
  provenance: FormulaProvenance[];
  minionDps: {
    status: "not-calculated";
    blockers: CalculationBlocker[];
  };
  playerEhp: {
    status: "not-calculated";
    blockers: CalculationBlocker[];
  };
}

export interface WuxiaSummonEvidence {
  status: "source-terms";
  isDps: false;
  isTotalEhp: false;
  patch: "SS13";
  heroId: typeof IRIS_VIGILANT_BREEZE_ID;
  loadoutIndex: number;
  loadoutName: string;
  summons: SummonSkillEvidence[];
  provenance: FormulaProvenance[];
  warning: string;
}

export interface UnavailableWuxiaSummonEvidence {
  status: "not-calculated";
  isDps: false;
  isTotalEhp: false;
  blockers: CalculationBlocker[];
}

export type WuxiaSummonEvidenceResult =
  | WuxiaSummonEvidence
  | UnavailableWuxiaSummonEvidence;

export interface SummonEvidenceChange {
  kind: "added" | "removed" | "changed";
  skillId: string;
  skillName: string;
  before: SummonSkillEvidence | null;
  after: SummonSkillEvidence | null;
}

export interface WuxiaSummonEvidenceComparison {
  status: "source-terms";
  isDps: false;
  isTotalEhp: false;
  beforeIndex: number;
  afterIndex: number;
  changes: SummonEvidenceChange[];
  provenance: FormulaProvenance[];
  warning: string;
}

export type WuxiaSummonEvidenceComparisonResult =
  | WuxiaSummonEvidenceComparison
  | UnavailableWuxiaSummonEvidence;

const SUMMON_FORMULA_SOURCE: FormulaProvenance = {
  ...SS13_SUPPORT_FORMULA_SOURCE,
  locator: "skill/Passive/master.skills[id in {Summon Rock Magus,Summon Erosion Magus}].levelProgression",
};

const SUMMON_TEXT_SOURCE: FormulaProvenance = {
  ...SS13_SKILL_TEXT_SOURCE,
  locator: "skill/Passive/i18n/en.skills[id in {Summon Rock Magus,Summon Erosion Magus}].templateDescription",
};

function term(
  id: string,
  label: string,
  value: number,
  unit: "count" | "percent",
  scope: "summoned-actor" | "player",
  condition: string | null = null,
): SummonFormulaTerm {
  return {
    id,
    label,
    value,
    unit,
    scope,
    condition,
    isDps: false,
    isTotalEhp: false,
  };
}

function supportedLevel(skill: any): number | null {
  const level = Number(skill?.level);
  return Number.isInteger(level) && level >= 1 && level <= 40 ? level : null;
}

function cappedProgression(level: number, atOne: number): number {
  const value = level <= 21 ? atOne - (level - 1) * 0.15 : atOne - 20 * 0.15;
  return Number(value.toFixed(10));
}

function compileSummon(skill: any): SummonSkillEvidence | null {
  const level = supportedLevel(skill);
  if (level === null) return null;
  const commonDpsBlocker: CalculationBlocker = {
    code: "missing-minion-action-formula",
    message: "The summon record has no minion attack base, action coefficients, cooldowns, or AI rotation.",
  };
  const commonEhpBlockers: CalculationBlocker[] = [
    {
      code: "origin-uptime-unresolved",
      message: "Origin stack count, effect scaling, and runtime uptime are not deterministic in the planner snapshot.",
    },
    {
      code: "missing-character-defence-baseline",
      message: "A total EHP calculation still needs player Life/ES/defences and an incoming-damage scenario.",
    },
  ];

  if (skill.skillGuid === SUMMON_ROCK_MAGUS_ID) {
    return {
      status: "source-terms",
      isDps: false,
      isTotalEhp: false,
      skillId: SUMMON_ROCK_MAGUS_ID,
      skillName: "Summon Rock Magus",
      level,
      actor: "minion",
      damageTags: ["spell", "summon", "physical", "spirit-magus"],
      terms: [
        term("summoned-count", "Rock Magi summoned", 1, "count", "summoned-actor"),
        term("maximum-count", "maximum Rock Magi from this skill", 1, "count", "summoned-actor"),
        term(
          "origin-additional-hit-damage-taken",
          "additional Hit Damage taken from Origin of Spirit Magus",
          cappedProgression(level, -5.2),
          "percent",
          "player",
          "per the active Origin state; the source caps the combined line at -50%",
        ),
      ],
      provenance: [SUMMON_FORMULA_SOURCE, SUMMON_TEXT_SOURCE],
      minionDps: { status: "not-calculated", blockers: [commonDpsBlocker] },
      playerEhp: { status: "not-calculated", blockers: commonEhpBlockers },
    };
  }
  if (skill.skillGuid === SUMMON_EROSION_MAGUS_ID) {
    return {
      status: "source-terms",
      isDps: false,
      isTotalEhp: false,
      skillId: SUMMON_EROSION_MAGUS_ID,
      skillName: "Summon Erosion Magus",
      level,
      actor: "minion",
      damageTags: ["spell", "summon", "erosion", "spirit-magus"],
      terms: [
        term("summoned-count", "Erosion Magi summoned", 1, "count", "summoned-actor"),
        term("maximum-count", "maximum Erosion Magi from this skill", 1, "count", "summoned-actor"),
        term(
          "physical-to-erosion-conversion",
          "Spirit Magus Physical Damage converted to Erosion",
          100,
          "percent",
          "summoned-actor",
        ),
        term(
          "origin-additional-dot-damage-taken",
          "additional Damage Over Time taken from Origin of Spirit Magus",
          cappedProgression(level, -6.3),
          "percent",
          "player",
          "per the active Origin state; the source caps the combined line at -50%",
        ),
      ],
      provenance: [SUMMON_FORMULA_SOURCE, SUMMON_TEXT_SOURCE],
      minionDps: { status: "not-calculated", blockers: [commonDpsBlocker] },
      playerEhp: { status: "not-calculated", blockers: commonEhpBlockers },
    };
  }
  return null;
}

function loadoutAt(build: any, index: number): any | null {
  const loadouts = build?.loadouts?.loadouts;
  return Array.isArray(loadouts) ? loadouts[index] ?? null : null;
}

function unavailable(...blockers: CalculationBlocker[]): UnavailableWuxiaSummonEvidence {
  return {
    status: "not-calculated",
    isDps: false,
    isTotalEhp: false,
    blockers,
  };
}

export function compileWuxiaSummonEvidence(
  build: any,
  loadoutIndex = 0,
): WuxiaSummonEvidenceResult {
  if (build?.patch !== "SS13") {
    return unavailable({
      code: "unsupported-patch",
      message: "Summon evidence is season-pinned to SS13.",
    });
  }
  const loadout = loadoutAt(build, loadoutIndex);
  if (!loadout) {
    return unavailable({
      code: "missing-loadout",
      message: `No loadout exists at index ${loadoutIndex}.`,
    });
  }
  const heroId = loadout?.hero?.heroGuid ?? loadout?.hero?.heroId;
  if (heroId !== IRIS_VIGILANT_BREEZE_ID) {
    return unavailable({
      code: "unsupported-actor",
      message: "Summon evidence is currently scoped to Iris: Vigilant Breeze.",
    });
  }
  const relevant = (loadout?.skills?.activeSkills ?? [])
    .filter((skill: any) =>
      skill?.enabled !== false
      && (skill?.skillGuid === SUMMON_ROCK_MAGUS_ID
        || skill?.skillGuid === SUMMON_EROSION_MAGUS_ID));
  const summons = relevant
    .map((skill: any) => compileSummon(skill))
    .filter((skill: SummonSkillEvidence | null): skill is SummonSkillEvidence => skill !== null);
  if (summons.length !== relevant.length || !summons.length) {
    return unavailable({
      code: summons.length ? "unsupported-summon-level" : "missing-supported-summon",
      message: summons.length
        ? "At least one summon level is outside the exact SS13 integer 1-40 table."
        : "The loadout has no enabled supported Spirit Magus summon skill.",
    });
  }
  return {
    status: "source-terms",
    isDps: false,
    isTotalEhp: false,
    patch: "SS13",
    heroId: IRIS_VIGILANT_BREEZE_ID,
    loadoutIndex,
    loadoutName: String(loadout.name ?? `Loadout ${loadoutIndex + 1}`),
    summons,
    provenance: [SUMMON_FORMULA_SOURCE, SUMMON_TEXT_SOURCE],
    warning: "These are summon and player-Origin inputs only; they are not minion DPS or total player EHP.",
  };
}

function fingerprint(evidence: SummonSkillEvidence): string {
  return JSON.stringify({
    level: evidence.level,
    tags: evidence.damageTags,
    terms: evidence.terms,
  });
}

export function compareWuxiaSummonEvidence(
  build: any,
  beforeIndex: number,
  afterIndex: number,
): WuxiaSummonEvidenceComparisonResult {
  const before = compileWuxiaSummonEvidence(build, beforeIndex);
  const after = compileWuxiaSummonEvidence(build, afterIndex);
  if (before.status !== "source-terms" || after.status !== "source-terms") {
    return unavailable(
      ...(before.status === "not-calculated"
        ? before.blockers.map((blocker) => ({ ...blocker, message: `Before loadout: ${blocker.message}` }))
        : []),
      ...(after.status === "not-calculated"
        ? after.blockers.map((blocker) => ({ ...blocker, message: `After loadout: ${blocker.message}` }))
        : []),
    );
  }
  const left = new Map(before.summons.map((summon) => [summon.skillId, summon]));
  const right = new Map(after.summons.map((summon) => [summon.skillId, summon]));
  const changes: SummonEvidenceChange[] = [];
  for (const id of new Set([...left.keys(), ...right.keys()])) {
    const a = left.get(id) ?? null;
    const b = right.get(id) ?? null;
    if (!a && b) {
      changes.push({ kind: "added", skillId: id, skillName: b.skillName, before: null, after: b });
    } else if (a && !b) {
      changes.push({ kind: "removed", skillId: id, skillName: a.skillName, before: a, after: null });
    } else if (a && b && fingerprint(a) !== fingerprint(b)) {
      changes.push({ kind: "changed", skillId: id, skillName: b.skillName, before: a, after: b });
    }
  }
  return {
    status: "source-terms",
    isDps: false,
    isTotalEhp: false,
    beforeIndex,
    afterIndex,
    changes,
    provenance: [SUMMON_FORMULA_SOURCE, SUMMON_TEXT_SOURCE],
    warning: "Summon inputs are compared without manufacturing a minion attack model or total EHP.",
  };
}
