/* Rare-gear craft options (port of packages/dmg/src/bingCraft.ts craftOptions, pure; mechanics.md#bing-craft).

   One ember of a grade (Precious -> Basic, Matchless -> Advanced, Ultimate -> Ultimate) on the affix slot you pick rolls a random affix of that
   grade and the slot's side (prefix / suffix) for the gear type, picked by affix weight (owner, 2026-10-17); its tier is rolled by tier weight among
   the tiers the item level allows (data/affix_library.json). Expected embers to land "affix A at tier >= t" = 1 / (P(A) x P(tier >= t)). */
export interface LibraryTier { tier: string; text: string; requiredLevel: number; weight: number; tierAffixId: string }
export interface LibraryAffix {
  slot: string; grade: 'Basic' | 'Advanced' | 'Ultimate'; side: 'Prefix' | 'Suffix';
  affixId: string; weight: number; effect: string; tiers: LibraryTier[];
}

/** Page price keys: the English ember names. */
export const EMBER_FOR_GRADE = { Basic: 'Precious Ember', Advanced: 'Matchless Ember', Ultimate: 'Ultimate Ember' } as const;
/** embers one craft consumes: 2 on a two-handed weapon, 1 on anything else (the owner, in game 2026-10-16: a basic-affix craft on his bow takes 2
 *  Precious Embers + 10 Flame Sand, "2 embers because it's a 2h weapon"; Flame Sand is worth about nothing) */
const TWO_HANDED = new Set(['Two-Handed Sword', 'Two-Handed Hammer', 'Two-Handed Axe', 'Tin Staff', 'Cudgel', 'Bow', 'Crossbow', 'Musket', 'Fire Cannon']);
export const embersPerCraft = (gearType: string) => (TWO_HANDED.has(gearType) ? 2 : 1);

export interface CraftOption {
  affixId: string; tierAffixId: string; gearType: string; grade: LibraryAffix['grade']; side: LibraryAffix['side'];
  tier: string; text: string; requiredLevel: number;
  /** expected embers of `ember` to land this affix at this tier or better */
  expectedEmbers: number; ember: string;
}

const tierRank = (t: string) => Number(t.replace(/^T/, ''));   // T1 best ... T7 worst
/** a tier's text at the upper end of every (lo-hi) range */
export const topRoll = (text: string) => text.replace(/\((-?[\d.]+)-(-?[\d.]+)\)/g, (_, _a, b) => b);

/** Every reachable (affix, tier) on `gearType` at `itemLevel`, with its expected ember count. Tiers above the item level are excluded. */
export function craftOptions(library: LibraryAffix[], gearType: string, itemLevel: number): CraftOption[] {
  const pool = library.filter(a => a.slot === gearType);
  const gradeWeight = (g: string, side: string) => pool.filter(a => a.grade === g && a.side === side).reduce((s, a) => s + a.weight, 0);
  const out: CraftOption[] = [];
  for (const a of pool) {
    const allowed = a.tiers.filter(t => t.requiredLevel <= itemLevel);
    const total = allowed.reduce((s, t) => s + t.weight, 0);
    if (!total) continue;
    const pAffix = a.weight / gradeWeight(a.grade, a.side);
    for (const t of allowed) {
      const atLeast = allowed.filter(x => tierRank(x.tier) <= tierRank(t.tier)).reduce((s, x) => s + x.weight, 0);
      out.push({ affixId: a.affixId, tierAffixId: t.tierAffixId, gearType, grade: a.grade, side: a.side, tier: t.tier,
                 text: topRoll(t.text), requiredLevel: t.requiredLevel,
                 expectedEmbers: embersPerCraft(gearType) / (pAffix * (atLeast / total)), ember: EMBER_FOR_GRADE[a.grade] });
    }
  }
  return out;
}
