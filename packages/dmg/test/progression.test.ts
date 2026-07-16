import { describe, expect, test } from "vitest";
import { buildRows, ladders, _load, type LadderRow } from "../src/progression.js";

const ROWS = buildRows();
const slot = (name: string): LadderRow => ROWS.find(r => r.slot === name)!;

describe("gear ladder", () => {
  test("rungs dedupe by label despite reused item ids", () => {
    // every loadout stores its own copy of an item under the SAME id, re-rolled in place
    const rungs = ladders(_load()).mainHand;
    expect(rungs.map(r => r.label)).toEqual([
      "i82 Mainhand SPEED/CRIT", "i86 Mainhand SPEED/CRIT",
      "PRICELESS Mainhand SPEED/CRIT", "MIRROR-WORTHY"]);
  });

  test("mainhand ladder is linear and monotonic", () => {
    const row = slot("mainHand");
    expect(row.rungs.every(r => r.linear), "same sword, bigger numbers — no reworks").toBe(true);
    const dps = row.rungs.map(r => r.dps!);
    expect(dps).toEqual([...dps].sort((a, b) => a - b));
  });

  test("every rung on every slot is priced", () => {
    for (const row of ROWS) {
      expect(row.rungs.every(r => r.dps !== null), row.slot).toBe(true);
    }
  });

  test("reworks are dependency-based: only ES boots and Ghost Slaughter", () => {
    const flagged = ROWS.flatMap(r => r.rungs.filter(g => g.rework).map(g => [r.slot, g.label]));
    expect(flagged).toEqual([["gloves", "Ghost Slaughter"], ["boots", "i86 ES"]]);
  });

  test("ghost slaughter is flagged (dead without the Fervor engine) and priced", () => {
    const gs = slot("gloves").rungs.at(-1)!;
    expect(gs.label).toBe("Ghost Slaughter");
    expect(gs.rework!.anchor).toBe("#b-fervor");
    expect(gs.rework!.label).toBe("+ Vorax boot");
    expect(gs.gain!).toBeGreaterThan(100);
  });

  test("boots: Grace -> i86 ES is the rework (Focus Blessing source), Dawn Break is linear", () => {
    const rungs = slot("boots").rungs;
    expect(rungs.map(r => [r.label.split(" ")[0], r.rework?.anchor ?? null])).toEqual([
      ["Grace", null], ["i86", "#b-cold"], ["Dawn", null]]);
    expect(rungs[1].rework!.label).toBe("+ Focus Blessing on hit Slate");
    const db = rungs.at(-1)!;
    expect(db.linear, "pure gain, nothing breaks").toBe(true);
    expect(db.gain!, "holding Fervor turns on the engine and most of the crit pile")
      .toBeGreaterThan(100);
  });

  test("offhand: sword rungs carry Joined Force's 60%; the shield is a small linear step over them", () => {
    const row = slot("offHand");
    expect(row.rungs.map(r => r.linear)).toEqual([true, true, true]);
    const shield = row.rungs[2];
    expect(shield.rework).toBeNull();
    expect(shield.gain!, "shield utility ≈ the sword's Joined Force contribution, plus a bit")
      .toBeGreaterThan(0);
  });

  test("necklace is priced: Vortex -> Heart of Animitta is linear with a real gain", () => {
    const rungs = slot("necklace").rungs;
    expect(rungs.map(r => r.label)).toEqual(["Vortex Heart", "Heart of Animitta"]);
    expect(rungs.every(r => r.linear && r.dps !== null)).toBe(true);
    expect(rungs[1].gain!, "the 8th combo point + 80% finisher amp").toBeGreaterThan(10);
  });

  test("belt is priced: Bodhi's crit line is the only real DPS drop", () => {
    const rungs = slot("belt").rungs;
    expect(rungs.map(r => r.label)).toEqual(["Bodhi Girdle", "Light Hunter Belt", "Eternity"]);
    expect(rungs.every(r => r.linear && r.dps !== null)).toBe(true);
    expect(rungs[1].gain!, "leaving Bodhi's +4%/combo-point-on-crit").toBeLessThan(0);
  });

  test("Eternity prices at its map state (120 stacks + 10 Reign), flagged '(map)'", () => {
    const et = slot("belt").rungs.at(-1)!;
    expect(et.label).toBe("Eternity");
    expect(et.gainNote).toBe("map");
    expect(et.gain!, "SS13 Morale/Nightmare/Reign at 120/120/10 stacks").toBeGreaterThan(0);
    expect(et.note).toMatch(/kill-fed/);
    expect(et.note).toMatch(/120 stacks/);
  });

  test("rare rungs price as a range: entry at tier-below rolls, top when fully crafted", () => {
    const pr = slot("mainHand").rungs.find(r => r.label.startsWith("PRICELESS"))!;
    expect(pr.gainTop).not.toBeNull();
    expect(pr.gainTop!).toBeGreaterThan(pr.gain!);
    const grace = slot("boots").rungs[0];
    expect(grace.gainTop, "legendaries have no craft range").toBeNull();
  });

  test("priced rare rungs break down stat by stat with craft-pool costs", () => {
    const pr = slot("mainHand").rungs.find(r => r.label.startsWith("PRICELESS"))!;
    expect(pr.mods!.length).toBeGreaterThanOrEqual(5);
    const phys = pr.mods!.find(m => m.text.includes("Gear Physical Damage"))!;
    expect(phys.pool, "tlidb craft page lists Gear Phys under Advanced").toBe("advanced");
    expect(phys.cost).toBe(3);
    expect(phys.vs, "T0 roll is priced against the T1 ceiling, not against removal")
      .toBe("+100% Gear Physical Damage");
    expect(phys.gain).toBeGreaterThan(0);
    expect(phys.gain, "the tier step, not the whole +124% line").toBeLessThan(30);
    const pers = pr.mods!.filter(m => m.per !== null).map(m => m.per!);
    expect(pers, "sorted by ΔDPS per craft cost").toEqual([...pers].sort((a, b) => b - a));
    expect(pr.mods!.every(m => m.pool === null || ["basic","advanced","ultimate"].includes(m.pool)))
      .toBe(true);
  });

  test("vorax boots appear as the top rung", () => {
    const labels = slot("boots").rungs.map(r => r.label);
    expect(labels.at(-1)!.startsWith("Dawn Break"),
           "never imply a rare rung is the top of this slot").toBe(true);
  });
});
