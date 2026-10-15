---
name: tlidb-lookup
description: "Look up Torchlight Infinite game data on tlidb.com - skills, legendaries, gear, tips, pactspirits, talents, and their stats or descriptions. Use when asked about what a TLI skill/item/affix does, when resolving a game term while writing a build guide, or when searching the TLI wiki. Triggers include: tlidb, Torchlight Infinite wiki, TLI skill lookup, what does this legendary do."
---

# TLIDB Lookup

Fetches Torchlight Infinite entity data from tlidb.com.

## Facts that save you a wasted hour

tlidb.com has **no JSON API**. It is a server-rendered jQuery site. Detail pages
are HTML; the only machine-readable index is `autocomplete_en.json`.

| Thing | Reality |
|---|---|
| `https://tlidb.com/en/<slug>` | HTML page, no embedded JSON (no `__NUXT__`/`__NEXT_DATA__`) |
| `i18n/autocomplete_en.json` | The real index. 4,398 entries: `{value, desc, label}` |
| `i18n/en.json` | Only 284 UI chrome strings ("Stash", "Craft"). **Not** game data |
| Default urllib User-Agent | **403 Forbidden.** A browser-ish UA header is required |
| Index slugs | Already URL-encoded (`Precise%3A_Purify`). Re-quoting gives 404 |

`value` is the URL slug, `label` is the human name, `desc` is the category.

## Usage

Run from this skill's directory. First call auto-downloads the index to `cache/`.

```bash
python tlidb.py search <query> [--type Skill] [--limit N]   # find the slug
python tlidb.py get <slug|label>                            # page as text
python tlidb.py types                                       # categories + counts
python tlidb.py sync                                        # refresh both json files
```

`get` accepts a slug, a pre-encoded slug, or a human label — it resolves through
the index, so `get "Precise: Purify"` and `get Precise%3A_Purify` both work.

## Workflow

Search first to get the slug, then fetch. Do not guess slugs.

```bash
$ python tlidb.py search Multistrike --limit 3
Multistrike               [Skill]  Multistrike
Multistrike_Count         [Tip]    Multistrike Count
Multistrike_Damage_Increment  [Tip]  Multistrike Damage Increment

$ python tlidb.py get Multistrike
Multistrike / Attack / Support / Mana Cost Multiplier 110.0%
Supports Attack Skills. Cannot support Mobility or Channeled Skills.
+101 % chance for the supported skill to trigger Multistrike ...
```

Pages carry per-season blocks (SS12, SS11...), a skill-shop unlock table per hero,
and a level-by-level progression table. Read the season you care about — the top
block is the newest.

## Categories

894 Tip, 699 Skill, 330 Legendary, 266 Money, 242 Core Organ, 192 Destiny,
187 Manual, 168 Pactspirit, 138 Core Talent Node, 80 Compass, plus per-weapon
and per-slot gear categories. Use `--type` to disambiguate a name that exists as
both a Skill and a Tip.

## Related

For decoding a build (share code or exported JSON) into resolved names, use the
`tli-build` skill instead — it reads tlicompendium data bundles, not tlidb.
