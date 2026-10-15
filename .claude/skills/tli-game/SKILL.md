---
name: tli-game
description: "Read and drive the running Torchlight: Infinite client — memory-read the build page (gear, skills+supports, talents, slates, prisms, memories, pactspirits, kismets), scrape builds, screenshot, press keys, click and hover the UI, and compare model sources against the in-game character sheet. Use when validating the Bing/HoA DPS model against the game, scraping a Pro Build or the user's own build, or navigating game menus."
---

# tli-game

**Memory first, screen second.** Everything a build page shows is in memory; read it with `state.mjs`
or `scripts/scrape_build.mjs`. Use screenshots/input only for what memory does not hold yet (the
character sheet, the dummy DPS readout) or to open a page so memory can be read. All of it needs
the **elevated** shell and the sibling repo `../poorchlight` (`target/release/tli_dump.exe` built).

## Memory reads

| Command (repo root) | What |
|---|---|
| `node .claude/skills/tli-game/state.mjs [--reuse] [--section gear\|skills\|memories\|traits\|talents\|slates\|prisms\|pacts\|kismets\|issues]` | readable dump of the open build page — every affix with its in-game text, supports by socket with Magnificent rolls, talent points per node, pact levels |
| `node scripts/scrape_build.mjs <slug> --stated "<DPS + what it measured>"` | writes `data/bing1/scraped/<slug>.json` (planner export + native talents + prism placements) for `pnpm bing diagnose data/bing1/scraped/<slug>.json --season ss13` |

The page read is whatever **build page** is open: a Pro Build, a Hunter File, or the user's own build
(`sourcePage` `ViewPlayerBDReference`, `hero.sourceName` = character name). Any tab works.

Where things live (`poorchlight/tli_dump/diagnostics/`):
- `_last_live_portable.json` → `proBuild.loadout.{hero, heroMemories, gear, skills, skillTree, divinity, etherealPrisms, pactspirits, kismets, vorax}`; affix text is in `affixes.*[].Simple` (strip `<p>`/`<e>` tags), raw ids in `.Id`, rolls in `DynArgs`.
- `_last_live_snapshot.json` (raw) → `GeniusInfos` (talent `GeniusList` node→points, `BonusTalents`), `EtherealPrismState.Placements` (the portable projection drops placements).
- Skills: `data.compendiumPlacement` = `{kind, slot, ownerKind, ownerSlot}`; level = `itemLevel`; Magnificent roll = `data.ServerPlayerItem.Prefix[].DynArgs`, tier from `identity.base.metadata.skillTierProgression`.
- Pactspirit level = `StarRank`. Six can be equipped; drop pacts (Captain Shadow, Chalk Spirit, Twilight Sparks…) are loot-only and the exporter skips them.
- Talent node id `<tree:2><col:2><row:2>00` (cols = point thresholds 0…18 → 1…7, rows 1…5).
- Known exporter gaps (handled in `scrape_build.mjs` / `bingImport.ts`): Magnificent tiers missing from poorchlight's catalog (restored from the item's tier table); 1,069 catalog GUIDs carry two game ids — index game ids from the raw entry list, never a GUID-keyed map; prism base attribute `1204509011` has no text anywhere.

## Screen and input (background — never steals focus)

`powershell -NoProfile -ExecutionPolicy Bypass -File .claude/skills/tli-game/game.ps1 <cmd>` — coordinates are
**game client pixels** (3440×1440). The user may be using the PC while you work:

- **keys** are posted window messages preceded by a posted WM_ACTIVATEAPP/WM_ACTIVATE/WM_SETFOCUS (the game drops
  input it believes is unfocused). No focus change, no global input — works while another app is in front.
- **screenshots** use PrintWindow (flag 3): work while the game is unfocused or covered.
- **click / hover / wheel** need the real cursor (the game ignores message coordinates): the tool flicks the
  cursor there for ~0.2s and restores it, and **refuses unless Torchlight is the foreground window**
  (`TLI_FORCE_FLICK=1` overrides). Clicking outside a panel walks the character. Blink aims at the real cursor
  too — Blink A/Bs need the game in front.

| cmd | |
|---|---|
| `shot <out.png> [x y w h] [scale]` | screenshot (default whole client at 0.5); `Read` the png. Crop + scale 0.6–1 to read numbers |
| `key F2` / `key ESC SPACE` | posted key presses (VK codes: A–Z, 0–9, F1–F10, ESC, SPACE, TAB, ENTER) |
| `click x y` · `hover x y <out.png> [crop] [scale]` · `wheel x y -6` | cursor flick (game must be in front) |
| `aimkey x y KEY` | press KEY with the cursor at x,y (Blink). At the hideout dummy spot aim **into the trees on the left (800,800)** — Blink is blocked there so the character stays in range; `measure` uses that aim (`TLI_AIM=x,y` overrides) |
| `measure <prefix> [secs] [KEY every-s]` | needs the dummy count **running**; shoots the panel at start/end (`<prefix>-0/-1.png`); interval DPS = (avg₁·t₁ − avg₀·t₀)/(t₁ − t₀) — no clicks |
| `burst <out.png> <frames> <ms> <x y w h> [cols] [scale]` | timestamped contact sheet — throws (crop `1640 480 160 180`), buff uptime (`400 20 420 60`), dummy debuffs/stacks (`1540 130 180 55`) |

PowerShell gotcha: variables are case-insensitive (`$h` and `$H` are one variable).

Keys (ESC menu lists them): **B** inventory + character sheet, F1 Trade House, F2 Skill, F3 Talent, F4 Hero Trait,
F5 Pact, M World Map, P Boon, K Season Pass, J Outfit, O Help; skill bar SPACE = Blink (10.6 mana, 2 charges —
castable even with 498/520 mana sealed), R = HoA (disabled under Firepower Coverage), mouse, E, Q, F. **ESC** opens/closes the menu; close panels with their X (character sheet X at
3354,54; menu back arrow 3370,76) — B does not always toggle the sheet shut.

Character sheet (B), right panel at x≈1900–2460: tab icons at y=320 — Overview x=2016, **Damage x=2132**,
Defense x=2248, 4th x=2364. Damage tab has a skill dropdown (Hammer of Ash) and rows; wheel over x=2180
to scroll. **Hover a row → tooltip; click the row to pin it, then click the tooltip's `Base`/`Additional
Bonus ▼` bar to expand the per-category breakdown** (Base Value / Talent / Hero Memories / Gear / Skill / Others).

**The sheet is static data only.** Its DPS (≈18M vs a real 484B) ignores buffs, procs, Deterioration,
enemy-taken and conditional lines; "Additional Damage Bonus" lists only buffs live at that instant and
hides "additional Base Damage" lines. Use it to check inputs, not outcomes: Strength, crit chance/damage,
typed increased pools, attack speed, penetration, projectile count, knockback.

Checked 2026-10-10 on DeafwaveB (`data/bing1/scraped/my-build-2026-10-10.json`): Strength 339, crit chance
57.05%, crit damage 324 (150 base + 121 talent + 53 memory), physical 176, fire 48, erosion 247, attack
1.97/s (model ×1.05 Aggression in combat), knockback 48, erosion pen 10, projectiles 6 — all exact.

The dummy panel's **Info** tab (click 450,174) is the same sheet **captured in combat** (DPS 46M vs 18M at rest):
its Damage section (269,269) shows live buffs (Kaleidoscope turns, Bull's Rage) — sample it, values change by the second.

Floating damage numbers over the dummy (crop `1950 380 700 450`, burst 150ms): yellow 6–24B, purple 4–58B at
this build. They merge: with the game's "draw each hit" setting off, each logic frame's hits become one number per
category (Deterioration ticks have their own HP-removal style). Count hits with `combat.mjs --hits`, not screenshots.

## Memory combat reads (preferred)

`node .claude/skills/tli-game/combat.mjs [secs=30] [--label x] [--buffs]` reads `tli_dump --combat-watch`: DPS =
Δ dummy total damage / Δ **game time** (logic frames / 30 — never `wallDps`), buff uptime %, dummy debuffs with stacks
(Deterioration, Timid, Frostbitten). Appends to `../scratch/measurements.jsonl` (outside the repo). Needs the dummy
count running: 0 game-s from `combat.mjs 5` means it is stopped — with the dummy panel open, `game.ps1 click 310 545`
(its Recount button, client pixels; game in front) restarts it in place. **30-second windows, A-B-A, two per state** (the user's choice; ±~5% per window from
Kaleidoscope's 8s rotation) — the full protocol is the `bing-ab-test` skill. Never move between A and B.

`--hits` adds `tli_dump --hit-watch` over the same window: one row per hit the dummy takes
(`../scratch/watch/<label>-hits.csv`: frame, kind, crit, damage, source, hit_id, skill, flags, index; layout in
poorchlight `docs/MEMORY_LAYOUT.md` "Per-hit damage events"). Kind 4 = Deterioration ticks; kind 0 with flags 16 = the
main hit (one per bomb) and flags 40 = a 7-hit Ember volley (index 9..15). The row gets `hits`, `hitsPerS`, `hitTypes`
and `hitSumRatio` (Σ hits ÷ the dummy total over the same frames; flagged unless within 0.5% — it reads 1.00000).
The dummy must be the targeted health bar (hit it once).

**A/Bs are one call each — no screenshots** (`ops.mjs`, verified from `tli_dump --ui-json`: open views, Skill-panel
selection, the 9-slot loadout with item ids, aura activation, sealed life/mana):

```bash
O="node .claude/skills/tli-game/ops.mjs"; C="node .claude/skills/tli-game/combat.mjs"
$O state                                   # loadout + open views
$O unequip "Hammer of Ash" Passivation      # support (or: $O unequip "Flame Core" for a whole skill)
$O equip "Black Pass Claymore" --bagslot 15   # gear-tab bag item (right-click); $O gear-restore undoes it
sleep 10; $C 30 --label passivation-off --buffs   # 30 game-s is enough to iterate (±~5%: Kaleidoscope 8s rotation)
$O restore                                  # puts back the SAME item (item id checked), closes the panel
$O aura "Precise Projectiles" off|on        # Activate/Deactivate (note: Seal Conversion auras also unseal Life)
```

Every step aborts on an unexpected state (wrong slot selected, wrong socket, any other loadout change). Clicks need
Torchlight in front; `ops` waits (TLI_WAIT_S, default 30 min) instead of failing, and posts keys in the background.
The dummy's frame counter stops while the Skill panel is open — always end with the panel closed (`$O close`).

Bag clicks: the gear grid shows 3 rows at (2556 + col·100, 996 + visibleRow·140); `ops` derives the visible row from
`inventory.grid.scrollOffset / cellHeight` and wheels the grid as needed. Close the bag with its X (3354,56) — ESC
closes every panel including the dummy's (its counter keeps running; restart it from Sidney if the user wants it shown).
Other panels can cover the bag (e.g. Talent) — `views` lists them; a click that changes nothing aborts the op.

## DPS readings

The training dummy's panel (top-left of the hideout, crop `0 140 680 440`) shows span average, duration,
best 5s and 5s average. The user runs the timing macro; read the result by screenshot. Ratios need 3
span runs per state in one session (mechanics.md#real-build). Measured 2026-10-10: **484,260,480,426**
span over 31s for the build above; self-measured with no input 498.3B (50s) and 492.8B (32s).

Observed 2026-10-10 (no input, standing at the dummy): **auto-throws every ~0.48s = sheet APS 1.97 × Aggression
1.05** (burst count on the wall clock, before the game-time correction — superseded: handoff Task 0); **Bull's Rage up ~62%** (37/60 samples over 30s); no Blink is cast unless pressed (it IS castable: 10.6 mana — an earlier "uncastable" note was an input bug), so
with no input Blade-dancer's after-Mobility +45% and Saintess Repentance (needs a Blessing) are off;
Feline Stimulant 5 stacks, Attack Aggression and the four aura buffs are always up.
