import type { AnalyzedLoadout } from "./analysis-types";

export type DefenseCategory =
  | "life"
  | "energy"
  | "resistance"
  | "armor"
  | "evasion"
  | "avoidance"
  | "recovery"
  | "mitigation";

export interface DefenseEvidence {
  category: DefenseCategory;
  text: string;
  source: string;
}

export interface DefenseCategoryDiff {
  category: DefenseCategory;
  before: DefenseEvidence[];
  after: DefenseEvidence[];
  removed: DefenseEvidence[];
  added: DefenseEvidence[];
}

export interface DefenseComparison {
  before: DefenseEvidence[];
  after: DefenseEvidence[];
  categories: DefenseCategoryDiff[];
  removed: number;
  added: number;
}

const CATEGORY_RULES: [DefenseCategory, RegExp][] = [
  // Specific mechanics must run before generic pool words such as "Life" or
  // "Energy Shield" so "Life Regain per second" is recovery, not a larger pool.
  ["mitigation", /\bdamage taken\b|\bdamage mitigation\b|\binjury buffer\b|\bfortitude\b/i],
  ["recovery", /\bregain\b|\brecover(?:y|ed)?\b|\brestor(?:e|ation)\b|\bper second\b/i],
  ["avoidance", /\bblock\b|\bdodge\b|\bavoid(?:ed|ance)?\b/i],
  ["resistance", /\bresistance\b|\bresistances\b/i],
  ["energy", /\benergy shield\b|\bbarrier\b/i],
  ["armor", /\barmor\b/i],
  ["evasion", /\bevasion\b|\bevade\b/i],
  ["life", /\bmax life\b|\bmaximum life\b|\blife\b/i],
];

const EXCLUDE =
  /\bminions?['’]?\b|\bminion\b|\bspirit mag(?:us|i)\b|\bsynthetic troop\b|\bsummoned\b/i;
const OFFENSIVE_CONTEXT =
  /\benem(?:y|ies)\b[^.\n]*\bresistance\b|\bresistance\b[^.\n]*\benem(?:y|ies)\b|\bdamage taken by\b|\benem(?:y|ies)\b[^.\n]*\btake\b/i;

function evidenceKey(row: DefenseEvidence) {
  return `${row.category}:${row.source}:${row.text}`;
}

function multisetDifference(left: DefenseEvidence[], right: DefenseEvidence[]) {
  const counts = new Map<string, number>();
  for (const row of right) counts.set(evidenceKey(row), (counts.get(evidenceKey(row)) ?? 0) + 1);
  return left.filter((row) => {
    const key = evidenceKey(row);
    const count = counts.get(key) ?? 0;
    if (!count) return true;
    counts.set(key, count - 1);
    return false;
  });
}

export function extractDefenseEvidence(loadout: AnalyzedLoadout): DefenseEvidence[] {
  const output: DefenseEvidence[] = [];
  for (const item of loadout.gear) {
    for (const line of item.lines) {
      for (const segment of line.split(/\r?\n|<br\s*\/?>/i)) {
        const text = segment.replace(/\s+/g, " ").trim();
        if (!text || EXCLUDE.test(text) || OFFENSIVE_CONTEXT.test(text)) continue;
        const match = CATEGORY_RULES.find(([, pattern]) => pattern.test(text));
        if (!match) continue;
        output.push({
          category: match[0],
          text,
          source: `${item.slot.replace(/([a-z])([A-Z])/g, "$1 $2")} · ${item.name}`,
        });
      }
    }
  }
  return output;
}

export function compareDefense(
  beforeLoadout: AnalyzedLoadout,
  afterLoadout: AnalyzedLoadout,
): DefenseComparison {
  const before = extractDefenseEvidence(beforeLoadout);
  const after = extractDefenseEvidence(afterLoadout);
  const categories = CATEGORY_RULES.map(([category]) => {
    const left = before.filter((row) => row.category === category);
    const right = after.filter((row) => row.category === category);
    return {
      category,
      before: left,
      after: right,
      removed: multisetDifference(left, right),
      added: multisetDifference(right, left),
    };
  }).filter((row) => row.before.length || row.after.length);
  return {
    before,
    after,
    categories,
    removed: multisetDifference(before, after).length,
    added: multisetDifference(after, before).length,
  };
}
