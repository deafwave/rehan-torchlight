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

interface ReworkInfo { anchor: string | null; priced: boolean; why: string }

// A rung that changes the item's ROLE isn't linear progression — it's a rework.
// priced=false means the item's real effect lives in a manual override, not in its parsed
// affixes, so swapping it out does NOT remove that effect: the model cannot honestly price it.
const REWORK: Record<string, ReworkInfo> = {
  "Ghost Slaughter": { anchor: "#b-fervor", priced: true,
    why: "swaps ES gloves for a Fervor engine — a new multiplier and a new drain. "
       + "See the Fervor engine bundle." },
  "Heart of Animitta": { anchor: "#b-finisher", priced: false,
    why: "+1 Finisher charge is baked into the model as a constant (8 points), so the "
       + "model can't price its removal. Reworks the finisher itself." },
  "Eternity": { anchor: "#b-fervor", priced: false,
    why: "kill-fed blessing stacks are unmodeled — a sustain rework, not a stat step." },
  "Light Hunter Belt": { anchor: null, priced: false, why: "legendary swap; its blessings are unmodeled." },
  "Bodhi Girdle": { anchor: null, priced: false, why: "legendary swap; its blessings are unmodeled." },
  "Grace Boots": { anchor: null, priced: false, why: "legendary swap on a slot the model barely reads." },
  "Vortex Heart": { anchor: null, priced: false, why: "legendary swap, different rules than the necklace after it." },
  "Rare|int_shield": { anchor: "#b-warcry", priced: true,
    why: "trades an offhand sword's stat sticks for Warcry Effect + Finisher Amplification — "
       + "near-zero ΔDPS, but the sword prices none of a shield's defense. See the Warcry bundle." },
};
const GENERIC_REWORK: ReworkInfo =
  { anchor: null, priced: true, why: "different item class — the rules change, not just the numbers." };

// Slots whose equipped item the parser never sees; the ladder must say so rather than
// imply the rung before it is the top.
const UNPARSED_TAIL: Record<string, [string, string, string]> = {
  boots: ["Dawn Break (Vorax)", "#b-fervor",
          "Vorax boots hold Fervor for the whole engine — unparsed by the model, "
        + "so this rung has no price here."],
};

const SLOT_UNPRICED: Record<string, string> = {
  boots: "this slot ends on Vorax boots (Dawn Break), which sit outside the gear inventory the "
       + "parser reads — yet they are what holds Fervor, which the model assumes at 100 rating "
       + "regardless. Every rung here would be priced against a build that keeps Fervor for free.",
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
  gain: number; per: number | null;
}

/** Marginal ΔDPS of each crafted line: remove it, re-run, diff. per = gain / ember cost. */
function statBreakdown(build: any, slot: string, item: any, fullDps: number): ModRow[] {
  const rows: ModRow[] = [];
  for (const side of ["prefixes", "suffixes"] as const) {
    (item[side] ?? []).forEach((aff: any, i: number) => {
      const stripped = deepCopy(item);
      stripped[side].splice(i, 1);
      const gain = pyRound((fullDps / dpsWith(build, slot, stripped) - 1) * 100, 1);
      const pool = poolOf(item, aff);
      const cost = pool ? POOL_COST[pool] : null;
      rows.push({ text: substitute(aff.modifierDescription,
                                   (aff.rolledValues ?? []).map((rv: any) => rv.value)),
                  pool, cost, gain, per: cost ? pyRound(gain / cost, 2) : null });
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

/** What the item IS — two rungs with the same identity are the same rework state. */
function identity(it: any): string {
  if (it.legendaryItem) return it.legendaryItem.name;
  return `${it.rarity}|${it.gearSubType}`;
}

function nameOf(it: any): string {
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
    for (const [slot, itemId] of Object.entries<string>(lo.gear.equipped)) {
      const it = inv.get(itemId);
      if (it != null) {      // vorax boots live outside gear.inventory
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

function dpsWith(build: any, slot: string, item: any): number {
  const b = deepCopy(build);
  const lo = b.loadouts.loadouts.find((l: any) => l.name === REFERENCE);
  b.loadouts.currentLoadoutId = lo.id;
  lo.gear.inventory = [...lo.gear.inventory.filter((i: any) => i.id !== lo.gear.equipped[slot]), item];
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
  dps: number | null; gain: number | null; linear: boolean;
  rework: { anchor: string | null; why: string } | null;
  mods: ModRow[] | null;
}
export interface LadderRow { slot: string; rungs: LadderRung[]; note: string | null }

export function buildRows(): LadderRow[] {
  const build = _load();
  const rows: LadderRow[] = [];
  for (const [slot, rungs] of Object.entries(ladders(build))) {
    if (rungs.length < 2) continue;
    const out: LadderRung[] = [];
    const marks: boolean[] = [];
    let prevIdent: string | null = null;
    for (const r of rungs) {
      const it = r.item;
      const ident = identity(it);
      const linear = prevIdent === null || ident === prevIdent;
      const rework = linear ? null : (REWORK[ident] ?? GENERIC_REWORK);
      out.push({ label: r.label, name: nameOf(it), rarity: it.rarity ?? null,
                 dps: null, gain: null, linear,
                 rework: rework ? { anchor: rework.anchor, why: rework.why } : null,
                 mods: null });
      marks.push(rework ? rework.priced : true);
      prevIdent = ident;
    }
    const tail = UNPARSED_TAIL[slot];
    if (tail) {
      out.push({ label: tail[0], name: "not in the gear inventory",
                 rarity: "Vorax", dps: null, gain: null, linear: false,
                 rework: { anchor: tail[1], why: tail[2] }, mods: null });
    }

    // Prices are diffs against the reference build. If the top rung isn't something the
    // model can price, there is no honest baseline to diff against — price nothing.
    const note = SLOT_UNPRICED[slot]
      ?? (marks[marks.length - 1] ? null : REWORK[identity(rungs[rungs.length - 1].item)].why);
    if (note === null) {
      let prev: number | null = null;
      rungs.forEach((r, i) => {
        if (!marks[i]) {
          prev = null;
          return;
        }
        const dps = dpsWith(build, slot, r.item);
        out[i].dps = pyRound(dps / 1e6, 1);
        out[i].gain = prev ? pyRound((dps / prev - 1) * 100, 1) : null;
        if (r.item.rarity === "Rare") out[i].mods = statBreakdown(build, slot, r.item, dps);
        prev = dps;
      });
    }
    rows.push({ slot, rungs: out, note });
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
