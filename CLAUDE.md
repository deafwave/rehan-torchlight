# Rehan SS13 — Spectral Slash damage model & build guide

Torchlight: Infinite build guide for Rehan (Seething Silhouette). A TypeScript damage model
parses the planner export and computes every % figure on the web page — nothing is eyeballed.

## Layout

| Path | What it is |
|---|---|
| `packages/dmg/src` | `buildParser.ts` (export → snapshot, coverage-enforced), `damageModel.ts` (hit/crit/mitigation/cycle math), `catalog.ts` (slate/memory mod scoring), `progression.ts` (gear ladder + per-stat tier-step breakdowns), `pagedata.ts` (loadouts → talent-tree stages + skill bars for the page; needs the manually-fetched `SS12.5-talent-tree-master.json` in the tli-build cache — it errors with the curl command if absent), `cli.ts` |
| `packages/page` | Vite page: Bundles & Linear Upgrades / Slate Mods / Memory Mods tabs. `src/data/*.json` is **generated** by `pnpm page` — never hand-edit |
| `data/` | `Rehan.json` (planner export), `snapshot.json` (parsed build, hand-editable knobs like boss res), `manual_overrides.json` (cited constants), `craft_pools.json` (ember pools, regen via `.claude/skills/tlidb-lookup/extract_craft_pools.py`), `gear-en.json` (tlicompendium affix tiers) |
| `docs/mechanics.md` | **The mechanics truth.** Every modifier classified with bucket, citation, confidence — plus the "Assumptions & open interpretations" section. Code comments anchor to it (`mechanics.md#...`) |
| `.claude/skills/` | `tli-build/cache` (tlicompendium data bundles), `tlidb-lookup` (tlidb.com fetcher), `mod-catalog` (catalog scoring rules + regen loop) |

## Commands

`pnpm test` · `pnpm snapshot` · `pnpm rank` (sensitivity table) · `pnpm page` (regen page data) · `pnpm dev` / `pnpm build`

## Invariants

1. **Every mechanic the model uses is cited in `docs/mechanics.md`** with a confidence flag
   (confirmed / inferred / reported). A new scoring rule gets its row before the code lands.
2. **Rankings are never hand-written into docs** — run `pnpm rank`. (`RANKINGS.md` was retired
   because it went stale on every model pass; its caveats live in mechanics.md#assumptions.)
3. **After any model or parser change**: `pnpm test && pnpm page`, then refresh the page's prose
   numbers — the mini-tree notes in `packages/page/src/main.ts` — from the fresh
   `pnpm rank` output. Stale prose is a bug.
4. **Failing test first.** The e2e test enforces ≥90% affix-line coverage and an empty leftover
   `_extras` — a newly parsed line needs a mapping or an explicit ignore, never silence.
5. The parser targets the **reference loadout by name** (`PARSE_TARGET`/`REFERENCE` =
   `more_1`), falling back to the planner's current loadout — a re-export with a scratch
   loadout current must not silently rebase the page.
