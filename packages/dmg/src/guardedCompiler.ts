/*
 * Guarded computation entry point for arbitrary Compendium/tli_dump loadouts.
 *
 * The existing buildParser is a calibrated Rehan/Spectral Slash compiler.  It
 * must not be used as a generic actor compiler: its defaults, support handling,
 * derived Frostbite state, and manual overrides are Rehan-specific.
 *
 * This module intentionally exposes only a much narrower SS13 Bing metric that
 * the imported document can prove: the equipped weapon's contribution to one
 * raw Hammer of Ash hit, before global increases, additional multipliers,
 * critical strikes, conversion mitigation, bomb geometry, or enemy state.
 * The result is not DPS.  Every unsupported full calculation stays explicit.
 */

export const BING_BLAST_NOVA_ID = "c89dce15-cbeb-562d-83ec-993059bbf0ec";
export const IRIS_VIGILANT_BREEZE_ID = "d397380a-d947-5f11-b25e-381cf6311f04";
export const HAMMER_OF_ASH_ID = "6f020b6a-022b-50eb-8299-e5fc7492ea8f";
export const SUMMON_ROCK_MAGUS_ID = "2ad962ee-319f-590b-b49f-29fe40ed868c";
export const SUMMON_EROSION_MAGUS_ID = "95109085-5149-578b-b165-e38facc3cbaa";

export interface FormulaProvenance {
  source: string;
  locator: string;
  sha256?: string;
  confidence?: "source-data" | "confirmed-mechanic" | "inferred-mechanic";
}

/**
 * Frozen source identity for the level table below.
 *
 * `poorchlight/tli_dump/data/compendium-catalog-ss13.json` independently pins
 * the UUID to Hammer of Ash (native tlidbId 7006).  The formula values are in
 * Compendium's season-pinned master bundle, which the poorchlight catalog
 * generator already consumes for entity materialization but does not retain in
 * its compact output.
 */
export const SS13_HAMMER_FORMULA_SOURCE: FormulaProvenance = {
  source: "https://tlicompendium.com/data-bundles/SS13-skill-master.json",
  locator: "skill/Active/master.skills[id=6f020b6a-022b-50eb-8299-e5fc7492ea8f].levelProgression",
  sha256: "91a676a558e6a7b811edc9256caec53c539398f93aac3b9a1f55c5c998d7ae91",
  confidence: "source-data",
};

export const WEAPON_FOUNDATION_RULE_SOURCE: FormulaProvenance = {
  source: "rehan_guide/docs/mechanics.md",
  locator: "Weapon base order plus rows 93, 96, and 101; implemented by damageModel.weaponPhysAvg/weaponAvg",
  confidence: "confirmed-mechanic",
};

const HAMMER_WAD_LEVEL_1_TO_20 = [
  126, 135, 144, 154, 164, 174, 185, 197, 209, 221,
  233, 246, 260, 274, 289, 304, 319, 335, 352, 369,
] as const;

export interface HammerOfAshFormula {
  patch: "SS13";
  skillId: typeof HAMMER_OF_ASH_ID;
  level: number;
  weaponAttackDamagePct: number;
  baseProjectileQuantity: number;
  addedProjectileQuantity: number;
  demolisherChargeIntervalSeconds: number;
  demolisherAdditionalHitDamagePct: number;
  physicalToFireConversionPct: number;
  shotgunFalloffPct: number;
  provenance: FormulaProvenance;
}

/**
 * Exact intrinsic SS13 skill values.  Levels 21-40 are explicitly 369 in the
 * source table rather than extrapolated.
 */
export function ss13HammerOfAshFormula(level: number): HammerOfAshFormula | null {
  if (!Number.isInteger(level) || level < 1 || level > 40) return null;
  return {
    patch: "SS13",
    skillId: HAMMER_OF_ASH_ID,
    level,
    weaponAttackDamagePct: level <= 20 ? HAMMER_WAD_LEVEL_1_TO_20[level - 1] : 369,
    baseProjectileQuantity: 1,
    addedProjectileQuantity: 2,
    demolisherChargeIntervalSeconds: 3,
    demolisherAdditionalHitDamagePct: 215,
    physicalToFireConversionPct: 100,
    shotgunFalloffPct: 70,
    provenance: SS13_HAMMER_FORMULA_SOURCE,
  };
}

export interface CalculationBlocker {
  code: string;
  message: string;
  evidence?: string;
}

export interface NotCalculated {
  status: "not-calculated";
  blockers: CalculationBlocker[];
}

export interface WeaponDamageRange {
  min: number;
  max: number;
  average: number;
}

export interface WeaponFoundation {
  status: "calculated-partial";
  kind: "weapon-hit-foundation";
  isDps: false;
  scope: "equipped-main-hand weapon contribution to one raw Hammer of Ash hit";
  patch: "SS13";
  heroId: typeof BING_BLAST_NOVA_ID;
  skillId: typeof HAMMER_OF_ASH_ID;
  skillLevel: number;
  confidence: "confirmed-partial" | "inferred-partial";
  weaponName: string;
  weaponPhysical: WeaponDamageRange;
  weaponElemental: Record<"cold" | "fire" | "lightning" | "erosion", WeaponDamageRange>;
  weaponTotal: WeaponDamageRange;
  localWeaponAttackRate: number;
  skillWeaponAttackDamagePct: number;
  rawWeaponSourcedHit: WeaponDamageRange;
  provenance: FormulaProvenance[];
  excludedFromMetric: string[];
}

export interface PartialUnavailable {
  status: "not-calculated";
  kind: "weapon-hit-foundation";
  isDps: false;
  blockers: CalculationBlocker[];
}

export type WeaponFoundationResult = WeaponFoundation | PartialUnavailable;

export interface WeaponFoundationComparison {
  status: "calculated-partial";
  kind: "weapon-hit-foundation-comparison";
  isDps: false;
  scope: WeaponFoundation["scope"];
  before: {
    loadoutIndex: number;
    loadoutName: string;
    foundation: WeaponFoundation;
  };
  after: {
    loadoutIndex: number;
    loadoutName: string;
    foundation: WeaponFoundation;
  };
  change: {
    rawHitDelta: number;
    rawHitRatio: number;
    rawHitDeltaPct: number;
    direction: "gain" | "loss" | "unchanged";
  };
  provenance: FormulaProvenance[];
  warning: string;
}

export interface UnavailableFoundationComparison {
  status: "not-calculated";
  kind: "weapon-hit-foundation-comparison";
  isDps: false;
  blockers: CalculationBlocker[];
}

export type WeaponFoundationComparisonResult =
  | WeaponFoundationComparison
  | UnavailableFoundationComparison;

export interface GuardedBuildAssessment {
  patch: string | null;
  loadoutIndex: number;
  loadoutName: string;
  actor: "player" | "minion" | "unknown";
  heroId: string | null;
  targetSkillIds: string[];
  dps: NotCalculated;
  ehp: NotCalculated;
  weaponFoundation: WeaponFoundationResult;
}

interface TextLine {
  text: string;
  source: string;
}

interface Range {
  min: number;
  max: number;
}

function average(range: Range): number {
  return (range.min + range.max) / 2;
}

function withAverage(range: Range): WeaponDamageRange {
  return { ...range, average: average(range) };
}

function emptyRange(): Range {
  return { min: 0, max: 0 };
}

function addRange(target: Range, min: number, max: number): void {
  target.min += min;
  target.max += max;
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function fillHashes(template: unknown, rawValues: unknown): string | null {
  if (typeof template !== "string") return null;
  const values = Array.isArray(rawValues)
    ? rawValues.map((entry: any) => finiteNumber(entry?.value ?? entry))
    : [];
  let index = 0;
  const text = template.replace(/#/g, () => {
    const value = values[index++];
    return value === null || value === undefined ? "__MISSING_ROLL__" : String(value);
  });
  return text.includes("__MISSING_ROLL__") ? null : text;
}

function splitLine(text: string, source: string): TextLine[] {
  return text
    .split(/\r?\n|<br\s*\/?>/i)
    .map((part) => part.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((part) => ({ text: part, source }));
}

function itemLines(item: any, slot: string, includeBaseImplicits = true): TextLine[] {
  const lines: TextLine[] = [];
  const push = (text: unknown, source: string): void => {
    if (typeof text === "string") lines.push(...splitLine(text, source));
  };

  if (includeBaseImplicits) {
    for (const [index, implicit] of (item?.baseItem?.implicits ?? []).entries()) {
      push(implicit?.description ?? implicit?.rawText, `${slot}.baseItem.implicits[${index}]`);
    }
  }
  for (const [index, modifier] of (item?.legendaryMods ?? []).entries()) {
    push(modifier?.description ?? modifier?.rawText, `${slot}.legendaryMods[${index}]`);
  }
  for (const collection of ["prefixes", "suffixes", "affixes"] as const) {
    for (const [index, modifier] of (item?.[collection] ?? []).entries()) {
      if (!modifier) continue;
      const source = `${slot}.${collection}[${index}]`;
      const rendered = fillHashes(
        modifier.modifierDescription ?? modifier.description,
        modifier.rolledValues ?? modifier.values,
      );
      if (rendered !== null) push(rendered, source);
    }
  }
  for (const field of [
    "baseAffix", "baseAffix2", "sweetDreamAffix", "corrosionImplicit", "towerSequence",
  ] as const) {
    push(item?.[field]?.description ?? item?.[field]?.rawText, `${slot}.${field}`);
  }
  return lines;
}

function equippedInventory(loadout: any): Map<string, any> {
  return new Map<string, any>(
    [...(loadout?.gear?.inventory ?? []), ...(loadout?.vorax?.inventory ?? [])]
      .filter((item: any) => typeof item?.id === "string")
      .map((item: any) => [item.id, item]),
  );
}

function notCalculated(...blockers: CalculationBlocker[]): NotCalculated {
  return { status: "not-calculated", blockers };
}

function unavailableFoundation(...blockers: CalculationBlocker[]): PartialUnavailable {
  return {
    status: "not-calculated",
    kind: "weapon-hit-foundation",
    isDps: false,
    blockers,
  };
}

function loadoutAt(build: any, loadoutIndex: number): any | null {
  const loadouts = build?.loadouts?.loadouts;
  return Array.isArray(loadouts) ? loadouts[loadoutIndex] ?? null : null;
}

function activeSkill(loadout: any, skillId: string): any | null {
  return (loadout?.skills?.activeSkills ?? [])
    .find((skill: any) => skill?.skillGuid === skillId && skill?.enabled !== false) ?? null;
}

function mainHandBase(
  mainHand: any,
): { physical: Range; elemental: Record<"cold" | "fire" | "lightning" | "erosion", Range>;
     attackRate: number; provenance: FormulaProvenance[] } | CalculationBlocker {
  const physical = emptyRange();
  const elemental = {
    cold: emptyRange(),
    fire: emptyRange(),
    lightning: emptyRange(),
    erosion: emptyRange(),
  };
  let attackRate: number | null = null;
  let baseDamageLines = 0;
  const provenance: FormulaProvenance[] = [];

  for (const [index, implicit] of (mainHand?.baseItem?.implicits ?? []).entries()) {
    const text = String(implicit?.description ?? implicit?.rawText ?? "").trim();
    const damage = /^(\d+(?:\.\d+)?) - (\d+(?:\.\d+)?) (Physical|Cold|Fire|Lightning|Erosion) Damage$/i.exec(text);
    if (damage) {
      const type = damage[3].toLowerCase();
      const target = type === "physical"
        ? physical
        : elemental[type as keyof typeof elemental];
      addRange(target, Number(damage[1]), Number(damage[2]));
      baseDamageLines += 1;
      provenance.push({
        source: "imported loadout",
        locator: `gear.mainHand.baseItem.implicits[${index}]: ${text}`,
        confidence: "source-data",
      });
      continue;
    }
    const speed = /^(\d+(?:\.\d+)?) Attack Speed$/i.exec(text);
    if (speed) {
      attackRate = Number(speed[1]);
      provenance.push({
        source: "imported loadout",
        locator: `gear.mainHand.baseItem.implicits[${index}]: ${text}`,
        confidence: "source-data",
      });
    }
  }

  if (baseDamageLines === 0 || physical.max <= 0) {
    return {
      code: "missing-main-hand-base-damage",
      message: "The equipped main-hand has no explicit physical base-damage implicit.",
      evidence: "A raw Hammer of Ash weapon hit requires the equipped weapon's exact base range.",
    };
  }
  if (attackRate === null || attackRate <= 0) {
    return {
      code: "missing-main-hand-attack-rate",
      message: "The equipped main-hand has no explicit positive Attack Speed implicit.",
    };
  }
  return { physical, elemental, attackRate, provenance };
}

/**
 * Computes the only imported Bing number currently supported by source-complete
 * inputs.  It returns no value at all if actor, patch, skill, weapon class, or
 * required rolls are outside the proven scope.
 */
export function compileBingWeaponFoundation(
  build: any,
  loadoutIndex = 0,
): WeaponFoundationResult {
  if (build?.patch !== "SS13") {
    return unavailableFoundation({
      code: "unsupported-patch",
      message: `Only the season-pinned SS13 formula table is available (received ${String(build?.patch ?? "no patch")}).`,
    });
  }
  const loadout = loadoutAt(build, loadoutIndex);
  if (!loadout) {
    return unavailableFoundation({
      code: "missing-loadout",
      message: `No loadout exists at index ${loadoutIndex}.`,
    });
  }
  const heroId = loadout?.hero?.heroGuid ?? loadout?.hero?.heroId;
  if (heroId !== BING_BLAST_NOVA_ID) {
    return unavailableFoundation({
      code: "unsupported-actor",
      message: "Weapon-hit foundation is currently implemented only for Bing: Blast Nova.",
      evidence: `Observed hero identity: ${String(heroId ?? "missing")}`,
    });
  }
  const skill = activeSkill(loadout, HAMMER_OF_ASH_ID);
  if (!skill) {
    return unavailableFoundation({
      code: "missing-hammer-of-ash",
      message: "The loadout has no enabled Hammer of Ash skill.",
    });
  }
  const formula = ss13HammerOfAshFormula(Number(skill.level));
  if (!formula) {
    return unavailableFoundation({
      code: "unsupported-skill-level",
      message: `Hammer of Ash level ${String(skill.level)} is outside the source table's integer 1-40 range.`,
    });
  }

  const inventory = equippedInventory(loadout);
  const mainHandId = loadout?.gear?.equipped?.mainHand;
  const mainHand = typeof mainHandId === "string" ? inventory.get(mainHandId) : null;
  if (!mainHand) {
    return unavailableFoundation({
      code: "missing-main-hand",
      message: "The equipped main-hand item could not be resolved from gear/vorax inventory.",
    });
  }
  if (mainHand.rarity !== "Rare"
      || mainHand.gearCategory !== "two_handed"
      || mainHand.gearSubType !== "two-handed_hammer") {
    return unavailableFoundation({
      code: "unsupported-main-hand-class",
      message: "The guarded foundation currently accepts only explicit Rare two-handed hammer rolls.",
      evidence: `${String(mainHand.rarity)} ${String(mainHand.gearCategory)}/${String(mainHand.gearSubType)}`,
    });
  }

  const base = mainHandBase(mainHand);
  if ("code" in base) return unavailableFoundation(base);
  const physical = { ...base.physical };
  const elemental = {
    cold: { ...base.elemental.cold },
    fire: { ...base.elemental.fire },
    lightning: { ...base.elemental.lightning },
    erosion: { ...base.elemental.erosion },
  };
  const provenance = [...base.provenance];
  let gearPhysicalPct = 0;
  let localAttackSpeedPct = 0;

  for (const line of itemLines(mainHand, "gear.mainHand", false)) {
    const localDamage = /^Adds (\d+(?:\.\d+)?) - (\d+(?:\.\d+)?) (Physical|Cold|Fire|Lightning|Erosion) Damage to the gear$/i.exec(line.text);
    if (localDamage) {
      const type = localDamage[3].toLowerCase();
      const target = type === "physical"
        ? physical
        : elemental[type as keyof typeof elemental];
      addRange(target, Number(localDamage[1]), Number(localDamage[2]));
      provenance.push({
        source: "imported loadout",
        locator: `${line.source}: ${line.text}`,
        confidence: "source-data",
      });
      continue;
    }
    const localPhysical = /^\+(\d+(?:\.\d+)?)% Gear Physical Damage$/i.exec(line.text);
    if (localPhysical) {
      gearPhysicalPct += Number(localPhysical[1]);
      provenance.push({
        source: "imported loadout",
        locator: `${line.source}: ${line.text}`,
        confidence: "source-data",
      });
    }
  }

  for (const [slot, itemId] of Object.entries<string | null>(loadout?.gear?.equipped ?? {})) {
    const item = itemId ? inventory.get(itemId) : null;
    if (!item) continue;
    for (const line of itemLines(item, `gear.${slot}`)) {
      const added = /^Adds (\d+(?:\.\d+)?) - (\d+(?:\.\d+)?) Physical Damage to the Main-Hand Weapon$/i.exec(line.text);
      if (added) {
        addRange(physical, Number(added[1]), Number(added[2]));
        provenance.push({
          source: "imported loadout",
          locator: `${line.source}: ${line.text}`,
          confidence: "source-data",
        });
        continue;
      }
      const speed = /^\+(\d+(?:\.\d+)?)% Main-Hand Weapon Attack Speed$/i.exec(line.text);
      if (speed) {
        localAttackSpeedPct += Number(speed[1]);
        provenance.push({
          source: "imported loadout",
          locator: `${line.source}: ${line.text}`,
          confidence: "source-data",
        });
      }
    }
  }

  physical.min *= 1 + gearPhysicalPct / 100;
  physical.max *= 1 + gearPhysicalPct / 100;
  const elementalTotal = Object.values(elemental).reduce(
    (sum, range) => ({ min: sum.min + range.min, max: sum.max + range.max }),
    emptyRange(),
  );
  const weaponTotal = {
    min: physical.min + elementalTotal.min,
    max: physical.max + elementalTotal.max,
  };
  const skillScale = formula.weaponAttackDamagePct / 100;
  const rawHit = {
    min: weaponTotal.min * skillScale,
    max: weaponTotal.max * skillScale,
  };
  const hasElementalWeaponBase = elementalTotal.min !== 0 || elementalTotal.max !== 0;
  provenance.push(
    formula.provenance,
    hasElementalWeaponBase
      ? {
          ...WEAPON_FOUNDATION_RULE_SOURCE,
          confidence: "inferred-mechanic",
          locator: `${WEAPON_FOUNDATION_RULE_SOURCE.locator}; elemental weapon-base routing is the inferred part`,
        }
      : WEAPON_FOUNDATION_RULE_SOURCE,
  );

  return {
    status: "calculated-partial",
    kind: "weapon-hit-foundation",
    isDps: false,
    scope: "equipped-main-hand weapon contribution to one raw Hammer of Ash hit",
    patch: "SS13",
    heroId: BING_BLAST_NOVA_ID,
    skillId: HAMMER_OF_ASH_ID,
    skillLevel: formula.level,
    confidence: hasElementalWeaponBase ? "inferred-partial" : "confirmed-partial",
    weaponName: String(mainHand.displayName ?? mainHand.baseItem?.name ?? "Main-hand"),
    weaponPhysical: withAverage(physical),
    weaponElemental: {
      cold: withAverage(elemental.cold),
      fire: withAverage(elemental.fire),
      lightning: withAverage(elemental.lightning),
      erosion: withAverage(elemental.erosion),
    },
    weaponTotal: withAverage(weaponTotal),
    localWeaponAttackRate: base.attackRate * (1 + localAttackSpeedPct / 100),
    skillWeaponAttackDamagePct: formula.weaponAttackDamagePct,
    rawWeaponSourcedHit: withAverage(rawHit),
    provenance,
    excludedFromMetric: [
      "global increased-damage pools",
      "all additional-damage multipliers",
      "critical strikes and double damage",
      "damage conversion, resistance, armor, and penetration",
      "Blast Nova bomb quantity, detonation cadence, projectile geometry, and shotgun overlap",
      "Deterioration and other damage over time",
      "support, trait, talent, memory, slate, pactspirit, kismet, curse, and buff effects",
    ],
  };
}

/**
 * UI/generator-ready A/B payload for the proven partial metric.  Keeping the
 * `isDps: false` discriminator at both the leaf and comparison level makes it
 * difficult for a consumer to accidentally promote this ratio to total DPS.
 */
export function compareBingWeaponFoundations(
  build: any,
  beforeIndex: number,
  afterIndex: number,
): WeaponFoundationComparisonResult {
  const before = compileBingWeaponFoundation(build, beforeIndex);
  const after = compileBingWeaponFoundation(build, afterIndex);
  if (before.status !== "calculated-partial" || after.status !== "calculated-partial") {
    const tagged = [
      ...(before.status === "not-calculated"
        ? before.blockers.map((blocker) => ({
            ...blocker,
            message: `Before loadout: ${blocker.message}`,
          }))
        : []),
      ...(after.status === "not-calculated"
        ? after.blockers.map((blocker) => ({
            ...blocker,
            message: `After loadout: ${blocker.message}`,
          }))
        : []),
    ];
    return {
      status: "not-calculated",
      kind: "weapon-hit-foundation-comparison",
      isDps: false,
      blockers: tagged,
    };
  }

  const beforeAverage = before.rawWeaponSourcedHit.average;
  const afterAverage = after.rawWeaponSourcedHit.average;
  if (!(beforeAverage > 0)) {
    return {
      status: "not-calculated",
      kind: "weapon-hit-foundation-comparison",
      isDps: false,
      blockers: [{
        code: "non-positive-before-foundation",
        message: "Before loadout: the raw weapon-hit foundation must be positive for a ratio.",
      }],
    };
  }
  const delta = afterAverage - beforeAverage;
  const ratio = afterAverage / beforeAverage;
  const beforeLoadout = loadoutAt(build, beforeIndex);
  const afterLoadout = loadoutAt(build, afterIndex);
  const provenance = new Map<string, FormulaProvenance>();
  for (const source of [...before.provenance, ...after.provenance]) {
    provenance.set(`${source.source}\u0000${source.locator}\u0000${source.sha256 ?? ""}`, source);
  }

  return {
    status: "calculated-partial",
    kind: "weapon-hit-foundation-comparison",
    isDps: false,
    scope: before.scope,
    before: {
      loadoutIndex: beforeIndex,
      loadoutName: String(beforeLoadout?.name ?? `Loadout ${beforeIndex + 1}`),
      foundation: before,
    },
    after: {
      loadoutIndex: afterIndex,
      loadoutName: String(afterLoadout?.name ?? `Loadout ${afterIndex + 1}`),
      foundation: after,
    },
    change: {
      rawHitDelta: delta,
      rawHitRatio: ratio,
      rawHitDeltaPct: (ratio - 1) * 100,
      direction: delta > 0 ? "gain" : delta < 0 ? "loss" : "unchanged",
    },
    provenance: [...provenance.values()],
    warning: "This compares only the equipped weapon's raw Hammer of Ash hit foundation; it is not total hit damage or DPS.",
  };
}

function commonEhpBlockers(): CalculationBlocker[] {
  return [
    {
      code: "missing-character-defence-baseline",
      message: "The imported planner loadout does not provide a source-complete base Life/ES/defence state.",
      evidence: "tli_dump portable-v3 is an equipment/loadout evidence projection, not a live character-stat sheet.",
    },
    {
      code: "missing-damage-scenario",
      message: "EHP requires a declared incoming damage type, hit size, enemy level, and conditional defensive uptime.",
    },
  ];
}

/**
 * Central safety assessment.  Consumers should read `dps.status`/`ehp.status`
 * rather than calling the Rehan parser for an arbitrary imported actor.
 */
export function assessCompendiumBuild(
  build: any,
  loadoutIndex = 0,
): GuardedBuildAssessment {
  const loadout = loadoutAt(build, loadoutIndex);
  const heroId = loadout?.hero?.heroGuid ?? loadout?.hero?.heroId ?? null;
  const activeIds: string[] = (loadout?.skills?.activeSkills ?? [])
    .filter((skill: any) => skill?.enabled !== false && typeof skill?.skillGuid === "string")
    .map((skill: any) => skill.skillGuid);
  const foundation = compileBingWeaponFoundation(build, loadoutIndex);

  if (heroId === BING_BLAST_NOVA_ID) {
    return {
      patch: typeof build?.patch === "string" ? build.patch : null,
      loadoutIndex,
      loadoutName: String(loadout?.name ?? `Loadout ${loadoutIndex + 1}`),
      actor: "player",
      heroId,
      targetSkillIds: activeIds.filter((id) => id === HAMMER_OF_ASH_ID),
      dps: notCalculated(
        {
          code: "missing-blast-nova-rotation",
          message: "Bomb placement, detonation cadence, effective single-target overlaps, and dud/trait behavior are not source-complete.",
        },
        {
          code: "missing-runtime-state",
          message: "Demolisher charge, Deterioration, curse, blessing, and conditional buff uptimes are not encoded as a deterministic snapshot.",
        },
        {
          code: "unsupported-imported-modifiers",
          message: "Actor-scoped support, trait, unique, talent, minion/sentry, and projectile-geometry effects are not fully compiled.",
        },
      ),
      ehp: notCalculated(...commonEhpBlockers()),
      weaponFoundation: foundation,
    };
  }

  if (heroId === IRIS_VIGILANT_BREEZE_ID) {
    const summonIds = activeIds.filter((id) =>
      id === SUMMON_ROCK_MAGUS_ID || id === SUMMON_EROSION_MAGUS_ID);
    return {
      patch: typeof build?.patch === "string" ? build.patch : null,
      loadoutIndex,
      loadoutName: String(loadout?.name ?? `Loadout ${loadoutIndex + 1}`),
      actor: "minion",
      heroId,
      targetSkillIds: summonIds,
      dps: notCalculated(
        {
          code: "missing-minion-action-formula",
          message: "The SS13 summon records expose summon count and player Origin effects, but not the Spirit Magus attack base, action coefficients, cooldowns, or AI rotation.",
        },
        {
          code: "missing-minion-actor-state",
          message: "Growth, merge/Vigilant state, quantity, inherited player bonuses, and minion-scoped support effects need a separate actor compiler.",
        },
      ),
      ehp: notCalculated(
        ...commonEhpBlockers(),
        {
          code: "unresolved-minion-damage-transfer",
          message: "Damage transfer to minions and Spirit Magus survivability cannot be folded into player EHP without minion life and uptime.",
        },
      ),
      weaponFoundation: foundation,
    };
  }

  return {
    patch: typeof build?.patch === "string" ? build.patch : null,
    loadoutIndex,
    loadoutName: String(loadout?.name ?? `Loadout ${loadoutIndex + 1}`),
    actor: "unknown",
    heroId: typeof heroId === "string" ? heroId : null,
    targetSkillIds: activeIds,
    dps: notCalculated({
      code: "unsupported-actor",
      message: "No actor-specific compiler is registered for this hero and main skill.",
    }),
    ehp: notCalculated(...commonEhpBlockers()),
    weaponFoundation: foundation,
  };
}
