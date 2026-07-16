/* Per-slot gear ladder: every rung an item passes through across the loadouts,
   priced by swapping it into a fixed REFERENCE build (every other slot at the top of its
   own ladder) — so each number is what that one slot contributes to a finished build.

   Writes the result to packages/page/src/data/ladder.json for the Vite page (main.ts imports it). */
import fs from "node:fs";
import { fromRoot, pyRound, deepCopy, asciiJson } from "./py.js";
import { parseBuild, substitute, warcryLayer } from "./buildParser.js";
import { impactOf, applyStat } from "./catalog.js";
import { cycleDps, type Snapshot } from "./damageModel.js";

export const BUILD = fromRoot("data/Rehan.json");
export const OUT = fromRoot("packages/page/src/data/ladder.json");
export const PRISMS_OUT = fromRoot("packages/page/src/data/prisms.json");
const REFERENCE = "more_1";      // every slot at its top rung

const SLOT_ORDER = ["mainHand", "offHand", "gloves", "helmet", "chest",
                    "ring1", "ring2", "belt", "necklace", "boots"];

interface ReworkInfo { label: string }

// A step is a REWORK only when the incoming item breaks or depends on something
// outside its slot (user 2026-07-16); pure stat swaps are linear even across item
// classes, and even when DPS-negative (Eternity).
const NOTE: Record<string, string> = {
  "Light Hunter Belt": "Dawnbreaker is the glass-cannon alternative: more damage, "
    + "but none of this belt's defense",
};

// the sealed-mana helmet rebuild funds the Lich -> Ranger tree swap (its +10 Support
// Skill Levels replace Lich's payload); non-sealed helmets price with Lich restored
const SEALED_MANA = /Sealed Mana Compensation/;
const hasSealedMana = (it: any): boolean =>
  [...(it.prefixes ?? []), ...(it.suffixes ?? [])].filter(Boolean)
    .some((a: any) => SEALED_MANA.test(a.modifierDescription ?? ""));

// SS13 Eternity map state (user 2026-07-16: 120 kill-fed stacks, 10 Reign): only
// Morale/Nightmare/Reign carry DPS — Shadow is QoL, Guard is defense. Injected as
// parseable lines so the model prices them (mechanics.md "Eternity" row).
const ETERNITY_MAP_BUFFS =
    "+480% damage\n+120% Attack and Cast Speed\n"                    // Morale x120
  + "+240% Critical Strike Rating\n+120% Critical Strike Damage\n"   // Nightmare x120
  + "+100% additional damage";                                       // Reign x10, stacks additive

const REWORK: Record<string, ReworkInfo> = {
  // "·" splits the label into stacked branch lines on the tree node
  "Rare|int_shield": {
    label: "+ i86 Hasten boots · → God of Might tree · → Brave tree" },
  "Ghost Slaughter": { label: "+ Vorax Fervor Boot" },
  "Rare|int_boots": { label: "+ Focus Blessing on hit Slate" },
  "Rare|int_helmet|sealed": { label: "+ Vorax Fervor Boot" },
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
  return `${it.rarity}|${it.gearSubType}${hasSealedMana(it) ? "|sealed" : ""}`;
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
        add(out[slot] ??= [], rungLabel(it, slot), it, n);
      }
    }
    // rung zero can sit unequipped in the stash: its customName names its slot
    const equippedIds = new Set(Object.values(lo.gear.equipped));
    for (const it of lo.gear.inventory) {
      const cn = (it.customName ?? "").toLowerCase();
      const slot = ["mainHand", "offHand"].find(s => cn.includes(s.toLowerCase()));
      if (!equippedIds.has(it.id) && slot) add(out[slot] ??= [], rungLabel(it, slot), it, -1);
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
  // a non-sealed helmet can't fund the Lich -> Ranger swap: without its +10 Support
  // Skill Levels the fourth tree slot must stay Lich, so those rungs price with the
  // latest Lich-era tree (and lose the Ranger slot's prism with it)
  if (slot === "helmet" && !hasSealedMana(item)) {
    const donor = [...build.loadouts.loadouts].reverse()
      .find((l: any) => l.skillTree.slots.some((s: any) => s.treeId === "lich"))
      ?.skillTree.slots.find((s: any) => s.treeId === "lich");
    const i = lo.skillTree.slots.findIndex((s: any) => s.treeId === "ranger");
    if (donor && i >= 0) lo.skillTree.slots[i] = deepCopy(donor);
  }
  // the swap itself lands before the prism: the sealed rung prices at the 100 rating
  // cap unless keepPrism asks for the fixed-130 upper bound
  if (slot === "helmet" && hasSealedMana(item) && !opts.keepPrism) {
    for (const ts of lo.skillTree.slots) {
      if (/fixed Fervor Rating/.test(ts.prismCoreTalentOverride?.description ?? "")) {
        ts.prismCoreTalentOverride = null;
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

// Planner customNames can collide across rebuilds (two different helmets both named
// "i86 ES"); an affix marker splits them into their own rungs so the swap is visible.
// i100 = priceless designation used by the progression page craft-order filter.
const RELABEL: [slot: string, marker: RegExp, label: string][] = [
  ["helmet", /Sealed Mana Compensation/, "i100 sealed mana"],
];

function rungLabel(it: any, slot: string): string {
  for (const [s, marker, label] of RELABEL) {
    if (s === slot && [...(it.prefixes ?? []), ...(it.suffixes ?? [])].filter(Boolean)
        .some((a: any) => marker.test(a.modifierDescription ?? ""))) {
      return label;
    }
  }
  const cn = it.customName;
  if (cn) return cn.replace(/\s*-\s*TODO$/, "");
  return nameOf(it);
}

export interface LadderRung {
  label: string; name: string; rarity: string | null;
  dps: number | null; gain: number | null; gainTop: number | null;
  gainNote: string | null;
  rangeNote: string | null; rangeLabel: string | null;
  linear: boolean;
  note: string | null;
  rework: ReworkInfo | null;
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
      let rangeLabel: string | null = null;
      // vorax boots price twice: alone, and with the fixed-rating tree change
      if (it.limbType && prev) {
        gainTop = pyRound((dpsWith(build, slot, it, { keepPrism: true }) / prev - 1) * 100, 1);
        rangeNote = "boots alone → with the Fervor tree change";
        rangeLabel = "+ tree change";
      }
      // ditto the sealed helmet: the Ranger swap lands before the prism does
      if (ident.endsWith("|sealed") && prev) {
        gainTop = pyRound((dpsWith(build, slot, it, { keepPrism: true }) / prev - 1) * 100, 1);
        rangeNote = "at the 100 Fervor Rating cap → with the fixed-rating prism";
        rangeLabel = "→ Ranger Tree";
      }
      out.push({
        label: r.label, name: nameOf(it), rarity: it.rarity ?? null,
        dps: pyRound(dps / 1e6, 1),
        gain, gainNote, gainTop, rangeNote, rangeLabel,
        note: NOTE[ident] ?? null,
        linear: !rework,
        rework,
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

export interface PrismRung { label: string; delta: number | null; note: string | null }
export interface PrismLadder { name: string; rungs: PrismRung[] }

/* mechanics.md 'Inverse Prism': the inverse adds a scaled COPY of the covered Brave
   nodes on top of the originals. In-game values (user 2026-07-16) at +48% Legendary
   +17% Medium: legendaries -> +6 min enemies (5.92 rounds) and +11.8% additional AD (1H);
   mediums -> +21.1% Warcry Effect, +42% damage (shield), +63.2% Attack Damage (1H).
   The bad roll (+17% Legendary, +0% Medium) copies legendaries only: min enemies
   4 x 1.17 = 4.68 shows 4 in-game; 8 x 1.17 = 9.4% additional AD is inferred.
   The good rung prices the buy target of +38% Legendary minimum (user 2026-07-16):
   legendaries 4 x 1.38 = 5.52 shows 6 min enemies in-game and 8 x 1.38 = 11.0%
   additional AD; mediums stay at the +17% in-game values.
   Floor 8 parsed + copy = 12/14, under the Formless-doubled 16-stack cap. */
interface InverseCopy {
  minEnemies: number; effectPct: number; incGlobal: number; incAttack: number; addlPct: number;
}
const INVERSE_BAD: InverseCopy =
  { minEnemies: 4, effectPct: 0, incGlobal: 0, incAttack: 0, addlPct: 9.4 };
const INVERSE_GOOD: InverseCopy =
  { minEnemies: 6, effectPct: 21.1, incGlobal: 42, incAttack: 63.2, addlPct: 11.0 };

/* one combined application: both warcry terms must land in a single warcryLayer
   recompute — sequential applyStat calls each rebuild from the original _derived */
function inverseImpact(snap: Snapshot, c: InverseCopy): number {
  const s = deepCopy(snap);
  delete (s as any)._extras;
  const base = cycleDps(s).dps;
  const d = (s as any)._derived;
  s.additional.warcry_buffs = warcryLayer({ ...d,
    warcry_min_enemies: d.warcry_min_enemies + c.minEnemies,
    warcry_effect_pct: d.warcry_effect_pct + c.effectPct });
  s.increased.global += c.incGlobal;
  s.increased.attack += c.incAttack;
  applyStat(s, "additional.misc", c.addlPct);
  return pyRound((cycleDps(s).dps / base - 1) * 100, 2);
}
const HAZE_ADDL_PCT = 12;        // Haze base affix: +12% additional Attack Damage (1H)

export function buildPrisms(): PrismLadder[] {
  const snap: Snapshot = JSON.parse(fs.readFileSync(fromRoot("data/snapshot.json"), "utf-8"));
  const build = _load();
  // Unmatched Valor priced by parse: the reference with vs without its prism override
  // (no override = the normal 100 rating cap)
  const stripped = deepCopy(build);
  const lo = stripped.loadouts.loadouts.find((l: any) => l.name === REFERENCE);
  for (const ts of lo.skillTree.slots) {
    if (/fixed Fervor Rating/.test(ts.prismCoreTalentOverride?.description ?? "")) {
      ts.prismCoreTalentOverride = null;
    }
  }
  const valor = pyRound((cycleDps(parseBuild(build)[0]).dps
    / cycleDps(parseBuild(stripped)[0]).dps - 1) * 100, 2);
  const rounded = (path: string, v: number) => pyRound(impactOf(path, v, snap)!, 2);
  return [
    { name: "Ethereal Prism", rungs: [
      { label: "Haze — +12% additional Attack Damage (1H)",
        delta: rounded("additional.misc", HAZE_ADDL_PCT), note: null },
      { label: "Unmatched Valor — fixed 130 Fervor Rating", delta: valor,
        note: "needs the sealed-mana helmet + Dawn Break (the Ranger slot); replaces its core talent" },
      { label: "“no longer replaces” roll on the Valor prism", delta: null,
        note: "-8% Defense · the mutated core no longer replaces the original — keep the "
            + "Ranger core (Keep It Up) AND the 130 rating" },
    ]},
    { name: "Inverse Prism — the Brave tree", rungs: [
      { label: "Brave warcry setup, no inverse", delta: null,
        note: "floor 8: +4 Brave talent + 4 slate — the 16-stack cap (Formless doubles "
            + "Shockwave's 8) leaves room for the inverse copy" },
      { label: "bad inverse — +17% Legendary Medium, +0% Medium",
        delta: inverseImpact(snap, INVERSE_BAD),
        note: "copies the legendaries only: +4 min enemies (4.68 shows 4 in-game) "
            + "+ ~9.4% additional AD — floor 8 → 12" },
      { label: "good inverse — +38% Legendary Medium, +17% Medium",
        delta: inverseImpact(snap, INVERSE_GOOD),
        note: "the buy target (in-game): +6 min enemies (5.52 rounds up, floor 14 of 16) "
            + "· +21.1% Warcry Effect · +42% dmg (shield) + +63.2% Attack dmg (1H) "
            + "· +11.0% additional AD" },
    ]},
  ];
}

export function injectPrisms(ladders: PrismLadder[]): void {
  fs.writeFileSync(PRISMS_OUT, asciiJson(ladders), "utf-8");
}
