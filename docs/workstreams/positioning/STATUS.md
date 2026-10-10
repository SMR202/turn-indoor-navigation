# Positioning workstream

Updated: 2026-10-10.

## First iPhone fingerprint uploads — 2026-10-10

EXPERIMENT RESULT: 16 received fingerprint records validated against the schema and their SHA-256 filenames: 12 unique survey captures (three passes at four stations), four independently captured labelled queries, one iOS installation profile. All four production replays abstain, but their top-ranked station agrees with the supplied physical label in all four. This is a small same-session diagnostic set, not established accuracy. Raw files remain unchanged in ignored work/test-inbox; reproducible analysis and hash manifest are in ignored work/fingerprint-analysis-20261010/analyze.mjs and report.json. No venue geometry, station identities or raw readings are committed.

FACT: capture quality passes; the rejection is the ranking-margin gate, not missing magnetic data. All station spread estimates hit the hard-coded 2 microtesla minimum. With this survey's station separation, the best-versus-runner-up score margin is below 1.25 even for a query exactly at each station centre. The implemented gate therefore precludes recognition of these learned stations. All four actual queries pass the absolute score threshold but fail the margin threshold. A secondary leave-one-survey-pass-out diagnostic ranks the labelled place first for 12/12 survey captures; these temporally correlated checks are not independent validation. Do not report the forced nearest-choice results as accepted localization success.

DECISION: keep the app/model unchanged during the user's Pixel comparison. Do not infer that the house has insufficient magnetic variation or that a larger building would solve this. Next: inspect Pixel records for fresh Wi-Fi and whether combined matching actually activates. Then replace the fixed confidence scale with an experimentally evaluated repeatability/separation-aware rule, preserving abstention and testing new held-out trials, including unsurveyed/intermediate locations and changed phone orientation/height. Current magnetic magnitude alone does not establish a unique place throughout a building. No automatic fusion or cross-device model transfer is validated.

Validation: ran the shared production schema, feature extractor and matcher on all received records; verified immutable-file hashes, deduplicated capture IDs across cumulative snapshots and separated survey resampling from the four queries. Documentation formatting and local links checked. No app changes, native build or new physical test performed by the agent; no background monitoring.

## Fingerprinting station pilot — 2026-10-10

DECISION: user-requested fingerprinting precedes the previously proposed camera milestone. New Survey flow captures calibrated magnetic vectors on both phones and optional fresh Wi-Fi on Android build 3. Survey two passes at three or more physically verified anchors per installation; recognize a separate query without its actual-place label, then allow a recent physically confirmed candidate to re-anchor navigation. No continuous pose fusion, cross-device model or automatic correction is claimed. [Test protocol and limits](../../FINGERPRINT_TESTING.md).

IMPLEMENTED: pure versioned matcher/replay in positioning-core; capture/storage outside screens; bounded monotonic samples, lifecycle cancellation, optional precise-location permissions, stale-scan rejection and hashed radio identifiers. Raw snapshots/test inputs are immutable after receipt through the authenticated inbox. The app saves locally and transfers only when the user taps Send. UI now has persistent Navigate/Survey/Tests tabs, map-first navigation, larger shared controls, selected/focus states and expandable details. Mobbin search was unavailable without a paid plan; no reference assets were used.

EXPERIMENT: conservative magnetic magnitude and repeated RSSI references distinguish surveyed stations or abstain. Thresholds are engineering choices, not calibrated probabilities. Similar magnetic fields, sparse/throttled Wi-Fi and device/environment changes can defeat matching. Same-phone surveys are intentional; independent physical measurements are still required. The original PDR filter and stride are unchanged.

Validation (2026-10-10): root `npm run check` passes: 86 tests in 21 files, both typechecks, lint, formatting and 175 local documentation targets. `npm run export:web` succeeds. Tests cover independent labels, ambiguous/out-of-coverage signals, unstable competitors, missing/throttled radio fallback, sensor clocks, permission denial and cancellation including a pending native scan. Inbox tests verify authenticated exact-byte receipt and invalid-label rejection. The replay CLI correctly processes an explicitly synthetic example; this is not a venue result. Strict UI audit and DESIGN.md lint report no errors/warnings. Browser checks exercised all three tabs, survey/test gating, disabled web capture, disclosures, handling mode, destination search/empty/clear and narrow layout. Fixed SVG web responder errors and empty-text warnings found during inspection; no new console errors after final reload. Physical touch, accessibility-reader behavior and phone sensors remain unverified.

Android ARM64 build 3 assembles successfully. Packaged manifest/version/permissions and DEX Wi-Fi module revision checked; APK signature matches build 2, ZIP integrity passes, and the LAN-served download matches SHA-256 `478c7cadd3effee2048c5ee2f3d2290c1c5b07de7c0530e6db1b1df2a889cf7e` (97,499,934 bytes). SDK 57 iOS/Android bundles fetched over LAN contain the Survey and matching code. Expo, paired inbox and APK server are running locally, with regenerated launch/install QRs in ignored work/phone-test. No installation or physical accuracy success is claimed. Upstream native deprecation/toolchain warnings remain; compilation succeeds. Metro workers capped at two to reduce contention with the native build.

Next action: install Android build 3 and connect both phones, collect separate surveys and held-out recognition tests, label all outcomes after prediction and send records. Evaluate wrong matches, abstentions and map-point error by device/signal method. Only then consider sequence features or automatic fusion. Native compilation and browser checks do not establish physical performance.

## Next milestone research: independent movement evidence

FACT: user reports movement on Pixel and iPhone but compensates for different distance estimates with calibration. This is qualitative improvement; no new build-2 accuracy measurement is established. The engine still uses fixed-stride PDR with unknown uncertainty and no environmental corrections.

PROPOSED: optional camera-assisted room-to-room positioning using ARCore first, then ARKit, followed by verified map constraints and passive BLE/magnetic corrections. [Research, competitor comparison, adapter review and executable handoff](../../../research/HYBRID_POSITIONING_NEXT_STEP_2026_10.md). Pixel-first supersedes the earlier iPhone-first experiment because a local Android native host now exists. ARCore 1.56.0 and ViroReact 3.0.3 revisions/licenses inspected; Viro's public camera event lacks capture timestamps/session epochs, so a narrow native Expo adapter is preferred for the initial experiment. No new dependency or positioning code introduced.

Validation for this research update: Markdown formatting and repository documentation links checked. No native build, new physical test or accuracy result. Exact next action: implement optional timestamped ARCore acquisition, versioned visual-pose/reset contracts and replay, then expose camera-assisted navigation with existing checkpoints/upload. Preserve raw PDR comparison and SDK 57. Gate fusion on held-out physical results; camera-off/repeated-QR-free operation still requires passive venue corrections.

Android acquisition now uses a local buffered sensor module; see [ADR-0006](../../../decisions/0006-android-buffered-motion-acquisition.md) and [mobile status](../mobile/STATUS.md). Recording metadata optionally retains the installed acquisition revision for diagnosis, without changing old schemas/replay or the PDR algorithm. Synthetic raw-batch tests exercise units/frames, walking versus bobbing, full navigation movement and exact replay parity. Physical accuracy remains unvalidated.

Module-boundary fix: `engine.ts` now owns NavigationEngine/recording schema/replay; `index.ts` only exports public APIs. Diagnostics imports the engine directly, removing Metro's observed runtime require cycle. Algorithms and serialized contracts are unchanged; 59 tests/root checks pass.

Navigation now explicitly selects recorded `continuous-test` policy: 30 m drift limit becomes a persistent warning, while sensor failure stops remain. Missing policy preserves historical bounded replay. Unit coverage compares both policies beyond 30 m, replay equality and sensor failure behavior. Android acquisition startup now tolerates partial native frames; normalized displacement math is unchanged.

## Accuracy review after navigation testing

User reports short distance and turns occurring before the mapped doorway. No navigation-tagged runs are in the 23-file local inbox yet. Existing follow-up replay demonstrates brisk-step rejection as well as unresolved count/stride error; route guidance does not correct either. [Evidence, external research and proposed next slice](../../../research/ACCURACY_NEXT_STEP_2026_10.md). Recommend doorway checkpoint evaluation, bounded guard repair and an independent ARKit translation experiment before selecting fusion. Camera-free corrections remain a venue-specific BLE/magnetic or vendor-SDK evaluation. No implementation or physical validation added by this review.

## Versioned motion filtering

New live sessions select `step-yaw-motion-v2`; engine default and historical v1 recordings preserve baseline behavior. Shared core buffers peaks and original headings, accepts at most one per observation, holds ambiguous/missing-data displacement, and exposes assessment separately from unknown pose uncertainty. Anchors/stops reset or discard pending motion. No labels, map geometry or native counts enter the classifier. [Experiment and limits](../../../research/MOTION_GUARD_EXPERIMENT.md). 51 tests/root checks pass; held-out phone behavior is unvalidated.

## Current state / decisions

Pure NavigationEngine accepts validated observations and emits authoritative pose. QR identity is resolved against loaded venue/revision. Anchor establishes position; heading alignment is explicit. Experimental PDR poses are degraded with unknown uncertainty. Re-anchor resets detector/heading/history. Stop on timing gaps/reversals, stale heading, tilt, jumps, impacts, lifecycle interruption or 30 m tracking limit.

Live Expo DeviceMotion and JSON replay share observations/engine. Native seconds are rebased per capture; repeated native fields are deduplicated. UI owns lifecycle/permissions but no navigation math. [ADR-0004](../../../decisions/0004-anchored-pdr-evaluation-baseline.md).

## Validation / limitations

Unit tests cover QR revision/identity failures, replay equality, stationary/turning behavior, missing heading and failure recovery. Android/iOS exports pass; no phone execution claimed. No fusion, map constraints, radio fallback, floor inference or calibrated covariance.

## Next action

Checkpoint evaluation is implemented: optional versioned-recording annotations retain node ID, native-session time and exact observation count. Replay evaluates map discrepancy and motion counts without feeding annotations into the estimator; malformed references/boundaries yield unavailable results. Arrival and still-check taps allow delay comparison. Historical recordings remain compatible and motion thresholds are unchanged. Synthetic tests verify round-trip persistence, replay independence and invalid-reference/timestamp handling; these do not establish physical accuracy.

Obtain paired normal/brisk navigation recordings through the existing inbox, checking actual door geometry. Follow the current hybrid-positioning handoff above; preserve failed runs and hashes. SDK 57 remains pinned. Native VIO candidate review is recorded, but compatibility and timestamp/reset behavior still need an executable spike before adopting an adapter.
