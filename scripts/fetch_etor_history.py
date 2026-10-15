"""Early-season prices from ETOR (mechanics.md#bing-prices).

For every priced item in the guide's categories, read the full-season daily chart
(/api/chart/{season}/{id}?interval=1d — the finer 15m/1h/3h charts only keep recent
weeks) and keep the opening-week prices a fresh league actually pays.

usage: python -I scripts/fetch_etor_history.py [season=1501]
writes data/etor/history_<season>.json
"""
import json, sys, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = "https://etor-beta.710421059.xyz/etor-api/api"
HEADERS = {"accept": "application/json, text/plain, */*", "x-frontend-version": "1.0.6.2",
           "Referer": "https://etor-beta.710421059.xyz/prices",
           "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36"}
CATEGORIES = ("Legendary Gear", "Core Organ", "Ember", "Fossil", "Ethereal Prism", "Support Skill",
              "Magnificent Support Skill", "Noble Support Skill", "Fate", "Divinity Pact",
              "Nether King's Divinity", "Revival Material", "Fluorescent Memory", "Memory Thread",
              "Corrosion Material", "Vorax Amputated Limb", "Active Skill", "Passive Skill")
DAY = 86_400_000


def get(path: str):
    req = urllib.request.Request(API + path, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def summarize(trend):
    if not trend:
        return None
    t0 = trend[0]["timestamp"]
    window = lambda a, b: [p["price"] for p in trend if t0 + a * DAY <= p["timestamp"] < t0 + b * DAY]
    avg = lambda xs: round(sum(xs) / len(xs), 4) if xs else None
    return {"firstDay": time.strftime("%Y-%m-%d", time.gmtime(t0 / 1000)),
            "day1": avg(window(0, 1)), "days1to3": avg(window(0, 3)), "week1": avg(window(0, 7)),
            "week2": avg(window(7, 14)), "last": trend[-1]["price"],
            "daily": [[p["timestamp"], p["price"], p["minPrice"], p["maxPrice"]] for p in trend]}


def main(season: str) -> None:
    index = json.loads((ROOT / f"data/etor/items_{season}.json").read_text(encoding="utf-8"))["items"]
    wanted = [i for i in index if i["price"] is not None and i["category"].startswith(CATEGORIES)]
    out = {}
    for n, item in enumerate(wanted, 1):
        try:
            out[item["id"]] = {"name": item["name"], "category": item["category"],
                               **(summarize(get(f"/chart/{season}/{item['id']}?interval=1d").get("trend")) or {})}
        except Exception as e:  # keep going; a missing chart is recorded, not fatal
            out[item["id"]] = {"name": item["name"], "category": item["category"], "error": str(e)}
        if n % 50 == 0:
            print(f"{n}/{len(wanted)}", flush=True)
        time.sleep(0.5)
    dest = ROOT / f"data/etor/history_{season}.json"
    dest.write_text(json.dumps({"seasonId": season, "currency": "FE", "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                                "items": out}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(out)} items -> {dest}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "1501")
