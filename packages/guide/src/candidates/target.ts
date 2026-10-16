/**
 * Target pro-build pieces as candidates (spec 3.2 "Reachability"): the ideal start strips pacts, kismets, slates and memories and nothing else
 * re-acquires them, so every piece of the 40T Hammer of Ash target (pin re/evidence/loadout_probuild-hanshansi-bing.json) not already held is offered
 * as one enabler acquisition that installs exactly that piece. Hammer of Ash only.
 * Not offered, each named in ctx.notSearched: slates (the target data carries the influence arrays but no shape or board slot, which `slate place` needs),
 * hero memories and vorax (no what-if form), prisms (the target holds none), Undetermined Fates (the target holds none).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyChanges, openCatalog } from '@dps/guide/figure';
import { pinRoot, table } from '../pin';
import { priceOfBase, priceOfGold } from '../priceOf';
import { craftGroupStep, craftStep, slotsOfBase } from './gear';
import { costOf } from '../priceOf';
import type { LoadoutPatch } from '../patches';
import type { Change, Generator, Move } from '../types';

type Aff = { id: number; dyn: number[] };
export interface TGear { label: string; affixes: Aff[] }
interface Target { gear: TGear[]; pacts: { servantId: number; rank: number; promotionLevels: number[][]; slot: number }[];
  kismets: { modifierId: number | null; servantId: number; node: number; rolls: number[] }[]; contractKeys: number[]; heroMemories: unknown[]; vorax: unknown[]; slates: number[] }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rows = (f: string): Record<string, any> => table<{ rows: Record<string, any> }>(f).rows;
let target: Target | undefined;
const loadTarget = (): Target => target ??= JSON.parse(readFileSync(join(pinRoot(), 're/evidence/loadout_probuild-hanshansi-bing.json'), 'utf8'));

/** The target's slates as the server's resolved influence tables, assembled exactly as dps-debug's target.test.ts / guide/figure.ts do: the V2 file filtered to
 *  the slates whose talents the target holds. */
let board: Extract<LoadoutPatch, { op: 'slate-board' }>['items'] | undefined;
const targetBoard = () => board ??= (() => {
  const mine = new Set(loadTarget().slates);
  const v2 = JSON.parse(readFileSync(join(pinRoot(), 're/evidence/t5_slate_v2_probuild.json'), 'utf8')) as (Record<string, unknown> & { id: number; EffectTalentIds: number[] })[];
  return v2.filter(v => v.EffectTalentIds.every(t => mine.has(t))).map(v => ({ itemId: `probuild_${v.id}`, baseId: 0, talents: v.EffectTalentIds, influence: v }));
})();

/** affix tier id -> 'prefix' | 'suffix' from the craft library; the target file carries no list names */
let sides: Map<number, string> | undefined;
function sideOf(id: number): string | undefined {
  if (!sides) {
    sides = new Map();
    const lib = JSON.parse(readFileSync(fileURLToPath(new URL('../../../../data/affix_library.json', import.meta.url)), 'utf8')).affixes as { side: string; tiers: { tierAffixId: string }[] }[];
    for (const a of lib) for (const t of a.tiers) sides.set(Number(t.tierAffixId), a.side.toLowerCase());
  }
  return sides.get(id);
}

/** the catalog base a target item is on: name match whose base attributes the item carries (dps-debug loadout.ts baseOfGear) */
function baseOf(it: TGear): number | null {
  const base = rows('config_item_base'), lang = rows('lang_en'), have = new Set(it.affixes.map(a => a.id));
  const ok = Object.keys(base).filter(k => lang[`item_base|name|${k}`] === it.label && (base[k].a1b8 ?? []).every((m: number) => have.has(m)));
  const best = Math.max(...ok.map(k => base[k].a1b8.length));
  const top = ok.filter(k => base[k].a1b8.length === best);
  return top.length === 1 ? Number(top[0]) : null;
}

let cat: ReturnType<typeof openCatalog> | undefined;
const applied = new Map<string, string | null>();
/** the error dps-debug's applyChanges raises for these changes on this loadout, null when they apply (memoised: a gear apply compiles the item) */
function applyError(l: Record<string, unknown>, changes: Move["changes"], level: number): string | null {
  const key = JSON.stringify([l, changes, level]);
  if (!applied.has(key)) {
    try { applyChanges(cat ??= openCatalog(join(pinRoot(), 'catalog')), l as never, changes as never, 'hoa', { heroLevel: level }); applied.set(key, null); }
    catch (e) { applied.set(key, (e as Error).message); }
  }
  return applied.get(key)!;
}

const GOLD_KEYS = ['m88', 'ma8', 'mc8', 'me8', 'm108', 'm128', 'm148', 'm168'];
const sig = (a: Aff[]) => JSON.stringify(a.map(x => [x.id, x.dyn]).sort());

/** the gold item a target item is, else undefined: it carries ALL of a gold row's modifier groups on that base AND at least half of its own non-base-attribute
 *  groups belong to that row (a rare sharing 1-3 craftable groups with a short gold row is not a legendary). Its label is the base's name, not the legendary's. */
export function goldOf(it: TGear, baseId: number): string | undefined {
  const gold = rows('config_item_gold'), attrs = new Set<number>(rows('config_item_base')[baseId].a1b8 ?? []);
  const own = new Set(it.affixes.filter(a => !attrs.has(a.id)).map(a => Math.floor(a.id / 10)));
  return Object.keys(gold).find(g => {
    if (gold[g].i8 !== baseId) return false;
    const row = new Set(GOLD_KEYS.flatMap(k => Object.keys(gold[g][k] ?? {})).map(Number));
    const groups = new Set(it.affixes.map(a => Math.floor(a.id / 10)));
    return row.size > 0 && [...row].every(x => groups.has(x)) && [...own].filter(x => row.has(x)).length * 2 >= own.size;
  });
}

export const targetMoves: Generator = (s, ctx) => {
  if (s.skill !== 'hoa') return [];
  const ns = ctx.notSearched, t = loadTarget(), l = s.loadout as Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
  ns.add("single slates: board adjacency is resolved server-side");
  ns.add('target kismets appear once their pact is equipped in that slot');
  const mk = (m: Omit<Move, 'acquisition' | 'enabler' | 'minLevel'> & { minLevel?: number }): Move => ({ acquisition: true, enabler: true, minLevel: 0, ...m });
  const out: Move[] = [];
  /** keep a move only if dps-debug applies it to this loadout */
  const keep = (m: Move, piece: string) => {
    const err = applyError(l, m.changes, ctx.level);
    if (err) ns.add(`target ${piece}: ${err}`); else out.push(m);
  };

  // gear: the slot the state already wears an item of that type in
  const held = new Map<string, Aff[]>((l.gear ?? []).map((g: { slot: string; affixes: Aff[] }) => [g.slot, g.affixes]));
  const gold = rows('config_item_gold'), lang = rows('lang_en'), base = rows('config_item_base');
  for (const it of t.gear) {
    const baseId = baseOf(it);
    if (baseId === null) { ns.add(`target gear "${it.label}": no single catalog base matches its name and base attributes; not offered`); continue; }
    const { slots, level } = slotsOfBase(baseId, s.skill);
    const slot = slots.find(x => held.has(x)) ?? slots[0];
    if (!slot) { ns.add(`target gear "${it.label}": base ${baseId} fits no hoa slot; not offered`); continue; }
    if (held.has(slot) && sig(held.get(slot)!) === sig(it.affixes)) continue;
    const attrs = new Set<number>(base[baseId].a1b8 ?? []), modifiers: Record<string, { id: number; dynArgs: number[] }[]> = {};
    for (const a of it.affixes) (modifiers[attrs.has(a.id) ? 'baseAttr' : sideOf(a.id) ?? 'fixed'] ??= []).push({ id: a.id, dynArgs: [...a.dyn] });
    const gid = goldOf(it, baseId);
    // a rare is made one step at a time (user, 2026-10-16: "one at a time"): its bare base first, then each of its mods as one craft at its expected embers;
    // a mod the craft library does not hold (blended, corroded, rolled) is named, not offered
    if (!gid) {
      const cur = (l.gear ?? []).find((g: { slot?: string }) => g.slot === slot) as { baseId?: number; affixes: (Aff & { list?: string })[] } | undefined;
      if (cur?.baseId !== baseId) {
        keep(mk({ kind: 'gear', label: `Rare base ${it.label} (item level ${level}) on ${slot}`, ...costOf(ctx.prices, it.label, ctx.level, 'bare'), minLevel: level,
          changes: [{ kind: 'gear', slot, item: { baseId, baseName: it.label, itemId: `guide-target-base-${baseId}`, level, modifiers: { baseAttr: modifiers.baseAttr ?? [] } } }] }), it.label);
        continue;
      }
      const LIST: Record<string, string> = { BAffixInfoList: 'baseAffix', BaseAttrInfoList: 'baseAttr', PrefixInfoList: 'prefix', SuffixInfoList: 'suffix', FixedBaseAffix: 'fixed' };
      const mods: Record<string, { id: number; dynArgs: number[] }[]> = {};
      for (const a of cur.affixes) (mods[LIST[a.list ?? ''] ?? 'fixed'] ??= []).push({ id: a.id, dynArgs: [...a.dyn] });
      const have = new Set(cur.affixes.map(a => Math.floor(a.id / 100)));   // by modifier group: one tier of a group per item
      let outside = 0;
      for (const a of it.affixes.filter(x => !attrs.has(x.id) && !have.has(Math.floor(x.id / 100)))) {
        // its own tier when the library makes it, else the best tier the library makes of that group (a known build's tier 0 is not craftable)
        const own = craftStep(baseId, a.id, ctx), c = own ? { ...own, id: a.id, dynArgs: [...a.dyn] } : craftGroupStep(baseId, Math.floor(a.id / 100), ctx);
        if (!c) { outside++; continue; }
        if ((mods[c.side]?.length ?? 0) >= 3) continue;
        keep(mk({ kind: 'craft', label: `Craft ${c.tier} ${c.text} (${c.side}) on ${slot}`, costFE: c.costFE, buy: { name: c.ember, qty: c.qty }, minLevel: level,
          ...(own ? {} : { costNote: "the known build's tier of this mod is not craftable: its best craftable tier" }),
          changes: [{ kind: 'gear', slot, item: { baseId, baseName: it.label, itemId: `guide-target-${baseId}-${c.id}`, level, modifiers: { ...mods, [c.side]: [...(mods[c.side] ?? []), { id: c.id, dynArgs: c.dynArgs }] } } }] }), it.label);
      }
      if (outside) ns.add(`target ${it.label}: ${outside} of its mods are outside the craft library (blended, corroded or rolled): not offered`);
      continue;
    }
    const cost = { costFE: priceOfGold(ctx.prices, Number(gid), ctx.level).fe };
    keep(mk({ kind: 'gear', label: `Target: ${it.label} in ${slot}`, ...cost, minLevel: level,
      changes: [{ kind: 'gear', slot, item: { baseId, baseName: it.label, itemId: `guide-target-${baseId}`, level, modifiers } }] }), it.label);
  }

  // the slate board: one acquisition, the resolved arrays written into the loadout. Slates drop and etor has no row for these (the target data gives no item name
  // or tree): farmed, 0 FE, like a white base (user, 2026-10-15: price the known build's pieces)
  const items = targetBoard(), placed = ((l.slateItems ?? []) as { itemId: string }[]).map(x => x.itemId).sort().join();
  if (items.length && placed !== items.map(x => x.itemId).sort().join())
    out.push(mk({ kind: 'slate', label: `Target slate board (${items.length} slates)`, costFE: 0, market: 'drop',
      costNote: `farmed: slates drop (no etor row for them): ${items.map(x => x.itemId).join(', ')}`,
      changes: [{ kind: 'patch', op: 'slate-board', items }] }));

  // hero memories and vorax limbs: written into the loadout (patches.ts), farmed at 0 FE (their making is not priced)
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (t.heroMemories.length && !same(l.heroMemories, t.heroMemories))
    out.push(mk({ kind: 'memory', label: `Target hero memories (${t.heroMemories.length})`, costFE: 0, market: 'drop', costNote: 'farmed: hero memories drop (their making is not priced)',
      changes: [{ kind: 'patch', op: 'memories', items: t.heroMemories }] }));
  if (t.vorax.length && !same(l.vorax, t.vorax))
    out.push(mk({ kind: 'memory', label: `Target vorax limb${t.vorax.length > 1 ? 's' : ''} (${t.vorax.length})`, costFE: 0, market: 'drop', costNote: 'farmed: a vorax limb devours a legendary (its making is not priced)',
      changes: [{ kind: 'patch', op: 'vorax', items: t.vorax }] }));

  // pacts: not on the market - a pactspirit rank is levelled, not bought: farmed, 0 FE
  const pacts = (l.pacts ?? []) as { servantId: number; slot?: number; rank: number }[];
  for (const p of t.pacts) {
    if (pacts.some(x => x.servantId === p.servantId && x.slot === p.slot && x.rank === p.rank)) continue;
    if (pacts.some(x => x.servantId === p.servantId && x.slot !== p.slot)) continue;   // already held in another slot: no duplicate servant
    const occupant = pacts.find(x => x.slot === p.slot);
    const name = lang[`servant|name|${p.servantId}`] ?? String(p.servantId);
    keep(mk({ kind: 'pact', label: `Target: ${name} (rank ${p.rank}) in pact slot ${p.slot}`, costFE: 0, market: 'drop', costNote: 'farmed: a pactspirit rank is levelled, not bought (not on the market)',
      changes: [{ kind: 'multi', changes: [...(occupant ? [{ kind: 'pact', action: 'remove', servantId: occupant.servantId } as const] : []),
        { kind: 'pact', action: 'equip', servantId: p.servantId, slot: p.slot, rank: p.rank, promotionLevels: p.promotionLevels, contractKeys: t.contractKeys.filter(k => Math.floor(k / 100) === p.slot) }] }] }), name);
  }

  // kismets: socketed on the point of their pact's slot, once that pact is held
  const tat = Object.entries(rows('lua_config_item_tattoo'));
  const at = new Map<number, number | null>((l.kismets ?? []).map((k: { node: number; modifierId: number | null }) => [k.node, k.modifierId]));
  for (const k of t.kismets) {
    if (k.modifierId === null) { ns.add('target Undetermined Fate: no catalog base in the target data; not offered'); continue; }
    const slot = t.pacts.find(p => p.servantId === k.servantId)?.slot;
    if (slot === undefined || !pacts.some(p => p.servantId === k.servantId && p.slot === slot)) continue;   // offered once its pact is held
    const point = slot * 100 + k.node;
    if (at.get(point) === k.modifierId) continue;
    const baseId = tat.find(([, r]) => r.Modifier?.[0] === k.modifierId)?.[0];
    const name = baseId ? lang[`item_base|name|${baseId}`] : undefined;
    const change: Change = { kind: 'kismet', action: at.has(point) ? 'replace' : 'socket', point, modifierId: k.modifierId, rolls: k.rolls };
    keep(mk({ kind: 'kismet', label: `Target: ${name ?? k.modifierId} on contract point ${point}`, costFE: baseId ? priceOfBase(ctx.prices, Number(baseId), ctx.level).fe : null, changes: [change] }), String(name ?? k.modifierId));
  }
  return out;
};
