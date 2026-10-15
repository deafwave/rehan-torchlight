#!/usr/bin/env python3
"""Look up Torchlight Infinite entities on tlidb.com.

tlidb.com is a server-rendered wiki with no JSON API. The only machine-readable
index is autocomplete_en.json; detail pages are HTML that we strip to text.
"""
import argparse
import html
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
# tlidb/tlicompendium 403 the default urllib User-Agent.
UA = {"User-Agent": "Mozilla/5.0 (compatible; tli-skill/1.0)"}
SOURCES = {
    "autocomplete_en.json": "https://tlidb.com/i18n/autocomplete_en.json",
    "en.json": "https://tlidb.com/i18n/en.json",
}


def fetch(url, timeout=60):
    return urllib.request.urlopen(
        urllib.request.Request(url, headers=UA), timeout=timeout
    ).read()


def cached(name, refresh=False):
    """Return parsed JSON for a cached i18n file, downloading if absent."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if refresh or not os.path.exists(path) or os.path.getsize(path) == 0:
        with open(path, "wb") as f:
            f.write(fetch(SOURCES[name]))
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def page_text(slug):
    # Index slugs arrive pre-encoded ("Precise%3A_Purify"); re-quoting them
    # yields %253A and a 404. Only encode a slug that is still raw.
    if not re.search(r"%[0-9A-Fa-f]{2}", slug):
        slug = urllib.parse.quote(slug)
    raw = fetch("https://tlidb.com/en/" + slug).decode("utf-8", "replace")
    body = re.sub(r"(?is)<(script|style|nav|footer|head)[^>]*>.*?</\1>", " ", raw)
    txt = html.unescape(re.sub(r"(?s)<[^>]+>", "\n", body))
    lines = [l.strip() for l in txt.split("\n")]
    return "\n".join(l for l in lines if l)


def cmd_search(args):
    idx = cached("autocomplete_en.json", args.refresh)
    q = args.query.lower()
    hits = [e for e in idx if q in e["label"].lower() or q in e["value"].lower()]
    if args.type:
        hits = [e for e in hits if e["desc"].lower() == args.type.lower()]
    hits.sort(key=lambda e: (e["label"].lower() != q, len(e["label"])))
    for e in hits[: args.limit]:
        print(f'{e["value"]}\t[{e["desc"]}]\t{e["label"]}')
    if not hits:
        print("no matches", file=sys.stderr)
        return 1
    return 0


def resolve_slug(slug, refresh=False):
    """Accept a slug or a human label and return the index's real 'value'."""
    idx = cached("autocomplete_en.json", refresh)
    for e in idx:
        if e["value"] == slug:
            return e["value"]
    want = slug.lower()
    for e in idx:
        if e["label"].lower() == want or e["value"].lower() == want:
            return e["value"]
    return slug


def cmd_get(args):
    slug = resolve_slug(args.slug, args.refresh)
    try:
        print(page_text(slug))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(
                f"no page for {slug!r}; try: tlidb.py search {args.slug!r}",
                file=sys.stderr,
            )
            return 1
        raise
    return 0


def cmd_types(args):
    import collections

    idx = cached("autocomplete_en.json", args.refresh)
    for desc, n in collections.Counter(e["desc"] for e in idx).most_common():
        print(f"{n:5d}  {desc}")
    return 0


def cmd_sync(args):
    for name in SOURCES:
        d = cached(name, refresh=True)
        print(f"{name}: {len(d)} entries -> {os.path.join(CACHE, name)}")
    return 0


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--refresh", action="store_true", help="re-download cached index")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("search", help="search the entity index")
    s.add_argument("query")
    s.add_argument("--type", help="filter by category, e.g. Skill, Legendary, Tip")
    s.add_argument("--limit", type=int, default=25)
    s.set_defaults(fn=cmd_search)

    g = sub.add_parser("get", help="fetch a wiki page as text")
    g.add_argument("slug", help="the 'value' field from search, e.g. Multistrike")
    g.set_defaults(fn=cmd_get)

    t = sub.add_parser("types", help="list categories and counts")
    t.set_defaults(fn=cmd_types)

    y = sub.add_parser("sync", help="(re)download both i18n files to cache/")
    y.set_defaults(fn=cmd_sync)

    a = p.parse_args()
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
