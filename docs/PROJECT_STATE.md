# TURN project state

Updated: 2026-09-24.

## Current milestone

M0/M1 foundation and M2 anchor slice implemented. Experimental PDR capture/replay baseline added on `codex/anchored-pdr`. No measured localization accuracy or physical native validation.

## Capabilities

Expo SDK 57 reference app; validated metric synthetic venue; camera/manual known-anchor selection; anchor-based destination routing; calibrated step-length and relative-yaw motion tracking; local recording export; deterministic replay with input SHA-256 and optional endpoint error; reusable Expo launch/location QR generator.

## Active workstreams

[Mobile](workstreams/mobile/STATUS.md), [positioning](workstreams/positioning/STATUS.md), [PDR](workstreams/pdr/STATUS.md), [routing](workstreams/routing/STATUS.md), [venue packages](workstreams/venue-packages/STATUS.md). Other scope remains in the [workstream index](workstreams/README.md).

## Gaps

Accuracy unmeasured. No map matching, continuous rerouting, floor detection, real venue, package updater, backend/admin or published SDK. Phone/OS and carry-mode validation pending. Dependency audit reports 14 moderate transitive findings, no high/critical; forced downgrade recommendations are incompatible with SDK 57. See [reuse registry](../research/REUSE_REGISTRY.md).

## Next action

Run the [phone protocol](PHONE_TESTING.md): independent calibration, held-out straight/turn walks, native timestamp/heading verification, immutable recordings and per-device drift results. Proposed targets are not results. Do not deploy as real-building guidance.

## Automation

CI runs types, unit tests, lint, formatting, docs links and web export on push/PR. No recurring agent loop or monitor. Phone QR generation is a local command and the development server must remain running.
