import { describe, expect, it } from 'vitest';
import { dumpToItem } from '@dps/src/core/whatif';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pinRoot, table } from '../src/pin';
import { goldOf, targetMoves } from '../src/candidates/target';
import type { Move, Skill } from '../src/types';
import { createEvaluator } from '../src/engine/pool';
import { applyPatch } from '../src/patches';
import { realSkip } from './real';
import { GROUND, L100, applyAll, fakePrices, loadout } from './apply';

const l100 = loadout(L100);
const gen = (l: Record<string, unknown>, skill: Skill = 'hoa', prices: Record<string, number> = {}) => {
  const notSearched = new Set<string>();
  return { moves: targetMoves({ loadout: l, owned: [], fe: 0, level: 100, skill }, { prices: fakePrices(prices), level: 100, notSearched }), notSearched };
};
const { moves, notSearched } = gen(l100);
const of = (k: string) => moves.filter(m => m.kind === k);
const applied = (m: Move) => { try { applyAll(l100, m, GROUND.hoa); return null; } catch (e) { return (e as Error).message; } };

describe('targetMoves', () => {
  it('offers gear and pacts as enabler acquisitions', () => {
    expect(of('gear').length).toBeGreaterThan(0);
    expect(of('pact').length).toBe(5);   // 19330 is already held in another slot
    expect(moves.every(m => m.acquisition && m.enabler && /^Target[: ]/.test(m.label))).toBe(true);
  });
  it('pacts are not on the market and unpriced even when etor names them', () => {
    expect(of('pact').every(m => m.costFE === null && m.market === 'not-on-market')).toBe(true);
  });
  it('every gear and pact move applies through dps-debug', () => {
    for (const m of [...of('gear'), ...of('pact')]) expect(applied(m), m.label).toBeNull();
  });
  it('a held piece is not offered again; kismets appear once their pact is held', () => {
    expect(of('kismet')).toEqual([]);
    const g = of('gear')[0], p = of('pact');
    const after = [g, ...p].reduce((l, m) => applyAll(l, m, GROUND.hoa), l100);
    const again = gen(after).moves;
    expect(again.find(m => m.label === g.label)).toBeUndefined();
    expect(again.filter(m => m.kind === 'pact').map(m => m.label.replace(/ \(.*/, ''))).toEqual(['Target: Twilight Sparks']);   // freed once slot 6 holds another servant
    expect(of('pact').some(m => /Twilight Sparks/.test(m.label))).toBe(false);
    const ks = again.filter(m => m.kind === 'kismet');
    expect(ks.length).toBeGreaterThan(0);
    for (const m of ks) expect(() => applyAll(after, m, GROUND.hoa), m.label).not.toThrow();
  });
  it('names slates, memories and vorax as not searched', () => {
    expect([...notSearched].some(n => /slates/.test(n)) && [...notSearched].some(n => /hero memories/.test(n))).toBe(true);
  });
  it('Ice Shot states get no target moves', () => {
    expect(gen(loadout('game/loadout_l94-20261013-160234.json'), 'iceShot').moves).toEqual([]);
  });
  const tg = JSON.parse(readFileSync(join(pinRoot(), 're/evidence/loadout_probuild-hanshansi-bing.json'), 'utf8')) as { gear: { label: string; affixes: { id: number; dyn: number[] }[] }[] };
  const pairs = (a: { id: number; dyn: number[] }[]) => JSON.stringify(a.map(x => [x.id, x.dyn]).sort());
  const gearItem = (m: Move) => (m.changes[0] as unknown as { slot: string; item: Parameters<typeof dumpToItem>[0] });
  it('each gear move carries exactly the target item affixes (dumpToItem round trip)', () => {
    for (const m of of('gear')) {
      const { slot, item } = gearItem(m), t = tg.gear.find(g => g.label === item.baseName)!;
      expect(pairs(dumpToItem(item, slot).affixes.map(a => ({ id: a.id, dyn: a.dyn }))), m.label).toBe(pairs(t.affixes));
    }
  });
  it('a legendary with a fixed affix keeps it under modifiers.fixed', () => {
    expect(of('gear').some(m => (gearItem(m).item.modifiers.fixed?.length ?? 0) > 0)).toBe(true);
  });
  it('a legendary is priced by its gold item, a rare is unpriced with a note', () => {
    const priced = targetMoves({ loadout: l100, owned: [], fe: 0, level: 100, skill: 'hoa' }, { prices: { season: 't', fetchedAt: 't', price: k => (typeof k === 'string' ? 5 : null) }, level: 100, notSearched: new Set() }).filter(m => m.kind === 'gear');
    const gold = priced.filter(m => m.costFE === 5), rare = priced.filter(m => m.costFE === null);
    expect(gold.length).toBeGreaterThan(0);
    expect(rare.length).toBeGreaterThan(0);
    expect(rare.every(m => m.costNote === 'rare: its affixes have no market price')).toBe(true);
  });
  it('goldOf: a real legendary matches; the same item padded with unrelated groups is a rare', () => {
    const lang = table<{ rows: Record<string, string> }>('lang_en').rows, base = table<{ rows: Record<string, { a1b8?: number[] }> }>('config_item_base').rows;
    const baseOf = (label: string) => Number(Object.keys(base).find(k => lang[`item_base|name|${k}`] === label && (base[k].a1b8 ?? []).length) ?? 0);
    const hits = tg.gear.filter(g => baseOf(g.label) > 0 && goldOf(g, baseOf(g.label)) !== undefined);
    expect(hits.length).toBeGreaterThan(0);
    const g = hits[0], b = baseOf(g.label), attrs = new Set(base[b].a1b8 ?? []);
    const other = tg.gear.filter(x => x !== g).flatMap(x => x.affixes).filter(a => !attrs.has(a.id));
    const own = g.affixes.filter(a => !attrs.has(a.id)).length;
    expect(goldOf({ ...g, affixes: [...g.affixes, ...other.slice(0, own + 2)] }, b)).toBeUndefined();   // carries the whole row, but most of its groups are not the row's
  });
  it('a move dps-debug rejects is skipped and named', () => {
    const noBelt = { ...l100, gear: (l100.gear as { slot: string }[]).filter(g => g.slot !== 'belt') };
    const r = gen(noBelt);
    expect(r.moves.some(m => /Waistguard/.test(m.label))).toBe(false);
    expect([...r.notSearched].some(n => /^target Dragon Scale Waistguard: /.test(n))).toBe(true);
  });
  it('offers the target slate board as one unpriced enabler patch naming the unmapped slates', () => {
    const b = of('slate');
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ label: 'Target slate board (7 slates)', acquisition: true, enabler: true, costFE: null });
    expect(b[0].costNote).toMatch(/^unmapped slates .*probuild_\d+(, probuild_\d+){6}$/);
    expect(b[0].changes).toHaveLength(1);
    const patch = b[0].changes[0] as Extract<Parameters<typeof applyPatch>[1], { op: 'slate-board' }>;
    const lo = applyPatch({ ...l100, slateItems: [] }, patch) as { slateItems: { itemId: string; talents: number[]; influence: { EffectTalentIds: number[] } }[] };
    expect(lo.slateItems.map(x => x.itemId)).toEqual(patch.items.map(x => x.itemId));
    expect(lo.slateItems.every(x => x.influence.EffectTalentIds.join() === x.talents.join())).toBe(true);
    expect(gen({ ...l100, slateItems: lo.slateItems }).moves.some(m => m.kind === 'slate')).toBe(false);   // held: not offered again
    expect([...notSearched]).toContain('single slates: board adjacency is resolved server-side');
  });
});

const skipReal = realSkip();
describe('target slate board (real figures)', () => {
  it.skipIf(!!skipReal)('target without slates + the board patch has the figure of the target build', async () => {
    const target = JSON.parse(readFileSync(join(pinRoot(), 're/evidence/loadout_probuild-hanshansi-bing.json'), 'utf8'));
    const patch = gen(target).moves.find(m => m.kind === 'slate')!.changes[0] as Parameters<typeof applyPatch>[1];
    // the target figure's own assembly (dps-debug guide/figure.test.ts (a)), written out independently of the patch
    const mine = new Set<number>(target.slates), v2 = JSON.parse(readFileSync(join(pinRoot(), 're/evidence/t5_slate_v2_probuild.json'), 'utf8')) as { id: number; EffectTalentIds: number[] }[];
    const ref = { ...target, slateItems: v2.filter(v => v.EffectTalentIds.every(t => mine.has(t))).map(v => ({ itemId: `probuild_${v.id}`, baseId: 0, talents: v.EffectTalentIds, influence: v })) };
    const bare = { ...target, slates: [], slateScale: [], slateItems: [] };
    const ev = await createEvaluator({ workers: 2 });
    try {
      const ctx = { level: 100, skill: 'hoa' } as const;
      const [a, b] = await Promise.all([ev.run(ref, [], ctx), ev.run(bare, [patch], ctx)]);
      expect(a.figure.stop).toBeUndefined();
      expect(b.figure).toEqual(a.figure);
      const none = await ev.run(bare, [], ctx);
      expect(none.figure.kill).not.toBe(a.figure.kill);   // the slates matter, so the equality is not vacuous
    } finally { await ev.close(); }
  }, 3_600_000);
});
