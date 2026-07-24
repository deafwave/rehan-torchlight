import type { SkillRow } from "./analysis-types";

export type PresentedChangeKind = "same" | "added" | "removed" | "changed";

export function presentedChangeKind(
  before: string,
  after: string,
  changed: boolean,
): PresentedChangeKind {
  if (!changed) return "same";
  if (!before || before === "Empty") return "added";
  if (!after || after === "Empty") return "removed";
  return "changed";
}

export function skillDisplay(skill: SkillRow | undefined) {
  if (!skill) return "Empty";
  const level = skill.level != null ? ` · L${skill.level}` : "";
  return `${skill.name}${level} · ${skill.enabled ? "enabled" : "disabled"}`;
}
