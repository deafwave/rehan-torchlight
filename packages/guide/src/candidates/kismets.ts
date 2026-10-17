/**
 * Kismet candidates on the pactspirit page: socket on a free point, replace, remove, and Undetermined Fate install / remove (UF1).
 * Kismets: item_tattoo rows with one Modifier; a kismet's size is TattooSize 1 = a kind-1 (small) point, absent = kind 2 (middle) (UF1 [data], 12 of 12 on the Pro Build).
 * Roll = the midpoint of each catalog range. A Fate's rolled ExtraContractPoints are the server's: only lists the owner's loadout already shows are offered.
 */
import { fateExtraPoints } from '@dps/src/core/fate';
import type { Catalog } from '@dps/src/types';
import { table } from '../pin';
import { priceOfBase } from '../priceOf';
import type { Change, GenCtx, Generator, Move, State } from '../types';

const rows = (f: string) => table<{ rows: Record<string, any> }>(f).rows;   // eslint-disable-line @typescript-eslint/no-explicit-any
type K = { modifierId: number | null; servantId: number | null; node: number; rolls: number[]; baseId?: number; extraContractPoints?: number[] };
const SMALL = 1, MIDDLE = 2, SLOT = 4, FATE_TYPE = 500;
let pointsCat: Catalog | undefined;
const catalog = (): Catalog => pointsCat ??= { pe: '0x6aa39847', tables: { config_contract_point: rows('config_contract_point') } } as unknown as Catalog;

/** a contract point as the page shows it: `<pact> <group>-<place>`, three points to a group along the path (config_contract_point i18: 101 102 107 | 103 104 108 | ...) */
export const pointName = (n: number, pact?: string): string => {
  const i = (rows('config_contract_point')[n]?.i18 as number) - 1;
  return `${pact ? `${pact} ` : ''}${Math.floor(i / 3) + 1}-${(i % 3) + 1}`;
};

interface Cand { level: number; baseId: number; name: string; kind: number; modifierId: number; rolls: number[] }
function candidates(): Cand[] {
  const base = rows('config_item_base'), tat = rows('lua_config_item_tattoo'), mod = rows('config_modifier'), rolls = rows('config_modifier_rolls'), lang = rows('lang_en');
  const seen = new Set<number>();   // one candidate per modifier (several bases can carry the same one), in catalog order
  return Object.values(tat).filter(t => t.TattooType === undefined && t.Modifier?.length === 1 && mod[t.Modifier[0]] && lang[`item_base|name|${t.Id}`])
    .filter(t => !seen.has(t.Modifier[0]) && seen.add(t.Modifier[0]))
    .map(t => ({ level: (base[t.Id]?.i3c ?? 0) as number, baseId: t.Id, name: lang[`item_base|name|${t.Id}`] as string, kind: t.TattooSize === 1 ? SMALL : MIDDLE, modifierId: t.Modifier[0] as number,
      rolls: ((rolls[t.Modifier[0]] ?? []) as number[][]).map(r => (r[0] + r[1]) / 2) }));
}

export const kismetMoves: Generator = (s: State, ctx: GenCtx): Move[] => {
  const ns = ctx.notSearched, l = s.loadout as { kismets?: K[]; contractKeys?: number[]; pacts?: { slot?: number; name?: string }[] };
  ns.add('kismet: big points, secret points without a Fate, and the order of equivalent free points in one area are not searched (the first free point of each area and size stands for the rest)');
  ns.add("kismet: a kismet / fate costs its etor price by its game item name (priceOfBase); the owner's own kismet is not credited when it is replaced");
  if (!l.kismets || !l.contractKeys) { ns.add('kismet: the loadout has no kismets / contractKeys'); return []; }
  if (l.kismets.some(k => k.servantId !== null)) { ns.add('kismet: the loadout addresses kismets by servant page node (the planner file), not by contract point'); return []; }
  const cp = rows('config_contract_point'), lang = rows('lang_en'), keys = new Set(l.contractKeys);
  const equipped = new Set((l.pacts ?? []).map(p => p.slot));
  const pt = (n: number) => pointName(n, (l.pacts ?? []).find(p => p.slot === Math.floor(n / 100))?.name ?? `pactspirit ${Math.floor(n / 100)}`);
  const at = new Map(l.kismets.map(k => [k.node, k]));
  const kindOf = (n: number): number => cp[n]?.i10;
  const moves: Move[] = [];
  const price = (baseId: number) => priceOfBase(ctx.prices, baseId, ctx.level).fe;
  const socketChange = (c: Cand, point: number, action: 'socket' | 'replace'): Change => ({ kind: 'kismet', action, point, modifierId: c.modifierId, rolls: c.rolls });

  const onPage = [...keys].filter(n => equipped.has(Math.floor(n / 100)));
  const occupied = onPage.filter(n => at.has(n) && at.get(n)!.modifierId !== null && [SMALL, MIDDLE].includes(kindOf(n)));
  const seenFree = new Set<string>();
  const free = onPage.filter(n => !at.has(n) && [SMALL, MIDDLE].includes(kindOf(n))).filter(n => {
    const g = `${Math.floor(n / 100)}/${kindOf(n)}`;
    return seenFree.has(g) ? false : (seenFree.add(g), true);
  });
  for (const c of candidates().filter(x => x.level <= ctx.level)) {
    for (const p of free) if (c.kind === kindOf(p)) moves.push({ kind: 'kismet', label: `Socket ${c.name} on ${pt(p)}`, acquisition: true, costFE: price(c.baseId), minLevel: c.level, changes: [socketChange(c, p, 'socket')] });
    for (const p of occupied) if (c.kind === kindOf(p) && at.get(p)!.modifierId !== c.modifierId)
      moves.push({ kind: 'kismet', label: `Replace the kismet on ${pt(p)} with ${c.name}`, acquisition: true, costFE: price(c.baseId), minLevel: c.level, changes: [socketChange(c, p, 'replace')] });
  }
  for (const p of occupied) moves.push({ kind: 'kismet', label: `Remove the kismet on ${pt(p)}`, acquisition: false, costFE: 0, minLevel: 0, changes: [{ kind: 'kismet', action: 'remove', point: p }] });

  // Undetermined Fates (UF1): the roll is the server's, so only (base, ExtraContractPoints) pairs the loadout already shows are installed
  const fates = l.kismets.filter(k => k.modifierId === null && k.extraContractPoints);
  const fateName = (id: number) => lang[`item_base|name|${id}`] as string;
  const tat = rows('lua_config_item_tattoo');
  const lists = new Map(fates.map(f => [JSON.stringify([f.baseId, f.extraContractPoints]), f]));
  for (const p of onPage.filter(n => !at.has(n) && kindOf(n) === SLOT))
    for (const f of lists.values()) {
      if (tat[f.baseId!]?.TattooType !== FATE_TYPE) continue;
      moves.push({ kind: 'kismet', label: `Install ${fateName(f.baseId!)} (extra points ${f.extraContractPoints}) on ${pt(p)}`, acquisition: true, costFE: price(f.baseId!),
        minLevel: 0, enabler: true, changes: [{ kind: 'fate', action: 'install', point: p, baseId: f.baseId!, extra: f.extraContractPoints! }] });
    }
  for (const f of fates) {
    if (fateExtraPoints(catalog(), f.node, f.extraContractPoints!).some(n => at.has(n))) continue;   // its extra points hold kismets: remove those first
    moves.push({ kind: 'kismet', label: `Remove the Undetermined Fate on ${pt(f.node)}`, acquisition: false, costFE: 0, minLevel: 0, enabler: true,
      changes: [{ kind: 'fate', action: 'remove', point: f.node }] });
  }
  return moves;
};
