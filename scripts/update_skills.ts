/* Regenerate packages/page/src/data/<category>.json from tlidb.

   Fetches a skill-category index, filters gems by tag, and parses each gem's
   NEWEST season card (SS13Season today, SS14 automatically after the next wipe)
   into the schema consumed by @rehan/dmg/supports + the calc page's Supports
   panel. mechanics.md#supports-ss13 documents the bucket semantics.

       pnpm skills                       # support category, tags_covered from its json
       pnpm skills active                # any of: support active passive medium
                                         #   magnificent noble module
       pnpm skills --tags Fire Cold      # override tag scope
       pnpm skills --all                 # every gem in the category
       pnpm skills --check               # parse + diff, write nothing

   A category with no existing json defaults to --all.
   After running: pnpm test (supports.test.ts spot-checks the support values). */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ModuleProgram, SupportGem, SupportLine } from "../packages/dmg/src/supports.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "packages", "page", "src", "data");
const CATEGORIES: Record<string, { page: string; file: string }> = {
  support: { page: "Support_Skill", file: "supports.json" },
  active: { page: "Active_Skill", file: "active-skills.json" },
  passive: { page: "Passive_Skill", file: "passive-skills.json" },
  medium: { page: "Activation_Medium_Skill", file: "activation-medium-skills.json" },
  magnificent: { page: "Magnificent_Support_Skill", file: "magnificent-supports.json" },
  noble: { page: "Noble_Support_Skill", file: "noble-supports.json" },
  module: { page: "Modularization_Skill", file: "modularization-skills.json" },
};
const CACHE = join(ROOT, ".claude", "skills", "tlidb-lookup", "cache", "autocomplete_en.json");
// tlidb 403s the default fetch User-Agent
const UA = { "User-Agent": "Mozilla/5.0 (compatible; tli-skill/1.0)" };
const ANCHOR = /\(Lv(\d+):(-?\d+(?:\/\d+)?)\)/g;
const SPAN = /<span class="text-mod">\s*([\s\S]*?)\s*<\/span>/g;

const warnings: string[] = [];
function warn(msg: string): void {
  warnings.push(msg);
  console.error(`  WARN: ${msg}`);
}

// ---------------------------------------------------------------- fetching

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’",
  ldquo: "“", rdquo: "”", hellip: "…",
};
const unescapeHtml = (s: string) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
   .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
   .replace(/&([a-z]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m);

const encodeSlug = (slug: string) =>
  // index slugs arrive pre-encoded ("Precise%3A_Purify"); re-encoding gives 404
  /%[0-9A-Fa-f]{2}/.test(slug) ? slug : encodeURIComponent(slug);

async function pageText(slug: string): Promise<string> {
  const raw = await fetchText("https://tlidb.com/en/" + encodeSlug(slug));
  const body = raw.replace(/<(script|style|nav|footer|head)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const txt = unescapeHtml(body.replace(/<[^>]+>/g, "\n"));
  return txt.split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
}

interface IdxEntry { value: string; desc: string; label: string }
let IDX: IdxEntry[] | null = null;
async function autocompleteIndex(): Promise<IdxEntry[]> {
  if (IDX) return IDX;
  if (!existsSync(CACHE)) {
    mkdirSync(dirname(CACHE), { recursive: true });
    writeFileSync(CACHE, await fetchText("https://tlidb.com/i18n/autocomplete_en.json"));
  }
  return (IDX = JSON.parse(readFileSync(CACHE, "utf8")));
}

async function resolveSlug(name: string): Promise<string> {
  const idx = await autocompleteIndex();
  if (idx.some((e) => e.value === name)) return name;
  const want = name.toLowerCase();
  // only Skill entries count — "Sweep" also exists as a Core Talent Node label.
  // Gems newer than the cached index fall back to the site's slug convention:
  // spaces -> underscores (":" and parens survive encoding)
  return idx.find((e) => e.desc === "Skill"
      && (e.label.toLowerCase() === want || e.value.toLowerCase() === want))?.value
    ?? name.replace(/ /g, "_");
}

async function fetchGemPage(slug: string): Promise<string> {
  try {
    return await fetchText("https://tlidb.com/en/" + encodeSlug(slug));
  } catch (e) {
    // tlidb slugs drop apostrophes (Bull's Rage -> Bulls_Rage) but the
    // autocomplete index still lists Bull%27s_Rage, which 404s
    const stripped = slug.replace(/%27/g, "").replace(/'/g, "");
    if (stripped === slug) throw e;
    return fetchText("https://tlidb.com/en/" + encodeSlug(stripped));
  }
}

// ---------------------------------------------------------------- index

interface IndexEntry { name: string; tags: string[] }

async function parseIndex(page: string): Promise<[Set<string>, IndexEntry[]]> {
  const lines = (await pageText(page)).split("\n");
  // header prefix varies per category ("Support Skill Tag /122", "Exclusive
  // Support Skill Tag /140", bare "Tag /54"); the LAST one precedes the tag zone
  const start = lines.map((l, i) => (/Tag \/\d+$/.test(l) ? i : -1)).filter((i) => i >= 0).pop()!;
  const zone = lines.slice(start + 1);
  const tags = new Set(zone.slice(0, zone.indexOf("Reset")));
  const body = zone.slice(zone.indexOf("Reset") + 1);
  const skills: IndexEntry[] = [];
  let i = 0;
  while (i < body.length) {
    const name = body[i++];
    if (i >= body.length || !tags.has(body[i])) break; // description section reached
    const gtags = [body[i++]];
    while (i + 1 < body.length && body[i] === "," && tags.has(body[i + 1])) {
      gtags.push(body[i + 1]);
      i += 2;
    }
    skills.push({ name, tags: gtags });
  }
  return [tags, skills];
}

// ---------------------------------------------------------------- gem page

const stripTags = (frag: string) =>
  unescapeHtml(frag.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().replace(/\s+([%.,;:)])/g, "$1");

/** small.description runs -> [{level: value}]; a level that does not increase
    starts a new group (min/max tables restart at Lv1). */
function parseAnchorGroups(frag: string): Record<string, number>[] {
  const groups: Record<string, number>[] = [];
  let cur: Record<string, number> = {};
  let prev = -1;
  for (const m of frag.matchAll(ANCHOR)) {
    const lv = Number(m[1]);
    const v = m[2].includes("/") ? Number(m[2].split("/")[0]) / Number(m[2].split("/")[1]) : Number(m[2]);
    if (lv <= prev && Object.keys(cur).length) {
      groups.push(cur);
      cur = {};
    }
    cur[String(lv)] = v;
    prev = lv;
  }
  if (Object.keys(cur).length) groups.push(cur);
  return groups;
}

/** Replicates the hand rules in mechanics.md#supports-ss13: unconditional
    damage/AS/flat lines feed the model, conditional or off-model effects
    (ailment, ignite, per-fervor) stay display-only. */
function classify(text: string): [SupportLine["kind"], boolean | null] {
  const t = text.toLowerCase();
  if (t.includes("for every")) return ["info", null]; // per-unit scaling; a flat toggle would misstate it
  const conditional = /\bwhile this buff\b|^if |\bthe next use\b/.test(t);
  if (/% additional[^,;]*damage/.test(t) && !/ailment|ignite damage|taken/.test(t))
    return ["additional", !conditional];
  if (/% attack (?:and cast )?speed for the supported skill/.test(t) && !conditional)
    return ["attack_speed", true];
  return ["info", null];
}

const lowestLevelValue = (anchors: Record<string, number>) =>
  anchors[String(Math.min(...Object.keys(anchors).map(Number)))];

function buildLine(segment: string): SupportLine | null {
  let groups = parseAnchorGroups(segment);
  let body = segment.replace(/<small class="description">[\s\S]*?<\/small>/g, " ").replace(ANCHOR, "");
  const spans = [...body.matchAll(SPAN)].map((m) => m[1]);
  const asFloat = (s: string): number | null => {
    const v = parseFloat(s.replace(/[+%\s]/g, ""));
    return Number.isNaN(v) ? null : v;
  };

  // map each anchor group to the text-mod span showing its Lv1 value
  const placeholders = new Map<number, string>();
  const used = new Set<number>();
  groups.slice(0, 2).forEach((g, gi) => {
    const lv1 = lowestLevelValue(g);
    let hit = spans.findIndex((sp, si) => !used.has(si) && asFloat(sp) === lv1);
    if (hit < 0) {
      hit = spans.findIndex((_, si) => !used.has(si));
      if (hit >= 0) warn(`anchor Lv1=${lv1} not shown verbatim in: ${stripTags(body).slice(0, 60)}`);
    }
    if (hit < 0) {
      warn(`anchors with no value span in: ${stripTags(body).slice(0, 60)}`);
      return;
    }
    used.add(hit);
    placeholders.set(hit, (spans[hit].startsWith("+") ? "+" : "") + (gi === 0 ? "{v}" : "{v2}"));
  });
  if (groups.length > 2) warn(`more than 2 anchor groups in: ${stripTags(body).slice(0, 60)}`);

  let spanIdx = 0;
  body = body.replace(SPAN, (_, val: string) => placeholders.get(spanIdx++) ?? val);
  let text = stripTags(body).replace(/\.+$/, "").trim();
  if (!text) return null;

  let [kind, on] = classify(text);
  // kinds the model consumes need anchors; a static value line synthesizes one
  if (kind !== "info" && groups.length === 0) {
    const v = spans.length ? asFloat(spans[0]) : null;
    if (v === null) {
      kind = "info";
      on = null;
    } else {
      text = text.replace(spans[0], (text.includes("+") ? "+" : "") + "{v}");
      groups = [{ "1": v }];
    }
  }
  if (kind === "info" && groups.length === 2 && /\badds?\b.*damage/.test(text.toLowerCase())
      && !text.toLowerCase().includes("% of")) {
    kind = "added_flat";
    on = true;
  }
  const line: SupportLine = { text, kind };
  if (on !== null) line.on = on;
  if (groups[0]) line.anchors = groups[0];
  if (groups[1]) line.anchors2 = groups[1];
  return line;
}

/** Some cards render a stat's anchor <small> after the LAST <br/> (Hunting
    Tempo), so the anchors land on the wrong segment. Reattach an anchor group
    whose line shows no {v} to the earlier line displaying its Lv1 value. */
function repairOrphans(lines: SupportLine[]): void {
  for (const orphan of lines) {
    if (!orphan.anchors || orphan.text.includes("{v}") || orphan.anchors2) continue;
    const lv1 = lowestLevelValue(orphan.anchors);
    const shown = String(lv1);
    for (const target of lines) {
      if (target === orphan || target.anchors2) continue;
      const t = target.anchors;
      if (t && Object.keys(t).length === 1 && t["1"] === lv1 && target.text.includes("{v}")) {
        target.anchors = orphan.anchors; // replace the synthesized static
      } else if (!t && target.text.includes(shown)) {
        target.anchors = orphan.anchors;
        target.text = target.text.replace(shown, "{v}");
        const [kind, on] = classify(target.text);
        target.kind = kind;
        if (on !== null) target.on = on;
        else delete target.on;
      } else {
        continue;
      }
      delete orphan.anchors;
      orphan.kind = "info";
      delete orphan.on;
      break;
    }
  }
}

/** Module pages render their program pool several times; only the copy nested
    INSIDE a season-tagged card slice is season-attributed (the header-"Module"
    pools sit in SS12 slices and still list retired SS12 programs like Aura
    Overwrite / Source Code). Collect from slices of the wanted season only. */
function collectPrograms(raw: string, season: string): ModuleProgram[] {
  const vers = [...raw.matchAll(/<div class="item_ver">([^<]+)<\/div>/g)];
  const programs: ModuleProgram[] = [];
  const seen = new Set<string>();
  vers.forEach((v, i) => {
    if (v[1] !== season) return;
    const slice = raw.slice(v.index! + v[0].length, vers[i + 1]?.index ?? raw.length);
    for (const m of slice.matchAll(
        /<span class="tier tier(\d+)"><\/span><e[^>]*data-bs-title="([^"]*)"[^>]*>([^<]+)<\/e>/g)) {
      const name = m[3].trim();
      if (seen.has(name)) continue;
      seen.add(name);
      const text = stripTags(unescapeHtml(m[2])).replace(name, "").trim();
      programs.push({ name, tier: Number(m[1]), text });
    }
  });
  return programs;
}

async function parseGem(entry: IndexEntry): Promise<[string | null, SupportGem | null]> {
  const slug = await resolveSlug(entry.name);
  const raw = await fetchGemPage(slug);
  const ver = raw.match(/<div class="item_ver">(SS\d+Season)<\/div>/);
  if (!ver || ver.index === undefined) {
    warn(`${entry.name}: no season card, skipped`);
    return [null, null];
  }
  const rest = raw.slice(ver.index + ver[0].length);
  const nxt = rest.search(/<div class="item_ver">/);
  const card = nxt >= 0 ? rest.slice(0, nxt) : rest;

  const tags = [...card.matchAll(/<span class="border[^"]*\btag\b[^"]*">([^<]+)<\/span>/g)].map((m) => m[1]);
  const attrs: Record<string, string> = {};
  for (const m of card.matchAll(/<div>([^<]+)<\/div>\s*<div class="ps-2">([^<]+)<\/div>/g))
    attrs[stripTags(m[1]).replace(/:$/, "")] = stripTags(m[2]);
  const level = card.match(/<div class="level">(\d+)<\/div>/);
  const mods = [...card.matchAll(/<div class="explicitMod">([\s\S]*?)<\/div>/g)];
  if (!mods.length) {
    warn(`${entry.name}: no explicitMod block, skipped`);
    return [ver[1], null];
  }

  // support cards repeat the stat block; actives split distinct content across
  // several explicitMod divs — parse all, dedupe identical lines afterwards
  const requires: string[] = [];
  const lines: SupportLine[] = [];
  const seen = new Set<string>();
  mods.forEach((mod, mi) => {
    const block: SupportLine[] = [];
    mod[1].split(/<br\s*\/?>/).forEach((seg, i) => {
      const plain = stripTags(seg.replace(ANCHOR, ""));
      if (mi === 0 && ((i === 0 && /^Supports\b/.test(plain))
          || (requires.length && !block.length && /^(This skill|Cannot support)/.test(plain)))) {
        requires.push(plain);
        return;
      }
      const line = buildLine(seg);
      if (line) block.push(line);
    });
    repairOrphans(block);
    for (const line of block) {
      const key = canonical([line.text, line.anchors ?? null, line.anchors2 ?? null]);
      if (!seen.has(key)) {
        seen.add(key);
        lines.push(line);
      }
    }
  });
  if (!lines.length) warn(`${entry.name}: no stat lines parsed`);
  const gem: SupportGem = {
    name: entry.name,
    tags: tags.length ? tags : entry.tags,
    mana_mult_pct: attrs["Mana Cost Multiplier"] ? parseFloat(attrs["Mana Cost Multiplier"]) : 0,
    requires: requires.join(" "),
    lines,
  };
  if (level) gem.level = Number(level[1]);
  if (Object.keys(attrs).length) gem.attrs = attrs;
  const programs = collectPrograms(raw, ver[1]);
  if (programs.length) gem.programs = programs;
  return [ver[1], gem];
}

// ---------------------------------------------------------------- main

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.entries(v as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, val]) => `${JSON.stringify(k)}:${canonical(val)}`).join(",")}}`;
  return JSON.stringify(v);
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const check = argv.includes("--check");
  const all = argv.includes("--all");
  const ti = argv.indexOf("--tags");
  const tagArgs = ti >= 0 ? argv.slice(ti + 1).filter((a) => !a.startsWith("--")) : null;
  const positional = argv.filter((a, i) => !a.startsWith("--") && (ti < 0 || i <= ti));
  const category = positional[0] ?? "support";
  if (!CATEGORIES[category]) {
    console.error(`unknown category "${category}"; use one of: ${Object.keys(CATEGORIES).join(" ")}`);
    return 1;
  }
  const OUT = join(DATA, CATEGORIES[category].file);

  const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
  const want: Set<string> | null =
    tagArgs ? new Set(tagArgs)
    : all || !existing ? null
    : new Set(existing.tags_covered);
  if (!existing && !all && !tagArgs) console.log(`no ${CATEGORIES[category].file} yet — fetching the whole category`);

  const [allTags, allSkills] = await parseIndex(CATEGORIES[category].page);
  let skills = allSkills;
  const extras: string[] = [];
  if (want) {
    const unknown = [...want].filter((t) => !allTags.has(t));
    if (unknown.length) {
      console.error(`unknown tags: ${unknown}; site has: ${[...allTags].sort()}`);
      return 1;
    }
    const matched = allSkills.filter((s) => s.tags.some((t) => want.has(t)));
    // gems added to the file outside the tag scope survive regeneration
    const keep: string[] = existing?.extra_gems
      ?? (existing?.supports ?? []).map((g: SupportGem) => g.name);
    const matchedNames = new Set(matched.map((s) => s.name));
    extras.push(...new Set(keep.filter((n) => !matchedNames.has(n))).values());
    extras.sort();
    const byName = new Map(allSkills.map((s) => [s.name, s]));
    for (const n of extras) {
      const s = byName.get(n);
      if (s) matched.push(s);
      else warn(`extra gem "${n}" not in the tlidb index, dropped`);
    }
    skills = matched;
  }
  // some indexes render their list multiple times (Modularization: 18 gems x3)
  const seen = new Set<string>();
  skills = skills.filter((s) => !seen.has(s.name) && !!seen.add(s.name));
  console.log(`${skills.length} gems to fetch`);

  const seasons = new Set<string>();
  const gems: SupportGem[] = [];
  for (const entry of skills) {
    try {
      const [season, gem] = await parseGem(entry);
      if (season) seasons.add(season);
      if (gem) {
        gems.push(gem);
        console.log(`  ${gem.name}: ${gem.lines.length} lines`);
      }
    } catch (e) {
      warn(`${entry.name}: ${(e as Error).message}`);
    }
  }
  if (seasons.size > 1) warn(`mixed newest-season cards: ${[...seasons].sort()}`);

  const out = {
    season: seasons.size ? [...seasons].sort().pop()!.replace(/Season$/, "") : "unknown",
    source: `generated by scripts/update_supports.ts from tlidb.com (${new Date().toISOString().slice(0, 10)})`,
    tags_covered: want ? [...want].sort() : [...allTags].sort(),
    extra_gems: extras,
    supports: gems,
  };
  if (check) {
    const drift = canonical(existing?.supports ?? null) !== canonical(gems);
    console.log(`${CATEGORIES[category].file} ${drift ? "DRIFT: differs from tlidb" : "is current"}`);
    return drift ? 1 : 0;
  }
  writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`wrote ${gems.length} gems -> ${OUT}`);
  console.log(warnings.length ? `${warnings.length} warning(s)` : "no warnings");
  return 0;
}

process.exit(await main());
