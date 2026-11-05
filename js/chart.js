// Native SVG chart, no dependencies (spec §6.3).
// One point per eligible fill, in chronological order. Points are spaced by their order in
// the series, so fills sharing a date stay distinct. The line is broken where fills are
// missing from the series (for example a non-computable efficiency), so it never bridges a gap.

import { METRICS } from './calculations.js';
import {
  formatCurrency,
  formatDate,
  formatKm,
  formatKmPerL,
  formatPricePerLiter,
  formatShortDate,
} from './format.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const axisNumber = (digits) =>
  new Intl.NumberFormat('fr-CA', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Display settings per metric. */
export const METRIC_INFO = Object.freeze({
  [METRICS.pricePerLiter]: {
    title: 'Prix du litre',
    unit: '$/L',
    format: formatPricePerLiter,
    includeZero: false,
    emptyDetail: 'Ajoutez un plein pour afficher le prix du litre.',
  },
  [METRICS.kmPerL]: {
    title: 'Rendement du dernier intervalle',
    unit: 'km/L',
    format: formatKmPerL,
    includeZero: false,
    emptyDetail:
      'Le rendement se calcule à partir du deuxième plein complet : ' +
      'distance depuis le plein précédent ÷ litres ajoutés au plein courant.',
  },
  [METRICS.cumulativeCost]: {
    title: 'Dépenses cumulées',
    unit: '$',
    format: formatCurrency,
    includeZero: true,
    emptyDetail: 'Ajoutez un plein pour afficher les dépenses cumulées.',
  },
});

function niceNumber(value, round) {
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  let nice;
  if (round) {
    nice = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
  } else {
    nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  }
  return nice * 10 ** exponent;
}

/**
 * “Nice” axis bounds and ticks covering [min, max] (pure, tested).
 * @returns { min, max, step, ticks, decimals }
 */
export function niceScale(min, max, { includeZero = false, tickCount = 5 } = {}) {
  let low = includeZero ? Math.min(0, min) : min;
  let high = includeZero ? Math.max(0, max) : max;
  if (low === high) {
    const pad = Math.abs(low) * 0.05 || 1;
    low -= pad;
    high += pad;
    if (includeZero && min >= 0) low = Math.max(0, low);
  }

  const range = niceNumber(high - low, false);
  const step = niceNumber(range / (tickCount - 1), true);
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const niceMin = Math.floor(low / step) * step;
  const niceMax = Math.ceil(high / step) * step;

  const ticks = [];
  for (let value = niceMin; value <= niceMax + step / 2; value += step) {
    ticks.push(Number(value.toFixed(decimals)));
  }
  return { min: ticks[0], max: ticks[ticks.length - 1], step, ticks, decimals };
}

/**
 * Splits chart points into runs of consecutive fills (pure, tested).
 * A gap in `index` means a fill is missing from the series, so the line must not join across it.
 */
export function splitSegments(points) {
  const segments = [];
  let current = [];
  points.forEach((point, i) => {
    if (i > 0 && point.index !== points[i - 1].index + 1) {
      segments.push(current);
      current = [];
    }
    current.push(point);
  });
  if (current.length > 0) segments.push(current);
  return segments;
}

function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

function html(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

function renderEmpty(container, info) {
  container.replaceChildren(
    html(
      'div',
      'chart-empty',
      html('p', 'chart-empty-title', 'Pas encore assez de données'),
      html('p', 'note', info.emptyDetail.replace(' : ', ' : ')),
    ),
  );
}

/**
 * Renders the chart for one metric.
 * @param points output of chartSeries(): [{ id, index, date, odometerKm, value }]
 */
export function renderChart(container, points, metric) {
  const info = METRIC_INFO[metric];
  if (points.length === 0) {
    renderEmpty(container, info);
    return;
  }

  const width = Math.max(280, Math.round(container.clientWidth || 600));
  const height = width < 520 ? 240 : 300;

  const values = points.map((point) => point.value);
  const scale = niceScale(Math.min(...values), Math.max(...values), { includeZero: info.includeZero });
  const tickFormat = axisNumber(scale.decimals);
  const tickLabel = (value) => tickFormat.format(value);

  const longestTick = Math.max(...scale.ticks.map((tick) => tickLabel(tick).length));
  const margin = { top: 28, right: 16, bottom: 44, left: Math.max(40, longestTick * 7.5 + 14) };
  const plot = {
    left: margin.left,
    right: width - margin.right,
    top: margin.top,
    bottom: height - margin.bottom,
  };
  const inset = 14; // keep the first and last points off the axes
  const xOf = (i) =>
    points.length === 1
      ? (plot.left + plot.right) / 2
      : plot.left + inset + (i * (plot.right - plot.left - 2 * inset)) / (points.length - 1);
  const yOf = (value) =>
    plot.bottom - ((value - scale.min) / (scale.max - scale.min)) * (plot.bottom - plot.top);

  const chartLabel = `${info.title}, ${points.length} point${points.length > 1 ? 's' : ''}, du ${formatDate(points[0].date)} au ${formatDate(points[points.length - 1].date)}`;
  const root = svg('svg', {
    class: 'chart-svg',
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    role: 'group',
    'aria-label': chartLabel,
  });

  // Y axis: grid lines, tick labels and unit
  const yAxis = svg('g', { class: 'chart-axis chart-axis-y', 'aria-hidden': 'true' });
  for (const tick of scale.ticks) {
    const y = yOf(tick);
    yAxis.append(
      svg('line', { class: 'chart-grid', x1: plot.left, x2: plot.right, y1: y, y2: y }),
      svg('text', { x: plot.left - 8, y, dy: '0.32em', 'text-anchor': 'end' }, tickLabel(tick)),
    );
  }
  yAxis.append(svg('text', { class: 'chart-unit', x: 0, y: 14 }, info.unit));

  // X axis: date labels, thinned out so they never overlap
  const xAxis = svg('g', { class: 'chart-axis chart-axis-x', 'aria-hidden': 'true' });
  xAxis.append(svg('line', { class: 'chart-baseline', x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom }));
  const maxLabels = Math.max(1, Math.floor((plot.right - plot.left) / 84));
  const every = Math.ceil(points.length / maxLabels);
  points.forEach((point, i) => {
    if (i % every !== 0) return;
    const x = xOf(i);
    const isLast = i === points.length - 1;
    const anchor = points.length === 1 ? 'middle' : i === 0 ? 'start' : isLast ? 'end' : 'middle';
    const labelX = anchor === 'start' ? x - 6 : anchor === 'end' ? x + 6 : x;
    xAxis.append(
      svg('line', { class: 'chart-tick', x1: x, x2: x, y1: plot.bottom, y2: plot.bottom + 5 }),
      svg('text', { x: labelX, y: plot.bottom + 20, 'text-anchor': anchor }, formatShortDate(point.date)),
    );
  });

  // Line, broken at gaps
  const positions = new Map(points.map((point, i) => [point.id, { x: xOf(i), y: yOf(point.value) }]));
  const lines = svg('g', { class: 'chart-lines', 'aria-hidden': 'true' });
  for (const segment of splitSegments(points)) {
    if (segment.length < 2) continue;
    const d = segment
      .map((point, i) => {
        const { x, y } = positions.get(point.id);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    lines.append(svg('path', { class: 'chart-line', d }));
  }

  // Points: focusable with a roving tabindex (arrow keys move between points)
  const tooltip = html('div', 'chart-tooltip');
  tooltip.hidden = true;
  tooltip.setAttribute('role', 'status');

  const pointNodes = [];
  const markers = svg('g', { class: 'chart-points' });
  points.forEach((point, i) => {
    const { x, y } = positions.get(point.id);
    const valueText = info.format(point.value);
    const label = `${formatDate(point.date)}, odomètre ${formatKm(point.odometerKm)} : ${valueText}`;
    const node = svg(
      'g',
      {
        class: 'chart-point',
        tabindex: i === points.length - 1 ? '0' : '-1',
        role: 'img',
        'aria-label': label,
        'data-id': point.id,
      },
      svg('circle', { class: 'chart-hit', cx: x, cy: y, r: 16 }),
      svg('circle', { class: 'chart-dot', cx: x, cy: y, r: 5 }),
    );
    node.__point = { point, x, y, valueText };
    pointNodes.push(node);
    markers.append(node);
  });

  let active = null;
  function show(node) {
    const { point, x, y, valueText } = node.__point;
    pointNodes.forEach((other) => other.classList.toggle('is-active', other === node));
    active = node;
    tooltip.replaceChildren(
      html('strong', '', formatDate(point.date)),
      html('span', '', `Odomètre : ${formatKm(point.odometerKm)}`),
      html('span', '', `${info.title} : ${valueText}`),
    );
    tooltip.hidden = false;
    const box = tooltip.getBoundingClientRect();
    const left = Math.min(Math.max(0, x - box.width / 2), width - box.width);
    const top = y - box.height - 14 < 0 ? y + 14 : y - box.height - 14;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }
  function hide() {
    active?.classList.remove('is-active');
    active = null;
    tooltip.hidden = true;
  }
  function focusPoint(i) {
    const target = pointNodes[Math.max(0, Math.min(pointNodes.length - 1, i))];
    pointNodes.forEach((node) => node.setAttribute('tabindex', node === target ? '0' : '-1'));
    target.focus();
  }

  markers.addEventListener('pointerover', (event) => {
    const node = event.target.closest('.chart-point');
    if (node) show(node);
  });
  markers.addEventListener('pointerout', (event) => {
    const node = event.target.closest('.chart-point');
    if (node && !node.contains(event.relatedTarget) && document.activeElement !== node) hide();
  });
  markers.addEventListener('pointerdown', (event) => {
    const node = event.target.closest('.chart-point');
    if (node) show(node);
  });
  markers.addEventListener('focusin', (event) => {
    const node = event.target.closest('.chart-point');
    if (node) show(node);
  });
  markers.addEventListener('focusout', hide);
  markers.addEventListener('keydown', (event) => {
    const i = pointNodes.indexOf(event.target.closest('.chart-point'));
    if (i === -1) return;
    const moves = { ArrowRight: i + 1, ArrowUp: i + 1, ArrowLeft: i - 1, ArrowDown: i - 1, Home: 0, End: pointNodes.length - 1 };
    if (event.key in moves) {
      event.preventDefault();
      focusPoint(moves[event.key]);
    } else if (event.key === 'Escape') {
      hide();
    }
  });
  root.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.chart-point')) hide();
  });

  root.append(yAxis, xAxis, lines, markers);
  const frame = html('div', 'chart-frame', root, tooltip);
  const hint = html(
    'p',
    'note chart-hint',
    'Survolez ou touchez un point pour voir le détail. Au clavier : Tab, puis les flèches.',
  );
  container.replaceChildren(frame, hint);
}
