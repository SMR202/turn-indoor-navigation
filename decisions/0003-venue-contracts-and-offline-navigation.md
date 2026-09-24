# ADR-0003: Versioned venue packages and local navigation contracts

Date: 2026-09-24
Status: ACCEPTED

## Context / alternatives

Hardcoded venue screens would couple TURN to a client. Server-dependent routing would fail with indoor connectivity. GeoJSON alone does not define anchors, graph access rules or observation clocks. An elaborate binary/tile archive is premature.

## Decision

Start with validated JSON VenuePackage schema version 1 and an independent content revision. Use a common venue-local Cartesian frame: metres, x right/east on the reviewed plan, y up/north on the plan, heading radians counter-clockwise from +x. Plan north is not necessarily true north. Floors share an author-defined alignment. Rendering flips y only at the view boundary.

Observation and Pose use a session ID and monotonic seconds from session start; wall time is session metadata. Discriminated sensor types bind values, units and frames. Missing heading/uncertainty is explicit, never zero by implication. An anchor references a known venue/floor/position. Future QR payloads resolve IDs against a trusted installed venue revision; arbitrary scanned coordinates are not trusted. Marker orientation is not automatically phone heading.

Venue data includes floors, reviewed walkable polygons/walls/doors, POIs, graph, connectors and anchors. Optional assets/fingerprints are versioned references, not algorithm dependencies. The initial fixture is synthetic and bundled, enabling local map/routing without a server. Download/cache/update support follows: validate a complete new package before atomic activation, preserve last-good data on failure, pin active navigation to one revision, and verify asset integrity. That updater is planned, not implemented.

The routing API accepts a validated venue and graph-node endpoints plus step-free preference, returns typed success/unreachable/invalid-endpoint results, geometry, distance and floor-transition instructions. It runs without UI or network. Graph review establishes walkability; graph routing alone does not prove wall clearance. Automatic floor-plan extraction must emit the same human-reviewed model.

## Consequences / revisit

Schema v1 is an internal development contract, not a published compatibility guarantee. Reject unknown schema versions; add explicit migrations and fixtures before changing persisted versions. Content revision changes do not require schema changes. QR, live acquisition, fusion, SDK packaging and package download are subsequent slices. Revisit after a licensed pilot floor and external app interface are available.
