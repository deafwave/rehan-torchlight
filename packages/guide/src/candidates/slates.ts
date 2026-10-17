/**
 * Slate candidates: remove or move a placed divinity slate, only where dps-debug's slate.ts resolves the board (reboard: Copy rows on single-cell
 * slates; devour / projection / pressure / Copy on a multi-cell slate throw by name -> ctx.notSearched). Buying or placing a slate is not offered:
 * an owned slate's talents are not in the item export (bagdump), so the placement's grant cannot be derived.
 */
import { reboard } from '@dps/src/core/slate';
import type { SlateItem } from '@dps/src/core/loadout';
import type { Catalog } from '@dps/src/types';
import { table } from '../pin';
import type { Change, Evaluator, Figure, Generator, Move, State } from '../types';
import { allTrees, treeCores, treeNodes } from '../talentRules';
import { talentName } from '../names';
import { ctxOfState } from '../search';

const rows = (f: string) => table<{ rows: Record<string, any> }>(f).rows;   // eslint-disable-line @typescript-eslint/no-explicit-any
const TABLES = ['config_talent_block_influence', 'config_talent', 'lua_config_talent_block_shape', 'lua_config_item_talent_block_gold'];
let cat: Catalog | undefined;
/** the four tables slate.ts reads, as a Catalog stand-in */
const catalog = (): Catalog => cat ??= { pe: '0x6aa39847', tables: Object.fromEntries(TABLES.map(f => [f, rows(f)])) } as unknown as Catalog;
const CORE = 2;   // config_talent i4 kind 2 = core talent

const cellKey = (c: number, r: number) => `${c},${r}`;
/** board cell -> hero level it opens at (lua_config_talent_block_board Level, none = open). Row 1180 has no Location in the catalog; the cells placed slates already
 *  occupy are added as open ([inf]: it is the one cell the placed slates use that the table does not list). */
function board(placed: Set<string>): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of Object.values(rows('lua_config_talent_block_board'))) if (r.Location) m.set(cellKey(r.Location[0], r.Location[1]), r.Level ?? 0);
  for (const k of placed) if (!m.has(k)) m.set(k, 0);
  return m;
}

/** a slate's cells in its own orientation, at the origin (its shape rotated by its direction) */
const orientedCells = (it: SlateItem): [number, number][] => { let c = (rows('lua_config_talent_block_shape')[it.shapeId!].Shape as string).split(';').map((q) => q.split(',').map(Number) as [number, number]); for (let i = 0; i < (it.direction ?? 0) % 4; i++) c = c.map(([x, y]) => [-y, x]); return c; };
const cellsOf = (it: SlateItem, slot = (it.link as { SlotId: number }).SlotId, dir = it.direction!): [number, number][] =>
  (rows('lua_config_talent_block_shape')[it.shapeId!].Shape as string).split(';').map(s => {
    let [x, y] = s.split(',').map(Number);
    for (let i = 0; i < dir % 4; i++) [x, y] = [-y, x];
    return [Math.floor(slot / 10) + x, (slot % 10) + y];
  });

/** the board drawn: every cell (the level it opens at) and each placed slate's cells with its lines and where it comes from (`from(i)`, board index i) */
export interface BoardView { cells: { x: number; y: number; level: number }[]; slates: { cells: [number, number][]; lines: string[]; source: string; changed: boolean }[] }
export function boardView(l: Record<string, unknown>, from: (i: number) => { source: string; changed: boolean } = () => ({ source: 'on your board', changed: false }), cellsAt?: [number, number][][]): BoardView {
  const items = (l.slateItems ?? []) as SlateItem[], shapes = rows('lua_config_talent_block_shape');
  const at = (it: SlateItem, i = items.indexOf(it)): [number, number][] => cellsAt?.[i] ?? (shapes[it.shapeId!]?.Shape ? cellsOf(it) : []);
  const held = new Set(items.filter((it) => !it.itemId.startsWith('guide-add-')).flatMap((it) => cellsOf(it).map(([x, y]) => cellKey(x, y))));
  return { cells: [...board(held)].map(([k, level]) => { const [x, y] = k.split(',').map(Number); return { x, y, level }; }),
    slates: items.map((it, i) => ({ cells: at(it), lines: it.talents.map(talentName), ...from(i) })) };
}

/** The board re-laid out (owner, 2026-10-16: moving and rotating a slate costs next to nothing): every placed slate and the `extra` new ones (shape ids) packed
 *  into the board's open cells by an exact search, each by its type's rule - a Pedigree (7 cells, 2090) is only flipped across the vertical axis, a normal
 *  slate (4 cells) takes the square / L / Z shapes in any rotation, a Corner of Divinity or Fallen Starlight (the 2- and 3-cell shapes) any rotation. Null when
 *  they do not all fit; else each slate's cells, the placed ones first in board order, then the extras. */
/** slate types the game allows at most 3 of on a board (owner, 2026-10-16: Corners of Divinity, Fallen Starlight: the 2- and 3-cell bases) */
export const SLATE_CAP: Record<number, number> = { 261003: 3, 261005: 3 };
export const overCap = (items: { baseId: number }[]) => Object.entries(SLATE_CAP).some(([b, n]) => items.filter((x) => x.baseId === +b).length > n);
export function packBoard(l: Record<string, unknown>, level: number, extra: number[]): [number, number][][] | null {
  const items = ((l.slateItems ?? []) as SlateItem[]).filter((it) => !it.itemId.startsWith('guide-add-')), shapes = rows('lua_config_talent_block_shape');
  const cellsOfShape = (id: number): [number, number][] => (shapes[id]?.Shape as string).split(';').map((q) => q.split(',').map(Number) as [number, number]);
  const rot = (c: [number, number][]) => c.map(([x, y]) => [-y, x] as [number, number]), mirror = (c: [number, number][]) => c.map(([x, y]) => [-x, y] as [number, number]);
  const rots = (c: [number, number][]) => { const out = [c]; for (let i = 0; i < 3; i++) out.push(rot(out[i])); return out; };
  const norm = (c: [number, number][]) => { const mx = Math.min(...c.map((p) => p[0])), my = Math.min(...c.map((p) => p[1])); return c.map(([x, y]) => [x - mx, y - my] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]); };
  const uniq = (os: [number, number][][]) => [...new Map(os.map((o) => [JSON.stringify(norm(o)), norm(o)])).values()];
  const NORMAL = [1050, 1030, 1040, 1020];   // square, L (both hands), Z
  const forms = (shapeId: number, placed?: SlateItem): [number, number][][] => {
    const c = cellsOfShape(shapeId);
    if (c.length === 7) { const now = placed ? orientedCells(placed) : c; return uniq([now, mirror(now)]); }   // a Pedigree: flipped only
    if (c.length === 4) return uniq(NORMAL.flatMap((id) => rots(cellsOfShape(id))));
    return uniq(rots(c));
  };
  const open = [...board(new Set(((l.slateItems ?? []) as SlateItem[]).filter((it) => !it.itemId.startsWith('guide-')).flatMap((it) => cellsOf(it).map(([x, y]) => cellKey(x, y)))))].filter(([, lv]) => lv <= level).map(([k]) => k);
  const free = new Set(open);
  const pieces = [...items.map((it) => forms(it.shapeId!, it)), ...extra.map((id) => forms(id))];
  const order = pieces.map((_, i) => i).sort((a, b) => pieces[b][0].length - pieces[a][0].length);   // the largest first
  const placed: [number, number][][] = [];
  const go = (k: number): boolean => {
    if (k === order.length) return true;
    const i = order[k];
    for (const f of pieces[i]) for (const anchor of open) {   // the fixed list: `free` changes while it is walked
      if (!free.has(anchor)) continue;
      const [ax, ay] = anchor.split(',').map(Number), cells = f.map(([x, y]) => [ax + x - f[0][0], ay + y - f[0][1]] as [number, number]);
      if (!cells.every(([x, y]) => free.has(cellKey(x, y)))) continue;
      cells.forEach(([x, y]) => free.delete(cellKey(x, y))); placed[i] = cells;
      if (go(k + 1)) return true;
      cells.forEach(([x, y]) => free.add(cellKey(x, y)));
    }
    return false;
  };
  return go(0) ? placed : null;
}

/** One more slate carrying `talents` on the character (a copy of its first placed slate, nothing devoured or copied); undefined when it has none placed */
export function withSlate(s: State, talents: number[]): Change | undefined {
  const items = (s.loadout.slateItems ?? []) as SlateItem[], tmpl = items[0];
  if (!tmpl) return undefined;
  return { kind: 'patch', op: 'slate-board', items: [...items, { ...tmpl, itemId: `guide-slate-${talents.join('-')}`, talents,
    influence: { ...(tmpl.influence as object), EffectTalentIds: talents, TalentIdDevour: talents.map(() => false), TalentIdInfluence: talents.map(() => 0), TalentIdCopyInfluence: {},
      TalentIdCopy: {}, DevilProjectionTalentIds: {}, DevilProjectionInfluence: {}, DevilLineBoostInfluence: {}, DevilLineBoostTalentIds: {} } }] } as never;
}

/** one more slate of `shapeId` carrying `talents` (a copy of a placed slate of that shape, else the first; its place on the board is packBoard's to find) */
export function addSlate(s: State, shapeId: number, talents: number[]): Change {
  const items = (s.loadout.slateItems ?? []) as SlateItem[], tmpl = items.find((x) => x.shapeId === shapeId) ?? items[0];
  return { kind: 'patch', op: 'slate-board', items: [...items, { ...tmpl, shapeId, itemId: `guide-add-${items.length}-${talents.join('-')}`, talents,
    influence: { ...(tmpl.influence as object), EffectTalentIds: talents, TalentIdDevour: talents.map(() => false), TalentIdInfluence: talents.map(() => 0), TalentIdCopyInfluence: {},
      TalentIdCopy: {}, DevilProjectionTalentIds: {}, DevilProjectionInfluence: {}, DevilLineBoostInfluence: {}, DevilLineBoostTalentIds: {} } }] } as never;
}

/** your slate `index` replaced by one of the same shape and place carrying `talents` (nothing devoured or copied): the only way a slate fits a full board */
export function replaceSlate(s: State, index: number, talents: number[], as?: { baseId: number; shapeId?: number }): Change {
  const items = (s.loadout.slateItems ?? []) as SlateItem[];
  return { kind: 'patch', op: 'slate-board', items: items.map((x, j) => (j !== index ? x : { ...x, ...(as ? { baseId: as.baseId, shapeId: as.shapeId ?? x.shapeId } : {}), itemId: `guide-slate-${index}-${talents.join('-')}`, talents,
    influence: { ...(x.influence as object), EffectTalentIds: talents, TalentIdDevour: talents.map(() => false), TalentIdInfluence: talents.map(() => 0), TalentIdCopyInfluence: {},
      TalentIdCopy: {}, DevilProjectionTalentIds: {}, DevilProjectionInfluence: {}, DevilLineBoostInfluence: {}, DevilLineBoostTalentIds: {} } })) } as never;
}

/** Slate talents to look for (user, 2026-10-16: "we need more buckets"): every talent the game shows (any tree, cores too; one per distinct effect) priced as one
 *  more slate talent on the character, the gains above 0.5 % best first. A core the build already holds adds nothing (CT1). Which slate can roll which talent
 *  is not in the catalog rules read here: the list says what to look for, not where. */
/** `micro` false: Micro nodes (config_talent i4 1, at most a few %) are not priced; `cores` 0: cores are not priced either */
export async function slateWants(ev: Evaluator, s: State, f: Figure, cores = 10, others = 25, micro = true): Promise<{ id: number; name: string; gain: number; core: boolean }[]> {
  if (!withSlate(s, [])) return [];
  const t = rows('config_talent'), byId = new Map(Object.values(t).map((r) => [r.i0 as number, r])), seen = new Set<string>(), ids: number[] = [];
  for (const n of allTrees().flatMap((tr) => [...treeNodes(tr), ...treeCores(tr)])) { const r = byId.get(n.id), k = r?.sc0 ?? String(n.id); if (seen.has(k) || (!micro && r?.i4 === 1) || (!cores && r?.i4 === CORE)) continue; seen.add(k); ids.push(n.id); }
  const out = await Promise.all(ids.map(async (id) => { const g = (await ev.run(s.loadout, [withSlate(s, [id])!], ctxOfState(s))).figure; return { id, name: talentName(id), gain: g.stop ? 0 : g.kill / f.kill, core: byId.get(id)?.i4 === CORE }; }));
  const ok = out.filter((o) => o.gain > 1.005).sort((a, b) => b.gain - a.gain);   // cores and the other talents each get a list (cores would fill one list)
  return [...ok.filter((o) => o.core).slice(0, cores), ...ok.filter((o) => !o.core).slice(0, others)];
}

export const slateMoves: Generator = (s, ctx) => {
  const ns = ctx.notSearched;
  ns.add('slate: buying or placing a slate: the talents of an owned slate are not in the item export, so what its placement grants is not known');
  ns.add('slate: Pedigree and tree-granting slates are not recognised (no catalog rule); only slates that carry a core talent are marked as enablers');
  const items = s.loadout.slateItems as SlateItem[] | undefined;
  if (!items?.length) { ns.add('slate: the loadout has no slateItems (the flat slates list cannot be changed by slate)'); return []; }
  const c = catalog(), talent = rows('config_talent');
  const sig = (its: SlateItem[]) => JSON.stringify(reboard(c, its).map(x => [x.itemId, x.influence]));
  let now: string;
  try { now = sig(items); } catch (e) { ns.add(`slate: the placed board does not resolve (${(e as Error).message.slice(0, 160)})`); return []; }
  const held = new Set(items.flatMap(i => cellsOf(i).map(([x, y]) => cellKey(x, y))));
  const open = board(held), moves: Move[] = [];
  const mk = (it: SlateItem, label: string, change: Change, minLevel: number): Move => ({
    kind: 'slate', label, acquisition: false, costFE: 0, minLevel, changes: [change],
    enabler: it.talents.some(t => talent[t]?.i4 === CORE) || undefined,
  });
  const refused = new Set<string>();
  for (const it of items) {
    const name = `slate ${it.itemId.split('_')[0]} (talents ${it.talents.join(', ')})`;
    const without = items.filter(x => x !== it);
    try { reboard(c, without); moves.push(mk(it, `Remove ${name}`, { kind: 'slate', action: 'remove', itemId: it.itemId }, 0)); }
    catch (e) { refused.add((e as Error).message.slice(0, 160)); }
    const occupied = new Set(without.flatMap(i => cellsOf(i).map(([x, y]) => cellKey(x, y))));
    for (const slot of [...open.keys()].map(k => k.split(',').map(Number)).map(([x, y]) => x * 10 + y)) {
      for (let dir = 0; dir < 4; dir++) {
        if (slot === (it.link as { SlotId: number }).SlotId && dir % 4 === it.direction! % 4) continue;
        const cells = cellsOf(it, slot, dir).map(([x, y]) => cellKey(x, y));
        if (cells.some(k => !open.has(k) || occupied.has(k))) continue;
        const gate = Math.max(...cells.map(k => open.get(k)!));
        if (gate > ctx.level) continue;
        const moved = items.map(x => x === it ? { ...x, link: { ...(x.link as object), SlotId: slot }, direction: dir } : x);
        try { if (sig(moved) === now) continue; }   // the same arrays hand the same grants: the figure cannot change
        catch (e) { refused.add((e as Error).message.slice(0, 160)); continue; }
        moves.push(mk(it, `Move ${name} to slot ${slot} direction ${dir}`, { kind: 'slate', action: 'move', itemId: it.itemId, slot, direction: dir }, gate));
      }
    }
  }
  for (const r of refused) ns.add(`slate: ${r}`);
  return moves;
};
