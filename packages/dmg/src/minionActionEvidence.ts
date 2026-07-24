/*
 * Guarded Spirit Magus action, actor-baseline, socket, and Iris-trait evidence.
 *
 * This is deliberately an evidence compiler rather than a DPS model.  SS13
 * publishes the individual Spirit Magus action coefficients and a minion
 * level table, but a planner snapshot still does not determine AI selection,
 * stage, Growth, Breeze, merge state, enhanced-skill chance, enemy count,
 * shotgun overlap, or conditional uptime.  The raw action foundations below
 * are therefore useful formula inputs and never total damage or DPS.
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

export const SS13_HERO_TRAIT_TEXT_SOURCE: FormulaProvenance = {
  source: "https://tlicompendium.com/data-bundles/SS13-hero-trait-en.json",
  locator: `hero-trait/i18n/en.heroes[${IRIS_VIGILANT_BREEZE_ID}].traits`,
  sha256: "f8f2f155dbdc4e62056bb2f81b1e7359c21badb7d772b39f76842e3cd0b455ff",
  confidence: "source-data",
};

/**
 * Normalized SHA-256 covers:
 * `{ actorText, rows[1..40] }`, where each row is
 * `{ level, life, damage, armor }`.
 */
export const SS13_SPIRIT_MAGUS_BASE_SOURCE: FormulaProvenance = {
  source: "https://tlidb.com/en/Summon_Erosion_Magus",
  locator: "SS13 Season > Minion /60 actor line and skill_level rows 1-40 (normalized JSON)",
  sha256: "de728c10a9cb4e4219a33f15223f2cb339c0ce05959e7ea134770ea736416716",
  confidence: "source-data",
};

/**
 * Generated from TLIDB on 2026-07-20 by the repository's update_supports
 * pipeline.  Compendium's SS13 master/text bundles independently pin the same
 * action UUIDs, tags, coefficients, and cast times.
 */
export const SS13_MINION_ACTION_SNAPSHOT_SOURCE: FormulaProvenance = {
  source: "packages/page/src/data/active-skills.json",
  locator: "SS13 rows for Spirit Magus actions (source metadata: tlidb.com, 2026-07-20)",
  sha256: "a8dd77610907daa28679f03dc1a81a92447434bfeb366c5382d56b0774787c85",
  confidence: "source-data",
};

const SHATTERED_STONE_ID = "d2d5db7c-efea-5fd4-869d-8ff5fddf6b38";
const GOLD_RUSH_ID = "863f1e7c-1494-5b7e-924c-f503d9b58bba";
const ROCK_BLAST_ID = "995ac17a-2e84-579a-add6-9fb361c0a983";
const TOWERING_MOUNTAINS_ID = "eda2d740-a1de-52b1-bf55-5d6617862ac0";
const SCATTERED_MUD_ID = "3224343b-6ea8-5380-af0f-731c81e2d0d2";
const WITHERING_PAYBACK_ID = "dc6bc51f-0b20-507c-a9c8-3b2d77b357ad";
const BLEAK_GRASS_ID = "459089b5-f150-5868-91cd-0e745d679ea0";
const WORLD_OF_THORNS_ID = "84850fc5-2929-5196-886d-55e94e706516";

const QUICK_DECISION_ID = "33b9e2f7-ca2b-51ef-949b-885add3142e3";
export const SPELL_CONCENTRATION_ID = "9ddf3bd1-b3c3-5196-a4ae-928b1b2a3111";
export const SERVANT_DAMAGE_ID = "60e6153c-a92b-56cc-98ac-49303ad10a47";
const GRUDGE_ID = "5242ef4d-9d65-5541-9956-596b75793b5c";
const RECKLESSNESS_ID = "f65ec180-9360-52d3-8ac0-51ea20eacc09";
export const PRECISION_STRIKE_ID = "43710e91-3c50-5b97-9be4-0ebe710c6fbb";
const PRECISE_SUPERPOWER_ID = "1db0c549-1a92-5dcc-aec7-76b42435d83b";
const FRIEND_OF_SPIRIT_MAGI_ID = "20299635-ce77-51d0-a367-bdad02dda095";
const PROTECTION_FIELD_ID = "38b31949-b85f-5262-b765-40a0c9b7416c";
const PRECISE_PROTECTION_FIELD_ID = "1ec6ca61-c0b9-5772-aa9c-27128ab7df61";
export const ELEMENTAL_DUO_ID = "b145772f-3b89-5115-9a64-28a2edd34548";
const AILMENT_TERMINATION_ID = "57c89092-e623-5cbb-af11-84fde77234c3";
export const FREQUENT_QUAKE_ID = "45d4c348-9b95-5c5b-9556-97c4bc34699e";
export const MALADY_ID = "4906f4c4-7b90-5d3e-9a29-42696dbb8ae6";

const VIGILANT_BREEZE_TRAIT_ID = "27e5f4c4-57f3-5567-8bda-539372175f1e";
export const WHIRLWIND_TANGO_TRAIT_ID = "dad07d14-fd2f-5374-a51b-c64f049db12a";
const HAPPIEST_REUNION_TRAIT_ID = "b69e86a7-4e90-5774-8086-bf6abb073f02";
const NURTURING_BREEZE_TRAIT_ID = "8ed19a33-d86f-542b-8d54-c601aace483f";

const ROCK_BLAST_DAMAGE_PCT = [
  31, 32, 33, 34, 34, 35, 36, 37, 37, 38,
  39, 40, 41, 42, 43, 44, 44, 45, 46, 47,
  47, 47, 47, 47, 47, 47, 47, 47, 47, 47,
  47, 47, 47, 47, 47, 47, 47, 47, 47, 47,
] as const;

const TOWERING_MOUNTAINS_DAMAGE_PCT = [
  152, 174, 198, 222, 248, 274, 301, 330, 360, 390,
  422, 455, 490, 500, 511, 522, 533, 545, 556, 569,
  569, 569, 569, 569, 569, 569, 569, 569, 569, 569,
  569, 569, 569, 569, 569, 569, 569, 569, 569, 569,
] as const;

const BLEAK_GRASS_DAMAGE_PCT = [
  108, 111, 113, 116, 118, 121, 124, 126, 129, 131,
  134, 138, 141, 144, 147, 150, 153, 156, 160, 162,
  162, 162, 162, 162, 162, 162, 162, 162, 162, 162,
  162, 162, 162, 162, 162, 162, 162, 162, 162, 162,
] as const;

const SPIRIT_MAGUS_BASE_ROWS = [
  [150, 10, 18_750],
  [180, 12, 19_533],
  [240, 16, 20_339],
  [300, 20, 21_170],
  [360, 24, 22_028],
  [420, 28, 22_913],
  [510, 34, 23_827],
  [600, 40, 24_771],
  [720, 48, 25_746],
  [870, 58, 26_755],
  [990, 66, 27_799],
  [1_110, 74, 28_880],
  [1_260, 84, 30_000],
  [1_440, 96, 31_161],
  [1_620, 108, 32_365],
  [1_860, 124, 33_615],
  [2_250, 150, 34_914],
  [2_700, 180, 36_264],
  [3_300, 220, 37_668],
  [4_500, 300, 39_130],
  [4_500, 300, 43_649],
  [4_500, 300, 48_768],
  [4_500, 300, 54_617],
  [4_500, 300, 61_364],
  [4_500, 300, 69_231],
  [4_500, 300, 72_152],
  [4_500, 300, 75_244],
  [4_500, 300, 78_523],
  [4_500, 300, 82_007],
  [4_500, 300, 85_714],
  [4_500, 300, 85_714],
  [4_500, 300, 85_714],
  [4_500, 300, 85_714],
  [4_500, 300, 85_714],
  [4_500, 300, 85_714],
  [4_500, 300, 85_714],
  [4_500, 300, 85_714],
  [4_500, 300, 85_714],
  [4_500, 300, 85_714],
  [4_500, 300, 85_714],
] as const;

export type MinionEvidenceUnit =
  | "percent"
  | "count"
  | "seconds"
  | "meters"
  | "stacks";

export interface MinionActionTerm {
  id: string;
  label: string;
  value: number;
  unit: MinionEvidenceUnit;
  application:
    | "additional-damage-input"
    | "enemy-damage-taken-input"
    | "speed-scaling-input"
    | "geometry-input"
    | "rotation-input"
    | "utility-input";
  condition: string | null;
  isDps: false;
}

export interface SpiritMagusBaseline {
  level: number;
  baseLife: number;
  baseDamage: number;
  baseArmor: number;
  resistances: {
    fire: 60;
    cold: 60;
    lightning: 60;
    erosion: 60;
  };
  baseCriticalStrikeRating: 500;
  baseCriticalStrikeDamagePct: 150;
  confidence: "confirmed-partial" | "inferred-partial";
  isTotalMinionEhp: false;
  provenance: FormulaProvenance[];
}

export interface MinionActionFoundation {
  status: "calculated-partial" | "not-damaging";
  isDps: false;
  isTotalDamage: false;
  baseDamagePctPerContact: number | null;
  deterministicContacts: number | null;
  rawDamagePerContact: number | null;
  rawDamageAtDeterministicFullContact: number | null;
  scope: string;
  excluded: string[];
}

export interface MinionActionEvidence {
  actionId: string;
  actionName: string;
  role: "base" | "empower" | "enhanced" | "ultimate";
  level: number;
  tags: string[];
  castTimeSeconds: number;
  cooldownSeconds: number | null;
  foundation: MinionActionFoundation;
  terms: MinionActionTerm[];
  provenance: FormulaProvenance[];
}

export type MinionSupportApplication =
  | "additional-damage-input"
  | "speed-input"
  | "geometry-input"
  | "origin-effect-input"
  | "survival-transfer-input"
  | "rotation-input"
  | "resource-input"
  | "ailment-input"
  | "utility-input";

export interface MinionSupportTerm {
  id: string;
  label: string;
  value: number;
  unit: MinionEvidenceUnit;
  application: MinionSupportApplication;
  scope: string;
  condition: string | null;
  isNetDps: false;
}

export interface MinionSupportSocketIdentity {
  /** The summoned damage actor is keyed by its summon skill in this source. */
  actorId: string;
  actorName: string;
  skillId: string;
  skillName: string;
  socketIndex: number;
  socketId: string;
}

export interface MinionSupportSourceTerms
  extends MinionSupportSocketIdentity {
  status: "source-terms";
  isDps: false;
  supportId: string;
  supportName: string;
  supportType: string;
  level: number | null;
  tier: number | null;
  rank: number | null;
  rollValues: number[];
  effects: MinionSupportTerm[];
  provenance: FormulaProvenance[];
  netDps: {
    status: "not-calculated";
    blockers: CalculationBlocker[];
  };
}

export interface UnsupportedMinionSupportTerms
  extends MinionSupportSocketIdentity {
  status: "unsupported";
  isDps: false;
  supportId: string;
  supportName: string | null;
  blockers: CalculationBlocker[];
}

export type MinionSupportEvidence =
  | MinionSupportSourceTerms
  | UnsupportedMinionSupportTerms;

export interface IrisTraitTerm {
  id: string;
  label: string;
  values: number[];
  unit: MinionEvidenceUnit;
  scope: "spirit-magi" | "merged-spirit-magi" | "player";
  condition: string | null;
  selector: "constant" | "unresolved-trait-enhancement";
  application:
    | "additional-damage-input"
    | "damage-taken-input"
    | "growth-input"
    | "quantity-input"
    | "rotation-input"
    | "resource-input"
    | "recovery-transfer-input";
  isDps: false;
  isTotalEhp: false;
}

export interface IrisTraitEvidence {
  traitId: string;
  traitName: string;
  unlockLevel: 1 | 45 | 60 | 75;
  terms: IrisTraitTerm[];
  unresolved: string[];
  provenance: FormulaProvenance[];
  isDps: false;
  isTotalEhp: false;
}

export interface CompiledMinionActionSet {
  baseline: SpiritMagusBaseline;
  actions: MinionActionEvidence[];
  supports: MinionSupportEvidence[];
  provenance: FormulaProvenance[];
  isDps: false;
  isTotalMinionEhp: false;
  blockers: CalculationBlocker[];
}

function round(value: number): number {
  return Number(value.toFixed(10));
}

function actionTerm(
  id: string,
  label: string,
  value: number,
  unit: MinionEvidenceUnit,
  application: MinionActionTerm["application"],
  condition: string | null = null,
): MinionActionTerm {
  return { id, label, value, unit, application, condition, isDps: false };
}

function supportTerm(
  id: string,
  label: string,
  value: number,
  unit: MinionEvidenceUnit,
  application: MinionSupportApplication,
  scope: string,
  condition: string | null = null,
): MinionSupportTerm {
  return {
    id,
    label,
    value,
    unit,
    application,
    scope,
    condition,
    isNetDps: false,
  };
}

function traitTerm(
  id: string,
  label: string,
  values: number[],
  unit: MinionEvidenceUnit,
  scope: IrisTraitTerm["scope"],
  application: IrisTraitTerm["application"],
  condition: string | null = null,
  selector: IrisTraitTerm["selector"] = "constant",
): IrisTraitTerm {
  return {
    id,
    label,
    values,
    unit,
    scope,
    condition,
    selector,
    application,
    isDps: false,
    isTotalEhp: false,
  };
}

function levelOf(value: unknown): number | null {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 1
    && value <= 40
    ? value
    : null;
}

function supportLevel(support: any): number | CalculationBlocker {
  const level = levelOf(support?.level);
  return level ?? {
    code: "unsupported-support-level",
    message: `Support level ${String(support?.level)} is outside the exact SS13 integer 1-40 table.`,
  };
}

function numericRolls(support: any): number[] {
  return Array.isArray(support?.rollValues)
    ? support.rollValues.filter(
        (value: unknown): value is number =>
          typeof value === "number" && Number.isFinite(value),
      )
    : [];
}

function actionProvenance(actionId: string): FormulaProvenance[] {
  return [
    {
      ...SS13_SUPPORT_FORMULA_SOURCE,
      locator: `skill/Active/master.skills[id=${actionId}]`,
    },
    {
      ...SS13_SKILL_TEXT_SOURCE,
      locator: `skill/Active/i18n/en.skills[id=${actionId}]`,
    },
    SS13_MINION_ACTION_SNAPSHOT_SOURCE,
  ];
}

function actionFoundation(
  baseline: SpiritMagusBaseline,
  actionName: string,
  damagePct: number | null,
  contacts: number | null,
  contactScope: string,
): MinionActionFoundation {
  if (damagePct === null) {
    return {
      status: "not-damaging",
      isDps: false,
      isTotalDamage: false,
      baseDamagePctPerContact: null,
      deterministicContacts: contacts,
      rawDamagePerContact: null,
      rawDamageAtDeterministicFullContact: null,
      scope: `${actionName} has no direct base-damage line in the SS13 source record`,
      excluded: [
        "buff-triggered actions",
        "all actor modifiers and runtime state",
      ],
    };
  }
  const perContact = baseline.baseDamage * damagePct / 100;
  return {
    status: "calculated-partial",
    isDps: false,
    isTotalDamage: false,
    baseDamagePctPerContact: damagePct,
    deterministicContacts: contacts,
    rawDamagePerContact: perContact,
    rawDamageAtDeterministicFullContact: contacts === null ? null : perContact * contacts,
    scope: contactScope,
    excluded: [
      "Growth and main-stat scaling",
      "increased and additional damage",
      "critical strikes, double damage, ailments, penetration, and enemy mitigation",
      "Breeze, Vigilant/merge state, stage, and hero-memory effects",
      "support, gear, talent, slate, pactspirit, kismet, curse, and buff effects",
      "AI selection, cooldown recovery, effective action cadence, and target overlap",
    ],
  };
}

function minionAction(
  baseline: SpiritMagusBaseline,
  actionId: string,
  actionName: string,
  role: MinionActionEvidence["role"],
  tags: string[],
  castTimeSeconds: number,
  cooldownSeconds: number | null,
  damagePct: number | null,
  contacts: number | null,
  contactScope: string,
  terms: MinionActionTerm[] = [],
): MinionActionEvidence {
  return {
    actionId,
    actionName,
    role,
    level: baseline.level,
    tags,
    castTimeSeconds,
    cooldownSeconds,
    foundation: actionFoundation(
      baseline,
      actionName,
      damagePct,
      contacts,
      contactScope,
    ),
    terms,
    provenance: actionProvenance(actionId),
  };
}

function baselineFor(
  summonSkillId: string,
  level: number,
): SpiritMagusBaseline {
  const [baseLife, baseDamage, baseArmor] = SPIRIT_MAGUS_BASE_ROWS[level - 1];
  const rockInference: FormulaProvenance = {
    source: "https://tlidb.com/en/Summon_Rock_Magus",
    locator: "Minion /60 table is identical to the SS13 Erosion Magus actor table",
    confidence: "inferred-mechanic",
  };
  return {
    level,
    baseLife,
    baseDamage,
    baseArmor,
    resistances: {
      fire: 60,
      cold: 60,
      lightning: 60,
      erosion: 60,
    },
    baseCriticalStrikeRating: 500,
    baseCriticalStrikeDamagePct: 150,
    confidence: summonSkillId === SUMMON_EROSION_MAGUS_ID
      ? "confirmed-partial"
      : "inferred-partial",
    isTotalMinionEhp: false,
    provenance: summonSkillId === SUMMON_EROSION_MAGUS_ID
      ? [SS13_SPIRIT_MAGUS_BASE_SOURCE]
      : [SS13_SPIRIT_MAGUS_BASE_SOURCE, rockInference],
  };
}

function rockActions(baseline: SpiritMagusBaseline): MinionActionEvidence[] {
  const level = baseline.level;
  return [
    minionAction(
      baseline,
      SHATTERED_STONE_ID,
      "Shattered Stone",
      "base",
      ["base-skill", "attack", "melee", "physical", "area"],
      0.8,
      null,
      107,
      1,
      "one raw Shattered Stone contact",
    ),
    minionAction(
      baseline,
      GOLD_RUSH_ID,
      "Gold Rush",
      "empower",
      ["empower", "attack", "physical", "area", "persistent"],
      0.6,
      10,
      null,
      0,
      "Empower state and trigger inputs only",
      [
        actionTerm(
          "additional-damage-per-affected-enemy",
          "additional damage per affected enemy",
          6,
          "percent",
          "additional-damage-input",
          "during the 6 s Euphoria; up to 10 affected enemies",
        ),
        actionTerm(
          "maximum-affected-enemy-stacks",
          "maximum affected-enemy stacks",
          10,
          "stacks",
          "rotation-input",
        ),
        actionTerm(
          "stage-four-boss-empower-effect",
          "additional Empower Effect",
          120,
          "percent",
          "rotation-input",
          "Stage 4+ with a boss within 10 m",
        ),
      ],
    ),
    minionAction(
      baseline,
      ROCK_BLAST_ID,
      "Rock Blast",
      "enhanced",
      ["enhanced-skill", "attack", "melee", "physical", "area"],
      0.4,
      null,
      ROCK_BLAST_DAMAGE_PCT[level - 1],
      null,
      "one raw Rock Blast strike; three strikes are emitted per use, but same-target contacts are unresolved",
      [
        actionTerm(
          "strikes-per-use",
          "strikes per use",
          3,
          "count",
          "geometry-input",
        ),
        actionTerm(
          "stage-three-damage-per-nearby-enemy",
          "additional damage per nearby enemy",
          3.5,
          "percent",
          "additional-damage-input",
          "Stage 3+; enemy within 8 m; up to 8 stacks",
        ),
      ],
    ),
    minionAction(
      baseline,
      TOWERING_MOUNTAINS_ID,
      "Towering Mountains",
      "ultimate",
      ["ultimate", "attack", "melee", "physical", "area"],
      1.5,
      8,
      TOWERING_MOUNTAINS_DAMAGE_PCT[level - 1],
      1,
      "one raw Towering Mountains contact",
      [
        actionTerm(
          "additional-damage-per-enemy",
          "additional damage per enemy in the area",
          5,
          "percent",
          "additional-damage-input",
          "up to 8 stacks",
        ),
        actionTerm(
          "attack-speed-conversion",
          "additional damage per +1% Attack Speed",
          0.2,
          "percent",
          "speed-scaling-input",
        ),
      ],
    ),
  ];
}

function erosionActions(baseline: SpiritMagusBaseline): MinionActionEvidence[] {
  const level = baseline.level;
  return [
    minionAction(
      baseline,
      SCATTERED_MUD_ID,
      "Scattered Mud",
      "base",
      ["base-skill", "spell", "erosion", "area"],
      0.8,
      null,
      100,
      1,
      "one raw Scattered Mud contact",
    ),
    minionAction(
      baseline,
      WITHERING_PAYBACK_ID,
      "Withering Payback",
      "empower",
      ["empower", "spell", "erosion", "area", "persistent"],
      0.6,
      10,
      null,
      0,
      "Empower state and triggered-action inputs only",
      [
        actionTerm(
          "additional-erosion-damage",
          "additional Erosion Damage",
          20,
          "percent",
          "additional-damage-input",
          "during the 6 s Euphoria",
        ),
        actionTerm(
          "taking-damage-trigger-interval",
          "Base/Enhanced trigger interval for the same enemy",
          1,
          "seconds",
          "rotation-input",
          "while Euphoria lasts and this minion takes damage",
        ),
        actionTerm(
          "stage-four-ultimate-damage",
          "additional Ultimate Damage",
          50,
          "percent",
          "additional-damage-input",
          "Stage 4+ while Euphoria lasts",
        ),
        actionTerm(
          "stage-four-enhanced-spikes",
          "additional spike launched by the Enhanced Skill",
          1,
          "count",
          "geometry-input",
          "Stage 4+ while Euphoria lasts",
        ),
      ],
    ),
    minionAction(
      baseline,
      BLEAK_GRASS_ID,
      "Bleak Grass",
      "enhanced",
      ["enhanced-skill", "spell", "erosion", "area"],
      0.8,
      null,
      BLEAK_GRASS_DAMAGE_PCT[level - 1],
      2,
      "raw spike plus raw spike-explosion contact; extra spikes are excluded",
      [
        actionTerm(
          "full-contact-components",
          "damage components on full contact",
          2,
          "count",
          "geometry-input",
          "one spike and its explosion",
        ),
        actionTerm(
          "stage-three-erosion-damage-taken",
          "additional Erosion Damage taken by the enemy",
          4,
          "percent",
          "enemy-damage-taken-input",
          "Stage 3+ for 2 s; stacks up to 4 times",
        ),
        actionTerm(
          "stage-three-debuff-stacks",
          "maximum Erosion-taken stacks",
          4,
          "stacks",
          "rotation-input",
          "Stage 3+",
        ),
      ],
    ),
    minionAction(
      baseline,
      WORLD_OF_THORNS_ID,
      "World of Thorns",
      "ultimate",
      ["ultimate", "spell", "erosion", "area"],
      1.5,
      8,
      2_298,
      null,
      "one raw thorn contact; same-target thorn overlap is unresolved",
      [
        actionTerm(
          "maximum-targets",
          "maximum enemies that spawn a thorn field",
          10,
          "count",
          "geometry-input",
        ),
        actionTerm(
          "shotgun-falloff",
          "Shotgun Effect falloff coefficient",
          95,
          "percent",
          "geometry-input",
          "for additional same-target thorn contacts",
        ),
      ],
    ),
  ];
}

interface SupportDefinition {
  name: string;
  expectedType: "support" | "magnificent_support" | "noble_support";
  allowedSlotIndex?: number;
  compile: (
    support: any,
    summonSkillId: string,
  ) => MinionSupportTerm[] | CalculationBlocker;
}

function withLevel(
  support: any,
  compile: (level: number) => MinionSupportTerm[],
): MinionSupportTerm[] | CalculationBlocker {
  const level = supportLevel(support);
  return typeof level === "number" ? compile(level) : level;
}

function rollTier(
  support: any,
  bounds: Record<number, readonly [number, number]>,
  errorCode: string,
  errorMessage: string,
): number | CalculationBlocker {
  const tier = Number(support?.tier);
  const rank = support?.rank;
  const rolls = numericRolls(support);
  const [roll] = rolls;
  const range = bounds[tier];
  if (typeof support?.tier !== "number"
      || !Number.isSafeInteger(support.tier)
      || typeof rank !== "number"
      || !Number.isSafeInteger(rank)
      || rank !== 1
      || rolls.length !== 1
      || !range
      || !Number.isFinite(roll)
      || roll < range[0] || roll > range[1]) {
    return { code: errorCode, message: errorMessage };
  }
  return roll;
}

const MINION_SUPPORTS: Record<string, SupportDefinition> = {
  [QUICK_DECISION_ID]: {
    name: "Quick Decision",
    expectedType: "support",
    compile: (support) => withLevel(support, (level) => [
      supportTerm(
        "additional-attack-cast-speed",
        "additional Attack and Cast Speed",
        14.5 + level * 0.5,
        "percent",
        "speed-input",
        "supported Spirit Magus action",
      ),
    ]),
  },
  [SPELL_CONCENTRATION_ID]: {
    name: "Spell Concentration",
    expectedType: "support",
    compile: (support) => withLevel(support, (level) => [
      supportTerm(
        "skill-area",
        "Skill Area",
        -30,
        "percent",
        "geometry-input",
        "supported Area Spell action",
      ),
      supportTerm(
        "additional-damage",
        "additional damage",
        22 + level * 0.5,
        "percent",
        "additional-damage-input",
        "supported Area Spell action",
      ),
    ]),
  },
  [SERVANT_DAMAGE_ID]: {
    name: "Servant Damage",
    expectedType: "support",
    compile: (support) => withLevel(support, (level) => [
      supportTerm(
        "additional-minion-damage",
        "additional damage",
        15 + level * 0.5,
        "percent",
        "additional-damage-input",
        "Minions summoned by the supported skill",
      ),
    ]),
  },
  [GRUDGE_ID]: {
    name: "Grudge",
    expectedType: "support",
    compile: (support) => withLevel(support, (level) => [
      supportTerm(
        "additional-damage-to-cursed",
        "additional damage to Cursed enemies",
        10 + level * 0.5,
        "percent",
        "additional-damage-input",
        "supported Spell actions",
        "target is Cursed",
      ),
      supportTerm(
        "paralyze-chance",
        "chance to Paralyze",
        30 + level,
        "percent",
        "utility-input",
        "supported Spell actions",
        "damage is dealt to a Cursed target",
      ),
    ]),
  },
  [RECKLESSNESS_ID]: {
    name: "Recklessness",
    expectedType: "support",
    compile: (support) => withLevel(support, (level) => {
      const lifeCost = level < 10 ? 1 : level < 15 ? 2 : 3;
      return [
        supportTerm(
          "current-life-consumed",
          "current Life consumed on cast",
          lifeCost,
          "percent",
          "resource-input",
          "supported Attack action",
        ),
        supportTerm(
          "attack-speed",
          "Attack Speed",
          4.5 + level * 0.5,
          "percent",
          "speed-input",
          "supported Attack action",
        ),
        supportTerm(
          "missing-life-physical-coefficient",
          "Missing Life added as Physical Damage",
          5,
          "percent",
          "additional-damage-input",
          "supported Attack action",
          "the minion-skill effect is only 40% of this coefficient",
        ),
        supportTerm(
          "effective-minion-missing-life-coefficient",
          "effective Missing Life coefficient on Minion Skills",
          2,
          "percent",
          "additional-damage-input",
          "supported Minion Attack action",
          "5% source coefficient × 40% Minion Skill effect",
        ),
      ];
    }),
  },
  [PRECISION_STRIKE_ID]: {
    name: "Precision Strike",
    expectedType: "support",
    compile: (support) => withLevel(support, (level) => [
      supportTerm(
        "skill-area",
        "Skill Area",
        -30,
        "percent",
        "geometry-input",
        "supported Melee Attack action",
      ),
      supportTerm(
        "additional-area-damage",
        "additional Area Damage",
        11 + level * 0.5,
        "percent",
        "additional-damage-input",
        "area portion of supported Melee Attack actions",
      ),
      supportTerm(
        "additional-ailment-damage",
        "additional Ailment Damage",
        11 + level * 0.5,
        "percent",
        "additional-damage-input",
        "ailments from supported Melee Attack actions",
      ),
      supportTerm(
        "attack-speed",
        "Attack Speed",
        9.8 + level * 0.2,
        "percent",
        "speed-input",
        "supported Melee Attack action",
      ),
    ]),
  },
  [PRECISE_SUPERPOWER_ID]: {
    name: "Precise: Superpower",
    expectedType: "support",
    compile: (support) => withLevel(support, (level) => [
      supportTerm(
        "origin-effect",
        "Origin of Spirit Magus effect",
        48 + level * 0.2,
        "percent",
        "origin-effect-input",
        "Origin provided by the supported summon",
      ),
      supportTerm(
        "sealed-mana-compensation",
        "Sealed Mana Compensation",
        -20,
        "percent",
        "resource-input",
        "supported summon",
      ),
    ]),
  },
  [FRIEND_OF_SPIRIT_MAGI_ID]: {
    name: "Friend of Spirit Magi",
    expectedType: "support",
    compile: (support) => withLevel(support, (level) => [
      supportTerm(
        "required-spirit-magus-types",
        "required simultaneous Spirit Magus types",
        2,
        "count",
        "origin-effect-input",
        "player summon state",
      ),
      supportTerm(
        "conditional-origin-effect",
        "Origin of Spirit Magus effect",
        51 + level * 0.2,
        "percent",
        "origin-effect-input",
        "Origin provided by the supported summon",
        "at least 2 Spirit Magus types exist at the same time",
      ),
      supportTerm(
        "sealed-mana-compensation",
        "Sealed Mana Compensation",
        -30,
        "percent",
        "resource-input",
        "supported summon",
      ),
    ]),
  },
  [PROTECTION_FIELD_ID]: {
    name: "Protection Field",
    expectedType: "support",
    compile: (support) => withLevel(support, (level) => [
      supportTerm(
        "damage-transfer",
        "player damage taken transferred to summoned Minions",
        round(4.95 + level * 0.05),
        "percent",
        "survival-transfer-input",
        "player and Minions from the supported summon",
      ),
      supportTerm(
        "sealed-mana-compensation",
        "Sealed Mana Compensation",
        -30,
        "percent",
        "resource-input",
        "supported summon",
      ),
    ]),
  },
  [PRECISE_PROTECTION_FIELD_ID]: {
    name: "Precise: Protection Field",
    expectedType: "support",
    compile: (support) => withLevel(support, (level) => [
      supportTerm(
        "damage-transfer",
        "player damage taken transferred to summoned Minions",
        round(7.95 + level * 0.05),
        "percent",
        "survival-transfer-input",
        "player and Minions from the supported summon",
      ),
      supportTerm(
        "sealed-mana-compensation",
        "Sealed Mana Compensation",
        -30,
        "percent",
        "resource-input",
        "supported summon",
      ),
      supportTerm(
        "taunt-interval",
        "nearby-enemy Taunt interval",
        6,
        "seconds",
        "utility-input",
        "Minions from the supported summon",
      ),
    ]),
  },
  [ELEMENTAL_DUO_ID]: {
    name: "Elemental Duo",
    expectedType: "support",
    compile: (support) => withLevel(support, (level) => [
      supportTerm(
        "maximum-summonable-minions",
        "maximum summonable Minions",
        1,
        "count",
        "rotation-input",
        "supported summon",
      ),
      supportTerm(
        "additional-minion-damage",
        "additional damage",
        15 + level * 0.5,
        "percent",
        "additional-damage-input",
        "Minions from the supported summon",
      ),
    ]),
  },
  [AILMENT_TERMINATION_ID]: {
    name: "Ailment Termination",
    expectedType: "support",
    compile: (support) => withLevel(support, (level) => [
      supportTerm(
        "additional-damage-per-ailment",
        "additional damage per Ailment type on the enemy (multiplies)",
        round(6.6 + level * 0.1),
        "percent",
        "ailment-input",
        "supported hit action",
        "multiplied once per Ailment type present",
      ),
      supportTerm(
        "ailment-duration",
        "Ailment Duration",
        -30,
        "percent",
        "ailment-input",
        "ailments from the supported action",
      ),
    ]),
  },
  [FREQUENT_QUAKE_ID]: {
    name: "Summon Erosion Magus: Frequent Quake (Magnificent)",
    expectedType: "magnificent_support",
    allowedSlotIndex: 2,
    compile: (support, summonSkillId) => {
      if (summonSkillId !== SUMMON_EROSION_MAGUS_ID) {
        return {
          code: "wrong-summon-for-frequent-quake",
          message: "Frequent Quake is source-scoped to Summon Erosion Magus.",
        };
      }
      const roll = rollTier(
        support,
        { 2: [-35, -30], 1: [-25, -20], 0: [-15, -8] },
        "unsupported-frequent-quake-roll",
        "Frequent Quake requires rank 1 and an explicit roll inside its SS13 selected-tier bounds.",
      );
      if (typeof roll !== "number") return roll;
      return [
        supportTerm(
          "additional-minion-damage",
          "additional damage",
          20,
          "percent",
          "additional-damage-input",
          "Minions from the supported summon",
        ),
        supportTerm(
          "empower-auto-trigger-interval",
          "Base/Enhanced auto-trigger interval",
          0.4,
          "seconds",
          "rotation-input",
          "Minions from the supported summon",
          "while their Empower Skill lasts; target is the highest-Rarity enemy within 15 m",
        ),
        supportTerm(
          "empower-duration",
          "additional Empower Skill duration",
          roll,
          "percent",
          "rotation-input",
          "Minions from the supported summon",
        ),
      ];
    },
  },
  [MALADY_ID]: {
    name: "Summon Erosion Magus: Malady (Noble)",
    expectedType: "noble_support",
    allowedSlotIndex: 4,
    compile: (support, summonSkillId) => {
      if (summonSkillId !== SUMMON_EROSION_MAGUS_ID) {
        return {
          code: "wrong-summon-for-malady",
          message: "Malady is source-scoped to Summon Erosion Magus.",
        };
      }
      const roll = rollTier(
        support,
        { 2: [17, 19], 1: [20, 22], 0: [24, 30] },
        "unsupported-malady-roll",
        "Malady requires rank 1 and an explicit roll inside its SS13 selected-tier bounds.",
      );
      if (typeof roll !== "number") return roll;
      return [
        supportTerm(
          "additional-minion-damage-fixed",
          "additional damage",
          20,
          "percent",
          "additional-damage-input",
          "Minions from the supported summon",
        ),
        supportTerm(
          "enhanced-skill-cast-speed",
          "additional Cast Speed for the Enhanced Skill",
          -20,
          "percent",
          "speed-input",
          "Enhanced Skill of Minions from the supported summon",
        ),
        supportTerm(
          "additional-minion-damage-roll",
          "additional damage from the rolled line",
          roll,
          "percent",
          "additional-damage-input",
          "Minions from the supported summon",
        ),
        supportTerm(
          "auto-trigger-cast-speed-coupling",
          "auto-trigger interval is affected by Cast Speed",
          1,
          "count",
          "rotation-input",
          "Minions from the supported summon",
          "while their Empower Skill lasts; this is a mechanic flag, not a multiplier",
        ),
      ];
    },
  },
};

function summonDisplayName(summonSkillId: string) {
  return summonSkillId === SUMMON_ROCK_MAGUS_ID
    ? "Summon Rock Magus"
    : summonSkillId === SUMMON_EROSION_MAGUS_ID
      ? "Summon Erosion Magus"
      : "Unsupported Spirit Magus summon";
}

function compileSupport(
  support: any,
  summonSkillId: string,
  supportIndex: number,
  sourceLocator: string,
): MinionSupportEvidence {
  const summonName = summonDisplayName(summonSkillId);
  const identity: MinionSupportSocketIdentity = {
    actorId: summonSkillId,
    actorName: summonName,
    skillId: summonSkillId,
    skillName: summonName,
    socketIndex: supportIndex,
    socketId: `support:${supportIndex}`,
  };
  if (!support || typeof support !== "object" || Array.isArray(support)) {
    return {
      ...identity,
      status: "unsupported",
      isDps: false,
      supportId: "",
      supportName: null,
      blockers: [{
        code: "malformed-minion-support-record",
        message: "A non-empty support socket must contain one Compendium support object.",
        evidence: sourceLocator,
      }],
    };
  }
  const supportId = String(support?.supportGuid ?? "");
  const definition = MINION_SUPPORTS[supportId];
  if (!definition) {
    return {
      ...identity,
      status: "unsupported",
      isDps: false,
      supportId,
      supportName: null,
      blockers: [{
        code: "unsupported-minion-support-formula",
        message: "This socket has no source-term compiler in the guarded SS13 Spirit Magus subset.",
        evidence: sourceLocator,
      }],
    };
  }
  if (support.type !== definition.expectedType) {
    return {
      ...identity,
      status: "unsupported",
      isDps: false,
      supportId,
      supportName: definition.name,
      blockers: [{
        code: "invalid-minion-support-installation",
        message: `${definition.name} requires support type ${definition.expectedType}; received ${String(support.type ?? "missing")}. Parent enablement is validated on the summon record.`,
        evidence: sourceLocator,
      }],
    };
  }
  if (support.rollValues !== undefined
      && (!Array.isArray(support.rollValues)
        || support.rollValues.some((roll: unknown) =>
          typeof roll !== "number" || !Number.isFinite(roll)))) {
    return {
      ...identity,
      status: "unsupported",
      isDps: false,
      supportId,
      supportName: definition.name,
      blockers: [{
        code: "malformed-minion-support-rolls",
        message: `${definition.name} has a malformed rollValues projection.`,
        evidence: sourceLocator,
      }],
    };
  }
  const isOrdinaryLevelSupport = definition.expectedType === "support";
  if (isOrdinaryLevelSupport
      && (support.tier !== undefined
        || support.rank !== undefined
        || support.rollValues !== undefined)) {
    return {
      ...identity,
      status: "unsupported",
      isDps: false,
      supportId,
      supportName: definition.name,
      blockers: [{
        code: "invalid-minion-support-encoding",
        message: `${definition.name} is an ordinary level support and must not carry tier, rank, or rolled-value metadata.`,
        evidence: sourceLocator,
      }],
    };
  }
  if (!isOrdinaryLevelSupport && support.level !== undefined) {
    return {
      ...identity,
      status: "unsupported",
      isDps: false,
      supportId,
      supportName: definition.name,
      blockers: [{
        code: "invalid-minion-support-encoding",
        message: `${definition.name} is a rolled special support and must not carry an ordinary support level.`,
        evidence: sourceLocator,
      }],
    };
  }
  const effects = definition.compile(support, summonSkillId);
  if (!Array.isArray(effects)) {
    return {
      ...identity,
      status: "unsupported",
      isDps: false,
      supportId,
      supportName: definition.name,
      blockers: [{
        ...effects,
        evidence: effects.evidence ?? sourceLocator,
      }],
    };
  }
  if (definition.allowedSlotIndex !== undefined
      && supportIndex !== definition.allowedSlotIndex) {
    return {
      ...identity,
      status: "unsupported",
      isDps: false,
      supportId,
      supportName: definition.name,
      blockers: [{
        code: "invalid-minion-support-socket",
        message: `${definition.name} requires support socket ${definition.allowedSlotIndex + 1}; received socket ${supportIndex + 1}.`,
        evidence: sourceLocator,
      }],
    };
  }
  return {
    ...identity,
    status: "source-terms",
    isDps: false,
    supportId,
    supportName: definition.name,
    supportType: String(support?.type ?? "support"),
    level: levelOf(support?.level),
    tier: typeof support?.tier === "number" && Number.isSafeInteger(support.tier)
      ? support.tier
      : null,
    rank: typeof support?.rank === "number" && Number.isSafeInteger(support.rank)
      ? support.rank
      : null,
    rollValues: numericRolls(support),
    effects,
    provenance: [
      {
        source: "imported Compendium/tli_dump loadout",
        locator: sourceLocator,
        confidence: "source-data",
      },
      {
        ...SS13_SUPPORT_FORMULA_SOURCE,
        locator: `skill/*/master.skills[id=${supportId}]`,
      },
      {
        ...SS13_SKILL_TEXT_SOURCE,
        locator: `skill/*/i18n/en.skills[id=${supportId}]`,
      },
    ],
    netDps: {
      status: "not-calculated",
      blockers: [{
        code: "context-dependent-minion-support-value",
        message: "Net value needs action selection, stage, Growth/Breeze, target state, overlap, and conditional uptime.",
      }],
    },
  };
}

export interface SpiritMagusActionCompileContext {
  patch: unknown;
  sourceLocator: string;
}

export function compileSpiritMagusActionSet(
  summonSkill: any,
  context: SpiritMagusActionCompileContext,
): CompiledMinionActionSet | CalculationBlocker {
  if (context.patch !== "SS13") {
    return {
      code: "unsupported-patch",
      message: `Spirit Magus action evidence is season-pinned to SS13 (received ${String(context.patch ?? "no patch")}).`,
    };
  }
  if (typeof context.sourceLocator !== "string" || !context.sourceLocator.trim()) {
    return {
      code: "missing-summon-source-locator",
      message: "Spirit Magus evidence requires the imported parent-skill locator.",
    };
  }
  if (summonSkill?.enabled !== true) {
    return {
      code: "disabled-summon-skill",
      message: "Spirit Magus action evidence requires an explicitly enabled parent summon skill.",
    };
  }
  const summonSkillId = String(summonSkill?.skillGuid ?? "");
  if (summonSkillId !== SUMMON_ROCK_MAGUS_ID
      && summonSkillId !== SUMMON_EROSION_MAGUS_ID) {
    return {
      code: "unsupported-summon-action-set",
      message: "Action evidence currently supports only Rock Magus and Erosion Magus.",
    };
  }
  const level = levelOf(summonSkill?.level);
  if (level === null) {
    return {
      code: "unsupported-summon-action-level",
      message: `Summon level ${String(summonSkill?.level)} is outside the exact SS13 integer 1-40 tables.`,
    };
  }
  const baseline = baselineFor(summonSkillId, level);
  const actions = summonSkillId === SUMMON_ROCK_MAGUS_ID
    ? rockActions(baseline)
    : erosionActions(baseline);
  const supportSlots = summonSkill?.supports;
  const supports: MinionSupportEvidence[] = !Array.isArray(supportSlots)
    || supportSlots.length !== 5
    ? [{
        actorId: summonSkillId,
        actorName: summonDisplayName(summonSkillId),
        skillId: summonSkillId,
        skillName: summonDisplayName(summonSkillId),
        socketIndex: -1,
        socketId: "support-set",
        status: "unsupported",
        isDps: false,
        supportId: "",
        supportName: null,
        blockers: [{
          code: "malformed-minion-support-sockets",
          message: "The imported summon must expose exactly five support socket positions; support terms are withheld for this parent.",
          evidence: Array.isArray(supportSlots)
            ? `received ${supportSlots.length} positions`
            : "supports is not an array",
        }],
      }]
    : supportSlots.flatMap((support: any, supportIndex: number) =>
        support == null
          ? []
          : [compileSupport(
              support,
              summonSkillId,
              supportIndex,
              `${context.sourceLocator}.supports[${supportIndex}]`,
            )]);
  const provenance = [
    ...baseline.provenance,
    ...actions.flatMap((action) => action.provenance),
    ...supports.flatMap((support) =>
      support.status === "source-terms" ? support.provenance : []),
  ];
  return {
    baseline,
    actions,
    supports,
    provenance,
    isDps: false,
    isTotalMinionEhp: false,
    blockers: [
      {
        code: "missing-minion-runtime-state",
        message: "Stage, Growth, Breeze, merge/Vigilant state, enhanced-skill chance, and conditional uptime are not deterministic in the build snapshot.",
      },
      {
        code: "missing-minion-ai-rotation",
        message: "The source exposes individual actions but not a deterministic single-target AI rotation or effective overlap count.",
      },
      {
        code: "unsupported-minion-modifier-pools",
        message: "Gear, talents, memories, slates, pacts, kismets, curses, and buffs are not yet fully routed into the minion actor.",
      },
    ],
  };
}

function selectedTraitIds(loadout: any): Set<string> {
  const traits = loadout?.hero?.traits;
  if (!traits || typeof traits !== "object" || Array.isArray(traits)) {
    return new Set();
  }
  const selected = new Set<string>();
  const expectedSlots = [
    ["level1", VIGILANT_BREEZE_TRAIT_ID],
    ["level45", WHIRLWIND_TANGO_TRAIT_ID],
    ["level60", HAPPIEST_REUNION_TRAIT_ID],
    ["level75", NURTURING_BREEZE_TRAIT_ID],
  ] as const;
  const values = Object.values(traits);
  for (const [slot, traitId] of expectedSlots) {
    if (traits[slot] === traitId
        && values.filter((value) => value === traitId).length === 1) {
      selected.add(traitId);
    }
  }
  return selected;
}

export function compileIrisTraitEvidence(loadout: any): IrisTraitEvidence[] {
  const heroId = loadout?.hero?.heroGuid ?? loadout?.hero?.heroId;
  if (heroId !== IRIS_VIGILANT_BREEZE_ID) return [];
  const selected = selectedTraitIds(loadout);
  const evidence: IrisTraitEvidence[] = [];
  const push = (
    traitId: string,
    traitName: string,
    unlockLevel: IrisTraitEvidence["unlockLevel"],
    terms: IrisTraitTerm[],
    unresolved: string[] = [],
  ): void => {
    if (!selected.has(traitId)) return;
    evidence.push({
      traitId,
      traitName,
      unlockLevel,
      terms,
      unresolved,
      provenance: [{
        ...SS13_HERO_TRAIT_TEXT_SOURCE,
        locator: `${SS13_HERO_TRAIT_TEXT_SOURCE.locator}[id=${traitId}]`,
      }],
      isDps: false,
      isTotalEhp: false,
    });
  };

  push(
    VIGILANT_BREEZE_TRAIT_ID,
    "Vigilant Breeze",
    1,
    [
      traitTerm(
        "initial-breeze",
        "Breeze stacks gained on merge",
        [5],
        "stacks",
        "merged-spirit-magi",
        "rotation-input",
      ),
      traitTerm(
        "vigilant-life-consumption",
        "Max Life consumed per second",
        [20],
        "percent",
        "merged-spirit-magi",
        "resource-input",
        "Vigilant and not Reconjuring",
      ),
      traitTerm(
        "base-maximum-breeze",
        "base maximum Breeze stacks",
        [10],
        "stacks",
        "merged-spirit-magi",
        "rotation-input",
        "Vigilant and not Reconjuring",
      ),
      traitTerm(
        "tier-additional-minion-damage",
        "additional Minion Damage",
        [0, 5, 10, 15, 20],
        "percent",
        "spirit-magi",
        "additional-damage-input",
        "depends on unencoded trait enhancement",
        "unresolved-trait-enhancement",
      ),
      traitTerm(
        "tier-five-growth-per-breeze",
        "Growth per Breeze stack",
        [6],
        "count",
        "merged-spirit-magi",
        "growth-input",
        "trait enhancement 5 only",
      ),
    ],
    ["The planner snapshot selects the trait but does not encode its enhancement level (1-5)."],
  );

  push(
    WHIRLWIND_TANGO_TRAIT_ID,
    "Whirlwind Tango",
    45,
    [
      traitTerm(
        "ultimate-cooldown",
        "Ultimate cooldown while merged",
        [0],
        "seconds",
        "merged-spirit-magi",
        "rotation-input",
      ),
      traitTerm(
        "additional-spirit-magus-skill-damage",
        "additional Spirit Magus Skill Damage",
        [-60],
        "percent",
        "spirit-magi",
        "additional-damage-input",
      ),
      traitTerm(
        "ultimate-life-consumption",
        "Max Life consumed per Ultimate",
        [10, 9, 8, 7, 6],
        "percent",
        "merged-spirit-magi",
        "resource-input",
        "depends on unencoded trait enhancement",
        "unresolved-trait-enhancement",
      ),
      traitTerm(
        "breeze-per-ultimate",
        "Breeze stacks gained per Ultimate",
        [2, 3, 3, 4, 4],
        "stacks",
        "merged-spirit-magi",
        "rotation-input",
        "depends on unencoded trait enhancement",
        "unresolved-trait-enhancement",
      ),
    ],
    ["No-cooldown does not mean infinite casts: cast time, AI, life consumption, and other actions still govern cadence."],
  );

  push(
    HAPPIEST_REUNION_TRAIT_ID,
    "Happiest Reunion",
    60,
    [
      traitTerm(
        "maximum-spirit-magi-in-map",
        "maximum Spirit Magi in the map",
        [1],
        "count",
        "spirit-magi",
        "quantity-input",
      ),
      traitTerm(
        "per-spirit-magus-additional-damage",
        "additional damage per Spirit Magus (multiplies)",
        [1, 2, 3, 4, 5],
        "percent",
        "merged-spirit-magi",
        "additional-damage-input",
        "Vigilant; depends on unencoded trait enhancement",
        "unresolved-trait-enhancement",
      ),
      traitTerm(
        "life-consumption-per-spirit-magus",
        "additional Max Life consumption per Spirit Magus",
        [8, 7, 7, 6, 6],
        "percent",
        "merged-spirit-magi",
        "resource-input",
        "Vigilant and not Reconjuring; depends on unencoded trait enhancement",
        "unresolved-trait-enhancement",
      ),
    ],
    ["The planner snapshot does not encode the enhancement selector for the slash-separated values."],
  );

  push(
    NURTURING_BREEZE_TRAIT_ID,
    "Nurturing Breeze",
    75,
    [
      traitTerm(
        "player-additional-damage-taken",
        "additional damage taken by Iris",
        [-20, -24, -28, -32, -36],
        "percent",
        "player",
        "damage-taken-input",
        "Vigilant; depends on unencoded trait enhancement",
        "unresolved-trait-enhancement",
      ),
      traitTerm(
        "life-regeneration-transfer",
        "player Life Regeneration bonuses also applied to merged Spirit Magi",
        [50, 60, 70, 80, 100],
        "percent",
        "merged-spirit-magi",
        "recovery-transfer-input",
        "depends on unencoded trait enhancement",
        "unresolved-trait-enhancement",
      ),
      traitTerm(
        "regain-transfer",
        "player Life/Shield Regain bonuses also applied to merged Spirit Magi",
        [100, 120, 140, 160, 200],
        "percent",
        "merged-spirit-magi",
        "recovery-transfer-input",
        "depends on unencoded trait enhancement",
        "unresolved-trait-enhancement",
      ),
    ],
    ["The exact candidate is shown, but total player/minion EHP needs the missing enhancement selector and runtime state."],
  );

  return evidence;
}
