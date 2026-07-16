/* Enumerate every divinity-slate / hero-memory mod from the tlidb caches and
   compute its DPS impact for THIS build's snapshot. Writes the result to
   packages/page/src/data/catalog.json for the Vite page (main.ts imports it). */
import fs from "node:fs";
import { fromRoot, pyRound, deepCopy, asciiJson } from "./py.js";
import { _load, classify, critChance, warcryLayer, skillLevelAdditionalPct, NUM } from "./buildParser.js";
import { cycleDps, type Snapshot } from "./damageModel.js";

export const SNAPSHOT = fromRoot("data/snapshot.json");
export const OUT = fromRoot("packages/page/src/data/catalog.json");

const RANGE = /\((\d+(?:\.\d+)?)\s*[–\-~]\s*(\d+(?:\.\d+)?)\)/g;
// Tags Spectral Slash (Attack/Melee/Area/Physical->Cold/Combo) can never benefit from
const NOT_THIS_BUILD = new RegExp(
  "\\b(Focus Skill|Spell (?:Damage|Skill)|Cast Speed(?! and)|Minion|Spirit Magus|Sentry|Totem|Summon"
  + "|Wilt|Erosion|Fire Damage|Lightning Damage|Ignite|Shock Effect|Trauma|Blur"
  + "|Projectile|Bow|Crossbow|Pistol|Cannon|Staff|Wand|Two-Handed|Dual Wield"
  + "|Channeled|Curse Skill|Mobility Skill|Persistent Damage|Damage over Time|DoT|Elixir"
  + "|Min Physical Damage|Erosion Resistance"
  + "|empty (?:Active|Passive) Skill [Ss]lot"
  + "|Spell Burst"
  + "|(?<![Nn]ot )at Low Life)", "i");   // no Spell Burst skill in build; "recently moved" stays valid (move -> stand -> attack cycle)   // build has 5 actives + 4 auras: no empty slots;
  // ES is the defensive layer, so "at Low Life" gains are unsustainable ("not at Low Life" stays valid)
  // no trailing \b: plurals ("Projectiles", "Minions") must match too

// Whole-mod dealbreakers: any line matching kills the entire mod for this build
const MOD_DISQUALIFIERS = /(?:Max )?Energy Shield is fixed at 0/i;   // defense is ES-based
const CONDITIONAL =
  /\b(when|after|if |for every|per stack|recently|while|next|on \w+ing|devoured|chance to)\b/i;

// Crit and warcry are NOT mirrored here: they are derived by build_parser from the
// snapshot's own _derived inputs, so a new source in the build reaches this catalog too.
// The rest still mirror manual_overrides.json (_sources).
const FERVOR_RATING = 100;
// [aura value, own multiplier]: Fearless, Cruelty (x2 from +100% ADDITIONAL aura
// effect self-ramp at 40 stacks, full on Elites/bosses), Domain Expansion; all
// share the +25% increased aura effect
const AURA_EFFECT = 0.25;
const AURAS: [number, number][] = [[30, 1], [22, 2], [33, 1]];
const FROSTBITE_CAP = 157;
const FROSTBITE_EFFECT = 0.20;
const GEM_LEVELS = 9;               // net +levels already on the gem (snapshot additional.skill_levels = 90)

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
  if (root === "additional" || root === "enemy_taken") {
    compound((s as any)[root], key, value);
  } else if (["increased", "crit", "penetration", "rotation", "base"].includes(root)
             && key in ((s as any)[root] ?? {})) {
    (s as any)[root][key] += value;
  } else if (path === "extras.support_skill_level") {
    s.rotation.finisher_amp_pct += 0.3 * value;
    s.crit.additional_on_crit_pct = (s.crit.additional_on_crit_pct ?? 0) + 0.5 * value;
  } else if (path === "extras.attack_skill_level" || path === "extras.active_skill_level") {
    s.additional.skill_levels = (s.additional.skill_levels ?? 0)
      + skillLevelAdditionalPct(GEM_LEVELS + value) - skillLevelAdditionalPct(GEM_LEVELS);
  } else if (path === "extras.strength") {
    compound(s.additional, "strength", value * 0.5);
  } else if (path === "extras.fervor_effect_pct") {
    s.crit.chance_pct = critChance({ ...d, fervor_effect_pct: d.fervor_effect_pct + value });
  } else if (path === "extras.frostbite_effect_pct") {
    s.enemy_taken.frostbite = FROSTBITE_CAP * (1 + FROSTBITE_EFFECT + value / 100);
  } else if (path === "extras.max_frostbite_rating") {
    s.enemy_taken.frostbite = (FROSTBITE_CAP + value) * (1 + FROSTBITE_EFFECT);
  } else if (path === "extras.aura_effect_pct") {
    let mult = 1.0;
    for (const [v, own] of AURAS) mult *= 1 + v * (1 + AURA_EFFECT + value / 100) * own / 100;
    s.additional.precise_auras = (mult - 1) * 100;
  } else if (path === "extras.warcry_effect_pct") {
    s.additional.warcry_buffs = warcryLayer({ ...d, warcry_effect_pct: d.warcry_effect_pct + value });
  } else if (path === "extras.warcry_min_enemies") {
    s.additional.warcry_buffs = warcryLayer({ ...d, warcry_min_enemies: d.warcry_min_enemies + value });
  } else if (path === "extras.crit_dmg_per_fervor_rating") {
    s.crit.damage_pct += value * FERVOR_RATING;
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
    // named nodeTypes (one per slate, nodeType == mod name) are the slate's Core Talent
    yield ["slate", mod.name ?? guid, mod.description ?? "",
           generic.has(nt) ? nt : "Core Talent", mm.slateType ?? "?"];
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
  const baseDps = cycleDps(clean).dps;
  const groups = new Map<string, { cat: string; name: string; text: string; tier: string; ons: Set<string> }>();
  for (const [cat, name, rawDesc, tier, on] of [...slateMods(), ...memoryMods()]) {
    const desc = (rawDesc ?? "").replace(/(\d) %/g, "$1%").trim();
    // dropped, not just unmodeled: build is committed to 1h+shield
    if (!desc || /dual wield/i.test(desc)) continue;
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
      rows.push({ ...meta, bucket: "— (kills ES defense)", delta: null, cond: false });
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
    for (let line of desc.split("\n")) {
      line = line.trim();
      if (!line) continue;
      const minmax = new RegExp(
        `-${NUM}% additional Min Physical Damage, and \\+${NUM}% additional Max Physical Damage`, "i")
        .exec(line);
      if (minmax) {
        // min/max roll shift changes the AVERAGE roll: (+B - A)/2, never compound the pair
        if (applyStat(s, "additional.misc", (parseFloat(minmax[2]) - parseFloat(minmax[1])) / 2)) {
          applied.push("additional.misc (avg roll)");
        }
        continue;
      }
      if (NOT_THIS_BUILD.test(line)) continue;
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
      if (applyStat(s, path, value ?? 0)) applied.push(path);
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
