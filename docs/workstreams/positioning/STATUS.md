# positioning workstream

Last meaningful update: 2026-09-24

## Objective

One localization engine emits authoritative pose from modular inputs.

## Current state / what changed

packages/contracts defines Observation/Pose and ObservationSource/LocalizationEngine interfaces. No engine or native adapters yet.

## Validation performed

Repository/code review only. No physical experiment or subsystem execution claimed.

## Important decisions / dependencies

[Architecture](../../ARCHITECTURE.md), [roadmap](../../ROADMAP.md), [reuse registry](../../../research/REUSE_REGISTRY.md), [platform ADR](../../../decisions/0002-product-platform-foundation.md), [venue ADR](../../../decisions/0003-venue-contracts-and-offline-navigation.md).

## Known issues / attempted approaches

No arbitrary radio fallback chain or UI marker writes. Fusion choice deferred to evidence. E001 acquisition tools pending.

## Next action

Implement anchor observation → pose in a pure package, resolving venue/revision/anchor IDs; test wrong-session/stale/unknown cases for M2.
