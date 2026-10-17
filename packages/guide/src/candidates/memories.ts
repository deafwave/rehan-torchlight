/** Hero memory candidates in ideal / advise: none (`guide plan` levels and rerolls worn memories: plan.ts memoryCands). */
import type { Generator } from '../types';

export const memoryMoves: Generator = (_s, ctx) => {
  ctx.notSearched.add('memory: levelling and rerolling a worn memory is priced by `guide plan` only; a memory swap is not searched');
  return [];
};
