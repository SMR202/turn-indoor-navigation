# mobile workstream

Last meaningful update: 2026-09-24

## Objective

Reference consumer of TURN platform, Android/iOS.

## Current state / what changed

apps/mobile renders synthetic floor/POIs and local destination routes. Fixed demo start is clearly labeled. No acquisition logic in screens.

## Validation performed

Browser boot and all destination selections verified (24 m cafe, 19 m reading room/help desk); route clearing, geometry and phone-width layout inspected. No console errors/warnings observed. Expo Doctor passed 21/21. Web/Android/iOS bundle exports passed; see [foundation status](../foundation/STATUS.md). Physical native execution is untested.

## Important decisions / dependencies

[Architecture](../../ARCHITECTURE.md), [roadmap](../../ROADMAP.md), [reuse registry](../../../research/REUSE_REGISTRY.md), [platform ADR](../../../decisions/0002-product-platform-foundation.md), [venue ADR](../../../decisions/0003-venue-contracts-and-offline-navigation.md).

## Known issues / attempted approaches

Web preview/bundling does not prove native behavior. QR, live marker and motion are absent.

## Next action

Smoke-test same screen on Android/iOS, then add QR camera permission/scan flow and anchored pose UI.
