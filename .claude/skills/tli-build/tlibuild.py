#!/usr/bin/env python3
"""Decode a Torchlight Infinite build (tlicompendium) and resolve its GUIDs.

Input is either a share code from a build-planner URL or a local exported
build .json. Output is the build with every game GUID replaced by its name.
"""
import argparse
import glob
import json
import os
import re
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
# The SPA host serves HTML for /api/*; the real API is a separate origin.
API = "https://api.tlicompendium.com/api"
SITE = "https://tlicompendium.com"
# Both hosts 403 the default urllib User-Agent.
UA = {"User-Agent": "Mozilla/5.0 (compatible; tli-skill/1.0)"}

GUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
NAME_KEYS = [
    "name",
    "characterName",
    "rawText",
    "normalRawText",
    "label",
    "title",
    "displayName",
    "text",
    "description",
]


def fetch(url, timeout=90):
    return urllib.request.urlopen(
        urllib.request.Request(url, headers=UA), timeout=timeout
    ).read()


def is_game_guid(s):
    """Game GUIDs are deterministic v5; build-internal ids are random v4."""
    return isinstance(s, str) and bool(GUID.match(s)) and s[14] != "4"


def season_to_prefix(season):
    """'Season12_5' / 'SS12.5' / '12.5' -> the 'SS12.5' bundle prefix."""
    s = str(season).replace("Season", "").replace("SS", "").replace("_", ".").strip()
    return "SS" + s


def get_shared_build(code):
    try:
        meta = json.loads(fetch(f"{API}/SharedBuild/{code}"))
    except urllib.error.HTTPError as e:
        raise SystemExit(f"share code {code!r}: HTTP {e.code} from {API}")
    try:
        import lzstring
    except ImportError:
        raise SystemExit("needs lzstring: python -m pip install lzstring")
    raw = lzstring.LZString().decompressFromEncodedURIComponent(meta["compressedData"])
    if not raw:
        raise SystemExit("lz-string decompression failed")
    build = json.loads(raw)
    build.setdefault("season", meta.get("season"))
    return build


def load_build(src):
    if os.path.exists(src):
        with open(src, encoding="utf-8") as f:
            return json.load(f)
    return get_shared_build(src)


def bundle_names(prefix, lang="en", refresh=False):
    """Download every dataset bundle for a season into cache/."""
    os.makedirs(CACHE, exist_ok=True)
    mpath = os.path.join(CACHE, "manifest.json")
    if refresh or not os.path.exists(mpath):
        with open(mpath, "wb") as f:
            f.write(fetch(f"{SITE}/data-bundles/manifest.json"))
    with open(mpath, encoding="utf-8") as f:
        manifest = json.load(f)

    want = [
        k
        for k in manifest["bundles"]
        if k.startswith(prefix + "-") and k.endswith("-" + lang)
    ]
    if not want:
        seasons = sorted({k.split("-")[0] for k in manifest["bundles"]})
        raise SystemExit(f"no bundles for {prefix!r}; available seasons: {seasons}")
    paths = []
    for key in want:
        p = os.path.join(CACHE, key + ".json")
        if refresh or not os.path.exists(p):
            with open(p, "wb") as f:
                f.write(fetch(SITE + manifest["bundles"][key]["path"]))
        paths.append(p)
    return paths


def build_index(prefix, lang="en", refresh=False):
    """Map every game GUID in a season's bundles to a display name."""
    ipath = os.path.join(CACHE, f"guid-index-{prefix}-{lang}.json")
    if os.path.exists(ipath) and not refresh:
        with open(ipath, encoding="utf-8") as f:
            return json.load(f)

    index = {}

    def name_of(d):
        for k in NAME_KEYS:
            v = d.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()[:120]
        return None

    def harvest(node, src):
        if isinstance(node, dict):
            for k, v in node.items():
                if isinstance(v, dict) and is_game_guid(k):
                    nm = name_of(v)
                    if nm:
                        index.setdefault(k, {"name": nm, "src": src})
            for field in ("id", "guid"):
                g = node.get(field)
                if is_game_guid(g):
                    nm = name_of(node)
                    if nm:
                        index.setdefault(g, {"name": nm, "src": src})
            for v in node.values():
                harvest(v, src)
        elif isinstance(node, list):
            for v in node:
                harvest(v, src)

    for p in bundle_names(prefix, lang, refresh):
        if os.path.getsize(p) == 0:
            continue
        src = os.path.basename(p).replace(prefix + "-", "").replace(f"-{lang}.json", "")
        with open(p, encoding="utf-8") as f:
            harvest(json.load(f), src)
    with open(ipath, "w", encoding="utf-8") as f:
        json.dump(index, f)
    return index


def resolve(node, index, internal, stats):
    """Replace game GUIDs with names; map internal refs to their item label."""
    if isinstance(node, dict):
        out = {k: resolve(v, index, internal, stats) for k, v in node.items()}
        # GUID *keys* (skillTree nodePoints) must stay keys: 6 distinct nodes in
        # one dict can share the name "Micro Talent", so renaming would collapse
        # them. Attach a lookup sibling instead.
        names = {}
        for k in node:
            if not is_game_guid(k):
                continue
            if k in index:
                names[k] = index[k]["name"]
            else:
                stats["unresolved"] += 1
        if names:
            stats["keys"] += len(names)
            out.setdefault("_names", names)
        return out
    if isinstance(node, list):
        return [resolve(v, index, internal, stats) for v in node]
    if isinstance(node, str) and GUID.match(node):
        if node in index:
            stats["resolved"] += 1
            return index[node]["name"]
        if node in internal:
            stats["internal"] += 1
            return internal[node]
        stats["unresolved"] += 1
    return node


def item_label(item):
    for k in ("displayName", "customName", "name", "baseName", "memoryType"):
        v = item.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    for k in ("shapeId", "type", "gearCategory"):
        if item.get(k):
            return " ".join(str(item[k2]) for k2 in ("god", k) if item.get(k2))
    return "item"


def internal_labels(build):
    """Equipped slots hold ids of the build's own inventory entries, not GUIDs."""
    out = {}
    for lo in build.get("loadouts", {}).get("loadouts", []):
        for section in lo.values():
            if isinstance(section, dict):
                for item in section.get("inventory") or []:
                    if isinstance(item, dict) and isinstance(item.get("id"), str):
                        out[item["id"]] = item_label(item)
    return out


def summarize(build):
    out = [f'{build.get("name")}  (patch {build.get("patch")})']
    refs = internal_labels(build)
    for lo in build.get("loadouts", {}).get("loadouts", []):
        hero = lo.get("hero") or {}
        out.append(f'\n## {lo.get("name")}')
        out.append(f'  hero: {hero.get("heroId")}')
        for lvl, tr in (hero.get("traits") or {}).items():
            out.append(f"    {lvl:8} {tr}")

        for sk in (lo.get("skills") or {}).get("activeSkills") or []:
            sup = ", ".join(
                s.get("supportGuid", "?")
                for s in sk.get("supports") or []
                if isinstance(s, dict)
            )
            flag = "" if sk.get("enabled", True) else " (disabled)"
            out.append(f'  skill: {sk.get("skillGuid")} L{sk.get("level")}{flag}')
            if sup:
                out.append(f"    + {sup}")

        eq = (lo.get("gear") or {}).get("equipped") or {}
        for slot, ref in eq.items():
            if ref:
                out.append(f"  {slot:9}: {refs.get(ref, ref)}")

        for p in lo.get("pactspirits") or []:
            n = len(p.get("allocatedNodes") or [])
            out.append(f'  pactspirit: {p.get("guid")} L{p.get("level")} ({n} nodes)')

        slots = (lo.get("skillTree") or {}).get("slots") or {}
        if slots:
            out.append(f"  talent trees: {len(slots)}")
        div = (lo.get("divinity") or {}).get("inventory") or []
        if div:
            out.append(f"  divinity slates: {len(div)}")
    return "\n".join(out)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("source", help="share code, or path to an exported build .json")
    p.add_argument("--lang", default="en")
    p.add_argument("--season", help="override season, e.g. SS12.5")
    p.add_argument("--raw", action="store_true", help="skip resolution")
    p.add_argument("--summary", action="store_true", help="human summary")
    p.add_argument("--loadout", type=int, help="only this loadout index")
    p.add_argument("--refresh", action="store_true", help="re-download bundles")
    p.add_argument("-o", "--out", help="write JSON here instead of stdout")
    a = p.parse_args()

    build = load_build(a.source)
    if not a.raw:
        prefix = season_to_prefix(a.season or build.get("patch") or build.get("season"))
        index = build_index(prefix, a.lang, a.refresh)
        stats = {"resolved": 0, "internal": 0, "unresolved": 0, "keys": 0}
        build = resolve(build, index, internal_labels(build), stats)
        print(
            f'[{prefix}] index={len(index)} resolved={stats["resolved"]} '
            f'keys={stats["keys"]} internal={stats["internal"]} '
            f'unresolved={stats["unresolved"]}',
            file=sys.stderr,
        )

    if a.loadout is not None:
        los = build["loadouts"]["loadouts"]
        build["loadouts"]["loadouts"] = [los[a.loadout]]

    if a.summary:
        print(summarize(build))
        return 0
    text = json.dumps(build, indent=2, ensure_ascii=False)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"wrote {a.out} ({len(text)//1024} KB)", file=sys.stderr)
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
