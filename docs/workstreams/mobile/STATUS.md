# Mobile workstream

Updated: 2026-10-10.

## iPhone BLE scanning build (CI, unsigned IPA) — 2026-10-16

IMPLEMENTED: scan-only iOS `TurnBle` Swift module, Info.plist Bluetooth usage text, bundle ID `com.turn.navigation.dev`, and a macOS GitHub Actions workflow producing an unsigned debug dev-client IPA for Sideloadly/free-Apple-ID install ([instructions and limits](../../IOS_TEST_BUILD.md)). EAS rejected: paid Apple account required. JS and the private venue stay on the local Metro server. Root check passes (104 tests), web export passes. The Swift code and CI build have not been compiled or run yet; result recorded below once the workflow finishes.

## Android build 4: BLE beacon mode — 2026-10-15

IMPLEMENTED: local `TurnBle` Expo module (`turn-ble-1`) in the existing `turn-motion` module package. It advertises a non-connectable TURN manufacturer payload (tag B1–B6 or any 1–12 alphanumerics; high/medium/low power, screen kept awake) and scans with a controller-level TURN filter, returning timestamped RSSI per beacon and an explicit completed flag; failed/cancelled/backgrounded scans return no evidence. New **Beacons** tab: act-as-beacon controls, six-second Listen with per-beacon dBm and packet count, capability/readiness details and a test procedure. Survey gets an **Include BLE beacons** toggle (Android build 4 only; feature-detected). iPhone/web are unchanged and do not scan or advertise. Manifest adds Bluetooth/Nearby-devices permissions (versionCode 4); SDK 57 retained.

Validation: root check passes (103 tests, both typechecks, lint, formatting, 183 documentation targets) and web export succeeds. Mocked adapter tests cover Android 12+/older permission sets, denial, malformed tags, cancellation and native failure. ARM64 debug APK build 4 assembles (14 min cold, Windows T: alias workaround from the [build guide](../../ANDROID_TEST_BUILD.md)): versionCode 4, package com.turn.navigation.dev, the five Bluetooth permissions present, DEX contains TurnBle `turn-ble-1`, debug signature identical to build 3 (SHA-256 cert fac61745…), LAN download 97,516,494 bytes, SHA-256 4568D70243B0960D04C1764ED8384FE3574E6B6B521460BA56FC5C37EA0B83B5. The served Android SDK 57 bundle contains the Beacons screen, BLE toggle and `station-rank-v3`. No phone install, advertising, scanning or RSSI behavior has been exercised; physical results are outstanding. Protocol: [BLE beacon test](../../FINGERPRINT_TESTING.md#ble-beacons-with-spare-android-phones-build-4).

## Fingerprint save ordering and ranked recovery — 2026-10-10

FACT: SDK 57 File.copy and File.move return promises. Fingerprint storage called them synchronously, deleting the copy source and reporting success before operations completed. This is a concrete race consistent with the reported Android NoSuchFileException; the full device stack was not available in the server terminal. Replaced these with the SDK's supported copySync/moveSync to maintain the existing synchronous save contract. Errors now propagate into the capture/label error handler. Backup-only recordings are discoverable after an interrupted replacement, with deduplicated history entries. Existing phone surveys/profiles remain in place; no migration or new native module is needed.

IMPLEMENTED: ranked places, relative confidence and explicit Wi-Fi fallback reasons; version-stamped new tests and preserved historical scoring. Navigate opens recognition directly. Physically confirmed clear/tentative suggestions create an auditable PDR correction with destination retained and heading alignment required. [Positioning evidence and decisions](../positioning/STATUS.md), [phone steps](../../FINGERPRINT_TESTING.md).

Validation: root `npm run check` passes with 93 tests / 22 files, typechecks/lint/format/docs; web export succeeds. Native filesystem mocks test replacement ordering, copy failure, backup recovery after move failure and retry; these do not substitute for Pixel/iPhone execution. Both LAN-served native bundles include the updated paths. Browser checks verify Navigate → Find my place, web capture disabled and no warning/error logs in a fresh test tab. Physical capture, save/reload and confirmed route continuation still need phone tests. SDK remains 57; Android build 3 can reload this JavaScript update without reinstalling.

Next: reload both phones with the launch QRs, perform a new capture and label change, reopen history and send it. Then test the confirmed correction during a short route. Upload is button-triggered; no automatic analysis or monitoring is running.

## Fingerprinting station pilot — 2026-10-10

DECISION: user-requested fingerprinting precedes the previously proposed camera milestone. New Survey flow captures calibrated magnetic vectors on both phones and optional fresh Wi-Fi on Android build 3. Survey two passes at three or more physically verified anchors per installation; recognize a separate query without its actual-place label, then allow a recent physically confirmed candidate to re-anchor navigation. No continuous pose fusion, cross-device model or automatic correction is claimed. [Test protocol and limits](../../FINGERPRINT_TESTING.md).

IMPLEMENTED: pure versioned matcher/replay in positioning-core; capture/storage outside screens; bounded monotonic samples, lifecycle cancellation, optional precise-location permissions, stale-scan rejection and hashed radio identifiers. Raw snapshots/test inputs are immutable after receipt through the authenticated inbox. The app saves locally and transfers only when the user taps Send. UI now has persistent Navigate/Survey/Tests tabs, map-first navigation, larger shared controls, selected/focus states and expandable details. Mobbin search was unavailable without a paid plan; no reference assets were used.

EXPERIMENT: conservative magnetic magnitude and repeated RSSI references distinguish surveyed stations or abstain. Thresholds are engineering choices, not calibrated probabilities. Similar magnetic fields, sparse/throttled Wi-Fi and device/environment changes can defeat matching. Same-phone surveys are intentional; independent physical measurements are still required. The original PDR filter and stride are unchanged.

Validation (2026-10-10): root `npm run check` passes: 86 tests in 21 files, both typechecks, lint, formatting and 175 local documentation targets. `npm run export:web` succeeds. Tests cover independent labels, ambiguous/out-of-coverage signals, unstable competitors, missing/throttled radio fallback, sensor clocks, permission denial and cancellation including a pending native scan. Inbox tests verify authenticated exact-byte receipt and invalid-label rejection. The replay CLI correctly processes an explicitly synthetic example; this is not a venue result. Strict UI audit and DESIGN.md lint report no errors/warnings. Browser checks exercised all three tabs, survey/test gating, disabled web capture, disclosures, handling mode, destination search/empty/clear and narrow layout. Fixed SVG web responder errors and empty-text warnings found during inspection; no new console errors after final reload. Physical touch, accessibility-reader behavior and phone sensors remain unverified.

Android ARM64 build 3 assembles successfully. Packaged manifest/version/permissions and DEX Wi-Fi module revision checked; APK signature matches build 2, ZIP integrity passes, and the LAN-served download matches SHA-256 `478c7cadd3effee2048c5ee2f3d2290c1c5b07de7c0530e6db1b1df2a889cf7e` (97,499,934 bytes). SDK 57 iOS/Android bundles fetched over LAN contain the Survey and matching code. Expo, paired inbox and APK server are running locally, with regenerated launch/install QRs in ignored work/phone-test. No installation or physical accuracy success is claimed. Upstream native deprecation/toolchain warnings remain; compilation succeeds. Metro workers capped at two to reduce contention with the native build.

Next action: install Android build 3 and connect both phones, collect separate surveys and held-out recognition tests, label all outcomes after prediction and send records. Evaluate wrong matches, abstentions and map-point error by device/signal method. Only then consider sequence features or automatic fusion. Native compilation and browser checks do not establish physical performance.

Follow-up: user now reports movement on Pixel and iPhone, with different distance/calibration behavior. Treat this as qualitative recovery, not quantitative build-2 sensor-rate or accuracy validation. The next requested research review recommends a [camera-assisted positioning milestone](../../../research/HYBRID_POSITIONING_NEXT_STEP_2026_10.md); no AR capability is installed yet. Existing upload remains button-triggered, without automatic analysis or monitoring.

## Android build 2: replace display-frame motion snapshots

FACT: the user's two new Android uploads after installing the previous APK still contain only 38 accelerometer samples each over about 4.2 seconds, with zero accepted steps and the slow-stream failure. Native intervals include roughly 2.36 ms bursts followed by 200–260 ms gaps. The permission-only fix below was insufficient. Source inspection confirms expo-sensors 57.0.3 retains the latest mutable SensorEvents and dispatches snapshots on Choreographer frames. Actual Pixel frame performance/map cost is not measured.

DECISION: local `turn-motion` module requests five sensors at 50 Hz on a dedicated HandlerThread, copies each reading with its native timestamp and delivers 100 ms batches independently of display frames. One acknowledged batch at a time plus a bounded pending queue; explicit overflow/failure, per-session tokens, sequence checks and foreground/stop cleanup. The TypeScript adapter preserves existing units/frames and normalizes each fresh reading; coherent startup and gravity freshness are checked. iOS remains on DeviceMotion. SDK 57, venue, calibration and `step-yaw-motion-v2` thresholds remain. [ADR-0006](../../../decisions/0006-android-buffered-motion-acquisition.md).

Build 2 (Android versionCode 2) identifies the installed native capture in recording metadata and each motion observation. Tests screen shows **Android sensor build 2 · buffered capture ready**; missing/older native modules get a distinct update instruction, while a genuinely slow current stream asks for its recording. Update the same TURN installation to preserve its stored calibration and tests. No native dependency sources or generated app files are hand-edited.

Validation: root checks pass with 74 tests, both typechecks, lint and formatting; final docs links pass (158 targets). Web export succeeds. Dedicated acquisition tests preserve all 300 native 50 Hz readings through delayed/arbitrary batch boundaries, reject missing sequences/invalid clocks, clean failed starts, retain iOS consent, and distinguish synthetic walking from bobbing through the unchanged filter. Full navigation/replay equality passes. Android and iOS SDK 57 bundles fetched from the restarted LAN server both include the new capture revision and build label. No physical recovery or accuracy improvement claimed.

ARM64 Android assembly succeeds. APK manifest confirms versionCode 2 / com.turn.navigation.dev; DEX contains TurnMotionModule and `turn-android-imu-1`. APK signature passes and matches build 1's certificate. ZIP checksums and all 26 ARM64 ELF headers pass. The LAN download is 97,499,790 bytes and matches SHA-256 `48c1bb149aa347e6a79a3198e4fe5956d843caa3f4b5e71f7436efb8b208b508`. APK server was restarted for the new size; Expo and receiver are running. QRs regenerated in ignored work/phone-test. Build required cross-drive codegen path adjustment and disabling Kotlin incremental caching; [Windows instructions](../../ANDROID_TEST_BUILD.md) preserve the workaround. Generated native sources/dependencies are unmodified. Local Gradle module/build caches also moved to the existing D: build area with junctions; do not remove it while those links are in use.

Next action: install updated build 2 over TURN, verify the label, run one normal walk and one labelled stationary bobbing control, and send both. Inspect acquisition revision, per-stream native gaps and paired samples before any filter tuning. The paired Expo/inbox and APK server are local processes only; uploads remain button-triggered, with no automatic analysis or monitoring.

## Pixel frozen-dot diagnosis and native sampling configuration

FACT: five Android uploads received; two are older permission failures. Replaying the three sensor-bearing runs reproduces zero accepted steps from 9/18/7 candidates. Motion state is unavailable; acceleration delivery is approximately 4.5/7.1/7.4 Hz and nearly all inter-sample gaps exceed 100 ms. This cannot satisfy v2's 25 paired samples in a 1.2-second window. One route run also stops on a heading gap. Raw captures/hashes and detailed reports remain private under work/.

FACT: installed expo-sensors 57.0.3 SensorSubscription requests SENSOR_DELAY_NORMAL on Android 12+ without HIGH_SAMPLING_RATE_SENSORS, independently of the JS delivery interval. DECISION: configure that permission in TURN's native manifest and add SDK-compatible expo-dev-client 57.0.19 (MIT). No filter threshold relaxation, fabricated samples, stride adjustment or algorithm revision. Expo Go's host manifest cannot be fixed by reloading JS. The separate Android debug app needs its own calibration; iPhone Expo Go remains supported.

Added Android sampling-health detection using fresh normalized events, startup grace and once-only actionable failure reporting. Tests cover 5–8 Hz, missing/stalled streams, healthy 50 Hz and repeated Android fields. Phone tooling supports --dev-client, separate install/launch QRs and a LAN server that serves only the debug APK. [Build and phone instructions](../../ANDROID_TEST_BUILD.md). Native compilation/phone confirmation are separate from mocked acquisition tests; physical recovery is not yet established.

Validation: root check passes with 68 tests, both typechecks, lint, formatting and docs links; web export succeeds. Android/iOS SDK 57 bundles were fetched over LAN and the Android bundle contains the sampling-health check. ARM64 Android debug build succeeds; packaged manifest includes the sensor permission and APK signature verification passes. Installed precompiled sensor bytecode also confirms the permission-controlled fast/normal sampling branch. Native build required a short Windows drive alias and relocating generated outputs/cache to D: after path-length and disk-space failures; see the build guide. Physical execution remains unverified.

APK integrity: ZIP checksum validation and ELF inspection of all 26 ARM64 shared libraries pass. The LAN download returns the 97,483,398-byte APK with an identical SHA-256 to the built artifact; other server paths return 404. Install and development-launch QR images are in ignored work/phone-test. These computer-side checks do not establish Pixel sensor frequency or movement accuracy.

Next: install TURN on Pixel, restore calibration, repeat normal walk and bobbing control, upload both and measure delivered/paired sensor rate plus accepted/rejected steps before accuracy tuning. Expo/receiver and the restricted APK download server are local processes, not a deployed service or automatic monitoring.

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
