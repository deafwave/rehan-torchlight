import { describe, expect, test } from "vitest";
import { averageHit, critMultiplier, mitigationMultiplier, expectedHit, cycleDps,
         deteriorationTickSum, type Snapshot } from "../src/damageModel.js";
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

  test("weapon flat fire and lightning fold into the elemental hit, unscaled by gear phys", () => {
    const s = baseOnly();
    s.base.gear_phys_pct = 50;                       // scales phys only
    s.base.weapon_flat_fire_min = 20; s.base.weapon_flat_fire_max = 40;         // avg 30
    s.base.weapon_flat_lightning_min = 5; s.base.weapon_flat_lightning_max = 15; // avg 10
    // (100*1.5 + 30 + 10) * 100% = 190
    expect(averageHit(s)).toBeCloseTo(190.0, 6);
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

  test("increased fire and lightning join the same additive sum (mirror cold)", () => {
    const s = baseOnly();
    s.increased.fire = 30;
    s.increased.lightning = 20;
    expect(averageHit(s)).toBeCloseTo(150.0, 6);   // (1 + 0.30 + 0.20) × 100
  });

  function bombify(s: Snapshot): Snapshot {
    s.rotation = { ...s.rotation, bombs_per_throw: 2, throw_rate_base: 1, hits_per_bomb: 1, proj_base: 1 };
    s.tags = ["melee", "attack", "area", "projectile", "ranged", "horizontal_projectile", "parabolic_projectile"];
    return s;
  }

  test("projectile-family increases (projectile/ranged/horizontal/parabolic) apply only to bomb skills", () => {
    for (const k of ["projectile", "ranged", "horizontal_projectile", "parabolic_projectile"]) {
      const melee = baseOnly(); melee.increased[k] = 50;
      expect(averageHit(melee)).toBe(100.0);                    // melee Spectral Slash → inert
      const bomb = bombify(baseOnly()); bomb.increased[k] = 50;
      expect(averageHit(bomb)).toBeCloseTo(150.0, 6);           // bomb is projectile/ranged → +50%
    }
  });

  test("skill tags are data-driven: a skill-scoped increase applies iff s.tags declares the tag", () => {
    const s = baseOnly();
    s.increased.channeled = 50;
    expect(averageHit(s)).toBe(100.0);                     // default (combo) tags lack channeled → inert
    s.tags = ["melee", "attack", "channeled"];
    expect(averageHit(s)).toBeCloseTo(150.0, 6);           // declares channeled → +50% applies
  });

  test("a skill gets only the tags it declares", () => {
    const s = baseOnly();
    s.tags = ["attack"];                                   // pure attack: no melee/area/projectile
    s.increased.melee = 50; s.increased.area = 50; s.increased.projectile = 50;
    expect(averageHit(s)).toBe(100.0);
    s.tags = ["attack", "melee", "area", "projectile"];
    expect(averageHit(s)).toBeCloseTo(250.0, 6);           // now all three: 1 + .5 + .5 + .5
  });

  test("increased.minion / channeled / triggered / focus never feed main-skill DPS", () => {
    for (const k of ["minion", "channeled", "triggered", "focus"]) {
      const bomb = bombify(baseOnly()); bomb.increased[k] = 80;
      expect(averageHit(bomb)).toBe(100.0);
      const melee = baseOnly(); melee.increased[k] = 80;
      expect(averageHit(melee)).toBe(100.0);
    }
  });

  test("increased.hit boosts the hit but NOT the deterioration DoT (hit-only)", () => {
    function detBomb(): Snapshot {
      const s = bombify(baseOnly());
      s.crit = { chance_pct: 0, damage_pct: 150 };
      s.deterioration = { chance_pct: 100, hit_damage_pct: 60, duration_s: 1, tick_interval_s: 0.3,
                          ramp_pct: 0, ramp_max_ticks: 0, obliterate_interval_s: 0.5 };
      return s;
    }
    const b = cycleDps(detBomb());
    const withHit = detBomb(); withHit.increased.hit = 100;
    const h = cycleDps(withHit);
    expect(h.deterioration_dps).toBeCloseTo(b.deterioration_dps, 4);              // DoT excludes hit-only
    expect(h.dps - h.deterioration_dps).toBeCloseTo(2 * (b.dps - b.deterioration_dps), 4);  // hit doubles
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

describe("double damage", () => {
  test("chance is a whole-hit multiplier, independent of crit", () => {
    const s = baseOnly();
    s.enemy.cold_res_pct = 0;
    s.crit = { chance_pct: 0, damage_pct: 150, double_damage_chance_pct: 25 };
    expect(expectedHit(s)).toBeCloseTo(125.0, 6);    // 100 × (1 + 0.25)
  });

  test("stacks multiplicatively with crit", () => {
    const s = baseOnly();
    s.enemy.cold_res_pct = 0;
    s.crit = { chance_pct: 100, damage_pct: 200, double_damage_chance_pct: 50 };
    expect(expectedHit(s)).toBeCloseTo(300.0, 6);    // 100 × crit 2.0 × 1.5
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

/* mechanics.md#erosion — Erosion is a separate damage type: its own flat add slot,
   its own resistance, unaffected by elemental res or armor. */
describe("erosion damage (separate mitigation)", () => {
  function eroSnap(): Snapshot {
    const s = baseOnly();
    s.crit = { chance_pct: 0, damage_pct: 150 };   // expectedHit == mitigated sum
    return s;
  }

  test("flat erosion is added, scaled by effectiveness, mitigated by erosion res", () => {
    const s = eroSnap();
    s.enemy.cold_res_pct = 50;                       // elemental portion halved
    s.enemy.erosion_res_pct = 0;                     // erosion unmitigated
    s.base.flat_added_erosion_min = 100;
    s.base.flat_added_erosion_max = 100;
    expect(expectedHit(s)).toBeCloseTo(150.0, 6);    // ele 100×0.5 + erosion 100×1.0
  });

  test("erosion res mitigates only the erosion portion", () => {
    const s = eroSnap();
    s.enemy.cold_res_pct = 0;
    s.enemy.erosion_res_pct = 25;
    s.base.flat_added_erosion_min = 200;
    s.base.flat_added_erosion_max = 200;
    expect(expectedHit(s)).toBeCloseTo(250.0, 6);    // ele 100 + erosion 200×0.75
  });

  test("erosion pen cuts erosion res", () => {
    const s = eroSnap();
    s.enemy.cold_res_pct = 0;
    s.enemy.erosion_res_pct = 50;
    s.penetration.erosion_pct = 30;                  // net 20% res
    s.base.flat_added_erosion_min = 100;
    s.base.flat_added_erosion_max = 100;
    expect(expectedHit(s)).toBeCloseTo(180.0, 6);    // ele 100 + erosion 100×0.8
  });

  test("erosion scales with additional and crit like any hit", () => {
    const s = eroSnap();
    s.enemy.cold_res_pct = 0;
    s.enemy.erosion_res_pct = 0;
    s.additional.strength = 50;                      // ×1.5 on both portions
    s.crit = { chance_pct: 100, damage_pct: 200 };   // ×2 on the whole hit
    s.base.flat_added_erosion_min = 100;
    s.base.flat_added_erosion_max = 100;
    expect(expectedHit(s)).toBeCloseTo(600.0, 6);    // (100 + 100)×1.5 × crit 2.0
  });

  test("no erosion fields leaves expectedHit unchanged", () => {
    const s = baseOnly();
    s.crit = { chance_pct: 0, damage_pct: 150 };
    s.enemy.cold_res_pct = 0;
    expect(expectedHit(s)).toBeCloseTo(100.0, 6);    // just the weapon hit
  });

  test("increased.erosion boosts only the erosion portion, not the weapon hit", () => {
    const s = eroSnap();
    s.enemy.cold_res_pct = 0;
    s.enemy.erosion_res_pct = 0;
    s.base.flat_added_erosion_min = 100;
    s.base.flat_added_erosion_max = 100;
    s.increased.erosion = 50;                        // +50% Erosion Damage only
    expect(expectedHit(s)).toBeCloseTo(250.0, 6);    // weapon 100 + erosion 100×1.5
  });

  test("weapon base erosion feeds the erosion portion, scaled by skill pct not effectiveness", () => {
    const s = eroSnap();
    s.enemy.cold_res_pct = 0;
    s.enemy.erosion_res_pct = 0;
    s.base.skill_weapon_pct = 200;                   // WAD scales weapon erosion, not eff
    s.base.added_damage_effectiveness_pct = 50;      // would apply to flat adds, NOT weapon base
    s.base.weapon_flat_erosion_min = 50;
    s.base.weapon_flat_erosion_max = 50;
    // ele weapon 100×200% = 200 ; erosion 50×200% (skill pct) = 100
    expect(expectedHit(s)).toBeCloseTo(300.0, 6);
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

/* mechanics.md#deterioration — Ruinous Star SS13: Obliterate-enhanced skill uses
   deal Erosion and inflict Deterioration; each stack ticks True Damage every
   0.33s for its duration, ramping +30% additional per tick up to 5 times. */
describe("deterioration is inert without an Obliterate base", () => {
  test("accumulated modifier mods (chance/damage/duration) but no base tick → no DoT", () => {
    const s = baseOnly();
    // what a parsed build gets from gear/slate mods alone, with no Obliterate source
    s.deterioration = { chance_pct: 80, damage_inc_pct: 20, duration_inc_pct: 30 };
    expect(cycleDps(s).deterioration_dps).toBe(0);   // hit_damage_pct absent ⇒ dormant, not NaN
  });
});

describe("deterioration", () => {
  const det = () => ({ chance_pct: 100, hit_damage_pct: 60,
                       duration_s: 1, duration_inc_pct: 0, tick_interval_s: 0.33,
                       ramp_pct: 30, ramp_max_ticks: 5, damage_inc_pct: 0,
                       additional_damage_pct: 0, obliterate_interval_s: 0.5 });

  test("tick sum: 1s duration is 3 additively ramping ticks", () => {
    // 1 + 1.3 + 1.6 = 3.9 — additive ramp, measured 2026-07-20 (compound 3.99 refuted)
    expect(deteriorationTickSum(det())).toBeCloseTo(3.9, 9);
  });

  test("tick sum: duration bonus crosses tick breakpoints", () => {
    const d = det();
    d.duration_inc_pct = 35;   // 1.35s -> 4 ticks: + the 1.9 tick
    expect(deteriorationTickSum(d)).toBeCloseTo(5.8, 9);
  });

  test("tick grid is strict: a tick landing exactly at expiry does NOT fire", () => {
    // frame-counted 2026-07-20 (real build, 60fps): stacks expire at 97±1 frames =
    // 1.63s (duration lines SUM), and the interval that satisfies this + the L16
    // chain (1.30s -> 3 ticks) + the slate-lever boundary cross is 0.325s strict:
    // 1.30/0.325 = 4.00 exactly -> the 4th tick at expiry does not land
    const d = det();
    d.tick_interval_s = 0.325;
    d.duration_inc_pct = 30;             // 1.30s
    expect(deteriorationTickSum(d)).toBeCloseTo(3.9, 9);
    d.duration_inc_pct = 63;             // 1.63s -> ticks at 0.325..1.625, five land
    expect(deteriorationTickSum(d)).toBeCloseTo(1 + 1.3 + 1.6 + 1.9 + 2.2, 9);
  });

  test("tick sum: ramp caps at ramp_max_ticks increments", () => {
    const d = det();
    d.duration_s = 3;          // 9 ticks: increments 0..5 then held at 5
    const expected = [0, 1, 2, 3, 4, 5, 5, 5, 5]
      .reduce((a, e) => a + 1 + 0.3 * e, 0);
    expect(deteriorationTickSum(d)).toBeCloseTo(expected, 9);
  });

  test("no deterioration section leaves cycleDps unchanged", () => {
    const r = cycleDps(rotationSnap());
    expect(r.dps).toBeCloseTo(145.0, 9);
    expect(r.deterioration_dps).toBe(0);
  });

  test("every use enhanced: det dps is hit dps x chance x 60% x tick sum", () => {
    const s = rotationSnap();
    s.deterioration = det();   // 3 uses in a 4s cycle, one Obliterate per 0.5s -> all enhanced
    const r = cycleDps(s);
    expect(r.deterioration_dps).toBeCloseTo(145.0 * 0.6 * 3.9, 6);
    expect(r.dps).toBeCloseTo(145.0 * (1 + 0.6 * 3.9), 6);
  });

  test("obliterate cadence gates the enhanced-use fraction", () => {
    const s = rotationSnap();
    s.deterioration = det();
    s.deterioration.obliterate_interval_s = 2;   // 4s cycle -> 2 of 3 uses enhanced
    expect(cycleDps(s).deterioration_dps).toBeCloseTo(145.0 * 0.6 * 3.9 * (2 / 3), 6);
  });

  test("chance and deterioration damage multipliers scale linearly", () => {
    const s = rotationSnap();
    s.deterioration = det();
    s.deterioration.chance_pct = 50;
    s.deterioration.damage_inc_pct = 32;          // Nether King node
    s.deterioration.additional_damage_pct = 8;    // Shadowmaster legendary node
    expect(cycleDps(s).deterioration_dps)
      .toBeCloseTo(145.0 * 0.6 * 3.9 * 0.5 * 1.32 * 1.08, 6);
  });

  test("paralysis derives from its source: chance > 0 gates the +15% taken (scaled by inflicted effect)", () => {
    // mechanics.md#classification Paralysis row — +15% taken, stacks 1; the model
    // derives presence from the build's inflict chance so dead tree lines (the +80%
    // effect with no source) stay automatic no-ops
    const base = rotationSnap();
    const noSource = structuredClone(base);
    noSource.paralysis = { chance_pct: 0, effect_inc_pct: 80 };
    expect(cycleDps(noSource).dps).toBeCloseTo(cycleDps(base).dps, 9);
    const sourced = structuredClone(base);
    sourced.paralysis = { chance_pct: 25, effect_inc_pct: 80 };
    expect(cycleDps(sourced).dps / cycleDps(base).dps).toBeCloseTo(1.27, 9);
  });

  test("enemy-taken debuffs apply to deterioration ONCE (inherited from the hit)", () => {
    // Clean-protocol Timid A/B, real build 2026-07-20 (frozen auras): ×1.365 ≈ the
    // single-dip 1.39 at det-share ~0.9. An earlier ÷2.146 read suggested ticks
    // re-take debuffs — that was aura contamination, REFUTED. mechanics.md#deterioration
    const base = rotationSnap();
    base.deterioration = det();
    const taken = structuredClone(base);
    taken.enemy_taken.timid = 39;
    const r0 = cycleDps(base), r1 = cycleDps(taken);
    expect(r1.deterioration_dps / r0.deterioration_dps).toBeCloseTo(1.39, 9);
    expect(r1.dps / r0.dps).toBeCloseTo(1.39, 9);
  });

  test("obliterate gates per THROW: bombs_per_throw does not dilute the enhanced share", () => {
    // Obliterate enhances the Main-Skill USE (the throw); every bomb of an enhanced
    // throw inflicts. Surfaced by the real-build Pedigree A/B 2026-07-20: measured
    // /2.294 exceeded the /2.16 ceiling of the diluted model (2.5 BB bombs, 1.379/s).
    const s = rotationSnap();
    s.deterioration = det();
    const perThrowShare = cycleDps(s).deterioration_dps / cycleDps(s).dps;
    const moreBombs = structuredClone(s);
    moreBombs.rotation.bombs_per_throw = 5;   // same throw cadence, more bombs
    const r = cycleDps(moreBombs);
    expect(r.deterioration_dps / r.dps).toBeCloseTo(perThrowShare, 9);
  });

  test("deterioration chance caps at 100%", () => {
    const s = rotationSnap();
    s.deterioration = det();
    s.deterioration.chance_pct = 118;             // measured: >100% does nothing
    expect(cycleDps(s).deterioration_dps).toBeCloseTo(145.0 * 0.6 * 3.9, 6);
  });

  test("increased Deterioration Damage joins the increased SUM, not a flat ×(1+v)", () => {
    const s = rotationSnap();
    s.increased.global = 27;                      // hit envelope pool 1.27
    s.deterioration = det();
    s.deterioration.damage_inc_pct = 24;
    // ticks scale ×(1.27+0.24)/1.27, on hits already carrying ×1.27
    expect(cycleDps(s).deterioration_dps)
      .toBeCloseTo(145.0 * 1.27 * 0.6 * 3.9 * (1.51 / 1.27), 6);
  });
});

/* Conversion system — mechanics.md#support-additional-sum. Claims on a type sum;
   past 100% they redistribute by weight. Portions keep their full type HISTORY and a
   typed modifier applies iff its type appears in it (full source+destination
   double-dip); typed lines compound within a path; mitigation follows the FINAL type. */
describe("conversion system", () => {
  function conv(): Snapshot {
    const s = baseOnly();
    s.crit = { chance_pct: 0, damage_pct: 150 };   // expectedHit reads raw
    return s;
  }
  // Hammer of Ash (phys->fire) + Obliterate (phys+ele->erosion): the confirmed
  // contested-claim rig — weapon phys splits 50/50
  const RS = [
    { from: "physical", to: "fire", pct: 100 },
    { from: "physical", to: "erosion", pct: 100 },
    { from: "lightning", to: "erosion", pct: 100 },
    { from: "cold", to: "erosion", pct: 100 },
    { from: "fire", to: "erosion", pct: 100 },
  ] as const;

  test("uncontested phys->fire: phys AND fire typed increases both apply in full", () => {
    const s = conv();
    s.conversion = [{ from: "physical", to: "fire", pct: 100 }];
    expect(expectedHit(s)).toBeCloseTo(100, 9);
    s.increased.fire = 100;
    expect(expectedHit(s)).toBeCloseTo(200, 9);
    s.increased.fire = 0;
    s.increased.physical = 100;
    expect(expectedHit(s)).toBeCloseTo(200, 9);
  });

  test("contested claims redistribute: fire-typed hits only the fire path, phys both", () => {
    const s = conv();
    s.conversion = [...RS];
    s.increased.fire = 100;
    expect(expectedHit(s)).toBeCloseTo(150, 9);          // 0.5×200 + 0.5×100
    s.increased.physical = 100;                          // sums with fire inside path A
    expect(expectedHit(s)).toBeCloseTo(250, 9);          // 0.5×300 + 0.5×200
  });

  test("typed additional compounds with typed increased inside the path", () => {
    const s = conv();
    s.conversion = [...RS];
    s.increased.fire = 81;
    s.additional_typed = { elemental: { fusion: 35 } };
    expect(expectedHit(s)).toBeCloseTo(0.5 * 100 * 1.81 * 1.35 + 0.5 * 100, 6);
  });

  test("cold-origin portions: cold-typed applies in full, fire-typed never", () => {
    const s = conv();
    s.base.flat_added_cold_min = 50;
    s.base.flat_added_cold_max = 50;
    s.conversion = [...RS];
    s.increased.cold = 100;
    expect(expectedHit(s)).toBeCloseTo(100 + 100, 9);    // weapon 100 + cold 50×2
    s.increased.cold = 0;
    s.increased.fire = 100;
    expect(expectedHit(s)).toBeCloseTo(150 + 50, 9);     // was-cold untouched by fire
  });

  test("elemental tag matches any of fire/cold/lightning in the history", () => {
    const s = conv();
    s.base.flat_added_cold_min = 100;
    s.base.flat_added_cold_max = 100;
    s.conversion = [{ from: "cold", to: "erosion", pct: 100 }];  // weapon stays phys
    s.increased.elemental = 100;
    expect(expectedHit(s)).toBeCloseTo(100 + 200, 9);    // only the was-cold doubles
  });

  test("mitigation follows the FINAL type: erosion res, not elemental res", () => {
    const s = conv();
    s.enemy.cold_res_pct = 50;
    s.enemy.erosion_res_pct = 0;
    s.conversion = [...RS];
    expect(expectedHit(s)).toBeCloseTo(100, 9);          // all ends erosion: 0% res
    s.conversion = [{ from: "physical", to: "fire", pct: 100 }];
    expect(expectedHit(s)).toBeCloseTo(50, 9);           // stays elemental: 50% res
  });

  test("untyped increased and additional apply to every path", () => {
    const s = conv();
    s.conversion = [...RS];
    s.increased.attack = 50;
    s.additional.misc = 20;
    expect(expectedHit(s)).toBeCloseTo(100 * 1.5 * 1.2, 6);
  });
});
