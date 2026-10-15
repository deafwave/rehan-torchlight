import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { gemLevelAt, gemMoves, gemRequires, supportsFor } from '../src/candidates/gems';
import { pinRoot, table } from '../src/pin';
import type { Skill } from '../src/types';
import { GROUND, L100, L94, applyAll, fakePrices, loadout } from './apply';

const l100 = loadout(L100), l94 = loadout(L94);
const gen = (l: Record<string, unknown>, skill: Skill, prices: Record<string, number> = {}) => {
  const notSearched = new Set<string>();
  return { moves: gemMoves({ loadout: l, owned: [], fe: 0, level: 100, skill }, { prices: fakePrices(prices), level: 100, notSearched }), notSearched };
};
type Sup = { kind: string; action: string; socket: number; gem?: { sid: number; level: number; name: string } };
const sup = (m: { changes: unknown[] }) => m.changes[0] as Sup;
type Gem = { sid: number; level: number; place: { kind: string; slot: number; ownerKind?: string; ownerSlot?: number } };
const sockets = (l: Record<string, unknown>) => (l.skills as Gem[]).filter(g => g.place.kind === 'support' && g.place.ownerSlot === 0 && g.place.ownerKind === 'active');

describe('gemMoves', () => {
  it('emits only supports the SUP1 census compiles for the skill: Steamroll on Hammer of Ash, never on Ice Shot (G2 tag gate)', () => {
    const hoa = gen(l100, 'hoa').moves.filter(m => sup(m).gem).map(m => sup(m).gem!.name), ice = gen(l94, 'iceShot').moves.filter(m => sup(m).gem).map(m => sup(m).gem!.name);
    expect(hoa).toContain('Steamroll');
    expect(ice).not.toContain('Steamroll');
    expect(new Set(ice).size).toBeGreaterThan(10);
    const ok = new Set(supportsFor('iceShot').map(s => s.name));
    expect(ice.every(n => ok.has(n))).toBe(true);
  });
  describe('hero-level gate (config_skill_stone a100)', () => {
    const rows = table<{ rows: Record<string, { a100: [number, number][] }> }>('config_skill_stone').rows;
    it('the ladder holds for every gem of the owner loadouts at the captured hero level (93): 2000+ gems, no counter-example', () => {
      const hero = loadout('captures/L100.state-20261013-165251/pre/player.json').cfg.level;
      expect(hero).toBe(93);
      let n = 0;
      for (const f of readdirSync(`${pinRoot()}/game`).filter(x => /^loadout_l.*\.json$/.test(x))) {
        for (const g of (loadout(`game/${f}`).skills ?? []) as { sid: number; level: number }[]) {
          if (!rows[g.sid]) continue;
          n++;
          expect(gemRequires(g.sid, g.level), `${f} ${g.sid} level ${g.level}`).toBeLessThanOrEqual(hero);
        }
      }
      expect(n).toBeGreaterThan(2000);
    });
    const steep = supportsFor('hoa').find(s => !sockets(l100).some(g => g.sid === s.sid) && gemRequires(s.sid, 20) > 50 && gemRequires(s.sid, 1) <= 50)!;
    it('below the level-20 requirement it is installed at a lower gem level, read straight from the ladder', () => {
      const hero = gemRequires(steep.sid, 20) - 1;
      const want = Math.max(...Array.from({ length: 20 }, (_, i) => i + 1).filter(l => Math.min(...rows[steep.sid].a100.filter(([g]) => g >= l).map(([, h]) => h)) <= hero));
      expect(want).toBeLessThan(20);
      expect(gemLevelAt(steep.sid, hero, 20)).toBe(want);
      const notSearched = new Set<string>();
      const ms = gemMoves({ loadout: l100, owned: [], fe: 0, level: hero, skill: 'hoa' }, { prices: fakePrices({}), level: hero, notSearched }).filter(m => sup(m).gem?.sid === steep.sid);
      expect(ms.length).toBeGreaterThan(0);
      expect(ms.every(m => sup(m).gem!.level <= want && m.minLevel === gemRequires(steep.sid, 1))).toBe(true);
    });
    it('at hero level 0 no support is bought or installed', () => {
      const ms = gemMoves({ loadout: l100, owned: [], fe: 0, level: 0, skill: 'hoa' }, { prices: fakePrices({}), level: 0, notSearched: new Set() });
      expect(ms.every(m => sup(m).action === 'remove')).toBe(true);
    });
    it('an unknown stone is named in notSearched and never available', () => {
      const ns = new Set<string>();
      expect(gemLevelAt(999, 100, 20, ns)).toBe(0);
      expect([...ns].join()).toMatch(/stone 999 is not in config_skill_stone/);
    });
  });
  it('never offers a support the skill already holds', () => {
    const held = new Set(sockets(l100).map(g => g.sid));
    expect(gen(l100, 'hoa').moves.every(m => !sup(m).gem || !held.has(sup(m).gem!.sid))).toBe(true);
  });
  it('replace keeps the socket\'s gem level, is priced by name (null when etor has no row), remove is free', () => {
    const { moves } = gen(l100, 'hoa', { Steamroll: 12 });
    const st = moves.find(m => sup(m).gem?.name === 'Steamroll' && sup(m).socket === 1)!;
    expect([sup(st).action, sup(st).gem!.level, st.acquisition, st.costFE]).toEqual(['replace', sockets(l100).find(g => g.place.slot === 1)!.level, true, 12]);
    expect(moves.find(m => sup(m).gem?.name === 'Multistrike')!.costFE).toBeNull();
    const rm = moves.find(m => sup(m).action === 'remove')!;
    expect([rm.acquisition, rm.costFE]).toEqual([false, 0]);
  });
  it('an empty socket gets install moves; replace, install and remove apply through dps-debug applyOtherChange', () => {
    const emptied = applyAll(l100, gen(l100, 'hoa').moves.find(m => sup(m).action === 'remove' && sup(m).socket === 5)!, GROUND.hoa);
    const inst = gen(emptied, 'hoa').moves.find(m => sup(m).action === 'install')!;
    expect(sup(inst).socket).toBe(5);
    expect(sockets(applyAll(emptied, inst, GROUND.hoa)).map(g => g.sid)).toContain(sup(inst).gem!.sid);
    const rep = gen(l100, 'hoa').moves.find(m => sup(m).action === 'replace')!;
    expect(sockets(applyAll(l100, rep, GROUND.hoa)).find(g => g.place.slot === sup(rep).socket)!.sid).toBe(sup(rep).gem!.sid);
  });
  it('a main skill that is not the state\'s skill is not searched', () => {
    const r = gen(l94, 'hoa');
    expect(r.moves).toEqual([]);
    expect([...r.notSearched].join()).toMatch(/is not hoa/);
  });
});
