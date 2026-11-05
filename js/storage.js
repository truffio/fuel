// localStorage persistence (spec §8, §10).
// Only raw data is stored; derived metrics are recomputed on display.
// Local data is never silently erased: unreadable data is copied to a backup key
// before anything can overwrite it.

import { METRICS } from './calculations.js';
import { isValidIsoDate } from './validation.js';

export const STORAGE_KEY = 'vehicleFuelTracker.v1';
export const SCHEMA_VERSION = 1;

/**
 * Load outcome.
 * - empty: nothing stored yet (first launch)
 * - ok: data loaded as is
 * - recovered: some entries were unreadable and skipped; the original was backed up
 * - corrupt: stored data could not be read; the original was backed up, defaults are used
 * - unsupported: data from a newer schema version; left untouched, saving is blocked
 * - unavailable: localStorage cannot be used (disabled, private mode, …)
 */
export const LOAD_STATUS = Object.freeze({
  empty: 'empty',
  ok: 'ok',
  recovered: 'recovered',
  corrupt: 'corrupt',
  unsupported: 'unsupported',
  unavailable: 'unavailable',
});

export function createDefaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    vehicle: { id: 'default', name: 'Mon véhicule' },
    fills: [],
    ui: { chartMetric: METRICS.pricePerLiter },
  };
}

/** Stable unique id for a new fill (never an array index). */
export function generateId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2, 10);
  return `fill-${Date.now().toString(36)}-${random}`;
}

/** Returns window.localStorage, or null when access throws (blocked storage). */
function defaultBackend() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Returns a clean raw fill, or null when the entry is unusable. */
function sanitizeFill(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const { id, date, odometerKm, liters, pricePerLiterCad } = entry;

  if (typeof id !== 'string' || id === '') return null;
  if (!isValidIsoDate(date)) return null;
  if (!isFiniteNumber(odometerKm) || odometerKm < 0) return null;
  if (!isFiniteNumber(liters) || liters <= 0) return null;
  if (!isFiniteNumber(pricePerLiterCad) || pricePerLiterCad <= 0) return null;

  const fill = {
    id,
    date,
    odometerKm,
    liters,
    pricePerLiterCad,
    fullTank: entry.fullTank === true,
    createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '',
  };
  if (entry.intervalBroken === true) fill.intervalBroken = true;
  return fill;
}

function sanitizeState(parsed) {
  const state = createDefaultState();
  let dropped = 0;

  if (parsed.vehicle && typeof parsed.vehicle === 'object') {
    if (typeof parsed.vehicle.id === 'string') state.vehicle.id = parsed.vehicle.id;
    if (typeof parsed.vehicle.name === 'string') state.vehicle.name = parsed.vehicle.name;
  }

  const rawFills = Array.isArray(parsed.fills) ? parsed.fills : [];
  if (parsed.fills !== undefined && !Array.isArray(parsed.fills)) dropped += 1;

  const seenIds = new Set();
  for (const entry of rawFills) {
    const fill = sanitizeFill(entry);
    if (!fill || seenIds.has(fill.id)) {
      dropped += 1;
      continue;
    }
    seenIds.add(fill.id);
    state.fills.push(fill);
  }

  const metric = parsed.ui?.chartMetric;
  if (Object.values(METRICS).includes(metric)) state.ui.chartMetric = metric;

  return { state, dropped };
}

/** Copies the raw stored value to a timestamped backup key. Returns the key or null. */
function backupRaw(backend, raw, now) {
  const backupKey = `${STORAGE_KEY}.corrupt-${now.toISOString()}`;
  try {
    backend.setItem(backupKey, raw);
    return backupKey;
  } catch {
    return null;
  }
}

function backupMessage(backupKey) {
  return backupKey
    ? `Une copie des données d’origine a été conservée dans le stockage du navigateur (clé « ${backupKey} »).`
    : 'La copie de sauvegarde des données d’origine a échoué : l’enregistrement est désactivé pour ne pas les écraser.';
}

/**
 * Loads the app state. Never throws.
 *
 * @param options { backend, now } — backend defaults to window.localStorage
 * @returns { state, status, message, backupKey, canSave }
 *   message is a French text to show the user, or null;
 *   canSave is false when saving would overwrite data that could not be backed up.
 */
export function load({ backend = defaultBackend(), now = new Date() } = {}) {
  const result = (status, extra = {}) => ({
    state: createDefaultState(),
    status,
    message: null,
    backupKey: null,
    canSave: true,
    ...extra,
  });

  if (!backend) {
    return result(LOAD_STATUS.unavailable, {
      canSave: false,
      message:
        'Le stockage local du navigateur est indisponible : les pleins saisis ne seront pas conservés après la fermeture de la page.',
    });
  }

  let raw;
  try {
    raw = backend.getItem(STORAGE_KEY);
  } catch {
    return result(LOAD_STATUS.unavailable, {
      canSave: false,
      message: 'Impossible de lire le stockage local du navigateur : les données ne seront pas enregistrées.',
    });
  }

  if (raw === null || raw === undefined) {
    return result(LOAD_STATUS.empty);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const backupKey = backupRaw(backend, raw, now);
    return result(LOAD_STATUS.corrupt, {
      backupKey,
      canSave: backupKey !== null,
      message: `Les données enregistrées sont illisibles et n’ont pas pu être chargées. ${backupMessage(backupKey)}`,
    });
  }

  if (isFiniteNumber(parsed.schemaVersion) && parsed.schemaVersion > SCHEMA_VERSION) {
    return result(LOAD_STATUS.unsupported, {
      canSave: false,
      message:
        'Les données enregistrées proviennent d’une version plus récente de l’application. ' +
        'Elles ont été laissées intactes et l’enregistrement est désactivé.',
    });
  }

  const { state, dropped } = sanitizeState(parsed);
  if (dropped === 0) {
    return { state, status: LOAD_STATUS.ok, message: null, backupKey: null, canSave: true };
  }

  const backupKey = backupRaw(backend, raw, now);
  const entries = dropped === 1 ? '1 entrée illisible a été ignorée' : `${dropped} entrées illisibles ont été ignorées`;
  return {
    state,
    status: LOAD_STATUS.recovered,
    message: `${entries}. ${backupMessage(backupKey)}`,
    backupKey,
    canSave: backupKey !== null,
  };
}

/** Serializes only the raw fields of the state, so derived values never get stored. */
export function serialize(state) {
  return JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    vehicle: { id: state.vehicle.id, name: state.vehicle.name },
    fills: state.fills.map((fill) => {
      const raw = {
        id: fill.id,
        date: fill.date,
        odometerKm: fill.odometerKm,
        liters: fill.liters,
        pricePerLiterCad: fill.pricePerLiterCad,
        fullTank: fill.fullTank === true,
        createdAt: fill.createdAt,
      };
      if (fill.intervalBroken === true) raw.intervalBroken = true;
      return raw;
    }),
    ui: { chartMetric: state.ui.chartMetric },
  });
}

function isQuotaError(error) {
  return (
    error?.name === 'QuotaExceededError' ||
    error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error?.code === 22 ||
    error?.code === 1014
  );
}

/**
 * Saves the state. Never throws.
 * @returns { ok: true } or { ok: false, message } with a French message for the user.
 */
export function save(state, { backend = defaultBackend() } = {}) {
  if (!backend) {
    return { ok: false, message: 'Le stockage local du navigateur est indisponible : la modification n’a pas été enregistrée.' };
  }
  try {
    backend.setItem(STORAGE_KEY, serialize(state));
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: isQuotaError(error)
        ? 'L’espace de stockage du navigateur est plein : la modification n’a pas été enregistrée.'
        : 'Impossible d’enregistrer dans le stockage local du navigateur : la modification n’a pas été enregistrée.',
    };
  }
}
