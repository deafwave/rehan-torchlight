/* Planner-JSON -> affix lines -> stats snapshot, with a mandatory coverage report. */
import fs from "node:fs";
import { fromRoot, pyG, deepCopy } from "./py.js";
import { DEFAULT_SNAPSHOT, type Snapshot } from "./damageModel.js";

const CACHE = fromRoot(".claude/skills/tli-build/cache");

export interface Line {
  source: string;
  slot: string;
  text: string;
  points?: number;
}

export function substitute(desc: string, values: unknown[]): string {
  const out: string[] = [];
  const vals = [...values];
  for (const ch of desc) {
    if (ch === "#" && vals.length) {
      const v = vals.shift();
      out.push(typeof v === "number" ? pyG(v) : String(v));
    } else {
      out.push(ch);
    }
  }
  return out.join("");
}

export function _load(name: string): any {
  return JSON.parse(fs.readFileSync(`${CACHE}/${name}`, "utf-8"));
}

/* A blend often exports as its talent NAME only ("Caged Fury"); the effect lines
   live in the gear cache's beltBlends table. */
let BELT_BLENDS: Record<string, any> | null = null;
function blendLines(blend: any): string[] {
  if (!blend) return [];
  BELT_BLENDS ??= _load("SS12.5-gear-en.json")["gear/trinket/belt/i18n/en"]?.beltBlends ?? {};
  const texts = BELT_BLENDS![blend.blendId]?.aromaticModifiers
    ?.map((m: any) => m.rawText).filter(Boolean);
  return texts?.length ? texts : [blend.description ?? ""];
}

function* gearLines(lo: any): Generator<Line> {
  const inv = new Map<string, any>(lo.gear.inventory.map((it: any) => [it.id, it]));
  for (const [slot, itemId] of Object.entries<string>(lo.gear.equipped)) {
    const it = inv.get(itemId);
    if (it == null) continue;
    const src = `gear:${slot}:${it.displayName ?? "?"}`;
    for (const m of it.legendaryMods ?? []) yield { source: src, slot, text: m.description };
    const base = it.baseItem ?? {};
    for (const imp of base.implicits ?? []) yield { source: src, slot, text: imp.description };
    // empty crafted slots export as null entries
    for (const aff of [...(it.prefixes ?? []), ...(it.suffixes ?? [])].filter(Boolean)) {
      const vals = (aff.rolledValues ?? []).map((rv: any) => rv.value);
      // multi-line affixes (ring "+1 Combo Points / ±% damage") classify per line
      for (const line of substitute(aff.modifierDescription, vals).split("\n")) {
        if (line.trim()) yield { source: src, slot, text: line.trim() };
      }
    }
    // tower sequences, belt blends and base/dream/corrosion affixes carry final text (no # placeholders)
    const extra = [it.towerSequence?.description, it.baseAffix?.description,
                   it.baseAffix2?.description, it.sweetDreamAffix?.description,
                   it.corrosionImplicit?.description, ...blendLines(it.beltBlend)];
    for (const desc of extra) {
      for (const line of (desc ?? "").split("\n")) {
        if (line.trim()) yield { source: src, slot, text: line.trim() };
      }
    }
  }
}

function* treeLines(lo: any): Generator<Line> {
  const cache = _load("SS12.5-talent-tree-en.json");
  for (const slot of lo.skillTree.slots) {
    const tree = cache[`talent-tree/${slot.treeId}/i18n/en`]?.tree ?? {};
    const nodes = tree.nodes ?? {};
    for (const [guid, points] of Object.entries<number>(slot.nodePoints ?? {})) {
      const node = nodes[guid];
      if (node == null) {
        yield { source: `tree:${slot.treeId}:${guid}`, slot: "tree",
                text: `UNRESOLVED NODE ${guid} (${points} pts)` };
        continue;
      }
      for (const line of node.description.split("<br>")) {
        if (line.trim()) {
          yield { source: `tree:${slot.treeId}:${node.name}`,
                  slot: "tree", text: line.trim(), points };
        }
      }
    }
    // notables are picked per tier in selectedNotable<level> fields, outside nodePoints
    for (const [field, guid] of Object.entries<string>(slot)) {
      if (!/^selectedNotable/.test(field) || !guid) continue;
      const notable = (tree.notables ?? {})[guid];
      if (notable == null) {
        yield { source: `tree:${slot.treeId}:${guid}`, slot: "tree",
                text: `UNRESOLVED NOTABLE ${guid}` };
        continue;
      }
      for (const line of notable.description.split(/<br>|\n/)) {
        const t = line.replace(/\s*\(Max Divinity Effect: \d+\)\s*$/, "").trim();
        if (t) yield { source: `tree:${slot.treeId}:${notable.name}`, slot: "tree", text: t };
      }
    }
    // Ethereal Prism core-talent overrides (e.g. Unmatched Valor's fixed Fervor
    // Rating) replace a core talent and live outside nodePoints
    const prism = slot.prismCoreTalentOverride;
    if (prism?.description) {
      for (const line of prism.description.split(/<br>|\n/)) {
        if (line.trim()) {
          yield { source: `tree:${slot.treeId}:prism:${prism.name ?? "core"}`,
                  slot: "tree", text: line.trim() };
        }
      }
    }
  }
}

function* traitLines(lo: any): Generator<Line> {
  const cache = _load("SS12.5-hero-trait-en.json")["hero-trait/i18n/en"].heroes;
  const hero = cache[lo.hero.heroGuid] ?? {};
  const traits = hero.traits ?? {};
  for (const [tier, guid] of Object.entries<string>(lo.hero.traits)) {
    const t = traits[guid];
    let name: string, desc: string;
    if (t !== null && typeof t === "object") {
      name = t.name ?? guid;
      desc = t.description ?? "";
    } else {
      name = guid;
      desc = String(t ?? "");
    }
    for (const line of desc.split(/<br\s*\/?>|\n/)) {
      if (line.trim()) yield { source: `trait:${tier}:${name}`, slot: "trait", text: line.trim() };
    }
  }
}

/** Memory affix text: '#' templates take rolled values; templates with baked
    sample numbers get their numbers replaced by the actual rolls, in order. */
export function fillTemplate(template: string, values: unknown[]): string {
  if (template.includes("#")) return substitute(template, values);
  if (!values.length) return template;
  const vals = values.map(v => (typeof v === "number" ? pyG(v) : String(v)));
  let i = 0;
  return template.replace(/\d+(?:\.\d+)?/g, m => (i < vals.length ? vals[i++] : m));
}

function* memoryLines(lo: any): Generator<Line> {
  const cache = _load("SS12.5-hero-memory-en.json")["hero-memory/i18n/en"];
  const lookup: Record<string, any> = {};
  for (const cat of Object.values<any>(cache)) {
    if (cat !== null && typeof cat === "object") Object.assign(lookup, cat);
  }
  const inv = new Map<string, any>(lo.heroMemories.inventory.map((m: any) => [m.id, m]));
  for (const [slot, memId] of Object.entries<string>(lo.heroMemories.equipped)) {
    const mem = inv.get(memId);
    if (mem == null) continue;
    const src = `memory:${slot}:${mem.customName || mem.memoryType || "?"}`;
    const affixes = [mem.baseStat, ...(mem.fixedAffixes ?? []), ...(mem.randomAffixes ?? [])];
    for (const aff of affixes) {
      if (!aff) continue;
      const entry = lookup[aff.guid];
      if (entry == null) {
        yield { source: src, slot: "memory", text: `UNRESOLVED MEMORY AFFIX ${aff.guid}` };
        continue;
      }
      let values: unknown[] = (aff.values ?? []).map((v: any) => v.value);
      if (!values.length) values = [aff.value];
      const text = fillTemplate(entry.template, values.filter(v => v != null));
      for (const line of text.split("\n")) {
        if (line.trim()) yield { source: src, slot: "memory", text: line.trim() };
      }
    }
  }
}

function* divinityLines(lo: any): Generator<Line> {
  const inv = new Map<string, any>(lo.divinity.inventory.map((s: any) => [s.id, s]));
  for (const placement of lo.divinity.placements) {
    const slate = inv.get(placement.slateId);
    if (slate == null) {
      yield { source: `slate:${placement.slateId.slice(0, 12)}`, slot: "slate",
              text: `UNRESOLVED SLATE ${placement.slateId}` };
      continue;
    }
    const name = slate.legendaryTemplate || slate.type || "slate";
    for (const aff of slate.affixes ?? []) {
      const src = `slate:${name}:${aff.nodeType ?? "?"}`;
      const desc = (aff.description ?? "").replace(/(\d) %/g, "$1%");
      for (const line of desc.split("\n")) {
        if (line.trim()) yield { source: src, slot: "slate", text: line.trim() };
      }
    }
  }
}

function* pactspiritLines(lo: any): Generator<Line> {
  const cache = _load("SS12.5-pactspirit-en.json")["pactspirit/i18n/en"].pactspirits;
  for (const p of lo.pactspirits ?? []) {
    const spirit = cache[p.guid];
    if (spirit == null) {
      yield { source: "pactspirit:UNRESOLVED", slot: "pactspirit",
              text: `UNRESOLVED PACTSPIRIT ${p.guid}` };
      continue;
    }
    const src = `pactspirit:${spirit.name}`;
    const prog: string[] = spirit.levelProgression ?? [];
    for (const nodeId of p.allocatedNodes ?? []) {
      const node = (spirit.nodes ?? {})[String(nodeId)];
      if (node == null) continue;
      let desc: string = node.description;
      if (node.name === spirit.notableName && prog.length) {
        // the notable's text is level-dependent and CUMULATIVE; the node's own
        // description is only its level-1 form
        desc = prog[Math.min(p.level ?? 1, prog.length) - 1].replace(/^\d+:\s*/, "");
      }
      for (const line of desc.split("\n")) {
        if (line.trim()) yield { source: src, slot: "pactspirit", text: line.trim() };
      }
    }
  }
}

/* Vorax gear (Dawn Break boots) sits in lo.vorax.inventory, not gear.inventory, and its
   mods live in `affixes` with values already baked into modifierDescription. */
function* voraxLines(lo: any): Generator<Line> {
  for (const it of lo.vorax?.inventory ?? []) {
    const src = `vorax:${it.limbType ?? "?"}`;
    const descs = [it.baseAffix?.description,
                   ...(it.affixes ?? []).filter(Boolean).map((a: any) => a.modifierDescription)];
    for (const desc of descs) {
      for (const line of (desc ?? "").split("\n")) {
        if (line.trim()) yield { source: src, slot: "vorax", text: line.trim() };
      }
    }
  }
}

/* The planner's "current" loadout is whatever the user last touched — often a scratch
   pad. Every consumer (catalog, ladder, page prose) prices against the finished build,
   so the default target is the reference loadout by name; current is only a fallback. */
export const PARSE_TARGET = "more_1";

function pickLoadout(build: any, loadoutIndex?: number | null): any {
  const loadouts = build.loadouts.loadouts;
  if (loadoutIndex != null) return loadouts[loadoutIndex];
  for (const lo of loadouts) if (lo.name?.trim() === PARSE_TARGET) return lo;
  const current = build.loadouts.currentLoadoutId;
  for (const lo of loadouts) if (lo.id === current) return lo;
  return loadouts[0];
}

export function extractLines(buildOrPath: string | object, loadoutIndex?: number | null): Line[] {
  const build = typeof buildOrPath === "string"
    ? JSON.parse(fs.readFileSync(buildOrPath, "utf-8"))
    : buildOrPath;
  const lo = pickLoadout(build, loadoutIndex);
  return [...gearLines(lo), ...voraxLines(lo), ...treeLines(lo), ...traitLines(lo),
          ...memoryLines(lo), ...divinityLines(lo), ...pactspiritLines(lo)];
}

export const NUM = "([+-]?\\d+(?:\\.\\d+)?)";

// tlidb Fervor_rating default cap; "Has # fixed Fervor Rating" (Unmatched Valor prism)
// bypasses it via extras.fervor_rating — 130 confirmed in-game (user 2026-07-16)
export const FERVOR_RATING = 100;
// mechanics.md#frostbite: base Max Frostbite Rating before gear/tree/memory raises
export const BASE_FROSTBITE_MAX = 120;
// mechanics.md#assumptions: sustained Life deficit under Ghost Slaughter's 12%/s drain,
// held above the 35% Low Life line (user 2026-07-16); scales "per 1% of Life lost" talents
export const LIFE_LOST_PCT = 60;
const LOW_LIFE_ENEMY_HP = 0.35;              // Low Life = below 35% Life (user 2026-07-16)
const FERVOR_CRIT_RATING_PER_POINT = 2;      // Fervor's native base effect
export const FEARLESS_RATING_BASE_PCT = 80;  // Precise: Fearless, before aura effect
export const FEARLESS_AS_PCT = 8;            // its melee attack speed line, before aura effect
const PRECISE_FEARLESS_RATING_PCT = 100;     // aura, not gear: +80% crit rating x 1.25 aura effect
const PARALYSIS_TAKEN_PCT = 15;              // tlidb Paralysis: +15% damage taken, 4s, 1 stack
const PURE_HEART_PER_STACK = 5;              // +5% additional Attack Damage per stack, MULTIPLIES
const PURE_HEART_STACKS = 5;                 // cap; full-uptime assumption (mechanics.md#assumptions)
const SHOCKWAVE_PER_ENEMY = 5.95;            // Shockwave Warcry at L20, per enemy affected
const SHOCKWAVE_MAX_STACKS = 8;              // "stacking up to 8 time(s)" — cache:SS12.5-skill-en.json; doubled to 16 by "Doubles Max Warcry Skill Effects" (user 2026-07-16)
const MARK_TAKEN_PCT = 30;                   // Spectral Slash starter's Mark, skill-inherent
const TIMID_CURSE_TAKEN_PCT = 39;            // Timid at L20: +39% additional Hit Damage taken
// tower-sequence Steamroll; tlidb: +31% additional Melee at Lv1, +41 Lv21, +51 Lv41
// (+0.5/level), -15% Attack Speed flat; the Ailment line is a no-op
const steamrollAddlPct = (lvl: number): number => 31 + (lvl - 1) * 0.5;
const STEAMROLL_AS_PCT = -15;
// Blessings at base 4 stacks (user-confirmed 2026-07-15); granted on crit / on hitting
// a Frostbitten enemy, so full stacks on a boss
const BLESSING_BASE_STACKS = 4;
const AGILITY_ADDL_PER_STACK = 2;
const AGILITY_AS_PER_STACK = 4;
export const FOCUS_ADDL_PER_STACK = 5;

// Bucket assignments come from docs/mechanics.md — reconcile after research.
// Order matters: first regex that searches successfully wins.
export const PATTERNS: [string, string][] = [
  [`\\+?${NUM}% Armor (?:Damage|DMG) Mitigation Penetration`, "penetration.armor_pct"],
  [`\\+?${NUM}% Cold Penetration(?! for Minions)`, "penetration.cold_pct"],
  // only the elemental half matters (build deals cold); erosion pen is a no-op
  [`\\+?${NUM}% Elemental and Erosion Resistance Penetration`, "penetration.cold_pct"],
  [`\\+${NUM}% Gear Physical Damage`, "base.gear_phys_pct"],
  [`Adds ${NUM} - ${NUM} Cold Damage to the gear`, "base.weapon_flat_cold"],
  [`Adds ${NUM} - ${NUM} Physical Damage to the gear`, "base.weapon_flat_phys_added"],
  [`^${NUM} - ${NUM} Physical Damage$`, "base.weapon_phys"],
  [`^${NUM} Critical Strike Rating$`, "crit.rating_flat"],
  [`^${NUM} Attack Speed$`, "base.weapon_attack_speed_set"],
  [`\\+${NUM}% gear Attack Speed`, "base.gear_attack_speed_pct"],
  // Enhancement is NOT Amplification: Enhancement affixes sum into ONE additional
  // multiplier on all Combo Skill damage; only Amplification joins the per-point amp
  [`\\+${NUM}% Combo Damage Enhancement if the Combo Finisher cast recently consumes at least ${NUM} Combo Point`,
   "special.combo_enh_conditional"],
  [`\\+${NUM}% Combo Damage Enhancement`, "special.combo_enhancement"],
  [`\\+${NUM}% Combo Finisher Amplification`, "rotation.finisher_amp_pct"],
  [`\\+${NUM} Combo Points? gained from Combo Starters`, "special.combo_per_starter"],
  [`\\+${NUM} Combo Finisher charge`, "special.finisher_charges"],
  [`^Gains ${NUM} Combo Point\\(s\\) on Critical Strike`, "ignore"],
  [`\\+${NUM}% additional damage for every ${NUM} Combo Point consumed on Critical Strike`,
   "special.addl_per_combo_crit"],
  [`Adds ${NUM} - ${NUM} Physical Damage to Attacks and Spells`, "special.flat_added_phys"],
  [`${NUM}% Attack Critical Strike Rating for this gear`, "special.local_crit_rating"],
  [`Adds ${NUM}% of the damage of the Off-Hand Weapon to the final damage of the Main-Hand Weapon`,
   "special.joined_force"],
  [`^Off-Hand Weapons do not participate in Attacks`, "ignore"],
  [`\\+${NUM}% Attack Speed and \\+${NUM}% additional Attack Damage when having Attack Aggression`,
   "special.attack_aggression"],
  [`\\+${NUM}% additional damage and -${NUM}% Critical Strike Rating on Critical Strike`,
   "special.keep_it_up"],
  [`Attacks eliminate enemies under ${NUM}% Life`, "ignore"],
  // Caged Fury's moved-mode; the still mode (+35% additional) is the live one while bossing
  [`^If you have moved ${NUM}\\s?m or more`, "ignore"],
  [`Doubles Max Warcry Skill Effects`, "extras.warcry_max_doubled"],
  [`Gains additional Fervor Rating`, "ignore"],
  [`Fervor Rating lost`, "ignore"],
  [`Unable to evade`, "ignore"],
  [`Gains Attack Aggression when casting`, "ignore"],
  [`You can only deal Cold Damage`, "ignore"],
  [`Mana Multiplier`, "ignore"],
  [`\\+${NUM}% Warcry Effect`, "extras.warcry_effect_pct"],
  [`\\+${NUM}% Fervor effect`, "extras.fervor_effect_pct"],
  [`\\+${NUM} to Max Frostbite Rating`, "extras.max_frostbite_rating"],
  [`\\+${NUM}% Aura Effect`, "extras.aura_effect_pct"],
  [`\\+${NUM}% Mark effect`, "extras.mark_effect_pct"],
  [`\\+${NUM} Support Skill Level`, "extras.support_skill_level"],
  [`\\+${NUM} to the minimum number of enemies affected by Warcry`, "extras.warcry_min_enemies"],
  [`${NUM}% Critical Strike Damage per Fervor Rating`, "extras.crit_dmg_per_fervor_rating"],
  [`additional base effect: \\+${NUM}% additional [\\w ]*Damage for every ${NUM} Fervor Rating`,
   "special.fervor_dmg"],
  // Dawn Break's plain wording — a rate, but NOT a Fervor base effect, so no Effect scaling
  [`\\+${NUM}% additional damage per ${NUM} Fervor Rating`, "special.fervor_dmg_plain"],
  [`^Have Fervor$`, "special.has_fervor"],
  [`Has ${NUM} point\\(s\\) of fixed Fervor Rating`, "special.fixed_fervor_rating"],
  // must outrank the generic '% Attack Speed' / '% additional damage' patterns below
  [`${NUM}% Attack Speed for every ${NUM}% of Life lost`, "special.as_per_life_lost"],
  [`\\+${NUM}% additional damage against Low Life enemies`, "special.low_life_enemy"],
  // increased variant: must outrank the generic '+#% damage' or the gate is dropped
  [`\\+${NUM}% damage against Low Life enemies`, "extras.low_life_inc_pct"],
  [`^Has Hasten$`, "ignore"],
  [`\\+${NUM} \\* ${NUM}% Minion Damage`, "ignore"],
  [`\\+${NUM} \\* ${NUM}% damage`, "special.fate_slots"],
  [`\\+${NUM}% Warcry Skill Effect Duration`, "ignore"],
  [`\\+${NUM} Max Warcry Skill Charges`, "ignore"],
  [`\\+${NUM}% additional Warcry Skill Effect`, "extras.warcry_additional_effect_pct"],
  [`\\+${NUM}% chance for Attacks to inflict Paralysis`, "special.paralysis"],
  [`chance to gain (?:a stack of )?Agility Blessing`, "special.agility_blessing"],
  [`chance to gain a stack of Focus Blessing`, "special.focus_blessing"],
  [`\\+${NUM} to Max Focus Blessing Stacks`, "extras.max_focus_blessing_stacks"],
  [`Adds ${NUM}% of Physical Damage to Cold Damage`, "base.gain_phys_as_cold_pct"],
  [`Triggers Lv\\. ${NUM} Timid Curse`, "special.timid_curse"],
  [`Main Skill is supported by Lv\\. ${NUM} Steamroll`, "special.tower_steamroll"],
  [`Main Skill is supported by`, "ignore"],   // other tower supports: numerics unmodeled
  [`stack of Pure Heart when using an Attack Mobility Skill`, "special.pure_heart"],
  // finisher/starter-gated AS must outrank the generic additional-AS line (Bodhi special pool)
  [`\\+${NUM}% additional Attack and Cast Speed for Combo Finishers`,
   "rotation.finisher_additional_as_pct"],
  [`\\+${NUM}% additional Attack and Cast Speed for Combo Starters`,
   "rotation.starter_additional_as_pct"],
  [`\\+${NUM}% additional Attack and Cast Speed`, "rotation.attack_speed_inc_pct"],
  [`additional Ailment Damage`, "ignore"],
  // a ring suffix's paired roll can be negative ("-5% additional damage") below i86
  [`^(-\\d+(?:\\.\\d+)?)% additional damage$`, "additional.misc"],
  [`\\+${NUM}% additional .*[Dd]amage`, "additional.misc"],
  [`\\+${NUM}% (?:increased )?Physical Damage`, "increased.physical"],
  [`\\+${NUM}% (?:increased )?Attack Damage`, "increased.attack"],
  [`\\+${NUM}% (?:increased )?Melee Damage`, "increased.melee"],
  [`\\+${NUM}% (?:increased )?Area Damage`, "increased.area"],
  [`\\+${NUM}% (?:increased )?Cold Damage`, "increased.cold"],
  [`\\+${NUM}% damage`, "increased.global"],
  [`\\+${NUM}% Physical Skill Critical Strike Damage`, "crit.damage_pct"],
  [`${NUM}% Critical Strike Damage`, "crit.damage_pct"],
  [`Inflicts Cold Infiltration`, "special.cold_infiltration"],
  [`(?:^|\\s)${NUM}% Attack Critical Strike Rating`, "crit.rating_inc_pct"],
  [`\\+${NUM}% Critical Strike Rating`, "crit.rating_inc_pct"],
  [`(?:^|\\s)${NUM}% Attack Speed`, "rotation.attack_speed_inc_pct"],
  [`(?:^|\\s)${NUM}% Attack and Cast Speed`, "rotation.attack_speed_inc_pct"],
  [`\\+${NUM}% Frostbite Effect`, "extras.frostbite_effect_pct"],
  [`\\+${NUM}% (?:increased )?Elemental Damage`, "increased.elemental"],
  [`\\+${NUM}% Elemental Penetration`, "penetration.cold_pct"],
  [`\\+${NUM}% Cold Penetration`, "penetration.cold_pct"],
  [`\\+${NUM}% Strength`, "extras.strength_pct"],
  [`\\+${NUM} Strength`, "extras.strength"],
  [`\\+${NUM} to Attack Skill Level`, "extras.attack_skill_level"],
  [`\\+${NUM} Active Skill Level`, "extras.active_skill_level"],
  // Spectral Slash carries the Persistent and Physical tags (user 2026-07-16)
  [`\\+${NUM} (?:Persistent|Physical) Skill Level`, "extras.attack_skill_level"],
  [`\\+${NUM} to All Skills' Levels`, "extras.all_skill_levels"],
  ["(Max Life|Max Mana|Max Energy Shield|gear Energy Shield|Armor|Evasion"
   + "|Resistance|Movement Speed|Skill Cost|Life Regain|Mana Regain|on defeat"
   + "|Sealed Mana Compensation|Warcry Cooldown|additional damage taken|Skill Area"
   + "|Energy Shield Regain|Barrier|Consumes|Loses Fervor|chance to gain|chance to Mark"
   + "|Charging Energy Shield|Energy Shield [Cc]harge|回复"
   + "|Non-Critical Strikes to grant|Minions?['’]|\\+\\d+% Minion (?:Damage|Attack and Cast Speed)"
   + "|[Ii]mmune to|Fortitude|Injury Buffer|Missing Energy Shield"
   + "|Converts 100% of(?: Minion)? Physical Damage to Cold"
   + "|Inflicts Frostbite|Copies the last Talent"
   + "|while Dual Wielding)", "ignore"],   // loadout 6 is sword+shield: dual-wield conditionals are false
];
const COMPILED: [RegExp, string][] = PATTERNS.map(([p, path]) => [new RegExp(p, "i"), path]);

export function classify(text: string): [string | null, number | null] {
  for (const [rx, path] of COMPILED) {
    const m = rx.exec(text);
    if (m) {
      if (path === "ignore") return ["ignore", null];
      const groups = m.slice(1).filter(g => g !== undefined);
      return [path, groups.length ? parseFloat(groups[0]) : 0.0];
    }
  }
  return [null, null];
}

export interface Report {
  matched: any[];
  ignored: Line[];
  unmatched: Line[];
  manual: any[];
}

const nums = (text: string): number[] => (text.match(/\d+(?:\.\d+)?/g) ?? []).map(parseFloat);

/** Route a classified value into the snapshot. Special paths handled here. */
function apply(snap: Snapshot, extras: Record<string, number>, path: string, value: number, line: Line): void {
  const mult = line.slot === "tree" ? (line.points ?? 1) : 1;
  if (path === "base.weapon_phys") {
    const m = nums(line.text);
    if (line.slot === "mainHand") {
      snap.base.weapon_phys_min = m[0];
      snap.base.weapon_phys_max = m[1];
    } else if (line.slot === "offHand") {
      // stashed for Joined Force (mechanics.md#joined-force); dropped without it
      extras.offhand_phys_min = (extras.offhand_phys_min ?? 0) + m[0];
      extras.offhand_phys_max = (extras.offhand_phys_max ?? 0) + m[1];
    }
    return;
  }
  if (path === "base.weapon_flat_cold" || path === "base.weapon_flat_phys_added") {
    const [lo, hi] = nums(line.text);
    const cold = path === "base.weapon_flat_cold";
    if (line.slot === "offHand") {
      const key = cold ? "offhand_cold" : "offhand_phys";
      extras[`${key}_min`] = (extras[`${key}_min`] ?? 0) + lo;
      extras[`${key}_max`] = (extras[`${key}_max`] ?? 0) + hi;
      return;
    }
    if (line.slot !== "mainHand") return;
    if (cold) {
      snap.base.weapon_flat_cold_min += lo;
      snap.base.weapon_flat_cold_max += hi;
    } else {
      snap.base.weapon_phys_min += lo;
      snap.base.weapon_phys_max += hi;
    }
    return;
  }
  if (path === "special.joined_force") {
    extras.joined_force_pct = value;
    return;
  }
  if (path === "special.attack_aggression") {
    // full uptime: Attack Aggression is granted by casting any Attack Skill
    const [as, addl] = nums(line.text);
    snap.rotation.attack_speed_inc_pct += as;
    snap.additional.misc = ((1 + snap.additional.misc / 100) * (1 + addl / 100) - 1) * 100;
    return;
  }
  if (path === "special.keep_it_up") {
    // 4s buff refreshed on crit (77%+ chance, 0.5s interval) -> full uptime,
    // including its own -25% crit rating drawback; nums() would grab the "4s" first
    const m = /\+(\d+(?:\.\d+)?)% additional damage and -(\d+(?:\.\d+)?)% Critical Strike Rating/.exec(line.text)!;
    snap.additional.misc = ((1 + snap.additional.misc / 100) * (1 + parseFloat(m[1]) / 100) - 1) * 100;
    extras.rating_inc_pct = (extras.rating_inc_pct ?? 0) - parseFloat(m[2]);
    return;
  }
  if (path === "base.weapon_attack_speed_set") {
    if (line.slot === "mainHand") snap.base.weapon_attack_speed = value;
    return;
  }
  // weapon-local lines count from the mainhand only (mechanics.md 'Offhand / dual wield');
  // off-hand gear-phys is stashed for Joined Force, its rating/AS never participate
  if (path === "base.gear_phys_pct" || path === "crit.rating_flat"
      || path === "special.local_crit_rating") {
    if (line.slot === "offHand") {
      if (path === "base.gear_phys_pct") {
        extras.offhand_gear_phys_pct = (extras.offhand_gear_phys_pct ?? 0) + value;
      } else {
        extras.offhand_local_ignored = (extras.offhand_local_ignored ?? 0) + 1;
      }
      return;
    }
    if (path === "base.gear_phys_pct") snap.base.gear_phys_pct += value;
    else extras[path === "crit.rating_flat" ? "rating_flat" : "rating_inc_pct"] =
      (extras[path === "crit.rating_flat" ? "rating_flat" : "rating_inc_pct"] ?? 0) + value;
    return;
  }
  if (path === "special.flat_added_phys") {
    const [lo, hi] = nums(line.text);
    snap.base.flat_added_min += lo;
    snap.base.flat_added_max += hi;
    return;
  }
  if (path === "special.combo_per_starter" || path === "special.finisher_charges"
      || path === "special.combo_enhancement") {
    const key = path.split(".")[1];
    extras[key] = (extras[key] ?? 0) + value;
    return;
  }
  if (path === "special.combo_enh_conditional") {
    // credited in resolveExtras only if the derived point count meets the threshold
    const [pct, threshold] = nums(line.text);
    extras[`combo_enh_if_ge_${threshold}`] =
      (extras[`combo_enh_if_ge_${threshold}`] ?? 0) + pct;
    return;
  }
  if (path === "special.addl_per_combo_crit") {
    const [pct, per] = nums(line.text);
    extras.addl_per_combo_point_crit = (extras.addl_per_combo_point_crit ?? 0) + pct / per;
    return;
  }
  if (path === "special.cold_infiltration") {
    // mechanics.md#cold-infiltration: 13% additional Cold taken + -10% enemy cold res;
    // boss Freeze uptime assumed (mechanics.md#assumptions)
    snap.enemy_taken.cold_infiltration = 13;
    snap.penetration.cold_pct += 10;
    return;
  }
  if (path === "special.paralysis") {
    // mechanics.md#paralysis: 19%/hit over a 4s debuff and a 0.75s cycle ⇒ permanent
    snap.enemy_taken.paralysis = PARALYSIS_TAKEN_PCT;
    return;
  }
  if (path === "special.pure_heart") {
    const stacks = (1 + PURE_HEART_PER_STACK / 100) ** PURE_HEART_STACKS;
    snap.additional.pure_heart = (stacks - 1) * 100;
    return;
  }
  if (path === "special.agility_blessing" || path === "special.focus_blessing") {
    // stack-count modifiers (e.g. Max Focus Blessing Stacks) can appear on any line,
    // so the blessing math waits until resolveExtras
    extras[path.split(".")[1]] = 1;
    return;
  }
  if (path === "special.tower_steamroll") {
    snap.additional.steamroll =
      ((1 + (snap.additional.steamroll ?? 0) / 100) * (1 + steamrollAddlPct(value) / 100) - 1) * 100;
    snap.rotation.attack_speed_inc_pct += STEAMROLL_AS_PCT;
    return;
  }
  if (path === "special.timid_curse") {
    // ring baseAffix triggers Lv.20 Timid on hit, 0.2s cooldown -> full uptime;
    // +39% additional Hit Damage taken at L20 (mechanics.md 'Timid curse')
    snap.enemy_taken.timid_curse = TIMID_CURSE_TAKEN_PCT;
    return;
  }
  if (path === "special.fate_slots") {
    const [slots, pct] = nums(line.text);
    snap.increased.global += slots * pct;
    return;
  }
  if (path === "special.fervor_dmg") {
    // a rate, not a flat roll: rating x effect are applied in resolveExtras
    const [pct, per] = nums(line.text);
    extras.additional_dmg_per_fervor_rating =
      (extras.additional_dmg_per_fervor_rating ?? 0) + pct / per;
    return;
  }
  if (path === "special.fervor_dmg_plain") {
    const [pct, per] = nums(line.text);
    extras.additional_dmg_per_fervor_rating_plain =
      (extras.additional_dmg_per_fervor_rating_plain ?? 0) + pct / per;
    return;
  }
  if (path === "special.has_fervor") {
    extras.has_fervor = 1;
    return;
  }
  // presence flag, not a sum: two doubling sources (Formless + belt) still mean one x2
  if (path === "extras.warcry_max_doubled") {
    extras.warcry_max_doubled = 1;
    return;
  }
  if (path === "special.fixed_fervor_rating") {
    extras.fervor_rating = Math.max(extras.fervor_rating ?? 0, value);
    return;
  }
  if (path === "special.as_per_life_lost") {
    const [rate, per] = nums(line.text);
    snap.rotation.attack_speed_inc_pct += (rate / per) * LIFE_LOST_PCT;
    return;
  }
  if (path === "special.low_life_enemy") {
    const ev = lowLifeExecEvPct(value);
    snap.additional.low_life_execute =
      ((1 + (snap.additional.low_life_execute ?? 0) / 100) * (1 + ev / 100) - 1) * 100;
    return;
  }
  if (path === "base.gear_attack_speed_pct") {
    if (line.slot === "mainHand") {
      extras.gear_attack_speed_pct = (extras.gear_attack_speed_pct ?? 0) + value;
    }
    return;
  }
  if (path.startsWith("crit.rating") || path.startsWith("extras.")) {
    const key = path.split(".").slice(1).join(".");
    extras[key] = (extras[key] ?? 0.0) + value * mult;
    return;
  }
  const keys = path.split(".");
  let d: any = snap;
  for (const k of keys.slice(0, -1)) d = d[k];
  const last = keys[keys.length - 1];
  const old = d[last] ?? 0;
  if (keys[0] === "additional" || keys[0] === "enemy_taken") {
    // each affix line is its own multiplier (mechanics.md) — compound, don't sum
    d[last] = ((1 + old / 100) * (1 + value * mult / 100) - 1) * 100;
  } else {
    d[last] = old + value * mult;
  }
}

export function parseBuild(buildOrPath: string | object, loadoutIndex?: number | null): [Snapshot, Report] {
  const snap = deepCopy(DEFAULT_SNAPSHOT);
  for (const bucket of ["increased", "additional", "enemy_taken"] as const) {
    for (const k of Object.keys(snap[bucket])) snap[bucket][k] = 0;
  }
  Object.assign(snap.base, { weapon_phys_min: 0, weapon_phys_max: 0,
                             weapon_flat_cold_min: 0, weapon_flat_cold_max: 0,
                             gear_phys_pct: 0 });
  const report: Report = { matched: [], ignored: [], unmatched: [], manual: [] };
  const extras: Record<string, number> = {};
  const build = typeof buildOrPath === "string"
    ? JSON.parse(fs.readFileSync(buildOrPath, "utf-8"))
    : buildOrPath;
  for (const line of extractLines(build, loadoutIndex)) {
    const [path, value] = classify(line.text);
    if (path === null) {
      report.unmatched.push(line);
    } else if (path === "ignore") {
      report.ignored.push(line);
    } else {
      apply(snap, extras, path, value ?? 0, line);
      report.matched.push({ ...line, path, value });
    }
  }
  snap._extras = extras;
  applySupports(snap, pickLoadout(build, loadoutIndex), extras, report);
  resolveExtras(snap, report);     // derives from extras the overrides then consume
  applyOverrides(snap, report);
  if (!Object.keys(snap._extras ?? {}).length) delete snap._extras;
  return [snap, report];
}

export function printReport(report: Report): void {
  const [m, i, u] = [report.matched.length, report.ignored.length, report.unmatched.length];
  const total = m + i + u;
  const pct = total ? (100 * (m + i)) / total : 0;
  console.log(`coverage: ${m} matched, ${i} ignored, ${u} UNMATCHED of ${total} lines (${pct.toFixed(0)}% handled)`);
  for (const line of report.unmatched) console.log(`  UNMATCHED [${line.source}] ${line.text}`);
  for (const e of report.manual) console.log(`  manual(${e.mode}) ${e.path} = ${e.value}  [${e.source}]`);
}

export const OVERRIDES_PATH = fromRoot("data/manual_overrides.json");

function setPath(d: any, path: string, value: number, add = false): void {
  const keys = path.split(".");
  for (const k of keys.slice(0, -1)) d = d[k];
  const last = keys[keys.length - 1];
  d[last] = add ? (d[last] ?? 0) + value : value;
}

/** Merge hand-researched values (mechanics.md) over the parsed snapshot.

    Overrides file contract:
      "add": {snapshot.path: delta}     added onto parsed values
      "set": {snapshot.path: value}     absolute (e.g. crit.chance_pct from rating curve)
      "_consumes": [extras keys]        extras the add/set values already account for
      "_sources": {path: citation}      required; keeps every number traceable */
export function applyOverrides(snap: Snapshot, report: Report, overridesPath = OVERRIDES_PATH): Snapshot {
  if (!fs.existsSync(overridesPath)) return snap;
  const ov = JSON.parse(fs.readFileSync(overridesPath, "utf-8"));
  for (const [path, v] of Object.entries<number>(ov.add ?? {})) {
    const root = path.split(".")[0];
    if (root === "additional" || root === "enemy_taken") {
      const d = (snap as any)[root];
      const k = path.split(".")[1];
      d[k] = ((1 + (d[k] ?? 0) / 100) * (1 + v / 100) - 1) * 100;
    } else {
      setPath(snap, path, v, true);
    }
    report.manual.push({ path, value: v, mode: "add",
                         source: ov._sources?.[path] ?? "UNCITED" });
  }
  for (const [path, v] of Object.entries<number>(ov.set ?? {})) {
    setPath(snap, path, v);
    report.manual.push({ path, value: v, mode: "set",
                         source: ov._sources?.[path] ?? "UNCITED" });
  }
  const extras = snap._extras ?? {};
  for (const key of ov._consumes ?? []) {
    if (key in extras) {
      const value = extras[key];
      delete extras[key];
      report.manual.push({ path: `_extras.${key}`, value,
                           mode: "consumed", source: "manual_overrides.json" });
    }
  }
  return snap;
}

/** mechanics.md#crit: base rating x (1 + parsed% + Fervor's native base effect + Fearless aura).
    Fervor's contribution needs a "Have Fervor" source (Dawn Break boots) — without one it is 0. */
export function critChance(d: Record<string, number>): number {
  const fervor = d.has_fervor
    ? (d.fervor_rating || FERVOR_RATING) * FERVOR_CRIT_RATING_PER_POINT
      * (1 + d.fervor_effect_pct / 100)
    : 0;
  const increased = (d.rating_inc_pct + fervor
    + (d.fearless_rating_pct ?? PRECISE_FEARLESS_RATING_PCT)) / 100;
  return d.rating_flat * (1 + increased) / 100;
}

/** mechanics.md 'Low Life enemies': the buff is live only for the last 35% of boss HP,
    so its DPS-equivalent is the harmonic mean over HP share, not the headline %. */
export function lowLifeExecEvPct(pct: number): number {
  return (1 / (1 - LOW_LIFE_ENEMY_HP + LOW_LIFE_ENEMY_HP / (1 + pct / 100)) - 1) * 100;
}

/** mechanics.md#warcry: Shockwave %/enemy x min(enemies, stack cap) x Effect x additional
    Effect; the cap is 8, or 16 with a "Doubles Max Warcry Skill Effects" source. */
export function warcryLayer(d: Record<string, number>): number {
  const cap = SHOCKWAVE_MAX_STACKS * (d.warcry_max_doubled ? 2 : 1);
  return (SHOCKWAVE_PER_ENEMY * Math.min(d.warcry_min_enemies, cap)
          * (1 + d.warcry_effect_pct / 100) * (1 + d.warcry_additional_effect_pct / 100));
}

const SPECTRAL_SLASH = "2164818f-5aee-5327-b9d3-b30520ccd7a9";
const WILLPOWER_PCT = (Math.pow(1.06, 6) - 1) * 100;   // 6 stacks x +6%/stack, "(multiplies)"; full uptime while standing still

/** Both prism lines net together: base +20% (+4% per rank past 1) x the actual roll. */
function prismPct(sup: any): number {
  const base = 20 + 4 * ((sup.rank ?? 1) - 1);
  const roll = sup.rollValues?.[0] ?? 0;
  return ((1 + base / 100) * (1 + roll / 100) - 1) * 100;
}

/* mechanics.md#supports: closed-form per-gem values, keyed by support GUID.
   lvl = gem level + Support Skill Levels; level tables cited in mechanics.md. */
const SUPPORT_GEMS: Record<string, [string, (s: Snapshot, sup: any, lvl: number, extras: Record<string, number>) => number]> = {
  // Activation Medium: Still Attack grants Lv(20-30) Willpower; per-stack value is level-flat
  "adac0b98-ac92-5ebf-8bda-c7ccd47f8f4b": ["Still Attack -> Willpower",
    s => s.additional.willpower = WILLPOWER_PCT],
  "d9d16cba-b18f-58bf-bd94-88b1cb14a53c": ["Willpower",
    s => s.additional.willpower = WILLPOWER_PCT],
  // grants Combo Damage Enhancement (5.5 Lv1 -> 15.5 Lv21 -> 21.5 Lv41), which is the
  // summed-pool stat, NOT per-point amp; its +1 point/starter feeds mechanics.md#combo-economy
  "4fc73492-c05c-5f7e-bd34-40db624901b1": ["Recuperation",
    (_s, _sup, lvl, extras) => {
      extras.combo_per_starter = (extras.combo_per_starter ?? 0) + 1;
      const enh = lvl <= 21 ? 5.5 + (lvl - 1) * 0.5 : 15.5 + (lvl - 21) * 0.3;
      extras.combo_enhancement = (extras.combo_enhancement ?? 0) + enh;
      return enh;
    }],
  // 26 (Lv1) + 0.5/level, multiplies crit hits only
  "dcb47367-34df-5e86-a9df-0b5d5f130998": ["Critical Strike Damage Increase",
    (s, _sup, lvl) => s.crit.additional_on_crit_pct = (s.crit.additional_on_crit_pct ?? 0) + 26 + (lvl - 1) * 0.5],
  // clone-kill explosion never triggers on a boss
  "981fe3a9-f59e-5f36-b6b0-600bf08e790f": ["Detonation (Magnificent)",
    (s, sup) => s.additional.detonation_prism = prismPct(sup)],
  // socketed copy for the re-socket counterfactual (tower sequence frees this socket)
  "4830642f-32e5-56ef-9de7-61ed678cb883": ["Steamroll",
    (s, _sup, lvl) => {
      s.additional.steamroll =
        ((1 + (s.additional.steamroll ?? 0) / 100) * (1 + steamrollAddlPct(lvl) / 100) - 1) * 100;
      s.rotation.attack_speed_inc_pct += STEAMROLL_AS_PCT;
      return steamrollAddlPct(lvl);
    }],
  // +1 Clone per enemy within 15m: a boss is 1 enemy -> +1
  "3ee2f012-e08f-5eb7-b54a-8c58e9b4549c": ["Legion (Noble)",
    (s, sup) => { s.rotation.extra_clones += 1; return s.additional.legion_prism = prismPct(sup); }],
};

let SUPPORT_NAMES: Record<string, string> | null = null;
function supportName(guid: string): string {
  if (!SUPPORT_NAMES) {
    SUPPORT_NAMES = {};
    for (const g of Object.values<any>(_load("SS12.5-skill-en.json")))
      for (const [k, s] of Object.entries<any>(g.skills ?? {})) SUPPORT_NAMES[k] = s.name;
  }
  return SUPPORT_NAMES[guid] ?? guid;
}

/** Spectral Slash's support gems, valued at gem level + Support Skill Levels. */
export function applySupports(snap: Snapshot, lo: any, extras: Record<string, number>, report: Report): void {
  // "+N to All Skills' Levels" raises the supports too; its main-gem share is
  // consumed later in resolveExtras
  const supportLevels = (extras.support_skill_level ?? 0) + (extras.all_skill_levels ?? 0);
  delete extras.support_skill_level;
  for (const skill of lo.skills?.activeSkills ?? []) {
    if (skill.skillGuid !== SPECTRAL_SLASH || skill.enabled === false) continue;
    for (const sup of (skill.supports ?? []).filter(Boolean)) {
      const entry = SUPPORT_GEMS[sup.supportGuid];
      if (!entry) {
        report.manual.push({ path: `support.${supportName(sup.supportGuid)}`, value: 0,
                             mode: "unmodeled", source: "mechanics.md#supports" });
        continue;
      }
      const [name, fn] = entry;
      const v = fn(snap, sup, (sup.level ?? 20) + supportLevels, extras);
      report.manual.push({ path: `support.${name}`, value: pyG(v), mode: "derived",
                           source: "mechanics.md#supports" });
    }
  }
}

/** mechanics.md#skill-levels: gem is L20; each level is its own additional multiplier —
    x1.10 per level 21-30, x1.08 past 30 (never a summed pool: the marginal level is
    always worth its full band value, user 2026-07-16). */
export function skillLevelAdditionalPct(levels: number): number {
  return (1.10 ** Math.min(levels, 10) * 1.08 ** Math.max(levels - 10, 0) - 1) * 100;
}

/** Mechanical extras conversions that need no researched constants. */
export function resolveExtras(snap: Snapshot, report: Report): Snapshot {
  const extras = snap._extras ?? {};
  const pop = (key: string, dflt = 0): number => {
    const v = extras[key] ?? dflt;
    delete extras[key];
    return v;
  };
  const gas = pop("gear_attack_speed_pct");
  if (gas) {
    snap.base.weapon_attack_speed *= 1 + gas / 100;
    report.manual.push({ path: "base.weapon_attack_speed", mode: "derived",
                         value: `x${pyG(1 + gas / 100)} from +${pyG(gas)}% gear Attack Speed`,
                         source: "build_parser.resolve_extras" });
  }
  // %Strength scales the export-visible pool only — hero base attributes are not
  // in the export (mechanics.md#assumptions)
  const strength = pop("strength") * (1 + pop("strength_pct") / 100);
  if (strength) {
    // +0.5% additional damage per point, one multiplier (mechanics.md 'Strength')
    const pts = strength * 0.5;
    snap.additional.strength = ((1 + snap.additional.strength / 100) * (1 + pts / 100) - 1) * 100;
    report.manual.push({ path: "additional.strength", mode: "derived",
                         value: `+${pyG(pts)}% from ${pyG(strength)} Strength`,
                         source: "mechanics.md#strength" });
  }
  const compound = (key: string, pts: number): void => {
    snap.additional[key] = ((1 + (snap.additional[key] ?? 0) / 100) * (1 + pts / 100) - 1) * 100;
  };
  if (pop("agility_blessing")) {
    compound("blessings", BLESSING_BASE_STACKS * AGILITY_ADDL_PER_STACK);
    snap.rotation.attack_speed_inc_pct += BLESSING_BASE_STACKS * AGILITY_AS_PER_STACK;
    report.manual.push({ path: "additional.blessings", mode: "derived",
                         value: `Agility: +${BLESSING_BASE_STACKS * AGILITY_ADDL_PER_STACK}% additional, +${BLESSING_BASE_STACKS * AGILITY_AS_PER_STACK}% attack speed (4 stacks)`,
                         source: "mechanics.md 'Agility Blessing'" });
  }
  const focusMaxStacks = pop("max_focus_blessing_stacks");
  if (pop("focus_blessing")) {
    const stacks = BLESSING_BASE_STACKS + focusMaxStacks;
    compound("blessings", stacks * FOCUS_ADDL_PER_STACK);
    report.manual.push({ path: "additional.blessings", mode: "derived",
                         value: `Focus: +${stacks * FOCUS_ADDL_PER_STACK}% additional (${stacks} stacks)`,
                         source: "mechanics.md 'Focus Blessing'" });
  }
  const markEffect = pop("mark_effect_pct");
  if (markEffect) {
    snap.rotation.mark_taken_pct = MARK_TAKEN_PCT * (1 + markEffect / 100);
    report.manual.push({ path: "rotation.mark_taken_pct", mode: "derived",
                         value: `${pyG(snap.rotation.mark_taken_pct)}% from ${MARK_TAKEN_PCT}% Mark x +${pyG(markEffect)}% Mark effect`,
                         source: "mechanics.md#mark" });
  }
  // mechanics.md#combo-economy: each starter grants 1 point + "gained from Combo
  // Starters" stats; every finisher consumes the same full pool
  const perStarter = 1 + pop("combo_per_starter");
  snap.rotation.combo_points = snap.rotation.starters_per_cycle * perStarter;
  snap.rotation.finishers_per_cycle = 1 + pop("finisher_charges");
  report.manual.push({ path: "rotation.combo_points", mode: "derived",
                       value: `${snap.rotation.starters_per_cycle}x${pyG(perStarter)} points, `
                            + `${snap.rotation.finishers_per_cycle} finisher(s)/cycle`,
                       source: "mechanics.md#combo-economy" });
  let comboEnh = pop("combo_enhancement");
  for (const key of Object.keys(extras).filter(k => k.startsWith("combo_enh_if_ge_"))) {
    const threshold = parseFloat(key.slice("combo_enh_if_ge_".length));
    const pct = pop(key);
    if (snap.rotation.combo_points >= threshold) comboEnh += pct;
    report.manual.push({ path: "additional.combo_enhancement", mode: "derived",
                         value: `${snap.rotation.combo_points >= threshold ? "+" + pyG(pct) : "0 (condition failed)"} from "consumes at least ${pyG(threshold)}" lines`,
                         source: "mechanics.md#combo-economy" });
  }
  if (comboEnh) {
    // Enhancement affixes sum, then act as ONE additional multiplier on Combo Skills
    snap.additional.combo_enhancement = comboEnh;
    report.manual.push({ path: "additional.combo_enhancement", mode: "derived",
                         value: `+${pyG(comboEnh)}% (summed pool, one multiplier)`,
                         source: "mechanics.md#combo-economy" });
  }
  const perPointCrit = pop("addl_per_combo_point_crit");
  if (perPointCrit) {
    const pts = perPointCrit * snap.rotation.combo_points;
    snap.crit.additional_on_crit_pct = (snap.crit.additional_on_crit_pct ?? 0) + pts;
    report.manual.push({ path: "crit.additional_on_crit_pct", mode: "derived",
                         value: `+${pyG(pts)}% from ${pyG(perPointCrit)}%/point x ${snap.rotation.combo_points} points`,
                         source: "mechanics.md 'Bodhi Girdle'" });
  }
  // mechanics.md#joined-force: 60% of the off-hand weapon's own final damage joins
  // the main hand; without the notable the stashed off-hand locals are dropped
  const jf = pop("joined_force_pct");
  const ohPhys = (pop("offhand_phys_min") + pop("offhand_phys_max")) / 2
               * (1 + pop("offhand_gear_phys_pct") / 100);
  const ohColdMin = pop("offhand_cold_min"), ohColdMax = pop("offhand_cold_max");
  if (jf && (ohPhys || ohColdMax)) {
    snap.base.joined_weapon_phys = (snap.base.joined_weapon_phys ?? 0) + ohPhys * jf / 100;
    snap.base.weapon_flat_cold_min += ohColdMin * jf / 100;
    snap.base.weapon_flat_cold_max += ohColdMax * jf / 100;
    report.manual.push({ path: "base.joined_weapon_phys", mode: "derived",
                         value: `${pyG(jf)}% of off-hand ${pyG(ohPhys)} phys + ${pyG((ohColdMin + ohColdMax) / 2)} cold`,
                         source: "mechanics.md#joined-force" });
  }
  const gemLevels = pop("attack_skill_level") + pop("active_skill_level")
    + pop("all_skill_levels");
  if (gemLevels) {
    const pts = skillLevelAdditionalPct(gemLevels);
    snap.additional.skill_levels = (snap.additional.skill_levels ?? 0) + pts;
    report.manual.push({ path: "additional.skill_levels", mode: "derived",
                         value: `+${pyG(pts)}% from +${pyG(gemLevels)} gem levels (L20 base)`,
                         source: "mechanics.md#skill-levels" });
  }
  // Crit chance and the warcry layer are DERIVED, not overridden: they read parsed
  // rating/effect, so a new source (gear, tree, pactspirit) actually lands.
  const d: Record<string, number> = snap._derived = {
    rating_flat: pop("rating_flat"),
    rating_inc_pct: pop("rating_inc_pct"),
    fervor_effect_pct: extras.fervor_effect_pct ?? 0,
    fervor_rating: pop("fervor_rating") || FERVOR_RATING,
    has_fervor: pop("has_fervor"),
    warcry_min_enemies: pop("warcry_min_enemies"),
    warcry_max_doubled: pop("warcry_max_doubled"),
    warcry_effect_pct: pop("warcry_effect_pct"),
    warcry_additional_effect_pct: pop("warcry_additional_effect_pct"),
  };
  if (d.rating_flat) {
    snap.crit.chance_pct = critChance(d);
    report.manual.push({ path: "crit.chance_pct", mode: "derived",
                         value: `${snap.crit.chance_pct.toPrecision(4)}% from ${pyG(d.rating_flat)} `
                              + `base rating x (1 + ${pyG(d.rating_inc_pct / 100)} parsed `
                              + `+ fervor + fearless)`,
                         source: "mechanics.md#crit" });
  }
  if (d.warcry_min_enemies) {
    snap.additional.warcry_buffs = warcryLayer(d);
    report.manual.push({ path: "additional.warcry_buffs", mode: "derived",
                         value: `+${snap.additional.warcry_buffs.toPrecision(4)}% from `
                              + `${SHOCKWAVE_PER_ENEMY}%/enemy x ${pyG(d.warcry_min_enemies)} enemies `
                              + `(stack cap ${SHOCKWAVE_MAX_STACKS * (d.warcry_max_doubled ? 2 : 1)}`
                              + `${d.warcry_max_doubled ? ", doubled by Formless/belt" : ""})`,
                         source: "mechanics.md#warcry" });
  }

  const perRating = pop("additional_dmg_per_fervor_rating");
  const perRatingPlain = pop("additional_dmg_per_fervor_rating_plain");
  // the catalog rescales the fervor layer from these rates when scoring Fervor Effect mods
  d.fervor_dmg_per_rating = perRating;
  d.fervor_dmg_per_rating_plain = perRatingPlain;
  if ((perRating || perRatingPlain) && d.has_fervor) {
    // mechanics.md#fervor: Fervor BASE effects (Ghost Slaughter wording) scale with
    // Fervor Effect; plain per-rating wording (Dawn Break) does not. Both need a
    // "Have Fervor" source; rating is fixed at 130 by the Unmatched Valor prism.
    // fervor_effect_pct is peeked, not popped — the crit.chance_pct override consumes it too.
    const pts = d.fervor_rating * (perRating * (1 + (extras.fervor_effect_pct ?? 0) / 100)
                                   + perRatingPlain);
    snap.additional.fervor = pts;
    report.manual.push({ path: "additional.fervor", mode: "derived",
                         value: `+${pyG(pts)}% from ${pyG(perRating)}%/rating scaled `
                              + `+ ${pyG(perRatingPlain)}%/rating plain x ${pyG(d.fervor_rating)} rating`,
                         source: "mechanics.md#fervor" });
  }
  delete extras.fervor_effect_pct;   // read above by BOTH crit chance and fervor damage
  delete extras.offhand_local_ignored;
  // mechanics.md#frostbite: base max 120 + Max Frostbite Rating sources; Effect multiplies
  // the debuff. Boss sustained hits assumed to reach the cap (same as the old override).
  d.frostbite_max = BASE_FROSTBITE_MAX + pop("max_frostbite_rating");
  d.frostbite_effect_pct = pop("frostbite_effect_pct");
  snap.enemy_taken.frostbite = d.frostbite_max * (1 + d.frostbite_effect_pct / 100);
  report.manual.push({ path: "enemy_taken.frostbite", mode: "derived",
                       value: `${pyG(snap.enemy_taken.frostbite)}% from max ${pyG(d.frostbite_max)} `
                            + `x (1 + ${pyG(d.frostbite_effect_pct)}% Effect)`,
                       source: "mechanics.md#frostbite" });
  return snap;
}
