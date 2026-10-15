/** Applies a move's changes to a loadout through dps-debug's own applyGearChange / applyOtherChange (the catalog parse is ~168 MB: it is loaded once per test file). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCatalog } from '@dps/test/core/catalog';
import { applyGearChange, applyOtherChange } from '@dps/test/unit/whatif-lib';
import { pinRoot } from '../src/pin';
import type { Move, PriceBook } from '../src/types';

type Cat = ReturnType<typeof loadCatalog>;
let cat: Cat | undefined;
export const catalog = (): Cat => (cat ??= loadCatalog('0x6aa39847', join(pinRoot(), 'catalog')));
export const loadout = (p: string) => JSON.parse(readFileSync(join(pinRoot(), p), 'utf8'));
/** state captures whose hero level / world ground the figure of the owner's L100 (HoA) and L94 (Ice Shot) loadouts */
export const GROUND = { hoa: 'L100.state-20261013-165251', iceShot: 'L94.state-20261013-160318' };
export const L100 = 'game/loadout_l100-20261013-165302.json';
export const L94 = 'game/loadout_l94-20261013-160234.json';

/** the move's changes in order; throws dps-debug's named stop if one is rejected */
export function applyAll(l: Record<string, unknown>, m: Move, ground: string): Record<string, unknown> {
  return m.changes.reduce((acc, ch) =>
    (ch.kind === 'gear' && ch.action === undefined ? applyGearChange(catalog(), acc as never, ch, ground) : applyOtherChange(catalog(), acc as never, ch as never, ground)).loadout as never, l);
}

/** in-test price book: a fixed price per English name, null for any other */
export const fakePrices = (p: Record<string, number>): PriceBook => ({ season: 'test', fetchedAt: 'test', price: (k) => (typeof k === 'string' ? p[k] ?? null : null) });
