// Entry point: startup, state and orchestration (spec §9).
// Wiring of storage, calculations and UI is implemented in #10.

import * as storage from './storage.js';
import * as calculations from './calculations.js';
import * as validation from './validation.js';
import * as chart from './chart.js';
import * as ui from './ui.js';

function start() {
  // Placeholder until #10: modules are loaded so import errors surface early.
  void storage;
  void calculations;
  void validation;
  void chart;
  void ui;
}

start();
