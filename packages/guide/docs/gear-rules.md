# Gear candidate rules

- **Unique modifiers.** `config_item_gold` lists modifier groups; the modifier id is `group x 10 + digit`. A unique takes digit 1 (the dropped
  variant worn items carry: Ruinous Star 80935371, Kaleidoscope 51512841) and falls back to digit 0 only when digit 1 is not in the catalog
  (digit 0 can be a corruption: Decaying Blessing 51527440). A slot listing several groups is a random pool: no roll is assumed, the item is
  offered with its fixed modifiers and the slot named in `notSearched`. A group the catalog lacks: the item is not offered, `notSearched` names it.
  (`candidates/gear.ts` `goldMods`)
- **Roll convention.** A random purchase or craft lands anywhere in its range, so `dynArgs` = the midpoint of each `config_modifier_rolls`
  range (expected value), for crafted lines, uniques and base attributes.
- **Library vs catalog.** Tiers whose library text ranges differ from the catalog rolls (`src/data/affix-ids.json` `rollMismatches`), or whose
  id is not a catalog modifier (`mismatches`), are not crafted.
- **Base swap.** Replaces the base's own lists (`baseAttr` = a1b8 only; `baseAffix` stays empty, its rolled pool is not decoded). Crafted
  prefixes/suffixes the new base's pool can take are kept and paid as a re-craft; the others are dropped (`rebased`).
- **Base price.** A base is priced on etor (`costOf(..., 'bare')`); 0 FE only as a drop (unpriced on the market).
- **Level.** `ctx.level` gates what can be worn; crafting (`craftStep`, `craftCostOf`) assumes item level 100.
