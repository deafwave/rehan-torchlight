import { describe, expect, it } from 'vitest';
import { actionText, fmtDps, fmtGain, fmtTime, hunting, parseAdvice, parsePaste, renderGuide, type GuideOut } from '../src/guide-view';
import sample from '../src/data/guide.sample.json';

const g = sample as unknown as GuideOut;
describe('guide view', () => {
  it('formats DPS in short-scale units', () => {
    expect(fmtDps(1.84e14)).toBe('184 T');
    expect(fmtDps(7.119e8)).toBe('712 M');
    expect(fmtDps(1.5e13)).toBe('15.0 T');
    expect(fmtDps(999)).toBe('999');
    expect(fmtDps(1234567)).toBe('1.23 M');
  });
  it('rounds before choosing the unit', () => {
    expect(fmtDps(999999.6)).toBe('1.00 M');
  });
  it('formats gains and times', () => {
    expect(fmtGain(100, 138)).toBe('+38 %');
    expect(fmtGain(100, 104.2)).toBe('+4.2 %');
    expect(fmtGain(100, 420)).toBe('×4.2');
    expect(fmtGain(100, 20)).toBe('−80 %');
    expect(fmtTime(3.08)).toBe('3.08 s');
    expect(fmtTime(150)).toBe('2.50 min');
  });
  it('says what to do in the player\'s words', () => {
    const m = (label: string) => ({ kind: 'x', label, acquisition: true, costFE: 1, minLevel: 1, changes: [] });
    expect(actionText(m('Unique Berserker Bracer in gloves'))).toBe('Buy Berserker Bracer (gloves)');
    expect(actionText(m('Craft T7 +36 Dexterity (prefix) on mainHand'))).toBe('Craft T7 “+36 Dexterity” on your weapon');
    expect(actionText(m('Replace socket 2 with Cold Penetration'))).toBe('Swap in the Cold Penetration support (socket 2)');
    expect(actionText(m('Add core talent Close Range Fire'))).toBe('Add core talent Close Range Fire');
  });
  const html = renderGuide(g);
  it('one row per step plus triggered respecs', () => {
    expect(html.match(/class="step"/g)).toHaveLength(5);
    expect(html.match(/class="respec"/g)).toHaveLength(1);
    expect(html).toContain('2,500,000');
  });
  it('the diagnostics are kept, folded under Details; a partial figure is flagged', () => {
    expect(html).toContain('class="gl-details"');
    expect(html).toContain(g.pin);
    expect(html).toContain(g.etor.season);
    for (const l of [...g.notSearched, ...g.unpriced, ...g.notCalculable]) expect(html).toContain(l);
    expect(html).toContain('partial: sample-piece');
  });
  it('a partial or stopped run shows a banner; a finished one does not', () => {
    expect(html).not.toContain('gl-banner');
    expect(renderGuide({ ...g, knobs: { ...g.knobs, partialRun: true } })).toContain('Partial run');
    expect(renderGuide({ ...g, knobs: { ...g.knobs, stoppedBy: 'budget' } })).toContain('Stopped early (budget)');
  });
  it('a boss figure shows the goal and its time to kill', () => {
    const h = renderGuide({ ...g, steps: [], start: { ...g.start, kill: 2e3, lifeMax: 1e4, target: 'cube3', cull: 0.136 } });
    expect(h).toContain('kill <b>Cube 3</b> as fast as possible');
    expect(h).toContain('5.00 s');
  });
  it('a plan priced with your prices file says so; one on etor alone does not', () => {
    expect(renderGuide({ ...g, knobs: { ...g.knobs, prices: { file: 'prices.json', overrides: 3 } } })).toContain('Priced with your prices file: 3 items at your price, the rest at etor');
    expect(renderGuide(g)).not.toContain('your prices file');
  });
  it('a blocked Hammer of Ash leg is said plainly', () => {
    const h = renderGuide({ ...g, startNotes: ['L90 planned switch cannot be priced yet: not ported: CalcFinalHurt early exit'] });
    expect(h).toContain('The Hammer of Ash leg is not calculable yet');
  });
  it('items nobody sells: best gain per item, highest first', () => {
    expect(hunting(['L60 not on the market / unpriced: Unique Endless Night - Prototype in boots: +364.7 % if you get it',
      'L65 not on the market / unpriced: Unique Endless Night - Prototype in boots: +59.9 % if you get it',
      'L90 not on the market / unpriced: Target: Sierra Reverberation Maul in mainHand: +2267.7 % if you get it', 'noise']))
      .toEqual([{ item: 'Sierra Reverberation Maul in mainHand', level: 90, gain: 2267.7 }, { item: 'Endless Night - Prototype in boots', level: 60, gain: 364.7 }]);
  });
  it('parseAdvice rejects wrong mode and schema', () => {
    expect(() => parseAdvice(JSON.stringify(g))).toThrow(/advise/);
    expect(() => parseAdvice('{')).toThrow(/JSON/);
    expect(() => parseAdvice('{"mode":"advise"}')).toThrow(/missing/);
    expect(parseAdvice(JSON.stringify({ ...g, mode: 'advise' })).mode).toBe('advise');
  });
  it('escapes markup and rejects malformed steps', () => {
    const evil = { ...g, steps: [{ ...g.steps[0], move: { ...g.steps[0].move, label: '<script>x</script>' } }] };
    expect(renderGuide(evil)).not.toContain('<script>');
    expect(() => parseAdvice(JSON.stringify({ ...g, mode: 'advise', steps: [{ ...g.steps[0], level: '<img src=x onerror=alert(1)>' }] }))).toThrow(/steps\[0\]\.level/);
    expect(() => parseAdvice(JSON.stringify({ ...g, mode: 'advise', steps: [{}] }))).toThrow(/Advice is (missing|invalid): steps\[0\]/);
    expect(() => parseAdvice(JSON.stringify({ ...g, mode: 'advise', start: {} }))).toThrow(/start\.life100/);
  });
});

describe('the player\'s own character', () => {
  const character = { level: 93, skill: 'hoa', fe: 64812, owned: 279, gear: [{ slot: 'mainHand', label: 'Sierra Reverberation Maul' }, { slot: 'belt', label: '<b>x</b>' }] };
  it('advice shows the character it starts from', () => {
    const p = parsePaste(JSON.stringify({ ...g, mode: 'advise', knobs: { fe: 64812 }, character }));
    expect(p.kind).toBe('advice');
    const h = renderGuide((p as { guide: GuideOut }).guide);
    for (const t of ['Your upgrade plan', 'Level 93', 'Hammer of Ash', '64,812 FE', '279 items owned', 'Sierra Reverberation Maul', 'weapon', 'with your 64,812 FE']) expect(h).toContain(t);
    expect(h).not.toContain('<b>x</b>');
  });
  it('the raw export gives the gear only', () => {
    const p = parsePaste(JSON.stringify({ schema: 'tli-lens-export/1', hero: { level: 93 }, fe: 10, items: [{}, {}],
      loadout: { gear: [{ slot: 'belt', label: 'Dragon Scale Waistguard' }], skills: [{ sid: 1110, place: { kind: 'active', slot: 0 } }] } }));
    expect(p).toEqual({ kind: 'export', character: { level: 93, skill: 'hoa', fe: 10, owned: 2, gear: [{ slot: 'belt', label: 'Dragon Scale Waistguard' }] } });
    expect(() => parsePaste('{"schema":"tli-lens-export/1"}')).toThrow(/export\.level/);
    expect(() => parsePaste('nope')).toThrow(/not valid JSON/);
  });
});

describe('ideal-mode extras', () => {
  it('shows drops as free, step notes, stated inputs and start notes', () => {
    const step = { ...g.steps[0], move: { ...g.steps[0].move, costFE: 0, market: 'drop' }, notes: ['talent points assumed'] };
    const html = renderGuide({ ...g, steps: [step], inputs: { ground: 'gx' }, startNotes: ['gear: stripped'] });
    for (const t of ['free (drops)', 'talent points assumed', 'gx', 'gear: stripped']) expect(html).toContain(t);
  });
});
