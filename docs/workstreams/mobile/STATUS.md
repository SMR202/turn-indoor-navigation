# Mobile workstream

Updated: 2026-09-25.

## Current state

SDK 57 app consumes a generated active venue, with a public synthetic fallback. Zoomable room/window/wall map, tap-to-route, guided course selection, measured-path confirmation, saved calibration, trace/heading, endpoint and distance errors, repeat/reset, and OS-share export. Settled-start countdown, 20-second stationary mode, pace/manual-count labels, local saved run history, deterministic trace replay and comparison diagnostics. Private map artifacts stay Git-ignored. [Setup](../../LOCAL_VENUES.md).

## Validation / limitations

35 tests and root checks pass. Browser preview verifies plan labels, stationary mode without calibration, pace controls, start gating and the native-only sensor message. Android/iOS/web bundles are checked separately from device execution. Private model validation checks all anchor-to-destination routes and proper wall crossings. Seven user-provided iOS recordings were replayed; the new countdown/history flow still needs phone validation.

Calibration storage is per phone/user/carry style. Completed/interrupted runs save locally; share through the OS sheet for backup. Abrupt OS termination during capture can still lose an unfinished run. No background/pocket tracking. Routes start at the last anchor. No native binary build.

## Next action

Run one stationary trial and three normal/three brisk taped walks with unchanged calibration, explicit start cue and actual per-run footfall counts; verify on-device persistence, permission recovery and sharing. Retain completed and interrupted runs. Include a fresh verified Expo launch QR at each app handoff.
