"""Import the live gear-affix library (Torchlight_Affix_Review.xlsx, read from game memory)
into data/affix_library.json for the Bing guide (mechanics.md#bing-affix-map).

usage: python -I scripts/import_affix_library.py <path/to/Torchlight_Affix_Review.xlsx>
"""
import json, sys
from pathlib import Path
import openpyxl

HEADER = 6  # data rows start after the title block and the column header row


def rows(ws):
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i >= HEADER and any(c is not None for c in row):
            yield row


def main(xlsx: str) -> None:
    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    affixes = {}
    for slot, grade, side, effect, best, weight, affix_id, *_ in rows(wb["Affixes"]):
        affixes[(slot, str(affix_id))] = {"slot": slot, "grade": grade, "side": side, "affixId": str(affix_id),
                                          "weight": weight, "effect": effect, "tiers": []}
    for slot, grade, side, affix_id, tier, text, level, weight, tier_id, *_ in rows(wb["Tiers"]):
        affixes[(slot, str(affix_id))]["tiers"].append(
            {"tier": tier, "text": text, "requiredLevel": level, "weight": weight, "tierAffixId": str(tier_id)})
    out = sorted(affixes.values(), key=lambda a: (a["slot"], a["grade"], a["side"], a["affixId"]))
    dest = Path(__file__).resolve().parents[1] / "data" / "affix_library.json"
    body = ",\n".join(json.dumps(a, ensure_ascii=False, separators=(",", ":")) for a in out)
    dest.write_text('{"source":"Torchlight_Affix_Review.xlsx (live game memory)","affixes":[\n'
                    + body + "\n]}\n", encoding="utf-8", newline="\n")
    print(f"{len(out)} affixes, {sum(len(a['tiers']) for a in out)} tiers -> {dest}")


if __name__ == "__main__":
    main(sys.argv[1])
