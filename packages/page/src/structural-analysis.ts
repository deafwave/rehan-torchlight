import type {
  AnalyzedLoadout,
  PactRow,
  SkillRow,
} from "./analysis-types";
import { supportInstanceEvidenceRef } from "./support-instance-comparison";

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
  changeRefs?: Array<{ key: string; evidence: string }>;
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
  const candidates = loadout.skills.filter((skill) =>
    skill.kind === "active" && !isMinionSkill(skill));
  if (!isMinionLoadout(loadout)) {
    return candidates.find((skill) => skill.enabled) ?? candidates[0];
  }
  const modeledSkillId = normalized(loadout.model?.skillId);
  const explicit = candidates.find((skill) => {
    const identities = [skill.guid, skill.name].map(normalized);
    return modeledSkillId.length > 0 && identities.includes(modeledSkillId);
  });
  if (explicit) return explicit;
  if (loadout.bingIntrinsicEvidence) {
    return candidates.find((skill) => /hammer of ash/i.test(skill.name));
  }
  return undefined;
}

function isMinionSkill(skill: SkillRow) {
  return /summon|spirit mag(?:us|i)|minion|synthetic troop/i.test(
    skill.name,
  );
}

function isMinionActorSkill(loadout: AnalyzedLoadout, skill: SkillRow) {
  const identity = skill.guid || skill.name;
  return (loadout.summonEvidence ?? []).some((summon) =>
    summon.skillId === identity)
    || isMinionSkill(skill);
}

function minionSkills(loadout: AnalyzedLoadout) {
  return loadout.skills.filter((skill) =>
    skill.enabled && isMinionActorSkill(loadout, skill));
}

function isMinionLoadout(loadout: AnalyzedLoadout) {
  return minionSkills(loadout).length > 0
    || Boolean(loadout.summonEvidence?.length)
    || /minion|spirit mag(?:us|i)|summon|synthetic troop/i.test(
      loadout.sourceNote ?? "",
    );
}

function skillKey(skill: SkillRow) {
  return skill.slot || skill.guid || `${skill.kind}:${normalized(skill.name)}`;
}

function actorSkillKey(skill: SkillRow) {
  return skill.guid || `${skill.kind}:${normalized(skill.name)}`;
}

function supportKey(support: SkillRow["supports"][number]) {
  return support.guid || `${support.type}:${normalized(support.name)}`;
}

function supportSocketKey(
  support: SkillRow["supports"][number],
  index: number,
) {
  return support.slot?.trim() || String(index);
}

function supportSocketId(socket: string) {
  return socket.startsWith("support:") ? socket : `support:${socket}`;
}

function supportSocketLabel(socket: string) {
  const numeric = Number(socket);
  return Number.isSafeInteger(numeric) && numeric >= 0
    ? `socket ${numeric + 1}`
    : socket.replace(/^support:/u, "socket ");
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

function supportSwapInsight(
  before: SkillRow,
  after: SkillRow,
  id = "main-support-swap",
  actorKind: "player" | "minion" =
    isMinionSkill(after) ? "minion" : "player",
  explicitActorId?: string,
): StructuralInsight | null {
  const left = new Map(before.supports.map((support, index) => [
    supportSocketKey(support, index),
    support,
  ]));
  const right = new Map(after.supports.map((support, index) => [
    supportSocketKey(support, index),
    support,
  ]));
  const removedRows = [...left.entries()]
    .filter(([key]) => !right.has(key));
  const addedRows = [...right.entries()]
    .filter(([key]) => !left.has(key));
  const replacements = [...left.entries()].flatMap(([socket, row]) => {
    const next = right.get(socket);
    return next && supportKey(row) !== supportKey(next)
      ? [{ socket, before: row, after: next }]
      : [];
  });
  const removed = removedRows.map(([, row]) => row.name);
  const added = addedRows.map(([, row]) => row.name);
  const configurationChanges = [...left.entries()]
    .filter(([socket, row]) => {
      const next = right.get(socket);
      return Boolean(next)
        && supportKey(row) === supportKey(next!)
        && (
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
      return {
        socket: key,
        evidence:
          `${supportSocketLabel(key)} · ${row.name}: ${changes.join("; ") || "source configuration changed"}`,
      };
    });
  if (!removed.length
      && !added.length
      && !replacements.length
      && !configurationChanges.length) return null;

  const evidence = [
    ...replacements.map((change) =>
      `${supportSocketLabel(change.socket)}: ${change.before.name} → ${change.after.name}`),
    ...removedRows.map(([socket, row]) =>
      `Removed from ${supportSocketLabel(socket)}: ${row.name}`),
    ...addedRows.map(([socket, row]) =>
      `Added to ${supportSocketLabel(socket)}: ${row.name}`),
    ...configurationChanges.map((change) => change.evidence),
  ].filter(Boolean);
  const minion = actorKind === "minion";
  const actorId = explicitActorId
    ?? (minion ? actorSkillKey(after) : "player");
  const skillId = after.guid || before.guid || actorSkillKey(after);
  const ref = (
    side: "before" | "after",
    socket: string,
    supportId: string,
  ) => supportInstanceEvidenceRef(side, {
    actorId,
    skillId,
    socketId: supportSocketId(socket),
    supportId,
  });
  const changeRefs = [
    ...replacements.flatMap((change) => [{
      key: ref("before", change.socket, supportKey(change.before)),
      evidence:
        `Removed from ${supportSocketLabel(change.socket)}: ${change.before.name}`,
    }, {
      key: ref("after", change.socket, supportKey(change.after)),
      evidence:
        `Added to ${supportSocketLabel(change.socket)}: ${change.after.name}`,
    }]),
    ...removedRows.map(([socket, row]) => ({
      key: ref("before", socket, supportKey(row)),
      evidence: `Removed from ${supportSocketLabel(socket)}: ${row.name}`,
    })),
    ...addedRows.map(([socket, row]) => ({
      key: ref("after", socket, supportKey(row)),
      evidence: `Added to ${supportSocketLabel(socket)}: ${row.name}`,
    })),
    ...configurationChanges.map((change) => ({
      key: ref(
        "before",
        change.socket,
        supportKey(left.get(change.socket)!),
      ),
      evidence: change.evidence,
    })),
  ];
  const replacement =
    replacements.length > 0
    || (removed.length > 0 && added.length > 0);
  const removedOnly = removed.length > 0 && added.length === 0;
  const replacementCount =
    replacements.length + Math.min(removed.length, added.length);
  return {
    id,
    priority: replacement || removed.length ? 100 : 82,
    tone: replacement || removed.length ? "risk" : "candidate",
    label: "Main skill supports",
    title: replacement
      ? `${replacementCount === 1 ? "A support was" : `${replacementCount} supports were`} replaced on ${after.name}`
      : removedOnly
        ? `${removed.length} support${removed.length === 1 ? " was" : "s were"} removed from ${after.name}`
        : added.length
          ? `${added.length} support${added.length === 1 ? " was" : "s were"} added to ${after.name}`
        : `A support configuration changed on ${after.name}`,
    explanation: minion
      ? "Minion supports can alter the summoned actor, its action, or its uptime. Verify the replacement on the minion’s own damage formula before judging the larger tooltip text."
      : "Supports commonly supply separate multipliers or enable mechanics. This is one of the first places to check when a changed build loses damage.",
    evidence,
    changeRefs,
    section: "skills",
  };
}

function primarySkillInsights(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const insights: StructuralInsight[] = [];
  const beforeMinions = minionSkills(before);
  const afterMinions = minionSkills(after);
  if (beforeMinions.length || afterMinions.length) {
    const left = new Map(beforeMinions.map((skill) => [actorSkillKey(skill), skill]));
    const right = new Map(afterMinions.map((skill) => [actorSkillKey(skill), skill]));
    const removed = [...left.entries()]
      .filter(([key]) => !right.has(key))
      .map(([, skill]) => skill.name);
    const added = [...right.entries()]
      .filter(([key]) => !left.has(key))
      .map(([, skill]) => skill.name);
    if (removed.length || added.length) {
      insights.push({
        id: "minion-skill-roster",
        priority: 120,
        tone: "risk",
        label: "Summoned damage actors",
        title: "The enabled summon roster changed",
        explanation:
          "Each summon has its own actor base, actions, supports, and rotation. Compare every enabled summon independently instead of treating the first active skill as the whole build.",
        evidence: [
          removed.length ? `Removed: ${displayList(removed)}` : "",
          added.length ? `Added: ${displayList(added)}` : "",
        ].filter(Boolean),
        section: "skills",
      });
    }
    for (const [key, earlier] of left) {
      const current = right.get(key);
      if (!current) continue;
      if (earlier.level !== current.level) {
        const down = (current.level ?? 0) < (earlier.level ?? 0);
        insights.push({
          id: `minion-skill-level:${key}`,
          priority: down ? 112 : 78,
          tone: down ? "risk" : "candidate",
          label: "Summon skill level",
          title:
            `${current.name} changed from level ${earlier.level ?? "?"} to ${current.level ?? "?"}`,
          explanation:
            "A summon-skill level changes the summoned actor baseline and its action foundations. It must be evaluated on that actor, not through the player's weapon-hit formula.",
          evidence: [`L${earlier.level ?? "?"} → L${current.level ?? "?"}`],
          section: "skills",
        });
      }
      const swap = supportSwapInsight(
        earlier,
        current,
        `minion-support-swap:${key}`,
        "minion",
        key,
      );
      if (swap) insights.push(swap);
    }
  }
  const left = primarySkill(before);
  const right = primarySkill(after);
  if (!left || !right) return insights;
  const hybrid = beforeMinions.length > 0 || afterMinions.length > 0;
  if (skillKey(left) !== skillKey(right)) {
    insights.push({
      id: hybrid ? "player-main-skill-changed" : "main-skill-changed",
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
      id: hybrid ? "player-main-skill-level" : "main-skill-level",
      priority: down ? 112 : 78,
      tone: down ? "risk" : "candidate",
      label: "Main skill level",
      title: `${right.name} changed from level ${left.level ?? "?"} to ${right.level ?? "?"}`,
      explanation: "Main-skill levels can change both the base hit and added-damage effectiveness, so their impact is usually broader than one increased-damage roll.",
      evidence: [`L${left.level ?? "?"} → L${right.level ?? "?"}`],
      section: "skills",
    });
  }
  const swap = supportSwapInsight(
    left,
    right,
    hybrid ? "player-main-support-swap" : "main-support-swap",
    "player",
    after.comparisonContext?.actorId
      ?? before.comparisonContext?.actorId
      ?? "player",
  );
  if (swap) insights.push(swap);
  return insights;
}

function otherSkillInsights(
  before: AnalyzedLoadout,
  after: AnalyzedLoadout,
): StructuralInsight[] {
  const left = new Map(before.skills.map((skill) => [skillKey(skill), skill]));
  const right = new Map(after.skills.map((skill) => [skillKey(skill), skill]));
  const represented = new Set([
    ...minionSkills(before).map(skillKey),
    ...minionSkills(after).map(skillKey),
    ...(primarySkill(before) ? [skillKey(primarySkill(before)!)] : []),
    ...(primarySkill(after) ? [skillKey(primarySkill(after)!)] : []),
  ]);
  const changed = [...new Set([...left.keys(), ...right.keys()])]
    .filter((key) =>
      !represented.has(key)
      && signature(left.get(key) ?? null) !== signature(right.get(key) ?? null));
  if (!changed.length) return [];
  const moduleChanges = changed.filter((key) => {
    const earlier = left.get(key);
    const current = right.get(key);
    return /(^|\b)module:/i.test(earlier?.name ?? "")
      || /(^|\b)module:/i.test(current?.name ?? "")
      || /module/i.test(earlier?.slot ?? current?.slot ?? "");
  });
  const otherChanges = changed.filter((key) => !moduleChanges.includes(key));
  const evidenceFor = (keys: string[]) => keys.slice(0, 6).map((key) => {
    const earlier = left.get(key);
    const current = right.get(key);
    const slot = current?.slot ?? earlier?.slot ?? key;
    return `${slot}: ${earlier?.name ?? "Empty"} → ${current?.name ?? "Empty"}`;
  });
  return [
    ...(moduleChanges.length
      ? [{
          id: "actor-module-change",
          priority: 86,
          tone: "neutral" as const,
          label: "Actor modules",
          title: `${moduleChanges.length} actor module${moduleChanges.length === 1 ? "" : "s"} changed`,
          explanation:
            "A module can change which actor mechanic or action package is active, but the module name alone is not proof of a summoned damage actor. Isolate the module swap before assigning direction.",
          evidence: evidenceFor(moduleChanges),
          section: "skills" as const,
        }]
      : []),
    ...(otherChanges.length
      ? [{
          id: "other-skill-change",
          priority: 44,
          tone: "neutral" as const,
          label: "Other skills",
          title: `${otherChanges.length} utility or unassigned skill socket${otherChanges.length === 1 ? "" : "s"} changed`,
          explanation:
            "These sockets changed outside the proven main player and summoned-actor tracks. Inspect their support, aura, trigger, or utility role without treating slot order as proof that they deal the build’s main damage.",
          evidence: evidenceFor(otherChanges),
          section: "skills" as const,
        }]
      : []),
  ];
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
  if (isMinionLoadout(before) || isMinionLoadout(after)) {
    return {
      id: "player-weapon-change",
      priority: 36,
      tone: "neutral" as const,
      label: "Player weapon",
      title: `${changed.length === 1 ? "A player weapon slot changed" : "Player weapon slots changed"}`,
      explanation:
        "Spirit Magi use their own actor baselines; the player's weapon base does not automatically feed their actions. Review only explicit Minion, Spirit Magus, aura, or mechanic-enabling text on this item before assigning an impact.",
      evidence,
      section: "gear" as const,
    };
  }
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
    ...otherSkillInsights(before, after),
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
