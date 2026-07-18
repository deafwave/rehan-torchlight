import { describe, expect, test } from "vitest";
import { averageHit, critMultiplier, mitigationMultiplier, expectedHit, cycleDps,
         type Snapshot } from "../src/damageModel.js";
import { snap, baseOnly } from "./helpers.js";

describe("averageHit", () => {
  test("base hit is weapon times skill pct", () => {
    expect(averageHit(baseOnly())).toBe(100.0);
  });

  test("gear phys pct scales weapon phys only", () => {
    const s = baseOnly();
    s.base.gear_phys_pct = 50;
    expect(averageHit(s)).toBe(150.0);
  });

  test("gain phys as cold adds a share of the physical portion only", () => {
    const s = baseOnly();
    s.base.gain_phys_as_cold_pct = 20;
    expect(averageHit(s)).toBeCloseTo(120.0, 6);
    s.base.weapon_flat_cold_min = 50;
    s.base.weapon_flat_cold_max = 50;
    expect(averageHit(s)).toBeCloseTo(170.0, 6);   // cold portion is not re-gained
  });

  test("weapon flat cold added after gear phys pct", () => {
    const s = baseOnly();
    s.base.gear_phys_pct = 50;
    s.base.weapon_flat_cold_min = 10;
    s.base.weapon_flat_cold_max = 30;
    // (100*1.5 + avg(10,30)) * 100% = 170
    expect(averageHit(s)).toBe(170.0);
  });

  test("flat added scaled by effectiveness and skill pct", () => {
    const s = baseOnly();
    Object.assign(s.base, { flat_added_min: 20, flat_added_max: 20,
                            added_damage_effectiveness_pct: 50, skill_weapon_pct: 200 });
    // weapon 100*200% + flat 20*50% = 210 (flat scales by effectiveness, not weapon pct)
    expect(averageHit(s)).toBe(210.0);
  });

  test("increased bucket is one additive sum", () => {
    const s = baseOnly();
    s.increased.physical = 50;
    s.increased.attack = 50;
    expect(averageHit(s)).toBe(200.0);   // x2.0, NOT 1.5*1.5=225
  });

  test("additional layers each multiply (mechanics.md#additional)", () => {
    const s = baseOnly();
    s.additional.strength = 20;
    s.additional.misc = 20;
    expect(averageHit(s)).toBeCloseTo(144.0, 2);   // 1.20 * 1.20, NOT 1 + 0.20 + 0.20
  });

  test("enemy_taken layers multiply too", () => {
    const s = baseOnly();
    s.enemy_taken.frostbite = 10;
    s.enemy_taken.paralysis = 10;
    expect(averageHit(s)).toBeCloseTo(121.0, 2);
  });
});

describe("multipliers", () => {
  test("crit multiplier", () => {
    const s = snap();
    s.crit = { chance_pct: 50, damage_pct: 200 };
    expect(critMultiplier(s)).toBe(1.5);          // 1 + 0.5*(2.0-1)
  });

  test("crit chance caps at 100", () => {
    const s = snap();
    s.crit = { chance_pct: 250, damage_pct: 300 };
    expect(critMultiplier(s)).toBe(3.0);
  });

  test("additional-on-crit multiplies only the crit portion", () => {
    const s = snap();
    // 1 + 0.5*(2.0*1.4 - 1) = 1.9, NOT 1.5*1.4
    s.crit = { chance_pct: 50, damage_pct: 200, additional_on_crit_pct: 40 };
    expect(critMultiplier(s)).toBeCloseTo(1.9, 10);
  });

  test("crit damage taken (Fixate) compounds on the crit portion only", () => {
    const s = snap();
    // 1 + 0.5*(2.0*1.4*1.1 - 1) = 2.04
    s.crit = { chance_pct: 50, damage_pct: 200, additional_on_crit_pct: 40,
               crit_dmg_taken_pct: 10 };
    expect(critMultiplier(s)).toBeCloseTo(2.04, 10);
  });

  test("mitigation res minus pen", () => {
    const s = snap();
    s.enemy = { cold_res_pct: 40, armor_reduction_pct: 0 };
    s.penetration.cold_pct = 15;
    expect(mitigationMultiplier(s)).toBe(0.75);
  });

  test("penetration pushes res negative", () => {
    // dev-FAQ confirmed: penetration can push resistance below zero (mechanics.md)
    const s = snap();
    s.enemy = { cold_res_pct: 10, armor_reduction_pct: 0 };
    s.penetration.cold_pct = 50;
    expect(mitigationMultiplier(s)).toBeCloseTo(1.4, 12);
  });

  test("mitigation is two layers: resistance x armor elemental reduction", () => {
    // monster defaults ~30% each (user-reported 2026-07-15); 0.7 * 0.7
    const s = snap();
    s.enemy = { cold_res_pct: 30, armor_reduction_pct: 30 };
    expect(mitigationMultiplier(s)).toBeCloseTo(0.49, 12);
  });

  test("armor mitigation penetration exists and goes negative too", () => {
    const s = snap();
    s.enemy = { cold_res_pct: 30, armor_reduction_pct: 30 };
    s.penetration.cold_pct = 40;
    s.penetration.armor_pct = 40;
    expect(mitigationMultiplier(s)).toBeCloseTo(1.21, 12);   // 1.1 * 1.1
  });

  test("expected hit composes", () => {
    const s = baseOnly();
    s.crit = { chance_pct: 50, damage_pct: 200 };
    s.enemy.cold_res_pct = 50;
    s.penetration.cold_pct = 0;
    expect(expectedHit(s)).toBe(75.0);            // 100 * 1.5 * 0.5
  });
});

export function rotationSnap(): Snapshot {
  const s = baseOnly();
  s.rotation = { starters_per_cycle: 2, starter_weapon_pct: 100,
                 attack_speed_inc_pct: 0, finisher_additional_as_pct: -50,
                 extra_clones: 0, clone_falloff: 0.7, mark_taken_pct: 0,
                 combo_points: 4, finisher_amp_pct: 0 };
  s.base.weapon_attack_speed = 1.0;
  s.base.skill_weapon_pct = 100;
  s.enemy.cold_res_pct = 0;
  s.crit = { chance_pct: 0, damage_pct: 150 };   // expectedHit == averageHit
  return s;
}

describe("cycleDps", () => {
  test("cycle dps math", () => {
    const r = cycleDps(rotationSnap());
    // starters: 2 hits * 100 = 200
    expect(r.starter_damage).toBe(200.0);
    // one clone per combo point consumed: finisher 100 * (1 + 4 clones * 0.7) = 380
    expect(r.finisher_damage).toBeCloseTo(380.0, 9);
    // cycle: 2 starters at 1.0 aps (2s) + 1 finisher at 1.0*(1-0.5)=0.5 aps (2s) = 4s
    expect(r.cycle_time).toBe(4.0);
    expect(r.dps).toBeCloseTo((200.0 + 380.0) / 4.0, 9);
  });

  test("extra clones (Legion) add to the combo-point clones", () => {
    const s = rotationSnap();
    s.rotation.extra_clones = 1;
    // 100 * (1 + 5 * 0.7) = 450
    expect(cycleDps(s).finisher_damage).toBeCloseTo(450.0, 9);
  });

  test("Mark: first starter applies it unmarked; later starters and finisher benefit", () => {
    const s = rotationSnap();
    s.rotation.mark_taken_pct = 30;
    const r = cycleDps(s);
    // starter1 100 + starter2 100*1.3 = 230
    expect(r.starter_damage).toBeCloseTo(230.0, 9);
    // finisher consumes Mark but still benefits: 380 * 1.3 = 494
    expect(r.finisher_damage).toBeCloseTo(494.0, 9);
  });

  test("attack speed inc shortens cycle", () => {
    const s = rotationSnap();
    s.rotation.attack_speed_inc_pct = 100;
    expect(cycleDps(s).cycle_time).toBe(2.0);
  });

  test("finisher amp multiplies points times amp sum", () => {
    // mechanics.md: finisher x= (1 + consumed_points * amp_sum%); starters untouched
    const s = rotationSnap();
    s.rotation.finisher_amp_pct = 35.5;
    const r = cycleDps(s);
    expect(r.finisher_damage).toBeCloseTo(380.0 * (1 + 4 * 0.355), 6);
    expect(r.starter_damage).toBe(200.0);
  });
});
