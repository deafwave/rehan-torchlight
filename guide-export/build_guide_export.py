# Generates the copy-pasteable spreadsheet section for the "Rehan2 Guide" tab
# (Torchlight Sanity Retention.xlsx) from the page's generated JSON.
# Every ΔDPS number is looked up, never typed. Rerun after `pnpm page`.
# Spec: docs/superpowers/specs/2026-07-16-spectral-slash-sectional-guide-design.md
import csv, io, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "packages/page/src/data"
OUT = Path(__file__).resolve().parent
PASTE_ROW = 152  # first sheet row the TSV lands on

ladder = json.loads((DATA / "ladder.json").read_text(encoding="utf-8"))
catalog = json.loads((DATA / "catalog.json").read_text(encoding="utf-8"))
prisms = json.loads((DATA / "prisms.json").read_text(encoding="utf-8"))


def rung(slot, label_prefix):
    row = next(r for r in ladder if r["slot"] == slot)
    return next(r for r in row["rungs"] if r["label"].lower().startswith(label_prefix.lower()))


def modgain(rg, text_prefix):
    m = next(m for m in rg["mods"] if m["text"].startswith(text_prefix))
    return m["gain"]


def slate(text_prefix):
    return next(c for c in catalog if c["cat"] == "slate" and c["text"].startswith(text_prefix))


def prism_rung(name_prefix, label_prefix):
    p = next(p for p in prisms if p["name"].startswith(name_prefix))
    return next(r for r in p["rungs"] if r["label"].lower().startswith(label_prefix.lower()))


def g(x):
    return f"{'+' if x >= 0 else '−'}{abs(x):g}%"


def rng(rg):
    lo, hi = rg["gain"], rg["gainTop"]
    return g(lo) if hi is None or hi == lo else f"{g(lo)} → {g(hi)}"


# ---- looked-up numbers ----------------------------------------------------
mh86, mh100, mh_mw = rung("mainHand", "i86"), rung("mainHand", "priceless"), rung("mainHand", "MIRROR")
oh86, oh100 = rung("offHand", "i86"), rung("offHand", "priceless")
boots86, dawn = rung("boots", "i86"), rung("boots", "Dawn Break")
helm86, helm100 = rung("helmet", "i86"), rung("helmet", "priceless")
gloves86, ghost = rung("gloves", "i86"), rung("gloves", "Ghost Slaughter")
chest86 = rung("chest", "i86")
r1_86, r2_86 = rung("ring1", "i86"), rung("ring2", "i86")
timid, r2_100 = rung("ring1", "priceless timid"), rung("ring2", "priceless combo")
heart = rung("necklace", "Heart of Animitta")
eternity = rung("belt", "Eternity")
haze = prism_rung("Ethereal", "Haze")
valor = prism_rung("Ethereal", "Unmatched Valor")
inverse = prism_rung("Inverse", "good inverse")

frostbite_sl = slate("Inflicts Frostbite when dealing Hit Cold Damage")
warcry_sl = slate("+4 to the minimum number of enemies affected by Warcry")

cores = sorted((c for c in catalog if c["cat"] == "slate" and "Core Talent" in c["tier"]
                and (c["delta"] or 0) > 0), key=lambda c: -c["delta"])[:8]
PLANNED = ("Inflicts Frostbite when dealing Hit Cold Damage",
           "+100% chance to gain a stack of Focus Blessing",
           "+4 to the minimum number of enemies affected by Warcry",
           "Converts 100% of Physical Damage to Cold")
fillers = sorted((c for c in catalog if c["cat"] == "slate" and c["tier"] == "Legendary Medium Talent"
                  and (c["delta"] or 0) > 0 and not c["text"].startswith(PLANNED)),
                 key=lambda c: -c["delta"])[:6]
immunities = [c for c in catalog if c["cat"] == "slate"
              and c["text"].startswith(("Immune to Trauma", "Immune to Wilt", "Immune to Ignite"))]

line1 = lambda c: c["text"].splitlines()[0]
corelist = ", ".join(f"{c['name']} ({g(c['delta'])})" for c in cores)
fillerlist = "\n".join(f"{line1(c)} ({g(c['delta'])})" for c in fillers)
immlist = " / ".join(f"{line1(c)} ({c['on']})" for c in immunities)

# ---- the rows: (A, B, C, picture-callout-or-None) -------------------------
R = []
row = lambda a, b, c, pic=None: R.append((a, b, c, pic))
blank = lambda: R.append(("", "", "", None))

# --- §1 swap ---
row("~200b", "Lv 90+", "SWAP TO SPECTRAL SLASH",
    "planner import screen with the Spectral Slash build code loaded")
row("", "Copy this",
    "Spectral Slash - Legion - Detonation - Critical Strike Damage Increase + Quick Decision / Added Phys\n"
    "3x Activation Medium: Spectral Slash / warcries / Ice Bond (Frostbite self-applicator)\n"
    "All 4 Precise Auras: Cruelty (+Disciplined) - Fearless - Domain Expansion - Frigid Domain",
    "skill bar screenshot with the six Spectral Slash supports visible")
row("", "PACTSPIRIT",
    "Red Umbrella + Azure Gunslinger (+48% Attack Damage, +16% Attack Speed each; nodes 4-6 pure crit)\n"
    "Captain Kitty (+12% Warcry Effect, “Beast” Roar)\n"
    "ONLY KITTY IS WORTH LEVELLING (L2 warcry CDR, L3 a charge)",
    "pactspirit screen: Red Umbrella / Azure Gunslinger / Captain Kitty socketed")
row("", "Buy ASAP (cheap)",
    "Grace Boots — KEEP until the Focus Blessing slate\nBodhi Girdle\nVortex Heart (~130 FE)",
    "trade house: the three uniques, prices visible")
row("", "Check and move on",
    "3-4x SLATE 1mod + full reveal:\n+1 Attack skill level\n+1 Physical skill level (not the no-conversion one)\n"
    "+1 to all skill\n10% additional damage for 4s after Mobility skills", None)
row("", "Check and move on",
    "PEDIGREE (~30 FE, snipe one). Best cores:\n" + corelist,
    "trade house: Pedigree of Gods search sorted by price")
blank()

# --- §2 watchlist ---
row("", "EVERY SESSION", "STANDING WATCHLIST — BUY ON PRICE, NOT ON SCHEDULE", None)
row(g(heart["gain"]), "listed ~1300 FE",
    "Heart of Animitta — snipe WAY under list. +1 Finisher charge = a second full-power finisher "
    "per sequence. THE #1 BUY.",
    "trade house: Heart of Animitta price search")
row("", "its own hunt", "Vorax boot base — i86+, at least one decent mod (Have Fervor vessel)",
    "trade house: Vorax boots filtered i86+, corroded")
row("", "EV 950 FE", "Dawn Break belt — feeds “Have Fervor” onto the Vorax base. Dead without it.",
    "trade house: Dawn Break belt")
row(g(ghost["gain"]), "corroded only",
    "Ghost Slaughter — CORRODED 1%/pt ROLL ONLY (normal roll = a third). Dead until the boots hold Fervor.",
    "item tooltip: corroded Ghost Slaughter, the 1%-per-rating line circled")
row(g(eternity["gain"]) + " map", "5 blueprints",
    "Eternity — buy the 5 BLUEPRINTS, never the ~4k FE item. Mapping monster + the Fervor sustain bill.",
    "trade house: Eternity blueprint price vs finished item")
row(rng(timid), "from Traveler 8",
    "priceless timid curse-on-hit ring — frees the warcry bar slot, carries a ×1.39 boss layer.", None)
row(g(inverse["delta"]), "high effect ranges",
    "Inverse Prism (Brave tree) — POSITIVE Legendary-Medium AND Medium ranges (+38%/+17% modeled). "
    "+6 min warcry enemies — floor 14 of 16.",
    "prism tooltip: Inverse Prism with both effect ranges positive")
row(g(valor["delta"]), "needs helm + boots",
    "Ethereal Prism: Unmatched Valor — fixed 130 Fervor Rating. NEEDS the priceless sealed-mana helmet "
    "+ Dawn Break (Ranger slot). God roll “no longer replaces” keeps the Ranger core too.",
    "prism tooltip: Unmatched Valor")
blank()

# --- §3 1B / 8-0 ---
row("1B", "8-0", "i86 CORE — IN THIS ORDER. PRICELESS WAITS UNTIL AFTER TRAVELER 8.", None)
row(rng(mh86), "FIRST",
    "i86 mainhand — Shadowless Swordsman's Blade, speed/crit roll.\n"
    f"Craft: flat Cold ({g(modgain(mh86, 'Adds 126'))}) > gear Attack Speed ({g(modgain(mh86, '+32% gear Attack Speed'))}) "
    f"> flat Phys ({g(modgain(mh86, 'Adds 37'))}); advanced: Gear Phys% ({g(modgain(mh86, '+74% Gear Physical Damage'))}, 3x). "
    f"SKIP crit rating ({g(modgain(mh86, '+40% Attack Critical'))}).",
    "item tooltip: crafted i86 mainhand with the three basic lines circled")
row(rng(oh86), "SECOND",
    "i86 offhand — same base, raw damage roll.\n"
    f"Craft: flat Cold ({g(modgain(oh86, 'Adds 126'))}) > Elemental% ({g(modgain(oh86, '+99% Elemental'))}) > flat Phys / Phys%; "
    f"advanced: Gear Phys% / Crit Damage (~{g(modgain(oh86, '+72% Gear Physical Damage'))} each)",
    "item tooltip: crafted i86 offhand")
row(rng(r2_86), "",
    "i86 frostbite ring — THE +1 COMBO POINTS SUFFIX IS THE ITEM, NEVER LOSE IT.\n"
    f"The barrier ring is only {rng(r1_86)} — last in this gate.",
    "item tooltip: i86 ring with +1 Combo Points suffix circled")
row(g(haze["delta"]), "",
    "Ethereal Prism: Haze — +12% additional Attack Damage when holding a One-Handed Weapon. "
    "Socket on any non-core talent — it overrides that node.",
    "prism tooltip: Haze with the +12% 1H Attack Damage base affix")
row("", "",
    "Hero Memory LEGENDARY\nREVIVED #% Attack Speed for every main attack skill cast\n"
    "Base Affix: Strength / ES / Attack Speed\nFixed Affix: %ES\n"
    "Random Affix: Phys/Cold Crit Damage / Phys/Cold/Attack Crit Rating / Attack Speed / Cold Damage / Damage", None)
row("", "KISMET",
    "2x Peerless + Tiger's Chain — +1 Finisher charge + fixed 0.3s sequence reset; never move\n"
    "2x Mammoth + Ascetic — Mammoth pair self-casts Lv.20 Resurrection Warcry every 3s\n"
    "Rest: 1x Medium + 9x Micro Crit Rating", None)
row("±0%", "", "i86 chest = ES/defense only — no damage lines to chase.", None)
blank()

# --- §4 slates ---
row("", "SLATES", "SLATE PRIORITY — buy in this order", None)
row("enabler", "1st",
    "Focus Blessing on Frostbitten hit (God of Knowledge) — REQUIRED BEFORE THE i86 BOOTS: "
    "unlocks the boots ladder (Grace freed → i86 → Dawn Break).",
    "slate tooltip: the Focus Blessing line")
row(g(frostbite_sl["delta"]), "2nd",
    "Frostbite on Cold hit (Frostbitten core / Prophet) — frees 4 Prophet points → respec into "
    "the Frostbite legendaries.", None)
row(g(warcry_sl["delta"]), "3rd",
    "+4 min enemies affected by Warcry (The Brave, 1 copy) — floors the boss stack at 8 of 16.", None)
row("enabler", "LAST",
    "Phys→Cold conversion slate — the Prophet tree covers it today; the slate frees the "
    "Prophet → Ronin respec.", None)
row("", "What to shop",
    "A Corner of Divinity (max 3) — 2x Legendary Medium, any god\n"
    "Fallen Starlight (max 3) — 3x Micro + 1x Medium/Legendary Medium\n"
    "Pedigree of Gods (max 1) — the Core Talent carrier\n"
    "God slates — 2 fixed + 3 random; aim 1x Medium + 2x Legendary Medium or better", None)
row("", "Bonus damage mods",
    "Best Legendary Medium fillers:\n" + fillerlist
    + "\nSkill-level lines STACK — the build runs four +1 Attack Skill Level.", None)
row("defense", "Before Deep Space",
    "Hold the immunity Legendary Mediums first:\n" + immlist, None)
blank()

# --- §5 10B-20B / Traveler 8 ---
row("10B-20B", "Traveler 8", "i86 ARMOR PIECES", None)
row(rng(boots86), "slate first",
    "i86 ES boots — ONLY AFTER the Focus Blessing slate (they drop Grace Boots' trigger). "
    "Want Hasten + Crit Rating / Crit Damage.",
    "item tooltip: i86 boots with Hasten line")
row(rng(helm86), "", "i86 ES helmet — Crit Rating basic; Strength + Crit Damage advanced.", None)
row(rng(gloves86), "", "i86 ES gloves — %damage + Crit Rating basics; Crit Damage advanced.", None)
row("", "TRAVELER 8 DONE?",
    "PRICELESS SHOPPING OPENS NOW — check 8-1/8-2 pieces every session, buy on price. "
    "Timid ring → watchlist.", None)
blank()

# --- §6 200B / Profound 8 ---
row("200B", "Profound 8", "PRICELESS COMPLETES (8-1 + 8-2 open)", None)
row(rng(mh100), "",
    "PRICELESS mainhand — ultimates: Armor Mitigation Pen "
    f"({g(modgain(mh100, '+31% Armor'))}) / Combo Damage Enhancement ({g(modgain(mh100, '+62% Combo'))}); "
    f"basics: gear Attack Speed ({g(modgain(mh100, '+41% gear Attack Speed'))}) + flat Phys.",
    "item tooltip: priceless mainhand")
row(rng(oh100), "package",
    f"priceless offhand — Ninth Apostle's Magic Shield. +4 Active Skill Level ({g(modgain(oh100, '+4 Active Skill Level'))}) "
    "is the big line. A PACKAGE with i86 Hasten boots + God of Might / Brave tree changes.",
    "item tooltip: Ninth Apostle's Magic Shield")
row(rng(timid), "watchlist", "priceless timid curse-on-hit ring — from the watchlist.", None)
row(rng(r2_100), "",
    "priceless combo ring — Fervor Effect + Elemental/Erosion Pen ultimates.", None)
blank()

# --- §7 fervor engine ---
row("", "ALL OR NOTHING",
    "THE FERVOR ENGINE — ONE purchase; any piece alone is a dead slot.\n"
    "COST: 12% of current Life AND ES per second while Fervor is active — sustain is part of the bill.", None)
row(rng(dawn), "boots",
    "Vorax base + Dawn Break belt (watchlist) — +1% additional damage per 2 rating, +78% Crit Damage. "
    "Range = alone → with the tree change.",
    "item tooltip: Vorax boots with Have Fervor")
row(g(ghost["gain"]), "gloves", "Corroded Ghost Slaughter (watchlist) — +1% additional damage per rating.", None)
row(rng(helm100) + " w/ prism", "helmet",
    "priceless sealed-mana helmet — near-zero alone; the range lands with the prism. "
    "Craft the Sealed Mana Compensation ultimate.",
    "item tooltip: priceless helmet with Sealed Mana Compensation")
row(g(valor["delta"]), "prism",
    "Ethereal Prism: Unmatched Valor — fixed 130 in the Ranger slot (over the 100 cap; "
    "Centralize becomes a respec candidate).", None)
row(g(eternity["gain"]) + " map", "belt",
    "Eternity (5 blueprints) + Precise: Energy Shield once the flat-ES belt is gone.\n"
    "Resurrection Warcry in slot 2 — or let the Mammoth kismets self-cast it.", None)
blank()

# --- §8 timemark 8 / atlas ---
row("150B+", "Timemark 8 / ATLAS", "ENDGAME LAYERS", None)
row("", "Crit",
    "Fervor spent twice: +2% Crit Rating per point AND the 0.5% Crit Damage/rating converters "
    "(tree legendary + 2 slate copies) = +195% Crit Damage at 130.\n"
    "Keep the Critical Strike Damage Increase support.", None)
row("", "Warcry",
    "Shockwave Warcry in the freed slot; level Captain Kitty.\n"
    f"Inverse Prism good roll ({g(inverse['delta'])}) — floor 14 of 16 stacks.", None)
row(rng(mh_mw), "",
    f"MIRROR-WORTHY mainhand — only the +4 Attack Skill Level roll ({g(modgain(mh_mw, '+4 to Attack Skill Level'))}) "
    "beats priceless.", None)

# ---- emit ------------------------------------------------------------------
buf = io.StringIO()
w = csv.writer(buf, delimiter="\t", quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")
for a, b, c, _ in R:
    w.writerow([a, b, c])
tsv = buf.getvalue()
# write_bytes: text mode would re-translate \n and corrupt the \r\n row terminators
(OUT / "spectral-slash-guide.tsv").write_bytes(tsv.encode("utf-8"))

pics = [f"- **Row {PASTE_ROW + i}** ({a or b or c.splitlines()[0][:40]}): {pic}"
        for i, (a, b, c, pic) in enumerate(R) if pic]
(OUT / "picture-callouts.md").write_text(
    "# Picture callouts — Rehan2 Guide rows " + f"{PASTE_ROW}-{PASTE_ROW + len(R) - 1}\n\n"
    "Screenshot each and drop it to the right of the named row.\n\n" + "\n".join(pics) + "\n",
    encoding="utf-8")

# ---- self-check (reads the file back from disk — newline handling is the risk) ----
disk = (OUT / "spectral-slash-guide.tsv").read_bytes().decode("utf-8")
parsed = list(csv.reader(io.StringIO(disk, newline=""), delimiter="\t"))
assert len(parsed) == len(R), (len(parsed), len(R))
assert all(len(r) == 3 for r in parsed), "every row must be exactly A/B/C"
joined = tsv
for needle in ("Heart of Animitta", "CORRODED", "5 BLUEPRINTS", "Timid", "Unmatched Valor",
               "Inverse Prism", "PRICELESS WAITS", "Focus Blessing", "LAST"):
    assert needle in joined, needle
print(f"OK: {len(R)} rows -> paste at A{PASTE_ROW} (through row {PASTE_ROW + len(R) - 1}), "
      f"{sum(1 for r in R if r[3])} picture callouts")
