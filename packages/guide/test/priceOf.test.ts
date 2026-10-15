import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { coverage, costOf, priceOfBase, priceOfGold } from '../src/priceOf';
import { snapshotBook, type EtorItems } from '../src/pricing';
import { table } from '../src/pin';
import type { Move } from '../src/types';

const items: EtorItems = JSON.parse(readFileSync(fileURLToPath(new URL('../../../data/etor/items_1501.json', import.meta.url)), 'utf8'));
const book = snapshotBook(items);
const lang = table<{ rows: Record<string, string> }>('lang_en').rows;
const first = (test: (i: EtorItems['items'][number]) => boolean, key = 'item_base') => {
  const row = items.items.find(i => test(i) && i.price !== null && i.price !== 1 && lang[`${key}|name|${i.id}`] === i.name);
  if (!row) throw new Error('no etor row joins the catalog by name');
  return row;
};

describe('priceOfBase', () => {
  it.each([
    ['kismet', (i: { name: string }) => i.name.startsWith('Kismet: ')],
    ['fate', (i: { category: string }) => i.category === 'Fate'],
    ['prism', (i: { category: string }) => i.category === 'Ethereal Prism'],
    ['divinity slate', (i: { category: string }) => i.category === 'Divinity Pact'],
  ])('prices a %s through its base id', (_, test) => {
    const row = first(test as never);
    expect(priceOfBase(book, Number(row.id), 80)).toEqual({ fe: row.price, etorName: row.name });
  });
  it('prices a legendary through its item_gold id', () => {
    const row = first(i => i.category === 'Legendary Gear', 'item_gold');
    expect(priceOfGold(book, Number(row.id), 80)).toEqual({ fe: row.price, etorName: row.name });
  });
  it('the shipped aliases join the legendaries etor lists under another name', () => {
    expect(priceOfGold(book, 113252, 80)).toEqual({ fe: items.items.find(i => i.id === '113252')!.price, etorName: '母神围场' });
  });
  it('resolves an alias to the etor name, and an unknown base to null', () => {
    const row = first(i => i.category === 'Fate'), name = lang[`item_base|name|${row.id}`];
    const stub = { ...book, price: (k: number | string) => (k === 'Etor Spelling' ? 7 : null) };   // etor spells the item differently
    expect(priceOfBase(stub, Number(row.id), 80).fe).toBeNull();
    expect(priceOfBase(stub, Number(row.id), 80, { [name]: { etor: 'Etor Spelling', why: 'same base id' } })).toEqual({ fe: 7, etorName: 'Etor Spelling' });
    expect(priceOfBase(book, 999999999, 80)).toEqual({ fe: null, etorName: null });
  });
});

describe('costOf', () => {
  it('drop applies to bare bases and normal gems only', () => {
    const normal = items.items.find(i => i.category === 'Support Skill' && i.price === null)!, noble = items.items.find(i => i.category === 'Noble Support Skill' && i.price === null);
    expect(costOf(book, normal.name, 80, 'gem')).toEqual({ costFE: 0, market: 'drop', costNote: 'drop' });
    if (noble) expect(costOf(book, noble.name, 80, 'gem').costFE).toBeNull();
    expect(costOf(book, 'Some White Base', 80, 'bare')).toMatchObject({ costFE: 0, market: 'drop' });
    expect(costOf(book, 'Some White Base', 80).costFE).toBeNull();
    expect(costOf(book, 'No Such Gem (Noble)', 80, 'gem').costFE).toBeNull();   // no etor row: the game name carries the tier
    expect(costOf(book, 'Raid', 80, 'gem')).toMatchObject({ costFE: 0, market: 'drop' });   // normal support etor does not list at all
    const row = first(i => i.category === 'Fate');
    expect(costOf(book, row.name, 80, 'bare')).toEqual({ costFE: row.price, market: 'tradeable' });
  });
});

describe('coverage', () => {
  it('counts priced / drop / unpriced / not-on-market per kind', () => {
    const m = (kind: Move['kind'], costFE: number | null, market?: Move['market']) => ({ kind, costFE, market }) as Move;
    expect(coverage([m('gear', 5), m('gear', 0, 'drop'), m('gear', null), m('pact', null, 'not-on-market'), m('trait', 0)])).toEqual({
      gear: { priced: 1, drop: 1, unpriced: 1, notOnMarket: 0 }, pact: { priced: 0, drop: 0, unpriced: 0, notOnMarket: 1 }, trait: { priced: 1, drop: 0, unpriced: 0, notOnMarket: 0 },
    });
  });
});
