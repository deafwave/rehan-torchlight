# Spectral Slash sectional progression guide — spreadsheet content design

**Date:** 2026-07-16
**Target:** `Torchlight Sanity Retention.xlsx` → `Rehan2 Guide` tab, rows ~152 onward
**Goal:** Convert the model's ladder/bundle knowledge into a mostly-linear, sectional,
copy-pasteable guide matching the sheet's existing grammar and the user's guide style
(phase gates, casual/direct tone, inline prices, all-caps warnings).

## Sheet grammar (existing, preserved)

- **Column A** — DPS gate (`1B`, `10B-20B`, `200B`, `150B DPS`)
- **Column B** — stage/action tag (`8-0`, `Traveler 8`, `Buy ASAP`, `Check and move on`)
- **Column C** — multi-line content cell
- **Right side** — floating pictures, added manually by the user from named screenshot callouts

## Organization: gate-driven, engine-ordered within gates

Sections appear linearly by gate; within each gate, purchases are ranked by ΔDPS
straight from `packages/page/src/data/ladder.json` / `catalog.json` (regenerate with
`pnpm page` before authoring — nothing eyeballed, per repo invariant #2). Bundles
that split across gates get a one-line "needs X" back-reference.

Big-ticket snipe items live in a **standing watchlist** section rather than inline,
because they're bought on price, not on schedule.

## Section skeleton

### §1 SWAP TO SPECTRAL SLASH (~row 152)
Polish of existing stubs: skills/auras/talents + build code, pactspirits, cheap
uniques (`Buy left side unless right is cheap`: Grace Boots / Bodhi Girdle /
Vortex Heart ~130 FE), 3-4x one-mod slate check, pedigree list, auras.

### §2 STANDING WATCHLIST — "CHECK AH EVERY SESSION" (new)
One row per snipe item: fair price / rip-off price / what it unlocks.

| Item | Price guidance | Unlocks |
|---|---|---|
| Heart of Animitta | listed ~1300 FE, snipe WAY under | second full-power Finisher (+1 charge — the #1 buy) |
| Vorax boot base | i86+, at least one decent mod | vessel for "Have Fervor" |
| Dawn Break belt | expected value 950 FE | supplies "Have Fervor" onto the Vorax boots |
| Ghost Slaughter | **CORRODED ROLL ONLY** (1%/pt; normal roll is a third of the value) | Fervor engine gloves |
| Eternity | buy the **5 BLUEPRINTS**, not the ~4k FE item | +490.8% mapping DPS (kill-fed stacks) AND the Fervor sustain bill |
| Timid ring | joins at Traveler 8, monitor continuously | +118% → +146.8%, frees the Warcry slot |
| Inverse Prism, good roll | high positive Legendary-Medium AND Medium effect ranges (model prices the +38%/+17% roll at **+90.4%**) | copies the Brave tree — +6 min Warcry enemies, floor 14 of 16 |
| Ethereal Prism: Unmatched Valor | monitor; **needs the i100 sealed-mana helmet + Dawn Break** | fixed 130 Fervor Rating, +38.05% (§7); god-roll: "no longer replaces" keeps the Ranger core too |

### §3 Gate: 1B DPS / 8-0 — i86 core
- **Weapon first** — i86 Shadowless Swordsman's Blade. Line priority: T1 flat Cold
  (+17.1%) > gear Attack Speed (+8.2%) > flat Phys (+5.9%); advanced slot: Gear
  Phys% (+9%, 3x embers). Rung: +20% floor → +84.5% fully crafted.
- **Offhand second** — i86 same base, raw-damage roll: flat Cold (+5.1%) >
  Elemental% (+2.6%) > Phys%; advanced: Gear Phys% / Crit Damage. +15.4% → +35.9%.
- Then: i86 combo ring (**+1 Combo Points suffix is the item — never lose it**),
  i86 chest, Hero Memory legendary (existing row 173 content), Kismet (row 174).
- All-caps: **PRICELESS WAITS — SHOPPING OPENS AFTER TRAVELER 8 (§5)**.

### §4 SLATES PRIORITY (new — sits between the 1B and 10B gates)
Follows the page's "today / buy on slate / what it frees" plan (rev. 2026-07-16):
1. **Focus Blessing on Frostbitten hit — REQUIRED BEFORE i86 BOOTS**
   (unlocks the whole boots ladder: Grace Boots freed → i86 → Dawn Break)
2. **Frostbite on Cold hit** — frees 4 Prophet points → respec into the
   Frostbite legendaries (Effect · Cold Infiltration · more-vs-Frozen)
3. **+4 min enemies affected by Warcry** (The Brave) — floors the boss stack count
4. **Phys→Cold conversion — the LAST slate buy**: the Prophet tree covers it
   today; the slate frees the Prophet → Ronin respec
Plus: what to shop (A Corner of Divinity ×3 / Fallen Starlight ×3 / Pedigree ×1 /
god slates), pedigree cores + damage fillers ranked by ΔDPS from the catalog,
and the Deep Space immunity lines (Trauma/Wilt/Ignite) to hold before farming it.

### §5 Gate: 10B-20B / Traveler 8
i86 ES boots (explicit back-reference: only after the §4 God of Knowledge slate),
i86 gloves, helmet, remaining armor — each with top lines + ΔDPS.
Closes with: **TRAVELER 8 DONE? Priceless shopping OPENS NOW** — price pieces
every session, buy on price not schedule; Timid ring goes on the §2 watchlist.

### §6 Gate: 200B / Profound 8 (8-1 + 8-2 open) — priceless completes
Priceless mainhand (+74% → +137%; ultimate lines: Armor Pen / Combo Enhancement),
i100 offhand → Ninth Apostle's shield (+16.4% → +44.9%; +4 Active Skill Level is
the big ultimate line; lands as a package with i86 Hasten boots + God of Might /
Brave tree changes), i100 Timid ring (+118% → +146.8%), second i100 ring
phys-as-extra (+76.1% → +100.2%). Back-reference to watchlist.

### §7 Fervor engine — all-or-nothing block
Fires when the §2 watchlist items are in hand: Vorax boots + Dawn Break belt +
corroded Ghost Slaughter + the fixed-rating prism chain — **i100 sealed-mana
helmet (+2.6% alone → +43.9% with the prism) + Ethereal Prism: Unmatched Valor
(+38.05%)** — + Eternity (from blueprints) + sustain slates.
Cost line: **12% of current Life AND ES per second while Fervor is active**.

### §8 Timemark 8 / ATLAS / 150B+
Crit layer (Crit Damage support swap, Fervor→CritDmg converter slates, +195% Crit
Damage at 130 rating), Warcry layer (Captain Kitty levelling — the one pactspirit
worth levelling, Shockwave + Resurrection Warcry bar, Inverse Prism good roll
+90.4%), kismet endgame (2× Peerless + Tiger's Chain, 2× Mammoth + Ascetic —
Mammoth self-casts Lv.20 Resurrection Warcry, crit fates), mirror-worthy notes
(mainhand −9.7% → +33%: only the +4 Attack Skill Level roll beats priceless).

## Deliverables

Both files go in `guide-export/` at the repo root. They are one-shot export
artifacts for the external spreadsheet, not living docs — repo invariant #2
(no hand-written rankings in docs/) doesn't apply, but every number in them is
scripted from the generated JSON, and the export dir gets a README line saying
"regenerate after any model change, do not hand-edit".

1. **`guide-export/spectral-slash-guide.tsv`** — tab-separated A/B/C columns,
   cells quote-escaped so in-cell newlines paste into Excel in one shot, starting
   at row 152. Section headers styled like existing ones (all-caps C-cell).
2. **`guide-export/picture-callouts.md`** — per-row list of exactly what to
   screenshot (e.g. "row N → trade-house search: Shadowless Swordsman's Blade i86,
   T1 'Adds 126–166 Cold' circled"). User captures in-game screenshots themselves.
3. All % figures from regenerated `ladder.json` / `catalog.json` (`pnpm page`
   first). The §4 slate list is elided ("…") here by design — the full ranked
   list is pulled from `catalog.json` at authoring time.

## Out of scope

- Editing the xlsx directly (user pastes the TSV).
- Fetching/downloading images.
- Rows before 152 (leveling section) — untouched.
