/* The Linear tab — the season as one top→down walkthrough.
   Phase/step ORDER is personal judgment (hand-authored); every ΔDPS number is
   looked up from the generated JSON via the strict helpers below, never typed.
   Notes are WHAT-only: commands, not explanations (spec revision 2026-07-16).
   Skill-buy steps mirror data/Rehan.json's loadout sequence: swap link has no
   Legion — Legion (Noble)/Motionless land at "150b", Detonation (Magnificent) +
   warcries at "420b", Still Attack at "5t Eternity", CSDI + Defensive Buffer at more_1. */
import ladderData from "./data/ladder.json";
import catalogData from "./data/catalog.json";
import prismData from "./data/prisms.json";
import { esc, gainChip, dChip, srcChip, modRows, SRC,
  type LadderRow, type CatalogRow, type Rung } from "./ui";

const LADDER = ladderData as LadderRow[];
const CATALOG = catalogData as CatalogRow[];
interface PrismRung { label: string; delta: number | null; note: string | null }
const PRISMS = prismData as { name: string; rungs: PrismRung[] }[];

/* ---------- strict lookups: a renamed label must break loudly, never render stale ---------- */
function rung(slot: string, prefix: string): Rung {
  const rg = LADDER.find(r => r.slot === slot)
    ?.rungs.find(r => r.label.toLowerCase().startsWith(prefix.toLowerCase()));
  if (!rg) throw new Error(`linear: no rung ${slot}/${prefix}`);
  return rg;
}
function modgain(r: Rung, prefix: string): number {
  const m = r.mods?.find(m => m.text.startsWith(prefix));
  if (!m) throw new Error(`linear: no mod "${prefix}" on ${r.label}`);
  return m.gain;
}
function slateRow(prefix: string): CatalogRow {
  const c = CATALOG.find(c => c.cat === "slate" && c.text.startsWith(prefix));
  if (!c) throw new Error(`linear: no slate "${prefix}"`);
  return c;
}
function prismRung(name: string, label: string): PrismRung {
  const rg = PRISMS.find(p => p.name.startsWith(name))
    ?.rungs.find(r => r.label.toLowerCase().startsWith(label.toLowerCase()));
  if (!rg) throw new Error(`linear: no prism ${name}/${label}`);
  return rg;
}
const rungChip = (slot: string, prefix: string) => gainChip(rung(slot, prefix), "delta-chip");
const slateChip = (prefix: string) => { const c = slateRow(prefix); return dChip(c.delta, c.cond); };
const g = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(1)}%`;
const rngTxt = (r: Rung) =>
  r.gainTop === null || r.gainTop === r.gain ? g(r.gain ?? 0) : `${g(r.gain ?? 0)} → ${g(r.gainTop)}`;

/* ---------- live-derived fold-out rows (same filters as the slate section on Progression) ---------- */
const catRow = (r: CatalogRow) =>
  `<div class="mod-row"><span class="mod-text"><b>${esc(r.name)}</b> · ${esc(r.text).replace(/\n/g, " · ")}</span>${dChip(r.delta, r.cond)}</div>`;
const foldout = (summary: string, rows: string) =>
  `<details class="fillers"><summary>${esc(summary)}</summary>${rows}</details>`;
const cores = CATALOG.filter(r =>
  r.cat === "slate" && /Core Talent/.test(r.tier) && r.delta !== null && r.delta > 0).slice(0, 8);
const PLANNED = [
  "Inflicts Frostbite when dealing Hit Cold Damage",
  "+100% chance to gain a stack of Focus Blessing",
  "+4 to the minimum number of enemies affected by Warcry",
  "Converts 100% of Physical Damage to Cold",
];
const fillers = CATALOG.filter(r =>
  r.cat === "slate" && r.tier === "Legendary Medium Talent" && r.delta !== null && r.delta > 0
  && !PLANNED.some(f => r.text.startsWith(f))).slice(0, 6);
const immunities = CATALOG.filter(r =>
  r.cat === "slate" && /^Immune to (Trauma|Wilt|Ignite)/.test(r.text));
const immRow = (r: CatalogRow) =>
  `<div class="mod-row"><span class="mod-text"><b>${esc(r.on)}</b> · ${esc(r.text).replace(/\n/g, " · ")}</span>`
  + `<span class="delta-chip d-none">defense</span></div>`;

/* ---------- the spine — hand-authored order (see spec: personal judgment, not derivable) ---------- */
interface Step {
  id: string;              // stable localStorage key — never rename casually
  title: string; note?: string;
  src?: keyof typeof SRC;  // origin chip
  chip?: string;           // pre-rendered gainChip/dChip html
  seq?: string;            // "FIRST"… — ordered within the phase
  needs?: string[];        // step ids this is gated on
  detail?: string;         // <details> fold-out html
}
interface Phase {
  id: string; cost?: string; gate: string; title: string; note?: string;
  ongoing?: boolean;       // watchlist — runs alongside everything
  steps: Step[];
}

/* the standing watchlist — rendered as the sticky right rail */
const WATCHLIST: Phase = {
  id:"watchlist", gate:"Every session", ongoing:true,
  title:"Watchlist", note:"Buy on price, not on schedule.", steps:[
  { id:"wl-animitta", src:"gear", chip: rungChip("necklace", "Heart of Animitta"),
    title:"Heart of Animitta", note:"Listed ~1300 FE — snipe way under. The #1 buy." },
  { id:"wl-vorax", src:"gear", title:"Vorax boot base", note:"i86+, at least one decent mod." },
  { id:"wl-dawnbreak", src:"gear", title:"Dawn Break belt", note:"EV 950 FE." },
  { id:"wl-ghost", src:"gear", chip: rungChip("gloves", "Ghost Slaughter"),
    title:"Ghost Slaughter", note:"Corroded 1%-per-rating roll only." },
  { id:"wl-eternity", src:"gear", chip: rungChip("belt", "Eternity"),
    title:"Eternity blueprints", note:"All 5 — never the finished item." },
  { id:"wl-timid", src:"gear", chip: rungChip("ring1", "priceless timid"),
    title:"Priceless timid curse-on-hit ring", note:"Appears from Traveler 8." },
  { id:"wl-inverse", src:"prism", chip: dChip(prismRung("Inverse", "good inverse").delta),
    title:"Inverse Prism (Brave tree)", note:"Both effect ranges positive." },
  { id:"wl-valor", src:"prism", chip: dChip(prismRung("Ethereal", "Unmatched Valor").delta),
    title:"Ethereal Prism: Unmatched Valor", note:"Fixed 130 Fervor Rating." },
]};

const PHASES: Phase[] = [
  { id:"swap", cost:"~200b", gate:"Lv 90+", title:"Swap to Spectral Slash", steps:[
    { id:"skill-setup", src:"skill", title:"Copy this bar",
      note:"Spectral Slash — Recuperation · Steamroll · Added Physical Damage · Willpower · Quick Decision. "
        + "Bull's Rage — Extended Duration · Preparation · Mass Effect · Well-Fought Battle. "
        + "Spiral Strike — Quick Mobility · Periodic Burst · Precision Strike. "
        + "Fixate — Preparation · Extended Duration · Mass Effect. Timid — Extended Duration · Terrain of Malice · Preparation." },
    { id:"auras", src:"skill", title:"All 4 Precise Auras",
      note:"Cruelty · Fearless · Domain Expansion · Frigid Domain, supported by Restrain · Aura Amplification · Increased Area · Seal Conversion." },
    { id:"pactspirits", src:"pact", title:"Pactspirits",
      note:"Red Umbrella + Azure Gunslinger (nodes 4–6: crit). Captain Kitty. Level Kitty only." },
    { id:"cheap-uniques", src:"gear", title:"Buy cheap uniques",
      note:"Grace Boots (keep until the Focus Blessing slate) · Bodhi Girdle · Vortex Heart (~130 FE)." },
    { id:"slate-quickcheck", src:"slate", title:"Slate quick-checks",
      note:"3–4× 1-mod slates, full reveal each: +1 Attack skill level · +1 Physical skill level (not the no-conversion one) · +1 to all skills · 10% additional damage for 4s after Mobility skills." },
    { id:"pedigree", src:"slate", title:"Snipe a Pedigree of Gods (~30 FE)",
      detail: foldout("core talents to look for", cores.map(catRow).join("")) },
  ]},

  { id:"linkbuys", cost:"~150b → ~420b", gate:"First skill buys", title:"Upgrade the link", steps:[
    { id:"legion", seq:"FIRST", src:"support", title:"Buy Spectral Slash: Legion (Noble)",
      note:"Socket it with an Activation Medium: Motionless — drop Added Physical Damage and Quick Decision. "
        + "Add Ice Bond on a Root medium (Extended Duration · Mass Effect); drop Fixate." },
    { id:"detonation", seq:"SECOND", src:"support", title:"Buy Spectral Slash: Detonation (Magnificent)",
      note:"Then swap Bull's Rage + Timid → Shockwave Warcry (Elite medium · Extended Duration · Cooldown Reduction) "
        + "+ Resurrection Warcry (Preparation medium · Cooldown Reduction · Extended Duration)." },
    { id:"thunderspike", src:"skill", title:"Buy Thunder Spike: Rumbling Thunder (Noble)",
      note:"Thunder Spike replaces Spiral Strike — Quick Mobility · Periodic Burst · Precision Strike · Recklessness." },
  ]},

  { id:"core86", cost:"1B", gate:"8-0", title:"i86 core — in this order",
    note:`Priceless waits until after Traveler 8. i86 chest = ES/defense only (${rngTxt(rung("chest", "i86"))}).`, steps:[
    { id:"mh86", seq:"FIRST", src:"gear", chip: rungChip("mainHand", "i86"),
      title:"i86 mainhand — Shadowless Swordsman's Blade, speed/crit roll",
      note:"Craft in the fold-out's order; skip the crit-rating advanced line.",
      detail: modRows(rung("mainHand", "i86").mods!, "craft order — best ΔDPS per ember first") },
    { id:"oh86", seq:"SECOND", src:"gear", chip: rungChip("offHand", "i86"),
      title:"i86 offhand — same base, raw damage roll",
      detail: modRows(rung("offHand", "i86").mods!, "craft order — best ΔDPS per ember first") },
    { id:"ring86", seq:"THIRD", src:"gear", chip: rungChip("ring2", "i86"),
      title:"i86 frostbite ring",
      note:`The +1 Combo Points suffix is the item — never lose it. Barrier ring last (${rngTxt(rung("ring1", "i86"))}).` },
    { id:"memory-leg", title:"Hero Memory legendary",
      note:"REVIVED #% Attack Speed for every main attack skill cast. Base: Strength / ES / Attack Speed. "
        + "Fixed: %ES. Random: Phys/Cold Crit Damage · Phys/Cold/Attack Crit Rating · Attack Speed · Cold Damage · Damage." },
    { id:"kismets", src:"pact", title:"Kismet layout",
      note:"2× Peerless + Tiger's Chain — never move. 2× Mammoth + Ascetic. Rest: 1× Medium + 9× Micro Crit Rating." },
  ]},

  { id:"slates", gate:"Slates", title:"Slate priority — buy in this order", steps:[
    { id:"sl-blessing", seq:"1st", src:"slate", chip: slateChip("+100% chance to gain a stack of Focus Blessing"),
      title:"Focus Blessing on Frostbitten hit (God of Knowledge)",
      note:"Buy before the i86 boots." },
    { id:"sl-frostbite", seq:"2nd", src:"slate", chip: slateChip("Inflicts Frostbite when dealing Hit Cold Damage"),
      title:"Frostbite on Cold hit (Frostbitten core / Prophet)",
      note:"Respec the 4 freed Prophet points into the Frostbite legendaries." },
    { id:"sl-warcry", seq:"3rd", src:"slate", chip: slateChip("+4 to the minimum number of enemies affected by Warcry"),
      title:"+4 min enemies affected by Warcry (The Brave, 1 copy)" },
    { id:"sl-convert", seq:"LAST", src:"slate", chip: slateChip("Converts 100% of Physical Damage to Cold"),
      title:"Phys→Cold conversion slate",
      note:"Then respec Prophet → Ronin." },
    { id:"sl-shop", src:"slate", title:"What to shop",
      note:"A Corner of Divinity (max 3) · Fallen Starlight (max 3) · Pedigree of Gods (max 1) · God slates: aim 1× Medium + 2× Legendary Medium or better.",
      detail: foldout("best legendary-medium fillers — skill-level lines stack", fillers.map(catRow).join("")) },
    { id:"sl-immunities", src:"slate", title:"Immunity lines",
      note:"Hold before farming Deep Space.",
      detail: foldout("the immunity Legendary Mediums", immunities.map(immRow).join("")) },
  ]},

  { id:"armor86", cost:"10B–20B", gate:"Traveler 8", title:"i86 armor pieces",
    note:"Traveler 8 done → check 8-1/8-2 priceless pieces every session.", steps:[
    { id:"boots86", src:"gear", chip: rungChip("boots", "i86"), needs:["sl-blessing"],
      title:"i86 ES boots", note:"Hasten + Crit Rating / Crit Damage." },
    { id:"helm86", src:"gear", chip: rungChip("helmet", "i86"),
      title:"i86 ES helmet", note:"Crit Rating basic; Strength + Crit Damage advanced." },
    { id:"gloves86", src:"gear", chip: rungChip("gloves", "i86"),
      title:"i86 ES gloves", note:"%damage + Crit Rating basics; Crit Damage advanced." },
  ]},

  { id:"priceless", cost:"200B", gate:"Profound 8", title:"Priceless completes (8-1 + 8-2 open)", steps:[
    { id:"mh100", src:"gear", chip: rungChip("mainHand", "priceless"),
      title:"Priceless mainhand",
      note:"Ultimates: Armor Mitigation Pen / Combo Damage Enhancement. Basics: gear Attack Speed + flat Phys.",
      detail: modRows(rung("mainHand", "priceless").mods!, "craft order — best ΔDPS per ember first") },
    { id:"oh100", src:"gear", chip: rungChip("offHand", "priceless"), needs:["boots86"],
      title:"Priceless offhand — Ninth Apostle's Magic Shield",
      note:`+4 Active Skill Level (${g(modgain(rung("offHand", "priceless"), "+4 Active Skill Level"))}) is the line. `
        + "Buy as a package with the i86 Hasten boots + God of Might / Brave tree changes." },
    { id:"ring-timid", src:"gear", chip: rungChip("ring1", "priceless timid"), needs:["wl-timid"],
      title:"Wear the timid curse-on-hit ring" },
    { id:"ring-combo", src:"gear", chip: rungChip("ring2", "priceless combo"),
      title:"Priceless combo ring", note:"Fervor Effect + Elemental/Erosion Pen ultimates." },
  ]},

  { id:"fervor", gate:"All or nothing", title:"The Fervor engine — ONE purchase",
    note:"Any piece alone is a dead slot. Budget the 12% of current Life and ES per second it drains.", steps:[
    { id:"fv-boots", src:"gear", chip: rungChip("boots", "Dawn Break"), needs:["wl-vorax", "wl-dawnbreak"],
      title:"Vorax boots + Dawn Break belt" },
    { id:"fv-gloves", src:"gear", chip: rungChip("gloves", "Ghost Slaughter"), needs:["wl-ghost", "fv-boots"],
      title:"Corroded Ghost Slaughter" },
    { id:"fv-helm", src:"gear", chip: rungChip("helmet", "priceless"),
      title:"Priceless sealed-mana helmet", note:"Craft the Sealed Mana Compensation ultimate." },
    { id:"fv-prism", src:"prism", chip: dChip(prismRung("Ethereal", "Unmatched Valor").delta),
      needs:["fv-helm", "fv-boots", "wl-valor"],
      title:"Socket Unmatched Valor", note:"Ranger slot; Centralize becomes a respec candidate." },
    { id:"fv-eternity", src:"gear", chip: rungChip("belt", "Eternity"), needs:["wl-eternity"],
      title:"Eternity (from the 5 blueprints)",
      note:"Swap Motionless → Still Attack medium on the link. Precise: Energy Shield once the flat-ES belt is gone." },
  ]},

  { id:"endgame", cost:"150B+", gate:"Timemark 8 / Atlas", title:"Endgame layers", steps:[
    { id:"final-link", src:"support", title:"Finish the link",
      note:"Buy Critical Strike Damage Increase — replaces Steamroll. "
        + "Defensive Buffer (Preparation medium · Iron Fortification · Cooldown Reduction) replaces Resurrection Warcry — the Mammoth kismets self-cast it." },
    { id:"end-crit", src:"talent", title:"Crit converters",
      note:"Take the 0.5% Crit Damage-per-rating converters: tree legendary + 2 slate copies." },
    { id:"end-warcry", src:"prism", chip: dChip(prismRung("Inverse", "good inverse").delta), needs:["wl-inverse"],
      title:"Socket the Inverse Prism", note:"Level Captain Kitty." },
    { id:"mh-mw", src:"gear", chip: rungChip("mainHand", "MIRROR"),
      title:"Mirror-worthy mainhand",
      note:`Only the +4 Attack Skill Level roll (${g(modgain(rung("mainHand", "MIRROR"), "+4 to Attack Skill Level"))}) beats priceless.` },
  ]},
];

/* ---------- render + progress state ---------- */
const KEY = "linear-done";
/* localStorage can be unavailable (private mode) — degrade to per-session state, never crash */
const loadDone = (): Record<string, true> => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; }
};
const done: Record<string, true> = loadDone();
const saveDone = () => { try { localStorage.setItem(KEY, JSON.stringify(done)); } catch { /* per-session only */ } };

const TITLE: Record<string, string> = {};
for (const p of [WATCHLIST, ...PHASES]) for (const s of p.steps) TITLE[s.id] = s.title;

const stepCard = (s: Step) => {
  const waiting = (s.needs ?? []).filter(id => !done[id]);
  return `<div class="lstep${done[s.id] ? " done" : ""}${s.seq ? " seq" : ""}">`
    + `<label><input type="checkbox" data-step="${s.id}"${done[s.id] ? " checked" : ""}>`
    + (s.seq ? `<span class="lseq">${esc(s.seq)}</span>` : "")
    + (s.src ? srcChip(s.src) : "")
    + `<span class="l-title">${s.title}</span>${s.chip ?? ""}</label>`
    + (s.note ? `<p class="l-note">${s.note}</p>` : "")
    + (waiting.length ? `<p class="l-wait">⚠ waiting on: ${waiting.map(id => esc(TITLE[id])).join(" · ")}</p>` : "")
    + (s.detail ?? "")
    + `</div>`;
};

const phaseCard = (p: Phase) => {
  const n = p.steps.filter(s => done[s.id]).length;
  const ordered = p.steps.filter(s => s.seq), free = p.steps.filter(s => !s.seq);
  return `<article class="bundle lphase">`
    + `<div class="bundle-head"><span class="l-gate">${esc(p.gate)}${p.cost ? ` · ${esc(p.cost)}` : ""}</span>`
    + `<h3>${esc(p.title)}</h3>`
    + (p.ongoing ? `<span class="l-ongoing">every session</span>` : "")
    + `<span class="l-count">${n}/${p.steps.length}</span></div>`
    + (p.note ? `<p class="l-phase-note">${p.note}</p>` : "")
    + (ordered.length ? `<div class="l-ordered">${ordered.map(stepCard).join("")}</div>` : "")
    + (free.length ? `<div class="l-parallel">${free.map(stepCard).join("")}</div>` : "")
    + `</article>`;
};

export function renderLinear(main: HTMLElement, aside: HTMLElement): void {
  const render = () => {
    main.innerHTML = PHASES.map(phaseCard).join("");
    aside.innerHTML = phaseCard(WATCHLIST);
  };
  /* delegated listeners survive re-renders; fold-out open state intentionally resets */
  for (const el of [main, aside]) el.addEventListener("change", e => {
    const t = e.target as HTMLInputElement;
    const id = t.dataset.step;
    if (!id) return;
    if (t.checked) done[id] = true; else delete done[id];
    saveDone();
    render();
  });
  render();
}
