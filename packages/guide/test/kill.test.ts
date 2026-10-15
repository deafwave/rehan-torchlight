import { expect, test } from 'vitest';
import { killSpeed } from '../src/kill';

test('killSpeed with no lock and no cull is the kill average', () => {
  expect(killSpeed(100, 100)).toBe(100);
  expect(killSpeed(200, 100)).toBeCloseTo(100 / Math.log(2), 12);
  expect(killSpeed(0, 100)).toBe(0);
  expect(killSpeed(100, -1)).toBe(0);
});

test('killSpeed under the damage lock: above it the target loses the lock per second', () => {
  expect(killSpeed(300, 200, 150)).toBe(150);
  expect(killSpeed(120, 100, 150)).toBe(killSpeed(120, 100));
  // the line 100 -> 300 meets 150 at l = 0.25: time = ln(150 / 100) / 200 under it, 0.75 / 150 at the lock
  expect(killSpeed(300, 100, 150)).toBeCloseTo(1 / (Math.log(1.5) / 200 + 0.75 / 150), 12);
});

test('killSpeed with a cull: the fight ends at the threshold, so the speed goes past the lock', () => {
  expect(killSpeed(300, 200, 150, 0.2)).toBeCloseTo(150 / 0.8, 12);
  expect(killSpeed(100, 100, Infinity, 0.5)).toBeCloseTo(200, 12);
  // the line 100 -> 300 from l = 0.5: time = ln(300 / 200) / 200
  expect(killSpeed(300, 100, Infinity, 0.5)).toBeCloseTo(200 / Math.log(1.5), 12);
});
