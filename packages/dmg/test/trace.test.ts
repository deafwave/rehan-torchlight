import { describe, expect, test } from "vitest";
import { cycleDps, type Snapshot } from "../src/damageModel.js";
import { resolve, impact } from "../src/trace.js";
import { baseOnly } from "./helpers.js";

/* A bomb (HoA) snapshot with erosion + demolisher, and a combo (Spectral) snapshot,
   mirroring the two cycleDps branches. The trace must reconstruct cycleDps().dps
   exactly for both, so the chips shown on the page can never lie about the number. */
function bombSnap(): Snapshot {
  const s = baseOnly();
  Object.assign(s.base, { skill_weapon_pct: 369, added_damage_effectiveness_pct: 369,
                          flat_added_erosion_min: 50, flat_added_erosion_max: 50 });
  s.increased.erosion = 14;
  s.enemy = { cold_res_pct: 30, armor_reduction_pct: 0, erosion_res_pct: 30 };
  s.crit = { chance_pct: 5, damage_pct: 150 };
  s.penetration = { cold_pct: 0, armor_pct: 0, erosion_pct: 0 };
  s.rotation = { bombs_per_throw: 2, throw_rate_base: 1, attack_speed_inc_pct: 0,
                 hits_per_bomb: 0.8353, proj_base: 5, proj_added: 0,
                 demolisher_empower_mult: 3.65 };
  s.skill_type = "bomb";
  return s;
}

function comboSnap(): Snapshot {
  const s = baseOnly();
  s.rotation = { starters_per_cycle: 2, starter_weapon_pct: 100, attack_speed_inc_pct: 0,
                 finisher_additional_as_pct: -50, extra_clones: 0, clone_falloff: 0.7,
                 mark_taken_pct: 0, combo_points: 4, finisher_amp_pct: 0 };
  s.base.weapon_attack_speed = 1.0;
  s.base.skill_weapon_pct = 100;
  s.crit = { chance_pct: 0, damage_pct: 150 };
  s.skill_type = "combo";
  return s;
}

const det = () => ({ chance_pct: 100, hit_damage_pct: 60, duration_s: 1, duration_inc_pct: 0,
  tick_interval_s: 0.33, ramp_pct: 30, ramp_max_ticks: 5, damage_inc_pct: 0,
  additional_damage_pct: 0, obliterate_interval_s: 0.5 });

describe("trace reconciles to cycleDps().dps", () => {
  const cases: [string, () => Snapshot][] = [
    ["bomb", bombSnap], ["combo", comboSnap],
    ["bomb + det", () => Object.assign(bombSnap(), { deterioration: det() })],
    ["combo + det", () => Object.assign(comboSnap(), { deterioration: det() })],
  ];
  for (const [name, mk] of cases) {
    test(name, () => {
      const r = cycleDps(mk());
      expect(resolve(r.trace.root)).toBeCloseTo(r.dps, 4);
    });
  }
});

describe("trace layers & chips", () => {
  test("bomb rotation has a demolisher chip; dot node only when det active", () => {
    const s = bombSnap();
    const r = cycleDps(s);
    expect(r.trace.layers.rotation.chips.some(c => /demolisher/i.test(c.label))).toBe(true);
    expect(r.trace.layers.dot).toBeUndefined();
    s.deterioration = det();
    expect(cycleDps(s).trace.layers.dot).toBeDefined();
  });

  test("combo rotation exposes a finisher chip", () => {
    const r = cycleDps(comboSnap());
    expect(/finisher/i.test(JSON.stringify(r.trace.layers.rotation))).toBe(true);
  });

  test("per-hit layer carries the additional chip once (not per starter/finisher)", () => {
    const s = comboSnap();
    s.additional.misc = 100;
    const r = cycleDps(s);
    const matches = r.trace.layers.perHit.chips.filter(c => /misc/.test(c.label));
    expect(matches.length).toBe(1);
  });

  // Conversion paths used to collapse increased/additional/taken into one opaque
  // "path envelope" chip (×480k, −58%). Expand so each factor is its own chip,
  // gated by portion history the way pathEnvelope is.
  test("conversion path envelope expands into per-factor chips (no lumped chip)", () => {
    const s = bombSnap();
    s.conversion = [
      { from: "physical", to: "fire", pct: 100 },
      { from: "physical", to: "erosion", pct: 100 },
      { from: "fire", to: "erosion", pct: 100 },
    ];
    s.increased.attack = 50;
    s.increased.fire = 100;
    s.additional.misc = 20;
    s.additional_typed = { elemental: { fusion: 35 } };
    s.enemy_taken.frostbite = 10;
    const r = cycleDps(s);
    const labels = JSON.stringify(r.trace.layers.perHit);
    expect(labels).not.toMatch(/path envelope/i);
    // untyped increased/additional/taken appear as separate chips
    expect(labels).toMatch(/increased · attack/);
    expect(labels).toMatch(/increased · fire/);
    expect(labels).toMatch(/additional · misc/);
    expect(labels).toMatch(/additional · elemental · fusion/);
    expect(labels).toMatch(/taken · frostbite/);
    // fire-typed only lands on the fire-history path, not pure phys→erosion
    const portions = r.trace.layers.perHit.children![0].children!;
    const firePath = portions.find(p => p.label.includes("fire"))!;
    const eroOnly = portions.find(p => p.label === "physical→erosion" ||
      (p.label.includes("physical") && p.label.includes("erosion") && !p.label.includes("fire")))!;
    expect(firePath.chips.some(c => c.label === "increased · fire")).toBe(true);
    expect(firePath.chips.some(c => c.label === "additional · elemental · fusion")).toBe(true);
    expect(eroOnly.chips.some(c => c.label === "increased · fire")).toBe(false);
    expect(eroOnly.chips.some(c => c.label === "additional · elemental · fusion")).toBe(false);
    // both paths share untyped attack
    expect(firePath.chips.some(c => c.label === "increased · attack")).toBe(true);
    expect(eroOnly.chips.some(c => c.label === "increased · attack")).toBe(true);
    expect(resolve(r.trace.root)).toBeCloseTo(r.dps, 4);
  });
});

describe("impact (marginal DPS if a chip is removed)", () => {
  test("a per-hit ×2 additional chip reads ~50%", () => {
    const s = comboSnap();
    s.additional.misc = 100;                    // ×2 on every hit
    const r = cycleDps(s);
    const chip = r.trace.layers.perHit.chips.find(c => /misc/.test(c.label))!;
    expect(impact(r.trace.root, chip)).toBeCloseTo(0.5, 6);
  });

  test("a DoT-only chip's impact is below the DoT's DPS share", () => {
    const s = comboSnap();
    s.deterioration = det();                     // chance 100 -> chance chip is a no-op
    const r = cycleDps(s);
    const share = r.deterioration_dps / r.dps;
    const tick = r.trace.layers.dot!.chips.find(c => /tick sum/i.test(c.label))!;
    // removing the ×3.9 tick-sum scales the DoT node by 1/3.9
    expect(impact(r.trace.root, tick)).toBeCloseTo(share * (1 - 1 / 3.9), 6);
  });
});
