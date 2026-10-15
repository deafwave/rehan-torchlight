/* Measure at the training dummy from memory (elevated shell; poorchlight tli_dump).
   usage: node combat.mjs [secs=30] [--label name] [--buffs] [--hits]
   DPS is per GAME second: Δ total damage / (Δ logic frames / 30) — the dummy panel's own clock. The client
   simulates slower than real time when its frame rate drops (0.7–0.9× seen), so wall-clock DPS reads low and
   drifts; never compare wall-clock numbers to the model. --buffs adds a buff/debuff uptime pass (one
   --combat-json read per ~1.1s for the same duration, run afterwards).
   --hits runs `tli_dump --hit-watch` over the same window: one CSV row per hit the dummy takes (kept as
   scratch/watch/<label>-hits.csv); adds hits, hitsPerS (per game second), hitTypes and hitSumRatio (Σ per-hit ÷
   the dummy's own total over the same frames — must be 1 within 0.5%, else the run is flagged).
   Appends one JSON line per run to scratch/measurements.jsonl and keeps the per-frame CSV in scratch/watch/. */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const secs = Number(args.find(a => /^\d+$/.test(a)) ?? 30);
const label = args.includes("--label") ? args[args.indexOf("--label") + 1] : "";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const poor = path.resolve(here, "../../../../poorchlight");
const exe = path.join(poor, "target/release/tli_dump.exe");
const fmt = n => n >= 1e12 ? `${(n / 1e12).toFixed(3)}T` : `${(n / 1e9).toFixed(1)}B`;

// the damage watch runs in the background while --buffs samples buffs/debuffs over the same window
const watch = spawn(exe, ["--combat-watch", String(secs), "--interval-ms", "10"], { cwd: poor, stdio: "ignore" });
const done = new Promise(r => watch.on("exit", r));
let hitsOut = "";
const hitWatch = args.includes("--hits") && spawn(exe, ["--hit-watch", String(secs)], { cwd: poor, stdio: ["ignore", "pipe", "ignore"] });
const hitsDone = hitWatch ? new Promise(r => { hitWatch.stdout.on("data", d => { hitsOut += d; }); hitWatch.on("exit", r); }) : null;
const up = {}, stacks = {}; let n = 0;
if (args.includes("--buffs")) {
  let finished = false; done.then(() => { finished = true; });
  while (!finished) {
    const j = JSON.parse(execFileSync(exe, ["--combat-json"], { cwd: poor, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 24 }).toString("utf8"));
    n++;
    for (const x of j.buffs ?? []) up[x.name] = (up[x.name] ?? 0) + 1;
    for (const x of j.target?.debuffs ?? []) {
      up[`target:${x.name}`] = (up[`target:${x.name}`] ?? 0) + 1;
      if (x.stacks != null) (stacks[x.name] ??= []).push(x.stacks);
    }
    await new Promise(r => setTimeout(r, 0));
  }
}
await done;
const csv = path.join(poor, "tli_dump/diagnostics/_last_combat_watch.csv");
// keep each run's per-frame capture for throw-period.mjs: ../scratch/watch/<label>.csv (then <label>-2.csv, …)
const watchDir = path.resolve(here, "../../../../scratch/watch");
fs.mkdirSync(watchDir, { recursive: true });
let kept = path.join(watchDir, `${label || "unlabeled"}.csv`);
for (let i = 2; fs.existsSync(kept); i++) kept = path.join(watchDir, `${label || "unlabeled"}-${i}.csv`);
fs.copyFileSync(csv, kept);
const rows = fs.readFileSync(csv, "utf8").trim().split(/\r?\n/).slice(1)
  .map(l => l.split(",").map(Number)).map(([t, dmg, dur, frame]) => ({ t, dmg, dur, frame }));
const [a, b] = [rows[0], rows.at(-1)];
const gameS = (b.frame - a.frame) / 30, wallS = (b.t - a.t) / 1000;
const out = { label, at: new Date().toISOString(), wallS, gameS, speed: gameS / wallS,
  dps: (b.dmg - a.dmg) / gameS, wallDps: (b.dmg - a.dmg) / wallS, increments: rows.length - 2 };
console.log(`${label ? label + ": " : ""}DPS ${fmt(out.dps)} per game-second over ${gameS.toFixed(1)} game-s ` +
  `(${wallS.toFixed(1)} wall-s, sim speed ${out.speed.toFixed(2)}×, wall-clock ${fmt(out.wallDps)})${b.dmg < a.dmg ? "  !! count reset" : ""}`);

if (n) {
  out.uptime = Object.fromEntries(Object.entries(up).map(([k, v]) => [k, v / n]));
  out.stacks = Object.fromEntries(Object.entries(stacks).map(([k, v]) => [k, v.reduce((s, x) => s + x, 0) / v.length]));
  for (const [k, v] of Object.entries(out.uptime).sort((x, y) => y[1] - x[1]))
    console.log(`  ${(100 * v).toFixed(0).padStart(3)}%  ${k}${out.stacks[k.replace("target:", "")] != null ? `  stacks avg ${out.stacks[k.replace("target:", "")].toFixed(1)}` : ""}`);
}
if (hitWatch) {
  await hitsDone;
  const h = JSON.parse(hitsOut);
  if (h.error) throw new Error(`hit-watch: ${h.error}`);
  fs.copyFileSync(h.csv, kept.replace(/\.csv$/, "-hits.csv"));
  // hit types: kind 4 = HP-removal ticks (Deterioration here); kind 0 split by flags (40 Ember volley, 16 main hit)
  const types = {};
  for (const l of fs.readFileSync(h.csv, "utf8").trim().split(/\r?\n/).slice(1)) {
    const [, kind, crit, , , , , flags] = l.split(",").map(Number);
    const k = kind === 0 ? `hit/${flags}` : kind === 4 ? "hpRemoval" : `kind${kind}`;
    types[k] ??= { n: 0, crit: 0 }; types[k].n++; types[k].crit += crit;
  }
  // serde writes NaN (stopped dummy clock) as null
  const ratio = h.sumRatio ?? NaN, perS = h.hitsPerGameS ?? NaN;
  Object.assign(out, { hits: h.hits, hitsPerS: perS, hitTypes: types, hitSumRatio: ratio });
  const bad = !(Math.abs(ratio - 1) <= 0.005);
  console.log(`  hits ${h.hits} (${perS.toFixed(1)}/game-s)  Σ per-hit ÷ dummy total ${ratio.toFixed(5)}${bad ? "  !! per-hit sum off by >0.5%" : ""}`);
  for (const [k, v] of Object.entries(types)) console.log(`    ${k.padEnd(10)} ${String(v.n).padStart(5)}  crit ${v.crit}`);
  if (bad) out.hitSumBad = true;
}
const log = path.resolve(here, "../../../../scratch/measurements.jsonl");
fs.mkdirSync(path.dirname(log), { recursive: true });
fs.appendFileSync(log, JSON.stringify(out) + "\n");
