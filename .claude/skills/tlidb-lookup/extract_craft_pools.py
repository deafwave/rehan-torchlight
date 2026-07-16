"""Scrape tlidb.com/en/Craft into data/craft_pools.json:
"<Gear Type>|<normalized affix template>" -> basic | advanced | ultimate.

The page is server-rendered; rows look like
  <tr><td><span data-modifier-id="..">DESC</span> <i ..></i></td><td>TYPE</td><td>POOL</td></tr>
Only the six ember pools are kept. Re-run after a season patch: python extract_craft_pools.py
"""
import html
import json
import pathlib
import re
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "data" / "craft_pools.json"
POOLS = {"Basic Pre-fix": "basic", "Advanced Pre-fix": "advanced", "Ultimate Pre-fix": "ultimate",
         "Basic Suffix": "basic", "Advanced Suffix": "advanced", "Ultimate Suffix": "ultimate"}


def norm(desc: str) -> str:
    s = re.sub(r"<[^>]+>", " ", desc)
    s = html.unescape(s)
    s = re.sub(r"\(\d+(?:\.\d+)?\s*[–-]\s*\d+(?:\.\d+)?\)", "#", s)
    s = re.sub(r"\d+(?:\.\d+)?", "#", s)
    s = re.sub(r"[+-]\s*#", "#", s)
    s = re.sub(r"#\s*%", "#%", s)
    return re.sub(r"\s+", " ", s).strip()


def main() -> None:
    req = urllib.request.Request("https://tlidb.com/en/Craft",
                                 headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    page = urllib.request.urlopen(req).read().decode("utf-8")
    rows = re.findall(r'<tr><td><span data-modifier-id="\d+">(.*?)</span>\s*<i[^>]*></i>'
                      r"</td><td>([^<]*)</td><td>([^<]*)</td></tr>", page, re.S)
    out, conflicts = {}, []
    for desc, gtype, pool in rows:
        p = POOLS.get(pool)
        if not p:
            continue
        key = f"{gtype}|{norm(desc)}"
        if out.get(key, p) != p:
            conflicts.append(key)
        out[key] = p
    assert rows and not conflicts, (len(rows), conflicts[:5])
    out["_source"] = "tlidb.com/en/Craft — ember craft pools; regenerate with extract_craft_pools.py"
    OUT.write_text(json.dumps(out, indent=0, sort_keys=True, ensure_ascii=False), encoding="utf-8")
    print(f"{len(out) - 1} pool entries -> {OUT}")


if __name__ == "__main__":
    main()
