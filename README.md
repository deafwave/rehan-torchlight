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
- Guarded SS13 Bing evidence for converted normal and Demolisher-charged
  weapon-sourced Hammer hits, hero-trait tiers, and Blast Nova bomb/projectile
  emission outcomes. Emissions remain explicitly separate from target hits and
  DPS.
- Actor-scoped SS13 Wuxia evidence for Spirit Magus base stats, all eight
  Rock/Erosion action records, raw per-contact foundations, socket terms, Iris
  traits, summon count, conversion, and player Origin terms.
- Changed-only views for gear, skills, trees, memories, slates, and
  pactspirits.
- Typed player-defense inputs from equipped gear, memories, placed slates,
  prisms, kismets, hero traits, and supported skill effects. Only compatible
  unconditional source buckets are summed; they are not character totals or
  EHP.
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

Portable-v3 is currently a structural import only. The pinned `tli_dump`
converter still validates the document and reports exactly which records it
could materialize or had to omit, but its output is not passed to Bing, minion,
or defense formula compilers. Portable identities and planner metadata are
embedded in the uploaded file itself; treating them as formula inputs requires
independent verification against a pinned SS13 catalog. A complete serialized
`tli_dump` converter-result wrapper is classified the same way, so importing
its `.payload` cannot silently upgrade it into a trusted Compendium formula
source. A capture whose
`layoutCompatible` flag is false or whose process state is not `connected` is
also called out explicitly. Direct Compendium JSON remains user-supplied
planner state, not proof that a build came from an unmodified live capture.

Wuxia is also a minion build. Its source-pinned actor/action foundations are now
available, but complete actor-scoped modifier pools, quantity, Growth/Breeze
state, AI/uptime, overlap, and trait-enhancement selection still need a
dedicated rotation model rather than the player-hit formula.

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
`.portable` wrapper, a complete converter-result wrapper containing `.payload`,
and raw Compendium build JSON. Resolution stays local: the browser never
attaches to the game and only reads a file or text that the user explicitly
imports. Portable-v3, `.portable`, and complete converter-result inputs remain
structural/report-only until catalog attestation is implemented.

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

1. Compile Bing landed-hit geometry, component overlap, throwing cadence,
   Demolisher share, remaining modifier pools, and enemy state around the
   guarded hit/emission envelopes.
2. Compile Spirit Magus quantity, inherited modifier pools, AI/uptime, action
   selection, target overlap, and merged-state rotation around the guarded
   actor/action records.
3. Add stable source IDs to full formula trace factors and compare traces
   directly.
4. Turn the guarded player-defense inputs into physical, elemental, erosion,
   hit, and damage-over-time survival scenarios using live/base character
   pools.
5. Add constraint-based DPS/EHP recommendations after the comparison models are
   trustworthy.
