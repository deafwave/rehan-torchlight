import { deepCopy } from "../src/py.js";
import { DEFAULT_SNAPSHOT, type Snapshot } from "../src/damageModel.js";

export function snap(over: Record<string, number> = {}): Snapshot {
  const s = deepCopy(DEFAULT_SNAPSHOT);
  for (const [path, v] of Object.entries(over)) {
    const keys = path.split(".");
    let d: any = s;
    for (const k of keys.slice(0, -1)) d = d[k];
    d[keys[keys.length - 1]] = v;
  }
  return s;
}

/* zero out everything except a 100-100 weapon, 100% skill pct */
export function baseOnly(): Snapshot {
  const s = snap();
  Object.assign(s.base, { weapon_phys_min: 100, weapon_phys_max: 100,
                          weapon_flat_cold_min: 0, weapon_flat_cold_max: 0,
                          gear_phys_pct: 0, skill_weapon_pct: 100,
                          flat_added_min: 0, flat_added_max: 0 });
  for (const bucket of ["increased", "additional", "enemy_taken"] as const) {
    for (const k of Object.keys(s[bucket])) s[bucket][k] = 0;
  }
  s.enemy = { cold_res_pct: 0, armor_reduction_pct: 0 };
  return s;
}
