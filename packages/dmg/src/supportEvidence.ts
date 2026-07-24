/*
 * Source-term extraction for SS13 Bing main-skill supports.
 *
 * These values are evidence for an explanation UI, not a support ranking.  A
 * support can affect only one damage type/component, alter attack cadence or
 * projectile geometry, or require a runtime condition.  Accordingly this
 * module never multiplies the terms into DPS.
 */

import {
  BING_BLAST_NOVA_ID,
  HAMMER_OF_ASH_ID,
  type CalculationBlocker,
  type FormulaProvenance,
} from "./guardedCompiler.js";

export const SS13_SKILL_TEXT_SOURCE: FormulaProvenance = {
  source: "https://tlicompendium.com/data-bundles/SS13-skill-en.json",
  locator: "skill/*/i18n/en.skills[id].templateDescription",
  sha256: "10b5cf27e8f50acca7ff2ec5a7534d5eb5e8e1eee83493f86851967fc0cd7cb1",
  confidence: "source-data",
};

export const SS13_SUPPORT_FORMULA_SOURCE: FormulaProvenance = {
  source: "https://tlicompendium.com/data-bundles/SS13-skill-master.json",
  locator: "skill/{Support,Magnificent_Support,Activation_Medium}/master.skills[id]",
  sha256: "91a676a558e6a7b811edc9256caec53c539398f93aac3b9a1f55c5c998d7ae91",
  confidence: "source-data",
};

const ACTIVATION_MOTIONLESS = "2a5b5be6-f54e-58fc-9acb-47facff516e0";
const MELEE_KNOCKBACK = "2d9474fd-8923-56ef-9f5c-f6444898c5f9";
const CRITICAL_STRIKE_DAMAGE = "dcb47367-34df-5e86-a9df-0b5d5f130998";
const STEAMROLL = "4830642f-32e5-56ef-9de7-61ed678cb883";
const ELEMENTAL_FUSION = "433ae805-68e7-5dba-ac84-fd317aa7a968";
const SLOW_PROJECTILE = "56c49853-7d67-5a43-bfe7-0cfe5c7e3d84";
const PASSIVATION = "6ad66630-a244-575e-9b4e-a7d15ad8b1d1";
const UPHEAVAL_MAGNIFICENT = "4ba9d077-d4f6-5a60-bd8e-423319a27f97";

export type SupportTermApplication =
  | "additional-layer-input"
  | "attack-speed-input"
  | "projectile-geometry-input"
  | "area-geometry-input"
  | "utility-only";

export interface SupportEffectTerm {
  id: string;
  label: string;
  value: number;
  unit: "percent";
  application: SupportTermApplication;
  scope: string;
  condition: string | null;
  isNetDps: false;
}

export interface SupportSourceTerms {
  status: "source-terms";
  isDps: false;
  supportId: string;
  supportName: string;
  supportType: string;
  level: number | null;
  tier: number | null;
  rank: number | null;
  rollValues: number[];
  effects: SupportEffectTerm[];
  provenance: FormulaProvenance[];
  netDps: {
    status: "not-calculated";
    blockers: CalculationBlocker[];
  };
}

export interface UnsupportedSupportTerms {
  status: "unsupported";
  isDps: false;
  supportId: string;
  supportName: string | null;
  blockers: CalculationBlocker[];
}

export type SupportEvidence = SupportSourceTerms | UnsupportedSupportTerms;

export interface MainSkillSupportEvidence {
  status: "source-terms";
  isDps: false;
  patch: "SS13";
  heroId: typeof BING_BLAST_NOVA_ID;
  skillId: typeof HAMMER_OF_ASH_ID;
  loadoutIndex: number;
  loadoutName: string;
  supports: SupportEvidence[];
  provenance: FormulaProvenance[];
  warning: string;
}

export interface UnavailableMainSkillSupportEvidence {
  status: "not-calculated";
  isDps: false;
  blockers: CalculationBlocker[];
}

export type MainSkillSupportEvidenceResult =
  | MainSkillSupportEvidence
  | UnavailableMainSkillSupportEvidence;

export interface SupportEvidenceChange {
  kind: "added" | "removed" | "changed";
  supportId: string;
  supportName: string | null;
  before: SupportEvidence | null;
  after: SupportEvidence | null;
}

export interface SupportEvidenceComparison {
  status: "source-terms";
  isDps: false;
  beforeIndex: number;
  afterIndex: number;
  changes: SupportEvidenceChange[];
  provenance: FormulaProvenance[];
  warning: string;
}

export interface UnavailableSupportEvidenceComparison {
  status: "not-calculated";
  isDps: false;
  blockers: CalculationBlocker[];
}

export type SupportEvidenceComparisonResult =
  | SupportEvidenceComparison
  | UnavailableSupportEvidenceComparison;

interface SupportDefinition {
  name: string;
  expectedType: "support" | "activation_medium" | "magnificent_support";
  compile: (support: any) => SupportEffectTerm[] | CalculationBlocker;
}

function term(
  id: string,
  label: string,
  value: number,
  application: SupportTermApplication,
  scope: string,
  condition: string | null = null,
): SupportEffectTerm {
  return {
    id,
    label,
    value,
    unit: "percent",
    application,
    scope,
    condition,
    isNetDps: false,
  };
}

function levelOf(support: any): number | CalculationBlocker {
  const level = support?.level;
  if (typeof level === "number"
      && Number.isSafeInteger(level)
      && level >= 1
      && level <= 40) return level;
  return {
    code: "unsupported-support-level",
    message: `Support level ${String(support?.level)} is outside the exact SS13 level table's integer 1-40 range.`,
  };
}

function levelTerms(
  support: any,
  compile: (level: number) => SupportEffectTerm[],
): SupportEffectTerm[] | CalculationBlocker {
  const level = levelOf(support);
  return typeof level === "number" ? compile(level) : level;
}

function rollValues(support: any): number[] {
  return Array.isArray(support?.rollValues)
    ? support.rollValues.filter(
        (value: unknown): value is number =>
          typeof value === "number" && Number.isFinite(value),
      )
    : [];
}

const SUPPORTS: Record<string, SupportDefinition> = {
  [ACTIVATION_MOTIONLESS]: {
    name: "Activation Medium: Motionless",
    expectedType: "activation_medium",
    compile: (support) => {
      const tier = support?.tier;
      const rolls = rollValues(support);
      const [roll] = rolls;
      if (typeof tier !== "number"
          || !Number.isSafeInteger(tier)
          || tier !== 0
          || support?.rank !== undefined
          || rolls.length !== 1
          || !Number.isFinite(roll)
          || roll < 12 || roll > 15) {
        return {
          code: "unsupported-motionless-roll",
          message: "Motionless evidence currently requires its explicit SS13 tier-0 12-15% roll.",
        };
      }
      return [term(
        "auto-used-additional-damage",
        "additional damage for auto-used supported skills",
        roll,
        "additional-layer-input",
        "supported skill",
        "automatically cast while standing still and an enemy is within 25m",
      )];
    },
  },
  [MELEE_KNOCKBACK]: {
    name: "Melee Knockback",
    expectedType: "support",
    compile: (support) => levelTerms(support, (level) => [
      term("knockback-chance", "Knockback chance", 19 + level,
        "utility-only", "supported skill"),
      term("additional-damage", "additional damage", 15 + level * 0.5,
        "additional-layer-input", "supported skill"),
      term("knockback-distance", "Knockback distance", 39 + level,
        "utility-only", "supported skill"),
    ]),
  },
  [CRITICAL_STRIKE_DAMAGE]: {
    name: "Critical Strike Damage Increase",
    expectedType: "support",
    compile: (support) => levelTerms(support, (level) => [
      term("additional-damage-on-crit", "additional damage on Critical Strike",
        25.5 + level * 0.5, "additional-layer-input", "critical hits only",
        "supported skill lands a Critical Strike"),
    ]),
  },
  [STEAMROLL]: {
    name: "Steamroll",
    expectedType: "support",
    compile: (support) => levelTerms(support, (level) => [
      term("additional-melee-damage", "additional Melee Damage", 30.5 + level * 0.5,
        "additional-layer-input", "melee damage of the supported skill"),
      term("additional-ailment-damage", "additional Ailment Damage", 30.5 + level * 0.5,
        "additional-layer-input", "ailment damage of the supported skill"),
      term("attack-speed", "Attack Speed", -15,
        "attack-speed-input", "supported skill"),
    ]),
  },
  [ELEMENTAL_FUSION]: {
    name: "Elemental Fusion",
    expectedType: "support",
    compile: (support) => levelTerms(support, (level) => [
      term("additional-elemental-damage", "additional Elemental Damage",
        25 + level * 0.5, "additional-layer-input", "elemental portions of the supported skill",
        "the support also prevents Ignite, Frostbite, and Numbed"),
    ]),
  },
  [SLOW_PROJECTILE]: {
    name: "Slow Projectile",
    expectedType: "support",
    compile: (support) => levelTerms(support, (level) => [
      term("additional-projectile-speed", "additional Projectile Speed", -30,
        "projectile-geometry-input", "projectiles of the supported skill"),
      term("additional-damage", "additional damage", 19 + level * 0.5,
        "additional-layer-input", "supported skill"),
    ]),
  },
  [PASSIVATION]: {
    name: "Passivation",
    expectedType: "support",
    compile: (support) => levelTerms(support, (level) => [
      term("maximum-additional-erosion-damage", "up to additional Erosion Damage",
        40 + level, "additional-layer-input", "erosion portions of the supported skill",
        "scales with enemy Life and is only the maximum at the top of that condition"),
    ]),
  },
  [UPHEAVAL_MAGNIFICENT]: {
    name: "Hammer of Ash: Upheaval (Magnificent)",
    expectedType: "magnificent_support",
    compile: (support) => {
      const tier = support?.tier;
      const rank = support?.rank;
      const rolls = rollValues(support);
      const [roll] = rolls;
      const bounds = tier === 0 ? [42, 48] : tier === 1 ? [35, 38] : tier === 2 ? [30, 33] : null;
      if (typeof tier !== "number"
          || !Number.isSafeInteger(tier)
          || typeof rank !== "number"
          || !Number.isSafeInteger(rank)
          || rank !== 1
          || rolls.length !== 1
          || !bounds || !Number.isFinite(roll)
          || roll < bounds[0] || roll > bounds[1]) {
        return {
          code: "unsupported-upheaval-roll",
          message: "Upheaval evidence requires its explicit SS13 rank-1 roll inside the selected tier's source range.",
        };
      }
      return [
        term("additional-damage", "additional damage", 20,
          "additional-layer-input", "supported skill"),
        term("explosion-base-radius", "base explosion radius", 30,
          "area-geometry-input", "projectile explosions only"),
        term("additional-explosion-hit-damage", "additional explosion Hit Damage", roll,
          "additional-layer-input", "projectile explosion hits only"),
      ];
    },
  },
};

function loadoutAt(build: any, index: number): any | null {
  const loadouts = build?.loadouts?.loadouts;
  return Array.isArray(loadouts) ? loadouts[index] ?? null : null;
}

function unavailable(...blockers: CalculationBlocker[]): UnavailableMainSkillSupportEvidence {
  return { status: "not-calculated", isDps: false, blockers };
}

function unsupportedSupport(
  supportId: string,
  supportName: string | null,
  blocker: CalculationBlocker,
): UnsupportedSupportTerms {
  return {
    status: "unsupported",
    isDps: false,
    supportId,
    supportName,
    blockers: [blocker],
  };
}

function supportEvidence(support: any, sourceLocator: string): SupportEvidence {
  if (!support || typeof support !== "object" || Array.isArray(support)) {
    return unsupportedSupport("", null, {
      code: "malformed-support-record",
      message: "A non-empty Hammer support socket must contain one Compendium support object.",
      evidence: sourceLocator,
    });
  }
  const supportId = String(support?.supportGuid ?? "");
  if (!supportId) {
    return unsupportedSupport("", null, {
      code: "malformed-support-record",
      message: "A non-empty Hammer support socket has no supportGuid.",
      evidence: sourceLocator,
    });
  }
  const definition = SUPPORTS[supportId];
  if (!definition) {
    return unsupportedSupport(supportId, null, {
      code: "unsupported-support-formula",
      message: "This support has no source-term compiler in the guarded SS13 Bing subset.",
      evidence: sourceLocator,
    });
  }
  if (support.type !== definition.expectedType) {
    return unsupportedSupport(supportId, definition.name, {
      code: "invalid-support-installation",
      message: `${definition.name} requires support type ${definition.expectedType}; received ${String(support.type ?? "missing")}.`,
      evidence: sourceLocator,
    });
  }
  if (support.rollValues !== undefined
      && (!Array.isArray(support.rollValues)
        || support.rollValues.some((roll: unknown) =>
          typeof roll !== "number" || !Number.isFinite(roll)))) {
    return unsupportedSupport(supportId, definition.name, {
      code: "malformed-support-rolls",
      message: `${definition.name} has a malformed rollValues projection.`,
      evidence: sourceLocator,
    });
  }
  if (definition.expectedType === "support"
      && (support.tier !== undefined
        || support.rank !== undefined
        || support.rollValues !== undefined)) {
    return unsupportedSupport(supportId, definition.name, {
      code: "invalid-support-encoding",
      message: `${definition.name} is an ordinary level support and must not carry tier, rank, or rolled-value metadata.`,
      evidence: sourceLocator,
    });
  }
  if (definition.expectedType !== "support" && support.level !== undefined) {
    return unsupportedSupport(supportId, definition.name, {
      code: "invalid-support-encoding",
      message: `${definition.name} is a rolled special support and must not carry an ordinary support level.`,
      evidence: sourceLocator,
    });
  }
  const effects = definition.compile(support);
  if (!Array.isArray(effects)) {
    return unsupportedSupport(supportId, definition.name, {
      ...effects,
      evidence: effects.evidence ?? sourceLocator,
    });
  }
  return {
    status: "source-terms",
    isDps: false,
    supportId,
    supportName: definition.name,
    supportType: String(support?.type ?? "support"),
    level: typeof support?.level === "number" && Number.isSafeInteger(support.level)
      ? support.level
      : null,
    tier: typeof support?.tier === "number" && Number.isSafeInteger(support.tier)
      ? support.tier
      : null,
    rank: typeof support?.rank === "number" && Number.isSafeInteger(support.rank)
      ? support.rank
      : null,
    rollValues: rollValues(support),
    effects,
    provenance: [
      {
        source: "imported Compendium/tli_dump loadout",
        locator: sourceLocator,
        confidence: "source-data",
      },
      { ...SS13_SUPPORT_FORMULA_SOURCE, locator: `${SS13_SUPPORT_FORMULA_SOURCE.locator}[id=${supportId}]` },
      { ...SS13_SKILL_TEXT_SOURCE, locator: `${SS13_SKILL_TEXT_SOURCE.locator}[id=${supportId}]` },
    ],
    netDps: {
      status: "not-calculated",
      blockers: [{
        code: "context-dependent-support-value",
        message: "Net value needs actor damage portions, crit share, cadence, geometry, enemy state, and runtime uptime.",
      }],
    },
  };
}

export function compileSs13BingSupportEvidence(
  build: any,
  loadoutIndex = 0,
): MainSkillSupportEvidenceResult {
  if (build?.patch !== "SS13") {
    return unavailable({
      code: "unsupported-patch",
      message: "Support evidence is season-pinned to SS13.",
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
  if (heroId !== BING_BLAST_NOVA_ID) {
    return unavailable({
      code: "unsupported-actor",
      message: "Support evidence is currently scoped to Bing: Blast Nova.",
    });
  }
  const activeSkills = loadout?.skills?.activeSkills;
  if (!Array.isArray(activeSkills) || activeSkills.length !== 5) {
    return unavailable({
      code: "malformed-main-skill-layout",
      message: "The final Compendium loadout must expose exactly five active-bar main-skill positions.",
      evidence: Array.isArray(activeSkills)
        ? `received ${activeSkills.length} positions`
        : "activeSkills is not an array",
    });
  }
  const hammerClaims = activeSkills
    .map((skill: any, skillIndex: number) => ({ skill, skillIndex }))
    .filter(({ skill }) => skill?.skillGuid === HAMMER_OF_ASH_ID);
  if (hammerClaims.length !== 1) {
    return unavailable({
      code: hammerClaims.length > 1
        ? "duplicate-hammer-of-ash"
        : "missing-hammer-of-ash",
      message: hammerClaims.length > 1
        ? "Hammer of Ash appears in more than one active-skill slot; every duplicate parent is rejected."
        : "The loadout has no Hammer of Ash skill.",
    });
  }
  const [{ skill: hammer, skillIndex: hammerIndex }] = hammerClaims;
  if (hammer?.enabled !== true) {
    return unavailable({
      code: "disabled-hammer-of-ash",
      message: "Support evidence requires an explicitly enabled Hammer of Ash parent.",
    });
  }
  const supportSlots = hammer.supports;
  if (!Array.isArray(supportSlots) || supportSlots.length !== 5) {
    return unavailable({
      code: "malformed-support-sockets",
      message: "Hammer of Ash must expose exactly five support socket positions.",
      evidence: Array.isArray(supportSlots)
        ? `received ${supportSlots.length} positions`
        : "supports is not an array",
    });
  }
  const supportClaims = supportSlots
    .map((support: any, supportIndex: number) => ({
      support,
      supportIndex,
      supportId: typeof support?.supportGuid === "string"
        ? support.supportGuid
        : null,
    }))
    .filter(({ support }) => support != null);
  const supportCounts = new Map<string, number>();
  for (const { supportId } of supportClaims) {
    if (supportId) {
      supportCounts.set(supportId, (supportCounts.get(supportId) ?? 0) + 1);
    }
  }
  const duplicateSupport = [...supportCounts.entries()]
    .find(([, count]) => count > 1);
  if (duplicateSupport) {
    return unavailable({
      code: "duplicate-main-skill-support",
      message: `Support ${duplicateSupport[0]} appears in more than one Hammer socket; every duplicate installation is rejected.`,
    });
  }
  return {
    status: "source-terms",
    isDps: false,
    patch: "SS13",
    heroId: BING_BLAST_NOVA_ID,
    skillId: HAMMER_OF_ASH_ID,
    loadoutIndex,
    loadoutName: String(loadout.name ?? `Loadout ${loadoutIndex + 1}`),
    supports: supportClaims.map(({ support, supportIndex }) =>
      supportEvidence(
        support,
        `loadouts.loadouts[${loadoutIndex}].skills.activeSkills[${hammerIndex}].supports[${supportIndex}]`,
      )),
    provenance: [SS13_SUPPORT_FORMULA_SOURCE, SS13_SKILL_TEXT_SOURCE],
    warning: "These are exact socket text terms, not net support multipliers or DPS.",
  };
}

function evidenceFingerprint(evidence: SupportEvidence): string {
  if (evidence.status === "unsupported") {
    return JSON.stringify({ status: evidence.status, blockers: evidence.blockers });
  }
  return JSON.stringify({
    status: evidence.status,
    level: evidence.level,
    tier: evidence.tier,
    rank: evidence.rank,
    rolls: evidence.rollValues,
    effects: evidence.effects,
  });
}

export function compareSs13BingSupportEvidence(
  build: any,
  beforeIndex: number,
  afterIndex: number,
): SupportEvidenceComparisonResult {
  const before = compileSs13BingSupportEvidence(build, beforeIndex);
  const after = compileSs13BingSupportEvidence(build, afterIndex);
  if (before.status !== "source-terms" || after.status !== "source-terms") {
    return {
      status: "not-calculated",
      isDps: false,
      blockers: [
        ...(before.status === "not-calculated"
          ? before.blockers.map((blocker) => ({ ...blocker, message: `Before loadout: ${blocker.message}` }))
          : []),
        ...(after.status === "not-calculated"
          ? after.blockers.map((blocker) => ({ ...blocker, message: `After loadout: ${blocker.message}` }))
          : []),
      ],
    };
  }

  const beforeById = new Map(before.supports.map((support) => [support.supportId, support]));
  const afterById = new Map(after.supports.map((support) => [support.supportId, support]));
  const changes: SupportEvidenceChange[] = [];
  for (const id of new Set([...beforeById.keys(), ...afterById.keys()])) {
    const left = beforeById.get(id) ?? null;
    const right = afterById.get(id) ?? null;
    if (!left) {
      changes.push({
        kind: "added",
        supportId: id,
        supportName: right?.supportName ?? null,
        before: null,
        after: right,
      });
    } else if (!right) {
      changes.push({
        kind: "removed",
        supportId: id,
        supportName: left.supportName,
        before: left,
        after: null,
      });
    } else if (evidenceFingerprint(left) !== evidenceFingerprint(right)) {
      changes.push({
        kind: "changed",
        supportId: id,
        supportName: right.supportName,
        before: left,
        after: right,
      });
    }
  }
  return {
    status: "source-terms",
    isDps: false,
    beforeIndex,
    afterIndex,
    changes,
    provenance: [SS13_SUPPORT_FORMULA_SOURCE, SS13_SKILL_TEXT_SOURCE],
    warning: "Support terms are compared without assigning net DPS; component scope and runtime coupling do not cancel safely.",
  };
}
