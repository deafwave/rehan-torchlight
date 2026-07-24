/* Sensitivity ranking and candidate comparison for the build snapshot.
   Browser-safe: only depends on damageModel (no node:fs / py.ts). */
import { cycleDps, type Snapshot } from "./damageModel.js";

/** Same curve as buildParser.skillLevelAdditionalPct — inlined to keep rank browser-importable. */
function skillLevelAdditionalPct(levels: number): number {
  return (1.10 ** Math.min(levels, 10) * 1.08 ** Math.max(levels - 10, 0) - 1) * 100;
}

export const STANDARD_PERTURBATIONS: [string, string, number][] = [
  ["+10% increased physical damage", "increased.physical", 10],
  ["+10% increased attack damage", "increased.attack", 10],
  ["+10% increased melee damage", "increased.melee", 10],
  ["+10% increased area damage", "increased.area", 10],
  ["+10% increased cold damage", "increased.cold", 10],
  // a fresh +10% additional line is its own ×1.10 factor (mechanics.md#additional);
  // probe an empty bucket so it reads its full value, undiluted by the existing product
  ["+10% additional damage line (fresh ×1.10)", "additional.sealed_life_mana", 10],
  // live gem is 20+2 (user 2026-07-17); skill_levels is a MORE multiplier, so +1 level
  // lands the exact x1.10 step as this band delta on the +2 baseline
  ["+1 skill level (gem 22 -> 23, x1.10)", "additional.skill_levels",
   skillLevelAdditionalPct(3) - skillLevelAdditionalPct(2)],
  // rank 5 base line is 36 vs 20: Detonation (1.36*1.30-1)-56, Legion (1.36*0.96-1)-15.2
  ["Detonation prism rank 1 -> 5", "additional.detonation_prism", 20.8],
  ["Legion prism rank 1 -> 5", "additional.legion_prism", 15.36],
  ["+10% Combo Finisher Amplification", "rotation.finisher_amp_pct", 10],
  ["+1 Combo Point consumed", "rotation.combo_points", 1],
  ["+10% warcry buff contribution", "additional.warcry_buffs", 10],
  ["+10% Frostbite taken", "enemy_taken.frostbite", 10],
  ["+10% Paralysis/other taken", "enemy_taken.paralysis", 10],
  ["+5% crit chance", "crit.chance_pct", 5],
  ["+30% crit damage", "crit.damage_pct", 30],
  ["+10% cold penetration", "penetration.cold_pct", 10],
  ["+10% armor mitigation penetration", "penetration.armor_pct", 10],
  ["+10% attack speed", "rotation.attack_speed_inc_pct", 10],
  ["+10% gear physical damage (weapon)", "base.gear_phys_pct", 10],
];

/** Spec guard: refuse to rank when a high-impact stat is missing/zero. */
export function validateSnapshot(s: Snapshot): void {
  const problems: string[] = [];
  const b = s.base;
  if (b.weapon_phys_max <= 0 && b.weapon_flat_cold_max <= 0) problems.push("weapon damage is zero");
  if (b.weapon_attack_speed <= 0) problems.push("weapon attack speed is zero");
  if (s.crit.damage_pct <= 0) problems.push("crit damage is zero");
  if (problems.length) throw new Error("snapshot not rankable: " + problems.join("; "));
}

export function bump(s: Snapshot, path: string, delta: number): Snapshot {
  const out = structuredClone(s);
  const keys = path.split(".");
  let d: any = out;
  for (const k of keys.slice(0, -1)) d = d[k];
  d[keys[keys.length - 1]] += delta;
  return out;
}

export function compareSnapshots(a: Snapshot, b: Snapshot): number {
  return (cycleDps(b).dps / cycleDps(a).dps - 1) * 100;
}

export function sensitivity(s: Snapshot, perturbations: [string, string, number][]) {
  const baseline = cycleDps(s).dps;
  const rows = perturbations.map(([label, path, delta]) => ({
    label,
    delta_pct: (cycleDps(bump(s, path, delta)).dps / baseline - 1) * 100,
  }));
  return rows.sort((a, b) => b.delta_pct - a.delta_pct);
}
