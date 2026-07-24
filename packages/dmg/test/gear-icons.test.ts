import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fromRoot } from "../src/py.js";
import {
  COMPENDIUM_ORIGIN,
  TLIDB_ICON_BASE,
  compendiumIconUrl,
  gearBoardCells,
  gearRarityTone,
  tlidbIconUrl,
} from "../../page/src/gear-icons.js";
import { importBuild } from "../../page/src/importer.js";
import type { ImportCatalog } from "../../page/src/analysis-types.js";

const emptyCatalog: ImportCatalog = {
  skillNames: {},
  treeNames: {},
  heroNames: {},
  pactNames: {},
  defenseCatalog: {},
  defenseCatalogSha256: "",
};

describe("gear icon URLs", () => {
  it("maps planner _128 paths onto the TLIDB UIV2 _112 pack", () => {
    const planner =
      "/images/legendaries/boots/int_boots/Icon_Equip_Shoes_Epic_407_128.webp";
    expect(tlidbIconUrl(planner)).toBe(
      `${TLIDB_ICON_BASE}/Icon_Equip_Shoes_Epic_407_112.webp`,
    );
    expect(compendiumIconUrl(planner)).toBe(`${COMPENDIUM_ORIGIN}${planner}`);
  });

  it("passes through absolute TLIDB URLs and ignores empty paths", () => {
    const absolute =
      `${TLIDB_ICON_BASE}/Icon_Equip_Belt_Epic_224_112.webp`;
    expect(tlidbIconUrl(absolute)).toBe(absolute);
    expect(tlidbIconUrl(null)).toBeNull();
    expect(tlidbIconUrl("")).toBeNull();
  });

  it("classifies rarity chrome tones", () => {
    expect(gearRarityTone("Legendary")).toBe("legendary");
    expect(gearRarityTone("Rare")).toBe("rare");
    expect(gearRarityTone(null)).toBe("empty");
  });

  it("lays out standard slots as a paper doll with overflow extras", () => {
    const { board, overflow } = gearBoardCells([
      {
        slot: "boots",
        name: "Grace Boots",
        rarity: "Legendary",
        category: "boots",
        icon: "/images/legendaries/boots/int_boots/Icon_Equip_Shoes_Epic_407_128.webp",
        lines: ["+180 gear Energy Shield"],
      },
      {
        slot: "unmapped:jewel:0",
        name: "Odd Jewel",
        rarity: "Rare",
        category: "jewel",
        icon: null,
        lines: [],
      },
    ]);
    expect(board).toHaveLength(10);
    expect(board.find((cell) => cell.slot === "boots")?.empty).toBe(false);
    expect(board.find((cell) => cell.slot === "helmet")?.empty).toBe(true);
    expect(overflow).toHaveLength(1);
    expect(overflow[0]?.slot).toBe("unmapped:jewel:0");
  });
});

describe("gear icon plumbing through import", () => {
  it("carries displayIcon from the Rehan planner export onto GearRow", () => {
    const raw = JSON.parse(
      fs.readFileSync(path.join(fromRoot("data"), "Rehan.json"), "utf8"),
    );
    const build = importBuild(raw, emptyCatalog);
    const boots = build.loadouts[0]?.gear.find((row) => row.slot === "boots");
    expect(boots?.name).toMatch(/Grace Boots/i);
    expect(boots?.icon).toMatch(/Icon_Equip_Shoes_Epic_407_128\.webp$/);
    expect(tlidbIconUrl(boots?.icon)).toBe(
      `${TLIDB_ICON_BASE}/Icon_Equip_Shoes_Epic_407_112.webp`,
    );
  });
});
