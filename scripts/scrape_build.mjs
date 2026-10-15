/* Scrape the Pro Build / Hunter File open in game into data/bing1/scraped/<slug>.json
   (docs/bing-dps-validation-handoff.md §3): tli_dump portable read → poorchlight's planner export
   → native talent records (portable) + prism state (raw read; the portable projection drops
   placements). Needs an elevated shell and a built poorchlight tli_dump.

   usage: node scripts/scrape_build.mjs <slug> [--stated "<DPS as stated>"] [--poorchlight ../poorchlight] */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const slug = args[0];
if (!slug || slug.startsWith("--")) throw new Error("usage: node scripts/scrape_build.mjs <slug> [--stated ...]");
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const poor = path.resolve(root, opt("--poorchlight", "../poorchlight"));

const portable = JSON.parse(execFileSync(path.join(poor, "target/release/tli_dump.exe"), ["--portable-json"],
  { cwd: poor, maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "inherit"] }).toString("utf8"));
const { createCompendiumExport } = await import(pathToFileURL(path.join(poor, "tli_dump/ui/compendium-export.mjs")).href);
const exp = createCompendiumExport(portable);

const raw = JSON.parse(fs.readFileSync(path.join(poor, "tli_dump/diagnostics/_last_live_snapshot.json"), "utf8"));
const flat = n => n.children?.length ? Object.fromEntries(n.children.map(c => [c.name, flat(c)])) : n.value;
let prismNode = null;
const seen = new Set();
(function walk(v) {
  if (prismNode || !v || typeof v !== "object" || seen.has(v)) return;
  seen.add(v);
  if (v.name === "EtherealPrismState") prismNode = v;
  for (const x of Array.isArray(v) ? v : Object.values(v)) walk(x);
})(raw);
const ps = prismNode ? flat(prismNode) : null;
const nativePrisms = ps && typeof ps.Items === "object" ? {
  items: Object.values(ps.Items).map(i => ({
    configBaseId: i.ConfigBaseId, itemId: i.ItemId, level: +i.Level, rare: +i.RareValue,
    affixes: Object.fromEntries(Object.entries(i.AffixList ?? {}).filter(([, v]) => v && typeof v === "object")
      .map(([k, v]) => [k, Object.values(v).map(a => ({ id: a.Id, args: a.DynArgs && typeof a.DynArgs === "object" ? Object.values(a.DynArgs).map(Number) : [] }))])),
  })),
  placements: Object.values(ps.Placements ?? {}).map(p => ({ itemId: p.ItemId, tree: +p.TalentCareerId,
    template: +p.TalentTemplateId, center: p.CenterTalentId, area: Object.values(p.AreaTalentIds ?? {}) })),
} : null;

const pro = portable.proBuild ?? {};
// poorchlight's catalog lacks some Magnificent tiers (Upheaval T2) and drops the support; the item's
// own tier table identifies the roll, so put it back into the owner skill's socket
const omitted = exp.omitted.filter(o => o.section !== "skillSupports");
let restored = 0;
for (const it of pro.loadout?.skills?.items ?? []) {
  const at = it.data?.compendiumPlacement, meta = it.identity?.base?.metadata ?? {};
  const rolls = Object.values(it.data?.ServerPlayerItem?.Prefix ?? {}).flatMap(a => Object.values(a.DynArgs ?? {})).map(Number);
  if (at?.kind !== "support" || at.ownerKind !== "active" || !meta.skillTierProgression || !rolls.length) continue;
  const sockets = exp.payload.loadouts.loadouts[0].skills.activeSkills[at.ownerSlot]?.supports;
  if (!sockets || sockets[at.slot]) continue;
  const tier = meta.skillTierProgression.find(t => rolls[0] >= t.value1Min && rolls[0] <= t.value1Max)?.tier;
  if (tier === undefined) throw new Error(`${it.identity.base.label}: roll ${rolls} matches no tier`);
  sockets[at.slot] = { icon: meta.icon, rank: 1, rollValues: rolls, supportGuid: it.identity.base.compendiumId,
                       tier, type: meta.skillType };
  restored++;
}
if (restored < exp.omitted.filter(o => o.section === "skillSupports").reduce((n, o) => n + (o.observedCount ?? 1), 0))
  omitted.push(...exp.omitted.filter(o => o.section === "skillSupports"));
exp.omitted = omitted;
const out = {
  source: `tli_dump live page, ${new Date().toISOString()}`, proBuildId: pro.id ?? null, name: pro.name ?? null,
  statedDps: opt("--stated", null), compendium: exp.payload,
  nativeTalents: (pro.loadout?.skillTree?.records ?? []).map(r => r.data),
  nativePrisms, exportOmitted: exp.omitted,
};
const dest = path.join(root, "data/bing1/scraped", `${slug}.json`);
fs.writeFileSync(dest, JSON.stringify(out) + "\n");
console.log(`${out.name ?? "(no title)"} -> ${dest}  (talent trees ${out.nativeTalents.length}, prisms ${nativePrisms?.items.length ?? 0}, omitted ${JSON.stringify(exp.omitted.map(o => o.section))})`);
