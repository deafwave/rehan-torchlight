import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { fromRoot } from "../src/py.js";
import {
  compileBingWeaponFoundation,
} from "../src/guardedCompiler.js";
import { compileBingIntrinsicEnvelope } from "../src/bingIntrinsic.js";
import { compileSs13BingSupportEvidence } from "../src/supportEvidence.js";
import { compileWuxiaSummonEvidence } from "../src/minionEvidence.js";
import {
  AUDITED_SS13_COMPACT_CATALOG_SHA256,
  compileSs13PlayerDefenseEvidence,
} from "../src/playerDefenseEvidence.js";

const readJson = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"));
const catalog = readJson(
  fromRoot("../poorchlight/tli_dump/data/compendium-catalog-ss13.json"),
);
const defenseOptions = {
  catalog,
  catalogSha256: AUDITED_SS13_COMPACT_CATALOG_SHA256,
};

const compilers: Array<[string, (build: unknown) => unknown]> = [
  ["Bing weapon", (build) => compileBingWeaponFoundation(build, 0)],
  ["Bing intrinsic", (build) => compileBingIntrinsicEnvelope(build, 0)],
  ["Bing supports", (build) => compileSs13BingSupportEvidence(build, 0)],
  ["Wuxia summon", (build) => compileWuxiaSummonEvidence(build, 0)],
  [
    "player defense",
    (build) => compileSs13PlayerDefenseEvidence(build, 0, defenseOptions),
  ],
];

const sourcePaths = [
  "hero",
  "hero.traits",
  "skills",
  "skills.activeSkills",
  "skills.passiveSkills",
  "gear",
  "gear.inventory",
  "gear.equipped",
  "vorax",
  "vorax.inventory",
  "vorax.equipped",
  "heroMemories",
  "heroMemories.inventory",
  "heroMemories.equipped",
  "etherealPrisms",
  "etherealPrisms.inventory",
  "skillTree",
  "skillTree.slots",
  "divinity",
  "divinity.inventory",
  "divinity.placements",
  "pactspirits",
  "kismets",
] as const;

function replaceLoadoutPath(build: any, path: string, value: unknown): void {
  const segments = path.split(".");
  let target = build.loadouts.loadouts[0];
  for (const segment of segments.slice(0, -1)) {
    if (!target[segment] || typeof target[segment] !== "object") {
      target[segment] = {};
    }
    target = target[segment];
  }
  target[segments.at(-1)!] = value;
}

describe("guarded compiler input safety", () => {
  it("returns typed blockers rather than throwing for non-document roots", () => {
    const failures: string[] = [];
    for (const [name, compile] of compilers) {
      for (const value of [null, undefined, 0, true, "bad", [], {}]) {
        try {
          compile(value);
        } catch (error) {
          failures.push(`${name}: ${String(error)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("does not throw when source-bearing loadout projections are malformed", () => {
    const fixtures = [
      ["Bing", readJson(fromRoot("data/builds/bing_china.json"))],
      ["Wuxia", readJson(fromRoot("data/builds/WuxiaSS13.json"))],
    ] as const;
    const failures: string[] = [];
    for (const [fixtureName, fixture] of fixtures) {
      for (const path of sourcePaths) {
        for (const malformed of [{}, "bad"]) {
          for (const [compilerName, compile] of compilers) {
            const build = structuredClone(fixture);
            replaceLoadoutPath(build, path, malformed);
            try {
              compile(build);
            } catch (error) {
              failures.push(
                `${fixtureName} ${path} via ${compilerName}: ${String(error)}`,
              );
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
