import { describe, expect, test } from "vitest";
import { extractLines, substitute, fillTemplate, classify, parseBuild, skillLevelAdditionalPct } from "../src/buildParser.js";
import { cycleDps } from "../src/damageModel.js";
import { fromRoot } from "../src/py.js";

const BUILD = fromRoot("data/Rehan.json");

describe("skill levels past 20", () => {
  test("bands: +10%/level for 21-30, +8%/level past 30", () => {
    expect(skillLevelAdditionalPct(0)).toBe(0);
    expect(skillLevelAdditionalPct(9)).toBe(90);
    expect(skillLevelAdditionalPct(10)).toBe(100);
    expect(skillLevelAdditionalPct(12)).toBe(116);
  });
  test("real build: +9 net gem levels land in additional.skill_levels", () => {
    const [snap] = parseBuild(BUILD);
    expect(snap.additional.skill_levels).toBe(90);
  });
});

describe("spectral slash support gems", () => {
  test("still attack grants willpower: 6 stacks x 6%, compounding", () => {
    const [snap] = parseBuild(BUILD);
    // (1.06^6 - 1) * 100; stationary bossing = full uptime
    expect(snap.additional.willpower).toBeCloseTo(41.85, 1);
  });
  test("recuperation amp read at L30: gem 20 + 10 support levels", () => {
    const [snap] = parseBuild(BUILD);
    // amp table 5.5 (Lv1) -> 15.5 (Lv21) -> 21.5 (Lv41); L30 = 18.2; skill 30 + gear 203 parsed
    expect(snap.rotation.finisher_amp_pct).toBeCloseTo(251.2, 1);
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
  test("legion adds one clone vs boss (1 enemy in range), loadout 0 stays at 4", () => {
    const [snap] = parseBuild(BUILD);
    expect(snap.rotation.clones).toBe(5);
    const [snap0] = parseBuild(BUILD, 0);
    expect(snap0.rotation.clones).toBe(4);
  });

  test("loadout 0 willpower support lands, unknown supports reported not dropped", () => {
    const [snap, report] = parseBuild(BUILD, 0);
    expect(snap.additional.willpower).toBeCloseTo(41.85, 1);
    expect(report.manual.some(e => e.mode === "unmodeled" && String(e.path).includes("Steamroll"))).toBe(true);
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
    // corroded Ghost Slaughter: 1%/rating x 100 sustained rating x (1 + 2.08 Fervor Effect)
    const [snap] = parseBuild(BUILD);                    // more_1: Ghost Slaughter equipped
    expect(Math.abs(snap.additional.fervor - 308)).toBeLessThanOrEqual(1);
  });

  test("no fervor damage source means no fervor bucket", () => {
    const [snap] = parseBuild(BUILD, 0);                 // no Ghost Slaughter
    expect(snap.additional.fervor).toBe(0);
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
    // pactspirit crit-rating nodes must actually land, not vanish into a constant
    const [snap] = parseBuild(BUILD);
    expect(Math.abs(snap.crit.chance_pct - 69.35)).toBeLessThanOrEqual(0.1);
  });

  test("warcry layer is derived from parsed effect", () => {
    const [snap] = parseBuild(BUILD);
    expect(Math.abs(snap.additional.warcry_buffs - 109.7)).toBeLessThanOrEqual(0.5);
  });
});
