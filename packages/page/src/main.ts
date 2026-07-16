import "./style.css";
import ladderData from "./data/ladder.json";
import catalogData from "./data/catalog.json";

/* ---------- data written by dmg progression + catalog CLIs ---------- */
interface Rework { anchor: string | null; why: string }
interface ModRow { text: string; pool: string | null; cost: number | null; gain: number; per: number | null }
interface Rung {
  label: string; name: string; rarity: string | null;
  dps: number | null; gain: number | null; linear: boolean; rework: Rework | null;
  mods: ModRow[] | null;
}
interface LadderRow { slot: string; rungs: Rung[]; note: string | null }
interface CatalogRow {
  cat: string; tier: string; name: string; text: string; on: string;
  bucket: string; delta: number | null; cond: boolean;
}
const LADDER = ladderData as LadderRow[];
const CATALOG = catalogData as CatalogRow[];

/* src = where a purchase comes from (little tag) */
const SRC = {
  gear:    {label:"gear",    color:"#c9a86a"},
  skill:   {label:"skill",   color:"#d7e2ec"},
  support: {label:"support", color:"#8fb8c9"},
  prism:   {label:"prism",   color:"#7fd8e8"},
  talent:  {label:"talent",  color:"#9d85dd"},
  slate:   {label:"slate",   color:"#cfc3a8"},
  pact:    {label:"pactspirit", color:"#79c8a6"},
};

interface Buy { src: keyof typeof SRC; html: string }
/* A bundle = purchases that only pay off together. `math` is the computed impact,
   `needs` the one hard prerequisite, `cost` the bill it comes with. */
interface Bundle {
  id: string; name: string; core: string; math?: string;
  buys: Buy[]; needs?: string; cost?: string;
}

/* ---------- the bundles, in the order the engines come online ---------- */
const BUNDLES: Bundle[] = [
  {id:"finisher", name:"The Finisher core — buy points, not percent",
   core:"One skill carries the whole bar: <b>Spectral Slash's Combo Finisher</b> — 127% weapon Attack Damage <b>× (1 + Points consumed × Amp sum)</b>, then clones repeat it at 70% falloff. The Amp sum is one additive stat (skill 30% + Recuperation 5.5% + Animitta 80% + weapon 62% + shield 61% = <b>238.5%</b>); at 8 points that's roughly a ×20 on the hit. This bundle is every point source and Amp line in the build — they only multiply through that one product.",
   math:"<b>+1 Combo Point = +10.6% DPS</b>, while +10% more Amp onto the existing 238.5% pile = +3.5%. Point <i>sources</i> beat Amp rolls, and both beat any <span class='add'>+% damage</span> line.",
   buys:[
     {src:"gear", html:"a Combo-Finisher necklace — Heart of Animitta gives +1 Finisher charge, Finisher Amplification, and a Combo Point on crit"},
     {src:"gear", html:"<b>+Combo Point from Combo Starters</b> — a suffix that rides on <i>either</i> ring; the slot is irrelevant, item level just sets the tier and the sign of its paired damage roll"},
     {src:"gear", html:"damage-per-Combo-Point-consumed on the belt"},
     {src:"support", html:"Legion (clones) and Detonation on Spectral Slash; any Activation Medium so it self-casts"},
     {src:"pact", html:"<b>Azure Gunslinger's Seven Steps</b> — Pure Heart, <b>+5% additional Attack Damage per stack, and it multiplies</b>: 5 stacks = <b>×1.28</b>. Stacks only come from an Attack Mobility Skill, i.e. dashing with Thunder Spike, 10s per stack. Modelled at the 5-stack cap"},
     {src:"pact", html:"generic but not small: Red Umbrella and Azure Gunslinger each pay <b>+48% Attack Damage, +16% Attack Speed</b>, and all three spirits' fate slots add +6% damage apiece"},
   ]},

  {id:"cold", name:"Cold conversion + Frostbite — the enemy-side amp",
   core:"Convert <b>100% Physical → Cold</b> (which double-dips: Physical, Cold, Elemental, Attack and Melee modifiers ALL still apply — dev-confirmed) and every hit builds <b>Frostbite Rating</b> on the enemy. It is not a DoT: each rating point is <b>+1% additional Cold damage TAKEN</b>, a ×2.88 sitting on the boss at this build's caps. <b>The conversion slate is the keystone</b> — every other line in this bundle is dead on an unconverted hit.",
   math:"<span class='mult-tag'>Cold Penetration</span> becomes the computed #1 stat on the whole sheet: <b>+10% pen = +14.3% DPS</b> against a 40%-res boss (the Cold Infiltration slate already strips 10%), and it keeps working below zero resist. Mitigation has a <b>second, independent layer</b> — the enemy's ~30% elemental reduction from armor — so <b>Armor DMG Mitigation Penetration</b> pays the same way there (user-corrected 2026-07-15). More Frostbite Effect/Max-Rating is ~+3.5% per 10.",
   buys:[
     {src:"slate", html:"<b>Physical→Cold conversion</b> — buy this first; nothing below works without it"},
     {src:"slate", html:"the God of Knowledge line — inflict Frostbite on Cold hit, Focus Blessing off Frostbitten targets"},
     {src:"talent", html:"Prophet's Frostbite legendaries — Effect, Cold Infiltration on Frozen, more-vs-Frozen"},
     {src:"skill", html:"Ice Bond on an Activation Medium as the self-applicator"},
     {src:"gear", html:"<b>Max Frostbite Rating</b> — a suffix that can land on any ring (120 base cap +25 from the ring)"},
     {src:"pact", html:"<b>Red Umbrella's Frenzy inflicts the other enemy-side amp</b> — Paralysis, <b>+15% damage taken</b> (×1.15). A 19% chance per hit against a 4s debuff, so across a 0.68s cycle it's effectively permanent on a boss"},
   ],
   needs:"needs the Finisher core — this bundle amplifies the hit, it doesn't create one"},

  {id:"fervor", name:"The Fervor engine — boots + gloves + the sustain bill",
   core:"Three purchases that are <b>one purchase</b>. Dawn Break (Vorax boots) lets you hold Fervor at all; <b>Ghost Slaughter</b> gloves — the corroded roll specifically, <b>+1% additional Attack and Ailment Damage per 1 Fervor Rating</b>, a <i>base effect</i> scaled by Fervor Effect — turn the pool into the largest single multiplier in the build; and a real sustain plan pays the gloves' bill. Any one alone is a dead slot or a death sentence. Fervor's <i>native</i> base effect (+2% Crit Rating per point) rides along for free and powers the Crit bundle below.",
   math:"At the sustained 100-rating cap × this build's <b>+208% Fervor Effect</b>: 100 × 1% × 3.08 = <b>+308% additional damage, a ×4.08</b> on the finisher — computed at <b>+223.6% DPS</b> against the i86 ES gloves it replaces — as much as the whole mainhand ladder from i82 to mirror-worthy combined. Every +% Fervor Effect roll pays twice: this line <i>and</i> the crit line.",
   buys:[
     {src:"gear", html:"Dawn Break 'Have Fervor' (Vorax boots) — without them nothing else in this card exists"},
     {src:"gear", html:"<b>Ghost Slaughter, the corroded roll specifically</b> — the normal roll is +3% per <i>4</i> rating (0.75%/pt), barely a third of the corroded 1%/pt. The variant is the item"},
     {src:"gear", html:"<b>Fervor Effect anywhere</b> — two rings at +60% each, tree +68%, slate +20%. It multiplies this line and the crit line at once"},
     {src:"slate", html:"Ronin's “Fervor Rating = 25% of current on hit” to keep the pool pinned at the 100 cap"},
     {src:"gear", html:"the sustain bill: Eternity belt — kill-fed blessing stacks — replacing the flat-ES belt"},
     {src:"slate", html:"ES Regain / restore-on-Severe-Injury lines; or Resurrection Warcry (zero DPS, up to −60% additional damage taken + 1,160 Life over 4s at L20) in the second warcry slot"},
   ],
   cost:"<b>12% of current Life AND Energy Shield per second</b> while Fervor is active, and the top-rung roll <b>loses Fervor at Low Life</b> — the drain can switch the ×4.08 off mid-fight. That's why sustain is inside this bundle, not a nicety next to it."},

  {id:"crit", name:"Crit — Fervor spent twice",
   core:"Fervor's native base effect is <b>+2% Critical Strike Rating per point</b>, scaled by the same +208% Fervor Effect — at 100 sustained rating that's +616% crit rating, the bulk of the computed <b>69.4% crit chance</b>. Three separate 0.5%-per-rating converters (Ranger node + two slates) then spend the pool a <i>second</i> time as <b>+150% Crit Damage</b>. Chance is <span class='mult-tag'>rating ÷ 100, no enemy-level curve</span>, so every rating source below feeds one pool; crit-damage flavors share one additive pool over the 150% base.",
   math:"<b>69.4% chance / 588.5% crit damage</b> — the two halves are nearly level: +5% chance ≈ +5.6% DPS vs +30% crit damage ≈ +4.7%.",
   buys:[
     {src:"support", html:"Critical Strike Damage Increase on Spectral Slash, in place of a plain damage support"},
     {src:"slate", html:"the Fervor→Crit-Damage converter lines that open in the expanded divinity page"},
     {src:"prism", html:"Crit Rating banded onto the Micro Talents around the still-stance prism"},
     {src:"pact", html:"<b>Red Umbrella and Azure Gunslinger</b> — nodes 4–6 on each are pure Attack Crit Rating (+89% / +88%), the same pool as the weapon's local rating"},
   ],
   needs:"needs the Fervor engine running — without it the chance pool collapses"},

  {id:"warcry", name:"The Warcry layer — free multipliers on a timer",
   core:"Self-cast Warcries (Shockwave, Defensive Buffer) buff damage per enemy affected — all on Activation Mediums, so they fire without a button. The curse-on-hit ring is in this bundle because it <b>frees the skill slot</b> the Warcries move into — and its Timid curse is <b>+39% additional Hit Damage taken</b> that the model does <i>not</i> credit: real boss DPS is ≈<b>×1.39 above every number on this page</b>. Known blind spot, already equipped, not a buy.",
   math:"Shockwave pays <b>5.95% additional finisher damage per enemy × 8 enemies (tree +4 min, slate +4 min) × 1.92 Warcry Effect × 1.20 from “Beast” Roar ≈ a ×2.10 layer</b> on a boss; +10% warcry contribution ≈ +4.8% DPS. Warcry Effect scales every warcry line at once, and “+min enemies affected” floors the stack count on lone bosses.",
   buys:[
     {src:"gear", html:"a Warcry-Effect off-hand (Ninth Apostle's shield, +62%) plus its +Active Skill Level"},
     {src:"gear", html:"the Timid curse-on-hit ring — frees the skill slot and carries the uncounted ×1.39"},
     {src:"talent", html:"Formless / The Brave Warcry nodes"},
     {src:"slate", html:"+min enemies affected by Warcry"},
     {src:"pact", html:"<b>Captain Kitty of the Furious Sea</b> — +12% Warcry Effect from nodes 7–9, and its notable “Beast” Roar adds <b>+20% additional Warcry Skill Effect</b> and self-casts a Warcry. The one pactspirit worth levelling: L2 adds +11% Warcry Cooldown Recovery, L3 a Warcry charge"},
   ]},
];

/* ---------- render: bundle cards ---------- */
{
  const wrap = document.getElementById("bundle-cards")!;
  const srcTag = (s: keyof typeof SRC) => `<span class="sys" style="background:${SRC[s].color}22;color:${SRC[s].color}">${SRC[s].label}</span>`;
  BUNDLES.forEach((b, i) => {
    const card = document.createElement("article");
    card.className = "bundle"; card.id = "b-" + b.id;
    let h = `<div class="bundle-head"><span class="bundle-num">${i+1}</span><h3>${b.name}</h3></div>`
      + `<p class="core">${b.core}</p>`;
    if (b.math) h += `<div class="enabler"><span class="key-lbl">what the math says</span>${b.math}</div>`;
    h += `<ul class="chain">${b.buys.map(x => `<li>${srcTag(x.src)}${x.html}</li>`).join("")}</ul>`;
    if (b.cost) h += `<p class="cost-note">cost · ${b.cost}</p>`;
    if (b.needs) h += `<p class="gate-note">needs · ${b.needs}</p>`;
    card.innerHTML = h;
    wrap.appendChild(card);
  });
}

/* ---------- ladder rungs the model can't price ---------- */
const SIMPLE = [
  {lever:"item level", html:"<b>i82 → i86 is the same affix, one tier better</b> — the ring's +Combo Point suffix is the clearest case: at i86 tier 1 its paired damage roll flips from <span class='add'>−5%</span> to <b>+1–2%</b>. Nothing about the build changes; the numbers just stop being apologetic."},
  {lever:"corrosion", html:"<b>Priceless → mirror-worthy is roll quality, not a new item.</b> The mirror-worthy sword is the priceless sword with +161% Gear Phys instead of +75%, and +4 Attack Skill Level on top. Same base, same suffixes, same rules — which is why the ladder is monotonic once you reach priceless."},
  {lever:"pactspirit", html:"<b>Pactspirit levels are a ladder too, and they're now priced.</b> Captain Kitty is the one worth levelling: its notable is the only <i>cumulative</i> node — L2 added +11% Warcry Cooldown Recovery on top of the L1 “Beast” Roar, and L3 adds a Warcry charge. Red Umbrella and Azure Gunslinger sit at L1 and their notables gain little from levels (Paralysis chance and Pure Heart stacks don't scale with spirit level)."},
];

/* ---------- render: the gear ladder ---------- */
{
  const esc = (t: unknown) => String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;");
  const gainCls = (g: number) => g >= 25 ? "d-hot" : g > 0 ? "d-mid" : "d-none";
  const POOL_COLOR: Record<string, string> = { basic:"#7c8ea0", advanced:"#7fd8e8", ultimate:"#c9a86a" };
  const modRows = (mods: ModRow[]) =>
    `<details class="rung-mods"><summary>stat by stat · ΔDPS ÷ craft cost (basic ×1 · advanced ×3 · ultimate ×6)</summary>`
    + mods.map(m => {
        const col = m.pool ? POOL_COLOR[m.pool] : "#54677a";
        return `<div class="mod-row">`
          + `<span class="src-chip" style="background:${col}22;color:${col}">${m.pool ? `${m.pool} ×${m.cost}` : "unpooled"}</span>`
          + `<span class="mod-text">${esc(m.text).replace(/\n/g," · ")}</span>`
          + `<span class="delta-chip ${m.gain > 0 ? gainCls(m.gain) : "d-none"}">+${m.gain.toFixed(1)}%</span>`
          + `<span class="mod-per">${m.per === null ? "—" : m.per.toFixed(1)}</span></div>`;
      }).join("") + `</details>`;
  const wrap0 = document.getElementById("ladder-list")!;
  LADDER.forEach(row => {
    const card = document.createElement("article");
    card.className = "bundle ladder";
    card.innerHTML = `<div class="bundle-head"><h3>${esc(row.slot)}</h3></div>`
      + (row.note ? `<p class="slot-note">no prices for this slot · ${esc(row.note)}</p>` : "")
      + row.rungs.map((r,i) => {
        const rw = r.rework;
        return `<div class="rung${rw?" rework":""}">`
          + `<span class="rung-step">${i ? "→" : "&nbsp;"}</span>`
          + `<span class="rung-lbl">${esc(r.label)}${rw?` <span class="rework-mark" title="changes how the build works">⚠</span>`:""}</span>`
          + `<span class="rung-name">${r.name===r.label?"":esc(r.name)}</span>`
          + `<span class="delta-chip ${r.gain===null?"d-none":gainCls(r.gain)}">`
          + `${r.gain===null?(r.dps===null?"—":"start"):(r.gain>=0?"+":"")+r.gain.toFixed(1)+"%"}</span>`
          + (rw?`<div class="rung-why">not linear · ${rw.anchor?`<a href="${rw.anchor}">${esc(rw.why)}</a>`:esc(rw.why)}</div>`:"")
          + (r.mods?.length ? modRows(r.mods) : "")
          + `</div>`;
      }).join("");
    wrap0.appendChild(card);
  });

  const wrap = document.getElementById("simple-list")!;
  const card = document.createElement("article");
  card.className = "bundle";
  card.innerHTML = SIMPLE.map(u => `<div class="simple-row"><span class="lever">${u.lever}</span><span>${u.html}</span></div>`).join("");
  wrap.appendChild(card);
}

/* ---------- tabs ---------- */
let CAT_SOURCE = "slate";
{
  const bundleEls = ["#tabbar + .damage-note", "#bundles", "#simple"]
    .map(q => document.querySelector<HTMLElement>(q)).filter(el => el !== null);
  const catalogEl = document.getElementById("catalog-tab")!;
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("#tabbar button")];
  function show(tab: string){
    for (const el of bundleEls) el.hidden = tab !== "bundles";
    catalogEl.hidden = tab === "bundles";
    for (const b of buttons) b.classList.toggle("active", b.dataset.tab === tab);
    if (tab !== "bundles") {
      CAT_SOURCE = tab;
      document.getElementById("cat-title")!.textContent =
        (tab === "slate" ? "Divinity Slate Mods" : "Hero Memory Mods") + " — impact for this build";
      const tiers = [...new Set(CATALOG.filter(r => r.cat === tab).map(r => r.tier))].sort();
      document.getElementById("cat-tier")!.innerHTML =
        `<option value="">all tiers</option>` + tiers.map(t => `<option>${t}</option>`).join("");
      renderCatalog();
    }
  }
  for (const b of buttons) b.addEventListener("click", () => show(b.dataset.tab!));
}

/* ---------- mod catalog ---------- */
const CAT_LIMIT = 400;
function renderCatalog(){
  const q = (document.getElementById("cat-search") as HTMLInputElement).value.trim().toLowerCase();
  const tier = (document.getElementById("cat-tier") as HTMLSelectElement).value;
  const showAll = (document.getElementById("cat-show") as HTMLSelectElement).value === "all";
  const rows = CATALOG.filter(r =>
    r.cat === CAT_SOURCE &&
    (!tier || r.tier === tier) &&
    (showAll || (r.delta !== null && r.delta > 0)) &&
    (!q || (r.text + " " + r.name + " " + r.tier + " " + r.on).toLowerCase().includes(q)));
  const esc = (t: string) => t.replace(/&/g,"&amp;").replace(/</g,"&lt;");
  const chip = (d: number | null) => d === null ? `<span class="delta-chip d-none">—</span>`
    : `<span class="delta-chip ${d>=8?"d-hot":d>=3?"d-mid":"d-low"}">${d>0?"+":""}${d.toFixed(2)}%</span>`;
  const tierChip = (t: string) => {
    const col = /Legendary/.test(t) ? "#c9a86a" : /Medium/.test(t) ? "#7fd8e8"
      : /Micro|Fixed|Random|Special|Revived/.test(t) ? "#7c8ea0" : "#9d85dd";
    return `<span class="src-chip" style="background:${col}22;color:${col}">${esc(t)}</span>`;
  };
  const onCell = (s: string) => {
    const parts = s.split(", ");
    return esc(parts.length > 3 ? parts.slice(0,3).join(", ") + ` +${parts.length-3} more` : s);
  };
  document.getElementById("cat-body")!.innerHTML = rows.slice(0, CAT_LIMIT).map(r =>
    `<tr><td>${chip(r.delta)}${r.cond?` <span class="cond-mark" title="conditional — value is a full-uptime ceiling">◑</span>`:""}</td>`
    + `<td>${tierChip(r.tier)}</td>`
    + `<td><b>${esc(r.name)}</b><br><span style="color:var(--muted)">${esc(r.text)}</span></td>`
    + `<td style="color:var(--muted)" title="${esc(r.on)}">${onCell(r.on)}</td>`
    + `<td class="mult">${esc(r.bucket)}</td></tr>`).join("");
  document.getElementById("cat-count")!.textContent =
    `${rows.length} mods` + (rows.length > CAT_LIMIT ? ` — showing top ${CAT_LIMIT}, refine the search` : "")
    + ` · sorted by ΔDPS at best roll`;
}
for (const id of ["cat-search","cat-tier","cat-show"])
  document.getElementById(id)!.addEventListener("input", renderCatalog);
