/** `guide plan`: your character to a damage goal on a boss at the least FE, one step at a time, from the live read (user, 2026-10-16: "200 billion in the
 *  cheapest manner possible"). Each round every candidate is priced on the build as it stands after the steps before it; the step taken is the one with the
 *  most damage per FE (a free one first). A candidate is refused when the model cannot price it whole (a new omission), when it unseals an aura (MANA2:
 *  the auras' Sealed Mana no longer fits), or when it breaks a rule of the game the generators do not know (listed in GuideOut.startNotes). */
import { gearMoves, whiteBaseMoves } from './candidates/gear';
import { gemLevelAt, gemMoves, gemsHeld } from './candidates/gems';
import { costOf } from './priceOf';
import { kismetMoves } from './candidates/kismets';
import { pactMoves } from './candidates/pacts';
import { prismMoves } from './candidates/prisms';
import { addSlate, boardView, overCap, packBoard, replaceable, replaceSlate, slateMoves, slateWants } from './candidates/slates';
import { applyPatch } from './patches';
import { talentMovesWith } from './candidates/talents';
import { targetMoves } from './candidates/target';
import { bossName, ownedGear, ownedUniques } from './modes';
import { ctxOfState, pieceKey, rankable } from './search';
import { talentName } from './names';
import { buildSheet } from './sheet';
import { pinRoot, table } from './pin';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Evaluator, Figure, GenCtx, GuideOut, Move, PriceBook, State } from './types';

export interface PlanOpts { target: string; goal: number; /** your FE: an option dearer than the FE left is not priced; the plan stops when none fits */ budget?: number; /** the goal as a time to kill the target (s): goal = its max Life / goalSeconds */ goalSeconds?: number; maxSteps: number;
  /** FE of a slate carrying one wanted line, by line (the owner's prices); others `slateFE` */ slatePrices: [RegExp, number][]; slateFE: number;
  /** FE of the talent prism like the example build's (the owner's price) */ prismFE: number;
  /** talent nodes whose points never move (set by runPlan) */ locked?: Set<number>;
  /** the character's talent points: the points it has spent at the start (set by runPlan) */ points?: number;
  /** the board slates a new slate is tried in place of: the weakest (set by runPlan; absent = every one) */ slateSlots?: number[];
  /** your prices for a legendary at a roll of one line (roll-prices.json: { item, line: its modifier id, rolls: [[value, FE]] }); the item's other lines as yours */
  rollPrices?: { item: string; line: number; rolls: [number, number][] }[];
  /** the skill places another skill is tried in: the weakest active and aura places (set by runPlan; absent = none) */ skillSlots?: { kind: string; slot: number }[] }
export const DEFAULT_PLAN: PlanOpts = { target: 'traveler', goal: 2e11, maxSteps: 60, slatePrices: [[/Agility Blessing on Critical Strike/, 100], [/All Skills' Levels/, 270]], slateFE: 100, prismFE: 4000 };   // the target's prism is a Phantasmagoria, ~4000 FE (owner, 2026-10-17)

/** the owner's rules the candidates must keep (2026-10-16) */
const RULES = [
  'Physical -> Cold / Lightning / Fire conversion lines are left out (owner: they do nothing for an Erosion build).',
  'A Magnificent or Noble support is never levelled (max level 5, levelled by consuming copies).',
  'A legendary you wear or own is never bought.',
  'A change that unseals an aura (Sealed Mana over your Mana, MANA2) is refused.',
  'Projectile speed is never raised (any aura, support, slate line or item that adds it is refused); Wind Projectiles is not offered and Slow Projectile is never taken out. The model overrates faster projectiles (your dummy, 2026-10-16: Passivation -> Wind Projectiles measured 22.5 B -> 16.9 B where the model said -8 %).',
  'Every step raises both the Traveler kill speed and your damage at full Life (the number the training dummy shows, the "Dummy" column): check each step there.',
  'Talent points are only moved (a respec is free at level 90 and below), never added: the plan does not assume a point you do not have.',
  'A slate line already on your board is not offered on another slate.',
  'Hero memories: each is levelled to its rarity cap (Rare 30, Epic 40), its random affixes rerolled one slot at a time until each lands (no keep: a reroll replaces the affix in the slot) at the game odds of Affliction Effect for every affix (1.46 % an Epic roll); a higher rarity is a new memory bought, priced from market listings only.',
  'Your Paralysis and Sealed Mana Compensation talent points stay, and so do points on a node the model prices at exactly 0 (it cannot judge them).',
];
/** where an item you own is: the read's 'stash' is item page 0: My Booth, what you list on the trade house (owner, 2026-10-17: your stash is empty; page 0 holds your 28 listed slates) */
const placeOf = (where?: string) => (where === 'stash' ? 'booth' : where ?? 'bag');
const KEPT = /Paralysis|Sealed Mana Compensation/;
const CONVERSION = /Converts? .*Physical Damage to (Cold|Lightning|Fire)|Physical .*->.*(Cold|Lightning|Fire)/i;

/** the legendaries you wear or own: never bought, also after a step takes one off (a new one is priced at the middle of its rolls; yours is the roll there is) */
const heldUniques = (s: State) => new Set([...ownedUniques(s, true).values(), ...ownedUniques(s).values()]);
type Enh = Record<string, { Rarity: number[]; CurrentEnhanceLevel: number; TargetEnhanceLevel: number; BaseAttrTier: number; RandomAffixMod: number; ItemConsume: Record<string, number> }>;
type Reroll = Record<string, { Rarity: number[]; ItemLevel: [number, number]; ItemConsume: Record<string, number>; AffixTier: { Key: number; Value: number }[] }>;
let enh: Enh | undefined, reroll: Reroll | undefined;
const ENH = (): Enh => (enh ??= JSON.parse(readFileSync(join(pinRoot(), 'catalog/0x6ac8071f/lua_config_hero_item_enhance.json'), 'utf8')).rows as Enh);
const REROLL = (): Reroll => (reroll ??= JSON.parse(readFileSync(join(pinRoot(), 'catalog/0x6ac8071f/lua_config_hero_item_reroll.json'), 'utf8')).rows as Reroll);
const MEM_ITEM: Record<string, string> = { 5140: 'Memory Scrap', 5141: 'Memory Thread - Normal', 5142: 'Memory Thread - Magic', 5143: 'Memory Thread - Rare', 5144: 'Memory Thread - Epic', 391000: 'Crude Lunar Dust', 391001: 'Luminous Lunar Dust', 391002: 'Flawless Lunar Dust' };
/** a memory's random affix groups (its base: Origin 71001, Discipline 71002, Progress 71003): one block of 19 from 4021569 and one of 26 from 4021650, in that
 *  order (the reads: Origin rolls 4021653 and 4021666, Progress 4021717; Affliction Effect, which the game lists, is only in the first block) */
const memPool = (baseId: number) => { const i = baseId - 71001; return i < 0 || i > 2 ? [] : [...Array.from({ length: 19 }, (_, k) => 4021569 + 19 * i + k), ...Array.from({ length: 26 }, (_, k) => 4021650 + 26 * i + k)]; };
/** the chance one roll lands a given affix group: the game's odds for Affliction Effect on an Epic (0.32 % T1 + 0.49 % T2 + 0.65 % T3, owner 2026-10-17), taken
 *  for every group (the catalog has no affix weights); the tier split is the reroll table's */
const MEM_GROUP_P = 0.0146;
/** One random affix slot you pick, rerolled until the affix lands (a reroll puts a random affix in it, there is no keep: owner 2026-10-17; expected rerolls 1 / p): a reroll costs the reroll table's items for the rarity and item level (the read
 *  has no memory item level: the hero's). A level step that reaches a RandomAffixMod level (Epic: 20, 40) rolls a new affix free, then rerolls. */
function memoryCands(s: State, ctx: GenCtx): Cand[] {
  const rolls = table<{ rows: Record<string, [number, number][]> }>('config_modifier_rolls').rows, out: Cand[] = [];
  const fe = (n: Record<string, number>) => Object.entries(n).reduce((t, [k, v]) => t + v * (ctx.prices.price(MEM_ITEM[k] ?? k, s.level) ?? NaN), 0);
  const said = (n: Record<string, number>) => Object.entries(n).map(([k, v]) => `${v} ${MEM_ITEM[k] ?? k}`).join(' + ');
  const cap = (r: number) => Math.max(0, ...Object.values(ENH()).filter((x) => x.Rarity.includes(r)).map((x) => x.TargetEnhanceLevel));
  const need = (r: number, from: number, to: number) => { const n: Record<string, number> = {}; for (const x of Object.values(ENH())) if (x.Rarity.includes(r) && x.CurrentEnhanceLevel >= from && x.TargetEnhanceLevel <= to) for (const [k, v] of Object.entries(x.ItemConsume)) n[k] = (n[k] ?? 0) + v; return n; };
  const mid = (id: number) => rolls[id].map(([lo, hi]) => (lo + hi) / 2);
  type Aff = { id: number; dyn: number[]; list: string };
  const mems = (s.loadout.heroMemories ?? []) as { label: string; slot: number; baseId: number; reminiscenceLevel: number; affixes: Aff[] }[];
  for (const m of mems) {
    const b = m.affixes.find((a) => a.list === 'BaseAttrInfoList'); if (!b) continue;
    const group = Math.floor(b.id / 100), r = group % 10, L = m.reminiscenceLevel, top = cap(r);
    const at = (lv: number) => { const id = group * 100 + (51 - lv); return rolls[id] ? { ...b, id, dyn: rolls[id].map(([lo]) => lo) } : undefined; };
    const write = (affixes: Aff[], lv = L) => [{ kind: 'patch', op: 'memories', items: mems.map((x) => (x !== m ? x : { ...x, reminiscenceLevel: lv, affixes })) } as never];
    // the random affix outcomes: every pool group not on the memory's other random affixes, at each tier the reroll table rolls, and its chance (tier and better)
    const rr = Object.values(REROLL()).find((x) => x.Rarity.includes(r) && x.ItemLevel[0] <= s.level && s.level <= x.ItemLevel[1]);
    const rerollFE = rr ? fe(rr.ItemConsume) : NaN, W = rr ? rr.AffixTier.reduce((t, x) => t + x.Value, 0) : 0;
    const outcomes = (taken: Aff[]) => (rr ? memPool(m.baseId) : []).filter((g) => !taken.some((a) => Math.floor(a.id / 100) === g)).flatMap((g) => rr!.AffixTier
      .filter((t) => rolls[g * 100 + t.Key]).map((t) => ({ id: g * 100 + t.Key, p: MEM_GROUP_P * rr!.AffixTier.filter((x) => x.Key <= t.Key).reduce((u, x) => u + x.Value, 0) / W })));
    const random = m.affixes.filter((a) => a.list === 'SuffixInfoList');
    // a random affix you have, rerolled to another (or the same group at a better tier)
    if (Number.isFinite(rerollFE)) for (const a of random) for (const o of outcomes(random.filter((x) => x !== a)))
      if (Math.floor(o.id / 100) !== Math.floor(a.id / 100) || o.id % 100 < a.id % 100)
        out.push({ key: `memroll|${m.slot}|${a.id}|${o.id}`, kind: 'memory', costFE: rerollFE / o.p, note: `${(o.p * 100).toFixed(2)} % a reroll (that tier or better)`,
          label: `Reroll your ${m.label}'s ${lineText(a.id, a.dyn)} to ${lineText(o.id, mid(o.id))}: about ${Math.round(1 / o.p)} rerolls of ${said(rr!.ItemConsume)}`,
          changes: write(m.affixes.map((x) => (x === a ? { ...x, id: o.id, dyn: mid(o.id) } : x))) });
    // levelled to its cap: the base stat only (a random affix it rolls on the way is not priced: at least this)
    const capped = at(top);
    if (top > L && capped) {
      const n = need(r, L, top);
      if (Number.isFinite(fe(n))) out.push({ key: `memlevel|${m.slot}|${L}|${top}`, group: `memlevel|${m.slot}|${L}`, kind: 'memory', costFE: fe(n), note: 'a random affix it rolls on the way is not priced: at least this',
        label: `Level your ${m.label} ${L} -> ${top}: ${lineText(capped.id, capped.dyn)} (yours ${lineText(b.id, b.dyn)}); ${said(n)}`, changes: write(m.affixes.map((x) => (x === b ? capped : x)), top) });
    }
    // levelled to the next level that rolls a random affix, that affix rerolled until it lands (its first roll is free)
    const next = Math.min(...Object.values(ENH()).filter((x) => x.Rarity.includes(r) && x.RandomAffixMod && x.TargetEnhanceLevel > L && x.TargetEnhanceLevel <= top).map((x) => x.TargetEnhanceLevel));
    const base = Number.isFinite(next) ? at(next) : undefined;
    if (base && Number.isFinite(rerollFE)) {
      const n = need(r, L, next), lv = fe(n);
      if (Number.isFinite(lv)) for (const o of outcomes(random)) {
        const rerolls = Math.max(0, 1 / o.p - 1);
        out.push({ key: `memlevel|${m.slot}|${L}|${o.id}`, group: `memlevel|${m.slot}|${L}`, kind: 'memory', costFE: lv + rerolls * rerollFE, note: `${(o.p * 100).toFixed(2)} % a roll (that tier or better)`,
          label: `Level your ${m.label} ${L} -> ${next} (${said(n)}), its new random affix rerolled to ${lineText(o.id, mid(o.id))}: about ${Math.round(rerolls)} rerolls of ${said(rr!.ItemConsume)}`,
          changes: write([...m.affixes.map((x) => (x === b ? base : x)), { id: o.id, dyn: mid(o.id), list: 'SuffixInfoList' }], next) });
      }
    }
  }
  return out;
}
/** a modifier's game text at a roll ($+P1$ -> +18), else its id */
export function lineText(id: number, dyn: number[]): string {
  const b = (table<{ rows: Record<string, { bindings?: string[] }> }>('config_modifier').rows[id]?.bindings ?? [])[0], t = b && table<{ rows: Record<string, string> }>('lang_en').rows[`affix_class|description|${b.split('_')[0]}`];
  return t ? t.replace(/<[^>]+>/g, '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim().replace(/\$([+-]?)P(\d)\$/g, (_, sg: string, i: string) => `${sg}${dyn[+i - 1] ?? '?'}`) : `modifier ${id} at ${dyn.join(' / ')}`;
}
/** packBoard, remembered per board and shape list (a search that fails can take seconds) */
const packed = new Map<string, boolean>();
/** the board `l` (its slates, the added ones as `extra` shapes) packs, and no capped type (SLATE_CAP: at most 3) is over */
function fitsLayout(l: Record<string, unknown>, level: number, extra: number[]): boolean {
  const items = (l.slateItems ?? []) as { itemId: string; baseId: number; shapeId?: number; link?: unknown; direction?: number }[];
  const k = JSON.stringify([items.filter((x) => !x.itemId.startsWith('guide-add-')).map((x) => [x.baseId, x.shapeId, x.link, x.direction, x.itemId.startsWith('guide-')]), extra, level]);
  if (!packed.has(k)) packed.set(k, !overCap(items) && packBoard(l, level, extra) !== null);
  return packed.get(k)!;
}
/** the skill gems one can hold (config_item_base p5c -> config_skill_stone) of a kind (config_skill_stone i4: 1 active, 3 aura), named */
let pools: Map<number, { sid: number; name: string }[]> | undefined;
function skillPool(kind: number): { sid: number; name: string }[] {
  if (!pools) {
    pools = new Map();
    const base = table<{ rows: Record<string, { p5c?: number[] }> }>('config_item_base').rows, st = table<{ rows: Record<string, { i4?: number }> }>('config_skill_stone').rows, lang = table<{ rows: Record<string, string> }>('lang_en').rows;
    for (const [b, r] of Object.entries(base)) { const sid = r.p5c?.[0], name = lang[`item_base|name|${b}`]; if (typeof sid !== 'number' || !st[sid] || !name) continue;
      const k = st[sid].i4 ?? 0; if (!pools.get(k)) pools.set(k, []); if (!pools.get(k)!.some((x) => x.sid === sid)) pools.get(k)!.push({ sid, name }); }
  }
  return pools.get(kind) ?? [];
}
type Cand = { key: string; /** taken once per group */ group?: string; /** a better roll of a worn legendary: the lowest roll with the same figure is found when taken */ roll?: { slot: string; id: number; now: number[]; best: number[]; range: [number, number][] }; label: string; costFE: number; kind: string; note?: string; changes: Move['changes'] };
const fits = (f: Figure) => !f.mana || 'stop' in f.mana || f.mana.fits;

export function candidates(s: State, ctx: GenCtx, o: PlanOpts, lines: { id: number; name: string }[], held = heldUniques(s)): Cand[] {
  const L = s.loadout as { skills: { name: string; level: number; sid: number; place: { kind: string; slot?: number; ownerKind?: string; ownerSlot?: number } }[]; slateItems?: Record<string, unknown>[] };
  const out: Cand[] = [], fates = new Set<string>();
  const add = (m: Move, label = m.label) => {
    const t = m.then, cost = t ? t.costFE : m.costFE;
    if (cost === null || m.minLevel > s.level || (m.kind === 'support' && MEASURED_WRONG.test(m.label))) return;
    const u = /^Unique (.+) in \w+$/.exec(m.label)?.[1];
    if (u && held.has(u)) return;
    // a fate prices the same on any free point of its kind (the steps show only the next copy's smaller gain): offered on the first one only
    const fate = m.kind === 'kismet' && /^Socket (.+) on .+ \d-\d$/.exec(label)?.[1];
    if (fate) { if (fates.has(fate)) return; fates.add(fate); }
    out.push({ key: `${m.kind}|${label}`, label: t ? `${label} (${t.note})` : label, costFE: cost, kind: m.kind, changes: t ? t.changes : m.changes });
  };
  // Wind Projectiles: the model's figure is off against the owner's dummy (RULES)
  const MEASURED_WRONG = /Wind Projectiles|Slow Projectile -> /;
  for (const g of [ownedGear, gearMoves, gemMoves, kismetMoves, pactMoves, prismMoves, slateMoves, talentMovesWith({ maxShifts: 60, locked: o.locked, budget: o.points }), whiteBaseMoves]) for (const m of g(s, ctx)) add(m);
  for (const m of targetMoves(s, ctx)) {
    // the example build's skill groups are not offered: they replace a whole group at a cost they do not carry (a socket's gem is gemMoves', priced)
    if (/talent prism/.test(m.label)) add({ ...m, costFE: o.prismFE }, 'A Phantasmagoria talent prism like the example build (Onslaughter crit and two-handed mirrors) at your price');
  }
  // another copy of a legendary you wear, bought with one line at its best roll (user, 2026-10-16: a Ruinous Star with Deterioration Duration 28+ is a breakpoint);
  // the lowest roll that gives the same figure is found once the step is taken (runPlan)
  const rolls = table<{ rows: Record<string, [number, number][]> }>('config_modifier_rolls').rows;
  for (const [slot, name] of ownedUniques(s, true)) {
    const fe = ctx.prices.price(name, s.level), g = ((s.loadout.gear ?? []) as { slot: string; affixes?: { id: number; dyn: number[]; list: string }[] }[]).find((x) => x.slot === slot);
    if (fe === null || !g) continue;
    for (const a of (g.affixes ?? []).filter((x) => x.list !== 'BaseAttrInfoList')) {
      const r = rolls[a.id], best = r?.map(([lo, hi], i) => (lo < 0 ? Math.min(lo, a.dyn[i]) : Math.max(hi, a.dyn[i])));
      if (!r) continue;
      // your prices for this line: one step per roll you gave (a roll above the drop tier is the corrupted tier: id x 10 + 0 when its range holds it)
      const mine = o.rollPrices?.find((p) => p.item === name && Math.floor(p.line / 10) === Math.floor(a.id / 10));
      if (mine) {
        for (const [v, cost] of mine.rolls) {
          if (v <= a.dyn[0]) continue;
          const t0 = Math.floor(a.id / 10) * 10, id = !r || r[0][1] >= v ? a.id : rolls[t0] && rolls[t0][0][0] <= v && v <= rolls[t0][0][1] ? t0 : a.id, dyn = [v, ...a.dyn.slice(1)];
          out.push({ key: `rollp|${slot}|${a.id}|${v}`, group: `roll|${slot}`, kind: 'unique', costFE: cost, note: id === t0 && t0 !== a.id ? 'a corrupted copy, at your price' : 'at your price',
            label: `Buy another ${name} with ${lineText(id, dyn)} (yours: ${a.dyn[0]}); replace yours`, changes: [{ kind: 'patch', op: 'gear-roll', slot, id: a.id, dyn, newId: id } as never] });
        }
        continue;
      }
      if (!r || !best || best.every((v, i) => v === a.dyn[i])) continue;

      out.push({ key: `roll|${slot}|${a.id}`, group: `roll|${slot}`, kind: 'unique', costFE: fe, roll: { slot, id: a.id, now: a.dyn, best, range: r },
        label: `Buy another ${name} with ${lineText(a.id, best)} (yours: ${a.dyn.join(' / ')}); replace yours`, changes: [{ kind: 'patch', op: 'gear-roll', slot, id: a.id, dyn: best } as never] });
    }
  }
  // a worn hero memory levelled (MEM1: base attr = group x 100 + BaseAttrTier) and its random affixes rerolled. A higher rarity is a new memory bought
  // (owner, 2026-10-16): its base from the market, not here
  for (const c of memoryCands(s, ctx)) out.push(c);
  // a gem to level 20 (time, no FE); a Magnificent / Noble support is levelled by consuming copies (max 5): never a time step
  for (const g of L.skills.filter((x) => x.level < 20 && !/\((Magnificent|Noble)\)/.test(x.name))) {
    const at = (x: typeof g) => JSON.stringify(x.place) === JSON.stringify(g.place) && x.sid === g.sid;
    const p = g.place.kind === 'support' || g.place.ownerKind ? { kind: g.place.ownerKind!, slot: g.place.ownerSlot! } : { kind: g.place.kind, slot: g.place.slot! };
    const group = L.skills.filter((x) => (x.place.kind === p.kind && x.place.slot === p.slot) || (x.place.ownerKind === p.kind && x.place.ownerSlot === p.slot));
    out.push({ key: `level|${g.name}|${JSON.stringify(g.place)}`, label: `Level ${g.name} ${g.level} -> 20 (time)`, costFE: 0, kind: 'level',
      changes: [{ kind: 'patch', op: 'skill-group', place: p, items: group.map((x) => (at(x) ? { ...x, level: 20 } : x)) } as never] });
  }
  // another skill in one of the weakest active / aura places (owner, 2026-10-16: Fixate for Bull's Rage, another curse...): an active skill for an active place,
  // an aura for an aura place, the place's supports kept; at the gem's market price (free when you hold one); the mana check guards an aura
  for (const p of o.skillSlots ?? []) for (const k of skillPool(p.kind === 'passive' ? 3 : 1)) {
    const groupOf = (x: { place: { kind: string; slot?: number; ownerKind?: string; ownerSlot?: number } }) => (x.place.kind === p.kind && x.place.slot === p.slot) || (x.place.ownerKind === p.kind && x.place.ownerSlot === p.slot);
    const group = L.skills.filter(groupOf), head = group.find((x) => x.place.kind === p.kind);
    if (!head || head.sid === k.sid || L.skills.some((x) => x.sid === k.sid)) continue;
    const level = gemLevelAt(k.sid, s.level, 20), held = gemsHeld(s).has(k.name), cost = held ? { costFE: 0 } : costOf(ctx.prices, k.name, s.level, 'gem');
    if (!level || cost.costFE === null) continue;
    out.push({ key: `skill|${p.kind}|${p.slot}|${k.sid}`, group: `skill|${p.kind}|${p.slot}`, kind: 'skill', costFE: cost.costFE ?? 0, ...(held ? { note: 'you hold one' } : {}),
      label: `Replace ${head.name} with ${k.name} (${p.kind === 'passive' ? 'aura' : 'active'} slot ${p.slot}; its supports kept)`,
      changes: [{ kind: 'patch', op: 'skill-group', place: p, items: group.map((x) => (x === head ? { ...x, sid: k.sid, name: k.name, level, itemId: `guide-skill-${k.sid}`, mods: [] } : x)) } as never] });
  }
  // one more slate where the board, re-laid out (moving and rotating a slate costs next to nothing: owner, 2026-10-16), still has room: packBoard
  const added = ((s.loadout.slateItems ?? []) as { itemId: string; shapeId?: number }[]).filter((x) => x.itemId.startsWith('guide-add-')).map((x) => x.shapeId!);
  // a line already on a board slate is never offered on another (owner, 2026-10-17: an added slate with the Proximity line the board has)
  const elsewhere = (skip?: number) => new Set(((s.loadout.slateItems ?? []) as { talents: number[] }[]).flatMap((x, j) => (j === skip ? [] : x.talents)));
  const kinds: [number, string][] = [[2020, 'a 2-cell slate (the type of your 2-cell slates)'], [2030, 'a 3-cell slate (the type of your 3-cell slate)']];
  for (const [shape, what] of kinds) {
    if (!fitsLayout(applyPatch(s.loadout, addSlate(s, shape, []) as never), s.level, [...added, shape])) continue;
    for (const set of [...lines.slice(0, 10).map((a) => [a]), ...lines.slice(0, 6).flatMap((a, i) => lines.slice(i + 1, 6).map((b) => [a, b]))]) {
      if (set.some((x) => elsewhere().has(x.id))) continue;
      const names = set.map((x) => x.name), price = (n: string) => o.slatePrices.find(([r]) => r.test(n))?.[1] ?? o.slateFE;
      out.push({ key: `add|${added.length}|${shape}|${set.map((x) => x.id).join('-')}`, group: `add|${added.length}`, kind: 'slate', costFE: names.reduce((t, n) => t + price(n), 0),
        note: 'slate price assumed: check /market; the board re-laid out to fit it (the slate board shows where each goes)',
        label: `Add ${what} with ${names.join(' + ')}`, changes: [addSlate(s, shape, set.map((x) => x.id))] });
    }
  }
  // a slate you own (bag, booth) in place of one on the board: free
  // not one already on the board: the read lists board slates among the items (where 'board'), and a board slate's own lines may be read in part
  const onBoard = new Set(((s.loadout.slateItems ?? []) as { itemId: string; talents: number[] }[]).flatMap((x) => [x.itemId, JSON.stringify([...x.talents].sort())]));
  // free, so tried in every board slot its type may take (SLATE_CAP), not only the weakest (owner, 2026-10-17: a Pedigree you own fits only in place of yours)
  const board = (s.loadout.slateItems ?? []) as { talents: number[]; baseId: number }[];
  for (const own of s.owned.filter((x) => x.talents?.length && x.where !== 'board' && !onBoard.has(x.itemId) && !onBoard.has(JSON.stringify([...x.talents!].sort())))) {
    const where = placeOf(own.where), may = replaceable(board, own.baseId);
    board.forEach((it, i) => !may.includes(i)
      || !fitsLayout(applyPatch(s.loadout, replaceSlate(s, i, own.talents!, { baseId: own.baseId, shapeId: own.shapeId }) as never), s.level, added) || out.push({ key: `ownslate|${own.itemId}|${i}`, group: `ownslate|${own.itemId}`, kind: 'slate', costFE: 0,
      label: `Put your ${where} slate (slot ${own.slot}: ${own.talents!.map(talentName).join(', ')}) in place of board slate ${i + 1} (${it.talents.map(talentName).join(', ')})`, changes: [replaceSlate(s, i, own.talents!, { baseId: own.baseId, shapeId: own.shapeId })] }));
  }
  // a slate in place of one of yours, same shape (so it fits the board), carrying one or two wanted lines (its other lines priced as nothing)
  const slates = L.slateItems ?? [], price = (n: string) => o.slatePrices.find(([r]) => r.test(n))?.[1] ?? o.slateFE;
  const sets = [...lines.slice(0, 10).map((a) => [a]), ...lines.slice(0, 6).flatMap((a, i) => lines.slice(i + 1, 6).map((b) => [a, b]))];
  slates.forEach((it, i) => {
    if (o.slateSlots && !o.slateSlots.includes(i)) return;
    const was = (it.talents as number[]).map(talentName).join(', '), there = elsewhere(i);
    for (const set of sets) {
      if (set.some((x) => there.has(x.id))) continue;
      const ids = set.map((x) => x.id), names = set.map((x) => x.name);

      out.push({ key: `slate|${i}|${ids.join('-')}`, kind: 'slate', costFE: names.reduce((t, n) => t + price(n), 0), note: 'slate price assumed: check /market',
        label: `Replace your slate ${i + 1} (${was}) with a slate of the same shape with ${names.join(' + ')}`, changes: [replaceSlate(s, i, ids)] });
    }
  });
  return out;
}

/** your character to `o.goal` damage per second on `o.target`: the steps, cheapest damage per FE first */
export async function runPlan(ev: Evaluator, s0: State, books: PriceBook, k: Partial<PlanOpts> = {}, onStep?: (o: GuideOut) => void): Promise<GuideOut> {
  const o = { ...DEFAULT_PLAN, ...k };
  let s: State = { ...s0, skill: 'hoa', target: o.target };
  const ctx: GenCtx = { prices: books, level: s.level, notSearched: new Set() };
  const C = ctxOfState(s), first = (await ev.run(s.loadout, [], C)).figure;
  if (first.stop) throw new Error(`your character cannot be priced on ${bossName(o.target)}: ${first.stop}`);
  if (o.goalSeconds) { if (!first.lifeMax) throw new Error(`${o.target}: no max Life to set a kill time against`); o.goal = first.lifeMax / o.goalSeconds; }
  const lines = (await slateWants(ev, s, first, 0, 25, false)).filter((x) => !CONVERSION.test(x.name));
  // talent points that stay where they are: the owner's (Paralysis is applied in game, Sealed Mana Compensation keeps the auras on) and a node the model prices
  // at exactly 0 (a state it does not evaluate, so it cannot judge the node)
  const held = Object.entries((s.loadout.talents ?? {}) as Record<string, number>).filter(([, p]) => p > 0).map(([n]) => +n);
  const zero = await Promise.all(held.map(async (n) => ((g) => !g.stop && g.kill === first.kill)((await ev.run(s.loadout, [{ kind: 'talent', node: n, points: 0 } as never], C)).figure)));
  o.points = Object.values((s.loadout.talents ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0);
  o.locked = new Set(held.filter((n, i) => zero[i] || KEPT.test(talentName(n))));
  const notes = [...RULES, ...(first.mana && !('stop' in first.mana) ? [`Sealed Mana now: ${first.mana.reserved} of ${first.mana.capacity} (${first.mana.margin} free); Life sealed ${first.mana.life.reserved} of ${first.mana.life.capacity}.`] : [`Sealed Mana: not calculated (${first.mana && 'stop' in first.mana ? first.mana.stop : 'no figure'}); changes are not checked against it.`])];
  const steps: NonNullable<GuideOut['plan']>['steps'] = [], refused = new Map<string, string>(), score = new Map<string, number>(), taken = new Set<string>();
  let f = first, spent = 0;
  const slateFrom: Record<number, string> = {};
  let figures = 0, t0 = Date.now();
  const lap = (what: string) => { console.log(`[time] ${what}: ${figures} figures, ${((Date.now() - t0) / 1000).toFixed(0)} s`); figures = 0; t0 = Date.now(); };
  const rate = async (c: Cand) => {
    figures++;
    const e = await ev.run(s.loadout, c.changes, C), g = e.figure;
    // both ways: a change that takes out a piece the model does not price (an omission gone) would read as a gain it cannot judge
    const now = new Set(g.partial.map(pieceKey)), lost = f.partial.filter((p) => !now.has(pieceKey(p)));
    const why = g.stop ? undefined : !rankable(f, g) ? `not priced whole: ${g.partial.filter((p) => !f.partial.includes(p))[0]?.slice(0, 160)}`
      : lost.length ? `takes out a piece the model does not price: ${lost[0].slice(0, 160)}`
      // the kill speed averages the damage from the boss's full Life down to 0; the training dummy (what the owner checks a step on) stays at full Life. A step
      // must raise both: Passivation -> Wind Projectiles was +8.6 % on the kill speed, -8 % at full Life in the model and -25 % on the owner's dummy (2026-10-16)
      // faster embers: the model has Gale turn the speed into damage and every ember still landing; the owner's dummy says the shotgun loses more (Wind Projectiles
      // 22.5 B -> 16.9 B, Precise Projectiles 56.7 B where the model said x1.16, 2026-10-16): no step raises the projectile speed
      : g.projectile && f.projectile && g.projectile.speedInc > f.projectile.speedInc + 0.5 ? `raises projectile speed (+${f.projectile.speedInc.toFixed(0)}% -> +${g.projectile.speedInc.toFixed(0)}%), which costs embers in your game`
      : g.life100 < f.life100 * 0.995 ? `lowers your damage at full Life (what the training dummy shows) by ${((1 - g.life100 / f.life100) * 100).toFixed(1)} %` : !fits(g) ? `unseals an aura (Sealed Mana ${(g.mana as { reserved: number }).reserved} over ${(g.mana as { capacity: number }).capacity})` : undefined;
    if (why && g.kill > f.kill * 1.01) refused.set(c.label, `${why} (+${((g.kill / f.kill - 1) * 100).toFixed(0)} % if it were)`);
    const v = g.stop || why || !(g.kill > f.kill * 1.005) ? -Infinity : Math.log(g.kill / f.kill) / Math.max(c.costFE, 1);
    score.set(c.key, v);
    return { c, e, v };
  };
  // the board after the steps so far, in every write (a stopped plan keeps its slate viewer): as packBoard lays it out when slates were added (each placed
  // slate moved or rotated where it shows), else as it is
  const board = (): GuideOut['board'] => {
    const items = (s.loadout.slateItems ?? []) as { itemId: string; shapeId?: number }[], extra = items.filter((x) => x.itemId.startsWith('guide-add-'));
    const reshaped = items.some((x) => x.itemId.startsWith('guide-slate-')), lay = extra.length || reshaped ? packBoard(s.loadout, s.level, extra.map((x) => x.shapeId!)) : null, nowCells = boardView(s.loadout).slates.map((x) => JSON.stringify(x.cells));
    return { now: boardView(s0.loadout), after: boardView(s.loadout, (i) => (slateFrom[i] ? { source: slateFrom[i], changed: true }
      : lay && JSON.stringify(lay[i]) !== nowCells[i] ? { source: 'on your board: move or rotate it to where it shows', changed: true } : { source: 'on your board', changed: false }), lay ?? undefined) };
  };
  const out = (partialRun: boolean): GuideOut => ({ mode: 'advise', board: board(), pin: ev.pin, etor: { season: books.season, fetchedAt: books.fetchedAt },
    knobs: { plan: { ...o, slatePrices: o.slatePrices.map(([r, v]) => `${r.source}: ${v}`) }, fight: ev.fight, rollBudget: ev.rollBudget, target: o.target, partialRun },
    character: { level: s0.level, skill: 'hoa', fe: s0.fe, owned: s0.owned.length, gear: ((s0.loadout.gear ?? []) as { slot?: string; label: string; name?: string }[]).map((g) => ({ slot: g.slot ?? '', label: g.name ?? g.label })) },
    start: first, startNotes: notes, steps: [], notSearched: [...ctx.notSearched], unpriced: [], notCalculable: [...refused].map(([l, w]) => `${l}: ${w}`),
    slates: lines.slice(0, 25), plan: { target: o.target, goal: o.goal, ...(o.goalSeconds ? { goalSeconds: o.goalSeconds } : {}), at: new Date().toISOString(), start: { label: 'your character as read from the game', figure: first }, steps,
      build: buildSheet(s.loadout) } });
  const keep = heldUniques(s0);
  // the weakest board slates (the least lost when emptied): a new slate is tried in place of these 2 only (6 figures, again after a slate step)
  const weakest = async () => { const n = ((s.loadout.slateItems ?? []) as unknown[]).length;
    const loss = await Promise.all(Array.from({ length: n }, async (_, i) => ({ i, k: (await ev.run(s.loadout, [replaceSlate(s, i, [])], C)).figure.kill })));
    o.slateSlots = loss.sort((a, b) => b.k - a.k).slice(0, 2).map((x) => x.i); };
  await weakest();
  // the weakest skill places (the least lost when the place is emptied): 2 active (never the main skill or Blink: movement, which the figure does not price), 2 aura
  const weakSkills = async () => { const sk = ((s.loadout.skills ?? []) as { name?: string; place: { kind: string; slot?: number; ownerKind?: string; ownerSlot?: number } }[]);
    const places = sk.filter((g) => (g.place.kind === 'active' && g.place.slot !== 0 && !/^Blink$/.test(g.name ?? '')) || g.place.kind === 'passive').map((g) => ({ kind: g.place.kind, slot: g.place.slot! }));
    const loss = await Promise.all(places.map(async (p) => ({ p, k: (await ev.run({ ...s.loadout, skills: sk.filter((g) => !((g.place.kind === p.kind && g.place.slot === p.slot) || (g.place.ownerKind === p.kind && g.place.ownerSlot === p.slot))) }, [], C)).figure.kill })));
    const by = (k: string) => loss.filter((x) => x.p.kind === k).sort((a, b) => b.k - a.k).slice(0, 2).map((x) => x.p);
    o.skillSlots = [...by('active'), ...by('passive')]; };
  await weakSkills();
  const fitsFE = (c: Cand) => o.budget === undefined || c.costFE <= o.budget - spent;
  let cands = candidates(s, ctx, o, lines, keep).filter(fitsFE);
  console.log(`start: ${first.kill.toExponential(3)}/s on ${o.target}; ${cands.length} candidates; ${lines.length} slate lines`);
  lap('slate lines and talent checks');
  await Promise.all(cands.map(rate));
  lap(`first round (${cands.length} options)`);
  while (steps.length < o.maxSteps && f.kill < o.goal) {
    const open = cands.filter((c) => fitsFE(c) && !taken.has(c.key) && !(c.group && taken.has(c.group)) && (score.get(c.key) ?? 0) > -Infinity).sort((a, b) => score.get(b.key)! - score.get(a.key)!);
    if (!open.length) break;
    // lazy greedy: a stale score bounds the fresh one from above (a gain shrinks as the build grows); the stale best are re-priced a batch at a time until the
    // best fresh one beats every stale score left, so no option that could win goes unpriced and none that cannot is priced
    const P = Math.max(16, ev.parallelism ?? 16);
    let w: Awaited<ReturnType<typeof rate>> | undefined;
    for (let at = 0; at < open.length; at += P) {
      const got = (await Promise.all(open.slice(at, at + P).map(rate))).filter((x) => x.v > -Infinity).sort((a, b) => b.v - a.v)[0];
      if (got && (!w || got.v > w.v)) w = got;
      const next = open[at + P];
      if (w && (!next || w.v >= score.get(next.key)!)) break;
    }
    if (!w) continue;
    // a better roll: the lowest single-line roll that still gives this figure (Deterioration Duration 28 is the same breakpoint as 30)
    if (w.c.roll && w.c.roll.best.length === 1) {
      const { slot, id, now, best, range } = w.c.roll, up = best[0] > now[0];
      for (let v = best[0] + (up ? -1 : 1); up ? v > now[0] : v < now[0]; v += up ? -1 : 1) {
        const e = await ev.run(s.loadout, [{ kind: 'patch', op: 'gear-roll', slot, id, dyn: [v] } as never], C);
        if (e.figure.kill < w.e.figure.kill * 0.999 || e.figure.life100 < w.e.figure.life100 * 0.999) break;
        w.e = e; w.c = { ...w.c, label: w.c.label.replace(lineText(id, best), `${lineText(id, [v])} or ${up ? 'more' : 'less'} (range ${range[0][0]}-${range[0][1]})`) };
      }
    }
    // the board slot a slate step fills, and where that slate comes from (the slate viewer)
    const own = /^ownslate\|(.+)\|(\d+)$/.exec(w.c.key), buy = /^slate\|(\d+)\|/.exec(w.c.key);
    if (own) { const o = s0.owned.find((x) => x.itemId === own[1]); slateFrom[+own[2]] = `from your ${placeOf(o?.where)}${o ? `, slot ${o.slot}` : ''} (free, step ${steps.length + 1})`; }
    if (buy) slateFrom[+buy[1]] = `buy (about ${Math.round(w.c.costFE)} FE, price assumed: check /market; step ${steps.length + 1})`;
    if (w.c.key.startsWith('add|')) slateFrom[((s.loadout.slateItems ?? []) as unknown[]).length] = `buy and add (about ${Math.round(w.c.costFE)} FE, price assumed: check /market; step ${steps.length + 1})`;
    s = { ...s, loadout: w.e.loadout }; spent += w.c.costFE; taken.add(w.c.key); if (w.c.group) taken.add(w.c.group);
    steps.push({ label: w.c.label, costFE: w.c.costFE, totalFE: spent, figure: w.e.figure, ...(w.c.note ? { note: w.c.note } : {}) });
    f = w.e.figure;
    lap(`step ${steps.length + 1} chosen`);
    console.log(`step ${steps.length}: ${w.c.label.slice(0, 120)} | ${w.c.costFE} FE (total ${spent}) -> ${f.kill.toExponential(3)}/s`);
    onStep?.(out(true));
    // the build changed: new moves (a socket's new neighbours, a slot's new item) are priced, the rest keep their stale score
    if (/^(own)?slate\||^add\|/.test(w.c.key)) await weakest();
    if (w.c.key.startsWith('skill|')) await weakSkills();
    const seen = new Set(cands.map((c) => c.key)), next = candidates(s, ctx, o, lines, keep).filter(fitsFE);
    await Promise.all(next.filter((c) => !seen.has(c.key)).map(rate));
    cands = next;
  }
  const r = out(false);
  if (f.kill < o.goal) r.startNotes!.push(`The goal is not reached: the plan ends at ${f.kill.toExponential(2)} per second; nothing left that the model can price raises it.`);
  return r;
}
