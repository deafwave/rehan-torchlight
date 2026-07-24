export interface RawSupportMetadata {
  supportName: string | null;
  supportType: string | null;
  level: number | null;
  tier: number | null;
  rank: number | null;
  rollValues: Array<number | string>;
  fingerprint: string;
}

const MAX_TEXT_CODE_POINTS = 160;
const MAX_ROLL_VALUES = 32;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/gu;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;
let lossyFingerprintSequence = 0;

function finiteNumber(value: unknown) {
  if (value === null || value === undefined) {
    return { value: null, lossy: false };
  }
  return typeof value === "number" && Number.isFinite(value)
    ? { value, lossy: false }
    : { value: null, lossy: true };
}

function text(value: unknown) {
  if (typeof value !== "string") {
    return {
      value: null,
      lossy: value !== null && value !== undefined,
    };
  }
  const normalized = value
    .normalize("NFKC")
    .replace(CONTROL_CHARACTERS, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const codePoints = [...normalized];
  const truncated = codePoints.length > MAX_TEXT_CODE_POINTS;
  const bounded = truncated
    ? `${codePoints.slice(0, MAX_TEXT_CODE_POINTS - 1).join("")}…`
    : normalized;
  return {
    value: bounded || null,
    lossy:
      truncated
      || CONTROL_CHARACTER.test(value)
      || normalized !== value
      || (Boolean(value) && !bounded),
  };
}

function safeRollValues(value: unknown) {
  if (!Array.isArray(value)) {
    return {
      values: [] as Array<number | string>,
      lossy: value !== null && value !== undefined,
    };
  }
  const values: Array<number | string> = [];
  let lossy = value.length > MAX_ROLL_VALUES;
  for (const entry of value.slice(0, MAX_ROLL_VALUES)) {
    if (typeof entry === "number" && Number.isFinite(entry)) {
      values.push(entry);
    } else if (typeof entry === "string") {
      const sanitized = text(entry);
      lossy ||= sanitized.lossy || sanitized.value === null;
      if (sanitized.value !== null) values.push(sanitized.value);
    } else {
      lossy = true;
    }
  }
  return { values, lossy };
}

export function rawSupportMetadata(
  build: unknown,
  loadoutIndex: number,
  skillId: string,
  socketIndex: number,
): RawSupportMetadata | null {
  const source = build as any;
  const loadout = source?.loadouts?.loadouts?.[loadoutIndex];
  const skills = [
    ...(Array.isArray(loadout?.skills?.activeSkills)
      ? loadout.skills.activeSkills
      : []),
    ...(Array.isArray(loadout?.skills?.passiveSkills)
      ? loadout.skills.passiveSkills
      : []),
  ];
  const skill = skills.find((candidate) =>
    candidate
    && (candidate.skillGuid === skillId || candidate.skillId === skillId));
  const support = Array.isArray(skill?.supports)
    ? skill.supports[socketIndex]
    : null;
  if (!support || typeof support !== "object" || Array.isArray(support)) {
    return null;
  }
  const supportName = text(support.name);
  const supportType = text(support.type);
  const supportId = text(support.supportGuid ?? support.supportId);
  const level = finiteNumber(support.level);
  const tier = finiteNumber(support.tier);
  const rank = finiteNumber(support.rank);
  const rolls = safeRollValues(support.rollValues);
  const lossy =
    supportName.lossy
    || supportType.lossy
    || supportId.lossy
    || level.lossy
    || tier.lossy
    || rank.lossy
    || rolls.lossy;
  const metadata = {
    supportName: supportName.value,
    supportType: supportType.value,
    level: level.value,
    tier: tier.value,
    rank: rank.value,
    rollValues: rolls.values,
  };
  return {
    ...metadata,
    fingerprint: JSON.stringify({
      ...metadata,
      supportId: supportId.value,
      // Lossy input must never compare as confidently unchanged. The token is
      // deterministic for one analysis run but unique per sanitized record.
      ...(lossy
        ? { lossyInputToken: ++lossyFingerprintSequence }
        : {}),
    }),
  };
}
