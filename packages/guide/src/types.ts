/** Shared interfaces of the guide. dps-debug types are imported from the pin (tsconfig path `@dps/*` → `<pin>/model/*`). */
import type { Change } from '@dps/src/core/whatif';
import type { LoadoutPatch } from './patches';

export type Skill = 'iceShot' | 'hoa';
/** A dps-debug loadout file (dps-debug model/src/core/loadout.ts `Loadout`), kept opaque here. */
export type Loadout = Record<string, unknown>;
export type { Change };

/** One owned item from a tli-lens export (dps-debug reader/export.py, schema tli-lens-export/1). */
export interface OwnedItem {
  itemId: string; baseId: number; baseName: string | null; level: number;
  where: string; page: number; slot: number; count: number;
  modifiers: Record<string, { id: number; dynArgs: number[] }[]>;
}

/** `target`: the boss Hammer of Ash is priced against in this state (a dps-debug BOSSES key; absent = the evaluator's default) */
export interface State { loadout: Loadout; owned: OwnedItem[]; fe: number; level: number; skill: Skill; target?: string }

/** A dps-debug figure reduced to what the search needs. `partial` = names of dropped pieces / needs; `stop` = the figure did not compute. `kill` = the kill speed
 *  (kill.ts killSpeed) under the model's damage lock `lock` and its cull `cull` (0 when none counts or `cullNote` says why not); `target` = the boss priced against
 *  (dps-debug BOSSES key; absent = the ground's dummy) and its max Life `lifeMax` (time to kill = lifeMax / kill). */
export interface Figure { life100: number; life0: number; kill: number; partial: string[]; stop?: string;
  lock?: number; cull?: number; cullNote?: string; target?: string; lifeMax?: number }

export type MoveKind = 'gear' | 'craft' | 'unique' | 'talent' | 'core' | 'prism' | 'inverse' | 'slate' | 'pact'
  | 'kismet' | 'memory' | 'support' | 'skill' | 'trait' | 'switch';

export interface Move {
  kind: MoveKind;
  /** human text for the guide, e.g. "Craft T1 +% Cold Damage (prefix) on the bow" */
  label: string;
  /** true = costs FE (outer loop); false = reconfiguration (inner loop, churn-gated) */
  acquisition: boolean;
  /** FE cost; null = unpriced (listed, never ranked). Reconfigurations: 0. */
  costFE: number | null;
  /** 'drop' = a white base / normal gem etor does not price (0 FE, ranked); 'not-on-market' = cannot be bought (costFE null, listed under unpriced, never ranked) */
  market?: 'tradeable' | 'drop' | 'not-on-market';
  costNote?: string;
  /** what is bought and how many (cost = qty x its price): a unique or gem x 1, a craft's ember x the expected embers; absent when the cost has several parts */
  buy?: { name: string; qty: number };
  /** a step worse alone that leads somewhere (a rare's bare base): ranked by these changes (the finished item) at this total cost, taken as `changes` */
  then?: { changes: Move['changes']; costFE: number; note: string };
  /** hero level gate */
  minLevel: number;
  /** dps-debug what-if changes applied in order (dps-debug model/src/core/whatif.ts `Change`; a `LoadoutPatch` is applied by applyPatch, runs of Changes by applyChanges) */
  changes: (Change | LoadoutPatch)[];
  /** mode 2: the owned itemId this move uses (cost 0, consumed once) */
  consumes?: string;
  /** set by generators for moves whose value may appear only after a re-solve (reservation efficiency, +support
   *  levels, grants a talent/core, Pedigree slates, tree-granting slates): always re-solved in the outer loop */
  enabler?: boolean;
  /** the skill after the move (only `switch` moves change it) */
  skill?: Skill;
}

/** `target`: the dps-debug BOSSES key Hammer of Ash is priced against for this call (null = the training dummy; absent = the evaluator's) */
export interface EvalCtx { level: number; skill: Skill; target?: string | null }
/** `inputs` = the scenario the figure was priced under (dps-debug GuideFigure.inputs), shown in the guide header */
export interface Evaluated { loadout: Loadout; figure: Figure; dropped: string[]; inputs?: Record<string, unknown> }
export interface Evaluator {
  /** apply `changes` to `loadout` in order (a `LoadoutPatch` through applyPatch, the rest through dps-debug applyGearChange / applyOtherChange) and price the result */
  run(loadout: Loadout, changes: (Change | LoadoutPatch)[], ctx: EvalCtx): Promise<Evaluated>;
  readonly pin: string;
  /** how many run() calls can price at once (the pool's worker count); the search evaluates a round at least this wide */
  readonly parallelism?: number;
  /** ms spent paused (busy file); the wall-clock budget does not count it */
  pausedMs?(): number;
  /** the stated fight inputs every figure is priced under (Carry.fight) */
  readonly fightNote?: string;
  /** dps-debug figure roll budget every figure is priced under */
  readonly rollBudget?: number;
  /** the boss Hammer of Ash figures are priced against (dps-debug BOSSES key); null = the ground's dummy */
  readonly target?: string | null;
  readonly fight?: { bombs?: number; inputs?: Record<string, number> };
  close(): Promise<void>;
}

export interface PriceBook {
  season: string; fetchedAt: string;
  /** FE price of an item by etor id or exact English name at a hero level (ideal: level picks the history window) */
  price(key: number | string, level: number): number | null;
  /** etor category of an item by id or exact name (tells a normal gem from a Noble/Magnificent one) */
  category?(key: number | string): string | null;
}

/** `notSearched`: generators add one line per configuration they skip because its rule is not ported (copied to GuideOut.notSearched) */
export interface GenCtx { prices: PriceBook; level: number; notSearched: Set<string> }
export type Generator = (s: State, ctx: GenCtx) => Move[];

export interface Step {
  level: number; move: Move; triggered: Move[];
  before: Figure; after: Figure; cumFE: number;
  /** plain-language caveats for this step (e.g. assumed talent points) */
  notes?: string[];
}
/** One tab of the guide: a skill against one yardstick (target null = the training dummy), from step `firstStep` on; `end` says why it ended */
export interface Leg { skill: Skill; target: string | null; firstStep: number; end?: string; /** the figure the leg begins with, on its own yardstick */ start: Figure;
  /** false: a boss the plan did not reach, priced with the plan's last build */ reached?: false;
  /** the build at the leg's end (sheet.ts) */ build?: import('./sheet').Sheet[] }
export interface NextBuy { label: string; kind: MoveKind; gain: number; kill: number; costFE: number | null; market?: Move['market']; buy?: Move['buy']; partial?: string[] }
export interface GuideOut {
  mode: 'ideal' | 'advise';
  pin: string;
  etor: { season: string; fetchedAt: string };
  knobs: Record<string, unknown>;
  start: Figure;
  /** stated scenario the figures rest on (figure inputs; Ice Shot: ICE_SHOT_INPUTS, unverified) */
  inputs?: Record<string, unknown>;
  /** how the start state was derived, one entry per named step */
  startNotes?: string[];
  steps: Step[];
  /** advise: the character the advice starts from (the export's hero, FE, owned items and worn gear) */
  character?: { level: number; skill: Skill; fe: number; owned: number; gear: { slot: string; label: string }[] };
  /** advise: every acquisition at the start that raises the kill average, priced or not, with its exact figure (best gain first): the page ranks them by
   *  the player's prices, exact for the next purchase */
  next?: NextBuy[];
  /** the legs in order (Ice Shot on the dummy, then Hammer of Ash boss by boss): each moves on when the boss is lock-bound */
  legs?: Leg[];
  /** advise: the price book's FE for every `next[].buy.name` (null = no price), the page's default */
  prices?: Record<string, number | null>;
  /** configurations not generated because their resolution rule is not ported, by reason */
  notSearched: string[];
  /** acquisitions with no price */
  unpriced: string[];
  /** candidates whose figure stopped or was partial, with the reason */
  notCalculable: string[];
}
