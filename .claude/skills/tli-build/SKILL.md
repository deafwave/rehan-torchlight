---
name: tli-build
description: "Decode a Torchlight Infinite build from a tlicompendium build-planner share code or an exported build .json, resolving its GUIDs to real names (hero, traits, skills, supports, gear, legendaries, talent nodes, pactspirits, divinity slates). Use when given a tlicompendium.com/build-planner?code= link, a TLI build export, or when writing a build guide that needs skill/gear names. Triggers include: tlicompendium, build planner, build code, TLI build, decode this build."
---

# TLI Build Decoder

Turns a tlicompendium build (share code or exported JSON) into named, readable data.

## Facts that save you a wasted hour

The build-planner page is a Vue SPA — the HTML is an empty 2.4KB shell, so
fetching the URL gets you nothing. The share code is **not** client-side data;
it is a server lookup.

| Trap | Reality |
|---|---|
| `tlicompendium.com/api/...` | Returns the **SPA HTML**. The API is a different origin: `api.tlicompendium.com` |
| `GET /api/SharedBuild/<code>` | `{buildCode, moduleType, season, compressedData}` |
| `compressedData` | lz-string **`decompressFromEncodedURIComponent`**. `decompressFromBase64` fails |
| Default urllib User-Agent | **403 Forbidden** on both hosts. Send a browser-ish UA |
| GUIDs in the build | Meaningless alone. Resolve via `/data-bundles/{season}-{dataset}-{lang}.json` |
| A GUID that won't resolve | Check the version nibble: **v4 = build-internal id**, v5 = game data |

Season naming differs by source: the API says `Season12_5`, the build says
`SS12.5`, bundles are keyed `SS12.5`. `season_to_prefix()` normalizes all three.

## Usage

Requires `lzstring` for share codes only (`python -m pip install lzstring`);
local .json files decode with no dependency.

```bash
python tlibuild.py <code|path.json> --summary          # readable overview
python tlibuild.py <code|path.json> -o resolved.json   # full resolved JSON
python tlibuild.py <code> --loadout 0 --summary        # one loadout
python tlibuild.py <code> --raw                        # decode, skip resolution
python tlibuild.py <code> --season SS12 --refresh      # force season / re-download
```

First run downloads ~6MB of bundles into `cache/` and writes a `guid-index-*.json`
(~25.7k entries). Later runs are offline and instant. Every run prints resolution
stats to stderr — **`unresolved` should be 0**; if it is not, the season is wrong.

```
[SS12.5] index=25706 resolved=794 keys=172 internal=17 unresolved=0
```

`resolved` = GUID values swapped for names. `keys` = GUID *keys* given a `_names`
entry. `internal` = equipped refs mapped to inventory items.

## Output

`--summary` gives hero, traits, skills with their supports, equipped gear,
pactspirits, talent trees, and slate counts:

```
## Full precise auras
  hero: Rehan: Seething Silhouette
    level1   Seething Silhouette
    level45  Fury's Onslaught
  skill: Spectral Slash L20
    + Recuperation, Steamroll, Added Physical Damage, Willpower, Quick Decision
  boots    : Grace Boots
  necklace : Vortex Heart
```

Without `--summary` you get the whole build with GUID *values* replaced by names
in place — same shape as the original, so existing tooling still walks it.

**GUID keys are not renamed.** `skillTree.slots[].nodePoints` is keyed by node
GUID, and names repeat — one dict can hold six different nodes all called
"Micro Talent", so renaming keys would silently merge them. Those dicts get a
`_names` sibling instead; read points and names together:

```python
for guid, points in nodePoints.items():
    if guid == "_names":
        continue
    name = nodePoints["_names"].get(guid, guid)
```

## Structure notes

Sections are **not** uniformly shaped — do not assume `equipped`/`inventory`:

- `skills` → `{activeSkills[], passiveSkills[]}`; `supports` may contain `null` slots
- `gear` → `{equipped{slot: itemId}, inventory[]}`; `equipped` holds internal ids
  (`gear-1784...`), resolved against inventory, where `displayName` is the label
- `divinity` → `{inventory[], placements}`; `pactspirits` → a list
- `skillTree` → `{slots, allocationOrder, recordOrder}`
- Legendary mods carry an inline `description`, plus `normalRawText`/`corrodedRawText`
  in the `legendaries` bundle for the full roll range

Descriptions embed `<span class="text-mod">` and `<link:614>` markup — strip it
if you are rendering prose.

## Verify

`python ../test_tli.py` — offline checks for the v4/v5 rule, season
normalization, and resolution.

## Related

`tlidb-lookup` for wiki pages on a single skill/item. Different site, different
data; this skill never touches tlidb.
