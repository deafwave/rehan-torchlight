# TLI Lens

Torchlight: Infinite build-progression guide. `packages/guide` drives the **dps-debug** calculator
(pinned checkout, read-only) over a hero state and writes `packages/page/src/data/guide.json`;
the Vite page (`packages/page`) renders it. Nothing on the page is typed in by hand.

## The pin

`@dps/*` resolves to `<tli>/dps-debug/.worktrees/tli-lens-pin/model/*` (a detached, locked worktree of dps-debug), now dps-debug main a0938487
(MANA2: every Hammer of Ash figure carries the auras' Sealed Mana fit; on top of TANGO1, SHOT2, MANA1, SLP-B, IGN0, OH1, SEA1). Checked by tli-lens 285 / 285 with
GUIDE_REAL=1. dps-debug's own guide gates (`GUIDE_GATES=1`, model/guide/) are red on main since the ungated SEA1 merges (10 failures: figure.test (a) / (b), cull-figure,
iceshot-figure, perf; the season catalog moved the figures off last season's captures): re-baseline them before trusting a bit-equal claim. tsconfig paths + vitest
alias; env `DPS_DEBUG_PIN` overrides, see `packages/guide/src/pin.ts`). Every output
records the pin commit and the memo key includes it. Never edit dps-debug from here. Refresh:
`git -C <pin> checkout --detach main`, `npm ci` in `model/` if its lockfile moved, then rerun dps-debug's guide gates
(`GUIDE_GATES=1`, tests in `model/guide/`).

## Layout

| Path | What |
|---|---|
| `packages/guide/src` | `types.ts` shared interfaces, `pin`, `pricing` + `priceOf` (etor), `candidates/*` (gear gems kismets memories pacts prisms slates switch talents target traits), `craft`, `patches`, `search`, `kill`, `engine/{pool,worker,apply,memo}`, `modes` (ideal/advise), `plan` (your character to a damage goal, cheapest first), `start` (start state, export import), `cli`, `atomic` |
| `packages/page` | Vite shell, single entry `index.html`, `src/main.ts` renders `src/data/advice.json` (your plan) |
| `data/`, `scripts/` | etor price history, affix library, craft pools; fetch/build helpers |
| `.claude/skills/` | `tli-game`, `tlidb-lookup`, `tli-build` |

## Commands

`pnpm guide plan [export.json] [--target traveler] [--goal 2e11] [--slate-fe N] [--prism-fe N]` (your character, read fresh from the running game, to a
damage goal at the least FE; writes `packages/page/src/data/advice.json`, the page's plan card) | `ideal [--live] | live [--every M] | advise <export.json> [--fe N] [--season N] | figure <loadout.json> [--skill hoa|iceShot] [--level N]`;
shared flags `--workers --bombs --roll-budget --budget-minutes --out` (advise: `--budget-minutes` defaults to 30); ideal / advise read your prices
(`prices.json` at the repository root when it exists, or `--prices <file>`: `{ "<item name>": FE }` over etor, `withPrices`). `pnpm dev` / `pnpm build` / `pnpm test`
(guide: `tsc --noEmit && vitest run`). `GUIDE_REAL=1` also runs real-figure tests; they and the pool pause while
the `game.busy` file exists (`DEFAULT_BUSY_FILE` in `engine/pool.ts`, env `GUIDE_BUSY_FILE`).

## Working rules (learned 2026-10-16)

- One session works in tli-lens at a time, and one in dps-debug. On 2026-10-16 three tli-lens sessions shared one working tree: one left uncommitted edits
  the others had to tiptoe around, and one moved the pin to an ungated commit that stopped two real-figure tests.
- The owner's plan comes from `pnpm guide plan` (or advise), never from a one-off `.cache` script writing advice.json. Those scripts made plans nobody could
  rerun, and they carried hand-typed assumptions: twelve 1-line slates on a board with room for none, a gem levelled that cannot level, Fixate added when it was
  already socketed.
- Read the character fresh before every plan (`plan` does). A plan from an old read is wrong advice.
- A rule of the game the owner states becomes code with a test (plan.ts RULES, test/plan.test.ts), not a chat promise.
- Stopping a background shell on Windows can leave its node process running (a stopped plan kept writing advice.json): check for `cli.ts` processes
  before a new run and kill the tree (`taskkill //F //T //PID n`).
- Pin only a commit whose tli-lens GUIDE_REAL gate is green. Write files with the repository's LF line endings: Python on Windows writes CRLF in text mode.

## Policies the code applies

- Fight inputs: 10 bombs, training dummy stands still. Ice Shot stated inputs (`ICE_SHOT_INPUTS`) are chosen, not measured.
- Roll budget: 4096 first (`FIRST_ROLL_BUDGET`: above it a price takes the affine closed form; 40 s -> 2.6 s on a Hammer of Ash figure); only a "not affine" stop retries at 1<<20.
- Market: `drop` costs 0 FE and is ranked; `not-on-market` and unpriced (costFE null) are listed under `unpriced`, never ranked.
- Churn gate 5 %. Talent points below L93 are assumed (scaled), noted on the step.
- Target: Hammer of Ash is priced against Cube 3 (`target` / `--target`, a dps-debug `BOSSES` key, `dummy` = the ground's dummy); Ice Shot, the
  levelling leg, on its dummy. Kill speed (`kill.ts`) = Life per second from 100 % down to the model's cull (CULL1; 0 when blocked), DPS at most the
  model's damage lock (CAP1, 1.5e13 per attacker per victim); time to kill = max Life / kill speed. Defense after the kill goal is not modelled.
- One enabler per step is re-solved: the best own figure, when it reaches `enablerFloor` (0.25) x the current kill average.
- Ideal prices: last season's etor history, day 1 for the Ice Shot leg and days 1-3 for Hammer of Ash (`LEG_WINDOWS`); `--live`: etor's live snapshot for
  both legs; `guide live` reruns that every M minutes (one warm evaluator) and commits + pushes guide.json.
- Hammer of Ash goes boss by boss (`BOSS_ORDER`: Cube 1, Keegan 2, Cube 2, Cube 3; knob `targets`): a leg moves on once its boss dies within
  `moveOnSeconds` (10); the last runs to the damage lock (the goal), the last stage taking up to `finalSteps`. Each leg is one page tab (`GuideOut.legs`).
  Advise starts on the first boss the character does not kill within `moveOnSeconds`, and by default prices the next-buys list only (`--steps N` adds a plan).
- The planned switch also puts on Ruinous Star (gold 112158, chest; the >= 110T build's core, user 2026-10-15). The known build's rares come one step at a time:
  the bare base (with its implicit, modifier type 1, at the midpoint of its rolls), ranked by its finished item (`Move.then`: base + one library craft per
  mod, total cost), then one craft per step; the item as the known build rolled it (tier 0, chip) is unpriced, listed with its gain. Its battle pactspirits (slots 1-3; drop pactspirits in 4-6 change loot, not damage: not offered), slate
  board, hero memories, vorax limb (it takes ring1) and talent prism (its mirrored talents and extra affixes in resolvedTalents, put back after each talent
  page re-fit, `prismOf`) are farmed (0 FE); its skills come one group (a skill and its supports) per move, gems priced by name; groups and kismets that only
  pay together are also offered as one move. Hero trait tiers are not offered (the tier budget is not in the catalog).
  A legendary with a pooled key (one of several groups) is a legendary (`goldOf`). A craft tier's text ranges match its rolls in any order.
- Ideal: the Ice Shot leg ends at `switchAt` (2e8): the Ice Shot -> Hammer of Ash switch follows at once, at that level (mid-stage too), or at
  the next stage start after a stage with no step. It is planned, not searched: the target build's talent page, trimmed to the level's points
  below its own (`trimPage`: deepest rows first, no rule broken the page did not break, a core dropped below its tree's need). Until the switch
  can be taken (a stop, a level gate) no Ice Shot upgrade is bought. Never a greedy step (its figure
  is against the boss, Ice Shot's the dummy); advise does not search it for an Ice Shot character. A worn item that lowers the figure (Demon Slayer's Skin
  zeroes Hammer of Ash) can be swapped for the slot's best white base, a free reconfiguration (`whiteBaseMoves`).
- Advise first prices every acquisition at the start (`nextBuys`: exact gain, priced or not, `buy` = item x quantity) and writes it before the path;
  the page ranks that list by the player's typed prices (etor's by default, kept in the browser, exported as `prices.json`).
- Cull sources CULL1 does not count are named (`CULL_NOT_COUNTED`: Machine Lord's helmet, Ill Omen); corrosion is not offered (server-side odds).
- Unported rules are skipped and named in `notSearched`, never guessed.

## Invariants

1. dps-debug is the only calculator. No DPS math lives in this repo.
2. Figures are never hand-written into docs or code; tests recompute them.
3. `src/data/guide.json` is generated by `pnpm guide ideal`; never hand-edit.
4. Failing test first. A partial figure (dropped pieces / stop) is flagged, never ranked as complete.
