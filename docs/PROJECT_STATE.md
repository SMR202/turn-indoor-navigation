# TURN project state

Updated: 2026-10-19.

## Current milestone

M0/M1/M2 and experimental PDR implemented. Current branch `codex/native-step-comparison` includes settled starts, labelled trials, native/manual count comparison, local history and one-tap LAN transfer. Fourteen inbox recordings were replayed; new sessions now use a versioned experimental motion filter. General localization accuracy remains unvalidated.

## Product platform — 2026-10-19 (Plan 003)

TURN now has three product surfaces beside the test app:

- the **TURN visitor app** (`apps/navigator`, Expo SDK 57): venue catalog, the new indoor map renderer, search, place details, route preview with named turn-by-turn steps, live, demo and step-by-step guidance, and arrival;
- **TURN Studio / TURN Ops** (`apps/console`);
- a development **API** (`apps/api`).

The positioning runtime is shared through `@turn/positioning-runtime`; the test app keeps working through re-export shims. Brand tokens and assets live in `@turn/design`. The visitor app and console were exercised in the browser only. The visitor app has not yet run on a phone, and live guidance has no measured accuracy. [Plan 003](../plans/active/003-product-platform.md), [backend/admin status](workstreams/backend-admin/STATUS.md), [mobile status](workstreams/mobile/STATUS.md).

## Fingerprinting pilot and app interface

Implemented magnetic station surveys on iPhone/Android, optional fresh Wi-Fi scans in Android build 3, independent recognition tests, immutable inbox transfer and shared replay. A recent, physically confirmed candidate can establish/recover navigation at a surveyed anchor. Persistent Navigate / Survey / Tests tabs and shared accessible controls replace the previous screen navigation. [Fingerprint test protocol](FINGERPRINT_TESTING.md). No continuous fingerprint fusion or measured accuracy improvement is claimed.

October 10 follow-up: fixed SDK 57 fingerprint file replacement ordering; new recognition records use versioned repeatability-based ranking with explicit confidence and Wi-Fi fallback reasons. Confirmed corrections now link the fingerprint query to preceding/new PDR segments while retaining the destination. Seven uploaded queries supplied development evidence; fresh held-out trials and physical correction tests remain the next gate. Historical replay stays unchanged. [Current positioning status](workstreams/positioning/STATUS.md).

## Assisted navigation — 2026-10-16

The default Navigate tab is now a maps-style navigator: search/tap a destination, find your start from beacons (or tap the map), start, turn-by-turn with automatic rerouting and arrival. Positioning is a map-aware particle filter fusing walking sensors, calibrated BLE signal strengths (probabilistic trilateration), proximity and fingerprint fixes, with heading-drift states ([ADR-0009](../decisions/0009-particle-filter-fusion.md), [master plan](../plans/active/2026-10-16-assisted-navigation-master-plan.md)). Beacon sites are suggested on the map and calibrated in the Beacons tab. The previous test navigator is kept under Tests. Only synthetic simulation supports the algorithm; no accuracy has been measured on real end-to-end walks yet.

## Capabilities

One-floor room-to-room navigation is now the main user flow: destination search, known-location start, live route progress/turns, user-confirmed arrival and QR/manual recovery with recalculation. Diagnostics remain in a separate screen. [Navigation protocol](NAVIGATION_TESTING.md). This is route progress, not pose correction or verified wall-based map matching.

Expo SDK 57; private local venue packages with room dimensions; zoomable maps; camera/manual anchors; local routes; guided courses; saved calibration; walked trail and endpoint error; portable recordings with embedded venue; automatic local run saving, count/pace annotations and replay comparisons; deterministic replay; active-venue launch/location QR generation. [Local venue instructions](LOCAL_VENUES.md). Default public fixture remains synthetic.

## Active workstreams

[Mobile](workstreams/mobile/STATUS.md), [positioning](workstreams/positioning/STATUS.md), [PDR](workstreams/pdr/STATUS.md), [routing](workstreams/routing/STATUS.md), [venue packages](workstreams/venue-packages/STATUS.md). Other scope remains in the [workstream index](workstreams/README.md).

## Gaps

Repeatable accuracy unvalidated; initial user trials show count variation and heading offset. Plan-derived geometry needs field verification, especially unlabelled wall/door positions. No floor detection, updater, hosted backend, real authentication or published SDK (a development API and console exist). Phone/OS and carry-mode validation pending. October 9 dependency audit reports 32 findings (11 moderate, 20 high, 1 critical); forced Expo/RN downgrades conflict with SDK 57. See [reuse registry](../research/REUSE_REGISTRY.md).

## Direction

[Market review and execution plan](../research/MARKET_DIRECTION_2026_09.md) preserves multi-sensor corrections, offline venue packages, authoring and a reusable SDK. Native counts provide diagnostic evidence only. New phone sessions use experimental `step-yaw-motion-v2`; historical v1 replay is preserved. Rejection of the available bobbing control is a development result, not general accuracy. See [motion-filter experiment](../research/MOTION_GUARD_EXPERIMENT.md). One-tap LAN transfers deliver tests into the private project inbox.

## Next action

User now reports movement on Pixel and iPhone, with remaining distance/calibration differences. Android **build 2** replaces Expo's display-frame snapshots with a dedicated 50 Hz sensor request and timestamp-preserving bounded batches; PDR thresholds and SDK 57 remain. [ADR-0006](../decisions/0006-android-buffered-motion-acquisition.md) records the evidence and limits. This follow-up is qualitative: new-build delivered rates and accuracy still need recordings. The iPhone retains Expo Go for existing PDR.

The user selected fingerprinting as the next implementation slice, superseding the previous immediate VIO-first action. Next: survey at least three physical stations twice on each phone, collect held-out recognition trials, send them, and measure wrong matches and abstentions before automatic fusion. Camera-assisted room-to-room positioning remains a later candidate, ARCore on Pixel and ARKit on iPhone, alongside verified map constraints and passive BLE/magnetic corrections. [October 9 research and implementation handoff](../research/HYBRID_POSITIONING_NEXT_STEP_2026_10.md). No AR adapter or fused estimator exists yet; native integration and physical evaluation are separate gates. iPhone AR will require a signed development build.

Walk a short room-to-room route through one turn, then exercise pause/re-anchor recovery with destination retained; upload both sessions via the inbox. Product flow progresses while brisk-count/stride and heading issues remain under evaluation.

Run the [phone protocol](PHONE_TESTING.md): independent calibration, held-out straight/turn walks, native timestamp/heading verification, immutable recordings and per-device drift results. Proposed targets are not results. Do not deploy as real-building guidance.

## Automation

CI runs types, unit tests, lint, formatting, docs links and web export on push/PR. No recurring agent loop or monitor. Phone QR generation is a local command and the development server must remain running.
