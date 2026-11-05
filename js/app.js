// Entry point: startup, state and orchestration (spec §9).
// Every change goes through commit(): save the raw data, then recompute everything from it and re-render.

import * as storage from './storage.js';
import {
  computeSummary,
  enrichFills,
  isIntermediateFill,
  removeFill,
  sortFills,
  upsertFill,
} from './calculations.js';
import { formatDate, formatKm, formatLiters } from './format.js';
import { parseDecimal, todayLocalIso, validateFill } from './validation.js';
import * as ui from './ui.js';

const elements = {
  messages: document.getElementById('app-messages'),
  dashboard: document.getElementById('dashboard-content'),
  chartSection: document.getElementById('chart-section'),
  historySection: document.getElementById('history'),
  history: document.getElementById('history-content'),
  historyTitle: document.getElementById('history-title'),
  addFillButton: document.getElementById('add-fill-button'),
  fillDialog: document.getElementById('fill-dialog'),
  confirmDialog: document.getElementById('confirm-dialog'),
};

const loaded = storage.load();

const app = {
  state: loaded.state,
  canSave: loaded.canSave,
  // Load problems stay visible for the whole session; action messages are replaced on each action.
  loadMessages: loaded.message
    ? [{ type: loaded.status === 'recovered' ? 'warning' : 'error', text: loaded.message }]
    : [],
  actionMessages: [],
};

/**
 * Saves the next state, then makes it current and re-renders.
 * When saving is disabled at load (unreadable data that could not be backed up, newer
 * schema, no storage), changes apply to this session only; the load message explains why.
 * @returns { ok: true } or { ok: false, message }
 */
function commit(nextState) {
  if (app.canSave) {
    const result = storage.save(nextState);
    if (!result.ok) return result;
  }
  app.state = nextState;
  render();
  return { ok: true };
}

function setActionMessage(message) {
  app.actionMessages = message ? [message] : [];
  ui.renderMessages(elements.messages, [...app.loadMessages, ...app.actionMessages]);
}

function handleFillSubmit(raw, editingId) {
  const fills = app.state.fills;
  const validation = validateFill(raw, fills, { editingId });
  if (!validation.ok) return { ok: false, errors: validation.errors };

  const existing = editingId ? fills.find((fill) => fill.id === editingId) : null;
  const fill = existing
    ? { ...existing, ...validation.value }
    : { id: storage.generateId(), ...validation.value, createdAt: new Date().toISOString() };

  const result = commit({ ...app.state, fills: upsertFill(fills, fill) });
  if (!result.ok) return { ok: false, message: result.message };

  setActionMessage({
    type: 'info',
    text: existing ? 'Modifications enregistrées.' : 'Plein enregistré.',
  });
  return { ok: true };
}

/** Live cost and distance preview while typing, using the same rules as the history. */
function previewFill(raw, editingId) {
  const liters = parseDecimal(raw.liters);
  const price = parseDecimal(raw.pricePerLiterCad);
  const odometerKm = parseDecimal(raw.odometerKm);
  const cost = liters > 0 && price > 0 ? liters * price : null;

  if (!raw.date || !Number.isFinite(odometerKm)) {
    return { cost, distanceKm: null, isFirst: false };
  }

  const others = app.state.fills.filter((fill) => fill.id !== editingId);
  const existing = app.state.fills.find((fill) => fill.id === editingId);
  const probe = {
    id: '__preview__',
    date: raw.date,
    odometerKm,
    liters: 1,
    pricePerLiterCad: 1,
    fullTank: true,
    createdAt: existing?.createdAt ?? '￿',
  };
  const record = enrichFills([...others, probe]).find((fill) => fill.id === probe.id);
  return { cost, distanceKm: record.distanceKm, isFirst: record.index === 0 };
}

const fillForm = ui.createFillForm({
  dialog: elements.fillDialog,
  onSubmit: handleFillSubmit,
  onPreview: previewFill,
  today: () => todayLocalIso(),
});

const confirmDialog = ui.createConfirmDialog(elements.confirmDialog);

function openAddForm() {
  fillForm.openAdd();
}

function openEditForm(id) {
  const fill = app.state.fills.find((candidate) => candidate.id === id);
  if (fill) fillForm.openEdit(fill);
}

/** Deletes a fill after confirmation (spec §6.4, §7). */
async function deleteFill(id) {
  const fills = app.state.fills;
  const fill = fills.find((candidate) => candidate.id === id);
  if (!fill) return;

  const sorted = sortFills(fills);
  const isFirst = sorted[0].id === id && sorted.length > 1;
  const intermediate = isIntermediateFill(fills, id);
  const date = formatDate(fill.date);

  let warning = null;
  if (intermediate) {
    warning =
      'Ce plein se trouve entre deux autres pleins. La distance sera recalculée entre les pleins voisins, ' +
      'mais le rendement de cet intervalle sera masqué : l’essence du plein suivant ne représente plus ' +
      'toute l’essence consommée sur cette distance.';
  } else if (isFirst) {
    warning = 'Le plein suivant deviendra le nouveau point de référence de l’odomètre, sans rendement.';
  }

  const confirmed = await confirmDialog.confirm({
    text: `Plein du ${date} — ${formatKm(fill.odometerKm)}, ${formatLiters(fill.liters)}. Cette action est définitive.`,
    warning,
  });
  if (!confirmed) return;

  const { fills: remaining, brokenFillId } = removeFill(fills, id);
  const result = commit({ ...app.state, fills: remaining });
  if (!result.ok) {
    setActionMessage({ type: 'error', text: result.message });
    return;
  }

  setActionMessage({
    type: 'info',
    text: brokenFillId
      ? `Plein du ${date} supprimé. Le rendement de l’intervalle suivant est masqué.`
      : `Plein du ${date} supprimé.`,
  });
  // The deleted row's button no longer exists: move focus somewhere predictable.
  (remaining.length > 0 ? elements.historyTitle : elements.addFillButton).focus();
}

function render() {
  const enriched = enrichFills(app.state.fills);
  const summary = computeSummary(enriched);
  const hasFills = enriched.length > 0;

  ui.renderMessages(elements.messages, [...app.loadMessages, ...app.actionMessages]);
  ui.renderDashboard(elements.dashboard, summary, { onAddFill: openAddForm });
  ui.renderHistory(elements.history, enriched, { onEdit: openEditForm, onDelete: deleteFill });

  // Chart and history have nothing to show before the first fill (spec §6.5).
  elements.chartSection.hidden = !hasFills;
  elements.historySection.hidden = !hasFills;
}

elements.addFillButton.addEventListener('click', openAddForm);
render();
