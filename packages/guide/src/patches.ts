/** Loadout edits dps-debug's what-if has no change kind for. tli-lens applies them to the loadout JSON before dps-debug prices it. */
import type { Change, Loadout } from './types';

export type LoadoutPatch =
  | { kind: 'patch'; op: 'prism-provide'; tree: number; extraAffix: { id: number; dyn: number[] }[] }
  | { kind: 'patch'; op: 'slate-board'; items: { itemId: string; baseId: number; talents: number[]; influence: Record<string, unknown> }[] }
  | { kind: 'patch'; op: 'inverse'; copies: { node: number; points: number; ee: number }[]; remove?: number[] }
  /** a known build's hero memories / vorax limbs written into the loadout (dps-debug has no what-if change for them; it prices the loadout's lists) */
  | { kind: 'patch'; op: 'memories'; items: unknown[] } | { kind: 'patch'; op: 'vorax'; items: unknown[] }
  | { kind: 'patch'; op: 'skill-group'; place: { kind: string; slot: number }; items: unknown[] };

export const isPatch = (c: Change | LoadoutPatch): c is LoadoutPatch => (c as { kind: string }).kind === 'patch';

type Rt = [number, number, string];

/** Pure. prism-provide: `prisms.provide[tree].ExtraAffix` (loadout.ts "prism-wide extra") gains the entries.
 *  slate-board: `slateItems` becomes the given resolved slates (the server-resolved influence arrays, as dps-debug prices its target build).
 *  inverse: `resolvedTalents.talents` loses the `remove` originals and gains one mirror entry per copy, weight Point x (1 + EE/100),
 *  tag `talent:-<node>@<100+EE>%` (loadout.ts:237-250). */
export function applyPatch(lo: Loadout, p: LoadoutPatch): Loadout {
  const l = structuredClone(lo) as Record<string, any>;
  if (p.op === 'prism-provide') {
    const slot = ((l.prisms ??= {}).provide ??= {})[p.tree] ??= { ExtraAffix: [], TalentId: 0 };
    slot.ExtraAffix = [...(Array.isArray(slot.ExtraAffix) ? slot.ExtraAffix : []), ...p.extraAffix.map(x => ({ Id: x.id, DynArgs: [...x.dyn] }))];
    return l;
  }
  if (p.op === 'slate-board') { l.slateItems = structuredClone(p.items); return l; }
  if (p.op === 'memories') { l.heroMemories = structuredClone(p.items); return l; }
  if (p.op === 'skill-group') {   // the skill in that place and its supports become `items`
    type G = { place: { kind: string; slot: number; ownerKind?: string; ownerSlot?: number } };
    const mine = (g: G) => (g.place.kind === p.place.kind && g.place.slot === p.place.slot) || (g.place.kind === 'support' && g.place.ownerKind === p.place.kind && g.place.ownerSlot === p.place.slot);
    l.skills = [...((l.skills ?? []) as G[]).filter((g) => !mine(g)), ...structuredClone(p.items)];
    return l;
  }
  if (p.op === 'vorax') {   // a limb takes its gear slot (the game's export: Vorax Limb: Digits in ring1, no ring1 gear)
    l.vorax = structuredClone(p.items);
    const taken = new Set((l.vorax as { slot?: string }[]).map((v) => v.slot));
    l.gear = ((l.gear ?? []) as { slot?: string }[]).filter((g) => !taken.has(g.slot));
    return l;
  }   // slateItems replaces the flat slates / slateScale lists (dps-debug loadout.ts:211)
  const rt: Rt[] = l.resolvedTalents?.talents ?? Object.entries(l.talents ?? {}).map(([id, pt]) => [Number(id), pt as number, `talent:${id}`] as Rt);
  const gone = new Set(p.remove ?? []);
  l.resolvedTalents = { ...l.resolvedTalents, talents: [
    ...rt.filter(([id, , tag]) => tag.startsWith('talent:-') || !gone.has(id)),
    ...p.copies.map(c => [c.node, c.points * (1 + c.ee / 100), `talent:-${c.node}@${100 + c.ee}%`] as Rt),
  ] };
  l.resolvedTalents.ext ??= [];
  return l;
}
