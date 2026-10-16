/**
 * The Ice Shot -> Hammer of Ash switch: one acquisition move that equips the best maul base at the hero level, replaces the main skill with Hammer of Ash and
 * rebuilds its support group from the target build (the Pro Build loadout in the pin). The reverse is never offered.
 * dps-debug's `multi` cannot hold a gear swap (applyLoadoutChange turns a `gear` entry into a removal), so the move is [gear swap, multi(skill + supports)].
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pinRoot, table } from '../pin';
import { basesFor, goldItem } from './gear';
import { costOf, priceOfGold } from '../priceOf';
import { gemLevelAt, gemRequires, mainSid, supportsFor } from './gems';
import { pointsAtLevel, treeOf, trimPage } from '../talentRules';
import { talentName, treeName } from '../names';
import type { Change, Generator, Move } from '../types';

type Gem = { sid: number; name: string; level: number; mods?: [number, number[]][]; place: { kind: string; slot: number; ownerKind?: string; ownerSlot?: number } };
const TARGET = 're/evidence/loadout_probuild-hanshansi-bing.json';
/** config_item_gold 112158, Ruinous Star (chest, base 3211 Long Night Sorcerer's Robe, level 82) */
const RUINOUS_STAR = 112158;
type TargetFile = { skills: Gem[]; talents: Record<string, number>; coreTalents: number[] };
let target: TargetFile | undefined;
const targetFile = (): TargetFile => target ??= JSON.parse(readFileSync(join(pinRoot(), TARGET), 'utf8'));
const targetSkills = (): Gem[] => targetFile().skills;

/** The planned leg change (ideal mode): the switch move plus the target build's talent page (every point and core of the current page removed, the
 *  target's set), so Hammer of Ash starts on its own trees instead of Ice Shot's. Below the page's points it is trimmed to the level's (`trimPage`).
 *  Null (with the reason in notSearched) while the switch itself is not offered. */
const sum = (p: Record<string, number>) => Object.values(p).reduce((a, b) => a + b, 0);
/** the target build's talent page at a level (trimmed to its points, trimPage) as changes over the state's page: every point and core of it removed, the
 *  target's set; `points` = what the page holds, `need` = the whole page */
export function targetPage(s: { loadout: Record<string, unknown> }, level: number): { changes: Change[]; page: { talents: Record<number, number>; cores: number[] }; points: number; need: number } {
  const t = targetFile(), page = trimPage(t.talents, t.coreTalents, pointsAtLevel(level));
  return { changes: pageChanges(s.loadout, page), page, points: sum(page.talents), need: sum(t.talents) };
}

/** the changes that replace a loadout's whole talent page (every node and core off, then the page's on) */
export function pageChanges(loadout: Record<string, unknown>, page: { talents: Record<number, number>; cores: number[] }): Change[] {
  const l = loadout as { talents?: Record<string, number>; coreTalents?: number[] };
  return [
    ...Object.entries(l.talents ?? {}).filter(([, p]) => p > 0).map(([k]) => ({ kind: 'talent', node: +k, points: 0 }) as Change),
    ...(l.coreTalents ?? []).map(c => ({ kind: 'core', node: c, action: 'remove' }) as Change),
    ...Object.entries(page.talents).map(([k, p]) => ({ kind: 'talent', node: +k, points: p }) as Change),
    ...page.cores.map(c => ({ kind: 'core', node: c, action: 'add' }) as Change),
  ];
}

export const switchWithPage: (s: Parameters<Generator>[0], ctx: Parameters<Generator>[1]) => Move | null = (s, ctx) => {
  const m = switchMoves(s, ctx)[0];
  if (!m || m.minLevel > ctx.level) { ctx.notSearched.add(`planned switch waits: the switch is not offered at level ${ctx.level}`); return null; }
  // the >= 110T path starts with Ruinous Star on (user, 2026-10-15): the planned switch waits for a level that wears it
  const star = goldItem(RUINOUS_STAR, ctx.level);
  if (star && star.minLevel > ctx.level) { ctx.notSearched.add(`planned switch waits for Ruinous Star (hero level ${star.minLevel})`); return null; }
  const { changes, page, need, points: n } = targetPage(s, ctx.level);
  const trees = [...new Set(Object.keys(page.talents).map(k => treeOf(Number(k))))].map(treeName).join(', ');
  return { ...m, label: `${m.label}, on the target build's talent page ${n < need ? `trimmed to ${n} of ${need} points (` : `(${need} points; `}${trees}; cores ${page.cores.map(talentName).join(', ') || 'none'})`,
    changes: [...m.changes, ...changes] };
};

export const switchMoves: Generator = (s, ctx) => {
  if (s.skill !== 'iceShot') return [];
  const ns = ctx.notSearched;
  ns.add('switch: the new maul is a bare rare base; the bow\'s affixes are lost and the maul is crafted by later gear moves');
  const skills = targetSkills(), hoa = skills.find(g => g.place.kind === 'active' && g.place.slot === 0 && g.sid === mainSid('hoa'));
  if (!hoa) { ns.add(`switch: the target build has no Hammer of Ash in active slot 0 (${TARGET})`); return []; }
  const allowed = new Set(supportsFor('hoa').map(x => x.sid));
  const wanted = skills.filter(g => g.place.kind === 'support' && g.place.ownerKind === 'active' && g.place.ownerSlot === 0).sort((a, b) => a.place.slot - b.place.slot);
  const gems = wanted.filter(g => allowed.has(g.sid)).map(g => ({ ...g, level: gemLevelAt(g.sid, ctx.level, g.level, ns) })).filter(g => {
    if (!g.level) ns.add(`switch: target support ${g.name} needs a higher hero level than ${ctx.level}; left out`);
    return g.level;
  });
  const hoaLevel = gemLevelAt(hoa.sid, ctx.level, hoa.level, ns);
  if (!hoaLevel) { ns.add(`switch: Hammer of Ash needs a higher hero level than ${ctx.level}`); return []; }
  for (const g of wanted) if (!allowed.has(g.sid)) ns.add(`switch: target support ${g.name} does not compile on Hammer of Ash (SUP1); left out`);
  const need = Math.max(gemRequires(hoa.sid, 1), ...gems.map(g => gemRequires(g.sid, 1)));
  const maul = basesFor('mainHand', ctx.level, 'hoa').at(-1);
  if (!maul) { ns.add(`switch: no maul base at hero level ${ctx.level}`); return []; }

  const base = table<{ rows: Record<string, { a1b8?: number[] }> }>('config_item_base').rows[maul.baseId], rolls = table<{ rows: Record<string, number[][]> }>('config_modifier_rolls').rows;
  const baseAttr = (base.a1b8 ?? []).filter(id => rolls[id]).map(id => ({ id, dynArgs: rolls[id].map(r => (r[0] + r[1]) / 2) }));
  const weapon: Change = { kind: 'gear', slot: 'mainHand', item: { baseId: maul.baseId, baseName: maul.name, itemId: `guide-switch-${maul.baseId}`, level: ctx.level, modifiers: { baseAttr } } };

  const owner = { kind: 'active' as const, slot: 0 };
  const have = new Set(((s.loadout.skills ?? []) as Gem[]).filter(g => g.place.kind === 'support' && g.place.ownerKind === 'active' && g.place.ownerSlot === 0).map(g => g.place.slot));
  const sockets: Change[] = [];
  for (let i = 0; i < Math.max(gems.length, ...have); i++) {
    const socket = i + 1, g = gems[i];
    if (g) sockets.push({ kind: 'support', action: have.has(socket) ? 'replace' : 'install', owner, socket, gem: { sid: g.sid, level: g.level, name: g.name, mods: g.mods } });
    else if (have.has(socket)) sockets.push({ kind: 'support', action: 'remove', owner, socket });
  }
  const maulName = table<{ rows: Record<string, string> }>('lang_en').rows[`item_base|name|${maul.baseId}`];
  // Ruinous Star, a chest unique, is the >= 110T build's core (user, 2026-10-15: "it requires a ruinous star, go down that path"): the switch puts it on
  const star = goldItem(RUINOUS_STAR, ctx.level), withStar = !!star && star.minLevel <= ctx.level;
  if (star && !withStar) ns.add(`switch: Ruinous Star needs hero level ${star.minLevel}; the switch at level ${ctx.level} goes without it`);
  const parts = [costOf(ctx.prices, 'Hammer of Ash', ctx.level, 'gem'), ...gems.map(g => costOf(ctx.prices, g.name, ctx.level, 'gem')), costOf(ctx.prices, maulName, ctx.level, 'bare'),
    ...(withStar ? [{ costFE: priceOfGold(ctx.prices, RUINOUS_STAR, ctx.level).fe, market: 'tradeable' as const }] : [])];
  const names = ['Hammer of Ash', ...gems.map(g => g.name), maulName, ...(withStar ? [star!.name] : [])], unpriced = names.filter((_, i) => parts[i].costFE === null);
  if (unpriced.length) ns.add(`switch unpriced (${unpriced.join(', ')}): no etor price and not a white base / normal gem`);
  const allDrop = parts.every(p => p.market === 'drop');
  return [{
    kind: 'switch', skill: 'hoa', acquisition: true, minLevel: Math.max(maul.level, need), enabler: true,
    label: `Switch to Hammer of Ash with ${maul.name} (level ${maul.level})${withStar ? ', Ruinous Star' : ''} and ${gems.map(g => g.name).join(', ')}`,
    costFE: unpriced.length ? null : parts.reduce((a, p) => a + p.costFE!, 0), market: allDrop ? 'drop' : 'tradeable', ...(allDrop ? { costNote: 'drop' } : {}),
    changes: [weapon, { kind: 'multi', changes: [{ kind: 'skill', action: 'replace', owner, gem: { sid: hoa.sid, level: hoaLevel, name: hoa.name } }, ...sockets] as never },
      ...(withStar ? [{ kind: 'gear', slot: 'chest', item: star!.item } as Change] : [])],
  }];
};
