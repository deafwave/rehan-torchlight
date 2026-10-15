/* Readable summary of the build page open in game, from memory (tli_dump). Elevated shell.
   usage: node state.mjs [--reuse] [--section gear|skills|memories|traits|talents|slates|prisms|pacts|kismets|issues]
   --reuse reads the last dump instead of reading the game again. */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const only = args.includes("--section") ? args[args.indexOf("--section") + 1] : null;
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const poor = path.resolve(here, "../../../../poorchlight");
const portablePath = path.join(poor, "tli_dump/diagnostics/_last_live_portable.json");
if (!args.includes("--reuse"))
  execFileSync(path.join(poor, "target/release/tli_dump.exe"), ["--portable-json"], { cwd: poor, stdio: ["ignore", "ignore", "inherit"], maxBuffer: 1 << 28 });
const portable = JSON.parse(fs.readFileSync(portablePath, "utf8"));
const lo = portable.proBuild?.loadout ?? {};
const list = v => (Array.isArray(v) ? v : Object.values(v ?? {})).filter(Boolean);
const text = s => String(s ?? "").replace(/<[^>]+>/g, "").replace(/\n/g, " / ");
const affixes = it => Object.entries(it.affixes ?? {}).flatMap(([k, v]) => list(v).map(a => [k, text(a.Simple), a.Id]))
  .filter(([, t]) => t);
const out = [];
const section = (name, fn) => { if (!only || only === name) { out.push(`## ${name}`); fn(); out.push(""); } };

out.push(`${portable.proBuild?.name ?? "(no build page)"} — ${lo.hero?.sourceName ?? "?"} L${lo.hero?.level ?? "?"} (${lo.hero?.identity?.label ?? "?"}), page ${portable.proBuild?.sourcePage}, captured ${portable.capturedAt}`, "");
section("traits", () => {
  for (const [slot, id] of Object.entries(lo.hero?.sourceData?.compendiumTraits ?? {})) out.push(`  ${slot}: ${id}`);
  out.push("  (names/levels: pnpm bing diagnose prints them; levels come from the slot's memory)");
});
section("memories", () => list(lo.heroMemories?.items).forEach(it => {
  out.push(`  ${it.identity?.base?.label} (item level ${it.itemLevel})`);
  for (const [k, t] of affixes(it)) out.push(`    ${k.replace("InfoList", "").padEnd(10)} ${t}`);
}));
section("gear", () => list(lo.gear?.items).forEach(it => {
  out.push(`  ${it.identity?.base?.label ?? it.identity?.base?.gameId} [${it.location?.slot}]${it.corroded ? " corroded" : ""}`);
  for (const [k, t] of affixes(it)) out.push(`    ${k.replace("InfoList", "").padEnd(10)} ${t}`);
}));
section("skills", () => {
  const items = list(lo.skills?.items);
  const owner = (kind, slot) => items.filter(i => i.data?.compendiumPlacement?.ownerKind === kind && i.data.compendiumPlacement.ownerSlot === slot)
    .sort((a, b) => a.data.compendiumPlacement.slot - b.data.compendiumPlacement.slot);
  for (const it of items.filter(i => ["active", "passive"].includes(i.data?.compendiumPlacement?.kind))) {
    const at = it.data.compendiumPlacement;
    out.push(`  ${at.kind} ${at.slot}: ${it.identity?.base?.label} L${it.itemLevel}`);
    for (const s of owner(at.kind, at.slot)) {
      const rolls = list(s.data?.ServerPlayerItem?.Prefix).flatMap(a => list(a.DynArgs));
      out.push(`    [${s.data.compendiumPlacement.slot}] ${s.identity?.base?.label} L${s.itemLevel}${rolls.length ? ` roll ${rolls}` : ""}${s.diagnostics?.length ? "  !! " + s.diagnostics.join("; ") : ""}`);
    }
  }
});
section("talents", () => list(lo.skillTree?.records).forEach(r => {
  const nodes = Object.entries(r.data?.GeniusList ?? {}).filter(([, v]) => v > 0);
  out.push(`  tree ${r.sourceKey}: ${nodes.reduce((s, [, v]) => s + v, 0)} points on ${nodes.length} nodes; core ${JSON.stringify(r.data?.BonusTalents ?? [])}`);
  out.push(`    ${nodes.map(([k, v]) => `${k.replace(/\D/g, "")}:${v}`).join(" ")}`);
}));
section("slates", () => list(lo.divinity?.records).forEach(r => list(r.data?.compendium?.inventory).forEach(sl =>
  out.push(`  ${sl.affixes?.[0]?.slateType ?? "slate"}: ${list(sl.affixes).map(a => `${a.nodeType}: ${text(a.description)}`).join(" | ")}`))));
section("prisms", () => list(lo.etherealPrisms?.items).forEach(it => {
  out.push(`  ${it.identity?.base?.label} (${it.instanceId})`);
  for (const [k, t, id] of affixes(it)) out.push(`    ${k.padEnd(18)} ${t || "(no text)"} ${id}`);
  for (const [k, v] of Object.entries(it.affixes ?? {})) for (const a of list(v)) if (!a.Simple) out.push(`    ${k.padEnd(18)} id ${a.Id} (no text in memory; catalog: ethereal-prism gameId)`);
}));
section("pacts", () => list(lo.pactspirits?.records).forEach(r =>
  out.push(`  ${r.identity?.label}: StarRank ${r.data?.StarRank} (= level), equipped ${r.data?.bEquip}`)));
section("kismets", () => list(lo.kismets?.records).forEach(r =>
  out.push(`  ${r.identity?.label} @ ${r.data?.compendium?.nodeId} on pact ${r.data?.compendium?.pactspritIndex}`)));
section("issues", () => {
  const iss = (portable.mappingIssues ?? []).filter(i => !String(i.path).startsWith("player"));
  out.push(`  ${iss.length} build-page mapping issues`, ...iss.slice(0, 30).map(i => `    ${i.kind} ${i.path}: ${i.message}`));
});
console.log(out.join("\n"));
