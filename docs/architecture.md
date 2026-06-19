# Architecture Draft

## Delivery model

- **Primary target:** HTML5 single-page web app.
- **MVP deployment:** static hosting (no backend required).
- **Offline-friendly:** works with the built-in default CSV, user-provided CSV catalogs, and JSON project files. Address lookup and satellite imagery require network access.

## High-level components

1. **Catalog Service**
   - Loads one or more CSV files with sprinkler/nozzle performance rows.
   - Exposes lookup by manufacturer/model/nozzle and pressure.
   - Interpolates flow/radius between known pressure points.

2. **Project Model**
   - Stores sites, zones, sprinklers, and analysis results.
   - Serialized as portable JSON.

3. **Map Canvas**
   - Renders satellite imagery basemap from geocoded address or manual coordinates.
   - Enables marker placement/editing for sprinklers.
   - Renders throw sectors and zone coloring.

4. **Analysis Engine**
   - Solves each zone's operating pressure from static pressure, open-flow supply, and sprinkler demand.
   - Computes per-sprinkler actual flow, throw, and precipitation from solved operating pressure.
   - Aggregates per-zone flow and precipitation.

## User workflow and documentation contract

User-facing documentation in `README.md` is the canonical quick-start guide for operating the planner. Any feature that changes site setup, catalog import, sprinkler placement, zone configuration, hydraulic solving, precipitation analysis, persistence, or reporting should update both the relevant architecture section here and the matching user workflow section in the README in the same change. This keeps the tool instructions aligned with the implementation as the model evolves.

Current workflow summary:

1. Select a site background: offline grid/sketch, calibrated uploaded image, or geocoded/manual satellite imagery.
2. Load sprinkler/nozzle data from the built-in CSV catalog or imported manufacturer CSV files.
3. Create zones and enter pressure inputs: static pressure, optional measured dynamic pressure, open-flow supply, and water share.
4. Place sprinklers, assign catalog selections and zones, set arc or rectangular orientation, then review throw overlays.
5. Use zone and project analysis outputs to inspect solved operating pressure, actual flow, throw geometry, and precipitation.
6. Export/import project JSON for persistence.

## Hydraulic and precipitation architecture

Pressure is solved at the zone level and then applied to every sprinkler in that zone. The persisted project stores user-entered inputs and analysis outputs separately so exported JSON remains editable while also restoring the most recent calculated view.

### Zone pressure inputs

- `pressurePsi`: static pressure, meaning the no-flow gauge pressure available to the zone.
- `measuredFlowGpm`: open-flow supply estimate at 0 PSI. This anchors the supply curve used when no measured dynamic pressure is provided.
- `dynamicPressurePsi` / `operatingPressureOverridePsi`: optional measured pressure while the zone is running. When present, it overrides the calculated supply/demand solve and is capped at static pressure.
- `waterShare`: runtime multiplier used when aggregating zone precipitation for intentionally longer or shorter runtimes.

### Supply/demand solve

The Analysis Engine computes a zone operating pressure with this priority order:

1. If static pressure is missing or invalid, return zero pressure and zero flow.
2. If measured dynamic pressure is present, use `min(staticPressurePsi, dynamicPressurePsi)` and compute each head at that pressure.
3. If open-flow supply, active sprinklers, or demand are missing, fall back to static pressure.
4. Otherwise, solve the intersection of source supply and head demand by bisection between 0 PSI and static pressure.

The current source supply curve is:

```text
supply_gpm = open_flow_gpm * sqrt(1 - operating_pressure_psi / static_pressure_psi)
```

Sprinkler demand is the sum of each head's pressure-adjusted flow at the candidate operating pressure. Unregulated heads use:

```text
pressure_scale = sqrt(operating_pressure_psi / rated_pressure_psi)
actual_flow_gpm = rated_flow_gpm * pressure_scale
actual_radius_ft = rated_radius_ft * pressure_scale
```

Pressure-regulated heads use the same square-root relationship below their regulator pressure and cap the input pressure at the regulator/rated pressure above that point:

```text
pressure_scale = sqrt(min(operating_pressure_psi, regulator_pressure_psi) / regulator_pressure_psi)
```

### Precipitation calculation

After the zone operating pressure is known, the engine updates each sprinkler's actual flow and effective throw dimensions. Arc patterns use sector area, rectangular patterns use effective length times effective width, and zone/project precipitation uses actual flow divided by actual irrigated area:

```text
PR_in_hr = (96.3 * effective_total_flow_gpm) / effective_irrigated_area_sqft
zone_adjusted_PR_in_hr = zone_base_PR_in_hr * waterShare
```

Manufacturer precipitation columns remain catalog metadata for lookup display and sanity checks. They do not override calculated precipitation because manufacturer tables may assume a specific spacing pattern, arc, or test layout. Point-map precipitation uses effective flow, geometry, and the normalized distribution model so total distributed water recovers the solved flow for each sprinkler.

## Suggested project JSON structure

```json
{
  "version": 1,
  "site": {
    "name": "Front and Back Yard",
    "address": "123 Main St",
    "imageSource": "satellite",
    "satellite": {
      "latitude": 37.0,
      "longitude": -122.0,
      "zoom": 19
    }
  },
  "zones": [
    { "id": "zone-1", "name": "Front Lawn", "pressurePsi": 45, "measuredFlowGpm": 8, "operatingPressurePsi": 32.7, "totalFlowGpm": 6.72, "waterShare": 1 }
  ],
  "sprinklers": [
    {
      "id": "spk-1",
      "zoneId": "zone-1",
      "lat": 0,
      "lng": 0,
      "headModel": "",
      "nozzleModel": "",
      "pressurePsi": 45,
      "arcDegrees": 180,
      "orientationDegrees": 0,
      "radiusFt": 0,
      "flowGpm": 0,
      "actualFlowGpm": 0
    }
  ]
}
```

`orientationDegrees` stores the sprinkler's left-hand lock angle for arc patterns. `arcDegrees` extends clockwise from that fixed left edge, so increasing or decreasing an arc changes only the right-hand side of the spray pattern. For rectangular patterns, `orientationDegrees` is the forward rectangle direction. The rectangle geometry stores its size plus the sprinkler head's relative location inside the rectangle, so side, center, and corner strip nozzles are all represented by the same generic rectangle model.

## Catalog CSV schema (v1)

- `manufacturer`
- `head_model`
- `nozzle_model`
- `pressure_psi`
- `flow_gpm`
- `radius_ft`
- `arc_degrees` (optional nominal test arc)
- `pattern_type` (optional; defaults to `arc`; use `rectangle` for rectangular throws)
- `width_ft` (required for rectangle patterns; `radius_ft` is interpreted as rectangle length)
- `head_offset_x` / `head_offset_y` (required for rectangle patterns; 0-1 relative head location from the rectangle's back-left corner, where x runs left-to-right along length and y runs back-to-front along width)
- `precip_in_hr` / `precipitation_in_hr` / `precip_default_in_hr` (optional manufacturer nominal PR reference)
- `precip_square_in_hr` / `precip_square` / `square_spacing_pr_in_hr` (optional manufacturer square-spacing PR reference)
- `precip_triangle_in_hr` / `precip_triangular_in_hr` / `triangular_spacing_pr_in_hr` (optional manufacturer triangular-spacing PR reference)
- `notes`

Optional manufacturer PR fields are preserved as catalog metadata for display and sanity checks. Square and triangular values assume those spacing patterns, so they do not replace calculated precipitation. Area-scale PR is derived from solved actual flow and actual sector-adjusted or rectangular coverage area; the point-sampled precipitation heat map applies a normalized `1/r` distance-spreading profile for arc/rotor and rectangular patterns so single-head output is not treated as uniform across the throw.

## Interpolation approach

For selected `(manufacturer, head_model, nozzle_model)`:

- Find nearest lower and upper rows around input pressure.
- If exact pressure exists, use exact row values.
- If bounds exist, linearly interpolate for `flow_gpm`, `radius_ft`, `width_ft` when present, and optional nominal precipitation metadata when both bounds provide the same metadata field.
- If out of range, clamp to nearest pressure row and flag warning.

## Future enhancements

- Head-to-head overlap scoring and DU estimate.
- Soil infiltration and cycle/soak recommendations.
- Pipe sizing and hydraulic pressure loss estimation.
- PDF report export with legends and zone summaries.
- Optional cloud backend for collaboration and shared catalogs.


## Catalog storage decision

- **External interchange:** CSV (manufacturer/user-provided).
- **Internal canonical model:** JSON (`CatalogV1`) generated from CSV import.

### Rationale

- CSV is the best interoperability format for irrigation spec tables.
- JSON enables strict typing, schema validation, indexing, and forward-compatible migrations.

### Suggested `CatalogV1` shape

```json
{
  "version": 1,
  "models": [
    {
      "manufacturer": "Hunter",
      "headModel": "PGP-ADJ",
      "nozzleModel": "Blue-2.0",
      "points": [
        {
          "pressurePsi": 25,
          "flowGpm": 1.4,
          "radiusFt": 33,
          "nominalPrecipitationInHr": { "square": 0.28, "triangular": 0.32 }
        },
        {
          "pressurePsi": 35,
          "flowGpm": 1.7,
          "radiusFt": 33,
          "nominalPrecipitationInHr": { "square": 0.32, "triangular": 0.37 }
        },
        {
          "pressurePsi": 45,
          "flowGpm": 2.0,
          "radiusFt": 34,
          "nominalPrecipitationInHr": { "square": 0.36, "triangular": 0.42 }
        }
      ]
    }
  ]
}
```
