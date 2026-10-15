# Prism rules the guide uses

Prism resolution happens on the game server; the client only receives the result. Task 7b generates a prism move only where the rules below determine the result and dps-debug's `{ kind: 'prism', action: 'add', node, modifierId, dyn }` change can express it. Paths are under the pin (`dps-debug/.worktrees/tli-lens-pin`).

## Rules used

| Rule | Source |
|---|---|
| Server affix 10007 (binding `_mt43_10007_<type>_<modifier>`, first binding string only) puts `<modifier>` as an ExtAffix on every node of talent type `<type>` inside the prism area. Only type 11 (Medium Talent, `config_talent` +0x18 == 48) is used. | `re/evidence/prisms.md` (a), "Extra grants"; `catalog/0x6aa39847/config_modifier.json`; checked against `captures/A52.state-20261013-043602/pre/prisms.json` (Haze, tree 54, cell 54060200) and `captures/L104-20261013-205651/pre/prisms.json` (same item, tree 51, cell 51050200). |
| ExtAffix DynArgs = the modifier's fixed roll (min == max in `config_modifier_rolls.json`): 1204400071 gives `[6,6]`, as captured. A rolled modifier is not generated. | `catalog/0x6aa39847/config_modifier_rolls.json`, same captures. |
| Server affix 10008 (`_mt43_10008_<n>`) replaces the area by influence shape `<n>`. Only shape 3 is generated (the only one with a captured resolution; shapes 1, 2, 4, 5, 8 are documented offsets but stay not searched until a capture covers them). Shape 3 here is read as offsets (dx = column) -1..1, (dy = row) -1..2; tree 51 at (2,5) excludes the medium node at (4,5), which the other axis order would include, and tree 54 at (2,6) excludes the medium node at (1,4), which a flipped row axis would include. | `prisms.md` (b); `config_modifier.json` suffix; the two captures. |
| Server affix 10004 (`_mt42_10004_<p1>_<modifier>`) sets `prisms.provide[tree].ExtraAffix = [{Id: <modifier>, DynArgs: fixed roll}]` on the prism's tree (loadout.ts "prism-wide extra", granted once). The Haze's 1204404001 gives `[12,12]` on tree 54 (cell 54060200) and tree 51 (cell 51050200), as captured. `<p1>` (123456) is unused: both captures agree. Applied as a `LoadoutPatch` (`src/patches.ts`, op `prism-provide`), the last change of the move. | `captures/A52.state-20261013-043602`, `captures/L104-20261013-205651` `pre/prisms.json` `JewelryProvideGeniusId`; `game/loadout_l104-20261013-205555.json` `prisms.provide`; `test/patches.test.ts` |
| 10009 and 10025 need no grant. | `prisms.md`, "Extra grants". |
| Node column/row and type come from `config_talent` (`a40`, `i18`, `i4`). | `prisms.md` (a). |

## Not searched, and why

- **Buying a prism**: rolled values and the base shape of an unowned prism are not known before purchase.
- **Moving a placed prism**: what happens to the vacated and the target cell's Points is not documented.
- **10005** (+Points to nodes in the area): cap and stacking not documented.
- **10007 on types 2 and 4**: `prisms.md` (a) says the type-to-node mapping is unconfirmed.
- **Influence shapes 1, 2, 4, 5, 8** (no captured resolution) and **6, 7** (offsets undocumented), a prism without 10008 (the item's base `InfluenceId` is not in the export), two 10008 affixes, and any other server affix (10003, 10006, 10010).
- **Inverse Image placement (10026)**: `applyPatch` op `inverse` writes copies (weight Point x (1 + EE/100), tag `talent:-<id>@<100+EE>%`) and drops listed originals, but the one captured resolution (item 360701 on cell 12050100, shape 1) is not reproducible from documented rules: (1) the copy of 12040100 carries 3 points (L104) / 2 (A52) while its original has Point 0 in the loadout and in the server list, so the copy's Point is not the loadout's; (2) why the area nodes 12040200 and 12050200 get no copy (they are absent from the server's talent list) and why the micro 12050100 copy gets the type-2 value -98 rather than the type-4 value 13 are undocumented; (3) the item's base InfluenceId is not in the export. Data that would settle it: the allocation before resolution (the planner/GeniusList Point of 12040100 with the prism removed) and one more Inverse Image capture with a different cell or rolls. `test/patches.test.ts` pins this: the rules match 12060100 and 12060200 but not 12040100.
- **Cell legality**: no source says which nodes accept a prism. Cells offered are the kinds the owner has placed prisms on (micro, legendary medium; never a core) with no allocated Point, in trees that hold no prism. This is an assumption, listed in `notSearched`.

## Tests

`test/prisms.test.ts` recomputes the ExtAffix set for both captured Haze placements from the rules and compares it to the capture's `TalentDataList`. `test/patches.test.ts` recomputes the 10004 ExtraAffix of both placements. The Haze without its 10004 base affix is a synthetic variant.
