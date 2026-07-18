/* Enumerate every divinity-slate / hero-memory mod from the tlidb caches and
   compute its DPS impact for THIS build's snapshot. Writes the result to
   packages/page/src/data/catalog.json for the Vite page (main.ts imports it). */
import fs from "node:fs";
import { fromRoot, pyRound, deepCopy, asciiJson } from "./py.js";
import { _load, classify, critChance, warcryLayer, skillLevelAdditionalPct, NUM,
         FERVOR_RATING, LIFE_LOST_PCT, lowLifeExecEvPct,
         FEARLESS_RATING_BASE_PCT, FEARLESS_AS_PCT } from "./buildParser.js";
import { cycleDps, type Snapshot } from "./damageModel.js";

export const SNAPSHOT = fromRoot("data/snapshot.json");
export const OUT = fromRoot("packages/page/src/data/catalog.json");

const RANGE = /\((\d+(?:\.\d+)?)\s*[–\-~]\s*(\d+(?:\.\d+)?)\)/g;
// Tags Spectral Slash (Attack/Melee/Area/Physical->Cold/Combo) can never benefit from
const NOT_THIS_BUILD = new RegExp(
  "\\b(Focus Skill|Spell (?:Damage|Skill)|Minion|Spirit Magus|Sentry|Totem|Summon"
  + "|Wilt|Deterioration|Erosion|Fire Damage|Lightning Damage|Ignite|Shock Effect|Trauma|Blur"
  + "|Projectile|Bow|Crossbow|Pistol|Cannon|Staff|Wand|Two-Handed|Dual Wield"
  + "|Channeled|Curse Skill|Mobility Skill|Persistent Damage|Damage over Time|DoT|Elixir"
  + "|in Proximity|Erosion Resistance|Tenacity Blessing"
  + "|empty (?:Active|Passive) Skill [Ss]lot"
  + "|Spell Burst"
  + "|(?<![Nn]ot )at Low Life)", "i");   // no Spell Burst skill in build; "recently moved" stays valid (move -> stand -> attack cycle)   // build has 5 actives + 4 auras: no empty slots;
  // no Cast Speed entry: "Attack (Speed) and Cast Speed" hybrids must reach the
  // Attack Speed patterns; cast-only lines never classify, so they stay null anyway
  // ES is the defensive layer, so "at Low Life" gains are unsustainable ("not at Low Life" stays valid)
  // no trailing \b: plurals ("Projectiles", "Minions") must match too

// Whole-mod dealbreakers: any line matching kills the entire mod for this build
// (ES is the defense; the phys->cold conversion is the whole cold engine)
const MOD_DISQUALIFIERS =
  /(?:Max )?Energy Shield is fixed at 0|Physical Damage can't be converted/i;
const CONDITIONAL =
  /\b(when|after|if |for every|for each|per stack|recently|while|next|on \w+ing|devoured|chance to)\b/i;

// Crit and warcry are NOT mirrored here: they are derived by build_parser from the
// snapshot's own _derived inputs, so a new source in the build reaches this catalog too.
// The rest still mirror manual_overrides.json (_sources).
// [aura value, own multiplier]: Fearless, Cruelty (x2 from +100% ADDITIONAL aura
// effect self-ramp at 40 stacks, full on Elites/bosses), Domain Expansion; all
// share the +25% increased aura effect
const AURA_EFFECT = 0.25;
const AURAS: [number, number][] = [[30, 1], [22, 2], [33, 1]];
// fallbacks when snapshot lacks _derived frostbite fields (pre-regen); live values
// come from build_parser.resolve_extras (base 120 + max sources, effect %)
const FROSTBITE_CAP = 157;
const FROSTBITE_EFFECT_PCT = 20;
const GEM_LEVELS = 2;               // net +levels on the live gem (Spectral Slash 20+2, user 2026-07-17); snapshot additional.skill_levels = 1.1^2-1 = 21%
const CHAR_LEVEL = 100;             // endgame; "for every N levels" mods scale off this

/** Best-roll text: '#' placeholders take each range's maximum from rawText. */
export function maxRollText(template: string, rawText: string): string {
  const maxima = [...(rawText ?? "").matchAll(RANGE)].map(m => m[2]);
  if (template.includes("#") && maxima.length) {
    let i = 0;
    return template.replace(/#/g, m => (i < maxima.length ? maxima[i++] : m));
  }
  return (rawText || template).replace(RANGE, "$2");
}

function compound(bucket: Record<string, number>, key: string, pct: number): void {
  bucket[key] = ((1 + (bucket[key] ?? 0) / 100) * (1 + pct / 100) - 1) * 100;
}

/** DPS delta % of adding (path, value) to the snapshot; null if unmodeled. */
export function impactOf(path: string, value: number, snapshot: Snapshot): number | null {
  const s = deepCopy(snapshot);
  delete s._extras;
  const base = cycleDps(s).dps;
  if (!applyStat(s, path, value)) return null;
  return (cycleDps(s).dps / base - 1) * 100;
}

/** Mutate snapshot s with one classified stat; false if unmodeled. */
export function applyStat(s: Snapshot, path: string, value: number): boolean {
  const d = s._derived ?? {};
  const root = path.split(".")[0];
  const key = path.split(".").pop()!;
  if (root === "additional") {
    // each "+X% additional damage" line is its own ×(1+v) factor (mechanics.md#additional),
    // exactly as buildParser compounds them — never a diluted point-add to a summed pool
    compound(s.additional, key, value);
  } else if (root === "enemy_taken") {
    compound(s.enemy_taken, key, value);
  } else if (["increased", "crit", "penetration", "rotation", "base"].includes(root)
             && key in ((s as any)[root] ?? {})) {
    (s as any)[root][key] += value;
  } else if (path === "extras.support_skill_level") {
    s.rotation.finisher_amp_pct += 0.3 * value;
    s.crit.additional_on_crit_pct = (s.crit.additional_on_crit_pct ?? 0) + 0.5 * value;
  } else if (path === "extras.attack_skill_level" || path === "extras.active_skill_level") {
    // marginal band value joins the summed pool (mechanics.md#additional)
    s.additional.skill_levels = (s.additional.skill_levels ?? 0)
      + skillLevelAdditionalPct(GEM_LEVELS + value) - skillLevelAdditionalPct(GEM_LEVELS);
  } else if (path === "extras.all_skill_levels") {
    applyStat(s, "extras.attack_skill_level", value);
    applyStat(s, "extras.support_skill_level", value);
  } else if (path === "extras.strength") {
    // strength points join ONE summed multiplier (mechanics.md 'Strength'), never compound
    s.additional.strength += value * 0.5;
  } else if (path === "extras.strength_pct") {
    // scales the tracked pool: the layer's points are 0.5/Str, so %Str scales them linearly
    s.additional.strength *= 1 + value / 100;
  } else if (path === "extras.fervor_effect_pct") {
    // Fervor Effect pays twice: the crit-rating base effect AND the Ghost Slaughter
    // damage layer (mechanics.md#fervor) — the plain Dawn Break term stays unscaled
    const eff = d.fervor_effect_pct + value;
    s.crit.chance_pct = critChance({ ...d, fervor_effect_pct: eff });
    if (d.fervor_dmg_per_rating || d.fervor_dmg_per_rating_plain) {
      s.additional.fervor = (d.fervor_rating || FERVOR_RATING)
        * ((d.fervor_dmg_per_rating ?? 0) * (1 + eff / 100)
           + (d.fervor_dmg_per_rating_plain ?? 0));
    }
  } else if (path === "special.attack_aggression") {
    // symmetric wording "+X% Attack Speed and +X% additional Attack Damage";
    // Aggression comes from casting any Attack Skill -> full uptime (mechanics.md 'Hidden Mastery')
    s.rotation.attack_speed_inc_pct += value;
    compound(s.additional, "misc", value);
  } else if (path === "special.as_per_life_lost") {
    s.rotation.attack_speed_inc_pct += value * LIFE_LOST_PCT;   // slate wording is per 1% lost
  } else if (path === "special.low_life_enemy") {
    compound(s.additional, "low_life_execute", lowLifeExecEvPct(value));
  } else if (path === "extras.low_life_inc_pct") {
    // increased-bucket bonus gated below 35% boss HP: HP-weighted, then its own
    // additional-damage factor (mechanics.md 'Low Life enemies')
    const inc = Object.values(s.increased).reduce((a, v) => a + v, 0);
    compound(s.additional, "low_life_execute", lowLifeExecEvPct(value * 100 / (100 + inc)));
  } else if (path === "extras.frostbite_effect_pct") {
    // mechanics.md#frostbite: Effect multiplies max rating into enemy_taken.frostbite
    const max = d.frostbite_max ?? FROSTBITE_CAP;
    const eff = (d.frostbite_effect_pct ?? FROSTBITE_EFFECT_PCT) + value;
    s.enemy_taken.frostbite = max * (1 + eff / 100);
  } else if (path === "extras.max_frostbite_rating") {
    const max = (d.frostbite_max ?? FROSTBITE_CAP) + value;
    const eff = (d.frostbite_effect_pct ?? FROSTBITE_EFFECT_PCT) / 100;
    s.enemy_taken.frostbite = max * (1 + eff);
  } else if (path === "extras.aura_effect_pct") {
    let mult = 1.0;
    for (const [v, own] of AURAS) mult *= 1 + v * (1 + AURA_EFFECT + value / 100) * own / 100;
    s.additional.precise_auras = (mult - 1) * 100;
    // Precise: Fearless's +80% crit rating and +8% melee AS lines are aura values too
    s.crit.chance_pct = critChance({ ...d,
      fearless_rating_pct: FEARLESS_RATING_BASE_PCT * (1 + AURA_EFFECT + value / 100) });
    s.rotation.attack_speed_inc_pct += FEARLESS_AS_PCT * value / 100;
  } else if (path === "extras.warcry_effect_pct") {
    s.additional.warcry_buffs = warcryLayer({ ...d, warcry_effect_pct: d.warcry_effect_pct + value });
  } else if (path === "extras.warcry_min_enemies") {
    s.additional.warcry_buffs = warcryLayer({ ...d, warcry_min_enemies: d.warcry_min_enemies + value });
  } else if (path === "extras.crit_dmg_per_fervor_rating") {
    s.crit.damage_pct += value * (d.fervor_rating || FERVOR_RATING);
  } else if (path === "crit.rating_inc_pct") {
    s.crit.chance_pct = critChance({ ...d, rating_inc_pct: d.rating_inc_pct + value });
  } else if (path === "crit.rating_flat") {
    s.crit.chance_pct = critChance({ ...d, rating_flat: d.rating_flat + value });
  } else {
    return false;
  }
  return true;
}

type ModTuple = [cat: string, name: string, desc: string, tier: string, on: string];

function* slateMods(): Generator<ModTuple> {
  const ds = _load("SS12.5-divinity-slate-en.json")["divinity-slate/i18n/en"];
  const master = new Map<string, any>(
    _load("SS12.5-divinity-slate-master.json")["divinity-slate/master"].slateMods
      .map((m: any) => [m.id, m]));
  const generic = new Set(["Micro Talent", "Medium Talent", "Legendary Medium Talent"]);
  for (const [guid, mod] of Object.entries<any>(ds.slateMods)) {
    const mm = master.get(guid) ?? {};
    const nt = mm.nodeType ?? "?";
    // named nodeTypes (one per slate, nodeType == mod name) are the slate's Core Talent;
    // the level matters: Pedigree of Gods' 3rd slot rolls Lv.1 cores only
    yield ["slate", mod.name ?? guid, mod.description ?? "",
           generic.has(nt) ? nt : `Lv.${mm.coreTalentLevel ?? 1} Core Talent`,
           mm.slateType ?? "?"];
  }
  for (const [guid, sl] of Object.entries<any>(ds.legendaryDivinitySlates)) {
    for (const m of sl.mods ?? []) {
      yield ["slate", sl.name ?? guid, m.description ?? "",
             "Legendary Slate", sl.name ?? guid];
    }
  }
}

const MEMORY_TIER_LABELS: Record<string, string> = {
  fixedAffixes: "Fixed Affix", randomAffixes: "Random Affix",
  revivedAffixes: "Revived Affix", specialRandomAffixes: "Special Random",
};

function* memoryMods(): Generator<ModTuple> {
  const hm = _load("SS12.5-hero-memory-en.json")["hero-memory/i18n/en"];
  const root = _load("SS12.5-hero-memory-master.json");
  const hmMaster = root[Object.keys(root)[0]];
  // baseStats excluded: every memory has a fixed Str/ES/AS base stat, nothing to choose
  for (const [cat, tier] of Object.entries(MEMORY_TIER_LABELS)) {
    const master = new Map<string, any>((hmMaster[cat] ?? []).map((a: any) => [a.id, a]));
    for (const [guid, aff] of Object.entries<any>(hm[cat] ?? {})) {
      if (aff !== null && typeof aff === "object" && "template" in aff) {
        yield ["memory", aff.description ?? guid,
               maxRollText(aff.template, aff.rawText ?? ""),
               tier, master.get(guid)?.memoryType ?? "?"];
      }
    }
  }
}

export interface CatalogRow {
  cat: string; name: string; text: string; tier: string; on: string;
  bucket: string; delta: number | null; cond: boolean;
}

export function buildCatalog(): CatalogRow[] {
  const snapshot: Snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, "utf-8"));
  const clean = deepCopy(snapshot);
  delete clean._extras;
  const baseCycle = cycleDps(clean);
  const baseDps = baseCycle.dps;
  const usesPerSec = (clean.rotation.starters_per_cycle
    + (clean.rotation.finishers_per_cycle ?? 1)) / baseCycle.cycle_time;
  const groups = new Map<string, { cat: string; name: string; text: string; tier: string; ons: Set<string> }>();
  for (const [cat, name, rawDesc, tier, on] of [...slateMods(), ...memoryMods()]) {
    const desc = (rawDesc ?? "").replace(/(\d) %/g, "$1%").trim();
    // dropped, not just unmodeled: build is committed to 1h+shield, and slate-layout
    // utility mods (talent copiers) are a human placement decision, not a DPS row
    if (!desc || /dual wield/i.test(desc) || /Copies the .* Talent/i.test(desc)) continue;
    const gk = `${cat} ${desc} ${tier}`;
    let g = groups.get(gk);
    if (!g) groups.set(gk, g = { cat, name, text: desc, tier, ons: new Set() });
    g.ons.add(on);
  }
  const rows: CatalogRow[] = [];
  for (const g of groups.values()) {
    const { cat, name, text: desc } = g;
    const meta = { cat, name, text: desc, tier: g.tier, on: [...g.ons].sort().join(", ") };
    if (MOD_DISQUALIFIERS.test(desc)) {
      rows.push({ ...meta, delta: null, cond: false,
        bucket: /can't be converted/i.test(desc)
          ? "— (blocks the phys→cold conversion)" : "— (kills ES defense)" });
      continue;
    }
    if (/Doubles Max Warcry Skill Effects/i.test(desc)) {
      // load-bearing but priced in: the snapshot's warcry layer already assumes one
      // doubling source (Formless / belt, mechanics.md#warcry), no separate numeric
      rows.push({ ...meta, bucket: "doubles the Warcry stack cap 8 → 16 (assumed in the snapshot)",
                  delta: null, cond: false });
      continue;
    }
    const nullify = /Critical Strikes do not deal additional damage/i.test(desc);
    const s = deepCopy(clean);
    const applied: string[] = [];
    let usedEv = false;
    if (nullify) {
      // the bonus costs the entire crit multiplier: crits deal base damage only
      s.crit.damage_pct = 100;
      applied.push("crit nullified");
    }
    const procEvs: number[] = [];
    let minmaxShift: number | null = null;
    for (let line of desc.split("\n")) {
      line = line.trim();
      if (!line) continue;
      if (NOT_THIS_BUILD.test(line)) continue;
      const minmax = [...line.matchAll(new RegExp(
        `([+-]?\\d+(?:\\.\\d+)?)% additional (?:Min|Max)(?:imum)?(?: \\w+)? Damage`, "gi"))];
      if (minmax.length) {
        // Min/Max lines shift the AVERAGE roll: half of each signed value, summed across
        // the whole mod into ONE multiplier — never the headline, never a compound of
        // the pair (mechanics.md#min-max-avg)
        minmaxShift = (minmaxShift ?? 0)
          + minmax.reduce((a, m) => a + parseFloat(m[1]) / 2, 0);
        continue;
      }
      // one buffed use armed per interval, consumed by whichever skill use comes next —
      // alignment with the finisher is not controllable, so every use has the same
      // probability: EV = value x min(1, armed-per-sec / uses-per-sec) (mechanics.md#next-skill-ev)
      const nextUse = new RegExp(
        `\\+${NUM}% additional (?:\\w+ )?Damage for the next Main Skill(?: used)? every ${NUM} s`, "i")
        .exec(line);
      if (nextUse) {
        procEvs.push(parseFloat(nextUse[1])
          * Math.min(1, 1 / parseFloat(nextUse[2]) / usesPerSec));
        continue;
      }
      const nextUse2 = new RegExp(
        `^Every ${NUM} s, \\+${NUM}% additional (?:\\w+ )?Damage for the next Main Skill`, "i")
        .exec(line);
      if (nextUse2) {
        procEvs.push(parseFloat(nextUse2[2])
          * Math.min(1, 1 / parseFloat(nextUse2[1]) / usesPerSec));
        continue;
      }
      const perLevel = new RegExp(
        `^${NUM}% additional (?:\\w+ )?Damage for every ${NUM} level`, "i").exec(line);
      if (perLevel) {
        // level-scaled lines pay out floor(level/N) times at endgame (mechanics.md#per-level)
        if (applyStat(s, "additional.misc",
            parseFloat(perLevel[1]) * Math.floor(CHAR_LEVEL / parseFloat(perLevel[2])))) {
          applied.push("additional.misc (per level)");
        }
        continue;
      }
      const proc = new RegExp(`${NUM}% chance [^\\n]*?to deal \\+${NUM}% additional`, "i").exec(line);
      if (proc) {
        // per-cast proc: expected value, not the headline number (50%x16 = +8);
        // multiple proc lines in one mod are tier VARIANTS — only the best applies
        procEvs.push(parseFloat(proc[1]) * parseFloat(proc[2]) / 100);
        continue;
      }
      let [path, value] = classify(line);
      if (path === null) {
        const m = new RegExp(`^-${NUM}% additional .*[Dd]amage`).exec(line);
        if (m) {
          path = "additional.misc";
          value = -parseFloat(new RegExp(`^-${NUM}%`).exec(line)![1]);
        }
      }
      if (path === null || path === "ignore" || path === "special.cold_infiltration") continue;
      // per-stack lines ("+X% ... for every/each Y. Stacks up to N time(s)") pay full
      // stacks: the ◑ full-uptime-ceiling convention, same as other CONDITIONAL rows
      const stacks = /for (?:every|each)[^\n]*?Stacks up to (\d+) time/i.exec(line);
      if (applyStat(s, path, (value ?? 0) * (stacks ? parseInt(stacks[1], 10) : 1))) applied.push(path);
    }
    if (minmaxShift !== null
        && applyStat(s, "additional.misc", minmaxShift)) {
      applied.push("additional.misc (avg roll)");
    }
    if (procEvs.length) {
      usedEv = true;
      if (applyStat(s, "additional.misc", Math.max(...procEvs))) {
        applied.push("additional.misc (proc EV)");
      }
    }
    rows.push({
      ...meta,
      bucket: applied.length ? [...new Set(applied)].join(" + ") : "—",
      delta: applied.length ? pyRound((cycleDps(s).dps / baseDps - 1) * 100, 2) : null,
      cond: CONDITIONAL.test(desc) && !usedEv && !nullify,
    });
  }
  rows.sort((a, b) =>
    Number(a.delta === null) - Number(b.delta === null) || (b.delta ?? 0) - (a.delta ?? 0));
  return rows;
}

export function inject(rows: CatalogRow[]): void {
  fs.writeFileSync(OUT, asciiJson(rows), "utf-8");
}
