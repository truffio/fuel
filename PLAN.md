# Implementation plan — MVP

Source: [`specification_suivi_consommation_vehicule.md`](specification_suivi_consommation_vehicule.md) (v1.0).
Tracking: GitHub milestone **MVP**, issues #1–#11.

## Workflow

- `main` holds released states only. Work happens on `dev`; each issue gets a branch off `dev` (`issue-<n>-<slug>`) merged back via PR.
- Pure modules (calculations, validation, storage) first and covered by tests, then UI on top.

## Issues and order

| # | Issue | Area | Depends on |
|---|---|---|---|
| 1 | Project scaffold and static structure | infra | — |
| 2 | Calculation engine (`calculations.js`) | logic | 1 |
| 3 | Input parsing and validation (`validation.js`) | logic | 1 |
| 4 | localStorage persistence (`storage.js`) | logic | 1 |
| 5 | Automated tests with native assertions | tests | 2, 3, 4 |
| 6 | Dashboard, empty states and formatting | ui | 2 |
| 7 | Add / edit fill form | ui | 3 |
| 8 | Fill history with edit and delete | ui | 2, 7 |
| 9 | Native SVG chart with metric selector | chart | 2 |
| 10 | App orchestration and state wiring | logic, ui | 4, 6–9 |
| 11 | Responsive / a11y polish, README, acceptance pass | docs | all |

Suggested milestones within the MVP:

1. **Core logic** — #1, #2, #3, #4, #5 (testable without a browser UI)
2. **UI** — #6, #7, #8, #9, #10
3. **Finish** — #11

## Design decisions (spec ambiguities)

Following §13: when in doubt, favour data integrity and avoid misleading metrics.

1. **“Plein complet” checkbox.** The MVP requires it to be checked to save a fill (§2: the MVP imposes full fills). The data model still stores `fullTank` and the calculation still checks it, so partial fills can be added later without a migration.
2. **Intermediate deletion.** Allowed, with a warning. The fill following the deleted one gets `intervalBroken: true`; its interval shows “—” with a text marker, and is excluded from the efficiency chart and from the overall weighted efficiency. The flag is **not** cleared automatically when that fill is edited, because the litres still don't cover the merged interval. (A “reset” action could be added later if requested.)
3. **Deleting the first fill.** The next fill becomes the reference (no distance, no efficiency); its `intervalBroken` flag becomes irrelevant.
4. **Ordering and consistency.** Fills are ordered by date, then odometer, then `createdAt`. A fill is valid only if, in that order, the odometer is strictly increasing. Back-dated insertions are allowed if they respect this rule.
5. **Total distance** (dashboard) = last odometer − first odometer, independent of broken intervals. **Overall efficiency** = Σdistance / Σlitres over valid intervals only.
6. **Corrupt storage.** Never overwritten silently. If the stored JSON is unreadable, or some entries are invalid and get skipped, the raw value is first copied to `vehicleFuelTracker.v1.corrupt-<ISO timestamp>` and the user is warned. If that backup fails, data from a newer schema version is found, or localStorage is unavailable, saving is disabled (`canSave: false`) and the app explains why.
7. **Dates and numbers.** “Date réelle” (§4) is read as a real calendar date that is not in the future (local time). Numbers accept `,` or `.` as decimal separator and spaces as thousands separators; mixing `,` and `.` is rejected as ambiguous. No upper bounds beyond the spec.
8. **Tests** run with `node --test` (built into Node ≥ 18, no npm dependency); an optional browser test page covers users without Node.
