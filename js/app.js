// Entry point: startup, state and orchestration (spec §9).
// Every change goes through commit(): save the raw data, then recompute everything from it and re-render.

import * as storage from './storage.js';
import { computeSummary, enrichFills, upsertFill } from './calculations.js';
import { parseDecimal, todayLocalIso, validateFill } from './validation.js';
import * as ui from './ui.js';

const elements = {
  messages: document.getElementById('app-messages'),
  dashboard: document.getElementById('dashboard-content'),
  chartSection: document.getElementById('chart-section'),
  historySection: document.getElementById('history'),
  addFillButton: document.getElementById('add-fill-button'),
  fillDialog: document.getElementById('fill-dialog'),
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

function openAddForm() {
  fillForm.openAdd();
}

function render() {
  const enriched = enrichFills(app.state.fills);
  const summary = computeSummary(enriched);
  const hasFills = enriched.length > 0;

  ui.renderMessages(elements.messages, [...app.loadMessages, ...app.actionMessages]);
  ui.renderDashboard(elements.dashboard, summary, { onAddFill: openAddForm });

  // Chart and history have nothing to show before the first fill (spec §6.5).
  elements.chartSection.hidden = !hasFills;
  elements.historySection.hidden = !hasFills;
}

elements.addFillButton.addEventListener('click', openAddForm);
render();
