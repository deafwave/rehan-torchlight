/* The Linear tab — the season as one top→down walkthrough.
   Phase/step ORDER is personal judgment (hand-authored); every ΔDPS number is
   looked up from the generated JSON via the strict helpers below, never typed.
   Notes are WHAT-only: commands, not explanations (spec revision 2026-07-16).
   Skill-buy steps derive gem checklists from skillbars.json loadout diffs so every
   support type is listed (activation mediums, nobles, magnificents, plain supports):
   Legion + Motionless/Root at "150b", Detonation then warcries at "420b",
   Thunder Spike at "Inverse-Warcry", Still Attack at "5t Eternity",
   CSDI + Defensive Buffer at more_1. */
import ladderData from "./data/ladder.json";
import catalogData from "./data/catalog.json";
import prismData from "./data/prisms.json";
import skillbarsData from "./data/skillbars.json";
import { esc, escAttr, gainChip, dChip, srcChip, SRC, godOf,
  type LadderRow, type CatalogRow, type Rung } from "./ui";
import { initTalents, openTalents, type TreeStage } from "./talents";

const LADDER = ladderData as LadderRow[];
const CATALOG = catalogData as CatalogRow[];
interface PrismRung { label: string; delta: number | null; note: string | null }
const PRISMS = prismData as { name: string; rungs: PrismRung[] }[];
interface BarSupport { name: string; type: string }
interface BarSkill { name: string; supports: BarSupport[] }
interface SkillBar { loadout: string; active: BarSkill[]; passive: BarSkill[] }
interface SubItem { name: string; note?: string; lines?: string[] }
const SKILLBARS = skillbarsData as SkillBar[];

/* ---------- strict lookups: a renamed label must break loudly, never render stale ---------- */
function rung(slot: string, prefix: string): Rung {
  const rg = LADDER.find(r => r.slot === slot)
    ?.rungs.find(r => r.label.toLowerCase().startsWith(prefix.toLowerCase()));
  if (!rg) throw new Error(`linear: no rung ${slot}/${prefix}`);
  return rg;
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

/* detail thunks resolve at render time against live `done` (helpers defined after state) */
const craftDetail = (stepId: string, slot: string, prefix: string) =>
  () => craftLinesHtml(stepId, slot, prefix);
const itemsDetail = (stepId: string, items: SubItem[]) =>
  () => itemsHtml(stepId, items);
const memoryDetail = (stepId: string) =>
  () => memoryBoxesHtml(stepId);
/** Gems to buy between two loadouts — new skills and new supports (activation mediums included). */
const skillBuysDetail = (
  stepId: string, from: string, to: string,
  which: "active" | "passive" = "active",
  filter?: GemFilter,
) =>
  () => skillBuysHtml(stepId, from, to, which, filter)
    + `<details class="bar-fold"><summary>the full bar after this buy</summary>`
    + skillBarView(to, which) + `</details>`;

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
  `<div class="mod-row"><span class="mod-text"><b>${esc(godOf(r.on))}</b> · ${esc(r.text).replace(/\n/g, " · ")}</span>`
  + `<span class="delta-chip d-none">defense</span></div>`;

/* Hero-memory shopping: Fixed Affix + Random Affix only (no Special Random). Ranked by
   catalog ΔDPS for this build; one entry per affix family (best roll). */
const memShort = (r: CatalogRow): string => {
  const t = r.text.replace(/\n/g, " · ");
  if (/Combo Starters/i.test(t) && /Combo Finishers/i.test(t))
    return "Combo starter AS + finisher Crit Damage";
  if (/Attack and Cast Speed/i.test(t) && /Minion/i.test(t)) return "Attack Speed";
  if (/^Attack Damage$/i.test(r.name)) return "Attack Damage";
  if (/^Physical Damage$/i.test(r.name)) return "Physical Damage";
  if (/^Cold Damage$/i.test(r.name)) return "Cold Damage";
  if (/Physical Skill Critical Strike Damage/i.test(r.name)) return "Phys Skill Crit Damage";
  if (/Attack Critical Strike Rating/i.test(r.name)) return "Attack Crit Rating";
  if (/^Critical Strike Damage$/i.test(r.name)) return "Crit Damage";
  if (/^Critical Strike Rating$/i.test(r.name)) return "Crit Rating";
  if (/^Attack Speed$/i.test(r.name)) return "Attack Speed";
  if (/^damage$/i.test(r.name)) return "% damage";
  return r.name;
};
const memRank = (tier: "Fixed Affix" | "Random Affix"): string[] => {
  const best = new Map<string, CatalogRow>();
  for (const r of CATALOG) {
    if (r.cat !== "memory" || r.tier !== tier || r.delta === null || r.delta <= 0) continue;
    const prev = best.get(r.name);
    if (!prev || r.delta > (prev.delta ?? 0)) best.set(r.name, r);
  }
  return [...best.values()]
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
    .map(memShort);
};
const MEM_FIXED_DPS = memRank("Fixed Affix");
const MEM_RANDOM = memRank("Random Affix");
if (!MEM_FIXED_DPS.length || !MEM_RANDOM.length)
  throw new Error("linear: memory Fixed/Random priorities empty — regenerate catalog");
/* Catalog ΔDPS ranks Fixed "% damage" first (+52% → +7.4%), but on this crit/AS
   build it's never better shopping than Crit Damage / Crit Rating / Attack Speed —
   demote it under those three, with the unscored Skill Area line in between.
   Catalog only ranks DPS Fixed lines; ES build also shops the defense Fixed rolls below. */
const FIXED_ABOVE_PCT = new Set(["Crit Damage", "Crit Rating", "Attack Speed"]);
const memFixedDpsShop = (() => {
  if (!MEM_FIXED_DPS.includes("% damage")) return MEM_FIXED_DPS;
  const rest = MEM_FIXED_DPS.filter(x => x !== "% damage");
  const lastPin = Math.max(-1, ...rest.map((x, i) => (FIXED_ABOVE_PCT.has(x) ? i : -1)));
  return [...rest.slice(0, lastPin + 1), "Skill Area", "% damage", ...rest.slice(lastPin + 1)];
})();
const MEM_FIXED = [
  ...memFixedDpsShop,
  "Max Energy Shield",
  "Max Resistance",
  "Curse effect against you",
];

/* ---------- the spine — hand-authored order (see spec: personal judgment, not derivable) ---------- */
interface Step {
  id: string;              // stable localStorage key — never rename casually
  title: string; note?: string;
  src?: keyof typeof SRC;  // origin chip
  chip?: string;           // pre-rendered gainChip/dChip html
  seq?: string;            // "FIRST"… — ordered within the phase
  needs?: string[];        // step ids this is gated on
  detail?: string | (() => string); // fold-out / checklist html (fn = live checked state)
}
interface Phase {
  id: string; cost?: string; gate: string; title: string; note?: string;
  steps: Step[];
  /** slate-step ids echoed here as timeline reminders — same checkbox state, not counted */
  remind?: string[];
}

/* the standing watchlist — rendered as the sticky right rail */
const WATCHLIST: Phase = {
  id:"watchlist", gate:"Every session",
  title:"Watchlist", note:"Buy on price, not on schedule.", steps:[
  { id:"wl-animitta", src:"gear", chip: rungChip("necklace", "Heart of Animitta"),
    title:"Heart of Animitta", note:"Listed ~1300 FE — snipe way under. The #1 buy." },
  { id:"wl-legion", src:"support", title:"Spectral Slash: Legion (Noble)" },
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
  { id:"swap", cost:"~100m", gate:"Lv 86+", title:"Swap to Spectral Slash", steps:[
    { id:"tree", src:"talent", title:"Copy the talent tree" },
    { id:"skill-setup", src:"skill", title:"Copy this bar",
      detail: () => skillBarHtml("skill-setup", "Full precise auras", "active") },
    { id:"auras-early", src:"skill", title:"All 4 Auras (non-precise)",
      detail: () => skillBarHtml("auras-early", "150b", "passive", { stripPrecise: true }) },
    { id:"pactspirits", src:"pact", title:"Pactspirits",
      detail: itemsDetail("pactspirits", [
        { name:"Red Umbrella", note:"nodes 4–6: crit" },
        { name:"Azure Gunslinger", note:"nodes 4–6: crit" },
        { name:"Fog Scorpion or Knight of Pale Blue" },
      ]) },
    { id:"mh82", src:"gear", chip: rungChip("mainHand", "i82"),
      title:"i82 mainhand — Unforgotten Long Blade (speed/crit)",
      detail: craftDetail("mh82", "mainHand", "i82") },
    { id:"oh82", src:"gear", chip: rungChip("offHand", "i82"),
      title:"i82 offhand — Unforgotten Long Blade (raw damage)",
      detail: craftDetail("oh82", "offHand", "i82") },
    { id:"ring82a", src:"gear", chip: rungChip("ring1", "i82"),
      title:"i82 combo ring 1 — Punished Lightning Ring",
      detail: craftDetail("ring82a", "ring1", "i82") },
    { id:"ring82b", src:"gear", chip: rungChip("ring2", "i82"),
      title:"i82 combo ring 2 — Punished Lightning Ring",
      detail: craftDetail("ring82b", "ring2", "i82") },
    { id:"helm82", src:"gear", chip: rungChip("helmet", "i82"),
      title:"i82 ES helmet — All Magic Crown",
      detail: craftDetail("helm82", "helmet", "i82") },
    { id:"chest82", src:"gear", chip: rungChip("chest", "i82"),
      title:"i82 ES chest — All Magic Secret Robe",
      detail: craftDetail("chest82", "chest", "i82") },
    { id:"gloves82", src:"gear", chip: rungChip("gloves", "i82"),
      title:"i82 ES gloves — All Magic Grip",
      detail: craftDetail("gloves82", "gloves", "i82") },
    { id:"cheap-uniques", src:"gear", title:"Grace Boots",
      note:"keep until the Focus Blessing slate" },
    { id:"slate-quickcheck", src:"slate", title:"Slate quick-checks",
      note:"3–4× slates",
      detail: foldout("best legendary-medium fillers — skill-level lines stack", fillers.map(catRow).join("")) },
  ]},

  { id:"swap90", cost:"~200m", gate:"Lv 90+", title:"Auras + Pedigree", steps:[
    { id:"auras", src:"skill", title:"All 4 Precise Auras",
      detail: () => skillBarHtml("auras", "150b", "passive") },
    { id:"pedigree", src:"slate", title:"Snipe a Pedigree of Gods (~30 FE)",
      detail: foldout("core talents to look for", cores.map(catRow).join("")) },
    { id:"memory-epic", title:"Hero Memory epic",
      note:"Spec all bottom nodes.",
      detail: memoryDetail("memory-epic") },
    { id:"cheap-uniques-90", src:"gear", title:"Buy cheap uniques",
      detail: itemsDetail("cheap-uniques-90", [
        { name:"Bodhi Girdle" },
        { name:"Vortex Heart", note:"~130 FE" },
      ]) },
  ]},

  { id:"boots-blessing", gate:"Traveler 8", title:"Focus Blessing + i86 ES boots", steps:[
    { id:"sl-blessing", src:"slate", chip: slateChip("+100% chance to gain a stack of Focus Blessing"),
      title:"Focus Blessing on Frostbitten hit (Goddess of Knowledge)",
      note:"Buy before the i86 boots." },
    { id:"boots86", src:"gear", chip: rungChip("boots", "i86"), needs:["sl-blessing"],
      title:"i86 ES boots — Long Night Sorcerer's Boots",
      detail: craftDetail("boots86", "boots", "i86") },
  ]},

  { id:"core86", cost:"1B", gate:"8-0", title:"i86 core — in this order",
    note:`Priceless waits until after Traveler 8. i86 chest = ES/defense only (${rngTxt(rung("chest", "i86"))}).`, steps:[
    { id:"mh86", seq:"FIRST", src:"gear", chip: rungChip("mainHand", "i86"),
      title:"i86 mainhand — Shadowless Swordsman's Blade (speed/crit)",
      detail: craftDetail("mh86", "mainHand", "i86") },
    { id:"oh86", seq:"SECOND", src:"gear", chip: rungChip("offHand", "i86"),
      title:"i86 offhand — Shadowless Swordsman's Blade (raw damage)",
      detail: craftDetail("oh86", "offHand", "i86") },
    { id:"motionless", src:"support", title:"Activation Medium: Motionless",
      note:"On the Slash medium — replaces Quick Decision or Added Phys.",
      // filter: just the medium — the rest of the 150b bar lands with Legion (Skills phase)
      detail: () => skillBuysHtml("motionless", "Full precise auras", "150b", "active",
        n => /Motionless/i.test(n)) },
    { id:"lv93", src:"talent", title:"Lv 93 talent tree" },
  ]},

  { id:"slates", gate:"Slates", title:"Slate + memory priority", steps:[
    { id:"sl-frostbite", src:"slate", chip: slateChip("Inflicts Frostbite when dealing Hit Cold Damage"),
      title:"Frostbite on Cold hit (Goddess of Knowledge)",
      note:"Respec the 4 freed Prophet points into the Frostbite legendaries." },
    { id:"memory-leg", title:"Hero Memory epic (REVIVED)",
      note:"REVIVED: +% Attack Speed for every main-attack skill cast (stacks to 6). Spec all bottom nodes.",
      detail: memoryDetail("memory-leg") },
  ]},

  { id:"armor86-dps", cost:"10B–20B", gate:"Traveler 8", title:"i86 armor — DPS + the Frostbite package",
    note:"Traveler 8 done → check 8-1/8-2 priceless pieces every session.", steps:[
    { id:"ring86bar", src:"gear", chip: rungChip("ring1", "i86"),
      title:"i86 barrier ring — Perishing Inferno Flame Ring",
      detail: craftDetail("ring86bar", "ring1", "i86") },
    { id:"icebond", src:"skill", title:"Ice Bond — the Frostbite self-applicator",
      note:"Replaces Fixate.",
      // filter: just Ice Bond + its gems — the rest of the 150b bar lands with Legion (Skills phase)
      detail: () => skillBuysHtml("icebond", "Full precise auras", "150b", "active",
        n => /Ice Bond/i.test(n)) },
    { id:"ring86fb", src:"gear", chip: rungChip("ring2", "i86"),
      title:"i86 frostbite ring — Perishing Inferno Flame Ring",
      detail: craftDetail("ring86fb", "ring2", "i86") },
    { id:"haze", src:"prism", chip: dChip(prismRung("Ethereal", "Haze").delta),
      title:"Ethereal Prism: Haze",
      note:"+12% additional Attack Damage when holding a One-Handed Weapon." },
  ]},

  { id:"armor86-tank", gate:"Traveler 8", title:"i86 armor — tank", steps:[
    { id:"helm86", src:"gear", chip: rungChip("helmet", "i86"),
      title:"i86 ES helmet — Long Night Sorcerer's Mask",
      detail: craftDetail("helm86", "helmet", "i86") },
    { id:"gloves86", src:"gear", chip: rungChip("gloves", "i86"),
      title:"i86 ES gloves — Long Night Sorcerer's Wristband",
      detail: craftDetail("gloves86", "gloves", "i86") },
    { id:"belt-lh", src:"gear", chip: rungChip("belt", "Light Hunter"),
      title:"Light Hunter Belt — tank swap",
      note:"Keep the Bodhi Girdle for DPS — this belt trades damage for defense." },
  ]},

  { id:"linkbuys", gate:"Skills", title:"The Spectral Slash link",
    remind:["sl-frostbite"], steps:[
    { id:"legion", seq:"FIRST", src:"support", title:"Socket Legion (Noble) + mediums", needs:["wl-legion"],
      note:"Drop whichever of Quick Decision / Added Phys the Motionless buy left.",
      // filter: Motionless (i86 core) and Ice Bond (armor phase) already have their own steps
      detail: skillBuysDetail("legion", "Full precise auras", "150b", "active",
        n => !/Motionless|Ice Bond/i.test(n)) },
    { id:"detonation", seq:"SECOND", src:"support", title:"Buy Spectral Slash: Detonation (Magnificent)",
      note:"Socket it now; max to L5 later (+20% damage) before Fervor.",
      // filter: only the magnificent gem — the 420b bar also lands warcries (next step)
      detail: () => skillBuysHtml("detonation", "150b", "420b", "active",
        n => /Detonation/i.test(n)) },
  ]},

  { id:"warcrybar", gate:"Skills", title:"The warcry bar", steps:[
    { id:"warcries", seq:"FIRST", src:"skill", title:"Swap to warcries",
      note:"Shockwave replaces Bull's Rage · Resurrection replaces Timid.",
      detail: () => skillBuysHtml("warcries", "150b", "420b", "active",
          n => !/Detonation/i.test(n))
        + itemsHtml("warcries", [
          { name:"Captain Kitty of the Furious Sea",
            note:"replaces Fog Scorpion / Knight of Pale Blue · level this only" },
          { name:"+4 min enemies affected by Warcry slate",
            note:"God of Might" },
        ])
        + `<details class="bar-fold"><summary>the full bar after this buy</summary>`
        + skillBarView("420b", "active") + `</details>` },
    { id:"thunderspike", seq:"SECOND", src:"skill", title:"Buy Thunder Spike: Rumbling Thunder (Noble)",
      note:"Thunder Spike replaces Spiral Strike.",
      detail: skillBuysDetail("thunderspike", "420b", "Inverse-Warcry") },
    { id:"sl-shop", src:"slate", title:"What to shop",
      note:"A Corner of Divinity (max 3) · Fallen Starlight (max 3) · Pedigree of Gods (max 1) · God slates: aim 1× Medium + 2× Legendary Medium or better.",
      detail: foldout("best legendary-medium fillers — skill-level lines stack", fillers.map(catRow).join("")) },
  ]},

  { id:"priceless", cost:"200B", gate:"Profound 8", title:"Priceless completes (8-1 + 8-2 open)", steps:[
    { id:"mh100", src:"gear", chip: rungChip("mainHand", "priceless"),
      title:"Priceless mainhand — Shadowless Swordsman's Blade",
      detail: craftDetail("mh100", "mainHand", "priceless") },
    { id:"oh100", src:"gear", chip: rungChip("offHand", "priceless"), needs:["boots86"],
      title:"Priceless offhand — Ninth Apostle's Magic Shield",
      note:"Buy as a package with the i86 Hasten boots + God of Might / Brave tree changes.",
      detail: craftDetail("oh100", "offHand", "priceless") },
    { id:"ring-timid", src:"gear", chip: rungChip("ring1", "priceless timid"), needs:["wl-timid"],
      title:"Priceless timid curse-on-hit ring",
      detail: craftDetail("ring-timid", "ring1", "priceless timid") },
    { id:"ring-combo", src:"gear", chip: rungChip("ring2", "priceless combo"),
      title:"Priceless combo ring",
      detail: craftDetail("ring-combo", "ring2", "priceless combo") },
  ]},

  { id:"pre-fervor", gate:"Before Fervor", title:"Late power spikes", steps:[
    { id:"det-max", seq:"1st", src:"support",
      chip:`<span class="delta-chip d-hot">+20%</span>`,
      title:"Max Spectral Slash: Detonation (Magnificent) to L5",
      note:"+20% damage at level 5.", needs:["detonation"] },
    { id:"end-warcry", seq:"2nd", src:"prism",
      chip: dChip(prismRung("Inverse", "good inverse").delta), needs:["wl-inverse"],
      title:"Socket the Inverse Prism" },
    { id:"kismets", src:"pact", title:"Kismet layout",
      detail: itemsDetail("kismets", [
        { name:"2× Peerless", note:"Dual pair — never move" },
        { name:"Tiger's Chain", note:"never move" },
        { name:"Ascetic" },
        { name:"1× Medium Crit Rating" },
        { name:"9× Micro Crit Rating" },
      ]) },
    { id:"sl-immunities", src:"slate", title:"Immunity lines",
      note:"Hold before farming Deep Space.",
      detail: foldout("the immunity Legendary Mediums", immunities.map(immRow).join("")) },
  ]},

  { id:"fervor", gate:"Fervor", title:"The Fervor engine", steps:[
    { id:"fv-boots", src:"gear", chip: rungChip("boots", "Dawn Break"),
      needs:["wl-vorax", "wl-dawnbreak", "wl-ghost"],
      title:"Vorax boots + Dawn Break + Ghost Slaughter",
      note:"Boots + gloves land together. Corroded 1%-per-rating roll only on Ghost Slaughter.",
      detail: itemsDetail("fv-boots", [
        { name:"Vorax boot base", note:"i86+, at least one decent mod" },
        { name:"Dawn Break belt", note:"EV 950 FE" },
        { name:"Corroded Ghost Slaughter", note:"1%-per-rating roll only" },
      ]) },
    { id:"fv-helm", src:"gear", chip: rungChip("helmet", "priceless"),
      title:"Priceless sealed-mana helmet",
      detail: craftDetail("fv-helm", "helmet", "priceless") },
    { id:"fv-prism", src:"prism", chip: dChip(prismRung("Ethereal", "Unmatched Valor").delta),
      needs:["wl-valor"],
      title:"Socket Unmatched Valor", note:"Ranger slot; Centralize becomes a respec candidate." },
  ]},

  { id:"endgame", cost:"150B+", gate:"Timemark 8 / Atlas", title:"Endgame layers", steps:[
    { id:"sl-convert", src:"slate", chip: slateChip("Converts 100% of Physical Damage to Cold"),
      title:"Phys→Cold conversion (Goddess of Knowledge)", needs:["fv-prism"],
      note:"Then respec Prophet → Ronin — wait until Unmatched Valor makes Centralize a respec candidate." },
    { id:"fv-eternity", seq:"1st", src:"gear", chip: rungChip("belt", "Eternity"), needs:["wl-eternity"],
      title:"Eternity (from the 5 blueprints)",
      note:"Swap Motionless → Still Attack medium on the link. Precise: Energy Shield once the flat-ES belt is gone.",
      detail: skillBuysDetail("fv-eternity", "3t", "5t Eternity") },
    { id:"end-mammoth", src:"pact", title:"2× Unending Fate + 2× Mammoth",
      note:"2× Unending Fate unlock the dual sockets · 2× Mammoth self-casts Lv.20 Resurrection Warcry on hit every 3s (hands-free −60% additional damage taken).",
      detail: itemsDetail("end-mammoth", [
        { name:"2× Unending Fate", note:"required dual sockets" },
        { name:"2× Mammoth", note:"self-casts Resurrection Warcry" },
      ]) },
    { id:"final-link", src:"support", title:"Finish the link", needs:["end-mammoth"],
      note:"Critical Strike Damage Increase replaces Steamroll. "
        + "Defensive Buffer replaces Resurrection Warcry — Mammoth is casting it.",
      detail: skillBuysDetail("final-link", "5t Eternity", "more_1") },
    { id:"end-crit", src:"talent", title:"Crit converters",
      note:"Take the 0.5% Crit Damage-per-rating converters: tree legendary + 2 slate copies." },
    { id:"end-prairie", src:"slate", title:"When Sparks Set the Prairie Ablaze",
      note:"Copies the last Talent on all adjacent slates (not Core Talents) — use for the converter copies." },
  ]},
];

/* ---------- talent tree stages — hand-authored per-slot composition.
   `now` = first stage whose trigger step is still unchecked (complete → advances).
   A stage picks each of the 4 tree slots from its own loadout so a diff lands
   on the step that causes it: the planner's "420b" bundles the warcry tree
   swaps AND the Prophet frostbite respec, but the respec is paid for by the
   sl-frostbite slate — so that stage advances only the Prophet slot (prism
   stripped: Haze stays on bladerunner until the 420b tree swap orphans it). */
const all = (loadout: string) => Array.from({ length: 4 }, () => ({ loadout }));
const TREE_STAGES: TreeStage[] = [
  { label:"Lv 86 — swap",    trigger:"tree",         slots: all("Full precise auras") },
  { label:"Lv 93",           trigger:"lv93",         slots: all("150b") },
  { label:"Frostbite slate", trigger:"sl-frostbite",
    slots: [{loadout:"150b"}, {loadout:"150b"}, {loadout:"420b", prism:false}, {loadout:"150b"}] },
  { label:"420b — warcries", trigger:"warcries",     slots: all("420b") },
  { label:"Inverse prism",   trigger:"end-warcry",   slots: all("Inverse-Warcry") },
  { label:"Eternity",        trigger:"fv-eternity",  slots: all("5t Eternity") },
  { label:"Prophet → Ronin", trigger:"sl-convert",   slots: all("more_1") },
];
/* steps that respec the tree get a jump-straight-to-that-stage button */
const TREE_BTN: Record<string, number> = { "end-crit": 6 };
TREE_STAGES.forEach((s, i) => { if (s.trigger) TREE_BTN[s.trigger] = i; });
const treeBtn = (stage: number | "cur", label: string) =>
  `<button type="button" class="tree-btn" data-tree-stage="${stage}">✦ ${esc(label)}</button>`;

/* ---------- render + progress state ---------- */
const KEY = "linear-done";
/* localStorage can be unavailable (private mode) — degrade to per-session state, never crash */
const loadDone = (): Record<string, true> => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch { return {}; }
};
const done: Record<string, true> = loadDone();
const saveDone = () => { try { localStorage.setItem(KEY, JSON.stringify(done)); } catch { /* per-session only */ } };

/* Craft fold-outs stay open across checkbox re-renders (checking a line would otherwise snap shut). */
const craftOpen = new Set<string>();

/* Nested checklist keys live in `done`: stepId|item|line — re-rendered on every check. */
const checkLabel = (id: string, labelHtml: string, cls: string) =>
  `<label class="${cls}"><input type="checkbox" data-step="${escAttr(id)}"${done[id] ? " checked" : ""}>`
  + labelHtml + `</label>`;

/** Flat checkable lines under a step (craft order stats, no Δ chips). */
function linesHtml(stepId: string, lines: string[]): string {
  return `<ul class="sublist">`
    + lines.map(line => {
      const id = `${stepId}|${line}`;
      return `<li class="sub-item${done[id] ? " done" : ""}">`
        + checkLabel(id, `<span>${esc(line)}</span>`, "sub-check")
        + `</li>`;
    }).join("")
    + `</ul>`;
}

/** Expected craft stats for a ladder rung — collapsed behind a Craft button. */
function craftLinesHtml(stepId: string, slot: string, prefix: string): string {
  const r = rung(slot, prefix);
  if (!r.mods?.length) throw new Error(`linear: no craft mods on ${slot}/${prefix}`);
  const open = craftOpen.has(stepId) ? " open" : "";
  return `<details class="craft-fold" data-craft="${escAttr(stepId)}"${open}>`
    + `<summary>Craft</summary>`
    + linesHtml(stepId, r.mods.map(m => m.text.replace(/\n/g, " · ")))
    + `</details>`;
}

/** Parent step → checkable sub-items (uniques, kismets); optional nested lines per item. */
function itemsHtml(stepId: string, items: SubItem[]): string {
  return `<ul class="skill-bar">`
    + items.map(it => {
      const key = `${stepId}|${it.name}`;
      const title = `<span>${esc(it.name)}`
        + (it.note ? ` <span class="sub-note">${esc(it.note)}</span>` : "")
        + `</span>`;
      return `<li class="skill-item${done[key] ? " done" : ""}">`
        + checkLabel(key, title, "skill-check")
        + (it.lines?.length
          ? `<ul class="skill-supports">${it.lines.map(line => {
              const lid = `${key}|${line}`;
              return `<li class="support-item${done[lid] ? " done" : ""}">`
                + checkLabel(lid, `<span>${esc(line)}</span>`, "support-check")
                + `</li>`;
            }).join("")}</ul>`
          : "")
        + `</li>`;
    }).join("")
    + `</ul>`;
}

/** Hero memories: Origin → Progress → Discipline (boxes are checkable). Fixed/Random
    craft lines are a shared priority list behind a Craft fold — not checkboxes. */
function memoryBoxesHtml(stepId: string): string {
  const boxes: { key: string; type: string; base: string }[] = [
    { key:"Origin", type:"Origin", base:"Strength" },
    { key:"Progress", type:"Progress", base:"Attack Speed" },
    { key:"Discipline", type:"Discipline", base:"Energy Shield" },
  ];
  const prioBlock = (label: string, items: string[]) =>
    `<div class="mem-row"><span class="mem-lbl">${esc(label)}</span>`
    + `<ol class="mem-prio">`
    + items.map(line => `<li>${esc(line)}</li>`).join("")
    + `</ol></div>`;
  const open = craftOpen.has(stepId) ? " open" : "";
  return `<ul class="skill-bar">`
    + boxes.map(b => {
      const id = `${stepId}|${b.key}`;
      return `<li class="skill-item mem-box${done[id] ? " done" : ""}">`
        + checkLabel(id,
          `<span><b>${esc(b.type)}</b> <span class="sub-note">${esc(b.base)}</span></span>`,
          "skill-check")
        + `</li>`;
    }).join("")
    + `</ul>`
    + `<details class="craft-fold" data-craft="${escAttr(stepId)}"${open}>`
    + `<summary>Craft</summary>`
    + `<div class="mem-body mem-shared">`
    + prioBlock("Fixed", MEM_FIXED)
    + prioBlock("Random", MEM_RANDOM)
    + `</div></details>`;
}

function getBar(loadout: string): SkillBar {
  const bar = SKILLBARS.find(b => b.loadout === loadout);
  if (!bar) throw new Error(`linear: no skillbar "${loadout}"`);
  return bar;
}

/** Keep a gem name in a skill-buy diff. Applied to skill names and support names. */
type GemFilter = (name: string) => boolean;

/**
 * New skills and new supports present in `to` but not `from`.
 * Activation mediums / noble / magnificent supports are first-class — never dropped.
 * `filter` keeps a gem by skill or support name (default: keep all).
 */
function skillBuys(
  from: string, to: string,
  which: "active" | "passive" = "active",
  filter: GemFilter = () => true,
): { name: string; supports: BarSupport[] }[] {
  const prev = new Map(getBar(from)[which].map(s => [s.name, new Set(s.supports.map(u => u.name))]));
  const out: { name: string; supports: BarSupport[] }[] = [];
  for (const sk of getBar(to)[which]) {
    const old = prev.get(sk.name);
    if (!old) {
      // brand-new skill — the filter gates the whole skill; its supports come with it
      if (!filter(sk.name)) continue;
      out.push({ name: sk.name, supports: sk.supports });
      continue;
    }
    // existing skill — only newly socketed supports (incl. activation mediums)
    const supports = sk.supports.filter(u => !old.has(u.name) && filter(u.name));
    if (supports.length) out.push({ name: sk.name, supports });
  }
  if (!out.length) throw new Error(`linear: no skill buys ${from} → ${to} (${which})`);
  return out;
}

/** Type-tinted support label — mediums / nobles / magnificents stand out in checklists. */
const supLabel = (u: BarSupport) =>
  `<span class="sup-name sup-${u.type}">${esc(u.name)}</span>`;

/** Interactive checklist of gems this step buys (derived from loadout skillbars). */
function skillBuysHtml(
  stepId: string, from: string, to: string,
  which: "active" | "passive" = "active",
  filter?: GemFilter,
): string {
  const buys = skillBuys(from, to, which, filter);
  return `<ul class="skill-bar">`
    + buys.map(s => {
      const skillKey = `${stepId}|${s.name}`;
      return `<li class="skill-item${done[skillKey] ? " done" : ""}">`
        + checkLabel(skillKey, `<span>${esc(s.name)}</span>`, "skill-check")
        + (s.supports.length
          ? `<ul class="skill-supports">${s.supports.map(u => {
              const supKey = `${skillKey}|${u.name}`;
              return `<li class="support-item${done[supKey] ? " done" : ""}">`
                + checkLabel(supKey, supLabel(u), "support-check")
                + `</li>`;
            }).join("")}</ul>`
          : "")
        + `</li>`;
    }).join("")
    + `</ul>`;
}

/** Interactive skill → support checklist (Copy this bar / Precise Auras).
 *  `stripPrecise` rewrites "Precise: X" → "X" so the early-game bar is a 1:1 of
 *  the precise loadout with non-precise skill names (supports unchanged). */
function skillBarHtml(
  stepId: string, loadout: string, which: "active" | "passive" = "active",
  opts: { stripPrecise?: boolean } = {},
): string {
  const bar = getBar(loadout);
  const skillName = (n: string) =>
    opts.stripPrecise ? n.replace(/^Precise:\s*/, "") : n;
  return `<ul class="skill-bar">`
    + bar[which].map(s => {
      const name = skillName(s.name);
      const skillKey = `${stepId}|${name}`;
      return `<li class="skill-item${done[skillKey] ? " done" : ""}">`
        + checkLabel(skillKey, `<span>${esc(name)}</span>`, "skill-check")
        + (s.supports.length
          ? `<ul class="skill-supports">${s.supports.map(u => {
              const supKey = `${skillKey}|${u.name}`;
              return `<li class="support-item${done[supKey] ? " done" : ""}">`
                + checkLabel(supKey, supLabel(u), "support-check")
                + `</li>`;
            }).join("")}</ul>`
          : "")
        + `</li>`;
    }).join("")
    + `</ul>`;
}

/** Read-only skill bar for fold-outs (no checkboxes — avoids re-render closing <details>). */
function skillBarView(loadout: string, which: "active" | "passive" = "active"): string {
  const bar = getBar(loadout);
  return `<div class="skillbar">` + bar[which].map(sk =>
    `<div class="sb-row">`
      + `<span class="sb-row-head"><span class="sb-skill">${esc(sk.name)}</span></span>`
      + `<span class="sb-sups">`
      + sk.supports.map(x => `<span class="sb-sup sb-${x.type}">${esc(x.name)}</span>`).join("")
      + `</span></div>`
  ).join("") + `</div>`;
}

const TITLE: Record<string, string> = {};
const STEP: Record<string, Step> = {};
for (const p of [WATCHLIST, ...PHASES]) for (const s of p.steps) { TITLE[s.id] = s.title; STEP[s.id] = s; }

for (const p of [WATCHLIST, ...PHASES]) {
  for (const s of p.steps)
    for (const id of s.needs ?? []) if (!(id in TITLE)) throw new Error(`linear: needs "${id}" on ${s.id} has no step`);
  for (const id of p.remind ?? []) if (!(id in TITLE)) throw new Error(`linear: remind "${id}" on ${p.id} has no step`);
}

const stepCard = (s: Step, remind = false) => {
  const waiting = (s.needs ?? []).filter(id => !done[id]);
  const body = done[s.id] ? ""
    : (s.note ? `<p class="l-note">${s.note}</p>` : "")
      + (waiting.length ? `<p class="l-wait">⚠ waiting on: ${waiting.map(id => esc(TITLE[id])).join(" · ")}</p>` : "")
      + (s.id in TREE_BTN ? `<p class="l-tree">${treeBtn(TREE_BTN[s.id], "view this talent tree")}</p>` : "")
      + (remind ? `<p class="l-wait">↩ echoed from <a href="#step-${escAttr(s.id)}">Slate + memory priority</a> — same checkbox</p>` : "")
      + (typeof s.detail === "function" ? s.detail() : (s.detail ?? ""));
  /* reminder copies drop the DOM id (the canonical card keeps it) but share data-step state */
  return `<div class="lstep${done[s.id] ? " done" : ""}${s.seq ? " seq" : ""}${remind ? " remind" : ""}"${remind ? "" : ` id="step-${escAttr(s.id)}"`}>`
    + `<label class="lstep-head"><input type="checkbox" data-step="${escAttr(s.id)}"${done[s.id] ? " checked" : ""}>`
    + (remind ? `<span class="lseq">SLATE</span>` : "")
    + (s.seq && !remind ? `<span class="lseq">${esc(s.seq)}</span>` : "")
    + (s.src ? srcChip(s.src) : "")
    + `<span class="l-title">${s.title}</span>${s.chip ?? ""}</label>`
    + body
    + `</div>`;
};

/* fully-complete phases collapse to their title; header click peeks back in (session-only) */
const peekDone = new Set<string>();

const phaseCard = (p: Phase) => {
  const n = p.steps.filter(s => done[s.id]).length;
  const complete = n === p.steps.length;
  const collapsed = complete && !peekDone.has(p.id);
  const ordered = p.steps.filter(s => s.seq), free = p.steps.filter(s => !s.seq);
  const reminds = (p.remind ?? []).map(id => stepCard(STEP[id], true)).join("");
  return `<article class="bundle lphase${complete ? " complete" : ""}" id="phase-${escAttr(p.id)}" data-phase="${escAttr(p.id)}">`
    + `<div class="bundle-head"${complete ? ` title="${collapsed ? "show" : "hide"} the completed steps"` : ""}>`
    + `<span class="l-gate">${esc(p.gate)}${p.cost ? ` · ${esc(p.cost)}` : ""}</span>`
    + `<h3>${esc(p.title)}</h3>`
    + `<span class="l-count">${complete ? "✓" : `${n}/${p.steps.length}`}</span></div>`
    + (collapsed ? "" :
      (p.note ? `<p class="l-phase-note">${p.note}</p>` : "")
      + (reminds ? `<div class="l-ordered l-reminds">${reminds}</div>` : "")
      + (ordered.length ? `<div class="l-ordered">${ordered.map(s => stepCard(s)).join("")}</div>` : "")
      + (free.length ? `<div class="l-parallel">${free.map(s => stepCard(s)).join("")}</div>` : ""))
    + `</article>`;
};

/** Which phase is in view — only that phase expands step links in the left rail. */
let activePhaseId = PHASES[0]?.id ?? "";

/** Left rail: one link per phase + n/total; step children only under the active phase. */
const sideNav = (phases: Phase[], activeId: string) => {
  let doneN = 0, totalN = 0;
  const items = phases.map(p => {
    const n = p.steps.filter(s => done[s.id]).length;
    doneN += n; totalN += p.steps.length;
    const all = n === p.steps.length && p.steps.length > 0;
    const here = p.id === activeId;
    const phase = `<a class="sidenav-item${all ? " complete" : n ? " partial" : ""}${here ? " active" : ""}" href="#phase-${escAttr(p.id)}">`
      + `<span class="sidenav-label">${esc(p.title)}</span>`
      + `<span class="sidenav-count">${all ? "✓" : `${n}/${p.steps.length}`}</span>`
      + `</a>`;
    if (!here) return phase;
    const subs = p.steps.map(s => {
      const sd = !!done[s.id];
      return `<a class="sidenav-sub${sd ? " complete" : ""}" href="#step-${escAttr(s.id)}">`
        + `<span class="sidenav-sub-label">${esc(s.title)}</span>`
        + (sd ? `<span class="sidenav-sub-mark">✓</span>` : "")
        + `</a>`;
    }).join("");
    return phase + `<div class="sidenav-subs">${subs}</div>`;
  }).join("");
  const allDone = doneN === totalN && totalN > 0;
  return `<div class="sidenav-head">`
    + `<span class="sidenav-title">Sections</span>`
    + `<span class="sidenav-total${allDone ? " complete" : ""}">${allDone ? "✓" : `${doneN}/${totalN}`}</span>`
    + `</div>` + items;
};

/** Phase whose top is closest under the sticky offset wins (classic scroll-spy). */
function phaseInView(main: HTMLElement): string {
  const anchor = 96; // ~ sticky topnav + a little air
  let best = PHASES[0]?.id ?? "";
  let bestTop = -Infinity;
  for (const p of PHASES) {
    const el = main.querySelector<HTMLElement>(`#phase-${CSS.escape(p.id)}`);
    if (!el) continue;
    const top = el.getBoundingClientRect().top;
    if (top <= anchor && top >= bestTop) {
      bestTop = top;
      best = p.id;
    }
  }
  // above the first phase → still first; past last with nothing above anchor → last seen
  if (bestTop === -Infinity) {
    const first = main.querySelector<HTMLElement>(`#phase-${CSS.escape(PHASES[0]?.id ?? "")}`);
    if (first && first.getBoundingClientRect().top > anchor) return PHASES[0]?.id ?? "";
  }
  return best;
}

/* set by renderLinear — resetProgress repaints after clearing state */
let paintLinear: (() => void) | null = null;

/** Wipe every Linear checkbox (and session fold/peek state) then re-render. */
export function resetLinearProgress(): void {
  for (const k of Object.keys(done)) delete done[k];
  craftOpen.clear();
  peekDone.clear();
  saveDone();
  paintLinear?.();
}

export function renderLinear(main: HTMLElement, aside: HTMLElement, nav?: HTMLElement | null): void {
  for (const id of Object.keys(TREE_BTN))
    if (!(id in TITLE)) throw new Error(`linear: tree trigger "${id}" has no step`);
  initTalents(TREE_STAGES, () => done);

  const paintNav = () => {
    if (!nav) return;
    nav.innerHTML = sideNav(PHASES, activePhaseId);
  };

  const render = () => {
    main.innerHTML = `<p class="cat-count">Top→down — check off steps as you go; skipping ahead is fine, just listen to the orange ⚠ waiting-on notes.</p>`
      + `<div class="l-toolbar">${treeBtn("cur", "talent tree — current stage")}</div>`
      + PHASES.map(phaseCard).join("");
    aside.innerHTML = phaseCard(WATCHLIST);
    activePhaseId = phaseInView(main) || activePhaseId;
    paintNav();
  };
  paintLinear = render;

  const onScroll = () => {
    const next = phaseInView(main);
    if (next === activePhaseId) return;
    activePhaseId = next;
    paintNav();
  };

  /* delegated listeners survive re-renders; craft fold open state is kept in craftOpen */
  for (const el of [main, aside]) {
    el.addEventListener("change", e => {
      const t = e.target as HTMLInputElement;
      const id = t.dataset.step;
      if (!id) return;
      if (t.checked) done[id] = true; else delete done[id];
      saveDone();
      render();
    });
    el.addEventListener("toggle", e => {
      const d = e.target as HTMLDetailsElement;
      if (!(d instanceof HTMLDetailsElement) || !d.classList.contains("craft-fold")) return;
      const id = d.dataset.craft;
      if (!id) return;
      if (d.open) craftOpen.add(id); else craftOpen.delete(id);
    }, true);
    el.addEventListener("click", e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>(".tree-btn");
      if (b) {
        const v = b.dataset.treeStage!;
        openTalents(v === "cur" ? undefined : +v);
        return;
      }
      const head = (e.target as HTMLElement).closest<HTMLElement>(".lphase.complete > .bundle-head");
      if (!head) return;
      const id = head.parentElement!.dataset.phase!;
      if (peekDone.has(id)) peekDone.delete(id); else peekDone.add(id);
      render();
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  render();
}
