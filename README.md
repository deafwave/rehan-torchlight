# TLI Lens

TLI Lens is an import-first build comparison and damage-explanation tool for
Torchlight: Infinite.

The product goal is simple: when a player says “every upgrade lowered my
damage,” the site should show what changed, where it enters the formula, why the
new number is weaker, and which parts of the answer are still unsupported.

TLI Lens is a DPS improver, not a build planner. It does not try to reproduce
every planner control or let the user assemble an arbitrary character from
scratch. It starts from real before/after builds, teaches how their scaling
changed, and turns the strongest available evidence into controlled upgrade
experiments. Constraint-based optimization can come later, after the damage,
survival, legality, and cost contracts are trustworthy.

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
- A three-way comparison-context gate: proven progression, reference-only
  contrast, or incompatible pair. A user can explicitly confirm a same-character
  pair when patch, actor, archetype, and source family already agree but
  source-document lineage is unavailable.
- A proof-ranked experiment queue grouped into damage, survival, and unresolved
  build changes. Every card declares whether it is an observed result, modeled
  rollback, guarded formula slice, compiled source term, or structural lead,
  and carries its calculation boundary beside the proposed next test.
- A guarded in-game result form for aligned before/after DPS or damage-per-hit
  readings with an explicit whole-loadout or actor/skill scope. It compares only
  matching metrics, scopes, identities, targets, conditions, and sample setups
  that belong to both selected loadouts. Per-side confidence and source
  provenance remain separate, and conflicting shared metadata requires an
  explicit overwrite confirmation. The exact same loadout cannot be used as
  both sides, and observed outcomes are never relabeled as modeled attribution
  or converted from per-hit damage into DPS.
- Actor/skill/socket-scoped support comparison for player and minion actors,
  keeping duplicate support IDs distinct. A deterministic global assignment
  separates unchanged moves, moved-and-changed supports, same-socket
  replacements, and true additions or removals while consuming each instance
  once. Unsupported raw support type, level, tier, rank, and rolls remain
  visible instead of being silently treated as unchanged.
- Classification coverage, unsupported modifier text, assumptions, and honest
  “Not calculated” states.
- The supplied Bing and Wuxia progression files as structural fixtures.

The generated English display-name catalog has mixed provenance: cached
SS12.5 labels provide the baseline, then the compact SS13 catalog overlays
available skill and pactspirit labels. Display names are convenience text, not
identity or formula evidence. Guarded mechanics and catalog-backed defensive
terms remain separately pinned to their declared SS13 sources.

The checked-in teaching comparison uses a calibrated Bing snapshot to explain
why replacing a separately multiplying `additional` layer with a larger
`increased` roll can lower DPS. It is labeled as a teaching scenario and is not
presented as an imported character.

## How comparison advice is gated

The site separates resemblance from evidence that two snapshots are stages of
one character:

- **Progression** requires matching patch, actor, archetype, non-teaching source
  family, and lineage. Multiple loadouts from one imported document carry
  one collision-free session document token. Separate upload operations are
  not inferred to share lineage from matching names, IDs, bytes, or compact
  fingerprints. If lineage alone is missing, the user may explicitly confirm
  that the otherwise compatible pair is the same character for the current
  browser session.
- **Reference** comparisons can still expose raw differences, but do not call
  them upgrades, regressions, or rollbacks. Teaching scenarios, different
  archetypes, unresolved identities, different source families, and unrelated
  documents stay in this mode.
- **Incompatible** pairs have a known patch or actor mismatch. The action queue
  emits no ranked change advice until a compatible pair is selected.

For the calibrated teaching model, the diagnosis waterfall replays changed
formula groups in a fixed order from the before-state. Its rows reconcile to
the final delta, but an individual row's attribution can change when the order
changes. Suggested modeled checks use a different calculation: start from the
after-state and restore one complete formula layer from before, one layer at a
time. Those rollback evaluations are independent of display order, but they can
overlap, need not sum to the net change, and do not prove that the grouped edit
is legal or independently reversible in game.

Imported Bing and Wuxia results remain partial. The Bing factor ledger composes
only factors proven to apply to a selected Hammer hit component and condition;
source-visible projectile emissions stay in a separate lane and are never
multiplied into hit ratios. The Wuxia envelope multiplies the source-pinned
Spirit Magus actor/action foundation by confirmed unconditional factors and
reports known unmitigated damage per contact (or deterministic contacts where
the source proves them). Neither result is total hit damage or DPS. Player
defense comparisons likewise report typed source inputs, not character totals
or EHP.

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
cargo run --manifest-path ..\poorchlight\tli_dump\Cargo.toml --bin tli_dump -- --portable-json
```

TLI Lens accepts the direct portable-v3 document, the Tauri GUI snapshot's
`.portable` wrapper, a complete converter-result wrapper containing `.payload`,
and raw Compendium build JSON. Resolution stays local: the browser never
attaches to the game and only reads a file or text that the user explicitly
imports. Portable-v3, `.portable`, and complete converter-result inputs remain
structural/report-only until catalog attestation is implemented.

## Developer commands

```bash
pnpm install
pnpm demo                                      # regenerate fixture analysis
pnpm test                                      # damage/import/comparison tests
pnpm --filter @rehan/dmg typecheck
pnpm --filter @rehan/page exec tsc --noEmit
pnpm build                                     # page typecheck + production bundle
pnpm dev
```

`pnpm demo` reads every Compendium export in `data/builds/` and rewrites the
checked-in comparison fixture used by the site (Supported tab). Regenerate it
whenever an import or evidence contract changes.

Production hosting is configured at the repository root with `vercel.json`.
Vercel should use the repository root, run `pnpm build`, and publish
`packages/page/dist`. After the one-time `vercel login` and `vercel link`,
publish with `vercel deploy --prod`.

The existing calculation packages remain under `packages/dmg/`; the comparison
website is under `packages/page/`. See
[docs/architecture.md](docs/architecture.md) for the current data flow,
comparison semantics, and the contracts needed by the eventual optimizer.

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
5. Attest portable actor, skill, socket, and catalog identities against a
   pinned patch before portable imports can enter formula compilers.
6. Add MiniZinc-backed DPS/EHP recommendations only after legal mutations,
   costs, complete objective scenarios, and uncertainty boundaries have stable
   contracts.
