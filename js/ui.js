// DOM rendering and user interactions: dashboard, form, history (spec §6).
// Content is built with DOM APIs (textContent), never innerHTML, so stored text is never interpreted as markup.

import {
  formatCount,
  formatCurrency,
  formatKm,
  formatKmPerL,
  formatLPer100Km,
} from './format.js';

/**
 * Creates an element. `props` sets properties (className, id, type, hidden…),
 * except `dataset`, `attrs` (setAttribute) and `on` (event listeners).
 * Children may be strings, nodes, or null/false (skipped).
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  const { dataset, attrs, on, ...rest } = props;
  Object.assign(node, rest);
  if (dataset) Object.assign(node.dataset, dataset);
  if (attrs) {
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  }
  if (on) {
    for (const [type, handler] of Object.entries(on)) node.addEventListener(type, handler);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

/** Replaces a container's children, skipping null/false entries. */
export function replaceContent(container, ...children) {
  container.replaceChildren(...children.flat().filter((child) => child !== null && child !== undefined && child !== false));
}

/**
 * Renders app-level messages (storage problems, save failures…).
 * @param messages [{ type: 'error' | 'warning' | 'info', text }]
 */
export function renderMessages(container, messages) {
  container.replaceChildren(
    ...messages.map(({ type, text }) =>
      el(
        'p',
        { className: `message message-${type}`, attrs: type === 'error' ? { role: 'alert' } : {} },
        el('strong', {}, type === 'error' ? 'Erreur\u00a0: ' : type === 'warning' ? 'Attention\u00a0: ' : 'Info\u00a0: '),
        text,
      ),
    ),
  );
}

const MEASUREMENT_ASSUMPTION =
  'La consommation est fiable seulement si chaque plein remplit complètement le réservoir\u00a0: ' +
  'l’essence ajoutée correspond alors à l’essence consommée depuis le plein précédent.';

function renderEmptyState(onAddFill) {
  return el(
    'div',
    { className: 'empty-state' },
    el(
      'p',
      {},
      'Consignez chaque plein d’essence pour suivre votre consommation et vos dépenses. ',
      'À chaque plein, entrez le kilométrage de l’odomètre\u00a0: la distance parcourue est calculée automatiquement.',
    ),
    el('p', { className: 'note' }, MEASUREMENT_ASSUMPTION),
    el(
      'button',
      { type: 'button', className: 'button button-primary', id: 'first-fill-button', on: { click: onAddFill } },
      'Ajouter le premier plein',
    ),
  );
}

function stat(label, value, detail = null) {
  return el(
    'div',
    { className: 'stat' },
    el('dt', { className: 'stat-label' }, label),
    el('dd', { className: 'stat-value' }, value),
    detail && el('dd', { className: 'stat-detail' }, detail),
  );
}

/**
 * Dashboard (spec §6.1, §6.5).
 * @param summary result of computeSummary()
 * @param onAddFill called by the empty-state button
 */
export function renderDashboard(container, summary, { onAddFill }) {
  if (summary.fillCount === 0) {
    container.replaceChildren(renderEmptyState(onAddFill));
    return;
  }

  const hasEfficiency = summary.overallKmPerL !== null;
  let hint = null;
  if (summary.fillCount === 1) {
    hint =
      'Premier plein enregistré\u00a0: il sert de point de départ de l’odomètre. ' +
      'Un deuxième plein complet est nécessaire pour calculer la distance parcourue et la consommation.';
  } else if (!hasEfficiency) {
    hint =
      'Aucun intervalle entre deux pleins complets consécutifs ne permet encore de calculer la consommation.';
  }

  replaceContent(
    container,
    el(
      'dl',
      { className: 'stats' },
      stat('Total dépensé', formatCurrency(summary.totalCost)),
      stat('Pleins enregistrés', formatCount(summary.fillCount)),
      stat(
        'Distance totale',
        formatKm(summary.totalDistanceKm),
        summary.totalDistanceKm === null ? null : 'depuis le premier plein',
      ),
      stat(
        'Rendement moyen',
        formatKmPerL(summary.overallKmPerL),
        hasEfficiency ? formatLPer100Km(summary.overallLPer100Km) : null,
      ),
    ),
    hint && el('p', { className: 'hint' }, hint),
    el('p', { className: 'note' }, MEASUREMENT_ASSUMPTION),
  );
}
