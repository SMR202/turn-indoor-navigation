# Venue packages workstream

Updated: 2026-10-28.

## Several private venues; TURN-Mapper floors added — 2026-10-28

IMPLEMENTED: `npm run venue:add -- <package | folder>` validates packages (schema, wall crossings, every anchor-to-place route), prints their scale notes and stores them as `work/private/venues/<venueId>.json` (ignored) without touching the home plan. On every start the API serves the home plan and every stored package LAN-only (`syncPrivateVenues`): a new file adds its venue, a changed revision replaces the published map in place (beacon setups kept), broken files and ids of shared venues are skipped. TURN-Mapper packages are used unchanged (schema v1, metres, x right / y up). [Workflow](../../LOCAL_VENUES.md).

EXPERIMENT RESULT (this computer): the 14 floors of a TURN-Mapper export of a university campus (private, outside Git) validate with no wall crossings and every route found; the API lists them beside the home plan and the demo venue; in the browser one floor opened with its room labels and drew a route. FACT (export provenance): four floors have a scale from measured room sizes, ten an estimate; seven floors left out 1–2 destinations not connected to the map graph. Those are fixed in TURN-Mapper by its maintainer, not by editing JSON. Not yet opened on a phone or walked on site.

## Current state

Schema v1 gains backward-compatible optional/default room labels/polygons, windows, plan-derived provenance and guided test courses. Metric geometry retains exact feet/inch conversion. `venue:load` validates and bundles a private local package; postinstall prepares local selection or public synthetic fallback. Source/derived private artifacts remain ignored. [Workflow](../../LOCAL_VENUES.md).

## Validation / limitations

Tests cover conversion, course/anchor agreement, bounds and proper graph/wall intersections. `venue:validate` additionally checks all anchor-to-POI routes and test wall intersections. These do not establish as-built geometry, furniture/clearance, tangent/collinear intersections or accessibility. Unlabelled wall thicknesses/offsets stay explicit in package provenance.

## Next action

Verify inferred geometry against on-site measurements before treating routes as surveyed. Transfer private packages explicitly between machines. Do not commit plans/derived maps to the public repository. Download/cache updates remain future work.
