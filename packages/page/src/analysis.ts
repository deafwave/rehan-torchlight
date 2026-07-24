import { cycleDps, type Snapshot } from "@rehan/dmg/damageModel";

export interface FieldChange {
  path: string;
  label: string;
  before: number;
  after: number;
  impact: number;
}

export interface WaterfallStep {
  id: string;
  label: string;
  description: string;
  beforeDps: number;
  afterDps: number;
  delta: number;
  fields: FieldChange[];
}

export interface RollbackEvaluation {
  id: string;
  label: string;
  description: string;
  afterDps: number;
  rollbackDps: number;
  delta: number;
  fields: FieldChange[];
}

const GROUPS = [
  {
    id: "base",
    label: "Base hit",
    description: "Weapon damage, added flat damage, skill coefficient, and local weapon scaling.",
    keys: ["base"],
  },
  {
    id: "increased",
    label: "Increased pool",
    description: "All applicable increased damage lines add together before becoming one multiplier.",
    keys: ["increased"],
  },
  {
    id: "additional",
    label: "Additional layers",
    description: "Separately named additional bonuses multiply; losing one can outweigh several increased rolls.",
    keys: ["additional", "additional_typed"],
  },
  {
    id: "conversion",
    label: "Conversion",
    description: "Damage-type conversion changes which increases, penetration, and typed bonuses can apply.",
    keys: ["conversion"],
  },
  {
    id: "crit",
    label: "Critical strikes",
    description: "Expected crit value combines chance, critical damage, and double-damage effects.",
    keys: ["crit", "paralysis"],
  },
  {
    id: "enemy",
    label: "Enemy defenses",
    description: "Resistance, armor, penetration, and damage-taken debuffs are applied against the target.",
    keys: ["enemy_taken", "penetration", "enemy"],
  },
  {
    id: "rotation",
    label: "Skill cadence",
    description: "Attack rate, projectiles, overlaps, combo cadence, and other throughput assumptions.",
    keys: ["rotation", "tags", "skill_type"],
  },
  {
    id: "dot",
    label: "Damage over time",
    description: "Deterioration and other modeled damage-over-time contributions are added after hit DPS.",
    keys: ["deterioration"],
  },
] as const;

const LABELS: Record<string, string> = {
  "base.weapon_phys_min": "Weapon physical minimum",
  "base.weapon_phys_max": "Weapon physical maximum",
  "base.gear_phys_pct": "Local weapon physical",
  "base.skill_weapon_pct": "Skill weapon coefficient",
  "base.weapon_attack_speed": "Base weapon attack speed",
  "base.flat_added_min": "Added physical minimum",
  "base.flat_added_max": "Added physical maximum",
  "crit.chance_pct": "Critical strike chance",
  "crit.damage_pct": "Critical strike damage",
  "crit.double_damage_chance_pct": "Double-damage chance",
  "rotation.attack_speed_inc_pct": "Attack speed",
  "rotation.proj_added": "Added projectiles",
  "rotation.hits_per_bomb": "Hits per bomb",
  "rotation.bombs_per_throw": "Bombs per throw",
  "rotation.combo_points": "Combo points",
  "penetration.cold_pct": "Elemental penetration",
  "penetration.erosion_pct": "Erosion penetration",
  "enemy.cold_res_pct": "Enemy elemental resistance",
  "enemy.erosion_res_pct": "Enemy erosion resistance",
  "deterioration.chance_pct": "Deterioration chance",
  "deterioration.hit_damage_pct": "Deterioration base tick",
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function labelFor(path: string) {
  return LABELS[path] ?? titleCase(path.split(".").at(-1) ?? path);
}

function numericLeaves(value: unknown, prefix = "", output = new Map<string, number>()) {
  if (typeof value === "number" && Number.isFinite(value)) {
    output.set(prefix, value);
    return output;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return output;
  for (const [key, child] of Object.entries(value)) {
    numericLeaves(child, prefix ? `${prefix}.${key}` : key, output);
  }
  return output;
}

function setPath(target: any, path: string, value: unknown) {
  const keys = path.split(".");
  let cursor = target;
  for (const key of keys.slice(0, -1)) cursor = (cursor[key] ??= {});
  cursor[keys.at(-1)!] = value;
}

function safeDps(snapshot: Snapshot) {
  try {
    return cycleDps(snapshot).dps;
  } catch {
    return Number.NaN;
  }
}

function changedFields(before: Snapshot, after: Snapshot, keys: readonly string[], baseDps: number) {
  const beforeLeaves = new Map<string, number>();
  const afterLeaves = new Map<string, number>();
  for (const key of keys) {
    numericLeaves((before as any)[key], key, beforeLeaves);
    numericLeaves((after as any)[key], key, afterLeaves);
  }
  const paths = new Set([...beforeLeaves.keys(), ...afterLeaves.keys()]);
  const changes: FieldChange[] = [];
  for (const path of paths) {
    const a = beforeLeaves.get(path) ?? 0;
    const b = afterLeaves.get(path) ?? 0;
    if (Math.abs(a - b) < 1e-9) continue;
    const counterfactual = clone(before);
    setPath(counterfactual, path, b);
    const impact = safeDps(counterfactual) - baseDps;
    changes.push({ path, label: labelFor(path), before: a, after: b, impact });
  }
  return changes.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)).slice(0, 4);
}

export function buildWaterfall(before: Snapshot, after: Snapshot): WaterfallStep[] {
  const working = clone(before);
  const baseDps = safeDps(before);
  const steps: WaterfallStep[] = [];
  let previous = baseDps;
  for (const group of GROUPS) {
    const fields = changedFields(before, after, group.keys, baseDps);
    for (const key of group.keys) {
      const nextValue = (after as any)[key];
      if (nextValue === undefined) delete (working as any)[key];
      else (working as any)[key] = clone(nextValue);
    }
    const current = safeDps(working);
    steps.push({
      id: group.id,
      label: group.label,
      description: group.description,
      beforeDps: previous,
      afterDps: current,
      delta: current - previous,
      fields,
    });
    previous = current;
  }
  return steps;
}

/**
 * Starts from the after-state and restores one complete modeled layer from
 * the before-state. Unlike waterfall attribution, each result is independent
 * of display order. It is still a fixed-scenario counterfactual, not a claim
 * that the grouped edit is legal or isolated in game.
 */
export function buildRollbackEvaluations(
  before: Snapshot,
  after: Snapshot,
): RollbackEvaluation[] {
  const afterDps = safeDps(after);
  return GROUPS.flatMap((group) => {
    const fields = changedFields(before, after, group.keys, safeDps(before));
    if (!fields.length) return [];
    const candidate = clone(after);
    for (const key of group.keys) {
      const previousValue = (before as any)[key];
      if (previousValue === undefined) delete (candidate as any)[key];
      else (candidate as any)[key] = clone(previousValue);
    }
    const rollbackDps = safeDps(candidate);
    if (!Number.isFinite(rollbackDps) || !Number.isFinite(afterDps)) return [];
    return [{
      id: group.id,
      label: group.label,
      description: group.description,
      afterDps,
      rollbackDps,
      delta: rollbackDps - afterDps,
      fields,
    }];
  });
}

export function percentChange(before: number, after: number): number | null {
  if (before === 0) return after === 0 ? 0 : null;
  return (after / before - 1) * 100;
}

export function compactNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: digits,
  }).format(value);
}

export function signedCompact(value: number) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.5) return "0";
  return `${value > 0 ? "+" : "−"}${compactNumber(Math.abs(value))}`;
}

export function signedPercent(value: number, digits = 1) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.005) return "0%";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}%`;
}
