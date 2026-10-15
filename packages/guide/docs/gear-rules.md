# Gear candidate rules

- **Unique tier digit.** `config_item_gold` lists modifier groups; the modifier id is `group x 10 + digit`. Digit 0 has the best rolls in the catalog (group 5121011: d0 [130-155], d1 [100-125], d2 [60-90]; 5121014: d0 [80-100], d1 [50-70]), so uniques use digit 0, the max-level version. A unique with any group lacking a catalog modifier is not offered; `notSearched` names the item and groups.
- **Roll convention.** A random purchase or craft lands anywhere in its range, so `dynArgs` = the midpoint of each `config_modifier_rolls` range (expected value), for crafted lines, uniques and base attributes.
- **Library vs catalog.** Tiers whose library text ranges differ from the catalog rolls (listed in `src/data/affix-ids.json` `rollMismatches`), or whose id is not a catalog modifier (`mismatches`), are not crafted.
- **Base swap.** Replaces the base's own lists (`baseAttr` = a1b8 only; `baseAffix` stays empty, its rolled pool is not decoded) and keeps crafted prefix/suffix. A base costs 0 FE (the Bing1 guide priced a white base at about nothing).
- **Level.** `ctx.level` is the only level source (gates and item level).
