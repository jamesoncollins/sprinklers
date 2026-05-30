# Sprinklers Planner

A graphical tool for planning and documenting lawn irrigation systems using satellite imagery.

## Goals

- Look up sprinkler heads and nozzles and calculate precipitation rates at actual operating pressure.
- Overlay sprinkler placements on satellite imagery.
- Assign each sprinkler to a zone.
- Visualize throw coverage and estimate zone-level and whole-system precipitation.
- Save/import projects for later editing.

## What this should be built with

Yes — this should be an **HTML5 web application**.

Recommended MVP stack:
- **Frontend:** React + TypeScript + Vite (single-page HTML5 app)
- **Mapping/imagery:** MapLibre GL JS (primary) or Leaflet
- **Geometry:** Turf.js for distance/area/coverage calculations
- **State/model validation:** Zod for project/catalog schema validation
- **Storage:** Browser local files (JSON export/import) plus optional localStorage autosave

Optional later backend (not required for MVP):
- Node.js API for shared team projects, user accounts, and hosted catalog sync

## MVP Scope

1. **Catalog import & lookup**
   - Support CSV import for sprinkler heads and nozzle performance tables.
   - Support pressure-adjusted interpolation from manufacturer flow/radius specs.
2. **Map-based planning canvas**
   - Background satellite image layer.
   - Add/edit sprinkler points.
   - Assign head model, nozzle model, pressure, arc, and zone.
3. **Coverage visualization**
   - Draw throw arcs/circles from nozzle radius and arc angle.
4. **Precipitation analysis**
   - Per-sprinkler precipitation estimate.
   - Zone aggregate precipitation estimate.
5. **Persistence**
   - Save project JSON and import later.



## Map layers

The planning canvas can display real web map tiles in addition to the original simplified sketch surface. Use the **Map layer** buttons above the canvas to switch between:

- **Satellite** — turns on Esri World Imagery tiles for aerial context.
- **Simplified** — turns on OpenStreetMap tiles when a lighter basemap is preferred.
- **Sketch** — turns imagery off and keeps the offline-friendly schematic yard canvas for rough layouts or when map tiles are unavailable.

Satellite is selected by default for new projects. Sprinklers placed on satellite or simplified map layers are stored with latitude/longitude plus fallback canvas percentages, so saved project JSON keeps the map view and sprinkler locations portable.

## Default CSV catalogs

The repository includes starter CSV catalogs under `data/default-catalogs/` for Hunter PGP-ADJ rotor nozzle performance data from Hunter Industries' PGP-ADJ PDF (`https://www.hunterirrigation.com/print/pdf/node/861`).

Available starter files:

- `data/default-catalogs/hunter_pgp_adj_all.csv` — all included PGP-ADJ blue, red, and grey low-angle nozzle rows.
- `data/default-catalogs/hunter_pgp_adj_blue.csv` — PGP-ADJ blue nozzles.
- `data/default-catalogs/hunter_pgp_adj_red.csv` — PGP-ADJ red nozzles.
- `data/default-catalogs/hunter_pgp_adj_grey_low_angle.csv` — PGP-ADJ grey low-angle nozzles.

The web app exposes these starter catalogs in the Catalog Lookup panel with both an **Import** button for immediate use and a **Download CSV** link so the same files can be saved locally and imported through the standard CSV file picker. CSV columns follow the v1 import schema, with optional precipitation columns preserved from the manufacturer table.

## Data Strategy

Start with **imported CSV catalogs** so the tool works offline and users can bring their preferred manufacturer data.

Later, optionally add:
- Online catalog plugins (manufacturer APIs, curated hosted datasets).
- Versioned built-in catalog snapshots.

## Should sprinkler models be CSV or JSON?

Use **both**, with clear roles:
- **CSV for import/editing** from manufacturer tables and spreadsheets.
- **JSON as the canonical in-app format** after import for fast lookups, validation, and versioning.

Recommended pattern:
1. User imports manufacturer CSV files.
2. App validates + normalizes rows.
3. App stores normalized catalog as versioned JSON internally (and optionally exports it).

Why this split works:
- CSV is easiest for vendor data and manual maintenance.
- JSON is better for nested metadata, schema evolution, and deterministic app behavior.


## Core formula used in MVP

For rotor/spray style design, precipitation (in/hr) at area scale:

`PR = (96.3 * total_flow_gpm) / irrigated_area_sqft`

Per-head contribution can be estimated by sector-adjusted area:

- `throw_area_sqft = (arc_degrees / 360) * π * radius_ft^2`
- `head_pr_in_hr = (96.3 * flow_gpm) / throw_area_sqft`

> Note: Real-world DU (distribution uniformity), overlap, wind, and soil intake rates should be accounted for in future releases.


## Recommended phased implementation plan

Use a staged rollout so core value ships early:

1. **Phase 0:** bootstrap app shell + data types + CI.
2. **Phase 1:** CSV catalog import + pressure interpolation engine.
3. **Phase 2:** map editing + sprinkler/zone assignment + persistence.
4. **Phase 3:** throw overlays + precipitation analysis + warnings.
5. **Phase 4:** reporting, QA hardening, and beta release.

Detailed phase-by-phase tasks and exit criteria are in `docs/implementation-phases.md`.
