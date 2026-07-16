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

function* gearLines(lo: any): Generator<Line> {
  const inv = new Map<string, any>(lo.gear.inventory.map((it: any) => [it.id, it]));
  for (const [slot, itemId] of Object.entries<string>(lo.gear.equipped)) {
    const it = inv.get(itemId);
    if (it == null) continue;
    const src = `gear:${slot}:${it.displayName ?? "?"}`;
    for (const m of it.legendaryMods ?? []) yield { source: src, slot, text: m.description };
    const base = it.baseItem ?? {};
    for (const imp of base.implicits ?? []) yield { source: src, slot, text: imp.description };
    for (const aff of [...(it.prefixes ?? []), ...(it.suffixes ?? [])]) {
      const vals = (aff.rolledValues ?? []).map((rv: any) => rv.value);
      yield { source: src, slot, text: substitute(aff.modifierDescription, vals) };
    }
    // tower sequences and base/dream/corrosion affixes carry final text (no # placeholders)
    const extra = [it.towerSequence?.description, it.baseAffix?.description,
                   it.baseAffix2?.description, it.sweetDreamAffix?.description,
                   it.corrosionImplicit?.description];
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

function pickLoadout(build: any, loadoutIndex?: number | null): any {
  const loadouts = build.loadouts.loadouts;
  if (loadoutIndex != null) return loadouts[loadoutIndex];
  const current = build.loadouts.currentLoadoutId;
  for (const lo of loadouts) if (lo.id === current) return lo;
  return loadouts[0];
}

export function extractLines(buildOrPath: string | object, loadoutIndex?: number | null): Line[] {
  const build = typeof buildOrPath === "string"
    ? JSON.parse(fs.readFileSync(buildOrPath, "utf-8"))
    : buildOrPath;
  const lo = pickLoadout(build, loadoutIndex);
  return [...gearLines(lo), ...treeLines(lo), ...traitLines(lo),
          ...memoryLines(lo), ...divinityLines(lo), ...pactspiritLines(lo)];
}

export const NUM = "([+-]?\\d+(?:\\.\\d+)?)";

export const FERVOR_RATING = 100;   // tlidb Fervor_rating: max is 100; sustained by Ronin/Dawn Break
const FERVOR_CRIT_RATING_PER_POINT = 2;      // Fervor's native base effect
const PRECISE_FEARLESS_RATING_PCT = 100;     // aura, not gear: +80% crit rating x 1.25 aura effect
const PARALYSIS_TAKEN_PCT = 15;              // tlidb Paralysis: +15% damage taken, 4s, 1 stack
const PURE_HEART_PER_STACK = 5;              // +5% additional Attack Damage per stack, MULTIPLIES
const PURE_HEART_STACKS = 5;                 // cap; full-uptime assumption (see RANKINGS caveats)
const SHOCKWAVE_PER_ENEMY = 5.95;            // Shockwave Warcry at L20, per enemy affected
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
const FOCUS_ADDL_PER_STACK = 5;

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
  [`\\+${NUM}% Combo Damage Enhancement`, "rotation.finisher_amp_pct"],
  [`\\+${NUM}% Combo Finisher Amplification`, "rotation.finisher_amp_pct"],
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
  [`\\+${NUM}% additional Attack and Cast Speed`, "rotation.attack_speed_inc_pct"],
  [`additional Ailment Damage`, "ignore"],
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
  [`\\+${NUM} Strength`, "extras.strength"],
  [`\\+${NUM} to Attack Skill Level`, "extras.attack_skill_level"],
  [`\\+${NUM} Active Skill Level`, "extras.active_skill_level"],
  ["(Max Life|Max Mana|Max Energy Shield|gear Energy Shield|Armor|Evasion"
   + "|Resistance|Movement Speed|Skill Cost|Life Regain|Mana Regain|on defeat"
   + "|Sealed Mana Compensation|Warcry Cooldown|additional damage taken|Skill Area"
   + "|Energy Shield Regain|Barrier|Consumes|Loses Fervor|chance to gain|chance to Mark"
   + "|Charging Energy Shield|回复"
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
    if (line.slot === "mainHand") {
      const m = nums(line.text);
      snap.base.weapon_phys_min = m[0];
      snap.base.weapon_phys_max = m[1];
    }
    return;
  }
  if (path === "base.weapon_flat_cold" || path === "base.weapon_flat_phys_added") {
    if (line.slot !== "mainHand") {
      extras.offhand_flat_ignored = (extras.offhand_flat_ignored ?? 0) + 1;
      return;
    }
    const [lo, hi] = nums(line.text);
    if (path === "base.weapon_flat_cold") {
      snap.base.weapon_flat_cold_min += lo;
      snap.base.weapon_flat_cold_max += hi;
    } else {
      snap.base.weapon_phys_min += lo;
      snap.base.weapon_phys_max += hi;
    }
    return;
  }
  if (path === "base.weapon_attack_speed_set") {
    if (line.slot === "mainHand") snap.base.weapon_attack_speed = value;
    return;
  }
  if (path === "special.cold_infiltration") {
    // mechanics.md#cold-infiltration: 13% additional Cold taken + -10% enemy cold res;
    // boss Freeze uptime assumed (see RANKINGS caveats)
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

/** mechanics.md#crit: base rating x (1 + parsed% + Fervor's native base effect + Fearless aura). */
export function critChance(d: Record<string, number>): number {
  const fervor = FERVOR_RATING * FERVOR_CRIT_RATING_PER_POINT * (1 + d.fervor_effect_pct / 100);
  const increased = (d.rating_inc_pct + fervor + PRECISE_FEARLESS_RATING_PCT) / 100;
  return d.rating_flat * (1 + increased) / 100;
}

/** mechanics.md#warcry: Shockwave %/enemy x enemies x Effect x additional Effect. */
export function warcryLayer(d: Record<string, number>): number {
  return (SHOCKWAVE_PER_ENEMY * d.warcry_min_enemies
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
const SUPPORT_GEMS: Record<string, [string, (s: Snapshot, sup: any, lvl: number) => number]> = {
  // Activation Medium: Still Attack grants Lv(20-30) Willpower; per-stack value is level-flat
  "adac0b98-ac92-5ebf-8bda-c7ccd47f8f4b": ["Still Attack -> Willpower",
    s => s.additional.willpower = WILLPOWER_PCT],
  "d9d16cba-b18f-58bf-bd94-88b1cb14a53c": ["Willpower",
    s => s.additional.willpower = WILLPOWER_PCT],
  // amp 5.5 (Lv1) -> 15.5 (Lv21) -> 21.5 (Lv41); its +1 Combo Point lives in rotation.combo_points
  "4fc73492-c05c-5f7e-bd34-40db624901b1": ["Recuperation amp",
    (s, _sup, lvl) => s.rotation.finisher_amp_pct += lvl <= 21 ? 5.5 + (lvl - 1) * 0.5 : 15.5 + (lvl - 21) * 0.3],
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
  const supportLevels = extras.support_skill_level ?? 0;
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
      const v = fn(snap, sup, (sup.level ?? 20) + supportLevels);
      report.manual.push({ path: `support.${name}`, value: pyG(v), mode: "derived",
                           source: "mechanics.md#supports" });
    }
  }
}

/** mechanics.md#skill-levels: gem is L20; +10% additional damage per level 21-30, +8% past 30. */
export function skillLevelAdditionalPct(levels: number): number {
  return Math.min(levels, 10) * 10 + Math.max(levels - 10, 0) * 8;
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
  const strength = pop("strength");
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
  const gemLevels = pop("attack_skill_level") + pop("active_skill_level");
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
    warcry_min_enemies: pop("warcry_min_enemies"),
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
                              + `${SHOCKWAVE_PER_ENEMY}%/enemy x ${pyG(d.warcry_min_enemies)} enemies`,
                         source: "mechanics.md#warcry" });
  }

  const perRating = pop("additional_dmg_per_fervor_rating");
  if (perRating) {
    // mechanics.md#fervor: Fervor's base effects scale with Fervor Effect, and this
    // build sustains the 100 cap. fervor_effect_pct is peeked, not popped — the
    // crit.chance_pct override consumes it too.
    const pts = FERVOR_RATING * perRating * (1 + (extras.fervor_effect_pct ?? 0) / 100);
    snap.additional.fervor = pts;
    report.manual.push({ path: "additional.fervor", mode: "derived",
                         value: `+${pyG(pts)}% from ${pyG(perRating)}%/rating x ${FERVOR_RATING} rating`,
                         source: "mechanics.md#fervor" });
  }
  delete extras.fervor_effect_pct;   // read above by BOTH crit chance and fervor damage
  delete extras.offhand_flat_ignored;
  return snap;
}
