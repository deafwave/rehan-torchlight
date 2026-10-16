/* One-off: checks every affix-library tier id against the pinned dps-debug catalog and writes src/data/affix-ids.json.
   A tier id is verified when it is a config_modifier id (config_modifier_rolls has one row per modifier). Also recorded: whether each of the tier text's (lo-hi) ranges is one of the modifier's
   rolls, and the config_affix group check from the brief (config_affix is keyed by another id space: informational). Run: tsx scripts/verify-affix-ids.ts */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pinCommit, table } from '../src/pin';

const rows = (f: string): Record<string, unknown> => table<{ rows: Record<string, unknown> }>(f).rows;
const rolls = rows('config_modifier_rolls'), affix = rows('config_affix');
const lib = JSON.parse(readFileSync(fileURLToPath(new URL('../../../data/affix_library.json', import.meta.url)), 'utf8')).affixes;

const mismatches: string[] = [], rollMismatches: string[] = [];
let total = 0, groupOk = 0, rollOk = 0, rollChecked = 0;
for (const a of lib) for (const t of a.tiers) {
  total++;
  const id = String(t.tierAffixId);
  if (!(id in rolls)) mismatches.push(id);
  const nums = [...String(t.text).matchAll(/\((-?[\d.]+)-(-?[\d.]+)\)/g)].map(m => [Number(m[1]), Number(m[2])]);
  const r = rolls[id] as number[][] | undefined;
  // each text range is one of the rolls, in any order (the text can name them in another order: 110110001 states its damage before its -20% attack speed)
  const left = [...(r ?? [])], hit = (lo: number, hi: number) => { const i = left.findIndex(x => x[0] === lo && x[1] === hi); return i >= 0 && !!left.splice(i, 1); };
  if (r && nums.length) { rollChecked++; if (nums.every(([lo, hi]) => hit(lo, hi))) rollOk++; else rollMismatches.push(id); }
  if (Math.floor(Number(id) / 100) in affix || id in affix) groupOk++;
}
writeFileSync(fileURLToPath(new URL('../src/data/affix-ids.json', import.meta.url)),
  JSON.stringify({ pin: pinCommit(), total, modifierMatch: total - mismatches.length, groupMatch: groupOk, rollChecked, rollMatch: rollOk, mismatches, rollMismatches }) + '\n');
console.log({ rollChecked, rollOk, total, modifierMatch: total - mismatches.length, groupMatch: groupOk, mismatches: mismatches.length });
