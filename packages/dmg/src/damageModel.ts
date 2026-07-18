/* Pure damage model for Spectral Slash (boss single-target).

   Bucket semantics are fixed here; WHICH modifier goes in WHICH bucket is
   decided by docs/mechanics.md and encoded in the parser. Pure: no I/O. */

// Genuine "more" multipliers that stay their own ×(1+v) factor instead of joining
// the summed additional pool (mechanics.md#additional): the "(multiplies)" buffs
// Willpower & Pure Heart, and skill/gem levels — a level scales the skill's BASE, so
// it multiplies the whole pipeline (+10%/+8% per level), never diluted by the pile.
export const MORE_MULTIPLIER_KEYS = new Set(["willpower", "pure_heart", "skill_levels"]);

export interface Snapshot {
  base: Record<string, number>;
  increased: Record<string, number>;
  additional: Record<string, number>;
  enemy_taken: Record<string, number>;
  crit: { chance_pct: number; damage_pct: number; additional_on_crit_pct?: number;
          crit_dmg_taken_pct?: number };
  penetration: { cold_pct: number; armor_pct: number };
  enemy: { cold_res_pct: number; armor_reduction_pct: number };
  rotation: Record<string, number>;
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
    added_damage_effectiveness_pct: 100,
  },
  increased: { physical: 0, attack: 0, melee: 0, area: 0,
               cold: 0, elemental: 0, global: 0 },
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
};

function weaponPhysAvg(b: Record<string, number>): number {
  // joined_weapon_phys (Joined Force) is the off-hand's FINAL damage — its own
  // gear-phys already applied, so the main hand's must not scale it again
  return (b.weapon_phys_min + b.weapon_phys_max) / 2 * (1 + b.gear_phys_pct / 100)
       + (b.joined_weapon_phys ?? 0);
}

function weaponAvg(b: Record<string, number>): number {
  return weaponPhysAvg(b) + (b.weapon_flat_cold_min + b.weapon_flat_cold_max) / 2;
}

/** Average pre-crit, pre-mitigation hit. skillPct overrides base.skill_weapon_pct
    (used for starter vs finisher). */
export function averageHit(s: Snapshot, skillPct?: number): number {
  const b = s.base;
  const pct = (skillPct ?? b.skill_weapon_pct) / 100;
  const flat = (b.flat_added_min + b.flat_added_max) / 2 * b.added_damage_effectiveness_pct / 100;
  let hit = weaponAvg(b) * pct + flat;
  // "Adds X% of Physical Damage to Cold Damage": gained from the pre-conversion phys
  // portion (weapon phys + global flat adds, which are physical); flat cold is not re-gained
  hit += (weaponPhysAvg(b) * pct + flat) * (b.gain_phys_as_cold_pct ?? 0) / 100;
  hit *= 1 + Object.values(s.increased).reduce((a, v) => a + v, 0) / 100;
  // TLI "Additional Damage Bonus": every "+X% additional damage" source sums into
  // ONE additive pool (the in-game character-sheet stat), applied as a single
  // multiplier — NOT a product of separate layers. Only genuine "(multiplies)"
  // effects — Willpower, Pure Heart — are their own more-multipliers.
  // mechanics.md#additional (user in-game sheet 2026-07-17: 2498% additional bonus).
  let addlPool = 0;
  for (const [k, v] of Object.entries(s.additional)) {
    if (MORE_MULTIPLIER_KEYS.has(k)) hit *= 1 + v / 100;
    else addlPool += v;
  }
  hit *= 1 + addlPool / 100;
  for (const v of Object.values(s.enemy_taken)) hit *= 1 + v / 100;
  return hit;
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

export function expectedHit(s: Snapshot, skillPct?: number): number {
  return averageHit(s, skillPct) * critMultiplier(s) * mitigationMultiplier(s);
}

/** Boss rotation: N starters build points, one finisher spends them.
    Assumes 100% buff uptime (warcry loop); uptime factors live in bucket values. */
export function cycleDps(s: Snapshot) {
  const r = s.rotation;
  const aps = s.base.weapon_attack_speed * (1 + r.attack_speed_inc_pct / 100);
  // Bodhi special pool (and skill inherent −40%) are additional AS gated to one half
  // of the sequence — they do not speed the other half (mechanics.md#bodhi-girdle)
  const starterAps = aps * (1 + (r.starter_additional_as_pct ?? 0) / 100);
  const finisherAps = aps * (1 + r.finisher_additional_as_pct / 100);
  // Mark: the first starter applies it, so every later hit in the cycle benefits
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
  return { dps: (starter + finisher) / cycleTime,
           finisher_damage: finisher, starter_damage: starter,
           cycle_time: cycleTime };
}
