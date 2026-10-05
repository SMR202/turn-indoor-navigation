# Mobile workstream

Updated: 2026-10-05.

## Android permission mismatch resolved in acquisition

User's new exact failure was Motion permission denied, not backgrounding. Inspected installed expo-sensors 57.0.3 `DeviceMotionModule.kt`: its Android permission API requests ACTIVITY_RECOGNITION, while OnStartObserving subscribes to gyro, accelerometer, linear acceleration, rotation vector and gravity without that permission check. [Android documentation](https://developer.android.com/develop/sensors-and-location/sensors/sensors_motion) requires ACTIVITY_RECOGNITION for the step-counter/detector; it is not the runtime gate for the raw sensors TURN uses. The iOS motionPermission configuration is iOS-only ([SDK 57 docs](https://docs.expo.dev/versions/v57.0.0/sdk/devicemotion/)).

Removed the Android DeviceMotion permission request/denial gate. Hardware availability and actual sample-delivery watchdogs remain. iOS still requests and enforces motion consent. Optional native pedometer permission remains separate and denial does not stop PDR. No settings toggle, permission bypass of protected step data, native patch or dependency upgrade is needed for this fix. Earlier lifecycle/partial-payload fixes remain valid but did not address this permission mismatch.

65 tests and root checks pass; web export succeeds. New acquisition integration tests mock denied permission and prove Android starts/delivers samples/cleans up, iOS denial blocks, iOS grant starts, and unavailable/no-data Android reports sensor-specific failures. These are mocked tests, not Pixel execution. Restarted correct mobile project and LAN inbox; fresh SDK 57 phone bundles/QR prepared. Next: cold reload Pixel, start navigation and send the run. Physical confirmation remains outstanding.

## Pixel permission lifecycle fix

The reported exact reason was `App backgrounded`, identifying the session lifecycle path rather than a sensor-normalization failure. Previously `pendingStart` caused any inactive/background transition during permission requests to stop and invalidate the session. Startup now tolerates those transitions, waits for foreground after both permission checks, and only then arms background stopping and subscribes to motion. Leaving the navigation screen cancels pending startup; a 30-second foreground timeout cleans up. Active tracking still pauses on background. Regression tests cover background/inactive-to-active, cancellation and timeout. Device verification remains necessary; this supersedes the prior assumption that incomplete startup payloads explained this Pixel failure.

Validation: root check passes with 62 tests, types, lint, formatting and docs links. Web export succeeds; the live Android SDK 57 bundle was fetched and contains the foreground gate. Expo/inbox continue running and launch QR was regenerated. Physical Pixel permission/start behavior is not yet confirmed.

## Android console cleanup

Read Metro's actual output: positioning `index -> diagnostics -> index` require-cycle warning and React's update-before-mount error. Split positioning implementation into `engine.ts` with a one-way public export barrel; diagnostics no longer imports the barrel. Calibration and saved-history promises cancel UI delivery on blur/unmount, and late pedometer callbacks/save errors cannot update an unmounted session hook. No log suppression or dependency upgrade.

Root check passes (59 tests, types, lint, formatting and docs links), web export succeeds, and the Android SDK 57 bundle contains the split engine. Expo/inbox remain running and QR regenerated. The Android inspector disconnected before returning a component stack; lifecycle guards are concrete fixes but the reported React error's exact origin and disappearance are not confirmed. Next: cold reload on Android with console attached and inspect any recurring error's component stack before further changes.

## Android startup and uninterrupted navigation tests

Fixed premature failure on incomplete Android DeviceMotion startup payloads: the normalizer waits for acceleration plus rotation before establishing its time origin. Expo's installed Android source emits independently populated fields; its public TS type does not express their possible absence. The source now waits up to 5 seconds for usable initial acceleration and watches fresh usable samples thereafter (1.5 seconds), not merely callbacks. Missing required hardware still reports an explicit error. No Android recording was available to establish the user's exact failure; physical verification remains necessary.

Navigation uses recorded `continuous-test` policy and `route-progress-v2`: distance beyond 30 m and sustained off-route estimates warn without stopping capture. Real sensor failures and user/lifecycle stops remain distinct, displayed as Tracking paused with the reason. Historical recordings default to bounded policy; diagnostic tests retain it. Next: reload Android/iPhone, start a flat screen-up walk, check off-route capture continues, and send any failed recording with its displayed reason.

Validation: 59 tests, both typechecks, lint, formatting and docs links pass; web export succeeds. Restarted Expo and receiver for the new recording schema, fetched Android and iOS SDK 57 bundles over LAN and verified both contain the new guidance/policy. Fresh launch QR generated. No physical Android/iPhone execution or visual inspection claimed.

## Navigation accuracy checkpoints

Added selectable route-point references (amber S), an arrival tap and a second still check after two sensor seconds. Each annotation saves immediately and transfers through the existing inbox. Saved-run replay shows discrepancy and accepted/rejected/pending counts at the exact observation boundary. Stale acceleration, settling and inactive tracking block capture. Checkpoints never reset pose or enter the estimator. SDK 57, calibration and private geometry are unchanged. [Protocol](../../NAVIGATION_TESTING.md#doorway-checkpoint-comparison).

Next: collect the same short doorway route at normal/brisk pace with unchanged calibration, paired taps and failed runs included. Compare lag with persistent displacement loss before changing the filter. ARKit remains a proposed independent-motion experiment; no native adapter implemented in this slice.

Validation: root check passes (57 tests, both typechecks, lint, formatting and local docs links); web export passes. Restarted the paired inbox/Expo server and fetched the SDK 57 iOS bundle over LAN; checkpoint UI and capture code are present (the middle dot is escaped in the bundle). Fresh launch QR generated. Phone execution and visual UI inspection remain unverified. No measured accuracy improvement is claimed.

## Room-to-room navigation

Navigate is now the main screen: searchable/tappable destinations, location scan or explicit known-location selection, route-facing alignment, live guidance, pause/recovery and user-confirmed arrival. Tests/calibration/history/inbox moved to `/tests` and retain their existing functionality. Leaving a screen stops active sensors and saves through the shared session lifecycle. Sessions carry optional navigation destination/source/completion metadata. Private map and SDK 57 are preserved. See [phone protocol](../../NAVIGATION_TESTING.md).

55 tests/root checks and web export pass; all 72 private routes pass synthetic progress checks. The SDK 57 iOS navigation bundle was fetched over LAN; the restarted inbox accepted a navigation-tagged synthetic recording and its stored hash matched. Physical navigation UI/turn/recovery behavior is unvalidated; no browser visual check is claimed. PDR brisk undercount and heading bias remain open; the new screen does not claim to fix those. Next: short room-to-room walk through a turn, then pause/re-anchor with destination retained and upload both sessions.

## Motion-filter test build

New phone sessions record algorithm `step-yaw-motion-v2`; live and saved-run UI distinguish detected/accepted/not-used/pending counts and display the core's motion assessment. Missing richer sensors holds position. Finish instructions allow two seconds of stillness for the delayed candidates. Old run schemas/algorithms still replay. SDK 57, private venue and one-tap inbox remain. See [experiment](../../../research/MOTION_GUARD_EXPERIMENT.md) and [current protocol](../../PHONE_TESTING.md#current-experiment-motion-filtering).

Root checks and web export pass; the live SDK 57 iOS bundle includes v2. The restarted inbox accepted a synthetic v2 recording with matching stored hash; the synthetic file is outside incoming runs. Development replay rejects the labelled bobbing trial while preserving detections on two walking-labelled trials; no held-out accuracy claim. The one-tap transfer was physically exercised by the user: 14 recordings arrived with matching filename hashes. Next: new v2 controls and manual-count normal/brisk walks, then compare both algorithms. Phone behavior and visual UI inspection of v2 remain unverified.

## One-tap test inbox

Added **Send all saved tests to computer** and per-run send in Saved runs. `npm run phone:tests` launches Expo plus a paired, write-only local receiver. Uploads are explicit, bounded and schema-validated; immutable SHA-256 files in ignored `work/test-inbox` deduplicate retries and preserve revised annotations. The batch reports acknowledged saves and stops on failure; no automatic chat message, analysis or monitoring. Existing local saving and OS sharing remain. See [transfer setup and development-only security boundary](../../PHONE_TESTING.md#one-tap-transfer-to-this-computer).

Validation: root `npm run check` passes (45 tests, types, lint, formatting, docs links); web export succeeds. Tests include real HTTP authentication/schema/size checks, exact-byte hashing, duplicate and revised uploads, plus client acknowledgement/offline/pending-count handling. Expo and receiver are running; the iOS bundle was fetched over LAN and its pairing configuration used for a successful synthetic upload, stored-hash verification and duplicate acknowledgement. The synthetic file was moved to ignored `work/inbox-verification`, outside incoming runs. Physical phone-to-PC transfer remains to be verified by the user; browser UI inspection was blocked by the browser tool's URL policy.

Next action: reload from the fresh Expo QR, send saved tests, verify the success message, then ask Codex to inspect `work/test-inbox`.

Launch correction: root `npm start`, `npm run mobile` and `npm run web` explicitly target `apps/mobile`, avoiding Expo's default AppEntry when launched from the monorepo root. The mobile app retains `expo-router/entry` and SDK 57.

Launch validation: root start resolves `src/app`; iOS router bundle served successfully over LAN, web export succeeds, typecheck/lint and changed-file formatting pass. Physical phone launch remains user-verified separately.

## Current state

SDK 57 app consumes a generated active venue, with a public synthetic fallback. Zoomable room/window/wall map, tap-to-route, guided course selection, measured-path confirmation, saved calibration, trace/heading, endpoint and distance errors, repeat/reset, and OS-share export. Settled-start countdown, 20-second stationary mode, pace/manual-count labels, local saved run history, deterministic trace replay and comparison diagnostics. Private map artifacts stay Git-ignored. [Setup](../../LOCAL_VENUES.md).

## Validation / limitations

41 tests and root checks pass. Browser preview verifies plan labels, stationary mode without calibration, pace controls, start gating and the native-only sensor message. Android/iOS/web bundles are checked separately from device execution. Private model validation checks all anchor-to-destination routes and proper wall crossings. Seven user-provided iOS recordings were replayed; the new countdown/history flow still needs phone validation.

Calibration storage is per phone/user/carry style. Completed/interrupted runs save locally; share through the OS sheet for backup. Abrupt OS termination during capture can still lose an unfinished run. No background/pocket tracking. Routes start at the last anchor. No native binary build.

## Next action

Run one stationary trial and three normal/three brisk taped walks with unchanged calibration, explicit start cue and actual per-run footfall counts; verify on-device persistence, permission recovery and sharing. Retain completed and interrupted runs. Include a fresh verified Expo launch QR at each app handoff.

## Native comparison slice

Native/live/manual count display and five labelled phone-handling controls added. SDK 57 and the private venue remain. Native counts are diagnostic only, with unavailable/denied/unknown/partial states and a bounded iOS interval query. Phone validation of native permissions, latency and count quality remains pending. See the [execution plan](../../../research/MARKET_DIRECTION_2026_09.md).
