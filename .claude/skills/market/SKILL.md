---
name: market
description: "Rank the auction house search the player has open in Torchlight: Infinite by what each listing costs to finish: price + expected crafting to get every wanted mod to T1 (market-targets.json); a Divinity Slate search by the model's % damage gain on your character. Reads the listings from game memory, no screenshots, ~3 s (slates ~40 s). Use when the user asks which market item is the best deal, the best base to craft on, or says /market."
---

# market

1. Run from the tli-lens repository root:

   ```
   pnpm -s guide:market --top 8
   ```

   - It reads the open search result from memory: `scripts/market_listings.py`, which uses dps-debug's reader through `DPS_DEBUG`, by default the sibling `../dps-debug`.
   - "no market search result on screen" means the auction house search isn't open. Ask the user to open it and run the command again.
   - Never click, type or press keys in the game.

2. Report the top listings in one short table:
   - listing number (`#n`, the order on screen) and price;
   - the T1 mods it already has;
   - the expected crafting cost, and the total.

   Say which one to buy and why: usually the one with the most wanted T1 mods per FE.

   A **Divinity Slate** search (the listings carry talents) is ranked by the model instead. Each listing's talents go on your character as one more slate
   (`withSlate`), using the newest `dps-debug/game/exports` read (`--export <file>` overrides it). Report `#n`, the price, the % damage gain (kill speed vs
   the target), the %/100 FE and the two talents. Recommend the best gain per FE, and also the best gain outright if it costs more. A `partial` row is a
   piece the model cannot price (it names what it dropped). It is never ranked, so say it is unknown, not zero. The gain assumes a free board spot; with
   a full board the slate replaces one.

3. If a gear base has no entry in `market-targets.json`, ask the user which T1 mods they want. Add them, using T1 ids from `data/affix_library.json` (`tiers[0].tierAffixId` of the item's slot library), then run again.

Notes:
- Crafting cost is `craftStep`'s expected embers to roll that exact T1, at live etor ember prices.
- A two-handed weapon spends 2 embers per craft.
- Max 2 advanced affixes per item. A listing with an advanced T1 mod outside the target (for example T1 Strength on a maul) can be a cheaper alternative. Mention it.
- To test without the game: `pnpm -s guide:market --file <saved listings.json>`.

## Slate searches

- A Divinity Slate search is ranked by the model's damage gain of each listing **in place of one of your slates** (the best one named; `--same-shape` only lets it replace a slate of its own shape: your board is full,
  a slate only fits where one of its shape sits), on the Traveler (the plan's target; `--target <boss>` to change). The row names which of your slates it replaces.
- With `--same-shape`, a listing whose shape matches none of your slates is listed as not ranked.
- The reader sees the listings on screen: run it again for each page of the search.
