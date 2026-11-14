# mapping workstream

Last meaningful update: 2026-11-14

## Mapping studio — 2026-11-14 ([Plan 005](../../../plans/active/005-turn-masterplan-excellence.md) §9)

IMPLEMENTED: TURN Studio → Map → **Draw or trace a floor** (`apps/console/src/pages/PlanEditor.tsx`): a plan picture under the sheet (kept in the browser), scale from one known distance, rectangle and polygon rooms, doors that snap to walls, places, corner / edge / straight-line snapping, move and reshape, undo and redo, an autosaved draft, live checks (rooms without doors, doors off walls, missing names, missing scale, missing corridor), and Build through the ordinary importer. **Detect rooms** (`venue-model/detect-rooms.ts`) finds enclosed areas in the picture, the corridor and a door at each opening. **Reshape** loads an existing floor into the editor (`floorToDraft`). The importer now adds a node inside every inward corner, so L- and U-shaped corridors route round the corner.

Validation: 29 venue-model tests (detection on synthetic bitmaps, draft checks, snapping, round trip of the demo floor, a U-shaped corridor). End to end in a headless browser: a made-up 40 × 25 m plan picture, scale set from one wall, 8 rooms and 8 doors detected, rooms named, floor built for the Pier Offices demo venue and validated (7 places, all reachable).

Limits: detection has only seen clean synthetic plans. Shaded plans, heavy furniture lines, missing walls and photographed plans will need hand correction or TURN-Mapper. Floors drawn separately line up only if their pictures share size and position; there is no alignment view yet. Reshaping a floor rebuilds its walls from room outlines (free-standing walls and windows are lost; the editor warns). FAST floors stay with TURN-Mapper and are not hand-edited.

Next: try the editor on a real plan the owner may use (home plan, locally only), then DXF import and a floor-alignment view.

## Objective

Reliable human-reviewed venue authoring, then CV assistance.

## Current state / what changed

packages/venue-model contains synthetic polygons, walls, POIs and reviewed graph shape. No upload/editor/CV code.

## Validation performed

Repository/code review only. No physical experiment or subsystem execution claimed.

## Important decisions / dependencies

[Architecture](../../ARCHITECTURE.md), [roadmap](../../ROADMAP.md), [reuse registry](../../../research/REUSE_REGISTRY.md), [platform ADR](../../../decisions/0002-product-platform-foundation.md), [venue ADR](../../../decisions/0003-venue-contracts-and-offline-navigation.md).

## Known issues / attempted approaches

No real plan/scale/rights supplied. Automated extraction deferred; original CV vision remains on roadmap.

## Next action

Add geometry validation for nodes/edges against walkable polygons/walls, with doorway fixtures, before importing a licensed real floor.
