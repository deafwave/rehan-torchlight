import "./style.css";
import demoJson from "./data/demo-builds.json";
import importCatalogJson from "./data/import-catalog.json";
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
import type {
  AnalyzedBuild,
  AnalyzedLoadout,
  DemoData,
  ImportCatalog,
  SkillRow,
} from "./analysis-types";
import { importBuild, importBuildCode } from "./importer";

const demo = demoJson as unknown as DemoData;
const catalog = importCatalogJson as ImportCatalog;
const builds: AnalyzedBuild[] = structuredClone(demo.builds);

type Side = "before" | "after";
type View = "diagnosis" | "changes" | "formula" | "coverage";
type ChangeSection = "gear" | "skills" | "trees" | "memories" | "slates" | "pacts";

interface Selection {
  buildId: string;
  loadoutId: string;
}

const initialBing = builds.find((build) => build.id === "scaling-lesson")!;
let beforeSelection: Selection = {
  buildId: initialBing.id,
  loadoutId: initialBing.loadouts[0].id,
};
let afterSelection: Selection = {
  buildId: initialBing.id,
  loadoutId: initialBing.loadouts[1].id,
};
let activeView: View = "diagnosis";
let changeSection: ChangeSection = "gear";
let formulaSide: Side = "after";
let importTarget: Side = "after";

const app = document.getElementById("app")!;
const importDialog = document.getElementById("import-dialog") as HTMLDialogElement;
const importStatus = document.getElementById("import-status")!;
const fileInput = document.getElementById("build-file") as HTMLInputElement;
const pasteInput = document.getElementById("build-paste") as HTMLTextAreaElement;
const dropZone = document.getElementById("drop-zone")!;

const esc = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");
const escAttr = (value: unknown) => esc(value).replaceAll('"', "&quot;");
const sideLabel = (side: Side) => side === "before" ? "Before" : "After";

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
  if (!loadout.model) return "Structure imported";
  if (loadout.sourceNote?.startsWith("Calibrated teaching")) return "Calibrated formula scenario";
  if (loadout.model.confidence === "experimental") return "Experimental minion coverage";
  return "Directional damage model";
}

function isMinionLoadout(loadout: AnalyzedLoadout) {
  const main = loadout.skills.find((skill) => skill.kind === "active" && skill.enabled)?.name ?? "";
  return /minion|spirit magus|summon|module:/i.test(`${main} ${loadout.sourceNote ?? ""}`);
}

function buildPicker(side: Side, build: AnalyzedBuild, loadout: AnalyzedLoadout) {
  const selection = side === "before" ? beforeSelection : afterSelection;
  const modeled = Boolean(loadout.model);
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
      <span class="model-state ${modeled ? "modeled" : "waiting"}">
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
  const deltaClass = delta == null ? "neutral" : delta < 0 ? "negative" : "positive";
  const headline = delta == null
    ? "Ready to inspect"
    : `${signedPercent(delta)} supported DPS`;
  const note = delta == null
    ? "Calculation is waiting for a compatible model"
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
      ${summaryMetric("EHP", "Not calculated", "Defense model comes next", "disabled")}
      ${summaryMetric(
        "Formula coverage",
        bothModeled ? `${Math.round(lowestCoverage * 100)}%+` : "Pending",
        bothModeled ? "Classified modifier lines" : "Imported structure only",
        lowestCoverage < 0.6 ? "warning" : "",
      )}
    </div>
    <div class="scenario-strip">
      <span class="scenario-label">Shared scenario</span>
      <span>Boss target</span>
      <span>30% elemental / erosion resistance</span>
      <span>Full configured uptime</span>
      <button type="button" class="text-button" data-view="coverage">Review assumptions</button>
    </div>
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
    return `<aside class="next-checks">
      <div class="panel-kicker">Analysis queue</div>
      <h2>What is needed next</h2>
      <div class="check-card warning">
        <span class="check-rank">1</span>
        <div><strong>Connect this build to a season model</strong>
        <p>The full loadout is visible, but the site will not invent a DPS number for unsupported input.</p></div>
      </div>
      <div class="check-card">
        <span class="check-rank">2</span>
        <div><strong>Review imported changes now</strong>
        <p>Gear, skills, trees, memories, slates, and pactspirits can still be compared safely.</p></div>
      </div>
      ${isMinionLoadout(after) ? `<div class="minion-warning"><strong>Minion compiler required</strong>
        Keep player, Spirit Magus, and Synthetic Troop modifiers actor-scoped; the player-hit formula is not a fallback.</div>` : ""}
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

function renderDiagnosis(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  if (!before.snapshot || !after.snapshot || !before.model || !after.model) {
    return `<div class="content-grid">
      <section class="analysis-panel empty-analysis">
        <span class="eyebrow">Diagnosis</span>
        <h2>The builds imported; the formula has not.</h2>
        <p>${esc(after.sourceNote ?? before.sourceNote ?? "This build format is not connected to the damage model yet.")}</p>
        <div class="honesty-grid">
          <div><span>Imported</span><strong>Loadout structure</strong><p>Items, skills, trees, memories, slates, and pacts.</p></div>
          <div><span>Waiting</span><strong>Damage classification</strong><p>Season data and build-specific mechanics must be resolved.</p></div>
          <div><span>Not guessed</span><strong>DPS and EHP</strong><p>Unavailable values stay unavailable instead of becoming false zeroes.</p></div>
        </div>
        <button type="button" class="secondary-button" data-view="changes">Compare imported loadout details</button>
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

function rowChange(before: string, after: string) {
  if (before === after) return `<span class="change-tag same">same</span>`;
  if (!before || before === "Empty") return `<span class="change-tag added">added</span>`;
  if (!after || after === "Empty") return `<span class="change-tag removed">removed</span>`;
  return `<span class="change-tag changed">changed</span>`;
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
      beforeDetail: left.lines.slice(0, 3),
      afterDetail: right.lines.slice(0, 3),
      changed: left.name !== right.name || JSON.stringify(left.lines) !== JSON.stringify(right.lines),
    };
  });
}

function skillName(skill: SkillRow | undefined) {
  return skill ? `${skill.name}${skill.level ? ` · L${skill.level}` : ""}` : "Empty";
}

function skillChangeRows(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const group = (loadout: AnalyzedLoadout, kind: "active" | "passive") =>
    loadout.skills.filter((skill) => skill.kind === kind);
  return (["active", "passive"] as const).flatMap((kind) => {
    const a = group(before, kind);
    const b = group(after, kind);
    return Array.from({ length: Math.max(a.length, b.length) }, (_, index) => {
      const left = a[index];
      const right = b[index];
      return {
        key: `${kind}-${index}`,
        label: `${kind} ${index + 1}`,
        before: skillName(left),
        after: skillName(right),
        beforeDetail: left?.supports.map((support) => support.name) ?? [],
        afterDetail: right?.supports.map((support) => support.name) ?? [],
        changed: JSON.stringify(left) !== JSON.stringify(right),
      };
    });
  });
}

function simpleChangeRows(before: AnalyzedLoadout, after: AnalyzedLoadout, section: ChangeSection) {
  const config = {
    trees: {
      a: before.trees,
      b: after.trees,
      label: (_item: any, index: number) => `tree ${index + 1}`,
      value: (item: any) => item ? `${item.name} · ${item.points} pts${item.hasPrism ? " · prism" : ""}` : "Empty",
    },
    memories: {
      a: before.memories,
      b: after.memories,
      label: (item: any, index: number) => item?.slot ?? `memory ${index + 1}`,
      value: (item: any) => item ? `${item.name} · ${item.affixes} affixes` : "Empty",
    },
    slates: {
      a: before.slates,
      b: after.slates,
      label: (_item: any, index: number) => `slate ${index + 1}`,
      value: (item: any) => item ? `${item.name} · ${item.affixes} affixes` : "Empty",
    },
    pacts: {
      a: before.pactspirits,
      b: after.pactspirits,
      label: (_item: any, index: number) => `pact ${index + 1}`,
      value: (item: any) => item ? `${item.name}${item.level ? ` · L${item.level}` : ""} · ${item.nodes} nodes · ${item.kismets} kismets` : "Empty",
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
      beforeDetail: [] as string[],
      afterDetail: [] as string[],
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

function renderChangeRow(row: ReturnType<typeof gearChangeRows>[number]) {
  return `<article class="diff-row ${row.changed ? "is-changed" : "is-same"}">
    <div class="diff-slot"><span>${esc(row.label)}</span>${rowChange(row.before, row.after)}</div>
    <div class="diff-side before">
      <span class="diff-side-label">Before</span><strong>${esc(row.before)}</strong>
      ${row.beforeDetail.length ? `<ul>${row.beforeDetail.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>` : ""}
    </div>
    <div class="diff-arrow" aria-hidden="true">→</div>
    <div class="diff-side after">
      <span class="diff-side-label">After</span><strong>${esc(row.after)}</strong>
      ${row.afterDetail.length ? `<ul>${row.afterDetail.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>` : ""}
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

function renderFormula(before: AnalyzedLoadout, after: AnalyzedLoadout) {
  const active = formulaSide === "before" ? before : after;
  if (!active.snapshot || !active.model) {
    return `<section class="single-panel empty-analysis">
      <span class="eyebrow">Exact formula</span>
      <h2>Not calculated for this import</h2>
      <p>${esc(active.sourceNote ?? "This build is not connected to a compatible damage model.")}</p>
    </section>`;
  }
  const result = cycleDps(active.snapshot);
  return `<section class="formula-panel">
    <div class="analysis-heading">
      <div><span class="eyebrow">Exact arithmetic</span><h2>${esc(active.name)}</h2></div>
      <div class="segmented">
        <button type="button" class="${formulaSide === "before" ? "active" : ""}" data-formula-side="before">Before</button>
        <button type="button" class="${formulaSide === "after" ? "active" : ""}" data-formula-side="after">After</button>
      </div>
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

function coverageCard(label: string, loadout: AnalyzedLoadout) {
  if (!loadout.model && !loadout.coverage) {
    return `<article class="coverage-card">
      <div class="coverage-title"><span>${esc(label)}</span><strong>Pending</strong></div>
      <div class="coverage-meter"><span style="width:0%"></span></div>
      <p>Loadout structure imported; modifier classification and formula coverage have not run.</p>
      <div class="coverage-stats"><span><b>${loadout.gear.length}</b> gear rows</span><span><b>${loadout.skills.length}</b> skills</span></div>
    </article>`;
  }
  if (!loadout.model && loadout.coverage) {
    return `<article class="coverage-card">
      <div class="coverage-title"><span>${esc(label)} · classification</span><strong>${Math.round(loadout.coverage.classificationRate * 100)}%</strong></div>
      <div class="coverage-meter"><span style="width:${Math.round(loadout.coverage.classificationRate * 100)}%"></span></div>
      <p>Modifier text was classified by the current parser, but no guarded hero/skill compiler has produced DPS.</p>
      <div class="coverage-stats">
        <span><b>${loadout.coverage.classified}</b> classified</span>
        <span><b>${loadout.coverage.unsupported}</b> unsupported</span>
        <span><b>${loadout.coverage.ignored}</b> irrelevant</span>
      </div>
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
  return `<section class="coverage-panel">
    <div class="analysis-heading">
      <div><span class="eyebrow">Trust the boundaries</span><h2>Coverage & assumptions</h2></div>
      <span class="exact-badge">${minion ? "Experimental build type" : "Partial model"}</span>
    </div>
    <p class="section-intro">A calculated number is only useful when you can see what was imported, classified, assumed, and left unsupported.</p>
    <div class="coverage-grid">
      ${coverageCard("Before", before)}
      ${coverageCard("After", after)}
    </div>
    ${minion ? `<div class="model-boundary">
      <div class="boundary-icon">!</div>
      <div><strong>Minion DPS is not settled by the player-hit formula.</strong>
      <p>Base minion actions, quantity, AI/uptime, trait mechanics, and minion-only scaling are incomplete. Imported minion stats stay visible, while the output remains directional.</p></div>
    </div>` : ""}
    <div class="assumption-grid">
      <div><span>Target</span><strong>Boss, 30% elemental and erosion resistance</strong></div>
      <div><span>Uptime</span><strong>Configured buffs and debuffs at full modeled uptime</strong></div>
      <div><span>Defense</span><strong>Not calculated yet; unavailable is not zero</strong></div>
      <div><span>Attribution</span><strong>Fixed replay order with overlapping isolated checks</strong></div>
    </div>
    <div class="unsupported-grid">
      ${unsupportedList("Before · unsupported", before)}
      ${unsupportedList("After · unsupported", after)}
    </div>
  </section>`;
}

function navigation() {
  const items: { id: View; label: string; count?: string }[] = [
    { id: "diagnosis", label: "Diagnosis" },
    { id: "changes", label: "Build changes" },
    { id: "formula", label: "Damage formula" },
    { id: "coverage", label: "Coverage" },
  ];
  return `<nav class="view-tabs" aria-label="Analysis views">
    ${items.map((item) => `<button type="button" data-view="${item.id}" class="${activeView === item.id ? "active" : ""}">
      ${esc(item.label)}${item.count ? `<span>${esc(item.count)}</span>` : ""}
    </button>`).join("")}
    <button type="button" class="disabled-tab" disabled title="EHP model is not implemented yet">Survival <span>soon</span></button>
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

function setImportStatus(message: string, type: "success" | "error" | "info" = "info") {
  importStatus.className = `import-status ${type}`;
  importStatus.textContent = message;
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
  }, 450);
}

async function readFile(file: File) {
  try {
    setImportStatus(`Reading ${file.name}…`);
    const value = JSON.parse(await file.text());
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
  if (target.dataset.selection === "before") beforeSelection = selection;
  else afterSelection = selection;
  render();
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
    document.querySelector(".view-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const side = target.dataset.import as Side | undefined;
  if (side) {
    importTarget = side;
    setImportStatus(`Importing into ${sideLabel(side)}.`);
    importDialog.showModal();
    return;
  }
  if (target.hasAttribute("data-swap")) {
    [beforeSelection, afterSelection] = [afterSelection, beforeSelection];
    render();
    return;
  }
  const section = target.dataset.changeSection as ChangeSection | undefined;
  if (section) {
    changeSection = section;
    render();
    return;
  }
  const requestedFormulaSide = target.dataset.formulaSide as Side | undefined;
  if (requestedFormulaSide) {
    formulaSide = requestedFormulaSide;
    render();
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
  } else if (preset === "bing") {
    const build = builds.find((item) => item.id === "bing")!;
    beforeSelection = { buildId: build.id, loadoutId: build.loadouts[2].id };
    afterSelection = { buildId: build.id, loadoutId: build.loadouts[3].id };
    activeView = "changes";
    render();
  } else if (preset === "wuxia") {
    const build = builds.find((item) => item.id === "wuxia")!;
    beforeSelection = { buildId: build.id, loadoutId: build.loadouts[5].id };
    afterSelection = { buildId: build.id, loadoutId: build.loadouts[8].id };
    activeView = "coverage";
    render();
  }
});

document.querySelectorAll<HTMLButtonElement>("[data-import-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.dataset.importTab;
    document.querySelectorAll<HTMLElement>("[data-import-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.importPanel !== tab;
    });
    document.querySelectorAll<HTMLButtonElement>("[data-import-tab]").forEach((candidate) => {
      const active = candidate === button;
      candidate.classList.toggle("active", active);
      candidate.setAttribute("aria-selected", String(active));
    });
    setImportStatus("");
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

document.getElementById("analyze-paste")!.addEventListener("click", () => {
  const raw = pasteInput.value.trim();
  if (!raw) {
    setImportStatus("Paste a build code, share URL, or JSON first.", "error");
    return;
  }
  try {
    if (raw.startsWith("{")) {
      activateImported(importBuild(JSON.parse(raw), catalog, demo.builds, "Pasted JSON"));
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

render();
