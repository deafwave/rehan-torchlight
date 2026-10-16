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

const cellsOf = (it: SlateItem, slot = (it.link as { SlotId: number }).SlotId, dir = it.direction!): [number, number][] =>
  (rows('lua_config_talent_block_shape')[it.shapeId!].Shape as string).split(';').map(s => {
    let [x, y] = s.split(',').map(Number);
    for (let i = 0; i < dir % 4; i++) [x, y] = [-y, x];
    return [Math.floor(slot / 10) + x, (slot % 10) + y];
  });

/** Slate talents to look for (user, 2026-10-16: "we need more buckets"): every talent the game shows (any tree, cores too; one per distinct effect) priced as one
 *  more slate talent on the character, the gains above 0.5 % best first. A core the build already holds adds nothing (CT1). Which slate can roll which talent
 *  is not in the catalog rules read here: the list says what to look for, not where. */
export async function slateWants(ev: Evaluator, s: State, f: Figure, top = 30): Promise<{ id: number; name: string; gain: number; core: boolean }[]> {
  const items = (s.loadout.slateItems ?? []) as SlateItem[], tmpl = items[0];
  if (!tmpl) return [];
  const t = rows('config_talent'), byId = new Map(Object.values(t).map((r) => [r.i0 as number, r])), seen = new Set<string>(), ids: number[] = [];
  for (const n of allTrees().flatMap((tr) => [...treeNodes(tr), ...treeCores(tr)])) { const k = byId.get(n.id)?.sc0 ?? String(n.id); if (!seen.has(k)) { seen.add(k); ids.push(n.id); } }
  const one = (id: number): Change => ({ kind: 'patch', op: 'slate-board', items: [...items, { ...tmpl, itemId: `guide-slate-${id}`, talents: [id],
    influence: { ...(tmpl.influence as object), EffectTalentIds: [id], TalentIdDevour: [false], TalentIdInfluence: [0], TalentIdCopyInfluence: {}, TalentIdCopy: {}, DevilProjectionTalentIds: {},
      DevilProjectionInfluence: {}, DevilLineBoostInfluence: {}, DevilLineBoostTalentIds: {} } }] } as never);
  const out = await Promise.all(ids.map(async (id) => { const g = (await ev.run(s.loadout, [one(id)], ctxOfState(s))).figure; return { id, name: talentName(id), gain: g.stop ? 0 : g.kill / f.kill, core: byId.get(id)?.i4 === CORE }; }));
  return out.filter((o) => o.gain > 1.005).sort((a, b) => b.gain - a.gain).slice(0, top);
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
