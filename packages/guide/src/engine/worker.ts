/** Worker thread: loads the pinned dps-debug figure module and the catalog once, then prices jobs. The pin module is imported by file URL
 *  from workerData.pinRoot, so no `@dps` alias is needed here. tsx is registered in-thread: Node 24 strips this file's types natively
 *  and `--import tsx` does not reach it, so every .ts import after `register()` is dynamic. */
import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { register } from 'tsx/esm/api';
import type { Loadout } from '../types';
import type { Job, JobResult } from './pool';

register();
const { applyPatch, isPatch } = await import('../patches');
const { applyInOrder, figureDefaultFirst, withAsked } = await import('./apply');
const root = (workerData as { pinRoot: string }).pinRoot;
const fig: typeof import('@dps/guide/figure') = await import(pathToFileURL(join(root, 'model', 'guide', 'figure.ts')).href);
const cat = fig.openCatalog(join(root, 'catalog'));   // SEA1: the season client's rows are applied by openCatalog itself
const session = fig.figureSession(cat);   // one per worker: related builds share compiles; bit-equal to guideFigure
const learned: Record<string, number> = {};   // the fight inputs this worker's figures asked (withAsked)

function price({ loadout, changes, ctx, fight, rollBudget, target }: Job): JobResult {
  const { loadout: lo, dropped } = applyInOrder(loadout, changes, { isPatch, applyPatch,
    applyChanges: (l, cs) => fig.applyChanges(cat, l as never, cs, ctx.skill, { heroLevel: ctx.level }) as unknown as { loadout: Loadout; dropped: string[] } });
  const base = fig.GROUNDS[ctx.skill];
  const boss = target === undefined ? undefined : (fig.BOSSES as Record<string, string>)[target];
  if (target !== undefined && !boss) throw new Error(`no boss target ${target} (dps-debug BOSSES: ${Object.keys(fig.BOSSES).join(', ')})`);
  const ground = (extra: Record<string, number>) => ({ ...base, ...(boss ? { target: boss } : {}), carry: { ...base.carry, fight: { ...fight, inputs: { ...fight.inputs, ...extra } } } });
  const g = withAsked(extra => figureDefaultFirst(o => session.figure(lo as never, ctx.skill, { heroLevel: ctx.level, ground: ground(extra), ...o }), rollBudget), learned);
  const cull = g.cull ? { threshold: g.cull.threshold, blocked: g.cull.blocked, ...(g.cull.stop ? { stop: g.cull.stop } : {}) } : undefined;
  return { loadout: lo, dropped, fig: { life100: g.life100, life0: g.life0, left: g.left.map(x => x.name), needs: g.needs, stop: g.stop, inputs: g.inputs as never,
    lock: g.lock?.ceiling, ...((g as { mana?: unknown }).mana ? { mana: (g as { mana?: never }).mana } : {}), ...((g as { projectile?: unknown }).projectile ? { projectile: (g as { projectile?: never }).projectile } : {}), ...(cull ? { cull } : {}), ...(boss ? { lifeMax: (g.inputs as { target?: { lifeMax: number } }).target?.lifeMax } : {}) } };
}

parentPort!.on('message', (m: { id: number; job: Job }) => {
  try { parentPort!.postMessage({ id: m.id, result: price(m.job) }); }
  catch (e) { parentPort!.postMessage({ id: m.id, error: (e as Error).message ?? String(e) }); }
});
parentPort!.postMessage({ ready: true });
