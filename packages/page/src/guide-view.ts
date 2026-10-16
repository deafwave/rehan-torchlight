/** Structural copy of Figure / Move / Step / GuideOut in packages/guide/src/types.ts (that file imports @dps/*, which only resolves via the guide tsconfig paths). Keep in sync. */
export interface Figure { life100: number; life0: number; kill: number; partial: string[]; stop?: string; lock?: number; cull?: number; cullNote?: string; target?: string; lifeMax?: number }
export interface Move { kind: string; label: string; acquisition: boolean; costFE: number | null; minLevel: number; changes: unknown[]; [k: string]: unknown }
export interface Step { level: number; move: Move; triggered: Move[]; before: Figure; after: Figure; cumFE: number; notes?: string[] }
export interface Character { level: number; skill: string; fe: number; owned?: number; gear: { slot: string; label: string }[] }
export interface GuideOut {
  mode: 'ideal' | 'advise'; pin: string; etor: { season: string; fetchedAt: string }; knobs: Record<string, unknown>;
  start: Figure; inputs?: Record<string, unknown>; startNotes?: string[]; steps: Step[]; notSearched: string[]; unpriced: string[]; notCalculable: string[];
  character?: Character; next?: NextBuy[]; prices?: Record<string, number | null>; legs?: Leg[];
  /** the plan's last build priced on every boss (life100: damage per second at full Life, before the damage lock) */ final?: { target: string; figure: Figure }[];
}
/** one tab: a skill against one yardstick (target null = the training dummy), from step `firstStep` on; `end` = why it ended */
export interface Leg { skill: string; target: string | null; firstStep: number; end?: string; start: Figure; reached?: false; build?: { section: string; lines: string[] }[] }
/** advise: one upgrade at the start with its exact figure; `buy` = what is bought and how many (cost = qty x its price) */
export interface NextBuy { label: string; kind: string; gain: number; kill: number; costFE: number | null; market?: string; buy?: { name: string; qty: number }; partial?: string[] }

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ESC[c]);

const UNITS: [number, string][] = [[1e15, 'Qa'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
/** DPS and Life in short-scale units, 3 significant digits: 712 M, 15.0 T; plain below a thousand */
export function fmtDps(n: number): string {
  for (const [v, u] of UNITS) if (Math.abs(n) >= v * 0.9995) return `${(n / v).toPrecision(3)} ${u}`;
  return String(Math.round(n));
}
/** FE: a decimal below 10, then whole numbers with separators */
export const fmtFE = (n: number) => (n < 10 ? (Math.round(n * 10) / 10).toString() : Math.round(n).toLocaleString('en-US'));
export function fmtTime(s: number): string {
  if (s < 60) return `${s.toPrecision(3)} s`;
  if (s < 3600) return `${(s / 60).toPrecision(3)} min`;
  if (s < 86400) return `${(s / 3600).toPrecision(3)} h`;
  return `${(s / 86400).toPrecision(3)} days`;
}
/** a step's effect on the kill speed: "+38 %" under a doubling, "x4.2" from there */
export function fmtGain(before: number, after: number): string {
  if (!(before > 0) || !(after >= 0)) return '';
  const r = after / before;
  return r >= 2 ? `×${r.toPrecision(2)}` : `${r >= 1 ? '+' : '−'}${Math.abs((r - 1) * 100).toFixed(r - 1 < 0.1 && r - 1 > -0.1 ? 1 : 0)} %`;
}

const SLOT: Record<string, string> = { mainHand: 'weapon', offHand: 'off-hand', ring1: 'ring', ring2: 'ring', necklace: 'necklace', belt: 'belt', gloves: 'gloves', boots: 'boots', helmet: 'helmet', chest: 'chest' };
const slotName = (s: string) => SLOT[s] ?? s;
const SKILL: Record<string, string> = { hoa: 'Hammer of Ash', iceShot: 'Ice Shot' };
const BOSS: Record<string, string> = { cube1: 'Cube 1', cube2: 'Cube 2', cube3: 'Cube 3', keegan: 'Keegan 1', keegan2: 'Keegan 2', void1: 'Void 1', void2: 'Void 2', void3: 'Void 3', traveler: 'the Traveler' };
export const bossName = (t: string) => BOSS[t] ?? t;
const ICON: Record<string, string> = { craft: '⚒', unique: '★', support: '◆', gear: '⬆', switch: '⇄', talent: '✦', core: '✦', trait: '✧', prism: '◇', slate: '▦', pact: '◈', kismet: '◈', memory: '◇', skill: '◆' };

/** a move as something to do, in the player's words */
export function actionText(m: Move): string {
  const l = m.label;
  let x: RegExpExecArray | null;
  if ((x = /^Unique (.+) in (\w+)$/.exec(l))) return `Buy ${x[1]} (${slotName(x[2])})`;
  if ((x = /^Craft (T\d+) (.+) \((prefix|suffix)\) on (\w+)$/.exec(l))) return `Craft ${x[1]} “${x[2]}” on your ${slotName(x[4])}`;
  if ((x = /^Replace socket (\d+) with (.+)$/.exec(l))) return `Swap in the ${x[2]} support (socket ${x[1]})`;
  if ((x = /^Install in socket (\d+) with (.+)$/.exec(l))) return `Add the ${x[2]} support (socket ${x[1]})`;
  if ((x = /^Rare base (.+?) \(item level (\d+)\) on (\w+)(.*)$/.exec(l))) return `New ${slotName(x[3])} base: ${x[1]} (item level ${x[2]})${x[4]}`;
  if ((x = /^Target: (.+) in (\w+)$/.exec(l))) return `Get ${x[1]} (${slotName(x[2])}, as in the 40T build)`;
  return l;
}
const cost = (m: Move) => (m.costFE == null ? 'unpriced' : m.market === 'drop' ? 'free (drops)' : m.costFE === 0 ? 'free' : `${fmtFE(m.costFE)} FE`);
const partialMark = (f: Figure) => (f.partial.length ? `<span class="warn" title="partial: ${esc(f.partial.join(', '))}">*</span>` : '');
const killTime = (f: Figure) => (f.stop || !f.lifeMax || !(f.kill > 0) ? '' : fmtTime(f.lifeMax / f.kill));
/** model notes in the player's units: 2.56e+8 -> 256 M */
const human = (t: string) => t.replace(/\b(\d+(?:\.\d+)?)e\+?(\d+)\b/g, (_, m: string, e: string) => fmtDps(Number(m) * 10 ** Number(e)));
/** a step's notes worth showing: the model's omission list stays in the data (Details), not on the plan */
const shownNotes = (s: Step) => (s.notes ?? []).filter((n) => !/^omissions differ/.test(n)).map(human);
/** before and after on the same yardstick (the switch and a boss change are not) */
const sameYard = (s: Step) => (s.before.target ?? null) === (s.after.target ?? null);

// ---- the goal card
function goalCard(g: GuideOut): string {
  const last = g.steps.at(-1)?.after ?? g.start, fe = g.steps.at(-1)?.cumFE ?? 0;
  const boss = [g.start, ...g.steps.map((s) => s.after)].find((f) => f.target)?.target;
  const blocked = (g.startNotes ?? []).map((n) => /planned switch cannot be priced yet: (.*)$/.exec(n)?.[1]).find(Boolean);
  const W: Record<string, string> = { day1: 'day 1', days1to3: 'days 1–3', week1: 'week 1', week2: 'week 2' }, pw = g.knobs?.priceWindows as Record<string, string> | undefined;
  const at = (iso: string) => iso.replace('T', ' ').replace(/:\d\d(\.\d+)?Z$/, ' UTC');
  const title = g.mode === 'advise' ? 'Your upgrade plan' : g.knobs?.livePrices ? `Ideal path (live etor prices, ${esc(at(g.etor.fetchedAt))})`
    : pw ? `Ideal path (last league’s ${esc(W[pw.iceShot] ?? pw.iceShot)} prices for Ice Shot, ${esc(W[pw.hoa] ?? pw.hoa)} for Hammer of Ash)` : 'Ideal path (last league’s prices)';
  const t = killTime(last);
  return `<div class="gl-goal"><h2>${title}</h2>`
    + `<p class="goal-line">Goal: ${boss ? `kill <b>${esc(bossName(g.legs?.at(-1)?.target ?? boss))}</b> as fast as possible` : 'the fastest kill'}${g.mode === 'advise' && isFinite(Number(g.knobs.fe)) ? ` with your ${fmtFE(Number(g.knobs.fe))} FE` : ''}</p>`
    + (Number((g.knobs.prices as { overrides?: unknown } | undefined)?.overrides) > 0 ? `<p class="goal-line">Priced with your prices file: ${Number((g.knobs.prices as { overrides: unknown }).overrides)} items at your price, the rest at etor’s.</p>` : '')
    + `<div class="goal-stats"><div><span class="k">kill speed</span><span class="v">${fmtDps(g.start.kill)} → ${fmtDps(last.kill)}</span></div>`
    + `<div><span class="k">upgrades</span><span class="v">${g.steps.length}</span></div><div><span class="k">FE spent</span><span class="v">${fmtFE(fe)}</span></div>`
    + (t ? `<div><span class="k">time to kill</span><span class="v">${t}</span></div>` : '') + '</div>'
    + (g.start.stop ? `<p class="warn goal-warn">The start could not be priced (stopped): ${esc(g.start.stop)}</p>` : '')
    + (blocked ? `<p class="warn goal-warn" title="${esc(blocked)}">The Hammer of Ash leg is not calculable yet (dps-debug: ${esc(blocked.slice(0, 90))}${blocked.length > 90 ? '…' : ''}). The plan stops at Ice Shot.</p>` : '')
    + banner(g.knobs ?? {}) + '</div>';
}
/** a run that is not a finished path says so at the top, never silently */
const banner = (k: Record<string, unknown>) =>
  (k.partialRun ? `<p class="gl-banner">Partial run: the search is still going or was cut off; these are the steps found so far.</p>` : '')
  + (k.stoppedBy ? `<p class="gl-banner">Stopped early (${esc(k.stoppedBy)}): the path ends here, not at the end level.</p>` : '');

// ---- progress: kill speed (log) against FE spent (log)
type Entry = { s: Step; n: number };
const entries = (steps: Step[], from = 0): Entry[] => steps.map((s, i) => ({ s, n: from + i + 1 }));
function chart(start: Figure, es: Entry[], fe0 = 0): string {
  const pts = [{ fe: 0, k: start.kill }, ...es.map(({ s }) => ({ fe: s.cumFE - fe0, k: s.after.kill }))].filter((p) => p.k > 0);
  if (pts.length < 2) return '';
  const W = 600, H = 120, P = 8, lx = (fe: number) => Math.log10(1 + fe), maxX = Math.max(lx(pts.at(-1)!.fe), 1e-9);
  const ys = pts.map((p) => Math.log10(p.k)), lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
  const xy = pts.map((p, i) => [P + (lx(p.fe) / maxX) * (W - 2 * P), H - P - ((ys[i] - lo) / span) * (H - 2 * P)]);
  return `<figure class="gl-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="kill speed against FE spent">`
    + `<polyline points="${xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}"/>`
    + xy.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5"/>`).join('') + '</svg>'
    + `<figcaption><span>${fmtDps(pts[0].k)}</span><span>kill speed against FE spent (both on a log scale)</span><span>${fmtDps(pts.at(-1)!.k)} at ${fmtFE(pts.at(-1)!.fe)} FE</span></figcaption></figure>`;
}

// ---- the plan, by level stage
function stages(es: Entry[], mode: GuideOut['mode']): string {
  const groups: { level: number; steps: Entry[] }[] = [];
  es.forEach((e) => { const last = groups.at(-1); if (last && last.level === e.s.level) last.steps.push(e); else groups.push({ level: e.s.level, steps: [e] }); });
  if (!groups.length) return `<p class="muted">No upgrade improves the kill speed${mode === 'advise' ? ' within your FE' : ''}${mode === 'ideal' ? ' here yet' : ''}.</p>`;
  return groups.map((gr, k) => {
    const first = gr.steps[0].s, end = gr.steps.at(-1)!.s, fe = end.cumFE - (first.cumFE - (first.move.costFE ?? 0)), b0 = sameYard(first) ? first.before.kill : first.after.kill;
    const rows = gr.steps.map(({ s, n }) => {
      const t = killTime(s.after);
      return `<li class="step" value="${n}"><span class="ico" title="${esc(s.move.kind)}">${ICON[s.move.kind] ?? '•'}<small>${n}</small></span>`
        + `<span class="what">${esc(actionText(s.move))}${shownNotes(s).map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</span>`
        + `<span class="cost">${cost(s.move)}</span><span class="gain">${s.after.stop ? '<span class="warn">stopped</span>' : sameYard(s) ? esc(fmtGain(s.before.kill, s.after.kill)) : '<span class="muted">new yardstick</span>'}${partialMark(s.after)}`
        + `<small>${fmtDps(s.after.kill)}${t ? ` · ${t}` : ''}</small></span>`
        + (s.triggered.length ? `<ul class="respecs">${s.triggered.map((x) => `<li class="respec">then: ${esc(actionText(x))}</li>`).join('')}</ul>` : '') + '</li>';
    }).join('');
    return `<details class="gl-stage"${k === 0 || mode === 'advise' ? ' open' : ''}><summary><span class="lvl">Level ${esc(gr.level)}</span>`
      + `<span>${gr.steps.length} upgrade${gr.steps.length > 1 ? 's' : ''}</span><span>${fmtFE(fe)} FE</span><span class="gain">${b0 === end.after.kill ? '' : esc(fmtGain(b0, end.after.kill))}</span></summary>`
      + `<ol class="gl-steps">${rows}</ol></details>`;
  }).join('');
}

// ---- items nobody sells, best gain first
export function hunting(unpriced: string[]): { item: string; level: number; gain: number }[] {
  const best = new Map<string, { item: string; level: number; gain: number }>();
  for (const u of unpriced) {
    const m = /^L(\d+) not on the market \/ unpriced: (.+): ([+-]?[\d.]+) % if you get it$/.exec(u);
    if (!m) continue;
    const item = m[2].replace(/^Unique /, '').replace(/^Target: /, ''), gain = Number(m[3]);
    const was = best.get(item);
    if (!was || gain > was.gain) best.set(item, { item, level: Number(m[1]), gain });
  }
  return [...best.values()].sort((a, b) => b.gain - a.gain);
}
function huntingList(g: GuideOut): string {
  const h = hunting(g.unpriced).slice(0, 10);
  return h.length ? `<section class="gl-hunt"><h3>Worth hunting (not on the market)</h3><ul>${h.map((x) =>
    `<li><span class="what">${esc(x.item)}</span><span class="gain">${esc(fmtGain(1, 1 + x.gain / 100))}</span><small>at level ${x.level}</small></li>`).join('')}</ul></section>` : '';
}

// ---- everything else, folded away
const list = (title: string, xs: string[]) =>
  xs.length ? `<section class="gl-${title}"><h4>${title} (${xs.length})</h4><ul>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : '';
function details(g: GuideOut): string {
  const why = new Map<string, number>();
  for (const n of g.notCalculable) { const r = (/: (?:stopped|dropped)[: ](.*)$/.exec(n)?.[1] ?? n).slice(0, 110); why.set(r, (why.get(r) ?? 0) + 1); }
  const top = [...why].sort((a, b) => b[1] - a[1]).slice(0, 12);
  return `<details class="gl-details"><summary>Details: inputs, notes, ${g.notSearched.length} not searched, ${g.notCalculable.length} not calculable, ${g.unpriced.length} unpriced</summary>`
    + `<p class="muted">${esc(g.mode)} guide · dps-debug pin <code>${esc(g.pin)}</code> · etor season <code>${esc(g.etor.season)}</code> (fetched ${esc(g.etor.fetchedAt)})</p>`
    + (g.inputs ? `<h4>stated inputs</h4><pre class="gl-inputs">${esc(JSON.stringify(g.inputs, null, 1))}</pre>` : '')
    + list('startNotes', g.startNotes ?? [])
    + (top.length ? `<h4>why candidates were not calculable (top reasons)</h4><ul>${top.map(([r, n]) => `<li><b>${n}×</b> ${esc(r)}</li>`).join('')}</ul>` : '')
    + list('notSearched', g.notSearched) + list('unpriced', g.unpriced) + list('notCalculable', g.notCalculable) + '</details>';
}

export function renderCharacter(c: Character): string {
  return `<div class="gl-char"><div class="char-head">Level ${esc(c.level)} · ${esc(SKILL[c.skill] ?? c.skill)} · ${esc(fmtFE(c.fe))} FE${c.owned !== undefined ? ` · ${esc(c.owned)} items owned` : ''}</div>`
    + `<dl class="char-gear">${c.gear.map((x) => `<dt>${esc(slotName(x.slot))}</dt><dd>${esc(x.label)}</dd>`).join('')}</dl></div>`;
}

// ---- what to buy next: exact gains on the player's character, ranked by the player's prices (etor's by default)
/** each upgrade at your prices: cost = qty x your unit price of what it buys (else etor's), else the move's own cost (a drop: 0; unpriced: null);
 *  ranked by ln(gain) per FE like the guide, free first, unpriced last by gain */
export function rankNext(next: NextBuy[], etor: Record<string, number | null>, mine: Record<string, number>): { n: NextBuy; unit: number | null; cost: number | null }[] {
  const score = (gain: number, cost: number | null) => (cost === null ? -Infinity : cost === 0 ? Infinity : Math.log(gain) / cost);
  return next.map((n) => {
    const unit = n.buy ? (Object.hasOwn(mine, n.buy.name) ? mine[n.buy.name] : etor[n.buy.name] ?? null) : null;
    return { n, unit, cost: n.buy && unit !== null ? unit * n.buy.qty : n.costFE };
  }).sort((a, b) => score(b.n.gain, b.cost) - score(a.n.gain, a.cost) || b.n.gain - a.n.gain);
}
const qty = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(1));
export function renderNext(next: NextBuy[], etor: Record<string, number | null>, mine: Record<string, number>): string {
  const rows = rankNext(next, etor, mine).map(({ n, unit, cost }, i) => `<tr${cost === null ? ' class="unpriced"' : ''}><td class="n">${i + 1}</td>`
    + `<td class="what"><span class="ico">${ICON[n.kind] ?? '•'}</span>${esc(actionText(n as unknown as Move))}${n.partial?.length ? `<span class="warn" title="partial: ${esc(n.partial.join(', '))}">*</span>` : ''}</td>`
    + `<td class="gain">${fmtGain(1, n.gain)}<small>${fmtDps(n.kill)}</small></td>`
    + `<td class="price">${n.buy ? `<input type="number" min="0" step="any" data-name="${esc(n.buy.name)}" value="${unit ?? ''}" placeholder="price" title="${esc(n.buy.name)}">${n.buy.qty !== 1 ? ` × ${qty(n.buy.qty)}` : ''}` : '—'}</td>`
    + `<td class="cost">${cost === null ? 'unpriced' : cost === 0 ? 'free' : `${fmtFE(cost)} FE`}</td></tr>`).join('');
  return `<section class="gl-next" id="gl-next"><h3>What to buy next</h3>`
    + `<p class="muted">Exact gains on your character. Type the price you would actually pay (per item; per ember for a craft) and the list re-sorts. Your prices stay in this browser.</p>`
    + `<div class="next-scroll"><table><thead><tr><th>#</th><th>Upgrade</th><th>Kill speed</th><th>Price (FE)</th><th>Cost</th></tr></thead><tbody>${rows}</tbody></table></div>`
    + `<div class="paste-actions"><button data-act="download">Download my prices (prices.json)</button><button data-act="reset" class="quiet">Back to etor prices</button></div></section>`;
}

// ---- one tab per leg: each leg is one yardstick (Ice Shot on the training dummy, then Hammer of Ash boss by boss), so no chart mixes two
const legName = (l: Leg) => (l.skill === 'iceShot' ? 'Ice Shot' : l.target ? bossName(l.target) : SKILL[l.skill] ?? l.skill) + (l.reached === false ? ' · not reached' : '');
const yardstick = (l: Leg) => (l.target ? `on ${bossName(l.target)}` : 'on the training dummy');
const buildOf = (l: Leg) => (l.build?.length ? `<details class="gl-build" open><summary>The build at the end of this leg</summary>${l.build.map((b) => `<h4>${esc(b.section)}</h4><ul>${b.lines.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`).join('')}</details>` : '');
function legPanel(g: GuideOut, l: Leg, i: number): string {
  if (l.reached === false) {   // a boss the plan did not reach: the plan's last build there
    const t = killTime(l.start);
    return `<section class="gl-leg" data-leg="${i}"><div class="leg-head"><b>${esc(SKILL[l.skill] ?? l.skill)} ${esc(yardstick(l))}: not reached yet</b>`
      + `<div class="goal-stats"><div><span class="k">kill speed (last build)</span><span class="v">${fmtDps(l.start.kill)}</span></div>`
      + (t ? `<div><span class="k">time to kill</span><span class="v">${t}</span></div>` : '') + '</div></div>' + buildOf(l)
      + (l.end ? `<p class="leg-end">→ ${esc(human(l.end))}</p>` : '') + '</section>';
  }
  const legs = g.legs!, to = legs[i + 1]?.firstStep ?? g.steps.length, es = entries(g.steps.slice(l.firstStep, to), l.firstStep);
  const own = es.filter((e) => e.s.move.kind !== 'switch'), end = es.at(-1)?.s.after ?? l.start;
  const fe0 = es.length ? es[0].s.cumFE - (es[0].s.move.costFE ?? 0) : 0, fe = es.length ? es.at(-1)!.s.cumFE - fe0 : 0, t0 = killTime(l.start), t1 = killTime(end);
  return `<section class="gl-leg" data-leg="${i}"><div class="leg-head"><b>${esc(SKILL[l.skill] ?? l.skill)} ${esc(yardstick(l))}</b>`
    + `<div class="goal-stats"><div><span class="k">kill speed</span><span class="v">${fmtDps(l.start.kill)} → ${fmtDps(end.kill)}</span></div>`
    + (t0 || t1 ? `<div><span class="k">time to kill</span><span class="v">${t0 || '—'} → ${t1 || '—'}</span></div>` : '')
    + `<div><span class="k">upgrades</span><span class="v">${own.length}</span></div><div><span class="k">FE spent</span><span class="v">${fmtFE(fe)}</span></div></div></div>`
    + buildOf(l)
    + chart(l.start, es.filter((e) => e.s.move.kind !== 'switch'), fe0) + stages(es, g.mode)
    + (l.end ? `<p class="leg-end">→ ${esc(human(l.end))}</p>` : i === legs.length - 1 && g.knobs?.partialRun ? `<p class="leg-end">… still computing: ${own.length} upgrade${own.length === 1 ? '' : 's'} so far on ${esc(l.target ? bossName(l.target) : 'this leg')}</p>` : '') + '</section>';
}
function legTabs(g: GuideOut): string {
  const id = `leg-${g.mode}`, legs = g.legs!;
  return `<div class="gl-tabs">${legs.map((l, i) => `<input type="radio" name="${id}" id="${id}-${i}"${i === 0 ? ' checked' : ''}><label for="${id}-${i}">${esc(legName(l))}</label>`).join('')}`
    + `<div class="gl-tab-panels">${legs.map((l, i) => legPanel(g, l, i)).join('')}</div></div>`;
}

/** the plan's last build on every boss, as the model states it */
function finalCard(g: GuideOut): string {
  if (!g.final?.length) return '';
  return `<div class="gl-final"><b>The final build, boss by boss</b><table><tr><th>Boss</th><th>Damage per second at full Life</th><th>Time to kill</th></tr>`
    + g.final.map(({ target, figure: f }) => `<tr><td>${esc(bossName(target))}</td><td>${f.stop ? 'not priced' : fmtDps(f.life100)}</td><td>${killTime(f) || '—'}</td></tr>`).join('')
    + '</table></div>';
}
export function renderGuide(g: GuideOut, mine: Record<string, number> = {}): string {
  const plan = g.legs?.length ? legTabs(g) : chart(g.start, entries(g.steps)) + stages(entries(g.steps), g.mode);
  return `<div class="gl-plan">${goalCard(g)}${g.character ? renderCharacter(g.character) : ''}${g.next?.length ? renderNext(g.next, g.prices ?? {}, mine) : ''}${finalCard(g)}${plan}${huntingList(g)}${details(g)}</div>`;
}

// ---- pasted text: the advice from the poorchlight button, or the raw export
const bad = (path: string, v: unknown) => new Error(`Advice is ${v === undefined ? 'missing' : 'invalid'}: ${path}`);
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const isStrs = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');
function checkFigure(f: any, path: string): void {
  if (!f || typeof f !== 'object') throw bad(path, f);
  for (const k of ['life100', 'life0', 'kill']) if (!isNum(f[k])) throw bad(`${path}.${k}`, f[k]);
  if (!isStrs(f.partial)) throw bad(`${path}.partial`, f.partial);
  if (f.stop !== undefined && typeof f.stop !== 'string') throw bad(`${path}.stop`, f.stop);
  for (const k of ['lock', 'cull', 'lifeMax']) if (f[k] !== undefined && !isNum(f[k])) throw bad(`${path}.${k}`, f[k]);
}
function checkMove(m: any, path: string): void {
  if (!m || typeof m !== 'object') throw bad(path, m);
  if (typeof m.label !== 'string') throw bad(`${path}.label`, m.label);
  if (m.costFE !== null && !isNum(m.costFE)) throw bad(`${path}.costFE`, m.costFE);
}
function checkCharacter(c: any, path: string): Character {
  if (!c || typeof c !== 'object') throw bad(path, c);
  if (!isNum(c.level)) throw bad(`${path}.level`, c.level);
  if (!isNum(c.fe)) throw bad(`${path}.fe`, c.fe);
  if (!Array.isArray(c.gear) || !c.gear.every((x: any) => x && typeof x.slot === 'string' && typeof x.label === 'string')) throw bad(`${path}.gear`, c.gear);
  return { level: c.level, skill: String(c.skill ?? ''), fe: c.fe, ...(isNum(c.owned) ? { owned: c.owned } : {}), gear: c.gear.map((x: { slot: string; label: string }) => ({ slot: x.slot, label: x.label })) };
}

export function parseAdvice(text: string): GuideOut {
  let j: any;
  try { j = JSON.parse(text); } catch (e) { throw new Error(`Advice is not valid JSON: ${(e as Error).message}`); }
  if (!j || typeof j !== 'object') throw new Error('Advice must be a JSON object');
  if (j.mode !== 'advise') throw new Error(`Advice must have mode "advise", got ${JSON.stringify(j.mode)}`);
  if (typeof j.pin !== 'string') throw bad('pin', j.pin);
  if (!j.etor || typeof j.etor !== 'object') throw bad('etor', j.etor);
  for (const k of ['season', 'fetchedAt']) if (typeof j.etor[k] !== 'string') throw bad(`etor.${k}`, j.etor[k]);
  checkFigure(j.start, 'start');
  if (!Array.isArray(j.steps)) throw bad('steps', j.steps);
  j.steps.forEach((s: any, i: number) => {
    const p = `steps[${i}]`;
    if (!s || typeof s !== 'object') throw bad(p, s);
    if (!isNum(s.level)) throw bad(`${p}.level`, s.level);
    if (!isNum(s.cumFE)) throw bad(`${p}.cumFE`, s.cumFE);
    checkMove(s.move, `${p}.move`);
    if (!Array.isArray(s.triggered)) throw bad(`${p}.triggered`, s.triggered);
    s.triggered.forEach((t: any, k: number) => checkMove(t, `${p}.triggered[${k}]`));
    checkFigure(s.before, `${p}.before`);
    checkFigure(s.after, `${p}.after`);
    if (s.notes !== undefined && !isStrs(s.notes)) throw bad(`${p}.notes`, s.notes);
  });
  for (const k of ['notSearched', 'unpriced', 'notCalculable']) if (!isStrs(j[k])) throw bad(k, j[k]);
  if (j.character !== undefined) j.character = checkCharacter(j.character, 'character');
  if (j.next !== undefined) {
    if (!Array.isArray(j.next)) throw bad('next', j.next);
    j.next.forEach((n: any, i: number) => {
      const p = `next[${i}]`;
      if (!n || typeof n !== 'object') throw bad(p, n);
      if (typeof n.label !== 'string') throw bad(`${p}.label`, n.label);
      for (const k of ['gain', 'kill']) if (!isNum(n[k])) throw bad(`${p}.${k}`, n[k]);
      if (n.costFE !== null && !isNum(n.costFE)) throw bad(`${p}.costFE`, n.costFE);
      if (n.buy !== undefined && !(n.buy && typeof n.buy.name === 'string' && isNum(n.buy.qty))) throw bad(`${p}.buy`, n.buy);
      if (n.partial !== undefined && !isStrs(n.partial)) throw bad(`${p}.partial`, n.partial);
    });
  }
  if (j.legs !== undefined) {
    if (!Array.isArray(j.legs)) throw bad('legs', j.legs);
    j.legs.forEach((l: any, i: number) => {
      const p = `legs[${i}]`;
      if (!l || typeof l !== 'object') throw bad(p, l);
      if (typeof l.skill !== 'string') throw bad(`${p}.skill`, l.skill);
      if (l.target !== null && typeof l.target !== 'string') throw bad(`${p}.target`, l.target);
      if (!Number.isInteger(l.firstStep) || l.firstStep < 0 || l.firstStep > j.steps.length) throw bad(`${p}.firstStep`, l.firstStep);
      if (l.end !== undefined && typeof l.end !== 'string') throw bad(`${p}.end`, l.end);
      if (l.reached !== undefined && l.reached !== false) throw bad(`${p}.reached`, l.reached);
      if (l.build !== undefined && !(Array.isArray(l.build) && l.build.every((b: { section?: unknown; lines?: unknown }) => typeof b?.section === 'string' && Array.isArray(b.lines) && (b.lines as unknown[]).every((x) => typeof x === 'string')))) throw bad(`${p}.build`, l.build);
      checkFigure(l.start, `${p}.start`);
    });
  }
  if (j.final !== undefined) {
    if (!Array.isArray(j.final)) throw bad('final', j.final);
    j.final.forEach((x: any, i: number) => { if (typeof x?.target !== 'string') throw bad(`final[${i}].target`, x?.target); checkFigure(x.figure, `final[${i}].figure`); });
  }
  if (j.prices !== undefined && !(j.prices && typeof j.prices === 'object' && Object.values(j.prices).every((v) => v === null || isNum(v)))) throw bad('prices', j.prices);
  return j as GuideOut;
}

export type Pasted = { kind: 'advice'; guide: GuideOut } | { kind: 'export'; character: Character };
/** what the player pasted: the advice the poorchlight button copies, or the raw tli-lens export (gear only: advice needs the local engine) */
export function parsePaste(text: string): Pasted {
  let j: any;
  try { j = JSON.parse(text); } catch (e) { throw new Error(`That is not valid JSON: ${(e as Error).message}`); }
  if (j?.schema === 'tli-lens-export/1') {
    const main = (j.loadout?.skills ?? []).find((s: any) => s?.place?.kind === 'active' && s.place.slot === 0);
    return { kind: 'export', character: checkCharacter({ level: j.hero?.level, fe: j.fe, owned: Array.isArray(j.items) ? j.items.length : undefined,
      skill: main?.sid === 1110 ? 'hoa' : main?.name ?? '', gear: (j.loadout?.gear ?? []).map((g: any) => ({ slot: String(g?.slot ?? ''), label: String(g?.label ?? '') })) }, 'export') };
  }
  return { kind: 'advice', guide: parseAdvice(text) };
}
