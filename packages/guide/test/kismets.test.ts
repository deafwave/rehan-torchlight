import { describe, expect, it } from 'vitest';
import { kismetMoves, pointName } from '../src/candidates/kismets';
import { GROUND, L100, applyAll, fakePrices, loadout } from './apply';

const l100 = loadout(L100);   // kismets on 103 104 108 305 307, Undetermined Fates on 111 [1,1] and 211 [2]; 311 is a free Fate slot
const run = (l: Record<string, unknown>, prices: Record<string, number> = {}) => {
  const notSearched = new Set<string>();
  return { moves: kismetMoves({ loadout: l, owned: [], fe: 0, level: 100, skill: 'hoa' }, { prices: fakePrices(prices), level: 100, notSearched }), notSearched };
};
const ch = (m: { changes: unknown[] }) => m.changes[0] as { kind: string; action: string; point: number; modifierId?: number; rolls?: number[]; baseId?: number; extra?: number[] };
type K = { node: number; modifierId: number | null };
const plain = (m: { changes: unknown[] }, a: string) => ch(m).kind === 'kismet' && ch(m).action === a;

describe('pointName', () => {
  it('names a contract point as the page shows it: the pact, then group-position along the path, three to a group (owner, 2026-10-17: 101 102 107 103 104 108 105 106 109 110 111)', () => {
    const order = [101, 102, 107, 103, 104, 108, 105, 106, 109, 110, 111].map((n) => pointName(n));
    expect(order).toEqual(['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2']);
    expect(pointName(307, 'Kong')).toBe('Kong 1-3');
  });
});

describe('kismetMoves', () => {
  const { moves, notSearched } = run(l100, { 'Micro Fate: Fire Resistance': 7, 'Undetermined Fate': 50 });
  it('labels a point by its pact and place, never its id', () => {
    expect(moves.every((m) => !/contract point \d/.test(m.label) && / \d-\d\b/.test(m.label))).toBe(true);
  });
  it('sockets only free small / middle points of an equipped pact, replaces and removes only held kismets', () => {
    const held = new Set((l100.kismets as K[]).map(k => k.node));
    for (const m of moves.filter(x => plain(x, 'socket'))) expect(held.has(ch(m).point), m.label).toBe(false);
    for (const m of moves.filter(x => plain(x, 'replace') || plain(x, 'remove'))) expect(held.has(ch(m).point), m.label).toBe(true);
    expect(moves.some(m => ch(m).point === 110 || ch(m).point === 310)).toBe(false);   // big points are not searched
    expect([...notSearched].join()).toMatch(/big points/);
  });
  it('socket and replace are acquisitions priced by English name (null when etor has no row); remove is free', () => {
    const fire = moves.find(m => m.label.startsWith('Socket Micro Fate: Fire Resistance'))!;
    expect([fire.acquisition, fire.costFE]).toEqual([true, 7]);
    expect(moves.find(m => m.label.startsWith('Socket Micro Fate: Mana'))!.costFE).toBeNull();
    const rm = moves.find(m => plain(m, 'remove'))!;
    expect([rm.acquisition, rm.costFE]).toEqual([false, 0]);
  });
  it('no two moves have identical changes', () => {
    const keys = moves.map(m => JSON.stringify(m.changes));
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('hero-level gate: minLevel is the kismet base level (config_item_base i3c), which is 0 for every kismet, so none is withheld at level 0', () => {
    const low = kismetMoves({ loadout: l100, owned: [], fe: 0, level: 0, skill: 'hoa' }, { prices: fakePrices({}), level: 0, notSearched: new Set() });
    expect(low.length).toBe(moves.length);
    expect(moves.every(m => m.minLevel === 0)).toBe(true);
  });
  it('rolls are finite numbers from the catalog ranges', () => {
    expect(moves.filter(m => plain(m, 'socket')).every(m => ch(m).rolls!.every(Number.isFinite))).toBe(true);
  });
  it('socket, replace and remove apply through dps-debug applyOtherChange', () => {
    const sock = moves.find(m => plain(m, 'socket'))!, rep = moves.find(m => plain(m, 'replace'))!, rm = moves.find(m => plain(m, 'remove'))!;
    const at = (l: Record<string, unknown>, p: number) => (l.kismets as K[]).find(k => k.node === p);
    expect(at(applyAll(l100, sock, GROUND.hoa), ch(sock).point)!.modifierId).toBe(ch(sock).modifierId);
    expect(at(applyAll(l100, rep, GROUND.hoa), ch(rep).point)!.modifierId).toBe(ch(rep).modifierId);
    expect(at(applyAll(l100, rm, GROUND.hoa), ch(rm).point)).toBeUndefined();
  });
  it('Undetermined Fate: installed on the free Fate slot only with an extra-point list the loadout shows; both install and remove are enablers', () => {
    const inst = moves.filter(m => ch(m).kind === 'fate' && ch(m).action === 'install');
    expect(inst.map(m => [ch(m).point, ch(m).baseId, JSON.stringify(ch(m).extra)]).sort()).toEqual([[311, 350900, '[1,1]'], [311, 350900, '[2]']]);
    expect(inst.every(m => m.enabler && m.acquisition && m.costFE === 50)).toBe(true);
    expect((applyAll(l100, inst[0], GROUND.hoa).kismets as K[]).some(k => k.node === 311)).toBe(true);
    const rm = moves.filter(m => ch(m).kind === 'fate' && ch(m).action === 'remove');
    expect(rm.length).toBe(2);
    expect(rm.every(m => m.enabler && !m.acquisition && m.costFE === 0)).toBe(true);
    expect((applyAll(l100, rm[0], GROUND.hoa).kismets as K[]).some(k => k.node === ch(rm[0]).point)).toBe(false);
  });
  it('a Fate whose extra points hold a kismet is not offered for removal', () => {
    const l = { ...l100, kismets: [...(l100.kismets as object[]), { modifierId: 100350007, servantId: null, node: 112, rolls: [13] }] };
    expect(run(l).moves.filter(m => ch(m).kind === 'fate' && ch(m).action === 'remove').map(m => ch(m).point)).toEqual([211]);
  });
  it('the planner-file schema (servant page nodes) is not searched', () => {
    const r = run(loadout('re/evidence/loadout_probuild-hanshansi-bing.json'));
    expect(r.moves).toEqual([]);
    expect([...r.notSearched].join()).toMatch(/servant page node/);
  });
});
