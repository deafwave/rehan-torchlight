import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { extractLines, substitute, fillTemplate, classify, parseBuild, skillLevelAdditionalPct, warcryLayer, PARSE_TARGET } from "../src/buildParser.js";
import { cycleDps } from "../src/damageModel.js";
import { fromRoot } from "../src/py.js";

const BUILD = fromRoot("data/Rehan.json");

describe("skill levels past 20", () => {
  test("bands compound: x1.10/level for 21-30, x1.08/level past 30 (user 2026-07-16)", () => {
    expect(skillLevelAdditionalPct(0)).toBe(0);
    expect(skillLevelAdditionalPct(1)).toBeCloseTo(10, 6);
    expect(skillLevelAdditionalPct(9)).toBeCloseTo(135.79, 1);    // 1.1^9
    expect(skillLevelAdditionalPct(10)).toBeCloseTo(159.37, 1);   // 1.1^10
    expect(skillLevelAdditionalPct(12)).toBeCloseTo(202.53, 1);   // 1.1^10 x 1.08^2
  });
  test("real build: +9 net gem levels land in additional.skill_levels", () => {
    const [snap] = parseBuild(BUILD);
    expect(snap.additional.skill_levels).toBeCloseTo(135.79, 1);
  });
});

describe("spectral slash support gems", () => {
  test("still attack grants willpower: 6 stacks x 6%, compounding", () => {
    const [snap] = parseBuild(BUILD);
    // (1.06^6 - 1) * 100; stationary bossing = full uptime
    expect(snap.additional.willpower).toBeCloseTo(41.85, 1);
  });
  test("recuperation grants Enhancement at L30 (gem 20 + 10 support levels), not amp", () => {
    const [snap] = parseBuild(BUILD);
    // amp = skill 30 + Animitta 80 only; Recuperation's 18.2 sits in the Enhancement pool
    expect(snap.rotation.finisher_amp_pct).toBeCloseTo(110, 1);
    expect(snap.additional.combo_enhancement).toBeCloseTo(18.2 + 62 + 61, 1);
  });
  test("prisms score both lines: base 20% and the actual roll", () => {
    const [snap] = parseBuild(BUILD);
    expect(snap.additional.detonation_prism).toBeCloseTo(56, 1);    // 1.20 x 1.30 (roll 30)
    expect(snap.additional.legion_prism).toBeCloseTo(15.2, 1);      // 1.20 x 0.96 (roll -4)
  });
  test("crit damage increase is crit-gated, read at L30", () => {
    const [snap] = parseBuild(BUILD);
    expect(snap.crit.additional_on_crit_pct).toBeCloseTo(40.5, 1);  // 26 + 29 x 0.5
  });
  test("legion adds one extra clone vs boss (1 enemy in range), loadout 0 has none", () => {
    const [snap] = parseBuild(BUILD);
    expect(snap.rotation.extra_clones).toBe(1);
    const [snap0] = parseBuild(BUILD, 0);
    expect(snap0.rotation.extra_clones).toBe(0);
  });

  test("loadout 0 willpower support lands, unknown supports reported not dropped", () => {
    const [snap, report] = parseBuild(BUILD, 0);
    expect(snap.additional.willpower).toBeCloseTo(41.85, 1);
    expect(report.manual.some(e => e.mode === "unmodeled" && String(e.path).includes("Quick Decision"))).toBe(true);
  });
});

describe("mark, blessings, fixate", () => {
  test("mark effect scales the skill's inherent 30% Mark", () => {
    const [snap] = parseBuild(BUILD);
    // tree +20% Mark effect: 30 * 1.20 = 36
    expect(snap.rotation.mark_taken_pct).toBeCloseTo(36, 6);
  });

  test("blessing grants classify to specials, not ignore", () => {
    expect(classify("100% chance to gain Agility Blessing on Critical Strike")[0])
      .toBe("special.agility_blessing");
    expect(classify("+100% chance to gain a stack of Focus Blessing upon inflicting damage to a Frostbitten enemy. Interval: 0.1s")[0])
      .toBe("special.focus_blessing");
  });

  test("blessings: Agility 8% + Focus 25% (4 base +1 from the sword's base affix), compounded", () => {
    const [snap] = parseBuild(BUILD);
    // (1.08 * 1.25 - 1) * 100 = 35; Agility's 4x4% attack speed lands in rotation
    expect(snap.additional.blessings).toBeCloseTo(35, 1);
  });

  test("base-affix and tower-sequence line shapes classify", () => {
    expect(classify("+8% Elemental and Erosion Resistance Penetration"))
      .toEqual(["penetration.cold_pct", 8.0]);
    expect(classify("-20% Attack Critical Strike Rating for this gear"))
      .toEqual(["special.local_crit_rating", -20.0]);
    expect(classify("Triggers Lv. 20 Timid Curse upon inflicting damage. Cooldown: 0.2 s")[0])
      .toBe("special.timid_curse");
    expect(classify("Adds 20% of Physical Damage to Cold Damage"))
      .toEqual(["base.gain_phys_as_cold_pct", 20.0]);
    expect(classify("Main Skill is supported by Lv. 25 Steamroll"))
      .toEqual(["special.tower_steamroll", 25.0]);
    expect(classify("+1 to Max Focus Blessing Stacks")[0]).toBe("extras.max_focus_blessing_stacks");
  });

  test("socketed Steamroll (re-socket counterfactual) is modeled", () => {
    const build = JSON.parse(fs.readFileSync(BUILD, "utf-8"));
    const lo = build.loadouts.loadouts.find((l: any) => l.name?.trim() === PARSE_TARGET);
    for (const sk of lo.skills.activeSkills) {
      for (const sup of (sk.supports ?? []).filter(Boolean)) {
        if (sup.supportGuid === "dcb47367-34df-5e86-a9df-0b5d5f130998") {
          sup.supportGuid = "4830642f-32e5-56ef-9de7-61ed678cb883";   // Steamroll
        }
      }
    }
    const [snap] = parseBuild(build);
    expect(snap.additional.steamroll, "L20 socket: 31 + 19*0.5, compounded with the sequence copy")
      .toBeGreaterThan(40);
    expect(snap.crit.additional_on_crit_pct ?? 0).toBe(0);
  });

  test("real build: Timid ring credited at 39%, ring base affix gains 20% phys as cold", () => {
    const [snap] = parseBuild(BUILD);
    expect(snap.enemy_taken.timid_curse).toBeCloseTo(39, 6);   // mechanics.md#timid, Lv.20
    expect(snap.base.gain_phys_as_cold_pct).toBeCloseTo(20, 6);
  });

  test("vorax boots parse: Have Fervor gates the engine, boots lines land", () => {
    const [snap] = parseBuild(BUILD);
    // ghost slaughter 1%/rating x 100 x (1 + 208% effect) scaled, PLUS Dawn Break's
    // plain-worded 1%/2 rating x 100 unscaled (no 'base effect' wording -> no Effect scaling)
    expect(snap.additional.fervor).toBeGreaterThan(350);
    expect(snap._derived!.has_fervor).toBe(1);
  });

  test("without the vorax boots, Fervor-fed damage and crit turn off", () => {
    const build = JSON.parse(fs.readFileSync(BUILD, "utf-8"));
    const lo = build.loadouts.loadouts.find((l: any) => l.name?.trim() === PARSE_TARGET);
    lo.vorax.inventory = [];
    const [snap] = parseBuild(build);
    const [full] = parseBuild(BUILD);
    expect(snap.additional.fervor ?? 0).toBe(0);
    expect(snap.crit.chance_pct, "no Fervor -> the +800.8% rating pile is gone")
      .toBeLessThan(full.crit.chance_pct - 20);
  });

  test("fixate override: crit damage taken 10, additional 1.1", () => {
    const [snap] = parseBuild(BUILD);
    expect(snap.crit.crit_dmg_taken_pct).toBeCloseTo(10, 6);
    expect(snap.enemy_taken.fixate).toBeCloseTo(1.1, 6);
  });
});

describe("line extraction", () => {
  test("substitute hash placeholders", () => {
    expect(substitute("+#% Gear Physical Damage", [74])).toBe("+74% Gear Physical Damage");
    expect(substitute("Adds # - # Cold Damage to the gear", [126, 166]))
      .toBe("Adds 126 - 166 Cold Damage to the gear");
  });

  test("extract lines uses current loadout", () => {
    const texts = extractLines(BUILD).map(l => l.text);
    // current loadout ("more_1", sword+shield) weapon rolls
    expect(texts).toContain("+161% Gear Physical Damage");
    expect(texts.some(t => t.includes("Critical Strike Rating"))).toBe(true);
  });

  test("explicit index overrides current", () => {
    const texts = extractLines(BUILD, 0).map(l => l.text);
    expect(texts).toContain("+74% Gear Physical Damage");
  });

  test("every line has source and slot", () => {
    for (const l of extractLines(BUILD)) {
      expect(l.source).toBeTruthy();
      expect(l.text).toBeTruthy();
    }
  });
});

describe("classify", () => {
  test("core patterns", () => {
    expect(classify("+161% Gear Physical Damage")).toEqual(["base.gear_phys_pct", 161.0]);
    expect(classify("+12% Physical Damage")).toEqual(["increased.physical", 12.0]);
    expect(classify("+9% damage")).toEqual(["increased.global", 9.0]);
    expect(classify("+8% additional Attack Damage")).toEqual(["additional.misc", 8.0]);
    expect(classify("+45% Critical Strike Damage")).toEqual(["crit.damage_pct", 45.0]);
    expect(classify("+10% Attack Speed")).toEqual(["rotation.attack_speed_inc_pct", 10.0]);
    expect(classify("+10% Armor Damage Mitigation Penetration")).toEqual(["penetration.armor_pct", 10.0]);
    // in-game slate/memory wording abbreviates: "DMG", and cold pen has no '+'
    expect(classify("+8% Armor DMG Mitigation Penetration")).toEqual(["penetration.armor_pct", 8.0]);
    expect(classify("1.5% Cold Penetration")).toEqual(["penetration.cold_pct", 1.5]);
    expect(classify("1.5% Cold Penetration for Minions")).toEqual([null, null]);
    expect(classify("+11% Cold Resistance")).toEqual(["ignore", null]);
    // warcry buffs are modeled at full uptime; extra charges change nothing
    expect(classify("+1 Max Warcry Skill Charges")).toEqual(["ignore", null]);
    expect(classify("utterly unknown modifier text")).toEqual([null, null]);
  });

  test("slate and memory cases", () => {
    expect(classify("+30% additional Attack Damage")).toEqual(["additional.misc", 30.0]);
    expect(classify("+30% additional Ailment Damage dealt by attacks")).toEqual(["ignore", null]);
    expect(classify("-10% Attack Speed")).toEqual(["rotation.attack_speed_inc_pct", -10.0]);
    expect(classify("+7% additional Attack and Cast Speed for Combo Starters"))
      .toEqual(["rotation.attack_speed_inc_pct", 7.0]);
  });

  test("undetermined fate slots credit increased damage", () => {
    expect(classify("+6 * 1% damage")).toEqual(["special.fate_slots", 6.0]);
    expect(classify("+6 * 1% Minion Damage")).toEqual(["ignore", null]);
  });
});

describe("parseBuild", () => {
  test("produces valid snapshot and report", () => {
    const [snap, report] = parseBuild(BUILD);
    expect(cycleDps(snap).dps).toBeGreaterThan(0);
    for (const k of ["matched", "ignored", "unmatched", "manual"] as const) {
      expect(Array.isArray(report[k])).toBe(true);
    }
    expect(report.matched.length, "nothing matched at all").toBeGreaterThan(0);
  });
});

describe("memory and divinity lines", () => {
  test("fill template hash and baked numbers", () => {
    // '#' templates take rolled values; baked-number templates get numbers replaced in order
    expect(fillTemplate("+#% Critical Strike Damage", [42])).toBe("+42% Critical Strike Damage");
    expect(fillTemplate("+36% Attack Speed", [44])).toBe("+44% Attack Speed");
    expect(fillTemplate("+16% Attack Speed", [])).toBe("+16% Attack Speed");
  });

  test("memory and divinity lines extracted", () => {
    const lines = extractLines(BUILD);
    const slots = new Set(lines.map(l => l.slot));
    expect(slots.has("memory")).toBe(true);
    expect(slots.has("slate")).toBe(true);
    // divinity descriptions are normalized: '30 %' -> '30%', one line per '\n'
    const slateTexts = lines.filter(l => l.slot === "slate").map(l => l.text);
    expect(slateTexts.every(t => !t.includes(" %"))).toBe(true);
  });
});

const GS_LINE = "Fervor gains an additional base effect: +1% additional Attack and "
              + "Ailment Damage for every 1 Fervor Rating";

describe("fervor damage base effect", () => {
  test("ghost slaughter fervor line is not a flat additional", () => {
    // the per-rating formula must not be read as a literal +1% additional
    expect(classify(GS_LINE)[0]).toBe("special.fervor_dmg");
  });

  test("scales with rating and effect", () => {
    // corroded Ghost Slaughter: 1%/rating x 130 rating x (1 + 2.08 Fervor Effect) = 400.4,
    // plus Dawn Break's plain 1%/2 rating x 130 = 65 (unscaled — not a base effect)
    const [snap] = parseBuild(BUILD);                    // more_1: Ghost Slaughter equipped
    expect(Math.abs(snap.additional.fervor - 465.4)).toBeLessThanOrEqual(1);
  });

  test("no fervor damage source means no fervor bucket", () => {
    const [snap] = parseBuild(BUILD, 0);                 // no Ghost Slaughter
    expect(snap.additional.fervor).toBe(0);
  });
});

describe("life-lost attack speed, fixed fervor rating, low-life execute", () => {
  test("AS-per-life-lost is a rate, not a flat +0.3% attack speed", () => {
    expect(classify("0.3% Attack Speed for every 1% of Life lost")[0])
      .toBe("special.as_per_life_lost");
  });

  // the Warrior slate carrying both lines is placed in loadout 5's grid only
  test("loadout 5: the talent credits 0.3 x 60% sustained deficit = +18 AS", () => {
    const build = JSON.parse(fs.readFileSync(BUILD, "utf-8"));
    const [withTalent] = parseBuild(build, 5);
    for (const s of build.loadouts.loadouts[5].divinity.inventory) {
      for (const a of s.affixes ?? []) {
        if (/Life lost/.test(a.description ?? "")) a.description = "";
      }
    }
    const [without] = parseBuild(build, 5);
    expect(withTalent.rotation.attack_speed_inc_pct - without.rotation.attack_speed_inc_pct)
      .toBeCloseTo(18, 1);
  });

  test("Unmatched Valor prism core-talent override parses: fixed 130 Fervor Rating", () => {
    expect(classify("Has 130 point(s) of fixed Fervor Rating")[0])
      .toBe("special.fixed_fervor_rating");
    const [snap] = parseBuild(BUILD);
    expect(snap._derived!.fervor_rating).toBe(130);
  });

  test("low-life-enemy execute scores at HP-weighted EV, not the headline 25%", () => {
    expect(classify("+25% additional damage against Low Life enemies")[0])
      .toBe("special.low_life_enemy");
    const [snap] = parseBuild(BUILD, 5);
    // active only below the 35% Low Life line: 1/(0.65 + 0.35/1.25) - 1 = +7.53%
    expect(snap.additional.low_life_execute).toBeCloseTo(7.53, 1);
  });
});

describe("pactspirits", () => {
  test("pactspirit nodes are extracted", () => {
    const lines = extractLines(BUILD).filter(l => l.slot === "pactspirit");
    const texts = lines.map(l => l.text);
    expect(texts).toContain("+24% Attack Damage");                    // Red Umbrella node 3
    expect(texts).toContain("+45% Attack Critical Strike Rating");    // Red Umbrella node 6
    expect(texts).toContain("+6% Warcry Effect");                     // Captain Kitty node 9
    expect(lines.some(l => l.source.includes("Red Umbrella"))).toBe(true);
  });

  test("notable node uses level progression, not node text", () => {
    // Captain Kitty is level 2: the notable's text is the L2 progression entry, un-prefixed
    const texts = extractLines(BUILD).filter(l => l.slot === "pactspirit").map(l => l.text);
    expect(texts).toContain("Immediately casts Warcry. +20% additional Warcry Skill Effect");
    expect(texts, "level-2 line missing").toContain("+11% Warcry Cooldown Recovery Speed");
    expect(texts.some(t => t.startsWith("2:")), "progression prefix leaked").toBe(false);
  });

  test("frenzy claims paralysis", () => {
    // 19% chance/hit over a 4s debuff and a 0.75s cycle ⇒ modeled at full uptime
    const [snap] = parseBuild(BUILD);
    expect(snap.enemy_taken.paralysis).toBe(15);
  });

  test("seven steps claims pure heart at five stacks", () => {
    const [snap] = parseBuild(BUILD);
    expect(Math.abs(snap.additional.pure_heart - 27.63)).toBeLessThanOrEqual(0.05);
  });
});

describe("derived layers", () => {
  test("crit chance is derived from parsed rating", () => {
    // pactspirit crit-rating nodes must actually land, not vanish into a constant;
    // 500 x (1 + 5.71 parsed - 0.25 Keep It Up + 8.008 fervor at 130 + 1.00 fearless) / 100
    const [snap] = parseBuild(BUILD);
    expect(Math.abs(snap.crit.chance_pct - 77.34)).toBeLessThanOrEqual(0.1);
  });

  test("warcry layer is derived from parsed effect", () => {
    const [snap] = parseBuild(BUILD);
    expect(Math.abs(snap.additional.warcry_buffs - 109.7)).toBeLessThanOrEqual(0.5);
  });

  test("warcry floor parses to 8; Formless doubles Shockwave's 8-stack cap to 16", () => {
    // mechanics.md#warcry (user 2026-07-16): floor = 4 Brave talent + 4 slate; the
    // inverse prism's scaled COPY adds 4/6 on top (not in the export — priced by the
    // prism rungs). "Doubles Max Warcry Skill Effects" (Brave tree / belt) caps 8 -> 16.
    const [snap] = parseBuild(BUILD);
    expect(snap._derived!.warcry_min_enemies).toBe(8);
    expect(snap._derived!.warcry_max_doubled).toBeGreaterThan(0);
    const d = { warcry_effect_pct: 0, warcry_additional_effect_pct: 0 };
    expect(warcryLayer({ ...d, warcry_min_enemies: 14, warcry_max_doubled: 1 }))
      .toBeCloseTo(5.95 * 14, 6);
    expect(warcryLayer({ ...d, warcry_min_enemies: 20, warcry_max_doubled: 1 }))
      .toBeCloseTo(5.95 * 16, 6);
    expect(warcryLayer({ ...d, warcry_min_enemies: 12, warcry_max_doubled: 0 }))
      .toBeCloseTo(5.95 * 8, 6);
  });
});

describe("off-hand local lines (mechanics.md 'Offhand / dual wield')", () => {
  test("dual-wield loadout 0: off-hand implicits and local mods do not credit the build", () => {
    const [snap] = parseBuild(BUILD, 0);
    expect(snap._derived!.rating_flat, "one 500-rating weapon implicit, not two").toBe(500);
    const mainhandPhys = extractLines(BUILD, 0)
      .filter(l => l.slot === "mainHand" && /Gear Physical Damage/.test(l.text))
      .reduce((a, l) => a + parseFloat(l.text), 0);
    expect(snap.base.gear_phys_pct, "off-hand +49% Gear Phys must not land").toBe(mainhandPhys);
  });

  test("'for this gear' crit rating classifies locally, generic rating stays global", () => {
    expect(classify("+61% Attack Critical Strike Rating for this gear")[0]).toBe("special.local_crit_rating");
    expect(classify("+108% Critical Strike Rating")[0]).toBe("crit.rating_inc_pct");
  });
});

describe("combo economy (mechanics.md#combo-economy)", () => {
  test("reference derives 8 points: 2 starters x (1 base + recuperation + 2 ring lines)", () => {
    const [snap] = parseBuild(BUILD, 6);
    expect(snap.rotation.combo_points).toBe(8);
  });

  test("Animitta's +1 Finisher charge means TWO finishers, each consuming the full pool", () => {
    const [ref] = parseBuild(BUILD, 6);      // Heart of Animitta equipped
    expect(ref.rotation.finishers_per_cycle).toBe(2);
    const [lo0] = parseBuild(BUILD, 0);      // Vortex Heart — no charge
    expect(lo0.rotation.finishers_per_cycle).toBe(1);
    expect(lo0.rotation.combo_points, "points don't cap: rings + recuperation still count").toBe(8);
  });

  test("combo lines classify", () => {
    expect(classify("+1 Combo Points gained from Combo Starters")[0]).toBe("special.combo_per_starter");
    expect(classify("+1 Combo Finisher charge(s)")[0]).toBe("special.finisher_charges");
    expect(classify("+62% Combo Damage Enhancement if the Combo Finisher cast recently consumes at least 8 Combo Point(s)")[0])
      .toBe("special.combo_enh_conditional");
    expect(classify("+50% Combo Damage Enhancement")[0]).toBe("special.combo_enhancement");
    expect(classify("+80% Combo Finisher Amplification")[0]).toBe("rotation.finisher_amp_pct");
    expect(classify("Gains 2 Combo Point(s) on Critical Strike from Combo Finishers. Each skill cast can only trigger this effect once.")[0])
      .toBe("ignore");
  });

  test("enhancement is a summed pool, one multiplier — not per-point amp", () => {
    const [ref] = parseBuild(BUILD, 6);
    // amp = skill 30 + Animitta Amplification only; Enhancement (recuperation +
    // weapon/shield conditionals at 8 points) sums into additional.combo_enhancement
    expect(ref.rotation.finisher_amp_pct).toBeLessThan(150);
    expect(ref.additional.combo_enhancement).toBeGreaterThan(100);
  });
});

describe("legendary belt & necklace lines", () => {
  test("multi-line gear affixes split: ring's '+1 Combo Points' line is parsed, not swallowed", () => {
    const lines = extractLines(BUILD, 6).filter(l => l.slot === "ring1");
    expect(lines.some(l => l.text === "+1 Combo Points gained from Combo Starters")).toBe(true);
  });

  test("negative paired additional roll classifies with its sign", () => {
    const [path, value] = classify("-5% additional damage");
    expect(path).toBe("additional.misc");
    expect(value).toBe(-5);
  });

  test("positive standalone additional (Eternal Reign map pricing) classifies too", () => {
    const [path, value] = classify("+100% additional damage");
    expect(path).toBe("additional.misc");
    expect(value).toBe(100);
  });

  test("bodhi girdle: +4%/combo-point on crit is crit-gated and scaled by points", () => {
    expect(classify("+4% additional damage for every 1 Combo Point consumed on Critical Strike from Combo Finishers")[0])
      .toBe("special.addl_per_combo_crit");
    const [snap] = parseBuild(BUILD, 0);   // loadout 0 wears Bodhi, 7 points
    expect(snap.crit.additional_on_crit_pct ?? 0).toBeGreaterThanOrEqual(4 * snap.rotation.combo_points);
  });

  test("vortex heart flat-to-attacks lands in base.flat_added", () => {
    expect(classify("Adds 46 - 56 Physical Damage to Attacks and Spells")[0]).toBe("special.flat_added_phys");
    const [snap] = parseBuild(BUILD, 0);   // loadout 0 wears Vortex Heart
    expect(snap.base.flat_added_min).toBeGreaterThanOrEqual(46);
    expect(snap.base.flat_added_max).toBeGreaterThanOrEqual(56);
  });

  test("belt blend is extracted: Light Hunter's +1 Attack Skill Level", () => {
    const lines = extractLines(BUILD, 2).filter(l => l.slot === "belt");
    expect(lines.some(l => l.text === "+1 to Attack Skill Level")).toBe(true);
  });

  test("new ignores: ES charge lines, minion halves, Grace's non-crit Focus trigger", () => {
    for (const t of [
      "Energy Shield charge cannot be interrupted",
      "-6% additional Energy Shield Charge Speed for every 5% Energy Shield currently owned",
      "+77% Minion Damage",
      "Minions' Area Skills deal up to 32% additional damage to enemies at the center",
      "+20% chance for Non-Critical Strikes to grant 1 stack of Focus Blessing",
    ]) expect(classify(t)[0], t).toBe("ignore");
  });
});

describe("joined force (mechanics.md#joined-force)", () => {
  test("notables are extracted from selectedNotable* fields", () => {
    const lines = extractLines(BUILD, 0);
    expect(lines.some(l => /Off-Hand Weapon to the final damage/.test(l.text))).toBe(true);
  });

  test("60% of the off-hand weapon's own final damage rides into the main hand", () => {
    const [snap] = parseBuild(BUILD, 0);
    // off-hand: 154-154 implicit + 22-26 flat phys, x1.49 own gear phys, x0.6
    expect(snap.base.joined_weapon_phys).toBeCloseTo((154 + 24) * 1.49 * 0.6, 0);
    // off-hand 49-65 cold flat x0.6 joins the cold pool on top of the mainhand's
    const mh = extractLines(BUILD, 0).filter(l =>
      l.slot === "mainHand" && /Cold Damage to the gear/.test(l.text));
    expect(mh.length).toBeGreaterThan(0);
    expect(snap.base.weapon_flat_cold_min).toBeGreaterThan(49 * 0.6 - 1);
  });

  test("without the notable (sword+shield reference) nothing joins", () => {
    const [snap] = parseBuild(BUILD, 6);
    expect(snap.base.joined_weapon_phys ?? 0).toBe(0);
  });
});

describe("belt blend resolution", () => {
  test("named blends expand to their aromatic modifier lines via the gear cache", () => {
    const texts = extractLines(BUILD, 6).filter(l => l.slot === "belt").map(l => l.text);
    expect(texts).not.toContain("Caged Fury");
    expect(texts.some(t => /moved less than 12m.*\+35% additional damage/.test(t))).toBe(true);
  });

  test("still mode credits, moved mode ignores", () => {
    expect(classify("If you have moved less than 12m in the last 1s, +35% additional damage and +35% Physique")[0])
      .toBe("additional.misc");
    expect(classify("If you have moved 12m or more in the last 1s, +15% additional Attack Speed and +15% Movement Speed")[0])
      .toBe("ignore");
  });
});
