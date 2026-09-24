# Core contracts v1

Sources: [contracts](../packages/contracts/src/index.ts), [venue schema](../packages/venue-model/src/schema.ts). Types are inferred from runtime Zod schemas.

- Observation: schemaVersion/sessionId/source/monotonic timestampSeconds plus discriminated type. Acceleration m/s2 (gravity inclusion explicit), angular velocity rad/s, magnetic µT (calibration explicit), pressure hPa, anchor reference or capability status.
- Pose: venue/revision/floor, x/y, nullable headingRad and horizontalUncertaintyMetres, anchored/tracking/degraded/lost. Null means unknown. Radius is a provisional bound without calibrated coverage.
- Anchor: venue/floor/position/ID/kind and optional marker orientation. Marker orientation is not phone heading. Future QR resolves IDs in trusted installed venue data.
- Route: node endpoints, venue revision, floor-tagged geometry, distance, instructions, stepFree request. Invalid endpoints/unreachable paths are explicit.
- VenuePackage: schemaVersion plus independent content revision.

Device frame: right-handed +x right, +y top, +z out of screen. Adapters must verify/transform platform axes. Venue frame: metres, x right/y up on reviewed plan; floors aligned to a common origin. Heading: radians counter-clockwise from +x in [-π, π]; plan north is not true north. Rendering flips y at the view boundary.

Monotonic seconds start at session origin; wall time/raw clocks stay in manifests. Never compare sessions without a mapping. Replay must report gaps/reversals and avoid wall-clock/randomness effects. Normalization/replay engines are not implemented yet.

Internal development contracts, not a published stable SDK. Reject unknown schema versions. Add pure migrations with old/new fixtures before persisted breaking changes. Content changes bump venue revision; active navigation pins that revision.
