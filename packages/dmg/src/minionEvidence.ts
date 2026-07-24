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
import {
  compileIrisTraitEvidence,
  compileSpiritMagusActionSet,
  type IrisTraitEvidence,
  type MinionActionEvidence,
  type MinionSupportEvidence,
  type SpiritMagusBaseline,
} from "./minionActionEvidence.js";

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
  baseline: SpiritMagusBaseline;
  actions: MinionActionEvidence[];
  supports: MinionSupportEvidence[];
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
  heroTraits: IrisTraitEvidence[];
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
  heroTraitsChanged: boolean;
  beforeHeroTraits: IrisTraitEvidence[];
  afterHeroTraits: IrisTraitEvidence[];
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
  const level = skill?.level;
  return typeof level === "number"
    && Number.isSafeInteger(level)
    && level >= 1
    && level <= 40
    ? level
    : null;
}

function cappedProgression(level: number, atOne: number): number {
  const value = level <= 21 ? atOne - (level - 1) * 0.15 : atOne - 20 * 0.15;
  return Number(value.toFixed(10));
}

function importedEvidence(locator: string): FormulaProvenance {
  return {
    source: "imported Compendium/tli_dump loadout",
    locator,
    confidence: "source-data",
  };
}

function compileSummon(
  skill: any,
  loadoutIndex: number,
  collection: "activeSkills" | "passiveSkills",
  skillIndex: number,
): SummonSkillEvidence | null {
  const level = supportedLevel(skill);
  if (level === null) return null;
  const skillLocator =
    `loadouts.loadouts[${loadoutIndex}].skills.${collection}[${skillIndex}]`;
  const actionSet = compileSpiritMagusActionSet(skill, {
    patch: "SS13",
    sourceLocator: skillLocator,
  });
  if ("code" in actionSet) return null;
  const skillInputSource = importedEvidence(skillLocator);
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
      baseline: actionSet.baseline,
      actions: actionSet.actions,
      supports: actionSet.supports,
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
      provenance: [
        skillInputSource,
        SUMMON_FORMULA_SOURCE,
        SUMMON_TEXT_SOURCE,
        ...actionSet.provenance,
      ],
      minionDps: { status: "not-calculated", blockers: actionSet.blockers },
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
      baseline: actionSet.baseline,
      actions: actionSet.actions,
      supports: actionSet.supports,
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
      provenance: [
        skillInputSource,
        SUMMON_FORMULA_SOURCE,
        SUMMON_TEXT_SOURCE,
        ...actionSet.provenance,
      ],
      minionDps: { status: "not-calculated", blockers: actionSet.blockers },
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

function uniqueProvenance(sources: FormulaProvenance[]): FormulaProvenance[] {
  const unique = new Map<string, FormulaProvenance>();
  for (const source of sources) {
    unique.set(
      `${source.source}\u0000${source.locator}\u0000${source.sha256 ?? ""}\u0000${source.confidence ?? ""}`,
      source,
    );
  }
  return [...unique.values()];
}

export function compileWuxiaSummonEvidence(
  build: any,
  loadoutIndex = 0,
): WuxiaSummonEvidenceResult {
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
  if (build?.patch !== "SS13") {
    return unavailable({
      code: "unsupported-patch",
      message: "Summon evidence is season-pinned to SS13.",
    });
  }
  const activeSkills = loadout?.skills?.activeSkills;
  const passiveSkills = loadout?.skills?.passiveSkills;
  if (!Array.isArray(activeSkills)
      || activeSkills.length !== 5
      || !Array.isArray(passiveSkills)
      || passiveSkills.length !== 4) {
    return unavailable({
      code: "malformed-main-skill-layout",
      message: "The final Compendium loadout must expose exactly five active-bar and four passive-bar main-skill positions.",
      evidence: `active=${Array.isArray(activeSkills) ? activeSkills.length : "not-array"}, passive=${Array.isArray(passiveSkills) ? passiveSkills.length : "not-array"}`,
    });
  }
  const relevant = ([
    ["activeSkills", activeSkills],
    ["passiveSkills", passiveSkills],
  ] as const).flatMap(([collection, skills]) =>
    skills.flatMap((skill: any, skillIndex: number) =>
      skill?.enabled === true
      && (skill?.skillGuid === SUMMON_ROCK_MAGUS_ID
        || skill?.skillGuid === SUMMON_EROSION_MAGUS_ID)
        ? [{ skill, collection, skillIndex }]
        : []));
  const identityCounts = new Map<string, number>();
  for (const { skill } of relevant) {
    identityCounts.set(
      skill.skillGuid,
      (identityCounts.get(skill.skillGuid) ?? 0) + 1,
    );
  }
  const duplicateIdentity = [...identityCounts.entries()]
    .find(([, count]) => count !== 1);
  if (duplicateIdentity) {
    return unavailable({
      code: "duplicate-supported-summon",
      message: `The enabled summon ${duplicateIdentity[0]} appears in more than one skill slot; every duplicate parent is rejected.`,
    });
  }
  const summons = relevant
    .map(({ skill, collection, skillIndex }) =>
      compileSummon(skill, loadoutIndex, collection, skillIndex))
    .filter((skill: SummonSkillEvidence | null): skill is SummonSkillEvidence => skill !== null);
  if (summons.length !== relevant.length || !summons.length) {
    return unavailable({
      code: summons.length ? "unsupported-summon-level" : "missing-supported-summon",
      message: summons.length
        ? "At least one summon level is outside the exact SS13 integer 1-40 table."
        : "The loadout has no enabled supported Spirit Magus summon skill.",
    });
  }
  const heroTraits = compileIrisTraitEvidence(loadout);
  const provenance = uniqueProvenance([
    SUMMON_FORMULA_SOURCE,
    SUMMON_TEXT_SOURCE,
    importedEvidence(`loadouts.loadouts[${loadoutIndex}].hero.traits`),
    ...summons.flatMap((summon: SummonSkillEvidence) => summon.provenance),
    ...heroTraits.flatMap((trait) => trait.provenance),
  ]);
  return {
    status: "source-terms",
    isDps: false,
    isTotalEhp: false,
    patch: "SS13",
    heroId: IRIS_VIGILANT_BREEZE_ID,
    loadoutIndex,
    loadoutName: String(loadout.name ?? `Loadout ${loadoutIndex + 1}`),
    summons,
    heroTraits,
    provenance,
    warning: "These are actor baselines, raw action foundations, sockets, traits, summon, and player-Origin inputs; they are not minion DPS or total player EHP.",
  };
}

function fingerprint(evidence: SummonSkillEvidence): string {
  return JSON.stringify({
    level: evidence.level,
    tags: evidence.damageTags,
    baseline: evidence.baseline,
    actions: evidence.actions,
    supports: evidence.supports.map((support) =>
      support.status === "unsupported"
        ? {
            ...support,
            blockers: support.blockers.map(({ code, message }) => ({
              code,
              message,
            })),
          }
        : support),
    terms: evidence.terms,
  }, (key, value) => key === "provenance" ? undefined : value);
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
    heroTraitsChanged: JSON.stringify(before.heroTraits) !== JSON.stringify(after.heroTraits),
    beforeHeroTraits: before.heroTraits,
    afterHeroTraits: after.heroTraits,
    provenance: uniqueProvenance([
      ...before.provenance,
      ...after.provenance,
    ]),
    warning: "Action foundations and source inputs are compared without manufacturing an AI rotation, total minion DPS, or total EHP.",
  };
}
