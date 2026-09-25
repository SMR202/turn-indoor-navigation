# Mobile workstream

Updated: 2026-09-25.

## Current state

SDK 57 app consumes a generated active venue, with a public synthetic fallback. Zoomable room/window/wall map, tap-to-route, guided course selection, measured-path confirmation, saved calibration, trace/heading, endpoint and distance errors, repeat/reset, and OS-share export. Private map artifacts stay Git-ignored. [Setup](../../LOCAL_VENUES.md).

## Validation / limitations

28 tests and root checks pass. Browser phone-width preview verifies plan labels, zoom, start gating and saved calibration. Android/iOS/web bundles are checked separately from device execution. Private model validation checks all anchor-to-destination routes and proper wall crossings. No real phone walk or measured accuracy claimed.

Calibration storage is per phone/user/carry style. No run history screen; unsaved runs are replaced on re-anchor. No background/pocket tracking. Routes start at the last anchor. No native binary build.

## Next action

Run independently taped courses on the user's phone; verify yaw direction, counts, permission recovery and export. Retain completed and interrupted runs. Include a fresh verified Expo launch QR at each app handoff.
