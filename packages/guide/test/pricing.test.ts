import { describe, expect, it, vi } from 'vitest';
import history from './fixtures/etor-history-mini.json';
import items from './fixtures/etor-items-mini.json';
import live from './fixtures/etor-snapshot-live.json';
import { fetchSeason, fetchSnapshot, historyBook, snapshotBook, withPrices, type EtorHistory, type EtorItems } from '../src/pricing';

const I = items as EtorItems, H = history as EtorHistory;
const book = historyBook(I, H);

describe('historyBook', () => {
  it('picks the window by hero level', () => {
    const h = H.items['110101']!;
    expect(book.price(110101, 60)).toBe(h.day1);
    expect(book.price(110101, 69)).toBe(h.day1);
    expect(book.price(110101, 75)).toBe(h.days1to3);
    expect(book.price(110101, 85)).toBe(h.week1);
    expect(book.price(110101, 95)).toBe(h.week2);
    expect(book.price(110101, 100)).toBe(h.week2);
  });
  it('falls back to the later window, then last', () => {
    // Cover the Sun: week2 null
    expect(book.price(112519, 95)).toBe(H.items['112519']!.last);
    const gap = { items: { '110104': { ...H.items['110104']!, days1to3: null } } };
    expect(historyBook(I, gap).price(110104, 75)).toBe(H.items['110104']!.week1);
  });
  it('name and id lookups agree; unknown name is null', () => {
    for (const lvl of [60, 75, 85, 95]) expect(book.price('Highest Glance', lvl)).toBe(book.price(110104, lvl));
    expect(book.price('highest glance', 60)).toBeNull();
    expect(book.price('No Such Item', 60)).toBeNull();
    expect(book.price(1, 60)).toBeNull();
  });
  it('1 FE placeholder with no history is null; a real price with no history is kept', () => {
    expect(book.price('God of War\'s Divinity', 60)).toBeNull();
    expect(book.price(400000, 60)).toBe(0.037);
  });
});

describe('snapshotBook', () => {
  it('ignores level and carries the season', () => {
    const s = snapshotBook(I);
    expect(s.price(110101, 60)).toBe(10.083);
    expect(s.price('Arminius Guillotine', 100)).toBe(10.083);
    expect(s.price('God of War\'s Divinity', 60)).toBeNull();
    expect([s.season, s.fetchedAt]).toEqual([I.season, I.fetchedAt]);
  });
});

describe('withPrices (your prices file)', () => {
  it('a named item costs what the file says at every level; the rest keep the book price', () => {
    const { book, unknown } = withPrices(historyBook(I, H), { 'Arminius Guillotine': 3, 'Highest Glance': 0 });
    for (const level of [60, 80, 100]) expect(book.price('Arminius Guillotine', level)).toBe(3);
    expect(book.price('Highest Glance', 70)).toBe(0);
    expect(book.price('Cover the Sun', 100)).toBe(historyBook(I, H).price('Cover the Sun', 100));
    expect(unknown).toEqual([]);
  });
  it('a name etor does not list is applied (a game name, e.g. a white base) and reported', () => {
    const { book, unknown } = withPrices(snapshotBook(I), { 'Sierra Reverberation Maul': 2 });
    expect(book.price('Sierra Reverberation Maul', 90)).toBe(2);
    expect(unknown).toEqual(['Sierra Reverberation Maul']);
  });
  it('a price that is not a number of FE (0 or more) is refused with its name', () => {
    expect(() => withPrices(snapshotBook(I), { 'Highest Glance': -1 })).toThrow(/Highest Glance/);
    expect(() => withPrices(snapshotBook(I), { 'Highest Glance': '5' as never })).toThrow(/Highest Glance/);
  });
});

describe('fetchSnapshot', () => {
  const json = (b: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(b), { status })) as unknown as typeof fetch;
  it('overlays live prices by id onto the local names, in the real { data: [{ id, price }] } shape', async () => {
    const f = json(live);
    const out = await fetchSnapshot(1501, I, f, () => new Date('2026-10-14T00:00:00Z'));
    expect(f).toHaveBeenCalledWith('https://etor-beta.710421059.xyz/etor-api/api/prices-snapshot/1501', { headers: { 'x-frontend-version': '1.0.6.2' } });
    const b = snapshotBook(out);
    expect(b.price('Arminius Guillotine', 60)).toBe(12.5);   // overlaid
    expect(b.price(110104, 60)).toBe(snapshotBook(I).price(110104, 60));   // not in the live body: stored price
    expect(out.items).toHaveLength(I.items.length);          // unknown live id 999999 has no name: dropped
    expect(out.fetchedAt).toBe('2026-10-14T00:00:00.000Z');
  });
  it('records the season it fetched, not the local files', async () => {
    expect(snapshotBook(await fetchSnapshot(1501, I, json(live))).season).toBe(I.season);
    const other = await fetchSnapshot(1999, I, json(live));
    expect(other.seasonId).toBe(1999);
    expect(snapshotBook(other).season).toBe('1999');
  });
  it('throws a clear error on a wrong body, never a TypeError', async () => {
    await expect(fetchSnapshot(1, I, json({ success: true }))).rejects.toThrow(/unexpected response/);
    await expect(fetchSnapshot(1, I, json(null))).rejects.toThrow(/unexpected response/);
    await expect(fetchSnapshot(1, I, json({ data: [null, { id: 1 }] }))).rejects.toThrow(/no usable/);
  });
  it('throws on HTTP error', async () => {
    await expect(fetchSnapshot(1, I, json({}, 500))).rejects.toThrow('500');
  });
});

describe('fetchSeason', () => {
  const json = (b: unknown, status = 200) => (async () => new Response(JSON.stringify(b), { status })) as unknown as typeof fetch;
  it('reads currentSeasonId from /player/season-status', async () => {
    expect(await fetchSeason(json({ currentSeasonId: '1501', activeSeasonIds: ['1531', '1501'] }))).toBe(1501);
  });
  it('throws clearly on a wrong body or HTTP error', async () => {
    await expect(fetchSeason(json({}))).rejects.toThrow(/currentSeasonId/);
    await expect(fetchSeason(json(null))).rejects.toThrow(/currentSeasonId/);
    await expect(fetchSeason(json({}, 503))).rejects.toThrow('503');
  });
  it('between seasons (currentSeasonId "") it says so, naming the upcoming one, instead of asking for season 0', async () => {
    await expect(fetchSeason(json({ currentSeasonId: '', activeSeasonIds: [], upcomingSeasonIds: ['1601'] }))).rejects.toThrow(/no current season.*1601/);
  });
});
