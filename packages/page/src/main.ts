import "./style.css";
import { cycleDps } from "@rehan/dmg/damageModel";
import { renderBreakdown } from "./breakdown";
import {
  buildWaterfall,
  compactNumber,
  percentChange,
  signedCompact,
  signedPercent,
  type WaterfallStep,
} from "./analysis";
import { summarizeTradeoff } from "./diagnosis";
import { compareStructure, type BuildSystem } from "./structural-analysis";
import {
  compareDefense,
  type DefenseCategory,
  type DefenseCategoryDiff,
} from "./defense-analysis";
import { compareSupportTerms, type SupportTermChange } from "./support-evidence";
import { compareSummonTerms, type SummonTermChange } from "./summon-evidence";
import type {
  PlayerDefenseDisplayEvidence,
  PlayerDefenseDisplayEvidenceResult,
  PlayerDefenseDisplayTerm,
} from "./player-defense-evidence";
import type {
  AnalyzedBuild,
  AnalyzedLoadout,
  DemoData,
  ImportCatalog,
  SkillRow,
} from "./analysis-types";
import { importBuild, importBuildCode } from "./importer";
import {
  guardedEvidenceReadiness,
  type GuardedEvidenceReadiness,
} from "./evidence-state";
import { presentedChangeKind, skillDisplay } from "./change-presentation";

let demo: DemoData;
const builds: AnalyzedBuild[] = [];
const demoDataUrl = new URL("./data/demo-builds.json", import.meta.url);
const importCatalogUrl = new URL("./data/import-catalog.json", import.meta.url);
let importCatalogPromise: Promise<ImportCatalog> | null = null;

function loadImportCatalog(): Promise<ImportCatalog> {
  if (!importCatalogPromise) {
    importCatalogPromise = fetch(importCatalogUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`The SS13 import catalog could not be loaded (${response.status}).`);
        }
        return response.json() as Promise<ImportCatalog>;
      })
      .catch((error) => {
        importCatalogPromise = null;
        throw error;
      });
  }
  return importCatalogPromise;
}

type Side = "before" | "after";
type View = "diagnosis" | "changes" | "formula" | "survival" | "coverage";
type ChangeSection = "gear" | "skills" | "trees" | "memories" | "slates" | "pacts";

interface Selection {
  buildId: string;
  loadoutId: string;
}

let beforeSelection: Selection;
let afterSelection: Selection;
let activeView: View = "diagnosis";
let changeSection: ChangeSection = "gear";
let formulaSide: Side = "after";
let importTarget: Side = "after";

const app = document.getElementById("app")!;
app.innerHTML = `<main class="app-loading" aria-live="polite">
  <div><span class="brand-mark" aria-hidden="true"><i></i></span>
  <strong>Loading the comparison workspace…</strong>
  <small>Preparing the Bing and Wuxia evidence fixtures.</small></div>
</main>`;
const importDialog = document.getElementById("import-dialog") as HTMLDialogElement;
const importStatus = document.getElementById("import-status")!;
const fileInput = document.getElementById("build-file") as HTMLInputElement;
const pasteInput = document.getElementById("build-paste") as HTMLTextAreaElement;
const dropZone = document.getElementById("drop-zone")!;
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

const esc = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");
const escAttr = (value: unknown) => esc(value).replaceAll('"', "&quot;");
const sideLabel = (side: Side) => side === "before" ? "Before" : "After";

function provenanceLabel(source: string) {
  return /^https:\/\//i.test(source)
    ? `<a href="${escAttr(source)}" target="_blank" rel="noopener">${esc(source)} ↗</a>`
    : `<strong>${esc(source)}</strong>`;
}

function provenanceLinks(entries: Array<{ source: string; locator?: string }>) {
  const sources = [...new Set(entries.map((entry) => entry.source))]
    .filter((source) => /^https:\/\//i.test(source));
  const local = [...new Map(
    entries
      .filter((entry) => !/^https:\/\//i.test(entry.source) && entry.locator)
      .map((entry) => [`${entry.source}\u0000${entry.locator}`, entry]),
  ).values()];
  if (!sources.length && !local.length) return "";
  return `<div class="evidence-sources"><span>Sources</span>${sources.map((source) => {
    let label = source;
    try {
      const url = new URL(source);
      label = `${url.hostname} · ${url.pathname.split("/").filter(Boolean).at(-1) ?? "data"}`;
    } catch {
      // Keep the escaped source string when a future non-standard locator is used.
    }
    return `<a href="${escAttr(source)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`;
  }).join("")}${local.length ? `<details class="evidence-locators">
    <summary>${local.length} imported source path${local.length === 1 ? "" : "s"}</summary>
    <ul>${local.slice(0, 12).map((entry) => `<li><strong>${esc(entry.source)}</strong><code>${esc(entry.locator)}</code></li>`).join("")}</ul>
    ${local.length > 12 ? `<small>+${local.length - 12} more paths retained in the evidence payload</small>` : ""}
  </details>` : ""}</div>`;
}

function selected(side: Side) {
  const selection = side === "before" ? beforeSelection : afterSelection;
  const build = builds.find((item) => item.id === selection.buildId) ?? builds[0];
  const loadout = build.loadouts.find((item) => item.id === selection.loadoutId)
    ?? build.loadouts.find((item) => item.isCurrent)
    ?? build.loadouts[0];
  return { build, loadout };
}

function selectionKey(build: AnalyzedBuild, loadout: AnalyzedLoadout) {
  return `${encodeURIComponent(build.id)}::${encodeURIComponent(loadout.id)}`;
}

function readSelectionKey(value: string): Selection | null {
  const [buildId, loadoutId] = value.split("::").map(decodeURIComponent);
  return buildId && loadoutId ? { buildId, loadoutId } : null;
}

function allOptions(active: Selection) {
  return builds.map((build) =>
    `<optgroup label="${escAttr(`${build.name} · ${build.patch}`)}">`
    + build.loadouts.map((loadout) => {
      const key = selectionKey(build, loadout);
      const currentKey = `${encodeURIComponent(active.buildId)}::${encodeURIComponent(active.loadoutId)}`;
      return `<option value="${escAttr(key)}"${key === currentKey ? " selected" : ""}>`
        + `${esc(loadout.name)}${loadout.isCurrent ? " · current" : ""}</option>`;
    }).join("")
    + `</optgroup>`,
  ).join("");
}

function confidenceLabel(loadout: AnalyzedLoadout) {
  if (loadout.resolutionHandoff) return "Local capture needed";
  if (!loadout.model) {
    const readiness = guardedEvidenceReadiness(loadout);
    if (readiness === "blocked") return "Guarded evidence blocked";
    if (readiness === "partial") return "Guarded evidence · partial";
    if (readiness === "ready") return "Guarded source evidence";
  }
  if (!loadout.model) return "Structure imported";
  if (loadout.sourceNote?.startsWith("Calibrated teaching")) return "Calibrated formula scenario";
  if (loadout.model.confidence === "experimental") return "Experimental minion coverage";
  return "Directional damage model";
}

function isMinionLoadout(loadout: AnalyzedLoadout) {
  if (loadout.summonEvidence?.length || loadout.summonEvidenceBlockers?.length) {
    return true;
  }
  const main = loadout.skills.find((skill) => skill.kind === "active" && skill.enabled)?.name ?? "";
  return /minion|spirit magus|summon|module:/i.test(`${main} ${loadout.sourceNote ?? ""}`);
}

function buildPicker(side: Side, build: AnalyzedBuild, loadout: AnalyzedLoadout) {
  const selection = side === "before" ? beforeSelection : afterSelection;
  const readiness = guardedEvidenceReadiness(loadout);
  const state = loadout.resolutionHandoff
    ? "capture"
    : loadout.model
      ? "modeled"
      : readiness === "blocked"
        ? "blocked"
        : readiness === "ready" || readiness === "partial"
          ? "evidence"
          : "waiting";
  return `<article class="build-picker build-picker--${side}">
    <div class="picker-topline">
      <span class="side-marker">${side === "before" ? "A" : "B"}</span>
      <span class="picker-label">${sideLabel(side)}</span>
      <span class="source-pill">${esc(build.patch)}</span>
    </div>
    <label class="sr-only" for="${side}-loadout">Choose ${sideLabel(side).toLowerCase()} loadout</label>
    <select id="${side}-loadout" class="loadout-select" data-selection="${side}">
      ${allOptions(selection)}
    </select>
    <div class="picker-meta">
      <span>${esc(loadout.hero)}</span>
      <span aria-hidden="true">•</span>
      <span>${esc(build.source)}</span>
    </div>
    <div class="picker-bottom">
      <span class="model-state ${state}">
        <span class="state-dot"></span>${esc(confidenceLabel(loadout))}
      </span>
      <button class="quiet-button" type="button" data-import="${side}">Import</button>
    </div>
  </article>`;
}

function summaryMetric(label: string, value: string, note: string, className = "") {
  return `<div class="summary-metric ${className}">
    <span class="metric-label">${esc(label)}</span>
    <strong>${esc(value)}</strong>
    <span class="metric-note">${esc(note)}</span>
  </div>`;
}

function renderSummary(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const beforeDps = before.model?.dps;
  const afterDps = after.model?.dps;
  const bothModeled = beforeDps != null && afterDps != null;
  const delta = bothModeled ? percentChange(beforeDps, afterDps) : null;
  const structure = compareStructure(before, after);
  const defense = compareDefense(before, after);
  const beforeDefenseEvidence = exactDefense(before);
  const afterDefenseEvidence = exactDefense(after);
  const classificationRates = [before.coverage?.classificationRate, after.coverage?.classificationRate]
    .filter((value): value is number => value != null);
  const classificationFloor = classificationRates.length
    ? Math.min(...classificationRates)
    : null;
  const guardedStates = [
    guardedEvidenceReadiness(before),
    guardedEvidenceReadiness(after),
  ];
  const guardedReady = guardedStates.some((state) =>
    state === "ready" || state === "partial");
  const guardedBlocked = guardedStates.some((state) =>
    state === "blocked" || state === "partial");
  const deltaClass = delta == null ? "neutral" : delta < 0 ? "negative" : "positive";
  const headline = delta == null
    ? structure.changedSystems.length
      ? `${structure.changedSystems.length} build system${structure.changedSystems.length === 1 ? "" : "s"} changed`
      : "No imported changes found"
    : `${signedPercent(delta)} supported DPS`;
  const note = delta == null
    ? structure.insights[0]
      ? `First review: ${structure.insights[0].title}`
      : "Calculation is waiting for a compatible model"
    : delta < 0
      ? "The changed build is weaker under the same boss scenario"
      : "The changed build is stronger under the same boss scenario";
  const lowestCoverage = Math.min(
    before.model?.coverage ?? 0,
    after.model?.coverage ?? 0,
  );
  return `<section class="result-summary" aria-labelledby="result-title">
    <div class="result-head">
      <div>
        <span class="eyebrow">Comparison result</span>
        <h1 id="result-title">${esc(headline)}</h1>
        <p>${esc(note)}</p>
      </div>
      <div class="delta-orb ${deltaClass}">
        <span>${delta == null ? "—" : delta < 0 ? "↓" : "↑"}</span>
      </div>
    </div>
    <div class="summary-metrics">
      ${summaryMetric("Before DPS", beforeDps == null ? "Not calculated" : compactNumber(beforeDps), before.name, "before")}
      ${summaryMetric("After DPS", afterDps == null ? "Not calculated" : compactNumber(afterDps), after.name, "after")}
      ${summaryMetric(
        "EHP",
        "Not calculated",
        beforeDefenseEvidence && afterDefenseEvidence
          ? `${beforeDefenseEvidence.coverage.playerScopedTerms} → ${afterDefenseEvidence.coverage.playerScopedTerms} typed player-defense terms`
          : defense.removed || defense.added
            ? `${defense.removed} defensive lines removed · ${defense.added} added`
            : "No defensive gear-line change found",
        "disabled",
      )}
      ${summaryMetric(
        bothModeled ? "Formula coverage" : "Classification coverage",
        bothModeled
          ? `${Math.round(lowestCoverage * 100)}%+`
          : classificationFloor == null ? "Pending" : `${Math.round(classificationFloor * 100)}%+`,
        bothModeled
          ? "Classified modifier lines"
          : classificationFloor == null ? "Imported structure only" : "Recognized lines; no DPS claim",
        (bothModeled ? lowestCoverage : classificationFloor ?? 0) < 0.6 ? "warning" : "",
      )}
    </div>
    ${bothModeled
      ? `<div class="scenario-strip">
          <span class="scenario-label">Shared scenario</span>
          <span>Boss target</span>
          <span>30% elemental / erosion resistance</span>
          <span>Full configured uptime</span>
          <button type="button" class="text-button" data-view="coverage">Review assumptions</button>
        </div>`
      : `<div class="scenario-strip evidence-scope">
          <span class="scenario-label">Evidence scope</span>
          <span>${guardedReady ? "Imported entities and guarded source terms" : "Imported structure only"}</span>
          <span>${guardedBlocked ? "Blocked guarded layers remain explicit" : "No target scenario applied"}</span>
          <span>DPS / EHP not guessed</span>
          <button type="button" class="text-button" data-view="coverage">Review coverage</button>
        </div>`}
  </section>`;
}

function shortAnswer(steps: WaterfallStep[], totalDelta: number) {
  const losses = steps.filter((step) => step.delta < -0.5)
    .sort((a, b) => a.delta - b.delta);
  const gains = steps.filter((step) => step.delta > 0.5)
    .sort((a, b) => b.delta - a.delta);
  if (totalDelta < 0 && losses.length) {
    const [first, second] = losses;
    return `<strong>${esc(first.label)} is the largest modeled loss</strong>, costing
      ${esc(compactNumber(Math.abs(first.delta)))} DPS in the fixed replay.
      ${second ? `${esc(second.label)} is next at ${esc(compactNumber(Math.abs(second.delta)))}.` : ""}
      Any green rows below are improvements that were not large enough to offset it.`;
  }
  if (totalDelta > 0 && gains.length) {
    const [first, second] = gains;
    return `<strong>${esc(first.label)} is the largest modeled gain</strong>, adding
      ${esc(compactNumber(first.delta))} DPS in the fixed replay.
      ${second ? `${esc(second.label)} follows at ${esc(compactNumber(second.delta))}.` : ""}`;
  }
  return `<strong>No supported DPS movement can be isolated yet.</strong>
    The loadouts may be structurally different, but one or both still need a compatible formula model.`;
}

function waterfallRow(step: WaterfallStep, max: number) {
  const changed = Math.abs(step.delta) >= 0.5;
  const direction = step.delta < 0 ? "negative" : step.delta > 0 ? "positive" : "neutral";
  const width = changed ? Math.max(3, Math.abs(step.delta) / max * 100) : 0;
  const fieldText = step.fields.length
    ? step.fields.map((field) => `${field.label} ${field.before.toFixed(1)} → ${field.after.toFixed(1)}`).join(" · ")
    : "No numeric fields changed in this layer";
  return `<button class="waterfall-row ${direction}" type="button" data-jump-section="${escAttr(step.id)}">
    <span class="waterfall-name">${esc(step.label)}</span>
    <span class="waterfall-track" aria-hidden="true">
      <span class="waterfall-zero"></span>
      <span class="waterfall-bar" style="--bar-width:${width}%"></span>
    </span>
    <span class="waterfall-value">${changed ? esc(signedCompact(step.delta)) : "—"}</span>
    <span class="waterfall-detail">${esc(fieldText)}</span>
  </button>`;
}

function renderTradeoff(steps: WaterfallStep[]) {
  const summary = summarizeTradeoff(steps);
  if (Math.abs(summary.netDelta) < 0.5 && summary.totalGain < 0.5 && summary.totalLoss < 0.5) {
    return "";
  }
  const isLoss = summary.netDelta < -0.5;
  const isGain = summary.netDelta > 0.5;
  const primary = isLoss ? summary.primaryLoss : summary.primaryGain;
  const offset = isLoss ? summary.primaryGain : summary.primaryLoss;
  const outcome = isLoss ? "loss" : isGain ? "gain" : "neutral";
  const outcomeLabel = isLoss ? "DPS lost" : isGain ? "DPS gained" : "Net change";

  return `<section class="tradeoff-summary ${outcome}" aria-labelledby="tradeoff-title">
    <div class="tradeoff-equation" aria-label="Modeled losses plus modeled gains equals the final DPS change">
      <div class="tradeoff-part loss">
        <span>All modeled losses</span>
        <strong>${summary.totalLoss < 0.5 ? "0" : `−${esc(compactNumber(summary.totalLoss))}`}</strong>
      </div>
      <span class="tradeoff-operator" aria-hidden="true">+</span>
      <div class="tradeoff-part gain">
        <span>All modeled gains</span>
        <strong>${summary.totalGain < 0.5 ? "0" : `+${esc(compactNumber(summary.totalGain))}`}</strong>
      </div>
      <span class="tradeoff-operator" aria-hidden="true">=</span>
      <div class="tradeoff-part net">
        <span id="tradeoff-title">${outcomeLabel}</span>
        <strong>${esc(signedCompact(summary.netDelta))}</strong>
      </div>
    </div>
    ${primary ? `<div class="tradeoff-lesson">
      <span class="eyebrow">${isLoss ? "Why the upgrade lost" : isGain ? "Why the upgrade won" : "What canceled out"}</span>
      <p><strong>${esc(primary.label)} was the main driver.</strong>
        ${esc(primary.description)}
        ${offset ? `The strongest offset was ${esc(offset.label.toLowerCase())} at ${esc(signedCompact(offset.delta))}.` : ""}
      </p>
    </div>` : ""}
  </section>`;
}

const CHECK_COPY: Record<string, { title: string; body: string }> = {
  base: {
    title: "Re-check the weapon and flat base",
    body: "A higher-looking modifier cannot compensate for a lower base hit if the skill multiplies that base several times.",
  },
  increased: {
    title: "Restore applicable increased damage",
    body: "Confirm the new lines match the main skill’s tags and final damage type. Inert increases are not upgrades.",
  },
  additional: {
    title: "Restore the lost separate multiplier",
    body: "Additional bonuses with different names compound. Replacing one with a larger increased roll is often a net loss.",
  },
  conversion: {
    title: "Trace the conversion chain",
    body: "A conversion change can strand typed damage, penetration, or critical bonuses that used to apply.",
  },
  crit: {
    title: "Recover critical reliability",
    body: "Check both chance and critical damage. A large crit-damage roll is weak if the build no longer crits consistently.",
  },
  enemy: {
    title: "Restore penetration or a target debuff",
    body: "Resistance and damage-taken layers are late multipliers; losing one is usually more expensive than it looks.",
  },
  rotation: {
    title: "Verify cadence and overlap",
    body: "Attack speed, projectile quantity, bomb overlap, combo timing, and uptime determine how many scaled hits land.",
  },
  dot: {
    title: "Check damage-over-time application",
    body: "Chance, duration, tick rate, and the feeding hit all need to remain valid for the modeled DoT contribution.",
  },
};

function nextChecks(steps: WaterfallStep[] | null, after: AnalyzedLoadout) {
  if (!steps || !after.model) {
    const readiness = guardedEvidenceReadiness(after);
    const firstTitle = readiness === "blocked"
      ? "Resolve the guarded evidence blockers"
      : readiness === "partial"
        ? "Review blockers, then complete the DPS layers"
        : readiness === "ready"
          ? "Complete the remaining DPS layers"
          : "Connect this build to a season model";
    const firstBody = readiness === "blocked"
      ? "The structure is visible, but the guarded checks rejected required inputs. Their blocker evidence is shown instead of a fabricated value."
      : readiness === "partial"
        ? "Some source slices compiled and others were withheld. Resolve the explicit blockers before extending the result toward total DPS."
        : readiness === "ready"
          ? "Guarded source arithmetic is connected. Rotation, complete modifiers, target state, and uptime still need compatible compilers before DPS."
          : "The full loadout is visible, but the site will not invent a DPS number for unsupported input.";
    const minionNotice = isMinionLoadout(after)
      ? after.summonEvidence?.length
        ? `<div class="minion-warning"><strong>Minion DPS layers remain</strong>
            Actor, action, and supported socket evidence is connected. Quantity, full modifiers, AI rotation, overlap, target state, and uptime still block DPS.</div>`
        : after.summonEvidenceBlockers?.length
          ? `<div class="minion-warning"><strong>Spirit Magus evidence blocked</strong>
              Resolve the displayed source-shape or installation blockers; the player-hit formula is not a fallback.</div>`
          : `<div class="minion-warning"><strong>Minion DPS compiler required</strong>
              Keep player, Spirit Magus, and Synthetic Troop modifiers actor-scoped; the player-hit formula is not a fallback.</div>`
      : "";
    return `<aside class="next-checks">
      <div class="panel-kicker">Analysis queue</div>
      <h2>What is needed next</h2>
      <div class="check-card warning">
        <span class="check-rank">1</span>
        <div><strong>${esc(firstTitle)}</strong>
        <p>${esc(firstBody)}</p></div>
      </div>
      <div class="check-card">
        <span class="check-rank">2</span>
        <div><strong>Review imported changes now</strong>
        <p>Gear, skills, trees, memories, slates, and pactspirits can still be compared safely.</p></div>
      </div>
      ${minionNotice}
    </aside>`;
  }
  const isMinion = after.model.confidence === "experimental";
  const losses = steps.filter((step) => step.delta < -0.5)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 3);
  const gains = steps.filter((step) => step.delta > 0.5)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3);
  const chosen = losses.length ? losses : gains;
  return `<aside class="next-checks">
    <div class="panel-kicker">${losses.length ? "Evidence-based checks" : "What improved"}</div>
    <h2>${losses.length ? "Check these first" : "Protect these gains"}</h2>
    <p class="checks-note">These are comparison checks, not optimizer recommendations.</p>
    ${isMinion ? `<div class="minion-warning"><strong>Minion warning</strong>
      The player-hit model cannot settle minion base actions, quantity, or AI uptime. Treat the numbers as directional only.</div>` : ""}
    ${chosen.map((step, index) => {
      const copy = CHECK_COPY[step.id] ?? { title: step.label, body: step.description };
      return `<button class="check-card ${step.delta < 0 ? "loss" : "gain"}" type="button" data-jump-section="${escAttr(step.id)}">
        <span class="check-rank">${index + 1}</span>
        <div><strong>${esc(copy.title)}</strong>
        <p>${esc(copy.body)}</p>
        <span class="check-impact">${esc(signedCompact(step.delta))} in replay</span></div>
      </button>`;
    }).join("")}
    <div class="optimizer-note">
      <span class="beta-label">Later</span>
      <strong>Constraint-based upgrade search</strong>
      <p>Budget, item availability, DPS, and EHP tradeoffs will live here once the MiniZinc model is ready.</p>
    </div>
  </aside>`;
}

const SYSTEM_LABELS: Record<BuildSystem, string> = {
  gear: "Gear",
  skills: "Skills",
  trees: "Talent trees",
  memories: "Memories",
  slates: "Slates",
  pacts: "Pactspirits",
};

function renderStructuralDiagnosis(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const comparison = compareStructure(before, after);
  if (!comparison.insights.length) {
    return `<div class="structural-empty">
      <strong>No imported loadout differences were found.</strong>
      <p>Choose two different loadouts or import a changed build to begin the comparison.</p>
    </div>`;
  }
  return `<div class="structural-diagnosis">
    <div class="structural-head">
      <div>
        <span class="eyebrow">Evidence before arithmetic</span>
        <h3>Start with the changes most likely to alter the formula</h3>
      </div>
      <span class="exact-badge">${comparison.changedSystems.length} systems changed</span>
    </div>
    <p class="structural-note">These are investigation priorities from the imported entities—not DPS estimates. Each card explains why the change matters and links to its source details.</p>
    <div class="insight-list">
      ${comparison.insights.slice(0, 5).map((insight, index) => `<button type="button"
        class="insight-card ${insight.tone}" data-open-section="${insight.section}">
        <span class="insight-rank">${index + 1}</span>
        <span class="insight-copy">
          <span class="insight-label">${esc(insight.label)} · ${esc(SYSTEM_LABELS[insight.section])}</span>
          <strong>${esc(insight.title)}</strong>
          <span>${esc(insight.explanation)}</span>
          <small>${insight.evidence.map((line) => esc(line)).join(" · ")}</small>
        </span>
        <span class="insight-open" aria-hidden="true">Review →</span>
      </button>`).join("")}
    </div>
  </div>`;
}

function weaponFoundation(loadout: AnalyzedLoadout) {
  return loadout.partialMetrics?.find((metric) => metric.id === "bing-weapon-hit-foundation");
}

function renderPartialComparison(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const left = weaponFoundation(before);
  const right = weaponFoundation(after);
  if (!left && !right) return "";
  if (!left || !right) {
    const metric = left ?? right!;
    const availableSide = left ? "Before" : "After";
    return `<section class="partial-proof">
      <div class="partial-proof-head">
        <div><span class="eyebrow">${availableSide} · proven partial calculation</span><h3>${esc(metric.label)}</h3></div>
        <span class="not-dps-badge">Not DPS</span>
      </div>
      <strong class="partial-single">${esc(metric.display)}</strong>
      <p>Only the ${availableSide.toLowerCase()} side has all inputs required for this guarded metric, so the unavailable side is not treated as zero and no A/B ratio is shown.</p>
    </section>`;
  }
  const delta = right.value - left.value;
  const deltaPct = left.value === 0 ? null : delta / left.value;
  const direction = delta < -1e-9 ? "loss" : delta > 1e-9 ? "gain" : "neutral";
  const confidence = left.confidence === "confirmed-partial" && right.confidence === "confirmed-partial"
    ? "Confirmed partial"
    : "Partly inferred";
  return `<section class="partial-proof ${direction}">
    <div class="partial-proof-head">
      <div>
        <span class="eyebrow">Proven partial calculation</span>
        <h3>Equipped-weapon contribution to one raw Hammer of Ash hit</h3>
      </div>
      <div class="partial-badges"><span>${confidence}</span><b>Not DPS</b></div>
    </div>
    <div class="partial-comparison">
      <div><span>Before foundation</span><strong>${esc(left.display)}</strong>
        <small>${esc(left.inputs[0]?.display)} weapon × ${esc(left.inputs[1]?.display)} WAD</small></div>
      <i aria-hidden="true">→</i>
      <div><span>After foundation</span><strong>${esc(right.display)}</strong>
        <small>${esc(right.inputs[0]?.display)} weapon × ${esc(right.inputs[1]?.display)} WAD</small></div>
      <div class="partial-delta"><span>Partial change</span>
        <strong>${deltaPct == null ? "—" : esc(signedPercent(deltaPct))}</strong>
        <small>${esc(signedCompact(delta))} raw hit</small></div>
    </div>
    <p>This proves movement in the weapon-and-skill foundation only. Supports, global scaling, critical strikes, conversion, mitigation, bomb overlap, damage over time, and uptime remain outside this number.</p>
  </section>`;
}

type BingIntrinsicEvidence = NonNullable<AnalyzedLoadout["bingIntrinsicEvidence"]>;

function damageRangeDisplay(range: { min: number; max: number; average: number }) {
  if (Math.abs(range.max - range.min) < 1e-9) return compactNumber(range.average);
  return `${compactNumber(range.min)}–${compactNumber(range.max)}`;
}

function bingIntrinsicSide(
  evidence: BingIntrinsicEvidence | undefined,
  label: string,
  unavailable: Array<{ message: string; evidence?: string }> = [],
) {
  if (!evidence) {
    return `<div class="bing-intrinsic-side empty"><span>${esc(label)}</span><strong>No guarded Bing envelope</strong>
      ${unavailable.length
        ? `<ul>${unavailable.map((blocker) => `<li>${esc(blocker.message)}${blocker.evidence ? `<small>${esc(blocker.evidence)}</small>` : ""}</li>`).join("")}</ul>`
        : ""}</div>`;
  }
  const topology = evidence.topology;
  const portions = Object.entries(evidence.normalWeaponSourcedPerHit.portions)
    .filter(([, range]) => range.average !== 0);
  return `<div class="bing-intrinsic-side">
    <span>${esc(label)} · Hammer L${evidence.skillLevel}</span>
    <div class="bing-hit-pair">
      <div><span>Normal weapon-sourced hit</span><strong>${esc(damageRangeDisplay(evidence.normalWeaponSourcedPerHit.total))}</strong><small>average ${esc(compactNumber(evidence.normalWeaponSourcedPerHit.total.average))}</small></div>
      <div><span>Demolisher-charged hit</span><strong>${esc(damageRangeDisplay(evidence.demolisherChargedWeaponSourcedPerHit.total))}</strong><small>×${esc(compactNumber(evidence.demolisherChargedWeaponSourcedPerHit.multiplier))} intrinsic instance</small></div>
    </div>
    <div class="bing-damage-portions">
      <span>After Hammer conversion</span>
      ${portions.map(([damageType, range]) => `<b>${esc(damageType)} · ${esc(compactNumber(range.average))} avg</b>`).join("")}
    </div>
    ${topology.status === "calculated-partial"
      ? `<div class="bing-emission-card">
          <div class="bing-emission-primary">
            <span>Source-visible emissions / throw</span>
            <strong>${esc(compactNumber(topology.expectedEmittedProjectilesPerThrow))}</strong>
            <small>${esc(compactNumber(topology.projectilesPerBomb))} projectiles / bomb · ${esc(compactNumber(topology.expectedBombsPerThrow))} expected bombs</small>
          </div>
          <div class="bing-outcomes">${topology.emittedProjectilesPerThrowOutcomes.map((outcome) => `<span><b>${esc(compactNumber(outcome.probability * 100))}%</b>${outcome.bombs} bombs → ${outcome.projectiles} emitted</span>`).join("")}</div>
          <div class="bing-source-chips">${topology.projectileQuantitySources.map((source) => `<span>+${source.quantity} · ${esc(source.id.replaceAll("-", " "))}</span>`).join("")}</div>
          <small>Trait levels: ${Object.entries(topology.heroTraitLevels).map(([slot, level]) => `${slot.replace("level", "L")} ${level}`).join(" · ")} · ${esc(compactNumber(topology.blastBarrageAdditionalBombChancePct))}% additional-bomb chance</small>
        </div>`
      : `<div class="bing-emission-card blocked">
          <span>Emission topology blocked</span>
          <strong>Per-hit evidence is still valid.</strong>
          <p>${topology.blockers.map((blocker) => esc(blocker.message)).join(" ")}</p>
        </div>`}
  </div>`;
}

function renderBingIntrinsicComparison(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const left = before.bingIntrinsicEvidence;
  const right = after.bingIntrinsicEvidence;
  const leftUnavailable = before.bingIntrinsicBlockers ?? [];
  const rightUnavailable = after.bingIntrinsicBlockers ?? [];
  if (!left && !right && !leftUnavailable.length && !rightUnavailable.length) return "";
  const normalDelta = left && right
    ? right.normalWeaponSourcedPerHit.total.average - left.normalWeaponSourcedPerHit.total.average
    : null;
  const chargedDelta = left && right
    ? right.demolisherChargedWeaponSourcedPerHit.total.average
      - left.demolisherChargedWeaponSourcedPerHit.total.average
    : null;
  const emissionDelta = left?.topology.status === "calculated-partial"
    && right?.topology.status === "calculated-partial"
    ? right.topology.expectedEmittedProjectilesPerThrow
      - left.topology.expectedEmittedProjectilesPerThrow
    : null;
  const movement = (value: number) => value > 1e-9 ? "rose" : value < -1e-9 ? "fell" : "did not change";
  const tradeoff = normalDelta == null
    ? null
    : emissionDelta == null
      ? `Weapon-sourced damage per hit ${movement(normalDelta)}, but at least one side lacks a source-complete emission topology.`
      : normalDelta * emissionDelta < 0
        ? `Tradeoff detected: weapon-sourced damage per hit ${movement(normalDelta)} while source-visible emissions per throw ${movement(emissionDelta)}. Landed-hit geometry decides whether that trade wins.`
        : `Weapon-sourced damage per hit ${movement(normalDelta)} and source-visible emissions per throw ${movement(emissionDelta)}. They point the same way, but complete modifiers, landed hits, cadence, and enemy state can still reverse the result.`;
  const blockers = [...new Map(
    [
      ...[left, right]
        .filter((value): value is BingIntrinsicEvidence => Boolean(value))
        .flatMap((value) => value.actualDps.blockers),
      ...leftUnavailable,
      ...rightUnavailable,
    ]
      .map((blocker) => [blocker.code, blocker]),
  ).values()];
  const provenance = [left, right]
    .filter((value): value is BingIntrinsicEvidence => Boolean(value))
    .flatMap((value) => value.provenance);
  return `<section class="bing-intrinsic-panel">
    <div class="partial-proof-head">
      <div><span class="eyebrow">Guarded Hammer envelope</span><h3>Separate damage per hit from things merely emitted</h3></div>
      <div class="partial-badges"><span>SS13 intrinsic rules</span><b>Not total hit</b><b>Not DPS</b></div>
    </div>
    <p>Each Pummel, Ember Projectile, and charged Explosion starts with the same Hammer weapon coefficient. Physical weapon damage converts to Fire here. Blast Nova’s bomb/projectile record can prove how many projectiles are emitted, but not how many hit one target—so these two evidence layers are never multiplied.</p>
    ${tradeoff ? `<div class="bing-tradeoff-callout"><strong>${normalDelta != null && emissionDelta != null && normalDelta * emissionDelta < 0 ? "Competing scaling levers" : "Guarded direction"}</strong><p>${esc(tradeoff)}</p></div>` : ""}
    ${normalDelta == null ? "" : `<div class="bing-delta-strip ${emissionDelta == null ? "two" : "three"}">
      <div><span>Normal per-hit Δ</span><strong>${esc(signedCompact(normalDelta))}</strong></div>
      <div><span>Charged per-hit Δ</span><strong>${esc(signedCompact(chargedDelta ?? 0))}</strong></div>
      ${emissionDelta == null ? "" : `<div><span>Emitted / throw Δ</span><strong>${esc(signedCompact(emissionDelta))}</strong></div>`}
      <p>Weapon-sourced slice only; direction is not net DPS.</p>
    </div>`}
    <div class="bing-intrinsic-sides">
      ${bingIntrinsicSide(left, "Before", leftUnavailable)}
      ${bingIntrinsicSide(right, "After", rightUnavailable)}
    </div>
    <details class="bing-blocker-ladder">
      <summary>The remaining ladder from emissions to real DPS</summary>
      <ol>${blockers.map((blocker, index) => `<li><b>${index + 1}</b><span><strong>${esc(blocker.message)}</strong>${blocker.evidence ? `<small>${esc(blocker.evidence)}</small>` : ""}</span></li>`).join("")}</ol>
    </details>
    ${provenanceLinks(provenance)}
  </section>`;
}

function supportTermSide(
  evidence: SupportTermChange["before"],
  label: string,
) {
  if (!evidence) return `<div class="support-term-side empty"><span>${esc(label)}</span><strong>Not socketed</strong></div>`;
  if (evidence.status === "unsupported") {
    return `<div class="support-term-side unsupported"><span>${esc(label)}</span>
      <strong>${esc(evidence.supportName ?? "Unknown support")}</strong>
      <p>${evidence.blockers.map((blocker) => esc(blocker)).join(" ")}</p></div>`;
  }
  return `<div class="support-term-side">
    <span>${esc(label)}${evidence.level ? ` · L${evidence.level}` : ""}</span>
    <strong>${esc(evidence.supportName ?? "Unknown support")}</strong>
    <ul>${evidence.effects.map((effect) => `<li>
      <b>${esc(effect.display)}</b>
      <span><strong>${esc(effect.label)}</strong><small>${esc(effect.scope)}${effect.condition ? ` · ${esc(effect.condition)}` : ""}</small></span>
    </li>`).join("")}</ul>
  </div>`;
}

function renderSupportTermChanges(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const changes = compareSupportTerms(before, after);
  if (!changes.length) return "";
  const provenance = changes.flatMap((change) => [
    ...(change.before?.provenance ?? []),
    ...(change.after?.provenance ?? []),
  ]);
  return `<section class="support-evidence-panel">
    <div class="partial-proof-head">
      <div><span class="eyebrow">Exact support text</span><h3>What the main-skill socket changes actually say</h3></div>
      <div class="partial-badges"><span>SS13 source terms</span><b>Net DPS pending</b></div>
    </div>
    <p>These values come from the season support tables. They are not added together: damage-type share, critical chance, projectile geometry, enemy Life, and uptime still decide their net value.</p>
    <div class="support-change-list">
      ${changes.map((change) => `<article class="support-change ${change.kind}">
        <div class="support-change-head"><span>${esc(change.kind)}</span><strong>${esc(change.supportName)}</strong></div>
        <div class="support-term-sides">
          ${supportTermSide(change.before, "Before")}
          ${supportTermSide(change.after, "After")}
        </div>
      </article>`).join("")}
    </div>
    ${provenanceLinks(provenance)}
  </section>`;
}

function summonTermSide(
  evidence: SummonTermChange["before"],
  label: string,
) {
  if (!evidence) {
    return `<div class="support-term-side empty"><span>${esc(label)}</span><strong>Not installed or enabled</strong></div>`;
  }
  const tags = evidence.damageTags.join(" · ");
  const baselineConfidence = evidence.baseline.confidence === "confirmed-partial"
    ? "confirmed actor table"
    : "shared actor table · verify";
  return `<div class="support-term-side summon-term-side">
    <span>${esc(label)} · L${evidence.level}</span>
    <strong>${esc(evidence.skillName)}</strong>
    <small class="summon-actor-label">Summoned actor · ${esc(tags)}</small>
    <div class="minion-baseline" aria-label="Raw minion actor baseline">
      <div><span>Base damage</span><b>${esc(compactNumber(evidence.baseline.baseDamage))}</b></div>
      <div><span>Base Life</span><b>${esc(compactNumber(evidence.baseline.baseLife))}</b></div>
      <div><span>Base Armor</span><b>${esc(compactNumber(evidence.baseline.baseArmor))}</b></div>
      <div><span>Base crit</span><b>${esc(compactNumber(evidence.baseline.baseCriticalStrikeRating))}</b></div>
    </div>
    <small class="minion-baseline-note">${esc(baselineConfidence)} · all four base resistances ${esc(compactNumber(evidence.baseline.resistances.fire))}% · not minion EHP</small>
    <ul>${evidence.terms.map((term) => `<li>
      <b>${esc(term.display)}</b>
      <span>
        <strong>${esc(term.label)}</strong>
        <small>${term.scope === "player" ? "Player Origin term" : "Summoned actor"}${term.condition ? ` · ${esc(term.condition)}` : ""}</small>
      </span>
    </li>`).join("")}</ul>
    <div class="minion-action-grid">
      ${evidence.actions.map((action) => {
        const foundation = action.foundation;
        const perContact = foundation.rawDamagePerContact == null
          ? "No direct hit"
          : compactNumber(foundation.rawDamagePerContact);
        const fullContact = foundation.rawDamageAtDeterministicFullContact == null
          ? null
          : compactNumber(foundation.rawDamageAtDeterministicFullContact);
        return `<article class="minion-action-card">
          <div class="minion-action-head">
            <span>${esc(action.role)}</span>
            <strong>${esc(action.actionName)}</strong>
          </div>
          <div class="minion-action-math">
            <div><span>Raw / contact</span><b>${esc(perContact)}</b></div>
            ${fullContact != null && fullContact !== perContact
              ? `<div><span>${esc(String(foundation.deterministicContacts))} contacts</span><b>${esc(fullContact)}</b></div>`
              : ""}
            <div><span>Cast / cooldown</span><b>${esc(`${action.castTimeSeconds}s${action.cooldownSeconds == null ? "" : ` / ${action.cooldownSeconds}s`}`)}</b></div>
          </div>
          ${foundation.baseDamagePctPerContact == null ? "" : `<small>${esc(compactNumber(foundation.baseDamagePctPerContact))}% of the actor's base damage per contact. Modifiers, AI, target state, Growth/Breeze, and overlap are excluded.</small>`}
          ${action.terms.length ? `<ul>${action.terms.map((term) => `<li><b>${esc(term.display)}</b><span>${esc(term.label)}${term.condition ? ` · ${esc(term.condition)}` : ""}</span></li>`).join("")}</ul>` : ""}
        </article>`;
      }).join("")}
    </div>
    <details class="minion-support-details">
      <summary>${evidence.supports.length} main-summon support${evidence.supports.length === 1 ? "" : "s"} · exact socket terms</summary>
      <div>${evidence.supports.map((support) => `<article class="${support.status}">
        <strong>${esc(support.supportName ?? "Unknown support")}${support.level ? ` · L${support.level}` : ""}</strong>
        ${support.status === "unsupported"
          ? `<p>${(support.blockerEvidence?.length
              ? support.blockerEvidence.map((blocker) =>
                  `${esc(blocker.message)}${blocker.evidence ? ` <small>${esc(blocker.evidence)}</small>` : ""}`)
              : support.blockers.map((blocker) => esc(blocker))).join(" ")}</p>`
          : `<ul>${support.effects.map((effect) => `<li><b>${esc(effect.display)}</b><span>${esc(effect.label)}<small>${esc(effect.scope)}${effect.condition ? ` · ${esc(effect.condition)}` : ""}</small></span></li>`).join("")}</ul>`}
      </article>`).join("")}</div>
    </details>
  </div>`;
}

function irisTraitSide(
  evidence: SummonTermChange["before"],
  label: string,
) {
  if (!evidence?.heroTraits.length) return "";
  return `<div class="iris-trait-side">
    <span>${esc(label)}</span>
    ${evidence.heroTraits.map((trait) => `<article>
      <div><strong>${esc(trait.traitName)}</strong><small>Level ${trait.unlockLevel} trait</small></div>
      <ul>${trait.terms.map((term) => `<li>
        <b>${esc(term.display)}</b>
        <span>${esc(term.label)}<small>${esc(term.scope)}${term.selector === "unresolved-trait-enhancement" ? " · enhancement selector missing" : ""}${term.condition ? ` · ${esc(term.condition)}` : ""}</small></span>
      </li>`).join("")}</ul>
      ${trait.unresolved.length ? `<p>${trait.unresolved.map((line) => esc(line)).join(" ")}</p>` : ""}
    </article>`).join("")}
  </div>`;
}

function minionFoundationRows(changes: SummonTermChange[]) {
  return changes.flatMap((change) => {
    if (!change.before || !change.after) return [];
    const beforeActions = new Map(
      change.before.actions.map((action) => [action.actionId, action]),
    );
    return change.after.actions.flatMap((action) => {
      const earlier = beforeActions.get(action.actionId);
      if (!earlier) return [];
      const beforeFull = earlier.foundation.rawDamageAtDeterministicFullContact;
      const afterFull = action.foundation.rawDamageAtDeterministicFullContact;
      const useFull = beforeFull != null && afterFull != null;
      const beforeValue = useFull
        ? beforeFull
        : earlier.foundation.rawDamagePerContact;
      const afterValue = useFull
        ? afterFull
        : action.foundation.rawDamagePerContact;
      if (beforeValue == null || afterValue == null || beforeValue === afterValue) return [];
      return [{
        skillName: change.skillName,
        actionName: action.actionName,
        scope: useFull && action.foundation.deterministicContacts !== 1
          ? `${action.foundation.deterministicContacts} deterministic contacts`
          : "per contact",
        beforeValue,
        afterValue,
        ratio: beforeValue === 0 ? null : afterValue / beforeValue,
      }];
    });
  });
}

function renderSummonTermChanges(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const beforeEvidence = before.summonEvidence ?? [];
  const afterEvidence = after.summonEvidence ?? [];
  const beforeUnavailable = before.summonEvidenceBlockers ?? [];
  const afterUnavailable = after.summonEvidenceBlockers ?? [];
  if (!beforeEvidence.length
      && !afterEvidence.length
      && !beforeUnavailable.length
      && !afterUnavailable.length) return "";
  const changes = compareSummonTerms(before, after);
  const reference = afterEvidence[0] ?? beforeEvidence[0];
  const compilerBlockers = [...new Set(
    [...beforeUnavailable, ...afterUnavailable].map((blocker) => blocker.message),
  )];
  const minionDpsBlockers = [...new Set([
    ...(reference?.minionDps.blockers ?? []),
    ...compilerBlockers,
  ])];
  const playerEhpBlockers = [...new Set(reference?.playerEhp.blockers ?? [])];
  const provenance = [...beforeEvidence, ...afterEvidence]
    .flatMap((evidence) => evidence.provenance);
  const beforeReference = beforeEvidence[0] ?? null;
  const afterReference = afterEvidence[0] ?? null;
  const bothSidesGuarded = beforeEvidence.length > 0 && afterEvidence.length > 0;
  const traitsChanged = bothSidesGuarded
    && JSON.stringify(beforeReference?.heroTraits ?? [])
      !== JSON.stringify(afterReference?.heroTraits ?? []);
  const foundationRows = minionFoundationRows(changes);
  const blockedSide = (
    label: string,
    blockers: typeof beforeUnavailable,
  ) => `<div class="exact-defense-unavailable">
    <span>${esc(label)}</span><strong>Spirit Magus evidence unavailable</strong>
    ${blockers.length
      ? `<ul>${blockers.map((blocker) => `<li>${esc(blocker.message)}${blocker.evidence ? `<small>${esc(blocker.evidence)}</small>` : ""}</li>`).join("")}</ul>`
      : `<p>This side has no guarded Spirit Magus compiler result.</p>`}
  </div>`;
  const availableSide = (
    label: string,
    evidence: typeof beforeEvidence,
  ) => `<div class="summon-available-side ${label.toLowerCase()}">
    <span>${esc(label)}</span>
    ${evidence.map((summon) => summonTermSide(summon, "Guarded evidence")).join("")}
  </div>`;
  const hasUnavailableSide = !beforeEvidence.length || !afterEvidence.length;
  const referenceEvidence = afterEvidence.length ? afterEvidence : beforeEvidence;
  const actorCount = referenceEvidence.length;
  const actionCount = referenceEvidence.reduce(
    (sum, summon) => sum + summon.actions.length,
    0,
  );
  const evidenceBody = hasUnavailableSide
    ? `<div class="exact-defense-deltas">
        ${beforeEvidence.length
          ? availableSide("Before", beforeEvidence)
          : blockedSide("Before", beforeUnavailable)}
        ${afterEvidence.length
          ? availableSide("After", afterEvidence)
          : blockedSide("After", afterUnavailable)}
      </div>`
    : changes.length
    ? changes.map((change) => `<article class="support-change ${change.kind}">
        <div class="support-change-head"><span>${esc(change.kind)}</span><strong>${esc(change.skillName)}</strong></div>
        <div class="support-term-sides">
          ${summonTermSide(change.before, "Before")}
          ${summonTermSide(change.after, "After")}
        </div>
      </article>`).join("")
    : `<div class="summon-steady">
        <strong>No intrinsic summon source term changed.</strong>
        <p>The active terms are shown for orientation; other equipment, supports, traits, and tree state can still differ.</p>
        <div class="summon-steady-grid">
          ${(afterEvidence.length ? afterEvidence : beforeEvidence)
            .map((evidence) => summonTermSide(evidence, "Active evidence"))
            .join("")}
        </div>
      </div>`;
  return `<section class="support-evidence-panel summon-evidence-panel">
    <div class="partial-proof-head">
      <div><span class="eyebrow">Actor + action evidence</span><h3>What each Spirit Magus action starts from</h3></div>
      <div class="partial-badges"><span>SS13 source terms</span><b>Not minion DPS</b><b>Not total EHP</b></div>
    </div>
    <p>The installed actor baseline and action records, socket terms, enabled summon-skill records, conversion, and Origin lines shown here are source-pinned. This guarded side exposes ${actorCount} installed actor record${actorCount === 1 ? "" : "s"} and ${actionCount} action record${actionCount === 1 ? "" : "s"}; it does not claim a runtime minion quantity. “Raw / contact” is only base minion damage × the action coefficient. It is useful for seeing why skill level and action choice matter, but it is not a hit total or DPS.</p>
    <div class="summon-boundaries">
      <div><strong>${compilerBlockers.length || hasUnavailableSide ? "Actor/action evidence blocked" : "Minion DPS blocked"}</strong><span>${minionDpsBlockers.map((blocker) => esc(blocker)).join(" ")}</span></div>
      <div><strong>Total EHP blocked</strong><span>${playerEhpBlockers.map((blocker) => esc(blocker)).join(" ")}</span></div>
    </div>
    ${foundationRows.length ? `<div class="minion-foundation-deltas">
      <div class="minion-foundation-head"><span>Action foundation</span><span>Before</span><span>After</span><span>Raw ratio</span></div>
      ${foundationRows.map((row) => `<div>
        <span><strong>${esc(row.actionName)}</strong><small>${esc(row.skillName)} · ${esc(row.scope)}</small></span>
        <b>${esc(compactNumber(row.beforeValue))}</b>
        <b>${esc(compactNumber(row.afterValue))}</b>
        <b>${row.ratio == null ? "—" : `×${esc(compactNumber(row.ratio))}`}</b>
      </div>`).join("")}
      <p>Ratios describe only the source-pinned actor base × action coefficient. They do not include supports, player/minion modifiers, AI frequency, or target contact.</p>
    </div>` : ""}
    <div class="support-change-list">${evidenceBody}</div>
    ${beforeReference || afterReference ? `<details class="iris-trait-evidence">
      <summary>Iris trait inputs · candidate values remain explicit</summary>
      <div class="${traitsChanged ? "changed" : "steady"}">
        ${traitsChanged
          ? `${irisTraitSide(beforeReference, "Before")}${irisTraitSide(afterReference, "After")}`
          : irisTraitSide(
              afterReference ?? beforeReference,
              bothSidesGuarded ? "Active on both sides" : "Available guarded side",
            )}
      </div>
    </details>` : ""}
    ${provenanceLinks(provenance)}
  </section>`;
}

function renderLocalCaptureHandoff(...loadouts: AnalyzedLoadout[]) {
  const handoff = loadouts.find((loadout) => loadout.resolutionHandoff)?.resolutionHandoff;
  if (!handoff) return "";
  return `<section class="capture-handoff" aria-labelledby="capture-handoff-title">
    <div class="capture-handoff-head">
      <div>
        <span class="eyebrow">Local resolution required</span>
        <h3 id="capture-handoff-title">Turn this code into build data</h3>
      </div>
      <code>${esc(handoff.buildCode)}</code>
    </div>
    <ol>
      ${handoff.steps.map((step) => `<li>
        <span aria-hidden="true"></span>
        <div><strong>${esc(step.title)}</strong><p>${esc(step.detail)}</p></div>
      </li>`).join("")}
    </ol>
    <p class="capture-privacy"><strong>Private by design:</strong> TLI Lens cannot attach to the game process. Only the JSON you explicitly paste or drop is read, in this browser.</p>
  </section>`;
}

function renderDiagnosis(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  if (!before.snapshot || !after.snapshot || !before.model || !after.model) {
    return `<div class="content-grid">
      <section class="analysis-panel empty-analysis">
        <span class="eyebrow">Diagnosis</span>
        <h2>The builds imported. The investigation can start now.</h2>
        <p>${esc(after.sourceNote ?? before.sourceNote ?? "This build format is not connected to the damage model yet.")}</p>
        ${renderLocalCaptureHandoff(after, before)}
        ${renderPartialComparison(before, after)}
        ${renderBingIntrinsicComparison(before, after)}
        ${renderSupportTermChanges(before, after)}
        ${renderSummonTermChanges(before, after)}
        ${renderStructuralDiagnosis(before, after)}
        <div class="honesty-grid">
          <div><span>Imported</span><strong>Loadout structure</strong><p>Items, skills, trees, memories, slates, and pacts.</p></div>
          <div><span>Prioritized</span><strong>Changes to investigate</strong><p>Support, weapon, tree, and secondary-system differences.</p></div>
          <div><span>Not guessed</span><strong>DPS and EHP</strong><p>Unavailable values stay unavailable instead of becoming false zeroes.</p></div>
        </div>
      </section>
      ${nextChecks(null, after)}
    </div>`;
  }
  const steps = buildWaterfall(before.snapshot, after.snapshot);
  const totalDelta = after.model.dps - before.model.dps;
  const max = Math.max(1, ...steps.map((step) => Math.abs(step.delta)));
  return `<div class="content-grid">
    <section class="analysis-panel">
      <div class="analysis-heading">
        <div>
          <span class="eyebrow">Why damage changed</span>
          <h2>The short answer</h2>
        </div>
        <span class="exact-badge">Reconciles to ${esc(compactNumber(after.model.dps))}</span>
      </div>
      <p class="short-answer">${shortAnswer(steps, totalDelta)}</p>
      ${renderTradeoff(steps)}
      <div class="waterfall-head">
        <span>Formula layer</span><span>Replay contribution</span><span>Δ DPS</span>
      </div>
      <div class="waterfall">${steps.map((step) => waterfallRow(step, max)).join("")}</div>
      <div class="method-note">
        <strong>How to read this:</strong> layers are replayed in fixed formula order so the rows add up exactly.
        Field details show isolated swaps against Build A; multiplicative interactions mean those details can overlap.
      </div>
    </section>
    ${nextChecks(steps, after)}
  </div>`;
}

function rowChange(before: string, after: string, changed: boolean) {
  const kind = presentedChangeKind(before, after, changed);
  return `<span class="change-tag ${kind}">${kind}</span>`;
}

function gearChangeRows(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const a = new Map(before.gear.map((row) => [row.slot, row]));
  const b = new Map(after.gear.map((row) => [row.slot, row]));
  const slots = [...new Set([...a.keys(), ...b.keys()])];
  return slots.map((slot) => {
    const left = a.get(slot) ?? { slot, name: "Empty", rarity: null, category: null, lines: [] };
    const right = b.get(slot) ?? { slot, name: "Empty", rarity: null, category: null, lines: [] };
    return {
      key: slot,
      label: slot.replace(/([a-z])([A-Z])/g, "$1 $2"),
      before: left.name,
      after: right.name,
      beforeDetail: left.lines.slice(0, 6),
      afterDetail: right.lines.slice(0, 6),
      changed: left.name !== right.name || JSON.stringify(left.lines) !== JSON.stringify(right.lines),
    };
  });
}

function skillName(skill: SkillRow | undefined) {
  return skillDisplay(skill);
}

function supportDetail(support: SkillRow["supports"][number]) {
  return [
    support.name,
    support.level != null ? `L${support.level}` : "",
    support.tier != null ? `T${support.tier}` : "",
    support.rank != null ? `R${support.rank}` : "",
    support.rollValues?.length ? `rolls ${support.rollValues.join(" / ")}` : "",
  ].filter(Boolean).join(" · ");
}

function skillChangeRows(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const leftBySlot = new Map(before.skills.map((skill) => [skill.slot, skill]));
  const rightBySlot = new Map(after.skills.map((skill) => [skill.slot, skill]));
  const order = new Map<SkillRow["kind"], number>([
    ["active", 0],
    ["passive", 1],
    ["support", 2],
    ["unknown", 3],
  ]);
  const slots = [...new Set([...leftBySlot.keys(), ...rightBySlot.keys()])]
    .sort((leftSlot, rightSlot) => {
      const left = leftBySlot.get(leftSlot) ?? rightBySlot.get(leftSlot)!;
      const right = leftBySlot.get(rightSlot) ?? rightBySlot.get(rightSlot)!;
      const kindOrder = (order.get(left.kind) ?? 9) - (order.get(right.kind) ?? 9);
      if (kindOrder) return kindOrder;
      const leftIndex = Number(leftSlot.split(":").at(-1));
      const rightIndex = Number(rightSlot.split(":").at(-1));
      if (Number.isFinite(leftIndex) && Number.isFinite(rightIndex)) {
        return leftIndex - rightIndex;
      }
      return leftSlot.localeCompare(rightSlot);
    });
  return slots.map((slot) => {
    const left = leftBySlot.get(slot);
    const right = rightBySlot.get(slot);
    const reference = right ?? left!;
    const rawIndex = Number(slot.split(":").at(-1));
    const label = Number.isSafeInteger(rawIndex) && rawIndex >= 0
      ? `${reference.kind} ${rawIndex + 1}`
      : slot.replaceAll(":", " ");
    return {
      key: slot,
      label,
      before: skillName(left),
      after: skillName(right),
      beforeDetail: left?.supports.map(supportDetail) ?? [],
      afterDetail: right?.supports.map(supportDetail) ?? [],
      changed: JSON.stringify(left) !== JSON.stringify(right),
    };
  });
}

function simpleChangeRows(before: AnalyzedLoadout, after: AnalyzedLoadout, section: ChangeSection) {
  const config = {
    trees: {
      a: before.trees,
      b: after.trees,
      label: (_item: any, index: number) => `tree ${index + 1}`,
      value: (item: any) => item ? `${item.name} · ${item.points} pts${item.hasPrism ? " · prism" : ""}` : "Empty",
      detail: (item: any) => item ? [
        item.notable12 ? `12-point notable · ${item.notable12}` : "",
        item.notable24 ? `24-point notable · ${item.notable24}` : "",
        item.prismId ? `Prism · ${item.prismId}` : "",
        ...Object.entries<number>(item.nodePoints ?? {})
          .filter(([, points]) => points > 0)
          .slice(0, 9)
          .map(([node, points]) => `${node} · ${points} pt${points === 1 ? "" : "s"}`),
      ].filter(Boolean) : [],
    },
    memories: {
      a: before.memories,
      b: after.memories,
      label: (item: any, index: number) => item?.slot ?? `memory ${index + 1}`,
      value: (item: any) => item ? `${item.name} · ${item.affixes} affixes` : "Empty",
      detail: (item: any) => item?.lines ?? [],
    },
    slates: {
      a: before.slates,
      b: after.slates,
      label: (_item: any, index: number) => `slate ${index + 1}`,
      value: (item: any) => item ? `${item.name} · ${item.affixes} affixes` : "Empty",
      detail: (item: any) => item?.lines ?? [],
    },
    pacts: {
      a: before.pactspirits,
      b: after.pactspirits,
      label: (_item: any, index: number) => `pact ${index + 1}`,
      value: (item: any) => item ? `${item.name}${item.level ? ` · L${item.level}` : ""} · ${item.nodes} nodes · ${item.kismets} kismets` : "Empty",
      detail: (item: any) => item?.details ?? [],
    },
  }[section as Exclude<ChangeSection, "gear" | "skills">];
  if (!config) return [];
  return Array.from({ length: Math.max(config.a.length, config.b.length) }, (_, index) => {
    const left = config.a[index];
    const right = config.b[index];
    const aValue = config.value(left);
    const bValue = config.value(right);
    return {
      key: `${section}-${index}`,
      label: config.label(right ?? left, index),
      before: aValue,
      after: bValue,
      beforeDetail: config.detail(left),
      afterDetail: config.detail(right),
      changed: JSON.stringify(left) !== JSON.stringify(right),
    };
  });
}

function changeCount(before: AnalyzedLoadout, after: AnalyzedLoadout, section: ChangeSection) {
  const rows = section === "gear" ? gearChangeRows(before, after)
    : section === "skills" ? skillChangeRows(before, after)
      : simpleChangeRows(before, after, section);
  return rows.filter((row) => row.changed).length;
}

function lineTemplate(line: string) {
  return line
    .toLocaleLowerCase()
    .replace(/[+-]?\d+(?:\.\d+)?/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

function renderDetailLines(
  lines: string[],
  otherLines: string[],
  side: "before" | "after",
) {
  if (!lines.length) return "";
  const otherExact = new Set(otherLines);
  const otherTemplates = new Set(otherLines.map(lineTemplate));
  return `<ul>${lines.map((line) => {
    const status = otherExact.has(line)
      ? "same"
      : otherTemplates.has(lineTemplate(line)) ? "roll" : side === "before" ? "removed" : "added";
    const marker = status === "same" ? "·" : status === "roll" ? "±" : side === "before" ? "−" : "+";
    return `<li class="detail-line ${status}"><i aria-hidden="true">${marker}</i>${esc(line)}</li>`;
  }).join("")}</ul>`;
}

function renderChangeRow(row: ReturnType<typeof gearChangeRows>[number]) {
  return `<article class="diff-row ${row.changed ? "is-changed" : "is-same"}">
    <div class="diff-slot"><span>${esc(row.label)}</span>${rowChange(row.before, row.after, row.changed)}</div>
    <div class="diff-side before">
      <span class="diff-side-label">Before</span><strong>${esc(row.before)}</strong>
      ${renderDetailLines(row.beforeDetail, row.afterDetail, "before")}
    </div>
    <div class="diff-arrow" aria-hidden="true">→</div>
    <div class="diff-side after">
      <span class="diff-side-label">After</span><strong>${esc(row.after)}</strong>
      ${renderDetailLines(row.afterDetail, row.beforeDetail, "after")}
    </div>
  </article>`;
}

function renderChanges(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const sections: { id: ChangeSection; label: string }[] = [
    { id: "gear", label: "Gear" },
    { id: "skills", label: "Skills" },
    { id: "trees", label: "Talent trees" },
    { id: "memories", label: "Memories" },
    { id: "slates", label: "Slates" },
    { id: "pacts", label: "Pactspirits" },
  ];
  const rows = changeSection === "gear" ? gearChangeRows(before, after)
    : changeSection === "skills" ? skillChangeRows(before, after)
      : simpleChangeRows(before, after, changeSection);
  const changed = rows.filter((row) => row.changed);
  const visible = changed.length ? changed : rows;
  return `<section class="changes-layout">
    <aside class="changes-nav">
      <span class="panel-kicker">Build systems</span>
      ${sections.map((section) => `<button type="button" class="${changeSection === section.id ? "active" : ""}"
        data-change-section="${section.id}">
        <span>${esc(section.label)}</span><b>${changeCount(before, after, section.id)}</b>
      </button>`).join("")}
    </aside>
    <div class="changes-panel">
      <div class="analysis-heading">
        <div><span class="eyebrow">Changed only</span><h2>${esc(sections.find((section) => section.id === changeSection)?.label)}</h2></div>
        <span class="exact-badge">${changed.length} changed</span>
      </div>
      <p class="section-intro">Compare the source entities first; modeled formula impact is kept separate so unsupported data stays visible.</p>
      <div class="diff-list">
        ${visible.length ? visible.map(renderChangeRow).join("") : `<div class="empty-list">Nothing was imported in this section.</div>`}
      </div>
    </div>
  </section>`;
}

function formulaSideControls() {
  return `<div class="segmented" aria-label="Formula side">
    <button type="button" class="${formulaSide === "before" ? "active" : ""}" data-formula-side="before">Before</button>
    <button type="button" class="${formulaSide === "after" ? "active" : ""}" data-formula-side="after">After</button>
  </div>`;
}

function renderMinionFormulaView(active: AnalyzedLoadout) {
  const summons = active.summonEvidence ?? [];
  const supportBlockers = summons.flatMap((summon) =>
    summon.supports
      .filter((support) => support.status === "unsupported")
      .flatMap((support) => support.blockerEvidence?.length
        ? support.blockerEvidence.map((blocker) =>
            `${blocker.message}${blocker.evidence ? ` Source: ${blocker.evidence}.` : ""}`)
        : support.blockers));
  const blockers = [...new Set(
    [
      ...summons.flatMap((summon) => summon.minionDps.blockers),
      ...supportBlockers,
    ],
  )];
  const provenance = summons.flatMap((summon) => summon.provenance);
  return `<section class="formula-panel minion-formula-panel">
    <div class="analysis-heading">
      <div><span class="eyebrow">Guarded minion arithmetic</span><h2>${esc(active.name)}</h2></div>
      ${formulaSideControls()}
    </div>
    <div class="minion-formula-primer">
      <span>actor base damage</span><i>×</i><span>action coefficient</span><i>×</i><span>deterministic contacts, if known</span><i>=</i><strong>raw action foundation</strong>
    </div>
    <p class="section-intro">This is the first source-complete arithmetic layer for the summoned actor. It deliberately stops before minion/player modifiers, AI action frequency, target overlap, and enemy mitigation.</p>
    <div class="minion-formula-actors">
      ${summons.map((summon) => `<article>
        <div class="minion-formula-actor-head">
          <div><span>${esc(summon.skillName)} · L${summon.level}</span><strong>${esc(compactNumber(summon.baseline.baseDamage))} base damage</strong></div>
          <div><span>Base Life</span><b>${esc(compactNumber(summon.baseline.baseLife))}</b></div>
          <div><span>Base Armor</span><b>${esc(compactNumber(summon.baseline.baseArmor))}</b></div>
          <em>${summon.baseline.confidence === "confirmed-partial" ? "confirmed actor row" : "shared actor row · inferred"}</em>
        </div>
        <div class="minion-formula-table">
          <div class="minion-formula-row head"><span>Action</span><span>Coefficient</span><span>Contacts</span><span>Raw / contact</span><span>Known full contact</span></div>
          ${summon.actions.map((action) => {
            const foundation = action.foundation;
            return `<div class="minion-formula-row">
              <span><strong>${esc(action.actionName)}</strong><small>${esc(action.role)} · cast ${action.castTimeSeconds}s${action.cooldownSeconds == null ? "" : ` · CD ${action.cooldownSeconds}s`}</small></span>
              <b>${foundation.baseDamagePctPerContact == null ? "—" : `${esc(compactNumber(foundation.baseDamagePctPerContact))}%`}</b>
              <b>${foundation.deterministicContacts == null ? "runtime" : esc(String(foundation.deterministicContacts))}</b>
              <b>${foundation.rawDamagePerContact == null ? "—" : esc(compactNumber(foundation.rawDamagePerContact))}</b>
              <b>${foundation.rawDamageAtDeterministicFullContact == null ? "not proven" : esc(compactNumber(foundation.rawDamageAtDeterministicFullContact))}</b>
            </div>`;
          }).join("")}
        </div>
      </article>`).join("")}
    </div>
    <div class="model-boundary">
      <div class="boundary-icon">!</div>
      <div><strong>Raw action foundations are not hit totals or minion DPS.</strong>
      <p>${blockers.map((blocker) => esc(blocker)).join(" ")}</p></div>
    </div>
    ${provenanceLinks(provenance)}
  </section>`;
}

function renderFormula(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const active = formulaSide === "before" ? before : after;
  if (!active.snapshot || !active.model) {
    if (active.summonEvidence?.length) return renderMinionFormulaView(active);
    const partial = weaponFoundation(active);
    if (partial) {
      return `<section class="formula-panel partial-formula">
        <div class="analysis-heading">
          <div><span class="eyebrow">Guarded partial arithmetic</span><h2>${esc(active.name)}</h2></div>
          ${formulaSideControls()}
        </div>
        <div class="partial-formula-total">
          <div><span>${esc(partial.label)}</span><strong>${esc(partial.display)}</strong><small>${esc(partial.unit)}</small></div>
          <b>NOT DPS</b>
        </div>
        <div class="partial-equation" aria-label="Partial formula">
          ${partial.inputs.map((input, index) => `${index ? `<i>${index === 1 ? "×" : "+"}</i>` : ""}
            <span><small>${esc(input.label)}</small><strong>${esc(input.display)}</strong></span>`).join("")}
          <i>=</i><span class="result"><small>Raw foundation</small><strong>${esc(partial.display)}</strong></span>
        </div>
        <p class="section-intro">${esc(partial.scope)}. Its ${partial.confidence === "confirmed-partial" ? "formula and imported inputs are confirmed" : "formula is confirmed and one routing rule is inferred"}.</p>
        ${active.bingIntrinsicEvidence ? `<section class="bing-formula-envelope">
          <div><span class="panel-kicker">Next guarded layer</span><h3>Conversion, Demolisher, and emission topology</h3></div>
          <p>The hit envelope and the emission envelope stay separate until target geometry and cadence are known.</p>
          ${bingIntrinsicSide(active.bingIntrinsicEvidence, sideLabel(formulaSide))}
        </section>` : active.bingIntrinsicBlockers?.length
          ? `<section class="bing-formula-envelope">
              <div><span class="panel-kicker">Next guarded layer blocked</span><h3>Conversion, Demolisher, and emission topology</h3></div>
              <ul class="guarded-unavailable-list">${active.bingIntrinsicBlockers.map((blocker) =>
                `<li><strong>${esc(blocker.message)}</strong>${blocker.evidence ? `<small>${esc(blocker.evidence)}</small>` : ""}</li>`).join("")}</ul>
            </section>`
          : ""}
        <div class="partial-detail-grid">
          <div>
            <span class="panel-kicker">Source trail</span>
            <ul>${partial.provenance.slice(0, 8).map((source) =>
              `<li>${provenanceLabel(source.source)}<span>${esc(source.locator)}</span></li>`).join("")}</ul>
          </div>
          <div>
            <span class="panel-kicker">Deliberately excluded</span>
            <ul>${partial.excluded.map((item) => `<li><span>${esc(item)}</span></li>`).join("")}</ul>
          </div>
        </div>
        <div class="model-boundary">
          <div class="boundary-icon">!</div>
          <div><strong>This number must not be read as total hit damage or DPS.</strong>
          <p>The full build still needs its actor, support, rotation, target, and uptime compilers.</p></div>
        </div>
      </section>`;
    }
    return `<section class="single-panel empty-analysis">
      <div class="analysis-heading">
        <div><span class="eyebrow">Exact formula</span><h2>Not calculated for this import</h2></div>
        ${formulaSideControls()}
      </div>
      <p>${esc(active.sourceNote ?? "This build is not connected to a compatible damage model.")}</p>
      ${active.bingIntrinsicBlockers?.length || active.summonEvidenceBlockers?.length
        ? `<ul class="guarded-unavailable-list">${[
            ...(active.bingIntrinsicBlockers ?? []),
            ...(active.summonEvidenceBlockers ?? []),
          ].map((blocker) => `<li><strong>${esc(blocker.message)}</strong>${blocker.evidence ? `<small>${esc(blocker.evidence)}</small>` : ""}</li>`).join("")}</ul>`
        : ""}
      ${renderLocalCaptureHandoff(active)}
    </section>`;
  }
  const result = cycleDps(active.snapshot);
  return `<section class="formula-panel">
    <div class="analysis-heading">
      <div><span class="eyebrow">Exact arithmetic</span><h2>${esc(active.name)}</h2></div>
      ${formulaSideControls()}
    </div>
    <p class="section-intro">Every chip below is used by the real damage model. Its impact badge shows what happens if that factor is neutralized.</p>
    <div class="formula-primer" aria-label="Damage formula overview">
      <span>base hit</span><i>×</i><span>increased pool</span><i>×</i><span>additional layers</span>
      <i>×</i><span>crit expectation</span><i>×</i><span>mitigation</span><i>×</i><span>cadence</span><i>+</i><span>DoT</span>
    </div>
    ${renderBreakdown(result.trace)}
    <div class="method-note"><strong>Important:</strong> this is supported boss DPS under the displayed scenario, not a promise of target-dummy or map damage.</div>
  </section>`;
}

interface GuardedCoverageItem {
  label: string;
  state: "ready" | "blocked";
}

function guardedCoverageItems(loadout: AnalyzedLoadout) {
  const items: GuardedCoverageItem[] = [];
  if (loadout.partialMetrics?.length && !loadout.bingIntrinsicEvidence) {
    items.push({
      label: `${loadout.partialMetrics.length} guarded partial metric${loadout.partialMetrics.length === 1 ? "" : "s"}`,
      state: "ready",
    });
  }
  if (loadout.bingIntrinsicEvidence) {
    items.push({ label: "Hammer per-hit envelope ready", state: "ready" });
    items.push(loadout.bingIntrinsicEvidence.topology.status === "calculated-partial"
      ? { label: "Blast Nova emissions ready", state: "ready" }
      : { label: "Blast Nova emissions blocked", state: "blocked" });
  } else if (loadout.bingIntrinsicBlockers?.length) {
    items.push({
      label: `Hammer envelope blocked · ${loadout.bingIntrinsicBlockers.length}`,
      state: "blocked",
    });
  }
  if (loadout.supportEvidence?.length) {
    const compiled = loadout.supportEvidence.filter((support) =>
      support.status === "source-terms").length;
    const blocked = loadout.supportEvidence.length - compiled;
    if (compiled) {
      items.push({
        label: `${compiled} compiled main-skill support${compiled === 1 ? "" : "s"}`,
        state: "ready",
      });
    }
    if (blocked) {
      items.push({
        label: `${blocked} blocked main-skill support${blocked === 1 ? "" : "s"}`,
        state: "blocked",
      });
    }
  }
  if (loadout.summonEvidence?.length) {
    items.push({
      label: `${loadout.summonEvidence.reduce((sum, summon) => sum + summon.actions.length, 0)} minion actions`,
      state: "ready",
    });
    const supports = loadout.summonEvidence.flatMap((summon) => summon.supports);
    const compiledSupports = supports.filter((support) =>
      support.status === "source-terms").length;
    const unsupportedSupports = supports.length - compiledSupports;
    if (compiledSupports) {
      items.push({
        label: `${compiledSupports} compiled supports`,
        state: "ready",
      });
    }
    if (unsupportedSupports) {
      items.push({
        label: `${unsupportedSupports} unsupported support socket${unsupportedSupports === 1 ? "" : "s"}`,
        state: "blocked",
      });
    }
  } else if (loadout.summonEvidenceBlockers?.length) {
    items.push({
      label: `Spirit Magus evidence blocked · ${loadout.summonEvidenceBlockers.length}`,
      state: "blocked",
    });
  }
  const defense = defenseEvidenceResult(loadout);
  if (defense?.status === "source-terms") {
    items.push({
      label: `${defense.coverage.playerScopedTerms} player-defense terms`,
      state: "ready",
    });
    items.push({
      label: `${defense.coverage.unparsedDefensiveLines} unparsed defensive lines`,
      state: defense.coverage.unparsedDefensiveLines ? "blocked" : "ready",
    });
  } else if (defense?.status === "not-calculated") {
    items.push({
      label: `Player-defense evidence blocked · ${defense.blockers.length}`,
      state: "blocked",
    });
  }
  return items;
}

function guardedReadinessLabel(readiness: GuardedEvidenceReadiness) {
  if (readiness === "ready") return "Guarded evidence";
  if (readiness === "partial") return "Guarded · partial";
  if (readiness === "blocked") return "Guarded checks blocked";
  return "Pending";
}

function guardedCoverageChips(items: GuardedCoverageItem[]) {
  if (!items.length) return "";
  return `<div class="guarded-coverage-chips">${items.map((item) =>
    `<span class="${item.state}">${esc(item.label)}</span>`).join("")}</div>`;
}

function coverageCard(label: string, loadout: AnalyzedLoadout) {
  if (!loadout.model && !loadout.coverage) {
    const guarded = guardedCoverageItems(loadout);
    const readiness = guardedEvidenceReadiness(loadout);
    const description = readiness === "blocked"
      ? "Loadout structure imported, but guarded checks withheld their source evidence. No unavailable value is treated as zero."
      : readiness === "partial"
        ? "Some guarded source slices compiled and others were withheld. No aggregate DPS/EHP coverage percentage is claimed."
        : readiness === "ready"
          ? "Loadout structure and guarded source evidence are available. No aggregate DPS/EHP coverage percentage is claimed."
          : "Loadout structure imported; modifier classification and formula coverage have not run.";
    return `<article class="coverage-card">
      <div class="coverage-title"><span>${esc(label)}</span><strong>${guardedReadinessLabel(readiness)}</strong></div>
      <div class="coverage-meter"><span style="width:0%"></span></div>
      <p>${description}</p>
      <div class="coverage-stats"><span><b>${loadout.gear.length}</b> gear rows</span><span><b>${loadout.skills.length}</b> skills</span></div>
      ${guardedCoverageChips(guarded)}
    </article>`;
  }
  if (!loadout.model && loadout.coverage) {
    const guarded = guardedCoverageItems(loadout);
    return `<article class="coverage-card">
      <div class="coverage-title"><span>${esc(label)} · classification</span><strong>${Math.round(loadout.coverage.classificationRate * 100)}%</strong></div>
      <div class="coverage-meter"><span style="width:${Math.round(loadout.coverage.classificationRate * 100)}%"></span></div>
      <p>Modifier text was classified by the current parser, but no guarded hero/skill compiler has produced DPS.</p>
      <div class="coverage-stats">
        <span><b>${loadout.coverage.classified}</b> classified</span>
        <span><b>${loadout.coverage.unsupported}</b> unsupported</span>
        <span><b>${loadout.coverage.ignored}</b> irrelevant</span>
      </div>
      ${guardedCoverageChips(guarded)}
    </article>`;
  }
  const model = loadout.model!;
  return `<article class="coverage-card">
    <div class="coverage-title"><span>${esc(label)}</span><strong>${Math.round(model.coverage * 100)}%</strong></div>
    <div class="coverage-meter"><span style="width:${Math.round(model.coverage * 100)}%"></span></div>
    <p>${esc(confidenceLabel(loadout))}. Coverage is classified versus unmatched modifier text, not a claim of total game accuracy.</p>
    <div class="coverage-stats">
      <span><b>${model.modeled}</b> classified</span>
      <span><b>${model.unmodeled}</b> unsupported</span>
      <span><b>${model.ignored}</b> irrelevant</span>
    </div>
  </article>`;
}

function unsupportedList(label: string, loadout: AnalyzedLoadout) {
  return `<div class="unsupported-column">
    <div class="unsupported-head"><strong>${esc(label)}</strong><span>${loadout.unmatched.length} patterns shown</span></div>
    ${loadout.unmatched.length
      ? `<ul>${loadout.unmatched.slice(0, 12).map((row) => `<li>
          <span>${esc(row.text)}</span>${row.count > 1 ? `<b>×${row.count}</b>` : ""}
        </li>`).join("")}</ul>`
      : `<p class="empty-list">No unsupported text was included in this import report.</p>`}
  </div>`;
}

function renderCoverage(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const minion = isMinionLoadout(before) || isMinionLoadout(after);
  const bothModeled = Boolean(before.model && after.model);
  return `<section class="coverage-panel">
    <div class="analysis-heading">
      <div><span class="eyebrow">Trust the boundaries</span><h2>Coverage & assumptions</h2></div>
      <span class="exact-badge">${bothModeled ? (minion ? "Experimental build type" : "Partial model") : "Evidence boundary"}</span>
    </div>
    <p class="section-intro">A calculated number is only useful when you can see what was imported, classified, assumed, and left unsupported.</p>
    <div class="coverage-grid">
      ${coverageCard("Before", before)}
      ${coverageCard("After", after)}
    </div>
    ${minion ? `<div class="model-boundary">
      <div class="boundary-icon">!</div>
      <div><strong>Minion DPS is not settled by the player-hit formula.</strong>
      <p>Actor baselines, action coefficients, cast/cooldown topology, sockets, and Iris trait candidates are visible. Quantity, AI/uptime, Growth/Breeze state, complete minion modifiers, overlap, and target state still block DPS.</p></div>
    </div>` : ""}
    ${bothModeled
      ? `<div class="assumption-grid">
          <div><span>Target</span><strong>Boss, 30% elemental and erosion resistance</strong></div>
          <div><span>Uptime</span><strong>Configured buffs and debuffs at full modeled uptime</strong></div>
          <div><span>Defense</span><strong>Not calculated yet; unavailable is not zero</strong></div>
          <div><span>Attribution</span><strong>Fixed replay order with overlapping isolated checks</strong></div>
        </div>`
      : `<div class="assumption-grid">
          <div><span>Target</span><strong>No target scenario applied</strong></div>
          <div><span>Uptime</span><strong>No rotation or uptime assumed</strong></div>
          <div><span>Defense</span><strong>Typed source inputs where available; EHP is unavailable</strong></div>
          <div><span>Attribution</span><strong>Source entities prioritized without assigning DPS direction</strong></div>
        </div>`}
    <div class="unsupported-grid">
      ${unsupportedList("Before · unsupported", before)}
      ${unsupportedList("After · unsupported", after)}
    </div>
  </section>`;
}

const DEFENSE_COPY: Record<DefenseCategory, { label: string; explanation: string }> = {
  life: {
    label: "Life pool",
    explanation: "Flat and percentage maximum Life establish the pool that later mitigation protects.",
  },
  energy: {
    label: "Energy Shield & barriers",
    explanation: "Energy Shield and barrier effects add a separate pool whose recharge, regain, and uptime matter.",
  },
  resistance: {
    label: "Resistances",
    explanation: "Resistance values must be evaluated against their cap and the incoming damage type.",
  },
  armor: {
    label: "Armor",
    explanation: "Armor mitigation depends on the size of the incoming physical hit; the sheet number alone is not EHP.",
  },
  evasion: {
    label: "Evasion",
    explanation: "Avoidance changes expected hit frequency, but does not reduce a hit that connects.",
  },
  avoidance: {
    label: "Block & avoidance",
    explanation: "Block, dodge, and avoidance need their chance, effect, and eligible hit types to become expected EHP.",
  },
  recovery: {
    label: "Recovery",
    explanation: "Regain and restoration improve sustained survival, but are not part of one-hit effective health.",
  },
  mitigation: {
    label: "Damage mitigation",
    explanation: "Damage-taken, Injury Buffer, and Fortitude effects are late defensive layers and often conditional.",
  },
};

function defenseEvidenceList(
  rows: DefenseCategoryDiff["removed"],
  side: Side,
) {
  if (!rows.length) return "";
  return `<div class="defense-delta ${side}">
    <span>${side === "before" ? "Only before" : "Only after"}</span>
    <ul>${rows.slice(0, 6).map((row) => `<li>
      <strong>${esc(row.text)}</strong><small>${esc(row.source)}</small>
    </li>`).join("")}</ul>
    ${rows.length > 6 ? `<small>+${rows.length - 6} more imported lines</small>` : ""}
  </div>`;
}

function exactDefense(loadout: AnalyzedLoadout): PlayerDefenseDisplayEvidence | null {
  const evidence = loadout.playerDefenseEvidence;
  return evidence?.status === "source-terms" ? evidence : null;
}

function defenseEvidenceResult(
  loadout: AnalyzedLoadout,
): PlayerDefenseDisplayEvidenceResult | null {
  return loadout.playerDefenseEvidence ?? null;
}

function defenseTermKey(term: PlayerDefenseDisplayTerm) {
  return JSON.stringify({
    stat: term.stat,
    operation: term.operation,
    value: term.value,
    candidateValues: term.candidateValues,
    scope: term.scope,
    condition: term.condition,
    text: term.text,
    sourceKind: term.source.kind,
  });
}

function defenseTermDifference(
  left: PlayerDefenseDisplayTerm[],
  right: PlayerDefenseDisplayTerm[],
) {
  const counts = new Map<string, number>();
  for (const term of right) {
    const key = defenseTermKey(term);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return left.filter((term) => {
    const key = defenseTermKey(term);
    const count = counts.get(key) ?? 0;
    if (!count) return true;
    counts.set(key, count - 1);
    return false;
  });
}

function exactSourceSumChanges(
  before: PlayerDefenseDisplayEvidence,
  after: PlayerDefenseDisplayEvidence,
) {
  const left = new Map(before.sourceSums.map((sum) => [sum.key, sum]));
  const right = new Map(after.sourceSums.map((sum) => [sum.key, sum]));
  return [...new Set([...left.keys(), ...right.keys()])].flatMap((key) => {
    const a = left.get(key);
    const b = right.get(key);
    const beforeValue = a?.value ?? 0;
    const afterValue = b?.value ?? 0;
    if (beforeValue === afterValue) return [];
    const reference = b ?? a!;
    const sign = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${compactNumber(Math.abs(value))}${reference.unit === "percent" ? "%" : ""}`;
    return [{
      key,
      label: reference.statLabel,
      operation: reference.operationLabel,
      scope: reference.scopeLabel,
      before: sign(beforeValue),
      after: sign(afterValue),
      delta: sign(afterValue - beforeValue),
    }];
  });
}

function exactDefenseTermList(
  terms: PlayerDefenseDisplayTerm[],
  side: Side,
  label = side === "before" ? "Only before" : "Only after",
) {
  if (!terms.length) return `<div class="exact-defense-terms empty ${side}"><span>${label}</span><p>No source term in this column.</p></div>`;
  return `<div class="exact-defense-terms ${side}">
    <span>${label}</span>
    <ul>${terms.slice(0, 8).map((term) => `<li>
      <b>${esc(term.display)}</b>
      <span><strong>${esc(term.statLabel)}</strong><small>${esc(term.source.kindLabel)}${term.source.label ? ` · ${esc(term.source.label)}` : ""} · ${esc(term.benefitLabel)}</small><small>${esc(term.condition ?? term.text)}</small></span>
    </li>`).join("")}</ul>
    ${terms.length > 8 ? `<small>+${terms.length - 8} more exact source terms</small>` : ""}
  </div>`;
}

function unavailableDefenseCard(
  label: string,
  result: PlayerDefenseDisplayEvidenceResult | null,
) {
  const blockers = result?.status === "not-calculated" ? result.blockers : [];
  return `<div class="exact-defense-unavailable">
    <span>${esc(label)}</span>
    <strong>Typed defense evidence unavailable</strong>
    ${blockers.length
      ? `<ul>${blockers.map((blocker) => `<li>${esc(blocker.message)}${blocker.evidence ? `<small>${esc(blocker.evidence)}</small>` : ""}</li>`).join("")}</ul>`
      : `<p>This import has no guarded player-defense compiler result. Structural gear text remains visible below, but it is not equivalent to a complete source pass.</p>`}
  </div>`;
}

function renderExactDefenseComparison(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const leftResult = defenseEvidenceResult(before);
  const rightResult = defenseEvidenceResult(after);
  const left = exactDefense(before);
  const right = exactDefense(after);
  if (!left || !right) {
    const available = left ?? right;
    const availableSide: Side = left ? "before" : "after";
    return `<section class="exact-defense-evidence">
      <div class="partial-proof-head">
        <div><span class="eyebrow">Typed player-defense inputs</span><h3>No A/B defense delta without evidence on both sides</h3></div>
        <div class="partial-badges"><b>One-sided evidence preserved</b><b>Not EHP</b></div>
      </div>
      <p>${available
        ? `${sideLabel(availableSide)} has ${available.coverage.playerScopedTerms} typed player terms. The other side is unavailable, so it is not treated as zero and no source-bucket delta is calculated.`
        : "Neither side has a guarded player-defense result. The structural gear diff below remains visible, but no missing evidence is interpreted as zero."}</p>
      <div class="exact-defense-deltas">
        ${left
          ? exactDefenseTermList(left.terms, "before", "Before evidence")
          : unavailableDefenseCard("Before", leftResult)}
        ${right
          ? exactDefenseTermList(right.terms, "after", "After evidence")
          : unavailableDefenseCard("After", rightResult)}
      </div>
      ${available ? provenanceLinks(available.provenance) : ""}
    </section>`;
  }
  const sumChanges = exactSourceSumChanges(left, right);
  const removed = defenseTermDifference(left.terms, right.terms);
  const added = defenseTermDifference(right.terms, left.terms);
  const blockers = [...new Map(
    [...left.playerEhp.blockers, ...right.playerEhp.blockers]
      .map((blocker) => [blocker.code, blocker]),
  ).values()];
  const unresolved = left.coverage.unresolved.length + right.coverage.unresolved.length;
  return `<section class="exact-defense-evidence">
    <div class="partial-proof-head">
      <div><span class="eyebrow">Typed player-defense inputs</span><h3>Compare like-for-like source buckets before EHP</h3></div>
      <div class="partial-badges"><span>${left.coverage.catalog.display}</span><b>Not character totals</b><b>Not EHP deltas</b></div>
    </div>
    <p>These buckets include exact player-scoped values from equipped gear, memories, placed slates, prisms, kismets, hero traits, and supported skill effects. Local gear values and global values stay separate, and conditional terms never enter the source sums.</p>
    <div class="exact-defense-summary">
      <div><span>Before</span><strong>${left.coverage.playerScopedTerms}</strong><small>typed player terms</small></div>
      <div><span>After</span><strong>${right.coverage.playerScopedTerms}</strong><small>typed player terms</small></div>
      <div><span>Changed buckets</span><strong>${sumChanges.length}</strong><small>numeric inputs only</small></div>
      <div><span>Unresolved</span><strong>${unresolved}</strong><small>preserved source records</small></div>
    </div>
    ${sumChanges.length ? `<div class="defense-sum-list">
      <div class="defense-sum-head"><span>Source bucket</span><span>Before</span><span>After</span><span>Numeric Δ</span></div>
      ${sumChanges.map((change) => `<div class="defense-sum-row">
        <span><strong>${esc(change.label)}</strong><small>${esc(change.operation)} · ${esc(change.scope)}</small></span>
        <b>${esc(change.before)}</b><b>${esc(change.after)}</b><b>${esc(change.delta)}</b>
      </div>`).join("")}
    </div>` : `<div class="structural-empty"><strong>No unconditional source bucket changed.</strong><p>Conditional or non-summable defensive mechanics can still differ below.</p></div>`}
    <div class="exact-defense-deltas">
      ${exactDefenseTermList(removed, "before")}
      ${exactDefenseTermList(added, "after")}
    </div>
    <details class="ehp-blockers">
      <summary>Why the site still refuses to print one EHP number</summary>
      <ul>${blockers.map((blocker) => `<li><strong>${esc(blocker.message)}</strong>${blocker.evidence ? `<small>${esc(blocker.evidence)}</small>` : ""}</li>`).join("")}</ul>
    </details>
    ${provenanceLinks([...left.provenance, ...right.provenance])}
  </section>`;
}

function renderSurvival(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const comparison = compareDefense(before, after);
  const changed = comparison.categories.filter((row) => row.removed.length || row.added.length);
  return `<section class="survival-panel">
    <div class="analysis-heading">
      <div><span class="eyebrow">Survival evidence</span><h2>See what changed before calculating EHP</h2></div>
      <span class="exact-badge">Evidence only · no fake EHP</span>
    </div>
    <p class="section-intro">The typed comparison covers player-scoped gear, memories, placed slates, prisms, kismets, traits, and supported skill effects. The quick category list below remains a gear-only text diff. Neither view combines unlike defenses into a misleading score.</p>
    <div class="survival-summary">
      <div><span>Before gear evidence</span><strong>${comparison.before.length}</strong><small>defensive gear lines</small></div>
      <div><span>Only before</span><strong>${comparison.removed}</strong><small>lines to review</small></div>
      <div><span>Only after</span><strong>${comparison.added}</strong><small>lines to review</small></div>
      <div><span>Exact EHP</span><strong>Pending</strong><small>scenario compiler required</small></div>
    </div>
    ${renderExactDefenseComparison(before, after)}
    <div class="defense-category-list">
      ${changed.length ? changed.map((row) => {
        const copy = DEFENSE_COPY[row.category];
        return `<article class="defense-category">
          <div class="defense-category-head">
            <div><span>${esc(copy.label)}</span><p>${esc(copy.explanation)}</p></div>
            <b>${row.before.length} → ${row.after.length} lines</b>
          </div>
          <div class="defense-deltas">
            ${defenseEvidenceList(row.removed, "before")}
            ${defenseEvidenceList(row.added, "after")}
          </div>
        </article>`;
      }).join("") : `<div class="structural-empty">
        <strong>No defensive gear-line differences were found.</strong>
        <p>The loadouts may still differ through talents, hero traits, memories, slates, buffs, or live sheet values that this evidence pass cannot resolve yet.</p>
      </div>`}
    </div>
    <aside class="ehp-requirements">
      <div><span class="eyebrow">Required for exact EHP</span><h3>One build needs several incoming-damage scenarios</h3></div>
      <ol>
        <li><b>1</b><span><strong>Pool</strong>Live Life, Energy Shield, barrier, and reservation state.</span></li>
        <li><b>2</b><span><strong>Mitigation</strong>Actual resistances, caps, armor, damage-taken layers, and conditions.</span></li>
        <li><b>3</b><span><strong>Threat</strong>Physical, elemental, erosion, hit, and damage-over-time scenarios.</span></li>
        <li><b>4</b><span><strong>Sustain</strong>Regain, restoration, avoidance, cooldowns, and realistic uptime.</span></li>
      </ol>
    </aside>
  </section>`;
}

function navigation() {
  const items: { id: View; label: string; count?: string }[] = [
    { id: "diagnosis", label: "Diagnosis" },
    { id: "changes", label: "Build changes" },
    { id: "formula", label: "Damage formula" },
    { id: "survival", label: "Survival" },
    { id: "coverage", label: "Coverage" },
  ];
  return `<nav class="view-tabs" aria-label="Analysis views">
    ${items.map((item) => `<button type="button" data-view="${item.id}" class="${activeView === item.id ? "active" : ""}"
      ${activeView === item.id ? `aria-current="page"` : ""}>
      ${esc(item.label)}${item.count ? `<span>${esc(item.count)}</span>` : ""}
    </button>`).join("")}
    <button type="button" class="disabled-tab" disabled title="Optimizer is not implemented yet">Suggestions <span>later</span></button>
  </nav>`;
}

function render() {
  const before = selected("before");
  const after = selected("after");
  let content = "";
  if (activeView === "diagnosis") content = renderDiagnosis(before.loadout, after.loadout);
  else if (activeView === "changes") content = renderChanges(before.loadout, after.loadout);
  else if (activeView === "formula") content = renderFormula(before.loadout, after.loadout);
  else if (activeView === "survival") content = renderSurvival(before.loadout, after.loadout);
  else content = renderCoverage(before.loadout, after.loadout);

  app.innerHTML = `<header class="site-header">
    <div class="header-inner">
      <a class="brand" href="/" aria-label="TLI Lens home">
        <span class="brand-mark"><i></i></span>
        <span><b>TLI</b> Lens</span>
        <em>alpha</em>
      </a>
      <nav class="primary-nav" aria-label="Primary">
        <a href="#workspace" class="active">Compare</a>
        <a href="#formula-guide" data-view-link="formula">Learn scaling</a>
      </nav>
      <div class="header-meta">
        <span class="season-dot"></span>SS13 data
        <a href="https://github.com/ChandlerFerry/etor-translations/releases/" target="_blank" rel="noopener">Game tools ↗</a>
      </div>
    </div>
  </header>
  <main class="workspace" id="workspace">
    <section class="workspace-intro">
      <div>
        <span class="eyebrow">Import → compare → understand</span>
        <h2>See exactly where your damage went.</h2>
        <p>Compare real loadouts, replay the formula, and separate proven changes from unsupported mechanics.</p>
      </div>
      <div class="fixture-switcher" aria-label="Demo comparisons">
        <span>Examples</span>
        <button type="button" data-preset="lesson">Scaling lesson</button>
        <button type="button" data-preset="bing">Bing loadouts</button>
        <button type="button" data-preset="wuxia">Wuxia progression</button>
      </div>
    </section>
    <section class="comparison-bar" aria-label="Build comparison">
      ${buildPicker("before", before.build, before.loadout)}
      <button type="button" class="swap-button" data-swap aria-label="Swap before and after builds">⇄<span>swap</span></button>
      ${buildPicker("after", after.build, after.loadout)}
    </section>
    ${renderSummary(before.loadout, after.loadout)}
    ${navigation()}
    <div class="view-content">${content}</div>
  </main>
  <footer class="site-footer">
    <span>TLI Lens is an independent community tool.</span>
    <span>Built around explicit assumptions, source data, and formulas you can inspect.</span>
  </footer>`;
}

function restoreWorkspaceFocus(selector: string) {
  const element = app.querySelector<HTMLElement>(selector);
  element?.focus({ preventScroll: true });
}

function setImportStatus(message: string, type: "success" | "error" | "info" = "info") {
  importStatus.className = `import-status ${type}`;
  importStatus.textContent = message;
}

function importSizeMessage(size: number) {
  const mib = Math.ceil(size / 1024 / 1024 * 10) / 10;
  return `This input is ${mib.toFixed(1)} MiB. Imports are limited to 25 MiB; export one build snapshot or remove unrelated data and try again.`;
}

function activateImported(build: AnalyzedBuild) {
  builds.push(build);
  const loadout = build.loadouts.find((item) => item.isCurrent) ?? build.loadouts[0];
  const selection = { buildId: build.id, loadoutId: loadout.id };
  if (importTarget === "before") beforeSelection = selection;
  else afterSelection = selection;
  setImportStatus(
    build.needsResolution
      ? "Build code recognized. Capture the opened build with tli_dump to resolve its loadout."
      : `${build.name} imported with ${build.loadouts.length} loadout${build.loadouts.length === 1 ? "" : "s"}.`,
    build.needsResolution ? "info" : "success",
  );
  window.setTimeout(() => {
    importDialog.close();
    render();
    restoreWorkspaceFocus(`#${importTarget}-loadout`);
  }, 450);
}

async function readFile(file: File) {
  if (file.size > MAX_IMPORT_BYTES) {
    setImportStatus(importSizeMessage(file.size), "error");
    fileInput.value = "";
    return;
  }
  try {
    setImportStatus(`Reading ${file.name}…`);
    const value = JSON.parse(await file.text());
    setImportStatus("Loading the pinned SS13 import catalog…");
    const catalog = await loadImportCatalog();
    activateImported(importBuild(value, catalog, demo.builds, file.name));
  } catch (error) {
    setImportStatus(error instanceof Error ? error.message : "The file could not be imported.", "error");
  } finally {
    fileInput.value = "";
  }
}

app.addEventListener("change", (event) => {
  const target = event.target as HTMLSelectElement;
  if (!target.matches("[data-selection]")) return;
  const selection = readSelectionKey(target.value);
  if (!selection) return;
  const side = target.dataset.selection as Side;
  if (side === "before") beforeSelection = selection;
  else afterSelection = selection;
  render();
  restoreWorkspaceFocus(`#${side}-loadout`);
});

app.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("button, a");
  if (!target) return;
  const view = target.dataset.view as View | undefined;
  const viewLink = target.dataset.viewLink as View | undefined;
  if (view || viewLink) {
    event.preventDefault();
    activeView = view ?? viewLink!;
    render();
    restoreWorkspaceFocus(`[data-view="${activeView}"]`);
    document.querySelector(".view-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const side = target.dataset.import as Side | undefined;
  if (side) {
    importTarget = side;
    setImportStatus(`Importing into ${sideLabel(side)}.`);
    importDialog.showModal();
    window.requestAnimationFrame(() => {
      importDialog.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    });
    return;
  }
  if (target.hasAttribute("data-swap")) {
    [beforeSelection, afterSelection] = [afterSelection, beforeSelection];
    render();
    restoreWorkspaceFocus("[data-swap]");
    return;
  }
  const section = target.dataset.changeSection as ChangeSection | undefined;
  if (section) {
    changeSection = section;
    render();
    restoreWorkspaceFocus(`[data-change-section="${section}"]`);
    return;
  }
  const openSection = target.dataset.openSection as ChangeSection | undefined;
  if (openSection) {
    changeSection = openSection;
    activeView = "changes";
    render();
    restoreWorkspaceFocus(`[data-change-section="${openSection}"]`);
    return;
  }
  const requestedFormulaSide = target.dataset.formulaSide as Side | undefined;
  if (requestedFormulaSide) {
    formulaSide = requestedFormulaSide;
    render();
    restoreWorkspaceFocus(`[data-formula-side="${requestedFormulaSide}"]`);
    return;
  }
  const jump = target.dataset.jumpSection;
  if (jump) {
    if (jump === "base" || jump === "increased" || jump === "additional"
      || jump === "conversion" || jump === "crit" || jump === "enemy"
      || jump === "rotation" || jump === "dot") {
      activeView = "formula";
      formulaSide = "after";
      render();
      restoreWorkspaceFocus(".bd-total");
    }
    return;
  }
  const preset = target.dataset.preset;
  if (preset === "lesson") {
    const build = builds.find((item) => item.id === "scaling-lesson")!;
    beforeSelection = { buildId: build.id, loadoutId: build.loadouts[0].id };
    afterSelection = { buildId: build.id, loadoutId: build.loadouts[1].id };
    activeView = "diagnosis";
    render();
    restoreWorkspaceFocus('[data-preset="lesson"]');
  } else if (preset === "bing") {
    const build = builds.find((item) => item.id === "bing")!;
    beforeSelection = { buildId: build.id, loadoutId: build.loadouts[2].id };
    afterSelection = { buildId: build.id, loadoutId: build.loadouts[3].id };
    activeView = "diagnosis";
    render();
    restoreWorkspaceFocus('[data-preset="bing"]');
  } else if (preset === "wuxia") {
    const build = builds.find((item) => item.id === "wuxia")!;
    beforeSelection = { buildId: build.id, loadoutId: build.loadouts[5].id };
    afterSelection = { buildId: build.id, loadoutId: build.loadouts[8].id };
    activeView = "diagnosis";
    render();
    restoreWorkspaceFocus('[data-preset="wuxia"]');
  }
});

const importTabs = [...document.querySelectorAll<HTMLButtonElement>("[data-import-tab]")];

function activateImportTab(button: HTMLButtonElement, focus = false) {
  const tab = button.dataset.importTab;
  document.querySelectorAll<HTMLElement>("[data-import-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.importPanel !== tab;
  });
  importTabs.forEach((candidate) => {
    const active = candidate === button;
    candidate.classList.toggle("active", active);
    candidate.setAttribute("aria-selected", String(active));
    candidate.tabIndex = active ? 0 : -1;
  });
  if (focus) button.focus();
  setImportStatus("");
}

importTabs.forEach((button, index) => {
  button.addEventListener("click", () => activateImportTab(button));
  button.addEventListener("keydown", (event) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % importTabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + importTabs.length) % importTabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = importTabs.length - 1;
    if (nextIndex == null) return;
    event.preventDefault();
    activateImportTab(importTabs[nextIndex], true);
  });
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void readFile(file);
});

for (const type of ["dragenter", "dragover"]) {
  dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
}
for (const type of ["dragleave", "drop"]) {
  dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
}
dropZone.addEventListener("drop", (event) => {
  const file = (event as DragEvent).dataTransfer?.files[0];
  if (file) void readFile(file);
});
dropZone.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  fileInput.click();
});

document.getElementById("analyze-paste")!.addEventListener("click", async () => {
  const raw = pasteInput.value.trim();
  if (!raw) {
    setImportStatus("Paste an in-game build code or exported JSON first.", "error");
    return;
  }
  const rawBytes = new TextEncoder().encode(raw).byteLength;
  if (rawBytes > MAX_IMPORT_BYTES) {
    setImportStatus(importSizeMessage(rawBytes), "error");
    return;
  }
  try {
    if (raw.startsWith("{")) {
      const value = JSON.parse(raw);
      setImportStatus("Loading the pinned SS13 import catalog…");
      const catalog = await loadImportCatalog();
      activateImported(importBuild(value, catalog, demo.builds, "Pasted JSON"));
    } else {
      activateImported(importBuildCode(raw));
    }
  } catch (error) {
    setImportStatus(error instanceof Error ? error.message : "The pasted data could not be imported.", "error");
  }
});

importDialog.addEventListener("close", () => {
  pasteInput.value = "";
  setImportStatus("");
});

async function initializeWorkspace() {
  try {
    const response = await fetch(demoDataUrl);
    if (!response.ok) {
      throw new Error(`Fixture data could not be loaded (${response.status}).`);
    }
    demo = await response.json() as DemoData;
    const initial = demo.builds.find((build) => build.id === "scaling-lesson");
    if (!initial || initial.loadouts.length < 2) {
      throw new Error("The comparison fixture set is incomplete.");
    }
    builds.push(...structuredClone(demo.builds));
    beforeSelection = {
      buildId: initial.id,
      loadoutId: initial.loadouts[0].id,
    };
    afterSelection = {
      buildId: initial.id,
      loadoutId: initial.loadouts[1].id,
    };
    render();
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "The comparison workspace could not be loaded.";
    app.innerHTML = `<main class="app-loading app-loading--error">
      <div><strong>Unable to load TLI Lens</strong>
      <small>${esc(message)} Refresh the page to try again.</small></div>
    </main>`;
  }
}

void initializeWorkspace();
