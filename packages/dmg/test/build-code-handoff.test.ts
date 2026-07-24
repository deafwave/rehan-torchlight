import { describe, expect, it } from "vitest";
import {
  createLocalCaptureHandoff,
  extractInGameBuildCode,
} from "../../page/src/build-code-handoff.js";
import { importBuildCode } from "../../page/src/importer.js";

describe("in-game build-code handoff", () => {
  it.each([
    "2L8xV4YBEfGpdQAAAAAACw==",
    "OAI0doZQEfGpdQAAAAAACw==",
  ])("extracts the shared code without treating it as build state: %s", (code) => {
    expect(extractInGameBuildCode(`My build is ${code}; can you compare it?`)).toBe(code);

    const build = importBuildCode(code);
    expect(build.needsResolution).toBe(true);
    expect(build.loadouts[0].model).toBeNull();
    expect(build.loadouts[0].resolutionHandoff).toMatchObject({
      kind: "tli-dump-local-capture",
      buildCode: code,
      resolver: "tli_dump",
      privacy: "local-export",
    });
  });

  it("documents the real local capture boundary and both accepted exports", () => {
    const handoff = createLocalCaptureHandoff("2L8xV4YBEfGpdQAAAAAACw==");
    const instructions = handoff.steps.map((step) => `${step.title} ${step.detail}`).join(" ");

    expect(instructions).toContain("Pro Build / Build Reference");
    expect(instructions).toContain("active ViewPlayerBDReference page");
    expect(instructions).toContain("Copy TLI Compendium JSON");
    expect(instructions).toContain("--portable-json");
    expect(instructions).toContain("does not resolve codes over the web");
    expect(handoff.acceptedDocuments).toEqual([
      "tli_dump portable-v3 JSON",
      "TLI Compendium build JSON",
    ]);
  });

  it("rejects prose that contains no base64-shaped in-game identifier", () => {
    expect(extractInGameBuildCode("please inspect my build")).toBeNull();
    expect(() => importBuildCode("https://example.com/build")).toThrow(
      "No supported build code or JSON was found.",
    );
  });
});
