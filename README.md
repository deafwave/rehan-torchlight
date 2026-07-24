# TLI Lens

TLI Lens is an import-first build comparison and damage-explanation tool for
Torchlight: Infinite.

The product goal is simple: when a player says “every upgrade lowered my
damage,” the site should show what changed, where it enters the formula, why the
new number is weaker, and which parts of the answer are still unsupported.

The first web slice includes:

- Before/after loadout selection across multi-loadout build files.
- A canonical, version-aware import boundary for TLI Compendium JSON and
  `tli_dump` portable-v3 snapshots, with stable structural fingerprints and
  exact roll evidence (including roll-only support changes).
- Explicit handling for in-game build codes that still require a local
  `tli_dump` resolver.
- Exact formula replay and a reconciled damage-layer waterfall for guarded
  snapshots.
- Guarded SS13 Bing evidence for the equipped weapon contribution to one raw
  Hammer of Ash hit, plus exact support-skill source terms. Both are kept
  explicitly separate from total hit damage and DPS.
- Actor-scoped SS13 Wuxia evidence for Spirit Magus summon counts, tags,
  conversion, and player Origin terms without manufacturing minion DPS or EHP.
- Changed-only views for gear, skills, trees, memories, slates, and
  pactspirits.
- Defensive gear-line comparisons grouped by survival layer without collapsing
  unlike defenses into a fake EHP score.
- Classification coverage, unsupported modifier text, assumptions, and honest
  “Not calculated” states.
- The supplied Bing and Wuxia progression files as structural fixtures.

The checked-in teaching comparison uses a calibrated Bing snapshot to explain
why replacing a separately multiplying `additional` layer with a larger
`increased` roll can lower DPS. It is labeled as a teaching scenario and is not
presented as an imported character.

## Accuracy boundary

The existing damage engine began as a Rehan/Spectral Slash model. Its parser
currently starts from Rehan defaults and applies Rehan manual overrides, so
arbitrary imported loadouts must not be sent through it as a fallback. The
website keeps real Bing and Wuxia loadouts fully inspectable and only exposes
smaller formula terms where a season-, actor-, and skill-guarded compiler can
prove them. Full DPS remains unavailable for both supplied builds.

Wuxia is also a minion build. Minion base actions, quantity, actor-scoped
modifiers, AI/uptime, and several trait mechanics need their own model rather
than the player-hit formula.

## In-game build-code handoff

The shared in-game strings are opaque `BDID` references; they are not
self-contained build files. `tli_dump` also has no HTTP resolver or server
endpoint: it reads the currently open `ViewPlayerBDReference` (Pro Build /
Build Reference) page from the local game process.

To import one, open the code's build in Torchlight: Infinite, leave its
Character view open until `tli_dump` reports a ready capture, then use
**Copy TLI Compendium JSON** and paste that JSON into TLI Lens. Developers can
instead capture the same evidence contract with:

```powershell
cargo run -p tli_dump --bin tli_dump -- --portable-json
```

TLI Lens accepts the direct portable-v3 document, the Tauri GUI snapshot's
`.portable` wrapper, the converter's `.payload` wrapper, and raw Compendium
build JSON. Resolution stays local: the browser never attaches to the game and
only reads a file or text that the user explicitly imports.

## Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm demo     # regenerate local fixture analysis from ../bing_china.json and ../WuxiaSS13.json
```

The existing calculation packages remain under `packages/dmg/`; the comparison
website is under `packages/page/`.

## Next engineering slices

1. Complete the Bing Hammer of Ash hit/rotation compiler around the guarded
   weapon and support terms.
2. Add Spirit Magus actor actions, quantity, AI/uptime, and merged-state
   rotation to the Wuxia compiler.
3. Add stable source IDs to full formula trace factors and compare traces
   directly.
4. Build physical, elemental, erosion, and DoT survival scenarios.
5. Add constraint-based DPS/EHP recommendations after the comparison models are
   trustworthy.
