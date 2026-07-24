# TLI Lens architecture and contracts

TLI Lens is an import-first DPS improver. Its primary unit of work is a
before/after comparison, not a blank build-planner canvas. The product should
answer three questions in order:

1. Are these two loadouts safe to describe as one character's progression?
2. Which changed inputs can the current source and formula coverage prove?
3. What single change should the player test next?

The system fails closed when it cannot answer one of those questions. Missing
mechanics are surfaced as blockers instead of being treated as zero.

## Current data flow

1. **Import boundary** accepts TLI Compendium JSON, supported `tli_dump`
   portable wrappers, or an in-game build code.
2. **Normalization** turns supported documents into build/loadout records with
   patch, actor, skill, equipment, tree, memory, slate, prism, kismet, trait,
   and socket structure.
3. **Guarded compilers** opt specific season/actor/skill shapes into formula
   evidence. Unsupported shapes return typed blockers; the legacy Rehan model
   is never used as a generic fallback.
4. **Page adapters** convert compiler results into actor-scoped display
   contracts without changing their calculation status.
5. **Comparison context** classifies the selected pair as `progression`,
   `reference`, or `incompatible`.
6. **Comparison analysis** combines aligned user observations with modeled,
   guarded-partial, source-term, and structural findings plus a blocker ledger.
7. **Presentation** groups the ranked findings into damage, survival, and build
   experiments and keeps formula coverage visible beside them.

The main contracts live in:

- `packages/page/src/analysis-types.ts` for normalized page-facing evidence;
- `packages/page/src/comparison-context.ts` for progression safety;
- `packages/page/src/action-plan.ts` for ranked findings and blockers;
- `packages/dmg/src/` for source-pinned formula compilers; and
- `scripts/generate_demo_analysis.ts` for fixture generation from the supplied
  Bing and Wuxia build files.

## Import and build-code boundary

An in-game build string is an opaque `BDID` reference, not a serialized
character. The website cannot resolve it over HTTP. The player must open the
referenced character in Torchlight: Infinite and use local `tli_dump` capture,
then import the resulting JSON. The browser does not attach to the game
process.

Direct Compendium JSON can enter guarded SS13 compilers when its shape and
identities pass their checks. Portable-v3 and converter-result wrappers are
currently structural/report-only: validation proves the document contract, not
that every embedded identity maps to the pinned formula catalog. Portable
formula use therefore requires a separate catalog-attestation contract.

English display labels are a mixed-provenance presentation aid: cached SS12.5
bundles provide the baseline and available SS13 skill and pactspirit labels are
overlaid from the compact catalog. Labels never establish identity or formula
coverage. Each guarded compiler retains its own explicit SS13 source and
version checks.

## Comparison context

Labels and loadout names are never treated as identity. The context contract
uses patch, actor ID, archetype ID, source family, and a source-document
lineage:

| Mode | Meaning | Advice behavior |
|---|---|---|
| `progression` | Patch, actor, archetype, non-teaching source family, and lineage match. | Causal before/after language and controlled experiments are allowed. |
| `reference` | The pair is useful for contrast but does not prove one character's history. | Raw differences remain visible; causal and rollback language is withheld. |
| `incompatible` | A known patch or actor mismatch exists. | No ranked change advice is emitted. |

Loadouts from the same import operation share one collision-free session
document token. A separate upload receives a different token even when its
name, source ID, bytes, or compact structural fingerprint match; identical
content is not proof of shared character history. When all other progression
fields match but lineage is missing, the interface can accept an explicit
same-character confirmation for the current browser session. Confirmation
supplies history; it does not override a patch, actor, archetype, or
source-family mismatch.

## Evidence and action groups

Action findings are ranked by what their proof can support, not by pretending
every change has a comparable score:

| Proof class | What it proves | What it does not prove |
|---|---|---|
| Observed result | Direction and magnitude for the same user-declared metric, actor, skill, target, conditions, and sample setup. | Which build edit caused the result, or any conversion from damage per hit to DPS. |
| Modeled rollback | One complete formula layer restored into the after-state in one fixed shared scenario. | An observed result, a legal in-game edit, or an independently additive attribution. |
| Guarded formula slice | Source-backed arithmetic for a supported hit, emission, actor/action, or conditional component. | Total hit damage, landed contacts, rotation, or DPS. |
| Compiled source term | Exact input text/value and actor scope. | Its complete runtime contribution or net DPS/EHP direction. |
| Structural lead | A concrete changed entity worth isolating. | Numeric magnitude or direction. |

The interface groups these proofs by player decision: damage changes and
drivers, survival tradeoffs, and build changes that still need isolation.
Blockers are a parallel first-class output and retain before/after scope and
source evidence.

## Modeled diagnosis versus rollback evaluation

The calibrated teaching snapshot has two deliberately different analyses:

- The **waterfall diagnosis** starts from the before-state and replaces formula
  groups in a fixed order. Its rows exactly reconcile losses and gains to the
  modeled net delta. Individual row attribution is order-dependent.
- A **rollback evaluation** starts from the complete after-state and restores
  exactly one complete formula group from before. Every group is evaluated
  against the same after-state, so display order cannot change that result.

Rollback evaluations can overlap and should not be summed. A grouped layer can
also contain coupled fields that cannot be independently changed in game.
Both analyses are fixed-scenario model outputs, not measurements of a live
character.

## Current guarded formula slices

### Bing

The SS13 Bing compiler exposes the weapon-sourced Hammer foundation, supported
intrinsic conversion and Demolisher charge terms, hero-trait emission topology,
and a component-scoped factor ledger. The supplied loadouts 5 → 6 demonstrate:

- weapon foundation `4,832.4978 → 4,761.207`;
- stationary Sierra factor `×1.96 → ×2.18`;
- Slow Projectile factor `×1.29 → ×1.27`;
- explosion-only Upheaval factor `×1.37 → ×1.46`; and
- source-visible emissions `18.9 → 13.5` per throw.

The first four values can be composed only for the hit components and
stationary conditions to which they apply. Emissions are a separate lane:
emitted projectiles do not establish target contacts, overlap, cadence, or DPS
and are never multiplied into those component ratios.

### Wuxia

The SS13 Wuxia compiler keeps each Spirit Magus as its own actor, exposes all
source-pinned action rows, and starts with:

`raw damage per contact = actor base damage × action coefficient / 100`

The known envelope then multiplies only confirmed unconditional additional
factors from supported sockets and selected Iris traits. In the supplied
`15T` → `15T SS20` Erosion comparison, Malady's rolled factor changes by
`1.26 / 1.22 = 1.032786…`; known Scattered Mud moves from `263.52` to `272.16`
per contact.

This is known unmitigated component damage, not a minion hit total or DPS.
Uncompiled sockets, inherited pools, AI action choice, Growth/Breeze and merge
state, summon quantity, target mitigation, overlap, and uptime remain outside
the envelope. Malformed, unsupported, or duplicated damage-factor sockets are
withheld from the factor product and retained as typed exclusions, while valid
foundations and unrelated confirmed factors remain visible. A numeric
before/after action comparison is emitted only when both sides have the same
known-damage status and the same order-independent exclusion fingerprint. A
newly ambiguous socket therefore cannot masquerade as a damage loss.

### Player defense

The defense compiler emits typed, actor-scoped source terms and compatible
unconditional source sums. An absent compiled bucket means zero input from
that compiled source set; it does not mean the character has zero armor, life,
resistance, block, or Energy Shield.

EHP remains unavailable until the model has source-complete base pools, actual
caps and totals, ordered mitigation, avoidance, recovery windows, conditional
state, and declared incoming hit and damage-over-time scenarios.

## Identity and observed-measurement seams

Player and minion support evidence carry `actorId`, `skillId`, `socketIndex`,
and `socketId`. The page globally assigns support instances within one
actor/skill scope: exact same-socket instances first, then unchanged moves,
moved-and-changed instances, residual same-socket replacements, and finally
true additions or removals. Each instance is consumed once, so duplicate
support IDs remain separate and reciprocal reorders do not become fake
replacements. Finding references are participant-specific, so a moved instance
and a residual replacement do not suppress one another. Unsupported supports
retain bounded, normalized, control-free raw type, level, tier, rank, and roll
metadata so configuration changes remain visible even without guarded formula
coverage. Lossy sanitization receives a unique comparison token and therefore
cannot masquerade as confidently unchanged. Minion actor and skill IDs are
currently anchored to the parent summon-skill identity rather than display
labels. This is a working local identity contract, not proof that all portable
records or all game systems are catalog-attested.

The Next actions workspace accepts a before/after in-game DPS or damage-per-hit
observation with an explicit `whole-loadout` or `actor-skill` scope. Parsing
supports K/M/B/T suffixes, per-side provenance and confidence, conditions, and
an optional DPS sample duration. Observed values remain separate from modeled
values and produce a delta only when scope, metric, actor, skill, and scenario
fingerprint align. The declared identity must also resolve on both selected
loadouts as either the imported actor/archetype scope or a compiled model,
support, summon, or summon-action actor/skill scope; arbitrary matching free
text and unrelated enabled utility skills are rejected. The same loadout object
cannot be compared to itself. A valid whole-loadout DPS result establishes the
total outcome but not attribution; actor/skill DPS remains a scoped result and
cannot establish net build DPS. When an observation falls while a guarded
component rises, the action plan explains that both facts can coexist and
proposes an isolation test. Actor/skill observations reconcile only guarded
findings in that scope, and the site never scales a partial component into the
observed total. One-sided optional metadata is preserved; conflicting shared
metadata requires explicit confirmation before either side is overwritten.
The entry is session-local and is not written back into an imported build.

## Contracts needed next

| Contract | Required fields | Unlocks |
|---|---|---|
| Catalog attestation | Patch/catalog hash, native and canonical actor/skill/socket IDs, provenance, validation status. | Portable input entering guarded compilers without identity guessing. |
| Damage component | Actor, skill/action, damage tags, foundation, ordered factors, conditions, target state, geometry, cadence, uptime, provenance, excluded terms. | Comparable full hit/rotation traces and reliable DPS deltas. |
| Survival scenario | Player pools, caps/totals, incoming damage type and size, hit/DoT basis, ordered mitigation, avoidance, recovery window, conditional uptime. | Scenario-specific EHP and survival tradeoffs. |
| Legal mutation | Stable entity/slot ID, before/after values, requirements, exclusivity, resource and currency cost, availability, patch. | Upgrade suggestions that can actually be performed. |
| Optimization objective | DPS/EHP scenarios, minimum constraints, budget, uncertainty policy, allowed mutation set, evidence version. | A reproducible MiniZinc search rather than unconstrained item scoring. |
| Observed measurement | Scope, metric, value, actor, skill, target/scenario fingerprint, sample duration, conditions, confidence, source. | Calibration and regression checks without treating player reports as model truth. |

MiniZinc belongs after these contracts. The optimizer should search legal
mutations against explicit DPS and EHP scenarios, preserve uncertainty and
proof boundaries in every recommendation, and return a reproducible experiment
set rather than a context-free “best build.”

## Developer verification

```bash
pnpm demo
pnpm test
pnpm --filter @rehan/dmg typecheck
pnpm --filter @rehan/page exec tsc --noEmit
pnpm build
```

`pnpm demo` regenerates `packages/page/src/data/demo-builds.json` from
`data/builds/*.json`. Run it whenever import, evidence,
or comparison contracts change, then review the generated diff before
committing it.
