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

Node finds `tests/*.test.js` automatically. More test coverage and a browser test page come in #5.
