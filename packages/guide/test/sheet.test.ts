import { describe, expect, it } from 'vitest';
import { buildSheet } from '../src/sheet';

describe('build sheet: skills', () => {
  it('lists each skill followed by its own supports, whatever order the loadout keeps them in', () => {
    const sup = (name: string, ownerKind: string, ownerSlot: number, slot: number) => ({ name, level: 20, place: { kind: 'support', slot, ownerKind, ownerSlot } });
    const skills = [
      { name: 'Timid', level: 18, place: { kind: 'active', slot: 1 } },
      sup('Restrain', 'passive', 2, 1), sup('Aura Amplification', 'passive', 2, 2),
      { name: 'Precise: Cruelty', level: 16, place: { kind: 'passive', slot: 2 } },
      sup('Steamroll', 'active', 0, 1),
      { name: 'Hammer of Ash', level: 16, place: { kind: 'active', slot: 0 } },
    ];
    const lines = buildSheet({ gear: [], skills, talents: {} } as never).find((s) => s.section === 'Skills')!.lines;
    expect(lines).toEqual(['active 0: Hammer of Ash (level 16)', '  + Steamroll (level 20)', 'active 1: Timid (level 18)',
      'passive 2: Precise: Cruelty (level 16)', '  + Restrain (level 20)', '  + Aura Amplification (level 20)']);
  });
});
