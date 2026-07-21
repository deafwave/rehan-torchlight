import { cycleDps, additionalBonusPct, type Snapshot } from "@rehan/dmg/damageModel";
import { supportValueAt, type SupportGem, type SupportLine } from "@rehan/dmg/supports";
import { renderBreakdown } from "./breakdown";
import snapshotData from "./data/snapshot.json";

/* The DPS Calc tab runs the real damage model (linked from @rehan/dmg, no reimplementation)
   on an editable copy of the 150b-setup snapshot, so the output vets the exact formula the
   rest of the site uses. Only the 8 runtime sections are shown — cycleDps ignores _derived. */

const SECTIONS: [keyof Snapshot, string][] = [
  ["base", "Base / weapon"],
  ["increased", "Increased damage (summed pool)"],
  ["additional", "Additional damage (each its own ×(1+v))"],
  ["enemy_taken", "Enemy-taken multipliers"],
  ["crit", "Crit"],
  ["penetration", "Penetration"],
  ["enemy", "Enemy defences"],
  ["rotation", "Rotation"],
  ["deterioration", "Deterioration (Ruinous Star / Obliterate)"],
];

const REHAN_DEFAULTS = snapshotData as unknown as Snapshot;
const label = (k: string) => k.replace(/_/g, " ");
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function readForm(root: HTMLElement, defaults: Snapshot): Snapshot {
  const s = structuredClone(defaults);
  for (const inp of root.querySelectorAll<HTMLInputElement>("input[data-sec]")) {
    const sec = inp.dataset.sec as keyof Snapshot;
    const v = parseFloat(inp.value);
    (s[sec] as Record<string, number>)[inp.dataset.key!] = Number.isFinite(v) ? v : 0;
  }
  return s;
}

const lineValue = (l: SupportLine, lvl: number) => (l.anchors ? supportValueAt(l.anchors, lvl) : 0);
const fmtV = (n: number) => (Math.round(n * 10) / 10).toString();

function lineText(l: SupportLine, lvl: number): string {
  return l.text
    .replace("{v}", fmtV(lineValue(l, lvl)))
    .replace("{v2}", l.anchors2 ? fmtV(supportValueAt(l.anchors2, lvl)) : "");
}

/* Checked support gems feed the snapshot through existing buckets:
   "additional" lines compound into additional.supports, "attack_speed" sums into
   rotation.attack_speed_inc_pct, "added_flat" min–max joins the typed-elemental
   flat bucket (flat_added_cold_*, which the model never re-gains as phys). */
function applySupports(root: HTMLElement, s: Snapshot, sups: SupportGem[]): void {
  const lvlInp = root.querySelector<HTMLInputElement>("#sup-level");
  if (!lvlInp) return;
  const lvl = parseFloat(lvlInp.value) || 20;
  let prod = 1, as = 0, fmin = 0, fmax = 0;
  for (const inp of root.querySelectorAll<HTMLInputElement>("input[data-sup-line]:checked")) {
    const [gi, li] = inp.dataset.supLine!.split(":").map(Number);
    if (!root.querySelector<HTMLInputElement>(`input[data-sup="${gi}"]`)!.checked) continue;
    const l = sups[gi].lines[li];
    const v = lineValue(l, lvl);
    if (l.kind === "additional") prod *= 1 + v / 100;
    else if (l.kind === "attack_speed") as += v;
    else if (l.kind === "added_flat") { fmin += v; fmax += supportValueAt(l.anchors2!, lvl); }
  }
  s.additional.supports = (prod - 1) * 100;
  s.rotation.attack_speed_inc_pct += as;
  s.base.flat_added_cold_min += fmin;
  s.base.flat_added_cold_max += fmax;
}

function supportsPanel(sups: SupportGem[]): string {
  const gems = sups.map((g, gi) => {
    const lines = g.lines.map((l, li) => {
      const box = l.kind === "info" ? ""
        : `<input type="checkbox" data-sup-line="${gi}:${li}"${l.on ? " checked" : ""}>`;
      return `<label class="sup-line${l.kind === "info" ? " sup-info" : ""}">${box}`
           + `<span data-sup-text="${gi}:${li}"></span></label>`;
    }).join("");
    return `<details class="sup-gem"><summary><b>${g.name}</b>`
         + ` <small>${g.tags.join(", ")} · ×${g.mana_mult_pct / 100} mana</small></summary>`
         + `<label class="sup-line"><input type="checkbox" data-sup="${gi}"> enabled`
         + ` — <small>${g.requires}</small></label>${lines}</details>`;
  }).join("");
  return `<fieldset class="calc-group calc-supports">`
       + `<legend>Support skills (SS13) — pick up to 5</legend>`
       + `<label class="calc-field"><span>gem level</span>`
       + `<input type="number" id="sup-level" value="20" min="1" max="41" step="1"></label>`
       + `${gems}</fieldset>`;
}

function recompute(root: HTMLElement, defaults: Snapshot, supports: SupportGem[]): void {
  const s = readForm(root, defaults);
  applySupports(root, s, supports);
  const lvl = parseFloat(root.querySelector<HTMLInputElement>("#sup-level")?.value ?? "") || 20;
  for (const span of root.querySelectorAll<HTMLElement>("[data-sup-text]")) {
    const [gi, li] = (span.dataset.supText as string).split(":").map(Number);
    span.textContent = lineText(supports[gi].lines[li], lvl);
  }
  const { cycle_time, deterioration_dps, trace } = cycleDps(s);
  root.querySelector("#calc-breakdown")!.innerHTML = renderBreakdown(trace);
  root.querySelector("#calc-cycle")!.textContent = `${cycle_time.toFixed(3)}s cycle`
    + (deterioration_dps > 0 ? ` · ${fmt(deterioration_dps)} from Deterioration` : "");
  root.querySelector("#calc-addl")!.textContent = `${additionalBonusPct(s).toFixed(1)}%`;
}

// labelOverrides renames model keys per build — the elemental-res slot is `cold_res_pct`
// from Rehan, but reads as fire res on the HoA (bing) page.
export function renderCalc(root: HTMLElement, defaults: Snapshot = REHAN_DEFAULTS,
                          labelOverrides: Record<string, string> = {},
                          supports: SupportGem[] = []): void {
  // deterioration only exists on builds with an Obliterate source (bing)
  const groups = SECTIONS.filter(([sec]) => defaults[sec]).map(([sec, title]) => {
    const fields = Object.entries(defaults[sec] as Record<string, number>)
      .map(([k, v]) =>
        `<label class="calc-field"><span>${labelOverrides[k] ?? label(k)}</span>`
        + `<input type="number" step="any" data-sec="${sec}" data-key="${k}" value="${v}"></label>`)
      .join("");
    return `<fieldset class="calc-group"><legend>${title}</legend>${fields}</fieldset>`;
  }).join("");

  root.innerHTML =
    `<div class="calc-out">`
    + `<div class="calc-stat calc-stat--wide"><div id="calc-breakdown" class="calc-breakdown"></div>`
    + `<span class="calc-cap"><span id="calc-cycle"></span></span></div>`
    + `<div class="calc-stat"><span class="calc-num" id="calc-addl">—</span>`
    + `<span class="calc-cap">Additional Damage Bonus — compare to the in-game sheet</span></div>`
    + `<button type="button" id="calc-reset" class="reset-btn">Reset to build</button></div>`
    + `<form class="calc-form">${groups}${supports.length ? supportsPanel(supports) : ""}</form>`;

  root.querySelector(".calc-form")!.addEventListener("input", () => recompute(root, defaults, supports));
  root.querySelector("#calc-reset")!.addEventListener("click", () => {
    for (const inp of root.querySelectorAll<HTMLInputElement>("input[data-sec]")) {
      const sec = defaults[inp.dataset.sec as keyof Snapshot] as Record<string, number>;
      inp.value = String(sec[inp.dataset.key!]);
    }
    recompute(root, defaults, supports);
  });
  recompute(root, defaults, supports);
}
