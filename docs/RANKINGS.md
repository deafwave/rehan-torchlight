# Spectral Slash Upgrade Rankings — loadout "more_1" (boss single-target)

Generated from `data/Rehan.json` via `pnpm snapshot` + `pnpm rank`.

## Coverage

```
coverage: 117 matched, 87 ignored, 8 UNMATCHED of 212 lines (96% handled)
```

Now parsed: gear, skill tree, hero traits, **pactspirits**, **hero memories** (GUID→template resolution with actual rolls — rolls vary per memory!), and **placed divinity slates** (inline descriptions, legendary + non-legendary). The 8 unmatched lines are the Rehan trait texts (folded in via `manual_overrides.json` at tier-5 values) and Heart of Animitta's two rotation effects (folded into `rotation.combo_points`). Nothing is silently dropped.

The slates confirmed two assumptions and broke one: they carry the **100% Physical→Cold conversion** itself, the Frostbite applicator, and **Cold Infiltration on Frozen enemies** (previously assumed absent — now modeled as +13% Cold taken and −10% enemy res).

**Now parsed as of the support pass:** Spectral Slash's five support gems (Still Attack→Willpower, Recuperation, Detonation, Critical Strike Damage Increase, Legion) at real levels and rolls. **Still not parsed (see caveats):** Thunder Spike's supports; no ethereal prisms are equipped in this loadout.

## Sensitivity table

Baseline: **450,473.0M DPS**, 0.53s combo cycle (2 starters + finisher). Crit position 69.35% / 588.5% (×1.405 crit-gated support ×1.10 Fixate crit-damage-taken), cold penetration 41% (res layer at −11%), Frostbite ×2.88, Paralysis ×1.15, Timid ×1.39, Mark ×1.36 on everything after the first starter, blessings ×1.35, tower Steamroll ×1.43, attack speed +210% (incl. Agility +16%, Steamroll −15%), 9 finisher clones (8 combo points + Legion), mitigation 1.11 × 0.91 (30% res − 41 pen; 30% armor reduction − 21 pen).

The 284.9M → 1,151.0M → 3,097.2M → 5,884.7M → 25,131.6M → 26,136.9M → 450,473.0M rebaselines are parser/model fixes, not build changes:

1. Ghost Slaughter's granted Fervor damage base effect was read as a literal `+1% additional damage` instead of `+1%/rating × 100 rating × 3.08 Fervor Effect = +308%` (mechanics.md#fervor).
2. `crit.chance_pct` and `additional.warcry_buffs` were frozen constants in `manual_overrides.json`: any new rating/effect source parsed into `_extras` was then thrown away by `_consumes`. Both are now derived in `build_parser.resolve_extras`, which is the only reason the three pactspirits land (+177% crit rating, +12% Warcry Effect, Paralysis, Pure Heart).
3. Skill levels past 20 are now modeled (mechanics.md#skill-levels): +10% additional damage per gem level 21–30, +8% past 30. The build's +9 net levels (5 attack + 4 active) are +90% additional = ×1.90.
4. Mitigation is two layers, not one (user-corrected): ~30% elemental res AND ~30% armor elemental reduction, both penetrable below zero. Baseline ×0.8 vs the old single 40%-res assumption, and armor mitigation penetration goes from "no-op" to a top stat. The old no-op rule was also silently discarding a stat already paid for: the Perishing Inferno Flame Ring's +21% Armor DMG Mitigation Penetration now counts.
5. Spectral Slash's five support gems are now parsed and valued (mechanics.md#supports): Still Attack's granted Willpower ×1.4185, Detonation prism ×1.56, Legion prism ×1.152 plus its +1 finisher Clone vs boss, Critical Strike Damage Increase ×1.405 on crit hits, Recuperation amp 5.5 → 18.2 (L30 with +10 Support Skill Levels). Net ×4.27.
6. The rotation itself was wrong (user-provided skill logic 2026-07-15, mechanics.md#mark): the cycle is 2 starters + finisher (was 3), the first starter applies **Mark** (+30% additional taken ×1.20 Mark effect = ×1.36 on every later hit), and the finisher spawns **1 clone per combo point consumed** — 8 + Legion's 1 = 9 clones, not 5. Same pass: Agility + Focus Blessings modeled (×1.35 with the sword's +1 Focus stack, +16% AS), Precise: Cruelty's 40-stack self-ramp confirmed full on bosses (auras ×3.01 not ×2.48), Fixate corrected to +10% crit-damage-taken + 1.1% taken. And the parser now reads gear **baseAffix / towerSequence / sweetDream / corrosion** fields it used to skip: the ring's +24% and a memory's +7% Elemental & Erosion Resistance Penetration (previously swallowed by the `Resistance` ignore rule), the ring's Lv.20 Timid trigger (×1.39), "Adds 20% of Physical Damage to Cold" and the sword tower's Lv.25 Steamroll (×1.43, −15% AS). Net ×17.2.

```
 +21.85%  +1 Combo Point consumed
 +13.33%  Detonation prism rank 1 -> 5
 +13.33%  Legion prism rank 1 -> 5
 +10.99%  +10% armor mitigation penetration
  +9.01%  +10% cold penetration
  +8.70%  +10% Paralysis/other taken
  +6.12%  +5% crit chance
  +5.26%  +1 skill level (gem 29 -> 30, +10% additional)
  +4.86%  +30% crit damage
  +4.77%  +10% warcry buff contribution
  +3.83%  +10% gear physical damage (weapon)
  +3.66%  +10% Combo Finisher Amplification
  +3.47%  +10% Frostbite taken
  +3.23%  +10% attack speed
  +2.26%  +10 pts onto existing additional-damage pile
  +1.42%  +10% increased physical damage
  +1.42%  +10% increased attack damage
  +1.42%  +10% increased melee damage
  +1.42%  +10% increased area damage
  +1.42%  +10% increased cold damage
```

## Top recommendations

1. **Combo Points consumed — now the top stat.** A point is double-dipped: finisher damage is `1 + points × amp` (amp 251.2%) AND each point spawns another 127% clone. Going 8 → 9 points is +21.9% DPS — anything granting +max Combo Points or more points consumed beats everything else on the sheet.
2. **Penetration — both kinds.** Mitigation is two ~30% layers: elemental res (41% pen in build, res already at −11% → +9.0% DPS per further 10%) and armor elemental reduction (21% pen in build → +11.0% per further 10%). Both keep working past zero — armor mitigation pen now edges out cold pen because the res layer is deeper into the negatives.
3. **Rank both prisms to 5** — if rank scaling works the way the model guesses (+4% on the base line per rank, **unverified**, mechanics.md#supports): +13.3% DPS per prism.
4. **New "additional damage" lines from new *sources*.** Each brand-new additional multiplier (a debuff on the enemy, a new buff) is worth its face value (~+10% for a 10% line) — Paralysis (+15% taken, you have no source), Cold Infiltration (+13% taken, −10% res), or a Timid curse setup are all unclaimed multipliers this build scales. Adding points to *existing* piles (Rage Infusion, strength, warcry) is worth about a third of face value.
5. **Crit chance and crit damage are nearly level now.** At 69.35% chance / 588.5% crit damage (×1.405 support ×1.10 Fixate), +5% chance ≈ +6.1% vs +30% crit damage ≈ +4.9%. Crit rolls still beat any "% increased damage" roll ~4:1.
6. **Attack speed** (+3.1% per 10%) still beats every "% increased damage" roll (+1.4% per 10%). The increased pile is at 400%+ — stop paying for %damage, %phys, %attack, %melee, %area, %cold rolls; they are the worst stats on this sheet.

**+1 skill level is +5.3% DPS** (gem 29 → 30) — the model previously undervalued "+skill level" gear to zero; it now ranks right beside crit chance. Past gem 30 each level drops to +8% additional (~+4.2%).

## Stop paying for (no-ops / near no-ops)

- **Numb** — no-op: it amplifies *Lightning* damage taken only.
- **Any % increased damage flavor** — not a no-op, but 1.7%/10% is the floor of the table.
- **Tenacity Blessing** — defensive only.
- Tree still holds Bladerunner "while Dual Wielding" nodes — **dead with a shield equipped** (parser now ignores them); respec candidates.

## Candidate comparison

```
pnpm --filter @rehan/dmg rank apply data/snapshot.json <path> <delta>   # e.g. penetration.cold_pct 40  ->  +66.67%
pnpm --filter @rehan/dmg rank compare data/snapshot.json other.json
```

## Caveats (what could move these rankings)

- **Monster mitigation is two ~30% layers** (elemental res and armor elemental reduction — user-reported defaults). Both `enemy.cold_res_pct` and `enemy.armor_reduction_pct` are editable in `data/snapshot.json`; tougher bosses raise both, which raises both penetrations' value.
- **Clone shotgun falloff read as a flat 70%** for every hit on the same target after the first (user: "30% less damage for every hit after the first"). If it actually compounds per hit (0.7^n), the 9-clone finisher is heavily overstated — the single biggest open interpretation in the model.
- **Full Rage Infusion stacks / Berserk uptime** are still inferred (mechanics.md); Fervor at 100, Freeze uptime, Paralysis uptime and Cruelty's 40-stack ramp are now user-confirmed.
- **Attack/active skill levels are modeled from user-reported bands** (+10%/level 21–30, +8%/level past 30 — mechanics.md#skill-levels, Confidence=reported).
- **Prism rank scaling (+4%/rank on the base line) is unverified** — the user did not recognize the rule; it only affects the two "rank 1 → 5" sensitivity rows.
- **Willpower / Still Attack uptime**: the ×1.4185 assumes standing still at 6 stacks; any boss that forces movement shaves it (0.5s grace after moving).
- **"When Sparks Set the Prairie Ablaze" slate copies adjacent slates' last talent** — copy resolution is not modeled; its contribution is understated.
- **Joined Force off-hand contribution math is unmodeled** — irrelevant while the sword+shield loadout is the one scored.
- Crit-damage pool additivity and Combo-amp source-summing are inferred, not dev-confirmed (mechanics.md).
