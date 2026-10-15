#!/usr/bin/env python3
"""Offline self-checks for the tli-build / tlidb-lookup skills.

Run: python .claude/skills/test_tli.py
Covers only the logic that bit us in practice; no network required.
"""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name, rel):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, rel))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


tb = load("tlibuild", "tli-build/tlibuild.py")
td = load("tlidb", "tlidb-lookup/tlidb.py")

# Game GUIDs are v5; ids the build mints for its own items are v4. Mixing them
# up makes equipped-slot refs look like unresolvable game data.
assert tb.is_game_guid("1a3e0c2c-aecd-5a05-8808-bd44324fb946")  # real hero guid
assert not tb.is_game_guid("d0cb9663-f56e-4eb3-a63d-aa41e3ad4542")  # v4, internal
assert not tb.is_game_guid("gear-1784086101849-ml25syq82")
assert not tb.is_game_guid(None)

# A build states its season as "SS12.5" but the API says "Season12_5"; bundles
# are keyed "SS12.5". All three must land on the same prefix.
assert tb.season_to_prefix("SS12.5") == "SS12.5"
assert tb.season_to_prefix("Season12_5") == "SS12.5"
assert tb.season_to_prefix("Season12") == "SS12"

# Resolution swaps game GUIDs for names, maps internal refs, leaves the rest.
index = {"1a3e0c2c-aecd-5a05-8808-bd44324fb946": {"name": "Rehan", "src": "hero"}}
internal = {"gear-1": "Grace Boots"}
stats = {"resolved": 0, "internal": 0, "unresolved": 0, "keys": 0}
got = tb.resolve(
    {
        "hero": "1a3e0c2c-aecd-5a05-8808-bd44324fb946",
        "boots": "gear-1",
        "ghost": "aaaaaaaa-bbbb-5ccc-dddd-eeeeeeeeeeee",
        "level": 20,
        "supports": [None, {"s": "1a3e0c2c-aecd-5a05-8808-bd44324fb946"}],
    },
    index,
    internal,
    stats,
)
assert got["hero"] == "Rehan", got["hero"]
assert got["boots"] == "gear-1", "non-GUID refs must pass through resolve untouched"
assert got["ghost"] == "aaaaaaaa-bbbb-5ccc-dddd-eeeeeeeeeeee"
assert got["level"] == 20
assert got["supports"][0] is None
assert got["supports"][1]["s"] == "Rehan"
assert stats["resolved"] == 2 and stats["unresolved"] == 1, stats

# Talent nodePoints are keyed by GUID and names repeat ("Micro Talent" x6 in one
# dict). Keys must survive as keys, with names exposed alongside -- renaming them
# would silently collapse distinct nodes into one.
dup = {"name": {"a1111111-1111-5111-1111-111111111111": {"name": "Micro Talent"},
                "a2222222-2222-5222-2222-222222222222": {"name": "Micro Talent"}}}
st2 = {"resolved": 0, "internal": 0, "unresolved": 0, "keys": 0}
nodes = tb.resolve(
    {"nodePoints": {k: 1 for k in dup["name"]} | {"b3333333-3333-5333-3333-333333333333": 2}},
    {k: {"name": v["name"], "src": "talent-tree"} for k, v in dup["name"].items()},
    {},
    st2,
)["nodePoints"]
assert len([k for k in nodes if k != "_names"]) == 3, "GUID keys must not collapse"
assert nodes["_names"]["a1111111-1111-5111-1111-111111111111"] == "Micro Talent"
assert len(nodes["_names"]) == 2 and st2["keys"] == 2
assert st2["unresolved"] == 1, "an unknown GUID key must be reported, not ignored"

# item_label prefers the human name; empty support slots must not crash.
assert tb.item_label({"displayName": "Grace Boots", "rarity": "Legendary"}) == "Grace Boots"
assert tb.item_label({"customName": "AS"}) == "AS"
assert tb.item_label({}) == "item"
assert tb.summarize({"name": "x", "loadouts": {"loadouts": [
    {"name": "L", "hero": {"heroId": "H", "traits": {}},
     "skills": {"activeSkills": [{"skillGuid": "S", "level": 1, "supports": [None]}]}}
]}})

# tlidb index slugs arrive pre-encoded; re-quoting "%3A" into "%253A" 404s.
assert td.SOURCES and "autocomplete_en.json" in td.SOURCES
assert "User-Agent" in td.UA and "User-Agent" in tb.UA, "both hosts 403 the default UA"
assert tb.API.startswith("https://api."), "the SPA origin serves HTML for /api/*"

print("ok - all offline checks passed")
