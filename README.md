# Suivi d’essence

A browser prototype for logging fuel fill-ups and tracking consumption and spending for one vehicle. It is plain HTML, CSS and JavaScript (ES modules) with no dependencies, no server and no account. Data stays in the browser's `localStorage`.

- Specification: [`specification_suivi_consommation_vehicule.md`](specification_suivi_consommation_vehicule.md)
- Implementation plan and design decisions: [`PLAN.md`](PLAN.md)

## Run locally

ES modules don't load from `file://`, so serve the folder with any static HTTP server:

```sh
python -m http.server 8000
```

Then open <http://localhost:8000>. No network access is needed beyond the local server.

## Project structure

```text
index.html
styles.css
js/
  app.js          # startup, state, orchestration
  storage.js      # localStorage persistence
  calculations.js # pure, testable logic
  validation.js   # input validation
  chart.js        # native SVG chart
  ui.js           # form, table, indicators
```

## Tests

Tests use Node's built-in runner and assertions (Node 18+, no npm install). From the project root:

```sh
node --test
```

Node finds `tests/*.test.js` automatically.

Without Node, run the same tests in a browser: start the local server (see above) and open <http://localhost:8000/tests/>. The page uses an import map that points `node:test` and `node:assert/strict` to small shims in `tests/browser/`. When you add a test file, add it to the `files` list in `tests/index.html`.

| File | Covers |
|---|---|
| `tests/calculations.test.js` | First fill, reference example (§5), weighted efficiency, ordering, non-full tanks, chart series, edit propagation, deletions |
| `tests/validation.test.js` | Decimal comma/spaces, dates, bounds, full-tank confirmation, odometer consistency on insert and edit |
| `tests/storage.test.js` | Round trip, missing key, corrupt JSON and backup, skipped entries, newer schema, unavailable storage, quota errors |
