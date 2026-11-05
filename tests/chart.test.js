// Run from the project root with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { METRIC_INFO, niceScale, splitSegments } from '../js/chart.js';
import { METRICS } from '../js/calculations.js';

test('niceScale covers the data with round ticks', () => {
  const scale = niceScale(1.6, 1.7);
  assert.ok(scale.min <= 1.6 && scale.max >= 1.7, `${scale.min}..${scale.max}`);
  assert.ok(scale.ticks.length >= 3 && scale.ticks.length <= 8);
  assert.deepEqual(scale.ticks, [1.6, 1.62, 1.64, 1.66, 1.68, 1.7]);
  assert.equal(scale.decimals, 2);
});

test('niceScale includes zero for cumulative spending', () => {
  const scale = niceScale(64, 189.75, { includeZero: true });
  assert.equal(scale.min, 0);
  assert.ok(scale.max >= 189.75);
  assert.equal(scale.decimals, 0);
  assert.ok(scale.ticks.every((tick) => Number.isInteger(tick)));
});

test('niceScale handles a single value', () => {
  const price = niceScale(1.65, 1.65);
  assert.ok(price.min < 1.65 && price.max > 1.65);

  const cost = niceScale(64, 64, { includeZero: true });
  assert.equal(cost.min, 0);
  assert.ok(cost.max >= 64);
});

test('niceScale ticks are evenly spaced and increasing', () => {
  for (const [min, max] of [[12, 12.5], [0.5, 37], [1000, 98765], [11.2, 15.9]]) {
    const { ticks, step } = niceScale(min, max);
    for (let i = 1; i < ticks.length; i += 1) {
      assert.ok(Math.abs(ticks[i] - ticks[i - 1] - step) < step * 1e-9, `${min}..${max}: ${ticks}`);
    }
    assert.ok(ticks[0] <= min && ticks[ticks.length - 1] >= max);
  }
});

test('splitSegments breaks the line where fills are missing', () => {
  const p = (index) => ({ id: String(index), index, value: 1 });
  assert.deepEqual(splitSegments([]), []);
  assert.deepEqual(splitSegments([p(1), p(2), p(3)]).map((s) => s.map((x) => x.index)), [[1, 2, 3]]);
  assert.deepEqual(splitSegments([p(1), p(2), p(4), p(5), p(7)]).map((s) => s.map((x) => x.index)), [[1, 2], [4, 5], [7]]);
});

test('every metric has display settings', () => {
  for (const metric of Object.values(METRICS)) {
    const info = METRIC_INFO[metric];
    assert.ok(info.title && info.unit && typeof info.format === 'function' && info.emptyDetail);
  }
  assert.equal(METRIC_INFO.cumulativeCost.includeZero, true);
});
