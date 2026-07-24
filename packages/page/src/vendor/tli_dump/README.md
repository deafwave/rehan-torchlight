# Vendored tli_dump Compendium converter

These two runtime files are copied byte-for-byte from the sibling poorchlight
repository at commit `7a765a8f6cd3a6522052b607026fd2f177e5cc2a`:

- `tli_dump/ui/compendium-export.mjs`
  - SHA-256: `f4ec95ee3b892299b5de5e1d6e16f2ef448b8c1b8c665afbd673788a9e60482d`
- `tli_dump/ui/dom.js`
  - SHA-256: `eaec9905bf17e30b9bdc8104ee0c4647712c98e8413b3661058dc89769187fb5`

The website uses this authoritative converter to validate portable-v3 and
retain its partial-aware inclusion/omission report. The converted payload is
deliberately **not** exposed to guarded formula compilers: catalog identities
and materialization metadata embedded in an uploaded portable file are not an
independent catalog attestation. A complete serialized converter-result wrapper
is likewise recognized as structural/report-only rather than being downgraded
to a raw Compendium import through its `.payload`. Do not hand-edit either
runtime file. Update them together from poorchlight, verify both hashes, and run
the real portable-fixture importer and trust-boundary regression tests.
