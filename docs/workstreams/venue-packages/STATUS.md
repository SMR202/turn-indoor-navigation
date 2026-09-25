# Venue packages workstream

Updated: 2026-09-25.

## Current state

Schema v1 gains backward-compatible optional/default room labels/polygons, windows, plan-derived provenance and guided test courses. Metric geometry retains exact feet/inch conversion. `venue:load` validates and bundles a private local package; postinstall prepares local selection or public synthetic fallback. Source/derived private artifacts remain ignored. [Workflow](../../LOCAL_VENUES.md).

## Validation / limitations

Tests cover conversion, course/anchor agreement, bounds and proper graph/wall intersections. `venue:validate` additionally checks all anchor-to-POI routes and test wall intersections. These do not establish as-built geometry, furniture/clearance, tangent/collinear intersections or accessibility. Unlabelled wall thicknesses/offsets stay explicit in package provenance.

## Next action

Verify inferred geometry against on-site measurements before treating routes as surveyed. Transfer private packages explicitly between machines. Do not commit plans/derived maps to the public repository. Download/cache updates remain future work.
