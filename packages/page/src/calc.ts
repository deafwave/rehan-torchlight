import { cycleDps, additionalBonusPct, type Snapshot } from "@rehan/dmg/damageModel";
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
];

const DEFAULTS = snapshotData as unknown as Snapshot;
const label = (k: string) => k.replace(/_/g, " ");
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function readForm(root: HTMLElement): Snapshot {
  const s = structuredClone(DEFAULTS);
  for (const inp of root.querySelectorAll<HTMLInputElement>("input[data-sec]")) {
    const sec = inp.dataset.sec as keyof Snapshot;
    const v = parseFloat(inp.value);
    (s[sec] as Record<string, number>)[inp.dataset.key!] = Number.isFinite(v) ? v : 0;
  }
  return s;
}

function recompute(root: HTMLElement): void {
  const s = readForm(root);
  const { dps, cycle_time } = cycleDps(s);
  root.querySelector("#calc-dps")!.textContent = fmt(dps);
  root.querySelector("#calc-cycle")!.textContent = `${cycle_time.toFixed(3)}s cycle`;
  root.querySelector("#calc-addl")!.textContent = `${additionalBonusPct(s).toFixed(1)}%`;
}

export function renderCalc(root: HTMLElement): void {
  const groups = SECTIONS.map(([sec, title]) => {
    const fields = Object.entries(DEFAULTS[sec] as Record<string, number>)
      .map(([k, v]) =>
        `<label class="calc-field"><span>${label(k)}</span>`
        + `<input type="number" step="any" data-sec="${sec}" data-key="${k}" value="${v}"></label>`)
      .join("");
    return `<fieldset class="calc-group"><legend>${title}</legend>${fields}</fieldset>`;
  }).join("");

  root.innerHTML =
    `<div class="calc-out">`
    + `<div class="calc-stat"><span class="calc-num" id="calc-dps">—</span>`
    + `<span class="calc-cap">boss DPS · <span id="calc-cycle"></span></span></div>`
    + `<div class="calc-stat"><span class="calc-num" id="calc-addl">—</span>`
    + `<span class="calc-cap">Additional Damage Bonus — compare to the in-game sheet</span></div>`
    + `<button type="button" id="calc-reset" class="reset-btn">Reset to build</button></div>`
    + `<form class="calc-form">${groups}</form>`;

  root.querySelector(".calc-form")!.addEventListener("input", () => recompute(root));
  root.querySelector("#calc-reset")!.addEventListener("click", () => {
    for (const inp of root.querySelectorAll<HTMLInputElement>("input[data-sec]")) {
      const sec = DEFAULTS[inp.dataset.sec as keyof Snapshot] as Record<string, number>;
      inp.value = String(sec[inp.dataset.key!]);
    }
    recompute(root);
  });
  recompute(root);
}
