// Pure calculation logic, no DOM access (spec §5, §6.1, §7).
// Every function takes raw fills and returns new values; inputs are never mutated.
// Values keep full precision; rounding is done only for display.

/** Metrics available on the chart (spec §6.3). */
export const METRICS = Object.freeze({
  pricePerLiter: 'pricePerLiter',
  kmPerL: 'kmPerL',
  cumulativeCost: 'cumulativeCost',
});

/**
 * Status of the interval ending at a fill.
 * - reference: first fill, odometer baseline, no distance or efficiency
 * - valid: both fills are full and distance > 0, efficiency is computed
 * - notFull: one of the two fills is not a full tank, no efficiency
 * - broken: an intermediate fill was deleted, litres no longer cover the interval
 * - invalidDistance: distance <= 0 (should be prevented by validation)
 */
export const INTERVAL_STATUS = Object.freeze({
  reference: 'reference',
  valid: 'valid',
  notFull: 'notFull',
  broken: 'broken',
  invalidDistance: 'invalidDistance',
});

function compareStrings(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Chronological order: date, then odometer, then creation time, then id (stable). */
export function compareFills(a, b) {
  return (
    compareStrings(a.date, b.date) ||
    a.odometerKm - b.odometerKm ||
    compareStrings(a.createdAt ?? '', b.createdAt ?? '') ||
    compareStrings(a.id ?? '', b.id ?? '')
  );
}

/** Returns a new array of fills in chronological order. */
export function sortFills(fills) {
  return [...fills].sort(compareFills);
}

/**
 * Enriches fills with derived values, in chronological order.
 * Each returned record is a copy of the raw fill plus:
 * index, cost, cumulativeCost, distanceKm, kmPerL, lPer100Km, intervalStatus.
 */
export function enrichFills(fills) {
  const sorted = sortFills(fills);
  let cumulativeCost = 0;

  return sorted.map((fill, index) => {
    const cost = fill.liters * fill.pricePerLiterCad;
    cumulativeCost += cost;

    let distanceKm = null;
    let kmPerL = null;
    let lPer100Km = null;
    let intervalStatus = INTERVAL_STATUS.reference;

    if (index > 0) {
      const previous = sorted[index - 1];
      distanceKm = fill.odometerKm - previous.odometerKm;

      if (fill.intervalBroken) {
        intervalStatus = INTERVAL_STATUS.broken;
      } else if (!fill.fullTank || !previous.fullTank) {
        intervalStatus = INTERVAL_STATUS.notFull;
      } else if (!(distanceKm > 0)) {
        intervalStatus = INTERVAL_STATUS.invalidDistance;
      } else {
        intervalStatus = INTERVAL_STATUS.valid;
        kmPerL = distanceKm / fill.liters;
        lPer100Km = (fill.liters / distanceKm) * 100;
      }
    }

    return {
      ...fill,
      index,
      cost,
      cumulativeCost,
      distanceKm,
      kmPerL,
      lPer100Km,
      intervalStatus,
    };
  });
}

/**
 * Dashboard aggregates (spec §6.1).
 * Overall efficiency is weighted by volume over valid intervals only:
 * sum(distances) / sum(litres), never the mean of individual values.
 */
export function computeSummary(enriched) {
  const fillCount = enriched.length;
  const first = enriched[0];
  const last = enriched[fillCount - 1];

  let validDistanceKm = 0;
  let validLiters = 0;
  let validIntervalCount = 0;
  for (const record of enriched) {
    if (record.intervalStatus === INTERVAL_STATUS.valid) {
      validDistanceKm += record.distanceKm;
      validLiters += record.liters;
      validIntervalCount += 1;
    }
  }

  return {
    fillCount,
    totalCost: fillCount > 0 ? last.cumulativeCost : 0,
    totalDistanceKm: fillCount >= 2 ? last.odometerKm - first.odometerKm : null,
    validIntervalCount,
    overallKmPerL: validLiters > 0 ? validDistanceKm / validLiters : null,
    overallLPer100Km: validDistanceKm > 0 ? (validLiters / validDistanceKm) * 100 : null,
  };
}

/**
 * Points for the chart (spec §6.3), one per eligible fill, in chronological order.
 * `index` is the fill's position in the full history, so fills sharing a date stay distinct.
 */
export function chartSeries(enriched, metric) {
  const valueOf = {
    [METRICS.pricePerLiter]: (record) => record.pricePerLiterCad,
    [METRICS.kmPerL]: (record) => record.kmPerL,
    [METRICS.cumulativeCost]: (record) => record.cumulativeCost,
  }[metric];

  if (!valueOf) {
    throw new Error(`Unknown metric: ${metric}`);
  }

  return enriched
    .map((record) => ({
      id: record.id,
      index: record.index,
      date: record.date,
      odometerKm: record.odometerKm,
      value: valueOf(record),
    }))
    .filter((point) => point.value !== null && Number.isFinite(point.value));
}

/**
 * Removes a fill and returns the new raw list (spec §7).
 * When the removed fill is intermediate (neither first nor last), the following fill
 * is flagged `intervalBroken`: its litres no longer represent all the fuel used over
 * the merged interval, so its efficiency must not be shown.
 * Returns `{ fills, brokenFillId }`; brokenFillId is null when nothing was flagged.
 */
export function removeFill(fills, id) {
  const sorted = sortFills(fills);
  const position = sorted.findIndex((fill) => fill.id === id);
  if (position === -1) {
    return { fills: [...fills], brokenFillId: null };
  }

  const isIntermediate = position > 0 && position < sorted.length - 1;
  const brokenFillId = isIntermediate ? sorted[position + 1].id : null;

  const remaining = fills
    .filter((fill) => fill.id !== id)
    .map((fill) => (fill.id === brokenFillId ? { ...fill, intervalBroken: true } : fill));

  return { fills: remaining, brokenFillId };
}

/** True when removing this fill would make the following interval non-computable. */
export function isIntermediateFill(fills, id) {
  const sorted = sortFills(fills);
  const position = sorted.findIndex((fill) => fill.id === id);
  return position > 0 && position < sorted.length - 1;
}

/**
 * Adds a new fill or replaces an existing one (same id) and returns the new raw list.
 * When a new fill is inserted right before a fill flagged `intervalBroken`, that flag is
 * cleared: the interval again runs between two recorded fills, so its litres are
 * consistent with its distance (spec §7, “jusqu’à rétablissement de données cohérentes”).
 * Edits never clear the flag.
 */
export function upsertFill(fills, fill) {
  const exists = fills.some((existing) => existing.id === fill.id);
  if (exists) {
    return fills.map((existing) => (existing.id === fill.id ? fill : existing));
  }

  const next = [...fills, fill];
  const sorted = sortFills(next);
  const following = sorted[sorted.findIndex((existing) => existing.id === fill.id) + 1];
  if (!following?.intervalBroken) return next;

  return next.map((existing) => {
    if (existing.id !== following.id) return existing;
    const { intervalBroken, ...rest } = existing;
    return rest;
  });
}
