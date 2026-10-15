/** guide ideal [--out path] | advise <export.json> [--fe N] [--season N] [--out path] [--budget-minutes N, default 30] | figure <loadout.json> [--skill hoa|iceShot] [--level N]   (all: [--workers N] [--bombs N, default 10] [--budget-minutes N] [--roll-budget N, default 1<<20] [--target <dps-debug BOSSES key | dummy>, default cube3: what Hammer of Ash is priced against]) */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { writeAtomic } from './atomic';
import { fileURLToPath } from 'node:url';
import { mainSid } from './candidates/gems';
import { createEvaluator, DEFAULT_FIGHT } from './engine/pool';
import { localItems, runAdvise, runIdeal } from './modes';
import { fetchSeason, fetchSnapshot, snapshotBook } from './pricing';
import { fromExport } from './start';
import type { GuideOut, Skill } from './types';

const [cmd, ...args] = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(`--${name}`); return i < 0 ? undefined : args[i + 1]; };
const positional = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const num = (name: string) => { const v = flag(name); if (v !== undefined && !Number.isFinite(Number(v))) throw new Error(`--${name} needs a number`); return v === undefined ? undefined : Number(v); };
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const bombs = num('bombs');
const rollBudget = num('roll-budget');
const budgetMinutes = num('budget-minutes');
const final = (f: string, text: string) => { if (!writeAtomic(f, text)) throw new Error(`could not write ${f}`); };
const dump = (o: GuideOut) => JSON.stringify(o, null, 1) + '\n';
const evaluator = () => createEvaluator({ workers: num('workers'),
  onBusy: (p) => console.log(p ? 'game busy: evaluator paused' : 'game free: evaluator resumed'), ...(rollBudget === undefined ? {} : { rollBudget }), ...(flag('target') === undefined ? {} : { target: flag('target') === 'dummy' ? null : flag('target') }), ...(bombs === undefined ? {} : { fight: { ...DEFAULT_FIGHT, bombs } }), memoDir: fileURLToPath(new URL('../.cache/memo', import.meta.url)) });

async function main() {
  if (cmd === 'ideal') {
    const out = flag('out') ?? fileURLToPath(new URL('../../page/src/data/guide.json', import.meta.url));
    const ev = await evaluator();
    try { final(out, dump(await runIdeal(ev, budgetMinutes === undefined ? {} : { budgetMinutes }, undefined, (o) => writeAtomic(out, dump(o))))); } finally { await ev.close(); }
    console.log(`wrote ${out}`);
  } else if (cmd === 'advise') {
    if (!positional) throw new Error('usage: guide advise <export.json> [--fe N] [--out path]');
    const state = fromExport(readJson(positional), num('fe'));
    const prices = snapshotBook(await Promise.resolve().then(async () => fetchSnapshot(num('season') ?? await fetchSeason(), localItems())).catch((e: Error) => { console.warn(`live etor prices unavailable (${e.message}); using the stored snapshot`); return localItems(); }));
    const ev = await evaluator();
    const out = flag('out') ?? 'advice.json';
    // the export button waits on this: a Hammer of Ash figure is slow, so advise stops after 30 minutes unless told otherwise (the page shows a partial run)
    try { final(out, dump(await runAdvise(ev, state, { budgetMinutes: budgetMinutes ?? 30 }, prices, (o) => writeAtomic(out, dump(o))))); } finally { await ev.close(); }
    // UTF-8 through an env-named file, as reader/export.py does, so non-ASCII names survive
    execFileSync('powershell', ['-NoProfile', '-Command', 'Set-Clipboard -Value ([IO.File]::ReadAllText($env:ADVICE_FILE, [Text.Encoding]::UTF8))'], { env: { ...process.env, ADVICE_FILE: out } });
    console.log(`wrote ${out} and copied it to the clipboard`);
  } else if (cmd === 'figure') {
    if (!positional) throw new Error('usage: guide figure <loadout.json> [--skill hoa|iceShot] [--level N]');
    const loadout = readJson(positional);
    const main0 = (loadout.skills as { sid: number; place: { kind: string; slot: number } }[] | undefined)?.find((g) => g.place.kind === 'active' && g.place.slot === 0);
    const skill = (flag('skill') ?? (['hoa', 'iceShot'] as Skill[]).find((s) => mainSid(s) === main0?.sid)) as Skill | undefined;
    if (skill !== 'hoa' && skill !== 'iceShot') throw new Error('cannot tell the main skill; pass --skill hoa|iceShot');
    const ev = await evaluator();
    try {
      const r = await ev.run(loadout, [], { level: num('level') ?? loadout.hero?.level ?? 100, skill });
      console.log(JSON.stringify({ pin: ev.pin, skill, figure: r.figure, inputs: r.inputs }, null, 1));
    } finally { await ev.close(); }
  } else {
    throw new Error('usage: guide ideal | advise <export.json> | figure <loadout.json>');
  }
}
main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
