/* mechanics.md#supports-ss13 — SS13 support-gem data (page/src/data/supports.json,
   transcribed from tlidb SS13Season blocks). Values scale piecewise-linearly
   between the page's (LvN:v) anchors, clamped outside the anchor range. */

export interface SupportLine {
  text: string;                       // "{v}"/"{v2}" mark where anchor values render
  kind: "additional" | "attack_speed" | "added_flat" | "info";
  on?: boolean;                       // default apply state for model-feeding kinds
  anchors?: Record<string, number>;   // gem level -> value
  anchors2?: Record<string, number>;  // second value, e.g. max of a min–max range
}

export interface ModuleProgram {
  name: string;
  tier: number;
  text: string;                       // per-module flavored description
}

export interface SupportGem {
  name: string;
  tags: string[];
  mana_mult_pct: number;              // 0 for categories without one (actives etc.)
  requires: string;                   // "" outside the support categories
  level?: number;                     // card display level for un-anchored values
  attrs?: Record<string, string>;     // Mana Cost, Cast Speed, Cooldown, Sealed Mana…
  programs?: ModuleProgram[];         // Modularization pool; a module runs 1–2 of these
  lines: SupportLine[];
}

export function supportValueAt(anchors: Record<string, number>, level: number): number {
  const pts = Object.entries(anchors)
    .map(([lv, v]) => [Number(lv), v] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  if (level <= pts[0][0]) return pts[0][1];
  if (level >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  const hi = pts.findIndex(([lv]) => lv >= level);
  const [l0, v0] = pts[hi - 1];
  const [l1, v1] = pts[hi];
  return v0 + ((level - l0) / (l1 - l0)) * (v1 - v0);
}
