import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { maxRollText, impactOf, buildCatalog, SNAPSHOT } from "../src/catalog.js";
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
    // gem 29 -> 30: additional.skill_levels 90 -> 100, 2.00/1.90 - 1 = +5.26%
    expect(impactOf("extras.attack_skill_level", 1, s)).toBeCloseTo(5.26, 1);
    // 29 -> 31 crosses the band: +10 then +8 -> 90 + 18 = 108 pts
    expect(impactOf("extras.active_skill_level", 2, s)).toBeCloseTo((2.08 / 1.90 - 1) * 100, 1);
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
    expect(dd[0].tier).toBe("Core Talent");
    expect(dd[0].on).toContain("New God");
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
