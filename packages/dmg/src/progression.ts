/* Per-slot gear ladder: every rung an item passes through across the loadouts,
   priced by swapping it into a fixed REFERENCE build (every other slot at the top of its
   own ladder) — so each number is what that one slot contributes to a finished build.

   Writes the result to packages/page/src/data/ladder.json for the Vite page (main.ts imports it). */
import fs from "node:fs";
import { fromRoot, pyRound, deepCopy, asciiJson } from "./py.js";
import { parseBuild, substitute } from "./buildParser.js";
import { cycleDps } from "./damageModel.js";

export const BUILD = fromRoot("data/Rehan.json");
export const OUT = fromRoot("packages/page/src/data/ladder.json");
const REFERENCE = "more_1";      // every slot at its top rung

const SLOT_ORDER = ["mainHand", "offHand", "gloves", "helmet", "chest",
                    "ring1", "ring2", "belt", "necklace", "boots"];

interface ReworkInfo { anchor: string | null; label: string; why: string }

// A step is a REWORK only when the incoming item breaks or depends on something
// outside its slot (user 2026-07-16); pure stat swaps are linear even across item
// classes, and even when DPS-negative (Eternity).
// Rungs whose priced gain is misleading without context: the model's number is right,
// but the rung must say why it is still the buy (mechanics.md "Eternity" row)
const NOTE: Record<string, string> = {
  Eternity: "priced at its map state: all five Eternal stack lines are kill-fed 45s buffs "
    + "— zero uptime on a boss (±0 there); the map figure assumes 120 stacks of each "
    + "kill-fed buff and 10 Eternal Reign (SS13 values, mechanics.md 'Eternity' row)",
};

// SS13 Eternity map state (user 2026-07-16: 120 kill-fed stacks, 10 Reign): only
// Morale/Nightmare/Reign carry DPS — Shadow is QoL, Guard is defense. Injected as
// parseable lines so the model prices them (mechanics.md "Eternity" row).
const ETERNITY_MAP_BUFFS =
    "+480% damage\n+120% Attack and Cast Speed\n"                    // Morale x120
  + "+240% Critical Strike Rating\n+120% Critical Strike Damage\n"   // Nightmare x120
  + "+100% additional damage";                                       // Reign x10, stacks additive

const REWORK: Record<string, ReworkInfo> = {
  "Ghost Slaughter": { anchor: "#b-fervor", label: "+ Vorax boot",
    why: "a dead slot until the Vorax boots hold Fervor — buy the engine before the glove. "
       + "See the Fervor engine bundle." },
  "Rare|int_boots": { anchor: "#b-cold", label: "+ Focus Blessing on hit Slate",
    why: "drops Grace Boots' Focus Blessing trigger — cover it first with the God of "
       + "Knowledge slate (Focus Blessing on hitting Frostbitten enemies) in the Cold bundle." },
};

/* Ember craft pools scraped from tlidb.com/en/Craft (extract_craft_pools.py).
   Key: "<Gear Type>|<normalized template>"; cost model: basic 1x, advanced 3x, ultimate 6x. */
const CRAFT_POOLS: Record<string, string> =
  JSON.parse(fs.readFileSync(fromRoot("data/craft_pools.json"), "utf-8"));
const POOL_COST: Record<string, number> = { basic: 1, advanced: 3, ultimate: 6 };

/** "int_shield" -> "INT Shield", "one-handed_sword" -> "One-Handed Sword" (tlidb naming). */
function gearTypeOf(sub: string): string {
  return sub.split("_").map(w =>
    /^(str|dex|int)$/.test(w) ? w.toUpperCase()
      : w.split("-").map(p => p[0].toUpperCase() + p.slice(1)).join("-")).join(" ");
}

/** Must mirror norm() in extract_craft_pools.py or lookups silently miss. */
function normTemplate(s: string): string {
  return s.replace(/<[^>]+>/g, " ")
    .replace(/\(\d+(?:\.\d+)?\s*[–-]\s*\d+(?:\.\d+)?\)/g, "#")
    .replace(/\d+(?:\.\d+)?/g, "#")
    .replace(/[+-]\s*#/g, "#")
    .replace(/#\s*%/g, "#%")
    .replace(/\s+/g, " ").trim();
}

// Some multi-line affixes appear on the craft page as their first line only.
function poolOf(item: any, aff: any): string | null {
  const g = gearTypeOf(item.gearSubType);
  return CRAFT_POOLS[`${g}|${normTemplate(aff.modifierDescription)}`]
      ?? CRAFT_POOLS[`${g}|${normTemplate(aff.modifierDescription.split("\n")[0])}`]
      ?? null;
}

export interface ModRow {
  text: string; pool: string | null; cost: number | null;
  gain: number; per: number | null; vs: string | null;
}

const GEAR_DB: any = JSON.parse(fs.readFileSync(fromRoot("data/gear-en.json"), "utf-8"));

/** Walk template & rawText together; each '#' consumes "(lo–hi)" or a number -> best roll
    (for negative tokens the low-magnitude end is the best roll). */
export function bestRolls(template: string, raw: string): number[] | null {
  const out: number[] = [];
  let i = 0, j = 0;
  const skipWs = (s: string, k: number): number => {
    while (k < s.length && /\s/.test(s[k])) k++;
    return k;
  };
  while (i < template.length) {
    if (/\s/.test(template[i])) {
      i = skipWs(template, i);
      j = skipWs(raw, j);
      continue;
    }
    if (template[i] !== "#") {
      if (raw[j] !== template[i]) return null;
      i++; j++;
      continue;
    }
    i++;
    let sign = 1;
    if (raw[j] === "-") { sign = -1; j++; }
    const m = /^\((\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\)|^(\d+(?:\.\d+)?)/.exec(raw.slice(j));
    if (!m) return null;
    j += m[0].length;
    out.push(m[3] !== undefined ? sign * parseFloat(m[3])
      : sign > 0 ? parseFloat(m[2]) : -parseFloat(m[1]));
  }
  return out;
}

/** Best-roll values of the tier below this affix's rolled tier (tiers listed best-first
    in the tlicompendium bundle), or null when bottom tier / not in the craft pool. */
function tierBelowBest(item: any, aff: any): number[] | null {
  const pool = GEAR_DB[`gear/${item.gearCategory}/${item.gearSubType}/i18n/en`];
  const entry = pool?.craftPrefix?.[aff.affixId] ?? pool?.craftSuffix?.[aff.affixId];
  if (!entry?.tiers) return null;
  const idx = entry.tiers.findIndex((t: any) => t.id === aff.tierId);
  const below = idx >= 0 ? entry.tiers[idx + 1] : undefined;
  if (!below) return null;
  const vals = bestRolls(entry.descriptionTemplate, below.rawText);
  return vals && vals.length === (aff.rolledValues ?? []).length ? vals : null;
}

/** Marginal ΔDPS of each crafted line — the TIER STEP: this roll vs the same affix at
    the best roll of one tier lower (user 2026-07-15: a T0 craft replaces a T1 line, so
    +124% Gear Phys vs T1's 100 is worth 24 points, not 124). Bottom-tier or unpooled
    lines fall back to line-vs-nothing. per = gain / ember cost. */
function statBreakdown(build: any, slot: string, item: any, fullDps: number): ModRow[] {
  const rows: ModRow[] = [];
  for (const side of ["prefixes", "suffixes"] as const) {
    (item[side] ?? []).forEach((aff: any, i: number) => {
      const variant = deepCopy(item);
      const below = tierBelowBest(item, aff);
      let vs: string | null = null;
      if (below) {
        variant[side][i].rolledValues.forEach((rv: any, k: number) => { rv.value = below[k]; });
        vs = substitute(aff.modifierDescription, below);
      } else {
        variant[side].splice(i, 1);
      }
      const gain = pyRound((fullDps / dpsWith(build, slot, variant) - 1) * 100, 1);
      const pool = poolOf(item, aff);
      const cost = pool ? POOL_COST[pool] : null;
      rows.push({ text: substitute(aff.modifierDescription,
                                   (aff.rolledValues ?? []).map((rv: any) => rv.value)),
                  pool, cost, gain, per: cost ? pyRound(gain / cost, 2) : null, vs });
    });
  }
  rows.sort((a, b) => (b.per ?? -1) - (a.per ?? -1));
  return rows;
}

export function _load(): any {
  return JSON.parse(fs.readFileSync(BUILD, "utf-8"));
}

function loadoutsOf(build: any): any[] {
  return [...build.loadouts.loadouts].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** Vorax gear carries its legendary name on an affix, not on the item. */
function voraxName(it: any): string | null {
  if (!it.limbType) return null;
  return (it.affixes ?? []).find((a: any) => a.legendaryName)?.legendaryName ?? it.limbType;
}

/** What the item IS — two rungs with the same identity are the same rework state. */
function identity(it: any): string {
  const vx = voraxName(it);
  if (vx) return vx;
  if (it.legendaryItem) return it.legendaryItem.name;
  return `${it.rarity}|${it.gearSubType}`;
}

function nameOf(it: any): string {
  const vx = voraxName(it);
  if (vx) return `${vx} (Vorax)`;
  return it.displayName || (it.legendaryItem ?? it.baseItem ?? {}).name || "?";
}

interface RawRung { label: string; item: any; order: number }

/** Item ids are REUSED across loadouts for DIFFERENT items, and a rung gets re-rolled
    in place — so the label is the identity, and the newest copy of it wins. */
function add(rungs: RawRung[], label: string, it: any, order: number): void {
  for (const r of rungs) {
    if (r.label === label) {
      r.item = it;
      return;
    }
  }
  rungs.push({ label, item: it, order });
}

/** Distinct rungs each slot passes through, in loadout order. */
export function ladders(build: any): Record<string, RawRung[]> {
  const out: Record<string, RawRung[]> = {};
  loadoutsOf(build).forEach((lo, n) => {
    const inv = new Map<string, any>(lo.gear.inventory.map((i: any) => [i.id, i]));
    for (const v of lo.vorax?.inventory ?? []) inv.set(v.id, v);   // Dawn Break lives here
    for (const [slot, itemId] of Object.entries<string>(lo.gear.equipped)) {
      const it = inv.get(itemId);
      if (it != null) {
        add(out[slot] ??= [], rungLabel(it), it, n);
      }
    }
    // rung zero can sit unequipped in the stash: its customName names its slot
    const equippedIds = new Set(Object.values(lo.gear.equipped));
    for (const it of lo.gear.inventory) {
      const cn = (it.customName ?? "").toLowerCase();
      const slot = ["mainHand", "offHand"].find(s => cn.includes(s.toLowerCase()));
      if (!equippedIds.has(it.id) && slot) add(out[slot] ??= [], rungLabel(it), it, -1);
    }
  });
  for (const rungs of Object.values(out)) rungs.sort((a, b) => a.order - b.order);
  return out;
}

/** Reference build with this slot's item replaced. Everything else held constant. */
const CRIT_DMG_SUPPORT = "dcb47367-34df-5e86-a9df-0b5d5f130998";
const STEAMROLL_SUPPORT = "4830642f-32e5-56ef-9de7-61ed678cb883";

const JOINED_FORCE_LINE =
  "Adds 60% of the damage of the Off-Hand Weapon to the final damage of the Main-Hand Weapon";

function dpsWith(build: any, slot: string, item: any, opts: { keepPrism?: boolean } = {}): number {
  const b = deepCopy(build);
  const lo = b.loadouts.loadouts.find((l: any) => l.name === REFERENCE);
  b.loadouts.currentLoadoutId = lo.id;
  if (slot === "boots") {
    lo.vorax.inventory = [];   // no double Fervor source on a swap
    // dependents keep their own marginal (user 2026-07-16): boots price without
    // Ghost Slaughter; the fixed-rating prism stays only for the tree-change range
    const gl = ladders(build).gloves;
    const prevGloves = { ...gl[gl.length - 2].item, id: "ladder-prev-gloves" };
    lo.gear.inventory = [...lo.gear.inventory.filter((i: any) => i.id !== lo.gear.equipped.gloves), prevGloves];
    lo.gear.equipped.gloves = prevGloves.id;
    if (!opts.keepPrism) {
      for (const ts of lo.skillTree.slots) {
        if (/fixed Fervor Rating/.test(ts.prismCoreTalentOverride?.description ?? "")) {
          ts.prismCoreTalentOverride = null;
        }
      }
    }
  }
  // a sword-stage player runs the Joined Force notable; the reference tree can't hold
  // bladerunner's, so it rides in as a pseudo base affix (mechanics.md#joined-force)
  if (slot === "offHand" && !/shield/i.test(item.gearSubType ?? "") && !item.baseAffix2) {
    item = { ...item, baseAffix2: { description: JOINED_FORCE_LINE } };
  }
  // blends are player-applied enchants, not item properties — slot-invariant
  if (slot === "belt") {
    const refBelt = lo.gear.inventory.find((i: any) => i.id === lo.gear.equipped.belt);
    item = { ...item, beltBlend: refBelt?.beltBlend ?? null };
  }
  if (item.limbType) {
    lo.vorax.inventory = [item];   // vorax gear parses via voraxLines, not gear.inventory
    lo.gear.inventory = lo.gear.inventory.filter((i: any) => i.id !== lo.gear.equipped[slot]);
  } else {
    lo.gear.inventory = [...lo.gear.inventory.filter((i: any) => i.id !== lo.gear.equipped[slot]), item];
  }
  lo.gear.equipped[slot] = item.id;
  let dps = cycleDps(parseBuild(b)[0]).dps;
  // A mainhand whose tower sequence grants Steamroll frees a support socket (user
  // 2026-07-15: "whatever you add is your increase"). Rungs WITHOUT the sequence are
  // priced with the player re-socketing Steamroll over Critical Strike Damage Increase
  // (the one non-structural socket) — whichever config is better.
  if (slot === "mainHand" && !/Steamroll/.test(item.towerSequence?.description ?? "")) {
    for (const sk of lo.skills.activeSkills) {
      for (const sup of (sk.supports ?? []).filter(Boolean)) {
        if (sup.supportGuid === CRIT_DMG_SUPPORT) sup.supportGuid = STEAMROLL_SUPPORT;
      }
    }
    dps = Math.max(dps, cycleDps(parseBuild(b)[0]).dps);
  }
  return dps;
}

function rungLabel(it: any): string {
  const cn = it.customName;
  if (cn) return cn.replace(/\s*-\s*TODO$/, "");
  return nameOf(it);
}

export interface LadderRung {
  label: string; name: string; rarity: string | null;
  dps: number | null; gain: number | null; gainTop: number | null;
  gainNote: string | null;
  rangeNote: string | null; rangeAnchor: string | null; linear: boolean;
  note: string | null;
  rework: { anchor: string | null; label: string; why: string } | null;
  mods: ModRow[] | null;
}
export interface LadderRow { slot: string; rungs: LadderRung[] }

/** The item with every crafted line at the best roll one tier below its exported
    tier — what a freshly bought, uncrafted copy realistically looks like
    (mechanics.md#assumptions "Ladder rung gains are a range"). */
function entryVariant(item: any): any | null {
  const v = deepCopy(item);
  let changed = false;
  for (const side of ["prefixes", "suffixes"] as const) {
    (item[side] ?? []).forEach((aff: any, i: number) => {
      if (!aff) return;
      const below = tierBelowBest(item, aff);
      if (below) {
        v[side][i].rolledValues.forEach((rv: any, k: number) => { rv.value = below[k]; });
        changed = true;
      }
    });
  }
  return changed ? v : null;
}

export function buildRows(): LadderRow[] {
  const build = _load();
  const rows: LadderRow[] = [];
  for (const [slot, rungs] of Object.entries(ladders(build))) {
    if (rungs.length < 2) continue;
    const out: LadderRung[] = [];
    let prevIdent: string | null = null;
    let prev: number | null = null;
    for (const r of rungs) {
      const it = r.item;
      const ident = identity(it);
      const rework = prevIdent !== null && ident !== prevIdent ? REWORK[ident] ?? null : null;
      prevIdent = ident;
      const dps = dpsWith(build, slot, it);
      const entry = it.rarity === "Rare" ? entryVariant(it) : null;
      const entryDps = entry ? dpsWith(build, slot, entry) : dps;
      let gain = prev ? pyRound((entryDps / prev - 1) * 100, 1) : null;
      let gainNote: string | null = null;
      if (ident === "Eternity" && prev) {
        const mapDps = dpsWith(build, slot,
          { ...it, baseAffix2: { description: ETERNITY_MAP_BUFFS } });
        gain = pyRound((mapDps / prev - 1) * 100, 1);
        gainNote = "map";
      }
      let gainTop = prev && entry ? pyRound((dps / prev - 1) * 100, 1) : null;
      let rangeNote: string | null = entry ? "entry roll → fully crafted" : null;
      let rangeAnchor: string | null = null;
      // vorax boots price twice: alone, and with the fixed-rating tree change
      if (it.limbType && prev) {
        gainTop = pyRound((dpsWith(build, slot, it, { keepPrism: true }) / prev - 1) * 100, 1);
        rangeNote = "boots alone → with the Fervor tree change";
        rangeAnchor = "#b-fervor-tree";
      }
      out.push({
        label: r.label, name: nameOf(it), rarity: it.rarity ?? null,
        dps: pyRound(dps / 1e6, 1),
        gain, gainNote, gainTop, rangeNote, rangeAnchor,
        note: NOTE[ident] ?? null,
        linear: !rework,
        rework: rework ? { anchor: rework.anchor, label: rework.label, why: rework.why } : null,
        mods: it.rarity === "Rare" ? statBreakdown(build, slot, it, dps) : null,
      });
      prev = dps;
    }
    rows.push({ slot, rungs: out });
  }
  rows.sort((a, b) => {
    const ia = SLOT_ORDER.indexOf(a.slot), ib = SLOT_ORDER.indexOf(b.slot);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return rows;
}

export function inject(rows: LadderRow[]): void {
  fs.writeFileSync(OUT, asciiJson(rows), "utf-8");
}
