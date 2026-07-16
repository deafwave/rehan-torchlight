/* Planner-JSON -> page data for the talent-tree modal + skill bars.
   Pure re-shaping of the planner export against the tlicompendium bundles —
   no damage math here; every name/position comes from the SS12.5 cache. */
import fs from "node:fs";
import { fromRoot, asciiJson } from "./py.js";
import { _load } from "./buildParser.js";

/* tlibuild.py only mirrors the -en bundles; the master (tree geometry) is a manual fetch */
const MASTER = "SS12.5-talent-tree-master.json";
const loadMaster = (): any => {
  if (!fs.existsSync(fromRoot(".claude/skills/tli-build/cache", MASTER)))
    throw new Error(`pagedata: missing cache/${MASTER} — fetch it with:\n`
      + `  curl -o .claude/skills/tli-build/cache/${MASTER} https://tlicompendium.com/data-bundles/${MASTER}`);
  return _load(MASTER);
};

export const TALENTS_OUT = fromRoot("packages/page/src/data/talents.json");
export const SKILLBARS_OUT = fromRoot("packages/page/src/data/skillbars.json");

export interface TalentNode {
  id: string; type: string; x: number; y: number; max: number; desc: string;
}
export interface TalentNotable { id: string; name: string; desc: string; threshold: number }
export interface TalentTree {
  name: string; maxPoints: number;
  nodes: TalentNode[]; edges: [string, string][]; notables: TalentNotable[];
}
export interface MirroredNode { id: string; from: string; x: number; y: number; points: number }
export interface SlotPrism {
  name: string; node: string; replacesCore: boolean;
  /** Effect that replaces the socketed node's original text (base affix, or core override). */
  effect: string | null;
}
export interface StageSlot {
  tree: string; points: Record<string, number>;
  notable12: string | null; notable24: string | null;
  mirrored: MirroredNode[] | null;
  prism: SlotPrism | null;
}
export interface Stage { loadout: string; slots: StageSlot[] }
export interface TalentData { trees: Record<string, TalentTree>; stages: Stage[] }

const loadouts = (): any[] => {
  const build = JSON.parse(fs.readFileSync(fromRoot("data/Rehan.json"), "utf-8"));
  return [...build.loadouts.loadouts].sort((a, b) => a.order - b.order);
};

const stripHtml = (s: string) => s.replace(/<br\s*\/?>/g, "\n");

export function buildTalents(): TalentData {
  const master = loadMaster();
  const i18n = _load("SS12.5-talent-tree-en.json");
  const trees: Record<string, TalentTree> = {};

  const loadTree = (id: string): TalentTree => {
    const m = master[`talent-tree/${id}/master`]?.tree;
    const en = i18n[`talent-tree/${id}/i18n/en`]?.tree;
    if (!m || !en) throw new Error(`pagedata: no bundle for tree ${id}`);
    const edges = new Set<string>();
    for (const n of m.nodes) {
      if (n.ancestor) edges.add([n.id, n.ancestor].sort().join("|"));
      for (const p of n.predecessors ?? []) edges.add([n.id, p.guid].sort().join("|"));
    }
    return {
      name: en.name,
      maxPoints: m.maxPoints,
      nodes: m.nodes.map((n: any): TalentNode => ({
        id: n.id, type: n.type, x: n.svgPosition.cx, y: n.svgPosition.cy,
        max: n.maxPoints, desc: stripHtml(en.nodes[n.id]?.description ?? ""),
      })),
      edges: [...edges].map(e => e.split("|") as [string, string]),
      notables: m.notables.map((n: any): TalentNotable => ({
        id: n.id, threshold: n.threshold,
        name: en.notables?.[n.id]?.name ?? "",
        desc: stripHtml(en.notables?.[n.id]?.description ?? ""),
      })),
    };
  };

  const prismEn = _load("SS12.5-ethereal-prism-en.json")["ethereal-prism/i18n/en"];
  const prismNames = prismEn.prisms;
  const baseAffixes = prismEn.baseAffixes as Record<string, { description: string }>;
  /* split run-on affix clauses ("…Weapon+12% …") so the talent tip can line-break them */
  const prettyAffix = (s: string) =>
    stripHtml(s).replace(/(?<=[a-z%)])(?=[+-]\d)/gi, "\n");
  const slotPrism = (lo: any, sl: any): SlotPrism | null => {
    const ep = sl.equippedPrism;
    if (!ep?.nodeId) return null;
    const item = lo.etherealPrisms?.inventory?.find((p: any) => p.id === ep.prismId);
    const name = item?.prismType === "inverse" ? "Inverse Image Prism"
      : prismNames[item?.baseId]?.name;
    if (!name) throw new Error(`pagedata: unnamed prism on ${lo.name}/${sl.treeId}`);
    const replacesCore = ep.replacesCoreTalent === true;
    // Haze-style base affixes override the socketed non-core node's original text;
    // core-talent prisms (Valor) show the override description instead.
    let effect: string | null = null;
    if (item?.selectedBaseAffixId) {
      const aff = baseAffixes[item.selectedBaseAffixId];
      if (!aff) throw new Error(
        `pagedata: unknown base affix ${item.selectedBaseAffixId} on ${lo.name}/${sl.treeId}`);
      effect = prettyAffix(aff.description);
    } else if (sl.prismCoreTalentOverride?.description) {
      effect = prettyAffix(sl.prismCoreTalentOverride.description);
    }
    return { name, node: ep.nodeId, replacesCore, effect };
  };

  const stages: Stage[] = loadouts().map(lo => ({
    loadout: lo.name,
    slots: lo.skillTree.slots.map((sl: any): StageSlot => {
      trees[sl.treeId] ??= loadTree(sl.treeId);
      const inv = sl.inverseImageState;
      return {
        tree: sl.treeId,
        points: sl.nodePoints,
        notable12: sl.selectedNotable12 ?? null,
        notable24: sl.selectedNotable24 ?? null,
        mirrored: inv ? inv.mirroredNodes.map((m: any): MirroredNode => ({
          id: m.mirroredNodeId, from: m.originalNodeId,
          x: m.svgPosition.cx, y: m.svgPosition.cy,
          points: inv.mirroredNodePoints?.[m.mirroredNodeId] ?? 0,
        })) : null,
        prism: slotPrism(lo, sl),
      };
    }),
  }));

  return { trees, stages };
}

export interface BarSupport { name: string; type: string }
export interface BarSkill { name: string; supports: BarSupport[] }
export interface SkillBar { loadout: string; active: BarSkill[]; passive: BarSkill[] }

export function buildSkillBars(): SkillBar[] {
  const bundle = _load("SS12.5-skill-en.json");
  const names: Record<string, string> = {};
  for (const cat of Object.values<any>(bundle))
    for (const [guid, s] of Object.entries<any>(cat.skills ?? {}))
      names[guid] = s.name;
  const name = (guid: string): string => {
    if (!names[guid]) throw new Error(`pagedata: unknown skill guid ${guid}`);
    return names[guid];
  };

  const bar = (skills: any[]): BarSkill[] =>
    skills.filter(s => s && s.enabled !== false).map(s => ({
      name: name(s.skillGuid),
      supports: (s.supports ?? []).filter(Boolean).map((x: any): BarSupport => ({
        name: name(x.supportGuid), type: x.type,
      })),
    }));

  return loadouts().map(lo => ({
    loadout: lo.name,
    active: bar(lo.skills.activeSkills),
    passive: bar(lo.skills.passiveSkills),
  }));
}

export function writePagedata(): void {
  fs.writeFileSync(TALENTS_OUT, asciiJson(buildTalents(), 1), "utf-8");
  fs.writeFileSync(SKILLBARS_OUT, asciiJson(buildSkillBars(), 1), "utf-8");
  console.log(`pagedata -> ${TALENTS_OUT}\npagedata -> ${SKILLBARS_OUT}`);
}
