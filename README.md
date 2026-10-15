# TLI Lens

Build-progression guide for Torchlight: Infinite. `packages/guide` drives the pinned dps-debug calculator
and writes `packages/page/src/data/guide.json`; `packages/page` (Vite) renders it. See `CLAUDE.md` for
layout, the dps-debug pin and invariants.

## Commands

- `pnpm guide ideal [--out path]` - full ideal-progression run (L60 to L100), writes `guide.json`.
- `pnpm guide advise <export.json> [--fe N] [--season N] [--out path]` - ranked next moves for your character;
  writes `advice.json` and copies it to the clipboard. Uses live etor prices, else the stored snapshot.
- `pnpm guide figure <loadout.json> [--skill hoa|iceShot] [--level N]` - print one figure.
- Flags for all three: `--workers N`, `--bombs N` (default 10), `--roll-budget N` (default 1<<20),
  `--budget-minutes N`.
- `pnpm dev` / `pnpm build` - the page. `pnpm test` - all package tests (guide: tsc + vitest).

## Getting your export

Elevated shell, game running, in the dps-debug checkout: `python reader/export.py [--fe N]`. It writes
`game/exports/<stamp>/export-<stamp>.json` and copies the same JSON to the clipboard. The poorchlight
button (branch `feat/tli-lens-export`) produces the same export. Pass the file to `pnpm guide advise`.

## Tests

`pnpm test` is light (no dps-debug workers). `GUIDE_REAL=1 pnpm test` adds real-figure tests; they skip
while the game.busy file exists, and the evaluator pool pauses on it (`GUIDE_BUSY_FILE` overrides the path).

## Known limits

Anything the search could not cover (unported craft rules, uncatalogued bases, rank-ups not on the market)
is listed in the output's `notSearched` / `unpriced`. Partial figures are flagged, never ranked as complete.
