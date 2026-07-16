import { describe, expect, test } from "vitest";
import { buildTalents, buildSkillBars } from "../src/pagedata.js";

const TAL = buildTalents();
const BARS = buildSkillBars();

describe("talents page data", () => {
  test("stages mirror the planner loadouts, in order", () => {
    expect(TAL.stages.map(s => s.loadout)).toEqual([
      "Full precise auras", "150b", "420b", "Inverse-Warcry",
      "3t", "5t Eternity", "more_1", "more_2"]);
  });

  test("every slot references a bundled tree and 4 slots per stage", () => {
    for (const st of TAL.stages) {
      expect(st.slots.length, st.loadout).toBe(4);
      for (const sl of st.slots) expect(TAL.trees[sl.tree], `${st.loadout}/${sl.tree}`).toBeDefined();
    }
  });

  test("allocated points resolve to real nodes and respect maxPoints", () => {
    for (const st of TAL.stages) for (const sl of st.slots) {
      const nodes = new Map(TAL.trees[sl.tree].nodes.map(n => [n.id, n]));
      for (const [id, pts] of Object.entries(sl.points)) {
        const n = nodes.get(id);
        expect(n, `${st.loadout}/${sl.tree}/${id}`).toBeDefined();
        expect(pts).toBeGreaterThan(0);
        expect(pts).toBeLessThanOrEqual(n!.max);
      }
    }
  });

  test("every node has a description and grid position", () => {
    for (const t of Object.values(TAL.trees)) for (const n of t.nodes) {
      expect(n.desc.length, `${t.name}/${n.id}`).toBeGreaterThan(0);
      expect(n.x).toBeGreaterThan(0);
      expect(n.y).toBeGreaterThan(0);
    }
  });

  test("edges connect existing nodes", () => {
    for (const t of Object.values(TAL.trees)) {
      const ids = new Set(t.nodes.map(n => n.id));
      expect(t.edges.length).toBeGreaterThan(0);
      for (const [a, b] of t.edges) {
        expect(ids.has(a) && ids.has(b), `${t.name}: ${a}-${b}`).toBe(true);
      }
    }
  });

  test("selected notables resolve to named tree notables", () => {
    for (const st of TAL.stages) for (const sl of st.slots) {
      const nts = new Map(TAL.trees[sl.tree].notables.map(n => [n.id, n]));
      for (const id of [sl.notable12, sl.notable24]) {
        if (!id) continue;
        const n = nts.get(id);
        expect(n, `${st.loadout}/${sl.tree}/${id}`).toBeDefined();
        expect(n!.name.length).toBeGreaterThan(0);
      }
    }
  });

  test("prism sockets: named, on a real node, and tracked as they move", () => {
    const slot = (lo: string, tree: string) =>
      TAL.stages.find(s => s.loadout === lo)!.slots.find(s => s.tree === tree)!;
    for (const st of TAL.stages) for (const sl of st.slots) {
      if (!sl.prism) continue;
      expect(sl.prism.name.length, `${st.loadout}/${sl.tree}`).toBeGreaterThan(0);
      expect(TAL.trees[sl.tree].nodes.some(n => n.id === sl.prism!.node),
        `${st.loadout}/${sl.tree}/${sl.prism.node}`).toBe(true);
    }
    const haze = slot("Full precise auras", "bladerunner").prism!;
    expect(haze.name).toMatch(/Haze/);
    // Haze overrides the socketed node — the page must surface the base affix, not
    // the original Bladerunner move-speed legendary text
    expect(haze.effect).toMatch(/additional Attack Damage when holding a One-Handed Weapon/i);
    expect(haze.effect).not.toMatch(/Movement Speed/i);
    expect(slot("420b", "prophet").prism!.name).toMatch(/Haze/);
    expect(slot("Inverse-Warcry", "the_brave").prism!.name).toMatch(/Inverse/);
    expect(slot("more_1", "ranger").prism!.name).toMatch(/Valor/);
    // the 5t socket replaces the tree's core talent — the page must say so
    expect(slot("5t Eternity", "ranger").prism!.replacesCore).toBe(true);
    expect(slot("5t Eternity", "ranger").prism!.effect).toMatch(/Fervor Rating/i);
  });

  test("inverse image: mirrored nodes carry position, source desc, and points", () => {
    const inv = TAL.stages.find(s => s.loadout === "more_1")!
      .slots.find(s => s.mirrored)!;
    expect(inv.tree).toBe("the_brave");
    const nodes = new Map(TAL.trees[inv.tree].nodes.map(n => [n.id, n]));
    expect(inv.mirrored!.length).toBeGreaterThan(0);
    for (const m of inv.mirrored!) {
      expect(nodes.get(m.from), m.id).toBeDefined();
      expect(m.x).toBeGreaterThan(0);
      expect(m.y).toBeGreaterThan(0);
    }
    // the planner allocated points on some mirrored copies
    expect(inv.mirrored!.some(m => m.points > 0)).toBe(true);
  });
});

describe("skill bar page data", () => {
  test("one bar per loadout, 5 active slots each", () => {
    expect(BARS.map(b => b.loadout)).toEqual([
      "Full precise auras", "150b", "420b", "Inverse-Warcry",
      "3t", "5t Eternity", "more_1", "more_2"]);
    for (const b of BARS) expect(b.active.length, b.loadout).toBe(5);
  });

  test("every skill and support resolves to a human name — never a guid", () => {
    const guidish = /^[0-9a-f]{8}-/;
    for (const b of BARS) for (const s of [...b.active, ...b.passive]) {
      expect(s.name.length, b.loadout).toBeGreaterThan(0);
      expect(s.name).not.toMatch(guidish);
      for (const sup of s.supports) {
        expect(sup.name.length, `${b.loadout}/${s.name}`).toBeGreaterThan(0);
        expect(sup.name).not.toMatch(guidish);
        expect(sup.type.length).toBeGreaterThan(0);
      }
    }
  });

  test("the story the linear tab tells: Legion lands at 150b, Detonation at 420b", () => {
    const names = (lo: string) => BARS.find(b => b.loadout === lo)!
      .active.flatMap(s => s.supports.map(x => x.name)).join(" | ");
    expect(names("Full precise auras")).not.toMatch(/Legion/);
    expect(names("150b")).toMatch(/Legion/);
    expect(names("420b")).toMatch(/Detonation/);
  });
});
