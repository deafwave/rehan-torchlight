# Spectral Slash Damage Model & Upgrade Ranker — Design

**Date:** 2026-07-15
**Game:** Torchlight: Infinite, patch SS12.5/SS13
**Build:** Rehan (Seething Silhouette), Spectral Slash Combo Finisher, 100% phys→cold conversion, sword + shield
**Source build:** `Rehan SS13_update1.json` (planner export)

## Goal

Rank damage upgrades for the build. Two outputs:

1. **Sensitivity table** — for each stat the build scales: "+X of this stat → +Y% boss DPS" computed against the current build.
2. **Candidate comparison** — apply a specific mod line / gear swap / snapshot diff and report the DPS delta.

The damage formula itself (tlidb's `Damage_Calculation` page is too thin) is produced as a byproduct: a fully cited classification table of every modifier the build uses.

## Scope

- **Scenario:** boss single-target DPS, full combo rotation (starters → 4-point finisher with clones).
- **Out of scope:** mapping/clear modeling (skill area, mark spread), defense, absolute-number calibration against in-game panels.
- **Validation:** community sources (bilibili guides, wiki, maxroll, Discord knowledge) for every mechanic's formula stage. No in-game calibration in v1.

## Architecture

All code lives in `rehan_guide/`.

```
tlidb caches (.claude/skills/tli-build/cache/SS12.5-*.json)
        │            Rehan SS13_update1.json
        └──────┬────────────┘
               ▼
   [C3] build_parser.py ──→ stats snapshot (JSON) + coverage report
               ▼
   [C2] damage_model.py ←── [C1] mechanics.md (researched classification table)
               ▼
   [CLI] rank.py ──→ sensitivity table │ candidate diff
```

### C1 — `mechanics.md` (research deliverable)

One row per modifier: *name → pipeline stage → additive-with-what → citation → confidence (confirmed / inferred / unknown)*. Low-confidence rows flagged, not hidden. This is the human-readable "actual formula" document.

### C2 — `damage_model.py` (pure function)

Stats dict in → boss-rotation DPS out. No I/O, no game-data access. Sensitivity = perturb one stat, re-run, report Δ%.

### C3 — `build_parser.py`

Planner JSON + tlidb caches → stats dict. Regex-matches affix text to stat patterns. Mandatory coverage report (see Error handling).

### CLI — `rank.py`

- `rank.py sensitivity <snapshot>` → sorted "+X → +Y%" table.
- `rank.py compare <snapshot-A> <snapshot-B>` and `rank.py apply <snapshot> "<mod line>"` → DPS delta.

## Build order (model-first)

1. **Phase 1 — mechanics research** → `mechanics.md`. Usable standalone.
2. **Phase 2 — damage engine** with a hand-snapshot of current stats → first sensitivity rankings.
3. **Phase 3 — parser** replaces the hand-snapshot with automated extraction.

## Damage pipeline (stages the model implements)

Provisional mapping; every assignment confirmed or corrected in Phase 1. **Bold = open research question.**

1. **Base hit** — mainhand sword phys × finisher weapon-attack % (127% at lv20, scaled by attack/physical/all-skill levels, support gem levels, Combo Damage Enhancement). Fed by weapon tier / gear phys damage.
2. **Conversion** — 100% phys → cold. **Research: conversion order; do phys modifiers apply to converted damage (double-dipping rules)?**
3. **Flat added damage** to attacks × skill damage effectiveness.
4. **Increased pile** (single additive sum) — %damage, %phys, %attack, %melee, %area, %cold, strength scaling.
5. **Additional layers** (each multiplicative) — additional-damage lines; Fervor; Combo Finisher Amplification (Heart of Animitta + skill's inherent +30%); warcry buffs × warcry effect (Fury's Onslaught, Growing Anger, Rage Infusion, Seething Silhouette trait line); additional damage with sealed life+mana; Tenacity/Agility/Focus blessings; Precise: Fearless / Cruelty / Domain Expansion / Frigid Domain.
6. **Enemy-taken multipliers** — Frostbite (effect × **max frostbite rating interaction**), **Numb**, **Ice Bond**, **Paralysis**, Cold Infiltration, Timid curse ring. **Research each: stage + stacking.**
7. **Crit** — crit rating → chance (**rating→chance curve vs boss level**); crit damage + physical crit damage + attack crit damage (**additive with each other?**).
8. **Mitigation** — boss cold resistance − elemental/cold penetration; **armor-mitigation penetration relevance under 100% conversion**.
9. **Rotation weighting** — attack speed (gear, minus finisher's −40% additional attack speed), combo points → clone count (1–4), 70% shotgun falloff on clones, warcry/Fervor uptime, **minimum-enemies-hit warcry threshold on bosses**.

Modifiers research proves irrelevant (e.g. armor pen if damage is fully cold) are marked **no-op for this build** in `mechanics.md` — that is itself ranking output ("stop paying for this stat").

## Error handling

- Unknown affix text → warn and continue; never crash, never silently contribute zero.
- Missing cache entry for a GUID → named in the coverage report.
- Coverage report on every parser run: resolved / matched-unused / **unmatched** line counts and full unmatched list.
- Sensitivity refuses to run if a high-impact stat (base weapon damage, crit rating/damage, attack speed) is absent from the snapshot.

## Testing

Iron Law: failing test before implementation, each phase.

- **C2:** hand-computed fixtures per stage (e.g. two "20% additional" lines ⇒ ×1.44, not ×1.40); stacking rules lifted directly from `mechanics.md` rows.
- **C3:** fixture of ~20 real affix strings from the build with expected stat-dict outputs; coverage-report assertion.
- **End-to-end:** parse real `Rehan SS13_update1.json` → model produces DPS → coverage ≥ agreed threshold.

## Decisions log

- Deliverable: upgrade ranking (sensitivity + candidates), not calculator-for-its-own-sake.
- Input: parse planner JSON (user choice over hand-entered sheet); mitigated by mandatory coverage reporting.
- Scenario: boss single-target only.
- Validation: community-source cross-check, no in-game calibration.
- Build order: model-first (Approach 1).
