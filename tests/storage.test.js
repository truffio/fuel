// Run from the project root with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LOAD_STATUS,
  STORAGE_KEY,
  createDefaultState,
  generateId,
  load,
  save,
  serialize,
} from '../js/storage.js';

const NOW = new Date('2026-11-05T18:00:00.000Z');
const BACKUP_KEY = `${STORAGE_KEY}.corrupt-2026-11-05T18:00:00.000Z`;

/** In-memory stand-in for localStorage. */
class MemoryStorage {
  constructor(initial = {}, { failWrites = null, failReads = false } = {}) {
    this.items = new Map(Object.entries(initial));
    this.failWrites = failWrites;
    this.failReads = failReads;
  }
  getItem(key) {
    if (this.failReads) throw new Error('SecurityError');
    return this.items.has(key) ? this.items.get(key) : null;
  }
  setItem(key, value) {
    if (this.failWrites) throw this.failWrites;
    this.items.set(key, String(value));
  }
  removeItem(key) {
    this.items.delete(key);
  }
}

const validFill = (overrides = {}) => ({
  id: 'a',
  date: '2026-10-01',
  odometerKm: 10000,
  liters: 40,
  pricePerLiterCad: 1.6,
  fullTank: true,
  createdAt: '2026-10-01T12:00:00.000Z',
  ...overrides,
});

const storedState = (fills, extra = {}) =>
  JSON.stringify({
    schemaVersion: 1,
    vehicle: { id: 'default', name: 'Mon véhicule' },
    fills,
    ui: { chartMetric: 'kmPerL' },
    ...extra,
  });

test('missing key: empty status with default state', () => {
  const result = load({ backend: new MemoryStorage(), now: NOW });
  assert.equal(result.status, LOAD_STATUS.empty);
  assert.deepEqual(result.state, createDefaultState());
  assert.equal(result.canSave, true);
  assert.equal(result.message, null);
});

test('save then load round-trips raw data (criterion 10)', () => {
  const backend = new MemoryStorage();
  const state = createDefaultState();
  state.fills.push(validFill(), validFill({ id: 'b', date: '2026-10-15', odometerKm: 10500, intervalBroken: true }));
  state.ui.chartMetric = 'cumulativeCost';

  assert.deepEqual(save(state, { backend }), { ok: true });
  const result = load({ backend, now: NOW });
  assert.equal(result.status, LOAD_STATUS.ok);
  assert.deepEqual(result.state, state);
});

test('numbers are stored as numbers and derived fields are not persisted', () => {
  const state = createDefaultState();
  state.fills.push({ ...validFill(), cost: 64, cumulativeCost: 64, kmPerL: null, index: 0 });
  const stored = JSON.parse(serialize(state));
  assert.equal(typeof stored.fills[0].odometerKm, 'number');
  assert.equal(typeof stored.fills[0].pricePerLiterCad, 'number');
  assert.deepEqual(Object.keys(stored.fills[0]).sort(), [
    'createdAt',
    'date',
    'fullTank',
    'id',
    'liters',
    'odometerKm',
    'pricePerLiterCad',
  ]);
});

test('corrupt JSON is backed up, never overwritten, and reported', () => {
  const backend = new MemoryStorage({ [STORAGE_KEY]: '{not json' });
  const result = load({ backend, now: NOW });

  assert.equal(result.status, LOAD_STATUS.corrupt);
  assert.deepEqual(result.state, createDefaultState());
  assert.equal(result.backupKey, BACKUP_KEY);
  assert.equal(backend.items.get(BACKUP_KEY), '{not json');
  assert.equal(backend.items.get(STORAGE_KEY), '{not json', 'original left in place by load');
  assert.equal(result.canSave, true);
  assert.match(result.message, /illisibles/);
  assert.match(result.message, new RegExp(BACKUP_KEY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('non-object JSON (array, string, null) is treated as corrupt', () => {
  for (const raw of ['[]', '"hello"', 'null', '42']) {
    const result = load({ backend: new MemoryStorage({ [STORAGE_KEY]: raw }), now: NOW });
    assert.equal(result.status, LOAD_STATUS.corrupt, raw);
  }
});

test('corrupt data with a failed backup blocks saving', () => {
  const backend = new MemoryStorage({ [STORAGE_KEY]: '{oops' }, { failWrites: new Error('nope') });
  const result = load({ backend, now: NOW });
  assert.equal(result.status, LOAD_STATUS.corrupt);
  assert.equal(result.backupKey, null);
  assert.equal(result.canSave, false);
  assert.match(result.message, /désactivé/);
});

test('invalid entries are skipped, counted and the original is backed up', () => {
  const raw = storedState([
    validFill(),
    validFill({ id: 'b', odometerKm: 'oops' }),
    validFill({ id: 'c', liters: 0 }),
    validFill({ id: 'd', date: '2026-02-30' }),
    validFill({ id: 'a', date: '2026-10-20', odometerKm: 10400 }), // duplicate id
    null,
    validFill({ id: 'e', date: '2026-10-15', odometerKm: 10500, fullTank: 'yes', createdAt: 5 }),
  ]);
  const backend = new MemoryStorage({ [STORAGE_KEY]: raw });
  const result = load({ backend, now: NOW });

  assert.equal(result.status, LOAD_STATUS.recovered);
  assert.deepEqual(result.state.fills.map((f) => f.id), ['a', 'e']);
  assert.equal(result.state.fills[1].fullTank, false, 'non-boolean fullTank is not trusted');
  assert.equal(result.state.fills[1].createdAt, '');
  assert.match(result.message, /^5 entrées illisibles ont été ignorées/);
  assert.equal(backend.items.get(BACKUP_KEY), raw);
  assert.equal(result.canSave, true);
});

test('unknown chart metric and missing sections fall back to defaults', () => {
  const backend = new MemoryStorage({
    [STORAGE_KEY]: JSON.stringify({ schemaVersion: 1, fills: [validFill()], ui: { chartMetric: 'bogus' } }),
  });
  const result = load({ backend, now: NOW });
  assert.equal(result.status, LOAD_STATUS.ok);
  assert.equal(result.state.ui.chartMetric, 'pricePerLiter');
  assert.deepEqual(result.state.vehicle, { id: 'default', name: 'Mon véhicule' });
});

test('newer schema version is left untouched and saving is blocked', () => {
  const raw = storedState([validFill()], { schemaVersion: 2 });
  const backend = new MemoryStorage({ [STORAGE_KEY]: raw });
  const result = load({ backend, now: NOW });
  assert.equal(result.status, LOAD_STATUS.unsupported);
  assert.equal(result.canSave, false);
  assert.equal(backend.items.get(STORAGE_KEY), raw);
  assert.equal(backend.items.size, 1, 'no backup needed, nothing written');
});

test('unavailable storage: no backend or reads that throw', () => {
  const none = load({ backend: null, now: NOW });
  assert.equal(none.status, LOAD_STATUS.unavailable);
  assert.equal(none.canSave, false);
  assert.match(none.message, /indisponible/);

  const blocked = load({ backend: new MemoryStorage({}, { failReads: true }), now: NOW });
  assert.equal(blocked.status, LOAD_STATUS.unavailable);
  assert.equal(blocked.canSave, false);

  assert.equal(save(createDefaultState(), { backend: null }).ok, false);
});

test('save reports quota and generic failures without throwing', () => {
  const quota = new Error('full');
  quota.name = 'QuotaExceededError';
  const full = save(createDefaultState(), { backend: new MemoryStorage({}, { failWrites: quota }) });
  assert.equal(full.ok, false);
  assert.match(full.message, /plein/);

  const other = save(createDefaultState(), { backend: new MemoryStorage({}, { failWrites: new Error('x') }) });
  assert.equal(other.ok, false);
  assert.match(other.message, /Impossible d’enregistrer/);
});

test('generateId returns distinct non-empty strings', () => {
  const ids = new Set(Array.from({ length: 100 }, generateId));
  assert.equal(ids.size, 100);
  for (const id of ids) assert.ok(typeof id === 'string' && id.length > 0);
});
