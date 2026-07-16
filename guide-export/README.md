# guide-export — Rehan2 Guide spreadsheet section

One-shot export for the `Rehan2 Guide` tab of `Torchlight Sanity Retention.xlsx`.
**Do not hand-edit the TSV** — every ΔDPS number is looked up from
`packages/page/src/data/*.json`. After any model change: `pnpm page`, then
`python -X utf8 build_guide_export.py`.

## Pasting into Excel

1. In the sheet, **clear the old contents of A152:C280** (the export replaces the
   old scattered gate rows at 169-174, 200, 206; the leftover Timemark rows at
   257-274 are superseded by the new rows 205-208 — clear or keep as reference).
2. Open `spectral-slash-guide.tsv` in a text editor, Select All, Copy.
3. Select cell **A152**, paste. Multi-line cells arrive intact (quoted fields).
4. Add screenshots from `picture-callouts.md` to the right of each named row.

Output spans rows **152-208**: swap setup → standing watchlist → 1B/8-0 i86 core
→ slate priority → Traveler 8 armor → 200B priceless → Fervor engine → Timemark 8.
