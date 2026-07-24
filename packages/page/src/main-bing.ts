import "./guide-style.css";
import { renderCalc } from "./calc";
import type { Snapshot } from "@rehan/dmg/damageModel";
import type { SupportGem } from "@rehan/dmg/supports";
import bingSnapshot from "./data/bing-snapshot.json";
import supportsData from "./data/supports.json";

// Only the DPS Calc — no HoA build data exists yet to generate the other tabs from.
// HoA is fire; the model's cold_res/cold-pen slots are its elemental res/pen here.
renderCalc(document.getElementById("calc")!, bingSnapshot as unknown as Snapshot, {
  cold_res_pct: "fire res pct",
  cold_pct: "fire pen pct",
  flat_added_erosion_min: "added erosion min",
  flat_added_erosion_max: "added erosion max",
  erosion_res_pct: "erosion res pct",
  erosion_pct: "erosion pen pct",
}, supportsData.supports as SupportGem[]);
