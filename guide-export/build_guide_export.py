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
mh86, mh100, mh_mw = rung("mainHand", "i86"), rung("mainHand", "PRICELESS"), rung("mainHand", "MIRROR")
oh86, oh100 = rung("offHand", "i86"), rung("offHand", "i100")
boots86, dawn = rung("boots", "i86"), rung("boots", "Dawn Break")
helm86, helm100 = rung("helmet", "i86"), rung("helmet", "i100")
gloves86, ghost = rung("gloves", "i86"), rung("gloves", "Ghost Slaughter")
chest86 = rung("chest", "i86")
r1_86, r2_86 = rung("ring1", "i86"), rung("ring2", "i86")
timid, r2_100 = rung("ring1", "i100"), rung("ring2", "i100")
heart = rung("necklace", "Heart of Animitta")
eternity = rung("belt", "Eternity")
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
corelist = "\n".join(f"{c['name']} ({g(c['delta'])}) — {line1(c)}" for c in cores)
fillerlist = "\n".join(f"{line1(c)} ({g(c['delta'])})" for c in fillers)
immlist = " / ".join(f"{line1(c)} ({c['on']})" for c in immunities)

# ---- the rows: (A, B, C, picture-callout-or-None) -------------------------
R = []
row = lambda a, b, c, pic=None: R.append((a, b, c, pic))
blank = lambda: R.append(("", "", "", None))

# --- §1 swap ---
row("~200b", "Lv 90+", "SWAP TO SPECTRAL SLASH — everything below assumes the swap is done",
    "planner import screen with the Spectral Slash build code loaded")
row("", "Copy this",
    "Spectral Slash - Legion - Detonation - Critical Strike Damage Increase + Quick Decision / Added Phys\n"
    "3x Activation Medium: one each for Spectral Slash / the warcries / Ice Bond (the Frostbite self-applicator)\n"
    "All 4 Precise Auras: Cruelty (+Disciplined) - Fearless - Domain Expansion - Frigid Domain",
    "skill bar screenshot with the six Spectral Slash supports visible")
row("", "PACTSPIRIT",
    "Red Umbrella + Azure Gunslinger (+48% Attack Damage, +16% Attack Speed each; nodes 4-6 are pure crit)\n"
    "Captain Kitty of the Furious Sea (+12% Warcry Effect, “Beast” Roar)\n"
    "KITTY IS THE ONLY PACTSPIRIT WORTH LEVELLING (L2 warcry CDR, L3 a warcry charge)",
    "pactspirit screen: Red Umbrella / Azure Gunslinger / Captain Kitty socketed")
row("", "Buy ASAP (cheap)",
    "Grace Boots — KEEP until the Focus Blessing slate (see SLATE PRIORITY below)\n"
    "Bodhi Girdle\nVortex Heart (~130 FE)",
    "trade house: the three uniques, prices visible")
row("", "Check and move on",
    "3-4x SLATE 1mod + full reveal:\n+1 Attack skill level\n+1 Physical skill level (not the no-conversion one)\n"
    "+1 to all skill\n10% additional damage for 4s after using Mobility skills", None)
row("", "Check and move on",
    "PEDIGREE (~30 FE, snipe one). Best cores it can roll:\n" + corelist,
    "trade house: Pedigree of Gods search sorted by price")
blank()

# --- §2 watchlist ---
row("", "EVERY SESSION", "STANDING WATCHLIST — CHECK AH EVERY SESSION. BUY ON PRICE, NOT ON SCHEDULE.", None)
row(g(heart["gain"]), "listed ~1300 FE",
    "Heart of Animitta — snipe it WAY under list. +1 Finisher charge = a second full-power finisher "
    "every sequence, +80% Finisher Amplification. THE #1 BUY ON THIS SHEET.",
    "trade house: Heart of Animitta price search")
row("", "its own hunt", "Vorax boot base — i86 or above with at least one decent mod (the vessel for Have Fervor)",
    "trade house: Vorax boots filtered i86+, corroded")
row("", "EV 950 FE", "Dawn Break belt — supplies “Have Fervor” onto the Vorax boots. Dead without the base above.",
    "trade house: Dawn Break belt")
row(g(ghost["gain"]), "corroded only",
    "Ghost Slaughter — THE CORRODED 1%/pt ROLL ONLY (normal roll is a third of the value). "
    "Dead slot until the Vorax boots hold Fervor — buy the engine, not the glove.",
    "item tooltip: corroded Ghost Slaughter, the 1%-per-rating line circled")
row(g(eternity["gain"]) + " map", "5 blueprints",
    "Eternity — DO NOT pay the ~4k FE item price; buy the 5 BLUEPRINTS instead. "
    "Kill-fed stacks = a mapping monster, and it pays the Fervor sustain bill.",
    "trade house: Eternity blueprint price vs finished item")
row(rng(timid), "from Traveler 8",
    "i100 Timid curse-on-hit ring — frees the warcry bar slot and carries its own ×1.39 boss layer. "
    "Monitor continuously once Traveler 8 is done.", None)
row(g(inverse["delta"]), "high effect ranges",
    "Inverse Prism (Brave tree) — want POSITIVE Legendary-Medium AND Medium effect ranges "
    "(+38%/+17% roll modeled). Copies +6 min warcry enemies — floor 14 of the 16-stack cap.",
    "prism tooltip: Inverse Prism with both effect ranges positive")
row(g(valor["delta"]), "needs helm + boots",
    "Ethereal Prism: Unmatched Valor — fixed 130 Fervor Rating. NEEDS the i100 sealed-mana helmet "
    "+ Dawn Break first (Ranger slot). God roll: “no longer replaces” keeps the Ranger core too.",
    "prism tooltip: Unmatched Valor")
blank()

# --- §3 1B / 8-0 ---
row("1B", "8-0", "i86 CORE — IN THIS ORDER. PRICELESS WAITS UNTIL AFTER TRAVELER 8.", None)
row(rng(mh86), "FIRST",
    "i86 mainhand — Shadowless Swordsman's Blade, speed/crit roll.\n"
    f"Lines in order: T1 flat Cold ({g(modgain(mh86, 'Adds 126'))}) > gear Attack Speed ({g(modgain(mh86, '+32% gear Attack Speed'))}) "
    f"> flat Phys ({g(modgain(mh86, 'Adds 37'))})\n"
    f"Advanced ember: Gear Phys% ({g(modgain(mh86, '+74% Gear Physical Damage'))}, 3x cost). "
    f"SKIP the crit-rating line ({g(modgain(mh86, '+40% Attack Critical'))}).",
    "item tooltip: crafted i86 mainhand with the three basic lines circled")
row(rng(oh86), "SECOND",
    "i86 offhand — same base, raw damage roll.\n"
    f"Lines: flat Cold ({g(modgain(oh86, 'Adds 126'))}) > Elemental% ({g(modgain(oh86, '+99% Elemental'))}) > flat Phys / Phys%\n"
    f"Advanced: Gear Phys% / Crit Damage (~{g(modgain(oh86, '+72% Gear Physical Damage'))} each)",
    "item tooltip: crafted i86 offhand")
row(rng(r2_86), "",
    "i86 ring, frostbite roll — THE +1 COMBO POINTS SUFFIX IS THE ITEM, NEVER LOSE IT.\n"
    f"The second (barrier) ring is only {rng(r1_86)} — lowest priority in this gate.",
    "item tooltip: i86 ring with +1 Combo Points suffix circled")
row("", "",
    "Hero Memory LEGENDARY\nREVIVED #% Attack Speed for every main attack skill cast\n"
    "Base Affix: Strength / ES / Attack Speed\nFixed Affix: %ES\n"
    "Random Affix: Phys/Cold Crit Damage / Phys/Cold/Attack Crit Rating / Attack Speed / Cold Damage / Damage", None)
row("", "KISMET",
    "2x Peerless + Tiger's Chain — the Dual pair is +1 Finisher charge + fixed 0.3s sequence reset; never move these\n"
    "2x Mammoth + Ascetic — Mammoth pair self-casts Lv.20 Resurrection Warcry on hit every 3s\n"
    "Fill the rest: 1x Medium + 9x Micro Crit Rating", None)
row("±0%", "", "i86 chest = defense/ES only — buy it for survivability, don't chase damage lines here.", None)
blank()

# --- §4 slates ---
row("", "SLATES", "SLATE PRIORITY — buy in this order", None)
row("enabler", "1st",
    "Focus Blessing on Frostbitten hit (God of Knowledge line) — REQUIRED BEFORE THE i86 BOOTS: "
    "it unlocks the whole boots ladder (Grace Boots freed → i86 → Dawn Break).",
    "slate tooltip: the Focus Blessing line")
row(g(frostbite_sl["delta"]), "2nd",
    "Frostbite on Cold hit (Frostbitten core / Prophet line) — frees 4 Prophet tree points; "
    "respec them into the Frostbite legendaries (Effect / Cold Infiltration / more-vs-Frozen).", None)
row(g(warcry_sl["delta"]), "3rd",
    "+4 min enemies affected by Warcry (The Brave, 1 copy) — floors the boss stack count at 8 of 16; "
    "the Inverse Prism copy adds 4-6 more.", None)
row("enabler", "LAST",
    "Phys→Cold conversion slate — the Prophet tree already covers conversion today. "
    "Buying the slate frees the Prophet → Ronin respec (re-cover conversion, then Cold Infiltration "
    "on Frozen / Frostbite Effect first).", None)
row("", "What to shop",
    "A Corner of Divinity (max 3) — rolls 2x Legendary Medium, any god\n"
    "Fallen Starlight (max 3) — 3x Micro + 1x Medium/Legendary Medium\n"
    "Pedigree of Gods (max 1) — the Core Talent carrier (see the pedigree row above)\n"
    "God slates — 2 fixed + 3 random; aim 1x Medium + 2x Legendary Medium or better", None)
row("", "Bonus damage mods",
    "Best rollable Legendary Medium fillers beyond the plan:\n" + fillerlist
    + "\nSkill-level lines STACK across slates — the build runs four +1 Attack Skill Level.", None)
row("defense", "Before Deep Space",
    "Hold the immunity Legendary Mediums before farming Deep Space:\n" + immlist, None)
blank()

# --- §5 10B-20B / Traveler 8 ---
row("10B-20B", "Traveler 8", "i86 ARMOR PIECES", None)
row(rng(boots86), "slate first",
    "i86 ES boots — ONLY AFTER the Focus Blessing slate above (they drop Grace Boots' trigger). "
    "Get the Hasten line + Crit Rating / Crit Damage.",
    "item tooltip: i86 boots with Hasten line")
row(rng(helm86), "", "i86 ES helmet — Crit Rating basic, Strength + Crit Damage advanced.", None)
row(rng(gloves86), "", "i86 ES gloves — %damage + Crit Rating basics, Crit Damage advanced.", None)
row("", "TRAVELER 8 DONE?",
    "PRICELESS SHOPPING OPENS NOW — check 8-1/8-2 pieces EVERY session and buy on price. "
    "Timid ring joins the standing watchlist (see above).", None)
blank()

# --- §6 200B / Profound 8 ---
row("200B", "Profound 8", "PRICELESS COMPLETES (8-1 + 8-2 open)", None)
row(rng(mh100), "",
    "PRICELESS mainhand — ultimate lines: Armor Mitigation Penetration "
    f"({g(modgain(mh100, '+31% Armor'))}) / Combo Damage Enhancement ({g(modgain(mh100, '+62% Combo'))}); "
    f"basics: gear Attack Speed ({g(modgain(mh100, '+41% gear Attack Speed'))}) + flat Phys.",
    "item tooltip: priceless mainhand")
row(rng(oh100), "package",
    "i100 offhand — Ninth Apostle's Magic Shield. +4 Active Skill Level "
    f"({g(modgain(oh100, '+4 Active Skill Level'))}) is the big line, plus Warcry Effect + Strength.\n"
    "Lands as a PACKAGE with i86 Hasten boots + God of Might / Brave tree changes.",
    "item tooltip: Ninth Apostle's Magic Shield")
row(rng(timid), "watchlist",
    "i100 Timid curse-on-hit ring — from the watchlist; frees the warcry slot, ×1.39 boss layer.", None)
row(rng(r2_100), "",
    "i100 second ring, phys-as-extra roll — Fervor Effect + Elemental/Erosion Pen ultimates.", None)
blank()

# --- §7 fervor engine ---
row("", "ALL OR NOTHING",
    "THE FERVOR ENGINE — buy as ONE purchase; any piece alone is a dead slot.\n"
    "COST: 12% of current Life AND ES per second while Fervor is active — sustain is INSIDE this "
    "bundle, not next to it.", None)
row(rng(dawn), "boots",
    "Dawn Break belt onto the Vorax boot base (both from the watchlist) — "
    "+1% additional damage per 2 rating + 78% Crit Damage. Range = boots alone → with the tree change.",
    "item tooltip: Vorax boots with Have Fervor")
row(g(ghost["gain"]), "gloves", "Corroded Ghost Slaughter (watchlist) — +1% additional damage per rating.", None)
row(rng(helm100) + " w/ prism", "helmet",
    "i100 sealed-mana helmet — near-zero alone, the range lands with the fixed-rating prism. "
    "Craft Sealed Mana Compensation ultimate.",
    "item tooltip: i100 helmet with Sealed Mana Compensation")
row(g(valor["delta"]), "prism",
    "Ethereal Prism: Unmatched Valor — fixed 130 Fervor Rating in the Ranger slot "
    "(over the 100 cap, immune to Centralize swings; Centralize becomes a respec candidate).", None)
row(g(eternity["gain"]) + " map", "belt",
    "Eternity (from the 5 blueprints) + Precise: Energy Shield support once the flat-ES belt is gone.\n"
    "Resurrection Warcry in the second warcry slot (or let the Mammoth kismets self-cast it).", None)
blank()

# --- §8 timemark 8 / atlas ---
row("150B+", "Timemark 8 / ATLAS", "ENDGAME LAYERS", None)
row("", "Crit",
    "Fervor spent twice: native +2% Crit Rating per point AND the 0.5% Crit Damage per rating "
    "converters (tree legendary + two slate copies) = +195% Crit Damage at 130 rating.\n"
    "Support bar: Critical Strike Damage Increase stays over a plain damage support.", None)
row("", "Warcry",
    "Shockwave Warcry onto the slot the Timid ring freed; level Captain Kitty.\n"
    f"Inverse Prism good roll ({g(inverse['delta'])}) — floor 14 of 16 warcry stacks.", None)
row(rng(mh_mw), "",
    "MIRROR-WORTHY mainhand — only worth it for the +4 Attack Skill Level roll "
    f"({g(modgain(mh_mw, '+4 to Attack Skill Level'))}); otherwise priceless is the stop.", None)

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
