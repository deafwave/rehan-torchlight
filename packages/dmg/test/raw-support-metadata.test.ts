import { describe, expect, it } from "vitest";
import { rawSupportMetadata } from "../../page/src/raw-support-metadata.js";

function buildWithSupport(support: Record<string, unknown>) {
  return {
    loadouts: {
      loadouts: [{
        skills: {
          activeSkills: [{
            skillGuid: "test-skill",
            supports: [support],
          }],
          passiveSkills: [],
        },
      }],
    },
  };
}

describe("raw support metadata safety", () => {
  it("keeps ordinary metadata stable across reads", () => {
    const build = buildWithSupport({
      supportGuid: "support-id",
      name: "Known Support",
      type: "support",
      level: 20,
      rollValues: [12, "high"],
    });

    expect(rawSupportMetadata(build, 0, "test-skill", 0)).toEqual(
      rawSupportMetadata(build, 0, "test-skill", 0),
    );
  });

  it("normalizes, bounds, and fail-closes lossy hostile strings", () => {
    const longValue = `\u0000Ｆoo\n${"x".repeat(400)}`;
    const build = buildWithSupport({
      supportGuid: `${longValue}-id`,
      name: longValue,
      type: `support\u0007${"y".repeat(400)}`,
      rollValues: Array.from(
        { length: 40 },
        (_, index) => `${index}\u0000${"z".repeat(400)}`,
      ),
    });

    const first = rawSupportMetadata(build, 0, "test-skill", 0);
    const second = rawSupportMetadata(build, 0, "test-skill", 0);

    expect(first).not.toBeNull();
    expect(first?.supportName).toMatch(/^Foo /);
    expect([...(first?.supportName ?? "")]).toHaveLength(160);
    expect([...(first?.supportType ?? "")]).toHaveLength(160);
    expect(first?.rollValues).toHaveLength(32);
    expect(first?.rollValues.every((value) =>
      typeof value !== "string" || [...value].length <= 160)).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(/\\u0000|\\u0007/i);
    expect(first?.fingerprint).not.toBe(second?.fingerprint);
  });

  it("does not conflate malformed scalar or roll types with absent values", () => {
    const absent = rawSupportMetadata(
      buildWithSupport({ supportGuid: "support-id", type: "support" }),
      0,
      "test-skill",
      0,
    );
    const malformedBuild = buildWithSupport({
      supportGuid: "support-id",
      type: "support",
      level: "20",
      tier: {},
      rank: Number.POSITIVE_INFINITY,
      rollValues: "not-an-array",
    });
    const malformed = rawSupportMetadata(
      malformedBuild,
      0,
      "test-skill",
      0,
    );
    const malformedAgain = rawSupportMetadata(
      malformedBuild,
      0,
      "test-skill",
      0,
    );

    expect(malformed).toMatchObject({
      level: null,
      tier: null,
      rank: null,
      rollValues: [],
    });
    expect(malformed?.fingerprint).not.toBe(absent?.fingerprint);
    expect(malformedAgain?.fingerprint).not.toBe(malformed?.fingerprint);
  });

  it("marks Unicode and whitespace normalization as lossy", () => {
    const canonical = rawSupportMetadata(
      buildWithSupport({
        supportGuid: "support-id",
        type: "support",
        name: "Foo Bar",
      }),
      0,
      "test-skill",
      0,
    );
    const normalizedBuild = buildWithSupport({
      supportGuid: "support-id",
      type: "ｓｕｐｐｏｒｔ",
      name: "  Foo   Bar  ",
    });
    const normalized = rawSupportMetadata(
      normalizedBuild,
      0,
      "test-skill",
      0,
    );
    const normalizedAgain = rawSupportMetadata(
      normalizedBuild,
      0,
      "test-skill",
      0,
    );

    expect(normalized).toMatchObject({
      supportName: "Foo Bar",
      supportType: "support",
    });
    expect(normalized?.fingerprint).not.toBe(canonical?.fingerprint);
    expect(normalizedAgain?.fingerprint).not.toBe(normalized?.fingerprint);
  });
});
