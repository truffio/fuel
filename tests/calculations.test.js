// Run from the project root with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  INTERVAL_STATUS,
  METRICS,
  chartSeries,
  computeSummary,
  enrichFills,
  isIntermediateFill,
  removeFill,
  sortFills,
} from '../js/calculations.js';

const EPSILON = 1e-9;

function assertClose(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < EPSILON,
    `${message ?? 'value'}: expected ${expected}, got ${actual}`,
  );
}

function fill(id, date, odometerKm, liters, pricePerLiterCad, extra = {}) {
  return {
    id,
    date,
    odometerKm,
    liters,
    pricePerLiterCad,
    fullTank: true,
    createdAt: `${date}T12:00:00.000Z`,
    ...extra,
  };
}

// Reference example, spec §5.
const referenceFills = () => [
  fill('a', '2026-10-01', 10000, 40, 1.6),
  fill('b', '2026-10-15', 10500, 40, 1.7),
  fill('c', '2026-11-01', 10920, 35, 1.65),
];

test('first fill: cost and cumulative, no distance or efficiency', () => {
  const [first] = enrichFills([fill('a', '2026-10-01', 10000, 40, 1.6)]);
  assertClose(first.cost, 64, 'cost');
  assertClose(first.cumulativeCost, 64, 'cumulative');
  assert.equal(first.distanceKm, null);
  assert.equal(first.kmPerL, null);
  assert.equal(first.lPer100Km, null);
  assert.equal(first.intervalStatus, INTERVAL_STATUS.reference);
});

test('reference example rows 2 and 3 (acceptance criteria 3 and 4)', () => {
  const [, second, third] = enrichFills(referenceFills());

  assert.equal(second.distanceKm, 500);
  assertClose(second.kmPerL, 12.5, 'row 2 km/L');
  assertClose(second.cost, 68, 'row 2 cost');
  assertClose(second.cumulativeCost, 132, 'row 2 cumulative');
  assertClose(second.lPer100Km, 8, 'row 2 L/100 km');

  assert.equal(third.distanceKm, 420);
  assertClose(third.kmPerL, 12, 'row 3 km/L');
  assertClose(third.cost, 57.75, 'row 3 cost');
  assertClose(third.cumulativeCost, 189.75, 'row 3 cumulative');
});

test('summary uses volume-weighted efficiency', () => {
  const summary = computeSummary(enrichFills(referenceFills()));
  assert.equal(summary.fillCount, 3);
  assertClose(summary.totalCost, 189.75, 'total cost');
  assert.equal(summary.totalDistanceKm, 920);
  assert.equal(summary.validIntervalCount, 2);
  assertClose(summary.overallKmPerL, 920 / 75, 'overall km/L');
  assert.notEqual(summary.overallKmPerL, (12.5 + 12) / 2);
});

test('summary with no fills and with a single fill', () => {
  const empty = computeSummary(enrichFills([]));
  assert.deepEqual(empty, {
    fillCount: 0,
    totalCost: 0,
    totalDistanceKm: null,
    validIntervalCount: 0,
    overallKmPerL: null,
    overallLPer100Km: null,
  });

  const single = computeSummary(enrichFills([fill('a', '2026-10-01', 10000, 40, 1.6)]));
  assert.equal(single.fillCount, 1);
  assertClose(single.totalCost, 64);
  assert.equal(single.totalDistanceKm, null);
  assert.equal(single.overallKmPerL, null);
});

test('fills are sorted by date then odometer regardless of input order', () => {
  const shuffled = [
    fill('c', '2026-11-01', 10920, 35, 1.65),
    fill('b2', '2026-10-15', 10600, 5, 1.7),
    fill('a', '2026-10-01', 10000, 40, 1.6),
    fill('b1', '2026-10-15', 10500, 40, 1.7),
  ];
  assert.deepEqual(
    sortFills(shuffled).map((f) => f.id),
    ['a', 'b1', 'b2', 'c'],
  );
});

test('inputs are not mutated', () => {
  const fills = referenceFills();
  const snapshot = structuredClone(fills);
  const enriched = enrichFills(fills);
  computeSummary(enriched);
  chartSeries(enriched, METRICS.kmPerL);
  removeFill(fills, 'b');
  assert.deepEqual(fills, snapshot);
});

test('interval with a non-full tank has no efficiency', () => {
  const fills = referenceFills();
  fills[1].fullTank = false;
  const [, second, third] = enrichFills(fills);
  assert.equal(second.intervalStatus, INTERVAL_STATUS.notFull);
  assert.equal(second.kmPerL, null);
  assert.equal(second.distanceKm, 500);
  // Previous fill is not full either: the next interval is not computable.
  assert.equal(third.intervalStatus, INTERVAL_STATUS.notFull);
  assert.equal(third.kmPerL, null);
});

test('chart series: efficiency excludes the first fill, other metrics include it (criterion 6)', () => {
  const enriched = enrichFills(referenceFills());

  const price = chartSeries(enriched, METRICS.pricePerLiter);
  assert.deepEqual(price.map((p) => p.value), [1.6, 1.7, 1.65]);

  const cumulative = chartSeries(enriched, METRICS.cumulativeCost);
  assert.equal(cumulative.length, 3);
  assertClose(cumulative[2].value, 189.75);

  const efficiency = chartSeries(enriched, METRICS.kmPerL);
  assert.deepEqual(efficiency.map((p) => p.id), ['b', 'c']);
  assert.deepEqual(efficiency.map((p) => p.index), [1, 2]);
  assert.deepEqual(efficiency[0], {
    id: 'b',
    index: 1,
    date: '2026-10-15',
    odometerKm: 10500,
    value: 12.5,
  });

  assert.throws(() => chartSeries(enriched, 'nope'));
});

test('editing a fill propagates to following rows (criterion 8)', () => {
  const fills = referenceFills();
  fills[1] = { ...fills[1], odometerKm: 10400, liters: 32 };
  const [, second, third] = enrichFills(fills);
  assert.equal(second.distanceKm, 400);
  assertClose(second.kmPerL, 12.5);
  assertClose(second.cumulativeCost, 64 + 32 * 1.7);
  assert.equal(third.distanceKm, 520);
  assertClose(third.cumulativeCost, 64 + 32 * 1.7 + 57.75);
});

test('deleting the first fill makes the next one the reference', () => {
  const { fills, brokenFillId } = removeFill(referenceFills(), 'a');
  assert.equal(brokenFillId, null);
  const [first, second] = enrichFills(fills);
  assert.equal(first.id, 'b');
  assert.equal(first.intervalStatus, INTERVAL_STATUS.reference);
  assert.equal(first.kmPerL, null);
  assertClose(first.cumulativeCost, 68);
  assertClose(second.kmPerL, 12);
});

test('deleting an intermediate fill hides the merged interval efficiency (criterion 9)', () => {
  assert.equal(isIntermediateFill(referenceFills(), 'b'), true);

  const { fills, brokenFillId } = removeFill(referenceFills(), 'b');
  assert.equal(brokenFillId, 'c');
  const enriched = enrichFills(fills);
  const merged = enriched[1];
  assert.equal(merged.id, 'c');
  assert.equal(merged.distanceKm, 920);
  assert.equal(merged.kmPerL, null);
  assert.equal(merged.intervalStatus, INTERVAL_STATUS.broken);

  const summary = computeSummary(enriched);
  assert.equal(summary.overallKmPerL, null);
  assert.equal(summary.totalDistanceKm, 920);
  assert.equal(chartSeries(enriched, METRICS.kmPerL).length, 0);
});

test('deleting the last fill flags nothing', () => {
  assert.equal(isIntermediateFill(referenceFills(), 'c'), false);
  const { fills, brokenFillId } = removeFill(referenceFills(), 'c');
  assert.equal(brokenFillId, null);
  assert.equal(fills.length, 2);
  assert.ok(fills.every((f) => !f.intervalBroken));
});

test('removing an unknown id leaves the list unchanged', () => {
  const { fills, brokenFillId } = removeFill(referenceFills(), 'zzz');
  assert.equal(fills.length, 3);
  assert.equal(brokenFillId, null);
});
