# Suivi d’essence

A browser prototype for logging fuel fill-ups and tracking a vehicle's fuel consumption and spending. It is plain HTML, CSS and JavaScript (ES modules) with no dependencies, no server, no account and no network access. Data stays in the browser's `localStorage`.

**Live version:** <https://truffio.github.io/fuel/> (GitHub Pages, published from `main`)

- Specification: [`specification_suivi_consommation_vehicule.md`](specification_suivi_consommation_vehicule.md)
- Implementation plan and design decisions: [`PLAN.md`](PLAN.md)

## Features

- **Dashboard**: total spent, number of fills, total distance, and the weighted average efficiency (km/L and L/100 km)
- **Add / edit a fill**: date, odometer, litres, price per litre and full-tank confirmation. Distance is never typed: it is computed from the odometer. A decimal comma is accepted, and errors are explained next to each field.
- **Chart** (native SVG): price per litre, efficiency of the last interval, or cumulative spending. Each point has a tooltip on hover, tap or keyboard focus.
- **History**: every value per fill, with edit and delete (after confirmation)
- **Data integrity**:
  - everything is recomputed from the raw fills
  - no efficiency is shown for the first fill, or for an interval made inconsistent by deleting a fill in between
  - unreadable stored data is backed up, never silently overwritten

## Run locally

ES modules don't load from `file://`, so serve the folder with any static HTTP server:

```sh
python -m http.server 8000
```

Then open <http://localhost:8000>.

## Tests

### Automated

The tests use Node's built-in runner and assertions (Node 18+, no `npm install`). From the project root:

```sh
node --test
```

Node finds `tests/*.test.js` automatically.

Without Node, run the same tests in a browser: start the local server and open <http://localhost:8000/tests/> (or <https://truffio.github.io/fuel/tests/>). The page uses an import map that points `node:test` and `node:assert/strict` to small shims in `tests/browser/`. When you add a test file, add it to the `files` list in `tests/index.html`.

| File | Covers |
|---|---|
| `tests/calculations.test.js` | First fill, reference example (§5), weighted efficiency, ordering, non-full tanks, chart series, edit propagation, deletions, re-insertion |
| `tests/validation.test.js` | Decimal comma and spaces, dates, bounds, full-tank confirmation, odometer consistency on insert and edit |
| `tests/storage.test.js` | Round trip, missing key, corrupt JSON and backup, skipped entries, newer schema, unavailable storage, quota errors |
| `tests/format.test.js` | French formatting of currency, $/L, km, L, km/L, L/100 km and dates; `—` for missing values |
| `tests/chart.test.js` | Axis scale and ticks, line segments broken at gaps, metric settings |

### Manual test script (acceptance criteria, spec §12)

Start from an empty state. To get one, open the page in a private window, or delete the `vehicleFuelTracker.v1` key in DevTools → Application → Local Storage.

| # | Steps | Expected |
|---|---|---|
| 1 | Open the app | Short explanation and « Ajouter le premier plein »; no chart or history |
| 2 | Add 2026‑10‑01, 10 000 km, 40 L, 1,60 $/L, full tank | Cost 64,00 $, cumulative 64,00 $; distance and efficiency « — »; message that a 2nd fill is needed |
| 3 | Add 2026‑10‑15, 10 500 km, 40 L, 1,70 $/L | 500 km, 12,50 km/L, 68,00 $, cumulative 132,00 $ |
| 4 | Add 2026‑11‑01, 10 920 km, 35 L, 1,65 $/L | 420 km, 12,00 km/L, 57,75 $, cumulative 189,75 $; average 12,27 km/L (920 km ÷ 75 L) |
| 5 | Switch the chart between the three metrics | Prix du litre: 3 points (1,60 / 1,70 / 1,65); Rendement: 2 points; Dépenses cumulées: 3 points up to 189,75 $ |
| 6 | Select « Rendement » | No point for the first fill |
| 7 | Try 0 L, « abc », an odometer ≤ the previous fill, a future date, or an unticked « Plein complet » | Refused, with a message next to the field |
| 8 | Edit the 15 Oct fill to 10 400 km, 32 L | Rows show 400 km and 520 km; cumulative becomes 118,40 $ then 176,15 $ |
| 9 | Delete the 15 Oct fill | The confirmation warns that the efficiency will be hidden; the 1 Nov row shows 920 km and « Non calculable : un plein intermédiaire a été supprimé »; no efficiency point in the chart or on the dashboard |
| 10 | Reload the page | Same data and the same chart metric |
| 11 | Use a phone, or DevTools device mode at 360 px | History shown as cards; form and chart fit without horizontal scrolling |
| 12 | DevTools → Network | Only local files are loaded; no third‑party library |

## Project structure

```text
index.html            page markup: dashboard, chart, history, form and confirmation dialogs
styles.css            mobile-first styles, light and dark themes
js/
  app.js              startup, state, orchestration (commit → save → render)
  storage.js          localStorage persistence, corrupt-data backup
  calculations.js     pure, testable logic (enrichment, summary, chart series, delete/insert rules)
  validation.js       input parsing and validation
  format.js           French (Canada) display formatting
  chart.js            native SVG chart
  ui.js               DOM rendering: messages, dashboard, form, history, confirmation
tests/
  *.test.js           node:test suites
  index.html          browser test runner
  browser/            node:test / node:assert shims for the browser
```

## Publishing

GitHub Pages serves the repository root of the `main` branch. `.nojekyll` turns off Jekyll processing, so files are served as is. Work happens on `dev`, and `main` is updated through a pull request.
