// Run from the project root with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkOdometerConsistency,
  isValidIsoDate,
  parseDecimal,
  todayLocalIso,
  validateFill,
} from '../js/validation.js';

const TODAY = '2026-11-05';

const existing = [
  { id: 'a', date: '2026-10-01', odometerKm: 10000, liters: 40, pricePerLiterCad: 1.6, fullTank: true, createdAt: '2026-10-01T12:00:00.000Z' },
  { id: 'b', date: '2026-10-15', odometerKm: 10500, liters: 40, pricePerLiterCad: 1.7, fullTank: true, createdAt: '2026-10-15T12:00:00.000Z' },
  { id: 'c', date: '2026-11-01', odometerKm: 10920, liters: 35, pricePerLiterCad: 1.65, fullTank: true, createdAt: '2026-11-01T12:00:00.000Z' },
];

const validInput = (overrides = {}) => ({
  date: '2026-11-04',
  odometerKm: '11 300',
  liters: '38,2',
  pricePerLiterCad: '1,59',
  fullTank: true,
  ...overrides,
});

test('parseDecimal accepts comma, dot and space separators', () => {
  assert.equal(parseDecimal('1,65'), 1.65);
  assert.equal(parseDecimal('1.65'), 1.65);
  assert.equal(parseDecimal(' 40 '), 40);
  assert.equal(parseDecimal('10 500'), 10500);
  assert.equal(parseDecimal('10 500,5'), 10500.5);
  assert.equal(parseDecimal('10 500'), 10500);
  assert.equal(parseDecimal(',5'), 0.5);
  assert.equal(parseDecimal(42), 42);
});

test('parseDecimal rejects garbage', () => {
  for (const raw of ['', 'abc', '1,2,3', '1.234,5', '1e3', '12km', '--1', '.', 'Infinity', null, undefined]) {
    assert.ok(Number.isNaN(parseDecimal(raw)), `expected NaN for ${JSON.stringify(raw)}`);
  }
});

test('isValidIsoDate checks real calendar dates', () => {
  assert.equal(isValidIsoDate('2026-11-05'), true);
  assert.equal(isValidIsoDate('2024-02-29'), true);
  assert.equal(isValidIsoDate('2026-02-29'), false);
  assert.equal(isValidIsoDate('2026-13-01'), false);
  assert.equal(isValidIsoDate('2026-11-5'), false);
  assert.equal(isValidIsoDate('05/11/2026'), false);
  assert.equal(isValidIsoDate(''), false);
});

test('todayLocalIso uses local date parts', () => {
  assert.equal(todayLocalIso(new Date(2026, 0, 9, 23, 59)), '2026-01-09');
});

test('valid input returns parsed numbers', () => {
  const result = validateFill(validInput(), existing, { today: TODAY });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, {});
  assert.deepEqual(result.value, {
    date: '2026-11-04',
    odometerKm: 11300,
    liters: 38.2,
    pricePerLiterCad: 1.59,
    fullTank: true,
  });
});

test('first fill on an empty history is accepted, including odometer 0', () => {
  const result = validateFill(validInput({ odometerKm: '0' }), [], { today: TODAY });
  assert.equal(result.ok, true);
  assert.equal(result.value.odometerKm, 0);
});

test('missing fields are reported per field', () => {
  const result = validateFill(
    { date: '', odometerKm: '', liters: ' ', pricePerLiterCad: undefined, fullTank: false },
    existing,
    { today: TODAY },
  );
  assert.equal(result.ok, false);
  assert.equal(result.value, null);
  assert.deepEqual(Object.keys(result.errors).sort(), [
    'date',
    'fullTank',
    'liters',
    'odometerKm',
    'pricePerLiterCad',
  ]);
  assert.match(result.errors.date, /Indiquez la date/);
  assert.match(result.errors.liters, /Indiquez le volume/);
});

test('bounds: odometer >= 0, litres and price > 0, finite numbers only', () => {
  const check = (overrides) => validateFill(validInput(overrides), [], { today: TODAY }).errors;

  assert.match(check({ odometerKm: '-1' }).odometerKm, /positive ou nulle/);
  assert.match(check({ liters: '0' }).liters, /supérieure à 0/);
  assert.match(check({ liters: '-3' }).liters, /supérieure à 0/);
  assert.match(check({ pricePerLiterCad: '0,00' }).pricePerLiterCad, /supérieure à 0/);
  assert.match(check({ pricePerLiterCad: 'abc' }).pricePerLiterCad, /nombre valide/);
  assert.match(check({ liters: Infinity }).liters, /nombre valide/);
  assert.match(check({ odometerKm: NaN }).odometerKm, /nombre valide/);
});

test('date must be valid and not in the future', () => {
  const check = (date) => validateFill(validInput({ date }), [], { today: TODAY }).errors.date;
  assert.match(check('2026-02-30'), /Date invalide/);
  assert.match(check('2026-11-06'), /futur/);
  assert.equal(check(TODAY), undefined);
});

test('full tank must be confirmed', () => {
  const { ok, errors } = validateFill(validInput({ fullTank: false }), existing, { today: TODAY });
  assert.equal(ok, false);
  assert.match(errors.fullTank, /rempli complètement/);
});

test('odometer must be above the previous fill', () => {
  const { errors } = validateFill(validInput({ odometerKm: '10920' }), existing, { today: TODAY });
  assert.match(errors.odometerKm, /supérieur à celui du plein précédent/);
  assert.match(errors.odometerKm, /2026-11-01/);
});

test('back-dated insertion is allowed when odometers stay consistent', () => {
  const ok = validateFill(validInput({ date: '2026-10-20', odometerKm: '10700' }), existing, { today: TODAY });
  assert.equal(ok.ok, true);

  const tooHigh = validateFill(validInput({ date: '2026-10-20', odometerKm: '11000' }), existing, { today: TODAY });
  assert.match(tooHigh.errors.odometerKm, /inférieur à celui du plein suivant/);
  assert.match(tooHigh.errors.odometerKm, /2026-11-01/);

  const tooLow = validateFill(validInput({ date: '2026-10-20', odometerKm: '10400' }), existing, { today: TODAY });
  assert.match(tooLow.errors.odometerKm, /supérieur à celui du plein précédent/);
});

test('same-date fills are allowed with distinct increasing odometers', () => {
  const result = validateFill(validInput({ date: '2026-11-01', odometerKm: '11000' }), existing, { today: TODAY });
  assert.equal(result.ok, true);

  const equal = validateFill(validInput({ date: '2026-11-01', odometerKm: '10920' }), existing, { today: TODAY });
  assert.equal(equal.ok, false);
});

test('editing excludes the edited fill from the consistency check', () => {
  const edit = (overrides) =>
    validateFill(
      validInput({ date: '2026-10-15', odometerKm: '10500', liters: '41', ...overrides }),
      existing,
      { editingId: 'b', today: TODAY },
    );

  assert.equal(edit({}).ok, true, 'unchanged odometer must not conflict with itself');
  assert.equal(edit({ odometerKm: '10600' }).ok, true);
  assert.match(edit({ odometerKm: '10950' }).errors.odometerKm, /plein suivant/);
  assert.match(edit({ odometerKm: '9999' }).errors.odometerKm, /plein précédent/);
});

test('checkOdometerConsistency returns null when consistent', () => {
  assert.equal(checkOdometerConsistency({ date: '2026-11-04', odometerKm: 11000 }, existing), null);
  assert.equal(checkOdometerConsistency({ date: '2026-09-01', odometerKm: 9000 }, existing), null);
  assert.notEqual(checkOdometerConsistency({ date: '2026-09-01', odometerKm: 10000 }, existing), null);
});
