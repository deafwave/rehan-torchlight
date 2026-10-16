/**
 * Pactspirit candidates: raise the StarRank (0..5; config_gen_contract_servant has a row per servant and stage) of an equipped pactspirit, as remove + equip with the
 * loadout's own promotionLevels and the contractKeys of its slot; equip an owned battle pactspirit at its owned rank (dps-debug prices a pactspirit by servant, stage
 * and contract points; promotionLevels are not read).
 */
import { join } from 'node:path';
import { openCatalog } from '@dps/guide/figure';
import { pageKeys } from '@dps/src/core/fate';
import { pinRoot, table } from '../pin';
import owned from '../data/owned-pacts.json';
import type { Generator, Move } from '../types';

interface P { servantId: number; slot?: number; rank: number; promotionLevels: number[][]; name?: string }
const MAX_RANK = 5;
/** the battle slots and the hero level each opens at (the client's PetMgr.ServantEquipSlotDataList UnlockLevel); slots 4-6 hold drop pactspirits (loot, not damage) */
const BATTLE_SLOTS: Record<number, number> = { 1: 1, 2: 36, 3: 62 };
let cat: ReturnType<typeof openCatalog> | undefined;

export const pactMoves: Generator = (s, ctx) => {
  ctx.notSearched.add(`pact: an owned battle pactspirit is equipped at its owned rank (owned-pacts.json, read from the game ${owned.readAt.slice(0, 10)}) with its slot's starting contract points (fate.ts pageKeys)`);
  ctx.notSearched.add('pact: a rank-up is not on the market (listed under unpriced with its gain, never ranked)');
  const pacts = s.loadout.pacts as P[] | undefined, keys = s.loadout.contractKeys as number[] | undefined;
  if (!pacts) return [];
  const stages = new Set(Object.values(table<{ rows: Record<string, { i4: number; i8: number }> }>('config_gen_contract_servant').rows).map(r => `${r.i4}/${r.i8}`));
  const lang = table<{ rows: Record<string, string> }>('lang_en').rows;
  const moves: Move[] = [];
  for (const p of pacts) {
    if (p.slot === undefined) continue;
    const name = lang[`servant|name|${p.servantId}`] ?? p.name ?? String(p.servantId);
    for (let rank = p.rank + 1; rank <= MAX_RANK; rank++) {
      if (!stages.has(`${p.servantId}/${rank}`)) continue;
      moves.push({
        kind: 'pact', label: `Raise ${name} (slot ${p.slot}) from rank ${p.rank} to ${rank}`, acquisition: true, costFE: null, market: 'not-on-market', minLevel: 0,
        changes: [{ kind: 'multi', changes: [{ kind: 'pact', action: 'remove', servantId: p.servantId },
          { kind: 'pact', action: 'equip', servantId: p.servantId, slot: p.slot, rank, promotionLevels: p.promotionLevels, contractKeys: (keys ?? []).filter(k => Math.floor(k / 100) === p.slot) }] }],
      });
    }
  }
  // equip an owned battle pactspirit (config_servant i8 1) at its owned rank: into the first open battle slot, else in place of each held one
  const servant = table<{ rows: Record<string, { i8: number }> }>('config_servant').rows, held = new Set(pacts.map(p => p.servantId));
  const open = Object.keys(BATTLE_SLOTS).map(Number).filter(slot => !pacts.some(p => p.slot === slot));
  for (const o of owned.pets) {
    if (held.has(o.servantId) || servant[o.servantId]?.i8 !== 1) continue;
    const name = lang[`servant|name|${o.servantId}`] ?? String(o.servantId);
    for (const slot of open.length ? [open[0]] : Object.keys(BATTLE_SLOTS).map(Number)) {
      const out = pacts.find(p => p.slot === slot), outName = out && (lang[`servant|name|${out.servantId}`] ?? String(out.servantId));
      moves.push({
        kind: 'pact', label: `Equip ${name} (level ${o.rank + 1}, owned) in battle slot ${slot}${outName ? ` instead of ${outName}` : ''}`, acquisition: true, costFE: 0, market: 'drop',
        costNote: "owned (read from your game); its slot's contract points as the page starts (no Fates installed)", minLevel: BATTLE_SLOTS[slot],
        changes: [{ kind: 'multi', changes: [...(out ? [{ kind: 'pact' as const, action: 'remove' as const, servantId: out.servantId }] : []),
          { kind: 'pact' as const, action: 'equip' as const, servantId: o.servantId, slot, rank: o.rank, promotionLevels: [], contractKeys: pageKeys(cat ??= openCatalog(join(pinRoot(), 'catalog')), slot, []) }] }],
      });
    }
  }
  return moves;
};
