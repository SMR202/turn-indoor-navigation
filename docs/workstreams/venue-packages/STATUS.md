# venue-packages workstream

Last meaningful update: 2026-09-24

## Objective

Versioned portable buildings, usable locally and later downloadable.

## Current state / what changed

packages/venue-model implements schema v1, ID/ref/bounds/connector validation and original synthetic package. See ADR-0003 and docs/VENUE_PACKAGES.md.

## Validation performed

Four venue tests pass: serialization, unsupported versions/duplicate IDs/references, invalid edge lengths/floor references, connector requirements and stair access. See [foundation status](../foundation/STATUS.md).

## Important decisions / dependencies

[Architecture](../../ARCHITECTURE.md), [roadmap](../../ROADMAP.md), [reuse registry](../../../research/REUSE_REGISTRY.md), [platform ADR](../../../decisions/0002-product-platform-foundation.md), [venue ADR](../../../decisions/0003-venue-contracts-and-offline-navigation.md).

## Known issues / attempted approaches

No cache/updater yet. No wall-clearance/polygon-validity proof. Runtime validation rejects unsupported versions; migration fixtures required for future changes.

## Next action

Add fixture import/validation command and geometry checks, then authenticated download/atomic cache with last-good rollback.
