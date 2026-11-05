// DOM rendering and user interactions: dashboard, form, history (spec §6).
// Content is built with DOM APIs (textContent), never innerHTML, so stored text is never interpreted as markup.

import { INTERVAL_STATUS } from './calculations.js';
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

// ---------------------------------------------------------------------------
// Add / edit form (spec §6.2)

const FORM_FIELDS = ['date', 'odometerKm', 'liters', 'pricePerLiterCad', 'fullTank'];

/** Shows a stored number in French notation for editing (1.65 → "1,65"). */
function toInputNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value).replace('.', ',') : '';
}

/**
 * Controls the fill form inside its <dialog>.
 *
 * @param dialog the #fill-dialog element (markup in index.html)
 * @param onSubmit (rawValues, editingId) => { ok } | { ok: false, errors?, message? }
 * @param onPreview (rawValues, editingId) => { cost, distanceKm, isFirst } with nulls when unknown
 * @param today () => YYYY-MM-DD, used as default date and upper bound
 */
export function createFillForm({ dialog, onSubmit, onPreview, today }) {
  const form = dialog.querySelector('form');
  const title = dialog.querySelector('#fill-dialog-title');
  const submitButton = dialog.querySelector('#fill-submit');
  const cancelButton = dialog.querySelector('#fill-cancel');
  const preview = dialog.querySelector('#fill-preview');
  const formError = dialog.querySelector('#fill-form-error');
  const inputs = Object.fromEntries(FORM_FIELDS.map((name) => [name, form.elements[name]]));
  const errorSlots = Object.fromEntries(
    FORM_FIELDS.map((name) => [name, form.querySelector(`[data-error-for="${name}"]`)]),
  );

  let editingId = null;

  function readValues() {
    return {
      date: inputs.date.value,
      odometerKm: inputs.odometerKm.value,
      liters: inputs.liters.value,
      pricePerLiterCad: inputs.pricePerLiterCad.value,
      fullTank: inputs.fullTank.checked,
    };
  }

  function setFieldError(name, message) {
    errorSlots[name].textContent = message ?? '';
    inputs[name].setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function showErrors(errors) {
    for (const name of FORM_FIELDS) setFieldError(name, errors[name]);
    const firstInvalid = FORM_FIELDS.find((name) => errors[name]);
    if (firstInvalid) inputs[firstInvalid].focus();
  }

  function showFormError(message) {
    formError.textContent = message ?? '';
    formError.hidden = !message;
  }

  function updatePreview() {
    const { cost, distanceKm, isFirst } = onPreview(readValues(), editingId);
    const parts = [];
    if (cost !== null) parts.push(`Coût du plein : ${formatCurrency(cost)}`);
    if (isFirst) {
      parts.push('Premier plein : point de départ de l’odomètre');
    } else if (distanceKm !== null) {
      parts.push(`Distance depuis le plein précédent : ${formatKm(distanceKm)}`);
    }
    preview.textContent = parts.join(' · ');
  }

  function open({ mode, values }) {
    editingId = mode === 'edit' ? values.id : null;
    const editing = mode === 'edit';
    title.textContent = editing ? 'Modifier un plein' : 'Ajouter un plein';
    submitButton.textContent = editing ? 'Enregistrer les modifications' : 'Enregistrer';

    inputs.date.max = today();
    inputs.date.value = values.date ?? today();
    inputs.odometerKm.value = toInputNumber(values.odometerKm);
    inputs.liters.value = toInputNumber(values.liters);
    inputs.pricePerLiterCad.value = toInputNumber(values.pricePerLiterCad);
    inputs.fullTank.checked = values.fullTank === true;

    showErrors({});
    showFormError(null);
    updatePreview();
    if (!dialog.open) dialog.showModal();
    (editing ? inputs.odometerKm : inputs.date).focus();
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    showFormError(null);
    const result = onSubmit(readValues(), editingId);
    if (result.ok) {
      close();
      return;
    }
    showErrors(result.errors ?? {});
    if (result.message) showFormError(result.message);
  });

  form.addEventListener('input', (event) => {
    const name = event.target.name;
    if (name && errorSlots[name]?.textContent) setFieldError(name, null);
    updatePreview();
  });

  cancelButton.addEventListener('click', close);
  dialog.addEventListener('close', () => {
    editingId = null;
  });

  return {
    openAdd: () => open({ mode: 'add', values: { fullTank: false } }),
    openEdit: (fill) => open({ mode: 'edit', values: fill }),
    close,
  };
}

// ---------------------------------------------------------------------------
// History (spec §6.4)

/** Why the efficiency of an interval is not shown, as text (never colour only). */
const INTERVAL_REASON = {
  [INTERVAL_STATUS.reference]: 'Premier plein : point de référence',
  [INTERVAL_STATUS.notFull]: 'Non calculable : plein partiel',
  [INTERVAL_STATUS.broken]: 'Non calculable : un plein intermédiaire a été supprimé',
  [INTERVAL_STATUS.invalidDistance]: 'Non calculable : distance nulle',
};

const HISTORY_COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'odometer', label: 'Odomètre', numeric: true },
  { key: 'liters', label: 'Litres', numeric: true },
  { key: 'price', label: 'Prix/L', numeric: true },
  { key: 'cost', label: 'Coût', numeric: true },
  { key: 'distance', label: 'Distance', numeric: true },
  { key: 'efficiency', label: 'Rendement', numeric: true },
  { key: 'cumulative', label: 'Cumul', numeric: true },
  { key: 'actions', label: 'Actions' },
];

function efficiencyCell(record) {
  if (record.kmPerL !== null) {
    return [
      el('span', {}, formatKmPerL(record.kmPerL)),
      el('span', { className: 'cell-detail' }, formatLPer100Km(record.lPer100Km)),
    ];
  }
  const reason = INTERVAL_REASON[record.intervalStatus] ?? 'Non calculable';
  return [
    el('span', { attrs: { 'aria-hidden': 'true' } }, MISSING),
    el('span', { className: `cell-detail reason reason-${record.intervalStatus}` }, reason.replace(' : ', ' : ')),
  ];
}

/**
 * History table, most recent first (spec §6.4). On narrow screens CSS turns each row
 * into a card, using each cell's data-label as its caption.
 */
export function renderHistory(container, enriched, { onEdit, onDelete }) {
  const rows = [...enriched].reverse().map((record) => {
    const date = formatDate(record.date);
    const cells = {
      date: el('time', { dateTime: record.date }, date),
      odometer: formatKm(record.odometerKm),
      liters: formatLiters(record.liters),
      price: formatPricePerLiter(record.pricePerLiterCad),
      cost: formatCurrency(record.cost),
      distance: formatKm(record.distanceKm),
      efficiency: efficiencyCell(record),
      cumulative: formatCurrency(record.cumulativeCost),
      actions: el(
        'div',
        { className: 'row-actions' },
        el(
          'button',
          {
            type: 'button',
            className: 'button button-small',
            attrs: { 'aria-label': `Modifier le plein du ${date}` },
            on: { click: () => onEdit(record.id) },
          },
          'Modifier',
        ),
        el(
          'button',
          {
            type: 'button',
            className: 'button button-small button-danger-outline',
            attrs: { 'aria-label': `Supprimer le plein du ${date}` },
            on: { click: () => onDelete(record.id) },
          },
          'Supprimer',
        ),
      ),
    };

    return el(
      'tr',
      { dataset: { id: record.id, status: record.intervalStatus } },
      HISTORY_COLUMNS.map(({ key, label, numeric }) =>
        el(
          key === 'date' ? 'th' : 'td',
          {
            className: `col-${key}${numeric ? ' numeric' : ''}`,
            dataset: { label },
            attrs: key === 'date' ? { scope: 'row' } : {},
          },
          cells[key],
        ),
      ),
    );
  });

  container.replaceChildren(
    el(
      'div',
      { className: 'table-wrap' },
      el(
        'table',
        { className: 'history-table' },
        el('caption', {}, `${formatCount(enriched.length)} plein(s), du plus récent au plus ancien`),
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            HISTORY_COLUMNS.map(({ key, label, numeric }) =>
              el('th', { scope: 'col', className: `col-${key}${numeric ? ' numeric' : ''}` }, label),
            ),
          ),
        ),
        el('tbody', {}, rows),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Confirmation dialog (deletion)

/**
 * Wraps the #confirm-dialog element.
 * confirm({ text, warning }) resolves to true when the user confirms.
 */
export function createConfirmDialog(dialog) {
  const form = dialog.querySelector('form');
  const text = dialog.querySelector('#confirm-text');
  const warning = dialog.querySelector('#confirm-warning');
  let settle = null;

  // The button choice is read from the synchronous submit event; `close` (also fired by Esc)
  // only settles a pending choice as “cancel”.
  form.addEventListener('submit', (event) => {
    settle?.(event.submitter?.value === 'confirm');
  });
  dialog.addEventListener('close', () => settle?.(false));

  return {
    confirm({ text: message, warning: warningText = null }) {
      settle?.(false);
      text.textContent = message;
      warning.textContent = warningText ?? '';
      warning.hidden = !warningText;
      dialog.showModal();
      return new Promise((resolve) => {
        settle = (confirmed) => {
          settle = null;
          resolve(confirmed);
        };
      });
    },
  };
}
