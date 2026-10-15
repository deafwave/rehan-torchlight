import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
const OLD = ['damageModel', 'buildParser', 'bingLedger', 'bingIntrinsic', 'bingFactorLedger', 'guardedCompiler',
  'minionDamageEnvelope', 'minionEvidence', 'playerDefenseEvidence', 'supportEvidence', 'cycleDps', 'clientDps', 'progression.ts', '@rehan/'];
test('no old DPS math or @rehan scope remains in the repo', () => {
  const hits = OLD.flatMap(w => {
    try { return execSync(`git grep -l -F "${w}" -- packages scripts .claude package.json pnpm-workspace.yaml vercel.json`, { encoding: 'utf8', cwd: fileURLToPath(new URL('../../..', import.meta.url)) }).trim().split('\n').filter(Boolean).map(f => `${w}: ${f}`); }
    catch { return []; }   // git grep exits 1 when nothing matches
  }).filter(h => !h.endsWith('no-old-math.test.ts'));
  expect(hits).toEqual([]);
});
