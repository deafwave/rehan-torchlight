/**
 * Hero trait candidates: swap the held trait of a layer for its sibling (config_hero_character: layer ic 1..3, two traits per layer, prerequisite a30 =
 * the previous layer, unlocks at hero level i18 [inf: the level column]). Tier points are not moved: the tier budget is not in the catalog.
 */
import { table } from '../pin';
import type { Generator, Move } from '../types';

interface Row { i4: number; i14: number; ic: number; i18: number; a30: number[]; s40: string }
const NAME = (row: Row, lang: Record<string, string>) => lang[row.s40] ?? String(row.i4);

export const traitMoves: Generator = (s, ctx) => {
  const rows = table<{ rows: Record<string, Row> }>('config_hero_character').rows, lang = table<{ rows: Record<string, string> }>('lang_en').rows;
  ctx.notSearched.add('trait: raising or lowering a trait tier, and filling an empty layer: the tier point budget is not in the catalog');
  const held = (s.loadout.traits ?? {}) as Record<string, number>;
  const hero = Object.keys(held).map(id => rows[id]?.i14).find(Boolean);
  if (!hero) return [];
  const all = Object.values(rows).filter(r => r.i14 === hero && r.ic > 0);
  const moves: Move[] = [];
  for (const old of all.filter(r => held[r.i4])) {
    const tier = held[old.i4];
    for (const nw of all.filter(r => r.ic === old.ic && r.i4 !== old.i4 && !held[r.i4])) {
      if (nw.i18 > ctx.level || (nw.a30.length && !nw.a30.some(p => held[p] && p !== old.i4))) continue;   // level gate; a prerequisite trait must stay held
      moves.push({
        kind: 'trait', label: `Trait ${NAME(nw, lang)} instead of ${NAME(old, lang)} (tier ${tier})`, acquisition: false, costFE: 0, minLevel: nw.i18,
        changes: [{ kind: 'multi', changes: [{ kind: 'trait', trait: old.i4, tier: 0 }, { kind: 'trait', trait: nw.i4, tier }] }],
      });
    }
  }
  return moves;
};
