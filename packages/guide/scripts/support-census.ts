// SUP2: every support gem on the season catalog in place of Hammer of Ash's weakest support, on the live read: dropped by the tag gate, stops, partial, or priced
import { readFileSync, writeFileSync } from 'node:fs';
import { fromExport } from '../src/start';
import { createEvaluator } from '../src/engine/pool';
import { table } from '../src/pin';
const base: any = (table<any>('config_item_base') as any).rows, st: any = (table<any>('config_skill_stone') as any).rows, lang: any = (table<any>('lang_en') as any).rows;
const gems = new Map<number, string>();
for (const [b, r] of Object.entries<any>(base)) { const sid = r.p5c?.[0], n = lang[`item_base|name|${b}`]; if (typeof sid === 'number' && st[sid] && n && (st[sid].i4 === 2 || (st[sid].i4 === 6 && /^Hammer of Ash: /.test(n)))) gems.set(sid, n); }
const s: any = fromExport(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const L = s.loadout, socks = L.skills.filter((g: any) => g.place.ownerKind === 'active' && g.place.ownerSlot === 0);
const ev = await createEvaluator({ workers: 16 } as never), C: any = { level: 90, skill: 'hoa', target: null };
const f0 = (await ev.run(L, [], C)).figure;
const without = await Promise.all(socks.map(async (g: any) => ({ g, k: (await ev.run({ ...L, skills: L.skills.filter((x: any) => x !== g) }, [], C)).figure.life100 })));
const weak = without.sort((a, b) => b.k - a.k)[0].g;
console.log(`weakest support: ${weak.name} (socket ${weak.place.slot}): without it x${(without[0].k / f0.life100).toFixed(3)}`);
const rows = await Promise.all([...gems].filter(([sid]) => !socks.some((g: any) => g.sid === sid)).map(async ([sid, name]) => {
  const r = await ev.run(L, [{ kind: 'support', action: 'replace', owner: { kind: 'active', slot: 0 }, socket: weak.place.slot, gem: { sid, level: st[sid].i4 === 6 ? 1 : 20, name } } as any], C);
  const dropped = r.dropped.length > 0, extra = r.figure.partial.filter((p) => !f0.partial.includes(p));
  const status = dropped ? 'not allowed (dropped)' : r.figure.stop ? 'stops' : extra.length ? 'partial' : 'priced';
  return { sid, name, status, gain: r.figure.stop || dropped ? null : r.figure.life100 / f0.life100, why: dropped ? r.dropped[0] : r.figure.stop ?? extra[0] ?? '' };
}));
const by = (st: string) => rows.filter((r) => r.status === st);
console.log(`supports: ${rows.length}; priced ${by('priced').length}, partial ${by('partial').length}, stops ${by('stops').length}, not allowed ${by('not allowed (dropped)').length}`);
for (const r of [...by('priced'), ...by('partial')].sort((a, b) => b.gain! - a.gain!).slice(0, 25)) console.log(`  ${r.status === 'partial' ? '[partial] ' : ''}x${r.gain!.toFixed(3)} ${r.name}${r.status === 'partial' ? ` | ${r.why.slice(0, 120)}` : ''}`);
for (const r of by('stops').slice(0, 12)) console.log(`  [stops] ${r.name}: ${r.why.slice(0, 140)}`);
writeFileSync(process.argv[3] ?? 'sup2.json', JSON.stringify({ weakest: weak.name, rows }, null, 1));
await ev.close(); process.exit(0);
