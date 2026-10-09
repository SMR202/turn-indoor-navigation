# TURN project state

Updated: 2026-10-09.

## Current milestone

M0/M1/M2 and experimental PDR implemented. Current branch `codex/native-step-comparison` includes settled starts, labelled trials, native/manual count comparison, local history and one-tap LAN transfer. Fourteen inbox recordings were replayed; new sessions now use a versioned experimental motion filter. General localization accuracy remains unvalidated.

## Capabilities

One-floor room-to-room navigation is now the main user flow: destination search, known-location start, live route progress/turns, user-confirmed arrival and QR/manual recovery with recalculation. Diagnostics remain in a separate screen. [Navigation protocol](NAVIGATION_TESTING.md). This is route progress, not pose correction or verified wall-based map matching.

Expo SDK 57; private local venue packages with room dimensions; zoomable maps; camera/manual anchors; local routes; guided courses; saved calibration; walked trail and endpoint error; portable recordings with embedded venue; automatic local run saving, count/pace annotations and replay comparisons; deterministic replay; active-venue launch/location QR generation. [Local venue instructions](LOCAL_VENUES.md). Default public fixture remains synthetic.

## Active workstreams

[Mobile](workstreams/mobile/STATUS.md), [positioning](workstreams/positioning/STATUS.md), [PDR](workstreams/pdr/STATUS.md), [routing](workstreams/routing/STATUS.md), [venue packages](workstreams/venue-packages/STATUS.md). Other scope remains in the [workstream index](workstreams/README.md).

## Gaps

Repeatable accuracy unvalidated; initial user trials show count variation and heading offset. Plan-derived geometry needs field verification, especially unlabelled wall/door positions. No map matching, continuous rerouting, floor detection, updater, backend/admin or published SDK. Phone/OS and carry-mode validation pending. October 9 dependency audit reports 32 findings (11 moderate, 20 high, 1 critical); forced Expo/RN downgrades conflict with SDK 57. See [reuse registry](../research/REUSE_REGISTRY.md).

## Direction

[Market review and execution plan](../research/MARKET_DIRECTION_2026_09.md) preserves multi-sensor corrections, offline venue packages, authoring and a reusable SDK. Native counts provide diagnostic evidence only. New phone sessions use experimental `step-yaw-motion-v2`; historical v1 replay is preserved. Rejection of the available bobbing control is a development result, not general accuracy. See [motion-filter experiment](../research/MOTION_GUARD_EXPERIMENT.md). One-tap LAN transfers deliver tests into the private project inbox.

## Next action

Pixel recordings still failed after the permission-enabled APK. Android **build 2** replaces Expo's display-frame snapshots with a dedicated 50 Hz sensor request and timestamp-preserving bounded batches; PDR thresholds and SDK 57 remain. [ADR-0006](../decisions/0006-android-buffered-motion-acquisition.md) records the evidence and limits. Install the [updated Android build](ANDROID_TEST_BUILD.md), confirm its sensor-build label, and send a normal walk plus bobbing control. The iPhone retains Expo Go. See [mobile status](workstreams/mobile/STATUS.md) for actual validation; physical recovery is not yet established.

Walk a short room-to-room route through one turn, then exercise pause/re-anchor recovery with destination retained; upload both sessions via the inbox. Product flow progresses while brisk-count/stride and heading issues remain under evaluation.

Run the [phone protocol](PHONE_TESTING.md): independent calibration, held-out straight/turn walks, native timestamp/heading verification, immutable recordings and per-device drift results. Proposed targets are not results. Do not deploy as real-building guidance.

## Automation

CI runs types, unit tests, lint, formatting, docs links and web export on push/PR. No recurring agent loop or monitor. Phone QR generation is a local command and the development server must remain running.
