import { resolve, type Breakdown, type Chip, type TraceNode } from "@rehan/dmg/damageModel";

/* Renders a cycleDps() trace as colored chips: three rows (rotation → per-hit → DoT),
   one chip per factor, each with a marginal-impact badge. Consumes the trace only —
   no damage logic lives here, so the chips always match the model's number. */

// Which display row a chip kind belongs to. Rotation = throughput; per-hit = how one
// hit scales; DoT = the Deterioration layer.
const ROW: Record<Chip["kind"], "rotation" | "perhit" | "dot"> = {
  rotation: "rotation", dot: "dot",
  base: "perhit", increased: "perhit", additional: "perhit", taken: "perhit",
  crit: "perhit", mitigation: "perhit",
};

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

function chipValue(c: Chip): string {
  if (c.op === "base") return compact.format(c.factor);
  if (c.op === "+") return `+${Math.round(c.factor * 1000) / 10}%`;
  return `×${c.factor.toFixed(2)}`;
}

// Marginal impact: the DPS change if this factor were neutral. Positive-loss shows as
// "−53%" (removing it costs 53%); a reduction factor (mitigation) shows "+X%".
function impactBadge(root: TraceNode, insts: Chip[]): string {
  const total = resolve(root);
  if (!total) return "";
  const delta = resolve(root, new Set(insts)) / total - 1;   // <0 = removing it lowers DPS
  if (Math.abs(delta) < 0.005) return "";
  const pct = Math.round(delta * 100);
  return `<span class="chip-imp">${pct >= 0 ? "+" : "−"}${Math.abs(pct)}%</span>`;
}

function collect(node: TraceNode, acc: Chip[]): void {
  acc.push(...node.chips);
  node.children?.forEach(ch => collect(ch, acc));
}

export function renderBreakdown(bd: Breakdown): string {
  const all: Chip[] = [];
  collect(bd.root, all);

  // Collapse chips that are identical everywhere they appear (e.g. the same mitigation on
  // both the starter and finisher path) into one display chip; its impact neutralizes all
  // instances at once so the number stays exact.
  const groups = new Map<string, Chip[]>();
  for (const c of all) {
    const k = `${c.kind}|${c.label}|${c.factor}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(c);
  }
  const rows: Record<"rotation" | "perhit" | "dot", Chip[][]> = { rotation: [], perhit: [], dot: [] };
  for (const insts of groups.values()) rows[ROW[insts[0].kind]].push(insts);

  const chipHtml = (insts: Chip[]) => {
    const c = insts[0];
    const imp = c.op === "base" ? "" : impactBadge(bd.root, insts);
    return `<span class="chip chip--${c.kind}" title="${c.label}">`
         + `<span class="chip-lbl">${c.label}</span> <b>${chipValue(c)}</b>${imp}</span>`;
  };

  const layer = (name: string, value: number, cls: string, insts: Chip[][], op: string) =>
    insts.length ? `<div class="bd-layer bd-layer--${cls}">`
      + `<div class="bd-layer-head"><span class="bd-layer-name">${name}</span>`
      + `<span class="bd-layer-val">${compact.format(value)}</span></div>`
      + `<div class="bd-chips">${insts.map((g, i) => (i && op ? `<span class="chip-op">${op}</span>` : "") + chipHtml(g)).join("")}</div></div>`
      : "";

  const L = bd.layers;
  return `<details class="bd" open>`
    + `<summary class="bd-total"><span class="bd-total-num">${compact.format(bd.total)}</span>`
    + `<span class="bd-total-cap">boss DPS</span></summary>`
    + layer("per-hit", L.perHit.value, "perhit", rows.perhit, "")
    + layer("rotation", L.rotation.value, "rotation", rows.rotation, "×")
    + (L.dot ? layer("Deterioration", L.dot.value, "dot", rows.dot, "×") : "")
    + `</details>`;
}
