import "./style.css";
import ladderData from "./data/ladder.json";
import catalogData from "./data/catalog.json";
import prismData from "./data/prisms.json";
import { esc, escAttr, gainChip, dChip, SRC, srcChip, modRows,
  type LadderRow, type CatalogRow, type Rung } from "./ui";
import { renderLinear } from "./linear";

/* ---------- data written by dmg progression + catalog CLIs ---------- */
const LADDER = ladderData as LadderRow[];
const CATALOG = catalogData as CatalogRow[];

{
  const STAGES = ["start", "i86", "priceless", "mirror-worthy"];
  const slotName = (s: string) => s.replace(/([a-z])([A-Z0-9])/g, "$1 $2").toLowerCase();
  const shortLabel = (r: Rung) => {
    const m = r.label.match(/^(i\d+|priceless|mirror[- ]?worthy)/i);
    return m ? m[1].toLowerCase() : r.label;
  };
  // craft order is only useful on priceless gear. Mirror-worthy is a buy, not a craft path.
  const isPriceless = (r: Rung) => /^priceless/i.test(r.label);
  const wrap = document.getElementById("tree")!;
  wrap.innerHTML =
    `<div class="tree-row tree-head"><span></span>${STAGES.map(s => `<span>${s}</span>`).join("")}</div>`
    + LADDER.map(row => {
      const cells = ["", "", "", ""];
      const crafts: string[] = [];
      row.rungs.forEach((r, i) => {
        const col = Math.min(i, 3);
        const rw = r.rework;
        const lbl = shortLabel(r);
        let name = r.name.replace(/^\(Priceless\):\s*/, "");
        if (name === r.label || name === lbl) name = "";
        cells[col] = `<div class="tnode c${col}${rw ? " rework" : ""}${i ? "" : " first"}">`
          + `<span class="t-lbl">${rw ? `<span class="rework-mark">⚠</span> ` : ""}${esc(lbl)}</span>${gainChip(r, "t-gain")}`
          + (name ? `<span class="t-name">${esc(name)}</span>` : "")
          + (rw ? rw.label.split(" · ").map(l => `<span class="t-branch">${esc(l)}</span>`).join("") : "")
          + (r.rangeLabel ? `<span class="t-branch">${esc(r.rangeLabel)}</span>` : "")
          + (r.note ? `<span class="t-note">${esc(r.note)}</span>` : "")
          + `</div>`;
        if (r.mods?.length && isPriceless(r)) crafts.push(modRows(r.mods, `craft order — ${lbl}`));
      });
      return `<div class="tree-row"><span class="t-slot">${esc(slotName(row.slot))}</span>`
        + cells.map(c => `<div class="tcell">${c}</div>`).join("") + crafts.join("") + `</div>`;
    }).join("");
}

/* ---------- slate + prism progression: the gear tree's visual language ---------- */
interface TNode { lbl: string; chip?: string; name?: string; note?: string; src?: keyof typeof SRC }
const miniTree = (headers: string[], rows: { label: string; nodes: (TNode | null)[] }[]) =>
  `<div class="tree static cols-3">`
  + `<div class="tree-row tree-head"><span></span>${headers.map(h => `<span>${h}</span>`).join("")}</div>`
  + rows.map(row => {
      let first = true;
      return `<div class="tree-row"><span class="t-slot">${row.label}</span>`
        + row.nodes.map((n, i) => {
            if (!n) return `<div class="tcell"></div>`;
            const cls = `tnode c${i}${first ? " first" : ""}`; first = false;
            return `<div class="tcell"><div class="${cls}">`
              + `<span class="t-lbl">${n.src ? srcChip(n.src) : ""}${n.lbl}</span>${n.chip ?? ""}`
              + (n.name ? `<span class="t-name">${n.name}</span>` : "")
              + (n.note ? `<span class="t-note">${n.note}</span>` : "")
              + `</div></div>`;
          }).join("")
        + `</div>`;
    }).join("")
  + `</div>`;

{
  /* catalog text prefixes -> ΔDPS chips; also excluded from the filler list */
  const FIND = {
    frostbite: "Inflicts Frostbite when dealing Hit Cold Damage",
    blessing:  "+100% chance to gain a stack of Focus Blessing",
    warcry:    "+4 to the minimum number of enemies affected by Warcry",
    convert:   "Converts 100% of Physical Damage to Cold",
  };
  const slateChip = (find: string) => {
    const r = CATALOG.find(c => c.cat === "slate" && c.text.startsWith(find));
    return dChip(r?.delta ?? null, r?.cond);
  };
  const rows: { label: string; nodes: (TNode | null)[] }[] = [
    {label:"frostbite", nodes:[
      {src:"talent", lbl:"4 Prophet points", name:"the tree line paying for it today"},
      {lbl:"Frostbite on Cold hit", chip:slateChip(FIND.frostbite), name:"Frostbitten core or Prophet line"},
      {src:"talent", lbl:"Frostbite legendaries",
       name:"respec the freed points into Effect · Cold Infiltration · more-vs-Frozen"}]},
    {label:"focus blessing", nodes:[
      {src:"gear", lbl:"Grace Boots", name:"carry it today"},
      {lbl:"Focus Blessing on Frostbitten hit", chip:slateChip(FIND.blessing), name:"Prophet"},
      {src:"gear", lbl:"boots ladder opens", name:"Grace Boots freed → i86 → Dawn Break"}]},
    {label:"warcry floor", nodes:[
      {src:"talent", lbl:"The Brave nodes", name:"+4 min enemies from the tree talent"},
      {lbl:"+4 min Warcry enemies", chip:slateChip(FIND.warcry),
       name:"The Brave · 1 copy · floor 8 of the 16-stack cap (Formless doubles it) — the inverse copy adds 4–6 more"},
      {src:"skill", lbl:"Shockwave Warcry", name:"onto the freed bar slot"}]},
    {label:"conversion", nodes:[
      {src:"talent", lbl:"Prophet tree conversion", name:"covers it until endgame"},
      {lbl:"Phys→Cold conversion", chip:slateChip(FIND.convert), name:"Prophet · the last buy"},
      {src:"talent", lbl:"Prophet → Ronin respec",
       name:"re-cover conversion · Cold Infiltration on Frozen · Frostbite Effect/Rating first"}]},
  ];

  /* cores + fillers computed live from the catalog (pre-sorted by ΔDPS), never hand-picked.
     God source (`r.on`) is omitted — Pedigree rolls any god's talents, so the chip is noise. */
  const modRow = (r: CatalogRow) =>
    `<div class="mod-row"><span class="mod-text"><b>${esc(r.name)}</b> · ${esc(r.text).replace(/\n/g, " · ")}</span>${dChip(r.delta, r.cond)}</div>`;
  const cores = CATALOG.filter(r =>
    r.cat === "slate" && /Core Talent/.test(r.tier) && r.delta !== null && r.delta > 0).slice(0, 12);
  const planned = Object.values(FIND);
  const rollable = CATALOG.filter(r =>
    r.cat === "slate" && r.delta !== null && r.delta > 0
    && !planned.some(f => r.text.startsWith(f)));
  /* per-tier sections so Mediums/Micros aren't drowned out by Legendary Medium deltas;
     capped to the standouts — the full list lives in the Slate Mods tab */
  const fillerTier = (tier: string, n: number) =>
    rollable.filter(r => r.tier === tier).slice(0, n);
  const fillerSection = (title: string, rows2: CatalogRow[], tail = "") =>
    `<details class="fillers"><summary>${title}</summary>`
    + rows2.map(modRow).join("") + tail + `</details>`;
  /* Deep Space (the endgame Netherrealm plane) is gated on ailment immunity —
     defensive buys, so no ΔDPS; the god is what you shop for */
  const immunities = CATALOG.filter(r => r.cat === "slate" && /^Immune to (Trauma|Wilt|Ignite)/.test(r.text));
  const defRow = (r: CatalogRow) =>
    `<div class="mod-row"><span class="mod-text"><b>${esc(r.on)}</b> · ${esc(r.text).replace(/\n/g, " · ")}</span>`
    + `<span class="delta-chip d-none">defense</span></div>`;
  document.getElementById("slate-plan")!.innerHTML =
    miniTree(["today", "buy on slate", "what it frees"], rows)
    + `<details class="fillers" open><summary>pedigree cores — best Core Talents its slots can roll (3rd slot: Lv.1 only)</summary>`
    + cores.map(modRow).join("") + `</details>`
    + `<details class="fillers" open><summary>deep space — the immunity lines (Legendary Mediums) to hold before farming it</summary>`
    + immunities.map(defRow).join("") + `</details>`
    + fillerSection("fillers · legendary mediums — best rollable lines beyond the plan",
        fillerTier("Legendary Medium Talent", 8),
        `<p class="cost-note">skill-level lines stack across slates — the build runs four +1 Attack Skill Level</p>`)
    + fillerSection("fillers · mediums — standouts for the Medium slots",
        fillerTier("Medium Talent", 5))
    + fillerSection("fillers · micros — standouts for the Micro slots",
        fillerTier("Micro Talent", 5));
}

{
  interface PrismRung { label: string; delta: number | null; note: string | null }
  const split = (s: string): [string, string] => {
    const i = s.indexOf(" — ");
    return i < 0 ? [s, ""] : [s.slice(0, i), s.slice(i + 3)];
  };
  const rows = (prismData as { name: string; rungs: PrismRung[] }[]).map(l => ({
    label: esc(split(l.name)[0]),
    nodes: l.rungs.map((r, j): TNode => {
      const [lbl, name] = split(r.label);
      return {lbl: esc(lbl), name: name ? esc(name) : undefined,
        chip: !j && r.delta === null ? `<span class="delta-chip d-none">start</span>` : dChip(r.delta),
        note: r.note ? esc(r.note) : undefined};
    }),
  }));
  document.getElementById("prism-plan")!.innerHTML = miniTree(["start", "upgrade", "endgame"], rows);
}

/* ---------- tabs ---------- */
/* slate mods are browsed by the slate item they roll on, not by tier —
   each entry lists which mod tiers that purchase can produce (user-verified slot structures) */
const SLATE_ITEMS: Record<string, {label: string; tiers: string[]; note: string}> = {
  corner:    {label: "A Corner of Divinity (max 3)",
              tiers: ["Legendary Medium Talent"],
              note: "legendary slate · rolls 2× Legendary Medium Talent, any god"},
  starlight: {label: "Fallen Starlight (max 3)",
              tiers: ["Micro Talent", "Medium Talent", "Legendary Medium Talent"],
              note: "legendary slate · 3× Micro (3rd can reach Medium / Legendary Medium) + 1× Medium / Legendary Medium, any god — typically lands 1 Legendary Medium + 1 Medium"},
  pedigree:  {label: "Pedigree of Gods (max 1)",
              tiers: ["Micro Talent", "Medium Talent", "Legendary Medium Talent", "Lv.1 Core Talent", "Lv.2 Core Talent"],
              note: "legendary slate · 2× Micro/Medium/Legendary Medium + 1× Medium / Lv.1 Core / Legendary Medium + 1× any Core Talent — typically 2 Micro, 1 Medium-or-better, 1 Core"},
  god:       {label: "God slates (2 fixed + 3 random)",
              tiers: ["Micro Talent", "Medium Talent", "Legendary Medium Talent"],
              note: "Deception / Hunting / Knowledge / Machines / Might / War · no Core Talents here — those are Pedigree-only; the 3 random slots pay per slot type and cap at Micro / Medium / Legendary Medium — aim for 1× Medium + 2× Legendary Medium, or 3× Legendary Medium"},
};
let CAT_SOURCE = "slate";
const SECTIONS: Record<string, string> = {
  progression:"progression", linear:"linear", slate:"catalog-tab", memory:"catalog-tab",
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
    const tierOpts = [...new Set(CATALOG.filter(r => r.cat === tab).map(r => r.tier))].sort()
      .map(t => `<option>${t}</option>`).join("");
    document.getElementById("cat-tier")!.innerHTML = tab === "slate"
      ? `<option value="">all slates</option>`
        + `<optgroup label="by slate item">` + Object.entries(SLATE_ITEMS)
            .map(([k, s]) => `<option value="${k}">${s.label}</option>`).join("") + `</optgroup>`
        + `<optgroup label="by tier">${tierOpts}</optgroup>`
      : `<option value="">all tiers</option>` + tierOpts;
    renderCatalog();
  }
}
for (const b of tabButtons) b.addEventListener("click", () => show(b.dataset.tab!));

/* ---------- skills + pactspirits: the non-gear buys the engines need ---------- */
{
  const rows: { label: string; nodes: (TNode | null)[] }[] = [
    {label:"spectral slash", nodes:[
      {src:"support", lbl:"Legion · Detonation · Critical Strike Damage Increase",
       name:"plus the Quick Decision / Added Phys placeholders — crit runs 77.3% chance / 711.5% crit damage"},
      {src:"support", lbl:"Legion (Noble)", name:"replaces whichever of Quick Decision / Added Phys the Motionless buy leaves"},
      null]},
    {label:"mediums", nodes:[
      {src:"skill", lbl:"3 Activation Mediums", name:"one each for Spectral Slash · the warcries · Ice Bond (the Frostbite self-applicator)"},
      {src:"support", lbl:"Motionless on the Slash medium", name:"replaces Quick Decision or Added Phys"},
      {src:"support", lbl:"CDR on the rest", name:"Elite or Preparation on the warcry medium · Root on the Ice Bond medium"}]},
    {label:"precise auras", nodes:[
      {src:"skill", lbl:"all 4 Precise Auras",
       name:"Cruelty +15% additional Attack · Fearless +8% Melee Attack Speed · Domain Expansion +4% additional Area · "
           +"Frigid Domain +5% additional Cold — all scaled by Aura Effect and skill levels"},
      {src:"support", lbl:"Precise: Disciplined", name:"on Cruelty"},
      {src:"support", lbl:"Precise: Energy Shield", name:"post-Eternity, once the flat-ES belt is gone"}]},
    {label:"skill bar", nodes:[
      null,
      {src:"skill", lbl:"Shockwave Warcry", name:"onto the slot the Timid curse-on-hit ring frees (the ring carries its own ×1.39 Timid layer)"},
      {src:"skill", lbl:"Resurrection Warcry", name:"second warcry slot — −60% additional damage taken + 1,160 Life over 4s (L20) pays the Fervor drain"}]},
    {label:"pactspirit", nodes:[
      {src:"pact", lbl:"Red Umbrella · Azure Gunslinger", name:"+48% Attack Damage +16% Attack Speed each · nodes 4–6 pure Attack Crit Rating (+89% / +88%) · Frenzy inflicts Paralysis (×1.15 on a boss) · Seven Steps ×1.28 at 5 stacks, fed by Thunder Spike dashes"},
      {src:"pact", lbl:"Captain Kitty of the Furious Sea", name:"+12% Warcry Effect · “Beast” Roar: +20% additional Warcry Effect, self-casts"},
      {src:"pact", lbl:"level Captain Kitty", name:"the one pactspirit worth levelling — L2 +11% Warcry Cooldown Recovery, L3 a Warcry charge"}]},
  ];
  document.getElementById("skillpact-plan")!.innerHTML = miniTree(["today", "buy", "endgame"], rows);
}

/* ---------- kismets: pactspirit node replacements (planner more_1 → more_2 sets) ---------- */
{
  const def = `<span class="delta-chip d-none">defense</span>`;
  const rows: { label: string; nodes: (TNode | null)[] }[] = [
    {label:"offense", nodes:[
      {src:"pact", lbl:"2× Peerless · Tiger's Chain",
       name:"the Dual pair is +1 Combo Finisher charge and a fixed 0.3s Combo Sequence reset · Tiger's Chain adds +(4–6)% additional Combo Skill Damage — these three sockets never move"},
      {src:"pact", lbl:"2× Mammoth · Ascetic",
       name:"Mammoth pair self-casts Lv.20 Resurrection Warcry on hit every 3s (the −60% additional-damage-taken layer, hands-free) · Ascetic: +(1.7–1.9)% Double Damage Chance for Finishers per Combo Point consumed"},
      null]},
    {label:"crit fates", nodes:[
      {src:"pact", lbl:"1× Medium + 9× Micro Crit Rating", name:"+(48–60)% / +(24–30)% Crit Strike Rating each — cheap filler for every remaining node"},
      {lbl:"free 3 sockets", name:"the Medium and 2 Micros give way to the buys on this ladder — 7 Micro Crit stay for good"},
      {src:"pact", lbl:"Micro Strength", name:"+(12–15) Strength in the last spare node"}]},
    {label:"defense", nodes:[
      null,
      {lbl:"Medium ES Restored on Defeat", chip:def, name:"restores (0.2–0.4)% of Energy Shield per kill — the mapping sustain layer"},
      {lbl:"Micro Energy Shield", chip:def, name:"+(5–6)% Max Energy Shield"}]},
    {label:"deep space", nodes:[
      null, null,
      {lbl:"2× Micro Numbed Mitigation", chip:def, name:"−(45–55)% Numbed Effect received each — near-immunity, same role as the slate immunity lines above"}]},
  ];
  document.getElementById("kismet-plan")!.innerHTML = miniTree(["today", "buy", "endgame"], rows);
}

/* ---------- mod catalog ---------- */
const CAT_LIMIT = 400;
function renderCatalog(){
  const q = (document.getElementById("cat-search") as HTMLInputElement).value.trim().toLowerCase();
  const sel = (document.getElementById("cat-tier") as HTMLSelectElement).value;
  const slate = CAT_SOURCE === "slate" ? SLATE_ITEMS[sel] : undefined;
  document.getElementById("cat-note")!.textContent = slate?.note ?? "";
  const showAll = (document.getElementById("cat-show") as HTMLSelectElement).value === "all";
  const rows = CATALOG.filter(r =>
    r.cat === CAT_SOURCE &&
    (!sel || (slate ? slate.tiers.includes(r.tier) : r.tier === sel)) &&
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

renderLinear(document.getElementById("linear-plan")!, document.getElementById("linear-watchlist")!);
