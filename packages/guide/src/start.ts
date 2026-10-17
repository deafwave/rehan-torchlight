/** Start states: the ideal Bing1 character at map entry (spec §3.3) and a live character from a tli-lens export (dps-debug reader/export.py). */
import { uniqueName } from './names';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { basesFor, bareItem, familyOf } from './candidates/gear';
import { fill } from './candidates/talents';
import { gemLevelAt, mainSid } from './candidates/gems';
import { pinRoot } from './pin';
import { pointsAtLevel, treeOf } from './talentRules';
import type { OwnedItem, Skill, State } from './types';

export const START_LEVEL = 60;
export const START_LOADOUT = 'game/loadout_l94-20261013-160234.json';
/** Stated Ice Shot scenario (how many lances hit, returns, sentry posts per throw): chosen, not measured. */
export const ICE_SHOT_INPUTS = { hitting: 1, returns: 1, sentryPostsPerThrow: 1, status: 'unverified' } as const;

type Dict = Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
const FE_BASES = new Set([100300, 101300]);

/** The L94 Ice Shot loadout stripped by the ledger ruling; every strip step is a named note. */
export function idealStartNotes(level = START_LEVEL): { state: State; notes: string[] } {
  const l: Dict = structuredClone(JSON.parse(readFileSync(join(pinRoot(), START_LOADOUT), 'utf8')));
  delete l._about; delete l._missing;
  const notes = [`base loadout: ${START_LOADOUT} (the owner's L94 Ice Shot character, dps-debug pin)`];

  // every slot the loadout carries gets the best white base at the start level (armor in the line of the original piece; the weapon by the Bing1 rule), so crafts/upgrades/uniques reach every slot
  const worn = (l.gear as Dict[]).map(g => g as { slot: string; baseId?: number });
  // the L94 character wore a vorax limb in ring1 (stripped below): ring1 gets a white ring base in the gear list, so crafts and uniques reach both rings
  if (!worn.some(g => g.slot === 'ring1')) worn.push({ slot: 'ring1', baseId: worn.find(g => g.slot === 'ring2')?.baseId });
  const bases = worn.map(({ slot, baseId }) => {
    const family = slot === 'mainHand' || baseId === undefined ? undefined : familyOf(baseId);
    const b = basesFor(slot, level, 'iceShot', family).at(-1);
    if (!b) throw new Error(`no ${slot} base at level ${level}`);
    return b;
  });
  l.gear = worn.map(({ slot }, i) => bareItem(slot, bases[i].baseId));
  notes.push(`gear: every slot of the L94 loadout (${worn.map(g => g.slot).join(', ')}) replaced by the best white base at level ${level}: ${bases.map(b => `${b.name} (item level ${b.level})`).join(', ')}; no affixes; market drop (0 FE)`);
  if (l.vorax?.length) { notes.push(`vorax: removed ${l.vorax.length} limb(s) (gear slots)`); }
  l.vorax = [];
  l.setCounters = {};
  notes.push('set counters: cleared (no set pieces left)');

  const nSlates = l.slateItems?.length ?? 0;
  l.slates = []; l.slateItems = []; l.slateScale = []; l.slateEffectScale = [];
  notes.push(`slates: removed (${nSlates} placed)`);
  const nPacts = l.pacts?.length ?? 0;
  l.pacts = []; l.contractKeys = []; l.contractInstances = {};
  notes.push(`pactspirits: removed (${nPacts} equipped, with their contract points)`);
  const nKismets = l.kismets?.length ?? 0;
  l.kismets = [];
  notes.push(`kismets: removed (${nKismets})`);
  l.prismEntries = [];
  l.prisms = { placed: Object.fromEntries(Object.keys(l.prisms?.provide ?? {}).map(t => [t, {}])), provide: Object.fromEntries(Object.keys(l.prisms?.provide ?? {}).map(t => [t, { ExtraAffix: {}, TalentId: 0 }])), mappingPos: {} };
  notes.push('prisms: removed (placed prisms and their entries; the empty prism sections stay)');

  // talents to 0, then the level-60 budget placed in node order over the trees the L94 character used (the generators only extend trees that hold a point)
  const trees = [...new Set(Object.keys(l.talents).map(k => treeOf(+k)))];
  const budget = pointsAtLevel(level), talents: Record<number, number> = {};
  let left = budget;
  trees.forEach((t, i) => {
    const got = fill(t, Math.ceil(left / (trees.length - i)));
    Object.assign(talents, got); left -= Object.values(got).reduce((a, b) => a + b, 0);
  });
  l.talents = talents; l.coreTalents = [];
  l.resolvedTalents = { talents: Object.entries(talents).map(([id, p]) => [+id, p, `talent:${id}`]), ext: [] };
  notes.push(`talents: set to 0 and core talents removed; ${budget - left} of pointsAtLevel(${level}) = ${budget} points then placed in node order over trees ${trees.join(', ')} (seed for the search to re-solve); talent points assumed below level 93`);

  let lowered = 0; const dropped: string[] = [];
  l.skills = (l.skills as Dict[]).flatMap(g => {
    const lv = gemLevelAt(g.sid, level, g.level);
    if (!lv) { dropped.push(String(g.sid)); return []; }
    if (lv !== g.level) lowered++;
    return [{ ...g, level: lv }];
  });
  notes.push(`gems: set to the highest gem level the level-${level} hero can use (${lowered} lowered)${dropped.length ? `; ${dropped.length} not installable at ${level}, removed (sid ${dropped.join(', ')})` : ''}`);
  notes.push(`traits: ${Object.keys(l.traits).join(', ')} kept (the Bing1 trait set of the L94 loadout, Firepower Coverage)`);
  l.hero = { ...l.hero, level: level };
  notes.push(`hero memories kept as in the L94 loadout (the ruling does not strip them)`);
  notes.push(`hero level ${level}, skill Ice Shot`);
  return { state: { loadout: l, owned: [], fe: Infinity, level: level, skill: 'iceShot' }, notes };
}
export const idealStart = (level = START_LEVEL): State => idealStartNotes(level).state;

/** Mode 2: a `tli-lens-export/1` file. Equipped items are already in `loadout`; every other item (bag, stash, board, pages) is owned and costs 0 FE once.
 *  `fe` typed on the command line wins over the export's; neither present = error (never assumed 0). */
export function fromExport(json: unknown, fe?: number): State {
  const j = json as Dict;
  if (j?.schema !== 'tli-lens-export/1') throw new Error(`not a tli-lens export (schema ${JSON.stringify(j?.schema)}, want "tli-lens-export/1")`);
  if (typeof j.hero?.level !== 'number') throw new Error('export has no hero.level');
  if (!Array.isArray(j.items)) throw new Error('export has no items list');
  if (!j.loadout || typeof j.loadout !== 'object') throw new Error('export has no loadout');
  const budget = fe ?? j.fe;
  if (typeof budget !== 'number' || !Number.isFinite(budget)) throw new Error('export has no fe; pass --fe N');
  const points = Object.values((j.loadout.talents ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0);
  // against the observed full budget, not the scaled estimate below 93: a real low-level export may hold more than the estimate
  if (points > pointsAtLevel(93)) throw new Error(`export talents hold ${points} points, more than the ${pointsAtLevel(93)} a hero can have (two talent pages read); re-export`);
  const loadout = j.loadout as Dict, active = (loadout?.skills as Dict[] | undefined)?.find(g => g.place?.kind === 'active' && g.place.slot === 0);
  // the 2026-10-16 client pads a slate's talent list with empty 0 entries (32030100,34040100,0,0,0); dps-debug checks the list against EffectTalentIds
  for (const sl of (loadout.slateItems ?? []) as { talents?: number[] }[]) if (Array.isArray(sl.talents)) sl.talents = sl.talents.filter(t => t !== 0);
  // a worn legendary is named by its own name (the read labels it by its base: Old King's Sabatons is Boots of Devastation); `label` stays the base
  for (const g of (loadout.gear ?? []) as Dict[]) { const n = uniqueName(g.baseId, ((g.affixes ?? []) as { id: number }[]).map(a => a.id)); if (n) g.name = n; }
  const skill = (['iceShot', 'hoa'] as Skill[]).find(sk => mainSid(sk) === active?.sid);
  if (!skill) throw new Error(`export main skill (sid ${active?.sid}) is neither Ice Shot nor Hammer of Ash`);
  const owned: OwnedItem[] = (j.items as Dict[]).filter(i => i.where !== 'equipped' && !FE_BASES.has(i.baseId)).map(i => ({
    itemId: i.itemId, baseId: i.baseId, baseName: i.baseName ?? null, level: i.level, where: i.where, page: i.page, slot: i.slot, count: i.count, modifiers: i.modifiers ?? {}, ...(Array.isArray(i.talents) ? { talents: i.talents, shapeId: i.shapeId } : {}) }));
  return { loadout, owned, fe: budget, level: j.hero.level, skill };
}
