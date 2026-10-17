import { describe, expect, it } from 'vitest';
import { craftOptions, topRoll, type LibraryAffix } from '../src/craft';

const tier = (t: string, lvl: number, w: number, id: string, text = `+(${lvl}-${lvl + 5})% X`) =>
  ({ tier: t, text, requiredLevel: lvl, weight: w, tierAffixId: id });
const lib: LibraryAffix[] = [
  { slot: 'Ring', grade: 'Basic', side: 'Prefix', affixId: '1', weight: 30, effect: 'a',
    tiers: [tier('T1', 80, 100, '101'), tier('T2', 60, 300, '102'), tier('T3', 1, 600, '103')] },
  { slot: 'Ring', grade: 'Basic', side: 'Prefix', affixId: '5', weight: 70, effect: 'e', tiers: [tier('T1', 1, 10, '501')] },
  { slot: 'Ring', grade: 'Basic', side: 'Suffix', affixId: '2', weight: 70, effect: 'b', tiers: [tier('T1', 1, 10, '201')] },
  { slot: 'Ring', grade: 'Ultimate', side: 'Suffix', affixId: '3', weight: 5, effect: 'c', tiers: [tier('T1', 1, 10, '301')] },
  { slot: 'Belt', grade: 'Basic', side: 'Prefix', affixId: '4', weight: 1, effect: 'd', tiers: [tier('T1', 1, 1, '401')] },
];

describe('craftOptions', () => {
  it('expected embers = 1 / (P(affix | grade, side) x P(tier >= t | allowed tiers)): a craft rolls on the slot you pick, from its side (owner, 2026-10-17)', () => {
    const o = craftOptions(lib, 'Ring', 100);
    const get = (id: string) => o.find(x => x.tierAffixId === id)!;
    expect(get('101').expectedEmbers).toBeCloseTo(1 / (0.3 * 0.1));         // 30/100 of the Basic prefixes x 100/1000
    expect(get('102').expectedEmbers).toBeCloseTo(1 / (0.3 * 0.4));         // T1+T2 = 400/1000
    expect(get('103').expectedEmbers).toBeCloseTo(1 / 0.3);                 // every tier = 1
    expect(get('201').expectedEmbers).toBeCloseTo(1);                       // the only Basic suffix
    expect(get('301').expectedEmbers).toBeCloseTo(1);                       // the only Ultimate affix
    expect([get('101').ember, get('301').ember]).toEqual(['Precious Ember', 'Ultimate Ember']);
  });
  it('excludes tiers above the item level and renormalises over the allowed ones', () => {
    const o = craftOptions(lib, 'Ring', 60);
    expect(o.find(x => x.tierAffixId === '101')).toBeUndefined();
    expect(o.every(x => x.requiredLevel <= 60)).toBe(true);
    expect(o.find(x => x.tierAffixId === '102')!.expectedEmbers).toBeCloseTo(1 / (0.3 * (300 / 900)));
  });
  it('drops an affix with no allowed tier, and other gear types', () => {
    expect(craftOptions(lib, 'Ring', 1).some(x => x.affixId === '1' && x.tier !== 'T3')).toBe(false);
    expect(craftOptions(lib, 'Belt', 1).map(x => x.affixId)).toEqual(['4']);
  });
  it('topRoll takes the upper end of every range', () => {
    expect(topRoll('+(12-15)% Cold Damage, (-20-118) more')).toBe('+15% Cold Damage, 118 more');
    expect(craftOptions(lib, 'Ring', 100)[0].text).toBe('+85% X');
  });
});

describe('affix-library tier ids (src/data/affix-ids.json)', () => {
  it('match dps-debug modifier ids for at least 99 percent of tiers', async () => {
    const ids = (await import('../src/data/affix-ids.json')).default;
    expect(ids.modifierMatch / ids.total, `mismatches: ${ids.mismatches.join(', ')}`).toBeGreaterThanOrEqual(0.99);
    expect(ids.rollMismatches.length).toBeGreaterThan(0);   // listed, and excluded from crafting
  });
  it('records the pin by commit, not by a machine path', async () => {
    expect((await import('../src/data/affix-ids.json')).default.pin).toMatch(/^[0-9a-f]{40}$/);
  });
});
