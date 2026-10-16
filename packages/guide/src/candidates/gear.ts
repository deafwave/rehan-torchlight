/* Gear candidates: ember crafts, rare-base upgrades and uniques, each a dps-debug `gear` what-if change with an FE cost and a level gate.
   Catalog tables are read from the pinned dps-debug checkout (read-only; env DPS_DEBUG_PIN overrides its root). */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { table as catalogTable } from '../pin';
import { craftOptions, EMBER_FOR_GRADE, embersPerCraft, topRoll, type LibraryAffix } from '../craft';
import affixIds from '../data/affix-ids.json';
import { costOf, priceOfGold } from '../priceOf';
import type { Change, GenCtx, Generator, Move, Skill, State } from '../types';

type Mods = Record<string, { id: number; dynArgs: number[] }[]>;
interface Dump { baseId: number; baseName?: string; itemId: string; level: number; modifiers: Mods }
interface GearItem { slot?: string; label: string; baseId?: number; level?: number; itemId?: string; affixes: { id: number; dyn: number[]; list?: string }[] }
export interface Base { baseId: number; name: string; level: number }
interface Row { name: string; slotType: number; family: number; level: number; attrs: number[]; lib: string | null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (f: string): Record<string, any> => catalogTable<{ rows: Record<string, any> }>(f).rows;
const library: LibraryAffix[] = JSON.parse(readFileSync(fileURLToPath(new URL('../../../../data/affix_library.json', import.meta.url)), 'utf8')).affixes;
// tiers whose id is not a catalog modifier or whose text ranges differ from the modifier's rolls are not crafted (see docs/gear-rules.md)
const UNVERIFIED = new Set([...affixIds.mismatches, ...affixIds.rollMismatches]);

/** Bing1 weapon rule (config_weapon row = config_item_base i24): iceShot = bow family, hoa = two-handed hammers/mauls. */
const WEAPON_GROUPS: Record<number, string> = { 9: 'Bow', 29: 'Crossbow', 26: 'Pistol', 27: 'Musket', 28: 'Fire Cannon', 11: 'Two-Handed Hammer' };
const SKILL_GROUPS: Record<Skill, number[]> = { iceShot: [9, 29, 26, 27, 28], hoa: [11] };
/** loadout slot -> config_item_base i20 (slot type); the catalog's helmets are 15 (11 is the shield) */
const SLOT_TYPE: Record<string, number> = { helmet: 15, gloves: 12, boots: 13, chest: 14, necklace: 16, belt: 17, ring1: 18, ring2: 18 };
const TYPE_SLOTS: Record<number, string[]> = { 15: ['helmet'], 12: ['gloves'], 13: ['boots'], 14: ['chest'], 16: ['necklace'], 17: ['belt'], 18: ['ring1', 'ring2'] };
const ARMOR_LIB: Record<string, string> = { '16/20': 'Necklace', '17/23': 'Belt', '18/21': 'Ring', '18/90': 'Spirit Ring' };
for (const [t, first, name] of [[15, 70, 'Helmet'], [12, 40, 'Gloves'], [13, 50, 'Boots'], [14, 60, 'Chest Armor']] as const)
  ['STR', 'DEX', 'INT'].forEach((f, i) => { ARMOR_LIB[`${t}/${first + i}`] = `${f} ${name}`; });
/** weapon columns also match pacts, prisms and cores (same i20/i24); only equipment carries base-attribute modifiers (a1b8) */
const isWeapon = (i20: number, i24: number, attrs: number[]) => attrs.length > 0 && i20 >= 1 && i20 <= 10 && i24 in WEAPON_GROUPS;
const libType = (i20: number, i24: number, attrs: number[]) => isWeapon(i20, i24, attrs) ? WEAPON_GROUPS[i24] : ARMOR_LIB[`${i20}/${i24}`] ?? null;

const ENABLER = /Reservation|Support Skill.*Level|\+\d+ to .*Skill Level|Core Talent|talent/i;
const LIST_KEY: Record<string, string> = { BAffixInfoList: 'baseAffix', BaseAttrInfoList: 'baseAttr', PrefixInfoList: 'prefix', SuffixInfoList: 'suffix', FixedBaseAffix: 'fixed', ChipAffixList: 'chip' };
const SIDE_MAX = 3;

interface Cat { base: Record<string, any>; lang: Record<string, string>; gold: Record<string, any>; rolls: Record<string, number[][]>; rows: Map<number, Row> }
let memo: Cat | undefined;
function cat(): Cat {
  if (memo) return memo;
  const base = table('config_item_base'), lang = table('lang_en'), gold = table('config_item_gold'), rolls = table('config_modifier_rolls');
  const rows = new Map<number, Row>();
  for (const [k, r] of Object.entries(base)) {
    const name = lang[`item_base|name|${k}`];
    if (name) rows.set(Number(k), { name, slotType: r.i20, family: r.i24, level: r.i3c, attrs: r.a1b8 ?? [], lib: libType(r.i20, r.i24, r.a1b8 ?? []) });
  }
  return memo = { base, lang, gold, rolls, rows };
}

/** rare bases legal for `slot` at hero `level`; weapons are filtered by the Bing1 weapon rule for `skill`; `family` (config_item_base i24) narrows to one line. */
export function basesFor(slot: string, level: number, skill: Skill, family?: number): Base[] {
  const out: Base[] = [];
  for (const [baseId, r] of cat().rows) {
    if (!r.lib || r.level > level || (family !== undefined && r.family !== family)) continue;
    const ok = slot === 'mainHand' ? isWeapon(r.slotType, r.family, r.attrs) && SKILL_GROUPS[skill].includes(r.family)
      : r.slotType === SLOT_TYPE[slot] && (family !== undefined || !/Spirit/.test(r.lib));
    if (ok) out.push({ baseId, name: r.name, level: r.level });
  }
  return out.sort((a, b) => a.level - b.level || a.baseId - b.baseId);
}

/** the catalog line (config_item_base i24: STR/DEX/INT armor, weapon group) of a base */
export const familyOf = (baseId: number): number | undefined => cat().rows.get(baseId)?.family;

/** a white base as a loadout gear item: its own attribute modifiers at mid rolls, no affixes (`market: 'drop'`: a bare base is found, not bought) */
export function bareItem(slot: string, baseId: number) {
  const r = cat().rows.get(baseId);
  if (!r) throw new Error(`no catalog base ${baseId}`);
  return { label: r.name, slot, baseId, itemId: `guide-start-${baseId}`, level: r.level, market: 'drop' as const,
    affixes: attrMods(r).map(m => ({ id: m.id, dyn: m.dynArgs, list: 'BaseAttrInfoList', text: '' })) };
}
/** the loadout slots an item of this catalog base can be worn in for `skill` (a weapon only if it is of the skill's Bing1 family), and the base level gate */
export function slotsOfBase(baseId: number, skill: Skill): { slots: string[]; level: number } {
  const r = cat().rows.get(baseId);
  if (!r?.lib) return { slots: [], level: 0 };
  return { level: r.level, slots: isWeapon(r.slotType, r.family, r.attrs) ? (SKILL_GROUPS[skill].includes(r.family) ? ['mainHand'] : []) : TYPE_SLOTS[r.slotType] ?? [] };
}

/** a modifier's rolls at the midpoint of each range (expected value of a random roll) */
const mids = (id: number): number[] | null => cat().rolls[id]?.map(r => (r[0] + r[1]) / 2) ?? null;
const attrMods = (r: Row) => r.attrs.map(id => ({ id, dynArgs: mids(id) })).filter((m): m is { id: number; dynArgs: number[] } => !!m.dynArgs);

function currentBase(it: GearItem): number | null {
  if (typeof it.baseId === 'number' && cat().rows.has(it.baseId)) return it.baseId;
  const have = new Set(it.affixes.map(a => a.id));
  const ids = [...cat().rows].filter(([, r]) => r.name === it.label && r.attrs.every(m => have.has(m)));
  const best = Math.max(...ids.map(([, r]) => r.attrs.length));
  const top = ids.filter(([, r]) => r.attrs.length === best);
  return top.length === 1 ? top[0][0] : null;
}

function toDump(it: GearItem, baseId: number, name: string, level: number): Dump | null {
  const modifiers: Mods = {};
  for (const a of it.affixes) {
    const k = a.list && LIST_KEY[a.list];
    if (!k) return null;
    (modifiers[k] ??= []).push({ id: a.id, dynArgs: [...a.dyn] });
  }
  return { baseId, baseName: name, itemId: `guide-${baseId}`, level: it.level ?? level, modifiers };
}

const withMods = (d: Dump, patch: Mods, id: string): Dump => ({ ...d, itemId: id, modifiers: { ...d.modifiers, ...patch } });
/** a base upgrade is a new item: the new base's own attributes, and the old prefix/suffix crafted again on it at the expected embers of
 *  their tiers (`recraft`, null when an ember is unpriced); an affix the new base's pool cannot take is left off, and the old item's other
 *  lists (implicit, fixed, chip) stay with the old item */
function rebased(d: Dump, nb: Row, id: string, ctx: GenCtx): { item: Dump; recraft: number | null; dropped: number } {
  const opts = new Map(craftOptions(library, nb.lib!, ctx.level).map(o => [Number(o.tierAffixId), o]));
  let recraft: number | null = 0, dropped = 0;
  const modifiers: Mods = { baseAttr: attrMods(nb) };
  for (const side of ['prefix', 'suffix']) {
    const kept = (d.modifiers[side] ?? []).filter(m => {
      const o = opts.get(m.id), p = o && ctx.prices.price(o.ember, ctx.level);
      if (!o || UNVERIFIED.has(o.tierAffixId)) { dropped++; return false; }
      recraft = recraft === null || p == null ? null : recraft + o.expectedEmbers * p;
      return true;
    });
    if (kept.length) modifiers[side] = kept;
  }
  return { item: { ...d, itemId: id, modifiers }, recraft, dropped };
}
const swap = (slot: string, item: Dump): Change[] => [{ kind: 'gear', slot, item }];

/** a unique's modifiers: one per fixed group at the midpoint of its best tier (tier digit 0, docs/gear-rules.md); a slot listing several groups is a random
 *  pool (Enamor: four slots drawn from one pool of 20) - no roll is assumed, the slot is named in `pooled`; a group the catalog lacks is in `lost` */
function goldMods(g: Record<string, Record<string, unknown> | undefined>): { mods: { id: number; dynArgs: number[] }[]; pooled: string[]; lost: string[] } {
  const mods: { id: number; dynArgs: number[] }[] = [], pooled: string[] = [], lost: string[] = [];
  for (const key of ['m88', 'ma8', 'mc8', 'me8', 'm108', 'm128', 'm148', 'm168']) {
    const groups = Object.keys(g[key] ?? {});
    if (groups.length > 1) { pooled.push(`${key}: 1 of ${groups.length}`); continue; }
    for (const grp of groups) { const id = Number(grp) * 10, dyn = mids(id); if (dyn) mods.push({ id, dynArgs: dyn }); else lost.push(grp); }
  }
  return { mods, pooled, lost };
}
/** a unique (config_item_gold id) as the guide's item, as gearMoves offers it; null when its base or a modifier group is not in the catalog */
export function goldItem(gid: number, level: number): { name: string; minLevel: number; item: Dump } | null {
  const c = cat(), g = c.gold[gid], name = g && c.lang[`item_gold|name|${gid}`], nb = g && c.rows.get(g.i8);
  if (!g || !name || !nb) return null;
  const { mods, lost } = goldMods(g);
  if (lost.length || !mods.length) return null;
  return { name, minLevel: nb.level, item: { baseId: g.i8, baseName: nb.name, itemId: `guide-unique-${gid}`, level, modifiers: { baseAttr: attrMods(nb), prefix: mods } } };
}

/** What a rare costs to make (a target build's rare: no market price): its base (etor, else a white drop at 0) plus each crafted affix at the expected embers of
 *  its tier, as a craft step is priced. Null when an ember is unpriced; an affix outside the base's craft pool is counted in `uncraftable`, not costed. */
/** one craft of a tier on a base: its library text, tier and side, and the expected embers at the ember's price (null when unpriced); null when the base's
 *  craft pool does not hold the tier */
export function craftStep(baseId: number, tierAffixId: number, ctx: GenCtx): { tier: string; text: string; side: string; ember: string; qty: number; costFE: number | null } | null {
  const r = cat().rows.get(baseId), o = r?.lib ? craftOptions(library, r.lib, 100).find(x => Number(x.tierAffixId) === tierAffixId) : undefined;
  if (!o) return null;
  const p = ctx.prices.price(o.ember, ctx.level);
  return { tier: o.tier, text: o.text.replace(/\n/g, ' / '), side: o.side.toLowerCase(), ember: o.ember, qty: o.expectedEmbers, costFE: p === null ? null : o.expectedEmbers * p };
}

/** the best craftable tier of a modifier group on a base (a known build's tier 0 the library cannot make: its best tier stands in), at the midpoint of its rolls */
export function craftGroupStep(baseId: number, group: number, ctx: GenCtx): (NonNullable<ReturnType<typeof craftStep>> & { id: number; dynArgs: number[] }) | null {
  const r = cat().rows.get(baseId);
  const best = r?.lib ? craftOptions(library, r.lib, ctx.level).filter(o => Math.floor(Number(o.tierAffixId) / 100) === group && !UNVERIFIED.has(o.tierAffixId))
    .sort((a, b) => Number(a.tierAffixId) - Number(b.tierAffixId))[0] : undefined;
  const dynArgs = best && mids(Number(best.tierAffixId)), c = best && craftStep(baseId, Number(best.tierAffixId), ctx);
  return c && dynArgs ? { ...c, id: Number(best!.tierAffixId), dynArgs } : null;
}

/** every verified tier of a modifier group the base's craft pool makes at `itemLevel`, best first, at the midpoint of its rolls: a mod can be crafted
 *  cheap first and re-crafted at a better tier later */
export function craftTiers(baseId: number, group: number, itemLevel: number, ctx: GenCtx): (NonNullable<ReturnType<typeof craftStep>> & { id: number; dynArgs: number[] })[] {
  const r = cat().rows.get(baseId);
  if (!r?.lib) return [];
  return craftOptions(library, r.lib, itemLevel).filter(o => Math.floor(Number(o.tierAffixId) / 100) === group && !UNVERIFIED.has(o.tierAffixId))
    .sort((a, b) => Number(a.tierAffixId) - Number(b.tierAffixId)).flatMap(o => {
      const dynArgs = mids(Number(o.tierAffixId)), c = craftStep(baseId, Number(o.tierAffixId), ctx);
      return c && dynArgs ? [{ ...c, id: Number(o.tierAffixId), dynArgs }] : [];
    });
}

export function craftCostOf(baseId: number, affixIds: number[], ctx: GenCtx): { costFE: number | null; crafted: number; uncraftable: number } {
  const r = cat().rows.get(baseId);
  if (!r?.lib) return { costFE: null, crafted: 0, uncraftable: affixIds.length };
  const opts = new Map(craftOptions(library, r.lib, 100).map(o => [Number(o.tierAffixId), o]));
  let costFE: number | null = costOf(ctx.prices, r.name, ctx.level, 'bare').costFE, crafted = 0, uncraftable = 0;
  for (const id of affixIds) {
    const o = opts.get(id);
    if (!o) { uncraftable++; continue; }
    const p = ctx.prices.price(o.ember, ctx.level);
    costFE = costFE === null || p === null ? null : costFE + o.expectedEmbers * p;
    crafted++;
  }
  return { costFE, crafted, uncraftable };
}
let goldGroups: Set<number> | undefined;
/** a unique (one the guide bought, or a game item carrying a config_item_gold modifier group) takes no ember craft and keeps its base */
const isUnique = (it: GearItem) => (it.itemId ?? '').startsWith('guide-unique-') || it.affixes.some(a => (goldGroups ??= new Set(Object.values(cat().gold)
  .flatMap(g => ['m88', 'ma8', 'mc8', 'me8', 'm108', 'm128', 'm148', 'm168'].flatMap(k => Object.keys(g[k] ?? {}).map(Number))))).has(Math.floor(a.id / 10)));

/** A worn item that lowers the figure (after the Ice Shot -> Hammer of Ash switch, Demon Slayer's Skin's Edict of Trinity zeroes every Hammer of Ash
 *  hit) is swapped for the slot's best white base: a free drop and a reconfiguration, so the slot keeps its crafts, base upgrades and uniques. */
export const whiteBaseMoves: Generator = (s: State, ctx: GenCtx): Move[] => (s.loadout.gear as GearItem[]).flatMap((it): Move[] => {
  const best = it.slot && SLOT_TYPE[it.slot] ? basesFor(it.slot, ctx.level, s.skill).at(-1) : undefined;
  if (!best || (it.baseId === best.baseId && !it.affixes.some(a => a.list !== 'BaseAttrInfoList'))) return [];
  const item: Dump = { baseId: best.baseId, baseName: best.name, itemId: `guide-white-${best.baseId}`, level: best.level, modifiers: { baseAttr: attrMods(cat().rows.get(best.baseId)!) } };
  return [{ kind: 'gear', label: `Swap ${it.label} for a white ${best.name} (${it.slot})`, acquisition: false, costFE: 0, market: 'drop', costNote: 'drop', minLevel: best.level, changes: swap(it.slot!, item) }];
});

export const gearMoves: Generator = (s: State, ctx: GenCtx): Move[] => {
  const c = cat(), moves: Move[] = [];
  ctx.notSearched.add('corrosion: a Corroded item is not offered (etor lists no corroded variant, and which affix a corrosion upgrades or adds is decided by the server, so its odds are unknown); one you own is priced as read');
  const slots = new Set<string>();
  for (const it of s.loadout.gear as GearItem[]) {
    const slot = it.slot;
    if (!slot || !(slot === 'mainHand' || SLOT_TYPE[slot])) continue;
    slots.add(slot);
    const baseId = currentBase(it), base = baseId === null ? undefined : c.rows.get(baseId);
    if (baseId === null || !base?.lib) { ctx.notSearched.add(`gear ${slot}: "${it.label}" has no catalog base id; crafts and base upgrades not searched`); continue; }
    if (slot === 'mainHand' && !SKILL_GROUPS[s.skill].includes(base.family)) {
      ctx.notSearched.add(`gear mainHand: "${it.label}" is not a ${s.skill} weapon (Bing1 weapon rule); weapon moves not searched`); slots.delete(slot); continue;
    }
    if (isUnique(it)) continue;
    const dump = toDump(it, baseId, base.name, ctx.level);
    if (!dump) { ctx.notSearched.add(`gear ${slot}: the loadout item carries no affix list; crafts not searched`); continue; }

    // ember crafts: add one affix to a side with room, never a second affix of a family the item has
    const have = new Set(Object.values(dump.modifiers).flat().map(m => Math.floor(m.id / 100)));
    const full = new Set<string>();
    const skipped = new Set<string>();
    for (const o of craftOptions(library, base.lib, ctx.level)) {
      if (UNVERIFIED.has(o.tierAffixId)) skipped.add(o.tierAffixId);
      if (UNVERIFIED.has(o.tierAffixId) || have.has(Math.floor(Number(o.tierAffixId) / 100))) continue;
      const side = o.side.toLowerCase();
      if ((dump.modifiers[side]?.length ?? 0) >= SIDE_MAX) { full.add(side); continue; }
      const dynArgs = mids(Number(o.tierAffixId));
      if (!dynArgs) continue;
      const price = ctx.prices.price(o.ember, ctx.level);
      moves.push({
        kind: 'craft', label: `Craft ${o.tier} ${o.text.replace(/\n/g, ' / ')} (${side}) on ${slot}`, acquisition: true,
        costFE: price === null ? null : o.expectedEmbers * price, buy: { name: o.ember, qty: o.expectedEmbers }, minLevel: o.requiredLevel,
        changes: swap(slot, withMods(dump, { [side]: [...(dump.modifiers[side] ?? []), { id: Number(o.tierAffixId), dynArgs }] }, `guide-craft-${slot}-${o.tierAffixId}`)),
        enabler: ENABLER.test(o.text) || undefined,
      });
    }
    // a mod re-crafted at a better tier the item's level allows (its old roll replaced): a rare improves a craft at a time, cheap tiers first
    for (const side of ['prefix', 'suffix'] as const) for (const m of dump.modifiers[side] ?? [])
      for (const t of craftTiers(baseId, Math.floor(m.id / 100), dump.level, ctx).filter(t => t.id < m.id))
        moves.push({
          kind: 'craft', label: `Re-craft ${t.tier} ${t.text} (${side}) on ${slot}, replacing its lower tier`, acquisition: true, costFE: t.costFE,
          buy: { name: t.ember, qty: t.qty }, minLevel: 0,
          changes: swap(slot, withMods(dump, { [side]: (dump.modifiers[side] ?? []).map(x => (x === m ? { id: t.id, dynArgs: t.dynArgs } : x)) }, `guide-recraft-${slot}-${t.id}`)),
        });
    if (skipped.size) ctx.notSearched.add(`craft on ${slot}: ${skipped.size} tiers whose library text ranges differ from the catalog rolls`);
    for (const side of full) ctx.notSearched.add(`craft on ${slot}: ${side} side full (${SIDE_MAX}); replacing an affix is not ported`);

    // base upgrade: the best rare base of the same line at the hero level (a white base is a drop unless etor prices it)
    const best = basesFor(slot, ctx.level, s.skill, base.family).at(-1);
    if (best && best.level > base.level) {
      const nb = c.rows.get(best.baseId)!, cost = costOf(ctx.prices, best.name, ctx.level, 'bare'), r = rebased(dump, nb, `guide-base-${best.baseId}`, ctx);
      const crafted = (r.item.modifiers.prefix?.length ?? 0) + (r.item.modifiers.suffix?.length ?? 0);
      // the new base is judged by your mods at the best tier its level opens that you can afford (per mod: your FE over its mods), taken with your tiers
      // carried over; each re-craft to a better tier is a later step
      const perMod = Math.min(50, Math.max(1, s.fe / Math.max(1, crafted)));
      let up: number | null = 0;
      const better: Mods = { ...r.item.modifiers };
      for (const side of ['prefix', 'suffix'] as const) better[side] = (r.item.modifiers[side] ?? []).map(m => {
        const t = craftTiers(best.baseId, Math.floor(m.id / 100), r.item.level, ctx).find(x => x.id < m.id && x.costFE !== null && x.costFE <= perMod);
        if (!t) return m;
        up = up === null ? null : up + t.costFE!;
        return { id: t.id, dynArgs: t.dynArgs };
      });
      const lifted = JSON.stringify(better) !== JSON.stringify(r.item.modifiers);
      moves.push({
        kind: 'gear', label: `Rare base ${best.name} (item level ${best.level}) on ${slot}${crafted ? `, ${crafted} affix(es) crafted again` : ''}${r.dropped ? `, ${r.dropped} the base cannot take left off` : ''}`,
        acquisition: true, ...cost, costFE: cost.costFE === null || r.recraft === null ? null : cost.costFE + r.recraft, minLevel: best.level,
        ...(crafted ? { costNote: `${cost.costNote ?? 'base'} + re-craft ${r.recraft === null ? '(an ember unpriced)' : `${r.recraft.toFixed(2)} FE`}` } : { buy: { name: best.name, qty: 1 } }),
        changes: [{ kind: 'gear', slot, item: { ...r.item, baseId: best.baseId, baseName: best.name } }],
        ...(lifted && cost.costFE !== null && r.recraft !== null && up !== null ? { then: {
          changes: [{ kind: 'gear', slot, item: { ...r.item, itemId: `guide-base-${best.baseId}-up`, baseId: best.baseId, baseName: best.name, modifiers: better } }] as Change[],
          costFE: cost.costFE + r.recraft + up, note: `chosen for this base with your mods re-crafted at better tiers (up to ${perMod.toFixed(1)} FE each), one craft per step` } } : {}),
      });
    }
  }

  // uniques: config_item_gold joined to etor by English name; one modifier per group at the highest catalog tier digit [inf]
  for (const [gid, g] of Object.entries(c.gold)) {
    const name = c.lang[`item_gold|name|${gid}`], nb = c.rows.get(g.i8), raw = c.base[g.i8];
    if (!name || !raw) continue;
    if (!nb) { ctx.notSearched.add(`unique ${name}: base ${g.i8} has no lang name; not offered`); continue; }   // rows holds only bases with a lang name
    if (nb.level > ctx.level) continue;
    const baseName = nb.name;
    const targets = isWeapon(raw.i20, raw.i24, raw.a1b8 ?? []) ? (SKILL_GROUPS[s.skill].includes(raw.i24) ? ['mainHand'] : []) : TYPE_SLOTS[raw.i20] ?? [];
    const here = targets.filter(t => slots.has(t));
    if (!here.length) continue;
    const { mods, pooled, lost } = goldMods(g);
    if (pooled.length) ctx.notSearched.add(`unique ${name}: random affix slots (${pooled.join(', ')}) not priced; offered with its fixed affixes only`);
    if (lost.length) { ctx.notSearched.add(`unique ${name}: modifier group(s) ${lost.join(', ')} not in the catalog; not offered`); continue; }
    if (!mods.length) continue;
    const { fe: price, etorName } = priceOfGold(ctx.prices, Number(gid), ctx.level);
    for (const slot of here) {
      const item: Dump = { baseId: g.i8, baseName, itemId: `guide-unique-${gid}`, level: ctx.level, modifiers: { baseAttr: attrMods(nb), prefix: mods } };
      moves.push({ kind: 'unique', label: `Unique ${name} in ${slot}`, acquisition: true, costFE: price, buy: { name: etorName ?? name, qty: 1 }, minLevel: nb.level, changes: swap(slot, item) });
    }
  }
  if (moves.length) ctx.notSearched.add('rolled base implicit (BAffixInfoList) not modelled: its pool is not decoded; crafted bases are priced without it');
  return moves;
};

/** One craft rolls a random affix of the ember's grade for the gear type (affix weight) at a random tier the item level allows (tier weight); the owner keeps
 *  it or not (the owner, 2026-10-16: "Random, but you can keep or replace"). Every outcome on a rare you wear, with its chance per craft: kept, it goes on its
 *  side (added while the side has room, else in place of that side's lowest-tier mod). An affix family the item already has is not an outcome. */
export interface RollOutcome { p: number; label: string; changes: Change[] }
export interface RollPlan { slot: string; ember: string; perCraft: number; outcomes: RollOutcome[] }
export function rollPlans(s: State, ctx: GenCtx): RollPlan[] {
  const out: RollPlan[] = [];
  for (const it of s.loadout.gear as GearItem[]) {
    const slot = it.slot;
    if (!slot || isUnique(it)) continue;
    const baseId = currentBase(it), base = baseId === null ? undefined : cat().rows.get(baseId);
    if (baseId === null || !base?.lib) continue;
    const dump = toDump(it, baseId, base.name, ctx.level);
    if (!dump) continue;
    const have = new Set(Object.values(dump.modifiers).flat().map(m => Math.floor(m.id / 100)));
    const pool = library.filter(a => a.slot === base.lib);
    for (const grade of ['Basic', 'Advanced', 'Ultimate'] as const) {
      const g = pool.filter(a => a.grade === grade), gw = g.reduce((t, a) => t + a.weight, 0), outcomes: RollOutcome[] = [];
      if (!gw) continue;
      for (const a of g) {
        const tiers = a.tiers.filter(t => t.requiredLevel <= dump.level), tw = tiers.reduce((t, x) => t + x.weight, 0);
        if (!tw) continue;
        const side = a.side.toLowerCase(), list = dump.modifiers[side] ?? [];
        const victim = list.length >= SIDE_MAX ? [...list].sort((x, y) => (y.id % 100) - (x.id % 100))[0] : undefined;   // the lowest tier: the highest tier digit
        for (const t of tiers) {
          const id = Number(t.tierAffixId), dyn = mids(id);
          if (UNVERIFIED.has(t.tierAffixId) || !dyn || (have.has(Math.floor(id / 100)) && Math.floor((victim?.id ?? -1) / 100) !== Math.floor(id / 100))) continue;
          const next = victim ? list.map(m => (m === victim ? { id, dynArgs: dyn } : m)) : [...list, { id, dynArgs: dyn }];
          outcomes.push({ p: (a.weight / gw) * (t.weight / tw), label: `${t.tier} ${topRoll(t.text).replace(/\n/g, ' / ')} (${side})${victim ? ' replacing your lowest-tier ' + side : ''}`,
            changes: swap(slot, withMods(dump, { [side]: next }, `guide-roll-${slot}-${id}`)) });
        }
      }
      if (outcomes.length) out.push({ slot, ember: EMBER_FOR_GRADE[grade], perCraft: embersPerCraft(base.lib), outcomes });
    }
  }
  return out;
}
