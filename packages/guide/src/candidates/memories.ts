/** Hero memory candidates: none. dps-debug's what-if (WHATIF.md) has no change form for a hero memory (loadout.heroMemories is read, never rewritten). */
import type { Generator } from '../types';

export const memoryMoves: Generator = (_s, ctx) => {
  ctx.notSearched.add('memory: dps-debug has no what-if change for hero memories (WHATIF.md forms), so memory swaps and rerolls cannot be calculated');
  return [];
};
