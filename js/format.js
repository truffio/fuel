// French (Canada) display formatting, no DOM access (spec §2, §10).
// Values are rounded only here; stored and computed values keep full precision.
// Missing or non-computable values are shown as an em dash, never as zero.

export const MISSING = '—';

const LOCALE = 'fr-CA';

const currency = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'CAD' });
const pricePerLiter = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const kilometres = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const litres = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });
const twoDecimals = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const oneDecimal = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const longDate = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDate = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function withUnit(formatter, unit) {
  return (value) => (isNumber(value) ? `${formatter.format(value)} ${unit}` : MISSING);
}

/** 64,00 $ */
export function formatCurrency(value) {
  return isNumber(value) ? currency.format(value) : MISSING;
}

/** 1,65 $/L (up to 3 decimals, as shown at Canadian pumps: 1,659 $/L) */
export const formatPricePerLiter = withUnit(pricePerLiter, '$/L');

/** 10 500 km */
export const formatKm = withUnit(kilometres, 'km');

/** 40 L, 38,25 L */
export const formatLiters = withUnit(litres, 'L');

/** 12,50 km/L */
export const formatKmPerL = withUnit(twoDecimals, 'km/L');

/** 8,0 L/100 km */
export const formatLPer100Km = withUnit(oneDecimal, 'L/100 km');

/** 3 */
export function formatCount(value) {
  return isNumber(value) ? integer.format(value) : MISSING;
}

/** Converts YYYY-MM-DD to a Date at UTC midnight, so formatting never shifts the day. */
function isoToUtcDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** 5 novembre 2026 */
export function formatDate(iso) {
  const date = isoToUtcDate(iso);
  return date ? longDate.format(date) : MISSING;
}

/** 5 nov. 2026 */
export function formatShortDate(iso) {
  const date = isoToUtcDate(iso);
  return date ? shortDate.format(date) : MISSING;
}
