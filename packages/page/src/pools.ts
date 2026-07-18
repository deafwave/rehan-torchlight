/* The Damage pools tab — every multiplicative "additional damage" pool, named the way the
   GAME names them (`game`), not our internal snapshot buckets (`feeds`, tooltip-only).
   Facts mirror docs/mechanics.md — adding a pool not in there needs its cited row first
   (invariant #1). `use` is the more_1 reference build; the worked example is the live 150b
   snapshot, so the page snapshot's early-game values differ from the final-build claims. */
import { additionalBonusPct, type Snapshot } from "@rehan/dmg/damageModel";
import snapshotData from "./data/snapshot.json";
import { esc } from "./ui";

const SNAP = snapshotData as unknown as Snapshot;

type Use = "used" | "gap" | "na";
interface Pool { game: string; use: Use; note: string; feeds: string }
interface PoolGroup { title: string; blurb: string; pools: Pool[] }

/* Ordered used → gap → na within each group so the "what we run" block reads first. */
const GROUPS: PoolGroup[] = [
  {
    title: "Player — Additional Damage Bonus",
    blurb: "The character-sheet stat. Every line below is its own ×(1+v); the sheet shows ∏(1+aᵢ)−1.",
    pools: [
      { game:"Strength", use:"used", feeds:"additional.strength",
        note:"+0.5% additional damage per point — Spectral Slash is a Strength main-stat skill." },
      { game:"Fervor (per-Rating damage)", use:"used", feeds:"additional.fervor",
        note:"+additional damage for every Fervor Rating, granted by Ghost Slaughter / Dawn Break — the build's biggest single pool." },
      { game:"Precise: Cruelty", use:"used", feeds:"additional.precise_auras",
        note:"+22% additional Attack Damage, doubled at full 40-stack ramp on Elites and bosses." },
      { game:"Precise: Fearless", use:"used", feeds:"additional.precise_auras",
        note:"+30% additional Melee Skill Damage (also +8% melee attack speed)." },
      { game:"Precise: Domain Expansion", use:"used", feeds:"additional.precise_auras",
        note:"+33% additional Area Damage — the finisher clones count as Area." },
      { game:"Frigid Domain", use:"used", feeds:"additional.precise_auras",
        note:"+35% additional Cold Damage (+40% on the Precise version)." },
      { game:"Combo Damage Enhancement", use:"used", feeds:"additional.combo_enhancement",
        note:"Recuperation + Enhancement affixes SUM into one pool on Combo Skill damage (Enhancement is not Amplification)." },
      { game:"Shockwave Warcry", use:"used", feeds:"additional.warcry_buffs",
        note:"additional Combo-Finisher damage per enemy affected, ×8 at the stack cap." },
      { game:"Bull's Rage", use:"used", feeds:"additional.warcry_buffs",
        note:"+27% additional Melee Skill Damage, scaled by empower Effect — the leveling-phase warcry before Shockwave." },
      { game:"Agility Blessing", use:"used", feeds:"additional.blessings",
        note:"+2% additional damage per stack (also +4% attack speed per stack)." },
      { game:"Focus Blessing", use:"used", feeds:"additional.blessings",
        note:"additional damage per stack, gained on Frostbitten hit." },
      { game:"Ice Bond (Euphoria)", use:"used", feeds:"additional.ice_bond",
        note:"+28% additional Cold Damage vs Frostbitten enemies (L20; patch 2026-07 nerf from 33%)." },
      { game:"Steamroll", use:"used", feeds:"additional.steamroll",
        note:"+43% additional Melee Damage at Lv25 — the mainhand tower support." },
      { game:"Willpower", use:"used", feeds:"additional.willpower",
        note:"+6% additional per stack ×6 (multiplies) — granted by the Still Attack activation medium." },
      { game:"Pure Heart", use:"used", feeds:"additional.pure_heart",
        note:"+5% additional Attack Damage per stack, gained on Attack Mobility Skill use." },
      { game:"Spectral Slash: Detonation", use:"used", feeds:"additional.detonation_prism",
        note:"+20% base and a rolled additional-damage line that net together." },
      { game:"Spectral Slash: Legion", use:"used", feeds:"additional.legion_prism",
        note:"+20% base additional damage (the rolled malus can go negative at higher tiers)." },
      { game:"Fury's Onslaught (Rehan trait)", use:"used", feeds:"additional.misc",
        note:"+78% additional damage while Seething Spirit is up (tier 5, tlidb current)." },
      { game:"Rage Infusion (Rehan trait)", use:"used", feeds:"additional.misc",
        note:"+5% additional damage per 25 Rage gained recently, up to +40% at 8 stacks." },
      { game:"Seething Silhouette / Berserk", use:"used", feeds:"additional.misc",
        note:"additional damage from Berserk, with Max-Rage bonuses doubled." },
      { game:"Hidden Mastery (Attack Aggression)", use:"used", feeds:"additional.misc",
        note:"+15% additional Attack Damage while having Attack Aggression (God of Might notable) — full uptime." },
      { game:"Keep It Up", use:"used", feeds:"additional.misc",
        note:"+7% additional damage on Critical Strike (Ranger notable) — carries a −25% crit-rating drawback." },
      { game:"Focused Strike (Vortex Heart)", use:"used", feeds:"additional.misc",
        note:"up to +32% additional Area damage to enemies at the center — full value at melee/clone range." },
      { game:"Skill Levels", use:"used", feeds:"additional.skill_levels",
        note:"each level past 20 is its own ~×1.10 MORE multiplier on the whole skill." },
      { game:"Sealed Mana + Life", use:"gap", feeds:"additional.sealed_life_mana",
        note:"+10% additional damage when having BOTH Sealed Mana and Life. We qualify (Restrain seals mana, Seal Conversion seals life) but the snapshot reads 0 — verify / source it." },
      { game:"Low Life execute", use:"gap", feeds:"additional.low_life_execute",
        note:"+25% additional damage vs Low Life enemies (Warrior slate) → ≈+7.5% DPS-effective over a boss HP bar. Not currently run." },
      { game:"Deterioration Damage", use:"na", feeds:"—",
        note:"+additional Deterioration Damage — Spectral Slash never applies Deterioration, so it can never turn on." },
      { game:"…in Proximity", use:"na", feeds:"—",
        note:"+additional damage to enemies in Proximity — the clones fight at range, the condition never holds." },
    ],
  },
  {
    title: "Enemy — Additional Damage Taken",
    blurb: "The same mechanic on the debuff side: each \"+% additional damage taken\" line is its own multiplier on the enemy.",
    pools: [
      { game:"Frostbite", use:"used", feeds:"enemy_taken.frostbite",
        note:"+1% additional Cold Damage taken per Frostbite Rating — ≈+188% at the built-up cap. The build's biggest debuff pool." },
      { game:"Timid Curse", use:"used", feeds:"enemy_taken.timid_curse",
        note:"+39% additional Hit Damage taken (L20), full uptime from the curse-on-hit ring." },
      { game:"Cold Infiltration", use:"used", feeds:"enemy_taken.cold_infiltration",
        note:"+13% additional Cold Damage taken (and −10% cold resistance)." },
      { game:"Paralysis", use:"used", feeds:"enemy_taken.paralysis",
        note:"+15% additional damage taken, applied by the Frenzy pactspirit line." },
      { game:"Fixate", use:"used", feeds:"enemy_taken.fixate",
        note:"+1.1% additional damage taken (plus its crit-only layer in the next section)." },
      { game:"Mark", use:"used", feeds:"rotation.mark_taken_pct",
        note:"Spectral Slash inherent — the first starter Marks, then every later hit in the cycle deals ≈+36% additional damage taken." },
      { game:"Numb", use:"na", feeds:"—",
        note:"+5% additional Lightning Damage taken per stack — the build is 100% cold, so it does nothing." },
      { game:"Resurrection Warcry", use:"na", feeds:"—",
        note:"REDUCES additional damage taken (−60% self) — a defensive pool, not an offense one." },
    ],
  },
  {
    title: "Crit — Additional Critical Strike Damage",
    blurb: "Crit-only multipliers that scale the crit portion of a hit on top of the 150%-base crit-damage pool.",
    pools: [
      { game:"Critical Strike Damage Increase", use:"used", feeds:"crit.additional_on_crit_pct",
        note:"+26% additional Critical Strike Damage +0.5%/level (L30 support), crit hits only." },
      { game:"Bodhi Girdle", use:"used", feeds:"crit.additional_on_crit_pct",
        note:"+additional damage per Combo Point consumed on Critical Strike — folds into the on-crit layer." },
      { game:"Fixate (crit layer)", use:"used", feeds:"crit.crit_dmg_taken_pct",
        note:"+10% additional Critical Strike Damage taken — multiplies the crit portion only." },
    ],
  },
];

const BADGE: Record<Use, { cls: string; label: string }> = {
  used: { cls:"pool-used", label:"✓ using" },
  gap:  { cls:"pool-gap",  label:"○ source it" },
  na:   { cls:"pool-na",   label:"✕ n/a" },
};

const poolRow = (p: Pool) =>
  `<tr title="${esc(p.feeds)}">`
  + `<td><span class="pool-badge ${BADGE[p.use].cls}">${BADGE[p.use].label}</span></td>`
  + `<td><b>${esc(p.game)}</b></td>`
  + `<td>${esc(p.note)}</td></tr>`;

const groupCard = (g: PoolGroup) => {
  const used = g.pools.filter(p => p.use === "used").length;
  return `<article class="bundle">`
    + `<div class="bundle-head"><h3>${esc(g.title)}</h3>`
    + `<span class="pool-count">${used}/${g.pools.length} used</span></div>`
    + `<p class="pool-blurb">${esc(g.blurb)}</p>`
    + `<table class="ledger-table pool-table">`
    + `<thead><tr><th>status</th><th>pool (the game's name)</th><th>what it is</th></tr></thead>`
    + `<tbody>${g.pools.map(poolRow).join("")}</tbody></table></article>`;
};

export function renderPools(root: HTMLElement): void {
  const live = additionalBonusPct(SNAP);
  root.innerHTML =
    `<article class="bundle pool-explainer">`
    + `<h3>Why unique names win</h3>`
    + `<p>Each uniquely-<b>named</b> additional source is its own ×(1+v) factor, so they compound. `
    + `Three separate <b>+8%</b> pools = 1.08 × 1.08 × 1.08 = <b>+25.97%</b> — more than one <b>+24%</b> line. `
    + `Lines that share a name instead <b>sum</b> into one pool, so a fresh name always beats a bigger copy of one you already run.</p>`
    + `<p class="pool-live">This site's <b>150b</b> setup stacks its player pools to `
    + `<span class="delta-chip d-hot">+${live.toFixed(1)}%</span> Additional Damage Bonus — compare it to your in-game character sheet.</p>`
    + `</article>`
    + GROUPS.map(groupCard).join("");
}
