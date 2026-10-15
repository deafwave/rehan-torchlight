import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { basesFor, gearMoves, whiteBaseMoves } from '../src/candidates/gear';
import { craftOptions, type LibraryAffix } from '../src/craft';
import { pinRoot, table } from '../src/pin';
import { GROUND, L100, applyAll, loadout } from './apply';
import type { GenCtx, Move, PriceBook, Skill, State } from '../src/types';

const PIN = pinRoot();
const rows = (f: string) => table<{ rows: any }>(f).rows;
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const library: LibraryAffix[] = JSON.parse(readFileSync(here('../../../data/affix_library.json'), 'utf8')).affixes;
// weapon base name -> compendium category: an independent check of the catalog columns the code filters on
const family: Record<string, string> = {};
for (const [k, v] of Object.entries<any>(JSON.parse(readFileSync(here('../../../data/gear-en.json'), 'utf8'))))
  for (const b of Object.values<any>(v.baseItems)) family[b.name] = k.split('/')[2];

const fake = (prices: Record<string, number>): PriceBook => ({ season: 't', fetchedAt: 't', price: k => prices[String(k)] ?? null });
const ctx = (level: number, prices: Record<string, number> = { 'Precious Ember': 0.06, 'Matchless Ember': 0.27 }): GenCtx =>
  ({ prices: fake(prices), level, notSearched: new Set() });
const item = (slot: string, baseId: number, label: string) => ({ slot, baseId, label, level: 60, affixes: [] as object[] });
const state = (skill: Skill, level: number, gear: object[]): State => ({ loadout: { gear }, owned: [], fe: 0, level, skill });
const MAUL = item('mainHand', 1012, 'Vindicator Maul');   // 2H maul, item level 54
const HELM = item('helmet', 3600, "Brute's Helm");        // STR helmet, item level 1
const CHEST = item('chest', 3000, "Brute's Chestguard");
const hoa100 = () => state('hoa', 100, [MAUL, HELM]);
const hoa60 = () => state('hoa', 60, [MAUL, HELM]);
const swapped = (m: { changes: any[] }) => m.changes[0].item;

describe('gearMoves', () => {
  it('offers no tier above the hero level, and gates every move at or below it', () => {
    const moves = gearMoves(hoa60(), ctx(60));
    expect(moves.some(m => m.kind === 'craft')).toBe(true);
    expect(moves.every(m => m.minLevel <= 60)).toBe(true);
    const tooHigh = new Set(library.flatMap(a => a.tiers.filter(t => t.requiredLevel > 60).map(t => Number(t.tierAffixId))));
    for (const m of moves.filter(m => m.kind === 'craft')) {
      const mods = [...(swapped(m).modifiers.prefix ?? []), ...(swapped(m).modifiers.suffix ?? [])];
      expect(mods.some((x: { id: number }) => tooHigh.has(x.id))).toBe(false);
    }
  });

  it('craft cost = expected embers x ember price at the level, null when the ember is unpriced', () => {
    const moves = gearMoves(hoa60(), ctx(60, { 'Precious Ember': 0.06 })).filter(m => m.kind === 'craft' && (m.changes[0] as { slot?: string }).slot === 'mainHand');
    const opts = new Map(craftOptions(library, 'Two-Handed Hammer', 60).map(o => [Number(o.tierAffixId), o]));
    let priced = 0, unpriced = 0;
    for (const m of moves) {
      const it = swapped(m), added = [...(it.modifiers.prefix ?? []), ...(it.modifiers.suffix ?? [])].at(-1);
      const o = opts.get(added.id)!;
      if (o.ember === 'Precious Ember') { expect(m.costFE).toBeCloseTo(o.expectedEmbers * 0.06); priced++; }
      else { expect(m.costFE).toBeNull(); unpriced++; }
      expect(m.minLevel).toBe(o.requiredLevel);
    }
    expect(priced).toBeGreaterThan(0);
    expect(unpriced).toBeGreaterThan(0);
  });

  it('marks enabler moves by affix text', () => {
    const moves = gearMoves(state('hoa', 100, [MAUL, HELM]), ctx(100)).filter(m => m.kind === 'craft');
    const re = /Reservation|Support Skill.*Level|\+\d+ to .*Skill Level|Core Talent|talent/i;
    for (const m of moves) expect(!!m.enabler).toBe(re.test(m.label));
    expect(moves.some(m => m.enabler)).toBe(true);
  });

  it('emits the rare base upgrade of each slot as a gear move at the base level', () => {
    const moves = gearMoves(hoa60(), ctx(60)).filter(m => m.kind === 'gear');
    const mh = moves.find(m => (m.changes[0] as { slot?: string }).slot === 'mainHand')!, hel = moves.find(m => (m.changes[0] as { slot?: string }).slot === 'helmet')!;
    expect(swapped(mh).baseId).toBe(1013);                  // Vanquisher Mallet L59 (Platinum Mallet is L64)
    expect(mh.minLevel).toBe(59);
    expect(mh.costFE).toBe(0);
    expect(swapped(mh).modifiers.baseAttr.length).toBeGreaterThan(0);
    expect(hel.minLevel).toBeGreaterThan(1);
    expect(hel.minLevel).toBeLessThanOrEqual(60);
    expect(gearMoves(state('hoa', 50, [MAUL]), ctx(50)).some(m => m.kind === 'gear')).toBe(false);
  });

  it('uniques come from config_item_gold joined to etor by English name, gated at the base level', () => {
    const gold = rows('config_item_gold'), lang = rows('lang_en'), base = rows('config_item_base');
    const [gid, g] = Object.entries<any>(gold).find(([k, r]) => lang[`item_gold|name|${k}`] && base[r.i8]?.i20 === 14 && base[r.i8].i3c > 1 && base[r.i8].i3c <= 60)!;
    const name = lang[`item_gold|name|${gid}`], level = base[g.i8].i3c;
    const mine = (ms: Move[]) => ms.filter(m => m.kind === 'unique' && m.label.includes(`Unique ${name} `));
    const priced = mine(gearMoves(state('hoa', 60, [CHEST]), ctx(60, { [name]: 7 })));
    expect(priced.length).toBeGreaterThan(0);
    expect(priced[0]).toMatchObject({ costFE: 7, minLevel: level });
    expect(swapped(priced[0]).baseId).toBe(g.i8);
    expect(mine(gearMoves(state('hoa', 60, [CHEST]), ctx(60, {})))[0].costFE).toBeNull();
    expect(mine(gearMoves(state('hoa', level - 1, [CHEST]), ctx(level - 1, { [name]: 7 })))).toEqual([]);
  });

  it('a base upgrade is a new item: its crafted affixes are paid again, the old fixed affix stays behind', () => {
    const craft = gearMoves(hoa60(), ctx(60)).find(m => m.kind === 'craft' && (m.changes[0] as any).slot === 'helmet' && swapped(m).modifiers.prefix)!;
    const p = swapped(craft).modifiers.prefix.at(-1);
    const helm = { ...HELM, affixes: [{ id: p.id, dyn: p.dynArgs, list: 'PrefixInfoList' }, { id: 660002, dyn: [35], list: 'FixedBaseAffix' }] };
    const up = gearMoves(state('hoa', 60, [MAUL, helm]), ctx(60)).find(m => m.label.startsWith('Rare base') && (m.changes[0] as any).slot === 'helmet')!;
    expect(up.label).toContain('1 affix(es) crafted again');
    expect(up.costFE).toBeCloseTo(craft.costFE!);
    expect(swapped(up).modifiers.prefix).toEqual([p]);
    expect(swapped(up).modifiers.fixed).toBeUndefined();
  });

  it('a unique takes no craft and no base upgrade, but can still be replaced by another unique', () => {
    const goldGroup = Number(Object.keys((Object.values(rows('config_item_gold'))[0] as any).m88)[0]);
    for (const chest of [{ ...CHEST, itemId: 'guide-unique-1' }, { ...CHEST, affixes: [{ id: goldGroup * 10, dyn: [1] }] }]) {
      const ms = gearMoves(state('hoa', 100, [chest]), ctx(100)).filter(m => (m.changes[0] as any).slot === 'chest');
      expect(ms.filter(m => m.kind === 'craft' || m.label.startsWith('Rare base'))).toEqual([]);
      expect(ms.some(m => m.kind === 'unique')).toBe(true);
    }
    expect(gearMoves(state('hoa', 100, [CHEST]), ctx(100)).some(m => m.kind === 'craft')).toBe(true);
  });

  it('a unique carries its base item name (the unique name stays in the label), and applies through dps-debug', () => {
    const lang = rows('lang_en'), l = loadout(L100);
    const ms = gearMoves(state('hoa', 100, l.gear), ctx(100)).filter(m => m.kind === 'unique');
    expect(ms.length).toBeGreaterThan(0);
    for (const m of ms) expect(swapped(m).baseName).toBeTruthy();
    for (const m of ms) expect(swapped(m).baseName).toBe(lang[`item_base|name|${swapped(m).baseId}`]);
    expect(() => applyAll(l, ms[0], GROUND.hoa)).not.toThrow();
  });

  it('a unique whose base has no lang name is not offered and is named in notSearched', async () => {
    const m0 = gearMoves(state('hoa', 100, [CHEST]), ctx(100)).find(m => m.kind === 'unique')!;
    const bid = swapped(m0).baseId, uname = m0.label.replace(/^Unique (.*) in \w+$/, '$1');
    vi.resetModules();   // fresh pin + gear modules, so the stubbed lang table never reaches the other tests
    const pin = await import('../src/pin'), fresh = await import('../src/candidates/gear');
    delete pin.table<{ rows: Record<string, string> }>('lang_en').rows[`item_base|name|${bid}`];
    const c = ctx(100), ms = fresh.gearMoves(state('hoa', 100, [CHEST]), c);
    expect(ms.some(m => m.label === m0.label)).toBe(false);
    expect([...c.notSearched]).toContain(`unique ${uname}: base ${bid} has no lang name; not offered`);
  });

  it('Bing1 weapon rule: iceShot offers bow-family weapons only, hoa two-handed hammers/mauls only', () => {
    // the compendium lacks only the starter 'Aspiration' weapons
    const compendium = (bs: { name: string }[]) => new Set(bs.filter(b => !b.name.startsWith('Aspiration')).map(b => family[b.name]));
    const ice = basesFor('mainHand', 100, 'iceShot'), hoa = basesFor('mainHand', 100, 'hoa');
    expect(compendium(ice)).toEqual(new Set(['bow', 'crossbow', 'pistol', 'musket', 'fire_cannon']));
    expect(compendium(hoa)).toEqual(new Set(['two-handed_hammer']));
    expect(basesFor('mainHand', 60, 'hoa').every(b => b.level <= 60)).toBe(true);
    const bow = ice[0], c = ctx(60);
    const g = gearMoves(state('hoa', 60, [item('mainHand', bow.baseId, bow.name)]), c);
    expect(g.filter(m => (m.changes[0] as { slot?: string }).slot === 'mainHand')).toEqual([]);   // a bow is not a hoa weapon
    expect([...c.notSearched].some(x => /weapon rule/.test(x))).toBe(true);
  });

  it('armor bases keep to the slot and line', () => {
    const str = basesFor('helmet', 100, 'hoa', 70);
    expect(str.length).toBeGreaterThan(5);
    expect(basesFor('helmet', 100, 'hoa').length).toBeGreaterThan(str.length);
  });

  const ALL = () => state('hoa', 100, [item('helmet', 3600, 'h'), item('gloves', 3300, 'g'), item('boots', 5000, 'b'), CHEST,
    item('necklace', 1, 'n'), item('belt', 1, 'b'), item('ring1', 1, 'r')]);
  const goldAt100 = () => {
    const gold = rows('config_item_gold'), lang = rows('lang_en'), base = rows('config_item_base'), rolls = rows('config_modifier_rolls');
    const keys = ['m88', 'ma8', 'mc8', 'me8', 'm108', 'm128', 'm148', 'm168'];
    return Object.entries<any>(gold).filter(([k, r]) => lang[`item_gold|name|${k}`] && base[r.i8]?.i3c <= 100 && [12, 13, 14, 15, 16, 17, 18].includes(base[r.i8].i20))
      .map(([k, r]) => ({ name: lang[`item_gold|name|${k}`] as string, rolls,
        groups: keys.flatMap(x => (Object.keys(r[x] ?? {}).length === 1 ? Object.keys(r[x]) : [])).map(Number),
        pooled: keys.filter(x => Object.keys(r[x] ?? {}).length > 1) }));
  };

  it('a unique with random affix slots is offered with its fixed affixes only, the slots named', () => {
    const c = ctx(100), enamor = gearMoves(ALL(), c).find(x => x.kind === 'unique' && x.label.startsWith('Unique Enamor '))!;
    expect((swapped(enamor).modifiers.prefix as { id: number }[]).map(x => x.id)).toEqual([80935000]);
    expect([...c.notSearched].some((n) => /^unique Enamor: random affix slots \(ma8: 1 of \d+, mc8: 1 of \d+, me8: 1 of \d+, m108: 1 of \d+\) not priced; offered with its fixed affixes only$/.test(n))).toBe(true);
  });
  it('a unique uses tier digit 0 at the midpoint of its rolls', () => {
    const u = goldAt100().find(g => g.groups.length && g.groups.every(x => g.rolls[x * 10]) && g.groups.some(x => g.rolls[x * 10 + 1]))!;
    const m = gearMoves(ALL(), ctx(100)).find(x => x.kind === 'unique' && x.label.startsWith(`Unique ${u.name} `))!;
    const mods = swapped(m).modifiers.prefix as { id: number; dynArgs: number[] }[];
    expect(mods.map(x => x.id)).toEqual(u.groups.map(x => x * 10));
    const x = u.groups.find(x => u.rolls[x * 10 + 1])!, got = mods.find(y => y.id === x * 10)!;
    expect(got.dynArgs).toEqual(u.rolls[x * 10].map((r: number[]) => (r[0] + r[1]) / 2));
  });

  it('a unique with an unresolved modifier group is not offered and is named in notSearched', () => {
    const u = goldAt100().find(g => g.groups.some(x => !g.rolls[x * 10]))!;
    const c = ctx(100), ms = gearMoves(ALL(), c);
    expect(ms.some(x => x.label.startsWith(`Unique ${u.name} `))).toBe(false);
    expect([...c.notSearched].some(x => x.startsWith(`unique ${u.name}:`))).toBe(true);
  });

  it('crafts roll at the range midpoint and skip tiers whose library text disagrees with the catalog', async () => {
    const ids = (await import('../src/data/affix-ids.json')).default, rolls = rows('config_modifier_rolls');
    const c = ctx(100), ms = gearMoves(hoa100(), c).filter(m => m.kind === 'craft');
    const bad = new Set([...ids.mismatches, ...ids.rollMismatches].map(Number));
    for (const m of ms) {
      const a = [...(swapped(m).modifiers.prefix ?? []), ...(swapped(m).modifiers.suffix ?? [])].at(-1);
      expect(bad.has(a.id)).toBe(false);
      expect(a.dynArgs).toEqual(rolls[a.id].map((r: number[]) => (r[0] + r[1]) / 2));
    }
    expect([...c.notSearched].some(x => /library text ranges differ/.test(x))).toBe(true);
  });

  it('a base swap replaces the base lists and leaves off a crafted line the new base cannot take', () => {
    const st = state('hoa', 60, [{ ...MAUL, affixes: [{ id: 111, dyn: [1], list: 'BAffixInfoList' }, { id: 222, dyn: [2], list: 'PrefixInfoList' }, { id: 510002, dyn: [1], list: 'BaseAttrInfoList' }] }]);
    const mh = swapped(gearMoves(st, ctx(60)).find(m => m.kind === 'gear')!);
    expect(mh.modifiers.baseAffix).toBeUndefined();
    expect(mh.modifiers.prefix).toBeUndefined();
    expect(mh.modifiers.baseAttr.some((x: { id: number }) => x.id === 510002)).toBe(false);
    expect(mh.level).toBe(60);
  });

  it('a swapped base carries exactly the base-attribute ids of a real bag dump (base 1019) and the implicit gap is named', () => {
    const dump = JSON.parse(readFileSync(`${PIN}/game/bagdump-1019-20261013-061901-4.json`, 'utf8'));
    const real = (dump.modifiers['baseAttr(BaseAttrAffix)'] ?? dump.modifiers.baseAttr).map((m: { id: number }) => m.id);
    const c = ctx(100), mh = gearMoves(state('hoa', 100, [MAUL]), c).find(m => m.kind === 'gear' && (m.changes[0] as { slot?: string }).slot === 'mainHand')!;
    expect(swapped(mh).baseId).toBe(1019);
    expect(swapped(mh).modifiers.baseAttr.map((m: { id: number }) => m.id)).toEqual(real);
    expect(swapped(mh).modifiers.baseAffix).toBeUndefined();
    expect([...c.notSearched].some(x => /rolled base implicit \(BAffixInfoList\) not modelled/.test(x))).toBe(true);
  });
});

describe('whiteBaseMoves', () => {
  it("a worn item can be swapped for the slot's best white base: free, a reconfiguration; never the weapon, never a white base already worn", () => {
    const chest = basesFor('chest', 90, 'hoa').at(-1)!, helm = basesFor('helmet', 90, 'hoa').at(-1)!;
    const moves = whiteBaseMoves(state('hoa', 90, [MAUL, CHEST, item('helmet', helm.baseId, helm.name)]), ctx(90));
    expect(moves.map(m => (m.changes[0] as { slot: string }).slot)).toEqual(['chest']);
    expect(moves[0]).toMatchObject({ kind: 'gear', acquisition: false, costFE: 0, market: 'drop', minLevel: chest.level,
      label: `Swap Brute's Chestguard for a white ${chest.name} (chest)` });
    const it2 = swapped(moves[0]);
    expect(it2).toMatchObject({ baseId: chest.baseId, baseName: chest.name, level: chest.level });
    expect(Object.keys(it2.modifiers)).toEqual(['baseAttr']);
    expect(it2.modifiers.baseAttr.map((m: { id: number }) => m.id)).toEqual(rows('config_item_base')[chest.baseId].a1b8);
  });
});
