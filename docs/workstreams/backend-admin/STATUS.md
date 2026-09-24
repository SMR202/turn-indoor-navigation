# backend-admin workstream

Last meaningful update: 2026-09-24

## Objective

Author and publish trusted venue packages when the product needs persistence.

## Current state / what changed

No apps/api, apps/admin, database or migration tooling yet. Bundled data serves M0–M2. TypeScript API/PostgreSQL/PostGIS are candidates, not adopted.

## Validation performed

Repository/code review only. No physical experiment or subsystem execution claimed.

## Important decisions / dependencies

[Architecture](../../ARCHITECTURE.md), [roadmap](../../ROADMAP.md), [reuse registry](../../../research/REUSE_REGISTRY.md), [platform ADR](../../../decisions/0002-product-platform-foundation.md), [venue ADR](../../../decisions/0003-venue-contracts-and-offline-navigation.md).

## Known issues / attempted approaches

Do not create empty services. Real access/owners/hosting unknown; auth and migration workflow required before deployed admin.

## Next action

Implement local venue validation/authoring first; then decide smallest authenticated publication workflow and persistence in ADR.
