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
    expect(row.note).toBeNull();
    expect(row.rungs.every(r => r.linear), "same sword, bigger numbers — no reworks").toBe(true);
    const dps = row.rungs.map(r => r.dps!);
    expect(dps).toEqual([...dps].sort((a, b) => a - b));
  });

  test("ghost slaughter is flagged as a rework and still priced", () => {
    const rungs = slot("gloves").rungs;
    expect(rungs.map(r => r.linear)).toEqual([true, true, false]);
    const gs = rungs[rungs.length - 1];
    expect(gs.label).toBe("Ghost Slaughter");
    expect(gs.rework!.anchor).toBe("#b-fervor");
    expect(gs.gain!, "the Fervor damage base effect is the biggest step on the page")
      .toBeGreaterThan(100);
  });

  test("offhand is priced: linear sword rungs, then the shield rework", () => {
    const row = slot("offHand");
    expect(row.note).toBeNull();
    expect(row.rungs.map(r => r.linear)).toEqual([true, true, false]);
    expect(row.rungs.every(r => r.dps !== null)).toBe(true);
    const shield = row.rungs[2];
    expect(shield.rework!.anchor).toBe("#b-warcry");
  });

  test("priced rare rungs break down stat by stat with craft-pool costs", () => {
    const pr = slot("mainHand").rungs.find(r => r.label.startsWith("PRICELESS"))!;
    expect(pr.mods!.length).toBeGreaterThanOrEqual(5);
    const phys = pr.mods!.find(m => m.text.includes("Gear Physical Damage"))!;
    expect(phys.pool, "tlidb craft page lists Gear Phys under Advanced").toBe("advanced");
    expect(phys.cost).toBe(3);
    expect(phys.gain).toBeGreaterThan(0);
    const pers = pr.mods!.filter(m => m.per !== null).map(m => m.per!);
    expect(pers, "sorted by ΔDPS per craft cost").toEqual([...pers].sort((a, b) => b - a));
    expect(pr.mods!.every(m => m.pool === null || ["basic","advanced","ultimate"].includes(m.pool)))
      .toBe(true);
  });

  test("slots the model cannot price carry a note and no numbers", () => {
    for (const s of ["boots", "necklace", "belt"]) {
      const row = slot(s);
      expect(row.note, `${s} must explain itself`).toBeTruthy();
      expect(row.rungs.every(r => r.dps === null && r.gain === null)).toBe(true);
    }
  });

  test("vorax boots appear as a rung even though unparsed", () => {
    const labels = slot("boots").rungs.map(r => r.label);
    expect(labels[labels.length - 1].startsWith("Dawn Break"),
           "never imply a rare rung is the top of this slot").toBe(true);
  });
});
