# TURN Floor GeoJSON v1 (map-module hand-off)

This is the format a floor-plan conversion tool (for example the image → polygon module) produces for TURN. One file describes one floor. TURN Studio imports it, derives anything missing, builds the walking graph and validates the result before it can be published. Implementation: [`importFloorGeoJson`](../packages/venue-model/src/geojson-import.ts).

## File shape

```json
{
  "type": "FeatureCollection",
  "turn": { "units": "pixels", "metresPerPixel": 0.02, "imageHeight": 1800 },
  "features": [ ... ]
}
```

- `turn.units`: `"pixels"` (image coordinates, x right, y **down**) or `"metres"` (x right, y up). With pixels, give `metresPerPixel` (measure one known wall or dimension) and `imageHeight` (so y can be flipped).
- Polygons are a single outer ring; holes are ignored in v1.

A complete example (pixel units, four spaces, three doors, one explicit place) is in [examples/sample-floor.geojson](examples/sample-floor.geojson). In TURN Studio: Venue → Map → drop the file.

## Features

| Geometry   | `properties.kind`                                               | Required properties                                                                  | Meaning                                                                                                                    |
| ---------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Polygon    | `room` (default), `circulation`, `stairs`, `outdoor`, `fixture` | `name` recommended, `category` optional (e.g. `food`, `restroom`, `shop`, `meeting`) | A space. Corridors and halls should be `circulation`. Named rooms become destinations; `poi` points add more.              |
| Point      | `door`                                                          | `width` optional (same units as coordinates; default 0.9 m)                          | An opening on the boundary between two spaces. **Doors are what make the map routable.** Put the point on the shared edge. |
| LineString | `wall`                                                          | –                                                                                    | Optional. When no walls are given, walls are derived from room outlines and cut open at doors.                             |
| LineString | `window`                                                        | –                                                                                    | Optional, drawn on the map.                                                                                                |
| Point      | `poi`                                                           | `name`, `category`                                                                   | Optional explicit destination (for example a kiosk inside a hall).                                                         |

## What TURN does on import

1. Converts pixels to metres and flips y.
2. Derives walls from room edges (shared edges once) unless walls are supplied, and cuts door-width gaps.
3. Places a node inside every room and on every door, connects each room to its doors and each door to the other doors of the same room, and drops any link that would cross a wall.
4. Creates destinations from named rooms (corridors excluded) and from `poi` points.
5. Reports rooms, walls, doors, places, graph size, unreachable places and warnings. Validation must pass before publishing.

## Tips for the conversion tool

- Snap shared edges between neighbouring rooms to identical coordinates.
- Emit a `door` point for every opening, even when walls are not emitted.
- Keep names human ("Kitchen", "Meeting Room A"); TURN infers categories from names when `category` is missing.
- Multi-floor: one file per floor for now.
