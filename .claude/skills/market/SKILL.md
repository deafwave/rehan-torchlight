---
name: market
description: "Rank the auction house search the player has open in Torchlight: Infinite by what each listing costs to finish: price + expected crafting to get every wanted mod to T1 (market-targets.json). Reads the listings from game memory, no screenshots, ~3 s. Use when the user asks which market item is the best deal, the best base to craft on, or says /market."
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

3. If the base has no entry in `market-targets.json`, ask the user which T1 mods they want. Add them, using T1 ids from `data/affix_library.json` (`tiers[0].tierAffixId` of the item's slot library), then run again.

Notes:
- Crafting cost is `craftStep`'s expected embers to roll that exact T1, at live etor ember prices.
- A two-handed weapon spends 2 embers per craft.
- Max 2 advanced affixes per item. A listing with an advanced T1 mod outside the target (for example T1 Strength on a maul) can be a cheaper alternative. Mention it.
- To test without the game: `pnpm -s guide:market --file <saved listings.json>`.
