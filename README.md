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
   - Assign head model, nozzle model, rated pressure, pressure-regulation behavior, arc, and zone-level static pressure / open-flow supply / water share factor.
3. **Coverage visualization**
   - Draw throw arcs/circles from nozzle radius and arc angle, plus rectangular nozzle throws from catalog width x length data and head-location offsets. The orientation control sets the left-hand lock angle for arcs and the forward rectangle direction for rectangular throws.
4. **Precipitation analysis**
   - Per-sprinkler precipitation estimates use each zone's solved operating pressure and actual head flow from the static-pressure/open-flow supply curve.
   - Zone aggregate precipitation estimate, including a zone water share factor for intentionally longer or shorter runtimes.
   - Combined precipitation map contours use a project-level sampling grid setting, defaulting to 1 ft cells for faster rendering.
5. **Persistence**
   - Save project JSON and import later.


## How to use the tool

1. **Start with a site.** Use the Planning Canvas with the offline grid, upload/blank sketch workflow, or switch to satellite imagery by entering an address or latitude/longitude. Calibrate uploaded images with two known points so throw distances are scaled in feet.
2. **Load sprinkler data.** The app auto-loads the built-in CSV catalog, and you can import additional manufacturer CSV rows when you need a different head or nozzle. Pick the manufacturer, head model, nozzle model, and rated catalog pressure for each sprinkler.
3. **Create zones.** Add one zone per valve/runtime group. For each zone, enter static pressure, optional dynamic pressure, open-flow supply, and water share factor. Static pressure is the no-flow gauge reading, open-flow supply is the estimated source flow at 0 PSI, and dynamic pressure is an optional measured gauge reading while that zone is actually running.
4. **Place and orient sprinklers.** Add sprinklers to the canvas, assign each one to a zone, set its arc or rectangular throw orientation, and use the coverage overlay to check head-to-head spacing and dry spots. Arc orientation is the left-hand lock angle; rectangular orientation points forward from the head.
5. **Read the analysis.** Zone cards and summary tables report solved operating pressure, total actual flow, per-head effective throw, and precipitation rates. Use these values to rebalance nozzles, split overloaded zones, or adjust runtimes.
6. **Save your work.** Export project JSON to preserve site settings, map view, imported catalog choices, zones, sprinklers, and analysis-related settings for later editing.

## How the pressure and precipitation model works

The tool treats pressure as a zone-level hydraulic balance rather than assuming every head receives the static pressure listed on a hose bib gauge. Each zone can use one of three pressure paths:

- **Measured dynamic pressure wins when present.** If you enter dynamic pressure for a zone, the app uses that pressure directly, capped at static pressure, because it represents the best real-world measurement of that zone while running.
- **Calculated operating pressure is used when static pressure and open-flow supply are available.** The app models source supply as `supply_gpm = open_flow_gpm * sqrt(1 - operating_pressure_psi / static_pressure_psi)`. It then solves for the operating pressure where supply equals the sum of all heads' demand at that same pressure. The displayed pressure drop is the difference between zone static pressure and this solved operating pressure.
- **Static pressure is the fallback.** If open-flow supply is missing, the zone has no heads, or no demand can be calculated, the app uses static pressure as the operating pressure so the planner remains usable while data is incomplete.

Head demand changes with pressure. Unregulated heads scale flow and throw by `sqrt(operating_pressure_psi / rated_pressure_psi)`. Pressure-regulated heads use the same square-root relationship below their regulator pressure, but cap their pressure scale at the regulator/rated pressure so they do not keep gaining flow and radius above the regulator setting. To find the operating point, the solver bisects the range from 0 PSI to static pressure: at each midpoint it compares available source supply with summed head demand, keeps the half of the range containing the intersection, and repeats until the supply and demand curves meet. The solved operating pressure then drives actual flow, effective arc or rectangular coverage area, and calculated precipitation.

Precipitation is calculated from actual water volume over actual coverage area: `PR = (96.3 * effective_total_flow_gpm) / effective_irrigated_area_sqft`. Manufacturer precipitation values from catalogs are kept as nominal reference metadata because they often assume a particular square or triangular spacing layout; the app's analysis uses solved pressure, effective flow, geometry, and the normalized distribution model instead. Zone water share is a runtime multiplier for comparing zones that are intentionally run longer or shorter than the base schedule.

The point-map spreading factor controls how water is distributed within a head's throw for heat-map samples. Arc and rotor throws use `S(rho) = 1 / (1 + (rho / 0.287)^2.48)`, where `rho` is distance from the head divided by effective radius. The `0.287` spreading factor comes from the default Hunter MP2000 radial profile, can be adjusted from the Project panel, and makes precipitation taper with distance; the app numerically normalizes the profile so the integral over the sector still recovers the solved head flow. Rectangular throws use a normalized `1 / distance` spread, with a minimum distance equal to 8% of the larger throw dimension to keep points near the head finite.

## Satellite canvas background

The Planning Canvas can use either the offline yard sketch grid or live imagery tiles. Enter a property address and click **Look Up Address** to geocode it and automatically switch to imagery, or manually select **Satellite imagery** and enter the property's center latitude/longitude. The imagery source selector currently offers Esri World Imagery as the global default, Esri World Imagery Clarity as an alternate archive-style source, and USGS Imagery Only for U.S. properties. Winter/leaf-off imagery is not guaranteed by any no-key public layer; try the alternate source list when the default capture is too leafy or low-detail.

Use **Ctrl+drag** on the canvas to pan the planning view, use the mouse **scroll wheel** over the canvas to zoom around the pointer, and click **Reset Pan / Zoom** to return to the original centered view. These settings are saved in exported project JSON under `site.satellite` and `site.mapView`, so imported projects restore the same imagery source and map view.

For uploaded images or blank sketches, use **Calibrate by Two Points** in the Distance scale controls: click two known points on the canvas and enter their real-world separation in feet. Sprinkler throw overlays then use that manual feet-per-pixel scale, while satellite imagery automatically derives its scale from the imagery latitude and zoom. Manual calibration data is saved in exported project JSON under `site.distanceScale`. Combined precipitation contour interval, sampling grid, and range decay scale settings are saved under `site.precipitationContourInterval`, `site.precipitationGridCellFeet`, and `site.radialDecayScale`.

## Default CSV catalogs

The repository keeps one growing built-in CSV catalog at `data/default-catalogs/default_sprinkler_catalog.csv`. It currently contains Hunter PGP-ADJ rotor nozzle performance data from Hunter Industries' PGP-ADJ PDF (`https://www.hunterirrigation.com/print/pdf/node/861`), Rain Bird 1800 Series spray body entries with R-VAN rotary nozzle performance data including rectangular strip rotary nozzles from Rain Bird's R-VAN Tech Spec PDF (`https://www.rainbird.com/sites/default/files/media/documents/2018-10/R-VAN-TechSpec-27AUG18.pdf`), Rain Bird 5000/5000 Plus Series rotor entries for standard-angle Rain Curtain nozzles (`1.5` through `8.0`) and low-angle Rain Curtain nozzles (`1.0-LowAngle` through `3.0-LowAngle`) from Rain Bird's 5000/5000 Plus Series nozzle chart (`https://www.rainbird.com/sites/default/files/media/documents/2017-07/chart_5000.pdf`), plus 5000-MPR-25/30/35 matched precipitation nozzle families from the Sprinkler Warehouse performance chart (`https://www.sprinklerwarehouse.com/amfile/file/download/file/8EpKjmbyVYStRJFlTdtm02QSTOdgyKpV/product/28260/`) aligned with that Rain Bird chart, and Rain Bird 1800 Series spray body entries with MPR fixed-spray rectangular strip nozzles from Rain Bird's MPR spray nozzle performance charts (`https://www.rainbird.com/sites/default/files/media/documents/2020-09/mpr-spray-nozzle-performance-charts_0.pdf`).

The web app auto-loads this built-in catalog on startup. Users can still add or replace catalog data by importing their own CSV files. CSV columns follow the v1 import schema, including `pressure_regulating` (`true`/`false`) so pressure-regulated models hold rated flow/throw above their regulator pressure while all heads are evaluated at the zone's solved operating pressure rather than static pressure. Optional `pattern_type=rectangle`, `width_ft`, `head_offset_x`, and `head_offset_y` columns support rectangular strip nozzles; for rectangle rows, `radius_ft` stores the rectangle length, `width_ft` stores the rectangle width, and offsets locate the sprinkler head inside the rectangle as 0-1 fractions from the back-left corner. Optional manufacturer precipitation columns such as `precip_in_hr`, `precip_square_in_hr`, and `precip_triangle_in_hr` are preserved as nominal reference metadata for lookup display. Square and triangular catalog PR values assume those spacing layouts. Analysis uses calculated precipitation from effective flow and actual coverage area. Arc/rotor point-map precipitation applies a normalized radial distribution profile derived from measured Hunter MP2000 data, while rectangular throws continue to use the normalized rectangular distance-spreading model.

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
- Arc throw: `throw_area_sqft = (arc_degrees / 360) * π * effective_radius_ft^2`
- Rectangle throw: `throw_area_sqft = effective_length_ft * effective_width_ft`
- `head_pr_in_hr = (96.3 * effective_flow_gpm) / throw_area_sqft`
- `zone_adjusted_pr_in_hr = zone_base_pr_in_hr * zone_water_share_factor`
- `overall_pr_in_hr = (96.3 * sum(zone_effective_flow_gpm * zone_water_share_factor)) / total_irrigated_area_sqft`
- Zone analysis also reports calculated per-head minimum, average, and maximum PR to help compare runtime needs across zones and spot heads whose precipitation rate does not match the rest of the zone.

Manufacturer precipitation values are treated as optional nominal catalog references only. They may reflect a vendor's default arc or square/triangular spacing assumption, so they are displayed during lookup when available but are not the authoritative point-map input. The point-map input is effective flow, coverage geometry, and a normalized radial distribution framework for arc/rotor throws. The default profile uses `S(rho) = 1 / (1 + (rho / 0.287)^2.48)` and computes the normalization integral numerically so the sector-area integral recovers each sprinkler's effective flow.

> Note: Real-world DU (distribution uniformity), overlap, wind, and soil intake rates should be accounted for in future releases.


## Recommended phased implementation plan

Use a staged rollout so core value ships early:

1. **Phase 0:** bootstrap app shell + data types + CI.
2. **Phase 1:** CSV catalog import + pressure interpolation engine.
3. **Phase 2:** map editing + sprinkler/zone assignment + persistence.
4. **Phase 3:** throw overlays + precipitation analysis + warnings.
5. **Phase 4:** reporting, QA hardening, and beta release.

Detailed phase-by-phase tasks and exit criteria are in `docs/implementation-phases.md`.
