import { describe, expect, it } from 'vitest';
import { actionText, fmtDps, fmtGain, fmtTime, hunting, parseAdvice, parsePaste, rankNext, renderGuide, renderNext, type GuideOut, type NextBuy } from '../src/guide-view';
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

describe('what to buy next (your prices)', () => {
  const next: NextBuy[] = [
    { label: 'Unique Bow of Endless Dusk in mainHand', kind: 'unique', gain: 3, kill: 3e6, costFE: 900, buy: { name: 'Bow of Endless Dusk', qty: 1 } },
    { label: 'Craft T7 +36 Dexterity (prefix) on chest', kind: 'craft', gain: 1.1, kill: 1.1e6, costFE: 0.6, buy: { name: 'Precious Ember', qty: 10 } },
    { label: 'Replace socket 2 with Cold Penetration', kind: 'support', gain: 1.05, kill: 1.05e6, costFE: 0, market: 'drop', buy: { name: 'Cold Penetration', qty: 1 } },
    { label: 'Unique Endless Night - Prototype in boots', kind: 'unique', gain: 4, kill: 4e6, costFE: null, buy: { name: 'Endless Night - Prototype', qty: 1 } },
  ];
  const etor = { 'Bow of Endless Dusk': 900, 'Precious Ember': 0.06, 'Cold Penetration': null, 'Endless Night - Prototype': null };
  const order = (mine: Record<string, number>) => rankNext(next, etor, mine).map((r) => r.n.label.split(' ')[1]);
  it('ranks by gain per FE at etor prices: free first, unpriced last', () => {
    expect(order({})).toEqual(['socket', 'T7', 'Bow', 'Endless']);
    expect(rankNext(next, etor, {}).map((r) => r.cost)).toEqual([0, 0.6, 900, null]);
  });
  it('your price re-ranks: a cheap listing moves up, a price on an unpriced item ranks it; cost = your unit price x the quantity', () => {
    expect(order({ 'Bow of Endless Dusk': 0.5 })).toEqual(['socket', 'Bow', 'T7', 'Endless']);
    expect(order({ 'Endless Night - Prototype': 1 })[1]).toBe('Endless');
    expect(rankNext(next, etor, { 'Precious Ember': 1 }).find((r) => r.n.kind === 'craft')!.cost).toBe(10);
  });
  it('the table has a price box per bought item (escaped), your price shown, and the download', () => {
    const h = renderNext([{ ...next[0], buy: { name: 'A "quoted" <b>', qty: 1 } }, next[1]], {}, { 'Precious Ember': 2 });
    expect(h).toContain('data-name="A &quot;quoted&quot; &lt;b&gt;"');
    expect(h).toContain('value="2"');
    expect(h).toContain('× 10');
    expect(h).toContain('prices.json');
    expect(h).not.toContain('<b>');
  });
  it('advice with a next list renders it first; a malformed row is refused', () => {
    const adv = { ...g, mode: 'advise', next, prices: etor };
    expect(renderGuide(parseAdvice(JSON.stringify(adv)))).toContain('What to buy next');
    expect(() => parseAdvice(JSON.stringify({ ...adv, next: [{ label: 'x', gain: 'big' }] }))).toThrow(/next\[0\]\.gain/);
    expect(() => parseAdvice(JSON.stringify({ ...adv, next: [{ ...next[0], buy: { name: 1, qty: 1 } }] }))).toThrow(/next\[0\]\.buy/);
  });
});

describe('one tab per leg (one yardstick each)', () => {
  const hoa = (kill: number, target: string) => ({ ...g.start, kill, life100: kill, life0: kill, target, lifeMax: 1e10, lock: 1.5e13 });
  const steps = g.steps.map((st, i) => (i < 3 ? st : { ...st, before: hoa(1e6 * i, 'cube1'), after: hoa(2e6 * i, 'cube1') }));
  const legs = [
    { skill: 'iceShot', target: null, firstStep: 0, start: g.start, end: 'the Ice Shot leg reached 2.56e+8 (switchAt 2e+8): switch to Hammer of Ash' },
    { skill: 'hoa', target: 'cube1', firstStep: 3, start: hoa(5e5, 'cube1'), end: 'Cube 1 dies in 8.20 s (under 10 s): move on to Keegan 2' },
    { skill: 'hoa', target: 'keegan2', firstStep: 5, start: hoa(9e6, 'keegan2') },
  ];
  const guide = { ...g, steps, legs } as unknown as GuideOut;
  const html = renderGuide(guide), panels = html.split('<section class="gl-leg"').slice(1);
  it('a tab per leg, labelled by skill and boss, each panel holding only its own steps on its own yardstick', () => {
    for (const t of ['Ice Shot', 'Cube 1', 'Keegan 2']) expect(html).toContain(`>${t}</label>`);
    expect(panels).toHaveLength(3);
    expect(panels[0]).toContain('training dummy');
    expect(panels[0]).toContain('value="3"');
    expect(panels[0]).not.toContain('value="4"');
    expect(panels[1]).toContain('value="4"');
    expect(panels[1]).toContain('value="5"');
    expect(panels[1]).toContain('on Cube 1');
    expect(panels[1]).toContain('500 K');
  });
  it('a leg says why it ended; a leg with no step yet says so', () => {
    expect(panels[0]).toContain('switch to Hammer of Ash');
    expect(panels[1]).toContain('move on to Keegan 2');
    expect(panels[2]).toContain('No upgrade');
    expect(panels[2]).toContain('9.00 M');
  });
  it('advice legs are validated', () => {
    const adv = { ...guide, mode: 'advise' };
    expect(parseAdvice(JSON.stringify(adv)).legs).toHaveLength(3);
    expect(() => parseAdvice(JSON.stringify({ ...adv, legs: [{ ...legs[0], firstStep: 'x' }] }))).toThrow(/legs\[0\]\.firstStep/);
  });
});

