import { describe, expect, it } from "vitest";
import {
  compareSupportInstances,
  type MatchableSupportInstance,
} from "../../page/src/support-instance-comparison.js";

interface Fixture extends MatchableSupportInstance {
  value: number;
}

function support(
  socketIndex: number,
  supportId: string,
  value = 1,
): Fixture {
  return {
    actorId: "actor",
    skillId: "skill",
    socketIndex,
    socketId: `support:${socketIndex}`,
    supportId,
    value,
  };
}

const fingerprint = (value: Fixture) =>
  JSON.stringify({ supportId: value.supportId, value: value.value });

describe("support instance comparison", () => {
  it("matches a reciprocal reorder as two moved instances", () => {
    const changes = compareSupportInstances(
      [support(0, "a"), support(1, "b")],
      [support(0, "b"), support(1, "a")],
      fingerprint,
    );

    expect(changes).toMatchObject([
      {
        kind: "moved",
        before: { supportId: "b", socketIndex: 1 },
        after: { supportId: "b", socketIndex: 0 },
      },
      {
        kind: "moved",
        before: { supportId: "a", socketIndex: 0 },
        after: { supportId: "a", socketIndex: 1 },
      },
    ]);
  });

  it("separates an unchanged move from a moved configuration change", () => {
    const changes = compareSupportInstances(
      [support(0, "a"), support(1, "b", 20)],
      [support(0, "b", 16), support(1, "a")],
      fingerprint,
    );

    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "moved",
        before: expect.objectContaining({ supportId: "a", socketIndex: 0 }),
        after: expect.objectContaining({ supportId: "a", socketIndex: 1 }),
      }),
      expect.objectContaining({
        kind: "moved-and-changed",
        before: expect.objectContaining({
          supportId: "b",
          socketIndex: 1,
          value: 20,
        }),
        after: expect.objectContaining({
          supportId: "b",
          socketIndex: 0,
          value: 16,
        }),
      }),
    ]));
    expect(changes.some((change) =>
      change.kind === "replaced"
      || change.kind === "added"
      || change.kind === "removed")).toBe(false);
  });

  it("consumes duplicate support IDs once per side", () => {
    const changes = compareSupportInstances(
      [support(0, "duplicate", 10), support(1, "duplicate", 20)],
      [support(0, "duplicate", 10), support(1, "duplicate", 21)],
      fingerprint,
    );

    expect(changes).toMatchObject([
      {
        kind: "unchanged",
        before: { socketIndex: 0, value: 10 },
        after: { socketIndex: 0, value: 10 },
      },
      {
        kind: "changed",
        before: { socketIndex: 1, value: 20 },
        after: { socketIndex: 1, value: 21 },
      },
    ]);
  });

  it("reports a moved instance and a true removal independently", () => {
    const changes = compareSupportInstances(
      [support(0, "removed"), support(3, "moved")],
      [support(0, "moved")],
      fingerprint,
    );

    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "moved",
        before: expect.objectContaining({ supportId: "moved", socketIndex: 3 }),
        after: expect.objectContaining({ supportId: "moved", socketIndex: 0 }),
      }),
      expect.objectContaining({
        kind: "removed",
        before: expect.objectContaining({ supportId: "removed" }),
        after: null,
      }),
    ]));
    expect(changes.some((change) =>
      change.kind === "replaced")).toBe(false);
  });

  it("leaves the right duplicate behind for a same-socket replacement", () => {
    const changes = compareSupportInstances(
      [support(2, "duplicate"), support(4, "duplicate")],
      [support(2, "new"), support(3, "duplicate")],
      fingerprint,
    );

    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "replaced",
        before: expect.objectContaining({
          supportId: "duplicate",
          socketIndex: 2,
        }),
        after: expect.objectContaining({
          supportId: "new",
          socketIndex: 2,
        }),
      }),
      expect.objectContaining({
        kind: "moved",
        before: expect.objectContaining({
          supportId: "duplicate",
          socketIndex: 4,
        }),
        after: expect.objectContaining({
          supportId: "duplicate",
          socketIndex: 3,
        }),
      }),
    ]));
    expect(changes.some((change) =>
      change.kind === "added" || change.kind === "removed")).toBe(false);
  });

  it("preserves the replacement when the moved duplicate also changes", () => {
    const changes = compareSupportInstances(
      [support(2, "duplicate", 10), support(4, "duplicate", 20)],
      [support(2, "new"), support(3, "duplicate", 21)],
      fingerprint,
    );

    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "replaced",
        before: expect.objectContaining({
          supportId: "duplicate",
          socketIndex: 2,
        }),
        after: expect.objectContaining({
          supportId: "new",
          socketIndex: 2,
        }),
      }),
      expect.objectContaining({
        kind: "moved-and-changed",
        before: expect.objectContaining({
          supportId: "duplicate",
          socketIndex: 4,
          value: 20,
        }),
        after: expect.objectContaining({
          supportId: "duplicate",
          socketIndex: 3,
          value: 21,
        }),
      }),
    ]));
    expect(changes.some((change) =>
      change.kind === "added" || change.kind === "removed")).toBe(false);
  });

  it("chooses the same duplicate assignment when the comparison is reversed", () => {
    const before = [support(2, "duplicate"), support(4, "duplicate")];
    const after = [support(0, "duplicate"), support(3, "duplicate")];
    const forward = compareSupportInstances(before, after, fingerprint)
      .map((change) =>
        `${change.before?.socketIndex}->${change.after?.socketIndex}:${change.kind}`)
      .sort();
    const reversed = compareSupportInstances(after, before, fingerprint)
      .map((change) =>
        `${change.after?.socketIndex}->${change.before?.socketIndex}:${change.kind}`)
      .sort();

    expect(forward).toEqual(reversed);
    expect(forward).toEqual(["2->0:moved", "4->3:moved"]);
  });

  it("does not claim a cross-socket move without a stable support identity", () => {
    const changes = compareSupportInstances(
      [support(0, "", 20)],
      [support(1, "", 20)],
      fingerprint,
    );

    expect(changes.map((change) => change.kind).sort()).toEqual([
      "added",
      "removed",
    ]);
    expect(changes.some((change) =>
      change.kind === "moved"
      || change.kind === "moved-and-changed")).toBe(false);
  });

  it("keeps an identical empty-id record unchanged in the same socket", () => {
    const changes = compareSupportInstances(
      [support(0, "", 20)],
      [support(0, "", 20)],
      fingerprint,
    );

    expect(changes).toMatchObject([{
      kind: "unchanged",
      before: { socketIndex: 0, supportId: "" },
      after: { socketIndex: 0, supportId: "" },
    }]);
  });
});
