/* Your owned pactspirits from the running game (poorchlight tli_dump --probe-pets, elevated shell) -> src/data/owned-pacts.json: { readAt, pets: [{ servantId, rank }] }
   (rank = StarRank, the game shows rank + 1). Run: tsx scripts/owned-pacts.ts */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const poor = fileURLToPath(new URL('../../../../poorchlight/', import.meta.url));
const out = JSON.parse(execFileSync(`${poor}target/release/tli_dump.exe`, ['--probe-pets'], { cwd: poor, encoding: 'utf8', maxBuffer: 1 << 26 }));
if (out.error) throw new Error(`tli_dump --probe-pets: ${out.error}`);
const pets = (out.pets as { Id: number; StarRank: number; bOwn: boolean }[]).filter((p) => p.bOwn).map((p) => ({ servantId: p.Id, rank: p.StarRank })).sort((a, b) => a.servantId - b.servantId);
writeFileSync(fileURLToPath(new URL('../src/data/owned-pacts.json', import.meta.url)), JSON.stringify({ readAt: new Date().toISOString(), pets }, null, 1) + '\n');
console.log(`${pets.length} owned pactspirits`);
