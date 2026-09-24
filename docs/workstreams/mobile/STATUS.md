# Mobile workstream

Updated: 2026-09-24.

## Current state / decisions

Expo 57.0.24 reference client adds camera QR scan with permission/retry/cancel, manual known demo anchors, marker-driven routes, calibrated live PDR controls and local OS-share recording export. Camera/sensor/sharing/file modules use SDK 57 versions. Launch and location QRs are separate; generator is `npm run phone:qr -- exp://HOST:PORT`. User preference for QR handoff persists in AGENTS.

## Validation / limitations

Root checks pass including 23 tests. Expo Doctor 21/21; Android, iOS and web exports pass. Browser verifies entrance→Reading Room 19 m, crossroads→Reading Room 7 m, invalid calibration feedback, valid 10/14 calibration and phone-only live testing message. LAN manifest reports exposdk:57.0.0 and PC host. Camera/motion/OS-share physical execution remains untested. Audit has 14 moderate transitive findings, no high/critical.

No background tracking, pocket/bag mode or measured accuracy. Current map is fictional, and routes remain from the last anchor. Native binaries have not been built.

## Next action

Follow [phone testing](../../PHONE_TESTING.md), including permission denial/recovery, scan identity errors, background/resume and held-out measured walks. Keep the Expo server running for each phone handoff.
