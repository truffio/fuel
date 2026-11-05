// Run from the project root with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MISSING,
  formatCount,
  formatCurrency,
  formatDate,
  formatKm,
  formatKmPerL,
  formatLPer100Km,
  formatLiters,
  formatPricePerLiter,
  formatShortDate,
} from '../js/format.js';

// Intl uses no-break (U+00A0) and narrow no-break (U+202F) spaces; compare with plain spaces.
const plain = (text) => text.replace(/[  ]/g, ' ');

test('currency in CAD with French formatting', () => {
  assert.equal(plain(formatCurrency(64)), '64,00 $');
  assert.equal(plain(formatCurrency(57.75)), '57,75 $');
  assert.equal(plain(formatCurrency(1234.5)), '1 234,50 $');
  assert.equal(plain(formatCurrency(68.00000000000001)), '68,00 $');
});

test('price per litre keeps 2 to 3 decimals', () => {
  assert.equal(plain(formatPricePerLiter(1.65)), '1,65 $/L');
  assert.equal(plain(formatPricePerLiter(1.6)), '1,60 $/L');
  assert.equal(plain(formatPricePerLiter(1.659)), '1,659 $/L');
});

test('distances, volumes and efficiency', () => {
  assert.equal(plain(formatKm(10500)), '10 500 km');
  assert.equal(plain(formatKm(420)), '420 km');
  assert.equal(plain(formatKm(10500.25)), '10 500,3 km');
  assert.equal(plain(formatLiters(40)), '40 L');
  assert.equal(plain(formatLiters(38.256)), '38,26 L');
  assert.equal(plain(formatKmPerL(12.5)), '12,50 km/L');
  assert.equal(plain(formatKmPerL(920 / 75)), '12,27 km/L');
  assert.equal(plain(formatLPer100Km(8)), '8,0 L/100 km');
  assert.equal(formatCount(3), '3');
});

test('missing values show an em dash, never zero', () => {
  for (const format of [
    formatCurrency,
    formatPricePerLiter,
    formatKm,
    formatLiters,
    formatKmPerL,
    formatLPer100Km,
    formatCount,
  ]) {
    assert.equal(format(null), MISSING);
    assert.equal(format(undefined), MISSING);
    assert.equal(format(NaN), MISSING);
  }
  assert.equal(MISSING, '—');
});

test('dates are formatted without time-zone shift', () => {
  assert.equal(formatDate('2026-11-05'), '5 novembre 2026');
  assert.equal(formatDate('2026-01-01'), '1 janvier 2026');
  assert.equal(plain(formatShortDate('2026-11-05')), '5 nov. 2026');
  assert.equal(formatDate('not a date'), MISSING);
  assert.equal(formatDate(undefined), MISSING);
});
