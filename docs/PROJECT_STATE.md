# TURN project state

Updated: 2026-09-25.

## Current milestone

M0/M1/M2 and experimental PDR baseline implemented. Current branch `codex/local-venue-testing` adds private plan-derived venue loading and guided phone tests. No measured localization accuracy or physical native validation.

## Capabilities

Expo SDK 57; private local venue packages with room dimensions; zoomable maps; camera/manual anchors; local routes; guided courses; saved calibration; walked trail and endpoint error; portable recordings with embedded venue; deterministic replay; active-venue launch/location QR generation. [Local venue instructions](LOCAL_VENUES.md). Default public fixture remains synthetic.

## Active workstreams

[Mobile](workstreams/mobile/STATUS.md), [positioning](workstreams/positioning/STATUS.md), [PDR](workstreams/pdr/STATUS.md), [routing](workstreams/routing/STATUS.md), [venue packages](workstreams/venue-packages/STATUS.md). Other scope remains in the [workstream index](workstreams/README.md).

## Gaps

Accuracy unmeasured. Plan-derived geometry needs field verification, especially unlabelled wall/door positions. No map matching, continuous rerouting, floor detection, updater, backend/admin or published SDK. Phone/OS and carry-mode validation pending. Dependency audit reports 14 moderate transitive findings, no high/critical; forced downgrades conflict with SDK 57. See [reuse registry](../research/REUSE_REGISTRY.md).

## Next action

Run the [phone protocol](PHONE_TESTING.md): independent calibration, held-out straight/turn walks, native timestamp/heading verification, immutable recordings and per-device drift results. Proposed targets are not results. Do not deploy as real-building guidance.

## Automation

CI runs types, unit tests, lint, formatting, docs links and web export on push/PR. No recurring agent loop or monitor. Phone QR generation is a local command and the development server must remain running.
