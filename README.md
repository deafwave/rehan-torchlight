# Rehan SS13 — Spectral Slash Damage Model & Upgrade Ranker

Ranks damage upgrades for the Torchlight: Infinite Rehan (Seething Silhouette) Spectral Slash build by parsing the planner export against a researched damage formula.

## The bundle

| File | What it is |
|---|---|
| `CLAUDE.md` | **Start here** — repo map, commands, and the maintenance invariants |
| `docs/mechanics.md` | The damage formula: every modifier classified (bucket, stacking, citation, confidence) + assumptions |
| `data/snapshot.json` | Your parsed build as model input (hand-editable) |
| `data/manual_overrides.json` | Researched values the parser can't read from affix text, each cited |
| `packages/dmg/` | The damage model, build parser, mod catalog, and gear ladder (TypeScript) |
| `packages/page/` | The progression page (Vite + TypeScript); `packages/page/src/data/*.json` is written by `pnpm page` |
| `docs/superpowers/` | Design spec and implementation plan |

Rankings are not a doc: run `pnpm rank` for the current sensitivity table.

## Usage

```bash
pnpm install
pnpm snapshot   # parse the build export -> data/snapshot.json + coverage report
pnpm rank       # sensitivity table: "+X stat -> +Y% boss DPS"
pnpm test       # 62 tests incl. end-to-end (>=90% affix coverage enforced)
pnpm page       # regenerate packages/page/src/data/{catalog,ladder}.json for the web page

# the web page:
pnpm dev        # local dev server
pnpm build      # type-check + bundle to dist/

# candidates:
pnpm --filter @rehan/dmg rank apply data/snapshot.json penetration.cold_pct 40
pnpm --filter @rehan/dmg rank compare data/snapshot.json other-snapshot.json
```

Scenario: boss single-target, full combo rotation. The parser targets the planner's current loadout (`-l N` to override). Unparsed affix lines are always printed — never silently dropped.
