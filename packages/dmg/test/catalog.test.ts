import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { maxRollText, impactOf, applyStat, buildCatalog, SNAPSHOT } from "../src/catalog.js";
import { deepCopy } from "../src/py.js";
import type { Snapshot } from "../src/damageModel.js";

const loadSnap = (): Snapshot => JSON.parse(fs.readFileSync(SNAPSHOT, "utf-8"));
/* buildCatalog is pure; built once and shared across tests (pytest rebuilt per test) */
const rows = buildCatalog();

describe("scoring", () => {
  test("max roll text uses range maxima", () => {
    expect(maxRollText("+#% Critical Strike Damage", "+(38–42)% Critical Strike Damage"))
      .toBe("+42% Critical Strike Damage");
    expect(maxRollText("+#% Skill Area", "+(39–45)% Skill Area")).toBe("+45% Skill Area");
    expect(maxRollText("+16% Attack Speed", "+16% Attack Speed")).toBe("+16% Attack Speed");
  });

  test("impact of direct bucket", () => {
    const d = impactOf("penetration.cold_pct", 10, loadSnap());
    expect(d).toBeGreaterThan(8.5);      // res layer at 41 pen: 1.21/1.11 = +9.01
    expect(d).toBeLessThan(9.5);
  });

  test("impact of extras conversion", () => {
    const s = loadSnap();
    const d = impactOf("extras.fervor_effect_pct", 50, s);
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(0);
    // +0.3 finisher amp + 0.5 crit-gated additional per level (L30-band slopes)
    expect(impactOf("extras.support_skill_level", 10, s)).toBeGreaterThan(2);
  });

  test("aura closed form at +0% reproduces the snapshot's precise_auras", () => {
    const s = loadSnap();
    // Fearless 30x1.25, Cruelty 22x(1.25+1.00 self-ramp at 40 stacks), Domain 33x1.25
    // 1.375 * 1.55 * 1.4125 - 1 = +201.0
    expect(impactOf("extras.aura_effect_pct", 0, s)).toBeCloseTo(0, 1);
    expect(s.additional.precise_auras).toBeCloseTo(201.0, 1);
  });

  test("impact of +N gem levels is marginal from the build's current level", () => {
    const s = loadSnap();
    // each level is its own multiplier: gem 29 -> 30 is exactly x1.10 (user 2026-07-16)
    expect(impactOf("extras.attack_skill_level", 1, s)).toBeCloseTo(10.0, 1);
    // 29 -> 31 crosses the band: 1.10 x 1.08 - 1 = +18.8%
    expect(impactOf("extras.active_skill_level", 2, s)).toBeCloseTo(18.8, 1);
  });

  test("Persistent / Physical Skill Levels land on the main gem; All Skills' pays supports too", () => {
    const one = (t: string) => rows.find(r => r.text === t);
    // Spectral Slash carries the Persistent and Physical tags (user 2026-07-16)
    expect(one("+1 Persistent Skill Level")!.delta).toBeCloseTo(10.0, 0);
    expect(one("+1 Physical Skill Level")!.delta).toBeCloseTo(10.0, 0);
    const all = one("+1 to All Skills' Levels")!;
    expect(all.delta).toBeGreaterThan(10);   // main gem x1.10 plus the support-gem slopes
    // the conversion-blocking variant kills the phys->cold engine: whole mod dead
    const blocked = rows.find(r => r.text.includes("can't be converted"))!;
    expect(blocked.delta).toBeNull();
  });

  test("Strength joins ONE summed layer: %Strength scales the tracked pool, flat adds to it", () => {
    const s = loadSnap();
    // tracked strength = additional.strength / 0.5; +12% of 332 = +39.8 pts -> +19.9
    // into the 166-pt layer: 2.859/2.66 - 1 = +7.5%, NOT a fresh x1.199 multiplier
    const pct = rows.find(r => r.text === "+12% Strength")!;
    expect(pct.delta).not.toBeNull();
    expect(pct.delta!).toBeGreaterThan(6);
    expect(pct.delta!).toBeLessThan(9);
    // +30 flat Str = +15 pts summed: 2.81/2.66 - 1 = +5.6%, not +15%
    const flat = impactOf("extras.strength", 30, s)!;
    expect(flat).toBeGreaterThan(4.5);
    expect(flat).toBeLessThan(7);
  });

  test("aura effect scales the crit-rating and attack-speed aura lines too", () => {
    const s = loadSnap();
    const s2 = deepCopy(s);
    delete (s2 as any)._extras;
    expect(applyStat(s2, "extras.aura_effect_pct", 25)).toBe(true);
    // Precise: Fearless +80% crit rating x aura effect (mechanics.md#precise-fearless)
    expect(s2.crit.chance_pct).toBeGreaterThan(s.crit.chance_pct);
    // and its +8% melee attack speed line
    expect(s2.rotation.attack_speed_inc_pct).toBeCloseTo(s.rotation.attack_speed_inc_pct + 2, 1);
  });

  test("no Spell Burst in build: Play Safe scores nothing", () => {
    const spellBurst = rows.find(r => /skills cast by Spell Burst/.test(r.text));
    expect(spellBurst, "fixture mod vanished from catalog").toBeTruthy();
    expect(spellBurst!.delta).toBeNull();
  });

  test("'recently moved' is satisfiable (move -> stand -> attack cycle): conditional, not dead", () => {
    const moved = rows.find(r => /recently moved more than/.test(r.text));
    expect(moved, "fixture mod vanished from catalog").toBeTruthy();
    expect(moved!.delta).toBe(30);
    expect(moved!.cond).toBe(true);
  });

  test("penetration slate mods score against their mitigation layer", () => {
    const cold = rows.find(r => /^1.5% Cold Penetration/.test(r.text));
    expect(cold, "fixture mod vanished from catalog").toBeTruthy();
    expect(cold!.delta).toBeGreaterThan(1.3);          // res layer at 41 pen: 1.125/1.11 = +1.35
    const armor = rows.find(r => /^\+8% Armor DMG Mitigation Penetration/.test(r.text));
    expect(armor, "fixture mod vanished from catalog").toBeTruthy();
    expect(armor!.delta).toBeGreaterThan(8);           // ring has 21 pen: 0.99/0.91 = +8.79
  });

  test("rows sorted and tagged", () => {
    expect(rows.length).toBeGreaterThan(100);
    const deltas = rows.filter(r => r.delta !== null).map(r => r.delta!);
    expect(deltas).toEqual([...deltas].sort((a, b) => b - a));
    expect(rows.some(r => r.cat.startsWith("memory"))).toBe(true);
    expect(rows.some(r => r.cat.startsWith("slate"))).toBe(true);
    for (const r of rows) {
      for (const k of ["cat", "name", "text", "bucket", "delta", "cond"]) expect(k in r).toBe(true);
    }
  });
});

describe("applicability rules", () => {
  test("not-this-build tags are unmodeled", () => {
    const focus = rows.filter(r => r.text.includes("Focus Skill Damage"));
    expect(focus.length).toBeGreaterThan(0);
    expect(focus.every(r => r.delta === null)).toBe(true);
  });

  test("dual wield mods dropped entirely", () => {
    expect(rows.filter(r => r.text.toLowerCase().includes("dual wield"))).toEqual([]);
  });

  test("chance procs use expected value", () => {
    const procs = rows.filter(r => r.text.includes("chance for that cast to deal"));
    expect(procs.length, "proc mod missing from catalog").toBeGreaterThan(0);
    for (const r of procs) {
      expect(r.delta).not.toBeNull();
      expect(r.delta!).toBeLessThan(10);
    }
  });

  test("crit nullify mods score negative", () => {
    const nullify = rows.filter(r => r.text.includes("do not deal additional damage"));
    expect(nullify.length, "crit-nullify mod missing").toBeGreaterThan(0);
    for (const r of nullify) {
      expect(r.delta).not.toBeNull();
      expect(r.delta!).toBeLessThan(0);
    }
  });

  test("Tenacity-devour mods unmodeled: build has no Tenacity Blessing source", () => {
    const dd = rows.filter(r => r.name === "Dying Dragon");
    expect(dd.length, "Dying Dragon missing from catalog").toBeGreaterThan(0);
    expect(dd.every(r => r.delta === null)).toBe(true);
  });

  test("copy-talent utility slate mods dropped: humans place those by hand", () => {
    expect(rows.filter(r => /Copies the .* Talent/i.test(r.text))).toEqual([]);
  });

  test("Proximity mods are not this build", () => {
    const prox = rows.filter(r => /in proximity/i.test(r.text));
    expect(prox.length).toBeGreaterThan(0);
    expect(prox.every(r => r.delta === null || !/proximity/i.test(r.bucket))).toBe(true);
    const taken = rows.find(r => r.text === "+15% additional damage taken by enemies in Proximity")!;
    expect(taken.delta).toBeNull();
  });

  test("standalone additional Min/Max Damage lines shift the average roll: half value", () => {
    const s = loadSnap();
    const max12 = rows.find(r => r.text.startsWith("+12% additional Max Damage"))!;
    // (0 + 12)/2 = +6 average, and the 'for Minions' line is dead here
    expect(max12.delta).toBeCloseTo(impactOf("additional.misc", 6, s)!, 1);
  });

  test("'Every 1 s, ... for the next Main Skill used' wording is EV-priced too", () => {
    const m = rows.find(r => /^Every 1 s, \+10% additional Melee Damage for the next Main Skill/.test(r.text))!;
    // one armed buff/s vs ~6 skill uses/s: EV ~ 10/6, nowhere near the +10 headline
    expect(m.delta).not.toBeNull();
    expect(m.delta!).toBeLessThan(3);
    expect(m.cond).toBe(false);
  });

  test("'next Main Skill every 0.5s' buffs one use per interval, not every hit", () => {
    const m = rows.filter(r => /next Main Skill every 0\.5 s/.test(r.text));
    expect(m.length, "Momentum missing from catalog").toBeGreaterThan(0);
    // ~6.2 skill uses/s vs 2 armed buffs/s: 30 x 2/6.2 = ~9.7 EV, not the +30 headline
    expect(m[0].delta).not.toBeNull();
    expect(m[0].delta!).toBeGreaterThan(8);
    expect(m[0].delta!).toBeLessThan(11);
    expect(m[0].cond).toBe(false);   // EV is not a full-uptime ceiling
  });

  test("per-level elemental malus scales with character level and hits converted cold", () => {
    const b = rows.filter(r => r.name === "Brutality" && /for every 3 level/.test(r.text));
    expect(b.length, "Brutality missing from catalog").toBeGreaterThan(0);
    // all damage converts to cold, so the elemental malus applies to everything:
    // 1.30 x (1 - 33/100) = 0.871 -> net negative
    expect(b[0].delta).not.toBeNull();
    expect(b[0].delta!).toBeLessThan(0);
  });

  test("enemy Injury Buffer is a deduction delay, not mitigation: ignored", () => {
    const blunt = rows.filter(r => r.name === "Blunt" && r.text.includes("Injury Buffer"));
    expect(blunt.length, "Blunt missing from catalog").toBeGreaterThan(0);
    expect(blunt[0].delta).toBe(30);   // its +30% phys line alone (mechanics.md Injury Buffer row)
  });

  test("Hidden Mastery scores its Aggression line at full uptime", () => {
    const hm = rows.find(r => r.name === "Hidden Mastery");
    expect(hm, "Hidden Mastery missing from catalog").toBeTruthy();
    // +15% AS and x1.15 additional: the additional alone is +15
    expect(hm!.delta).not.toBeNull();
    expect(hm!.delta!).toBeGreaterThan(15);
    expect(hm!.cond).toBe(true);
  });

  test("Formless annotated as the warcry cap-doubler, not left unmodeled", () => {
    const f = rows.find(r => r.name === "Formless");
    expect(f, "Formless missing from catalog").toBeTruthy();
    expect(f!.delta).toBeNull();
    expect(f!.bucket).toMatch(/warcry.*cap|cap.*warcry/i);
  });

  test("+4 min Warcry enemies is real DPS: 8 -> 12 of the Formless-doubled 16-stack cap", () => {
    const r = rows.find(r => r.cat === "slate"
      && /minimum number of enemies affected by Warcry/.test(r.text));
    expect(r, "min-enemies slate mod missing").toBeTruthy();
    expect(r!.delta!).toBeGreaterThan(10);
  });

  test("'Attack Speed and Cast Speed' survives the cast-only filter; per-stack lines pay full stacks", () => {
    // 7%/3m x 3 stacks = +21% attack speed; move->stand->attack keeps movement 'recent'
    const t = rows.find(r => r.name === "Third time's a charm");
    expect(t, "Third time's a charm missing from catalog").toBeTruthy();
    expect(t!.delta).not.toBeNull();
    expect(t!.cond).toBe(true);
    const plain = rows.find(r => r.text === "+6% Attack and Cast Speed");
    expect(plain, "plain hybrid-speed mod missing").toBeTruthy();
    expect(plain!.delta).not.toBeNull();
    // "for each time you have Regained ... Stacks up to 8": a full-uptime ceiling, so ◑
    const regained = rows.find(r => /for each time you have Regained.*Stacks up to 8/.test(r.text));
    expect(regained, "Regained-stacks mod missing").toBeTruthy();
    expect(regained!.delta).not.toBeNull();
    expect(regained!.cond).toBe(true);
  });

  test("pure Cast Speed mods still score nothing", () => {
    const pure = rows.find(r => r.text === "+6% Cast Speed");
    expect(pure, "pure cast-speed mod missing").toBeTruthy();
    expect(pure!.delta).toBeNull();
  });

  test("memory base stats excluded", () => {
    expect(rows.filter(r => r.cat === "memory baseStats")).toEqual([]);
  });

  test("projectile plural excluded", () => {
    const proj = rows.filter(r => /Projectiles?/.test(r.text));
    expect(proj.every(r => r.delta === null)).toBe(true);
  });

  test("tradeoff mods score net, not best line", () => {
    const trade = rows.filter(r => r.text.includes("-20% additional damage for Weapons"));
    expect(trade.length, "tradeoff mod missing").toBeGreaterThan(0);
    // net of x0.80 and x1.40 is ~x1.12, far below the +40 headline
    for (const r of trade) {
      expect(r.delta).not.toBeNull();
      expect(r.delta!).toBeLessThan(15);
    }
  });

  test("ES-zeroing and low-life mods not applicable", () => {
    const es0 = rows.filter(r => r.text.includes("Energy Shield is fixed at 0"));
    expect(es0.length).toBeGreaterThan(0);
    expect(es0.every(r => r.delta === null)).toBe(true);
    // gains gated on BEING at low life don't work with ES as the defensive layer
    const lowlife = rows.filter(r => /(?<!not )at Low Life/.test(r.text) && r.delta !== null);
    expect(lowlife.filter(r => r.bucket.includes("additional")
                            && !r.text.includes("not at Low Life"))).toEqual([]);
  });

  test("increased 'damage against Low Life enemies' is HP-gated, not full uptime", () => {
    const r = rows.find(r => r.text === "+50% damage against Low Life enemies")!;
    expect(r.bucket).not.toBe("increased.global");
    // +50 joins the increased pool only below 35% boss HP: harmonic EV over HP share
    expect(r.delta!).toBeGreaterThan(0);
    expect(r.delta!).toBeLessThan(4);
  });

  test("'not at Low Life' still modeled", () => {
    const ok = rows.filter(r => r.text.includes("when not at Low Life"));
    expect(ok.length).toBeGreaterThan(0);
    expect(ok.some(r => r.delta !== null)).toBe(true);
  });
});

describe("tier and spawn info", () => {
  test("rows carry tier and spawn info", () => {
    for (const r of rows) {
      expect("tier" in r && "on" in r).toBe(true);
    }
    const dd = rows.filter(r => r.name === "Dying Dragon");
    expect(dd.length).toBeGreaterThan(0);
    // core talents carry their level: Pedigree's 3rd slot rolls Lv.1 cores only
    expect(dd[0].tier).toBe("Lv.2 Core Talent");
    expect(dd[0].on).toContain("New God");
    const lv1 = rows.filter(r => r.tier === "Lv.1 Core Talent");
    expect(lv1.length).toBeGreaterThan(100);
    const conv = rows.filter(r => r.text.includes("Physical Damage to Cold Damage"));
    expect(conv.length).toBeGreaterThan(0);
    expect(conv[0].tier).toBe("Legendary Medium Talent");
    expect(conv[0].on).toContain("Prophet");
    const mem = rows.filter(r => r.cat === "memory");
    expect(mem.length).toBeGreaterThan(0);
    expect(mem.some(r => r.on)).toBe(true);
  });

  test("duplicate descs merge spawn slates", () => {
    expect(rows.some(r => r.cat === "slate" && r.on.includes(","))).toBe(true);
  });
});
