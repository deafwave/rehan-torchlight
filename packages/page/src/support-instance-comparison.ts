export interface MatchableSupportInstance {
  actorId: string;
  skillId: string;
  socketIndex: number;
  socketId: string;
  supportId: string;
}

export type SupportInstanceChangeKind =
  | "unchanged"
  | "moved"
  | "changed"
  | "moved-and-changed"
  | "replaced"
  | "added"
  | "removed";

export interface SupportInstanceChange<
  T extends MatchableSupportInstance,
> {
  kind: SupportInstanceChangeKind;
  before: T | null;
  after: T | null;
}

export function supportInstanceEvidenceRef(
  side: "before" | "after",
  value: Pick<
    MatchableSupportInstance,
    "actorId" | "skillId" | "socketId" | "supportId"
  >,
) {
  return [
    "support-instance",
    side,
    value.actorId,
    value.skillId,
    value.socketId,
    value.supportId,
  ].join("\u0000");
}

function lexical(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableInstanceOrder<
  T extends MatchableSupportInstance,
>(left: T, right: T) {
  return lexical(left.actorId, right.actorId)
    || lexical(left.skillId, right.skillId)
    || left.socketIndex - right.socketIndex
    || lexical(left.socketId, right.socketId)
    || lexical(left.supportId, right.supportId);
}

function sameActorSkill(
  left: MatchableSupportInstance,
  right: MatchableSupportInstance,
) {
  return left.actorId === right.actorId
    && left.skillId === right.skillId;
}

function sameSocket(
  left: MatchableSupportInstance,
  right: MatchableSupportInstance,
) {
  return sameActorSkill(left, right)
    && left.socketId === right.socketId;
}

type MatchedSupportInstanceChangeKind = Exclude<
  SupportInstanceChangeKind,
  "added" | "removed"
>;

const MATCH_KIND_PRIORITY: MatchedSupportInstanceChangeKind[] = [
  "unchanged",
  "moved",
  "changed",
  "moved-and-changed",
  "replaced",
];

interface SupportInstancePair {
  beforeIndex: number;
  afterIndex: number;
  kind: MatchedSupportInstanceChangeKind;
}

interface SupportInstanceMatchPlan {
  pairs: SupportInstancePair[];
  counts: number[];
  distance: number;
  edgeSignatures: string[];
}

function pairKind<T extends MatchableSupportInstance>(
  before: T,
  after: T,
  beforeFingerprint: string,
  afterFingerprint: string,
): MatchedSupportInstanceChangeKind | null {
  if (!sameActorSkill(before, after)) return null;
  const sameStableSupport =
    before.supportId.trim().length > 0
    && before.supportId === after.supportId;
  if (sameSocket(before, after)
      && beforeFingerprint === afterFingerprint) {
    return "unchanged";
  }
  if (sameStableSupport
      && beforeFingerprint === afterFingerprint) {
    return "moved";
  }
  if (sameStableSupport) {
    return sameSocket(before, after) ? "changed" : "moved-and-changed";
  }
  return sameSocket(before, after) ? "replaced" : null;
}

function compareMatchPlans(
  left: SupportInstanceMatchPlan,
  right: SupportInstanceMatchPlan,
) {
  for (let index = 0; index < MATCH_KIND_PRIORITY.length; index += 1) {
    if (left.counts[index] !== right.counts[index]) {
      return left.counts[index] - right.counts[index];
    }
  }
  if (left.distance !== right.distance) return right.distance - left.distance;
  const leftSignature = left.edgeSignatures.join("\u0002");
  const rightSignature = right.edgeSignatures.join("\u0002");
  return lexical(rightSignature, leftSignature);
}

/**
 * Matches support instances before describing socket transitions.
 *
 * Matching is deterministic and globally assigned within each actor/skill:
 * 1. unchanged instance in the same socket;
 * 2. unchanged instance moved to another socket;
 * 3. the same support identity with changed configuration;
 * 4. different identities occupying the same residual socket;
 * 5. true additions and removals.
 *
 * This prevents a moved support from also being reported as removed or as
 * half of two reciprocal swaps. Duplicate support IDs remain separate because
 * each before/after array entry is consumed at most once. The global assignment
 * also keeps a nearer duplicate from stealing a move when leaving another
 * duplicate unmatched would preserve an honest same-socket replacement.
 */
export function compareSupportInstances<
  T extends MatchableSupportInstance,
>(
  beforeValues: readonly T[],
  afterValues: readonly T[],
  fingerprint: (value: T) => string,
): SupportInstanceChange<T>[] {
  const deterministicOrder = (left: T, right: T) =>
    stableInstanceOrder(left, right)
    || lexical(fingerprint(left), fingerprint(right));
  const before = [...beforeValues].sort(deterministicOrder);
  const after = [...afterValues].sort(deterministicOrder);
  const beforeFingerprints = before.map(fingerprint);
  const afterFingerprints = after.map(fingerprint);
  const usedBefore = new Set<number>();
  const usedAfter = new Set<number>();
  const changes: SupportInstanceChange<T>[] = [];

  const groups = new Map<string, {
    beforeIndices: number[];
    afterIndices: number[];
  }>();
  const groupFor = (value: T) => {
    const key = JSON.stringify([value.actorId, value.skillId]);
    const existing = groups.get(key);
    if (existing) return existing;
    const created = { beforeIndices: [], afterIndices: [] };
    groups.set(key, created);
    return created;
  };
  before.forEach((value, index) => {
    groupFor(value).beforeIndices.push(index);
  });
  after.forEach((value, index) => {
    groupFor(value).afterIndices.push(index);
  });

  for (const group of groups.values()) {
    const memo = new Map<string, SupportInstanceMatchPlan>();
    const emptyPlan = (): SupportInstanceMatchPlan => ({
      pairs: [],
      counts: MATCH_KIND_PRIORITY.map(() => 0),
      distance: 0,
      edgeSignatures: [],
    });
    const endpointSignature = (
      value: T,
      valueFingerprint: string,
    ) => JSON.stringify([
      value.actorId,
      value.skillId,
      value.socketIndex,
      value.socketId,
      value.supportId,
      valueFingerprint,
    ]);
    const solve = (
      beforePosition: number,
      usedAfterMask: bigint,
    ): SupportInstanceMatchPlan => {
      if (beforePosition >= group.beforeIndices.length) return emptyPlan();
      const memoKey = `${beforePosition}:${usedAfterMask}`;
      const cached = memo.get(memoKey);
      if (cached) return cached;
      const beforeIndex = group.beforeIndices[beforePosition];
      let best = solve(beforePosition + 1, usedAfterMask);
      for (
        let afterPosition = 0;
        afterPosition < group.afterIndices.length;
        afterPosition += 1
      ) {
        const bit = 1n << BigInt(afterPosition);
        if ((usedAfterMask & bit) !== 0n) continue;
        const afterIndex = group.afterIndices[afterPosition];
        const kind = pairKind(
          before[beforeIndex],
          after[afterIndex],
          beforeFingerprints[beforeIndex],
          afterFingerprints[afterIndex],
        );
        if (!kind) continue;
        const remainder = solve(beforePosition + 1, usedAfterMask | bit);
        const kindIndex = MATCH_KIND_PRIORITY.indexOf(kind);
        const endpoints = [
          endpointSignature(
            before[beforeIndex],
            beforeFingerprints[beforeIndex],
          ),
          endpointSignature(
            after[afterIndex],
            afterFingerprints[afterIndex],
          ),
        ].sort();
        const candidate: SupportInstanceMatchPlan = {
          pairs: [
            {
              beforeIndex,
              afterIndex,
              kind,
            },
            ...remainder.pairs,
          ],
          counts: remainder.counts.map((count, index) =>
            count + (index === kindIndex ? 1 : 0)),
          distance:
            remainder.distance
            + Math.abs(
              before[beforeIndex].socketIndex
              - after[afterIndex].socketIndex,
            ),
          edgeSignatures: [
            `${kind}\u0001${endpoints.join("\u0001")}`,
            ...remainder.edgeSignatures,
          ].sort(),
        };
        if (compareMatchPlans(candidate, best) > 0) best = candidate;
      }
      memo.set(memoKey, best);
      return best;
    };

    for (const pair of solve(0, 0n).pairs) {
      usedBefore.add(pair.beforeIndex);
      usedAfter.add(pair.afterIndex);
      changes.push({
        kind: pair.kind,
        before: before[pair.beforeIndex],
        after: after[pair.afterIndex],
      });
    }
  }

  for (let beforeIndex = 0; beforeIndex < before.length; beforeIndex += 1) {
    if (usedBefore.has(beforeIndex)) continue;
    usedBefore.add(beforeIndex);
    changes.push({
      kind: "removed",
      before: before[beforeIndex],
      after: null,
    });
  }
  for (let afterIndex = 0; afterIndex < after.length; afterIndex += 1) {
    if (usedAfter.has(afterIndex)) continue;
    usedAfter.add(afterIndex);
    changes.push({
      kind: "added",
      before: null,
      after: after[afterIndex],
    });
  }

  return changes.sort((left, right) => {
    const leftValue = left.after ?? left.before!;
    const rightValue = right.after ?? right.before!;
    return stableInstanceOrder(leftValue, rightValue)
      || lexical(left.kind, right.kind);
  });
}
