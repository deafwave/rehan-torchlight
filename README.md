# TLI Lens

Build-progression guide for Torchlight: Infinite. `packages/guide` drives the pinned dps-debug calculator over your character and writes
`packages/page/src/data/advice.json`; `packages/page` (Vite) renders it. Commands, flags, the dps-debug pin and the invariants are in
`CLAUDE.md`.

## Quick start

Elevated shell, game running, sibling `../dps-debug` checkout:

- `pnpm guide plan` - reads your character from the game and plans it to the damage goal at the least FE.
- `pnpm dev` - the page.
- `pnpm test` - light tests; `GUIDE_REAL=1 pnpm test` adds real-figure tests.

A saved read: `python reader/export.py` in dps-debug writes `game/exports/<stamp>/export-<stamp>.json` (and copies it to the clipboard);
pass it to `pnpm guide plan <file>` or `pnpm guide advise <file>`.

## Known limits

Anything the search could not cover (unported rules, uncatalogued bases, items not on the market) is listed in the output's `notSearched` /
`unpriced`. Partial figures are flagged, never ranked as complete.
