# TLI Lens

TLI Lens is an import-first build comparison and damage-explanation tool for
Torchlight: Infinite.

The product goal is simple: when a player says “every upgrade lowered my
damage,” the site should show what changed, where it enters the formula, why the
new number is weaker, and which parts of the answer are still unsupported.

The first web slice includes:

- Before/after loadout selection across multi-loadout build files.
- Local import for TLI Compendium JSON and `tli_dump` portable-v3 snapshots.
- Explicit handling for in-game build codes that still require a local
  `tli_dump` resolver.
- Exact formula replay and a reconciled damage-layer waterfall for guarded
  snapshots.
- Changed-only views for gear, skills, trees, memories, slates, and
  pactspirits.
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
website keeps real Bing and Wuxia loadouts fully inspectable while leaving DPS
unavailable until a hero/skill-specific compiler is ready.

Wuxia is also a minion build. Minion base actions, quantity, actor-scoped
modifiers, AI/uptime, and several trait mechanics need their own model rather
than the player-hit formula.

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

1. Introduce a canonical, season-versioned build schema with source provenance.
2. Split the parser into pure catalog-driven classification plus guarded
   hero/skill compilers.
3. Add stable source IDs to formula trace factors and compare traces directly.
4. Build physical, elemental, erosion, and DoT survival scenarios.
5. Add constraint-based DPS/EHP recommendations after the comparison models are
   trustworthy.
