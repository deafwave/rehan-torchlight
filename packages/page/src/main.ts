import "./style.css";
import { cycleDps, type Snapshot } from "@rehan/dmg/damageModel";
import { knownMinionDamageCoverageMatches } from "@rehan/dmg/minionDamageEnvelope";
import { STANDARD_PERTURBATIONS, bump } from "@rehan/dmg/rank";
import { renderBreakdown } from "./breakdown";
import {
  explainCurrentDamage,
  formatFactorValue,
  type DamageExplanation,
  type FactorImpact,
} from "./explain";
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
import {
  actionPlanReport,
  buildComparisonActionPlan,
  type ActionFinding,
  type ActionProof,
  type ComparisonActionPlan,
} from "./action-plan";
import { compareBingFactorLedgerLoadoutDisplays } from "./bing-factor-evidence";
import {
  compareObservedDamageMeasurements,
  parseObservedDamageMeasurement,
  type ObservedDamageMetric,
  type ObservedMeasurementConfidence,
  type ObservedMeasurementScope,
} from "./observed-measurement";
import {
  observedFormScope,
  observedMetadataConflicts,
  sharedObservedFormConditions,
  sharedObservedFormDuration,
  sharedObservedFormText,
} from "./observed-form-state";

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
          throw new Error(`The import catalogs could not be loaded (${response.status}).`);
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
/** Primary product views. Compare-era views remain for secondary deep-links only. */
/** Top-level site pages: pick a build, then inspect its loadout + DPS. */
type AppPage = "leaderboard" | "loadout";
type View =
  | "explain"
  | "build"
  | "coverage"
  | "diagnosis"
  | "actions"
  | "changes"
  | "formula"
  | "survival";
type ChangeSection = "gear" | "skills" | "trees" | "memories" | "slates" | "pacts";

interface Selection {
  buildId: string;
  loadoutId: string;
}

/** Single active loadout — the home path explains this build only. */
let selection: Selection;
/** Kept in sync for secondary compare helpers that still take two sides. */
let beforeSelection: Selection;
let afterSelection: Selection;
/** Page 1 = leaderboard/import; page 2 = equipped loadout + DPS formula. */
let appPage: AppPage = "leaderboard";
let activeView: View = "explain";
let changeSection: ChangeSection = "gear";
let formulaSide: Side = "after";
/** Import dialog still tags a side; always applied to the single active loadout. */
let importTarget: Side = "after";
let reportCopyState: "idle" | "copied" | "failed" = "idle";
/** Skip history writes while applying popstate / initial URL. */
let suppressUrlWrite = false;
/** Last written path+search so we do not push duplicate history entries. */
let lastWrittenLocation = "";

/** Loadout-page views that belong in the URL. */
const URL_VIEWS = new Set<View>(["explain", "coverage", "survival"]);

function normalizeView(view: string | null | undefined): View {
  if (view === "coverage" || view === "survival" || view === "explain") return view;
  if (view === "dps" || view === "gear") return "explain";
  return "explain";
}

/** Serialize app navigation into query params (page, build, loadout, view). */
function appSearchParams(overrides: {
  page?: AppPage;
  view?: View;
  selection?: Selection | null;
} = {}): URLSearchParams {
  const page = overrides.page ?? appPage;
  const view = normalizeView(overrides.view ?? activeView);
  const sel = overrides.selection === undefined ? selection : overrides.selection;
  const params = new URLSearchParams();
  params.set("page", page);
  if (sel) {
    params.set("build", sel.buildId);
    params.set("loadout", sel.loadoutId);
  }
  if (page === "loadout") {
    // Always pin view on the loadout page so the tab survives refresh/share.
    params.set("view", view);
  }
  return params;
}

function hrefFor(page: AppPage, overrides: {
  view?: View;
  selection?: Selection | null;
} = {}): string {
  const search = appSearchParams({ page, ...overrides }).toString();
  return search ? `?${search}` : "?";
}

function currentLocationKey(search = window.location.search): string {
  return `${window.location.pathname}${search}${window.location.hash}`;
}

function writeUrl(mode: "push" | "replace" = "replace") {
  if (suppressUrlWrite) return;
  const search = appSearchParams().toString();
  const nextSearch = search ? `?${search}` : "";
  const next = `${window.location.pathname}${nextSearch}${window.location.hash}`;
  if (next === lastWrittenLocation
    && `${window.location.pathname}${window.location.search}${window.location.hash}` === next) {
    return;
  }
  lastWrittenLocation = next;
  if (mode === "push"
    && `${window.location.pathname}${window.location.search}` !== `${window.location.pathname}${nextSearch}`) {
    history.pushState({ tliLens: true }, "", next);
  } else {
    history.replaceState({ tliLens: true }, "", next);
  }
}

function resolveSelectionFromIds(
  buildId: string | null | undefined,
  loadoutId: string | null | undefined,
): Selection | null {
  if (!buildId || !loadoutId) return null;
  const build = builds.find((item) => item.id === buildId);
  const loadout = build?.loadouts.find((item) => item.id === loadoutId);
  if (!build || !loadout) return null;
  return { buildId: build.id, loadoutId: loadout.id };
}

/** Apply ?page=&build=&loadout=&view= onto in-memory navigation state. */
function applyLocationToState() {
  const params = new URLSearchParams(window.location.search);
  const pageRaw = params.get("page");
  const resolved = resolveSelectionFromIds(params.get("build"), params.get("loadout"));
  if (resolved) setSelection(resolved);

  const viewRaw = params.get("view");
  if (viewRaw) activeView = normalizeView(viewRaw);

  if (pageRaw === "loadout") {
    appPage = selection ? "loadout" : "leaderboard";
  } else {
    appPage = "leaderboard";
  }

  if (appPage === "loadout" && !URL_VIEWS.has(activeView)) {
    activeView = "explain";
  }
}

// Compare-era helpers stay compiled (demoted, not deleted) for secondary tooling.
// Referenced so strict noUnusedLocals does not force a bulk delete this pass.
function retainCompareShell() {
  return {
    importTarget,
    formulaSide,
    buildComparisonActionPlan,
    buildPicker,
    renderSummary,
    renderDiagnosis,
    renderChanges,
    renderFormula,
    renderActions,
    actionPlanReport,
  };
}
void retainCompareShell;

const app = document.getElementById("app")!;
app.innerHTML = `<main class="app-loading" aria-live="polite">
  <div><span class="brand-mark" aria-hidden="true"><i></i></span>
  <strong>Loading your damage workspace…</strong>
  <small>Preparing build fixtures and the damage model.</small></div>
</main>`;
const loadBuildPanel = document.getElementById("load-build-panel") as HTMLElement;
const importStatus = document.getElementById("import-status")!;
const importLead = document.getElementById("import-lead");
const loadBuildActive = document.getElementById("load-build-active");
const fileInput = document.getElementById("build-file") as HTMLInputElement;
const pasteInput = document.getElementById("build-paste") as HTMLTextAreaElement;
const codeInput = document.getElementById("build-code") as HTMLTextAreaElement;
const dropZone = document.getElementById("drop-zone")!;
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

/** Preferred Before/After indices for catalog builds (from data/builds). */
const SUPPORTED_BUILD_DEFAULTS: Record<string, { beforeIndex: number; afterIndex: number }> = {
  bing: { beforeIndex: 2, afterIndex: 3 },
  wuxia: { beforeIndex: 5, afterIndex: 8 },
  "bing1-furrylover3": { beforeIndex: 0, afterIndex: 1 },
  "moto2-furrylover3": { beforeIndex: 0, afterIndex: 1 },
};

const SUPPORTED_BUILD_META: Record<string, { title: string; blurb: string }> = {
  bing: {
    title: "Bing · Hammer of Ash (SS13hss)",
    blurb: "Guarded weapon, support, and emission terms",
  },
  wuxia: {
    title: "Wuxia · Spirit Magus",
    blurb: "Guarded minion actor and action terms",
  },
  "bing1-furrylover3": {
    title: "Bing · FurryLover3 ice shot",
    blurb: "Two-step ice-shot progression",
  },
  "moto2-furrylover3": {
    title: "Moto · FurryLover3",
    blurb: "Moto progression · multi-stage damage setups",
  },
};

function isSupportedCatalogBuild(build: AnalyzedBuild) {
  // Catalog builds come from data/builds via demo-builds.json (source = filename.json).
  return build.id !== "scaling-lesson"
    && !build.needsResolution
    && !build.imported
    && (Boolean(SUPPORTED_BUILD_META[build.id]) || /\.json$/i.test(build.source ?? ""));
}

function defaultLoadoutPair(build: AnalyzedBuild) {
  const preset = SUPPORTED_BUILD_DEFAULTS[build.id];
  if (preset) return preset;
  return {
    beforeIndex: 0,
    afterIndex: Math.min(1, Math.max(0, build.loadouts.length - 1)),
  };
}

function loadoutPickButtons(build: AnalyzedBuild) {
  return build.loadouts.map((loadout, index) => {
    const active = selection
      && selection.buildId === build.id
      && selection.loadoutId === loadout.id;
    const stage = loadout.isCurrent ? "current" : `stage ${index + 1}`;
    return `<button type="button" class="loadout-pick${active ? " active" : ""}"
      data-select-build="${escAttr(build.id)}" data-select-loadout="${escAttr(loadout.id)}"
      aria-pressed="${active ? "true" : "false"}"
      title="${escAttr(`${loadout.name} · ${loadout.hero}`)}">
      <b>${esc(loadout.name)}</b>
      <small>${esc(stage)}${loadout.model ? " · modeled" : ""}</small>
    </button>`;
  }).join("");
}

function renderBuildLoadCards(list: AnalyzedBuild[], emptyNote: string) {
  if (!list.length) {
    return `<p class="import-panel-note">${esc(emptyNote)}</p>`;
  }
  return list.map((build) => {
    const meta = SUPPORTED_BUILD_META[build.id];
    const title = meta?.title ?? build.name;
    const blurb = meta?.blurb
      ?? (build.imported
        ? `Imported · ${build.source}`
        : `${build.loadouts.length} loadout${build.loadouts.length === 1 ? "" : "s"} · ${build.patch}`);
    const selectedHere = selection?.buildId === build.id;
    return `<article class="supported-build-card${selectedHere ? " is-active" : ""}">
      <div class="supported-build-card-head">
        <strong>${esc(title)}</strong>
        <span class="source-pill">${esc(build.patch)}</span>
      </div>
      <span class="supported-build-card-blurb">${esc(blurb)} · ${build.loadouts.length} loadout${build.loadouts.length === 1 ? "" : "s"}</span>
      <div class="loadout-picks" role="group" aria-label="${escAttr(`${title} loadouts`)}">
        ${loadoutPickButtons(build)}
      </div>
    </article>`;
  }).join("");
}

function renderSupportedBuildList() {
  const host = document.getElementById("supported-build-list");
  if (!host) return;
  const catalog = builds.filter(isSupportedCatalogBuild);
  const demos = builds.filter((build) =>
    !isSupportedCatalogBuild(build) && !build.imported && build.id === "scaling-lesson");
  const imported = builds.filter((build) => build.imported);
  const sections: string[] = [];
  if (demos.length) {
    sections.push(`<div class="load-build-group">
      <span class="panel-kicker">Teaching fixture</span>
      ${renderBuildLoadCards(demos, "")}
    </div>`);
  }
  sections.push(`<div class="load-build-group">
    <span class="panel-kicker">Leaderboard</span>
    ${renderBuildLoadCards(catalog, "No leaderboard builds are loaded yet.")}
  </div>`);
  if (imported.length) {
    sections.push(`<div class="load-build-group">
      <span class="panel-kicker">Imported this session</span>
      ${renderBuildLoadCards(imported, "")}
    </div>`);
  }
  host.innerHTML = sections.join("");
}

function updateLoadBuildActiveSummary() {
  if (!loadBuildActive || !selection) return;
  const { build, loadout } = activeLoadout();
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
  loadBuildActive.innerHTML = `<div class="load-build-active-card">
    <span class="load-build-active-label">Explaining</span>
    <strong>${esc(loadout.name)}</strong>
    <span class="load-build-active-meta">${esc(build.name)} · ${esc(loadout.hero)} · ${esc(build.patch)}</span>
    <span class="model-state ${state}"><span class="state-dot"></span>${esc(confidenceLabel(loadout))}</span>
  </div>`;
}

const esc = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");
const escAttr = (value: unknown) => esc(value).replaceAll('"', "&quot;");
const sideLabel = (side: Side) => side === "before" ? "Before" : "After";

function setSelection(next: Selection) {
  selection = next;
  // Secondary compare helpers still read both sides; keep them pointed at the
  // active loadout so leftover dual-path code does not invent a second build.
  beforeSelection = next;
  afterSelection = next;
}

function selected(side?: Side) {
  const active = side === "before"
    ? beforeSelection
    : side === "after"
      ? afterSelection
      : selection;
  const build = builds.find((item) => item.id === active.buildId) ?? builds[0];
  const loadout = build.loadouts.find((item) => item.id === active.loadoutId)
    ?? build.loadouts.find((item) => item.isCurrent)
    ?? build.loadouts[0];
  return { build, loadout };
}

function activeLoadout() {
  return selected();
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
  const sideSelection = side === "before" ? beforeSelection : afterSelection;
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
      ${allOptions(sideSelection)}
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
      <button class="quiet-button" type="button" data-import="${side}">Add build</button>
    </div>
  </article>`;
}

/** Mount point for the stable load-build panel (lives outside #app). */
function loadBuildMountHtml() {
  return `<div id="load-build-mount" class="loadout-bar" aria-label="Load a build"></div>`;
}

function mountLoadBuildPanel() {
  const mount = document.getElementById("load-build-mount");
  if (!mount || !loadBuildPanel) return;
  loadBuildPanel.hidden = false;
  if (loadBuildPanel.parentElement !== mount) mount.appendChild(loadBuildPanel);
  renderSupportedBuildList();
  updateLoadBuildActiveSummary();
}

function impactPctLabel(impact: number): string {
  const pct = Math.round(impact * 100);
  if (pct === 0) return "—";
  return pct > 0 ? `−${pct}% if removed` : `+${Math.abs(pct)}% if removed`;
}

function renderFactorImpactList(factors: FactorImpact[]) {
  const ranked = factors.filter((f) => f.op !== "base" && Math.abs(f.impact) >= 0.005).slice(0, 12);
  if (!ranked.length) return "";
  return `<section class="factor-impact-panel" aria-labelledby="factor-impact-title">
    <div class="analysis-heading">
      <div>
        <span class="eyebrow">Largest levers</span>
        <h2 id="factor-impact-title">What moves this number most</h2>
      </div>
    </div>
    <p class="section-intro">Each row is a factor in the live damage product. Impact is the share of DPS lost if that factor is neutralized.</p>
    <ol class="factor-impact-list">
      ${ranked.map((factor, index) => `<li class="factor-impact-row factor-impact--${factor.kind}">
        <span class="factor-rank">${index + 1}</span>
        <span class="factor-copy">
          <strong>${esc(factor.label)}</strong>
          <small>${esc(factor.kind)}</small>
        </span>
        <b class="factor-value">${esc(formatFactorValue(factor))}</b>
        <span class="factor-impact">${esc(impactPctLabel(factor.impact))}</span>
      </li>`).join("")}
    </ol>
  </section>`;
}

function renderExplain(loadout: AnalyzedLoadout) {
  const explained: DamageExplanation = explainCurrentDamage(loadout);
  const { reading, breakdown, factors, gaps } = explained;

  const hero = `<section class="damage-hero" aria-labelledby="damage-title">
    <div class="damage-hero-copy">
      <span class="eyebrow">Current damage</span>
      <h1 id="damage-title">${esc(reading.label)}</h1>
      <p>${esc(reading.note)}</p>
    </div>
    <div class="damage-hero-number ${reading.kind}">
      <strong>${esc(reading.display)}</strong>
      <span>${esc(reading.unit)}</span>
      ${reading.isDps ? "" : `<b class="not-dps-badge">Not full DPS</b>`}
    </div>
  </section>`;

  let body = "";
  if (breakdown) {
    body = `<section class="formula-panel explain-panel">
      <div class="analysis-heading">
        <div>
          <span class="eyebrow">Why this number</span>
          <h2>Damage product</h2>
        </div>
      </div>
      <p class="section-intro">Every chip below is used by the shared cycleDps dummy scenario — the same math on every loadout. Impact badges show what happens if that factor is neutralized.</p>
      <div class="formula-primer" aria-label="Damage formula overview">
        <span>base hit</span><i>×</i><span>increased pool</span><i>×</i><span>additional layers</span>
        <i>×</i><span>crit expectation</span><i>×</i><span>mitigation</span><i>×</i><span>cadence</span><i>+</i><span>DoT</span>
      </div>
      ${renderBreakdown(breakdown)}
      ${renderFactorImpactList(factors)}
    </section>`;
  } else {
    body = `<section class="single-panel empty-analysis explain-panel">
      <div class="analysis-heading">
        <div><span class="eyebrow">Why this number</span><h2>DPS not calculated</h2></div>
      </div>
      <p>${esc(loadout.sourceNote ?? "This loadout has no damage snapshot, so the shared dummy cycleDps formula cannot run.")}</p>
      ${renderLocalCaptureHandoff(loadout)}
    </section>`;
  }

  const gapsPanel = gaps.length
    ? `<details class="density-fold explain-gaps">
        <summary>What is still incomplete <span>${gaps.length} gap${gaps.length === 1 ? "" : "s"}</span></summary>
        <ul class="guarded-unavailable-list">${gaps.map((gap) =>
          `<li><strong>${esc(gap)}</strong></li>`).join("")}</ul>
      </details>`
    : "";

  return `<div class="explain-view">${hero}${body}${gapsPanel}</div>`;
}

function renderBuildOverview(loadout: AnalyzedLoadout) {
  const skillLines = loadout.skills
    .filter((skill) => skill.enabled)
    .slice(0, 16)
    .map((skill) => `${skillDisplay(skill)}${skill.supports.length ? ` · ${skill.supports.length} supports` : ""}`);
  const gearLines = loadout.gear
    .filter((row) => row.name && row.name !== "Empty")
    .slice(0, 16)
    .map((row) => `${row.slot.replace(/([a-z])([A-Z])/g, "$1 $2")}: ${row.name}`);
  return `<section class="single-panel explain-panel loadout-gear-panel">
    <div class="analysis-heading">
      <div>
        <span class="eyebrow">Equipped</span>
        <h2>Loadout · gear & skills</h2>
      </div>
    </div>
    <p class="section-intro">What this loadout is wearing and casting. The DPS formula below uses the shared dummy scenario on these inputs.</p>
    <div class="build-overview-grid">
      <div>
        <span class="panel-kicker">Skills</span>
        <ul>${skillLines.length
          ? skillLines.map((line) => `<li>${esc(line)}</li>`).join("")
          : "<li>No enabled skills imported</li>"}</ul>
      </div>
      <div>
        <span class="panel-kicker">Gear</span>
        <ul>${gearLines.length
          ? gearLines.map((line) => `<li>${esc(line)}</li>`).join("")
          : "<li>No gear rows imported</li>"}</ul>
      </div>
    </div>
  </section>`;
}

interface DpsLeverRow {
  id: string;
  label: string;
  path: string;
  delta: number;
  soloDeltaPct: number;
}

/** Sequential path bumps that skip unresolved keys instead of writing NaN. */
function applyLeverBumps(
  snap: Snapshot,
  levers: Array<{ path: string; delta: number }>,
): Snapshot {
  let next = snap;
  for (const lever of levers) {
    try {
      const trial = bump(next, lever.path, lever.delta);
      const keys = lever.path.split(".");
      let cursor: any = trial;
      for (const key of keys) cursor = cursor?.[key];
      if (!Number.isFinite(cursor)) continue;
      next = trial;
    } catch {
      // Skip levers that do not resolve on this snapshot shape.
    }
  }
  return next;
}

function dpsLeverRows(snap: Snapshot): DpsLeverRow[] {
  try {
    const baseline = cycleDps(snap).dps;
    if (!(baseline > 0)) return [];
    return STANDARD_PERTURBATIONS
      .map(([label, path, delta], index) => {
        const id = `lever-${index}`;
        try {
          const dps = cycleDps(bump(snap, path, delta)).dps;
          const soloDeltaPct = (dps / baseline - 1) * 100;
          if (!Number.isFinite(soloDeltaPct)) return null;
          return { id, label, path, delta, soloDeltaPct };
        } catch {
          return null;
        }
      })
      .filter((row): row is DpsLeverRow => row != null && Math.abs(row.soloDeltaPct) >= 0.05)
      .sort((a, b) => b.soloDeltaPct - a.soloDeltaPct);
  } catch {
    return [];
  }
}

/**
 * Best next steps by dummy-cycle DPS only — no loadout comparison.
 * Right-side toggles stack selected levers and recompute the combined delta.
 */
function renderSuggestedChanges(loadout: AnalyzedLoadout) {
  const snap = loadout.snapshot;
  if (!snap) {
    return `<section class="single-panel explain-panel suggestion-panel">
      <div class="analysis-heading">
        <div>
          <span class="eyebrow">Best progression</span>
          <h2 id="suggestion-title">What to change next</h2>
        </div>
      </div>
      <p class="section-intro">No damage snapshot on this loadout, so formula levers cannot be ranked. Import a build the model can score.</p>
    </section>`;
  }

  let baseline = 0;
  try {
    baseline = cycleDps(snap).dps;
  } catch {
    baseline = 0;
  }
  if (!(baseline > 0)) {
    return `<section class="single-panel explain-panel suggestion-panel">
      <div class="analysis-heading">
        <div>
          <span class="eyebrow">Best progression</span>
          <h2 id="suggestion-title">What to change next</h2>
        </div>
      </div>
      <p class="section-intro">The dummy cycleDps model could not produce a baseline for this loadout.</p>
    </section>`;
  }

  const levers = dpsLeverRows(snap);
  if (!levers.length) {
    return `<section class="single-panel explain-panel suggestion-panel">
      <div class="analysis-heading">
        <div>
          <span class="eyebrow">Best progression</span>
          <h2 id="suggestion-title">What to change next</h2>
        </div>
      </div>
      <p class="section-intro">No standard formula lever moved DPS on this snapshot.</p>
    </section>`;
  }

  const rows = levers.map((row, index) => {
    const soloClass = row.soloDeltaPct >= 0 ? "up" : "down";
    return `<li class="suggestion-lever-row" data-lever-id="${escAttr(row.id)}">
      <span class="suggestion-lever-rank">${index + 1}</span>
      <span class="suggestion-lever-copy">
        <strong class="suggestion-lever-label">${esc(row.label)}</strong>
        <small class="suggestion-lever-solo ${soloClass}">solo ${esc(signedPercent(row.soloDeltaPct))}</small>
      </span>
      <label class="suggestion-toggle">
        <input type="checkbox"
          data-suggestion-lever
          data-lever-path="${escAttr(row.path)}"
          data-lever-delta="${escAttr(String(row.delta))}"
          aria-label="Include ${escAttr(row.label)} in stacked DPS">
        <span class="suggestion-toggle-ui" aria-hidden="true"></span>
      </label>
    </li>`;
  }).join("");

  return `<section class="single-panel explain-panel suggestion-panel"
      data-suggestion-panel
      data-baseline-dps="${escAttr(String(baseline))}"
      aria-labelledby="suggestion-title">
    <div class="analysis-heading">
      <div>
        <span class="eyebrow">Best progression</span>
        <h2 id="suggestion-title">What to change next</h2>
      </div>
    </div>
    <p class="section-intro">Ranked by <strong>solo dummy DPS</strong> on this loadout — not by any later leaderboard stage. Toggle levers on the right to stack them; the header shows the combined result. These are formula probes, not gear-legal guarantees.</p>
    <div class="suggestion-stack-summary" aria-live="polite">
      <div class="suggestion-stack-metric">
        <span class="metric-label">Baseline</span>
        <strong data-suggestion-baseline>${esc(compactNumber(baseline))}</strong>
      </div>
      <div class="suggestion-stack-metric">
        <span class="metric-label">With selected</span>
        <strong data-suggestion-stacked>${esc(compactNumber(baseline))}</strong>
      </div>
      <div class="suggestion-stack-metric">
        <span class="metric-label">Stack delta</span>
        <b class="suggestion-stack-delta neutral" data-suggestion-stack-delta>No levers on</b>
      </div>
      <div class="suggestion-stack-metric">
        <span class="metric-label">Selected</span>
        <strong data-suggestion-count>0 / ${levers.length}</strong>
      </div>
    </div>
    <ol class="suggestion-lever-list">${rows}</ol>
  </section>`;
}

/** Live stacked DPS for toggled formula levers (no full re-render). */
function recomputeSuggestionStack(panel: HTMLElement) {
  const baseline = Number(panel.dataset.baselineDps);
  const stackedEl = panel.querySelector<HTMLElement>("[data-suggestion-stacked]");
  const deltaEl = panel.querySelector<HTMLElement>("[data-suggestion-stack-delta]");
  const countEl = panel.querySelector<HTMLElement>("[data-suggestion-count]");
  if (!Number.isFinite(baseline) || baseline <= 0 || !stackedEl || !deltaEl || !countEl) return;

  const snap = activeLoadout().loadout.snapshot;
  if (!snap) return;

  const checked = [...panel.querySelectorAll<HTMLInputElement>(
    "input[data-suggestion-lever]:checked",
  )];
  const total = panel.querySelectorAll("input[data-suggestion-lever]").length;
  countEl.textContent = `${checked.length} / ${total}`;

  if (!checked.length) {
    stackedEl.textContent = compactNumber(baseline);
    deltaEl.textContent = "No levers on";
    deltaEl.className = "suggestion-stack-delta neutral";
    panel.querySelectorAll(".suggestion-lever-row").forEach((row) => {
      row.classList.remove("is-on");
    });
    return;
  }

  const levers = checked.map((input) => ({
    path: input.dataset.leverPath ?? "",
    delta: Number(input.dataset.leverDelta),
  })).filter((lever) => lever.path && Number.isFinite(lever.delta));

  let stacked = baseline;
  try {
    stacked = cycleDps(applyLeverBumps(snap, levers)).dps;
  } catch {
    stacked = baseline;
  }

  const deltaPct = (stacked / baseline - 1) * 100;
  stackedEl.textContent = compactNumber(stacked);
  deltaEl.textContent = Number.isFinite(deltaPct)
    ? `${signedPercent(deltaPct)} dummy DPS`
    : "—";
  deltaEl.className = `suggestion-stack-delta ${
    !Number.isFinite(deltaPct) || Math.abs(deltaPct) < 0.05
      ? "neutral"
      : deltaPct >= 0
        ? "up"
        : "down"
  }`;

  panel.querySelectorAll(".suggestion-lever-row").forEach((row) => {
    const on = row.querySelector<HTMLInputElement>("input[data-suggestion-lever]")?.checked;
    row.classList.toggle("is-on", Boolean(on));
  });
}

/** Page 2 body: equipped loadout inventory + suggested changes + DPS formula. */
function renderLoadoutPage(build: AnalyzedBuild, loadout: AnalyzedLoadout) {
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
  const head = `<section class="loadout-page-head" aria-labelledby="loadout-page-title">
    <div class="loadout-page-head-copy">
      <button type="button" class="quiet-button loadout-back" data-app-page="leaderboard">← Leaderboard</button>
      <span class="eyebrow">${esc(build.name)}</span>
      <h1 id="loadout-page-title">${esc(loadout.name)}</h1>
      <p>${esc(loadout.hero)} · ${esc(build.patch)} · ${esc(build.source)}</p>
    </div>
    <span class="model-state ${state}"><span class="state-dot"></span>${esc(confidenceLabel(loadout))}</span>
  </section>`;

  if (activeView === "coverage") {
    return `${head}${navigation()}${renderCoverage(loadout, loadout)}`;
  }
  if (activeView === "survival") {
    return `${head}${navigation()}${renderSurvival(loadout, loadout)}`;
  }
  // Default page-2: three columns — equipped | next upgrades | damage formula.
  return `${head}
    ${navigation()}
    <div class="loadout-page-columns" aria-label="Loadout analysis columns">
      <div class="loadout-col loadout-col--equipped">
        ${renderBuildOverview(loadout)}
      </div>
      <div class="loadout-col loadout-col--upgrades">
        ${renderSuggestedChanges(loadout)}
      </div>
      <div class="loadout-col loadout-col--damage">
        ${renderExplain(loadout)}
      </div>
    </div>`;
}

function summaryMetric(label: string, value: string, note: string, className = "") {
  return `<div class="summary-metric ${className}">
    <span class="metric-label">${esc(label)}</span>
    <strong>${esc(value)}</strong>
    <span class="metric-note">${esc(note)}</span>
  </div>`;
}

function renderSummary(
  before: AnalyzedLoadout,
  after: AnalyzedLoadout,
  plan: ComparisonActionPlan,
) {
  const beforeModeledDps = before.model?.dps;
  const afterModeledDps = after.model?.dps;
  const bothModeled =
    beforeModeledDps != null
    && afterModeledDps != null
    && plan.summary.netDpsAvailable;
  const observedComparison = before.observedDamage && after.observedDamage
    ? compareObservedDamageMeasurements(
      before.observedDamage,
      after.observedDamage,
    )
    : null;
  const observedComparable =
    observedComparison?.status === "comparable"
    && before !== after
    && plan.summary.comparisonKind !== "incompatible"
    && plan.findings.some((finding) =>
      finding.id === `observed:${observedComparison.metric}`)
      ? observedComparison
      : null;
  const delta = observedComparable
    ? observedComparable.percentChange
    : bothModeled
      ? percentChange(beforeModeledDps, afterModeledDps)
      : null;
  const observedScopeLabel = observedComparable?.scope === "whole-loadout"
    ? "whole-loadout"
    : "actor/skill";
  const resultMetricLabel = observedComparable?.metric === "damage-per-hit"
    ? `${observedScopeLabel} damage / hit`
    : observedComparable
      ? `${observedScopeLabel} DPS`
      : "DPS";
  const beforeResultValue = observedComparable?.beforeObservedValue
    ?? beforeModeledDps;
  const afterResultValue = observedComparable?.afterObservedValue
    ?? afterModeledDps;
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
  const incompatible = plan.summary.comparisonKind === "incompatible";
  const reference = plan.summary.comparisonKind === "reference";
  const headline = incompatible
    ? "Pair not comparable for progression"
    : observedComparable
      ? reference
        ? `${signedPercent(delta!)} observed ${resultMetricLabel} contrast`
        : `${signedPercent(delta!)} observed ${resultMetricLabel}`
    : delta == null
      ? reference
        ? structure.changedSystems.length
          ? `${structure.changedSystems.length} build system${structure.changedSystems.length === 1 ? "" : "s"} differ · reference only`
          : "Reference pair has no imported differences"
        : structure.changedSystems.length
          ? `${structure.changedSystems.length} build system${structure.changedSystems.length === 1 ? "" : "s"} changed`
          : "No imported changes found"
      : reference
        ? `${signedPercent(delta)} modeled reference contrast`
        : `${signedPercent(delta)} supported DPS`;
  const note = incompatible
    ? plan.summary.comparisonReason
    : observedComparable
      ? reference
        ? `${plan.summary.comparisonReason} The declared observation is aligned, but it does not prove which edit caused the result.`
        : `The ${observedComparable.confidence} in-game result is aligned in explicit ${observedScopeLabel} scope to the same declared actor, skill, target, and test setup; attribution below remains evidence-ranked.`
    : reference
      ? plan.summary.comparisonReason
    : delta == null
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
      ${summaryMetric(
        `Before ${resultMetricLabel}`,
        beforeResultValue == null ? "Not calculated" : compactNumber(beforeResultValue),
        observedComparable
          ? `${before.name} · user-observed`
          : before.name,
        "before",
      )}
      ${summaryMetric(
        `After ${resultMetricLabel}`,
        afterResultValue == null ? "Not calculated" : compactNumber(afterResultValue),
        observedComparable
          ? `${after.name} · user-observed`
          : after.name,
        "after",
      )}
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
        observedComparable
          ? "Observed result"
          : bothModeled ? "Formula coverage" : "Classification coverage",
        observedComparable
          ? observedComparable.confidence
          : bothModeled
          ? `${Math.round(lowestCoverage * 100)}%+`
          : classificationFloor == null ? "Pending" : `${Math.round(classificationFloor * 100)}%+`,
        observedComparable
          ? "Outcome known; cause still evidence-ranked"
          : bothModeled
          ? "Classified modifier lines"
          : classificationFloor == null ? "Imported structure only" : "Recognized lines; no DPS claim",
        !observedComparable
          && (bothModeled ? lowestCoverage : classificationFloor ?? 0) < 0.6
          ? "warning"
          : "",
      )}
    </div>
    ${observedComparable
      ? `<div class="scenario-strip observed-scope">
          <span class="scenario-label">Observed scenario</span>
          <span>${esc(observedScopeLabel)} scope</span>
          <span>${esc(observedComparable.before.targetLabel)}</span>
          <span>${esc(observedComparable.before.scenarioLabel)}</span>
          <span>${observedComparable.before.conditions.length
            ? `${observedComparable.before.conditions.length} declared condition${observedComparable.before.conditions.length === 1 ? "" : "s"}`
            : "No extra conditions declared"}</span>
          <button type="button" class="primary-button strip-cta" data-view="actions">Improve this result</button>
        </div>`
      : bothModeled
      ? `<div class="scenario-strip">
          <span class="scenario-label">Shared scenario</span>
          <span>Boss target</span>
          <span>30% res · full uptime</span>
          <button type="button" class="primary-button strip-cta" data-view="${plan.findings.length ? "actions" : "coverage"}">${plan.findings.length ? `Improve DPS · ${plan.findings.length} experiments` : "Review compatibility"}</button>
        </div>`
      : `<div class="scenario-strip evidence-scope">
          <span class="scenario-label">Evidence scope</span>
          <span>${guardedReady ? "Guarded source terms ready" : "Structure only"}</span>
          <span>${guardedBlocked ? "Some layers blocked" : "No guessed DPS"}</span>
          <button type="button" class="primary-button strip-cta" data-view="${plan.findings.length ? "actions" : "coverage"}">${plan.findings.length ? `Improve DPS · ${plan.findings.length} experiments` : "Review compatibility"}</button>
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

const SYSTEM_LABELS: Record<BuildSystem, string> = {
  gear: "Gear",
  skills: "Skills",
  trees: "Talent trees",
  memories: "Memories",
  slates: "Slates",
  pacts: "Pactspirits",
};

function renderStructuralDiagnosis(
  before: AnalyzedLoadout,
  after: AnalyzedLoadout,
  plan: ComparisonActionPlan,
) {
  const comparison = compareStructure(before, after);
  const normalized = plan.findings.filter((finding) =>
    finding.target.view === "changes" && finding.target.section);
  if (!normalized.length) {
    return `<div class="structural-empty">
      <strong>${comparison.changedSystems.length
        ? "No progression priority is safe for this pair."
        : "No imported loadout differences were found."}</strong>
      <p>${comparison.changedSystems.length
        ? "The raw entities differ, but the current comparison context cannot turn them into one-character advice."
        : "Choose two different loadouts or import a changed build to begin the comparison."}</p>
    </div>`;
  }
  return `<div class="structural-diagnosis">
    <div class="structural-head">
      <div>
        <span class="eyebrow">Where to look</span>
        <h3>Top changes to isolate</h3>
      </div>
      <span class="exact-badge">${comparison.changedSystems.length} systems</span>
    </div>
    <div class="insight-list">
      ${normalized.slice(0, 5).map((finding, index) => {
        const section = finding.target.section!;
        const tone =
          finding.direction === "loss"
          || finding.direction === "weaker-input"
          || finding.direction === "risk"
            ? "risk"
            : finding.direction === "gain"
                || finding.direction === "stronger-input"
              ? "candidate"
              : "neutral";
        const changeLine = actionChangeLine(finding);
        return `<button type="button"
        class="insight-card ${tone}" data-open-section="${section}">
        <span class="insight-rank">${index + 1}</span>
        <span class="insight-copy">
          <span class="insight-label">${esc(finding.label)} · ${esc(SYSTEM_LABELS[section])}</span>
          <strong>${esc(actionHeadline(finding))}</strong>
          ${changeLine ? `<span class="insight-change">${esc(changeLine)}</span>` : ""}
        </span>
        <span class="insight-open" aria-hidden="true">Open</span>
      </button>`;
      }).join("")}
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
  const deltaPct = left.value === 0
    ? null
    : percentChange(left.value, right.value);
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
  </section>`;
}

function renderBingFactorLedgerComparison(
  before: AnalyzedLoadout,
  after: AnalyzedLoadout,
) {
  if (!before.bingFactorLedger || !after.bingFactorLedger) return "";
  const comparison = compareBingFactorLedgerLoadoutDisplays(
    before.bingFactorLedger,
    after.bingFactorLedger,
  );
  if (comparison.status !== "calculated-partial") {
    return `<section class="bing-factor-panel blocked">
      <div class="partial-proof-head">
        <div><span class="eyebrow">Component factor ledger</span><h3>Factor comparison withheld</h3></div>
        <span class="not-dps-badge">Not calculated</span>
      </div>
      <ul class="guarded-unavailable-list">${comparison.blockers.map((blocker) =>
        `<li><strong>${esc(blocker.message)}</strong>${blocker.evidence ? `<small>${esc(blocker.evidence)}</small>` : ""}</li>`).join("")}</ul>
    </section>`;
  }
  const factors = comparison.factorRows.filter((row) =>
    row.status === "calculated-partial");
  const scenarios = comparison.hitScenarioRows.filter((row) =>
    row.status === "calculated-partial");
  return `<section class="bing-factor-panel">
    <div class="partial-proof-head">
      <div><span class="eyebrow">Component-scoped factor ledger</span><h3>See which multiplier moved each Hammer component</h3></div>
      <div class="partial-badges"><span>Exact imported inputs</span><b>Not total hit</b><b>Not DPS</b></div>
    </div>
    <p>Ordinary and projectile-explosion components have different applicable factors. Stationary and moving states are shown separately; emitted projectile quantity stays outside every hit ratio.</p>
    <div class="bing-factor-grid">
      <div class="bing-factor-row head"><span>Known factor</span><span>Before</span><span>After</span><span>Movement</span></div>
      ${factors.map((row) => `<div class="bing-factor-row ${row.direction}">
        <span><strong>${esc(row.label)}</strong><small>${esc(row.scope)}${row.condition ? ` · ${esc(row.condition)}` : ""}</small></span>
        <b>${esc(row.before.formatted)}</b>
        <b>${esc(row.after.formatted)}</b>
        <b>${esc(row.deltaLabel)}</b>
      </div>`).join("")}
    </div>
    <div class="bing-scenario-grid">
      ${scenarios.map((row) => `<article class="${row.direction}">
        <span>${esc(row.condition)}</span>
        <strong>${esc(row.label)}</strong>
        <b>${esc(row.deltaLabel)}</b>
        <small>×${esc(compactNumber(row.ratio))} · ${row.factorLabels.map((label) => esc(label)).join(" × ")}</small>
      </article>`).join("")}
    </div>
    <div class="bing-emission-separation">
      <strong>Emission lane stays separate.</strong>
      <span>${esc(comparison.warning)}</span>
    </div>
  </section>`;
}

function shortSkillLabel(name: string) {
  return name
    .replace(/\s*\(Bing:[^)]*\)/g, "")
    .replace(/\s*\(Magnificent\)/g, "")
    .replace(/\s*\(Noble\)/g, "")
    .replace(/Hammer of Ash:\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function supportTermPreview(side: SupportTermChange["before"] | SupportTermChange["after"]) {
  if (!side) return "—";
  if (side.status === "unsupported") return "unsupported";
  if (!side.effects?.length) return "—";
  return side.effects
    .slice(0, 3)
    .map((effect) => effect.display)
    .join(" · ");
}

function renderSupportTermChanges(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const changes = compareSupportTerms(before, after);
  if (!changes.length) return "";
  return `<details class="support-evidence-panel density-fold">
    <summary>
      Socket terms
      <span>${changes.length} change${changes.length === 1 ? "" : "s"} · not net DPS</span>
    </summary>
    <div class="support-change-list">
      ${changes.map((change) => {
        const beforeName = change.before?.supportName ?? null;
        const afterName = change.after?.supportName ?? null;
        const title = change.kind === "replaced"
          && beforeName
          && afterName
          && beforeName !== afterName
          ? `${shortSkillLabel(beforeName)} → ${shortSkillLabel(afterName)}`
          : shortSkillLabel(change.supportName);
        const socketLabel = change.before
          && change.after
          && change.before.socketIndex !== change.after.socketIndex
          ? `S${change.before.socketIndex + 1}→${change.after.socketIndex + 1}`
          : `S${change.socketIndex + 1}`;
        return `<article class="support-change ${change.kind} support-change--compact">
        <div class="support-change-head">
          <span>${esc(socketLabel)} · ${esc(shortSkillLabel(change.skillName))}</span>
          <strong>${esc(title)}</strong>
        </div>
        <div class="support-term-preview">
          <span><small>Before</small>${esc(supportTermPreview(change.before))}</span>
          <span><small>After</small>${esc(supportTermPreview(change.after))}</span>
        </div>
      </article>`;
      }).join("")}
    </div>
  </details>`;
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
        const known = action.knownDamage;
        const useKnown = known.status === "calculated-partial"
          && known.knownPerContact != null;
        const perContactValue = useKnown
          ? known.knownPerContact
          : foundation.rawDamagePerContact;
        const fullContactValue = useKnown
          ? known.knownDeterministicFullContact
          : foundation.rawDamageAtDeterministicFullContact;
        const perContact = perContactValue == null
          ? "No direct hit"
          : compactNumber(perContactValue);
        const fullContact = fullContactValue == null
          ? null
          : compactNumber(fullContactValue);
        return `<article class="minion-action-card">
          <div class="minion-action-head">
            <span>${esc(action.role)}</span>
            <strong>${esc(action.actionName)}</strong>
          </div>
          <div class="minion-action-math">
            <div><span>${useKnown ? "Known / contact" : "Raw / contact"}</span><b>${esc(perContact)}</b></div>
            ${fullContact != null && fullContact !== perContact
              ? `<div><span>${esc(String(foundation.deterministicContacts))} contacts</span><b>${esc(fullContact)}</b></div>`
              : ""}
            <div><span>Cast / cooldown</span><b>${esc(`${action.castTimeSeconds}s${action.cooldownSeconds == null ? "" : ` / ${action.cooldownSeconds}s`}`)}</b></div>
          </div>
          ${known.factors.length ? `<div class="minion-factor-chips">${known.factors.map((factor) =>
            `<span>${esc(factor.sourceName)} · ×${esc(compactNumber(factor.multiplier))}</span>`).join("")}</div>` : ""}
          ${known.excluded.length ? `<details class="minion-exclusions">
            <summary>${known.excluded.length} input${known.excluded.length === 1 ? "" : "s"} excluded from this known component</summary>
            <ul>${known.excluded.map((blocker) => `<li><strong>${esc(blocker.message)}</strong>${blocker.evidence ? `<small>${esc(blocker.evidence)}</small>` : ""}</li>`).join("")}</ul>
          </details>` : ""}
          ${foundation.baseDamagePctPerContact == null ? "" : `<small>${esc(compactNumber(foundation.baseDamagePctPerContact))}% of the actor's base damage per contact.${useKnown ? " Confirmed unconditional factors shown above are included." : ""} Unresolved modifiers, AI, target state, Growth/Breeze, and overlap are excluded.</small>`}
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
      const compatibleKnown =
        earlier.knownDamage.status === "calculated-partial"
        && knownMinionDamageCoverageMatches(
          earlier.knownDamage,
          action.knownDamage,
        );
      if (!compatibleKnown) return [];
      const beforeFull = earlier.knownDamage.knownDeterministicFullContact;
      const afterFull = action.knownDamage.knownDeterministicFullContact;
      const useFull = beforeFull != null && afterFull != null;
      const beforeValue = useFull
        ? beforeFull
        : earlier.knownDamage.knownPerContact;
      const afterValue = useFull
        ? afterFull
        : action.knownDamage.knownPerContact;
      if (beforeValue == null || afterValue == null || beforeValue === afterValue) return [];
      return [{
        skillName: change.skillName,
        actionName: action.actionName,
        scope: useFull && action.foundation.deterministicContacts !== 1
          ? `${action.foundation.deterministicContacts} deterministic contacts`
          : "per contact",
        basis: "known unmitigated component",
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
      <div class="minion-foundation-head"><span>Known action component</span><span>Before</span><span>After</span><span>Ratio</span></div>
      ${foundationRows.map((row) => `<div>
        <span><strong>${esc(row.actionName)}</strong><small>${esc(row.skillName)} · ${esc(row.basis)} · ${esc(row.scope)}</small></span>
        <b>${esc(compactNumber(row.beforeValue))}</b>
        <b>${esc(compactNumber(row.afterValue))}</b>
        <b>${row.ratio == null ? "—" : `×${esc(compactNumber(row.ratio))}`}</b>
      </div>`).join("")}
      <p>Known ratios include only confirmed unconditional factors with unchanged exclusion coverage. They do not include unresolved player/minion modifiers, AI frequency, enemy mitigation, or target overlap.</p>
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

function renderDiagnosis(
  before: AnalyzedLoadout,
  after: AnalyzedLoadout,
  plan: ComparisonActionPlan,
) {
  if (!before.snapshot || !after.snapshot || !before.model || !after.model) {
    return `<section class="analysis-panel empty-analysis">
      <span class="eyebrow">Diagnosis</span>
      <h2>The builds imported. The investigation can start now.</h2>
      <p>${esc(after.sourceNote ?? before.sourceNote ?? "This build format is not connected to the damage model yet.")}</p>
      ${renderLocalCaptureHandoff(after, before)}
      ${renderPartialComparison(before, after)}
      ${renderBingIntrinsicComparison(before, after)}
      ${renderBingFactorLedgerComparison(before, after)}
      ${renderSupportTermChanges(before, after)}
      ${renderSummonTermChanges(before, after)}
      ${renderStructuralDiagnosis(before, after, plan)}
    </section>`;
  }
  const steps = buildWaterfall(before.snapshot, after.snapshot);
  const totalDelta = after.model.dps - before.model.dps;
  const max = Math.max(1, ...steps.map((step) => Math.abs(step.delta)));
  return `<section class="analysis-panel">
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
  </section>`;
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
  // Dual-side formula toggle retired with the compare shell.
  return "";
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
  const actionExclusions = summons.flatMap((summon) =>
    summon.actions.flatMap((action) =>
      action.knownDamage.excluded.map((blocker) => ({
        ...blocker,
        context: `${summon.skillName} · ${action.actionName}`,
      }))));
  const generalBlockers = [...new Set([
    ...summons.flatMap((summon) => summon.minionDps.blockers),
    ...supportBlockers,
  ])];
  const actionExclusionGroups = [
    ...actionExclusions.reduce((groups, blocker) => {
      const key = `${blocker.code}\u0000${blocker.message}`;
      const existing = groups.get(key) ?? {
        code: blocker.code,
        message: blocker.message,
        contexts: new Set<string>(),
        evidence: new Set<string>(),
      };
      existing.contexts.add(blocker.context);
      if (blocker.evidence) existing.evidence.add(blocker.evidence);
      groups.set(key, existing);
      return groups;
    }, new Map<string, {
      code: string;
      message: string;
      contexts: Set<string>;
      evidence: Set<string>;
    }>()).values(),
  ].sort((left, right) =>
    left.message.localeCompare(right.message)
    || left.code.localeCompare(right.code));
  return `<section class="formula-panel minion-formula-panel">
    <div class="analysis-heading">
      <div><span class="eyebrow">Guarded minion arithmetic</span><h2>${esc(active.name)}</h2></div>
      ${formulaSideControls()}
    </div>
    <div class="minion-formula-primer">
      <span>actor base</span><i>×</i><span>action coefficient</span><i>×</i><span>confirmed unconditional factors</span><i>=</i><strong>known damage / contact</strong>
    </div>
    <p class="section-intro">This source-backed envelope includes only factors whose actor, action applicability, and unconditional state are confirmed. It deliberately stops before unresolved modifier pools, AI action frequency, target overlap, and enemy mitigation.</p>
    <div class="minion-formula-actors">
      ${summons.map((summon) => `<article>
        <div class="minion-formula-actor-head">
          <div><span>${esc(summon.skillName)} · L${summon.level}</span><strong>${esc(compactNumber(summon.baseline.baseDamage))} base damage</strong></div>
          <div><span>Base Life</span><b>${esc(compactNumber(summon.baseline.baseLife))}</b></div>
          <div><span>Base Armor</span><b>${esc(compactNumber(summon.baseline.baseArmor))}</b></div>
          <em>${summon.baseline.confidence === "confirmed-partial" ? "confirmed actor row" : "shared actor row · inferred"}</em>
        </div>
        <div class="minion-formula-table">
          <div class="minion-formula-row head"><span>Action</span><span>Raw / contact</span><span>Applied factors</span><span>Known / contact</span><span>Known full contact</span></div>
          ${summon.actions.map((action) => {
            const foundation = action.foundation;
            const known = action.knownDamage;
            const factors = known.factors.map((factor) =>
              `${factor.sourceName} ×${compactNumber(factor.multiplier)}`);
            return `<div class="minion-formula-row">
              <span><strong>${esc(action.actionName)}</strong><small>${esc(action.role)} · ${foundation.baseDamagePctPerContact == null ? "no damage coefficient" : `${esc(compactNumber(foundation.baseDamagePctPerContact))}% coefficient`} · ${foundation.deterministicContacts == null ? "runtime contacts" : `${foundation.deterministicContacts} known contacts`}</small></span>
              <b>${foundation.rawDamagePerContact == null ? "—" : esc(compactNumber(foundation.rawDamagePerContact))}</b>
              <b class="factor-cell">${factors.length ? factors.map((factor) => esc(factor)).join(" · ") : "none compiled"}${known.excluded.length
                ? `<details class="minion-row-exclusions">
                    <summary>${known.excluded.length} excluded input${known.excluded.length === 1 ? "" : "s"}</summary>
                    <ul>${known.excluded.map((blocker) =>
                      `<li><strong>${esc(blocker.message)}</strong>${blocker.evidence ? `<small>${esc(blocker.evidence)}</small>` : ""}</li>`).join("")}</ul>
                  </details>`
                : ""}</b>
              <b>${known.knownPerContact == null ? "—" : esc(compactNumber(known.knownPerContact))}</b>
              <b>${known.knownDeterministicFullContact == null ? "not proven" : esc(compactNumber(known.knownDeterministicFullContact))}</b>
            </div>`;
          }).join("")}
        </div>
      </article>`).join("")}
    </div>
    <div class="model-boundary">
      <div class="boundary-icon">!</div>
      <div><strong>Known unmitigated components are not total hits or minion DPS.</strong>
      ${generalBlockers.length
        ? `<ul>${generalBlockers.map((blocker) => `<li>${esc(blocker)}</li>`).join("")}</ul>`
        : "<p>No additional exclusion blocker was emitted for this guarded slice.</p>"}
      ${actionExclusionGroups.length
        ? `<details class="minion-boundary-details">
            <summary>${actionExclusionGroups.length} grouped action-input exclusion${actionExclusionGroups.length === 1 ? "" : "s"} · exact rows above</summary>
            <ul>${actionExclusionGroups.map((group) => {
              const contexts = [...group.contexts].sort();
              const evidence = [...group.evidence].sort();
              return `<li><strong>${esc(group.message)}</strong>
                <small>${contexts.length} action row${contexts.length === 1 ? "" : "s"}: ${contexts.slice(0, 3).map(esc).join(" · ")}${contexts.length > 3 ? ` · +${contexts.length - 3} more` : ""}</small>
                ${evidence.length ? `<small>Evidence: ${evidence.slice(0, 2).map(esc).join(" · ")}${evidence.length > 2 ? ` · +${evidence.length - 2} more` : ""}</small>` : ""}
              </li>`;
            }).join("")}</ul>
          </details>`
        : ""}
      </div>
    </div>
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
        ${partial.excluded.length ? `<div class="partial-detail-grid">
          <div>
            <span class="panel-kicker">Deliberately excluded</span>
            <ul>${partial.excluded.map((item) => `<li><span>${esc(item)}</span></li>`).join("")}</ul>
          </div>
        </div>` : ""}
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
    <div class="method-note"><strong>Important:</strong> every loadout uses the same shared cycleDps dummy scenario — not a promise of map damage.</div>
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
  } else if (loadout.supportEvidenceBlockers?.length) {
    items.push({
      label: `Main-skill support evidence blocked · ${loadout.supportEvidenceBlockers.length}`,
      state: "blocked",
    });
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

function observedIdentityFallback(
  before: AnalyzedLoadout,
  after: AnalyzedLoadout,
  field: "actorId" | "archetypeId",
) {
  const left = before.comparisonContext?.[field] ?? null;
  const right = after.comparisonContext?.[field] ?? null;
  if (left && right && left === right) return left;
  if (field === "actorId" && before.hero === after.hero) return before.hero;
  if (field === "archetypeId") {
    const beforeSkill = before.skills.find((skill) =>
      skill.kind === "active" && skill.enabled)?.name;
    const afterSkill = after.skills.find((skill) =>
      skill.kind === "active" && skill.enabled)?.name;
    if (beforeSkill && beforeSkill === afterSkill) return beforeSkill;
  }
  return "";
}

function renderObservedComparisonForm(
  before: AnalyzedLoadout,
  after: AnalyzedLoadout,
  plan: ComparisonActionPlan,
) {
  const left = before.observedDamage;
  const right = after.observedDamage;
  const existing = left && right
    ? compareObservedDamageMeasurements(left, right)
    : null;
  const metric: ObservedDamageMetric | "" =
    left?.metric === right?.metric
      ? left?.metric ?? "dps"
      : left && right
        ? ""
        : left?.metric ?? right?.metric ?? "dps";
  const leftScope = left ? observedFormScope(left.scope) : null;
  const rightScope = right ? observedFormScope(right.scope) : null;
  const scope: ObservedMeasurementScope | "" =
    leftScope === rightScope
      ? leftScope ?? "actor-skill"
      : leftScope && rightScope
        ? ""
        : leftScope ?? rightScope ?? "actor-skill";
  const beforeConfidence: ObservedMeasurementConfidence =
    left?.confidence ?? "approximate";
  const afterConfidence: ObservedMeasurementConfidence =
    right?.confidence ?? "approximate";
  const actorId = sharedObservedFormText(
    left?.actorId,
    right?.actorId,
    observedIdentityFallback(before, after, "actorId"),
  );
  const skillId = sharedObservedFormText(
    left?.skillId,
    right?.skillId,
    observedIdentityFallback(before, after, "archetypeId"),
  );
  const targetLabel = sharedObservedFormText(
    left?.targetLabel,
    right?.targetLabel,
    "",
  );
  const scenarioLabel = sharedObservedFormText(
    left?.scenarioLabel,
    right?.scenarioLabel,
    "",
  );
  const beforeSource = left?.source ?? "";
  const afterSource = right?.source ?? "";
  const duration = sharedObservedFormDuration(left, right);
  const conditions = sharedObservedFormConditions(left, right);
  const identityBlocker = plan.blockers.find((blocker) =>
    blocker.code === "observed-loadout-identity-mismatch"
    || blocker.code === "observed-same-loadout");
  const existingStatus = before === after
    ? "Select two distinct loadout snapshots before recording or comparing an in-game result."
    : identityBlocker
      ? identityBlocker.detail
    : existing
    && plan.summary.comparisonKind === "incompatible"
    ? "Both results are saved, but this imported build pair is incompatible; no observed delta is attached to its action queue."
    : existing?.status === "comparable"
    ? `Saved ${existing.confidence} ${existing.scope === "whole-loadout" ? "whole-loadout" : "actor/skill"} ${existing.metric === "dps" ? "DPS" : "damage-per-hit"} result: ${signedPercent(existing.percentChange)}. The outcome is observed in that scope; the cause is still ranked separately.`
    : existing?.status === "reference-only"
      ? `Both results are saved but remain reference-only: ${existing.reasons.join(", ").replaceAll("-", " ")}.`
      : existing?.status === "invalid"
        ? "The saved observation failed revalidation. Re-enter both values."
        : "No aligned in-game result has been added for this pair.";
  const existingStatusClass = before === after || identityBlocker
    ? "reference-only"
    : existing
    && plan.summary.comparisonKind === "incompatible"
    ? "reference-only"
    : existing?.status ?? "empty";
  const identityMissing = !actorId || !skillId;
  const metadataConflicts = observedMetadataConflicts(left, right);

  return `<section class="observed-capture" aria-labelledby="observed-capture-title">
    <div class="observed-capture-head">
      <div>
        <span class="eyebrow">In-game outcome</span>
        <h3 id="observed-capture-title">Record what actually happened.</h3>
      </div>
      <span class="observed-basis">Observed ≠ modeled</span>
    </div>
    <p>Enter the before and after number from one repeatable test. This establishes the result; imported formula evidence below still has to explain the cause.</p>
    ${metadataConflicts.length ? `<aside class="observed-conflicts">
      <strong>Saved results disagree. Re-enter the shared test fields before comparing them.</strong>
      <ul>${metadataConflicts.map((conflict) =>
        `<li><span>${esc(conflict.label)}</span><small>Before: ${esc(conflict.before)}</small><small>After: ${esc(conflict.after)}</small></li>`).join("")}</ul>
    </aside>` : ""}
    <form data-observed-comparison-form${metadataConflicts.length ? " data-metadata-conflicts" : ""}>
      ${metadataConflicts.length ? `<label class="observed-conflict-confirm">
        <input type="checkbox" name="confirmMetadataOverwrite" value="yes" required
          aria-describedby="observed-form-status">
        <span>I understand that saving will replace both entries' shared test fields with the values below, including any blanks.</span>
      </label>` : ""}
      <div class="observed-value-grid">
        <label>
          <span>Before observed</span>
          <input name="beforeValue" value="${escAttr(left?.value ?? "")}" inputmode="decimal"
            placeholder="e.g. 1T" required autocomplete="off" aria-describedby="observed-form-status">
          <small>${esc(before.name)}</small>
        </label>
        <label>
          <span>After observed</span>
          <input name="afterValue" value="${escAttr(right?.value ?? "")}" inputmode="decimal"
            placeholder="e.g. 760B" required autocomplete="off" aria-describedby="observed-form-status">
          <small>${esc(after.name)}</small>
        </label>
        <label>
          <span>Metric</span>
          <select name="metric" required aria-describedby="observed-form-status">
            ${metric === "" ? '<option value="" selected>Choose metric</option>' : ""}
            <option value="dps"${metric === "dps" ? " selected" : ""}>DPS</option>
            <option value="damage-per-hit"${metric === "damage-per-hit" ? " selected" : ""}>Damage per hit</option>
          </select>
          <small>Per-hit is never converted into DPS.</small>
        </label>
        <label>
          <span>Observation scope</span>
          <select name="scope" required aria-describedby="observed-form-status">
            ${scope === "" ? '<option value="" selected>Choose scope</option>' : ""}
            <option value="actor-skill"${scope === "actor-skill" ? " selected" : ""}>Actor / skill</option>
            <option value="whole-loadout"${scope === "whole-loadout" ? " selected" : ""}>Whole loadout</option>
          </select>
          <small>Whole loadout only when this is the complete build result.</small>
        </label>
        <label>
          <span>Before reading</span>
          <select name="beforeConfidence" required aria-describedby="observed-form-status">
            <option value="approximate"${beforeConfidence === "approximate" ? " selected" : ""}>Approximate</option>
            <option value="exact"${beforeConfidence === "exact" ? " selected" : ""}>Exact</option>
          </select>
          <small>${esc(before.name)}</small>
        </label>
        <label>
          <span>After reading</span>
          <select name="afterConfidence" required aria-describedby="observed-form-status">
            <option value="approximate"${afterConfidence === "approximate" ? " selected" : ""}>Approximate</option>
            <option value="exact"${afterConfidence === "exact" ? " selected" : ""}>Exact</option>
          </select>
          <small>${esc(after.name)} · use approximate for rounded or ~ values.</small>
        </label>
      </div>
      <div class="observed-scenario-grid">
        <label>
          <span>Target</span>
          <input name="targetLabel" value="${escAttr(targetLabel)}" required maxlength="160"
            placeholder="Name the same in-game target" aria-describedby="observed-form-status">
        </label>
        <label>
          <span>Test setup</span>
          <input name="scenarioLabel" value="${escAttr(scenarioLabel)}" required maxlength="160"
            placeholder="Name the repeatable test setup" aria-describedby="observed-form-status">
        </label>
        <label>
          <span>Sample seconds <em>optional, DPS only</em></span>
          <input name="sampleDurationSeconds" value="${escAttr(duration)}" inputmode="decimal"
            placeholder="e.g. 10" autocomplete="off" aria-describedby="observed-form-status"
            ${metric === "damage-per-hit" ? "disabled" : ""}>
        </label>
      </div>
      <details class="observed-identity"${identityMissing || !beforeSource || !afterSource || Boolean(identityBlocker) ? " open" : ""}>
        <summary>Actor, skill, conditions, and required provenance</summary>
        <p>These fields stop unlike tests from producing a convincing but invalid percentage.</p>
        <div>
          <label>
            <span>Actor identifier</span>
            <input name="actorId" value="${escAttr(actorId)}" maxlength="128"
              placeholder="Character or summoned actor" required aria-describedby="observed-form-status">
          </label>
          <label>
            <span>Skill identifier</span>
            <input name="skillId" value="${escAttr(skillId)}" maxlength="128"
              placeholder="Measured skill or action" required aria-describedby="observed-form-status">
          </label>
          <label class="observed-wide">
            <span>Conditions <em>separate with semicolons</em></span>
            <input name="conditions" value="${escAttr(conditions)}" maxlength="5200"
              placeholder="stationary; target slowed; all buffs active"
              aria-describedby="observed-form-status">
          </label>
          <label>
            <span>Before source</span>
            <input name="beforeSource" value="${escAttr(beforeSource)}" required maxlength="160"
              placeholder="e.g. dummy log or video A" aria-describedby="observed-form-status">
          </label>
          <label>
            <span>After source</span>
            <input name="afterSource" value="${escAttr(afterSource)}" required maxlength="160"
              placeholder="e.g. dummy log or video B" aria-describedby="observed-form-status">
          </label>
        </div>
      </details>
      <div class="observed-form-actions">
        <button type="submit">Use observed result</button>
        <button type="button" class="quiet-button" data-clear-observed
          ${left || right ? "" : "disabled"}>Clear result</button>
        <p id="observed-form-status" class="observed-form-status ${existingStatusClass}" role="status" aria-live="polite">${esc(existingStatus)}</p>
      </div>
      <small class="observed-storage-note">Session-local: each loadout keeps one observation, including its own confidence and source. Saving replaces both selected entries; Clear removes both.</small>
    </form>
  </section>`;
}

const ACTION_PROOF_COPY: Record<ActionProof, {
  label: string;
  boundary: string;
}> = {
  "observed-result": {
    label: "Observed result",
    boundary: "A user-recorded outcome under one declared matching test. It proves direction and magnitude for that metric, not which edit caused it.",
  },
  "modeled-scenario": {
    label: "Modeled rollback",
    boundary: "An after-state, one-layer counterfactual inside one fixed shared scenario; grouped fields may still be coupled or unavailable in game.",
  },
  "guarded-partial": {
    label: "Guarded formula slice",
    boundary: "Source-backed arithmetic for one component, never silently promoted to total hit damage or DPS.",
  },
  "source-term": {
    label: "Compiled source term",
    boundary: "The input and actor scope are known; the complete runtime formula is not.",
  },
  structural: {
    label: "Structural lead",
    boundary: "A changed entity worth isolating; no numeric direction is claimed.",
  },
};

const ACTION_DIRECTION_COPY: Record<ActionFinding["direction"], string> = {
  loss: "loss signal",
  gain: "gain signal",
  tradeoff: "tradeoff",
  risk: "needs isolation",
  neutral: "neutral check",
  "weaker-input": "weaker input",
  "stronger-input": "stronger input",
};

function actionMetric(finding: ActionFinding) {
  const metric = finding.metric;
  if (!metric) return "";
  const relative = metric.relativeDelta == null
    ? ""
    : `<b>${esc(signedPercent(metric.relativeDelta * 100))}</b>`;
  return `<div class="action-metric" aria-label="${escAttr(metric.label)}">
    <span><small>Before</small><strong>${esc(compactNumber(metric.before))}</strong></span>
    <i aria-hidden="true">→</i>
    <span><small>After</small><strong>${esc(compactNumber(metric.after))}</strong></span>
    <span class="action-metric-delta"><small>${esc(metric.unit)}</small>${relative || `<b>${esc(signedCompact(metric.delta))}</b>`}</span>
  </div>`;
}

function actionHeadline(finding: ActionFinding) {
  // Prefer the concrete change over long actor/parenthetical titles.
  return shortSkillLabel(
    finding.title
      .replace(/\s+on\s+/g, " · ")
      .replace(/\s{2,}/g, " ")
      .trim(),
  );
}

function actionChangeLine(finding: ActionFinding) {
  const skip = /not net|not a player|not DPS|exact support text|imported identity only|socket terms are known|defensive input is known/i;
  // Prefer the socket/skill line over "Support swap:" restatement of the title.
  const preferred = finding.evidence.find((entry) => /^Socket\s+\d+/i.test(entry))
    ?? finding.evidence.find((entry) => !skip.test(entry) && !/^Support swap:/i.test(entry));
  if (!preferred) return "";
  const short = shortSkillLabel(preferred.split(" · ").slice(0, 2).join(" · "));
  return short.length > 72 ? `${short.slice(0, 69)}…` : short;
}

function actionFindingCard(finding: ActionFinding, rank: number) {
  const proof = ACTION_PROOF_COPY[finding.proof];
  const section = finding.target.section;
  const openLabel = section
    ? SYSTEM_LABELS[section]
    : finding.target.view;
  const changeLine = actionChangeLine(finding);
  return `<article class="action-card ${finding.direction}">
    <div class="action-rank" aria-label="Priority ${rank}">${rank}</div>
    <div class="action-card-body">
      <div class="action-card-meta">
        <span class="proof-badge ${finding.proof}">${esc(proof.label)}</span>
        <span class="direction-badge">${esc(ACTION_DIRECTION_COPY[finding.direction])}</span>
      </div>
      <h3>${esc(actionHeadline(finding))}</h3>
      ${changeLine ? `<p class="action-change-line">${esc(changeLine)}</p>` : ""}
      ${actionMetric(finding)}
      <div class="action-card-footer">
        <button type="button" class="primary-button" data-action-view="${finding.target.view}"
          ${section ? `data-action-section="${section}"` : ""}>
          Open ${esc(openLabel)}
        </button>
        <details class="action-evidence">
          <summary>Details</summary>
          <p class="action-detail-lead">${esc(finding.explanation)}</p>
          <p class="action-detail-next"><strong>Test:</strong> ${esc(finding.nextExperiment)}</p>
          <ul>${finding.evidence.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
          <p class="action-detail-boundary">${esc(proof.boundary)}</p>
        </details>
      </div>
    </div>
  </article>`;
}

function renderActions(
  before: AnalyzedLoadout,
  after: AnalyzedLoadout,
  plan: ComparisonActionPlan,
) {
  const proofCounts = [
    ["observed-result", "Observed results", plan.summary.observed],
    ["modeled-scenario", "Modeled rollbacks", plan.summary.modeled],
    ["guarded-partial", "Guarded slices", plan.summary.guardedPartial],
    ["source-term", "Source terms", plan.summary.sourceTerms],
    ["structural", "Structural leads", plan.summary.structural],
  ] as const;
  const topBlockers = plan.blockers.slice(0, 8);
  const actionGroups = [
    {
      id: "damage",
      label: "Damage",
      note: "Hits, supports, scaling",
      findings: plan.findings.filter((finding) => finding.domain === "damage"),
    },
    {
      id: "survival",
      label: "Survival",
      note: "Defense inputs only",
      findings: plan.findings.filter((finding) => finding.domain === "survival"),
    },
    {
      id: "build",
      label: "Build",
      note: "Isolate these next",
      findings: plan.findings.filter((finding) => finding.domain === "build"),
    },
  ].filter((group) => group.findings.length > 0);
  const groupedActions = actionGroups.map((group) => {
    const visible = group.findings.slice(0, 2);
    const hidden = group.findings.slice(2);
    return `<section class="action-domain-group ${group.id}">
      <div class="action-domain-head">
        <div><span>${esc(group.note)}</span><h3>${esc(group.label)}</h3></div>
        <strong>${group.findings.length}</strong>
      </div>
      <div class="action-card-list">
        ${visible.map((finding, index) =>
          actionFindingCard(finding, index + 1)).join("")}
      </div>
      ${hidden.length ? `<details class="action-more">
        <summary>Show ${hidden.length} more ${esc(group.label.toLocaleLowerCase())} ${hidden.length === 1 ? "check" : "checks"}</summary>
        <div class="action-card-list">${hidden.map((finding, index) =>
          actionFindingCard(finding, visible.length + index + 1)).join("")}</div>
      </details>` : ""}
    </section>`;
  }).join("");
  const progression = plan.summary.comparisonKind === "progression";
  const incompatible = plan.summary.comparisonKind === "incompatible";
  const teaching =
    before.comparisonContext?.sourceKind === "teaching"
    && after.comparisonContext?.sourceKind === "teaching";
  const userConfirmed =
    before.comparisonContext?.lineageEvidence === "user-confirmed-pair"
    && after.comparisonContext?.lineageEvidence === "user-confirmed-pair";
  const canConfirm =
    plan.summary.comparisonKind === "reference"
    && /lineage/i.test(plan.summary.comparisonReason);
  const progressionLoop =
    `<div class="experiment-loop" aria-label="Recommended comparison workflow">
        <div><b>1</b><span><strong>Duplicate</strong> the current loadout</span></div>
        <i aria-hidden="true">→</i>
        <div><b>2</b><span><strong>Change one</strong> ranked input</span></div>
        <i aria-hidden="true">→</i>
        <div><b>3</b><span><strong>Import both</strong> snapshots</span></div>
        <i aria-hidden="true">→</i>
        <div><b>4</b><span><strong>Keep or revert</strong> from evidence</span></div>
      </div>`;
  const loop = progression
    ? `${userConfirmed ? `<div class="comparison-mode-banner confirmed">
          <span>User-confirmed pair</span>
          <strong>Progression language is enabled for this browser session.</strong>
          <p>The site verified matching patch, actor, archetype, and source family; you supplied the missing same-character history.</p>
          <button type="button" class="quiet-button" data-clear-progression>Undo confirmation</button>
        </div>` : ""}${progressionLoop}`
    : `<div class="comparison-mode-banner ${incompatible ? "incompatible" : teaching ? "demonstration" : "reference"}">
        <span>${incompatible ? "Incompatible pair" : teaching ? "Teaching demonstration" : "Reference-only pair"}</span>
        <strong>${esc(plan.summary.comparisonReason)}</strong>
        <p>${teaching
          ? "Use the ranked checks as formula exercises. They explain the fixed scenario, but are not attributed to an imported character’s history."
          : incompatible
          ? "No ranked change advice is emitted. Select snapshots from the same patch and actor."
          : "Raw contrasts remain visible, but causal and rollback language is withheld until both loadouts share a proven source-document lineage."}</p>
        ${canConfirm ? `<button type="button" class="quiet-button" data-confirm-progression>Confirm these are the same character</button>` : ""}
      </div>`;
  const activeProof = proofCounts.filter(([, , count]) => count > 0);
  return `<section class="actions-view">
    <div class="actions-hero">
      <div>
        <span class="eyebrow">Improve DPS</span>
        <h2>${progression ? "One change at a time." : teaching ? "Practice the scaling layers." : incompatible ? "Pick a compatible pair first." : "Study the contrast — don’t force a cause yet."}</h2>
        <p>${progression
          ? "Run the top experiment below. Keep the rest collapsed until you need them."
          : "Evidence first. Ranked checks stay available without inventing missing mechanics."}</p>
      </div>
      <button type="button" class="copy-report-button" data-copy-action-report>
        ${reportCopyState === "copied" ? "Copied comparison report" : reportCopyState === "failed" ? "Copy failed — retry" : "Copy report"}
      </button>
    </div>
    ${loop}
    <div class="action-queue">
      <div class="analysis-heading">
        <div>
          <span class="panel-kicker">Do this next</span>
          <h2>${plan.findings.length
            ? plan.findings.length === 1
              ? "1 ranked experiment"
              : `${plan.findings.length} ranked experiments`
            : "No safe experiment yet"}</h2>
        </div>
        <span class="exact-badge">${esc(before.name)} → ${esc(after.name)}</span>
      </div>
      ${plan.findings.length
        ? groupedActions
        : `<div class="action-empty">
            <strong>No causal experiment is safe for this pair yet.</strong>
            <p>Choose two snapshots of the same actor and archetype, or open the blockers below.</p>
          </div>`}
    </div>
    <div class="actions-secondary">
      <details class="density-fold">
        <summary>
          Evidence snapshot
          <span>${activeProof.map(([, label, count]) => `${count} ${label}`).join(" · ")
            || "No ranked evidence yet"}</span>
        </summary>
        <div class="action-proof-strip" aria-label="Evidence levels in this comparison">
          ${proofCounts.map(([proof, label, count]) => `<div class="${proof}">
            <span>${esc(label)}</span><strong>${count}</strong>
          </div>`).join("")}
          <div class="action-proof-status">
            <span>${plan.summary.observedDpsScope === "actor-skill"
              ? "Scoped DPS"
              : "Net DPS"}</span><strong>${plan.summary.observedDpsAvailable
              ? "Whole-loadout observed"
              : plan.summary.observedDpsScope === "actor-skill"
                ? "Actor / skill observed"
                : plan.summary.netDpsAvailable
                  ? "Shared model only"
                  : "Not calculated"}</strong>
          </div>
          <div class="action-proof-status">
            <span>EHP</span><strong>Not calculated</strong>
          </div>
        </div>
      </details>
      <details class="density-fold">
        <summary>
          Record in-game result
          <span>Optional · compares matched DPS or hit readings</span>
        </summary>
        ${renderObservedComparisonForm(before, after, plan)}
      </details>
      <details class="density-fold" ${plan.findings.length ? "" : "open"}>
        <summary>
          What still blocks a complete score
          <span>${topBlockers.length
            ? `${topBlockers.length} open blocker${topBlockers.length === 1 ? "" : "s"}`
            : "No explicit blocker"}</span>
        </summary>
        <aside class="action-blockers">
          <p>Missing bridges stay explicit. Nothing is assumed to be zero.</p>
          ${topBlockers.length
            ? `<ol>${topBlockers.map((blocker) => `<li>
                <span>${esc(blocker.side)}</span>
                <strong>${esc(blocker.title)}</strong>
                <p>${esc(blocker.detail)}</p>
                ${blocker.evidence ? `<small>${esc(blocker.evidence)}</small>` : ""}
                ${(blocker.contexts?.length ?? 0) > 1 ? `<details class="blocker-contexts">
                  <summary>Show ${blocker.contexts!.length} contexts</summary>
                  <div>${blocker.contexts!.map((context) => `<small>${esc(context)}</small>`).join("")}</div>
                </details>` : ""}
              </li>`).join("")}</ol>`
            : `<div class="action-empty compact"><strong>No explicit blocker was emitted.</strong><p>Coverage may still be structural only; review the coverage view before treating any result as complete.</p></div>`}
          <button type="button" class="quiet-button action-coverage-link" data-action-view="coverage">Review all coverage</button>
        </aside>
      </details>
    </div>
  </section>`;
}

function navigation() {
  // On the loadout page, default "DPS" tab is gear + formula; coverage is the deep dive.
  const items: { id: View; label: string }[] = [
    { id: "explain", label: "DPS & gear" },
    { id: "coverage", label: "Unmodeled" },
  ];
  return `<nav class="view-tabs" aria-label="Loadout views">
    ${items.map((item) => `<a href="${escAttr(hrefFor("loadout", { view: item.id }))}"
      data-view="${item.id}" class="${activeView === item.id ? "active" : ""}"
      ${activeView === item.id ? `aria-current="page"` : ""}>
      ${esc(item.label)}
    </a>`).join("")}
  </nav>`;
}

function goToLeaderboard(historyMode: "push" | "replace" = "push") {
  appPage = "leaderboard";
  writeUrl(historyMode);
  render();
  restoreWorkspaceFocus('[data-import-tab][aria-selected="true"]');
}

function goToLoadoutPage(
  focusSelector = "#loadout-page-title",
  historyMode: "push" | "replace" = "push",
) {
  appPage = "loadout";
  if (activeView === "build" || activeView === "changes" || activeView === "formula"
      || activeView === "diagnosis" || activeView === "actions") {
    activeView = "explain";
  }
  if (!URL_VIEWS.has(activeView)) activeView = "explain";
  writeUrl(historyMode);
  render();
  restoreWorkspaceFocus(focusSelector);
}

function render() {
  const active = selection ? activeLoadout() : null;
  // Keep dual-side pointers aligned for any secondary helpers still invoked.
  if (selection) {
    beforeSelection = selection;
    afterSelection = selection;
  }

  const onLeaderboard = appPage === "leaderboard";
  const loadoutNavActive = !onLeaderboard && active;
  let mainBody = "";
  if (onLeaderboard) {
    mainBody = `<section class="workspace-intro">
      <div>
        <span class="eyebrow">Step 1 · Pick a build</span>
        <h2>Leaderboard & import</h2>
        <p>Choose a leaderboard loadout, paste a Compendium code, or drop a tli_dump export. Then open the loadout page for equipped gear and the DPS formula.</p>
      </div>
    </section>
    ${loadBuildMountHtml()}`;
  } else if (active) {
    mainBody = `<div class="view-content loadout-page">${renderLoadoutPage(active.build, active.loadout)}</div>`;
  } else {
    mainBody = `<section class="single-panel empty-analysis">
      <div class="analysis-heading"><div><span class="eyebrow">No loadout</span><h2>Pick a build first</h2></div></div>
      <p>Open the leaderboard to choose a loadout or import a build.</p>
      <button type="button" class="primary-button" data-app-page="leaderboard">Go to leaderboard</button>
    </section>`;
  }

  app.innerHTML = `<header class="site-header">
    <div class="header-inner">
      <a class="brand" href="${escAttr(hrefFor("leaderboard"))}" aria-label="TLI Lens home" data-app-page="leaderboard">
        <span class="brand-mark"><i></i></span>
        <span><b>TLI</b> Lens</span>
        <em>alpha</em>
      </a>
      <nav class="primary-nav" aria-label="Primary">
        <a href="${escAttr(hrefFor("leaderboard"))}" data-app-page="leaderboard" class="${onLeaderboard ? "active" : ""}">Leaderboard</a>
        <a href="${escAttr(active ? hrefFor("loadout") : hrefFor("leaderboard"))}" data-app-page="loadout" class="${loadoutNavActive ? "active" : ""}"${active ? "" : " aria-disabled=\"true\""}>Loadout</a>
        <a href="/rehan">Rehan guide</a>
        <a href="/bing">Bing guide</a>
      </nav>
      <div class="header-meta">
        <span class="season-dot"></span><span title="Guarded mechanics use SS13 evidence. Some display labels come from cached SS12.5 bundles with SS13 skill and pact overlays.">SS13 mechanics</span>
        <a href="https://github.com/ChandlerFerry/etor-translations/releases/" target="_blank" rel="noopener">Game tools ↗</a>
      </div>
    </div>
  </header>
  <main class="workspace" id="workspace">
    ${mainBody}
  </main>
  <footer class="site-footer">
    <span>TLI Lens is an independent community tool.</span>
    <span>Built around explicit assumptions, source data, and formulas you can inspect.</span>
  </footer>`;

  if (onLeaderboard) {
    mountLoadBuildPanel();
  } else if (loadBuildPanel && loadBuildPanel.parentElement !== document.body) {
    loadBuildPanel.hidden = true;
    document.body.appendChild(loadBuildPanel);
  }
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

function focusLoadBuildPanel(tab: "supported" | "code" | "dump" = "supported") {
  const tabButton = document.getElementById(`import-tab-${tab}`) as HTMLButtonElement | null;
  if (tabButton) activateImportTab(tabButton);
  loadBuildPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  window.requestAnimationFrame(() => {
    loadBuildPanel?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
  });
}

/** Legacy compare-shell entry: return to the leaderboard import surface. */
function openImportDialog(side: Side) {
  importTarget = side;
  appPage = "leaderboard";
  if (importLead) {
    importLead.textContent =
      "Pick a leaderboard loadout, paste a Compendium build code, or import a tli_dump / Compendium JSON export.";
  }
  setImportStatus(`Load a build to explain (${sideLabel(side)} path).`);
  writeUrl("push");
  render();
  focusLoadBuildPanel("supported");
}

function selectLoadout(buildId: string, loadoutId: string) {
  const build = builds.find((item) => item.id === buildId);
  const loadout = build?.loadouts.find((item) => item.id === loadoutId);
  if (!build || !loadout) {
    setImportStatus("That loadout is not available in this session.", "error");
    return;
  }
  setSelection({ buildId: build.id, loadoutId: loadout.id });
  activeView = "explain";
  reportCopyState = "idle";
  setImportStatus("");
  goToLoadoutPage("#loadout-page-title", "push");
}

function applySupportedBuild(buildId: string) {
  const build = builds.find((item) => item.id === buildId);
  if (!build?.loadouts.length) {
    setImportStatus("That supported build is not available in this session.", "error");
    return;
  }
  const defaults = defaultLoadoutPair(build);
  const loadout = build.loadouts[defaults.afterIndex]
    ?? build.loadouts.find((item) => item.isCurrent)
    ?? build.loadouts[build.loadouts.length - 1]
    ?? build.loadouts[0];
  selectLoadout(build.id, loadout.id);
}

function activateImported(build: AnalyzedBuild) {
  builds.push(build);
  const loadout = build.loadouts.find((item) => item.isCurrent) ?? build.loadouts[0];
  setSelection({ buildId: build.id, loadoutId: loadout.id });
  reportCopyState = "idle";
  activeView = "explain";
  if (build.needsResolution) {
    appPage = "leaderboard";
    setImportStatus(
      "Build code saved. Open it in-game, capture with tli_dump, then import that JSON on the tli_dump tab.",
      "info",
    );
    writeUrl("push");
    render();
    const dumpTab = document.getElementById("import-tab-dump") as HTMLButtonElement | null;
    if (dumpTab) activateImportTab(dumpTab);
    restoreWorkspaceFocus("#build-code");
    return;
  }
  setImportStatus("");
  goToLoadoutPage("#loadout-page-title", "push");
}

async function copyCurrentActionReport() {
  const before = selected("before").loadout;
  const after = selected("after").loadout;
  const report = actionPlanReport(before, after);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(report);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = report;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (!copied) throw new Error("The browser declined the copy command.");
    }
    reportCopyState = "copied";
  } catch {
    reportCopyState = "failed";
  }
  render();
  restoreWorkspaceFocus("[data-copy-action-report]");
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
    setImportStatus("Loading the pinned import catalogs…");
    const catalog = await loadImportCatalog();
    activateImported(importBuild(value, catalog, demo.builds, file.name));
  } catch (error) {
    setImportStatus(error instanceof Error ? error.message : "The file could not be imported.", "error");
  } finally {
    fileInput.value = "";
  }
}

app.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)
      || !form.matches("[data-observed-comparison-form]")) {
    return;
  }
  event.preventDefault();
  const before = selected("before");
  const after = selected("after");
  const status = form.querySelector<HTMLElement>(".observed-form-status");
  const fields = form.querySelectorAll<HTMLElement>("[aria-invalid]");
  fields.forEach((field) => field.removeAttribute("aria-invalid"));

  if (before.loadout === after.loadout) {
    if (status) {
      status.className = "observed-form-status invalid";
      status.textContent =
        "Choose two distinct loadout snapshots before recording two results.";
    }
    return;
  }

  const values = new FormData(form);
  if (form.hasAttribute("data-metadata-conflicts")
      && values.get("confirmMetadataOverwrite") !== "yes") {
    const confirmation = form.elements.namedItem(
      "confirmMetadataOverwrite",
    ) as HTMLInputElement | null;
    confirmation?.setAttribute("aria-invalid", "true");
    if (status) {
      status.className = "observed-form-status invalid";
      status.textContent =
        "Confirm that the shared test fields should replace both saved entries, or clear the pair first.";
    }
    confirmation?.focus();
    return;
  }
  const shared = {
    metric: values.get("metric"),
    scope: values.get("scope"),
    actorId: values.get("actorId"),
    skillId: values.get("skillId"),
    targetLabel: values.get("targetLabel"),
    scenarioLabel: values.get("scenarioLabel"),
    sampleDurationSeconds: values.get("sampleDurationSeconds"),
    conditions: values.get("conditions"),
  };
  const beforeResult = parseObservedDamageMeasurement({
    ...shared,
    value: values.get("beforeValue"),
    confidence: values.get("beforeConfidence"),
    source: values.get("beforeSource"),
  });
  const afterResult = parseObservedDamageMeasurement({
    ...shared,
    value: values.get("afterValue"),
    confidence: values.get("afterConfidence"),
    source: values.get("afterSource"),
  });
  if (beforeResult.status === "invalid" || afterResult.status === "invalid") {
    const issues = [
      ...(beforeResult.status === "invalid"
        ? beforeResult.issues.map((issue) => ({ side: "Before", ...issue }))
        : []),
      ...(afterResult.status === "invalid"
        ? afterResult.issues.map((issue) => ({ side: "After", ...issue }))
        : []),
    ];
    let firstInvalid: HTMLElement | null = null;
    for (const issue of issues) {
      const sidePrefix = issue.side === "Before" ? "before" : "after";
      const name = issue.field === "value"
        ? `${sidePrefix}Value`
        : issue.field === "confidence"
          ? `${sidePrefix}Confidence`
          : issue.field === "source"
            ? `${sidePrefix}Source`
            : issue.field;
      const field = form.querySelector<HTMLElement>(
        `[name="${CSS.escape(name)}"]`,
      );
      field?.setAttribute("aria-invalid", "true");
      firstInvalid ??= field;
    }
    if (status) {
      status.className = "observed-form-status invalid";
      status.textContent = issues
        .map((issue) => `${issue.side}: ${issue.message}`)
        .filter((message, index, all) => all.indexOf(message) === index)
        .join(" ");
    }
    const disclosure = firstInvalid?.closest<HTMLDetailsElement>("details");
    if (disclosure) disclosure.open = true;
    firstInvalid?.focus();
    return;
  }

  before.loadout.observedDamage = beforeResult.measurement;
  after.loadout.observedDamage = afterResult.measurement;
  reportCopyState = "idle";
  render();
  restoreWorkspaceFocus("[data-clear-observed]");
});

app.addEventListener("change", (event) => {
  const target = event.target as HTMLSelectElement | HTMLInputElement;
  if (target.matches("input[data-suggestion-lever]")) {
    const panel = target.closest<HTMLElement>("[data-suggestion-panel]");
    if (panel) recomputeSuggestionStack(panel);
    return;
  }
  if (target.matches('[data-observed-comparison-form] [name="metric"]')) {
    const form = target.closest<HTMLFormElement>(
      "[data-observed-comparison-form]",
    );
    const duration = form?.elements.namedItem(
      "sampleDurationSeconds",
    ) as HTMLInputElement | null;
    if (duration) {
      const perHit = target.value === "damage-per-hit";
      if (perHit) duration.value = "";
      duration.disabled = perHit;
    }
    return;
  }
  if (!target.matches("[data-selection]")) return;
  const next = readSelectionKey(target.value);
  if (!next) return;
  const side = target.dataset.selection;
  if (side === "active" || side === "after" || side === "before") {
    setSelection(next);
  }
  reportCopyState = "idle";
  writeUrl("push");
  render();
  restoreWorkspaceFocus(`#${side}-loadout`);
});

app.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("button, a");
  if (!target) return;
  const page = target.dataset.appPage as AppPage | undefined;
  if (page === "leaderboard") {
    event.preventDefault();
    goToLeaderboard("push");
    return;
  }
  if (page === "loadout") {
    event.preventDefault();
    if (!selection) {
      goToLeaderboard("push");
      return;
    }
    goToLoadoutPage("#loadout-page-title", "push");
    return;
  }
  const view = target.dataset.view as View | undefined;
  const viewLink = target.dataset.viewLink as View | undefined;
  if (view || viewLink) {
    event.preventDefault();
    activeView = normalizeView(view ?? viewLink);
    appPage = "loadout";
    writeUrl("push");
    render();
    restoreWorkspaceFocus(`[data-view="${activeView}"]`);
    document.querySelector(".view-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (target.hasAttribute("data-copy-action-report")) {
    void copyCurrentActionReport();
    return;
  }
  if (target.hasAttribute("data-clear-observed")) {
    delete selected("before").loadout.observedDamage;
    delete selected("after").loadout.observedDamage;
    reportCopyState = "idle";
    render();
    restoreWorkspaceFocus("[data-observed-comparison-form] input");
    return;
  }
  if (target.hasAttribute("data-confirm-progression")) {
    const before = selected("before");
    const after = selected("after");
    const left = before.loadout.comparisonContext;
    const right = after.loadout.comparisonContext;
    if (left && right) {
      const lineageId = `user-confirmed:${[
        selectionKey(before.build, before.loadout),
        selectionKey(after.build, after.loadout),
      ].sort().join("|")}`;
      left.lineageId = lineageId;
      right.lineageId = lineageId;
      left.lineageEvidence = "user-confirmed-pair";
      right.lineageEvidence = "user-confirmed-pair";
      reportCopyState = "idle";
      render();
      restoreWorkspaceFocus("[data-clear-progression]");
    }
    return;
  }
  if (target.hasAttribute("data-clear-progression")) {
    for (const side of ["before", "after"] as const) {
      const context = selected(side).loadout.comparisonContext;
      if (context?.lineageEvidence !== "user-confirmed-pair") continue;
      context.lineageId = null;
      delete context.lineageEvidence;
    }
    reportCopyState = "idle";
    render();
    restoreWorkspaceFocus("[data-confirm-progression]");
    return;
  }
  const actionView = target.dataset.actionView as View | undefined;
  if (actionView) {
    activeView = normalizeView(actionView);
    appPage = "loadout";
    const actionSection = target.dataset.actionSection as ChangeSection | undefined;
    if (actionSection) changeSection = actionSection;
    reportCopyState = "idle";
    writeUrl("push");
    render();
    restoreWorkspaceFocus(`[data-view="${activeView}"]`);
    return;
  }
  const side = target.dataset.import as Side | undefined;
  if (side) {
    importTarget = side;
    openImportDialog(side);
    return;
  }
  if (target.hasAttribute("data-swap")) {
    [beforeSelection, afterSelection] = [afterSelection, beforeSelection];
    reportCopyState = "idle";
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
    activeView = "explain";
    appPage = "loadout";
    writeUrl("push");
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
      activeView = "explain";
      appPage = "loadout";
      formulaSide = "after";
      writeUrl("push");
      render();
      restoreWorkspaceFocus(".bd-total");
    }
    return;
  }
});

window.addEventListener("popstate", () => {
  suppressUrlWrite = true;
  applyLocationToState();
  suppressUrlWrite = false;
  lastWrittenLocation = currentLocationKey();
  render();
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

loadBuildPanel.addEventListener("click", (event) => {
  const pick = (event.target as HTMLElement).closest<HTMLElement>("[data-select-loadout]");
  if (pick?.dataset.selectBuild && pick.dataset.selectLoadout) {
    event.preventDefault();
    selectLoadout(pick.dataset.selectBuild, pick.dataset.selectLoadout);
    return;
  }
  // Whole-card fallback for any remaining data-supported-build controls.
  const card = (event.target as HTMLElement).closest<HTMLElement>("[data-supported-build]");
  if (card?.dataset.supportedBuild) {
    event.preventDefault();
    applySupportedBuild(card.dataset.supportedBuild);
  }
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

document.getElementById("analyze-code")!.addEventListener("click", () => {
  const raw = codeInput.value.trim();
  if (!raw) {
    setImportStatus("Paste a Compendium or in-game build code first.", "error");
    return;
  }
  try {
    activateImported(importBuildCode(raw));
  } catch (error) {
    setImportStatus(
      error instanceof Error ? error.message : "That build code could not be read.",
      "error",
    );
  }
});

document.getElementById("analyze-paste")!.addEventListener("click", async () => {
  const raw = pasteInput.value.trim();
  if (!raw) {
    setImportStatus("Paste tli_dump or Compendium JSON first.", "error");
    return;
  }
  const rawBytes = new TextEncoder().encode(raw).byteLength;
  if (rawBytes > MAX_IMPORT_BYTES) {
    setImportStatus(importSizeMessage(rawBytes), "error");
    return;
  }
  try {
    if (!raw.startsWith("{") && !raw.startsWith("[")) {
      setImportStatus(
        "This looks like a build code. Use the Build code tab, then resolve it with tli_dump.",
        "error",
      );
      return;
    }
    const value = JSON.parse(raw);
    setImportStatus("Loading the pinned import catalogs…");
    const catalog = await loadImportCatalog();
    activateImported(importBuild(value, catalog, demo.builds, "Pasted JSON"));
  } catch (error) {
    setImportStatus(
      error instanceof Error ? error.message : "The pasted JSON could not be imported.",
      "error",
    );
  }
});

async function initializeWorkspace() {
  try {
    const response = await fetch(demoDataUrl);
    if (!response.ok) {
      throw new Error(`Fixture data could not be loaded (${response.status}).`);
    }
    demo = await response.json() as DemoData;
    builds.push(...structuredClone(demo.builds));
    // Prefer a loadout that can show a full modeled explanation (scaling lesson),
    // then supported catalog builds.
    const modeled = builds.find((build) =>
      build.loadouts.some((loadout) => loadout.model && loadout.snapshot));
    const initial = modeled
      ?? builds.find((build) => build.id === "bing")
      ?? builds.find(isSupportedCatalogBuild);
    if (!initial?.loadouts.length) {
      throw new Error("No supported loadout is available to explain.");
    }
    const defaults = defaultLoadoutPair(initial);
    const preferred = initial.loadouts.find((loadout) => loadout.model && loadout.snapshot)
      ?? initial.loadouts[defaults.afterIndex]
      ?? initial.loadouts.find((loadout) => loadout.isCurrent)
      ?? initial.loadouts[0];
    setSelection({ buildId: initial.id, loadoutId: preferred.id });
    // Defaults, then URL query params win (shareable loadout + tab memory).
    appPage = "leaderboard";
    activeView = "explain";
    suppressUrlWrite = true;
    applyLocationToState();
    suppressUrlWrite = false;
    writeUrl("replace");
    render();
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "The damage workspace could not be loaded.";
    app.innerHTML = `<main class="app-loading app-loading--error">
      <div><strong>Unable to load TLI Lens</strong>
      <small>${esc(message)} Refresh the page to try again.</small></div>
    </main>`;
  }
}

void initializeWorkspace();
