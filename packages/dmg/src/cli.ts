/* CLI entry: snapshot / rank / catalog / progression subcommands.
   Run from anywhere; file defaults resolve against the repo root. */
import fs from "node:fs";
import path from "node:path";
import { fromRoot, asciiJson } from "./py.js";
import { parseBuild, printReport } from "./buildParser.js";
import { cycleDps, type Snapshot } from "./damageModel.js";

const loadJson = (p: string) => JSON.parse(fs.readFileSync(p, "utf-8"));
// pnpm --filter runs with CWD=packages/dmg; repo-root-relative paths still resolve
const resolve = (p: string) => {
  if (path.isAbsolute(p)) return p;
  const cwdPath = path.resolve(process.cwd(), p);
  return fs.existsSync(cwdPath) ? cwdPath : fromRoot(p);
};

function snapshotCmd(args: string[]): void {
  let build = fromRoot("data/Rehan.json");
  let out = fromRoot("data/snapshot.json");
  let loadout: number | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-o" || args[i] === "--out") out = resolve(args[++i]);
    else if (args[i] === "-l" || args[i] === "--loadout") loadout = parseInt(args[++i], 10);
    else build = resolve(args[i]);
  }
  const [snap, report] = parseBuild(build, loadout);
  printReport(report);
  fs.writeFileSync(out, asciiJson(snap, 1), "utf-8");
  console.log(`snapshot -> ${out}`);
}

async function rankCmd(args: string[]): Promise<void> {
  const { STANDARD_PERTURBATIONS, validateSnapshot, sensitivity, compareSnapshots, bump } =
    await import("./rank.js");
  const cmd = args[0];
  if (cmd === "sensitivity") {
    const s: Snapshot = loadJson(resolve(args[1] ?? fromRoot("data/snapshot.json")));
    validateSnapshot(s);
    const base = cycleDps(s);
    console.log(`baseline DPS: ${Math.round(base.dps).toLocaleString("en-US")}  (cycle ${base.cycle_time.toFixed(2)}s)`);
    for (const r of sensitivity(s, STANDARD_PERTURBATIONS)) {
      const pct = `${r.delta_pct >= 0 ? "+" : ""}${r.delta_pct.toFixed(2)}%`;
      console.log(`${pct.padStart(8)}  ${r.label}`);
    }
  } else if (cmd === "compare") {
    const a: Snapshot = loadJson(resolve(args[1]));
    const b: Snapshot = loadJson(resolve(args[2]));
    const d = compareSnapshots(a, b);
    console.log(`A: ${Math.round(cycleDps(a).dps).toLocaleString("en-US")}  B: ${Math.round(cycleDps(b).dps).toLocaleString("en-US")}  delta ${d >= 0 ? "+" : ""}${d.toFixed(2)}%`);
  } else if (cmd === "apply") {
    const s: Snapshot = loadJson(resolve(args[1]));
    const delta = parseFloat(args[3]);
    const d = compareSnapshots(s, bump(s, args[2], delta));
    console.log(`${d >= 0 ? "+" : ""}${d.toFixed(2)}%  (${args[2]} ${delta >= 0 ? "+" : ""}${delta})`);
  } else {
    throw new Error(`rank: unknown subcommand '${cmd}' (sensitivity|compare|apply)`);
  }
}

async function catalogCmd(): Promise<void> {
  const { buildCatalog, inject } = await import("./catalog.js");
  const rows = buildCatalog();
  inject(rows);
  const modeled = rows.filter(r => r.delta !== null).length;
  console.log(`catalog: ${rows.length} unique mods injected (${modeled} modeled, ${rows.length - modeled} unmodeled)`);
}

async function progressionCmd(): Promise<void> {
  const { buildRows, inject, buildPrisms, injectPrisms } = await import("./progression.js");
  const rows = buildRows();
  inject(rows);
  const prisms = buildPrisms();
  injectPrisms(prisms);
  console.log(`prisms: ${prisms.length} ladders injected`);
  for (const r of rows) {
    console.log(r.slot.padEnd(9), r.rungs.map(g =>
      `${g.label} ${g.dps}M` + (g.gain !== null ? ` (${g.gain >= 0 ? "+" : ""}${g.gain.toFixed(1)}%)` : "")
    ).join(" -> "));
  }
  console.log(`progression: ${rows.length} slot ladders injected`);
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "snapshot") snapshotCmd(rest);
  else if (cmd === "rank") await rankCmd(rest);
  else if (cmd === "catalog") await catalogCmd();
  else if (cmd === "progression") await progressionCmd();
  else {
    console.error("usage: cli.ts <snapshot|rank|catalog|progression> [args]");
    process.exit(2);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
