# mapping workstream

Last meaningful update: 2026-09-24

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
