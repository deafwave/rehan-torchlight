/* Pure damage model for Spectral Slash (boss single-target).

   Bucket semantics are fixed here; WHICH modifier goes in WHICH bucket is
   decided by docs/mechanics.md and encoded in the parser. Pure: no I/O. */


import { type Breakdown, type Chip, type Node as TNode, setValues } from "./trace.js";
export { resolve, impact } from "./trace.js";
export type { Breakdown, Chip, ChipKind, Node as TraceNode } from "./trace.js";

export type DamageType = "physical" | "lightning" | "cold" | "fire" | "erosion";

export interface Snapshot {
  base: Record<string, number>;
  increased: Record<string, number>;
  additional: Record<string, number>;
  // mechanics.md#support-additional-sum — when `conversion` is present, typed keys in
  // `increased` (physical/lightning/cold/fire/erosion/elemental) gate per portion by its
  // conversion HISTORY; `additional_typed` buckets are grouped under the same tags.
  // Without `conversion`, legacy behavior: every increased key sums (except erosion,
  // which scopes to the erosion portion) and only untyped `additional` exists.
  conversion?: Array<{ from: DamageType; to: DamageType; pct: number }>;
  additional_typed?: Record<string, Record<string, number>>;
  enemy_taken: Record<string, number>;
  // mechanics.md Paralysis row — taken multiplier DERIVED from the build's inflict
  // chance (binary uptime): dead "+% inflicted Effect" lines stay no-ops at chance 0
  paralysis?: { chance_pct: number; effect_inc_pct: number };
  // mechanics.md#double-damage — double_damage_chance_pct is a crit-independent whole-hit
  // multiplier (1 + min(chance,100)/100), not part of the crit-hit math
  crit: { chance_pct: number; damage_pct: number; additional_on_crit_pct?: number;
          crit_dmg_taken_pct?: number; double_damage_chance_pct?: number };
  // erosion_* present only on builds with Erosion damage (bing) — a separate damage
  // type with its own resistance, unaffected by elemental res or armor
  penetration: { cold_pct: number; armor_pct: number; erosion_pct?: number };
  enemy: { cold_res_pct: number; armor_reduction_pct: number; erosion_res_pct?: number };
  rotation: Record<string, number>;
  // mechanics.md#skill-type — names the rotation for the breakdown chips; auto-derived
  // from `rotation.bombs_per_throw` when absent. Descriptive only: never selects the branch.
  skill_type?: "bomb" | "combo";
  // mechanics.md#skill-tags — the main skill's tags (melee/attack/area/projectile/…). A
  // skill-scoped `increased` key applies iff the tag is present. This is the seam for adding
  // new skills: declare the skill's tags here. Absent ⇒ derived from the rotation shape.
  tags?: string[];
  // mechanics.md#deterioration — present only on builds with an Obliterate source
  deterioration?: Record<string, number>;
  _extras?: Record<string, number>;
  _derived?: Record<string, number>;
}

export const DEFAULT_SNAPSHOT: Snapshot = {
  base: {
    weapon_phys_min: 178, weapon_phys_max: 178,
    weapon_flat_cold_min: 126, weapon_flat_cold_max: 166,
    gear_phys_pct: 74,
    gain_phys_as_cold_pct: 0,
    weapon_attack_speed: 1.5,
    skill_weapon_pct: 127,
    flat_added_min: 0, flat_added_max: 0,
    flat_added_cold_min: 0, flat_added_cold_max: 0,
    added_damage_effectiveness_pct: 100,
  },
  increased: { physical: 0, attack: 0, melee: 0, area: 0, hit: 0,
               cold: 0, fire: 0, lightning: 0, elemental: 0,
               projectile: 0, ranged: 0, horizontal_projectile: 0, parabolic_projectile: 0,
               minion: 0, channeled: 0, triggered: 0, focus: 0, global: 0 },
  additional: { strength: 0, warcry_buffs: 0, ice_bond: 0, fervor: 0,
                sealed_life_mana: 0, blessings: 0, precise_auras: 0, misc: 0 },
  enemy_taken: { frostbite: 0, paralysis: 0,
                 cold_infiltration: 0, timid_curse: 0 },
  crit: { chance_pct: 5, damage_pct: 150 },
  penetration: { cold_pct: 0, armor_pct: 0 },
  // monster defaults ~30% each (user-reported 2026-07-15); both layers can go negative
  enemy: { cold_res_pct: 30, armor_reduction_pct: 30 },
  // Spectral Slash: starter, starter, finisher; the first starter applies Mark
  // (+30% additional taken, skill-inherent), the finisher consumes it
  rotation: { starters_per_cycle: 2, starter_weapon_pct: 100,
              attack_speed_inc_pct: 0, starter_additional_as_pct: 0,
              finisher_additional_as_pct: -40,
              extra_clones: 0, clone_falloff: 0.7, mark_taken_pct: 30,
              combo_points: 4, finisher_amp_pct: 30, finishers_per_cycle: 1 },
  // Spectral Slash: melee combo attack (mechanics.md#skill-tags)
  tags: ["melee", "attack", "area"],
};

function weaponPhysAvg(b: Record<string, number>): number {
  // joined_weapon_phys (Joined Force) is the off-hand's FINAL damage — its own
  // gear-phys already applied, so the main hand's must not scale it again
  return (b.weapon_phys_min + b.weapon_phys_max) / 2 * (1 + b.gear_phys_pct / 100)
       + (b.joined_weapon_phys ?? 0);
}

function weaponAvg(b: Record<string, number>): number {
  // mechanics.md#weapon-base-elements — weapon-base cold/fire/lightning share the lumped
  // elemental hit and are NOT scaled by Gear Physical Damage (phys-only). Erosion is a
  // separate type (erosionBase), not summed here.
  return weaponPhysAvg(b)
       + (b.weapon_flat_cold_min + b.weapon_flat_cold_max) / 2
       + ((b.weapon_flat_fire_min ?? 0) + (b.weapon_flat_fire_max ?? 0)) / 2
       + ((b.weapon_flat_lightning_min ?? 0) + (b.weapon_flat_lightning_max ?? 0)) / 2;
}

/** Average pre-crit, pre-mitigation hit. skillPct overrides base.skill_weapon_pct
    (used for starter vs finisher). */
export function averageHit(s: Snapshot, skillPct?: number): number {
  const b = s.base;
  const pct = (skillPct ?? b.skill_weapon_pct) / 100;
  const flat = (b.flat_added_min + b.flat_added_max) / 2 * b.added_damage_effectiveness_pct / 100;
  // "Adds Cold Damage to Attacks and Spells": already cold, so no phys->cold re-gain
  const flatCold = ((b.flat_added_cold_min ?? 0) + (b.flat_added_cold_max ?? 0)) / 2 * b.added_damage_effectiveness_pct / 100;
  let hit = weaponAvg(b) * pct + flat + flatCold;
  // "Adds X% of Physical Damage to Cold Damage": gained from the pre-conversion phys
  // portion (weapon phys + global flat adds, which are physical); flat cold is not re-gained
  hit += (weaponPhysAvg(b) * pct + flat) * (b.gain_phys_as_cold_pct ?? 0) / 100;
  return hit * damageEnvelope(s);
}

// The multiplicative envelope every damage type shares: increased pool (one additive
// sum) × additional buckets (each ×(1+v)) × enemy-taken debuffs. `increased.erosion` is
// excluded here — it is erosion-typed, applied in erosionAvg, not to the weapon hit.
// mechanics.md#skill-tags — projectile/ranged/horizontal/parabolic increases apply only to
// projectile skills (bombs are projectiles; Spectral Slash is melee). bombs_per_throw is the proxy.
// mechanics.md#skill-tags — `increased` keys that name a SKILL property: each applies only
// if the main skill carries that tag (s.tags). Everything else — damage types (physical/cold/
// fire/lightning/erosion/elemental), `global`, `hit`, and any custom increased-type key — is
// universal and always applies. Add a tag here to make it skill-scoped for every skill.
const SKILL_TAGS: ReadonlySet<string> = new Set([
  "melee", "attack", "area", "spell", "minion", "channeled", "triggered", "focus",
  "projectile", "ranged", "horizontal_projectile", "parabolic_projectile"]);
// Back-compat defaults when a snapshot predates s.tags: derived from the rotation shape.
// Hammer of Ash is melee-tagged even as a bomb (calibrated — the Bing snapshot carries melee).
const COMBO_SKILL_TAGS = ["melee", "attack", "area"];
const BOMB_SKILL_TAGS = ["melee", "attack", "area",
  "projectile", "ranged", "horizontal_projectile", "parabolic_projectile"];
function isProjectileSkill(s: Snapshot): boolean {
  return s.rotation.bombs_per_throw !== undefined;
}
function skillTagsOf(s: Snapshot): readonly string[] {
  return s.tags ?? (isProjectileSkill(s) ? BOMB_SKILL_TAGS : COMBO_SKILL_TAGS);
}
function skillTagApplies(s: Snapshot, k: string): boolean {
  return SKILL_TAGS.has(k) ? skillTagsOf(s).includes(k) : true;
}
// Whether an `increased` key feeds the shared (non-conversion) sum: erosion is scoped to the
// erosion portion (handled in erosionAvg), the rest by their skill tag.
function increasedApplies(s: Snapshot, k: string): boolean {
  return k !== "erosion" && skillTagApplies(s, k);
}

function damageEnvelope(s: Snapshot): number {
  let inc = 0;
  for (const [k, v] of Object.entries(s.increased)) if (increasedApplies(s, k)) inc += v;
  let m = 1 + inc / 100;
  m *= additionalMultiplier(s);
  for (const v of Object.values(s.enemy_taken)) m *= 1 + v / 100;
  return m * paralysisTaken(s);
}

// mechanics.md Paralysis row — +15% taken (stacks 1), scaled by inflicted-effect%,
// present iff the build has an inflict chance
function paralysisTaken(s: Snapshot): number {
  const p = s.paralysis;
  return p && p.chance_pct > 0 ? 1 + 15 * (1 + p.effect_inc_pct / 100) / 100 : 1;
}

/** mechanics.md#erosion — pre-envelope, pre-mitigation Erosion: support-added flat
    (× added-damage effectiveness) plus weapon-base erosion (× skill WAD, like weapon
    damage — mechanics.md#weapon-base-elements). Its own type: mitigated by erosion res. */
export function erosionBase(s: Snapshot, pct: number): number {
  const b = s.base;
  return ((b.flat_added_erosion_min ?? 0) + (b.flat_added_erosion_max ?? 0)) / 2
           * b.added_damage_effectiveness_pct / 100
       + ((b.weapon_flat_erosion_min ?? 0) + (b.weapon_flat_erosion_max ?? 0)) / 2 * pct;
}

export function erosionAvg(s: Snapshot, skillPct?: number): number {
  const pct = (skillPct ?? s.base.skill_weapon_pct) / 100;
  return erosionBase(s, pct) * damageEnvelope(s) * (1 + (s.increased.erosion ?? 0) / 100);
}

export function erosionMitigation(s: Snapshot): number {
  return 1 - ((s.enemy.erosion_res_pct ?? 0) - (s.penetration.erosion_pct ?? 0)) / 100;
}

// TLI "Additional Damage Bonus": every "+X% additional damage" source is its own
// ×(1+v) factor — the sheet stat is ∏(1+aᵢ)−1, NOT a summed pool. User toggle
// 2026-07-17: removing a +12% line moved the sheet 2165% → 1922% (÷1.12).
// mechanics.md#additional. Each bucket is already the product of its own lines
// (buildParser compounds within a bucket); multiplying buckets completes the product.
export function additionalMultiplier(s: Snapshot): number {
  let m = 1;
  for (const v of Object.values(s.additional)) m *= 1 + v / 100;
  return m;
}
/** The in-game "Additional Damage Bonus" character-sheet stat, for vetting. */
export function additionalBonusPct(s: Snapshot): number {
  return (additionalMultiplier(s) - 1) * 100;
}

/** mechanics.md#double-damage — expected whole-hit multiplier from "chance to deal Double
    Damage": 1 + min(chance,100)/100. Crit-independent; multiplies the full hit. */
export function doubleDamageMult(s: Snapshot): number {
  return 1 + Math.min(s.crit.double_damage_chance_pct ?? 0, 100) / 100;
}

export function critMultiplier(s: Snapshot): number {
  const chance = Math.min(s.crit.chance_pct, 100) / 100;
  const critHit = (s.crit.damage_pct / 100) * (1 + (s.crit.additional_on_crit_pct ?? 0) / 100)
                * (1 + (s.crit.crit_dmg_taken_pct ?? 0) / 100);
  return 1 + chance * (critHit - 1);
}

export function mitigationMultiplier(s: Snapshot): number {
  // penetration can push resistance negative (dev FAQ via mechanics.md)
  return (1 - (s.enemy.cold_res_pct - s.penetration.cold_pct) / 100)
       * (1 - (s.enemy.armor_reduction_pct - s.penetration.armor_pct) / 100);
}

/* mechanics.md#support-additional-sum — conversion-overflow redistribution (confirmed
   2026-07-20, phys killer test): claims on a type sum; past 100% they scale down
   proportionally (HoA phys→fire 100 + Obliterate phys→erosion 100 ⇒ 50/50). Portions
   keep their full type HISTORY; a typed modifier applies to a portion iff its tag
   appears in the history (full source+destination double-dip), typed lines compound
   within a path, and mitigation follows the FINAL type. Priority order
   phys→lightning→cold→fire→erosion: conversion only climbs, so one pass completes. */
const TYPE_ORDER: DamageType[] = ["physical", "lightning", "cold", "fire", "erosion"];
const ELEMENTAL: ReadonlySet<string> = new Set(["lightning", "cold", "fire"]);
const TYPE_TAGS: ReadonlySet<string> = new Set([...TYPE_ORDER, "elemental"]);

interface Portion { amt: number; types: Set<DamageType>; cur: DamageType }

function basePortions(s: Snapshot, pct: number): Portion[] {
  const b = s.base;
  const eff = b.added_damage_effectiveness_pct / 100;
  const physPart = weaponPhysAvg(b) * pct + (b.flat_added_min + b.flat_added_max) / 2 * eff;
  const coldPart = (b.weapon_flat_cold_min + b.weapon_flat_cold_max) / 2 * pct
                 + ((b.flat_added_cold_min ?? 0) + (b.flat_added_cold_max ?? 0)) / 2 * eff
                 + physPart * (b.gain_phys_as_cold_pct ?? 0) / 100;
  // weapon-base fire/lightning enter as their own conversion-history portions (mechanics.md#weapon-base-elements)
  const firePart = ((b.weapon_flat_fire_min ?? 0) + (b.weapon_flat_fire_max ?? 0)) / 2 * pct;
  const lightPart = ((b.weapon_flat_lightning_min ?? 0) + (b.weapon_flat_lightning_max ?? 0)) / 2 * pct;
  const eroPart = erosionBase(s, pct);
  return ([[physPart, "physical"], [coldPart, "cold"], [firePart, "fire"],
           [lightPart, "lightning"], [eroPart, "erosion"]] as const)
    .filter(([amt]) => amt !== 0)
    .map(([amt, t]) => ({ amt, types: new Set<DamageType>([t]), cur: t }));
}

function convert(portions: Portion[], claims: NonNullable<Snapshot["conversion"]>): Portion[] {
  for (const t of TYPE_ORDER) {
    const cl = claims.filter(c => c.from === t);
    if (!cl.length) continue;
    const total = cl.reduce((sum, c) => sum + c.pct, 0);
    const scale = Math.min(1, 100 / total);
    const next: Portion[] = [];
    for (const p of portions) {
      if (p.cur !== t) { next.push(p); continue; }
      for (const c of cl) {
        const amt = p.amt * (c.pct / 100) * scale;
        if (amt) next.push({ amt, types: new Set([...p.types, c.to]), cur: c.to });
      }
      const rest = p.amt * (1 - Math.min(total, 100) / 100);
      if (rest) next.push({ ...p, amt: rest });
    }
    portions = next;
  }
  return portions;
}

function tagApplies(tag: string, types: Set<DamageType>): boolean {
  if (tag === "elemental") return [...types].some(t => ELEMENTAL.has(t));
  return types.has(tag as DamageType);
}

function pathEnvelope(s: Snapshot, types: Set<DamageType>): number {
  let inc = 0;
  for (const [k, v] of Object.entries(s.increased))
    if ((!TYPE_TAGS.has(k) || tagApplies(k, types)) && skillTagApplies(s, k)) inc += v;
  let m = (1 + inc / 100) * additionalMultiplier(s);
  for (const [tag, bucket] of Object.entries(s.additional_typed ?? {}))
    if (tagApplies(tag, types))
      for (const v of Object.values(bucket)) m *= 1 + v / 100;
  for (const v of Object.values(s.enemy_taken)) m *= 1 + v / 100;
  return m * paralysisTaken(s);
}

export function expectedHit(s: Snapshot, skillPct?: number): number {
  if (s.conversion) {
    const pct = (skillPct ?? s.base.skill_weapon_pct) / 100;
    let sum = 0;
    for (const p of convert(basePortions(s, pct), s.conversion))
      sum += p.amt * pathEnvelope(s, p.types)
           * (p.cur === "erosion" ? erosionMitigation(s) : mitigationMultiplier(s));
    return sum * critMultiplier(s) * doubleDamageMult(s);
  }
  // elemental/phys and erosion portions mitigate by different resistances, then the
  // combined hit crits as one — crit is type-agnostic
  const ele = averageHit(s, skillPct) * mitigationMultiplier(s);
  const ero = erosionAvg(s, skillPct) * erosionMitigation(s);
  return (ele + ero) * critMultiplier(s) * doubleDamageMult(s);
}

/** mechanics.md#deterioration — total tick multiplier of ONE Deterioration stack:
    Ruinous Star replaces the expiry burst with a True-Damage tick every
    tick_interval_s. The ramp is ADDITIVE — tick k = 1 + k×ramp% of the base tick,
    capped at ramp_max_ticks increments (measured 2026-07-20; compound refuted). */
export function deteriorationTickSum(d: Record<string, number>): number {
  const duration = d.duration_s * (1 + (d.duration_inc_pct ?? 0) / 100);
  // ticks land at k×interval STRICTLY before expiry — one at exactly expiry does
  // not fire (frame-counted at 60fps + L16 chain + slate lever, 2026-07-20;
  // mechanics.md#deterioration)
  const ticks = Math.ceil(duration / d.tick_interval_s - 1e-9) - 1;
  let sum = 0;
  for (let i = 0; i < ticks; i++)
    sum += 1 + (d.ramp_pct / 100) * Math.min(i, d.ramp_max_ticks);
  return sum;
}

/* ── Explain-layer trace builders (mechanics.md#skill-type) ───────────────────
   Each chip's factor is a value cycleDps already computed — no number is re-derived.
   resolve(trace.root) folds them back to cycleDps().dps (asserted by trace.test.ts),
   so the page's chips can never disagree with the headline number. */

function increasedChips(s: Snapshot): Chip[] {
  const out: Chip[] = [];
  for (const [k, v] of Object.entries(s.increased))
    if (increasedApplies(s, k) && v) out.push({ kind: "increased", label: `increased · ${k}`, op: "+", factor: v / 100 });
  return out;
}

function envelopeMultChips(s: Snapshot): Chip[] {
  const out: Chip[] = [];
  for (const [k, v] of Object.entries(s.additional))
    if (v) out.push({ kind: "additional", label: `additional · ${k}`, op: "×", factor: 1 + v / 100 });
  for (const [k, v] of Object.entries(s.enemy_taken))
    if (v) out.push({ kind: "taken", label: `taken · ${k}`, op: "×", factor: 1 + v / 100 });
  const para = paralysisTaken(s);
  if (para !== 1) out.push({ kind: "taken", label: "paralysis", op: "×", factor: para });
  out.push({ kind: "crit", label: `crit ${s.crit.chance_pct}% ×${s.crit.damage_pct}%`,
             op: "×", factor: critMultiplier(s) });
  return out;
}

// The type-split hit BEFORE the shared envelope + crit: elemental and erosion portions
// carry their own (different) resistance. Sums to averageHit-raw + erosion-raw.
function mitSumNode(s: Snapshot, pct: number): TNode {
  const b = s.base;
  const eff = b.added_damage_effectiveness_pct / 100;
  const flat = (b.flat_added_min + b.flat_added_max) / 2 * eff;
  const flatCold = ((b.flat_added_cold_min ?? 0) + (b.flat_added_cold_max ?? 0)) / 2 * eff;
  const rawEle = weaponAvg(b) * pct + flat + flatCold
               + (weaponPhysAvg(b) * pct + flat) * (b.gain_phys_as_cold_pct ?? 0) / 100;
  const children: TNode[] = [];
  if (rawEle) children.push({ label: "elemental hit", value: 0, op: "product",
    chips: [{ kind: "base", label: "base (weapon + adds)", op: "base", factor: rawEle },
            { kind: "mitigation", label: "res + armor mit", op: "×", factor: mitigationMultiplier(s) }] });
  const eroBase = erosionBase(s, pct);
  if (eroBase) {
    const chips: Chip[] = [{ kind: "base", label: "erosion base", op: "base", factor: eroBase }];
    const eroInc = 1 + (s.increased.erosion ?? 0) / 100;
    if (eroInc !== 1) chips.push({ kind: "increased", label: `erosion +${s.increased.erosion}%`, op: "×", factor: eroInc });
    chips.push({ kind: "mitigation", label: "erosion mit", op: "×", factor: erosionMitigation(s) });
    children.push({ label: "erosion hit", value: 0, op: "product", chips });
  }
  return { label: "hit by type", value: 0, op: "sum", chips: [], children };
}

// Conversion builds keep each portion's type history + its own path envelope and
// final-type mitigation; crit is shared. Sums (× crit) to expectedHit under conversion.
function convPortionsNode(s: Snapshot, pct: number): TNode {
  const children: TNode[] = convert(basePortions(s, pct), s.conversion!).map(p => ({
    label: [...p.types].join("→"), value: 0, op: "product" as const,
    chips: [{ kind: "base" as const, label: "portion", op: "base" as const, factor: p.amt },
            { kind: "increased" as const, label: "path envelope", op: "×" as const, factor: pathEnvelope(s, p.types) },
            { kind: "mitigation" as const, label: `${p.cur} mit`, op: "×" as const,
              factor: p.cur === "erosion" ? erosionMitigation(s) : mitigationMultiplier(s) }],
  }));
  return { label: "portions", value: 0, op: "sum", chips: [], children };
}

// per-hit = shared envelope (increased pool, additional/taken, crit) over the type-split
// hit. Under conversion the envelope is per-portion, so only crit sits at this level.
function perHitNode(s: Snapshot, child: TNode): TNode {
  const chips = s.conversion
    ? [{ kind: "crit" as const, label: `crit ${s.crit.chance_pct}% ×${s.crit.damage_pct}%`,
         op: "×" as const, factor: critMultiplier(s) }]
    : [...increasedChips(s), ...envelopeMultChips(s)];
  const dd = doubleDamageMult(s);
  if (dd !== 1) chips.push({ kind: "crit", label: `double dmg ${Math.min(s.crit.double_damage_chance_pct ?? 0, 100)}%`,
                             op: "×", factor: dd });
  return { label: "per-hit", value: 0, op: "product", chips, children: [child] };
}

/* ── Rotation strategies (mechanics.md#skill-type) ────────────────────────────
   A rotation is a pure (Snapshot) → RotationResult: it wraps the shared HoA hit
   (expectedHit) in a throughput model and emits its own trace subtree. cycleDps
   picks one by rotation shape, then layers Deterioration identically on top. Add a
   new playstyle by adding a strategy — the hit, envelope, and DoT stay reusable. */
export interface RotationResult {
  hitDps: number; cycleTime: number; uses: number;
  perHit: TNode; rotationNode: TNode;
  starter_damage: number; finisher_damage: number;
}

/** mechanics.md#bing-bombs — Hammer of Ash as a bomb (Bing / Blast Nova): each throw
    lobs bombs that detonate into HoA projectiles. Base throw rate (throw_rate_base,
    1/s) scales only by +% attack speed; hits_per_bomb folds the NORMAL-throw radial
    spread + shotgun falloff on a single target. Demolisher Charge is structural: one
    throw in demolisher_every_n consumes a charge and is empowered ×demolisher_empower_mult
    (+215% additional hit + explosion overlap), the charge consumed AT the throw so
    n = interval ceil'd to the throw grid. */
export function bombRotation(s: Snapshot): RotationResult {
  const r = s.rotation;
  const skillType = s.skill_type ?? "bomb";
  const throwRate = (r.throw_rate_base ?? 1) * (1 + (r.attack_speed_inc_pct ?? 0) / 100);
  const bombsPerSec = throwRate * r.bombs_per_throw;
  // mechanics.md#multi-proj — single-target hits scale linearly with projectile quantity
  const projScale = r.proj_base ? (r.proj_base + (r.proj_added ?? 0)) / r.proj_base : 1;
  const perBomb = expectedHit(s) * (r.hits_per_bomb ?? 1) * projScale;
  const demoM = r.demolisher_empower_mult ?? 1;
  const demoN = r.demolisher_resto_pct !== undefined
    ? Math.ceil((3 / (1 + r.demolisher_resto_pct / 100)) * throwRate)
    : (r.demolisher_every_n ?? 3);
  const hitDps = bombsPerSec * perBomb * ((demoN - 1 + demoM) / demoN);
  const hitChild = s.conversion ? convPortionsNode(s, s.base.skill_weapon_pct / 100)
                                 : mitSumNode(s, s.base.skill_weapon_pct / 100);
  const perHit = perHitNode(s, hitChild);
  const rotationNode: TNode = { label: `rotation (${skillType})`, value: 0, op: "product", children: [perHit],
    chips: [
      { kind: "rotation", label: "throw rate", op: "×", factor: throwRate },
      { kind: "rotation", label: "bombs / throw", op: "×", factor: r.bombs_per_throw },
      { kind: "rotation", label: "hits / bomb", op: "×", factor: r.hits_per_bomb ?? 1 },
      { kind: "rotation", label: "projectile scale", op: "×", factor: projScale },
      { kind: "rotation", label: `demolisher share (n=${demoN}, ×${demoM})`, op: "×", factor: (demoN - 1 + demoM) / demoN },
    ] };
  // Obliterate enhances the THROW (one Main-Skill use) — every bomb of an enhanced
  // throw inflicts, so the enhanced-share is per throw, not per bomb → uses = 1.
  return { hitDps, cycleTime: 1 / throwRate, uses: 1, perHit, rotationNode,
           starter_damage: 0, finisher_damage: 0 };
}

/** mechanics.md#mark — Hammer of Ash / Spectral Slash as a combo (Rehan): N starters
    build points, one finisher spends them; assumes 100% buff uptime (warcry loop),
    uptime factors live in bucket values. The first starter applies Mark, so every
    later hit benefits; the finisher consumes it. */
export function comboRotation(s: Snapshot): RotationResult {
  const r = s.rotation;
  const skillType = s.skill_type ?? "combo";
  const aps = s.base.weapon_attack_speed * (1 + r.attack_speed_inc_pct / 100);
  // Bodhi special pool (and skill inherent −40%) are additional AS gated to one half
  // of the sequence — they do not speed the other half (mechanics.md#bodhi-girdle)
  const starterAps = aps * (1 + (r.starter_additional_as_pct ?? 0) / 100);
  const finisherAps = aps * (1 + r.finisher_additional_as_pct / 100);
  const mark = 1 + (r.mark_taken_pct ?? 0) / 100;
  const starter = expectedHit(s, r.starter_weapon_pct) * (1 + (r.starters_per_cycle - 1) * mark);
  const amp = 1 + r.combo_points * r.finisher_amp_pct / 100;
  // one clone per combo point consumed + Legion extras; shotgun falloff applies
  // to every hit after the finisher's own, AFTER all other calculations
  const clones = r.combo_points + (r.extra_clones ?? 0);
  const oneFinisher = expectedHit(s) * amp * (1 + clones * r.clone_falloff);
  // extra finisher charges recast at the SAME consumed points (mechanics.md#combo-economy);
  // the first finisher consumes Mark, so the extras hit unmarked
  const nFin = r.finishers_per_cycle ?? 1;
  const finisher = oneFinisher * mark + (nFin - 1) * oneFinisher;
  const cycleTime = r.starters_per_cycle / starterAps + nFin / finisherAps;
  const hitDps = (starter + finisher) / cycleTime;

  // starter/finisher share the per-hit envelope (hoisted to perHit); their paths hold
  // only the rotational multipliers over the type-split hit at their own weapon %.
  const starterPath: TNode = { label: "starter path", value: 0, op: "product",
    children: [mitSumNode(s, r.starter_weapon_pct / 100)],
    chips: [{ kind: "rotation", label: `starters ×${r.starters_per_cycle} (Mark)`, op: "×", factor: 1 + (r.starters_per_cycle - 1) * mark }] };
  const finisherPath: TNode = { label: "finisher path", value: 0, op: "product",
    children: [mitSumNode(s, s.base.skill_weapon_pct / 100)],
    chips: [
      { kind: "rotation", label: `finisher amp ×${amp.toFixed(2)}`, op: "×", factor: amp },
      { kind: "rotation", label: `clone spread (${clones} clones)`, op: "×", factor: 1 + clones * r.clone_falloff },
      { kind: "rotation", label: `finisher count`, op: "×", factor: mark + (nFin - 1) },
    ] };
  const contrib: TNode = { label: "starter + finisher", value: 0, op: "sum", chips: [], children: [starterPath, finisherPath] };
  const perHit = perHitNode(s, contrib);
  const rotationNode: TNode = { label: `rotation (${skillType})`, value: 0, op: "product", children: [perHit],
    chips: [{ kind: "rotation", label: `cadence (${cycleTime.toFixed(2)}s)`, op: "×", factor: 1 / cycleTime }] };
  return { hitDps, cycleTime, uses: r.starters_per_cycle + nFin, perHit, rotationNode,
           starter_damage: starter, finisher_damage: finisher };
}

/** Boss single-target DPS: pick the rotation strategy by shape (bomb iff
    rotation.bombs_per_throw is set, else the combo cycle), then layer the shared
    Deterioration DoT identically on top of whichever rotation ran. */
export function cycleDps(s: Snapshot) {
  const rot = s.rotation.bombs_per_throw !== undefined ? bombRotation(s) : comboRotation(s);
  const { hitDps, cycleTime, uses, perHit, rotationNode, starter_damage, finisher_damage } = rot;

  // mechanics.md#deterioration — one skill use per obliterate_interval_s is
  // Obliterate-enhanced (100% phys+ele → Erosion) and can inflict Deterioration;
  // each stack ticks True Damage worth hit_damage_pct% of the erosion hit dealt
  let detDps = 0;
  let dotNode: TNode | undefined;
  const d = s.deterioration;
  // mechanics.md#deterioration — the DoT needs an Obliterate base (hit_damage_pct, the
  // base tick %); a parsed build that only accumulated the modifier mods (Deterioration
  // Damage/Chance/Duration) has no base ⇒ inert, like Passivation on a zero-erosion build
  if (d && d.chance_pct > 0 && d.hit_damage_pct > 0) {
    const enhancedShare = Math.min(1, cycleTime / d.obliterate_interval_s / uses);
    // "+X% Deterioration Damage" is a non-additional (increased) line: it joins the
    // increased SUM for the deterioration envelope — ticks ×(incSum+X)/incSum, since
    // the feeding hit already carries ×incSum (mechanics.md#deterioration)
    // the feeding hit already carries ×incSum (its applicable increases); the DoT inherits
    // those EXCEPT hit-only "Hit Damage" (a hit is not a DoT), and adds DoT-only damage_inc
    let incSum = 1;
    for (const [k, v] of Object.entries(s.increased)) if (increasedApplies(s, k)) incSum += v / 100;
    const dotInc = incSum - (s.increased.hit ?? 0) / 100 + (d.damage_inc_pct ?? 0) / 100;
    const ratio = dotInc / incSum;
    detDps = hitDps * enhancedShare * (Math.min(d.chance_pct, 100) / 100)
           * (d.hit_damage_pct / 100)
           * deteriorationTickSum(d)
           * ratio
           * (1 + (d.additional_damage_pct ?? 0) / 100);
    // child is the hit-DPS node (shared): removing a per-hit chip correctly drops the DoT too
    dotNode = { label: "Deterioration", value: 0, op: "product", children: [rotationNode], chips: [
      { kind: "dot", label: "enhanced share", op: "×", factor: enhancedShare },
      { kind: "dot", label: `chance ${Math.min(d.chance_pct, 100)}%`, op: "×", factor: Math.min(d.chance_pct, 100) / 100 },
      { kind: "dot", label: `tick damage ${d.hit_damage_pct}%`, op: "×", factor: d.hit_damage_pct / 100 },
      { kind: "dot", label: `tick sum`, op: "×", factor: deteriorationTickSum(d) },
      ...(ratio !== 1 ? [{ kind: "dot" as const, label: "increased ratio", op: "×" as const, factor: ratio }] : []),
      ...(d.additional_damage_pct ? [{ kind: "dot" as const, label: "additional", op: "×" as const, factor: 1 + d.additional_damage_pct / 100 }] : []),
    ] };
  }

  const root: TNode = { label: "DPS", value: 0, op: "sum", chips: [],
    children: dotNode ? [rotationNode, dotNode] : [rotationNode] };
  setValues(root);
  const trace: Breakdown = { total: root.value, root, layers: { rotation: rotationNode, perHit, dot: dotNode } };
  return { dps: hitDps + detDps, deterioration_dps: detDps,
           finisher_damage, starter_damage, cycle_time: cycleTime, trace };
}
