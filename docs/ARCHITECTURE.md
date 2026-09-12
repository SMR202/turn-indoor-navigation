# Proposed architecture
Status: PROPOSED; no framework or production stack selected.

Floor plan → scale/alignment → walkable geometry + POIs + floor connectors → reviewed venue map + routing graph.
Native sensor adapters → timestamped observations → deterministic replay/preprocessing → PDR + optional magnetic/BLE/Wi-Fi observations → fusion with map constraints → pose/floor/uncertainty → routing and map UI.

## Boundaries
- Acquisition: permission lifecycle, capability inventory, raw timestamp/unit metadata.
- Localization: platform-neutral algorithms where feasible; replayable without a phone.
- Mapping: versioned geometry and graph, explicit coordinate transform to sensor/venue coordinates.
- Routing/UI: consume map/pose contracts; do not own signal processing.
- Data/experiments: immutable input references and separate derived results; no backend chosen.

## Proposed contracts to validate
Observation: session ID, monotonic timestamp, sensor type, units, device frame, calibration state.
Venue map: version, floor ID, metric coordinate frame, origin/scale, walls, doors, POIs and permitted floor connectors.
Pose: timestamp, x/y in metres, floor, heading convention, uncertainty and tracking status.
Replay result: dataset hash, algorithm revision, configuration, metrics and limitations.

## Open decisions
Native versus cross-platform UI, fusion approach, map representation, offline packaging, initial-position mechanism and venue surveying workflow await audit/experiments.
