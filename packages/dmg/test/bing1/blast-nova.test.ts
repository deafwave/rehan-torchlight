import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { cycleDps, expectedHit, type Snapshot } from "../../src/damageModel.js";
import { fromRoot } from "../../src/py.js";
import { baseOnly } from "../helpers.js";

/* Bing1 — "Blast Nova" build: Hammer of Ash, fire/attack/melee/area/projectile bomb
   playstyle. This suite is the LIVING SPEC of the build's progression — every gear or
   trait step adds a case asserting the model reproduces that step's in-game DPS log, so
   the formula is pinned to ground truth as it grows. mechanics.md#bing-bombs */

// Step 0 — bare baseline (clean-macro A/B 2026-07-19: span 1,287 / 5s-high 1,458):
//   L20 Hammer of Ash (369% WAD, 100% phys->fire) + base Destroyer Mallet
//   (175-175 phys @ 1.5 APS = 262 DPS) + L1 Blast Nova (+2 proj, 2 bombs/throw, 1/s),
//   vs a lv85 target (30% fire res, armor irrelevant — all damage is fire).
//   hits_per_bomb 0.8353 (normal-throw hits) decomposes the same bare anchor 1,458 as
//   2 × expectedHit × 0.8353 × (2+M)/3 with the structural demolisher (M 3.65, n 3) —
//   numerically identical to the earlier 1.299 × flat-1.211 fit, which itself
//   superseded the 1.107 old-39s-span fit (avg-5s 1,025 quiet / 39s 1,242).
//   proj_base 5 = HoA base 1 + HoA "+2 Projectile Quantity" + Blast Nova +2.
//   Noise floor (bare repeats 2026-07-19: 1,308/1,518, 1,325/1,546, 1,290/1,417 +
//   original 1,287/1,458): spans ±1.3%, 5s-highs ±4.5% (5% crit — best-of-window
//   selects crit spikes) ⇒ ratio deltas calibrate on SPAN MEANS (bare mean 1,302.5),
//   absolutes stay on the 1,458 anchor (pooled 5s-high mean 1,485, consistent).
//   Cross-check at a different WAD scale: HoA L3 read 507 span / 580 peak back-solves
//   WAD_L3 = 369 × 580/1,458 = 146.8% (tlidb has no per-level table); window
//   efficiency span/peak 0.87-0.89 consistent across all clean-macro reads.
function bing1Baseline(): Snapshot {
  return {
    base: { weapon_phys_min: 175, weapon_phys_max: 175,
            weapon_flat_cold_min: 0, weapon_flat_cold_max: 0,
            gear_phys_pct: 0, gain_phys_as_cold_pct: 0,
            weapon_attack_speed: 1.5, skill_weapon_pct: 369,
            flat_added_min: 0, flat_added_max: 0,
            flat_added_cold_min: 0, flat_added_cold_max: 0,
            added_damage_effectiveness_pct: 369 },
    increased: { physical: 0, fire: 0, attack: 0, melee: 0, area: 0,
                 projectile: 0, elemental: 0, global: 0 },
    additional: { strength: 0, frenzy_hound: 0, blast_barrage: 0, misc: 0 },
    enemy_taken: { ignite: 0, misc: 0 },
    crit: { chance_pct: 5, damage_pct: 150 },
    penetration: { cold_pct: 0, armor_pct: 0 },
    enemy: { cold_res_pct: 30, armor_reduction_pct: 0 },
    rotation: { bombs_per_throw: 2, throw_rate_base: 1, attack_speed_inc_pct: 0,
                hits_per_bomb: 0.8353, proj_base: 5, proj_added: 0,
                demolisher_empower_mult: 3.65, demolisher_resto_pct: 0 },
    deterioration: { chance_pct: 0, hit_damage_pct: 60, duration_s: 1, duration_inc_pct: 0,
                     tick_interval_s: 0.33, ramp_pct: 30, ramp_max_ticks: 5,
                     damage_inc_pct: 0, additional_damage_pct: 0, obliterate_interval_s: 0.5 },
  };
}

describe("Bing1 baseline — L20 HoA, base Destroyer Mallet, L1 Blast Nova (bare A/B 2026-07-19)", () => {
  test("per projectile hit vs lv85 (30% fire res)", () => {
    // 175 × 3.69 = 645.75 fire, × 1.025 crit × 0.70 mitigation
    expect(expectedHit(bing1Baseline())).toBeCloseTo(463.3, 1);
  });

  test("bare model reproduces the clean-macro 5s-high (1,458 — the anchor)", () => {
    expect(cycleDps(bing1Baseline()).dps).toBeCloseTo(1458, 0);
  });

  test("HoA L3 read (507/580): DPS scales exactly with WAD", () => {
    const s = bing1Baseline();
    s.base.skill_weapon_pct = 146.8;              // back-solved 369 × 580/1458
    s.base.added_damage_effectiveness_pct = 146.8;
    expect(cycleDps(s).dps).toBeCloseTo(580, 0);
  });
});

// Step 1 — + L16 Added Erosion Damage support (50-50 flat Erosion).
//   Flat added scales by HoA's 369% added-damage effectiveness: 50 × 3.69 = 184.5/hit.
//   Erosion is its own damage type with its own resistance, in a dedicated erosion_res
//   slot so it stays right once Obliterate converts everything to Erosion. Erosion res
//   = 30%, uniform with the dummy's confirmed 30% fire/cold/lightning (user 2026-07-19);
//   three clean-macro A/B spans (1,646/1,862, 1,767/1,988, 1,673/1,862) back-solve
//   26 ± 7%, consistent — supersedes the 27.2% fit to the old 39s log (1,611 39s /
//   1,281 avg-5s / 1,873 peak-5s). Model 1,874 vs that recorded peak 1,873 (+0.1%);
//   new span mean 1,695.3 / model = 0.905 window efficiency. mechanics.md#erosion
describe("Bing1 step 1 — + L16 Added Erosion Damage (50-50 flat)", () => {
  function withErosion(): Snapshot {
    const s = bing1Baseline();
    s.base.flat_added_erosion_min = 50;
    s.base.flat_added_erosion_max = 50;
    s.enemy.erosion_res_pct = 30;
    s.penetration.erosion_pct = 0;
    return s;
  }

  test("erosion adds 50 × effectiveness, mitigated by erosion res (30%)", () => {
    // 50 × 3.69 = 184.5 raw, × (1 − 0.30) erosion res × 1.025 crit
    const delta = expectedHit(withErosion()) - expectedHit(bing1Baseline());
    expect(delta).toBeCloseTo(184.5 * 0.70 * 1.025, 3);
  });

  test("model ~1,874 vs the recorded peak-5s 1,873", () => {
    expect(cycleDps(withErosion()).dps).toBeCloseTo(1874, -1);
  });
});

// Step 2 — + L16 Added Physical / Cold / Fire / Lightning supports (elemental flats).
//   L16 min-max: phys 38-63 (HoA converts to Fire), cold 40-60, fire 35-65, lightning 5-95.
//   All four are elemental, lumped into the single 30% elemental slot — the dummy's
//   fire/cold/lightning res are all confirmed 30% (user 2026-07-19), so the lump is
//   exact. Erosion (Step 1) stays separate. Prediction pending an in-game log.
//   mechanics.md#supports-ss13
describe("Bing1 step 2 — + L16 Added Phys/Cold/Fire/Lightning", () => {
  function withAllAdds(): Snapshot {
    const s = bing1Baseline();
    s.base.flat_added_erosion_min = 50;                 // Step 1, its own res
    s.base.flat_added_erosion_max = 50;
    s.enemy.erosion_res_pct = 30;
    s.base.flat_added_cold_min = 38 + 40 + 35 + 5;      // 118 min, four elemental adds
    s.base.flat_added_cold_max = 63 + 60 + 65 + 95;     // 283 max
    return s;
  }

  test("elemental adds scale by 369% effectiveness into the 30% slot", () => {
    const s = withAllAdds();
    const base = bing1Baseline();
    base.base.flat_added_erosion_min = 50;              // isolate the elemental-adds delta
    base.base.flat_added_erosion_max = 50;
    base.enemy.erosion_res_pct = 30;
    // avg 200.5 × 3.69 effectiveness × 0.70 res × 1.025 crit
    expect(expectedHit(s) - expectedHit(base)).toBeCloseTo(200.5 * 3.69 * 0.70 * 1.025, 2);
  });

  test("predicted peak DPS (uniform 30% res) ~3,544", () => {
    const dps = cycleDps(withAllAdds()).dps;
    expect(dps).toBeGreaterThan(3525);
    expect(dps).toBeLessThan(3565);
  });
});

// Step 3 — drop the 4 elemental adds, + "14% Erosion Damage" (increased, erosion-typed).
//   Increased Erosion Damage boosts ONLY the erosion portion (~23% of the hit), so +14% is
//   just ~+3.1% total. In-game log, CLEAN 30s macro (timer starts on attack, 2026-07-20):
//   span 1,740 / 5s-avg 1,879 / 5s-high 1,921. Window efficiency span/5s-high = 0.906
//   (up from the pre-macro 0.81 — the macro removed the extra startup delay, as
//   predicted). Model 1,933 vs the 5s-high 1,921 = +0.6%. mechanics.md#erosion
describe("Bing1 step 3 — + 14% increased Erosion Damage (elemental adds removed)", () => {
  function withEroInc(): Snapshot {
    const s = bing1Baseline();
    s.base.flat_added_erosion_min = 50;
    s.base.flat_added_erosion_max = 50;
    s.enemy.erosion_res_pct = 30;
    s.increased.erosion = 14;
    return s;
  }

  test("+14% Erosion Damage lifts only the erosion portion (~+3.1% total)", () => {
    const base = withEroInc();
    base.increased.erosion = 0;
    expect(cycleDps(withEroInc()).dps / cycleDps(base).dps).toBeCloseTo(1.031, 3);
  });
});

// Step 4 — + L16 Quick Return support (on top of Step 3's erosion setup).
//   supports.json anchors: +15.5% (Lv1) → +25.5% (Lv21) additional damage ⇒ 23% at L16
//   (own ×1.23 bucket), and +97% Demolisher Charge Restoration Speed ⇒ 1.523s interval
//   ⇒ n=2 — confirmed on bare 2026-07-20 (tooltip reads 97%; spans 1,920/1,970/1,952;
//   "every other one is exploding" visually). The 2026-07-19 erosion-setup session
//   (span 1,992 / 5s-high 2,383) matches n=3 instead and is inconsistent with every
//   later read — flagged SUSPECT, kept as history only; no valid log backs this step's
//   absolute yet. mechanics.md#quick-return
describe("Bing1 step 4 — + L16 Quick Return (+23% additional, resto 97 ⇒ n=2)", () => {
  function step3(): Snapshot {
    const s = bing1Baseline();
    s.base.flat_added_erosion_min = 50;
    s.base.flat_added_erosion_max = 50;
    s.enemy.erosion_res_pct = 30;
    s.increased.erosion = 14;
    return s;
  }
  function withQuickReturn(): Snapshot {
    const s = step3();
    s.additional.quick_return = 23;
    s.rotation.demolisher_resto_pct = 97;
    return s;
  }

  test("×1.23 bucket × n 3→2 frequency = ×1.5185 over step 3", () => {
    expect(cycleDps(withQuickReturn()).dps / cycleDps(step3()).dps).toBeCloseTo(1.5185, 3);
  });

  test("model ~2,935 (no valid log — the 2026-07-19 session is suspect)", () => {
    expect(cycleDps(withQuickReturn()).dps).toBeCloseTo(2935, -1);
  });
});

/* Support A/B calibrations — bare baseline + ONE gem each, clean 30s macro 2026-07-19.
   Ratios are read off SPAN MEANS vs the bare span mean 1,302.5 (see the baseline
   noise-floor note); each gem is modeled at its cited line values.

   Passivation L20 (span 1,248 / 5s-high 1,448 vs bare 1,458): "up to +60% additional
   EROSION Damage" is a predicted and confirmed no-op — the bare build has zero erosion
   damage, so erosion-typed additional touches nothing. No test: the model has no
   erosion-typed additional bucket to assert until the build runs one alongside erosion
   adds. mechanics.md row "Passivation".

   Multistrike: does not trigger on Blast Nova bomb throws (user-tested 2026-07-19) —
   stays display-only/no-op for Bing. mechanics.md row "Multistrike". */

// Multiple Projectiles L19 (span 1,958 / 5s-high 2,321): +2 Projectile Quantity ⇒ hits
// ×7/5 (proj_base 5), plus +14.6% additional (anchors 7.4 Lv1 → 15.4 Lv21). Measured
// ×1.592 vs predicted ×1.604. The A/B that established linear proj-count hit scaling
// (a constant pummel component would have shown ×1.09, not ×1.39 residual).
// mechanics.md#multi-proj
describe("Bing1 A/B — + L19 Multiple Projectiles on bare", () => {
  function withMP(): Snapshot {
    const s = bing1Baseline();
    s.additional.multiple_projectiles = 14.6;
    s.rotation.proj_added = 2;
    return s;
  }

  test("+2 proj × additional line = ×1.6044 over bare", () => {
    expect(cycleDps(withMP()).dps / cycleDps(bing1Baseline()).dps).toBeCloseTo(1.6044, 4);
  });

  test("model ~2,339 vs the 5s-high 2,321 (−0.8%)", () => {
    expect(cycleDps(withMP()).dps).toBeCloseTo(2339, -1);
  });
});

// Increased Area L18 (spans 1,647 / 1,632 / 1,611, mean 1,630): +19.4% additional
// (anchors 16 Lv1 → 20 Lv21). Measured span ratio ×1.252 vs additional-only ×1.194 —
// the +4.8% surplus persisted across 3 runs (span noise ±1.3%) ⇒ the +20% Skill Area
// line is REAL single-target damage: empowered-throw explosions land where projectiles
// land and need radius to overlap the boss. Left unmodeled pending the user's planned
// Skill Area / Slow Projectile breakpoint sweep. mechanics.md#bing-skill-area
describe("Bing1 A/B — + L18 Increased Area on bare", () => {
  function withArea(): Snapshot {
    const s = bing1Baseline();
    s.additional.increased_area = 19.4;
    return s;
  }

  test("model ~1,741 (additional line only; the area line's ×1.048 stays unmodeled)", () => {
    expect(cycleDps(withArea()).dps).toBeCloseTo(1741, -1);
  });
});

// Quick Return demolisher ladder (spans; additional 23% at L16, 24.5% at L19).
// Charge interval = 3s/(1+resto%) — confirmed point-by-point by the user's table
// (200%⇒1.0s ... 1400%⇒0.2s); consumed at the THROW (not the 1.5s detonation), so
// n = ceil(interval × throwRate) — encoded in cycleDps. Verified rungs at ~1 throw/s:
//   L16 97% ⇒ n=2 (2026-07-20 bare A/B: spans 1,920/1,970/1,952 mean 1,947.3 = ×1.495
//     vs bare, model ×1.518, eff 0.880; "every other one is exploding" visually)
//   L19 100% ⇒ n=2 (spans 1,956/2,013/1,942 mean 1,970 = ×1.513, model ×1.537, eff 0.879)
//   ~196–200% total ⇒ n=1 (spans 3,218/3,139/3,043 mean 3,133 = ×2.405, model ×2.384,
//     eff 0.902; reported 196% strictly derives n=2 — the session behaved as every-throw,
//     so the true total sat at/over the 200% threshold; helper uses 200)
// These rungs + bare jointly fit M = 3.65 (≈ ×3.15 from +215% additional hit × ~1.16
// explosion overlap). 199% edge: user's math says it misses the 1.0s threshold; one
// observation read every-attack — display rounding, don't sit on thresholds.
// mechanics.md#quick-return, mechanics.md#bing-bombs
describe("Bing1 A/B — Quick Return demolisher-frequency ladder", () => {
  function qrL16(): Snapshot {
    const s = bing1Baseline();
    s.additional.quick_return = 23;
    s.rotation.demolisher_resto_pct = 97;
    return s;
  }
  function qrL19(): Snapshot {
    const s = bing1Baseline();
    s.additional.quick_return = 24.5;
    s.rotation.demolisher_resto_pct = 100;
    return s;
  }
  function qr196(): Snapshot {
    const s = bing1Baseline();
    s.additional.quick_return = 23;
    s.rotation.demolisher_resto_pct = 200;
    return s;
  }

  test("L16 (97% restore ⇒ n=2): model ~2,214, ×1.518 over bare", () => {
    expect(cycleDps(qrL16()).dps).toBeCloseTo(2214, -1);
    expect(cycleDps(qrL16()).dps / cycleDps(bing1Baseline()).dps).toBeCloseTo(1.518, 3);
  });

  test("L19 (100% restore ⇒ n=2): model ~2,241, ×1.537 over bare", () => {
    expect(cycleDps(qrL19()).dps).toBeCloseTo(2241, -1);
    expect(cycleDps(qrL19()).dps / cycleDps(bing1Baseline()).dps).toBeCloseTo(1.537, 3);
  });

  test("200% restore ⇒ n=1: model ~3,475, ×2.384 over bare", () => {
    expect(cycleDps(qr196()).dps).toBeCloseTo(3475, -1);
    expect(cycleDps(qr196()).dps / cycleDps(bing1Baseline()).dps).toBeCloseTo(2.384, 3);
  });
});

// Elemental Fusion L20: +35.0% additional Elemental (anchors 25.5 Lv1 → 35.5 Lv21) —
// all bare damage is fire, so the elemental typing is total here (a build with erosion
// would need a typed bucket). Pooled spans 1,676 / 1,849 / 1,726 / 1,792 (mean 1,760.8,
// 2026-07-19/20) = ×1.3518 vs bare — dead on the predicted ×1.35; the first session's
// −4.8% was run variance. Span/steady efficiency 0.895. mechanics.md#supports-ss13
describe("Bing1 A/B — + L20 Elemental Fusion on bare", () => {
  function withFusion(): Snapshot {
    const s = bing1Baseline();
    s.additional.elemental_fusion = 35.0;
    return s;
  }

  test("model ~1,968 (pooled span mean 1,760.8 = ×1.3518, predicted ×1.35)", () => {
    expect(cycleDps(withFusion()).dps).toBeCloseTo(1968, -1);
  });
});

// Bomb geometry A/Bs (spans, 2026-07-20): projectile SPEED moves single-target hits in
// both directions — embers auto-trace, so slower travel = more overlap. Stripping each
// gem's additional line from the span ratio leaves the pure geometry factor H vs bare:
//   Slow Projectile L19 (−30% proj speed, +28.5% additional): span 1,990 ⇒ H ×1.189
//   Wind Projectiles L16 (+20% proj speed, +23% additional): span 1,424 ⇒ H ×0.889
//   with Skill Area stacked (sum per the user's formula; 54% talent + IA's 20%):
//   SP+area1.54 2,249 ⇒ ×1.344 | SP+IA(1.20) 2,663 ⇒ ×1.333 | SP+IA+54 (1.74)
//   2,866 ⇒ ×1.434 | SP+area2.26 spans 2,593/2,420/2,467/2,607 ⇒ ×1.507 |
//   IA+54 (1.74) 1,687 ⇒ ×1.085 | WP+area1.54 1,621 ⇒ ×1.012.
// Explosions exist ONLY on empowered throws (user 2026-07-20): proj speed scales every
// throw, Skill Area only the empowered explosion term — so area value grows with
// demolisher frequency. Compounding, saturating, ceiling unknown — H stays unmodeled
// (fold into hits_per_bomb per build) until the sweep maps the curve. Tests pin the
// additional-line-only model values. mechanics.md#bing-skill-area
describe("Bing1 A/B — projectile-speed gems on bare (geometry unmodeled)", () => {
  test("Slow Projectile L19: model ~1,873 additional-only (measured 1,990, H ×1.189)", () => {
    const s = bing1Baseline();
    s.additional.slow_projectile = 28.5;
    expect(cycleDps(s).dps).toBeCloseTo(1873, -1);
  });

  test("Wind Projectiles L16: model ~1,793 additional-only (measured 1,424, H ×0.889)", () => {
    const s = bing1Baseline();
    s.additional.wind_projectiles = 23;
    expect(cycleDps(s).dps).toBeCloseTo(1793, -1);
  });
});

/* Increased-pool ladder (2026-07-20, spans ×3 per rung on bare + gear). The large-value
   discriminator that CONFIRMED the increased bucket is one SUM, not a product — and that
   conditional / global lines join it at full value. mechanics.md#bing-increased-sum.
   Rungs (span means; bare mean 1,302.5 ran ~3.4% cool vs this session — ratios cancel it):
     A +135% Fire                 3,167.7  ×2.432 vs bare (model ×2.35)
     B +225% Attack               6,189    B/A ×1.9538 (sum ×1.9574; product ×3.25 REFUTED)
     C +36% Attack w/ 2H          6,678.3  C/B ×1.0791 (sum ×1.0783 — conditional joins)
     D +108% Area                 7,968.7  D/C ×1.1932 (sum ×1.2177 — read 89%, but the
                                           follow-up n=1/n=3 pair below proved FULL delivery;
                                           this rung's −2% was session drift)
     E +22% additional Base (2H) 10,157.3  E/D ×1.2747 (×1.22; session hot —
     F +108% dmg, +27% Erosion   11,512    F/E ×1.1334 (×1.1788) …but F/D ×1.4447 vs
                                           ×1.4382 predicted = +0.45%, so E/F drift cancels;
                                           erosion increase = no-op with zero erosion, global joins sum)
     G +8% additional dmg→life   12,509.3  G/F ×1.0866 (own ×1.08)
     H +24 Str, +24% Str         14,585.7  H/G ×1.1660 — sheet Str 0+24 ×1.24 ⇒ 30 (user
                                           2026-07-20); 0.5%/pt ⇒ model ×1.15 (+1.4% drift)
     I Sierra Reverberation Maul 121,012   I/H ×8.297 — tlidb tooltip 220-220 @1.5 APS ⇒
                                           model ×8.145 (+1.9% drift); tests below
     J +54% Attack & Cast Speed  153,396.5 J/I span ×1.268 — model true ×1.359 (AS ×1.54 ×
                                           demolisher n 3→4 share ×0.883); span-only, but the
                                           n-formula was confirmed visually at bare +54% AS (n=5) */
describe("Bing1 A/B — increased-pool ladder (sum confirmed at large values)", () => {
  function rungD(): Snapshot {
    const s = bing1Baseline();
    s.increased.fire = 135;
    s.increased.attack = 225 + 36;   // conditional 2H line joins the same sum
    s.increased.area = 108;
    return s;
  }

  test("B/A: +225% Attack on +135% Fire is the SUM's ×1.9574, not the product's ×3.25", () => {
    const a = bing1Baseline();
    a.increased.fire = 135;
    const b = structuredClone(a);
    b.increased.attack = 225;
    expect(cycleDps(b).dps / cycleDps(a).dps).toBeCloseTo(1.9574, 3);   // measured ×1.9538
  });

  test("conditional '+36% Attack when holding 2H' joins the sum (C/B ×1.0783)", () => {
    const b = bing1Baseline();
    b.increased.fire = 135;
    b.increased.attack = 225;
    const c = structuredClone(b);
    c.increased.attack = 261;
    expect(cycleDps(c).dps / cycleDps(b).dps).toBeCloseTo(1.0783, 3);   // measured ×1.0791
  });

  test("full rung-D envelope: fire+attack+area sum to ×6.04 over bare", () => {
    expect(cycleDps(rungD()).dps / cycleDps(bing1Baseline()).dps).toBeCloseTo(6.04, 2);
  });

  test("+108% global joins the sum; +27% Erosion is a no-op with zero erosion (F/E ×1.1788)", () => {
    const e = rungD();
    e.additional.base_2h = 22;
    const f = structuredClone(e);
    f.increased.global = 108;
    f.increased.erosion = 27;
    expect(cycleDps(f).dps / cycleDps(e).dps).toBeCloseTo(1.1788, 3);   // measured ×1.1334 solo, +0.45% cumulative
  });

  test("'+22% additional Base Damage (2H)' and '+8% additional dmg applied to life' are own multipliers", () => {
    const d = rungD();
    const g = structuredClone(d);
    g.additional.base_2h = 22;
    g.additional.dmg_to_life = 8;
    expect(cycleDps(g).dps / cycleDps(d).dps).toBeCloseTo(1.22 * 1.08, 4);
  });

  function rungG(): Snapshot {
    const s = rungD();
    s.increased.global = 108;
    s.increased.erosion = 27;
    s.additional.base_2h = 22;
    s.additional.dmg_to_life = 8;
    return s;
  }

  test("Strength: sheet 30 (0 base + 24 gear ×1.24) at 0.5%/pt = ×1.15 (measured ×1.1660)", () => {
    const h = rungG();
    h.additional.strength = 15;
    expect(cycleDps(h).dps / cycleDps(rungG()).dps).toBeCloseTo(1.15, 4);
  });

  test("Sierra Reverberation Maul swap: rung ratio ×8.145 (measured ×8.297, +1.9%)", () => {
    const h = rungG();
    h.additional.strength = 15;
    const i = structuredClone(h);
    i.base.weapon_phys_min = 220 + 72;      // tooltip 220-220 + gear-local Adds 72-87,
    i.base.weapon_phys_max = 220 + 87;      // both inside the +62% Gear Physical
    i.base.gear_phys_pct = 62;
    i.increased.melee = 174;
    i.increased.physical = 176;
    i.additional.sierra_mh = 16;            // +16% additional dmg for Main-Hand Weapons
    i.additional.stationary = 99;           // full uptime at a dummy; its -20% additional AS:
    i.rotation.attack_speed_inc_pct = -20;  // throwRate 0.8 => n stays ceil(2.4) = 3
    i.crit.chance_pct = 5 * (1 + 2.73);     // implicit 500 rating x (+273%) = 18.65%
    expect(cycleDps(i).dps / cycleDps(h).dps).toBeCloseTo(8.145, 2);
  });

  // Bare +54% AS (2.31/s sheet, throwRate 1.54): n = ceil(3 x 1.54) = 5 — confirmed
  // VISUALLY ("one empowered -> four unempowered loop", 2026-07-20); avgs
  // 1,545/1,594/1,587 = x1.209 vs bare, true model x1.2511 (avg understates AS).
  test("+54% AS on bare: demolisher n 3 -> 5, true ratio ×1.2511", () => {
    const s = bing1Baseline();
    s.rotation.attack_speed_inc_pct = 54;
    expect(cycleDps(s).dps / cycleDps(bing1Baseline()).dps).toBeCloseTo(1.2511, 3);
  });
});

/* Area-tag follow-up (2026-07-20, same-session chain): the +108% Area Damage line
   delivers its FULL sum value at n=1 AND n=3 — rung D's 89% was session drift.
     X bare + QR L20 (25) + 200% resto + 108% Area: spans 6,517/6,600/6,550 (mean
       6,555.7) = span/model 0.8925 at full delivery, dead in the 0.88-0.90 eff band
       (89% delivery would need 0.948 — out of band). No geometry lines: the clean read.
     Y = X + 54% Skill Area: spans 6,800/7,040/7,100 (mean 6,980) => H(x1.54, n=1)
       = x1.0647 — matches the n=3 back-solve x1.060 below; H is flat across n
       (frequency-growth re-refuted). mechanics.md#bing-skill-area
     Z bare + 108% Area + 54% Skill Area (n=3): spans 2,926/2,818/2,818 (mean 2,854)
       = eff x H 0.941 => H ~ 1.060. X/Z measured x2.297 vs model x2.285 (+0.5%).
   mechanics.md#bing-increased-sum */
describe("Bing1 A/B — Area Damage tag delivers in full at n=1 and n=3", () => {
  test("X: +108% Area on bare+QR+200% resto is the full sum ×2.08 — model ~7,346", () => {
    const noArea = bing1Baseline();
    noArea.additional.quick_return = 25;
    noArea.rotation.demolisher_resto_pct = 200;
    const x = structuredClone(noArea);
    x.increased.area = 108;
    expect(cycleDps(x).dps / cycleDps(noArea).dps).toBeCloseTo(2.08, 4);
    expect(cycleDps(x).dps).toBeCloseTo(7346, -1);
  });

  test("Z: +108% Area on bare (n=3): model ~3,032 (geometry H stays unmodeled)", () => {
    const z = bing1Baseline();
    z.increased.area = 108;
    expect(cycleDps(z).dps).toBeCloseTo(3032, -1);
  });
});

/* Conversion carry-through — the Fusion penalty generalized (2026-07-20 evening chain,
   all states RS + Destroyer Mallet + HoA L20, same-session A/Bs):
     R0 RS alone             1,325/1,324/1,330  mean 1,326.3 ≈ bare (RS-neutral again)
     R1 +Fusion L20          1,581/1,543/1,562  ×1.1777 — 4th independent pair (prior
                             1.1946/1.1944/1.177); pooled eff 18.6 ± 1, model keeps 19.5
     R2 +81% Fire increased  2,289/2,280/2,276  ×1.4607 — redistribution predicts
                             ×1.4653 (fire compounds with Fusion inside the 50% fire
                             path); source-typed carry covers INCREASED too
     R3 +Added Cold L16      2,878/2,854/2,793  ×1.2454 — resolved by the discriminator
                             below: PER-ORIGIN scoping; under the redistribution
                             mechanism (Fusion FULL on was-cold) predicted 1.2240 (+1.7%)
     R4 Fusion L16 (face 33) mean 2,793   → eff 15.8 (k 0.48)
     R5 Fusion L3 (face 26.5) mean 2,752.3 → eff 14.1 (k 0.53) — carry is PROPORTIONAL
                             to the line value across gem levels, not a fixed offset
   mechanics.md#support-additional-sum */
describe("Bing1 A/B — conversion carry-through generalizes to increased lines", () => {
  // All states encoded at FACE VALUE via the conversion system — the model derives the
  // deliveries itself. HoA phys->fire and Obliterate phys+ele->erosion contest the
  // weapon phys 50/50. mechanics.md#support-additional-sum
  function rsBare(): Snapshot {
    const s = bing1Baseline();
    s.conversion = [
      { from: "physical", to: "fire", pct: 100 },     // Hammer of Ash
      { from: "physical", to: "erosion", pct: 100 },  // Obliterate (RS)
      { from: "lightning", to: "erosion", pct: 100 },
      { from: "cold", to: "erosion", pct: 100 },
      { from: "fire", to: "erosion", pct: 100 },
    ];
    s.enemy.erosion_res_pct = 30;
    return s;
  }

  test("RS conversion is DPS-neutral at 30/30 res (measured 1,326.3 ≈ bare mean)", () => {
    expect(cycleDps(rsBare()).dps / cycleDps(bing1Baseline()).dps).toBeCloseTo(1.0, 9);
  });

  test("+81% Fire at face value delivers ×1.405 — the fire path is half the weapon", () => {
    const s = rsBare();
    s.increased.fire = 81;
    expect(cycleDps(s).dps / cycleDps(rsBare()).dps).toBeCloseTo(1.405, 4);
  });

  test("+81% Physical at face value delivers in FULL — both paths were phys (measured ×1.8106)", () => {
    const s = rsBare();
    s.increased.physical = 81;
    expect(cycleDps(s).dps / cycleDps(rsBare()).dps).toBeCloseTo(1.81, 4);
  });

  test("Fusion at face 35 derives ×1.175 (model ~1,713); fire+fusion compound to ×1.4653 (measured R2 ×1.4607)", () => {
    const withFusion = rsBare();
    withFusion.additional_typed = { elemental: { fusion: 35 } };
    expect(cycleDps(withFusion).dps).toBeCloseTo(1713, -1);
    const withBoth = structuredClone(withFusion);
    withBoth.increased.fire = 81;
    expect(cycleDps(withBoth).dps / cycleDps(withFusion).dps).toBeCloseTo(1.4653, 3);
  });

  // Final redistribution prediction VERIFIED (2026-07-20): +81% Cold on RS + Added
  // Cold L16 — spans 2,011/2,042/1,999/1,969/1,972 (mean 1,998.6) = eff 0.9035 vs the
  // full-on-was-cold model 2,212 (flat-carry 0.55 needs eff 0.970, no-op 1.066 — both
  // refuted). Cold-typed lines hit the was-cold portion in FULL and nothing else.
  test("+81% Cold on RS + Added Cold L16 (40-60): full on the was-cold portion only — model ~2,212, ×1.18", () => {
    const s = rsBare();
    s.base.flat_added_cold_min = 40;
    s.base.flat_added_cold_max = 60;
    const withCold = structuredClone(s);
    withCold.increased.cold = 81;
    expect(cycleDps(withCold).dps).toBeCloseTo(2212, -1);
    expect(cycleDps(withCold).dps / cycleDps(s).dps).toBeCloseTo(1.18, 3);
  });
});

/* Scoping discriminator (2026-07-20): RS + Added Cold L16 + 81% Fire, NO Fusion —
   spans 2,266/2,352/2,207/2,265 (mean 2,272.5). Back-solved fire-on-was-cold ≈ ×1.0
   across the eff band (×1.461 if origin-blind): carried source-typed lines are
   PER-ORIGIN — they never touch damage that lacked the type pre-conversion. HoA's
   `Physical Damage converted to Fire 100%` is why the weapon portion IS fire-origin.
   MECHANISM CANDIDATE (tlidb pt/Damage_Type_Conversion: full source+destination
   double-dip, and >100% conversion claims REDISTRIBUTED by weight): HoA phys->fire
   100% + Obliterate phys->erosion 100% split the weapon phys 50/50 into
   fire-path (typed mods full) and direct-erosion path (never typed) => k = exactly
   0.5, per-origin, erosion/generic exempt, Fusion FULL on was-cold. Fits the whole
   R-chain within ±1.7% (incl. R3). KILLER TEST RUN — MECHANISM CONFIRMED: +81%
   Physical on RS bare (spans 2,334/2,394/2,476 mean 2,401.3) = ×1.8106 over RS-alone
   1,326.3: FULL delivery, exactly redistribution's ×1.81 (flat-carry's ×1.4607
   refuted by 24% — phys double-dips both paths). Encoding: derive per state; typed
   lines COMPOUND inside their path before the 50/50 average.
   mechanics.md#support-additional-sum */

/* Bomb-rotation mechanics — the cycleDps branch itself, independent of calibration. */
describe("bomb rotation mechanics", () => {
  function bombSnap(): Snapshot {
    const s = baseOnly();
    s.crit = { chance_pct: 0, damage_pct: 150 };   // expectedHit == averageHit == 100
    s.enemy.cold_res_pct = 0;
    s.enemy.armor_reduction_pct = 0;
    s.rotation = { bombs_per_throw: 2, throw_rate_base: 1, attack_speed_inc_pct: 0,
                   hits_per_bomb: 1 };
    return s;
  }

  test("dps is throw_rate × bombs × hits/bomb × per-hit", () => {
    const r = cycleDps(bombSnap());
    expect(r.dps).toBeCloseTo(200.0, 9);           // 1/s × 2 bombs × 1 hit × 100
    expect(r.cycle_time).toBeCloseTo(1.0, 9);
    expect(r.starter_damage).toBe(0);              // no starter/finisher in bomb mode
  });

  test("effective hits per bomb scale linearly", () => {
    const s = bombSnap();
    s.rotation.hits_per_bomb = 1.5;
    expect(cycleDps(s).dps).toBeCloseTo(300.0, 9);
  });

  test("attack speed scales bomb throughput linearly (true/peak DPS)", () => {
    // 2026-07-20 AS test: +27% AS → +28.6% PEAK (5s-high), linear. The flat 5s-average
    // is a fixed-window artifact — more bombs pile up pre-detonation at the start and are
    // cut off still-airborne at the end, an edge loss that grows with attack speed. The
    // model targets true/steady (peak) DPS, so throughput scales with throw rate.
    const s = bombSnap();
    s.rotation.attack_speed_inc_pct = 100;         // 2 throws/s
    const r = cycleDps(s);
    expect(r.dps).toBeCloseTo(400.0, 9);
    expect(r.cycle_time).toBeCloseTo(0.5, 9);
  });

  test("added projectiles scale single-target hits by (proj_base+added)/proj_base", () => {
    const s = bombSnap();
    s.rotation.proj_base = 5;
    s.rotation.proj_added = 2;
    expect(cycleDps(s).dps).toBeCloseTo(280.0, 9); // 200 × 7/5, mechanics.md#multi-proj
  });

  test("Blast Barrage: chance-based bomb quantity rides bombs_per_throw as its EV", () => {
    // L2 card "25% chance to +2 Bomb Quantity" => EV 2 + 0.25x2 = 2.5 = x1.25 — the
    // memory-ladder residual measured x1.269 (mechanics.md row "Bing hero memories")
    const s = bombSnap();
    s.rotation.bombs_per_throw = 2.5;
    expect(cycleDps(s).dps).toBeCloseTo(250.0, 9);
  });

  test("demolisher: one throw in n empowered ×M — dps × (n−1+M)/n", () => {
    const s = bombSnap();
    s.rotation.demolisher_empower_mult = 4;
    s.rotation.demolisher_every_n = 3;
    expect(cycleDps(s).dps).toBeCloseTo(400.0, 9); // 200 × (2+4)/3, mechanics.md#bing-bombs
  });

  test("demolisher at every attack (n=1) is a flat ×M", () => {
    const s = bombSnap();
    s.rotation.demolisher_empower_mult = 4;
    s.rotation.demolisher_every_n = 1;
    expect(cycleDps(s).dps).toBeCloseTo(800.0, 9);
  });

  test("demolisher_resto_pct derives n = ceil(3/(1+resto%) × throwRate)", () => {
    const s = bombSnap();
    s.rotation.demolisher_empower_mult = 4;
    s.rotation.demolisher_resto_pct = 0;       // 3.0s -> n=3
    expect(cycleDps(s).dps).toBeCloseTo(400.0, 9); // 200 × (2+4)/3
    s.rotation.demolisher_resto_pct = 97;      // 1.523s -> n=2 (bare QR L16 A/B)
    expect(cycleDps(s).dps).toBeCloseTo(500.0, 9); // 200 × (1+4)/2
    s.rotation.demolisher_resto_pct = 100;     // 1.5s -> n=2
    expect(cycleDps(s).dps).toBeCloseTo(500.0, 9);
    s.rotation.demolisher_resto_pct = 200;     // 1.0s -> every throw
    expect(cycleDps(s).dps).toBeCloseTo(800.0, 9);
  });

  test("attack speed past the alignment lowers the demolisher share", () => {
    const s = bombSnap();
    s.rotation.demolisher_empower_mult = 4;
    s.rotation.demolisher_resto_pct = 200;     // 1.0s: n=1 at 1 throw/s...
    s.rotation.attack_speed_inc_pct = 27;      // ...but ceil(1.0 × 1.27) = 2
    expect(cycleDps(s).dps).toBeCloseTo(254 * 2.5, 9); // 200×1.27 × (1+4)/2
  });

  test("deterioration gates per THROW: all bombs of an enhanced throw inflict", () => {
    const s = bombSnap();
    // cycle 1s, one Obliterate/s -> every throw enhanced (share 1); the 2 bombs do
    // NOT dilute it (per-throw gating, mechanics.md#deterioration)
    s.deterioration = { chance_pct: 100, hit_damage_pct: 60,
                        duration_s: 1, duration_inc_pct: 0, tick_interval_s: 0.33,
                        ramp_pct: 30, ramp_max_ticks: 5, damage_inc_pct: 0,
                        additional_damage_pct: 0, obliterate_interval_s: 1 };
    expect(cycleDps(s).deterioration_dps).toBeCloseTo(200.0 * 1.0 * 0.6 * 3.9, 6);
  });
});

/* Bing1 Obliterate chain — Ruinous Star equipped (rolls: +30% additional Deterioration
   Duration; its 24% Erosion Res roll is player defense, DPS no-op), incremental states
   measured 2026-07-20 (span means; span/steady efficiency 0.879–0.892 across ALL six
   states — the tightest chain yet). RS alone read 1,285 ≈ bare 1,302.5: fire→erosion
   conversion is DPS-neutral at equal 30/30 res, so the model needs no conversion
   plumbing while dummy res stay uniform; the erosion-typed "+27% Erosion Damage" acts
   on everything post-conversion, encoded as increased.global.
   All hit types (projectiles, initial + empowered explosions) stack Deterioration.
   mechanics.md#deterioration, mechanics.md#bing-bombs */
describe("Bing1 Obliterate chain — Ruinous Star + Deterioration", () => {
  function rs(): Snapshot {
    const s = bing1Baseline();
    s.deterioration = { chance_pct: 118, hit_damage_pct: 60,     // 118 exercises the cap
                        duration_s: 1, duration_inc_pct: 30, tick_interval_s: 0.33,
                        ramp_pct: 30, ramp_max_ticks: 5, damage_inc_pct: 0,
                        additional_damage_pct: 0, obliterate_interval_s: 0.5 };
    return s;
  }

  test("s0 +118% chance (caps 100): 3 ticks sum 3.9 — model ~4,869 (spans mean 4,288.8, eff 0.881)", () => {
    expect(cycleDps(rs()).dps).toBeCloseTo(4869, -1);
    expect(cycleDps(rs()).dps / cycleDps(bing1Baseline()).dps).toBeCloseTo(3.34, 3);
  });

  test("s1 +27% Erosion (post-conversion = global): ×1.27 hits AND ticks (span 5,435, eff 0.879)", () => {
    const s = rs();
    s.increased.global = 27;
    expect(cycleDps(s).dps / cycleDps(rs()).dps).toBeCloseTo(1.27, 6);
  });

  test("s2 +Passivation L20 (+60% additional Erosion, erosion now flows): ×1.60 (span 8,781, eff 0.888)", () => {
    const s = rs();
    s.increased.global = 27;
    const withP = structuredClone(s);
    withP.additional.passivation = 60;
    expect(cycleDps(withP).dps / cycleDps(s).dps).toBeCloseTo(1.60, 6);
  });

  test("s3 +8% additional det dmg +5% additional det duration: the 4th-tick breakpoint (span 12,533.5, eff 0.889)", () => {
    const s = rs();
    s.increased.global = 27;
    s.additional.passivation = 60;
    const s3 = structuredClone(s);
    s3.deterioration!.additional_damage_pct = 8;
    s3.deterioration!.duration_inc_pct = 35;      // 1.35s -> 4 ticks, sum 3.9 -> 5.8
    expect(cycleDps(s3).dps).toBeCloseTo(14095, -1);
    expect(cycleDps(s3).dps / cycleDps(s).dps).toBeCloseTo(1.4247, 3);
  });

  test("s4 +24% Deterioration Damage joins the increased sum: ticks ×1.51/1.27 (span 14,451.5, eff 0.892)", () => {
    const s = rs();
    s.increased.global = 27;
    s.additional.passivation = 60;
    s.deterioration!.additional_damage_pct = 8;
    s.deterioration!.duration_inc_pct = 35;
    const s4 = structuredClone(s);
    s4.deterioration!.damage_inc_pct = 24;
    expect(cycleDps(s4).dps).toBeCloseTo(16199, -1);
    expect(cycleDps(s4).dps / cycleDps(s).dps).toBeCloseTo(1.1493, 3);
  });

  test("s5 +Elemental Fusion: redistribution's ×1.175, not ×1.35 (span 17,602.5, eff 0.925 — session ran hot)", () => {
    // Product rule holds — the no-chance discriminating reads (below) exonerated
    // Passivation (full ×1.5998 measured); Fusion's post-conversion value is
    // n-independent and derives exactly: 0.5×1.35+0.5 = ×1.175 (conversion-overflow
    // redistribution, phys killer test). mechanics.md#support-additional-sum
    const s = rs();
    s.increased.global = 27;
    s.additional.passivation = 60;
    s.additional.fusion = 17.5;
    s.deterioration!.additional_damage_pct = 8;
    s.deterioration!.duration_inc_pct = 35;
    s.deterioration!.damage_inc_pct = 24;
    expect(cycleDps(s).dps).toBeCloseTo(19034, -1);
  });

  // Discriminating reads 2026-07-20 (no det chance, n=3): RS+Fusion span 1,535 vs RS
  // 1,285 = ×1.1946 — Fusion under-delivers on converted damage (×1.352 confirmed on
  // bare fire). +Passivation spans 2,444/2,498/2,425 (mean 2,455.7) = ×1.5998 exactly —
  // full product term, no sum-bucket, no life-decay on the full-life dummy. Both reads
  // at span eff 0.896 under the redistribution-derived fusion 17.5 (this session's
  // ×1.1946 ran +1.7% hot vs the exact ×1.175). mechanics.md#support-additional-sum
  test("Fusion-only on RS: model ~1,713 (span 1,535, eff 0.896)", () => {
    const s = bing1Baseline();
    s.additional.fusion = 17.5;
    expect(cycleDps(s).dps).toBeCloseTo(1713, -1);
  });

  test("Passivation stays a full ×1.60 product term on top (spans mean 2,455.7, eff 0.896)", () => {
    const s = bing1Baseline();
    s.additional.fusion = 17.5;
    const withP = structuredClone(s);
    withP.additional.passivation = 60;
    expect(cycleDps(withP).dps / cycleDps(s).dps).toBeCloseTo(1.60, 6);
    expect(cycleDps(withP).dps).toBeCloseTo(2741, -1);
  });

  // n=1 discriminator (2026-07-20): RS + QR L20 (+25% additional) + 200% resto.
  // No Fusion: spans 3,150/3,235/3,104 (mean 3,163) — eff 0.896, independently
  // revalidating n=1, M, and QR L20 = 25. With Fusion: spans 3,732/3,774/3,662
  // (mean 3,722.7) = ×1.177 — the empowered-hit-only hypothesis (predicted ×1.302,
  // eff 0.810) is REFUTED; the penalty is n-independent — later derived exactly as
  // redistribution ×1.175 (measured here ×1.177). mechanics.md#support-additional-sum
  test("n=1 base: RS + QR L20 + 200% resto — model ~3,532 (spans mean 3,163, eff 0.896)", () => {
    const s = bing1Baseline();
    s.additional.quick_return = 25;
    s.rotation.demolisher_resto_pct = 200;
    expect(cycleDps(s).dps).toBeCloseTo(3532, -1);
  });

  test("Fusion is redistribution's ×1.175 at n=1 too (measured ×1.177, eff 0.897)", () => {
    const s = bing1Baseline();
    s.additional.quick_return = 25;
    s.rotation.demolisher_resto_pct = 200;
    const withF = structuredClone(s);
    withF.additional.fusion = 17.5;
    expect(cycleDps(withF).dps / cycleDps(s).dps).toBeCloseTo(1.175, 6);
    expect(cycleDps(withF).dps).toBeCloseTo(4150, -1);
  });
});

// Pactspirit reads 2026-07-20, span triplicates vs bare mean 1,302.5 (data/bing1/*.json;
// solo runs carry NO kismets — exports are truth; the first-pass reads 3,040/2,374/4,446
// were a user setup error, superseded). All three states reconcile at FACE VALUE:
//   Kitty L6 solo: 2,157/2,079/2,132 (mean 2,122.7) = ×1.6296 vs model ×1.611 (+1.2%)
//   Bug L6 solo:   1,587/1,522 (mean 1,554.5) = ×1.1935 vs model ×1.180 (+1.2%)
//   Both+kismets:  3,774/3,731/3,752 (mean 3,752.3) = ×2.8809 vs model ×2.881
// mechanics.md#pactspirits
describe("Bing1 pactspirits — Kitty Express + Benign Bug L6 + kismets", () => {
  function kittyNodes(s: Snapshot): Snapshot {
    s.increased.attack = 48;                // nodes 1-3
    s.increased.global = (s.increased.global ?? 0) + 6;  // fate slots 6×1% damage
    s.crit.chance_pct = 5 * 1.88;           // +88% Attack Crit Rating
    s.rotation.attack_speed_inc_pct = 16;   // AS nodes; pushes demolisher n to 4
    return s;
  }
  function bugFace(s: Snapshot): Snapshot {
    s.increased.global = (s.increased.global ?? 0) + 6;
    s.additional.benign_bug = 11.28;        // L6 notable +7% × reward +4%
    return s;
  }

  // Stimulant is TRIGGER-semantics (resolved 2026-07-20): manual casts build no stacks;
  // under Firepower Coverage auto-throw it goes fully live — M1-anchored known parts
  // ×5.53 vs measured ×10.353 (5 spans mean 13,484.6); the ×1.87 residual is the arrow
  // pair + FC-rig geometry (taken 1.25 × H≈1.50). n=4 empower cadence and AS-scaling of
  // the auto-thrower are user-observed. Doc-only, like the memory ladder:
  // mechanics.md#pactspirits. The planner exported the spirits at L1 — artifact
  // (L1 predicts ×7.1, refuted; file corrected to L6); verify levels on every export.
  test("Kitty L6 is its NODES ONLY on manual casts — Stimulant + Aggression need a trigger", () => {
    const s = kittyNodes(bing1Baseline());
    expect(cycleDps(s).dps).toBeCloseTo(2348, -1);
    expect(cycleDps(s).dps / cycleDps(bing1Baseline()).dps).toBeCloseTo(1.611, 3);

    // stimulant-active would be ×2.45 (measured ×1.6296 refutes it by 50%)
    const stim = structuredClone(s);
    stim.additional.kitty_stimulant = 100 * (1.05 ** 5 * 1.08 * 1.05 - 1);
    stim.rotation.attack_speed_inc_pct = 21.8;
    expect(cycleDps(stim).dps / cycleDps(bing1Baseline()).dps).toBeGreaterThan(2.4);
  });

  test("Kitty's +16% AS pins demolisher n=4: a forced n=3 reads ×1.825, 12% off", () => {
    const n3 = kittyNodes(bing1Baseline());
    delete (n3.rotation as Record<string, number>).demolisher_resto_pct;
    n3.rotation.demolisher_every_n = 3;
    expect(cycleDps(n3).dps / cycleDps(bing1Baseline()).dps).toBeCloseTo(1.825, 3);
  });

  test("Benign Bug L6 at face — its +140% Erosion and +10% erosion pen are dead (no RS)", () => {
    const s = bugFace(bing1Baseline());
    expect(cycleDps(s).dps).toBeCloseTo(1720, -1);
    expect(cycleDps(s).dps / cycleDps(bing1Baseline()).dps).toBeCloseTo(1.180, 3);
  });

  test("both + kismets: kismets REPLACE nodes; Mighty Arrows pair ACROSS pages", () => {
    const s = bugFace(kittyNodes(bing1Baseline()));
    s.increased.attack = 24;                // kitty's Mighty Arrow kismet replaced Attack Dmg II (+24)
    s.rotation.attack_speed_inc_pct = 12;   // det-duration kismet replaced Attack Speed I (+4); sheet 1.68 = 1.5*1.12
    s.additional.strength = 13.5;           // 2× Micro Fate Strength, 0.5%/pt (on bug's dead erosion nodes)
    s.enemy_taken.misc = 25;                // arrow pair: Attack Horizontal Projectile taken
    s.rotation.hits_per_bomb = 0.8353 * 1.3286;  // arrow pair: -25% proj speed geometry, back-solved
    expect(cycleDps(s).dps).toBeCloseTo(4200, -1);
    expect(cycleDps(s).dps / cycleDps(bing1Baseline()).dps).toBeCloseTo(2.881, 3);
  });
});

/* Bing REAL BUILD (data/bing1/real_buld_3.json, snapshot real_buld_3_snapshot.json) —
   the full endgame rig calibrated 2026-07-20 under the FROZEN-AURA protocol (one aura
   set surviving the weakest state, kept across every A/B; ratios only cancel constants
   that stay constant). Rig: Sierra maul, Ruinous Star (40% ramp / 6 increments roll),
   Death's Touch, Fool's Crown, Blade-dancer, Formation Breaker, 2x Kaleidoscope,
   Broken Sun Ring; HoA L20 + Fusion/Passivation/Upheaval(mag)/Steamroll/SlowProj;
   FC+BB+FH traits (all L2); Timid via Activation Medium: Demolisher; Flame Core
   sentry + Motionless = the charge engine (n=1, every throw empowered, Timid ~100%);
   4 auras; Iron Lion L1 / Saintess L4 / Kitty L6 + kismets; 7 slates; 4 trees.

   Measured state ledger (span means, dummy lv85):
     full build:        557,752 M (also 560.8B earlier sitting; sessions repeat ~1%)
     RS off:             13,170 M  <- the hit-side anchor H is fit to (H = geometry
                                      fold-in: FC proj size, 263% skill area, arrow
                                      pair; SP slowing measured saturated = no-op)
     Saintess off:      /1.574 measured vs /1.5765 model — EXACT (nodes at face +
                        pen 10 + Repentance 1.04^6; validates env+pen+stack template)
     Timid off:         /1.365 measured vs /1.390 model (taken lines apply ONCE)
     Kaleido-60 off:    /1.735 measured vs /1.60 encoded (full-value continuous
                        confirmed; +8% hot flagged)
     Upheaval off:      /1.414 measured -> explosion line delivers x1.178, not face
     Pedigree+Mixture:  /2.294 measured vs /1.838 model — exposed the per-throw
                        Obliterate gating bug (fixed); leftover feeds the OPEN items
   OPEN (residual x1.258 on the full state): 5th-tick boundary at +63% duration
   (one-det-slate A/B pending: /1.05 no-boundary vs /1.41 boundary), erosion-typed
   family +8%-hot pattern (Passivation /1.776 vs /1.64 on a stale baseline).
   Every line source and per-line citation: mechanics.md#real-build. */
describe("Bing real build — real_buld_3 (frozen-aura calibration 2026-07-20)", () => {
  const snap = (): Snapshot =>
    JSON.parse(fs.readFileSync(fromRoot("data/bing1/real_buld_3_snapshot.json"), "utf-8"));
  const rsOff = (): Snapshot => {
    const o = snap();
    o.conversion = [{ from: "physical", to: "fire", pct: 100 }];
    o.deterioration!.chance_pct = 0;
    return o;
  };

  test("RS-off hit rig matches the measured 13.17B anchor (H fold-in)", () => {
    expect(cycleDps(rsOff()).dps / 1e9).toBeCloseTo(13.17, 1);
  });

  test("full state: model 596.2B, det share 88.8% (measured 557.75B — +6.9% hot, strict 5-tick; mechanics.md#real-build)", () => {
    const r = cycleDps(snap());
    expect(r.dps / 1e9).toBeCloseTo(596.2, 0);
    expect(r.deterioration_dps / r.dps).toBeCloseTo(0.8881, 3);
  });

  test("Saintess lever is exact: env + pen 10 + Repentance 1.04^6 = /1.5765 (measured /1.574)", () => {
    const s = snap(), sa = snap();
    sa.increased.erosion -= 112;
    sa.increased.global -= 6;
    sa.penetration.erosion_pct = 0;
    delete sa.additional_typed!.erosion.repentance;
    expect(cycleDps(s).dps / cycleDps(sa).dps).toBeCloseTo(1.5765, 3);
  });

  test("Timid lever: taken applies once everywhere = /1.390 (measured /1.365)", () => {
    const s = snap(), ti = snap();
    ti.enemy_taken.timid = 0;
    expect(cycleDps(s).dps / cycleDps(ti).dps).toBeCloseTo(1.390, 3);
  });
});
