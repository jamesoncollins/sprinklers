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
   - Assign head model, nozzle model, rated pressure, pressure-regulation behavior, arc, and zone-level operating pressure / measured supply flow.
3. **Coverage visualization**
   - Draw throw arcs/circles from nozzle radius and arc angle.
4. **Precipitation analysis**
   - Per-sprinkler precipitation estimate using zone-pressure-adjusted flow and throw for non-pressure-regulating heads.
   - Zone aggregate precipitation estimate.
5. **Persistence**
   - Save project JSON and import later.


## Satellite canvas background

The Planning Canvas can use either the offline yard sketch grid or live imagery tiles. Enter a property address and click **Look Up Address** to geocode it and automatically switch to imagery, or manually select **Satellite imagery** and enter the property's center latitude/longitude. The imagery source selector currently offers Esri World Imagery as the global default, Esri World Imagery Clarity as an alternate archive-style source, and USGS Imagery Only for U.S. properties. Winter/leaf-off imagery is not guaranteed by any no-key public layer; try the alternate source list when the default capture is too leafy or low-detail.

Use **Ctrl+drag** on the canvas to pan the planning view, use the mouse **scroll wheel** over the canvas to zoom around the pointer, and click **Reset Pan / Zoom** to return to the original centered view. These settings are saved in exported project JSON under `site.satellite` and `site.mapView`, so imported projects restore the same imagery source and map view.

For uploaded images or blank sketches, use **Calibrate by Two Points** in the Distance scale controls: click two known points on the canvas and enter their real-world separation in feet. Sprinkler throw overlays then use that manual feet-per-pixel scale, while satellite imagery automatically derives its scale from the imagery latitude and zoom. Manual calibration data is saved in exported project JSON under `site.distanceScale`.

## Default CSV catalogs

The repository keeps one growing built-in CSV catalog at `data/default-catalogs/default_sprinkler_catalog.csv`. It currently contains Hunter PGP-ADJ rotor nozzle performance data from Hunter Industries' PGP-ADJ PDF (`https://www.hunterirrigation.com/print/pdf/node/861`), including the blue, red, and grey low-angle nozzle rows that used to live in separate starter files.

The web app auto-loads this built-in catalog on startup. Users can still add or replace catalog data by importing their own CSV files. CSV columns follow the v1 import schema, including `pressure_regulating` (`true`/`false`) so pressure-regulated models hold rated flow/throw while non-regulating models scale by zone pressure. Optional precipitation columns are preserved from the manufacturer table.

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

`PR = (96.3 * effective_total_flow_gpm) / effective_irrigated_area_sqft`

Per-head contribution can be estimated by sector-adjusted area:

- `pressure_scale = 1` for pressure-regulating heads, otherwise `sqrt(zone_pressure_psi / rated_pressure_psi)`
- `effective_flow_gpm = rated_flow_gpm * pressure_scale`
- `effective_radius_ft = rated_radius_ft * pressure_scale`
- `throw_area_sqft = (arc_degrees / 360) * π * effective_radius_ft^2`
- `head_pr_in_hr = (96.3 * effective_flow_gpm) / throw_area_sqft`

> Note: Real-world DU (distribution uniformity), overlap, wind, and soil intake rates should be accounted for in future releases.


## Recommended phased implementation plan

Use a staged rollout so core value ships early:

1. **Phase 0:** bootstrap app shell + data types + CI.
2. **Phase 1:** CSV catalog import + pressure interpolation engine.
3. **Phase 2:** map editing + sprinkler/zone assignment + persistence.
4. **Phase 3:** throw overlays + precipitation analysis + warnings.
5. **Phase 4:** reporting, QA hardening, and beta release.

Detailed phase-by-phase tasks and exit criteria are in `docs/implementation-phases.md`.
