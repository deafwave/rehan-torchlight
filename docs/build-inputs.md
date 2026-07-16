# Build inputs — current loadout "more_1" (data/Rehan.json)

Extracted mechanically from the planner export; feeds `manual_overrides.json`.

## Skills (all L20 unless noted)

| Skill | Supports |
|---|---|
| Spectral Slash | Activation Medium: Still Attack, Recuperation (L20), Spectral Slash: Detonation (Magnificent), Critical Strike Damage Increase (L20), Spectral Slash: Legion (Noble) |
| Ice Bond | Activation Medium: Root, Mass Effect (L20) |
| Thunder Spike | Quick Mobility, Periodic Burst, Precision Strike, Recklessness, Thunder Spike: Rumbling Thunder (Noble) |
| Shockwave Warcry | Activation Medium: Preparation, Extended Duration, Cooldown Reduction |
| Defensive Buffer | Activation Medium: Preparation, Iron Fortification, Cooldown Reduction |

Passive auras: Precise: Fearless, Precise: Cruelty, Precise: Domain Expansion, Precise: Energy Fortress (each with Restrain + Precise: Stand as One; Cruelty adds Precise: Disciplined; Domain Expansion adds Seal Conversion).

Note: user listed "Precise: Frigid Domain" — the current loadout has **Energy Fortress** instead. Frigid Domain may exist in other loadouts.

## Parsed extras awaiting conversion (from build_parser `_extras`)

Run `pnpm snapshot` for current values:
warcry_effect_pct, fervor_effect_pct, max_frostbite_rating, aura_effect_pct,
mark_effect_pct, support_skill_level, warcry_min_enemies, crit_dmg_per_fervor_rating,
strength, attack_skill_level, active_skill_level, rating_flat, rating_inc_pct.

## Unmatched lines needing researched values (manual overrides)

- Heart of Animitta: +1 Combo Finisher charge, 2 Combo Points on finisher crit (rotation)
- Fury's Onslaught (level45 trait): +20/27/34/41/48% additional damage under Berserk
- Growing Anger (level60 trait): Rage generation via Seething Spirit
- Rage Infusion (level75 trait): +5% additional damage per 25 Rage gained recently, 4–8 stacks
