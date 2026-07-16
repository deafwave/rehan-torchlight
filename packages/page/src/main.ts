import "./style.css";
import ladderData from "./data/ladder.json";
import catalogData from "./data/catalog.json";

/* ---------- data written by dmg progression + catalog CLIs ---------- */
interface Rework { anchor: string | null; label: string; why: string }
interface ModRow {
  text: string; pool: string | null; cost: number | null;
  gain: number; per: number | null; vs: string | null;
}
interface Rung {
  label: string; name: string; rarity: string | null;
  dps: number | null; gain: number | null; gainTop: number | null;
  gainNote: string | null;
  rangeNote: string | null; rangeAnchor: string | null;
  linear: boolean; note: string | null; rework: Rework | null;
  mods: ModRow[] | null;
}
interface LadderRow { slot: string; rungs: Rung[] }
interface CatalogRow {
  cat: string; tier: string; name: string; text: string; on: string;
  bucket: string; delta: number | null; cond: boolean;
}
const LADDER = ladderData as LadderRow[];
const CATALOG = catalogData as CatalogRow[];

const esc = (t: unknown) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const escAttr = (t: string) => esc(t).replace(/"/g, "&quot;");
const gainCls = (g: number) => g >= 25 ? "d-hot" : g > 0 ? "d-mid" : g < 0 ? "d-neg" : "d-none";
/* "+20 → +84.5%" = the rung's rangeNote, e.g. entry roll → fully crafted */
const gainChip = (r: {gain: number | null; gainTop: number | null; gainNote?: string | null; rangeNote?: string | null}, cls = ""): string => {
  if (r.gain === null) return "";
  const f = (g: number) => (g >= 0 ? "+" : "−") + Math.abs(g).toFixed(1);
  const top = r.gainTop !== null && r.gainTop !== r.gain;
  return `<span class="${cls} ${gainCls(r.gainTop ?? r.gain)}"`
    + (top && r.rangeNote ? ` title="${escAttr(r.rangeNote)}"` : "")
    + `>${top ? `${f(r.gain)} → ${f(r.gainTop!)}` : f(r.gain)}%${r.gainNote ? ` (${esc(r.gainNote)})` : ""}</span>`;
};

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
   `needs` the one hard prerequisite, `cost` the bill it comes with.
   `slots` = which gear slots' popups list this bundle (hand-mapped from the buys). */
interface Bundle {
  id: string; name: string; core: string; math?: string;
  buys: Buy[]; needs?: string; cost?: string; slots: string[];
}

/* ---------- the bundles, in the order the engines come online ---------- */
const BUNDLES: Bundle[] = [
  {id:"finisher", name:"The Finisher core — buy points, not percent",
   core:"One skill carries the bar: <b>Combo Finisher = 127% weapon Attack Damage × (1 + 8 Combo Points × 110% Amplification)</b>, cast <b>twice per sequence</b> by Heart of Animitta's +1 Finisher charge — this card is every point, charge and amp source in the build.",
   math:"<b>+1 Combo Point = +21.0% DPS — the #1 buy on the sheet</b> · +10% Finisher Amplification = +7.8% · <b>Combo Damage Enhancement is a different stat</b>: all Enhancement affixes sum (+141% here) and multiply all combo damage once.",
   buys:[
     {src:"gear", html:"<b>Heart of Animitta — +1 Finisher charge = a second full-power finisher every sequence</b> (both consume the same 8 points), plus +80% Finisher Amplification"},
     {src:"gear", html:"<b>+1 Combo Points gained from Combo Starters</b> — a suffix on <i>either</i> ring; with both rings + Recuperation each starter grants 4 points"},
     {src:"support", html:"Legion (clones) and Detonation on Spectral Slash; any Activation Medium so it self-casts"},
     {src:"pact", html:"<b>Azure Gunslinger's Seven Steps</b> — <b>+5% additional Attack Damage per stack, multiplicative</b>: 5 stacks = ×1.28, fed by dashing with Thunder Spike (10s per stack), modelled at cap"},
     {src:"pact", html:"Red Umbrella and Azure Gunslinger each pay <b>+48% Attack Damage, +16% Attack Speed</b>, plus +6% damage per fate slot"},
   ],
   slots:["necklace","ring1","ring2","mainHand"]},

  {id:"cold", name:"Cold conversion + Frostbite — the enemy-side amp",
   core:"Convert <b>100% Physical → Cold</b> (Physical, Cold, Elemental, Attack and Melee modifiers all still apply — dev-confirmed), then every hit stacks <b>Frostbite Rating</b>: +1% additional Cold damage <i>taken</i> per point, a ×2.88 at this build's caps — <b>the conversion slate first; everything else here is dead without it</b>.",
   math:"<b>+10% Armor Mitigation Penetration = +11.0% DPS</b> · +10% Cold Penetration = +9.0% · +10% on an enemy-taken layer (Paralysis, Timid) = +8.7% · +10 Frostbite Effect/Max-Rating ≈ +3.5%.",
   buys:[
     {src:"slate", html:"<b>Physical→Cold conversion</b> — buy this first; nothing below works without it"},
     {src:"slate", html:"the God of Knowledge line — inflict Frostbite on Cold hit, Focus Blessing off Frostbitten targets"},
     {src:"talent", html:"Prophet's Frostbite legendaries — Effect, Cold Infiltration on Frozen, more-vs-Frozen"},
     {src:"skill", html:"Ice Bond on an Activation Medium as the self-applicator"},
     {src:"gear", html:"<b>Max Frostbite Rating</b> — a suffix that can land on any ring (120 base cap +25 from the ring)"},
     {src:"pact", html:"<b>Red Umbrella's Frenzy inflicts Paralysis</b> — +15% damage taken (×1.15), effectively permanent on a boss at 19% chance per hit vs a 4s debuff"},
   ],
   needs:"needs the Finisher core — this bundle amplifies the hit, it doesn't create one",
   slots:["ring1","ring2","boots"]},

  {id:"fervor", name:"The Fervor engine — boots + gloves + the sustain bill",
   core:"Three purchases that are <b>one purchase</b>: Dawn Break boots hold Fervor at all, <b>corroded Ghost Slaughter</b> gloves (+1% additional damage per rating, scaled by +208% Fervor Effect) turn the pool into a <b>+465% layer</b> at the tree change's 130 rating, and a real sustain plan pays the bill — any one alone is a dead slot or a death sentence.",
   math:"gloves rung <b>+175.9%</b> · boots <b>+107.3% alone → +153.5%</b> with the tree change below · every +% Fervor Effect roll pays this line <i>and</i> the crit line at once.",
   buys:[
     {src:"gear", html:"Dawn Break 'Have Fervor' (Vorax boots) — nothing else in this card exists without them; they also pay +1% additional damage per 2 rating and +78% Crit Damage"},
     {src:"gear", html:"<b>Ghost Slaughter, the corroded roll specifically</b> — the normal roll is 0.75%/pt, a third of the corroded 1%/pt; the variant is the item"},
     {src:"gear", html:"<b>Fervor Effect anywhere</b> — two rings at +60% each, tree +68%, slate +20%"},
     {src:"gear", html:"the sustain bill: Eternity belt — kill-fed blessing stacks — replacing the flat-ES belt"},
     {src:"slate", html:"ES Regain / restore-on-Severe-Injury lines; or Resurrection Warcry (−60% additional damage taken + 1,160 Life over 4s at L20) in the second warcry slot"},
   ],
   cost:"<b>12% of current Life AND Energy Shield per second</b> while Fervor is active, and the top-rung roll loses Fervor at Low Life — sustain is inside this bundle, not next to it",
   slots:["boots","gloves","belt","ring1","ring2"]},

  {id:"fervor-tree", name:"The Fervor tree change — fix the rating at 130",
   core:"One respec the boots want: the Ranger prism slot takes <b>Unmatched Valor — 130 point(s) of fixed Fervor Rating</b>, over the normal 100 cap and immune to Centralize's gain/consume swings.",
   math:"the Dawn Break rung prices <b>+107.3% alone → +153.5% with this change</b>, and the same 130 rating feeds the +195% Crit Damage in the crit card.",
   buys:[
     {src:"prism", html:"<b>Unmatched Valor</b> on the Ranger tree — replaces the core talent with a fixed 130 Fervor Rating"},
     {src:"talent", html:"the Ranger legendary node plus two slate copies of <b>0.5% Critical Strike Damage per Fervor Rating</b> — +195% Crit Damage at 130"},
     {src:"talent", html:"<b>Centralize becomes a no-op</b> once the rating is fixed — its notable pick is a respec candidate"},
   ],
   needs:"needs Dawn Break holding Fervor — a fixed rating with no Fervor source is nothing",
   slots:["boots"]},

  {id:"crit", name:"Crit — Fervor spent twice",
   core:"Fervor's native <b>+2% Crit Rating per point</b> at the fixed 130 rating (scaled by the same +208% Fervor Effect) drives the computed <b>77.3% crit chance</b>, and three 0.5%-per-rating converters spend the pool a <i>second</i> time as <b>+195% Crit Damage</b>.",
   math:"<b>77.3% chance / 711.5% crit damage</b> · +5% chance ≈ +5.7% DPS vs +30% crit damage ≈ +4.1%.",
   buys:[
     {src:"support", html:"Critical Strike Damage Increase on Spectral Slash, in place of a plain damage support"},
     {src:"slate", html:"the Fervor→Crit-Damage converter lines that open in the expanded divinity page"},
     {src:"prism", html:"Crit Rating banded onto the Micro Talents around the still-stance prism"},
     {src:"pact", html:"<b>Red Umbrella and Azure Gunslinger</b> — nodes 4–6 on each are pure Attack Crit Rating (+89% / +88%)"},
   ],
   needs:"needs the Fervor engine running — without it the chance pool collapses",
   slots:["boots","mainHand"]},

  {id:"warcry", name:"The Warcry layer — free multipliers on a timer",
   core:"Self-cast Warcries buff damage per enemy affected — <b>≈ a ×2.10 layer on a boss</b> — and the curse-on-hit ring frees their skill slot while carrying its own <b>×1.39 Timid layer</b> (+39% additional Hit Damage taken, permanent on a boss).",
   math:"5.95% per enemy × 8 enemies × 1.92 Warcry Effect × 1.20 “Beast” Roar ≈ ×2.10 · +10% warcry contribution ≈ +4.8% DPS.",
   buys:[
     {src:"gear", html:"a Warcry-Effect off-hand (Ninth Apostle's shield, +62%) plus its +Active Skill Level"},
     {src:"gear", html:"the Timid curse-on-hit ring — frees the skill slot and carries the ×1.39 Timid layer"},
     {src:"talent", html:"Formless / The Brave Warcry nodes"},
     {src:"slate", html:"+min enemies affected by Warcry — floors the stack count on lone bosses"},
     {src:"pact", html:"<b>Captain Kitty of the Furious Sea</b> — +12% Warcry Effect, “Beast” Roar (+20% additional Warcry Effect, self-casts); the one pactspirit worth levelling"},
   ],
   slots:["offHand","ring1"]},
];

/* ---------- render: bundle cards ---------- */
{
  const wrap = document.getElementById("bundle-cards")!;
  const srcTag = (s: keyof typeof SRC) => `<span class="sys" style="background:${SRC[s].color}22;color:${SRC[s].color}">${SRC[s].label}</span>`;
  BUNDLES.forEach((b, i) => {
    const card = document.createElement("article");
    card.className = "bundle"; card.id = "b-" + b.id;
    card.dataset.slots = b.slots.join(" ");
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

/* ---------- render: the progression tree ---------- */
{
  const STAGES = ["start", "i86", "priceless", "mirror-worthy"];
  const slotName = (s: string) => s.replace(/([a-z])([A-Z0-9])/g, "$1 $2").toLowerCase();
  const shortLabel = (r: Rung) => {
    const m = r.label.match(/^(i\d+|priceless|mirror[- ]?worthy)/i);
    return m ? m[1].toLowerCase() : r.label;
  };
  const wrap = document.getElementById("tree")!;
  wrap.innerHTML =
    `<div class="tree-row tree-head"><span></span>${STAGES.map(s => `<span>${s}</span>`).join("")}</div>`
    + LADDER.map(row => {
      const cells = ["", "", "", ""];
      row.rungs.forEach((r, i) => {
        const col = Math.min(i, 3);
        const rw = r.rework;
        const lbl = shortLabel(r);
        let name = r.name.replace(/^\(Priceless\):\s*/, "");
        if (name === r.label || name === lbl) name = "";
        const tip = rw?.why ?? r.note;
        cells[col] = `<div class="tnode c${col}${rw ? " rework" : ""}${i ? "" : " first"}"${tip ? ` title="${escAttr(tip)}"` : ""}>`
          + `<span class="t-lbl">${rw ? `<span class="rework-mark">⚠</span> ` : ""}${esc(lbl)}</span>${gainChip(r, "t-gain")}`
          + (name ? `<span class="t-name">${esc(name)}</span>` : "")
          + (rw ? `<span class="t-branch">${esc(rw.label)}</span>` : "")
          + (r.rangeAnchor ? `<span class="t-branch">+ tree change</span>` : "")
          + `</div>`;
      });
      return `<div class="tree-row" data-slot="${escAttr(row.slot)}" role="button" tabindex="0" `
        + `aria-label="${escAttr(slotName(row.slot))} — upgrade path and bundles">`
        + `<span class="t-slot">${esc(slotName(row.slot))}</span>`
        + cells.map(c => `<div class="tcell">${c}</div>`).join("") + `</div>`;
    }).join("");
}

/* ---------- render: the gear ladder (upgrades tab) ---------- */
const SIMPLE = [
  {lever:"item level", html:"<b>i82 → i86 is the same affix, one tier better</b> — the ring's +Combo Point suffix flips its paired damage roll from <span class='add'>−5%</span> to <b>+1–2%</b>."},
  {lever:"corrosion", html:"<b>Mirror-worthy is the priceless item with better rolls</b> — +161% Gear Phys instead of +75%, +4 Attack Skill Level on top — roll quality, not a new item."},
  {lever:"pactspirit", html:"<b>Captain Kitty is the one pactspirit worth levelling</b> — its notable is the only cumulative node (L2 +11% Warcry Cooldown Recovery, L3 a Warcry charge)."},
];

{
  const POOL_COLOR: Record<string, string> = { basic:"#7c8ea0", advanced:"#7fd8e8", ultimate:"#c9a86a" };
  /* rows arrive pre-sorted by ΔDPS-per-ember (`per`); the number itself stays hidden */
  const modRows = (mods: ModRow[]) =>
    `<details class="rung-mods"><summary>craft order</summary>`
    + mods.map(m => {
        const col = m.pool ? POOL_COLOR[m.pool] : "#54677a";
        return `<div class="mod-row">`
          + `<span class="src-chip" style="background:${col}22;color:${col}">${m.pool ? `${m.pool} ×${m.cost}` : "unpooled"}</span>`
          + `<span class="mod-text">${esc(m.text).replace(/\n/g," · ")}`
          + `<span class="mod-vs">vs ${m.vs ? esc(m.vs).replace(/\n/g," · ") : "an empty slot (bottom tier)"}</span></span>`
          + `<span class="delta-chip ${m.gain > 0 ? gainCls(m.gain) : "d-none"}">+${m.gain.toFixed(1)}%</span></div>`;
      }).join("") + `</details>`;
  const wrap0 = document.getElementById("ladder-list")!;
  LADDER.forEach(row => {
    const card = document.createElement("article");
    card.className = "bundle ladder";
    card.id = "l-" + row.slot;
    card.innerHTML = `<div class="bundle-head"><h3>${esc(row.slot)}</h3></div>`
      + row.rungs.map((r,i) => {
        const rw = r.rework;
        return `<div class="rung${rw?" rework":""}">`
          + `<span class="rung-step">${i ? "→" : "&nbsp;"}</span>`
          + `<span class="rung-lbl">${esc(r.label)}${rw?` <span class="rework-mark" title="needs something outside this slot first">⚠</span>`:""}</span>`
          + `<span class="rung-name">${r.name===r.label?"":esc(r.name)}</span>`
          + (r.gain===null ? `<span class="delta-chip d-none">start</span>` : gainChip(r, "delta-chip"))
          + (rw?`<div class="rung-why">${rw.anchor?`<a href="${rw.anchor}" data-goto="bundles">${esc(rw.why)}</a>`:esc(rw.why)}</div>`:"")
          + (r.note?`<div class="rung-why">${esc(r.note)}</div>`:"")
          + (r.rangeAnchor?`<div class="rung-why"><a href="${r.rangeAnchor}" data-goto="bundles">${esc(r.rangeNote ?? "")} — see the tree-change bundle</a></div>`:"")
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
const SECTIONS: Record<string, string> = {
  progression:"progression", slate:"catalog-tab", memory:"catalog-tab",
};
const tabButtons = [...document.querySelectorAll<HTMLButtonElement>("#tabbar button")];
function show(tab: string){
  for (const id of new Set(Object.values(SECTIONS)))
    document.getElementById(id)!.hidden = id !== SECTIONS[tab];
  for (const b of tabButtons) b.classList.toggle("active", b.dataset.tab === tab);
  if (tab === "slate" || tab === "memory") {
    CAT_SOURCE = tab;
    document.getElementById("cat-title")!.textContent =
      (tab === "slate" ? "Divinity Slate Mods" : "Hero Memory Mods") + " — impact for this build";
    const tiers = [...new Set(CATALOG.filter(r => r.cat === tab).map(r => r.tier))].sort();
    document.getElementById("cat-tier")!.innerHTML =
      `<option value="">all tiers</option>` + tiers.map(t => `<option>${t}</option>`).join("");
    renderCatalog();
  }
}
for (const b of tabButtons) b.addEventListener("click", () => show(b.dataset.tab!));

/* ---------- item detail popup (tree node → its ladder + bundles) ---------- */
const detail = document.getElementById("detail") as HTMLDialogElement;
function openSlot(slot: string){
  const row = LADDER.find(r => r.slot === slot);
  if (!row) return;
  const related = new Set(BUNDLES.filter(b => b.slots.includes(slot)).map(b => "#b-" + b.id));
  for (const r of row.rungs) {
    if (r.rework?.anchor) related.add(r.rework.anchor);
    if (r.rangeAnchor) related.add(r.rangeAnchor);
  }
  for (const card of document.querySelectorAll<HTMLElement>("#ladder-list > article"))
    card.hidden = card.id !== "l-" + slot;
  for (const card of document.querySelectorAll<HTMLElement>("#bundle-cards > article"))
    card.hidden = !related.has("#" + card.id);
  document.getElementById("bundles")!.hidden = related.size === 0;
  detail.showModal();
  detail.scrollTop = 0;
}
const tree = document.getElementById("tree")!;
tree.addEventListener("click", e => {
  const node = (e.target as HTMLElement).closest<HTMLElement>("[data-slot]");
  if (node?.dataset.slot) openSlot(node.dataset.slot);
});
tree.addEventListener("keydown", e => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const node = (e.target as HTMLElement).closest<HTMLElement>("[data-slot]");
  if (node?.dataset.slot) {
    e.preventDefault();
    openSlot(node.dataset.slot);
  }
});
document.getElementById("detail-close")!.addEventListener("click", () => detail.close());
detail.addEventListener("click", e => { if (e.target === detail) detail.close(); });

/* rework links (ladder rung / tree node → its bundle card in the dialog) */
document.addEventListener("click", e => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[data-goto]");
  if (!a) return;
  e.preventDefault();
  const target = document.querySelector<HTMLElement>(a.getAttribute("href")!);
  if (!target) return;
  target.hidden = false;
  document.getElementById("bundles")!.hidden = false;
  if (!detail.open) detail.showModal();
  target.scrollIntoView(matchMedia("(prefers-reduced-motion: reduce)").matches
    ? undefined : {behavior:"smooth"});
});

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
    + `<td style="color:var(--muted)" title="${escAttr(r.on)}">${onCell(r.on)}</td>`
    + `<td class="mult">${esc(r.bucket)}</td></tr>`).join("");
  document.getElementById("cat-count")!.textContent =
    `${rows.length} mods` + (rows.length > CAT_LIMIT ? ` — showing top ${CAT_LIMIT}, refine the search` : "")
    + ` · sorted by ΔDPS at best roll`;
}
for (const id of ["cat-search","cat-tier","cat-show"])
  document.getElementById(id)!.addEventListener("input", renderCatalog);
