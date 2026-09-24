# routing workstream

Last meaningful update: 2026-09-24

## Objective

UI-independent local graph routes with failure/accessibility semantics.

## Current state / what changed

packages/routing adapts Graphlib Dijkstra to typed TURN results, metric geometry/instructions and step-free rules; consumed by app. Floor-transition destinations emit both transition and arrival. Shared contracts are the future SDK seam.

## Validation performed

Six routing tests pass: expected distances, invalid/unreachable endpoints, directed/step-free edges, same-node arrival, weighted alternatives and floor transitions. See [foundation status](../foundation/STATUS.md) for full validation.

## Important decisions / dependencies

[Architecture](../../ARCHITECTURE.md), [roadmap](../../ROADMAP.md), [reuse registry](../../../research/REUSE_REGISTRY.md), [platform ADR](../../../decisions/0002-product-platform-foundation.md), [venue ADR](../../../decisions/0003-venue-contracts-and-offline-navigation.md).

## Known issues / attempted approaches

Graph validation does not prove wall clearance. No dynamic obstacles, live rerouting or multi-floor UI. Temporary handwritten Dijkstra was replaced with MIT Graphlib 4.0.5. NetworkX remains a research oracle candidate.

## Next action

Add turn instructions and geometry/route fixtures for real M1/M6 venues; keep connector arrival and accessibility behavior tested.
