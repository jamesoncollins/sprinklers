# Implementation Phases

This plan delivers value quickly while minimizing rework.

## Phase 0 — Project bootstrap (1-2 days)

**Goal:** runnable HTML5 app shell and development workflow.

- Initialize React + TypeScript + Vite app.
- Add linting/formatting, test runner, and CI checks.
- Add baseline UI layout: left panel (catalog/project), center map canvas, right panel (selected sprinkler).
- Define TypeScript domain types for `ProjectV1` and `CatalogV1`.

**Exit criteria**
- App runs locally and builds in CI.
- Empty project can be created and saved as JSON.

## Phase 1 — Catalog import and pressure lookup (3-5 days)

**Goal:** pressure-aware sprinkler/nozzle selection from CSV.

- CSV upload + parsing pipeline.
- Validation and normalization into canonical `CatalogV1` JSON.
- Index by `(manufacturer, headModel, nozzleModel)`.
- Pressure lookup behavior:
  - exact pressure match,
  - linear interpolation between adjacent pressure points,
  - clamp with warning when out-of-range.
- Catalog browser UI with search/filter.

**Exit criteria**
- User can import CSV and select a model/nozzle.
- App computes interpolated `flowGpm` and `radiusFt` for chosen pressure.

## Phase 2 — Map editing and zone assignment (4-6 days)

**Goal:** core planning interaction on satellite imagery.

- Integrate MapLibre (or Leaflet) with satellite basemap source.
- Add sprinkler placement/editing (click to add, drag to move).
- Add sprinkler form controls: zone, arc, orientation, pressure, selected model/nozzle.
- Zone CRUD and zone colorization.
- Save/load full project JSON.

**Exit criteria**
- User can model a yard with multiple zones and persist/reload all data.

## Phase 3 — Coverage rendering + precipitation analysis (4-6 days)

**Goal:** meaningful engineering feedback.

- Render throw geometry (circle/sector) from radius + arc + orientation.
- Compute per-sprinkler PR estimate.
- Compute zone totals: total flow, rough irrigated area, zone PR estimate.
- Add warnings (pressure clamped, missing nozzle data, suspicious PR ranges).
- Add analysis summary panel.

**Exit criteria**
- User sees throw overlays and zone-level precipitation numbers update live.

## Phase 4 — Reporting, QA hardening, and beta release (3-5 days)

**Goal:** make tool shareable and trustworthy.

- Export printable summary (PDF or print stylesheet).
- Add import/export compatibility checks (schema versioning).
- Add unit tests for interpolation and precipitation formulas.
- Add E2E test for import → place sprinklers → analyze → save/reload.
- Add onboarding docs and sample starter datasets.

**Exit criteria**
- Stable beta build suitable for pilot users.

## Suggested backlog after beta

- DU/overlap scoring and head-to-head coverage quality metrics.
- Soil intake + cycle/soak recommendations.
- Optional backend for shared projects and catalog sync.
- Hydraulic loss and pipe sizing assistant.
