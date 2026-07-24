/**
 * Gear icon URLs + paper-doll layout for the loadout equipped panel.
 *
 * Build exports carry planner-relative paths like
 * `/images/legendaries/boots/int_boots/Icon_Equip_Shoes_Epic_407_128.webp`.
 * TLIDB hosts the same asset basenames on its CDN (UIV2 NoAtlas_112_160 as
 * `_112.webp`). Compendium keeps the original relative path as a fallback.
 */

import type { GearRow } from "./analysis-types";

export const TLIDB_ICON_BASE =
  "https://cdn.tlidb.com/UIV2/Common/Icon/UI/Textures/EquipCommon/NoAtlas_112_160";

export const COMPENDIUM_ORIGIN = "https://tlicompendium.com";

/** Standard body slots in paper-doll order (left → right, top → bottom). */
export const GEAR_BOARD_SLOTS = [
  "mainHand",
  "helmet",
  "necklace",
  "offHand",
  "chest",
  "ring1",
  "gloves",
  "belt",
  "ring2",
  "boots",
] as const;

export type GearBoardSlot = (typeof GEAR_BOARD_SLOTS)[number];

const BOARD_SLOT_SET = new Set<string>(GEAR_BOARD_SLOTS);

/** Extract the icon filename from a planner path or absolute URL. */
export function iconBasename(iconPath: string | null | undefined): string | null {
  if (!iconPath) return null;
  const trimmed = iconPath.trim();
  if (!trimmed) return null;
  const withoutQuery = trimmed.split(/[?#]/)[0] ?? trimmed;
  const file = withoutQuery.split("/").pop() ?? "";
  return file || null;
}

/**
 * Map a planner icon path to the TLIDB CDN equip-icon URL.
 * Planner assets are usually `_128.webp`; TLIDB's UIV2 pack uses `_112.webp`.
 */
export function tlidbIconUrl(iconPath: string | null | undefined): string | null {
  if (!iconPath) return null;
  const trimmed = iconPath.trim();
  if (!trimmed) return null;
  if (/^https?:\/\/cdn\.tlidb\.com\//i.test(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    // Absolute non-tlidb URL: still try basename remap when it looks like equip art.
    const base = iconBasename(trimmed);
    if (!base || !/^Icon_/i.test(base)) return trimmed;
    const file112 = base.replace(/_128(\.[A-Za-z0-9]+)$/i, "_112$1");
    return `${TLIDB_ICON_BASE}/${file112}`;
  }
  const base = iconBasename(trimmed);
  if (!base) return null;
  const file112 = base.replace(/_128(\.[A-Za-z0-9]+)$/i, "_112$1");
  return `${TLIDB_ICON_BASE}/${file112}`;
}

/** Absolute tlicompendium.com URL for the planner-relative icon path. */
export function compendiumIconUrl(iconPath: string | null | undefined): string | null {
  if (!iconPath) return null;
  const trimmed = iconPath.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${COMPENDIUM_ORIGIN}${path}`;
}

export type GearRarityTone =
  | "empty"
  | "normal"
  | "magic"
  | "rare"
  | "legendary"
  | "unique"
  | "set"
  | "unknown";

export function gearRarityTone(rarity: string | null | undefined): GearRarityTone {
  if (!rarity) return "empty";
  const key = rarity.trim().toLowerCase();
  if (!key || key === "empty") return "empty";
  if (key.includes("legend")) return "legendary";
  if (key.includes("unique")) return "unique";
  if (key.includes("set")) return "set";
  if (key.includes("rare")) return "rare";
  if (key.includes("magic") || key.includes("enchant")) return "magic";
  if (key.includes("normal") || key.includes("common") || key.includes("white")) {
    return "normal";
  }
  return "unknown";
}

export function slotLabel(slot: string): string {
  return slot
    .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
    .replace(/(\d+)/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

export function isEmptyGear(row: Pick<GearRow, "name"> | null | undefined): boolean {
  if (!row) return true;
  const name = row.name?.trim() ?? "";
  return !name || name === "Empty";
}

export interface GearBoardCell {
  slot: string;
  label: string;
  row: GearRow | null;
  empty: boolean;
  onBoard: boolean;
}

/** Paper-doll cells + any extra/unmapped slots not in the fixed layout. */
export function gearBoardCells(gear: GearRow[]): {
  board: GearBoardCell[];
  overflow: GearBoardCell[];
} {
  const bySlot = new Map(gear.map((row) => [row.slot, row]));
  const board = GEAR_BOARD_SLOTS.map((slot) => {
    const row = bySlot.get(slot) ?? null;
    return {
      slot,
      label: slotLabel(slot),
      row,
      empty: isEmptyGear(row),
      onBoard: true,
    } satisfies GearBoardCell;
  });
  const overflow = gear
    .filter((row) => !BOARD_SLOT_SET.has(row.slot) && !isEmptyGear(row))
    .map((row) => ({
      slot: row.slot,
      label: slotLabel(row.slot),
      row,
      empty: false,
      onBoard: false,
    }));
  return { board, overflow };
}
