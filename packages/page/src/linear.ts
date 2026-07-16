/* The Linear tab — the season as one top→down walkthrough.
   Phase/step ORDER is personal judgment (hand-authored); every ΔDPS number is
   looked up from the generated JSON via the strict helpers below, never typed. */
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
  ongoing?: boolean;       // watchlist — runs alongside everything below
  steps: Step[];
}

const PHASES: Phase[] = [
  { id:"swap", cost:"~200b", gate:"Lv 90+", title:"Swap to Spectral Slash", steps:[
    { id:"skill-setup", src:"skill", title:"Skill setup",
      note:"Spectral Slash — Legion · Detonation · Critical Strike Damage Increase + Quick Decision / Added Phys placeholders. "
        + "3× Activation Medium: Spectral Slash / the warcries / Ice Bond (the Frostbite self-applicator). "
        + "All 4 Precise Auras: Cruelty (+Disciplined) · Fearless · Domain Expansion · Frigid Domain." },
    { id:"pactspirits", src:"pact", title:"Pactspirits",
      note:"Red Umbrella + Azure Gunslinger (+48% Attack Damage, +16% Attack Speed each; nodes 4–6 pure crit). "
        + "Captain Kitty (+12% Warcry Effect, “Beast” Roar). Only Kitty is worth levelling — L2 warcry CDR, L3 a charge." },
    { id:"cheap-uniques", src:"gear", title:"Cheap uniques — buy ASAP",
      note:"Grace Boots (KEEP until the Focus Blessing slate) · Bodhi Girdle · Vortex Heart (~130 FE)." },
    { id:"slate-quickcheck", src:"slate", title:"Slate quick-checks",
      note:"3–4× slate with 1 mod showing + full reveal: +1 Attack skill level · +1 Physical skill level "
        + "(not the no-conversion one) · +1 to all skills · 10% additional damage for 4s after Mobility skills." },
    { id:"pedigree", src:"slate", title:"Pedigree of Gods — snipe one (~30 FE)",
      note:"The only slate whose slots roll the gods' Core Talents.",
      detail: foldout("best core talents its slots can roll", cores.map(catRow).join("")) },
  ]},

  { id:"watchlist", gate:"Every session", ongoing:true,
    title:"Standing watchlist — buy on price, not on schedule",
    note:"Owning a piece ≠ wearing it: the phases below gate on these finds.", steps:[
    { id:"wl-animitta", src:"gear", chip: rungChip("necklace", "Heart of Animitta"),
      title:"Heart of Animitta",
      note:"Listed ~1300 FE — snipe WAY under list. +1 Finisher charge = a second full-power finisher per sequence. THE #1 BUY." },
    { id:"wl-vorax", src:"gear", title:"Vorax boot base",
      note:"Its own hunt — i86+, at least one decent mod. The Have Fervor vessel." },
    { id:"wl-dawnbreak", src:"gear", title:"Dawn Break belt",
      note:"EV 950 FE — feeds “Have Fervor” onto the Vorax base. Dead without it." },
    { id:"wl-ghost", src:"gear", chip: rungChip("gloves", "Ghost Slaughter"),
      title:"Ghost Slaughter — corroded only",
      note:"The CORRODED 1%-per-rating roll ONLY (a normal roll is worth a third). Dead until the boots hold Fervor." },
    { id:"wl-eternity", src:"gear", chip: rungChip("belt", "Eternity"),
      title:"Eternity — the 5 blueprints",
      note:"Buy the blueprints, never the ~4k FE finished item. Mapping monster + the Fervor sustain bill." },
    { id:"wl-timid", src:"gear", chip: rungChip("ring1", "priceless timid"),
      title:"Priceless timid curse-on-hit ring",
      note:"Appears from Traveler 8 — frees the warcry bar slot and carries its own ×1.39 boss layer." },
    { id:"wl-inverse", src:"prism", chip: dChip(prismRung("Inverse", "good inverse").delta),
      title:"Inverse Prism (Brave tree)",
      note:"POSITIVE Legendary-Medium AND Medium effect ranges (+38%/+17% modeled). +6 min warcry enemies — floor 14 of 16." },
    { id:"wl-valor", src:"prism", chip: dChip(prismRung("Ethereal", "Unmatched Valor").delta),
      title:"Ethereal Prism: Unmatched Valor",
      note:"Fixed 130 Fervor Rating. Needs the priceless sealed-mana helmet + Dawn Break (Ranger slot). "
        + "God roll “no longer replaces” keeps the Ranger core too." },
  ]},

  { id:"core86", cost:"1B", gate:"8-0", title:"i86 core — in this order",
    note:`Priceless waits until after Traveler 8. The i86 chest is ES/defense only (${rngTxt(rung("chest", "i86"))}) — no damage lines to chase.`, steps:[
    { id:"mh86", seq:"FIRST", src:"gear", chip: rungChip("mainHand", "i86"),
      title:"i86 mainhand — Shadowless Swordsman's Blade, speed/crit roll",
      note:"Craft by the fold-out's order; skip the crit-rating advanced line.",
      detail: modRows(rung("mainHand", "i86").mods!, "craft order — best ΔDPS per ember first") },
    { id:"oh86", seq:"SECOND", src:"gear", chip: rungChip("offHand", "i86"),
      title:"i86 offhand — same base, raw damage roll",
      detail: modRows(rung("offHand", "i86").mods!, "craft order — best ΔDPS per ember first") },
    { id:"ring86", seq:"THIRD", src:"gear", chip: rungChip("ring2", "i86"),
      title:"i86 frostbite ring",
      note:`THE +1 COMBO POINTS SUFFIX IS THE ITEM — never lose it. The barrier ring is only ${rngTxt(rung("ring1", "i86"))}, last in this gate.` },
    { id:"memory-leg", title:"Hero Memory legendary",
      note:"REVIVED #% Attack Speed for every main attack skill cast. Base affix: Strength / ES / Attack Speed. "
        + "Fixed affix: %ES. Random affix: Phys/Cold Crit Damage · Phys/Cold/Attack Crit Rating · Attack Speed · Cold Damage · Damage." },
    { id:"kismets", src:"pact", title:"Kismet layout",
      note:"2× Peerless + Tiger's Chain — +1 Finisher charge + fixed 0.3s sequence reset; never move. "
        + "2× Mammoth + Ascetic — the Mammoth pair self-casts Lv.20 Resurrection Warcry every 3s. "
        + "Rest: 1× Medium + 9× Micro Crit Rating." },
  ]},

  { id:"slates", gate:"Slates", title:"Slate priority — buy in this order", steps:[
    { id:"sl-blessing", seq:"1st", src:"slate", chip: slateChip("+100% chance to gain a stack of Focus Blessing"),
      title:"Focus Blessing on Frostbitten hit (God of Knowledge)",
      note:"REQUIRED BEFORE THE i86 BOOTS — unlocks the boots ladder (Grace freed → i86 → Dawn Break)." },
    { id:"sl-frostbite", seq:"2nd", src:"slate", chip: slateChip("Inflicts Frostbite when dealing Hit Cold Damage"),
      title:"Frostbite on Cold hit (Frostbitten core / Prophet)",
      note:"Frees 4 Prophet points → respec into the Frostbite legendaries (Effect · Cold Infiltration · more-vs-Frozen)." },
    { id:"sl-warcry", seq:"3rd", src:"slate", chip: slateChip("+4 to the minimum number of enemies affected by Warcry"),
      title:"+4 min enemies affected by Warcry (The Brave, 1 copy)",
      note:"Floors the boss stack at 8 of 16 (Formless doubles it); the inverse-prism copy adds 4–6 more later." },
    { id:"sl-convert", seq:"LAST", src:"slate", chip: slateChip("Converts 100% of Physical Damage to Cold"),
      title:"Phys→Cold conversion slate",
      note:"The Prophet tree covers it today; the slate frees the Prophet → Ronin respec." },
    { id:"sl-shop", src:"slate", title:"What to shop",
      note:"A Corner of Divinity (max 3) — 2× Legendary Medium, any god. Fallen Starlight (max 3) — 3× Micro + 1× Medium/Legendary Medium. "
        + "Pedigree of Gods (max 1) — the Core Talent carrier. God slates — 2 fixed + 3 random; aim 1× Medium + 2× Legendary Medium or better.",
      detail: foldout("best legendary-medium fillers — skill-level lines stack (the build runs four +1 Attack Skill Level)",
        fillers.map(catRow).join("")) },
    { id:"sl-immunities", src:"slate", title:"Before Deep Space — hold the immunity lines",
      note:"Ailment immunity gates the endgame Netherrealm plane; defensive buys, so no ΔDPS — the god is what you shop for.",
      detail: foldout("the immunity Legendary Mediums", immunities.map(immRow).join("")) },
  ]},

  { id:"armor86", cost:"10B–20B", gate:"Traveler 8", title:"i86 armor pieces",
    note:"Traveler 8 done? PRICELESS SHOPPING OPENS — check 8-1/8-2 pieces every session, buy on price.", steps:[
    { id:"boots86", src:"gear", chip: rungChip("boots", "i86"), needs:["sl-blessing"],
      title:"i86 ES boots",
      note:"Only after the Focus Blessing slate — they drop Grace Boots' trigger. Want Hasten + Crit Rating / Crit Damage." },
    { id:"helm86", src:"gear", chip: rungChip("helmet", "i86"),
      title:"i86 ES helmet", note:"Crit Rating basic; Strength + Crit Damage advanced." },
    { id:"gloves86", src:"gear", chip: rungChip("gloves", "i86"),
      title:"i86 ES gloves", note:"%damage + Crit Rating basics; Crit Damage advanced." },
  ]},

  { id:"priceless", cost:"200B", gate:"Profound 8", title:"Priceless completes (8-1 + 8-2 open)", steps:[
    { id:"mh100", src:"gear", chip: rungChip("mainHand", "priceless"),
      title:"Priceless mainhand",
      note:"Ultimates: Armor Mitigation Pen / Combo Damage Enhancement; basics: gear Attack Speed + flat Phys — the fold-out has every number.",
      detail: modRows(rung("mainHand", "priceless").mods!, "craft order — best ΔDPS per ember first") },
    { id:"oh100", src:"gear", chip: rungChip("offHand", "priceless"), needs:["boots86"],
      title:"Priceless offhand — Ninth Apostle's Magic Shield",
      note:`+4 Active Skill Level (${g(modgain(rung("offHand", "priceless"), "+4 Active Skill Level"))}) is the big line. `
        + "A PACKAGE with the i86 Hasten boots + God of Might / Brave tree changes." },
    { id:"ring-timid", src:"gear", chip: rungChip("ring1", "priceless timid"), needs:["wl-timid"],
      title:"Wear the timid curse-on-hit ring", note:"From the watchlist — it frees the bar slot Shockwave Warcry takes in the endgame phase." },
    { id:"ring-combo", src:"gear", chip: rungChip("ring2", "priceless combo"),
      title:"Priceless combo ring", note:"Fervor Effect + Elemental/Erosion Pen ultimates." },
  ]},

  { id:"fervor", gate:"All or nothing", title:"The Fervor engine — ONE purchase",
    note:"Any piece alone is a dead slot. Cost: 12% of current Life AND ES per second while Fervor is active — sustain is part of the bill.", steps:[
    { id:"fv-boots", src:"gear", chip: rungChip("boots", "Dawn Break"), needs:["wl-vorax", "wl-dawnbreak"],
      title:"Vorax boots + Dawn Break belt",
      note:"+1% additional damage per 2 rating, +78% Crit Damage. Range = alone → with the tree change." },
    { id:"fv-gloves", src:"gear", chip: rungChip("gloves", "Ghost Slaughter"), needs:["wl-ghost", "fv-boots"],
      title:"Corroded Ghost Slaughter", note:"+1% additional damage per rating." },
    { id:"fv-helm", src:"gear", chip: rungChip("helmet", "priceless"),
      title:"Priceless sealed-mana helmet",
      note:"Near-zero alone — the range lands with the prism. Craft the Sealed Mana Compensation ultimate." },
    { id:"fv-prism", src:"prism", chip: dChip(prismRung("Ethereal", "Unmatched Valor").delta),
      needs:["fv-helm", "fv-boots", "wl-valor"],
      title:"Socket Unmatched Valor",
      note:"Fixed 130 Fervor Rating in the Ranger slot — over the 100 cap, so Centralize becomes a respec candidate." },
    { id:"fv-eternity", src:"gear", chip: rungChip("belt", "Eternity"), needs:["wl-eternity"],
      title:"Eternity (from the 5 blueprints)",
      note:"Precise: Energy Shield once the flat-ES belt is gone. Resurrection Warcry in slot 2 — or let the Mammoth kismets self-cast it." },
  ]},

  { id:"endgame", cost:"150B+", gate:"Timemark 8 / Atlas", title:"Endgame layers", steps:[
    { id:"end-crit", src:"talent", title:"Crit converters",
      note:"Fervor spent twice: +2% Crit Rating per point AND the 0.5% Crit Damage/rating converters "
        + "(tree legendary + 2 slate copies) = +195% Crit Damage at 130. Keep the Critical Strike Damage Increase support." },
    { id:"end-warcry", src:"skill", chip: dChip(prismRung("Inverse", "good inverse").delta), needs:["ring-timid", "wl-inverse"],
      title:"Warcry layer",
      note:"Shockwave Warcry in the freed bar slot; level Captain Kitty. Socket the Inverse Prism good roll — floor 14 of 16 stacks." },
    { id:"mh-mw", src:"gear", chip: rungChip("mainHand", "MIRROR"),
      title:"Mirror-worthy mainhand",
      note:`Only the +4 Attack Skill Level roll (${g(modgain(rung("mainHand", "MIRROR"), "+4 to Attack Skill Level"))}) beats priceless.` },
  ]},
];

/* ---------- render + progress state (Task 4 wires the interactivity) ---------- */
const stepCard = (s: Step) =>
  `<div class="lstep${s.seq ? " seq" : ""}">`
  + `<label><input type="checkbox" data-step="${s.id}">`
  + (s.seq ? `<span class="lseq">${esc(s.seq)}</span>` : "")
  + (s.src ? srcChip(s.src) : "")
  + `<span class="l-title">${s.title}</span>${s.chip ?? ""}</label>`
  + (s.note ? `<p class="l-note">${s.note}</p>` : "")
  + (s.detail ?? "")
  + `</div>`;

const phaseCard = (p: Phase) => {
  const ordered = p.steps.filter(s => s.seq), free = p.steps.filter(s => !s.seq);
  return `<article class="bundle lphase">`
    + `<div class="bundle-head"><span class="l-gate">${esc(p.gate)}${p.cost ? ` · ${esc(p.cost)}` : ""}</span>`
    + `<h3>${esc(p.title)}</h3>`
    + (p.ongoing ? `<span class="l-ongoing">runs alongside everything below</span>` : "")
    + `<span class="l-count" data-phase="${p.id}"></span></div>`
    + (p.note ? `<p class="l-phase-note">${p.note}</p>` : "")
    + (ordered.length ? `<div class="l-ordered">${ordered.map(stepCard).join("")}</div>` : "")
    + (free.length ? `<div class="l-parallel">${free.map(stepCard).join("")}</div>` : "")
    + `</article>`;
};

export function renderLinear(el: HTMLElement): void {
  el.innerHTML = PHASES.map(phaseCard).join("");
}
