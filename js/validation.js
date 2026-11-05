// Input parsing and validation, no DOM access (spec §4, §7).

import { sortFills } from './calculations.js';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DECIMAL_PATTERN = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;
// Regular, no-break and narrow no-break spaces, used as thousands separators in French.
const SPACES = /[\s  ]/g;

const NEW_FILL_ID = '__new__';

/**
 * Parses a user-typed number. Accepts `,` or `.` as the decimal separator and spaces as
 * thousands separators ("10 500", "1,65", "40.5"). Returns NaN for anything else,
 * including strings that use both `,` and `.`.
 */
export function parseDecimal(raw) {
  if (typeof raw === 'number') return raw;
  if (typeof raw !== 'string') return NaN;

  const compact = raw.replace(SPACES, '');
  if (compact.includes(',') && compact.includes('.')) return NaN;

  const normalized = compact.replace(',', '.');
  if (!DECIMAL_PATTERN.test(normalized)) return NaN;
  return Number(normalized);
}

/** True for a real calendar date in YYYY-MM-DD form. */
export function isValidIsoDate(value) {
  if (typeof value !== 'string') return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;

  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Today's date in the user's local time zone, as YYYY-MM-DD. */
export function todayLocalIso(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function isBlank(raw) {
  return raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
}

function formatKm(km) {
  return `${km.toLocaleString('fr-CA')} km`;
}

function validateDate(raw, today) {
  if (isBlank(raw)) return { error: 'Indiquez la date du plein.' };
  const value = String(raw).trim();
  if (!isValidIsoDate(value)) return { error: 'Date invalide. Utilisez le format AAAA-MM-JJ.' };
  if (value > today) return { error: 'La date du plein ne peut pas être dans le futur.' };
  return { value };
}

function validateNumber(raw, { label, example, min, strict }) {
  if (isBlank(raw)) return { error: `Indiquez ${label}.` };
  const value = parseDecimal(raw);
  if (!Number.isFinite(value)) return { error: `Entrez un nombre valide (ex. ${example}).` };
  if (strict ? value <= min : value < min) {
    return { error: strict ? 'La valeur doit être supérieure à 0.' : 'La valeur doit être positive ou nulle.' };
  }
  return { value };
}

/**
 * Checks that the odometer increases strictly in chronological order once the
 * candidate is inserted (or replaces the fill being edited). Returns an error message
 * naming the conflicting neighbour, or null.
 */
export function checkOdometerConsistency(candidate, existingFills, editingId = null) {
  const others = existingFills.filter((fill) => fill.id !== editingId);
  const edited = editingId ? existingFills.find((fill) => fill.id === editingId) : null;
  const probe = {
    ...candidate,
    id: editingId ?? NEW_FILL_ID,
    // A new fill is the most recent entry, so it sorts last among same-date, same-km fills.
    createdAt: edited?.createdAt ?? '￿',
  };

  const sorted = sortFills([...others, probe]);
  const position = sorted.findIndex((fill) => fill.id === probe.id);
  const previous = sorted[position - 1];
  const next = sorted[position + 1];

  if (previous && previous.odometerKm >= probe.odometerKm) {
    return (
      `L’odomètre doit être supérieur à celui du plein précédent ` +
      `(${formatKm(previous.odometerKm)} le ${previous.date}).`
    );
  }
  if (next && next.odometerKm <= probe.odometerKm) {
    return (
      `L’odomètre doit être inférieur à celui du plein suivant ` +
      `(${formatKm(next.odometerKm)} le ${next.date}). Vérifiez la date et le kilométrage.`
    );
  }
  return null;
}

/**
 * Validates form input against the field rules (spec §4) and the existing history (§7).
 *
 * @param input raw values: { date, odometerKm, liters, pricePerLiterCad, fullTank }
 * @param existingFills current raw fills
 * @param options { editingId, today } — editingId excludes that fill from the
 *   consistency check; today (YYYY-MM-DD) defaults to the local date
 * @returns { ok, value, errors } — value holds parsed numbers when ok, otherwise null;
 *   errors maps field names to French messages
 */
export function validateFill(input, existingFills = [], options = {}) {
  const { editingId = null, today = todayLocalIso() } = options;
  const errors = {};

  const date = validateDate(input.date, today);
  const odometer = validateNumber(input.odometerKm, {
    label: 'le kilométrage de l’odomètre',
    example: '10 500',
    min: 0,
    strict: false,
  });
  const liters = validateNumber(input.liters, {
    label: 'le volume d’essence ajouté',
    example: '40,5',
    min: 0,
    strict: true,
  });
  const price = validateNumber(input.pricePerLiterCad, {
    label: 'le prix du litre',
    example: '1,65',
    min: 0,
    strict: true,
  });

  if (date.error) errors.date = date.error;
  if (odometer.error) errors.odometerKm = odometer.error;
  if (liters.error) errors.liters = liters.error;
  if (price.error) errors.pricePerLiterCad = price.error;

  if (input.fullTank !== true) {
    errors.fullTank =
      'Confirmez que le réservoir a été rempli complètement. ' +
      'Ce prototype calcule la consommation uniquement à partir de pleins complets.';
  }

  if (!date.error && !odometer.error) {
    const conflict = checkOdometerConsistency(
      { date: date.value, odometerKm: odometer.value },
      existingFills,
      editingId,
    );
    if (conflict) errors.odometerKm = conflict;
  }

  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    value: ok
      ? {
          date: date.value,
          odometerKm: odometer.value,
          liters: liters.value,
          pricePerLiterCad: price.value,
          fullTank: true,
        }
      : null,
    errors,
  };
}
