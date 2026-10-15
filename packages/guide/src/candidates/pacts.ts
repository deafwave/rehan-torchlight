/**
 * Pactspirit candidates: raise the StarRank (0..5; config_gen_contract_servant has a row per servant and stage) of an equipped pactspirit, as remove + equip with the
 * loadout's own promotionLevels and the contractKeys of its slot. Swapping in another servant is not offered: its promotionLevels and ownership are not known.
 */
import { table } from '../pin';
import type { Generator, Move } from '../types';

interface P { servantId: number; slot?: number; rank: number; promotionLevels: number[][]; name?: string }
const MAX_RANK = 5;

export const pactMoves: Generator = (s, ctx) => {
  ctx.notSearched.add('pact: equipping a different pactspirit: its promotionLevels and whether the owner has it are not known');
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
  return moves;
};
