/* Explain layer: a self-resolving tree of the exact arithmetic cycleDps performed.
   damageModel builds it; the page renders it as colored chips. `resolve(root)` MUST
   reproduce cycleDps().dps — that equality (a test) is why the chips can't lie. */

export type ChipKind =
  | "base" | "increased" | "additional" | "taken"
  | "crit" | "mitigation" | "rotation" | "dot";

export interface Chip {
  kind: ChipKind;
  label: string;
  // op "base": absolute damage (summed among a node's base chips)
  // op "+":    additive line, folded into one pool applied as ×(1+Σ)  (the increased pool)
  // op "×":    its own multiplicative factor
  op: "base" | "+" | "×";
  factor: number;
}

export interface Node {
  label: string;
  value: number;                 // resolve(node) — set by the builder for display
  op: "sum" | "product";         // how children combine
  chips: Chip[];
  children?: Node[];
}

export interface Breakdown {
  total: number;
  root: Node;
  layers: { rotation: Node; perHit: Node; dot?: Node };
}

/** Reproduce a node's value from its chips + children. `skip` treats a chip as neutral
    (× → 1, + → 0, base → 0) so `impact` can measure one chip's contribution. */
export function resolve(node: Node, skip?: Set<Chip>): number {
  const on = (c: Chip) => !skip?.has(c);
  const base = node.chips.filter(c => c.op === "base");

  let v: number;
  if (base.length) v = base.reduce((a, c) => a + (on(c) ? c.factor : 0), 0);
  else if (node.children?.length) {
    const vals = node.children.map(ch => resolve(ch, skip));
    v = node.op === "sum" ? vals.reduce((a, b) => a + b, 0)
                          : vals.reduce((a, b) => a * b, 1);
  } else v = 1;

  const pool = node.chips.filter(c => c.op === "+").reduce((a, c) => a + (on(c) ? c.factor : 0), 0);
  v *= 1 + pool;
  for (const c of node.chips) if (c.op === "×") v *= on(c) ? c.factor : 1;
  return v;
}

/** Fraction of the total DPS lost if this chip were neutral. A reduction chip
    (e.g. mitigation ×0.7) reads negative — removing it raises DPS. */
export function impact(root: Node, chip: Chip): number {
  const total = resolve(root);
  return total === 0 ? 0 : 1 - resolve(root, new Set([chip])) / total;
}

/** Set every node's `value` to its resolved number (bottom-up), for display. */
export function setValues(node: Node): number {
  node.children?.forEach(setValues);
  return (node.value = resolve(node));
}
