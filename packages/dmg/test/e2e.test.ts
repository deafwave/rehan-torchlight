import fs from "node:fs";
import { expect, test } from "vitest";
import { parseBuild, OVERRIDES_PATH } from "../src/buildParser.js";
import { cycleDps } from "../src/damageModel.js";
import { fromRoot } from "../src/py.js";

test("real build end to end", () => {
  const [snap, report] = parseBuild(fromRoot("data/Rehan.json"));
  const handled = report.matched.length + report.ignored.length;
  const total = handled + report.unmatched.length;
  expect(handled / total, JSON.stringify(report.unmatched.map(l => l.text)))
    .toBeGreaterThanOrEqual(0.90);
  expect(snap._extras ?? {}).toEqual({});
  const r = cycleDps(snap);
  expect(r.dps).toBeGreaterThan(0);
  expect(r.cycle_time).toBeGreaterThan(0);
});

test("manual overrides are loaded and cited", () => {
  const overrides = JSON.parse(fs.readFileSync(OVERRIDES_PATH, "utf-8"));
  expect("_sources" in overrides).toBe(true);
  expect(Object.keys(overrides._sources).length).toBeGreaterThan(0);
});
