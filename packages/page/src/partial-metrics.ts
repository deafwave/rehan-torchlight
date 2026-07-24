import { compileBingWeaponFoundation } from "@rehan/dmg/guardedCompiler";
import type { PartialMetric } from "./analysis-types";

function decimal(value: number, maximumFractionDigits = 2) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  });
}

/**
 * Converts guarded compiler output into a generic UI metric. The discriminator
 * remains `isDps: false` so this value cannot silently occupy a DPS field.
 */
export function partialMetricsForCompendium(
  build: unknown,
  loadoutIndex: number,
): PartialMetric[] {
  const foundation = compileBingWeaponFoundation(build, loadoutIndex);
  if (foundation.status !== "calculated-partial") return [];
  return [{
    id: "bing-weapon-hit-foundation",
    label: `Raw weapon-hit foundation · ${foundation.weaponName}`,
    value: foundation.rawWeaponSourcedHit.average,
    display: decimal(foundation.rawWeaponSourcedHit.average),
    unit: "raw pre-envelope hit",
    isDps: false,
    confidence: foundation.confidence,
    scope: foundation.scope,
    inputs: [
      {
        label: "Average equipped-weapon damage",
        value: foundation.weaponTotal.average,
        display: decimal(foundation.weaponTotal.average),
      },
      {
        label: "Hammer of Ash weapon coefficient",
        value: foundation.skillWeaponAttackDamagePct,
        display: `${decimal(foundation.skillWeaponAttackDamagePct)}%`,
      },
    ],
    provenance: foundation.provenance,
    excluded: foundation.excludedFromMetric,
  }];
}
