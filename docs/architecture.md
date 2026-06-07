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
   - Computes per-sprinkler throw and precipitation.
   - Aggregates per-zone flow and precipitation.

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
    { "id": "zone-1", "name": "Front Lawn", "pressurePsi": 45, "measuredFlowGpm": 8, "waterShare": 1 }
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
      "flowGpm": 0
    }
  ]
}
```

`orientationDegrees` stores the sprinkler's left-hand lock angle. `arcDegrees` extends clockwise from that fixed left edge, so increasing or decreasing an arc changes only the right-hand side of the spray pattern.

## Catalog CSV schema (v1)

- `manufacturer`
- `head_model`
- `nozzle_model`
- `pressure_psi`
- `flow_gpm`
- `radius_ft`
- `arc_degrees` (optional nominal test arc)
- `precip_in_hr` / `precipitation_in_hr` / `precip_default_in_hr` (optional manufacturer nominal PR reference)
- `precip_square_in_hr` / `precip_square` / `square_spacing_pr_in_hr` (optional manufacturer square-spacing PR reference)
- `precip_triangle_in_hr` / `precip_triangular_in_hr` / `triangular_spacing_pr_in_hr` (optional manufacturer triangular-spacing PR reference)
- `notes`

Optional manufacturer PR fields are preserved as catalog metadata for display and sanity checks. They do not replace calculated precipitation, which is derived from effective flow and actual sector-adjusted coverage area.

## Interpolation approach

For selected `(manufacturer, head_model, nozzle_model)`:

- Find nearest lower and upper rows around input pressure.
- If exact pressure exists, use exact row values.
- If bounds exist, linearly interpolate for `flow_gpm`, `radius_ft`, and optional nominal precipitation metadata when both bounds provide the same metadata field.
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
