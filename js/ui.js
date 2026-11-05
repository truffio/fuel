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
