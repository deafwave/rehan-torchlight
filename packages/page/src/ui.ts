/* shared render helpers — used by main.ts (progression + catalog) and linear.ts */

export interface Rework { label: string }
export interface ModRow {
  text: string; pool: string | null; cost: number | null;
  gain: number; per: number | null; vs: string | null;
}
export interface Rung {
  label: string; name: string; rarity: string | null;
  dps: number | null; gain: number | null; gainTop: number | null;
  gainNote: string | null;
  rangeNote: string | null; rangeLabel: string | null;
  linear: boolean; note: string | null; rework: Rework | null;
  mods: ModRow[] | null;
}
export interface LadderRow { slot: string; rungs: Rung[] }
export interface CatalogRow {
  cat: string; tier: string; name: string; text: string; on: string;
  bucket: string; delta: number | null; cond: boolean;
}

export const esc = (t: unknown) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
export const escAttr = (t: string) => esc(t).replace(/"/g, "&quot;");

/* Talent panels → the god you shop for. Catalog `on` is the panel the talent lives on
   (Prophet, The Brave, …); god slates / trade filters are by god. Identity maps keep
   the six main gods + New God as-is. */
const TREE_GOD: Record<string, string> = {
  "God of Might": "God of Might",
  "The Brave": "God of Might",
  "Onslaughter": "God of Might",
  "Warlord": "God of Might",
  "Warrior": "God of Might",
  "Goddess of Knowledge": "Goddess of Knowledge",
  "Prophet": "Goddess of Knowledge",
  "Magister": "Goddess of Knowledge",
  "Arcanist": "Goddess of Knowledge",
  "Elementalist": "Goddess of Knowledge",
  "Goddess of Hunting": "Goddess of Hunting",
  "Marksman": "Goddess of Hunting",
  "Bladerunner": "Goddess of Hunting",
  "Druid": "Goddess of Hunting",
  "Assassin": "Goddess of Hunting",
  "God of War": "God of War",
  "Shadowdancer": "God of War",
  "Ronin": "God of War",
  "Ranger": "God of War",
  "Sentinel": "God of War",
  "God of Machines": "God of Machines",
  "Machinist": "God of Machines",
  "Steel Vanguard": "God of Machines",
  "Alchemist": "God of Machines",
  "Artisan": "God of Machines",
  "Goddess of Deception": "Goddess of Deception",
  "Shadowmaster": "Goddess of Deception",
  "Psychic": "Goddess of Deception",
  "Warlock": "Goddess of Deception",
  "Lich": "Goddess of Deception",
  "New God": "New God",
};
/** Map a catalog `on` (one panel, or ", "-joined panels) to the god(s) you shop. */
export const godOf = (on: string): string => {
  const gods = on.split(", ").map(t => TREE_GOD[t] ?? t);
  return [...new Set(gods)].join(", ");
};
const gainCls = (g: number) => g >= 25 ? "d-hot" : g > 0 ? "d-mid" : g < 0 ? "d-neg" : "d-none";
/* "+20 → +84.5%" = the rung's rangeNote, e.g. entry roll → fully crafted */
export const gainChip = (r: {gain: number | null; gainTop: number | null; gainNote?: string | null; rangeNote?: string | null}, cls = ""): string => {
  if (r.gain === null) return "";
  const f = (g: number) => (g >= 0 ? "+" : "−") + Math.abs(g).toFixed(1);
  const top = r.gainTop !== null && r.gainTop !== r.gain;
  return `<span class="${cls} ${gainCls(r.gainTop ?? r.gain)}"`
    + (top && r.rangeNote ? ` title="${escAttr(r.rangeNote)}"` : "")
    + `>${top ? `${f(r.gain)} → ${f(r.gainTop!)}` : f(r.gain)}%${r.gainNote ? ` (${esc(r.gainNote)})` : ""}</span>`;
};

/* enabler = load-bearing but already assumed in the snapshot, so no marginal number */
export const dChip = (d: number | null, cond = false) =>
  (d === null ? `<span class="delta-chip d-none">enabler</span>`
    : `<span class="delta-chip ${d >= 8 ? "d-hot" : d >= 3 ? "d-mid" : "d-low"}">+${d.toFixed(2)}%</span>`)
  + (cond ? ` <span class="cond-mark" title="conditional — value is a full-uptime ceiling">◑</span>` : "");

/* src = where a purchase comes from (little tag) */
export const SRC = {
  gear:    {label:"gear",    color:"#c9a86a"},
  skill:   {label:"skill",   color:"#d7e2ec"},
  support: {label:"support", color:"#8fb8c9"},
  prism:   {label:"prism",   color:"#7fd8e8"},
  talent:  {label:"talent",  color:"#9d85dd"},
  slate:   {label:"slate",   color:"#cfc3a8"},
  pact:    {label:"pactspirit", color:"#79c8a6"},
};
export const srcChip = (s: keyof typeof SRC) =>
  `<span class="src-chip" style="background:${SRC[s].color}22;color:${SRC[s].color}">${SRC[s].label}</span>`;

const POOL_COLOR: Record<string, string> = { basic:"#7c8ea0", advanced:"#7fd8e8", ultimate:"#c9a86a" };
/* rows arrive pre-sorted by full-line ΔDPS (`gain`); pool cost is a chip only */
export const modRows = (mods: ModRow[], summary: string) =>
  `<details class="rung-mods"><summary>${esc(summary)}</summary>`
  + mods.map(m => {
      const col = m.pool ? POOL_COLOR[m.pool] : "#54677a";
      return `<div class="mod-row">`
        + `<span class="src-chip" style="background:${col}22;color:${col}">${m.pool ? `${m.pool} ×${m.cost}` : "unpooled"}</span>`
        + `<span class="mod-text">${esc(m.text).replace(/\n/g," · ")}`
        + `<span class="mod-vs">vs ${m.vs ? esc(m.vs).replace(/\n/g," · ") : "an empty slot"}</span></span>`
        + `<span class="delta-chip ${m.gain > 0 ? gainCls(m.gain) : "d-none"}">+${m.gain.toFixed(1)}%</span></div>`;
    }).join("") + `</details>`;
