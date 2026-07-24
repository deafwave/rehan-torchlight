import type {
  AnalyzedLoadout,
  PactRow,
  SkillRow,
} from "./analysis-types";

export type BuildSystem = "gear" | "skills" | "trees" | "memories" | "slates" | "pacts";
export type InsightTone = "risk" | "candidate" | "neutral";

export interface StructuralInsight {
  id: string;
  priority: number;
  tone: InsightTone;
  label: string;
  title: string;
  explanation: string;
  evidence: string[];
  section: BuildSystem;
}

export interface StructuralComparison {
  changedSystems: BuildSystem[];
  changedRows: Record<BuildSystem, number>;
  insights: StructuralInsight[];
}

const SYSTEMS: BuildSystem[] = ["gear", "skills", "trees", "memories", "slates", "pacts"];

function normalized(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function displayList(values: string[], limit = 3) {
  const visible = values.slice(0, limit);
  return values.length > limit ? `${visible.join(", ")} +${values.length - limit} more` : visible.join(", ");
}

function primarySkill(loadout: AnalyzedLoadout) {
  return loadout.skills.find((skill) => skill.kind === "active" && skill.enabled)
    ?? loadout.skills.find((skill) => skill.kind === "active");
}

function skillKey(skill: SkillRow) {
  return skill.guid || `${skill.kind}:${normalized(skill.name)}`;
}

function supportKey(support: SkillRow["supports"][number]) {
  return support.guid || `${support.type}:${normalized(support.name)}`;
}

function signature(value: unknown) {
  return JSON.stringify(value);
}

function changedGear(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const left = new Map(before.gear.map((row) => [row.slot, row]));
  const right = new Map(after.gear.map((row) => [row.slot, row]));
  return [...new Set([...left.keys(), ...right.keys()])]
    .filter((slot) => signature(left.get(slot) ?? null) !== signature(right.get(slot) ?? null));
}

function changedSkills(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const left = new Map(before.skills.map((row) => [skillKey(row), row]));
  const right = new Map(after.skills.map((row) => [skillKey(row), row]));
  return [...new Set([...left.keys(), ...right.keys()])]
    .filter((key) => signature(left.get(key) ?? null) !== signature(right.get(key) ?? null));
}

function changedTrees(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const left = new Map(before.trees.map((row) => [row.id, row]));
  const right = new Map(after.trees.map((row) => [row.id, row]));
  return [...new Set([...left.keys(), ...right.keys()])]
    .filter((key) => signature(left.get(key) ?? null) !== signature(right.get(key) ?? null));
}

function changedByKey<T>(
  before: T[],
  after: T[],
  key: (row: T, index: number) => string,
) {
  const left = new Map(before.map((row, index) => [key(row, index), row]));
  const right = new Map(after.map((row, index) => [key(row, index), row]));
  return [...new Set([...left.keys(), ...right.keys()])]
    .filter((id) => signature(left.get(id) ?? null) !== signature(right.get(id) ?? null));
}

export function changedRowsBySystem(
  before: AnalyzedLoadout,
  after: AnalyzedLoadout,
): Record<BuildSystem, number> {
  return {
    gear: changedGear(before, after).length,
    skills: changedSkills(before, after).length,
    trees: changedTrees(before, after).length,
    memories: changedByKey(before.memories, after.memories, (row) => row.slot).length,
    slates: changedByKey(before.slates, after.slates, (_row, index) => String(index)).length,
    pacts: changedByKey(before.pactspirits, after.pactspirits, (_row, index) => String(index)).length,
  };
}

function supportSwapInsight(before: SkillRow, after: SkillRow): StructuralInsight | null {
  const left = new Map(before.supports.map((support) => [supportKey(support), support]));
  const right = new Map(after.supports.map((support) => [supportKey(support), support]));
  const removed = [...left.entries()].filter(([key]) => !right.has(key)).map(([, row]) => row.name);
  const added = [...right.entries()].filter(([key]) => !left.has(key)).map(([, row]) => row.name);
  const configurationChanges = [...left.entries()]
    .filter(([key, row]) => {
      const next = right.get(key);
      return Boolean(next) && (
        row.level !== next!.level
        || row.tier !== next!.tier
        || row.rank !== next!.rank
        || signature(row.rollValues ?? []) !== signature(next!.rollValues ?? [])
        || Boolean(row.fingerprint && next!.fingerprint && row.fingerprint !== next!.fingerprint)
      );
    })
    .map(([key, row]) => {
      const next = right.get(key)!;
      const changes = [
        row.level !== next.level ? `level ${row.level ?? "?"} → ${next.level ?? "?"}` : "",
        row.tier !== next.tier ? `tier ${row.tier ?? "?"} → ${next.tier ?? "?"}` : "",
        row.rank !== next.rank ? `rank ${row.rank ?? "?"} → ${next.rank ?? "?"}` : "",
        signature(row.rollValues ?? []) !== signature(next.rollValues ?? [])
          ? `rolls [${(row.rollValues ?? []).join(", ") || "none"}] → [${(next.rollValues ?? []).join(", ") || "none"}]`
          : "",
      ].filter(Boolean);
      return `${row.name}: ${changes.join("; ") || "source configuration changed"}`;
    });
  if (!removed.length && !added.length && !configurationChanges.length) return null;

  const evidence = [
    removed.length ? `Removed: ${displayList(removed)}` : "",
    added.length ? `Added: ${displayList(added)}` : "",
    ...configurationChanges,
  ].filter(Boolean);
  const minion = /summon|spirit magus|module:/i.test(after.name);
  const replacement = removed.length || added.length;
  return {
    id: "main-support-swap",
    priority: removed.length ? 100 : 82,
    tone: removed.length ? "risk" : "candidate",
    label: "Main skill supports",
    title: replacement && removed.length
      ? `${removed.length === 1 ? "A support was" : `${removed.length} supports were`} replaced on ${after.name}`
      : replacement
        ? `${added.length} support${added.length === 1 ? " was" : "s were"} added to ${after.name}`
        : `A support configuration changed on ${after.name}`,
    explanation: minion
      ? "Minion supports can alter the summoned actor, its action, or its uptime. Verify the replacement on the minion’s own damage formula before judging the larger tooltip text."
      : "Supports commonly supply separate multipliers or enable mechanics. This is one of the first places to check when a changed build loses damage.",
    evidence,
    section: "skills",
  };
}

function primarySkillInsights(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const insights: StructuralInsight[] = [];
  const left = primarySkill(before);
  const right = primarySkill(after);
  if (!left || !right) return insights;
  if (skillKey(left) !== skillKey(right)) {
    insights.push({
      id: "main-skill-changed",
      priority: 120,
      tone: "risk",
      label: "Main damage skill",
      title: `The main skill changed from ${left.name} to ${right.name}`,
      explanation: "A different main skill changes base damage, tags, supports, cadence, and which modifiers apply. Compare it as a new formula rather than as a single-item upgrade.",
      evidence: [`Before: ${left.name}`, `After: ${right.name}`],
      section: "skills",
    });
    return insights;
  }
  if (left.level !== right.level) {
    const down = (right.level ?? 0) < (left.level ?? 0);
    insights.push({
      id: "main-skill-level",
      priority: down ? 112 : 78,
      tone: down ? "risk" : "candidate",
      label: "Main skill level",
      title: `${right.name} changed from level ${left.level ?? "?"} to ${right.level ?? "?"}`,
      explanation: "Main-skill levels can change both the base hit and added-damage effectiveness, so their impact is usually broader than one increased-damage roll.",
      evidence: [`L${left.level ?? "?"} → L${right.level ?? "?"}`],
      section: "skills",
    });
  }
  const swap = supportSwapInsight(left, right);
  if (swap) insights.push(swap);
  return insights;
}

function weaponInsight(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const weaponSlots = ["mainhand", "offhand", "weapon"];
  const rows = (loadout: AnalyzedLoadout) => new Map(loadout.gear.map((row) => [normalized(row.slot), row]));
  const left = rows(before);
  const right = rows(after);
  const changed = weaponSlots
    .map((slot) => ({ slot, before: left.get(slot), after: right.get(slot) }))
    .filter(({ before: a, after: b }) => signature(a ?? null) !== signature(b ?? null));
  if (!changed.length) return null;
  const evidence = changed.map(({ slot, before: a, after: b }) =>
    `${slot.replace("hand", " hand")}: ${a?.name ?? "Empty"} → ${b?.name ?? "Empty"}`);
  return {
    id: "weapon-change",
    priority: 96,
    tone: "risk" as const,
    label: "Weapon base",
    title: `${changed.length === 1 ? "A weapon slot changed" : "Weapon slots changed"}`,
    explanation: "Weapon base damage, local attack speed, and local critical rating are multiplied by much of the rest of the build. A visually stronger affix can still lose if the base weapon is weaker.",
    evidence,
    section: "gear" as const,
  };
}

function otherGearInsight(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const slots = changedGear(before, after)
    .filter((slot) => !/mainhand|offhand|weapon/i.test(slot));
  if (!slots.length) return null;
  const left = new Map(before.gear.map((row) => [row.slot, row]));
  const right = new Map(after.gear.map((row) => [row.slot, row]));
  const evidence = slots.slice(0, 4).map((slot) => {
    const a = left.get(slot);
    const b = right.get(slot);
    return `${slot.replace(/([a-z])([A-Z])/g, "$1 $2")}: ${a?.name ?? "Empty"} → ${b?.name ?? "Empty"}`;
  });
  return {
    id: "gear-change",
    priority: 58,
    tone: "neutral" as const,
    label: "Gear",
    title: `${slots.length} non-weapon gear slot${slots.length === 1 ? "" : "s"} changed`,
    explanation: "Review the removed and added modifier lines side by side. Pay special attention to additional damage, penetration, critical reliability, skill levels, and mechanic-enabling text.",
    evidence,
    section: "gear" as const,
  };
}

function treeInsights(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const insights: StructuralInsight[] = [];
  const left = new Map(before.trees.map((tree) => [tree.id, tree]));
  const right = new Map(after.trees.map((tree) => [tree.id, tree]));
  const removed = [...left.entries()].filter(([id]) => !right.has(id)).map(([, tree]) => tree.name);
  const added = [...right.entries()].filter(([id]) => !left.has(id)).map(([, tree]) => tree.name);
  if (removed.length || added.length) {
    insights.push({
      id: "tree-swap",
      priority: 92,
      tone: "risk",
      label: "Talent architecture",
      title: "One or more talent trees were replaced",
      explanation: "A tree swap changes many small additive stats and often one or more separate mechanic multipliers at once. Rebuild the comparison from the tree outward.",
      evidence: [
        removed.length ? `Removed: ${displayList(removed)}` : "",
        added.length ? `Added: ${displayList(added)}` : "",
      ].filter(Boolean),
      section: "trees",
    });
  }
  const notableChanges: string[] = [];
  const pointChanges: string[] = [];
  for (const [id, a] of left) {
    const b = right.get(id);
    if (!b) continue;
    if (a.notable12 !== b.notable12 || a.notable24 !== b.notable24 || a.hasPrism !== b.hasPrism) {
      notableChanges.push(`${b.name}: notable or prism selection changed`);
    } else if (a.points !== b.points) {
      pointChanges.push(`${b.name}: ${a.points} → ${b.points} points`);
    }
  }
  if (notableChanges.length) {
    insights.push({
      id: "notable-change",
      priority: 88,
      tone: "risk",
      label: "Core talents",
      title: `${notableChanges.length} core talent or prism selection${notableChanges.length === 1 ? "" : "s"} changed`,
      explanation: "Core talents and prism overrides often alter mechanics rather than merely adding to a stat pool, so they deserve an explicit before/after check.",
      evidence: notableChanges.slice(0, 4),
      section: "trees",
    });
  } else if (pointChanges.length) {
    insights.push({
      id: "tree-points",
      priority: 52,
      tone: "neutral",
      label: "Talent points",
      title: `${pointChanges.length} talent tree allocation${pointChanges.length === 1 ? "" : "s"} changed`,
      explanation: "Point totals show where the allocation moved, but individual node text is required before assigning a DPS direction.",
      evidence: pointChanges.slice(0, 4),
      section: "trees",
    });
  }
  return insights;
}

function pactIdentity(row: PactRow | undefined) {
  return row ? `${row.name}${row.level != null ? ` L${row.level}` : ""}` : "Empty";
}

function pactInsight(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const changed = changedByKey(before.pactspirits, after.pactspirits, (_row, index) => String(index));
  if (!changed.length) return null;
  const total = (rows: PactRow[]) => rows.reduce(
    (sum, row) => ({ nodes: sum.nodes + row.nodes, kismets: sum.kismets + row.kismets }),
    { nodes: 0, kismets: 0 },
  );
  const a = total(before.pactspirits);
  const b = total(after.pactspirits);
  const evidence = changed.slice(0, 3).map((key) =>
    `Slot ${Number(key) + 1}: ${pactIdentity(before.pactspirits[Number(key)])} → ${pactIdentity(after.pactspirits[Number(key)])}`);
  evidence.push(`Allocated nodes: ${a.nodes} → ${b.nodes}; kismets: ${a.kismets} → ${b.kismets}`);
  return {
    id: "pact-change",
    priority: 66,
    tone: b.nodes < a.nodes || b.kismets < a.kismets ? "risk" as const : "neutral" as const,
    label: "Pactspirits & kismets",
    title: `${changed.length} pact slot${changed.length === 1 ? "" : "s"} changed`,
    explanation: "Pact nodes and paired kismets can provide separate multipliers, conditional effects, or actor-scoped minion bonuses. Compare the complete page, not only the pet name.",
    evidence,
    section: "pacts" as const,
  };
}

function auxiliaryInsight(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const memoryChanges = changedByKey(before.memories, after.memories, (row) => row.slot).length;
  const slateChanges = changedByKey(before.slates, after.slates, (_row, index) => String(index)).length;
  if (!memoryChanges && !slateChanges) return null;
  const evidence = [
    memoryChanges ? `${memoryChanges} memory slot${memoryChanges === 1 ? "" : "s"} changed` : "",
    slateChanges ? `${slateChanges} divinity slate${slateChanges === 1 ? "" : "s"} changed` : "",
  ].filter(Boolean);
  return {
    id: "auxiliary-change",
    priority: 48,
    tone: "neutral" as const,
    label: "Memories & slates",
    title: "Secondary build systems changed",
    explanation: "These systems can hide large conditional or separately multiplying effects. Their exact affix text must be resolved before assigning impact.",
    evidence,
    section: memoryChanges ? "memories" as const : "slates" as const,
  };
}

export function compareStructure(
  before: AnalyzedLoadout,
  after: AnalyzedLoadout,
): StructuralComparison {
  const changedRows = changedRowsBySystem(before, after);
  const insights = [
    ...primarySkillInsights(before, after),
    weaponInsight(before, after),
    ...treeInsights(before, after),
    pactInsight(before, after),
    otherGearInsight(before, after),
    auxiliaryInsight(before, after),
  ].filter((insight): insight is StructuralInsight => Boolean(insight))
    .sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title));

  if (!insights.length && Object.values(changedRows).some(Boolean)) {
    insights.push({
      id: "other-structural-change",
      priority: 20,
      tone: "neutral",
      label: "Imported structure",
      title: "The loadouts differ in imported details",
      explanation: "Open Build changes to inspect each source entity. A formula model is still required before the site can assign DPS impact.",
      evidence: SYSTEMS
        .filter((system) => changedRows[system])
        .map((system) => `${system}: ${changedRows[system]} changed`),
      section: SYSTEMS.find((system) => changedRows[system]) ?? "gear",
    });
  }

  return {
    changedSystems: SYSTEMS.filter((system) => changedRows[system] > 0),
    changedRows,
    insights,
  };
}
