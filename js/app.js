// Entry point: startup, state and orchestration (spec §9).
// Full event wiring (add, edit, delete, chart metric) lands in #10.

import * as storage from './storage.js';
import { computeSummary, enrichFills } from './calculations.js';
import * as ui from './ui.js';

const elements = {
  messages: document.getElementById('app-messages'),
  dashboard: document.getElementById('dashboard-content'),
  chartSection: document.getElementById('chart-section'),
  historySection: document.getElementById('history'),
  addFillButton: document.getElementById('add-fill-button'),
};

const loaded = storage.load();

const app = {
  state: loaded.state,
  canSave: loaded.canSave,
  messages: loaded.message
    ? [{ type: loaded.status === 'recovered' ? 'warning' : 'error', text: loaded.message }]
    : [],
};

function openAddForm() {
  // Implemented in #7 (add / edit form).
}

function render() {
  const enriched = enrichFills(app.state.fills);
  const summary = computeSummary(enriched);
  const hasFills = enriched.length > 0;

  ui.renderMessages(elements.messages, app.messages);
  ui.renderDashboard(elements.dashboard, summary, { onAddFill: openAddForm });

  // Chart and history have nothing to show before the first fill (spec §6.5).
  elements.chartSection.hidden = !hasFills;
  elements.historySection.hidden = !hasFills;
}

elements.addFillButton.addEventListener('click', openAddForm);
render();
