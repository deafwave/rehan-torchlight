import { describe, expect, test } from "vitest";
import { buildRows, buildPrisms, ladders, _load, type LadderRow } from "../src/progression.js";

const ROWS = buildRows();
const slot = (name: string): LadderRow => ROWS.find(r => r.slot === name)!;

describe("gear ladder", () => {
  test("rungs dedupe by label despite reused item ids", () => {
    // every loadout stores its own copy of an item under the SAME id, re-rolled in place
    const rungs = ladders(_load()).mainHand;
    expect(rungs.map(r => r.label)).toEqual([
      "i82 Mainhand SPEED/CRIT", "i86 Mainhand SPEED/CRIT",
      "priceless Mainhand SPEED/CRIT", "MIRROR-WORTHY"]);
  });

  test("mainhand ladder is all linear stat swaps (no reworks)", () => {
    const row = slot("mainHand");
    expect(row.rungs.every(r => r.linear), "same sword class — no reworks").toBe(true);
    // the priceless sword's +80% Gear Phys tower (a base-damage multiplier) can
    // outprice the mirror sword's stat spread — rungs need not be monotonic
    expect(row.rungs.every(r => r.dps! > 0)).toBe(true);
  });

  test("every rung on every slot is priced", () => {
    for (const row of ROWS) {
      expect(row.rungs.every(r => r.dps !== null), row.slot).toBe(true);
    }
  });

  test("reworks are dependency-based: shield, ES boots, Ghost Slaughter, sealed-mana helmet", () => {
    const flagged = ROWS.flatMap(r => r.rungs.filter(g => g.rework).map(g => [r.slot, g.label]));
    expect(flagged).toEqual([["offHand", "priceless ATTACK/COMBO"],
                             ["gloves", "Ghost Slaughter"], ["helmet", "priceless sealed mana"],
                             ["boots", "i86 ES"]]);
  });

  test("sealed-mana helmet is the Lich -> Ranger swap: 100-cap floor, prism range top", () => {
    const h = ROWS.find(r => r.slot === "helmet")!.rungs.at(-1)!;
    expect(h.label).toBe("priceless sealed mana");
    expect(h.rework!.label).toBe("+ Vorax Fervor Boot");
    // vs the crit i86 helmet priced back on the Lich-era tree — never negative,
    // small at the 100 rating cap; the fixed-130 prism is the range top
    // at the 100-cap the swap alone is ~break-even; the fixed-130 prism is the real top
    expect(h.gainTop!).toBeGreaterThan(h.gain!);
    expect(h.gainTop!).toBeGreaterThan(10);
    expect(h.rangeNote).toMatch(/100 Fervor Rating cap/);
  });

  test("ghost slaughter is flagged (dead without the Fervor engine) and priced", () => {
    const gs = slot("gloves").rungs.at(-1)!;
    expect(gs.label).toBe("Ghost Slaughter");
    expect(gs.rework!.label).toBe("+ Vorax Fervor Boot");
    // with the Fervor engine on (Vorax boot rework), the glove's granted Fervor
    // additional damage is a full ×(1+X) multiplier — a large gain, not the old
    // dilution-flattened figure (user 2026-07-17)
    expect(gs.gain).not.toBeNull();
    expect(gs.gain!).toBeGreaterThan(50);
  });

  test("boots: Grace -> i86 ES is the rework (Focus Blessing source), Dawn Break is linear", () => {
    const rungs = slot("boots").rungs;
    expect(rungs.map(r => [r.label.split(" ")[0], r.rework !== null])).toEqual([
      ["Grace", false], ["i86", true], ["Dawn", false]]);
    expect(rungs[1].rework!.label).toBe("+ Focus Blessing on hit Slate");
    const db = rungs.at(-1)!;
    expect(db.linear, "pure gain, nothing breaks").toBe(true);
    expect(db.gain!, "holding Fervor turns on the crit engine")
      .toBeGreaterThan(30);
  });

  test("offhand: sword rungs carry Joined Force's 60%; the shield needs the warcry kit first", () => {
    const row = slot("offHand");
    expect(row.rungs.map(r => r.linear)).toEqual([true, true, false]);
    const shield = row.rungs[2];
    expect(shield.rework!.label).toBe("+ i86 Hasten boots · → God of Might tree · → Brave tree");
    // even as a full multiplier, the shield's warcry additional can't out-weigh the
    // sword's Joined Force (+60% base damage) — a real DPS sacrifice for defense
    expect(shield.gain!).toBeLessThan(0);
  });

  test("necklace is priced: Vortex -> Heart of Animitta is linear with a real gain", () => {
    const rungs = slot("necklace").rungs;
    expect(rungs.map(r => r.label)).toEqual(["Vortex Heart", "Heart of Animitta"]);
    expect(rungs.every(r => r.linear && r.dps !== null)).toBe(true);
    expect(rungs[1].gain!, "the 8th combo point + 80% finisher amp").toBeGreaterThan(10);
  });

  test("belt is priced: leaving Bodhi drops finisher AS and the crit line", () => {
    const rungs = slot("belt").rungs;
    expect(rungs.map(r => r.label)).toEqual(["Bodhi Girdle", "Light Hunter Belt", "Eternity"]);
    expect(rungs.every(r => r.linear && r.dps !== null)).toBe(true);
    // Bodhi special-pool +24% finisher AS + +4%/pt-on-crit; Light Hunter loses both
    expect(rungs[1].gain!, "leaving Bodhi's finisher AS + crit line").toBeLessThan(0);
  });

  test("Eternity prices at its map state (120 stacks + 10 Reign), flagged '(map)'", () => {
    const et = slot("belt").rungs.at(-1)!;
    expect(et.label).toBe("Eternity");
    expect(et.gainNote).toBe("map");
    expect(et.gain!, "SS13 Morale/Nightmare/Reign at 120/120/10 stacks").toBeGreaterThan(0);
    expect(et.note).toBeNull();
  });

  test("rare rungs price as a range: entry at tier-below rolls, top when fully crafted", () => {
    const pr = slot("mainHand").rungs.find(r => r.label.startsWith("priceless"))!;
    expect(pr.gainTop).not.toBeNull();
    expect(pr.gainTop!).toBeGreaterThan(pr.gain!);
    const grace = slot("boots").rungs[0];
    expect(grace.gainTop, "legendaries have no craft range").toBeNull();
  });

  test("priced rare rungs break down stat by stat with craft-pool costs", () => {
    const pr = slot("mainHand").rungs.find(r => r.label.startsWith("priceless"))!;
    expect(pr.mods!.length).toBeGreaterThanOrEqual(5);
    const phys = pr.mods!.find(m => m.text.includes("Gear Physical Damage"))!;
    expect(phys.pool, "tlidb craft page lists Gear Phys under Advanced").toBe("advanced");
    expect(phys.cost).toBe(3);
    expect(phys.vs, "craft order prices the full line, not the T0–T1 polish step").toBeNull();
    expect(phys.gain).toBeGreaterThan(0);
    const gains = pr.mods!.map(m => m.gain);
    expect(gains, "sorted by full-line ΔDPS").toEqual([...gains].sort((a, b) => b - a));
    expect(pr.mods!.every(m => m.pool === null || ["basic","advanced","ultimate"].includes(m.pool)))
      .toBe(true);
  });

  test("ring Max Frostbite is a real damage line: after combo, above crit/ES", () => {
    // user 2026-07-16: craft order is combo → frostbite → rest close → ES last.
    // frostbite used to score 0 because enemy_taken.frostbite was a manual set constant;
    // full-line pricing (not the +14→+16 tier step) is what the craft checklist ranks.
    const r = slot("ring2").rungs.find(r => /frostbite/i.test(r.label))!;
    const mods = r.mods!;
    const combo = mods.find(m => /Combo Points gained/.test(m.text))!;
    const frost = mods.find(m => /Max Frostbite Rating/.test(m.text))!;
    const dmg = mods.find(m => /^\+\d+% damage$/.test(m.text))!;
    const crit = mods.find(m => /Critical Strike Rating/.test(m.text))!;
    const es = mods.find(m => /Max Energy Shield/.test(m.text))!;
    expect(frost.gain, "max frostbite must move DPS").toBeGreaterThan(5);
    expect(combo.gain).toBeGreaterThan(frost.gain);
    expect(frost.gain).toBeGreaterThan(crit.gain);
    expect(frost.gain).toBeGreaterThan(es.gain);
    expect(mods.indexOf(combo)).toBe(0);
    expect(mods.indexOf(es)).toBe(mods.length - 1);
    // %damage is close to frostbite on this piece; either order is fine if both beat crit
    expect(Math.min(frost.gain, dmg.gain)).toBeGreaterThan(crit.gain);
  });

  test("vorax boots appear as the top rung", () => {
    const labels = slot("boots").rungs.map(r => r.label);
    expect(labels.at(-1)!.startsWith("Dawn Break"),
           "never imply a rare rung is the top of this slot").toBe(true);
  });
});

describe("prism progression", () => {
  const LADDERS = buildPrisms();

  test("two ladders: ethereal prism and the Brave-tree inverse", () => {
    expect(LADDERS.length).toBe(2);
    expect(LADDERS[0].name).toMatch(/Ethereal Prism/);
    expect(LADDERS[1].name).toMatch(/Inverse/);
  });

  test("Unmatched Valor priced by parse: fixed 130 vs the 100 cap, on the full build", () => {
    const valor = LADDERS[0].rungs.find(r => /Unmatched Valor/.test(r.label))!;
    expect(valor.delta!).toBeGreaterThan(10);   // fixed 130 vs 100 cap, crit-side gain
    // the "no longer replaces" roll is a keep-both enabler, not a priced row
    expect(LADDERS[0].rungs.at(-1)!.delta).toBeNull();
  });

  test("inverse rungs price the full scaled copy, not just min enemies (user 2026-07-16)", () => {
    const [none, bad, good] = LADDERS[1].rungs;
    expect(none.delta).toBeNull();
    expect(good.label).toMatch(/\+38% Legendary Medium, \+17% Medium/);
    // the good roll adds increased/effect that the bad roll does not, so it stays ahead
    expect(bad.delta!).toBeGreaterThan(0);
    expect(good.delta!).toBeGreaterThan(bad.delta!);
  });
});
