import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { fromRoot } from "../src/py.js";
import type { AnalyzedLoadout } from "../../page/src/analysis-types.js";
import {
  compareSupportTerms,
  supportEvidenceResultForCompendium,
} from "../../page/src/support-evidence.js";

const readJson = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"));

describe("player support evidence identity page adapter", () => {
  it("carries actor/skill/socket identity and keeps duplicate support sockets distinct", () => {
    const build = readJson(fromRoot("../bing_china.json"));
    build.loadouts.loadouts[1] = structuredClone(build.loadouts.loadouts[0]);
    const beforeSupports = build.loadouts.loadouts[0].skills.activeSkills[0].supports;
    const afterSupports = build.loadouts.loadouts[1].skills.activeSkills[0].supports;
    beforeSupports[2] = structuredClone(beforeSupports[1]);
    afterSupports[2] = structuredClone(afterSupports[1]);
    afterSupports[2].level += 1;

    const beforeResult = supportEvidenceResultForCompendium(build, 0);
    const afterResult = supportEvidenceResultForCompendium(build, 1);
    expect(beforeResult.status).toBe("source-terms");
    expect(afterResult.status).toBe("source-terms");
    if (beforeResult.status !== "source-terms"
        || afterResult.status !== "source-terms") {
      throw new Error("expected source terms");
    }

    expect(beforeResult.supports.slice(1, 3)).toMatchObject([
      {
        actorId: "c89dce15-cbeb-562d-83ec-993059bbf0ec",
        actorName: "Bing: Blast Nova",
        skillId: "6f020b6a-022b-50eb-8299-e5fc7492ea8f",
        skillName: "Hammer of Ash",
        socketIndex: 1,
        socketId: "support:1",
        supportId: "2d9474fd-8923-56ef-9f5c-f6444898c5f9",
      },
      {
        actorId: "c89dce15-cbeb-562d-83ec-993059bbf0ec",
        actorName: "Bing: Blast Nova",
        skillId: "6f020b6a-022b-50eb-8299-e5fc7492ea8f",
        skillName: "Hammer of Ash",
        socketIndex: 2,
        socketId: "support:2",
        supportId: "2d9474fd-8923-56ef-9f5c-f6444898c5f9",
      },
    ]);

    const before = {
      supportEvidenceStatus: "source-terms",
      supportEvidence: beforeResult.supports,
    } as AnalyzedLoadout;
    const after = {
      supportEvidenceStatus: "source-terms",
      supportEvidence: afterResult.supports,
    } as AnalyzedLoadout;
    expect(compareSupportTerms(before, after)).toMatchObject([{
      kind: "changed",
      actorName: "Bing: Blast Nova",
      skillName: "Hammer of Ash",
      socketIndex: 2,
      socketId: "support:2",
      supportId: "2d9474fd-8923-56ef-9f5c-f6444898c5f9",
    }]);
  });
});
