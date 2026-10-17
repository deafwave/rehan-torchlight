# TLI Lens

Torchlight: Infinite build-progression guide. `packages/guide` drives the **dps-debug** calculator (pinned checkout, read-only) over a hero
state; the Vite page (`packages/page`) renders `packages/page/src/data/advice.json` (your plan, written by `plan`). `ideal` / `live` still write
`src/data/guide.json`, which the page no longer shows. Nothing on the page is typed in by hand.

## The pin

`@dps/*` resolves to `<tli>/dps-debug/.worktrees/tli-lens-pin/model/*` (a detached, locked worktree of dps-debug) via tsconfig paths + the
vitest alias; env `DPS_DEBUG_PIN` overrides (`packages/guide/src/pin.ts`). Every output records the pin commit and the memo key includes it.
Never edit dps-debug from here. Current pin and why: `git log -- CLAUDE.md` / the last `pin:` commit.

Refresh: `git -C <pin> checkout --detach main`, `npm ci` in `model/` if its lockfile moved, run tli-lens with `GUIDE_REAL=1` and pin only
if green. dps-debug's own guide gates (`GUIDE_GATES=1`, `model/guide/`) were red on main at the last pin (season figures moved): re-baseline
them before trusting a bit-equal claim. vitest reports one "Timeout calling onTaskUpdate" unhandled error on every run (its RPC, not a test) and so `pnpm test` exits 1:
read the Tests line (2026-10-17: 309 passed, 4 skipped without `GUIDE_REAL`).

## Layout

| Path | What |
|---|---|
| `packages/guide/src` | `types` shared interfaces, `pin`, `pricing` + `priceOf` (etor), `candidates/*` (gear gems kismets memories pacts prisms slates switch talents target traits), `craft`, `patches`, `search`, `kill`, `engine/{pool,worker,apply,memo}`, `modes` (ideal/advise), `plan` (your character to a damage goal, cheapest first), `start` (start states, export import), `talentRules` (talent legality, `trimPage`), `names`, `sheet`, `cli`, `atomic`, `data/` |
| `packages/guide/scripts` | `market.ts` (`pnpm guide:market`, the market skill), `owned-pacts`, `support-census`, `verify-affix-ids` |
| `packages/guide/docs` | gear / prism / talent rules the candidates use, with sources |
| `packages/page` | Vite shell, single entry `index.html`, `src/main.ts` renders `src/data/advice.json` |
| `data/`, `scripts/` | etor price history, affix library; fetch/build helpers |
| root | `prices.json` (your prices), `roll-prices.json` (read by `plan`), `market-targets.json` (market skill) |
| `.claude/skills/` | `tli-game`, `market`, `tlidb-lookup`, `tli-build` |

## Commands

- `pnpm guide plan [export.json]` — your character (read fresh from the running game via dps-debug `reader/export.py` when no file is given)
  to a damage goal at the least FE; writes `packages/page/src/data/advice.json`. Flags: `--target` (default `traveler`), `--goal` (default 2e11),
  `--budget N` (FE; stops when nothing fits), `--slate-fe` (100), `--prism-fe` (4000: the target's prism is a Phantasmagoria), `--kill-seconds S`, `--steps N` (60), `--fe N`, `--dps-debug <dir>`.
- `pnpm guide advise <export.json> [--fe N] [--season N] [--steps N] [--hoa]` — next-buys list (`--steps N` adds a path; `--hoa`: an Ice Shot
  character planned as switched now); `--budget-minutes` defaults to 30. Writes `./advice.json` (cwd) and copies it to the clipboard.
- `pnpm guide ideal [--live]` — writes `guide.json`. `live [--every M]` (default 60) reruns it and commits + pushes `guide.json`.
  `auto [--every M]` (default 30) — reads the game, runs advise into the page's `advice.json` (overwriting `plan`'s), commits + pushes; repeats.
- `pnpm guide figure <loadout.json> [--skill hoa|iceShot] [--level N]` — one figure.
- Shared: `--workers --bombs --roll-budget --budget-minutes --target --out --prices` (not every command uses every flag).
  Prices: `prices.json` at the repo root when it exists (or `--prices <file>`: `{ "<item name>": FE }`) laid over etor (`withPrices`).
- `pnpm dev` / `pnpm build` / `pnpm test` (guide: `tsc --noEmit && vitest run`). `GUIDE_REAL=1` adds real-figure tests. The pool pauses
  while the busy file exists (`DEFAULT_BUSY_FILE` in `engine/pool.ts`, env `GUIDE_BUSY_FILE`; `test/real.ts` reads only the default).

## Working rules

- One session in tli-lens at a time, one in dps-debug. Don't leave uncommitted edits for the next session.
- The owner's plan comes from `pnpm guide plan` (or advise), never a one-off script writing advice.json: it must be rerunnable and carry no
  hand-typed assumptions.
- Read the character fresh before every plan (`plan` does). A plan from an old read is wrong advice.
- A rule of the game the owner states becomes code with a test (`plan.ts` RULES, `test/plan.test.ts`), not a chat promise.
- Stopping a background shell on Windows can leave its node process running: check for `cli.ts` processes before a new run and kill the
  tree (`taskkill //F //T //PID n`).
- Write files with LF line endings (no `.gitattributes`; Python on Windows writes CRLF in text mode).

## Policies the code applies

- Fight: 10 bombs, training dummy stands still. Ice Shot inputs (`ICE_SHOT_INPUTS`, `start.ts`) are chosen, not measured.
- Roll budget: every price runs at `FIRST_ROLL_BUDGET` (4096) first (above it the affine closed form); only a "not affine" stop retries at 1<<20.
- Market: `drop` costs 0 FE and is ranked; `not-on-market` and unpriced (costFE null) are listed under `unpriced`, never ranked.
- Churn gate 5 % (0 on ideal's switch / respec / spend-free paths). Talent points: a live character's are the points it holds (Path of Progression
  grants points too, and its progress is not read): `plan` and `advise` never add one. Ideal assumes `round(108 x (L-1)/92)` below L93
  (`talentRules.ts`, Path of Progression taken as done), noted on the step.
- Target: the evaluator default is Cube 3, `plan` and market default to `traveler` (`--target`: a dps-debug `BOSSES` key, `dummy` = the
  ground's dummy); Ice Shot, the levelling leg, is priced on its dummy. Kill speed (`kill.ts`) = Life per second from 100 % down to the model's
  cull (0 when blocked), DPS capped at the model's damage lock; time to kill = max Life / kill speed. Defense is not modelled.
- One enabler per step is re-solved: the best own figure, when it reaches `enablerFloor` (0.25) x the current kill average.
- Ideal prices: last season's etor history, day 1 for Ice Shot and days 1-3 for Hammer of Ash (`LEG_WINDOWS`); `--live`: etor's live snapshot.
- Ideal runs L60 to L90 (`DEFAULT_IDEAL`). Hammer of Ash goes boss by boss (`BOSS_ORDER`: Cube 1, Keegan 2, Cube 2, Cube 3): a leg moves on
  once its boss dies within `moveOnSeconds` (10); the last runs to the damage lock, the last stage taking up to `finalSteps` (100).
  Advise starts on the first boss the character does not kill within `moveOnSeconds`, and by default prices the next-buys list only.
- The Ice Shot -> Hammer of Ash switch happens at `switchAt` (2e8), or after `STALL_STAGES` (2) stages with no step. It is planned, not
  searched: the target build's talent page trimmed to the level's points (`trimPage`). Until it can be taken (a stop, a level gate) no Ice Shot
  upgrade is bought. Advise does not search it for an Ice Shot character. The switch also puts on Ruinous Star (gold 112158, chest; owner: the
  >= 110T build's core) and waits for its level.
- The known build's rares come one step at a time: the bare base (implicit at the midpoint of its rolls), ranked by its finished item (`Move.then`:
  base + one library craft per mod), then one craft per step; the item as the build rolled it is unpriced, listed with its gain. Its battle
  pactspirits (slots 1-3; slots 4-6 are drop pactspirits, loot only, not offered), slate board, hero memories, vorax limb (takes ring1) and talent
  prism (`prismOf`, put back after each talent re-fit) are farmed (0 FE); its skills come one group (skill + supports) per move, gems priced by name;
  groups and kismets that only pay together are also offered as one move. Hero trait tiers are not offered (budget not in the catalog).
  A legendary with a pooled key is a legendary (`goldOf`).
- A worn item that lowers the figure (Demon Slayer's Skin zeroes Hammer of Ash) can be swapped for the slot's best white base (`whiteBaseMoves`).
- Supports (`gemMoves`): every skill's sockets but Blink's, the main skill's from the SUP1 census, the others' (filled sockets only: the Energy that
  unlocks a socket is not read) through dps-debug's tag gate. A step that takes out a piece the model does not price (Grudge's paralysis) is refused, named with its gain.
- Advise prices every acquisition first (`nextBuys`: exact gain, `buy` = item x quantity) and writes it before the path; the page ranks it by
  the player's typed prices (etor's by default, kept in the browser, exported as `prices.json`).
- Cull sources the model does not count are named (`CULL_NOT_COUNTED` in `kill.ts`); corrosion is not offered (server-side odds).
- Unported rules are skipped and named in `notSearched`, never guessed.

## Invariants

1. dps-debug is the only calculator. No DPS math lives in this repo (`test/no-old-math.test.ts`).
2. Figures are never hand-written into docs or code; tests recompute them.
3. `guide.json` and `advice.json` are generated (`ideal`/`live`, `plan`/`advise`); never hand-edit.
4. Failing test first. A partial figure (dropped pieces / stop) is flagged, never ranked as complete.
