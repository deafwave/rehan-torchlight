import type { PriceBook } from './types';

/** Shapes of data/etor/items_<season>.json and history_<season>.json. The files carry ids/seasonId as strings and
 *  `price: null` for unpriced rows, so both are accepted. */
export interface EtorItems {
  seasonId: number | string; season: string; currency: 'FE'; fetchedAt: string;
  items: { id: number | string; name: string; category: string; price: number | null; updatedAt: string }[];
}
type Window = 'day1' | 'days1to3' | 'week1' | 'week2';
export interface EtorHistory {
  items: Record<string, { name: string; category: string; firstDay: number | string | null } & Record<Window | 'last', number | null>>;
}

export const WINDOWS: { maxLevel: number; window: Window }[] =
  [{ maxLevel: 69, window: 'day1' }, { maxLevel: 79, window: 'days1to3' }, { maxLevel: 89, window: 'week1' }, { maxLevel: 100, window: 'week2' }];
const ORDER: Window[] = ['day1', 'days1to3', 'week1', 'week2'];
const PLACEHOLDER = 1; // etor's price for an item nobody has traded

function book(snapshot: EtorItems, priceOf: (id: string, level: number, row: EtorItems['items'][number]) => number | null): PriceBook {
  const byId = new Map(snapshot.items.map((i) => [String(i.id), i]));
  const byName = new Map<string, (typeof snapshot.items)[number]>();
  for (const i of snapshot.items) if (!byName.has(i.name)) byName.set(i.name, i);
  return {
    season: snapshot.season, fetchedAt: snapshot.fetchedAt,
    category: (key) => (typeof key === 'number' ? byId.get(String(key)) : byName.get(key))?.category ?? null,
    price(key, level) {
      const row = typeof key === 'number' ? byId.get(String(key)) : byName.get(key);
      return row ? priceOf(String(row.id), level, row) : null;
    },
  };
}

/** Ideal mode: the history window for the hero level, else the next later window, else `last`. An item with no history
 *  takes its snapshot price unless that is null or the 1-FE placeholder (then unpriced). */
export function historyBook(items: EtorItems, history: EtorHistory, windows = WINDOWS): PriceBook {
  return book(items, (id, level, row) => {
    const h = history.items[id];
    if (!h) return row.price == null || row.price === PLACEHOLDER ? null : row.price;
    const w = (windows.find((x) => level <= x.maxLevel) ?? windows[windows.length - 1]).window;
    for (const k of [...ORDER.slice(ORDER.indexOf(w)), 'last' as const]) if (h[k] != null) return h[k];
    return null;
  });
}

/** Live mode: the current snapshot price (level ignored); null and the 1-FE placeholder are unpriced. */
export function snapshotBook(snapshot: EtorItems): PriceBook {
  return book(snapshot, (_id, _level, row) => (row.price == null || row.price === PLACEHOLDER ? null : row.price));
}

const API = 'https://etor-beta.710421059.xyz/etor-api/api';
const HEADERS = { 'x-frontend-version': '1.0.6.2' };

/** The current season id from `/player/season-status` (`{ currentSeasonId: "1501", ... }`). */
export async function fetchSeason(fetchImpl: typeof fetch = fetch): Promise<number> {
  const res = await fetchImpl(`${API}/player/season-status`, { headers: HEADERS });
  if (!res.ok) throw new Error(`etor season-status: HTTP ${res.status}`);
  const id = Number(((await res.json()) as { currentSeasonId?: unknown })?.currentSeasonId);
  if (!Number.isInteger(id)) throw new Error('etor season-status: no currentSeasonId in the response');
  return id;
}

/** Live prices (`/prices-snapshot/{season}` = `{ success, data: [{ id: "110101", price: 10.08, updatedAt }] }`) laid over the local items table,
 *  which supplies the names: a row the live body prices takes the live price, every other row keeps its stored one. */
export async function fetchSnapshot(season: number, local: EtorItems, fetchImpl: typeof fetch = fetch, now = () => new Date()): Promise<EtorItems> {
  const res = await fetchImpl(`${API}/prices-snapshot/${season}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`etor snapshot ${season}: HTTP ${res.status}`);
  const body = (await res.json()) as { data?: unknown };
  if (!Array.isArray(body?.data)) throw new Error(`etor snapshot ${season}: unexpected response (want { data: [{ id, price }] })`);
  const live = new Map<string, number>();
  for (const r of body.data as { id?: unknown; price?: unknown }[])
    if (r && (typeof r.id === 'string' || typeof r.id === 'number') && typeof r.price === 'number' && Number.isFinite(r.price)) live.set(String(r.id), r.price);
  if (!live.size) throw new Error(`etor snapshot ${season}: no usable { id, price } rows in the response`);
  // the book names the season it fetched: the local file's name only when it is that season's file, else the id
  return { ...local, seasonId: season, season: String(local.seasonId) === String(season) ? local.season : String(season), fetchedAt: now().toISOString(), items: local.items.map((i) => (live.has(String(i.id)) ? { ...i, price: live.get(String(i.id))! } : i)) };
}
